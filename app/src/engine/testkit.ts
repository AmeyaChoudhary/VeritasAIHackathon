// Shared helpers for the engine tests. Not used by the app.
import { HOUR, MINUTE } from "./config";
import { createTeen, nextTimer, step, weekEndAt, type Input } from "./rules";
import { DEMO_PEOPLE } from "./simulate";
import type { HeadsUpEvent, SteadyEvent, TeenState, WeekData } from "./types";

export const START = Date.UTC(2026, 10, 2);
export const LOW_SETUP = [0, 1, 0, 1, 0, 0, 0, 0];
export const HIGH_SETUP = [2, 2, 1, 2, 1, 1, 1, 1]; // 11

/** Weekly data. Defaults sit on the usual range once learned. */
export const W = (o: Partial<{ sleep: number; reach: number; act: number; tone: number; days: number; kb: number }> = {}): WeekData => ({
  days: o.days ?? 7,
  keyboardDays: o.kb,
  values: { sleep: o.sleep ?? 7.5, reaching_out: o.reach ?? 10, activity: o.act ?? 8000, tone: o.tone ?? 0.1 },
});
// With four identical weeks the spread is each signal's floor:
// sleep 0.3 h, reaching out 1 person, activity 600 steps, tone 0.03.
export const OUT2 = W({ sleep: 6.5, reach: 7 }); // sleep and reaching out both outside
export const OUT_SLEEP = W({ sleep: 6.5 });

export class Harness {
  s: TeenState;
  events: { at: number; e: SteadyEvent }[] = [];
  constructor(setup: number[] = LOW_SETUP, people = {}) {
    this.s = createTeen({ startAt: START, code: "TEST", people: { ...DEMO_PEOPLE, ...people } });
    const t = START - 2 * HOUR;
    this.do({ kind: "pair" }, t);
    this.do({ kind: "acknowledge" }, t);
    for (const v of setup) this.do({ kind: "answer", value: v }, t);
  }
  do(input: Input, t: number) {
    const r = step(this.s, input, t);
    this.s = r.state;
    for (const e of r.events) this.events.push({ at: t, e });
    return this;
  }
  tickTo(t: number) {
    for (let nt = nextTimer(this.s); nt != null && nt <= t; nt = nextTimer(this.s)) this.do({ kind: "tick" }, nt);
    return this;
  }
  get weekEnd() {
    return weekEndAt(this.s, this.s.week + 1);
  }
  /** Timers due strictly before the week end fire first; step() handles the rest in order. */
  week(data: WeekData) {
    const t = this.weekEnd;
    this.tickTo(t - 1);
    return this.do({ kind: "weekEnd", data }, t);
  }
  weeks(n: number, data: WeekData) {
    for (let i = 0; i < n; i++) this.week(data);
    return this;
  }
  learn() {
    return this.weeks(4, W());
  }
  answer(values: number[], dt = 30 * MINUTE) {
    const t = weekEndAt(this.s, this.s.week) + dt;
    for (const v of values) this.do({ kind: "answer", value: v }, t);
    return this;
  }
  skip(dt = 30 * MINUTE) {
    return this.do({ kind: "skipAsk" }, weekEndAt(this.s, this.s.week) + dt);
  }
  of(type: SteadyEvent["type"]) {
    return this.events.filter((x) => x.e.type === type);
  }
  headsUps() {
    return this.of("heads_up") as { at: number; e: HeadsUpEvent }[];
  }
}
