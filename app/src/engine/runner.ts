// Plays a scenario through the rules in time order: day ends (status events), week ends,
// the engine's own timers, scripted answers, typed messages and stop points.
// Pure: the same world, scenario and target give the same result.

import { CONFIG, HOUR, MINUTE, type Config } from "./config";
import { createTeen, dayEndAt, nextCooldownEnd, nextDeadline, step, weekEndAt, weekOfEngine, type FlagLevel, type Input } from "./rules";
import { checkSelfHarm } from "./selfharm";
import { textHash } from "./hash";
import type { Scenario, ScenarioId } from "./simulate";
import type { ReplyChoice } from "./parent";
import type { LiveWeek, SteadyEvent, TeenState } from "./types";

/** Real numbers from connected accounts, by the Monday of the week (YYYY-MM-DD). */
export type LiveLookup = (weekOf: string) => LiveWeek | undefined;

export interface World {
  v: 1;
  scenarioId: ScenarioId;
  teen: TeenState;
  /** Sim time processed up to. */
  now: number;
  /** Script steps already applied. */
  done: string[];
  /** Scripted answers and parent replies on or off. */
  scripted: boolean;
}

export interface Emitted {
  at: number;
  event: SteadyEvent;
}

export interface TypedMessage {
  at: number;
  level: FlagLevel;
  /** Handed to the screen for the typing effect, then dropped. Never stored or sent. */
  text: string;
}

export interface AdvanceResult {
  world: World;
  emitted: Emitted[];
  replies: { id: string; at: number; choice: ReplyChoice }[];
  typed: TypedMessage[];
  stop: { at: number; label: string } | null;
}

/** The world opens on the Sunday evening before week 1, when setup happens. */
export const SETUP_OFFSET = -2 * HOUR;

export function createWorld(scn: Scenario, code: string, scripted = true): World {
  return {
    v: 1,
    scenarioId: scn.id,
    teen: createTeen({ startAt: scn.startAt, code, people: scn.people }),
    now: scn.startAt + SETUP_OFFSET,
    done: [],
    scripted,
  };
}

function apply(world: World, input: Input, at: number, out: Emitted[], cfg: Config): World {
  const r = step(world.teen, input, at, cfg);
  for (const e of r.events) out.push({ at, event: e });
  return { ...world, teen: r.state };
}

/** Pair, read the setup screen and answer the eight with the scenario's answers. */
export function autoSetup(world: World, scn: Scenario, cfg: Config = CONFIG): { world: World; emitted: Emitted[] } {
  const emitted: Emitted[] = [];
  let w = world;
  const t = w.now;
  if (!w.teen.paired) w = apply(w, { kind: "pair", people: {} }, t, emitted, cfg);
  if (!w.teen.acknowledged) w = apply(w, { kind: "acknowledge", trusted: w.teen.people.trusted }, t, emitted, cfg);
  while (!w.teen.setupDone && w.teen.ask?.kind === "setup") {
    const i = w.teen.ask.answers.length;
    w = apply(w, { kind: "answer", value: scn.setupAnswers[i] ?? 0 }, t, emitted, cfg);
  }
  return { world: w, emitted };
}

type Cand =
  | { t: number; pri: number; k: "timer" }
  | { t: number; pri: number; k: "day"; day: number }
  | { t: number; pri: number; k: "week" }
  | { t: number; pri: number; k: "answer"; askId: string; week: number }
  | { t: number; pri: number; k: "message"; id: string; text: string; stop: boolean }
  | { t: number; pri: number; k: "reply"; id: string; choice: ReplyChoice }
  | { t: number; pri: number; k: "stop"; id: string; label: string };

function earliest<T extends { id: string; at: number }>(items: T[], done: string[]): T | undefined {
  let best: T | undefined;
  for (const x of items) if (!done.includes(x.id) && (!best || x.at < best.at)) best = x;
  return best;
}

// Priorities break ties at the same moment: the safety deadline first, then the day, then the
// week, then the end of the three-week limit (so a week's own evidence counts first), then
// scripted steps.
function candidates(w: World, scn: Scenario, cfg: Config): Cand[] {
  const c: Cand[] = [];
  const s = w.teen;
  const dl = nextDeadline(s);
  if (dl != null) c.push({ t: dl, pri: 0, k: "timer" });
  c.push({ t: dayEndAt(s, s.lastDayDone + 1, cfg), pri: 1, k: "day", day: s.lastDayDone + 1 });
  if (s.setupDone && s.week < scn.weeks.length) c.push({ t: weekEndAt(s, s.week + 1, cfg), pri: 2, k: "week" });
  const cd = nextCooldownEnd(s, cfg);
  if (cd != null) c.push({ t: cd, pri: 3, k: "timer" });
  if (w.scripted && s.ask && s.ask.kind !== "setup" && scn.answers[s.ask.week] !== undefined && !w.done.includes(`ans-${s.ask.id}`)) {
    c.push({ t: s.ask.issuedAt + cfg.scriptedAnswerDelayMs, pri: 4, k: "answer", askId: s.ask.id, week: s.ask.week });
  }
  const m = earliest(scn.messages, w.done);
  if (m) c.push({ t: m.at, pri: 5, k: "message", id: m.id, text: m.text, stop: !!m.stop });
  if (w.scripted) {
    const r = earliest(scn.replies, w.done);
    if (r) c.push({ t: r.at, pri: 6, k: "reply", id: r.id, choice: r.choice });
  }
  const st = earliest(scn.stops, w.done);
  if (st) c.push({ t: st.at, pri: 7, k: "stop", id: st.id, label: st.label });
  return c;
}

function dayInfo(scn: Scenario, day: number): { hasData: boolean; keyboardUsed: boolean } {
  if (day < 0) return { hasData: true, keyboardUsed: true };
  const wk = scn.weeks[Math.floor(day / 7)];
  if (!wk) return { hasData: true, keyboardUsed: true };
  const dow = day % 7;
  return { hasData: dow < wk.days, keyboardUsed: dow < (wk.keyboardDays ?? 7) };
}

export function advance(
  world: World,
  target: number,
  scn: Scenario,
  opts: { stopAtStops?: boolean; cfg?: Config; live?: LiveLookup } = {},
): AdvanceResult {
  const cfg = opts.cfg ?? CONFIG;
  const emitted: Emitted[] = [];
  const replies: AdvanceResult["replies"] = [];
  const typed: TypedMessage[] = [];
  let w = world;
  // Time does not pass the start of week 1 until setup is done.
  const limit = w.teen.setupDone ? target : Math.min(target, scn.startAt - 1);

  for (let guard = 0; guard < 20000; guard++) {
    const cands = candidates(w, scn, cfg).filter((c) => c.t <= limit);
    if (!cands.length) break;
    cands.sort((a, b) => a.t - b.t || a.pri - b.pri);
    const c = cands[0];
    const t = Math.max(w.now, c.t);
    w = { ...w, now: t };
    switch (c.k) {
      case "timer":
        w = apply(w, { kind: "tick" }, t, emitted, cfg);
        break;
      case "day": {
        const info = dayInfo(scn, c.day);
        w = apply(w, { kind: "dayEnd", day: c.day, ...info }, t, emitted, cfg);
        break;
      }
      case "week": {
        // Scripted: she taps this week's check-in before the week closes.
        const ci = scn.checkins?.[w.teen.week];
        if (w.scripted && ci && !w.teen.checkins?.[w.teen.week + 1]) {
          w = apply(w, { kind: "checkin", stress: ci[0], withOthers: ci[1] }, t, emitted, cfg);
        }
        w = apply(
          w,
          { kind: "weekEnd", data: scn.weeks[w.teen.week], live: opts.live?.(weekOfEngine(w.teen, w.teen.week + 1)) },
          t,
          emitted,
          cfg,
        );
        break;
      }
      case "answer": {
        const ans = scn.answers[c.week];
        w = { ...w, done: [...w.done, `ans-${c.askId}`] };
        if (ans === "skip") {
          w = apply(w, { kind: "skipAsk" }, t, emitted, cfg);
        } else if (ans) {
          for (const v of ans.slice(w.teen.ask?.answers.length ?? 0)) {
            if (!w.teen.ask || w.teen.ask.id !== c.askId) break;
            w = apply(w, { kind: "answer", value: v }, t, emitted, cfg);
          }
        }
        break;
      }
      case "message": {
        const level = checkSelfHarm(c.text).level;
        w = { ...w, done: [...w.done, c.id] };
        w = apply(w, { kind: "typed", level, textHash: level === "none" ? undefined : textHash(c.text) }, t, emitted, cfg);
        typed.push({ at: t, level, text: c.text });
        if (c.stop && opts.stopAtStops) return { world: w, emitted, replies, typed, stop: { at: t, label: "Message typed" } };
        break;
      }
      case "reply":
        w = { ...w, done: [...w.done, c.id] };
        replies.push({ id: c.id, at: t, choice: c.choice });
        break;
      case "stop":
        w = { ...w, done: [...w.done, c.id] };
        if (opts.stopAtStops) return { world: w, emitted, replies, typed, stop: { at: t, label: c.label } };
        break;
    }
  }
  w = { ...w, now: Math.max(w.now, limit) };
  return { world: w, emitted, replies, typed, stop: null };
}

/** Apply something the user did, at the current time. */
export function applyInput(world: World, scn: Scenario, input: Input, now: number, cfg: Config = CONFIG, live?: LiveLookup): AdvanceResult {
  const r = advance(world, now, scn, { cfg, live });
  const emitted = [...r.emitted];
  const w = apply(r.world, input, Math.max(r.world.now, now), emitted, cfg);
  return { ...r, world: w, emitted };
}

/** Where "Next week" goes: just after the next week ends and any scripted answer is in. */
export function nextWeekTarget(world: World, scn: Scenario, cfg: Config = CONFIG): number | null {
  const s = world.teen;
  if (s.week >= scn.weeks.length) return null;
  return weekEndAt(s, s.week + 1, cfg) + cfg.scriptedAnswerDelayMs + MINUTE;
}
