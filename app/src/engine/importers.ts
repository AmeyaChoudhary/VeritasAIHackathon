// Read the student's own files in the browser. Nothing is uploaded.
// Spotify: StreamingHistory*.json (endTime, msPlayed) or the extended history (ts, ms_played).
// Sleep and steps: a CSV with the header date,sleep_hours,steps.

export interface ImportedWeek {
  /** Monday of the week, YYYY-MM-DD (local time). */
  weekOf: string;
  days: number;
}

export interface MusicWeek extends ImportedWeek {
  hours: number;
  /** Share of listening between midnight and 5 am. */
  afterMidnight: number;
}

export interface BodyWeek extends ImportedWeek {
  sleep: number | null;
  steps: number | null;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Monday of the week that holds this local date. */
export function mondayOf(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - dow);
  return ymd(x);
}

function parseTime(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  // endTime looks like "2024-01-05 23:41" and is in UTC. ts is ISO with a Z.
  const s = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v) ? `${v.replace(" ", "T")}:00Z` : v;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseSpotify(text: string): { weeks: MusicWeek[]; plays: number } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file is not JSON. Spotify sends StreamingHistory files as .json.");
  }
  if (!Array.isArray(data)) throw new Error("Expected a list of plays, as in StreamingHistory_music_0.json.");
  const byWeek = new Map<string, { ms: number; late: number; days: Set<string> }>();
  let plays = 0;
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const d = parseTime(o.ts ?? o.endTime);
    const msRaw = o.ms_played ?? o.msPlayed;
    const ms = typeof msRaw === "number" ? msRaw : Number(msRaw);
    if (!d || !Number.isFinite(ms) || ms <= 0) continue;
    plays++;
    const key = mondayOf(d);
    const w = byWeek.get(key) ?? { ms: 0, late: 0, days: new Set<string>() };
    w.ms += ms;
    if (d.getHours() < 5) w.late += ms;
    w.days.add(ymd(d));
    byWeek.set(key, w);
  }
  if (!plays) throw new Error("No plays found. Each entry needs ts or endTime, and ms_played or msPlayed.");
  const weeks = [...byWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekOf, w]) => ({ weekOf, days: w.days.size, hours: w.ms / 3.6e6, afterMidnight: w.ms ? w.late / w.ms : 0 }));
  return { weeks, plays };
}

export const CSV_TEMPLATE = `date,sleep_hours,steps
2026-10-05,7.5,8200
2026-10-06,7.2,9100
2026-10-07,6.9,7600
`;

export function parseBodyCsv(text: string): { weeks: BodyWeek[]; rows: number } {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) throw new Error("The file is empty.");
  const head = lines[0].toLowerCase().split(",").map((h) => h.trim());
  const iDate = head.indexOf("date");
  const iSleep = head.indexOf("sleep_hours");
  const iSteps = head.indexOf("steps");
  if (iDate < 0 || (iSleep < 0 && iSteps < 0)) throw new Error("The first line should be: date,sleep_hours,steps");
  const byWeek = new Map<string, { sleep: number[]; steps: number[]; days: Set<string> }>();
  let rows = 0;
  for (const line of lines.slice(1)) {
    const cells = line.split(",").map((c) => c.trim());
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cells[iDate] ?? "");
    if (!m) continue;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const sleep = iSleep >= 0 ? Number(cells[iSleep]) : NaN;
    const steps = iSteps >= 0 ? Number(cells[iSteps]) : NaN;
    const okSleep = Number.isFinite(sleep) && sleep > 0 && sleep < 24;
    const okSteps = Number.isFinite(steps) && steps >= 0;
    if (!okSleep && !okSteps) continue;
    rows++;
    const key = mondayOf(d);
    const w = byWeek.get(key) ?? { sleep: [], steps: [], days: new Set<string>() };
    if (okSleep) w.sleep.push(sleep);
    if (okSteps) w.steps.push(steps);
    w.days.add(ymd(d));
    byWeek.set(key, w);
  }
  if (!rows) throw new Error("No usable rows. Dates should look like 2026-10-05.");
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const weeks = [...byWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekOf, w]) => ({ weekOf, days: w.days.size, sleep: mean(w.sleep), steps: mean(w.steps) }));
  return { weeks, rows };
}
