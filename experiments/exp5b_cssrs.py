#!/usr/bin/env python3
"""Experiment 5b: the self-harm model on posts labelled by psychiatrists.

Experiment 5 trained the self-harm model on posts labelled by where they were written
(r/SuicideWatch against r/teenagers, and a merged Kaggle set). A model can learn the forum
instead of the risk. This tests the shipped model (app/public/models/risk.json), unchanged,
on a set where every user comes from the same group of forums and four psychiatrists
labelled each one on the Columbia Suicide Severity Rating Scale (C-SSRS).

Data: Gaur et al., "Knowledge-aware Assessment of Severity of Suicide Risk for Early
Intervention" (WWW 2019), 500 anonymized Reddit users with their posts and one label each:
Supportive, Indicator, Ideation, Behavior or Attempt. CC BY 4.0,
https://zenodo.org/records/4543776 .

At risk = Ideation, Behavior or Attempt. Not at risk = Supportive (people helping others)
or Indicator (risk factors but no ideation). Steady scores each message on its own, so a
user counts as flagged when any one of their posts is flagged, by the model, by the phrase
list, or by either (what the app runs).

Writes results/exp5b/results.{json,md} and app/public/data/exp5b_summary.json.
Usage: .venv/bin/python -I experiments/exp5b_cssrs.py
"""
from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score

sys.path.insert(0, str(Path(__file__).resolve().parent))
import exp2_words as e2  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CSV = ROOT / "data" / "reddit_cssrs" / "500_users.csv"
MODEL = ROOT / "app" / "public" / "models" / "risk.json"
RESULTS = ROOT / "results" / "exp5b"
APP_SUMMARY = ROOT / "app" / "public" / "data" / "exp5b_summary.json"
GENERATED = "2026-11-15"
RISK = ["Ideation", "Behavior", "Attempt"]
ORDER = ["Supportive", "Indicator", "Ideation", "Behavior", "Attempt"]


class Scorer:
    """The app's scoring (scoreTone in app/src/engine/tone.ts), in Python."""

    def __init__(self, j: dict):
        self.index = {t: i for i, t in enumerate(j["vocab"])}
        self.idf, self.coef = j["idf"], j["coef"]
        self.b, self.sub, self.thr = j["intercept"], j["tf"] == "sublinear", j["threshold"]

    def score(self, text: str) -> float:
        counts: dict[int, int] = {}
        for f in e2.analyzer(text):
            i = self.index.get(f)
            if i is not None:
                counts[i] = counts.get(i, 0) + 1
        sq = dot = 0.0
        for i, c in counts.items():
            v = (1 + math.log(c) if self.sub else c) * self.idf[i]
            sq += v * v
            dot += v * self.coef[i]
        z = self.b + (dot / math.sqrt(sq) if sq > 0 else 0.0)
        return 1 / (1 + math.exp(-z))


def posts(cell: str) -> list[str]:
    """The Post column is a printed Python list whose quotes are not always escaped, so split it by hand."""
    s = cell.strip()
    s = s[1:-1] if s.startswith("[") and s.endswith("]") else s
    parts = re.split(r"""['"],\s*['"]""", s)
    return [p.strip().strip("'\"") for p in parts if p.strip().strip("'\"")]


def main() -> None:
    m = Scorer(json.loads(MODEL.read_text()))
    rules = e2.load_selfharm_rules()
    u = pd.read_csv(CSV)
    rows = []
    for _, r in u.iterrows():
        ps = posts(r["Post"])
        sc = [m.score(p) for p in ps]
        rows.append({"label": r["Label"], "risk": r["Label"] in RISK, "posts": len(ps), "max_score": max(sc),
                     "model": max(sc) >= m.thr,
                     "phrase": any(e2.check_selfharm(p, rules)["level"] != "none" for p in ps),
                     "phrase_plan": any(e2.check_selfharm(p, rules)["level"] == "plan" for p in ps)})
    d = pd.DataFrame(rows)
    d["either"] = d["model"] | d["phrase"]

    def conf(col):
        y, p = d["risk"], d[col]
        tp, fp = int((y & p).sum()), int((~y & p).sum())
        fn = int((y & ~p).sum())
        return {"flagged": int(p.sum()), "found": tp, "missed": fn, "false_alarms": fp,
                "recall": tp / (tp + fn), "precision": tp / (tp + fp) if tp + fp else None}

    by = []
    for lab in ORDER:
        g = d[d["label"] == lab]
        by.append({"label": lab, "users": int(len(g)), "risk": lab in RISK, "model": float(g["model"].mean()),
                   "phrase": float(g["phrase"].mean()), "either": float(g["either"].mean()),
                   "phrase_plan": float(g["phrase_plan"].mean())})
    sup_vs_ideation = d[d["label"].isin(["Supportive", "Ideation"])]
    res = {
        "generated": GENERATED, "users": int(len(d)), "at_risk": int(d["risk"].sum()),
        "posts": int(d["posts"].sum()), "threshold": m.thr,
        "model": conf("model"), "phrase": conf("phrase"), "either": conf("either"),
        "auc_max_score": float(roc_auc_score(d["risk"], d["max_score"])),
        "auc_supportive_vs_ideation": float(roc_auc_score(sup_vs_ideation["label"] == "Ideation", sup_vs_ideation["max_score"])),
        "by_label": by,
    }
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "results.json").write_text(json.dumps(res, indent=2) + "\n")
    (RESULTS / "results.md").write_text(render(res))
    APP_SUMMARY.write_text(json.dumps({"generated": GENERATED, "headline": headline(res),
                                       "auc": res["auc_max_score"], "by_label": by}, indent=2) + "\n")
    print(headline(res))
    for b in by:
        print(f"  {b['label']:11s} {b['users']:4d} users  model {b['model']:.0%}  phrase {b['phrase']:.0%}  either {b['either']:.0%}")


def pc(x):
    return "n/a" if x is None else f"{100 * x:.0f}%"


def headline(r) -> str:
    lab = {b["label"]: b for b in r["by_label"]}
    return (f"On {r['users']} Reddit users labelled by psychiatrists, the shipped self-harm model ranked at-risk users above "
            f"the rest at an AUC of {r['auc_max_score']:.2f}. With the phrase list it flagged {pc(r['either']['recall'])} of "
            f"at-risk users, but also {pc(lab['Supportive']['either'])} of users who were only supporting others.")


def render(r) -> str:
    L = []
    w = L.append
    w("# Experiment 5b: the self-harm model on posts labelled by psychiatrists")
    w("")
    w(f"Generated {r['generated']} by `experiments/exp5b_cssrs.py`. Data: Gaur et al., WWW 2019, 500 Reddit users labelled "
      "on the Columbia Suicide Severity Rating Scale by four psychiatrists, CC BY 4.0, https://zenodo.org/records/4543776 .")
    w("")
    w("## Short answer")
    w("")
    w(headline(r))
    w("")
    w("## Why this test")
    w("")
    w("Experiment 5 learned from posts labelled by the forum they came from. A model can learn the forum instead of the "
      "risk. Here every user comes from the same group of forums, and psychiatrists gave the labels, so the forum cannot "
      "give the answer away. The model was not changed. A user counts as flagged when any one of their posts is flagged, "
      "because Steady scores each message on its own.")
    w("")
    w("## Results")
    w("")
    w(f"{r['users']} users, {r['posts']:,} posts. At risk: Ideation, Behavior or Attempt ({r['at_risk']} users).")
    w("")
    w("| Method | Users flagged | At-risk users found | Missed | False alarms |")
    w("| --- | --- | --- | --- | --- |")
    for name, k in (("Phrase list", "phrase"), ("Model", "model"), ("Phrase list or model (the app)", "either")):
        c = r[k]
        w(f"| {name} | {c['flagged']} | {c['found']} of {r['at_risk']} ({pc(c['recall'])}) | {c['missed']} | {c['false_alarms']} |")
    w("")
    w("Share of each group with at least one flagged post:")
    w("")
    w("| Label | Users | At risk | Model | Phrase list | Either | Phrase list says plan |")
    w("| --- | --- | --- | --- | --- | --- | --- |")
    for b in r["by_label"]:
        w(f"| {b['label']} | {b['users']} | {'yes' if b['risk'] else 'no'} | {pc(b['model'])} | {pc(b['phrase'])} | "
          f"{pc(b['either'])} | {pc(b['phrase_plan'])} |")
    w("")
    w(f"Ranking users by their highest post score, the model scored an AUC of {r['auc_max_score']:.2f} overall and "
      f"{r['auc_supportive_vs_ideation']:.2f} for Ideation against Supportive.")
    w("")
    w("## What this means")
    w("")
    w("- The model does more than learn the forum: it ranks at-risk users above the rest inside the same forums.")
    w("- It cannot tell a person in crisis from a person talking someone else down. Supportive posts are full of the same "
      "words (\"please don't kill yourself\"). So in the app a flag from the model alone only asks the teen \"Are you safe "
      "right now?\" with 988 on screen. No answer sends nothing, and it does not count toward the repeat-flag rules. \"No\" "
      "still sends the urgent note. The phrase list keeps its 30-minute rule.")
    w("- These are users with many long posts. One short message carries much less.")
    w("- Next: train on labels like these, with a clinician, instead of forum labels.")
    w("")
    w("*This project is a prototype and is not medical advice. It was written with Claude (Anthropic).*")
    w("")
    return "\n".join(L)


if __name__ == "__main__":
    main()
