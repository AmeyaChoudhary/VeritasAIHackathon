#!/usr/bin/env python3
"""Experiment 5: a model for self-harm language, against the phrase list the app uses.

The app's self-harm check is a hand-written phrase list. In Experiment 2 it missed 9 of
our 15 self-harm test messages. This trains a model that could run beside it, in the same
format as the tone model (TF-IDF over words and word pairs, then logistic regression), so
the phone can load it with the code it already has.

Data (both public on Kaggle, both Reddit and other social media posts, mostly adults):
  - Suicide and Depression Detection (Komati; CC BY-SA 4.0): 232,074 posts. "suicide" is
    every post in r/SuicideWatch; "non-suicide" is r/teenagers.
    https://www.kaggle.com/datasets/nikhileswarkomati/suicide-watch
  - Sentiment Analysis for Mental Health, combined (Sze Gee Lim; ODbL): 53,043 statements
    merged from nine Kaggle sets, labelled Normal, Depression, Suicidal, Anxiety, Stress,
    Bipolar or Personality disorder.
    https://www.kaggle.com/datasets/szegeelim/mental-health
A post counts as self-harm language when it is "suicide" or "Suicidal". Everything else is
not, including depression, anxiety and stress posts, so the model has to tell self-harm
language apart from sadness, not only from ordinary chatter.

Protocol:
  - Empty posts dropped. Exact duplicates (after the app's tokenizer) dropped; texts that
    appear with both labels dropped.
  - One fixed split, 80% train, 10% validation, 10% test, stratified by source and label.
  - Vocabulary size, tf and C chosen by average precision on validation; the threshold
    with the best F1 on validation. The test split is scored once.
  - The phrase list (app/src/engine/selfharm_phrases.json, through Experiment 2's Python
    copy of selfharm.ts) is the baseline, on the same test posts.
  - Our 60 hand-written messages (experiments/exp2_words/test_messages.csv) are never used
    to train or choose anything.

The rule for putting it in the app, written before any result was seen:
  The model would only ever add a "concern" (the app asks "Are you safe right now?" first);
  it never triggers the "plan" path. It goes in the app only if both hold:
    1. On the test posts, phrase list OR model finds more self-harm posts than the phrase
       list alone.
    2. On our 60 messages, phrase list OR model finds more of the 15 self-harm messages
       than the phrase list alone, and adds at most 1 false alarm among the other 45.
  Otherwise the model file is written under data/models/ only and the app is unchanged.

Writes results/exp5/results.{json,md}, app/public/data/exp5_summary.json, and, only if the
rule passes, app/public/models/risk.json.

Usage: .venv/bin/python -I experiments/exp5_risk_words.py
"""
from __future__ import annotations

import csv
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.model_selection import train_test_split

sys.path.insert(0, str(Path(__file__).resolve().parent))
import exp2_words as e2  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SW_CSV = DATA / "suicide_watch" / "Suicide_Detection.csv"
MH_CSV = DATA / "mental_health_combined" / "Combined Data.csv"
MSGS = ROOT / "experiments" / "exp2_words" / "test_messages.csv"
RESULTS = ROOT / "results" / "exp5"
APP_SUMMARY = ROOT / "app" / "public" / "data" / "exp5_summary.json"
APP_MODEL = ROOT / "app" / "public" / "models" / "risk.json"
LOCAL_MODEL = DATA / "models" / "risk.json"
GENERATED = "2026-11-15"
SEED = 7
VOCABS = [20000, 40000]
TFS = ["sublinear"]
CS = [1.0, 4.0]
THRESHOLDS = np.round(np.arange(0.05, 0.96, 0.01), 2)


def load() -> pd.DataFrame:
    sw = pd.read_csv(SW_CSV, usecols=["text", "class"])
    sw = pd.DataFrame({"text": sw["text"], "label": (sw["class"] == "suicide").astype(int),
                       "source": "suicide_watch", "orig": sw["class"].map({"suicide": "r/SuicideWatch", "non-suicide": "r/teenagers"})})
    mh = pd.read_csv(MH_CSV, usecols=["statement", "status"])
    mh = pd.DataFrame({"text": mh["statement"], "label": (mh["status"] == "Suicidal").astype(int),
                       "source": "mental_health", "orig": mh["status"]})
    d = pd.concat([sw, mh], ignore_index=True)
    n0 = len(d)
    d = d[d["text"].notna()].copy()
    d["text"] = d["text"].astype(str)
    d["key"] = d["text"].map(lambda t: " ".join(e2.tokens(t)))
    d = d[d["key"].str.len() > 0]
    n_empty = n0 - len(d)
    both = d.groupby("key")["label"].nunique()
    conflict = set(both[both > 1].index)
    d = d[~d["key"].isin(conflict)]
    n_before = len(d)
    d = d.drop_duplicates("key")
    d.attrs.update(raw=n0, empty=n_empty, conflicting=len(conflict), duplicates=n_before - len(d))
    return d.reset_index(drop=True)


def phrase_flags(texts, rules) -> np.ndarray:
    return np.array([e2.check_selfharm(t, rules)["level"] != "none" for t in texts], dtype=bool)


def conf(y, p) -> dict:
    return e2.confusion(np.asarray(y), np.asarray(p))


def main() -> None:
    t0 = time.time()
    d = load()
    strat = d["source"] + ":" + d["label"].astype(str)
    tr, rest = train_test_split(d, test_size=0.2, random_state=SEED, stratify=strat)
    va, te = train_test_split(rest, test_size=0.5, random_state=SEED, stratify=strat.loc[rest.index])
    print(f"posts {len(d):,} (train {len(tr):,}, validation {len(va):,}, test {len(te):,}); "
          f"self-harm share {d['label'].mean():.3f}", flush=True)

    grid, best = [], None
    for V in VOCABS:
        for tf in TFS:
            vec = TfidfVectorizer(analyzer=e2.analyzer, max_features=V, sublinear_tf=(tf == "sublinear"),
                                  norm="l2", smooth_idf=True, dtype=np.float64)
            Xtr = vec.fit_transform(tr["text"])
            Xva = vec.transform(va["text"])
            for C in CS:
                lr = LogisticRegression(C=C, max_iter=3000, solver="liblinear")
                lr.fit(Xtr, tr["label"])
                pv = lr.predict_proba(Xva)[:, 1]
                ap = average_precision_score(va["label"], pv)
                thr, m = e2.best_threshold(va["label"].to_numpy(), pv)
                row = {"vocab": V, "tf": tf, "C": C, "val_ap": round(float(ap), 4), "val_best_f1": round(m["f1"], 4), "val_threshold": thr}
                grid.append(row)
                print(f"  vocab {V} {tf} C {C}: val AP {ap:.4f}  best F1 {m['f1']:.4f} at {thr}", flush=True)
                if best is None or ap > best[0]:
                    best = (ap, row, vec, lr)
    _, chosen, vec, lr = best

    # round the weights to what the app file stores, then score with the rounded model
    vocab = [None] * len(vec.vocabulary_)
    for k, i in vec.vocabulary_.items():
        vocab[i] = k
    vec.idf_ = np.round(vec.idf_, 4)
    lr.coef_ = np.round(lr.coef_, 4)
    lr.intercept_ = np.round(lr.intercept_, 4)
    pv = lr.predict_proba(vec.transform(va["text"]))[:, 1]
    thr, _ = e2.best_threshold(va["label"].to_numpy(), pv)
    pt = lr.predict_proba(vec.transform(te["text"]))[:, 1]
    yt = te["label"].to_numpy()

    rules = e2.load_selfharm_rules()
    ph = phrase_flags(te["text"], rules)
    mod = pt >= thr
    test = {
        "posts": int(len(te)), "self_harm_posts": int(yt.sum()),
        "phrase_list": conf(yt, ph), "model": conf(yt, mod), "either": conf(yt, ph | mod),
        "model_ap": float(average_precision_score(yt, pt)), "model_auc": float(roc_auc_score(yt, pt)),
        "model_ci": e2.bootstrap_ci(yt, mod.astype(int)), "phrase_ci": e2.bootstrap_ci(yt, ph.astype(int)),
    }
    # false alarms by what the post really was
    by_orig = []
    for o, g in te.groupby("orig"):
        idx = te.index.get_indexer(g.index)
        by_orig.append({"group": o, "posts": int(len(g)), "self_harm": bool(g["label"].iloc[0]),
                        "model_flagged": float(mod[idx].mean()), "phrase_flagged": float(ph[idx].mean())})

    # our 60 messages
    msgs = list(csv.DictReader(MSGS.open(encoding="utf-8")))
    mt = [m["text"] for m in msgs]
    my = np.array([m["selfharm"] != "none" for m in msgs])
    ms = lr.predict_proba(vec.transform(mt))[:, 1]
    mm = ms >= thr
    mp = phrase_flags(mt, rules)
    slices = []
    for sl in e2.SLICES:
        i = np.array([m["slice"] == sl for m in msgs])
        slices.append({"slice": sl, "messages": int(i.sum()), "self_harm": int(my[i].sum()),
                       "phrase_found": int((mp & my & i).sum()), "model_found": int((mm & my & i).sum()),
                       "either_found": int(((mp | mm) & my & i).sum()),
                       "phrase_false_alarms": int((mp & ~my & i).sum()), "model_false_alarms": int((mm & ~my & i).sum()),
                       "either_false_alarms": int(((mp | mm) & ~my & i).sum())})
    ours = {"messages": len(msgs), "self_harm": int(my.sum()),
            "phrase": {"found": int((mp & my).sum()), "false_alarms": int((mp & ~my).sum())},
            "model": {"found": int((mm & my).sum()), "false_alarms": int((mm & ~my).sum())},
            "either": {"found": int(((mp | mm) & my).sum()), "false_alarms": int(((mp | mm) & ~my).sum())},
            "slices": slices,
            "examples": [{"id": m["id"], "slice": m["slice"], "self_harm": m["selfharm"], "score": round(float(s), 3),
                          "model": bool(f), "phrase": bool(p)} for m, s, f, p in zip(msgs, ms, mm, mp)]}

    rule1 = test["either"]["tp"] > test["phrase_list"]["tp"]
    rule2 = ours["either"]["found"] > ours["phrase"]["found"] and ours["either"]["false_alarms"] - ours["phrase"]["false_alarms"] <= 1
    ship = bool(rule1 and rule2)

    model_json = {
        "version": 1, "name": "steady-risk", "created": GENERATED,
        "task": "Self-harm language in a message. Used only to add a 'concern': the app asks 'Are you safe right now?' first.",
        "trained_on": "Suicide and Depression Detection (Komati, CC BY-SA 4.0) and Sentiment Analysis for Mental Health (Lim, ODbL), Kaggle",
        "tokenizer": e2.TOKENIZER_DESCRIPTION, "ngram_range": [1, 2],
        "threshold": thr, "intercept": float(lr.intercept_[0]), "tf": chosen["tf"], "norm": "l2",
        "vocab": vocab, "idf": [float(x) for x in vec.idf_], "coef": [float(x) for x in lr.coef_[0]],
        "cases": [{"text": m["text"], "score": round(float(s), 6)} for m, s in zip(msgs[:20], ms[:20])],
    }
    LOCAL_MODEL.parent.mkdir(parents=True, exist_ok=True)
    LOCAL_MODEL.write_text(json.dumps(model_json, separators=(",", ":"), ensure_ascii=True))
    if ship:
        APP_MODEL.write_text(json.dumps(model_json, separators=(",", ":"), ensure_ascii=True))
    size = LOCAL_MODEL.stat().st_size

    order = np.argsort(lr.coef_[0])
    top = {"toward": [vocab[i] for i in order[::-1][:20]], "away": [vocab[i] for i in order[:20]]}
    res = {
        "generated": GENERATED,
        "data": {"raw": d.attrs["raw"], "empty": d.attrs["empty"], "conflicting_texts": d.attrs["conflicting"],
                 "duplicates": d.attrs["duplicates"], "posts": int(len(d)), "train": int(len(tr)),
                 "validation": int(len(va)), "test": int(len(te)), "self_harm_share": float(d["label"].mean()),
                 "median_words": float(d["text"].str.split().str.len().median())},
        "grid": grid, "chosen": {**chosen, "threshold": thr}, "test": test, "by_group": by_orig, "ours": ours,
        "rule": {"test_either_beats_phrase": bool(rule1), "ours_either_beats_phrase_with_at_most_one_more_false_alarm": bool(rule2),
                 "ship": ship},
        "model_bytes": size, "top_terms": top, "runtime_seconds": round(time.time() - t0, 1),
    }
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "results.json").write_text(json.dumps(res, indent=2, default=float) + "\n")
    (RESULTS / "results.md").write_text(render(res))
    APP_SUMMARY.write_text(json.dumps({
        "generated": GENERATED, "headline": headline(res), "ship": ship,
        "test_recall_model": test["model"]["recall"], "test_precision_model": test["model"]["precision"],
        "test_recall_phrase": test["phrase_list"]["recall"], "test_precision_phrase": test["phrase_list"]["precision"],
        "ours_found_model": ours["model"]["found"], "ours_found_phrase": ours["phrase"]["found"], "ours_found_either": ours["either"]["found"],
        "ours_false_alarms_either": ours["either"]["false_alarms"], "ours_false_alarms_phrase": ours["phrase"]["false_alarms"],
        "ours_self_harm": ours["self_harm"], "caveats": caveats(res)}, indent=2, default=float) + "\n")
    print(headline(res))
    print("ship:", ship, "| rule 1", rule1, "| rule 2", rule2, f"| {size / 1e6:.2f} MB | {res['runtime_seconds']:.0f}s")


def pc(x, nd=0):
    return "n/a" if x is None else f"{100 * x:.{nd}f}%"


def headline(r) -> str:
    t, o = r["test"], r["ours"]
    return (f"On {t['posts']:,} held-out posts, the self-harm model found {pc(t['model']['recall'])} of self-harm posts at "
            f"{pc(t['model']['precision'])} precision; the phrase list found {pc(t['phrase_list']['recall'])}. On our "
            f"{o['messages']} messages, phrase list plus model found {o['either']['found']} of {o['self_harm']} self-harm "
            f"messages (phrase list alone {o['phrase']['found']}), with {o['either']['false_alarms']} false alarms "
            f"(phrase list alone {o['phrase']['false_alarms']}).")


def caveats(r) -> list[str]:
    dep = next((g for g in r["by_group"] if g["group"] == "Depression"), None)
    first = ([f"It flagged {pc(dep['model_flagged'])} of posts labelled Depression (the phrase list {pc(dep['phrase_flagged'])}). "
              "Each flag only asks the teen if they are safe, but a clinician has to decide whether that is acceptable."] if dep else [])
    return first + [
        "The labels come from where a post was written (r/SuicideWatch, or a source dataset's tag), not from a clinician. "
        "Some r/SuicideWatch posts are people supporting others, and some posts elsewhere talk about self-harm.",
        f"These are long posts (median {r['data']['median_words']:.0f} words), mostly by adults. Steady reads short messages from teens.",
        f"{pc(r['data']['self_harm_share'])} of these posts are self-harm language. In a teen's real messages it is far rarer, "
        "so the share of flags that are right would be much lower than on the test posts.",
        "The 60 messages were written and labelled by a Claude session, not by teens or clinicians. One message moves a count.",
        "Nothing here is clinically validated. A clinician has to review any self-harm check before anyone relies on it.",
    ]


def render(r) -> str:
    t, o, d, ch = r["test"], r["ours"], r["data"], r["chosen"]
    L = []
    w = L.append
    w("# Experiment 5: a model for self-harm language")
    w("")
    w(f"Generated {r['generated']} by `experiments/exp5_risk_words.py`. Data: Suicide and Depression Detection (Komati, "
      "CC BY-SA 4.0) and Sentiment Analysis for Mental Health (Lim, ODbL), both on Kaggle. Every number is an aggregate.")
    w("")
    w("## Short answer")
    w("")
    w(headline(r))
    w("")
    verdict = ("It passed the rule we wrote before running it, so the app now runs it beside the phrase list. It can only "
               "raise a concern, which first asks the teen \"Are you safe right now?\"." if r["rule"]["ship"] else
               "It did not pass the rule we wrote before running it, so the app still uses the phrase list alone.")
    w(verdict)
    w("")
    w("## What we tested")
    w("")
    w("The app's self-harm check is a hand-written phrase list. In Experiment 2 it missed 9 of our 15 self-harm test "
      "messages. Here a model learns self-harm language from labelled posts, in the same format as the tone model "
      "(TF-IDF over words and word pairs, then logistic regression), so the phone can run it. A post counts as self-harm "
      "language when it came from r/SuicideWatch or was tagged Suicidal. Depression, anxiety and stress posts count as not, "
      "so the model has to tell self-harm language apart from sadness.")
    w("")
    w(f"- **Posts.** {d['raw']:,} in the two files; {d['empty']:,} empty, {d['duplicates']:,} duplicates and "
      f"{d['conflicting_texts']:,} texts with both labels removed; {d['posts']:,} left. {pc(d['self_harm_share'])} are self-harm language.")
    w(f"- **Split.** {d['train']:,} train, {d['validation']:,} validation, {d['test']:,} test, stratified by source and label.")
    w(f"- **Chosen on validation.** {ch['vocab']:,} terms, {ch['tf']} tf, C {ch['C']}, threshold {ch['threshold']}. "
      f"The model file is {r['model_bytes'] / 1e6:.1f} MB.")
    w("- **The rule for the app, written first.** The model only ever adds a \"concern\", never the \"plan\" path. It goes "
      "in the app only if phrase list or model finds more self-harm test posts than the phrase list alone, and, on our 60 "
      "messages, finds more of the 15 self-harm messages with at most one more false alarm among the other 45.")
    w("")
    w("## Held-out posts")
    w("")
    rows = []
    for name, k, ci in (("Phrase list (in the app)", "phrase_list", t["phrase_ci"]), ("Model", "model", t["model_ci"]),
                        ("Phrase list or model", "either", None)):
        m = t[k]
        rng = (f" ({pc(ci['precision_95ci'][0], 1)} to {pc(ci['precision_95ci'][1], 1)})" if ci and ci["precision_95ci"] else "")
        rrng = (f" ({pc(ci['recall_95ci'][0], 1)} to {pc(ci['recall_95ci'][1], 1)})" if ci and ci["recall_95ci"] else "")
        rows.append([name, f"{m['flagged']:,}", pc(m["precision"], 1) + rng, pc(m["recall"], 1) + rrng,
                     f"{m['missed']:,}", f"{m['false_alarms']:,}"])
    w(e2_table(["Method", "Flagged", "Precision (95% range)", "Recall (95% range)", "Missed", "False alarms"], rows))
    w("")
    w(f"{t['self_harm_posts']:,} of the {t['posts']:,} test posts are self-harm language. The model's average precision is "
      f"{t['model_ap']:.3f} and its AUC {t['model_auc']:.3f}.")
    w("")
    w("Share of each kind of post flagged:")
    w("")
    w(e2_table(["Posts", "How many", "Self-harm label", "Model flagged", "Phrase list flagged"],
               [[g["group"], f"{g['posts']:,}", "yes" if g["self_harm"] else "no", pc(g["model_flagged"]), pc(g["phrase_flagged"])]
                for g in sorted(r["by_group"], key=lambda g: -g["posts"])]))
    w("")
    w("## Our 60 messages")
    w("")
    w(e2_table(["Slice", "Messages", "Self-harm", "Phrase list: found / false alarms", "Model: found / false alarms",
                "Either: found / false alarms"],
               [[s["slice"], s["messages"], s["self_harm"], f"{s['phrase_found']} / {s['phrase_false_alarms']}",
                 f"{s['model_found']} / {s['model_false_alarms']}", f"{s['either_found']} / {s['either_false_alarms']}"]
                for s in o["slices"]] +
               [["**all**", o["messages"], o["self_harm"], f"{o['phrase']['found']} / {o['phrase']['false_alarms']}",
                 f"{o['model']['found']} / {o['model']['false_alarms']}", f"{o['either']['found']} / {o['either']['false_alarms']}"]]))
    w("")
    w("## Words that weigh most")
    w("")
    w("- Toward self-harm: " + ", ".join(f"`{x}`" for x in r["top_terms"]["toward"]))
    w("- Away from it: " + ", ".join(f"`{x}`" for x in r["top_terms"]["away"]))
    w("")
    w("## Caveats")
    w("")
    for c in caveats(r):
        w(f"- {c}")
    w("")
    w("## How to run")
    w("")
    w("```")
    w("bash scripts/get_data.sh       # downloads both Kaggle files into data/")
    w(".venv/bin/python -I experiments/exp5_risk_words.py")
    w("```")
    w("")
    w("*This project is a prototype and is not medical advice. It was written with Claude (Anthropic).*")
    w("")
    return "\n".join(L)


def e2_table(head, rows) -> str:
    out = ["| " + " | ".join(map(str, head)) + " |", "| " + " | ".join("---" for _ in head) + " |"]
    out += ["| " + " | ".join(map(str, r)) + " |" for r in rows]
    return "\n".join(out)


if __name__ == "__main__":
    main()
