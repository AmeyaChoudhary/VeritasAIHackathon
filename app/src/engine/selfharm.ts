// Self-harm phrase check for Steady (Experiment 2, part B).
//
// This is NOT the tone model and it is NOT validated. It is a short phrase list
// (selfharm_phrases.json) written for the demo without clinical review.
// "plan"    = words that state a plan or intent to end one's life, or say the
//             writer has just hurt themselves or taken something. The app sends
//             an urgent note at once.
// "concern" = other self-harm language. The app first asks "Are you safe right now?".
// The result never contains the matched text, only the level and the rule id.
//
// The same JSON is loaded by experiments/exp2_words.py, which applies the same
// normalization with Python's re module and checks that both give the same answers.

import phrases from "./selfharm_phrases.json";
import { scoreTone, type ToneModel } from "./tone";

// Experiment 5: a model for self-harm language (public/models/risk.json), in the tone model's
// format. It runs only when the phrase list finds nothing, and it can only add a "check",
// never a "plan". It passed the rule written before the experiment ran; see
// results/exp5/results.md. It is not clinically validated.
let RISK: ToneModel | null = null;
export function setRiskModel(m: ToneModel | null): void {
  RISK = m;
}

// "check"   = only the model (Experiment 5) read self-harm language. The app asks "Are you safe
//             right now?" with 988, but no answer sends nothing: on posts labelled by
//             psychiatrists (Experiment 5b) it could not tell a person at risk from a person
//             supporting someone else. "No" still sends the urgent note.
export type SelfHarmLevel = "none" | "check" | "concern" | "plan";

interface PhraseRule {
  id: string;
  pattern: string;
}

interface PhraseFile {
  version: number;
  plan: PhraseRule[];
  concern: PhraseRule[];
  negations: PhraseRule[];
}

interface CompiledRule {
  id: string;
  re: RegExp;
}

const PHRASES = phrases as unknown as PhraseFile;

// Each pattern is compiled once. Patterns only use word boundaries, literal
// spaces, alternation, optional groups and "+", so JavaScript and Python agree.
const compile = (rules: PhraseRule[], flags: string): CompiledRule[] =>
  rules.map((r) => ({ id: r.id, re: new RegExp(r.pattern, flags) }));

const PLAN = compile(PHRASES.plan, "i");
const CONCERN = compile(PHRASES.concern, "i");
const NEGATIONS = compile(PHRASES.negations, "gi");

// Normalization, step by step (must match normalize() in exp2_words.py):
// 1) lowercase A-Z only, 2) delete apostrophes, 3) every run of characters
// outside a-z and 0-9 becomes one space, 4) trim.
function normalize(text: string): string {
  return text
    .replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32))
    .replace(/['‘’`ʼ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function checkSelfHarm(text: string): { level: SelfHarmLevel; ruleId?: string } {
  if (typeof text !== "string" || text.length === 0) return { level: "none" };
  let s = normalize(text);
  // Negations ("i would never kill myself", "suicide prevention week") are blanked
  // out first, so the rest of the message is still checked.
  for (const n of NEGATIONS) {
    n.re.lastIndex = 0;
    s = s.replace(n.re, " . ");
  }
  for (const r of PLAN) {
    if (r.re.test(s)) return { level: "plan", ruleId: r.id };
  }
  for (const r of CONCERN) {
    if (r.re.test(s)) return { level: "concern", ruleId: r.id };
  }
  if (RISK && scoreTone(RISK, text) >= RISK.threshold) return { level: "check", ruleId: "model" };
  return { level: "none" };
}
