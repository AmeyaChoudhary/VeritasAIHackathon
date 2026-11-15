// Writes the expected tone scores and self-harm results that the Kotlin ports are tested
// against. It runs the web app's own code, unchanged: app/src/engine/tone.ts and
// app/src/engine/selfharm.ts. Needs Node 23.6 or newer (it runs .ts files directly).
//
//   node native/android/tools/make_parity_fixtures.mjs
//
// Output: native/android/app/src/test/resources/parity_expected.jsonl

import { registerHooks } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// selfharm.ts imports its JSON the Vite way, with no import attribute. Node needs one.
registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    if (result.url.endsWith(".json")) return { ...result, importAttributes: { type: "json" } };
    return result;
  },
});

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const modelPath = resolve(repo, "app/public/models/tone.json");

// loadToneModel() fetches its file. Serve it from disk.
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => JSON.parse(readFileSync(modelPath, "utf8")) });

const tone = await import(pathToFileURL(resolve(repo, "app/src/engine/tone.ts")).href);
const selfharm = await import(pathToFileURL(resolve(repo, "app/src/engine/selfharm.ts")).href);
const model = await tone.loadToneModel("tone.json");

// A small CSV reader: commas, double quotes, doubled quotes inside quotes.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.length > 1 || r[0] !== "");
}

const csv = parseCsv(readFileSync(resolve(repo, "experiments/exp2_words/test_messages.csv"), "utf8"));
const head = csv[0];
const iId = head.indexOf("id");
const iText = head.indexOf("text");
const cases = csv.slice(1).map((r) => ({ id: r[iId], text: r[iText] }));

// Extra cases for the tokenizer and the rules: case, curly apostrophes, repeated letters,
// digits, non-ASCII letters, empty text, negations, a bigram that repeats.
const extra = [
  "",
  "   ",
  "I'm SO sad today",
  "I\u2019m so saaaad today, honestly",
  "noooo way, that's sooooo cool",
  "i feel empty and alone and alone",
  "Café later? \u{1F600}",
  "it's 3am and i can't sleep again",
  "my grandma passed away last night",
  "i miss her so much it hurts",
  "lol we lost 0-3, so disappointed",
  "i'm sorry, i really messed up",
  "best day ever!!! we won!!!",
  "I would NEVER kill myself, chill",
  "doing a suicide prevention walk saturday",
  "sometimes i think about killing myself",
  "i just took all my pills",
  "goodbye everyone, thank you for everything",
  "dont wanna be here anymore",
  "kms this homework is so long",
  "Tab\there and a\nnew line",
  "ok",
];
extra.forEach((text, i) => cases.push({ id: `e${String(i + 1).padStart(2, "0")}`, text }));

const lines = cases.map(({ id, text }) => {
  const sh = selfharm.checkSelfHarm(text);
  return JSON.stringify({
    id,
    text,
    score: tone.scoreTone(model, text),
    low: tone.isLowMood(model, text),
    level: sh.level,
    rule: sh.ruleId ?? null,
  });
});
const out = resolve(here, "../app/src/test/resources/parity_expected.jsonl");
writeFileSync(out, lines.join("\n") + "\n");
console.log(`${lines.length} cases written to ${out}`);
