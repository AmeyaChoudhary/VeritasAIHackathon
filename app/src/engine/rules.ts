// The Stability rules, as a pure state machine. Source: docs/parent-alerts.md and docs/concept.md.
// Every number comes from CONFIG. step() never mutates its input and returns the events
// that would leave the teen's phone. Nothing here sees typed text: the keyboard passes only
// the self-harm level, and the tone share arrives as a weekly number.

import { ASK_THRESHOLD, askInputs, askScore, checkedInLately } from "./askmodel";
import { CONFIG, DAY, HOUR, WEEK, type Config } from "./config";
import { activeSignals, combine, configuredMix, CONTEXT_SOURCES, signalsOfSource, weekParts } from "./sources";
import {
  SIGNALS,
  type SourceId,
  type AskKind,
  type AskResult,
  type HeldReason,
  type LiveWeek,
  type ContribKey,
  type People,
  type Range,
  type SignalId,
  type SteadyEvent,
  type TeenState,
  type WeekData,
  type WeekRecord,
} from "./types";

export type FlagLevel = "none" | "check" | "concern" | "plan";

export type Input =
  | { kind: "pair"; people?: Partial<People> }
  | { kind: "rename"; people: Partial<People> }
  | { kind: "acknowledge"; trusted?: string }
  | { kind: "answer"; value: number }
  | { kind: "skipAsk" }
  /** The weekly two-tap check-in. stress and withOthers are 1 to 5. */
  | { kind: "checkin"; stress: number; withOthers: number }
  | { kind: "dayEnd"; day: number; hasData: boolean; keyboardUsed: boolean }
  | { kind: "weekEnd"; data: WeekData; live?: LiveWeek }
  /** A flag from an email, a message in a data file, or the Android phone file. source names
   *  where it came from; answer is the teen's answer to "Are you safe right now?" given on the
   *  phone, when the source carries one (the Android file does). */
  | {
      kind: "emailFlag";
      level: "concern" | "plan";
      sentAt: number;
      key: string;
      textHash?: string;
      source?: string;
      answer?: "yes" | "no" | null;
    }
  | { kind: "typed"; level: FlagLevel; via?: "keyboard" | "email"; textHash?: string }
  | { kind: "connect"; source: SourceId; mode: "real" | "sample"; provides?: ContribKey[] }
  | { kind: "disconnect"; source: SourceId }
  | { kind: "safe"; answer: "yes" | "no" }
  | { kind: "tick" }
  | { kind: "setOff"; off: boolean }
  | { kind: "dismiss"; what: "doctor" | "safety" }
  | { kind: "setTrusted"; name?: string };

export interface StepResult {
  state: TeenState;
  events: SteadyEvent[];
}

interface Ctx {
  s: TeenState;
  events: SteadyEvent[];
  now: number;
  cfg: Config;
}

export const SIGNAL_LABEL: Record<SignalId, string> = {
  sleep: "sleep",
  reaching_out: "reaching out",
  activity: "activity",
  tone: "tone",
  music: "late listening",
  replies: "reply time",
  night_phone: "late-night phone use",
  screen_time: "screen time",
  school: "schoolwork",
  night_activity: "late-night activity",
  typing_speed: "typing speed",
  typing_corrections: "typing corrections",
};

export const DEFAULT_PEOPLE: People = {
  teen: "Maya",
  teenPronoun: "she",
  parent: "Mom",
  parentPronoun: "she",
};

const emptySignals = <T>(make: () => T): Record<SignalId, T> =>
  Object.fromEntries(SIGNALS.map((k) => [k, make()])) as Record<SignalId, T>;

const noHeld = (): Record<HeldReason, boolean> => ({
  highScore: false,
  skipRule: false,
  setupSkips: false,
  flags: false,
});

/** ISO time without milliseconds, as in the schema example: 2026-11-14T21:30:00Z */
export function iso(t: number): string {
  return new Date(Math.round(t / 1000) * 1000).toISOString().replace(".000Z", "Z");
}

export function createTeen(opts: { startAt: number; code: string; people?: Partial<People> }): TeenState {
  return {
    v: 1,
    code: opts.code,
    paired: false,
    people: { ...DEFAULT_PEOPLE, ...opts.people },
    acknowledged: false,
    setupDone: false,
    off: false,
    sources: {},
    startAt: opts.startAt,
    week: 0,
    weeks: [],
    shortInRow: 0,
    mixLearn: {},
    mixRange: {},
    learn: emptySignals<number[]>(() => []),
    range: {},
    runs: emptySignals(() => 0),
    skipRuns: emptySignals(() => 0),
    skipSince: emptySignals<number | null>(() => null),
    episode: null,
    checkins: {},
    phq2s: [],
    ask: null,
    asks: [],
    lastAskWeek: 0,
    pauseUntilWeek: 0,
    setupHigh: { active: false, nextWeek: 0, clearInRow: 0, skipsInRow: 0 },
    lastHeadsUpAt: null,
    held: noHeld(),
    doctor: { show: false, pending: false },
    safety: { screen: "none", deadline: null, flags: [] },
    dataDays: {},
    keyboardDays: {},
    lastDayDone: -1,
    trace: [],
  };
}

// ---------------------------------------------------------------- time helpers

export function weekEndAt(s: TeenState, week: number, cfg: Config = CONFIG): number {
  return s.startAt + week * WEEK + cfg.weekEndHourOffset * HOUR;
}

export function dayEndAt(s: TeenState, day: number, cfg: Config = CONFIG): number {
  return s.startAt + day * DAY + cfg.statusHourUtc * HOUR;
}

export function dayAt(s: TeenState, t: number): number {
  return Math.floor((t - s.startAt) / DAY);
}

/** When the answer to "Are you safe right now?" is due, if one is open. */
export function nextDeadline(s: TeenState): number | null {
  return s.safety.deadline;
}

/** When the three-week limit ends, if evidence is being held. */
export function nextCooldownEnd(s: TeenState, cfg: Config = CONFIG): number | null {
  return anyHeld(s) && s.lastHeadsUpAt != null ? s.lastHeadsUpAt + cfg.cooldownMs : null;
}

/** The next time the engine needs a tick on its own. */
export function nextTimer(s: TeenState, cfg: Config = CONFIG): number | null {
  const c = [nextDeadline(s), nextCooldownEnd(s, cfg)].filter((x): x is number => x != null);
  return c.length ? Math.min(...c) : null;
}

// ---------------------------------------------------------------- connected accounts

export { activeSignals };

/** Keep s.learn and s.range in step with the mix the connected sources make now. */
export function refreshViews(s: TeenState) {
  for (const k of SIGNALS) {
    const mk = configuredMix(s, k);
    s.learn[k] = s.mixLearn?.[k]?.[mk] ?? [];
    const r = s.mixRange?.[k]?.[mk];
    if (r) s.range[k] = r;
    else delete s.range[k];
  }
}

/** Forget every range and learning value whose mix includes this source. */
function forgetMixesWith(s: TeenState, src: SourceId) {
  for (const k of SIGNALS) {
    for (const store of [s.mixLearn?.[k], s.mixRange?.[k]]) {
      if (!store) continue;
      for (const mk of Object.keys(store)) if (mk.split("+").includes(src)) delete store[mk];
    }
  }
}

/** Monday of an engine week, as YYYY-MM-DD (the engine's weeks start Monday 00:00 UTC). */
export function weekOfEngine(s: TeenState, week: number): string {
  return new Date(s.startAt + (week - 1) * WEEK).toISOString().slice(0, 10);
}

/** Signals outside now, from the latest valid week, kept to the active ones. */
function outsideNow(s: TeenState): SignalId[] {
  const active = new Set(activeSignals(s));
  for (let i = s.weeks.length - 1; i >= 0; i--) if (s.weeks[i].valid) return s.weeks[i].out.filter((k) => active.has(k) && s.runs[k] > 0);
  return [];
}

/** After a signal is forgotten, the "outside range" state and a question set asked because of
 *  it may no longer hold. Safety handling that already happened is kept. */
function reconcile(ctx: Ctx) {
  const { s, cfg } = ctx;
  const counting = countingSignals(s, cfg);
  const otherOut = outsideNow(s).filter((k) => k !== "tone");
  const cond = counting.length >= cfg.signalsToAsk || (counting.includes("tone") && otherOut.length >= 1);
  if (!cond && s.episode) {
    s.episode = null;
    trace(ctx, "Without that account, signals are no longer outside together.");
  }
  if (!cond && s.ask?.kind === "check" && s.ask.reason === "signals" && s.ask.answers.length === 0) {
    s.ask = null;
    trace(ctx, "The open question set was dropped. It does not count as skipped.");
  }
}



// ---------------------------------------------------------------- small helpers

function trace(ctx: Ctx, text: string, at = ctx.now) {
  ctx.s.trace.push({ at, text });
  if (ctx.s.trace.length > 400) ctx.s.trace.splice(0, ctx.s.trace.length - 400);
}

function anyHeld(s: TeenState): boolean {
  return Object.values(s.held).some(Boolean);
}

function inCooldown(s: TeenState, now: number, cfg: Config): boolean {
  return s.lastHeadsUpAt != null && now - s.lastHeadsUpAt < cfg.cooldownMs;
}

export function listSignals(sigs: SignalId[]): string {
  const w = sigs.map((x) => SIGNAL_LABEL[x]);
  if (w.length <= 1) return w.join("");
  return `${w.slice(0, -1).join(", ")} and ${w[w.length - 1]}`;
}

export function computeRange(sig: SignalId, values: number[], cfg: Config = CONFIG): Range {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  return { mean, spread: Math.max(Math.sqrt(variance), cfg.spreadFloor[sig]) };
}

/** Distance from normal in the worse direction, in spreads. Positive is worse. */
export function zWorse(sig: SignalId, value: number, r: Range, cfg: Config = CONFIG): number {
  return (cfg.worseDirection[sig] * (value - r.mean)) / r.spread;
}

function breachesFixed(sig: SignalId, value: number, cfg: Config): boolean {
  const lim = cfg.fixedLimits[sig];
  if (!lim) return false;
  return cfg.worseDirection[sig] * (value - lim.worseThan) > 0;
}

export function countingSignals(s: TeenState, cfg: Config = CONFIG): SignalId[] {
  return SIGNALS.filter((k) => s.runs[k] >= cfg.weeksToCount);
}

/** How long two signals have both been outside: the second-longest skip streak. */
export function skipWeeks(s: TeenState): number {
  const r = SIGNALS.map((k) => s.skipRuns[k]).sort((a, b) => b - a);
  return r[1] ?? 0;
}

/** Two signals outside for four weeks, with the last two asks skipped. Each of the two must
 *  have its own unbroken streak, so signals that take turns do not count. The four weeks
 *  start when the second of the two leaves its range. */
export function skipRuleHolds(s: TeenState, cfg: Config = CONFIG): boolean {
  if (s.setupHigh.active || s.off) return false;
  const long = SIGNALS.filter((k) => s.skipRuns[k] >= cfg.skipRuleWeeks && s.skipSince[k] != null);
  if (long.length < 2) return false;
  const pairStart = long.map((k) => s.skipSince[k] as number).sort((a, b) => a - b)[1];
  const checks = s.asks.filter((a) => a.kind === "check");
  if (checks.length < cfg.skipRuleAsks) return false;
  const last = checks.slice(-cfg.skipRuleAsks);
  return last.every((a) => a.result === "skipped" && a.week >= pairStart);
}

function resetSkipRuns(s: TeenState) {
  s.skipRuns = emptySignals(() => 0);
  s.skipSince = emptySignals<number | null>(() => null);
}

function setupSkipsHold(s: TeenState, cfg: Config): boolean {
  return s.setupHigh.active && s.setupHigh.skipsInRow >= cfg.setupSkipsInRow;
}

// ---------------------------------------------------------------- notes

function emitUrgent(ctx: Ctx, at: number, why: string) {
  ctx.events.push({ type: "urgent", sent_at: iso(at) });
  trace(ctx, `${why} Urgent note sent.`, at);
}

function sendHeadsUp(ctx: Ctx, at: number) {
  const { s, cfg } = ctx;
  const areas = s.setupHigh.active ? [] : countingSignals(s, cfg);
  if (areas.length) {
    const weeks = Math.min(...areas.map((k) => s.runs[k]));
    ctx.events.push({ type: "heads_up", areas, weeks, sent_at: iso(at) });
  } else {
    ctx.events.push({ type: "heads_up", sent_at: iso(at) });
  }
  s.lastHeadsUpAt = at;
  s.held = noHeld();
  if (s.setupHigh.active) s.setupHigh.skipsInRow = 0;
}

/** Ask for a heads-up. Inside the three-week limit the evidence is held. */
function headsUp(ctx: Ctx, reason: HeldReason, why: string, deferDoctor: boolean): boolean {
  const { s, cfg, now } = ctx;
  if (s.off) {
    trace(ctx, `${why} Stability is off, so nothing is sent.`);
    return false;
  }
  if (deferDoctor) {
    s.doctor.pending = true;
  } else {
    s.doctor.show = true;
    s.doctor.pending = false;
  }
  if (inCooldown(s, now, cfg)) {
    s.held[reason] = true;
    trace(ctx, `${why} Heads-up held: one went out less than three weeks ago.`);
    return false;
  }
  sendHeadsUp(ctx, now);
  trace(ctx, `${why} Heads-up sent to ${s.people.parent}.`);
  return true;
}

// ---------------------------------------------------------------- asks

function issueAsk(ctx: Ctx, kind: AskKind, reason: "signals" | "anyway" | "recheck" | "model") {
  const { s, now } = ctx;
  s.ask = {
    id: `${kind}-w${s.week}`,
    kind,
    week: s.week,
    issuedAt: now,
    answers: [],
    six: kind !== "check",
    reason,
  };
  s.lastAskWeek = s.week;
  const what =
    kind === "recheck"
      ? "Asked the eight questions again (every two weeks after a high setup score)."
      : reason === "anyway"
        ? "Asked the two questions (they come up every month anyway)."
        : reason === "model"
          ? "Asked the two questions (the ask model's score reached its threshold)."
          : "Asked the two questions.";
  trace(ctx, what);
}

function closeAsk(ctx: Ctx, result: AskResult, total?: number) {
  const { s, cfg, now } = ctx;
  const a = s.ask;
  if (!a) return;
  s.asks.push({ id: a.id, kind: a.kind, week: a.week, issuedAt: a.issuedAt, closedAt: now, result, reason: a.reason, total });
  s.ask = null;
  if (a.kind === "recheck") {
    const sh = s.setupHigh;
    sh.nextWeek = a.week + cfg.setupRecheckWeeks;
    if (result === "skipped") {
      sh.skipsInRow += 1;
      sh.clearInRow = 0;
      trace(ctx, "The eight were left unfinished. Counted as skipped.");
      if (setupSkipsHold(s, cfg)) {
        headsUp(ctx, "setupSkips", "Two check-ins in a row skipped after a high setup score.", true);
      }
    } else {
      sh.skipsInRow = 0;
    }
    return;
  }
  if (a.kind !== "check") return;
  if (result === "low") {
    s.pauseUntilWeek = a.week + cfg.lowAnswerPauseWeeks;
    resetSkipRuns(s);
    trace(ctx, "Low answer, taken at its word. Asking pauses for two weeks and the four-week count restarts.");
  } else if (result === "skipped") {
    trace(ctx, "Question set left unfinished. Counted as skipped.");
  }
}

function answer(ctx: Ctx, raw: number) {
  const { s, cfg } = ctx;
  const a = s.ask;
  if (!a) return;
  const value = Math.max(0, Math.min(3, Math.round(raw)));
  a.answers.push(value);
  const n = a.answers.length;
  const sum = a.answers.reduce((x, y) => x + y, 0);
  // The first two answers of any set are a PHQ-2 score. The ask model reads them later.
  if (n === 2) (s.phq2s ??= []).push({ week: a.kind === "setup" ? 0 : a.week, score: sum });

  if (a.kind === "check" && n === 2 && !a.six) {
    const byWeeks = s.episode != null && s.episode.validWeeks >= 1 + cfg.extraWeeksForEight;
    if (sum >= cfg.phq2Cutoff || byWeeks) {
      a.six = true;
      trace(ctx, byWeeks && sum < cfg.phq2Cutoff ? "Two more weeks outside: worth a check. The other six follow." : "The two are high: worth a check. The other six follow.");
    } else {
      closeAsk(ctx, "low", sum);
    }
    return;
  }
  if (n < 8) return;

  const high = sum >= cfg.phq8Cutoff;
  if (a.kind === "setup") {
    s.asks.push({ id: a.id, kind: "setup", week: 0, issuedAt: a.issuedAt, closedAt: ctx.now, result: high ? "high" : "low", total: sum });
    s.ask = null;
    s.setupDone = true;
    s.lastAskWeek = 0;
    if (high) {
      s.setupHigh = { active: true, nextWeek: cfg.setupRecheckWeeks, clearInRow: 0, skipsInRow: 0 };
      headsUp(ctx, "highScore", "Setup score of 10 or more. Learning waits.", false);
    } else {
      trace(ctx, "Setup answers under the cut-off. Stability starts learning the range.");
    }
    return;
  }
  if (a.kind === "recheck") {
    closeAsk(ctx, high ? "high" : "low", sum);
    const sh = s.setupHigh;
    if (high) {
      sh.clearInRow = 0;
      headsUp(ctx, "highScore", "Recheck score of 10 or more.", false);
    } else {
      sh.clearInRow += 1;
      if (sh.clearInRow >= cfg.setupClearInRow) {
        sh.active = false;
        trace(ctx, "Two rechecks in a row under 10. The range starts learning.");
      } else {
        trace(ctx, "Recheck under 10. One more in a row and the range starts learning.");
      }
    }
    return;
  }
  // check
  if (high) {
    closeAsk(ctx, "high", sum);
    headsUp(ctx, "highScore", "Score of 10 or more on the eight.", false);
  } else {
    closeAsk(ctx, "low", sum);
  }
}

// ---------------------------------------------------------------- days and weeks

function dayEnd(ctx: Ctx, day: number, hasData: boolean, keyboardUsed: boolean) {
  const { s, cfg } = ctx;
  s.dataDays[day] = hasData && !s.off;
  s.keyboardDays[day] = !s.off && (keyboardUsed || s.keyboardDays[day] === true);
  s.lastDayDone = Math.max(s.lastDayDone, day);
  // keep a few weeks only
  for (const k of Object.keys(s.dataDays)) if (Number(k) < day - 30) delete s.dataDays[Number(k)];
  for (const k of Object.keys(s.keyboardDays)) if (Number(k) < day - 30) delete s.keyboardDays[Number(k)];
  if (!s.paired || s.off) return;
  let n = 0;
  for (let d = day - 6; d <= day; d++) if (s.dataDays[d] === true) n++;
  ctx.events.push({
    type: "status",
    enough_data: n >= cfg.minDaysPerWeek,
    keyboard_used: s.keyboardDays[day] === true,
    sent_at: iso(ctx.now),
  });
}

/** A week left out of the count: too little data, or Stability was off. Two in a row restart it. */
function shortWeek(ctx: Ctx, rec: WeekRecord, why: string) {
  const { s, cfg } = ctx;
  const w = rec.week;
  s.shortInRow += 1;
  if (s.shortInRow >= cfg.shortWeeksToRestart) {
    s.runs = emptySignals(() => 0);
    resetSkipRuns(s);
    s.episode = null;
    trace(ctx, `Week ${w}: ${why}. Two short weeks in a row restart the count.`);
  } else {
    trace(ctx, `Week ${w}: ${why}. Left out of the count.`);
  }
  rec.counting = countingSignals(s, cfg);
  rec.ranges = { ...s.range };
  s.weeks.push(rec);
}

/** The two questions come up every two months even when nothing has shifted. */
function routineAsk(ctx: Ctx) {
  const { s, cfg } = ctx;
  const w = s.week;
  if (!s.ask && !s.setupHigh.active && w >= s.pauseUntilWeek && w - s.lastAskWeek >= cfg.askAnywayWeeks) {
    issueAsk(ctx, "check", "anyway");
  }
}

/** Usable days this week, from what the phone recorded day by day where it has a record.
 *  Days with no record (callers that only report weeks) are taken from the week's data. */
function usableDays(s: TeenState, w: number, data: WeekData): number {
  const first = (w - 1) * 7;
  let counted = 0;
  for (let d = first; d < first + 7; d++) {
    const rec = s.dataDays[d];
    if (rec === undefined) counted += d === first + 6 ? (s.off ? 0 : 1) : 1;
    else if (rec) counted += 1;
  }
  return Math.min(data.days, counted);
}

function weekEnd(ctx: Ctx, input: WeekData, live?: LiveWeek) {
  const { s, cfg, now } = ctx;
  s.week += 1;
  const w = s.week;
  const parts = weekParts(s, input, live);
  const { values, mix } = combine(s, parts, cfg);
  const data: WeekData = { days: usableDays(s, w, input), values, keyboardDays: input.keyboardDays, parts, mix };
  // Exam weeks are context only, from a connected calendar.
  for (const src of CONTEXT_SOURCES) {
    const link = s.sources?.[src];
    if (link?.mode === "sample" && input.calendar) data.calendar = input.calendar;
    if (link?.mode === "real" && live?.[src]?.exam) data.calendar = cfg.integrations.examLabel;
  }
  // Kept for the chart and older readers: the keyboard's tone and Gmail's, when both take part.
  if (s.sources?.gmail && typeof parts.phone?.lowMood === "number") data.keyboardTone = parts.phone.lowMood;
  if (s.sources?.gmail && typeof parts.gmail?.lowMood === "number") data.emailTone = parts.gmail.lowMood;
  const rec: WeekRecord = { week: w, endedAt: now, data, valid: false, z: {}, out: [], counting: [], learning: [], ranges: {} };

  // While Stability is off nothing is read, asked or sent. The week is left out.
  if (s.off) {
    if (s.setupDone && !s.setupHigh.active) shortWeek(ctx, rec, "Stability was off");
    else s.weeks.push(rec);
    return;
  }

  // The weekly note: a doctor suggestion that was waiting shows now. This runs first, so a
  // heads-up sent at this week's end still waits for the next note.
  if (s.doctor.pending) {
    s.doctor.pending = false;
    s.doctor.show = true;
  }

  // A set left unfinished counts as skipped.
  if (s.ask && s.ask.kind !== "setup" && s.ask.week < w) closeAsk(ctx, "skipped");

  const valid = s.setupDone && data.days >= cfg.minDaysPerWeek;
  rec.valid = valid;

  if (!s.setupDone) {
    s.weeks.push(rec);
    return;
  }

  if (s.setupHigh.active) {
    rec.learning = SIGNALS.filter((k) => data.values[k] != null);
    rec.ranges = { ...s.range };
    s.weeks.push(rec);
    if (!s.ask && w >= s.setupHigh.nextWeek) issueAsk(ctx, "recheck", "recheck");
    return;
  }

  if (!valid) {
    shortWeek(ctx, rec, `under ${cfg.minDaysPerWeek} days of data`);
    routineAsk(ctx);
    return;
  }
  s.shortInRow = 0;

  const present = SIGNALS.filter((k) => typeof data.values[k] === "number" && Number.isFinite(data.values[k]));
  const out: SignalId[] = [];
  const justLearned = new Set<SignalId>();
  for (const k of present) {
    const v = data.values[k] as number;
    const fixed = breachesFixed(k, v, cfg);
    const mk = data.mix?.[k] ?? "phone";
    const r = s.mixRange[k]?.[mk];
    rec.ranges[k] = r;
    if (!r) {
      if (!fixed) {
        const learn = ((s.mixLearn[k] ??= {})[mk] ??= []);
        learn.push(v);
        if (learn.length >= cfg.baselineWeeks) {
          (s.mixRange[k] ??= {})[mk] = computeRange(k, learn, cfg);
          rec.ranges[k] = s.mixRange[k]![mk];
          justLearned.add(k);
        }
      }
      rec.learning.push(k);
      if (fixed) out.push(k);
      continue;
    }
    const z = zWorse(k, v, r, cfg);
    rec.z[k] = Math.round(z * 100) / 100;
    if (z >= cfg.zOut - 1e-9 || fixed) out.push(k);
  }
  if (justLearned.size) trace(ctx, `Week ${w}: learned the usual range for ${listSignals([...justLearned])}.`);

  for (const k of SIGNALS) s.runs[k] = out.includes(k) ? s.runs[k] + 1 : 0;

  // The range moves toward better weeks quickly, worse weeks slowly, and freezes while
  // anything is outside it.
  if (cfg.rangeUpdate.enabled && out.length === 0) {
    for (const k of present) {
      const mk = data.mix?.[k] ?? "phone";
      const r = s.mixRange[k]?.[mk];
      if (!r || justLearned.has(k)) continue;
      const v = data.values[k] as number;
      const better = cfg.worseDirection[k] * (v - r.mean) < 0;
      const alpha = better ? cfg.rangeUpdate.towardBetter : cfg.rangeUpdate.towardWorse;
      s.mixRange[k]![mk] = { mean: r.mean + alpha * (v - r.mean), spread: r.spread };
    }
  }

  rec.out = out;
  rec.counting = countingSignals(s, cfg);

  // Each signal's streak toward the four weeks of the skip rule.
  for (const k of SIGNALS) {
    if (out.includes(k)) {
      if (s.skipRuns[k] === 0) s.skipSince[k] = w;
      s.skipRuns[k] += 1;
    } else {
      s.skipRuns[k] = 0;
      s.skipSince[k] = null;
    }
  }

  // Outside range: two signals count, or tone counts plus one other outside.
  const counting = rec.counting;
  const otherOut = out.filter((k) => k !== "tone");
  const cond =
    counting.length >= cfg.signalsToAsk || (counting.includes("tone") && otherOut.length >= 1);
  if (cond) {
    if (!s.episode) {
      s.episode = { start: w, validWeeks: 1 };
      trace(ctx, `Week ${w}: ${listSignals(counting)} outside the usual range for ${cfg.weeksToCount} weeks or more.`);
    } else {
      s.episode.validWeeks += 1;
    }
  } else {
    if (s.episode) trace(ctx, `Week ${w}: back inside the range.`);
    s.episode = null;
  }

  s.weeks.push(rec);

  if (skipRuleHolds(s, cfg)) {
    headsUp(ctx, "skipRule", `Two signals outside for ${skipWeeks(s)} weeks with the last two asks skipped.`, true);
  }

  // When to ask. The ask model goes first: it reads the check-in and the earlier answers.
  // Phone signals decide only when the teen has stopped checking in, as a backstop:
  // Experiment 1 found they pick weeks no better than chance. Otherwise they are context.
  const score = askScore(askInputs(s, w));
  rec.askScore = Math.round(score * 1000) / 1000;
  const canAsk = !s.ask && w >= s.pauseUntilWeek;
  const usesCheckins = checkedInLately(s, w, cfg.checkinFallbackWeeks);
  if (canAsk && score >= ASK_THRESHOLD && w - s.lastAskWeek >= cfg.askModelGapWeeks) issueAsk(ctx, "check", "model");
  else if (canAsk && cond && !usesCheckins) issueAsk(ctx, "check", "signals");
  else routineAsk(ctx);
}

// ---------------------------------------------------------------- urgent path

const SOURCE_WORDS: Record<string, string> = {
  keyboard: "Typed words",
  gmail: "An email",
  microsoft: "An email",
  instagram: "An Instagram message",
  tiktok: "A TikTok message",
  snapchat: "A Snapchat message",
  discord: "A Discord message",
  android: "The Stability keyboard on Android",
  email: "A message",
};

interface FlagInput {
  level: FlagLevel;
  via: "keyboard" | "item";
  at: number;
  key?: string;
  textHash?: string;
  source?: string;
  answer?: "yes" | "no" | null;
}

/** A self-harm flag. Keyboard flags happen now. Item flags (emails, messages in data files,
 *  the Android file) carry the item's own time and an opaque key: they reach the urgent path
 *  only if the item is from the last 24 hours and not in the future, an item already seen does
 *  nothing, and flags with the same words within 2 minutes are one message, whatever the source. */
function flag(ctx: Ctx, f: FlagInput) {
  const { s, cfg, now } = ctx;
  if (s.off || !s.paired) return;
  if (f.via === "keyboard") s.keyboardDays[dayAt(s, now)] = true;
  if (f.level === "none") return;
  const what = SOURCE_WORDS[f.source ?? (f.via === "keyboard" ? "keyboard" : "email")] ?? `A message from ${f.source}`;
  // Only the model read self-harm language. Ask, but silence sends nothing and it does not count
  // toward the second-flag rules: the model also flags people supporting a friend (Experiment 5b).
  if (f.level === "check") {
    if (s.safety.screen === "ask" || s.safety.screen === "emergency") return;
    s.safety.screen = "ask";
    s.safety.soft = true;
    trace(ctx, `${what} reads like self-harm language to the model, not the phrase list. Asked "Are you safe right now?" with 988 on screen. No answer sends nothing; "No" sends the urgent note.`);
    return;
  }
  s.safety.soft = false;
  if (f.via === "item") {
    if (now - f.at > cfg.itemFlagMaxAgeMs || f.at - now > cfg.itemFlagFutureMs) {
      trace(ctx, `${what} with words about self-harm is not from the last 24 hours. It counts only toward weekly numbers.`);
      return;
    }
    if (f.key && s.safety.flags.some((x) => x.key === f.key)) {
      trace(ctx, `${what} already checked. Ignored.`);
      return;
    }
  }
  if (f.textHash && s.safety.flags.some((x) => x.textHash === f.textHash && Math.abs(x.at - f.at) <= cfg.sameMessageMs)) {
    trace(ctx, `${what} is the same message as one already flagged. Counted once.`);
    return;
  }

  const ref = Math.max(now, f.at);
  const recent = s.safety.flags.filter((x) => ref - x.at <= cfg.flagsHeadsUpMs);
  const gaps = recent.map((x) => Math.abs(f.at - x.at));
  const nearest = gaps.length ? Math.min(...gaps) : null;
  s.safety.flags = [...recent, { at: f.at, key: f.key, textHash: f.textHash }];

  if (f.level === "plan") {
    s.safety.deadline = null;
    s.safety.screen = "emergency";
    emitUrgent(ctx, now, `${what} has words that state a plan or intent, or say harm has already happened.`);
    return;
  }
  if (nearest != null && nearest <= cfg.secondFlagMs) {
    s.safety.deadline = null;
    s.safety.screen = "help";
    emitUrgent(ctx, now, `${what}: a second flag within 7 days.`);
    return;
  }
  if (nearest != null && nearest <= cfg.flagsHeadsUpMs) {
    headsUp(ctx, "flags", "Two flags within 14 days.", true);
  }
  // The teen already answered on the phone (Android file).
  if (f.answer === "no") {
    s.safety.deadline = null;
    s.safety.screen = "help";
    emitUrgent(ctx, now, `${what}: "No" to "Are you safe right now?" on the phone.`);
    return;
  }
  if (f.answer === "yes") {
    trace(ctx, `${what}: "Yes" to "Are you safe right now?" on the phone. The note is held. A second flag within 7 days still sends it.`);
    return;
  }
  // No answer yet: 30 minutes from the flag (an Android flag) or from now.
  const deadline = (f.answer === null ? f.at : now) + cfg.safeAnswerTimeoutMs;
  if (deadline <= now) {
    s.safety.deadline = null;
    s.safety.screen = "help";
    emitUrgent(ctx, now, `${what}: no answer to "Are you safe right now?" within 30 minutes.`);
    return;
  }
  s.safety.screen = "ask";
  s.safety.deadline = deadline;
  trace(ctx, `${what} has words about self-harm. Asked "Are you safe right now?" with 988 on screen.`);
}

function safe(ctx: Ctx, ans: "yes" | "no") {
  const { s, now } = ctx;
  if (s.safety.soft) {
    s.safety.soft = false;
    s.safety.screen = "help";
    if (ans === "no") emitUrgent(ctx, now, '"No" to "Are you safe right now?" after the model flagged a message.');
    else trace(ctx, '"Yes" to "Are you safe right now?" after the model flagged a message. Nothing is sent.');
    return;
  }
  if (s.safety.deadline == null) {
    s.safety.screen = "help";
    return;
  }
  s.safety.deadline = null;
  s.safety.screen = "help";
  if (ans === "no") emitUrgent(ctx, now, '"No" to "Are you safe right now?".');
  else trace(ctx, '"Yes" to "Are you safe right now?". The note is held. A second flag within 7 days still sends it.');
}

/** The 30-minute wait for "Are you safe right now?". Never held back. */
function tickDeadline(ctx: Ctx) {
  const { s, cfg, now } = ctx;
  if (s.safety.deadline != null && now >= s.safety.deadline) {
    const at = s.safety.deadline;
    s.safety.deadline = null;
    if (s.safety.screen === "ask") s.safety.screen = "help";
    emitUrgent(ctx, at, "No answer within 30 minutes.");
  }
  s.safety.flags = s.safety.flags.filter((f) => now - f.at <= cfg.flagsHeadsUpMs || f.at > now);
}

/** The end of the three-week limit: held evidence is checked again against the current state. */
function tickCooldown(ctx: Ctx) {
  const { s, cfg, now } = ctx;
  if (!anyHeld(s) || s.lastHeadsUpAt == null || now < s.lastHeadsUpAt + cfg.cooldownMs) return;
  const at = s.lastHeadsUpAt + cfg.cooldownMs;
  const h = s.held;
  s.held = noHeld();
  if (s.off) {
    trace(ctx, "Three weeks are up, but Stability is off. Nothing sent.", at);
    return;
  }
  const send = h.highScore || h.flags || (h.skipRule && skipRuleHolds(s, cfg)) || (h.setupSkips && setupSkipsHold(s, cfg));
  if (send) {
    sendHeadsUp(ctx, at);
    trace(ctx, `Three weeks are up. Held evidence still holds. Second heads-up sent to ${s.people.parent}.`, at);
  } else {
    trace(ctx, "Three weeks are up. Held evidence no longer holds. Nothing sent.", at);
  }
}

function tick(ctx: Ctx) {
  tickDeadline(ctx);
  tickCooldown(ctx);
}

// ---------------------------------------------------------------- entry point

export function step(state: TeenState, input: Input, now: number, cfg: Config = CONFIG): StepResult {
  const s = structuredClone(state);
  const ctx: Ctx = { s, events: [], now, cfg };
  // Timers due before this input fire first. A week that ends at the same moment as the
  // three-week limit is processed before held evidence is checked again.
  if (input.kind === "weekEnd") tickDeadline(ctx);
  else if (input.kind !== "tick") tick(ctx);
  // While Stability is off nothing is read or asked.
  if (s.off && (input.kind === "answer" || input.kind === "skipAsk")) return { state: s, events: ctx.events };
  switch (input.kind) {
    case "pair":
      s.paired = true;
      s.people = { ...s.people, ...input.people };
      trace(ctx, `Paired with ${s.people.parent}'s phone.`);
      break;
    case "checkin": {
      if (!s.setupDone || s.off) break;
      const lvl = (v: number) => Math.max(1, Math.min(5, Math.round(v)));
      (s.checkins ??= {})[s.week + 1] = { stress: lvl(input.stress), withOthers: lvl(input.withOthers) };
      break;
    }
    case "rename":
      s.people = { ...s.people, ...input.people };
      break;
    case "acknowledge":
      if (!s.paired || s.acknowledged) break;
      s.acknowledged = true;
      if (input.trusted !== undefined) s.people.trusted = input.trusted.trim() || undefined;
      s.ask = { id: "setup", kind: "setup", week: 0, issuedAt: now, answers: [], six: true, reason: "setup" };
      trace(ctx, `${s.people.teen} read the setup screen and tapped "I understand".`);
      break;
    case "answer":
      answer(ctx, input.value);
      break;
    case "skipAsk":
      if (s.ask && s.ask.kind !== "setup") {
        closeAsk(ctx, "skipped");
        if (skipRuleHolds(s, cfg)) {
          headsUp(ctx, "skipRule", `Two signals outside for ${skipWeeks(s)} weeks with the last two asks skipped.`, true);
        }
      }
      break;
    case "dayEnd":
      dayEnd(ctx, input.day, input.hasData, input.keyboardUsed);
      break;
    case "weekEnd":
      weekEnd(ctx, input.data, input.live);
      tickCooldown(ctx);
      break;
    case "typed":
      flag(ctx, { level: input.level, via: input.via === "email" ? "item" : "keyboard", at: now, textHash: input.textHash, source: input.via === "email" ? "email" : "keyboard" });
      break;
    case "emailFlag":
      flag(ctx, {
        level: input.level,
        via: "item",
        at: input.sentAt,
        key: input.key,
        textHash: input.textHash,
        source: input.source ?? "email",
        answer: input.answer,
      });
      break;
    case "connect": {
      const before = s.sources?.[input.source];
      s.sources = { ...(s.sources ?? {}), [input.source]: { mode: input.mode, at: now, ...(input.provides ? { provides: input.provides } : {}) } };
      // Real and sample numbers never share a range.
      if (before && before.mode !== input.mode) {
        forgetMixesWith(s, input.source);
        for (const k of signalsOfSource(input.source)) {
          s.runs[k] = 0;
          s.skipRuns[k] = 0;
          s.skipSince[k] = null;
        }
      }
      reconcile(ctx);
      trace(
        ctx,
        `${input.source} connected (${input.mode === "sample" ? "sample data" : "on this phone"}). Signals that now mix in its numbers learn a new range first.`,
      );
      break;
    }
    case "disconnect": {
      const src = input.source;
      if (!s.sources?.[src]) break;
      const rest = { ...s.sources };
      delete rest[src];
      s.sources = rest;
      forgetMixesWith(s, src);
      // Rebuild every past week without this source, and clear the marks it touched.
      for (const rec of s.weeks) {
        const parts = { ...(rec.data.parts ?? {}) };
        const had = src in parts;
        delete parts[src];
        const { values, mix } = combine(s, parts, cfg);
        for (const k of SIGNALS) {
          const touched = had && (rec.data.mix?.[k] ?? "").split("+").includes(src);
          const gone = rec.data.values[k] !== undefined && values[k] === undefined;
          if (touched || gone) {
            delete rec.z[k];
            delete rec.ranges[k];
            rec.out = rec.out.filter((x) => x !== k);
            rec.counting = rec.counting.filter((x) => x !== k);
            rec.learning = rec.learning.filter((x) => x !== k);
          }
        }
        rec.data = { ...rec.data, parts, values, mix };
        if (src === "gmail") {
          delete rec.data.emailTone;
          delete rec.data.keyboardTone;
        }
        if (!CONTEXT_SOURCES.some((c) => s.sources[c])) delete rec.data.calendar;
      }
      for (const k of signalsOfSource(src)) {
        s.runs[k] = 0;
        s.skipRuns[k] = 0;
        s.skipSince[k] = null;
      }
      reconcile(ctx);
      trace(ctx, `${src} disconnected. What Stability learned from it is gone.`);
      break;
    }
    case "safe":
      safe(ctx, input.answer);
      break;
    case "tick":
      tick(ctx);
      break;
    case "setOff":
      if (input.off && !s.off) {
        if (s.safety.deadline != null) {
          s.safety.deadline = null;
          emitUrgent(ctx, now, 'Turned off while "Are you safe right now?" was open. Counts as no answer.');
        }
        if (s.ask && s.ask.kind !== "setup") {
          s.ask = null;
          trace(ctx, "The open question set was dropped. It does not count as skipped.");
        }
        s.off = true;
        s.safety.screen = "none";
        trace(ctx, "Stability turned off. No status events from now on.");
      } else if (!input.off && s.off) {
        s.off = false;
        trace(ctx, "Stability turned back on.");
      }
      break;
    case "dismiss":
      if (input.what === "doctor") s.doctor.show = false;
      else if (s.safety.deadline == null) {
        s.safety.screen = "none";
        s.safety.soft = false;
      }
      break;
    case "setTrusted":
      s.people.trusted = input.name && input.name.trim() ? input.name.trim() : undefined;
      trace(ctx, s.people.trusted ? `Trusted adult set: ${s.people.trusted}.` : "Trusted adult removed.");
      break;
  }
  refreshViews(s);
  return { state: s, events: ctx.events };
}

/** Apply several inputs at one time, collecting events. Handy for tests. */
export function stepAll(state: TeenState, inputs: Input[], now: number, cfg: Config = CONFIG): StepResult {
  let s = state;
  const events: SteadyEvent[] = [];
  for (const i of inputs) {
    const r = step(s, i, now, cfg);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}
