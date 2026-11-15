// Weekly numbers shared by the newer readers. A reader turns what it reads into a list of
// own events (a time, and for messages the words, scored and dropped at once), then into
// weeks. Only numbers leave this file.

import { CONFIG, HOUR, type Config } from "../engine/config";
import { checkSelfHarm } from "../engine/selfharm";
import { isLowMood, type ToneModel } from "../engine/tone";
import type { Contrib, ContribKey } from "../engine/types";
import { textHash } from "../engine/hash";
import { isLateNight, localTime, weeksBetween, type TimeFns } from "./common";

export interface AggWeek {
  weekOf: string;
  complete: boolean;
  /** What reaches the rules from this week. */
  contrib: Contrib;
  /** Numbers shown to the teen on the Connect screen, in words. */
  show: Record<string, number | null>;
  /** Context only (Microsoft calendar). */
  exam?: boolean;
}

export interface ItemFlag {
  at: number;
  level: "concern" | "plan";
  /** Opaque: platform, owner, time and a hash of the own words. Never a position in a file. */
  key: string;
  /** Hash of the normalised own words, to count one message once across sources. */
  textHash?: string;
  /** The teen's answer on the phone, when the source carries one (Android file). */
  answer?: "yes" | "no" | null;
}

/** A stable key for a flagged item: the same message gives the same key in every export. */
export async function flagKey(platform: string, owner: string, at: number, hash: string): Promise<string> {
  const bytes = new TextEncoder().encode(`steady-flag-v2\u0000${platform}\u0000${owner.toLowerCase()}\u0000${Math.round(at / 1000)}\u0000${hash}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Cut lines quoted from someone else (">" at the start, as Discord and chat apps quote). Chat
 *  messages have no email headers, so nothing else is cut: a line that starts "From:" is the
 *  teen's own words. */
export function chatOwnWords(text: string): string {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith(">"))
    .join("\n")
    .trim();
}

/** One own action: a message the teen sent, a video watched, a file edited. */
export interface OwnEvent {
  at: number;
  /** For sent messages: scored on the phone, then dropped by the caller. */
  lowMood?: boolean | null;
  message?: boolean;
  /** For a video title, page title or search: whether it was scored, and what it read as.
   *  Only these yes/no marks are kept; the text is dropped by the caller. */
  content?: boolean;
  search?: boolean;
  harm?: boolean;
  lowContent?: boolean | null;
  /** A post or video the teen was shown or watched: a time only, nothing about what it was. */
  view?: boolean;
  /** A visit to a major news site (Chrome). Only this yes/no mark is kept, never the address. */
  news?: boolean;
}

/** Score one own message's words, check for self-harm words if it is recent, and return
 *  numbers only. The caller drops the text right after. */
export function scoreOwnWords(
  text: string,
  at: number,
  opts: { now: number; tone: ToneModel | null; cfg?: Config },
): { lowMood: boolean | null; level: "none" | "concern" | "plan"; hash: string } {
  const cfg = opts.cfg ?? CONFIG;
  const t = text.trim();
  if (!t) return { lowMood: null, level: "none", hash: "" };
  const lowMood = opts.tone ? isLowMood(opts.tone, t) : null;
  const recent = opts.now - at >= 0 && opts.now - at <= cfg.integrations.selfHarmEmailHours * HOUR;
  // Emails and messages use the phrase list only: the model's "check" asks the teen about what they are typing now.
  const lv = recent ? checkSelfHarm(t).level : "none";
  return { lowMood, level: lv === "check" ? "none" : lv, hash: textHash(t) };
}

/** Score one title or search someone else wrote or the teen typed into a search box: the tone
 *  model and the self-harm check (phrase list and model). Returns yes/no marks only.
 *  A search from the last 24 hours that the phrase list flags becomes an item flag, the same as
 *  an email; a model-only flag, and anything watched or visited, only counts toward the week. */
export function scoreContent(
  text: string,
  at: number,
  opts: { now: number; tone: ToneModel | null; cfg?: Config; search: boolean },
): { harm: boolean; lowContent: boolean | null; level: "none" | "concern" | "plan"; hash: string } {
  const cfg = opts.cfg ?? CONFIG;
  const t = text.trim();
  if (!t) return { harm: false, lowContent: null, level: "none", hash: "" };
  const lowContent = opts.tone ? isLowMood(opts.tone, t) : null;
  const lv = checkSelfHarm(t).level;
  const recent = opts.now - at >= 0 && opts.now - at <= cfg.integrations.selfHarmEmailHours * HOUR;
  const level = opts.search && recent && (lv === "concern" || lv === "plan") ? lv : "none";
  return { harm: lv !== "none", lowContent, level, hash: textHash(t) };
}

/** Weeks from events: messages sent, the share of activity after midnight, and the low-mood
 *  share of own messages. */
export function eventWeeks(
  events: OwnEvent[],
  range: { from: number; to: number },
  time: TimeFns = localTime,
  cfg: Config = CONFIG,
  keys: { messages: boolean; activity: boolean; content?: boolean; views?: boolean; news?: boolean } = { messages: true, activity: true },
): AggWeek[] {
  return weeksBetween(range.from, range.to, time).map(({ weekOf, complete }, i) => {
    // The first week of a range is partial: the source may start part way through it.
    if (i === 0) complete = false;
    const xs = events.filter((e) => time.week(e.at) === weekOf);
    const msgs = xs.filter((e) => e.message);
    const scored = msgs.filter((e) => e.lowMood != null);
    const late = xs.filter((e) => isLateNight(time.hour(e.at), cfg)).length;
    const contrib: Contrib = {};
    if (keys.messages) {
      contrib.messages = msgs.length;
      if (scored.length) contrib.lowMood = scored.filter((e) => e.lowMood).length / scored.length;
    }
    if (keys.activity) {
      contrib.lateEvents = late;
      contrib.events = xs.length;
    }
    return {
      weekOf,
      complete,
      contrib,
      show: {
        messages: keys.messages ? msgs.length : null,
        events: xs.length,
        late,
        // Shown to the teen only. These never reach the rules or a parent's note.
        ...(keys.content
          ? { harmContent: xs.filter((e) => e.harm).length, lowMoodContent: xs.filter((e) => e.lowContent).length, searches: xs.filter((e) => e.search).length }
          : {}),
        ...(keys.views ? { viewed: xs.filter((e) => e.view).length } : {}),
        ...(keys.news
          ? {
              news: xs.filter((e) => e.news).length,
              newsLate: xs.filter((e) => e.news && isLateNight(time.hour(e.at), cfg)).length,
            }
          : {}),
      },
    };
  });
}

/** Keys that appear in any complete week: what this connection gives. */
export function providesFrom(weeks: AggWeek[]): ContribKey[] {
  const keys = new Set<ContribKey>();
  for (const w of weeks) if (w.complete) for (const [k, v] of Object.entries(w.contrib)) if (typeof v === "number") keys.add(k as ContribKey);
  return [...keys];
}

/** The window a data file covers: its last weeks, ending at its latest own event and starting no
 *  earlier than its first own event, so weeks before the export's coverage are not counted as
 *  weeks with nothing in them. The first and last weeks are partial. */
export function exportRange(events: OwnEvent[], now: number, cfg: Config = CONFIG): { from: number; to: number } | null {
  const times = events.map((e) => e.at).filter((t) => Number.isFinite(t) && t <= now);
  if (!times.length) return null;
  const to = Math.max(...times);
  const first = Math.min(...times);
  return { from: Math.max(to - cfg.integrations.exportWeeks * 7 * 86400000, first), to };
}
