// How connected sources become signals. Pure functions.
//
// Each source gives a few numbers a week (a Contrib). A signal is built from the phone's own
// number (for sleep, activity, reaching out and tone) and the numbers of every connected source
// that gives it. The set of parts that made a value is its "mix", and a value is only ever
// compared with a range learned from the same mix. A source that is connected but did not cover
// a week (a real account with no complete data for it) is left out of that week's mix, and so
// is a source that covered the week but lacks the number a signal needs: that signal is built
// from the other parts and compared with the range of that smaller mix.

import { CONFIG, type Config } from "./config";
import {
  CORE_SIGNALS,
  SIGNALS,
  SOURCES,
  type Contrib,
  type ContribKey,
  type LiveWeek,
  type PartId,
  type SignalId,
  type SourceId,
  type TeenState,
  type WeekData,
} from "./types";

/** What each source can give. A connection may give less (SourceLink.provides). */
export const SOURCE_PROVIDES: Record<SourceId, ContribKey[]> = {
  gmail: ["messages", "lowMood", "replyHours"],
  microsoft: ["messages", "lowMood", "replyHours"],
  calendar: [],
  classroom: ["school"],
  drive: ["lateEvents", "events"],
  canvas: ["school"],
  schoology: ["school"],
  lastfm: ["music"],
  spotify: ["music"],
  fitbit: ["sleep", "steps"],
  screentime: ["screen", "night", "sleep", "steps", "messages", "lowMood", "typingSpeed", "corrections"],
  instagram: ["messages", "lowMood", "lateEvents", "events"],
  tiktok: ["messages", "lowMood", "lateEvents", "events"],
  snapchat: ["messages", "lowMood", "lateEvents", "events"],
  discord: ["messages", "lowMood", "lateEvents", "events"],
  youtube: ["lateEvents", "events"],
};

/** Sources that give exam weeks (context only). */
export const CONTEXT_SOURCES: SourceId[] = ["calendar", "microsoft"];

type How = "mean" | "sum" | "pooled";

/** How each signal is built. base: the phone's own number takes part. */
export const SIGNAL_SPEC: Record<SignalId, { key: ContribKey; how: How; base: boolean }> = {
  sleep: { key: "sleep", how: "mean", base: true },
  activity: { key: "steps", how: "mean", base: true },
  reaching_out: { key: "messages", how: "sum", base: true },
  tone: { key: "lowMood", how: "mean", base: true },
  replies: { key: "replyHours", how: "mean", base: false },
  music: { key: "music", how: "mean", base: false },
  night_phone: { key: "night", how: "mean", base: false },
  screen_time: { key: "screen", how: "mean", base: false },
  school: { key: "school", how: "sum", base: false },
  night_activity: { key: "lateEvents", how: "pooled", base: false },
  typing_speed: { key: "typingSpeed", how: "mean", base: false },
  typing_corrections: { key: "corrections", how: "mean", base: false },
};

/** The phone's own value for a core signal, as a contribution. */
const BASE_KEY: Partial<Record<SignalId, ContribKey>> = { sleep: "sleep", activity: "steps", reaching_out: "messages", tone: "lowMood" };

export function provides(s: TeenState, src: SourceId): ContribKey[] {
  const link = s.sources?.[src];
  if (!link) return [];
  return link.provides ?? SOURCE_PROVIDES[src];
}

function needs(spec: { key: ContribKey; how: How }): ContribKey[] {
  return spec.how === "pooled" ? ["lateEvents", "events"] : [spec.key];
}

/** Connected sources that give this signal. */
export function signalSources(s: TeenState, k: SignalId): SourceId[] {
  const spec = SIGNAL_SPEC[k];
  return SOURCES.filter((src) => needs(spec).every((key) => provides(s, src).includes(key)));
}

/** Signals Stability reads now: the phone's own, plus those of connected sources. */
export function activeSignals(s: TeenState): SignalId[] {
  return SIGNALS.filter((k) => CORE_SIGNALS.includes(k) || signalSources(s, k).length > 0);
}

/** The mix the connected sources make for a signal when every one of them covers the week. */
export function configuredMix(s: TeenState, k: SignalId): string {
  const parts: PartId[] = [...(SIGNAL_SPEC[k].base ? (["phone"] as PartId[]) : []), ...signalSources(s, k)];
  return parts.join("+");
}

/** Every source whose numbers a signal would use. */
export function signalsOfSource(src: SourceId): SignalId[] {
  return SIGNALS.filter((k) => needs(SIGNAL_SPEC[k]).every((key) => SOURCE_PROVIDES[src].includes(key)));
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Older scenario and test data put connected numbers in values and emailTone. Map them to
 *  parts, so both forms work. */
export function legacyParts(input: WeekData): Partial<Record<PartId, Contrib>> {
  const v = input.values;
  const parts: Partial<Record<PartId, Contrib>> = {
    phone: { sleep: v.sleep, steps: v.activity, messages: v.reaching_out, lowMood: v.tone },
  };
  if (num(v.music)) {
    parts.lastfm = { music: v.music };
    parts.spotify = { music: v.music };
  }
  if (num(v.replies) || num(input.emailTone)) parts.gmail = { replyHours: v.replies, lowMood: input.emailTone };
  if (num(v.night_phone) || num(v.screen_time)) parts.screentime = { night: v.night_phone, screen: v.screen_time };
  for (const [src, c] of Object.entries(input.parts ?? {})) parts[src as PartId] = { ...(parts[src as PartId] ?? {}), ...c };
  return parts;
}

/** The parts that reach the rules this week: the phone's own, connected sample sources from
 *  the scenario, and connected real sources from their own complete weeks. */
export function weekParts(s: TeenState, input: WeekData, live: LiveWeek | undefined): Partial<Record<PartId, Contrib>> {
  const all = legacyParts(input);
  const out: Partial<Record<PartId, Contrib>> = { phone: all.phone };
  for (const src of SOURCES) {
    const link = s.sources?.[src];
    if (!link) continue;
    if (link.mode === "sample") {
      // The scenario is the whole simulated record, so a sample source covers every week.
      out[src] = all[src] ?? {};
      continue;
    }
    const lw = live?.[src];
    if (lw && lw.complete) out[src] = lw.contrib;
  }
  return out;
}

/** Build each signal's value and mix from the week's parts. */
export function combine(
  s: TeenState,
  parts: Partial<Record<PartId, Contrib>>,
  cfg: Config = CONFIG,
): { values: WeekData["values"]; mix: Partial<Record<SignalId, string>> } {
  const values: WeekData["values"] = {};
  const mix: Partial<Record<SignalId, string>> = {};
  for (const k of SIGNALS) {
    const spec = SIGNAL_SPEC[k];
    const keys = needs(spec);
    const has = (p: PartId) => keys.every((key) => num(parts[p]?.[key]));
    const who: PartId[] = [];
    if (spec.base && has("phone")) who.push("phone");
    for (const src of signalSources(s, k)) if (parts[src] && has(src)) who.push(src);
    if (!who.length) continue;
    const get = (p: PartId, key: ContribKey) => parts[p]![key] as number;
    let v: number;
    if (spec.how === "sum") v = who.reduce((a, p) => a + get(p, spec.key), 0);
    else if (spec.how === "pooled") {
      const events = who.reduce((a, p) => a + get(p, "events"), 0);
      if (events <= 0) continue;
      v = who.reduce((a, p) => a + get(p, "lateEvents"), 0) / events;
    } else {
      const w = (p: PartId) => (k === "tone" ? (p === "phone" ? cfg.toneMerge.keyboardWeight : cfg.toneMerge.emailWeight) : 1);
      v = who.reduce((a, p) => a + w(p) * get(p, spec.key), 0) / who.reduce((a, p) => a + w(p), 0);
    }
    if (spec.base && who.length === 1 && who[0] === "phone" && BASE_KEY[k]) v = get("phone", BASE_KEY[k] as ContribKey);
    values[k] = v;
    mix[k] = who.join("+");
  }
  return { values, mix };
}
