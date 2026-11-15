import { describe, expect, it } from "vitest";
import { CONFIG, DAY, HOUR, MINUTE, WEEK } from "./config";
import { computeRange, createTeen, iso, skipRuleHolds, skipWeeks, weekEndAt, zWorse } from "./rules";
import { HIGH_SETUP, Harness, OUT2, OUT_SLEEP, START, W } from "./testkit";
import { connection, headsUpView, urgentView, type Note, type Reply } from "./parent";
import { MemoryTransport, eventBytes } from "./transport";
import { homeSummary } from "./summary";
import { headsUpText, urgentText, setupScreenText } from "./notes";
import { DEMO_PEOPLE } from "./simulate";
import type { HeadsUpEvent, SteadyEvent } from "./types";

describe("personal range", () => {
  it("learns mean and spread from the first four valid weeks, with a floor", () => {
    const h = new Harness();
    h.week(W({ sleep: 7.9, reach: 11 }));
    h.week(W({ sleep: 7.4, reach: 12, days: 2 })); // short week: not used
    h.week(W({ sleep: 7.4, reach: 12 }));
    h.week(W({ sleep: 7.0, reach: 10 }));
    expect(h.s.range.sleep).toBeUndefined();
    h.week(W({ sleep: 7.7, reach: 11 }));
    expect(h.s.range.sleep!.mean).toBeCloseTo(7.5, 5);
    expect(h.s.range.sleep!.spread).toBeCloseTo(0.3916, 3);
    // reaching out varies by about 0.8, under its floor of 1
    expect(h.s.range.reaching_out!.spread).toBe(CONFIG.spreadFloor.reaching_out);
  });

  it("computeRange uses the floor when values do not vary", () => {
    expect(computeRange("activity", [8000, 8000, 8000, 8000])).toEqual({ mean: 8000, spread: 600 });
  });

  it("scores distance in the worse direction only", () => {
    const r = { mean: 7.5, spread: 0.4 };
    expect(zWorse("sleep", 5.9, r)).toBeCloseTo(4, 5); // less sleep is worse
    expect(zWorse("sleep", 8.3, r)).toBeLessThan(0); // more sleep is not
    expect(zWorse("tone", 0.16, { mean: 0.1, spread: 0.03 })).toBeCloseTo(2, 5); // more low-mood messages is worse
  });

  it("counts a week as outside at exactly one spread", () => {
    const h = new Harness().learn();
    h.week(W({ sleep: 7.2 }));
    expect(h.s.weeks.at(-1)!.out).toEqual(["sleep"]);
    h.week(W({ sleep: 7.25 }));
    expect(h.s.weeks.at(-1)!.out).toEqual([]);
  });

  it("applies the fixed sleep limit as well as the personal range", () => {
    const h = new Harness();
    h.weeks(4, W({ sleep: 6.3 })); // a low normal: range learned at 6.3
    h.week(W({ sleep: 5.9 })); // 1.3 spreads out and under six hours
    expect(h.s.weeks.at(-1)!.out).toContain("sleep");
    const h2 = new Harness();
    h2.weeks(4, W({ sleep: 5.5, act: 8000 })); // already under the limit: sleep never learns from it
    expect(h2.s.range.sleep).toBeUndefined();
    expect(h2.s.runs.sleep).toBe(4);
  });

  it("moves toward better weeks quickly, worse weeks slowly, and freezes while outside", () => {
    const h = new Harness().learn();
    h.week(W({ sleep: 7.7 })); // better
    expect(h.s.range.sleep!.mean).toBeCloseTo(7.5 + 0.25 * 0.2, 5);
    const m = h.s.range.sleep!.mean;
    h.week(W({ sleep: 7.4 })); // a bit worse, still inside
    expect(h.s.range.sleep!.mean).toBeCloseTo(m + 0.05 * (7.4 - m), 5);
    const m2 = h.s.range.sleep!.mean;
    h.week(OUT2);
    expect(h.s.range.sleep!.mean).toBe(m2);
  });
});

describe("two-week rule and asking", () => {
  it("a signal counts only after two weeks outside in a row", () => {
    const h = new Harness().learn();
    h.week(OUT2);
    expect(h.s.weeks.at(-1)!.counting).toEqual([]);
    expect(h.s.ask).toBeNull();
    h.week(OUT2);
    expect(h.s.weeks.at(-1)!.counting).toEqual(["sleep", "reaching_out"]);
    expect(h.s.ask?.kind).toBe("check");
  });

  it("one signal outside is not enough to ask", () => {
    const h = new Harness().learn().weeks(3, OUT_SLEEP);
    expect(h.s.ask).toBeNull();
    expect(h.s.episode).toBeNull();
  });

  it("tone plus one other is enough", () => {
    const h = new Harness().learn();
    h.week(W({ tone: 0.2 }));
    h.week(W({ tone: 0.2, act: 7000 })); // tone counts, activity outside this week
    expect(h.s.ask?.kind).toBe("check");
  });

  it("asks once a week while signals stay outside", () => {
    const h = new Harness().learn().weeks(2, OUT2);
    const ids = [h.s.ask!.id];
    h.week(OUT2);
    ids.push(h.s.ask!.id);
    h.week(OUT2);
    ids.push(h.s.ask!.id);
    expect(new Set(ids).size).toBe(3);
    // the monthly ask at week 4, then weeks 6 and 7
    expect(h.s.asks.filter((a) => a.kind === "check").map((a) => a.result)).toEqual(["skipped", "skipped", "skipped"]);
  });

  it("an unfinished set counts as skipped when the next week ends", () => {
    const h = new Harness().learn().weeks(2, OUT2);
    h.answer([2]); // one of two answered
    h.week(OUT2);
    expect(h.s.asks.at(-1)!.result).toBe("skipped");
  });

  it("a score of 3 or more on the two leads to the other six", () => {
    const h = new Harness().learn().weeks(2, OUT2);
    h.answer([2, 1]);
    expect(h.s.ask?.six).toBe(true);
  });

  it("a low answer is taken at its word: asking pauses two weeks", () => {
    const h = new Harness().learn().weeks(2, OUT2);
    h.answer([1, 1]);
    expect(h.s.ask).toBeNull();
    expect(h.s.asks.at(-1)!.result).toBe("low");
    h.week(OUT2);
    expect(h.s.ask).toBeNull(); // paused
    h.week(OUT2);
    expect(h.s.ask?.kind).toBe("check");
  });

  it("two more weeks outside leads to the other six even after a low two", () => {
    const h = new Harness().learn().weeks(2, OUT2); // outside from week 6
    h.answer([1, 1]); // low
    h.weeks(2, OUT2); // weeks 7 and 8
    h.answer([1, 1]);
    expect(h.s.ask?.six).toBe(true);
  });

  it("asks the two every two months even when nothing shifts", () => {
    const h = new Harness().learn().weeks(3, W());
    expect(h.s.ask).toBeNull();
    h.week(W()); // week 8
    expect(h.s.ask?.reason).toBe("anyway");
  });
});

describe("heads-up", () => {
  it("a score of 10 or more on the eight sends a heads-up with areas and weeks", () => {
    const h = new Harness().learn().weeks(4, OUT2);
    h.answer([2, 2, 2, 1, 1, 1, 1, 1]);
    const hu = h.headsUps();
    expect(hu).toHaveLength(1);
    expect(hu[0].e).toEqual({ type: "heads_up", areas: ["sleep", "reaching_out"], weeks: 4, sent_at: iso(hu[0].at) });
    expect(h.s.doctor.show).toBe(true);
  });

  it("a high score with no shift sends a heads-up without areas or weeks", () => {
    const h = new Harness().learn().weeks(4, W()); // week 8: asked anyway
    h.answer([2, 2, 2, 1, 1, 1, 1, 1]);
    expect(Object.keys(h.headsUps()[0].e)).toEqual(["type", "sent_at"]);
  });

  it("an eight under 10 is a low answer", () => {
    const h = new Harness().learn().weeks(2, OUT2);
    h.answer([2, 1, 1, 1, 1, 1, 1, 1]); // 9
    expect(h.headsUps()).toHaveLength(0);
    expect(h.s.asks.at(-1)!.result).toBe("low");
  });

  it("a setup score of 10 or more sends a heads-up at once, without areas", () => {
    const h = new Harness(HIGH_SETUP);
    expect(h.headsUps()).toHaveLength(1);
    expect(h.headsUps()[0].e.areas).toBeUndefined();
    expect(h.s.doctor.show).toBe(true);
    expect(h.s.setupHigh.active).toBe(true);
  });

  it("after a high setup score the eight come back every two weeks and learning starts after two under 10", () => {
    const h = new Harness(HIGH_SETUP);
    h.week(W());
    expect(h.s.ask).toBeNull();
    h.week(W()); // week 2
    expect(h.s.ask?.kind).toBe("recheck");
    h.answer([1, 1, 1, 1, 0, 0, 0, 0]);
    h.weeks(2, W()); // week 4
    expect(h.s.ask?.kind).toBe("recheck");
    expect(h.s.range.sleep).toBeUndefined();
    h.answer([1, 0, 1, 0, 0, 0, 0, 0]);
    expect(h.s.setupHigh.active).toBe(false);
    h.weeks(4, W());
    expect(h.s.range.sleep).toBeDefined(); // learned from weeks 5 to 8
  });

  it("after a high setup score, two skipped check-ins in a row send another heads-up", () => {
    const h = new Harness(HIGH_SETUP);
    h.weeks(2, W()); // recheck at week 2
    h.weeks(2, W()); // week 3 closes it as skipped; recheck at week 4
    expect(h.headsUps()).toHaveLength(1);
    h.week(W()); // week 5: second recheck skipped
    expect(h.headsUps()).toHaveLength(2);
    expect(h.headsUps()[1].e.areas).toBeUndefined();
    // the teen's doctor suggestion waits for the next weekly note
    h.do({ kind: "dismiss", what: "doctor" }, h.weekEnd - DAY);
    expect(h.s.doctor.show).toBe(false);
    h.week(W());
    expect(h.s.doctor.show).toBe(true);
  });

  it("two signals outside for four weeks with the last two asks skipped sends a heads-up", () => {
    const h = new Harness().learn().weeks(2, OUT2); // weeks 5, 6: ask
    h.skip();
    h.week(OUT2); // week 7: ask
    h.skip();
    expect(h.headsUps()).toHaveLength(0);
    h.week(OUT2); // week 8: four weeks outside
    const hu = h.headsUps();
    expect(hu).toHaveLength(1);
    expect(hu[0].e.areas).toEqual(["sleep", "reaching_out"]);
    expect(hu[0].e.weeks).toBe(4);
    // after skipped asks the doctor suggestion waits for the next weekly note
    expect(h.s.doctor).toEqual({ show: false, pending: true });
    h.week(OUT2);
    expect(h.s.doctor.show).toBe(true);
  });

  it("the four weeks start when the second signal leaves its range", () => {
    const h = new Harness().learn();
    h.weeks(2, OUT_SLEEP); // sleep alone
    h.weeks(2, OUT2); // reaching out leaves at week 7
    h.skip();
    h.week(OUT2); // week 9
    h.skip();
    h.week(OUT2); // week 10: only four weeks since reaching out left
    expect(skipWeeks(h.s)).toBe(4);
    expect(skipRuleHolds(h.s)).toBe(true);
    expect(h.headsUps()).toHaveLength(1);
  });

  it("a low answer is not a skip and restarts the four weeks", () => {
    const h = new Harness().learn().weeks(2, OUT2); // weeks 5, 6
    h.skip();
    h.week(OUT2); // 7
    h.answer([1, 0]); // low: pause, clock restarts
    expect(skipWeeks(h.s)).toBe(0);
    h.weeks(2, OUT2); // 8, 9 (ask at 9)
    h.skip();
    h.week(OUT2); // 10
    h.skip();
    h.week(OUT2); // 11: clock 4 again (8, 9, 10, 11), last two asks skipped
    expect(skipWeeks(h.s)).toBe(4);
    expect(h.headsUps()).toHaveLength(1);
    expect(h.headsUps()[0].at).toBe(weekEndAt(h.s, 11));
  });

  it("at most one heads-up every three weeks; held evidence is checked again when they end", () => {
    const h = new Harness().learn().weeks(2, OUT2);
    h.skip();
    h.week(OUT2);
    h.skip();
    h.week(OUT2); // week 8: first heads-up
    for (let i = 0; i < 2; i++) {
      h.skip();
      h.week(OUT2); // weeks 9, 10: held
    }
    expect(h.headsUps()).toHaveLength(1);
    expect(h.s.held.skipRule).toBe(true);
    h.skip();
    h.week(OUT2); // week 11: three weeks are up
    const hu = h.headsUps();
    expect(hu).toHaveLength(2);
    expect(hu[1].at - hu[0].at).toBe(CONFIG.cooldownMs);
  });

  it("held evidence that no longer holds sends nothing", () => {
    const h = new Harness().learn().weeks(2, OUT2);
    h.skip();
    h.week(OUT2);
    h.skip();
    h.week(OUT2); // heads-up at week 8
    h.skip();
    h.week(OUT2); // week 9: held
    h.week(W()); // week 10: back in range
    h.week(W()); // week 11: limit ends
    expect(h.headsUps()).toHaveLength(1);
    expect(h.s.held.skipRule).toBe(false);
  });

  it("a new high score inside the three weeks is held, then sent", () => {
    const h = new Harness().learn().weeks(4, OUT2);
    h.answer([2, 2, 2, 1, 1, 1, 1, 1]); // week 8 high: heads-up
    h.week(OUT2); // week 9 ask
    h.answer([2, 2, 2, 1, 1, 1, 1, 1]); // high again: held
    expect(h.headsUps()).toHaveLength(1);
    expect(h.s.held.highScore).toBe(true);
    const first = h.headsUps()[0].at;
    h.tickTo(first + CONFIG.cooldownMs);
    expect(h.headsUps()).toHaveLength(2);
    expect(h.headsUps()[1].at).toBe(first + CONFIG.cooldownMs);
  });
});

describe("weeks without enough data", () => {
  it("a short week is left out of the count", () => {
    const h = new Harness().learn();
    h.week(OUT2);
    h.week(W({ days: 3 }));
    expect(h.s.runs.sleep).toBe(1);
    h.week(OUT2);
    expect(h.s.runs.sleep).toBe(2);
    expect(h.s.ask?.kind).toBe("check");
  });

  it("two short weeks in a row restart the count", () => {
    const h = new Harness().learn();
    h.week(OUT2);
    h.week(W({ days: 3 }));
    h.week(W({ days: 1 }));
    expect(h.s.runs.sleep).toBe(0);
    h.week(OUT2); // week 8: sleep has one week outside again, so nothing counts
    expect(h.s.episode).toBeNull();
    expect(h.s.ask?.reason).toBe("anyway"); // only the every-two-months ask
  });
});

describe("urgent path", () => {
  const t0 = weekEndAt(createTeen({ startAt: START, code: "" }), 2) + 2 * HOUR;

  it('"plan" words send an urgent note at once and show 988 and 911', () => {
    const h = new Harness().learn();
    h.do({ kind: "typed", level: "plan" }, t0 + 3 * WEEK);
    expect(h.of("urgent")).toHaveLength(1);
    expect(h.of("urgent")[0].e).toEqual({ type: "urgent", sent_at: iso(t0 + 3 * WEEK) });
    expect(h.s.safety.screen).toBe("emergency");
  });

  it('"concern" words ask first; "no" sends the urgent note', () => {
    const h = new Harness();
    h.do({ kind: "typed", level: "concern" }, t0);
    expect(h.s.safety.screen).toBe("ask");
    expect(h.of("urgent")).toHaveLength(0);
    h.do({ kind: "safe", answer: "no" }, t0 + 2 * MINUTE);
    expect(h.of("urgent")).toHaveLength(1);
  });

  it('"yes" holds the note', () => {
    const h = new Harness();
    h.do({ kind: "typed", level: "concern" }, t0);
    h.do({ kind: "safe", answer: "yes" }, t0 + MINUTE);
    h.tickTo(t0 + 2 * HOUR);
    expect(h.of("urgent")).toHaveLength(0);
  });

  it("no answer within 30 minutes sends the urgent note", () => {
    const h = new Harness();
    h.do({ kind: "typed", level: "concern" }, t0);
    h.tickTo(t0 + 29 * MINUTE);
    expect(h.of("urgent")).toHaveLength(0);
    h.tickTo(t0 + 31 * MINUTE);
    expect(h.of("urgent")).toHaveLength(1);
    expect(h.of("urgent")[0].at).toBe(t0 + CONFIG.safeAnswerTimeoutMs);
  });

  it("a second flag within 7 days sends the urgent note, even after yes", () => {
    const h = new Harness();
    h.do({ kind: "typed", level: "concern" }, t0);
    h.do({ kind: "safe", answer: "yes" }, t0 + MINUTE);
    h.do({ kind: "typed", level: "concern" }, t0 + 6 * DAY);
    expect(h.of("urgent")).toHaveLength(1);
  });

  it("a flag after 7 days asks again, and two flags in 14 days send a heads-up", () => {
    const h = new Harness().learn();
    const t = h.weekEnd - 10 * DAY;
    h.do({ kind: "typed", level: "concern" }, t);
    h.do({ kind: "safe", answer: "yes" }, t + MINUTE);
    h.do({ kind: "typed", level: "concern" }, t + 9 * DAY);
    expect(h.of("urgent")).toHaveLength(0);
    expect(h.s.safety.screen).toBe("ask");
    expect(h.headsUps()).toHaveLength(1);
    h.do({ kind: "safe", answer: "yes" }, t + 9 * DAY + MINUTE);
    expect(h.of("urgent")).toHaveLength(0);
  });

  it("flags more than 14 days apart do nothing extra", () => {
    const h = new Harness();
    h.do({ kind: "typed", level: "concern" }, t0);
    h.do({ kind: "safe", answer: "yes" }, t0 + MINUTE);
    h.do({ kind: "typed", level: "concern" }, t0 + 15 * DAY);
    h.do({ kind: "safe", answer: "yes" }, t0 + 15 * DAY + MINUTE);
    expect(h.headsUps()).toHaveLength(0);
    expect(h.of("urgent")).toHaveLength(0);
  });

  it("urgent notes are never held back by the three-week limit or a pause in asking", () => {
    const h = new Harness(HIGH_SETUP); // heads-up at setup starts the limit
    h.do({ kind: "typed", level: "plan" }, START + DAY);
    h.do({ kind: "typed", level: "plan" }, START + 2 * DAY);
    expect(h.of("urgent")).toHaveLength(2);
    const p = new Harness().learn().weeks(2, OUT2);
    p.answer([0, 0]); // low: asking paused
    p.do({ kind: "typed", level: "plan" }, p.weekEnd - DAY);
    expect(p.of("urgent")).toHaveLength(1);
  });

  it('turning Steady off while "Are you safe right now?" is open sends the urgent note first', () => {
    const h = new Harness();
    h.do({ kind: "typed", level: "concern" }, t0);
    h.do({ kind: "setOff", off: true }, t0 + 5 * MINUTE);
    expect(h.of("urgent")).toHaveLength(1);
    expect(h.of("urgent")[0].at).toBe(t0 + 5 * MINUTE);
    expect(h.s.off).toBe(true);
    h.tickTo(t0 + HOUR);
    expect(h.of("urgent")).toHaveLength(1);
  });

  it("held evidence is dropped, not sent, while Steady is off", () => {
    const h = new Harness().learn().weeks(4, OUT2);
    h.answer([2, 2, 2, 1, 1, 1, 1, 1]); // heads-up
    h.week(OUT2);
    h.answer([2, 2, 2, 1, 1, 1, 1, 1]); // held
    h.do({ kind: "setOff", off: true }, h.weekEnd - DAY);
    h.tickTo(h.headsUps()[0].at + CONFIG.cooldownMs + HOUR);
    expect(h.headsUps()).toHaveLength(1);
  });

  it("turning off with nothing open sends no note, and status stops", () => {
    const h = new Harness();
    h.do({ kind: "setOff", off: true }, START + HOUR);
    h.do({ kind: "dayEnd", day: 0, hasData: true, keyboardUsed: true }, START + 23 * HOUR);
    expect(h.events).toHaveLength(0);
  });
});

describe("status", () => {
  it("sends one status a day with enough_data and keyboard_used", () => {
    const h = new Harness();
    for (let d = 0; d < 10; d++) {
      h.do({ kind: "dayEnd", day: d, hasData: d < 5 || d > 8, keyboardUsed: d !== 5 }, START + d * DAY + 23 * HOUR);
    }
    const st = h.of("status").map((x) => x.e as Extract<SteadyEvent, { type: "status" }>);
    expect(st).toHaveLength(10);
    expect(Object.keys(st[0])).toEqual(["type", "enough_data", "keyboard_used", "sent_at"]);
    expect(st[5].keyboard_used).toBe(false);
    expect(st[4].keyboard_used).toBe(true);
    // Only real days count: days 0-4 have data, 5-8 do not.
    expect(st[2].enough_data).toBe(false); // three days so far
    expect(st[3].enough_data).toBe(true);
    expect(st[7].enough_data).toBe(true); // days 1-7 hold days 1-4
    expect(st[8].enough_data).toBe(false); // days 2-8 hold days 2-4
  });

  it("typing on the Steady keyboard marks the day as used", () => {
    const h = new Harness();
    h.do({ kind: "typed", level: "none" }, START + 3 * HOUR);
    h.do({ kind: "dayEnd", day: 0, hasData: true, keyboardUsed: false }, START + 23 * HOUR);
    expect((h.of("status")[0].e as { keyboard_used: boolean }).keyboard_used).toBe(true);
  });
});

describe("parent phone", () => {
  const tr = new MemoryTransport();
  const send = (e: SteadyEvent, at: number) => tr.send(e, { at, from: "teen", to: ["Mom"] });

  it('shows "Not connected" after 26 hours without status, and the keyboard line', () => {
    tr.clear();
    send({ type: "status", enough_data: true, keyboard_used: false, sent_at: iso(START) }, START);
    expect(connection(tr.list(), START + HOUR)).toMatchObject({ state: "on", noKeyboard: true, lowData: false });
    expect(connection(tr.list(), START + 25 * HOUR).state).toBe("on");
    expect(connection(tr.list(), START + 27 * HOUR).state).toBe("not_connected");
    expect(connection([], START).state).toBe("waiting");
  });

  const urgent: Note = { id: "u1", at: START, event: { type: "urgent", sent_at: iso(START) }, bytes: 0, json: "" };

  it("an urgent note repeats every 5 minutes until a reply, and reaches the other adults after 15", () => {
    const v = urgentView(urgent, [], START + 16 * MINUTE, true);
    expect(v.repeats).toEqual([5, 10, 15].map((m) => START + m * MINUTE));
    expect(v.othersAt).toBe(START + 15 * MINUTE);
    const replied = urgentView(urgent, [{ noteId: "u1", choice: "with_her", at: START + 7 * MINUTE }], START + HOUR, true);
    expect(replied.repeats).toEqual([START + 5 * MINUTE]);
    expect(replied.othersAt).toBeNull();
  });

  it('"I can\'t reach her" sends it to the other adults at once', () => {
    const v = urgentView(urgent, [{ noteId: "u1", choice: "cant_reach", at: START + 2 * MINUTE }], START + 3 * MINUTE, true);
    expect(v.othersAt).toBe(START + 2 * MINUTE);
    expect(v.othersWhy).toBe("cant_reach");
  });

  it("with no other adult named, it keeps repeating on the parent's phone", () => {
    const v = urgentView(urgent, [], START + HOUR, false);
    expect(v.othersAt).toBeNull();
    expect(v.repeats).toHaveLength(12);
  });

  it('after "Booked a doctor" new heads-ups are listed quietly for six weeks; urgent notes still sound', () => {
    const h1: Note = { id: "h1", at: START, event: { type: "heads_up", sent_at: iso(START) }, bytes: 0, json: "" };
    const h2: Note = { id: "h2", at: START + 4 * WEEK, event: { type: "heads_up", sent_at: "" }, bytes: 0, json: "" };
    const h3: Note = { id: "h3", at: START + 7 * WEEK, event: { type: "heads_up", sent_at: "" }, bytes: 0, json: "" };
    const replies: Reply[] = [{ noteId: "h1", choice: "booked", at: START + DAY }];
    const all = [h1, h2, h3];
    expect(headsUpView(h2, all, replies, START + 5 * WEEK).quiet).toBe(true);
    expect(headsUpView(h3, all, replies, START + 8 * WEEK).quiet).toBe(false);
    const u = { ...urgent, at: START + 2 * WEEK };
    expect(urgentView(u, replies, u.at + 6 * MINUTE, true).repeats).toHaveLength(1);
  });

  it('"Not yet", or no reply, brings a reminder in two days', () => {
    const h1: Note = { id: "h1", at: START, event: { type: "heads_up", sent_at: "" }, bytes: 0, json: "" };
    expect(headsUpView(h1, [h1], [], START + HOUR).reminderAt).toBe(START + 2 * DAY);
    const r: Reply[] = [{ noteId: "h1", choice: "not_yet", at: START + HOUR }];
    expect(headsUpView(h1, [h1], r, START + 2 * HOUR).reminderAt).toBe(START + HOUR + 2 * DAY);
    const done: Reply[] = [{ noteId: "h1", choice: "talked", at: START + HOUR }];
    expect(headsUpView(h1, [h1], done, START + 2 * HOUR).reminderAt).toBeNull();
  });
});

describe("events and wording", () => {
  it("events are small JSON with the exact keys of the schema", () => {
    const e: HeadsUpEvent = { type: "heads_up", areas: ["sleep", "reaching_out"], weeks: 4, sent_at: "2026-11-14T21:30:00Z" };
    expect(JSON.stringify(e)).toBe('{"type":"heads_up","areas":["sleep","reaching_out"],"weeks":4,"sent_at":"2026-11-14T21:30:00Z"}');
    expect(eventBytes(e)).toBe(95);
    expect(iso(Date.UTC(2026, 10, 14, 21, 30))).toBe("2026-11-14T21:30:00Z");
  });

  it("the heads-up matches the doc, with names swapped in", () => {
    const t = headsUpText({ type: "heads_up", areas: ["sleep", "reaching_out"], weeks: 4, sent_at: "" }, DEMO_PEOPLE);
    expect(t.title).toBe("Worth checking in with Maya");
    expect(t.sections[0].text).toBe(
      "For the past 4 weeks, Maya has been sleeping less than usual and messaging people less often. Steady can't say why, and this is not a diagnosis.",
    );
    expect(t.sections[4]).toEqual({
      label: "If she says she isn't safe:",
      text: "call or text 988. If she has hurt herself or is in immediate danger, call 911.",
    });
    const plain = headsUpText({ type: "heads_up", sent_at: "" }, { ...DEMO_PEOPLE, teen: "Sam", teenPronoun: "he" });
    expect(plain.sections[0].text).toBe("Steady suggests you check in with Sam about how he has been feeling lately. This is not a diagnosis.");
  });

  it("the urgent note starts with the revised wording", () => {
    const u = urgentText(DEMO_PEOPLE);
    expect(u.sections[0].text).toBe(
      "Maya typed words that may be about suicide or self-harm. Steady can't tell how serious this is. Treat it as real until you have talked with her.",
    );
    expect(u.replies).toEqual(["I'm with her", "Called 988", "I can't reach her"]);
    expect(u.sections.map((s) => s.label)).toEqual([
      undefined,
      "Now:",
      "Tonight, whatever she says:",
      "If she says yes:",
      "If she says no or won't talk:",
      "If she has hurt herself or is in immediate danger:",
      "Tomorrow:",
    ]);
  });

  it("the setup screen names the linked parent", () => {
    const s = setupScreenText({ ...DEMO_PEOPLE, parent: "Dad", parentPronoun: "he", second: undefined });
    expect(s.title).toBe("Steady is linked to Dad's phone.");
    expect(s.paragraphs[1]).toContain("Steady sends Dad a short note asking him to check in with you.");
    expect(s.secondLine).toBeUndefined();
  });

  it("the teen's home screen never mentions a note", () => {
    const h = new Harness().learn().weeks(4, OUT2);
    h.answer([2, 2, 2, 1, 1, 1, 1, 1]);
    const { sentence, note } = homeSummary(h.s);
    expect(`${sentence} ${note}`.toLowerCase()).not.toMatch(/note|sent|mom|alert|score/);
  });
});
