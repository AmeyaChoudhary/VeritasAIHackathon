// The ask model (Experiment 4): decides when to show the two screening questions.
//
// A logistic regression on six numbers the phone already has: this week's two-tap
// check-in, the student's usual check-in answers, their most recent PHQ-2 score and
// their average PHQ-2 score. Trained and exported by experiments/exp4_ask_model.py;
// the weights live in ask_model.json. It never sends a parent anything: a heads-up
// still rests on the questionnaire score (see rules.ts).
//
// On students it never saw it scored an AUC of 0.89, with earlier answers at least two
// weeks old, as they are here. Most of that comes from those earlier answers, so it
// finds who to ask again sooner. It does not pick the week.

import model from "./ask_model.json";
import type { TeenState } from "./types";

export type AskInputName = "stress" | "with_others" | "stress_usual" | "with_others_usual" | "last_phq2" | "mean_phq2";
export type AskInputs = Record<AskInputName, number | null>;

const NAMES = model.inputs.map((i) => i.name) as AskInputName[];
const num = (o: unknown, k: string): number => (o as Record<string, number>)[k];

export const ASK_THRESHOLD: number = model.threshold;
export const ASK_MODEL_CASES = model.cases as { inputs: AskInputs; score: number }[];

/** The model's score, 0 to 1. A missing input counts as the average and adds its own small weight. */
export function askScore(x: AskInputs): number {
  let z = model.intercept;
  for (const k of NAMES) {
    const v = x[k];
    if (v == null || !Number.isFinite(v)) z += num(model.missing, k);
    else z += (num(model.weights, k) * (v - num(model.mean, k))) / num(model.scale, k);
  }
  return 1 / (1 + Math.exp(-z));
}

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** The six inputs at the end of `week`, from what the phone holds. */
export function askInputs(s: TeenState, week: number): AskInputs {
  const checkins = s.checkins ?? {};
  const now = checkins[week];
  const earlier = Object.keys(checkins)
    .map(Number)
    .filter((w) => w < week)
    .map((w) => checkins[w]);
  const phq = (s.phq2s ?? []).filter((p) => p.week <= week);
  return {
    stress: now ? now.stress : null,
    with_others: now ? now.withOthers : null,
    stress_usual: mean(earlier.map((c) => c.stress)),
    with_others_usual: mean(earlier.map((c) => c.withOthers)),
    last_phq2: phq.length ? phq[phq.length - 1].score : null,
    mean_phq2: mean(phq.map((p) => p.score)),
  };
}

/** True when the teen has checked in during the last `weeks` weeks ending at `week`. */
export function checkedInLately(s: TeenState, week: number, weeks: number): boolean {
  const checkins = s.checkins ?? {};
  for (let w = week; w > week - weeks && w >= 1; w--) if (checkins[w]) return true;
  return false;
}
