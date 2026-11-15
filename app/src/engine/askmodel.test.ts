import { describe, expect, it } from "vitest";
import { ASK_MODEL_CASES, ASK_THRESHOLD, askInputs, askScore } from "./askmodel";
import { Harness, OUT2, W } from "./testkit";

describe("the ask model", () => {
  it("gives the same scores as the training script, case by case", () => {
    expect(ASK_MODEL_CASES.length).toBeGreaterThanOrEqual(20);
    for (const c of ASK_MODEL_CASES) expect(askScore(c.inputs)).toBeCloseTo(c.score, 5);
  });

  it("scores a high last answer above the threshold and a low one below it", () => {
    const base = { stress: 2, with_others: 4, stress_usual: 2, with_others_usual: 4 };
    expect(askScore({ ...base, last_phq2: 5, mean_phq2: 3 })).toBeGreaterThan(ASK_THRESHOLD);
    expect(askScore({ ...base, last_phq2: 0, mean_phq2: 0.5 })).toBeLessThan(ASK_THRESHOLD);
  });

  it("works with nothing but the setup answers", () => {
    const h = new Harness();
    const x = askInputs(h.s, 1);
    expect(x.last_phq2).toBe(1); // the first two setup answers
    expect(x.stress).toBeNull();
    expect(Number.isFinite(askScore(x))).toBe(true);
  });
});

describe("asking first", () => {
  const checkin = (h: Harness, stress = 2, withOthers = 4) => h.do({ kind: "checkin", stress, withOthers }, h.weekEnd - 1000);

  it("a check-in is kept for the week it was given in, clamped to 1 to 5", () => {
    const h = new Harness();
    h.do({ kind: "checkin", stress: 9, withOthers: 0 }, h.weekEnd - 1000);
    expect(h.s.checkins).toEqual({ 1: { stress: 5, withOthers: 1 } });
  });

  it("while she checks in, phone signals outside the range do not ask", () => {
    const h = new Harness();
    for (let i = 0; i < 4; i++) { checkin(h); h.week(W()); }
    h.answer([0, 1]); // the monthly ask at week 4
    for (let i = 0; i < 3; i++) { checkin(h, 4, 2); h.week(OUT2); }
    expect(h.s.episode).not.toBeNull(); // still shown as outside her usual
    expect(h.s.ask).toBeNull();
    expect(h.s.asks.filter((a) => a.kind === "check").map((a) => a.week)).toEqual([4]);
  });

  it("when she stops checking in, phone signals decide again", () => {
    const h = new Harness();
    for (let i = 0; i < 4; i++) { checkin(h); h.week(W()); }
    h.answer([0, 1]);
    h.weeks(2, OUT2); // no check-ins for two weeks
    expect(h.s.ask?.reason).toBe("signals");
  });

  it("after a high answer the model asks again two weeks later, not a month later", () => {
    const h = new Harness();
    for (let i = 0; i < 4; i++) { checkin(h); h.week(W()); }
    h.answer([3, 2, 0, 0, 0, 0, 0, 0]); // high on the two, under 10 on the eight
    expect(h.headsUps()).toHaveLength(0);
    checkin(h); h.week(W());
    expect(h.s.ask).toBeNull(); // one week later: too soon
    checkin(h); h.week(W());
    expect(h.s.ask?.reason).toBe("model");
    expect(h.s.weeks.at(-1)!.askScore).toBeGreaterThan(ASK_THRESHOLD);
  });

  it("the model never sends a note by itself", () => {
    const h = new Harness();
    for (let i = 0; i < 4; i++) { checkin(h, 5, 1); h.week(W()); }
    h.answer([3, 3, 0, 0, 0, 0, 0, 0]);
    for (let i = 0; i < 6; i++) { checkin(h, 5, 1); h.week(W()); }
    expect(h.headsUps()).toHaveLength(0);
  });
});
