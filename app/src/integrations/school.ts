// Canvas and Schoology. Neither allows calls from a web page: Canvas's API sends no CORS
// headers for other sites and its staff say tokens are not meant for browser code; Schoology's
// API answers a CORS check with no Access-Control-Allow-Origin header (tested Nov 14, 2026).
// So these readers are written to run in the Android app or a future server, with the token or
// key the teen makes in their own account. The web app marks them "needs the phone app or a
// server" and only offers sample data. The parsing is tested here.
//
// Both give, per week by due date: late and missing counts. School = late + missing.

import { CONFIG, DAY, type Config } from "../engine/config";
import { HttpError, localTime, weeksBetween, type Getter, type TimeFns } from "./common";

/** A getter that also returns the next page from a Link header (Canvas pages that way). */
export type PagedGetter = (url: string) => Promise<{ body: unknown; next: string | null }>;

/** The rel="next" address in an HTTP Link header, if there is one. */
export function linkNext(header: string | null | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const m = /<([^>]+)>\s*;\s*rel="?next"?/i.exec(part.trim());
    if (m) return m[1];
  }
  return null;
}

/** For the phone app or a server: sends the teen's Canvas token and reads Link headers. */
export function canvasGetter(token: string, fetchImpl: typeof fetch = fetch): PagedGetter {
  return async (url) => {
    const r = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new HttpError(r.status, `Canvas answered ${r.status}.`);
    return { body: await r.json(), next: linkNext(r.headers.get("Link")) };
  };
}
import type { AggWeek } from "./agg";

export interface DueItem {
  due: number;
  late: boolean;
  missing: boolean;
}

export function dueWeeks(items: DueItem[], range: { from: number; to: number }, time: TimeFns = localTime): AggWeek[] {
  return weeksBetween(range.from, range.to, time).map(({ weekOf, complete }) => {
    const xs = items.filter((i) => time.week(i.due) === weekOf);
    const late = xs.filter((i) => i.late).length;
    const missing = xs.filter((i) => i.missing).length;
    return { weekOf, complete, contrib: { school: late + missing }, show: { due: xs.length, late, missing } };
  });
}

// ---------------------------------------------------------------- Canvas

export interface CanvasSubmission {
  assignment_id?: number;
  cached_due_date?: string | null;
  late?: boolean;
  missing?: boolean;
  workflow_state?: string;
}

export function canvasItems(subs: CanvasSubmission[], now: number): DueItem[] {
  const out: DueItem[] = [];
  for (const s of subs) {
    const due = Date.parse(s.cached_due_date ?? "");
    if (!Number.isFinite(due) || due > now) continue;
    out.push({ due, late: !!s.late, missing: !!s.missing });
  }
  return out;
}

async function allPages<T>(get: PagedGetter, first: string, max: number): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  let url: string | null = first;
  let n = 0;
  while (url && n < max) {
    const r: { body: unknown; next: string | null } = await get(url);
    items.push(...((Array.isArray(r.body) ? r.body : []) as T[]));
    url = r.next;
    n++;
  }
  return { items, truncated: !!url };
}

/** base is the school's Canvas address, such as https://school.instructure.com. get sends the
 *  teen's own access token and follows Link headers. Assignment names are never requested. */
export async function readCanvas(get: PagedGetter, opts: { base: string; now: number; time?: TimeFns; cfg?: Config }) {
  const cfg = opts.cfg ?? CONFIG;
  const max = cfg.integrations.maxPages;
  const base = opts.base.replace(/\/+$/, "");
  const courses = await allPages<{ id: number }>(get, `${base}/api/v1/users/self/courses?enrollment_state=active&per_page=100`, max);
  let truncated = courses.truncated;
  const subs: CanvasSubmission[] = [];
  for (const c of courses.items) {
    const r = await allPages<CanvasSubmission>(get, `${base}/api/v1/courses/${c.id}/students/submissions?student_ids[]=self&per_page=100`, max);
    subs.push(...r.items);
    truncated ||= r.truncated;
  }
  const from = opts.now - cfg.integrations.windowDays * DAY;
  let weeks = dueWeeks(canvasItems(subs, opts.now), { from, to: opts.now }, opts.time ?? localTime);
  if (truncated) weeks = weeks.map((w) => ({ ...w, complete: false }));
  return { weeks, courses: courses.items.length, truncated };
}

// ---------------------------------------------------------------- Schoology

/** Two-legged OAuth 1.0a with PLAINTEXT signing, as Schoology's docs describe for a user's own
 *  API key: the token is empty and the signature is the secret followed by "&". */
export function schoologyAuthHeader(key: string, secret: string, nonce: string, timestamp: number): string {
  const enc = encodeURIComponent;
  return [
    'OAuth realm="Schoology API"',
    `oauth_consumer_key="${enc(key)}"`,
    'oauth_token=""',
    `oauth_nonce="${enc(nonce)}"`,
    `oauth_timestamp="${timestamp}"`,
    'oauth_signature_method="PLAINTEXT"',
    'oauth_version="1.0"',
    `oauth_signature="${enc(secret)}%26"`,
  ].join(", ");
}

export interface SchoologyGrade {
  assignment_id?: number;
  exception?: number; // 1 excused, 2 incomplete, 3 missing
  late?: number | boolean;
}
export interface SchoologyAssignment {
  id?: number;
  due?: string; // "2026-11-10 23:59:00", school's time zone
}

/** Missing: a grade marked missing (exception 3). Late: a grade flagged late. Due dates come
 *  from the section's assignments; their titles are in the response and are not kept. */
export function schoologyItems(grades: SchoologyGrade[], assignments: SchoologyAssignment[], now: number): DueItem[] {
  const due = new Map<number, number>();
  for (const a of assignments) {
    const t = a.due ? Date.parse(a.due.replace(" ", "T")) : NaN;
    if (a.id != null && Number.isFinite(t)) due.set(a.id, t);
  }
  const out: DueItem[] = [];
  for (const g of grades) {
    const t = g.assignment_id != null ? due.get(g.assignment_id) : undefined;
    if (t == null || t > now) continue;
    out.push({ due: t, late: g.late === true || g.late === 1, missing: g.exception === 3 });
  }
  return out;
}

export async function readSchoology(get: Getter, opts: { now: number; time?: TimeFns; cfg?: Config }) {
  const cfg = opts.cfg ?? CONFIG;
  const API = "https://api.schoology.com/v1";
  const me = (await get(`${API}/users/me`)) as { uid?: number | string };
  const grades = (await get(`${API}/users/${me.uid}/grades`)) as {
    section?: { section_id?: string | number; period?: { assignment?: SchoologyGrade[] }[] }[];
  };
  const all: DueItem[] = [];
  let truncated = false;
  for (const sec of grades.section ?? []) {
    const gs = (sec.period ?? []).flatMap((p) => p.assignment ?? []);
    // Assignments come in pages; links.next points at the next one.
    const as: SchoologyAssignment[] = [];
    let url: string | undefined = `${API}/sections/${sec.section_id}/assignments?start=0&limit=200`;
    let n = 0;
    while (url && n < cfg.integrations.maxPages) {
      const page = (await get(url)) as { assignment?: SchoologyAssignment[]; links?: { next?: string } };
      as.push(...(page.assignment ?? []));
      url = page.links?.next;
      n++;
    }
    truncated ||= !!url;
    all.push(...schoologyItems(gs, as, opts.now));
  }
  const from = opts.now - cfg.integrations.windowDays * DAY;
  let weeks = dueWeeks(all, { from, to: opts.now }, opts.time ?? localTime);
  if (truncated) weeks = weeks.map((w) => ({ ...w, complete: false }));
  return { weeks, sections: grades.section?.length ?? 0, truncated };
}
