"""Experiment 2 for Steady: words.

Part A. A tone model that reads low mood in short messages and runs in the browser.
  TF-IDF over word unigrams and bigrams (our own tokenizer, copied exactly in
  app/src/engine/tone.ts) and logistic regression with class_weight="balanced",
  trained on GoEmotions. Low mood = any of sadness, grief, disappointment, remorse.
  A second recipe (added 2026-11-15) trains on soft labels: for every comment outside
  validation and test, the share of its raters who marked a low-mood emotion, taken
  from GoEmotions' rater-level file. Both recipes are scored on validation and the
  better one is shipped; the other is kept in the results as a comparison row.
  Vocabulary size, tf scaling, C and the decision threshold are chosen on the
  validation split only. Results are reported on the test split, next to two
  baselines: always "not low mood", and a fixed keyword list.
  The model is exported to app/public/models/tone.json, and tone.ts is run under
  Node to check that it gives the same probabilities as sklearn.
Part B. The self-harm phrase check (app/src/engine/selfharm_phrases.json). It is a
  short list and it is NOT validated. Python applies the same JSON with re, and the
  answers are compared with app/src/engine/selfharm.ts under Node.
Part C. 60 messages we wrote (experiments/exp2_words/test_messages.csv), scored by
  slice: tone flags, self-harm false flags and misses.

Data: data/goemotions/{train,validation,test}.parquet, the "simplified" config of
https://huggingface.co/datasets/google-research-datasets/go_emotions (Apache-2.0), and
data/goemotions_raw/raw.parquet, the "raw" config of the same dataset (one row per
rater). scripts/get_data.sh downloads both.

Usage: .venv/bin/python experiments/exp2_words.py
Writes: app/public/models/tone.json, app/public/data/exp2_summary.json,
        results/exp2/results.json, results/exp2/results.md
"""
import csv
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import warnings
from collections import Counter
from pathlib import Path

warnings.filterwarnings("ignore")
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "goemotions"
MSG_CSV = ROOT / "experiments" / "exp2_words" / "test_messages.csv"
TONE_TS = ROOT / "app" / "src" / "engine" / "tone.ts"
SH_TS = ROOT / "app" / "src" / "engine" / "selfharm.ts"
SH_JSON = ROOT / "app" / "src" / "engine" / "selfharm_phrases.json"
TONE_JSON = ROOT / "app" / "public" / "models" / "tone.json"
SUMMARY_JSON = ROOT / "app" / "public" / "data" / "exp2_summary.json"
RES_DIR = ROOT / "results" / "exp2"
GENERATED = "2026-11-14"

# The 28 labels of the "simplified" config, in id order, as listed in the dataset card
# (https://huggingface.co/datasets/google-research-datasets/go_emotions/resolve/main/README.md).
LABEL_NAMES = [
    "admiration", "amusement", "anger", "annoyance", "approval", "caring", "confusion",
    "curiosity", "desire", "disappointment", "disapproval", "disgust", "embarrassment",
    "excitement", "fear", "gratitude", "grief", "joy", "love", "nervousness", "optimism",
    "pride", "realization", "relief", "remorse", "sadness", "surprise", "neutral",
]
LOW_MOOD = ["sadness", "grief", "disappointment", "remorse"]
LOW_MOOD_IDS = sorted(LABEL_NAMES.index(n) for n in LOW_MOOD)  # [9, 16, 24, 25]

# Keyword baseline, fixed before any test result was seen. A message is flagged when
# any of these appears as whole words after the same tokenizer as the model.
KEYWORDS = [
    "sad", "sadder", "saddest", "sadness", "depressed", "depressing", "depression",
    "miss", "missed", "missing", "cry", "crying", "cried", "cries", "tears", "lonely",
    "alone", "hate myself", "heartbroken", "hurt", "hurts", "upset", "unhappy",
    "miserable", "hopeless", "worthless", "disappointed", "disappointing", "regret",
    "grief", "grieving", "empty",
]

# Search space, all scored on validation only.
VOCAB_SIZES = [10000, 15000, 20000]
TF_MODES = ["raw", "sublinear"]
C_GRID = [0.25, 0.5, 1.0, 2.0, 4.0, 8.0]
# Second recipe: soft labels from the rater-level file, no class weights. The vocabulary is
# every term in at least SOFT_MIN_DF training comments; a cut of 3 gives a file at the 1 MB cap.
RAW = ROOT / "data" / "goemotions_raw" / "raw.parquet"
SOFT_MIN_DF = [5, 4]
SOFT_C_GRID = [1.0, 2.0, 4.0, 8.0]
RECIPE_LABEL = {"hard": "hard labels, balanced class weights", "soft": "soft labels from every rater"}
THRESHOLDS = np.round(np.arange(0.05, 0.9501, 0.005), 4)
MAX_JSON_BYTES = 1_000_000
SLICES = ["everyday", "low_mood", "lyric_style", "dark_joke", "sarcasm", "risk_concern", "risk_plan"]
FALSE_FLAG_SLICES = ["lyric_style", "dark_joke", "sarcasm"]
RISK_SLICES = ["risk_concern", "risk_plan"]

# ---------------------------------------------------------------- tokenizer (Part A)
# Must match analyze() in app/src/engine/tone.ts exactly.
_UPPER = re.compile(r"[A-Z]")
_APOS = re.compile("['‘’`ʼ]")
_REPEAT = re.compile(r"([a-z])\1{2,}")
_TOKEN = re.compile(r"[a-z0-9]+")
TOKENIZER_DESCRIPTION = (
    "1) lowercase A-Z only; 2) delete apostrophes (U+0027, U+2018, U+2019, U+0060, U+02BC); "
    "3) squash any letter a-z repeated 3 or more times to 2 (regex ([a-z])\\1{2,} -> $1$1); "
    "4) tokens = runs of [a-z0-9]; 5) features = tokens plus each adjacent pair of tokens "
    "joined by one space. TF-IDF uses the vocab below, idf as given, tf as given, then L2 "
    "normalization over the vocab features present; score = sigmoid(intercept + coef . x)."
)


def _lower_ascii(s):
    return _UPPER.sub(lambda m: chr(ord(m.group(0)) + 32), s)


def tokens(text):
    s = _REPEAT.sub(r"\1\1", _APOS.sub("", _lower_ascii(text)))
    return _TOKEN.findall(s)


def analyzer(text):
    t = tokens(text)
    return t + [f"{a} {b}" for a, b in zip(t, t[1:])]


def keyword_flag(text):
    padded = " " + " ".join(tokens(text)) + " "
    return int(any(f" {k} " in padded for k in KEYWORDS))


# ---------------------------------------------------------------- self-harm check (Part B)
# Must match normalize() and checkSelfHarm() in app/src/engine/selfharm.ts exactly.
_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def sh_normalize(text):
    return _NON_ALNUM.sub(" ", _APOS.sub("", _lower_ascii(text))).strip()


def load_selfharm_rules(path=SH_JSON):
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    comp = lambda rules: [(r["id"], re.compile(r["pattern"], re.IGNORECASE)) for r in rules]
    return {"version": raw["version"], "plan": comp(raw["plan"]),
            "concern": comp(raw["concern"]), "negations": comp(raw["negations"])}


def check_selfharm(text, rules):
    s = sh_normalize(text)
    for _, rx in rules["negations"]:
        s = rx.sub(" . ", s)
    for rid, rx in rules["plan"]:
        if rx.search(s):
            return {"level": "plan", "ruleId": rid}
    for rid, rx in rules["concern"]:
        if rx.search(s):
            return {"level": "concern", "ruleId": rid}
    return {"level": "none"}


# ---------------------------------------------------------------- soft labels (Part A)
def load_soft_pool(held_ids):
    """Every GoEmotions comment outside validation and test, with a soft label: the share
    of its raters who marked any low-mood emotion. The "simplified" labels keep an emotion
    only when two raters agree, so they turn a 1-in-3 vote into a plain "no". The rater
    file also holds the comments that "simplified" dropped for having no agreed label.
    Only the text, id and the four emotion columns are read."""
    if not RAW.exists():
        raise SystemExit(f"{RAW} is missing. Run scripts/get_data.sh first.")
    raw = pd.read_parquet(RAW, columns=["text", "id"] + LOW_MOOD)
    raw["low"] = (raw[LOW_MOOD].sum(axis=1) > 0).astype(float)
    g = raw.groupby("id", sort=True).agg(text=("text", "first"), q=("low", "mean"), raters=("low", "size")).reset_index()
    g = g[~g["id"].isin(held_ids)].reset_index(drop=True)
    assert not (set(g["id"]) & set(held_ids)), "a validation or test comment is in the soft-label pool"
    g["text"] = g["text"].astype(str)
    return g


# ---------------------------------------------------------------- metrics
def confusion(y, p):
    y = np.asarray(y).astype(int); p = np.asarray(p).astype(int)
    tp = int(((y == 1) & (p == 1)).sum()); fp = int(((y == 0) & (p == 1)).sum())
    fn = int(((y == 1) & (p == 0)).sum()); tn = int(((y == 0) & (p == 0)).sum())
    prec = tp / (tp + fp) if tp + fp else None
    rec = tp / (tp + fn) if tp + fn else None
    f1 = (2 * prec * rec / (prec + rec)) if prec and rec else 0.0
    return {"n": int(len(y)), "positives": tp + fn, "flagged": tp + fp, "tp": tp, "fp": fp,
            "fn": fn, "tn": tn, "precision": prec, "recall": rec, "f1": f1,
            "missed": fn, "false_alarms": fp}


def bootstrap_ci(y, p, reps=2000, seed=0):
    rng = np.random.default_rng(seed)
    y = np.asarray(y); p = np.asarray(p); n = len(y)
    precs, recs = [], []
    for _ in range(reps):
        i = rng.integers(0, n, n)
        yy, pp = y[i], p[i]
        tp = ((yy == 1) & (pp == 1)).sum()
        if pp.sum():
            precs.append(tp / pp.sum())
        if yy.sum():
            recs.append(tp / yy.sum())
    q = lambda a: [round(float(np.percentile(a, 2.5)), 4), round(float(np.percentile(a, 97.5)), 4)] if a else None
    return {"precision_95ci": q(precs), "recall_95ci": q(recs)}


def best_threshold(y, prob):
    best = None
    for t in THRESHOLDS:
        m = confusion(y, prob >= t)
        if best is None or m["f1"] > best[1]["f1"]:
            best = (float(t), m)
    return best


def r4(x):
    return None if x is None else round(float(x), 4)


# ---------------------------------------------------------------- Node runner
NODE_HARNESS = r"""
import fs from "node:fs";
import { pathToFileURL } from "node:url";
const [toneTs, toneJson, shTs, inPath, outPath] = process.argv.slice(2);
const input = JSON.parse(fs.readFileSync(inPath, "utf8"));
const seen = [];
globalThis.fetch = async (url) => {
  seen.push(String(url));
  const body = fs.readFileSync(toneJson, "utf8");
  return { ok: true, status: 200, json: async () => JSON.parse(body) };
};
const tone = await import(pathToFileURL(toneTs).href);
const model = await tone.loadToneModel(toneJson);
await tone.loadToneModel();  // records the default URL outside Vite
const sh = await import(pathToFileURL(shTs).href);
const out = {
  tone: input.tone_texts.map((t) => tone.scoreTone(model, t)),
  low: input.tone_texts.map((t) => tone.isLowMood(model, t)),
  selfharm: input.sh_texts.map((t) => sh.checkSelfHarm(t)),
  urls: seen,
  node: process.version,
};
fs.writeFileSync(outPath, JSON.stringify(out));
"""


def find_node():
    node = shutil.which("node")
    if node is None and Path("/opt/homebrew/bin/node").exists():
        node = "/opt/homebrew/bin/node"
    return node


def run_node(tone_texts, sh_texts):
    """Run tone.ts and selfharm.ts under Node. selfharm.ts imports its JSON the Vite way,
    which plain Node rejects, so a temporary copy gets the JSON inlined in place of that
    one import line. Nothing else in the file changes."""
    node = find_node()
    if node is None:
        print("WARNING: node not found, skipping the TypeScript parity checks")
        return None
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        src = SH_TS.read_text(encoding="utf-8")
        line = 'import phrases from "./selfharm_phrases.json";'
        assert src.count(line) == 1, "selfharm.ts must contain the JSON import line exactly once"
        (td / "selfharm.ts").write_text(
            src.replace(line, "const phrases = " + SH_JSON.read_text(encoding="utf-8").strip() + ";"),
            encoding="utf-8")
        (td / "harness.mjs").write_text(NODE_HARNESS, encoding="utf-8")
        (td / "in.json").write_text(json.dumps({"tone_texts": tone_texts, "sh_texts": sh_texts}), encoding="utf-8")
        cmd = [node, str(td / "harness.mjs"), str(TONE_TS), str(TONE_JSON), str(td / "selfharm.ts"),
               str(td / "in.json"), str(td / "out.json")]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            print(r.stderr)
            raise SystemExit("Node harness failed")
        return json.loads((td / "out.json").read_text(encoding="utf-8"))


# ---------------------------------------------------------------- main
def main():
    t0 = time.time()
    RES_DIR.mkdir(parents=True, exist_ok=True)
    TONE_JSON.parent.mkdir(parents=True, exist_ok=True)
    SUMMARY_JSON.parent.mkdir(parents=True, exist_ok=True)

    # ---- data
    splits = {s: pd.read_parquet(DATA / f"{s}.parquet") for s in ["train", "validation", "test"]}
    for s, d in splits.items():
        d["text"] = d["text"].astype(str)
        d["y"] = d["labels"].apply(lambda ls: int(any(int(l) in LOW_MOOD_IDS for l in ls)))
    tr, va, te = splits["train"], splits["validation"], splits["test"]
    per_label = {n: int(tr["labels"].apply(lambda ls, i=LABEL_NAMES.index(n): i in ls).sum()) for n in LOW_MOOD}
    data_info = {s: {"n": int(len(d)), "low_mood": int(d["y"].sum()), "share": r4(d["y"].mean())}
                 for s, d in splits.items()}
    data_info["train_label_counts"] = per_label
    print("data:", {s: data_info[s] for s in splits})

    # ---- soft-label pool: train comments plus the ones "simplified" dropped; never validation or test
    soft = load_soft_pool(set(va["id"]) | set(te["id"]))
    data_info["soft_pool"] = {"n": int(len(soft)), "in_simplified_train": int(soft["id"].isin(set(tr["id"])).sum()),
                              "extra_comments": int((~soft["id"].isin(set(tr["id"]))).sum()),
                              "mean_soft_label": r4(soft["q"].mean()), "share_with_any_low_mood_vote": r4((soft["q"] > 0).mean()),
                              "mean_raters_per_comment": r4(soft["raters"].mean())}
    print("soft pool:", data_info["soft_pool"])

    # ---- Part A: search on validation
    grid = []
    fitted = {}
    for V in VOCAB_SIZES:
        for tf in TF_MODES:
            vec = TfidfVectorizer(analyzer=analyzer, max_features=V, sublinear_tf=(tf == "sublinear"),
                                  norm="l2", smooth_idf=True, dtype=np.float64)
            Xtr = vec.fit_transform(tr["text"]); Xva = vec.transform(va["text"])
            for C in C_GRID:
                lr = LogisticRegression(C=C, class_weight="balanced", max_iter=5000)
                lr.fit(Xtr, tr["y"])
                pva = lr.predict_proba(Xva)[:, 1]
                ap = average_precision_score(va["y"], pva)
                t_best, m_best = best_threshold(va["y"].values, pva)
                grid.append({"recipe": "hard", "vocab": V, "tf": tf, "C": C, "val_ap": r4(ap), "val_best_f1": r4(m_best["f1"]),
                             "val_best_threshold": t_best})
                fitted[("hard", V, tf, C)] = (vec, lr)
                print(f"  hard  vocab {V:5d} tf {tf:9s} C {C:5.2f}  val AP {ap:.4f}  best F1 {m_best['f1']:.4f} at {t_best}")
    # second recipe: each pool comment appears twice, as a positive weighted by its soft label q
    # and as a negative weighted by 1 - q, which is logistic regression on the soft label itself
    n_soft = len(soft); q = soft["q"].values
    rows2 = np.r_[np.arange(n_soft), np.arange(n_soft)]
    y2 = np.r_[np.ones(n_soft), np.zeros(n_soft)].astype(int); w2 = np.r_[q, 1 - q]
    keep2 = w2 > 0
    rows2, y2, w2 = rows2[keep2], y2[keep2], w2[keep2]
    for min_df in SOFT_MIN_DF:
        for tf in TF_MODES:
            vec = TfidfVectorizer(analyzer=analyzer, min_df=min_df, sublinear_tf=(tf == "sublinear"),
                                  norm="l2", smooth_idf=True, dtype=np.float64)
            Xs = vec.fit_transform(soft["text"])[rows2]; Xva = vec.transform(va["text"])
            V = len(vec.vocabulary_)
            for C in SOFT_C_GRID:
                lr = LogisticRegression(C=C, max_iter=5000)
                lr.fit(Xs, y2, sample_weight=w2)
                pva = lr.predict_proba(Xva)[:, 1]
                ap = average_precision_score(va["y"], pva)
                t_best, m_best = best_threshold(va["y"].values, pva)
                grid.append({"recipe": "soft", "vocab": V, "min_df": min_df, "tf": tf, "C": C, "val_ap": r4(ap),
                             "val_best_f1": r4(m_best["f1"]), "val_best_threshold": t_best})
                fitted[("soft", V, tf, C)] = (vec, lr)
                print(f"  soft  vocab {V:5d} tf {tf:9s} C {C:5.2f}  val AP {ap:.4f}  best F1 {m_best['f1']:.4f} at {t_best}")
    # pick the best validation AP; ties go to the smaller vocabulary, then smaller C
    rank = lambda g: (g["val_ap"], -g["vocab"], -g["C"])
    best = max(grid, key=rank)
    prev = max([g for g in grid if g["recipe"] == "hard"], key=rank)  # the recipe shipped before 2026-11-15
    vec, lr = fitted[(best["recipe"], best["vocab"], best["tf"], best["C"])]
    vec_prev, lr_prev = fitted[(prev["recipe"], prev["vocab"], prev["tf"], prev["C"])]
    # the comparison model keeps its own validation threshold; scored before any rounding below
    p_va_prev = lr_prev.predict_proba(vec_prev.transform(va["text"]))[:, 1]
    th_prev, _ = best_threshold(va["y"].values, p_va_prev)
    prev_proba = lambda texts: lr_prev.predict_proba(vec_prev.transform(list(texts)))[:, 1]
    print("chosen:", best)
    print("best of the hard-label recipe:", prev)

    # ---- round the weights; the rounded model is the one we ship and evaluate
    raw_idf = vec.idf_.copy(); raw_coef = lr.coef_.copy(); raw_int = lr.intercept_.copy()
    Xte_raw = vec.transform(te["text"]); p_te_unrounded = lr.predict_proba(Xte_raw)[:, 1]
    vocab_items = sorted(vec.vocabulary_.items(), key=lambda kv: kv[1])
    vocab = [k for k, _ in vocab_items]
    idf_r = np.round(raw_idf, 4); coef_r = np.round(raw_coef[0], 4); int_r = round(float(raw_int[0]), 4)
    vec.idf_ = idf_r
    lr.coef_ = coef_r.reshape(1, -1); lr.intercept_ = np.array([int_r])
    proba = lambda texts: lr.predict_proba(vec.transform(list(texts)))[:, 1]

    # ---- threshold on validation (shipped model)
    p_va = proba(va["text"])
    threshold, m_val = best_threshold(va["y"].values, p_va)
    print(f"threshold {threshold} (val F1 {m_val['f1']:.4f}, P {m_val['precision']:.3f}, R {m_val['recall']:.3f})")

    # ---- export
    model_json = {
        "version": 1,
        "name": "steady-tone",
        "created": GENERATED,
        "task": "low mood in a short message (any of: " + ", ".join(LOW_MOOD) + ")",
        "trained_on": ("GoEmotions simplified train split (Google, Apache-2.0); Reddit comments" if best["recipe"] == "hard" else
                       "GoEmotions (Google, Apache-2.0), every comment outside validation and test, with the share of "
                       "raters who marked a low-mood emotion as a soft label; Reddit comments"),
        "recipe": RECIPE_LABEL[best["recipe"]],
        "tokenizer": TOKENIZER_DESCRIPTION,
        "ngram_range": [1, 2],
        "tf": best["tf"],
        "norm": "l2",
        "C": best["C"],
        "threshold": threshold,
        "intercept": int_r,
        "n_features": len(vocab),
        "vocab": vocab,
        "idf": [float(x) for x in idf_r],
        "coef": [float(x) for x in coef_r],
    }
    TONE_JSON.write_text(json.dumps(model_json, separators=(",", ":"), ensure_ascii=True), encoding="utf-8")
    size_bytes = TONE_JSON.stat().st_size
    assert size_bytes < MAX_JSON_BYTES, f"tone.json is {size_bytes} bytes, over the 1 MB cap"
    print(f"tone.json: {size_bytes} bytes, {len(vocab)} features")

    # ---- test: model and baselines
    p_te = proba(te["text"])
    y_te = te["y"].values
    pred_model = (p_te >= threshold).astype(int)
    pred_kw = te["text"].apply(keyword_flag).values
    pred_none = np.zeros(len(te), dtype=int)
    test = {
        "model": {**confusion(y_te, pred_model), **bootstrap_ci(y_te, pred_model),
                  "threshold": threshold, "average_precision": r4(average_precision_score(y_te, p_te)),
                  "roc_auc": r4(roc_auc_score(y_te, p_te))},
        "model_at_0_5": confusion(y_te, (p_te >= 0.5).astype(int)),
        "baseline_keyword": {**confusion(y_te, pred_kw), **bootstrap_ci(y_te, pred_kw)},
        "baseline_always_no": confusion(y_te, pred_none),
        "unrounded_vs_shipped_max_abs_diff": float(np.max(np.abs(p_te - p_te_unrounded))),
    }
    if best["recipe"] != "hard":
        p_te_prev = prev_proba(te["text"])
        test["previous_model"] = {**confusion(y_te, (p_te_prev >= th_prev).astype(int)), "threshold": th_prev,
                                  "average_precision": r4(average_precision_score(y_te, p_te_prev)),
                                  "roc_auc": r4(roc_auc_score(y_te, p_te_prev)), "settings": prev}
    # recall on each low-mood label separately (a test row can carry more than one)
    test["model"]["recall_by_label"] = {}
    test["baseline_keyword"]["recall_by_label"] = {}
    for n in LOW_MOOD:
        mask = te["labels"].apply(lambda ls, i=LABEL_NAMES.index(n): i in ls).values
        test["model"]["recall_by_label"][n] = {"n": int(mask.sum()), "recall": r4(pred_model[mask].mean())}
        test["baseline_keyword"]["recall_by_label"][n] = {"n": int(mask.sum()), "recall": r4(pred_kw[mask].mean())}
    for k in ["model", "model_at_0_5", "baseline_keyword", "baseline_always_no"]:
        m = test[k]
        print(f"test {k:20s} P {m['precision']}  R {m['recall']}  missed {m['missed']}  false alarms {m['false_alarms']}")

    PROBES = ["sorry im late lol", "i miss how things used to be, nothing feels fun anymore", "omw, save me a seat at lunch"]
    probe_p = proba(PROBES)
    probes = [{"text": t, "score": round(float(s_), 4), "low_mood": bool(s_ >= threshold)} for t, s_ in zip(PROBES, probe_p)]
    print("probes:", probes)
    order = np.argsort(coef_r)
    top = {"low_mood": [[vocab[i], float(coef_r[i])] for i in order[::-1][:25]],
           "not_low_mood": [[vocab[i], float(coef_r[i])] for i in order[:25]]}

    # ---- Part C: our 60 messages
    with open(MSG_CSV, newline="", encoding="utf-8") as f:
        msgs = list(csv.DictReader(f))
    assert len(msgs) == 60, f"expected 60 messages, got {len(msgs)}"
    assert list(msgs[0].keys()) == ["id", "text", "slice", "low_mood", "selfharm"]
    assert all(m["slice"] in SLICES for m in msgs) and all(m["selfharm"] in ("none", "concern", "plan") for m in msgs)
    m_text = [m["text"] for m in msgs]
    m_y = np.array([int(m["low_mood"]) for m in msgs])
    m_p = proba(m_text)
    m_pred = (m_p >= threshold).astype(int)
    m_kw = np.array([keyword_flag(t) for t in m_text])

    rules = load_selfharm_rules()
    sh_py = [check_selfharm(t, rules) for t in m_text]
    sh_py_goemo = [check_selfharm(t, rules) for t in te["text"]]

    # ---- TypeScript parity
    tone_texts = list(te["text"]) + m_text
    node_out = run_node(tone_texts, m_text + list(te["text"]))
    parity = None
    if node_out is not None:
        ts_p = np.array(node_out["tone"], dtype=float)
        py_p = np.concatenate([p_te, m_p])
        diffs = np.abs(ts_p - py_p)
        ts_low = np.array(node_out["low"], dtype=bool)
        py_low = py_p >= threshold
        sh_ts = node_out["selfharm"]
        sh_all_py = sh_py + sh_py_goemo
        sh_mismatch = [i for i, (a, b) in enumerate(zip(sh_ts, sh_all_py))
                       if a.get("level") != b["level"] or a.get("ruleId") != b.get("ruleId")]
        parity = {
            "node": node_out["node"],
            "tone_n": int(len(ts_p)),
            "tone_max_abs_diff": float(diffs.max()),
            "tone_mean_abs_diff": float(diffs.mean()),
            "tone_max_abs_diff_vs_unrounded_sklearn": float(np.max(np.abs(ts_p[: len(te)] - p_te_unrounded))),
            "tone_decision_mismatches": int((ts_low != py_low).sum()),
            "within_1e-4": bool(diffs.max() < 1e-4),
            "selfharm_n": len(sh_ts),
            "selfharm_mismatches": len(sh_mismatch),
            "default_url_outside_vite": node_out["urls"][-1],
        }
        print("parity:", parity)
        assert parity["within_1e-4"], "TypeScript and sklearn probabilities differ by 1e-4 or more"
        assert not sh_mismatch, f"selfharm.ts and Python disagree on {len(sh_mismatch)} texts"

    # ---- per-message and per-slice results
    per_msg = []
    for i, m in enumerate(msgs):
        per_msg.append({"id": m["id"], "slice": m["slice"], "low_mood": int(m["low_mood"]),
                        "tone_score": round(float(m_p[i]), 4), "tone_flag": int(m_pred[i]),
                        "keyword_flag": int(m_kw[i]), "selfharm_expected": m["selfharm"],
                        "selfharm_level": sh_py[i]["level"], "selfharm_rule": sh_py[i].get("ruleId")})
    by_slice = {}
    for s in SLICES:
        idx = [i for i, m in enumerate(msgs) if m["slice"] == s]
        c = confusion(m_y[idx], m_pred[idx]); ck = confusion(m_y[idx], m_kw[idx])
        lv = Counter(sh_py[i]["level"] for i in idx)
        by_slice[s] = {"n": len(idx), "labelled_low_mood": int(m_y[idx].sum()), "flagged_low_mood": c["flagged"],
                       "tp": c["tp"], "missed": c["missed"], "false_alarms": c["false_alarms"],
                       "precision": r4(c["precision"]), "recall": r4(c["recall"]),
                       "keyword_flagged": ck["flagged"], "keyword_missed": ck["missed"],
                       "keyword_false_alarms": ck["false_alarms"],
                       "selfharm": {"none": lv.get("none", 0), "concern": lv.get("concern", 0), "plan": lv.get("plan", 0)}}
    msgs_all = {"model": confusion(m_y, m_pred), "keyword": confusion(m_y, m_kw)}
    if best["recipe"] != "hard":
        msgs_all["previous_model"] = confusion(m_y, (prev_proba(m_text) >= th_prev).astype(int))

    def pool(slices):
        return [i for i, m in enumerate(msgs) if m["slice"] in slices]
    ff_idx = pool(FALSE_FLAG_SLICES); risk_idx = pool(RISK_SLICES)
    sh = {
        "false_flag_pool": len(ff_idx),
        "false_flags": sum(sh_py[i]["level"] != "none" for i in ff_idx),
        "false_flags_as_plan": sum(sh_py[i]["level"] == "plan" for i in ff_idx),
        "false_flags_as_concern": sum(sh_py[i]["level"] == "concern" for i in ff_idx),
        "risk_pool": len(risk_idx),
        "missed": sum(sh_py[i]["level"] == "none" for i in risk_idx),
        "plan_pool": len(pool(["risk_plan"])),
        "concern_pool": len(pool(["risk_concern"])),
        "plan_as_concern": sum(sh_py[i]["level"] == "concern" for i in pool(["risk_plan"])),
        "plan_missed": sum(sh_py[i]["level"] == "none" for i in pool(["risk_plan"])),
        "plan_correct": sum(sh_py[i]["level"] == "plan" for i in pool(["risk_plan"])),
        "concern_as_plan": sum(sh_py[i]["level"] == "plan" for i in pool(["risk_concern"])),
        "concern_missed": sum(sh_py[i]["level"] == "none" for i in pool(["risk_concern"])),
        "concern_correct": sum(sh_py[i]["level"] == "concern" for i in pool(["risk_concern"])),
        "flags_on_everyday_and_low_mood": sum(sh_py[i]["level"] != "none" for i in pool(["everyday", "low_mood"])),
        "goemotions_test_flags": dict(Counter(r["level"] for r in sh_py_goemo)),
        "goemotions_test_rules": dict(Counter(r.get("ruleId") for r in sh_py_goemo if r["level"] != "none")),
        "phrase_counts": {"plan": len(rules["plan"]), "concern": len(rules["concern"]),
                          "negations": len(rules["negations"])},
    }
    print("self-harm:", {k: v for k, v in sh.items() if not isinstance(v, dict)})

    results = {
        "generated": GENERATED,
        "dataset": "GoEmotions simplified (Google), Apache-2.0, Reddit comments",
        "label_names": LABEL_NAMES,
        "low_mood_labels": LOW_MOOD,
        "low_mood_label_ids": LOW_MOOD_IDS,
        "data": data_info,
        "keywords": KEYWORDS,
        "search": {"grid": grid, "chosen": best, "previous_recipe_best": prev, "criterion": "validation average precision",
                   "threshold_criterion": "best F1 on validation, grid 0.05 to 0.95 step 0.005"},
        "validation_at_threshold": m_val,
        "test": test,
        "top_features": top,
        "probe_messages": probes,
        "model_file": {"path": "app/public/models/tone.json", "bytes": size_bytes,
                       "kb": int(round(size_bytes / 1024)), "n_features": len(vocab)},
        "parity": parity,
        "messages": {"n": len(msgs), "overall": msgs_all, "by_slice": by_slice, "per_message": per_msg},
        "selfharm": sh,
        "runtime_seconds": round(time.time() - t0, 1),
    }
    (RES_DIR / "results.json").write_text(json.dumps(results, indent=2), encoding="utf-8")

    mt, kt = test["model"], test["baseline_keyword"]
    summary = {
        "generated": GENERATED,
        "dataset": "GoEmotions (Google), Apache-2.0",
        "low_mood_labels": LOW_MOOD,
        "test_size": int(len(te)),
        "model": {"precision": r4(mt["precision"]), "recall": r4(mt["recall"]), "missed": mt["missed"],
                  "false_alarms": mt["false_alarms"], "threshold": threshold},
        "baseline_keyword": {"precision": r4(kt["precision"]), "recall": r4(kt["recall"]),
                             "missed": kt["missed"], "false_alarms": kt["false_alarms"]},
        "model_size_kb": int(round(size_bytes / 1024)),
        "parity_max_diff": float(f"{parity['tone_max_abs_diff']:.3g}") if parity else None,
        "messages": {"n": len(msgs), "by_slice": {s: {"n": v["n"], "flagged_low_mood": v["flagged_low_mood"],
                                                      "labelled_low_mood": v["labelled_low_mood"]}
                                                  for s, v in by_slice.items()}},
        "selfharm": {k: sh[k] for k in ["false_flags", "false_flag_pool", "missed", "risk_pool", "plan_as_concern"]},
        "headline": headline(test, len(te), sh),
        "caveats": CAVEATS,
    }
    SUMMARY_JSON.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    (RES_DIR / "results.md").write_text(render_md(results, msgs), encoding="utf-8")
    print(f"done in {time.time() - t0:.1f}s")


CAVEATS = [
    "GoEmotions is Reddit comments, mostly by adults. It holds no teen texts, so the test numbers may not carry over to a teen's phone.",
    "Low mood means a comment was labelled sadness, grief, disappointment or remorse. These are emotion labels and say nothing about depression or suicide risk.",
    "The model scores one message at a time. Steady uses the weekly share of low-mood messages against the student's own normal, which this test does not measure.",
    "The word 'sorry' pushes a message hard toward low mood, so 'sorry im late' scores as low mood.",
    "The self-harm check is a short phrase list and it is not validated. No clinician has reviewed it, and it missed 9 of the 15 risk messages we wrote.",
    "The 60 messages were written by a Claude session, not by teens, and labelled by that one writer. 60 messages are too few for reliable rates.",
]

# Why each risk message slipped past the frozen list. Printed only for messages the
# list still misses, so a later change to the list cannot leave a stale note.
MISS_NOTES = {
    "m49": "The list has \"better off without me\". It has no form with \"if i wasnt here\".",
    "m51": "The \"thinking about\" rule lists killing myself, not hurting myself.",
    "m52": "No rule covers \"nobody would notice if i was gone\". See the note on how the test was kept blind.",
    "m54": "The rule needs \"fall asleep and not wake up\". The extra \"just\" breaks it.",
    "m55": "The rule needs \"made up my mind to ...\", and \"my last night\" is only listed as \"my last night alive\".",
    "m56": "The list has \"this is my goodbye\". It does not have \"this is goodbye\".",
    "m58": "Giving things away is a known warning sign. No rule covers it.",
    "m60": "The rule needs \"wont be here\" followed by \"much longer\", \"after tonight\", \"by morning\" or \"by tomorrow\".",
    "x03": "The rule needs \"i just hurt myself\". The message drops the \"i\".",
}


def pct(x, digits=1):
    return "n/a" if x is None else f"{100 * x:.{digits}f}%"


def headline(test, n, sh=None):
    m, k = test["model"], test["baseline_keyword"]
    s = (f"On {n:,} Reddit comments it never saw, the tone model found {m['recall']:.0%} of low-mood "
         f"comments against {k['recall']:.0%} for a keyword list")
    if sh is not None:
        s += f", and the self-harm phrase list missed {sh['missed']} of the {sh['risk_pool']} risk messages we wrote"
    return s + "."


def render_md(res, msgs):
    T = res["test"]; m = T["model"]; k = T["baseline_keyword"]; a = T["baseline_always_no"]; h = T["model_at_0_5"]
    d = res["data"]; ch = res["search"]["chosen"]; v = res["validation_at_threshold"]; par = res["parity"]
    sh = res["selfharm"]; bs = res["messages"]["by_slice"]; ov = res["messages"]["overall"]
    text = {x["id"]: x["text"] for x in msgs}
    pm = {x["id"]: x for x in res["messages"]["per_message"]}
    rbl = m["recall_by_label"]; krbl = k["recall_by_label"]
    L = []
    w = L.append
    w("# Experiment 2: words")
    w("")
    w(f"Run on {res['generated']} with `.venv/bin/python experiments/exp2_words.py` (about {int(res['runtime_seconds']) + 1} seconds). "
      "Every number here is written by that script into `results/exp2/results.json`. The notebook `notebooks/02_words_model.ipynb` shows the same results with charts.")
    w("")
    w("This experiment tests the two checks that read what a student types. Both run on the phone, and the text is discarded after scoring.")
    w("")
    w("- **The tone model** reads low mood in one short message. It feeds the tone signal, the weekly share of the student's own messages that read as low mood.")
    w("- **The self-harm check** is a separate phrase list. Words that state a plan send an urgent note at once. Other self-harm words first ask \"Are you safe right now?\".")
    w("")
    w("## Part A: the tone model")
    w("")
    w("### Data")
    w("")
    w(f"We used the \"simplified\" version of [GoEmotions](https://huggingface.co/datasets/google-research-datasets/go_emotions) (Google, Apache-2.0). "
      f"It has {d['train']['n']:,} training, {d['validation']['n']:,} validation and {d['test']['n']:,} test comments from Reddit. "
      "Each comment carries one or more of 28 labels: 27 emotions and neutral. We took the label names and their order from the dataset card.")
    w("")
    w("A comment counts as **low mood** if it carries any of sadness, grief, disappointment or remorse (label ids 9, 16, 24 and 25). "
      "We picked these four because they are closest to two items on the eight-question form: feeling down, and feeling bad about yourself or that you let people down. "
      "We left out fear and nervousness, which are closer to anxiety, and anger and annoyance, which are common in ordinary complaints.")
    w("")
    w(f"Low mood is rare: {pct(d['train']['share'])} of training comments, {pct(d['validation']['share'])} of validation comments and "
      f"{pct(d['test']['share'])} of test comments ({d['test']['low_mood']} of {d['test']['n']:,}).")
    w("")
    soft_chosen = ch.get("recipe") == "soft"
    pv = res["search"].get("previous_recipe_best"); sp = d.get("soft_pool")
    grid = res["search"]["grid"]
    n_hard = sum(1 for g in grid if g.get("recipe", "hard") == "hard"); n_soft = len(grid) - n_hard
    if soft_chosen and sp:
        w("### Soft labels")
        w("")
        w(f"GoEmotions also publishes a rater-level file: {sp['mean_raters_per_comment']:.1f} raters read each comment on average. The \"simplified\" labels keep an emotion only when "
          "two raters agree, so a comment that one rater in three found sad is labelled plain \"not sad\". For training we used the share of a comment's raters who marked "
          f"any of the four low-mood emotions. That gives {sp['n']:,} training comments: the {sp['in_simplified_train']:,} in the training split and {sp['extra_comments']:,} "
          f"that \"simplified\" dropped for having no agreed label. {pct(sp['share_with_any_low_mood_vote'])} of them got at least one low-mood vote. "
          "No validation or test comment is in this pool, and validation and test are still scored against the agreed labels.")
        w("")
    w("### Model")
    w("")
    w("The tokenizer is simple so that the browser can copy it exactly. It lowercases A to Z, deletes apostrophes (\"don't\" becomes \"dont\"), "
      "squashes a letter repeated three or more times to two (\"sooo\" becomes \"soo\"), and keeps runs of letters and digits. "
      "The features are single words and pairs of neighboring words, weighted by TF-IDF. A logistic regression turns them into a score.")
    w("")
    w(f"We tried {len(grid)} settings on the validation split only, in two recipes.")
    w("")
    w(f"- **Hard labels** ({n_hard} settings): the agreed labels with balanced class weights, a vocabulary of 10,000, 15,000 or 20,000 terms, raw or log word counts, "
      "and six values of C from 0.25 to 8." + (f" Its best setting reached a validation average precision of {pv['val_ap']:.3f} "
      f"({pv['vocab']:,} terms, {pv['tf']} counts, C = {pv['C']}). This was the model we shipped first." if pv else ""))
    w(f"- **Soft labels** ({n_soft} settings): the rater shares above with no class weights, every term found in at least 4 or 5 training comments, raw or log word counts, "
      "and four values of C from 1 to 8. A cut of 3 comments would put the file at the 1 MB cap, so it was left out.")
    w("")
    w(f"We kept the setting with the best average precision on validation: {RECIPE_LABEL[ch.get('recipe', 'hard')]}, {ch['vocab']:,} terms, {ch['tf']} counts, "
      f"C = {ch['C']} (validation average precision {ch['val_ap']:.3f}).")
    w("")
    if soft_chosen:
        w(f"The threshold is the one with the best F1 on validation: **{m['threshold']}**. At that threshold validation precision was {pct(v['precision'])} "
          f"and recall was {pct(v['recall'])}. The score estimates the share of raters who would call a message low mood, which is why the threshold sits well under 0.5. "
          "It ranks messages well. It is not a calibrated chance that the writer is low.")
    else:
        w(f"The threshold is the one with the best F1 on validation: **{m['threshold']}**. At that threshold validation precision was {pct(v['precision'])} "
          f"and recall was {pct(v['recall'])}. The score comes from a class-balanced model, so it ranks messages well. It is not a calibrated chance.")
    w("")
    w(f"We rounded every weight to 4 decimals and evaluated the rounded model, since that is the file the app loads. "
      f"Rounding moved test scores by at most {T['unrounded_vs_shipped_max_abs_diff']:.1e}.")
    w("")
    w("### Test results")
    w("")
    w(f"All three methods were scored once on the same {m['n']:,} test comments, of which {m['positives']} are low mood.")
    w("")
    w("| Method | Flagged | Precision | Recall | Missed cases | False alarms |")
    w("| --- | --- | --- | --- | --- | --- |")
    w(f"| Always \"not low mood\" | {a['flagged']} | n/a (flags nothing) | {pct(a['recall'])} | {a['missed']} | {a['false_alarms']} |")
    w(f"| Keyword list ({len(res['keywords'])} words) | {k['flagged']} | {pct(k['precision'])} | {pct(k['recall'])} | {k['missed']} | {k['false_alarms']} |")
    w(f"| Tone model, threshold {m['threshold']} | {m['flagged']} | {pct(m['precision'])} | {pct(m['recall'])} | {m['missed']} | {m['false_alarms']} |")
    w(f"| Tone model, threshold 0.5 (for reference only) | {h['flagged']} | {pct(h['precision'])} | {pct(h['recall'])} | {h['missed']} | {h['false_alarms']} |")
    pmodel = T.get("previous_model")
    if pmodel:
        w(f"| Earlier tone model (hard labels), threshold {pmodel['threshold']} | {pmodel['flagged']} | {pct(pmodel['precision'])} | {pct(pmodel['recall'])} | {pmodel['missed']} | {pmodel['false_alarms']} |")
    w("")
    if pmodel:
        w(f"The earlier model is the best setting of the hard-label recipe, with its own validation threshold. Its F1 on the test comments was {pmodel['f1']:.3f} "
          f"and its average precision {pmodel['average_precision']:.3f}; the model we ship now scores {m['f1']:.3f} and {m['average_precision']:.3f}. "
          "The gain comes from the training labels. The words, the features and the code that runs on the phone are the same.")
        w("")
    w(f"Bootstrap 95% ranges (2,000 resamples of the test set): model precision {pct(m['precision_95ci'][0])} to {pct(m['precision_95ci'][1])}, "
      f"recall {pct(m['recall_95ci'][0])} to {pct(m['recall_95ci'][1])}; keyword precision {pct(k['precision_95ci'][0])} to {pct(k['precision_95ci'][1])}, "
      f"recall {pct(k['recall_95ci'][0])} to {pct(k['recall_95ci'][1])}. The model's average precision is {m['average_precision']:.3f} and its ROC AUC is {m['roc_auc']:.3f}.")
    w("")
    w(f"The model finds {m['tp']} low-mood comments where the keyword list finds {k['tp']}, at "
      + ("similar" if abs(m['precision'] - k['precision']) < 0.05 else ("higher" if m['precision'] > k['precision'] else "lower")) + " precision. "
      f"It still misses {m['missed']} of {m['positives']}, and {m['false_alarms']} of its {m['flagged']} flags are wrong. "
      "The keyword list reads only the words on its list, so it misses most comments that never say \"sad\" or \"miss\".")
    w("")
    w("Recall by label (a comment can carry more than one):")
    w("")
    w("| Label | Test comments | Model recall | Keyword recall |")
    w("| --- | --- | --- | --- |")
    for n in res["low_mood_labels"]:
        w(f"| {n} | {rbl[n]['n']} | {pct(rbl[n]['recall'])} | {pct(krbl[n]['recall'])} |")
    w("")
    hardest = min((n for n in res["low_mood_labels"] if rbl[n]["n"] >= 20), key=lambda n: rbl[n]["recall"])
    w(f"{hardest.capitalize()} is the hardest label: the model misses {round(rbl[hardest]['n'] * (1 - rbl[hardest]['recall']))} of {rbl[hardest]['n']}."
      + (" Reading the missed ones, many are plain complaints such as \"Your TLDR sucks\", and several also carry the annoyance label." if hardest == "disappointment" else ""))
    w("")
    tf_ = res["top_features"]["low_mood"]
    top = ", ".join(f"\"{t}\"" for t, _ in tf_[:12])
    sorry = next((i for i, (t, _) in enumerate(tf_[:12]) if t == "sorry"), None)
    late = next((x for x in res.get("probe_messages", []) if x["text"] == "sorry im late lol"), None)
    w(f"The words that push hardest toward low mood are {top}."
      + (" \"sorry\" is far ahead of the rest, because Reddit comments labelled remorse or sadness often say \"sorry\"." if sorry == 0 and tf_[0][1] > 1.25 * tf_[1][1]
         else (" \"sorry\" is among them, because Reddit comments labelled remorse or sadness often say \"sorry\"." if sorry is not None else ""))
      + (" Teens say sorry for small things, and \"sorry im late lol\" scores as low mood." if late and late["low_mood"] else "")
      + " In Steady the signal is a change against the student's own normal, so a steady habit of using one of these words matters less than a sudden rise.")
    w("")
    w("### Size and browser check")
    w("")
    mf = res["model_file"]
    w(f"`app/public/models/tone.json` is {mf['bytes']:,} bytes ({mf['kb']} KB) with {mf['n_features']:,} features, under the 1 MB cap.")
    w("")
    if par:
        w(f"We ran `app/src/engine/tone.ts` under Node {par['node']} on {par['tone_n']:,} texts (all {m['n']:,} test comments and our 60 messages) "
          f"and compared it with sklearn's `predict_proba`. The largest difference was {par['tone_max_abs_diff']:.1e}, far inside the 1e-4 target, "
          f"and the two agreed on the low-mood decision for every text ({par['tone_decision_mismatches']} differences). "
          f"Outside Vite the default model address is `{par['default_url_outside_vite']}`.")
    w("")
    w("## Part B: the self-harm check")
    w("")
    pc = sh["phrase_counts"]
    w(f"`app/src/engine/selfharm_phrases.json` holds {pc['plan']} plan patterns, {pc['concern']} concern patterns and {pc['negations']} negations. "
      "**It is not validated, and no clinician has reviewed it.** It is a short list written for the demo.")
    w("")
    w("- **plan:** words that state a plan or intent to end one's life, or that say the writer has just hurt themselves or taken something. These skip the question and send an urgent note at once.")
    w("- **concern:** other self-harm language. The app first asks \"Are you safe right now?\".")
    w("- **negations:** phrases such as \"i would never kill myself\" or \"suicide prevention week\", blanked out before the check so the rest of the message is still read.")
    w("")
    w("Before matching, the text is lowercased, apostrophes are deleted and every run of other symbols becomes one space. The patterns use only word boundaries, "
      "spaces, alternatives and optional words, so JavaScript and Python read them the same way. The answer gives the level and the rule id and never the matched words.")
    w("")
    if par:
        w(f"`selfharm.ts` and the Python copy of the check gave the same level and rule on all {par['selfharm_n']:,} texts we tried "
          f"({par['selfharm_mismatches']} differences).")
        w("")
    w("**How we kept this test blind.** The list was written and saved before we read any of the 60 messages, and it was not changed after the results came in. "
      "The messages were written by a separate Claude session that never saw the list. One slip: before the list was finished, that session's status note quoted one message (m52, "
      "\"nobody would even notice if i was gone\"). We did not add a rule for it. The same team still made both, so these counts show which kinds of message fail. They are too few to give a rate.")
    w("")
    w("## Part C: our 60 messages")
    w("")
    w("`experiments/exp2_words/test_messages.csv` holds 60 short messages in a teen texting voice. The lyric lines were written to sound like songs and are meant to be original; "
      "we did not search a lyrics database to confirm it. The risk messages contain no method details.")
    w("")
    w("The first batch had 60 messages in the planned 12/12/8/8/8/6/6 split. After the plan level was widened to cover harm that has already happened, "
      "the same writer added 3 such messages (x01 to x03). To keep 60, we dropped the last two everyday messages and the last low-mood message (m11, m12 and m24), "
      "a rule fixed before scoring.")
    w("")
    w("### Tone model by slice")
    w("")
    w("A message is labelled low mood when its own words express sadness, grief, disappointment or regret, including lyric lines and sarcasm.")
    w("")
    w("| Slice | Messages | Labelled low mood | Model flagged | Model missed | Model false alarms | Keyword flagged |")
    w("| --- | --- | --- | --- | --- | --- | --- |")
    for s, b in bs.items():
        w(f"| {s} | {b['n']} | {b['labelled_low_mood']} | {b['flagged_low_mood']} | {b['missed']} | {b['false_alarms']} | {b['keyword_flagged']} |")
    om, okw = ov["model"], ov["keyword"]
    w(f"| **all** | {om['n']} | {om['positives']} | {om['flagged']} | {om['missed']} | {om['false_alarms']} | {okw['flagged']} |")
    w("")
    w(f"Across the 60, the model's precision is {pct(om['precision'])} ({om['tp']} of {om['flagged']}) and its recall is {pct(om['recall'])} ({om['tp']} of {om['positives']}). "
      f"The keyword list finds {okw['tp']} of {okw['positives']}. Recall here is well below the {pct(m['recall'])} on Reddit comments. "
      "Teen texts are short and use different words, and the model learned from Reddit.")
    w("")
    lyr, sar = bs["lyric_style"], bs["sarcasm"]
    w(f"The model flagged {lyr['flagged_low_mood']} of the {lyr['labelled_low_mood']} sad lyric lines and {sar['flagged_low_mood']} of the {sar['labelled_low_mood']} sarcastic messages labelled low mood. "
      "Counted against the labels these are misses. For lyrics that may be the better outcome, since a student quoting a sad song is weak evidence of low mood. "
      "For sarcasm it means the model reads the surface words and misses the meaning. "
      f"It flagged {bs['risk_concern']['flagged_low_mood'] + bs['risk_plan']['flagged_low_mood']} of the {bs['risk_concern']['n'] + bs['risk_plan']['n']} risk messages, "
      "which is one reason the self-harm check has to stay separate.")
    w("")
    w("### Self-harm check on the 60")
    w("")
    w("| Slice | Messages | none | concern | plan |")
    w("| --- | --- | --- | --- | --- |")
    for s, b in bs.items():
        x = b["selfharm"]
        w(f"| {s} | {b['n']} | {x['none']} | {x['concern']} | {x['plan']} |")
    w("")
    w(f"- **False flags:** {sh['false_flags']} of {sh['false_flag_pool']} lyric, dark-joke and sarcasm messages "
      f"({sh['false_flags_as_concern']} at concern, {sh['false_flags_as_plan']} at plan). A flag at concern asks the student first. "
      "It sends a parent note only if the student says no, does not answer within 30 minutes, or is flagged again within a day.")
    w(f"- **Misses:** {sh['missed']} of {sh['risk_pool']} risk messages got no flag: {sh['concern_missed']} of {sh['concern_pool']} concern messages "
      f"and {sh['plan_missed']} of {sh['plan_pool']} plan messages.")
    w(f"- **Plan and concern mixed up:** {sh['plan_as_concern']} plan messages were read as concern, and {sh['concern_as_plan']} concern messages were read as plan. "
      f"Every plan message the list caught ({sh['plan_correct']}) was caught at plan.")
    w(f"- **Everyday and low-mood messages:** {sh['flags_on_everyday_and_low_mood']} flags.")
    gf = sh["goemotions_test_flags"]
    w(f"- **Reddit test comments:** the list flagged {gf.get('concern', 0)} of {m['n']:,} at concern and {gf.get('plan', 0)} at plan. "
      "There are no self-harm labels there, so this only shows how often the list fires on ordinary comments. "
      "The plan flag was a comment about leaving \"my last words\" somewhere, which the rule for a last goodbye catches.")
    w("")
    w("False flags:")
    w("")
    w("| Id | Slice | Message | Level | Rule |")
    w("| --- | --- | --- | --- | --- |")
    for x in res["messages"]["per_message"]:
        if x["slice"] in FALSE_FLAG_SLICES and x["selfharm_level"] != "none":
            w(f"| {x['id']} | {x['slice']} | {text[x['id']]} | {x['selfharm_level']} | {x['selfharm_rule']} |")
    w("")
    w("Misses:")
    w("")
    w("| Id | Slice | Message | Why the list missed it |")
    w("| --- | --- | --- | --- |")
    for x in res["messages"]["per_message"]:
        if x["slice"] in RISK_SLICES and x["selfharm_level"] == "none":
            w(f"| {x['id']} | {x['slice']} | {text[x['id']]} | {MISS_NOTES.get(x['id'], '')} |")
    w("")
    w("Caught:")
    w("")
    w("| Id | Slice | Level | Rule |")
    w("| --- | --- | --- | --- |")
    for x in res["messages"]["per_message"]:
        if x["slice"] in RISK_SLICES and x["selfharm_level"] != "none":
            w(f"| {x['id']} | {x['slice']} | {x['selfharm_level']} | {x['selfharm_rule']} |")
    w("")
    w("### What the self-harm result means")
    w("")
    w("Most misses are one word away from a rule: a missing \"i\", an extra \"just\", \"this is goodbye\" where the list has \"this is my goodbye\". "
      "A phrase list catches the wording its writer expected, and people in distress word things in many ways. "
      "Adding these nine phrasings would catch these nine messages, and then these messages could no longer test the list. "
      "Any new version needs fresh messages written by someone who has not seen it. "
      "This result supports what the docs already say: a real product needs a model built and tested for this job, with misses counted as carefully as false alarms.")
    w("")
    w("All four false flags were dark jokes, and all four landed at concern, so each would ask the student first. None of the jokes reached plan. "
      "The plan rules were written narrowly for that reason, and the five missed plan messages show the cost.")
    w("")
    w("## Caveats")
    w("")
    w("- **GoEmotions is Reddit comments by adults, mostly.** The dataset does not record ages. Its raters were three crowdworkers in India for each comment, according to the dataset card. None of it is teen texting.")
    w("- **The labels are emotions.** Sadness, grief, disappointment and remorse in one comment say nothing about depression or suicide risk.")
    w("- **One message is not a week.** Steady uses the weekly share of low-mood messages against the student's own range. This test scores single messages only.")
    w("- **The self-harm list is not validated.** No clinician has reviewed it. It missed 9 of 15 risk messages here.")
    w("- **The 60 messages are few and made up.** A Claude session wrote and labelled them, not teens. One message moves the risk-pool rate by about 7 points.")
    w("- **Some labels are borderline.** The writer was unsure about the low-mood label on m29, m34, m37, m43, m46, m60 and x01, and about concern on m52.")
    w("- **The score is a ranking.** It comes from a class-balanced model and is not a calibrated chance of low mood.")
    w("")
    w("*This project is a prototype and is not medical advice. The code and this write-up were made with Claude (Anthropic).*")
    return "\n".join(L) + "\n"


if __name__ == "__main__":
    main()
