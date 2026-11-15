// Shared helpers for connected accounts. Everything here runs on the teen's phone.

import { CONFIG, type Config } from "../engine/config";

/** Fetches JSON. Injected so tests can answer from fixtures with no network. */
export type Getter = (url: string) => Promise<unknown>;

/** How times map to the teen's local hour and week. Local by default; tests use UTC. */
export interface TimeFns {
  hour(ms: number): number;
  /** Monday of the week, YYYY-MM-DD. */
  week(ms: number): string;
  /** When that Monday starts, in ms. */
  weekStart(weekOf: string): number;
  /** The calendar date, YYYY-MM-DD. */
  day(ms: number): string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Monday of the week holding a calendar date, with no time zone involved. */
export function mondayOfYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const dow = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dow);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export const localTime: TimeFns = {
  hour: (ms) => new Date(ms).getHours(),
  week: (ms) => {
    const d = new Date(ms);
    return mondayOfYmd(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  },
  weekStart: (weekOf) => wallTimeToMs(weekOf, "00:00"),
  day: (ms) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },
};

export const utcTime: TimeFns = {
  hour: (ms) => new Date(ms).getUTCHours(),
  week: (ms) => mondayOfYmd(new Date(ms).toISOString().slice(0, 10)),
  weekStart: (weekOf) => Date.parse(`${weekOf}T00:00:00Z`),
  day: (ms) => new Date(ms).toISOString().slice(0, 10),
};

/** Offset of a named time zone from UTC at a moment, in ms. */
export function zoneOffsetMs(ms: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(dtf.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** A wall-clock time on a calendar date, as ms. Uses the phone's own zone unless one is
 *  given, so a change to or from daylight saving time is counted. */
export function wallTimeToMs(ymd: string, hhmm: string, timeZone?: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  if (!timeZone) return new Date(y, m - 1, d, h, mi).getTime();
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let ms = guess - zoneOffsetMs(guess, timeZone);
  const again = guess - zoneOffsetMs(ms, timeZone);
  if (again !== ms) ms = again;
  return ms;
}

/** Every week from the one holding start to the one holding end, with whether the whole week
 *  lies inside [start, end]. A week only partly read is not a complete observation. */
export function weeksBetween(start: number, end: number, time: TimeFns): { weekOf: string; complete: boolean }[] {
  const out: { weekOf: string; complete: boolean }[] = [];
  let k = time.week(start);
  for (let guard = 0; guard < 60; guard++) {
    const s = time.weekStart(k);
    if (s > end) break;
    const next = time.week(s + 7 * 86400000 + 3 * 3600000);
    out.push({ weekOf: k, complete: s >= start && time.weekStart(next) <= end });
    k = next;
  }
  return out;
}

export function isLateNight(hour: number, cfg: Config = CONFIG): boolean {
  return hour >= cfg.integrations.lateNightStartHour && hour < cfg.integrations.lateNightEndHour;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Run fn over items with at most n in flight. Keeps order. */
export async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** A Getter that sends a Google access token. */
export function bearerGetter(token: string, fetchImpl: typeof fetch = fetch): Getter {
  return async (url) => {
    const r = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new HttpError(r.status, r.status === 401 || r.status === 403 ? "Google did not allow this. Try connecting again." : `Google answered ${r.status}.`);
    return r.json();
  };
}

/** Sends JSON with a POST (Drive Activity's query is a POST). */
export type Poster = (url: string, body: unknown) => Promise<unknown>;

export function bearerPoster(token: string, fetchImpl: typeof fetch = fetch): Poster {
  return async (url, body) => {
    const r = await fetchImpl(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new HttpError(r.status, r.status === 401 || r.status === 403 ? "The account did not allow this. Try connecting again." : `The server answered ${r.status}.`);
    return r.json();
  };
}

/** A Getter that sends an access token with extra headers (Microsoft Graph wants a Prefer header). */
export function headerGetter(token: string, extra: Record<string, string> = {}, fetchImpl: typeof fetch = fetch): Getter {
  return async (url) => {
    const r = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, ...extra } });
    if (r.status === 410) throw new HttpError(410, "This service has turned its API off.");
    if (!r.ok) throw new HttpError(r.status, r.status === 401 || r.status === 403 ? "The account did not allow this. Try connecting again." : `The server answered ${r.status}.`);
    return r.json();
  };
}

/** A Getter with no credentials (Last.fm uses an API key in the URL). */
export function plainGetter(fetchImpl: typeof fetch = fetch): Getter {
  return async (url) => {
    const r = await fetchImpl(url);
    const j = await r.json().catch(() => null);
    if (!r.ok && !(j && typeof j === "object")) throw new HttpError(r.status, `The server answered ${r.status}.`);
    return j;
  };
}

/** Words for a week key, such as "Nov 2". */
export function weekWords(weekOf: string): string {
  const [, m, d] = weekOf.split("-").map(Number);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${d}`;
}
