#!/usr/bin/env python3
"""Experiment 6: does the ask model hold up on teenagers?

Every model so far was trained on college students. This tests the ask model the app ships
(app/src/engine/ask_model.json, from Experiment 4) on teenagers it never saw, without
retraining it or changing its threshold.

Data: Corona Health, "Mental Health of Adolescents during COVID-19" (University of Wurzburg
and Wurzburg University Hospital; CC BY 4.0), https://zenodo.org/records/15101756 .
Teens aged 12 to 17 answered a baseline survey in an app, and some answered follow-ups,
2020 to 2025. Two items are the PHQ-2 (adolescent wording: "feeling down, depressed,
irritable or hopeless" and "little interest or pleasure in doing things"), each 0 to 3.
There is no stress or time-with-others item, so the model runs as the app does when a teen
skips the check-in: those inputs are missing and get the weight the model learned for missing.

For each answer that has earlier answers from the same teen, the model scores it from those
earlier answers alone (most recent PHQ-2 and the average of all earlier ones). The label is
whether that answer's PHQ-2 is 3 or more, the same cut-off as before.

  - Main test: each teen's first follow-up, scored from their baseline. One row per teen.
  - All answers: every later answer, scored from all earlier ones. A few teens answered
    dozens of times, so intervals come from resampling teens, not answers.
  - Asks: the model asks for the top 23% of scores (12 asks a year out of 52 weeks, as in
    Experiment 4), against asking at random, which lands on a high answer at the base rate.
  - Groups: girls and boys, as the hackathon asks for a check across groups.

Writes results/exp6/results.{json,md} and app/public/data/exp6_summary.json.

Usage: .venv/bin/python -I experiments/exp6_teens.py
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score

ROOT = Path(__file__).resolve().parent.parent
DIR = ROOT / "data" / "corona_health_ado"
MODEL = ROOT / "app" / "src" / "engine" / "ask_model.json"
RESULTS = ROOT / "results" / "exp6"
APP_SUMMARY = ROOT / "app" / "public" / "data" / "exp6_summary.json"
GENERATED = "2026-11-15"
SEED = 7
CUT = 3
ASK_SHARE = 12 / 52
REPS = 2000


def ask_score(model: dict, x: dict) -> float:
    """The app's arithmetic (app/src/engine/askmodel.ts), on one set of inputs."""
    z = model["intercept"]
    for i in model["inputs"]:
        k = i["name"]
        v = x.get(k)
        if v is None or (isinstance(v, float) and math.isnan(v)):
            z += model["missing"][k]
        else:
            z += model["weights"][k] * (v - model["mean"][k]) / model["scale"][k]
    return 1 / (1 + math.exp(-z))


def load() -> pd.DataFrame:
    b = pd.read_csv(DIR / "RKI_ado_baseline.csv", sep=None, engine="python")
    f = pd.read_csv(DIR / "RKI_ado_followUp.csv", sep=None, engine="python")
    sex = b.dropna(subset=["kj_sex"]).groupby("user_id")["kj_sex"].first()
    age = b.dropna(subset=["kj_age"]).groupby("user_id")["kj_age"].first()
    rows = pd.concat([b.assign(kind="baseline"), f.assign(kind="follow_up")], ignore_index=True)
    rows = rows.dropna(subset=["kj_phq_interest", "kj_phq_hope"]).copy()
    rows["phq2"] = rows["kj_phq_interest"].astype(int) + rows["kj_phq_hope"].astype(int)
    rows["at"] = pd.to_datetime(rows["collected_at"])
    rows = rows.sort_values(["user_id", "at"]).drop_duplicates(["user_id", "at"])
    rows["sex"] = rows["user_id"].map(sex)
    rows["age"] = rows["user_id"].map(age)
    return rows[["user_id", "kind", "at", "phq2", "sex", "age"]].reset_index(drop=True)


def scored(rows: pd.DataFrame, model: dict) -> pd.DataFrame:
    out = []
    for uid, g in rows.groupby("user_id"):
        g = g.reset_index(drop=True)
        for k in range(1, len(g)):
            prev = g.loc[: k - 1, "phq2"].to_numpy(float)
            x = {"last_phq2": prev[-1], "mean_phq2": prev.mean()}
            out.append({"user_id": uid, "n": k, "first": k == 1 and g.loc[0, "kind"] == "baseline",
                        "days_since": (g.loc[k, "at"] - g.loc[k - 1, "at"]).days, "sex": g.loc[k, "sex"],
                        "y": int(g.loc[k, "phq2"] >= CUT), "score": ask_score(model, x), "last_phq2": prev[-1]})
    return pd.DataFrame(out)


def asks(d: pd.DataFrame, thr: float) -> dict:
    ask = d["score"] >= thr
    y = d["y"].astype(bool)
    return {"answers": int(len(d)), "high": int(y.sum()), "base_rate": float(y.mean()), "asked": int(ask.sum()),
            "hit_rate": float(y[ask].mean()) if ask.any() else None, "missed": int((y & ~ask).sum()),
            "false_alarms": int((~y & ask).sum())}


def evaluate(d: pd.DataFrame, model_thr: float) -> dict:
    """AUC with a teen-level bootstrap, plus asks at the top 23% and at the app's own threshold."""
    rng = np.random.default_rng(SEED)
    auc = roc_auc_score(d["y"], d["score"]) if d["y"].nunique() == 2 else None
    users = d["user_id"].unique()
    by = {u: g for u, g in d.groupby("user_id")}
    boots = []
    for _ in range(REPS):
        s = pd.concat([by[u] for u in rng.choice(users, len(users), replace=True)])
        if s["y"].nunique() == 2:
            boots.append(roc_auc_score(s["y"], s["score"]))
    top = float(np.quantile(d["score"], 1 - ASK_SHARE))
    return {"teens": int(d["user_id"].nunique()), "answers": int(len(d)), "auc": auc,
            "auc_ci": [float(np.percentile(boots, 2.5)), float(np.percentile(boots, 97.5))] if boots else None,
            "top_share": asks(d, top), "app_threshold": asks(d, model_thr),
            "median_days_since_last": float(d["days_since"].median())}


def main() -> None:
    model = json.loads(MODEL.read_text())
    rows = load()
    d = scored(rows, model)
    first = d[d["first"]]
    res = {
        "generated": GENERATED,
        "data": {"answers_with_phq2": int(len(rows)), "teens": int(rows["user_id"].nunique()),
                 "teens_with_a_later_answer": int(d["user_id"].nunique()),
                 "ages": {str(int(k)): int(v) for k, v in rows.drop_duplicates("user_id")["age"].value_counts().sort_index().items()},
                 "first": str(rows["at"].min().date()), "last": str(rows["at"].max().date())},
        "model_threshold": model["threshold"],
        "first_follow_up": evaluate(first, model["threshold"]),
        "all_answers": evaluate(d, model["threshold"]),
        "last_answer_alone_auc_first": float(roc_auc_score(first["y"], first["last_phq2"])),
        "groups": {},
    }
    sex_names = {1: "Boys", 2: "Girls", 3: "Diverse", 4: "Did not say"}  # the codebook: 1 male, 2 female
    for code, g in d.groupby("sex"):
        name = sex_names.get(int(code), f"Other ({int(code)})")
        if g["y"].nunique() == 2 and g["user_id"].nunique() >= 10:
            res["groups"][name] = evaluate(g, model["threshold"])
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "results.json").write_text(json.dumps(res, indent=2) + "\n")
    (RESULTS / "results.md").write_text(render(res))
    f = res["first_follow_up"]
    APP_SUMMARY.write_text(json.dumps({
        "generated": GENERATED, "headline": headline(res), "teens": f["teens"], "auc": f["auc"], "auc_ci": f["auc_ci"],
        "hit_rate": f["top_share"]["hit_rate"], "base_rate": f["top_share"]["base_rate"],
        "all_answers_auc": res["all_answers"]["auc"], "groups": {k: v["auc"] for k, v in res["groups"].items()},
        "caveats": caveats(res)}, indent=2) + "\n")
    print(headline(res))
    for k, v in res["groups"].items():
        print(f"  {k}: AUC {v['auc']:.3f} on {v['answers']} answers from {v['teens']} teens")


def pc(x, nd=0):
    return "n/a" if x is None else f"{100 * x:.{nd}f}%"


def headline(r) -> str:
    f, a = r["first_follow_up"], r["all_answers"]
    return (f"On {f['teens']} teenagers aged 12 to 17 it never saw, the ask model from college students, unchanged, scored an "
            f"AUC of {f['auc']:.2f} for their next PHQ-2 ({f['auc_ci'][0]:.2f} to {f['auc_ci'][1]:.2f}). Asking the top 23% "
            f"by its score landed on a high answer {pc(f['top_share']['hit_rate'])} of the time, against {pc(f['top_share']['base_rate'])} "
            f"for asking at random. Over all {a['answers']} later answers it scored {a['auc']:.2f}.")


def caveats(r) -> list[str]:
    f = r["first_follow_up"]
    return [
        f"Only {f['teens']} teens answered again, mostly German-speaking, during the pandemic. The interval is wide.",
        f"The answers are not weekly: the median gap was {f['median_days_since_last']:.0f} days before the first follow-up. "
        "Teens chose when to answer, and the ones who came back may differ from the ones who did not.",
        "There is no check-in in this survey, so this tests only the earlier-answers part of the model.",
        "The PHQ-2 here uses the adolescent wording, which adds \"irritable\". It is a screening score, not a diagnosis.",
    ]


def render(r) -> str:
    L = []
    w = L.append
    d, f, a = r["data"], r["first_follow_up"], r["all_answers"]
    w("# Experiment 6: does the ask model hold up on teenagers?")
    w("")
    w(f"Generated {r['generated']} by `experiments/exp6_teens.py`. Data: Corona Health, \"Mental Health of Adolescents during "
      "COVID-19\" (University of Wurzburg; CC BY 4.0), https://zenodo.org/records/15101756 . Every number is an aggregate.")
    w("")
    w("## Short answer")
    w("")
    w(headline(r))
    w("")
    w("## What we tested")
    w("")
    w("The ask model the app ships, trained on college students in Experiment 4, scored teenagers it never saw. Nothing was "
      "retrained and the threshold was not moved. The survey has the two PHQ-2 questions but no check-in, so the model ran "
      "as the app does when a teen skips the check-in.")
    w("")
    w(f"- **Teens.** {d['teens']} teens gave {d['answers_with_phq2']} answers with both PHQ-2 items, {d['first']} to {d['last']}. "
      f"{d['teens_with_a_later_answer']} answered more than once. Ages at baseline: "
      + ", ".join(f"{k}: {v}" for k, v in d["ages"].items()) + ".")
    w("- **Label.** A PHQ-2 of 3 or more on that answer, as in every other experiment.")
    w("- **Inputs.** Only answers given before it: the most recent PHQ-2 and the average of all earlier ones.")
    w("")
    w("## Results")
    w("")
    rows = []
    for name, e in (("First follow-up, from baseline (one per teen)", f), ("Every later answer, from all earlier ones", a)):
        t = e["top_share"]
        rows.append([name, e["teens"], e["answers"], f"{e['auc']:.2f} ({e['auc_ci'][0]:.2f} to {e['auc_ci'][1]:.2f})",
                     pc(t["base_rate"]), pc(t["hit_rate"]), f"{t['missed']} of {t['high']}", t["false_alarms"]])
    w(table(["Test", "Teens", "Answers", "AUC (95% interval, resampling teens)", "Asking at random", "Asking the top 23%",
             "High answers missed", "False alarms"], rows))
    w("")
    w(f"The most recent answer alone scored {r['last_answer_alone_auc_first']:.2f} on the first follow-up, so here too nearly "
      "all the skill is in the earlier answers.")
    w("")
    t = f["app_threshold"]
    w(f"At the app's own threshold ({r['model_threshold']:.3f}) the model would have asked {t['asked']} of {t['answers']} "
      f"first follow-ups, and {pc(t['hit_rate'])} of those were high. The threshold was set for college students, so on "
      "teens it asks a different share.")
    w("")
    w("## Groups")
    w("")
    if r["groups"]:
        w(table(["Group", "Teens", "Answers", "AUC (95% interval)", "Asking at random", "Asking the top 23%"],
                [[k, v["teens"], v["answers"], f"{v['auc']:.2f} ({v['auc_ci'][0]:.2f} to {v['auc_ci'][1]:.2f})",
                  pc(v["top_share"]["base_rate"]), pc(v["top_share"]["hit_rate"])] for k, v in r["groups"].items()]))
        w("")
        w("These use every later answer, because too few teens answered more than once to split the first follow-ups.")
    else:
        w("Too few teens in each group to compare.")
    w("")
    w("## Caveats")
    w("")
    for c in caveats(r):
        w(f"- {c}")
    w("")
    w("## How to run")
    w("")
    w("```")
    w("bash scripts/get_data.sh       # downloads the three Zenodo files into data/corona_health_ado/")
    w(".venv/bin/python -I experiments/exp6_teens.py")
    w("```")
    w("")
    w("*This project is a prototype and is not medical advice. It was written with Claude (Anthropic).*")
    w("")
    return "\n".join(L)


def table(head, rows) -> str:
    out = ["| " + " | ".join(map(str, head)) + " |", "| " + " | ".join("---" for _ in head) + " |"]
    out += ["| " + " | ".join(map(str, r)) + " |" for r in rows]
    return "\n".join(out)


if __name__ == "__main__":
    main()
