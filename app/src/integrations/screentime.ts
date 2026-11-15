// The phone-data file the Stability app writes (native/). Android gives minutes; iPhone gives
// threshold buckets such as ">=30". Version 2 (Android) adds Health Connect sleep and steps,
// the Stability keyboard's daily numbers (no words), and self-harm flags as opaque ids.

import { CONFIG, type Config } from "../engine/config";
import { mondayOfYmd, wallTimeToMs } from "./common";

export interface ScreenDay {
  date: string;
  /** Minutes, or on iPhone a bucket string such as ">=180" or "<60". */
  screen_minutes: number | string | null;
  night_minutes: number | string | null;
  first_use: string | null;
  last_use: string | null;
  // Version 2
  sleep_minutes?: number | null;
  bedtime?: string | null;
  steps?: number | null;
  kb_messages?: number | null;
  kb_chars_per_min?: number | null;
  kb_pause_share?: number | null;
  kb_correction_rate?: number | null;
  kb_low_mood_share?: number | null;
}

export interface ScreenFlag {
  id: string;
  time: string;
  level: "concern" | "plan";
  /** The teen's answer to "Are you safe right now?" on the phone. "no" sends the urgent note at
   *  once, "yes" holds it, null means no answer yet (the 30 minutes run from the flag time). */
  answer?: "yes" | "no" | null;
}

export interface ScreenFile {
  source: "android_usage_stats" | "ios_device_activity";
  version: 1 | 2;
  generated: string;
  days: ScreenDay[];
  flags?: ScreenFlag[];
}

export interface ScreenWeek {
  weekOf: string;
  /** Distinct dates in the file for this week. */
  days: number;
  /** All seven days are in the file and the week had ended when the file was made. */
  complete?: boolean;
  /** Minutes on the phone a day, and how many days had that number. */
  screen_minutes: number | null;
  screen_days: number;
  /** Minutes between midnight and 5 a.m., a day, and how many days had that number. */
  night_minutes: number | null;
  night_days: number;
  /** Hours from the last use one evening to the first use the next morning, and how many
   *  nights could be measured. A rough sleep proxy, left out when the file can't support it. */
  phone_free_hours: number | null;
  free_nights: number;
  // Version 2: Health Connect and the Stability keyboard. Each with its own count of days.
  sleep_hours?: number | null;
  sleep_days?: number;
  /** Minutes after 6 p.m., so 23:30 is 330 and 00:30 is 390. */
  bedtime?: number | null;
  steps?: number | null;
  steps_days?: number;
  /** Messages sent through the keyboard in a week: the mean per keyboard day times 7, so a
   *  part week is never read as fewer messages. A day with 0 used the keyboard and sent
   *  nothing; a day with null did not use it. */
  kb_messages?: number | null;
  kb_days?: number;
  kb_chars_per_min?: number | null;
  kb_pause_share?: number | null;
  kb_correction_rate?: number | null;
  kb_low_mood_share?: number | null;
}

/** Minutes from a number, a numeric string, or an iPhone bucket: "A-B" is the middle,
 *  ">=N" and ">N" are N, "<N" and "<=N" are N times bucketLowFactor. */
export function parseBucket(v: number | string | null | undefined, cfg: Config = CONFIG): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = v.trim();
  let m: RegExpExecArray | null;
  if ((m = /^(\d+(?:\.\d+)?)$/.exec(s))) return Number(m[1]);
  if ((m = /^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/.exec(s))) return (Number(m[1]) + Number(m[2])) / 2;
  if ((m = /^>=?\s*(\d+(?:\.\d+)?)$/.exec(s))) return Number(m[1]);
  if ((m = /^<=?\s*(\d+(?:\.\d+)?)$/.exec(s))) return Number(m[1]) * cfg.integrations.bucketLowFactor;
  return null;
}

const minutesOf = (hhmm: string | null) => {
  const m = hhmm ? /^(\d{1,2}):(\d{2})$/.exec(hhmm) : null;
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[1]) < 24 && Number(m[2]) < 60 ? v : null;
};

/** A real calendar date in YYYY-MM-DD form. */
function isDate(ymd: unknown): ymd is string {
  if (typeof ymd !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function nextDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function bounded(v: number | null, max: number): number | null {
  return v != null && Number.isFinite(v) && v >= 0 && v <= max ? v : null;
}

/** The phone-free window after one day, following the exporters: last_use belongs to its own
 *  date ("23:59" when use ran past midnight) and first_use can be night use. The window is
 *  measured only when use ended before midnight and the next morning's first use is after
 *  5 a.m.; otherwise the file can't say when sleep started or ended. Dated wall-clock times
 *  count a daylight saving change. */
export function phoneFreeHours(day: ScreenDay, next: ScreenDay | undefined, cfg: Config = CONFIG, timeZone?: string): number | null {
  if (!next || next.date !== nextDay(day.date)) return null;
  const last = minutesOf(day.last_use);
  const first = minutesOf(next.first_use);
  if (last == null || first == null) return null;
  if (day.last_use === "23:59") return null;
  if (first < cfg.integrations.lateNightEndHour * 60) return null;
  const gap = wallTimeToMs(next.date, next.first_use as string, timeZone) - wallTimeToMs(day.date, day.last_use as string, timeZone);
  const hours = gap / 3600000;
  return hours > 0 && hours < cfg.integrations.phoneFreeMaxHours ? hours : null;
}

function finite(v: unknown, lo: number, hi: number): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null;
}

function bedtimeMinutes(hhmm: string | null | undefined): number | null {
  const m = hhmm ? minutesOf(hhmm) : null;
  return m == null ? null : (m - 18 * 60 + 24 * 60) % (24 * 60);
}

export function parseScreenTime(
  text: string,
  cfg: Config = CONFIG,
  timeZone?: string,
): {
  source: ScreenFile["source"];
  version: 1 | 2;
  weeks: ScreenWeek[];
  days: number;
  flags: { id: string; at: number; level: "concern" | "plan"; answer: "yes" | "no" | null }[];
} {
  let f: ScreenFile;
  try {
    f = JSON.parse(text) as ScreenFile;
  } catch {
    throw new Error("This file is not JSON. Export it again from the Stability app.");
  }
  if (!f || (f.source !== "android_usage_stats" && f.source !== "ios_device_activity")) throw new Error("This is not a Stability phone-data file.");
  if (f.version !== 1 && f.version !== 2) throw new Error("This file is from a newer version of the Stability app.");
  if (!Array.isArray(f.days)) throw new Error("This file has no days in it.");
  const days = f.days.filter((d) => d && isDate(d.date)).sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 1; i < days.length; i++) {
    if (days[i].date === days[i - 1].date) throw new Error(`This file lists ${days[i].date} twice. Export it again from the Stability app.`);
  }
  const byDate = new Map(days.map((d) => [d.date, d]));
  const ic = cfg.integrations;
  type Acc = Record<"screen" | "night" | "free" | "sleep" | "bed" | "steps" | "kbMsg" | "kbSpeed" | "kbPause" | "kbCorr" | "kbLow", number[]> & { n: number };
  const empty = (): Acc => ({ screen: [], night: [], free: [], sleep: [], bed: [], steps: [], kbMsg: [], kbSpeed: [], kbPause: [], kbCorr: [], kbLow: [], n: 0 });
  const by = new Map<string, Acc>();
  const push = (xs: number[], v: number | null) => v != null && xs.push(v);
  for (const d of days) {
    const k = mondayOfYmd(d.date);
    const w = by.get(k) ?? empty();
    w.n++;
    push(w.screen, bounded(parseBucket(d.screen_minutes, cfg), ic.screenMinutesMax));
    push(w.night, bounded(parseBucket(d.night_minutes, cfg), ic.nightMinutesMax));
    push(w.free, phoneFreeHours(d, byDate.get(nextDay(d.date)), cfg, timeZone));
    if (f.version === 2) {
      const sl = finite(d.sleep_minutes, 1, 20 * 60);
      push(w.sleep, sl == null ? null : sl / 60);
      push(w.bed, bedtimeMinutes(d.bedtime));
      push(w.steps, finite(d.steps, 0, 100000));
      const msgs = finite(d.kb_messages, 0, 10000);
      push(w.kbMsg, msgs);
      if (msgs != null) {
        push(w.kbSpeed, finite(d.kb_chars_per_min, 1, 2000));
        push(w.kbPause, finite(d.kb_pause_share, 0, 1));
        push(w.kbCorr, finite(d.kb_correction_rate, 0, 1));
        push(w.kbLow, finite(d.kb_low_mood_share, 0, 1));
      }
    }
    by.set(k, w);
  }
  const generated = Date.parse(f.generated);
  const madeOn = Number.isFinite(generated) ? new Date(generated).toISOString().slice(0, 10) : null;
  const weeks = [...by.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekOf, w]) => {
      // Complete: all seven dates are in the file and the file was made after the week ended.
      const sunday = (() => {
        const [y, m, d] = weekOf.split("-").map(Number);
        return new Date(Date.UTC(y, m - 1, d + 6)).toISOString().slice(0, 10);
      })();
      const base: ScreenWeek = {
        weekOf,
        days: w.n,
        complete: w.n === 7 && (madeOn == null || madeOn > sunday),
        screen_minutes: mean(w.screen),
        screen_days: w.screen.length,
        night_minutes: mean(w.night),
        night_days: w.night.length,
        phone_free_hours: mean(w.free),
        free_nights: w.free.length,
      };
      if (f.version !== 2) return base;
      return {
        ...base,
        sleep_hours: mean(w.sleep),
        sleep_days: w.sleep.length,
        bedtime: mean(w.bed),
        steps: mean(w.steps),
        steps_days: w.steps.length,
        kb_messages: w.kbMsg.length ? (w.kbMsg.reduce((a, b) => a + b, 0) / w.kbMsg.length) * 7 : null,
        kb_days: w.kbMsg.length,
        kb_chars_per_min: mean(w.kbSpeed),
        kb_pause_share: mean(w.kbPause),
        kb_correction_rate: mean(w.kbCorr),
        kb_low_mood_share: mean(w.kbLow),
      };
    });
  const flags =
    f.version === 2
      ? (Array.isArray(f.flags) ? f.flags : [])
          .filter((x) => x && typeof x.id === "string" && x.id.length >= 8 && (x.level === "concern" || x.level === "plan"))
          .map((x) => ({ id: x.id, at: Date.parse(x.time), level: x.level, answer: x.answer === "yes" || x.answer === "no" ? x.answer : null }))
          .filter((x) => Number.isFinite(x.at))
      : [];
  return { source: f.source, version: f.version, weeks, days: days.length, flags };
}
