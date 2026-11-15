// Tone model for Stability (Experiment 2, part A).
//
// Reads low mood in a short message: TF-IDF over word unigrams and bigrams,
// then logistic regression. Trained on GoEmotions (Google, Apache-2.0), where
// "low mood" means any of sadness, grief, disappointment or remorse.
// Trained and exported by experiments/exp2_words.py; the weights live in
// public/models/tone.json. Runs fully in the browser with no network calls
// beyond loading that file. No imports, so it also runs under Node for the
// parity test.
//
// The score ranks messages well but is not a calibrated chance, and its scale
// depends on how the model was trained. Use isLowMood(), which applies the
// threshold chosen on the validation split and stored in the model file.

export interface ToneModel {
  version: number;
  threshold: number;
  intercept: number;
  sublinearTf: boolean;
  index: Map<string, number>;
  idf: Float64Array;
  coef: Float64Array;
}

export interface ToneModelJson {
  version: number;
  threshold: number;
  intercept: number;
  tf: "raw" | "sublinear";
  norm: "l2";
  vocab: string[];
  idf: number[];
  coef: number[];
}

function defaultUrl(): string {
  let base = "/";
  const env = (import.meta as unknown as { env?: { BASE_URL?: string } }).env;
  if (env && typeof env.BASE_URL === "string") base = env.BASE_URL;
  return `${base}models/tone.json`;
}

export async function loadToneModel(url?: string): Promise<ToneModel> {
  const res = await fetch(url ?? defaultUrl());
  if (!res.ok) throw new Error(`Could not load tone model (HTTP ${res.status})`);
  return toneModelFromJson((await res.json()) as ToneModelJson);
}

/** Builds a model from the file's JSON. The self-harm model (risk.json) uses the same format. */
export function toneModelFromJson(j: ToneModelJson): ToneModel {
  const n = j.vocab.length;
  if (j.idf.length !== n || j.coef.length !== n) throw new Error("Tone model file is malformed");
  const index = new Map<string, number>();
  for (let i = 0; i < n; i++) index.set(j.vocab[i], i);
  return {
    version: j.version,
    threshold: j.threshold,
    intercept: j.intercept,
    sublinearTf: j.tf === "sublinear",
    index,
    idf: Float64Array.from(j.idf),
    coef: Float64Array.from(j.coef),
  };
}

// Tokenizer, step by step (must match tokens() in exp2_words.py):
// 1) lowercase A-Z only, 2) delete apostrophes, 3) squash any letter repeated
// 3+ times to 2 ("sooo" -> "soo"), 4) tokens are runs of a-z and 0-9,
// 5) features are the tokens plus each adjacent pair joined by one space.
function analyze(text: string): string[] {
  const s = text
    .replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32))
    .replace(/['‘’`ʼ]/g, "")
    .replace(/([a-z])\1{2,}/g, "$1$1");
  const toks = s.match(/[a-z0-9]+/g) ?? [];
  const feats = toks.slice();
  for (let i = 0; i + 1 < toks.length; i++) feats.push(`${toks[i]} ${toks[i + 1]}`);
  return feats;
}

export function scoreTone(model: ToneModel, text: string): number {
  const counts = new Map<number, number>();
  for (const f of analyze(typeof text === "string" ? text : "")) {
    const j = model.index.get(f);
    if (j !== undefined) counts.set(j, (counts.get(j) ?? 0) + 1);
  }
  let sq = 0;
  let dot = 0;
  for (const [j, c] of counts) {
    const tf = model.sublinearTf ? 1 + Math.log(c) : c;
    const v = tf * model.idf[j];
    sq += v * v;
    dot += v * model.coef[j];
  }
  const z = model.intercept + (sq > 0 ? dot / Math.sqrt(sq) : 0);
  return 1 / (1 + Math.exp(-z));
}

export function isLowMood(model: ToneModel, text: string): boolean {
  return scoreTone(model, text) >= model.threshold;
}
