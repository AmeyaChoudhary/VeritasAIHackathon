import { afterEach, describe, expect, it } from "vitest";
import { scoreTone, toneModelFromJson, type ToneModelJson } from "./tone";
import { checkSelfHarm, setRiskModel } from "./selfharm";
import riskJson from "../../public/models/risk.json";
import { Harness, START } from "./testkit";
import { DAY, HOUR, MINUTE } from "./config";

type RiskFile = ToneModelJson & { cases: { text: string; score: number }[] };
const file = riskJson as unknown as RiskFile;
const model = toneModelFromJson(file);

describe("the self-harm model (Experiment 5)", () => {
  afterEach(() => setRiskModel(null));

  it("gives the same scores as the training script, message by message", () => {
    expect(file.cases.length).toBeGreaterThanOrEqual(20);
    for (const c of file.cases) expect(scoreTone(model, c.text)).toBeCloseTo(c.score, 4);
  });

  it("can only add a check, never a concern or plan, and only when the phrase list finds nothing", () => {
    setRiskModel(model);
    const flagged = file.cases.filter((c) => c.score >= file.threshold);
    for (const c of flagged) expect(["check", "concern", "plan"]).toContain(checkSelfHarm(c.text).level);
    for (const c of file.cases) {
      const r = checkSelfHarm(c.text);
      if (r.ruleId === "model") expect(r.level).toBe("check");
    }
  });

  it("without the model file, the phrase list alone decides", () => {
    setRiskModel(null);
    expect(checkSelfHarm("omw, save me a seat at lunch").level).toBe("none");
    for (const c of file.cases) expect(checkSelfHarm(c.text).ruleId).not.toBe("model");
  });});

describe("a flag from the model alone (level check)", () => {
  const typed = (h: Harness, t: number) => h.do({ kind: "typed", level: "check", via: "keyboard" }, t);
  const T = START + 2 * DAY;

  it("asks the teen, and no answer sends nothing", () => {
    const h = new Harness().learn();
    typed(h, T);
    expect(h.s.safety.screen).toBe("ask");
    expect(h.s.safety.deadline).toBeNull();
    h.tickTo(T + 6 * HOUR);
    expect(h.of("urgent")).toHaveLength(0);
  });

  it('"No" still sends the urgent note at once', () => {
    const h = new Harness().learn();
    typed(h, T);
    h.do({ kind: "safe", answer: "no" }, T + 5 * MINUTE);
    expect(h.of("urgent")).toHaveLength(1);
  });

  it("does not count toward the second-flag rule", () => {
    const h = new Harness().learn();
    typed(h, T);
    h.do({ kind: "safe", answer: "yes" }, T + MINUTE);
    typed(h, T + DAY);
    h.do({ kind: "safe", answer: "yes" }, T + DAY + MINUTE);
    expect(h.of("urgent")).toHaveLength(0);
    expect(h.headsUps()).toHaveLength(0);
  });

  it("a phrase-list concern still runs its 30-minute wait", () => {
    const h = new Harness().learn();
    h.do({ kind: "typed", level: "concern", via: "keyboard" }, T);
    h.tickTo(T + HOUR);
    expect(h.of("urgent")).toHaveLength(1);
  });
});
