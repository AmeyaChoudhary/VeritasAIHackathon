// Google Classroom, read with the teen's own Google sign-in (classroom.courses.readonly and
// classroom.coursework.me.readonly). Only the teen's own coursework and submissions. Field masks
// leave out titles and descriptions, so none are downloaded.
// Weekly, by due date: assignments due, turned in late, missing, and the share turned in after
// midnight. School = late + missing.

import { CONFIG, DAY, type Config } from "../engine/config";
import { isLateNight, localTime, wallTimeToMs, weeksBetween, type Getter, type TimeFns } from "./common";
import type { AggWeek } from "./agg";

const BASE = "https://classroom.googleapis.com/v1";

interface DueDate {
  year?: number;
  month?: number;
  day?: number;
}
interface DueTime {
  hours?: number;
  minutes?: number;
}
export interface CourseWork {
  id: string;
  dueDate?: DueDate;
  dueTime?: DueTime;
}
export interface Submission {
  courseWorkId: string;
  state?: string; // NEW, CREATED, TURNED_IN, RETURNED, RECLAIMED_BY_STUDENT
  late?: boolean;
  submissionHistory?: { stateHistory?: { state?: string; stateTimestamp?: string } }[];
}

/** Due time in ms. Classroom gives due date and time in UTC and leaves out fields that are zero,
 *  so a dueTime of {} is 00:00 UTC. With no dueTime at all, the work is due at the end of that
 *  day on the teen's own clock (23:59 local). */
export function dueAt(w: CourseWork, timeZone?: string): number | null {
  const d = w.dueDate;
  if (!d?.year || !d.month || !d.day) return null;
  const t = w.dueTime;
  if (!t) return wallTimeToMs(`${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`, "23:59", timeZone);
  return Date.UTC(d.year, d.month - 1, d.day, t.hours ?? 0, t.minutes ?? 0);
}

function turnedInAt(s: Submission): number | null {
  const times = (s.submissionHistory ?? [])
    .map((h) => h.stateHistory)
    .filter((h) => h?.state === "TURNED_IN" && h.stateTimestamp)
    .map((h) => Date.parse(h!.stateTimestamp!))
    .filter(Number.isFinite);
  return times.length ? Math.max(...times) : null;
}

export interface SchoolItem {
  due: number;
  late: boolean;
  missing: boolean;
  turnedIn: number | null;
}

/** Join coursework with the teen's submissions. Missing: past due and not turned in. Late: turned
 *  in (or returned) and marked late. When the submissions list was cut short, work with no
 *  submission seen is unknown, never missing. */
export function schoolItems(work: CourseWork[], subs: Submission[], now: number, opts: { subsComplete?: boolean; timeZone?: string } = {}): SchoolItem[] {
  const subsComplete = opts.subsComplete ?? true;
  const byWork = new Map(subs.map((s) => [s.courseWorkId, s]));
  const out: SchoolItem[] = [];
  for (const w of work) {
    const due = dueAt(w, opts.timeZone);
    if (due == null) continue;
    const s = byWork.get(w.id);
    if (!s && !subsComplete) continue;
    const done = s?.state === "TURNED_IN" || s?.state === "RETURNED";
    out.push({ due, late: done && !!s?.late, missing: due < now && !done, turnedIn: s ? turnedInAt(s) : null });
  }
  return out;
}

export function schoolWeeks(items: SchoolItem[], range: { from: number; to: number }, time: TimeFns = localTime, cfg: Config = CONFIG): AggWeek[] {
  return weeksBetween(range.from, range.to, time).map(({ weekOf, complete }) => {
    const xs = items.filter((i) => time.week(i.due) === weekOf);
    const late = xs.filter((i) => i.late).length;
    const missing = xs.filter((i) => i.missing).length;
    const turned = xs.filter((i) => i.turnedIn != null);
    return {
      weekOf,
      complete,
      contrib: { school: late + missing },
      show: {
        due: xs.length,
        late,
        missing,
        afterMidnight: turned.length ? turned.filter((i) => isLateNight(time.hour(i.turnedIn as number), cfg)).length : null,
      },
    };
  });
}

async function pages<T>(get: Getter, url: (token?: string) => string, pick: (j: Record<string, unknown>) => T[], max: number): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  let token: string | undefined;
  let n = 0;
  do {
    const j = (await get(url(token))) as Record<string, unknown>;
    items.push(...pick(j));
    token = j.nextPageToken as string | undefined;
    n++;
  } while (token && n < max);
  return { items, truncated: !!token };
}

export async function readClassroom(get: Getter, opts: { now: number; time?: TimeFns; cfg?: Config; timeZone?: string }) {
  const cfg = opts.cfg ?? CONFIG;
  const max = cfg.integrations.maxPages;
  const tok = (t?: string) => (t ? `&pageToken=${encodeURIComponent(t)}` : "");
  const courses = await pages(
    get,
    (t) => `${BASE}/courses?studentId=me&courseStates=ACTIVE&fields=${encodeURIComponent("courses(id),nextPageToken")}${tok(t)}`,
    (j) => (j.courses as { id: string }[]) ?? [],
    max,
  );
  let truncated = courses.truncated;
  const items: SchoolItem[] = [];
  for (const c of courses.items) {
    const work = await pages(
      get,
      (t) => `${BASE}/courses/${c.id}/courseWork?fields=${encodeURIComponent("courseWork(id,dueDate,dueTime),nextPageToken")}${tok(t)}`,
      (j) => (j.courseWork as CourseWork[]) ?? [],
      max,
    );
    const subs = await pages(
      get,
      (t) =>
        `${BASE}/courses/${c.id}/courseWork/-/studentSubmissions?userId=me&fields=${encodeURIComponent(
          "studentSubmissions(courseWorkId,state,late,submissionHistory/stateHistory),nextPageToken",
        )}${tok(t)}`,
      (j) => (j.studentSubmissions as Submission[]) ?? [],
      max,
    );
    truncated ||= work.truncated || subs.truncated;
    items.push(...schoolItems(work.items, subs.items, opts.now, { subsComplete: !subs.truncated, timeZone: opts.timeZone }));
  }
  const from = opts.now - cfg.integrations.windowDays * DAY;
  let weeks = schoolWeeks(items, { from, to: opts.now }, opts.time ?? localTime, cfg);
  // A list cut short leaves every week partial: they do not reach the rules.
  if (truncated) weeks = weeks.map((w) => ({ ...w, complete: false }));
  return { weeks, courses: courses.items.length, truncated };
}
