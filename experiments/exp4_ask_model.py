#!/usr/bin/env python3
"""Experiment 4: the ask model the app runs.

Experiment 3 showed that a student's own answers pick the weeks to ask far better than
phone data. This trains the version of that model the app can run on a phone, and tests
it the same way: students never seen, the same ask budget, the same baselines.

What the app has each week, and so what the model may use:
  - a two-tap check-in: "Are you feeling stressed now?" (1 to 5) and "Have you spent most
    of your time alone or with others today?" (1 to 5), the study's own wording and scales
  - the average of the student's earlier check-ins
  - the student's most recent PHQ-2 score, and the average of all their PHQ-2 scores so far
The mood picture is left out: we could not verify how the study numbers its 16 pictures.

How old the earlier answers are matters. The study asked the PHQ-2 every week, and the
PHQ-2 asks about the last two weeks, so last week's answer shares days with this week's.
The app asks the two questions at most every two weeks. So the model is trained and tested
on earlier answers that are at least 11 days older than the week being scored (a median of
about two weeks old), which shares no day with this week's answer. The version with last week's
answers is reported as a reference row only.

A plain logistic regression on standardized inputs, with a flag for each missing input, so
the phone's arithmetic is one weighted sum.

Reads the tables Experiments 1 and 1b build. Writes:
    results/exp4/results.json, results/exp4/results.md
    app/src/engine/ask_model.json          weights, threshold, and test cases for the app's own check
    app/public/data/exp4_summary.json

Usage: .venv/bin/python experiments/exp4_ask_model.py
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

sys.path.insert(0, str(Path(__file__).resolve().parent))
import exp1_timing as ex  # noqa: E402
import exp1b_deeper as dx  # noqa: E402
import exp3_asking as e3  # noqa: E402

REPO = ex.REPO
RESULTS_DIR = REPO / "results" / "exp4"
MODEL_JSON = REPO / "app" / "src" / "engine" / "ask_model.json"
APP_JSON = REPO / "app" / "public" / "data" / "exp4_summary.json"
GENERATED = "2026-11-15"
SEED = ex.SEED
ASKS_PER_YEAR = 12.0

# name in the app, column in the study's table, plain description
FEATURES = [
    ("stress", "ci_last1_stress", "This week's check-in: stressed (1 not at all to 5 extremely)"),
    ("with_others", "ci_last1_social_level", "This week's check-in: time with others (1 almost always alone to 5 almost always with others)"),
    ("stress_usual", "ci_past_stress", "Average of the student's earlier stress answers"),
    ("with_others_usual", "ci_past_social_level", "Average of the student's earlier time-with-others answers"),
    ("last_phq2", "far_prev_phq2", "Most recent PHQ-2 score (0 to 6), at least two weeks old"),
    ("mean_phq2", "far_run_mean_phq2", "Average of all the student's PHQ-2 scores up to then"),
]
CHECKIN = ["stress", "with_others", "stress_usual", "with_others_usual"]
# reference only: last week's answers, which the app does not have and which overlap this week's
NEAR = {"last_phq2": "prev_phq2", "mean_phq2": "run_mean_phq2"}
SETS = {
    "full": [f[0] for f in FEATURES],
    "checkin_only": CHECKIN,
    "answers_only": ["last_phq2", "mean_phq2"],
    "weekly_reference": [f[0] for f in FEATURES],
}
SET_LABEL = {
    "full": "The ask model (check-in plus earlier answers)",
    "checkin_only": "Two-tap check-in alone",
    "answers_only": "Earlier PHQ-2 answers alone",
    "weekly_reference": "Reference: the same model with last week's answers",
}


def design(X: np.ndarray, mean: np.ndarray, scale: np.ndarray) -> np.ndarray:
    """Standardize, set a missing input to the average (0), and add a 0/1 flag per input."""
    miss = np.isnan(X)
    Z = (np.where(miss, mean, X) - mean) / scale
    return np.hstack([Z, miss.astype(float)])


def fit(X: np.ndarray, y: np.ndarray):
    mean = np.nanmean(X, axis=0)
    scale = np.nanstd(X, axis=0)
    scale = np.where(scale > 1e-9, scale, 1.0)
    m = LogisticRegression(C=1.0, max_iter=2000)
    m.fit(design(X, mean, scale), y.astype(int))
    return mean, scale, m


def oof(W: pd.DataFrame, cols: list[str], fold: np.ndarray) -> np.ndarray:
    """Scores for every monitored week from a model that never saw that student."""
    mon = W["monitored"].to_numpy()
    lab = mon & W["label"].notna().to_numpy()
    sid = W["sid"].to_numpy()
    y = W["label"].to_numpy()
    X = W[cols].to_numpy(float)
    p = np.full(len(W), np.nan)
    for f in range(dx.N_FOLDS):
        tr, te = lab & (fold != f), mon & (fold == f)
        if np.intersect1d(np.unique(sid[tr]), np.unique(sid[te])).size:
            raise AssertionError("a student appears in both train and test")
        mean, scale, m = fit(X[tr], y[tr])
        p[te] = m.predict_proba(design(X[te], mean, scale))[:, 1]
    return p


# Bigger models on the same six inputs, the same students and the same folds. None is shipped;
# they test whether a simple model is leaving accuracy behind. HistGradientBoosting is the
# histogram gradient boosting that XGBoost and LightGBM also use.
ALTERNATIVES = {
    "tree": ("A single decision tree (depth 4)", False,
             lambda: DecisionTreeClassifier(max_depth=4, min_samples_leaf=50, random_state=SEED)),
    "forest": ("Random forest (300 trees)", False,
               lambda: RandomForestClassifier(n_estimators=300, min_samples_leaf=20, n_jobs=-1, random_state=SEED)),
    "boost": ("Gradient-boosted trees (shallow, 300 rounds)", True,
              lambda: HistGradientBoostingClassifier(max_depth=3, learning_rate=0.05, max_iter=300, min_samples_leaf=40,
                                                     l2_regularization=1.0, random_state=SEED)),
    "mlp": ("Neural net (3 hidden layers: 128, 64, 32)", False,
            lambda: make_pipeline(StandardScaler(), MLPClassifier(hidden_layer_sizes=(128, 64, 32), alpha=1e-3,
                                                                  early_stopping=True, max_iter=500, random_state=SEED))),
}


def oof_other(W: pd.DataFrame, cols: list[str], fold: np.ndarray, make, nan_ok: bool) -> np.ndarray:
    """Like oof(), for a model from ALTERNATIVES. Models that cannot take a gap get the training median plus a flag."""
    mon = W["monitored"].to_numpy()
    lab = mon & W["label"].notna().to_numpy()
    y = W["label"].to_numpy()
    X = W[cols].to_numpy(float)
    p = np.full(len(W), np.nan)
    for f in range(dx.N_FOLDS):
        tr, te = lab & (fold != f), mon & (fold == f)
        Xtr, Xte = X[tr], X[te]
        if not nan_ok:
            med = np.nanmedian(Xtr, axis=0)
            Xtr = np.hstack([np.where(np.isnan(Xtr), med, Xtr), np.isnan(Xtr)])
            Xte = np.hstack([np.where(np.isnan(Xte), med, Xte), np.isnan(Xte)])
        m = make()
        m.fit(Xtr, y[tr].astype(int))
        p[te] = m.predict_proba(Xte)[:, 1]
    return p


def run_all() -> dict:
    t0 = time.time()
    W, _ = dx.build_tables()
    eid = ex.positive_episodes(W)
    mon = W["monitored"].to_numpy()
    lab = mon & W["label"].notna().to_numpy()
    sid = W["sid"].to_numpy()
    y = W["label"].to_numpy()
    fold = e3.student_folds(W)
    col = {f[0]: f[1] for f in FEATURES}
    rate = ASKS_PER_YEAR / ex.WEEKS_PER_YEAR

    rows = {}
    for key, names in SETS.items():
        cols = [NEAR.get(n, col[n]) if key == "weekly_reference" else col[n] for n in names]
        s = oof(W, cols, fold)
        e = dx.evaluate(y[lab], s[lab], sid[lab])
        k = list(SETS).index(key)
        ask = e3.top_asks(W, s, rate, fold, seed=SEED + k)
        c = e3.compact(ex.ask_comparison(W, ask, eid, seed=SEED + 4000 + k))
        rows[key] = {"label": SET_LABEL[key], "inputs": names,
                     "auc": e["auc"], "auc_ci": e["auc_ci"], "within_student_auc": e["within_student_auc"],
                     "pr_auc": e["pr_auc"], **c}
        print(f"  {key:13s} AUC {e['auc']:.3f}  hit {c['hit_rate']:.3f}  calendar {c['calendar_hit_rate']:.3f}  "
              f"matched random {c['matched_random_hit_rate']:.3f}", flush=True)

    # the same inputs in bigger models
    others = {}
    cols_full = [col[n] for n in SETS["full"]]
    for i, (key, (label, nan_ok, make)) in enumerate(ALTERNATIVES.items()):
        s = oof_other(W, cols_full, fold, make, nan_ok)
        e = dx.evaluate(y[lab], s[lab], sid[lab])
        ask = e3.top_asks(W, s, rate, fold, seed=SEED + 100 + i)
        c = e3.compact(ex.ask_comparison(W, ask, eid, seed=SEED + 4100 + i))
        others[key] = {"label": label, "auc": e["auc"], "auc_ci": e["auc_ci"], "within_student_auc": e["within_student_auc"], **c}
        print(f"  {key:13s} AUC {e['auc']:.3f}  hit {c['hit_rate']:.3f}", flush=True)

    # the model the app ships: every labelled monitored week, every student
    names = SETS["full"]
    X = W[[col[n] for n in names]].to_numpy(float)
    mean, scale, m = fit(X[lab], y[lab])
    score_all = m.predict_proba(design(X, mean, scale))[:, 1]
    threshold = float(np.quantile(score_all[mon], 1 - rate))      # asks in this share of weeks
    coef = m.coef_[0]
    weights = {n: float(coef[i]) for i, n in enumerate(names)}
    missing = {n: float(coef[len(names) + i]) for i, n in enumerate(names)}

    # test cases for the app: the app's arithmetic must give these scores
    rng = np.random.default_rng(SEED)
    pick = rng.choice(np.flatnonzero(mon), size=24, replace=False)
    cases = []
    for i in pick:
        cases.append({"inputs": {n: (None if np.isnan(X[i, j]) else round(float(X[i, j]), 4)) for j, n in enumerate(names)}})
    Xc = np.array([[np.nan if c["inputs"][n] is None else c["inputs"][n] for n in names] for c in cases], float)
    for c, sc in zip(cases, m.predict_proba(design(Xc, mean, scale))[:, 1]):
        c["score"] = round(float(sc), 6)

    model = {
        "name": "steady-ask",
        "created": GENERATED,
        "task": "Chance that the student's next PHQ-2 would be 3 or more; used only to decide when to ask the two questions",
        "trained_on": "College Experience Study (Dartmouth), 213 students, labelled monitored weeks. CC BY-NC-SA 4.0, academic use.",
        "note": "Earlier PHQ-2 answers used in training were at least 11 days older than the week scored "
                f"(median {float(np.nanmedian(W.loc[mon, 'far_weeks_since_prev'])):.1f} weeks).",
        "inputs": [{"name": f[0], "what": f[2]} for f in FEATURES],
        "mean": {n: round(float(mean[i]), 6) for i, n in enumerate(names)},
        "scale": {n: round(float(scale[i]), 6) for i, n in enumerate(names)},
        "weights": {k: round(v, 6) for k, v in weights.items()},
        "missing": {k: round(v, 6) for k, v in missing.items()},
        "intercept": round(float(m.intercept_[0]), 6),
        "threshold": round(threshold, 6),
        "asks_per_year_at_threshold": ASKS_PER_YEAR,
        "cases": cases,
    }
    return {
        "generated": GENERATED,
        "dataset": "College Experience Study (Dartmouth), CC BY-NC-SA 4.0, academic use only",
        "label": "PHQ-2 of 3 or more, the answer nearest the end of the week (as in Experiment 1)",
        "data": {"students": int(len(np.unique(sid[mon]))), "monitored_weeks": int(mon.sum()), "labelled_weeks": int(lab.sum()),
                 "base_rate": float(y[lab].mean())},
        "asks_per_year": ASKS_PER_YEAR,
        "models": rows,
        "alternatives": others,
        "answer_age_weeks_median": float(np.nanmedian(W.loc[mon, "far_weeks_since_prev"])),
        "shipped": {k: model[k] for k in ("inputs", "mean", "scale", "weights", "missing", "intercept", "threshold")},
        "_model": model,
        "runtime_seconds": round(time.time() - t0, 1),
    }


def pc(x, nd=1):
    return f"{100 * x:.{nd}f}%"


def headline(res: dict) -> str:
    f, c = res["models"]["full"], res["models"]["checkin_only"]
    return (f"The ask model the app runs scored an AUC of {f['auc']:.2f} on students it never saw. At 12 asks per "
            f"student-year, {pc(f['hit_rate'], 0)} of its asks landed on a week with a high PHQ-2, against "
            f"{pc(f['calendar_hit_rate'], 0)} for a fixed calendar. It finds who to ask more often, not which week: "
            f"random weeks for the same students did as well ({pc(f['matched_random_hit_rate'], 0)}).")


def caveats(res: dict) -> list[str]:
    return [
        "These are Dartmouth college students from 2017 to 2022. Stability is meant for high school students.",
        "The label is a weekly PHQ-2 answered on the phone. It is a screening score, and a doctor makes the diagnosis.",
        "Most of the model's skill comes from the student's earlier PHQ-2 answers: a student who scored high tends to score "
        "high again. It finds who to ask more often. It does not pick the week: random weeks for the same students in the "
        "same term did as well.",
        f"The earlier answers were at least 11 days old, a median of {res['answer_age_weeks_median']:.1f} weeks. The app asks once a month unless the model "
        "asks sooner, so its answers will often be older than that, and the model will do worse than this.",
        "In the study the check-in questions came in the same survey as the PHQ-2. We cannot tell whether students would "
        "answer a two-tap check-in every week.",
        "The study asked the questions about today and now. The app asks them once a week.",
        "The threshold gives 12 asks per student-year on these students. On other students the number of asks will differ.",
        "The shipped weights are fit on every student, so the numbers above come from the five-fold versions of the same model.",
    ]


def render_markdown(res: dict) -> str:
    L: list[str] = []
    w = L.append
    d, M, S = res["data"], res["models"], res["shipped"]
    w("# Experiment 4: the ask model the app runs")
    w("")
    w(f"Generated {res['generated']} by `experiments/exp4_ask_model.py`. Data: College Experience Study (Dartmouth), "
      "CC BY-NC-SA 4.0, used for academic purposes only. Every number below is an aggregate over students.")
    w("")
    w("## Short answer")
    w("")
    w(headline(res))
    w("")
    w("## What it is")
    w("")
    w("Experiment 3 found that a student's own answers pick the weeks to ask far better than phone data. This is that "
      "model in a form a phone can run: a logistic regression on six numbers the app already has. It decides one thing, "
      "when to show the two screening questions. It never sends a parent anything; that still rests on the questionnaire score.")
    w("")
    w(e3.md_table(["Input", "What it is", "Weight", "Weight when missing"],
                  [[i["name"], i["what"], f"{S['weights'][i['name']]:+.2f}", f"{S['missing'][i['name']]:+.2f}"] for i in S["inputs"]]))
    w("")
    w(f"Each input is standardized first, so the weights can be compared. The intercept is {S['intercept']:.2f}. The app asks "
      f"when the score is {S['threshold']:.3f} or more, which gave {res['asks_per_year']:.0f} asks per student-year here.")
    w("")
    w("## Results")
    w("")
    w(f"{d['students']} students, {d['labelled_weeks']:,} labelled weeks, base rate {pc(d['base_rate'])}. Five folds split by "
      f"student, so every score comes from a model that never saw that student. Asks: {res['asks_per_year']:.0f} per student-year.")
    w("")
    rows = []
    for k in ("full", "answers_only", "checkin_only", "weekly_reference"):
        r = M[k]
        rows.append([r["label"], f"{r['auc']:.2f} ({r['auc_ci'][0]:.2f} to {r['auc_ci'][1]:.2f})", f"{r['within_student_auc']:.2f}",
                     pc(r["hit_rate"]), pc(r["calendar_hit_rate"]), pc(r["matched_random_hit_rate"]),
                     f"{r['high_weeks_missed']:,} of {r['high_weeks']:,}", f"{r['false_alarms']:,}", pc(r["share_low_periods_reached"], 0)])
    w(e3.md_table(["Model", "AUC (95% interval)", "Within-student AUC", "Hit rate", "Fixed calendar",
                   "Random weeks, same student and quarter", "High weeks missed", "False alarms", "Low periods reached"], rows))
    w("")
    f, a, c, ref = M["full"], M["answers_only"], M["checkin_only"], M["weekly_reference"]
    w(f"- **Against the calendar.** {pc(f['hit_rate'])} of the ask model's asks landed on a high week, against "
      f"{pc(f['calendar_hit_rate'])} ({100 * f['minus_calendar']:+.1f} points, 95% interval "
      f"{100 * f['minus_calendar_ci'][0]:.1f} to {100 * f['minus_calendar_ci'][1]:.1f}).")
    w(f"- **What the check-in adds.** A little. Earlier answers alone scored {a['auc']:.3f} and reached "
      f"{pc(a['share_low_periods_reached'], 0)} of low periods; with the check-in the model scored {f['auc']:.3f} and reached "
      f"{pc(f['share_low_periods_reached'], 0)}. Within one student's own weeks the AUC went from {a['within_student_auc']:.2f} "
      f"to {f['within_student_auc']:.2f}. The check-in alone scored {c['auc']:.2f}, so it matters most before a student has "
      f"answered the two questions at all.")
    w(f"- **Who, not when.** Random weeks from the same student and quarter reached {pc(f['matched_random_hit_rate'])}, "
      f"as good as the model's {pc(f['hit_rate'])}. The model finds which students to ask more often. It does not pick the week.")
    w(f"- **Older answers.** The model sees earlier answers that are at least 11 days old, as the app would. With last "
      f"week's answers, which overlap this week's, the same model scored {ref['auc']:.2f}. We report the lower number.")
    w(f"- **What it still misses.** {f['high_weeks_missed']:,} of {f['high_weeks']:,} high weeks got no ask at this budget, and "
      f"{f['false_alarms']:,} asks landed on weeks that were not high.")
    w("")
    w("## Bigger models")
    w("")
    w("The same six inputs, students and folds, in models that can find curves and interactions. None beat the "
      "logistic regression: every 95% interval overlaps. Most of the signal is one straight-line pattern (a student who "
      "scored high before tends to score high again), so there is little for a bigger model to add. The app keeps the "
      "logistic regression because it runs in a few lines on the phone, each input has one weight anyone can read, and a "
      "test checks the app gives the same scores as this script.")
    w("")
    arows = [["Logistic regression (the ask model in the app)", f"{f['auc']:.3f} ({f['auc_ci'][0]:.3f} to {f['auc_ci'][1]:.3f})", f"{f['within_student_auc']:.2f}",
              pc(f["hit_rate"]), f"{f['high_weeks_missed']:,}", f"{f['false_alarms']:,}"]]
    for o in res["alternatives"].values():
        arows.append([o["label"], f"{o['auc']:.3f} ({o['auc_ci'][0]:.3f} to {o['auc_ci'][1]:.3f})", f"{o['within_student_auc']:.2f}",
                      pc(o["hit_rate"]), f"{o['high_weeks_missed']:,}", f"{o['false_alarms']:,}"])
    w(e3.md_table(["Model", "AUC (95% interval)", "Within-student AUC", "Hit rate", "High weeks missed", "False alarms"], arows))
    w("")
    w("Gradient-boosted trees here are scikit-learn's histogram gradient boosting, the same method XGBoost and LightGBM use. "
      "Models that cannot take a missing input got the training median and a missing flag.")
    w("")
    w("## In the app")
    w("")
    w("- The weights are in `app/src/engine/ask_model.json`, with 24 test cases. `app/src/engine/askmodel.test.ts` checks that "
      "the app's arithmetic gives the same scores as this script.")
    w("- Each week the teen can answer the two-tap check-in. At the week's end the app scores it with their earlier answers and "
      "asks the two questions when the score reaches the threshold.")
    w("- It waits at least two weeks after the last ask. Everyone is also asked once a month, whatever the score.")
    w("- If the teen has not checked in for two weeks, the app falls back to its phone signals to decide when to ask.")
    w("")
    w("## Caveats")
    w("")
    for cv in caveats(res):
        w(f"- {cv}")
    w("")
    w("## How to run")
    w("")
    w("```")
    w(".venv/bin/python experiments/exp1_timing.py     # builds the weekly table")
    w(".venv/bin/python experiments/exp1b_deeper.py    # builds the feature table")
    w(".venv/bin/python experiments/exp4_ask_model.py")
    w("```")
    w("")
    w("*This is a prototype analysis and is not medical advice. It was written with Claude (Anthropic).*")
    w("")
    return "\n".join(L)


def main() -> None:
    res = run_all()
    model = res.pop("_model")
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    out = dict(res)
    out["headline"], out["caveats"] = headline(res), caveats(res)
    (RESULTS_DIR / "results.json").write_text(json.dumps(ex._py(out), indent=2) + "\n")
    (RESULTS_DIR / "results.md").write_text(render_markdown(res))
    MODEL_JSON.write_text(json.dumps(model, indent=1) + "\n")
    f = res["models"]["full"]
    APP_JSON.write_text(json.dumps(ex._py({
        "generated": res["generated"], "students": res["data"]["students"], "asks_per_year": res["asks_per_year"],
        "auc": f["auc"], "auc_ci": f["auc_ci"], "hit_rate": f["hit_rate"], "calendar_hit_rate": f["calendar_hit_rate"],
        "high_weeks_missed": f["high_weeks_missed"], "high_weeks": f["high_weeks"], "false_alarms": f["false_alarms"],
        "matched_random_hit_rate": f["matched_random_hit_rate"], "within_student_auc": f["within_student_auc"],
        "low_periods_reached": f["share_low_periods_reached"],
        "checkin_only_auc": res["models"]["checkin_only"]["auc"], "answers_only_auc": res["models"]["answers_only"]["auc"],
        "weekly_reference_auc": res["models"]["weekly_reference"]["auc"],
        "headline": headline(res), "caveats": caveats(res)}), indent=2) + "\n")
    print(headline(res))
    print(json.dumps({k: model[k] for k in ("weights", "missing", "intercept", "threshold")}, indent=1))


if __name__ == "__main__":
    main()
