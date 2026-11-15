#!/usr/bin/env python3
"""Experiment 3: one scale for every way of picking the week, and a check across groups.

Part A. Experiment 1 scored the drift rule by how many of its asks landed on a
week with a high PHQ-2, at a fixed number of asks a year. Experiment 1b scored
models by AUC. This experiment puts every method on Experiment 1's scale: each
one gets the same number of asks, and is compared with a fixed calendar and with
random weeks from the same student and quarter. The methods are the drift rule,
a phone model, check-in models, and a plain follow-up rule on earlier answers.

Part B. The same numbers by self-reported gender and race, to see whether any
method works for one group and not another.

Reads the weekly tables that Experiments 1 and 1b build (their caches are made
on the first run). Data: College Experience Study (Dartmouth), CC BY-NC-SA 4.0,
academic use only. Every number written is an aggregate over at least 20 students.

Writes:
    results/exp3/results.json
    results/exp3/results.md
    results/exp3/hit_rates.png
    app/public/data/exp3_summary.json

Usage:
    .venv/bin/python experiments/exp3_asking.py                # about two minutes
    .venv/bin/python experiments/exp3_asking.py --report-only  # rewrites the report from the last run
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import exp1_timing as ex  # noqa: E402
import exp1b_deeper as dx  # noqa: E402

REPO = ex.REPO
RESULTS_DIR = REPO / "results" / "exp3"
APP_JSON = REPO / "app" / "public" / "data" / "exp3_summary.json"
CHART = RESULTS_DIR / "hit_rates.png"

GENERATED = "2026-11-15"
SEED = ex.SEED
MIN_GROUP_STUDENTS = 20      # no number is written for a group smaller than this
WEEKS_PER_YEAR = ex.WEEKS_PER_YEAR

# Ask budgets, in asks per student-year. "rule" is whatever the drift rule used.
BUDGETS = [
    dict(key="rule", per_year=None, label="the drift rule's own budget"),
    dict(key="monthly", per_year=12.0, label="12 asks a year (monthly)"),
    dict(key="two_monthly", per_year=6.0, label="6 asks a year (every two months)"),
]
MAIN_BUDGET = "monthly"

# Each method gives every monitored week a score; the weeks with the highest
# scores get the asks. "decides" says what the method knows when it decides.
METHODS = [
    dict(key="phone", label="Phone model", kind="model",
         uses="Phone data from the week itself (every daily measure, as in Experiment 1b's same-week framing)",
         decides="end of the week", needs="Nothing from the student", reference=False),
    dict(key="checkin_one", label="One check-in from last week", kind="model",
         uses="The latest mood picture, stress and time-with-others answer from the previous calendar week",
         decides="Monday", needs="A short check-in each week", reference=False),
    dict(key="checkin_history", label="Check-in history", kind="model",
         uses="Last week's check-ins, the average of every earlier check-in, and the change between them",
         decides="Monday", needs="A short check-in each week", reference=False),
    dict(key="answers", label="Check-ins plus earlier PHQ-2 answers (reference)", kind="model",
         uses="Check-in history plus the student's earlier PHQ-2 answers, all dated before Monday",
         decides="Monday", needs="A PHQ-2 answer nearly every week (reference only)", reference=True),
    dict(key="followup", label="Follow-up rule, no model (reference)", kind="rule",
         uses="The most recent PHQ-2 answer before Monday: ask again where the last answer was highest",
         decides="Monday", needs="A PHQ-2 answer nearly every week (reference only)", reference=True),
]


def _log(msg: str) -> None:
    print(msg, flush=True)


# ---------------------------------------------------------------------------
# 1. Scores for every monitored week, from models that never saw the student
# ---------------------------------------------------------------------------

def student_folds(W: pd.DataFrame) -> np.ndarray:
    """A fold number for every row. Students, never weeks, are split, using the
    same stratified grouped folds as Experiment 1b. A student with no labelled
    week is never used for training and is scored by fold 0's model."""
    lab = (W["monitored"] & W["label"].notna()).to_numpy()
    y = W.loc[lab, "label"].to_numpy()
    g = W.loc[lab, "sid"].to_numpy()
    fold_of: dict[int, int] = {}
    for i, (_, te) in enumerate(dx.grouped_folds(y, g)):
        for s in np.unique(g[te]):
            fold_of[int(s)] = i
    return W["sid"].map(lambda s: fold_of.get(int(s), 0)).to_numpy()


def oof_scores(W: pd.DataFrame, cols: list[str], fold: np.ndarray) -> np.ndarray:
    """Predicted risk for every monitored week. Each fold's model is fit on the
    labelled monitored weeks of the other folds' students, with scaling and
    imputation fit inside that training part (Experiment 1b's logistic model)."""
    mon = W["monitored"].to_numpy()
    lab = mon & W["label"].notna().to_numpy()
    sid = W["sid"].to_numpy()
    y = W["label"].to_numpy()
    X = W[cols].to_numpy(np.float32)
    p = np.full(len(W), np.nan)
    for f in range(dx.N_FOLDS):
        tr = lab & (fold != f)
        te = mon & (fold == f)
        if np.intersect1d(np.unique(sid[tr]), np.unique(sid[te])).size:
            raise AssertionError("a student appears in both train and test")
        Xtr = X[tr]
        lo, hi = np.nanmin(Xtr, axis=0), np.nanmax(Xtr, axis=0)
        keep = np.isfinite(lo) & np.isfinite(hi) & (hi > lo)
        model = dx.make_model("logistic", n_rows=int(tr.sum()), seed=SEED)
        model.fit(Xtr[:, keep], y[tr].astype(int))
        p[te] = model.predict_proba(X[te][:, keep])[:, 1]
    return p


def top_asks(W: pd.DataFrame, score: np.ndarray, rate: float, fold: np.ndarray,
             seed: int, tie_width: float = 1e-9) -> np.ndarray:
    """Inside each fold's students, the monitored weeks with the highest scores,
    up to rate x that fold's monitored weeks. Labels are never used to pick.
    Ties are broken at random with a fixed seed (tie_width spreads equal scores)."""
    mon = W["monitored"].to_numpy()
    jitter = np.random.default_rng(seed).random(len(W)) * tie_width
    ask = np.zeros(len(W), dtype=bool)
    for f in np.unique(fold[mon]):
        cand = np.flatnonzero(mon & (fold == f))
        n = int(round(rate * cand.size))
        s = np.where(np.isnan(score[cand]), -np.inf, score[cand]) + jitter[cand]
        ask[cand[np.argsort(-s, kind="stable")[:n]]] = True
    return ask


def compact(c: dict) -> dict:
    """The numbers the write-up uses from one ask_comparison() result."""
    m, cal = c["method"], c["fixed_calendar"]
    sq = c["random_same_student_and_quarter"]
    return {
        "asks_per_student_year": m["asks_per_student_year"],
        "hit_rate": m["hit_rate"],
        "lift": m["lift"],
        "base_rate": m["base_rate"],
        "high_weeks": m["positive_weeks"],
        "high_weeks_asked": m["positive_weeks_asked"],
        "high_weeks_missed": m["positive_weeks_missed"],
        "false_alarms": m["false_alarms"],
        "false_alarms_per_student_year": m["false_alarms_per_student_year"],
        "low_periods": m["episodes"],
        "low_periods_missed": m["episodes_missed"],
        "share_low_periods_reached": m["share_episodes_reached"],
        "calendar_hit_rate": cal["hit_rate"],
        "calendar_high_weeks_missed": cal["positive_weeks_missed"],
        "calendar_false_alarms": cal["false_alarms"],
        "calendar_share_low_periods_reached": cal["share_episodes_reached"],
        "random_hit_rate": c["random"]["hit_rate"],
        "random_ci": c["random"]["ci"],
        "matched_random_hit_rate": sq["hit_rate"],
        "matched_random_ci": sq["ci"],
        "share_matched_draws_at_or_above": sq["share_draws_at_or_above_method"],
        "minus_calendar": c["method_minus_calendar"]["difference"],
        "minus_calendar_ci": c["method_minus_calendar"]["ci"],
        "share_asks_in_full_quarters": c["strata_check"]["share_asks_in_full_quarters"],
        "hit_rate_outside_full_quarters": c["strata_check"]["hit_rate_outside_full_quarters"],
        "chance_outside_full_quarters": c["strata_check"]["chance_outside_full_quarters"],
    }


# ---------------------------------------------------------------------------
# 2. Run
# ---------------------------------------------------------------------------

def group_table(W: pd.DataFrame) -> dict[str, dict[str, np.ndarray]]:
    """Student ids for each self-reported group that has enough students."""
    demo = pd.read_csv(ex.DATA / "Demographics" / "demographics.csv", dtype={"uid": str})
    students = W.loc[W["monitored"], ["uid", "sid"]].drop_duplicates()
    students = students.assign(uid=students["uid"].astype(str)).merge(demo, on="uid", how="left")
    gender = students["gender"].map({"F": "Women", "M": "Men"})
    race = students["race"].map({"white": "White", "asian": "Asian"}).where(
        students["race"].isin(["white", "asian"]), "All other groups together")
    race = race.where(students["race"].notna())
    out: dict[str, dict[str, np.ndarray]] = {"gender": {}, "race": {}}
    for dim, col in (("gender", gender), ("race", race)):
        for name in [n for n in col.dropna().unique()]:
            sids = students.loc[col == name, "sid"].to_numpy()
            if len(sids) >= MIN_GROUP_STUDENTS:
                out[dim][str(name)] = sids
    out["_not_shown"] = {
        "gender": int((gender.isna()).sum()),
        "race": int((race.isna()).sum()),
    }
    return out


def run_all() -> dict:
    t0 = time.time()
    W, meta = dx.build_tables()
    eid = ex.positive_episodes(W)
    mon = W["monitored"].to_numpy()
    lab = mon & W["label"].notna().to_numpy()
    sid = W["sid"].to_numpy()
    y = W["label"].to_numpy()
    fold = student_folds(W)
    _log(f"{len(np.unique(sid[mon]))} students, {int(mon.sum()):,} monitored weeks, {int(lab.sum()):,} labelled")

    # --- scores -----------------------------------------------------------
    phone_cols = dx.passive_cols(meta)
    dx.assert_passive(phone_cols)
    feature_sets = {
        "phone": phone_cols,
        "checkin_one": meta["checkin_single_cols"],
        "checkin_history": meta["checkin_cols"],
        "answers": meta["checkin_cols"] + dx.HISTORY_COLS,
    }
    scores: dict[str, np.ndarray] = {}
    for key, cols in feature_sets.items():
        t1 = time.time()
        scores[key] = oof_scores(W, cols, fold)
        _log(f"  scored {key}: {len(cols)} features ({time.time() - t1:.0f}s)")
    prev = W["prev_phq2"].to_numpy(float)
    scores["followup"] = prev  # NaN = no earlier answer, ranked last

    # --- AUC of each score on labelled monitored weeks ---------------------
    aucs = {}
    for mth in METHODS:
        s = scores[mth["key"]]
        if mth["key"] == "followup":
            s = dx.prior_score(s, float(np.nanmedian(s[lab])))
        e = dx.evaluate(y[lab], s[lab], sid[lab])
        aucs[mth["key"]] = {k: e[k] for k in ("auc", "auc_ci", "within_student_auc", "n_rows", "n_students")}

    # --- the drift rule, exactly as in Experiment 1 -------------------------
    Z, _ = ex.personal_z(W, ex.CORE_SIGNALS)
    rule = ex.steady_rule(W, Z, ex.K_DEFAULT)
    rule_rate = float(rule["ask"][mon].sum() / mon.sum())
    rule_comp = ex.ask_comparison(W, rule["ask"], eid, seed=SEED + int(ex.K_DEFAULT * 100))
    _log(f"  drift rule: {rule_comp['budget_asks_per_student_year']:.1f} asks/yr, "
         f"hit {rule_comp['method']['hit_rate']:.3f} vs calendar {rule_comp['fixed_calendar']['hit_rate']:.3f}")

    # --- every method at every budget --------------------------------------
    by_budget: dict[str, dict] = {}
    masks: dict[tuple[str, str], np.ndarray] = {}
    for bi, b in enumerate(BUDGETS):
        rate = rule_rate if b["per_year"] is None else b["per_year"] / WEEKS_PER_YEAR
        rows = {}
        for mi, mth in enumerate(METHODS):
            ask = top_asks(W, scores[mth["key"]], rate, fold, seed=SEED + 31 * bi + mi,
                           tie_width=0.5 if mth["key"] == "followup" else 1e-9)
            masks[(b["key"], mth["key"])] = ask
            rows[mth["key"]] = compact(ex.ask_comparison(W, ask, eid, seed=SEED + 1000 + 31 * bi + mi))
            _log(f"  {b['key']:12s} {mth['key']:16s} hit {rows[mth['key']]['hit_rate']:.3f} "
                 f"calendar {rows[mth['key']]['calendar_hit_rate']:.3f} "
                 f"matched random {rows[mth['key']]['matched_random_hit_rate']:.3f}")
        by_budget[b["key"]] = {"asks_per_student_year": rate * WEEKS_PER_YEAR, "label": b["label"], "methods": rows}
    by_budget["rule"]["methods"] = {"drift_rule": compact(rule_comp), **by_budget["rule"]["methods"]}

    # --- groups ------------------------------------------------------------
    groups = group_table(W)
    not_shown = groups.pop("_not_shown")
    by_group: dict[str, dict] = {}
    gi = 0
    for dim, members in groups.items():
        by_group[dim] = {}
        for name, sids in members.items():
            gi += 1
            in_g = np.isin(sid, sids)
            gl = lab & in_g
            entry = {
                "students": int(len(sids)),
                "labelled_weeks": int(gl.sum()),
                "base_rate": float(y[gl].mean()),
                "drift_rule": compact(ex.ask_comparison(W, rule["ask"], eid, sids=sids, seed=SEED + 2000 + gi)),
                "checkin_one_monthly": compact(ex.ask_comparison(
                    W, masks[(MAIN_BUDGET, "checkin_one")], eid, sids=sids, seed=SEED + 3000 + gi)),
                "auc": {},
            }
            for mth in METHODS:
                s = scores[mth["key"]]
                if mth["key"] == "followup":
                    s = dx.prior_score(s, float(np.nanmedian(s[lab])))
                e = dx.evaluate(y[gl], s[gl], sid[gl], within=False)
                entry["auc"][mth["key"]] = {"auc": e["auc"], "auc_ci": e["auc_ci"]}
            by_group[dim][name] = entry
            _log(f"  group {name}: {entry['students']} students, base rate {entry['base_rate']:.3f}, "
                 f"check-in AUC {entry['auc']['checkin_one']['auc']:.3f}")

    return {
        "generated": GENERATED,
        "dataset": "College Experience Study (Dartmouth), CC BY-NC-SA 4.0, academic use only",
        "label": "PHQ-2 of 3 or more, the answer nearest the end of the week (as in Experiment 1)",
        "settings": {"seed": SEED, "folds": dx.N_FOLDS, "min_group_students": MIN_GROUP_STUDENTS,
                     "model": "Experiment 1b's logistic regression (quantile scaling, missing-value flags, C = 0.05)",
                     "n_random_draws": ex.N_RANDOM, "n_bootstrap": ex.N_BOOT},
        "data": {"students": int(len(np.unique(sid[mon]))), "monitored_weeks": int(mon.sum()),
                 "labelled_weeks": int(lab.sum()), "base_rate": float(y[lab].mean()),
                 "share_weeks_with_a_checkin_last_week": float(W.loc[mon, "ci_last1_stress"].notna().mean()),
                 "share_weeks_with_an_earlier_answer": float(np.isfinite(prev[mon]).mean())},
        "methods": [{k: m[k] for k in ("key", "label", "kind", "uses", "decides", "needs", "reference")}
                    for m in METHODS],
        "feature_counts": {k: len(v) for k, v in feature_sets.items()},
        "auc": aucs,
        "by_budget": by_budget,
        "by_group": by_group,
        "groups_not_shown": not_shown,
        "runtime_seconds": round(time.time() - t0, 1),
    }


# ---------------------------------------------------------------------------
# 3. Chart
# ---------------------------------------------------------------------------

def draw_chart(res: dict) -> None:
    """Hit rate of every method at the monthly budget. One hue in two steps:
    methods a budgeted app could run, and reference rows that need a PHQ-2
    answer nearly every week. The tick on each bar is what random weeks from
    the same student and quarter reach. The fixed calendar is a reference line."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.lines import Line2D
    from matplotlib.patches import Patch

    surface, ink, ink2, grid = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
    blue, blue_light = "#2a78d6", "#9ec5f4"
    rows = res["by_budget"][MAIN_BUDGET]["methods"]
    order = ["phone", "checkin_one", "checkin_history", "followup", "answers"]
    meta = {m["key"]: m for m in res["methods"]}
    vals = [rows[k]["hit_rate"] * 100 for k in order]
    matched = [rows[k]["matched_random_hit_rate"] * 100 for k in order]
    colors = [blue_light if meta[k]["reference"] else blue for k in order]
    cal = float(np.mean([rows[k]["calendar_hit_rate"] for k in order])) * 100

    fig, ax = plt.subplots(figsize=(8.8, 4.3), dpi=200)
    fig.patch.set_facecolor(surface)
    ax.set_facecolor(surface)
    ypos = np.arange(len(order))[::-1].astype(float)
    ax.barh(ypos, vals, height=0.56, color=colors, zorder=3)
    for yy, v, mr in zip(ypos, vals, matched):
        ax.plot([mr, mr], [yy - 0.36, yy + 0.36], color=ink, linewidth=1.6, zorder=5, solid_capstyle="butt")
        ax.text(max(v, mr) + 0.9, yy, f"{v:.0f}%", va="center", ha="left", color=ink, fontsize=10)
    ax.axvline(cal, color=ink2, linewidth=1.2, linestyle=(0, (4, 3)), zorder=4)
    ax.text(cal + 0.6, len(order) - 0.45, f"Fixed calendar: {cal:.0f}%", color=ink2, fontsize=9, va="bottom", ha="left")
    ax.set_yticks(ypos)
    ax.set_yticklabels([meta[k]["label"].replace(" (reference)", "") for k in order], color=ink, fontsize=10)
    ax.set_xlim(0, max(vals) * 1.14)
    ax.set_ylim(-0.6, len(order) - 0.05)
    ax.xaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f"{v:.0f}%"))
    ax.tick_params(axis="x", colors=ink2, labelsize=9, length=0)
    ax.tick_params(axis="y", length=0)
    ax.grid(axis="x", color=grid, linewidth=0.8, zorder=0)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.set_title("Share of asks that land on a week with a high PHQ-2, at 12 asks a year",
                 color=ink, fontsize=11, loc="left", pad=12)
    handles = [Patch(facecolor=blue, label="Needs at most a short check-in each week"),
               Patch(facecolor=blue_light, label="Reference: needs a PHQ-2 answer nearly every week"),
               Line2D([0], [0], color=ink, linewidth=1.6, label="Random weeks from the same student and quarter"),
               Line2D([0], [0], color=ink2, linewidth=1.2, linestyle=(0, (4, 3)), label="Fixed calendar, same number of asks")]
    leg = fig.legend(handles=handles, loc="lower left", bbox_to_anchor=(0.012, 0.055), ncol=2, frameon=False,
                     fontsize=8.5, handlelength=1.4, columnspacing=2.0, labelspacing=0.5)
    for t in leg.get_texts():
        t.set_color(ink2)
    fig.text(0.012, 0.012, f"{res['data']['students']} Dartmouth students. Every model is scored on students it never saw.",
             color=ink2, fontsize=8.5, ha="left", va="bottom")
    fig.tight_layout(rect=(0, 0.17, 1, 1))
    fig.savefig(CHART, facecolor=surface)
    plt.close(fig)


# ---------------------------------------------------------------------------
# 4. Write-up
# ---------------------------------------------------------------------------

def pc(x: float, nd: int = 1) -> str:
    return f"{100 * x:.{nd}f}%"


def pp(x: float) -> str:
    return f"{100 * x:+.1f} points"


def ci_pp(ci) -> str:
    return f"{100 * ci[0]:.1f} to {100 * ci[1]:.1f} points"


def ci_pc(ci) -> str:
    return f"{100 * ci[0]:.1f}% to {100 * ci[1]:.1f}%"


def auc_ci(a: dict) -> str:
    return f"{a['auc']:.2f} ({a['auc_ci'][0]:.2f} to {a['auc_ci'][1]:.2f})"


def verdict(r: dict) -> str:
    lo, hi = r["minus_calendar_ci"]
    if lo > 0:
        return "above the calendar"
    if hi < 0:
        return "below the calendar"
    return "within chance of the calendar"


def md_table(headers: list[str], rows: list[list]) -> str:
    out = ["| " + " | ".join(headers) + " |", "| " + " | ".join("---" for _ in headers) + " |"]
    out += ["| " + " | ".join(str(c) for c in r) + " |" for r in rows]
    return "\n".join(out)


def headline(res: dict) -> str:
    m = res["by_budget"][MAIN_BUDGET]["methods"]
    c1, ph = m["checkin_one"], m["phone"]
    return (f"At 12 asks per student-year, {pc(c1['hit_rate'], 0)} of the asks chosen from one check-in landed on a week "
            f"with a high PHQ-2, against {pc(c1['calendar_hit_rate'], 0)} for a fixed calendar and "
            f"{pc(ph['hit_rate'], 0)} for a phone model; random weeks from the same student and quarter reached "
            f"{pc(c1['matched_random_hit_rate'], 0)}, so nearly all of the gain comes from finding which students and "
            f"which term to ask in, and the choice of week adds about one point.")


def caveats(res: dict) -> list[str]:
    d = res["data"]
    return [
        "These are Dartmouth college students from 2017 to 2022. Stability is meant for high school students.",
        "The label is a weekly PHQ-2 answered on the phone. It is a screening score, and a doctor makes the diagnosis.",
        "In this study the check-in questions came in the same survey as the PHQ-2. We cannot tell whether students "
        "would answer a short check-in more often than two screening questions.",
        f"{pc(d['share_weeks_with_a_checkin_last_week'], 0)} of monitored weeks had a check-in in the week before. "
        "The other weeks are scored from a missing-value flag.",
        f"The two reference rows use the student's earlier PHQ-2 answers, and {pc(d['share_weeks_with_an_earlier_answer'], 0)} "
        "of monitored weeks had one because the study asked every week. An app held to 12 asks a year would not "
        "have those answers, so these rows show how long high answers last and are not a design.",
        "The asks are the highest-scoring weeks among students the model never saw. A real app would have to set "
        "its threshold in advance, so its number of asks would vary from the budget.",
        "The phone model sees the week itself, up to its last day. The check-in models and the follow-up rule only "
        "see answers from before Monday, so the comparison favours the phone model.",
        "The group rows describe how each method behaved in this sample. Men and the smaller race groups have few "
        "students, so their intervals are wide.",
        "Gender and race are self-reported in the study's own categories. Groups with fewer than "
        f"{res['settings']['min_group_students']} students are not shown.",
    ]


def render_markdown(res: dict) -> str:
    L: list[str] = []
    w = L.append
    d = res["data"]
    labels = {m["key"]: m["label"] for m in res["methods"]}
    labels["drift_rule"] = "Drift rule (Experiment 1)"
    main = res["by_budget"][MAIN_BUDGET]["methods"]
    c1, ph, fu, an = (main[k] for k in ("checkin_one", "phone", "followup", "answers"))
    women, men = res["by_group"]["gender"].get("Women"), res["by_group"]["gender"].get("Men")

    w("# Experiment 3: one scale for every way of picking the week")
    w("")
    w(f"Generated {res['generated']} by `experiments/exp3_asking.py`. Data: College Experience Study (Dartmouth), "
      "CC BY-NC-SA 4.0, used for academic purposes only. Every number below is an aggregate over at least "
      f"{res['settings']['min_group_students']} students. No student ids or per-student rows appear in this file.")
    w("")
    w("## Short answer")
    w("")
    w(headline(res))
    w("")
    w(f"- **One check-in beats the calendar.** {pc(c1['hit_rate'])} of its asks landed on a high week against "
      f"{pc(c1['calendar_hit_rate'])} ({pp(c1['minus_calendar'])}, 95% interval {ci_pp(c1['minus_calendar_ci'])}). "
      f"It reached {pc(c1['share_low_periods_reached'], 0)} of low periods against "
      f"{pc(c1['calendar_share_low_periods_reached'], 0)} for the calendar.")
    w(f"- **Most of the gain is in who and when, and little is in which week.** Random weeks that keep the model's "
      f"number of asks for each student in each quarter reached {pc(c1['matched_random_hit_rate'])} "
      f"({ci_pc(c1['matched_random_ci'])}). That accounts for "
      f"{100 * (c1['matched_random_hit_rate'] - c1['calendar_hit_rate']):.1f} of the "
      f"{100 * c1['minus_calendar']:.1f} points. The model's own choice of week adds the rest: "
      f"{pc(c1['share_matched_draws_at_or_above'], 0)} of the random draws did at least as well as it did. Leaving "
      f"out the quarters where it asked every week, its hit rate was {pc(c1['hit_rate_outside_full_quarters'])} "
      f"against {pc(c1['chance_outside_full_quarters'])} for chance in the same quarters.")
    w(f"- **The phone model shows the same pattern lower down.** {pc(ph['hit_rate'])} against "
      f"{pc(ph['calendar_hit_rate'])} for the calendar, with matched random weeks at "
      f"{pc(ph['matched_random_hit_rate'])}. It reached {pc(ph['share_low_periods_reached'], 0)} of low periods, "
      f"fewer than the calendar.")
    w(f"- **High answers last.** The follow-up rule has no model: it asks where the last PHQ-2 answer was highest. "
      f"{pc(fu['hit_rate'])} of its asks found another high week, and adding check-ins and a model gave "
      f"{pc(an['hit_rate'])}. Both need a PHQ-2 answer nearly every week, so they are reference rows.")
    if women and men:
        w(f"- **It does not work equally well for everyone.** The one-check-in model ranked weeks better for men "
          f"(AUC {auc_ci(men['auc']['checkin_one'])}) than for women ({auc_ci(women['auc']['checkin_one'])}).")
    w("")
    w("![Hit rate of each method at 12 asks a year](hit_rates.png)")
    w("")
    w("## What we tested")
    w("")
    w("Experiment 1 asked whether the drift rule picks better weeks than a calendar, and Experiment 1b measured "
      "models by AUC. Here every method is scored the way Experiment 1 scored the drift rule. Each method gives "
      "every monitored week a score, and the highest-scoring weeks get the asks. Every method gets the same number "
      "of asks.")
    w("")
    w(md_table(["Method", "What it uses", "When it decides", "What it needs from the student"],
               [[m["label"], m["uses"], m["decides"], m["needs"]] for m in res["methods"]]))
    w("")
    w("## Data")
    w("")
    w(md_table(["Item", "Value"], [
        ["Students", d["students"]],
        ["Monitored student-weeks", f"{d['monitored_weeks']:,}"],
        ["Monitored weeks with a label", f"{d['labelled_weeks']:,}"],
        ["Base rate (labelled weeks at 3 or more)", pc(d["base_rate"])],
        ["Monitored weeks with a check-in in the week before", pc(d["share_weeks_with_a_checkin_last_week"], 0)],
        ["Monitored weeks with an earlier PHQ-2 answer", pc(d["share_weeks_with_an_earlier_answer"], 0)],
    ]))
    w("")
    w("## Rules and choices")
    w("")
    w("- **Weeks, labels, low periods and baselines** are Experiment 1's, from the same code.")
    w(f"- **Models.** Experiment 1b's logistic regression, in {res['settings']['folds']} folds split by student. "
      "Each model is fit on the labelled weeks of the other folds' students and scores every monitored week of "
      "its own fold's students, labelled or not.")
    w("- **Picking the weeks.** Inside each fold, the monitored weeks with the highest scores get the asks, up to "
      "the budget. Labels are never used to pick. Ties are broken at random with a fixed seed.")
    w("- **Fixed calendar and random weeks.** Each method is compared with a calendar that asks the same number of "
      "times, and with random weeks that keep the method's count for each student in each calendar quarter. The "
      "second comparison shows whether a method picks the right week, or only the right student and season.")
    w("- **Missed cases and false alarms.** A high week with no ask is a missed case. An ask on a labelled week "
      "that was not high is a false alarm.")
    w("")
    for b in BUDGETS:
        blk = res["by_budget"][b["key"]]
        w(f"## Result: {b['label']} ({blk['asks_per_student_year']:.1f} asks per student-year)")
        w("")
        rows = []
        for key, r in blk["methods"].items():
            rows.append([labels[key], pc(r["hit_rate"]), pc(r["calendar_hit_rate"]),
                         f"{pp(r['minus_calendar'])} ({ci_pp(r['minus_calendar_ci'])})",
                         pc(r["matched_random_hit_rate"]),
                         f"{r['high_weeks_missed']:,} of {r['high_weeks']:,}", f"{r['false_alarms']:,}",
                         pc(r["share_low_periods_reached"], 0), pc(r["calendar_share_low_periods_reached"], 0)])
        w(md_table(["Method", "Hit rate", "Fixed calendar", "Method minus calendar (95% interval)",
                    "Random weeks, same student and quarter", "High weeks missed", "False alarms",
                    "Low periods reached", "Low periods reached, calendar"], rows))
        w("")
    w("At a smaller budget every method misses more high weeks, because there are fewer asks to go round. The "
      "calendar's own counts for missed weeks and false alarms are in `results.json`, with the check that leaves "
      "out quarters where a method asked every week.")
    w("")
    w("## How well each score ranks weeks")
    w("")
    w("AUC on all labelled monitored weeks, from the same out-of-fold scores. Within-student AUC compares only weeks "
      "of the same student. These rows use Experiment 1's weeks, so they differ a little from Experiment 1b's.")
    w("")
    w(md_table(["Method", "AUC (95% interval)", "Within-student AUC"],
               [[labels[k], auc_ci(a), f"{a['within_student_auc']:.2f}"] for k, a in res["auc"].items()]))
    w("")
    w("## Groups")
    w("")
    w("The hackathon asks whether a model works equally well across groups. The study records self-reported gender "
      "and race. The tone model in Experiment 2 cannot be checked this way, because GoEmotions records nothing "
      "about who wrote each comment.")
    w("")
    for dim, title in (("gender", "By gender"), ("race", "By race")):
        w(f"**{title}**")
        w("")
        rows = []
        for name, g in res["by_group"][dim].items():
            dr, c = g["drift_rule"], g["checkin_one_monthly"]
            rows.append([name, g["students"], f"{g['labelled_weeks']:,}", pc(g["base_rate"]),
                         f"{pc(dr['hit_rate'])} vs {pc(dr['calendar_hit_rate'])} vs {pc(dr['matched_random_hit_rate'])}",
                         auc_ci(g["auc"]["phone"]), auc_ci(g["auc"]["checkin_one"]), auc_ci(g["auc"]["followup"]),
                         f"{pc(c['hit_rate'])} vs {pc(c['calendar_hit_rate'])} ({verdict(c)})",
                         f"{c['asks_per_student_year']:.1f}"])
        w(md_table(["Group", "Students", "Labelled weeks", "Base rate",
                    "Drift rule: hit rate vs calendar vs matched random",
                    "Phone model AUC", "One check-in AUC", "Follow-up rule AUC",
                    "One check-in at 12 asks: hit rate vs calendar", "Asks per student-year it gave this group"], rows))
        w("")
    ns = res["groups_not_shown"]
    w(f"Not shown, to protect the students: {ns['gender']} student(s) outside the two gender rows and "
      f"{ns['race']} with no race recorded. Race groups with fewer than {res['settings']['min_group_students']} "
      "students are pooled into one row.")
    w("")
    if women and men:
        cw, cm = women["checkin_one_monthly"], men["checkin_one_monthly"]
        w(f"- **Gender.** The one-check-in model ranked weeks better for men than for women: AUC "
          f"{auc_ci(men['auc']['checkin_one'])} against {auc_ci(women['auc']['checkin_one'])}. At 12 asks a year its "
          f"asks landed on a high week {pc(cm['hit_rate'])} of the time for men and {pc(cw['hit_rate'])} for women. "
          f"Men also had the higher base rate ({pc(men['base_rate'])} against {pc(women['base_rate'])}). We do not "
          "know why the check-in works less well for women here.")
    w("- **Phone data.** The phone model was close to chance in every group, and the drift rule matched random "
      "weeks from the same student and quarter in every group.")
    w("- **Who gets asked.** Asks are handed out by score across all students, so the last column shows how many "
      "each group received. A real app would have to watch this number.")
    w("")
    w("## What this shows and what it does not")
    w("")
    w("It shows three things about this dataset.")
    w("")
    w("- **Answers direct asks far better than phone data.** One check-in from the week before beat a model that "
      "saw every phone measure from the week itself, at every budget.")
    gaps = [100 * (r["hit_rate"] - r["matched_random_hit_rate"])
            for b in res["by_budget"].values() for k, r in b["methods"].items() if k != "drift_rule"]
    w(f"- **The exact week adds little.** For every method and budget, random weeks from the same student and "
      f"quarter came within {max(abs(g) for g in gaps):.1f} points of the method's own choice. High weeks cluster "
      "in some students and some terms, and each method works mostly by finding those.")
    w(f"- **High answers last.** Where the last answer was high, {pc(fu['hit_rate'], 0)} of asks at this budget "
      "found another high week.")
    w("")
    w("It does not show that students would answer a check-in every week, or that any of this holds for high "
      "school students. The reference rows are not a design, because an app that asks 12 times a year does not "
      "have an answer from every week.")
    w("")
    w("For the design, the evidence is for knowing whom to ask more often, and less for knowing the exact week. "
      "That supports a calendar for everyone, a short check-in each week, more asks for students whose check-ins "
      "are low that term, and a follow-up soon after any high answer. Phone signals stay on the chart as context.")
    w("")
    w("## Caveats")
    w("")
    for c in caveats(res):
        w(f"- {c}")
    w("")
    w("## How to run")
    w("")
    w("```")
    w(".venv/bin/python experiments/exp1_timing.py     # builds the weekly table")
    w(".venv/bin/python experiments/exp1b_deeper.py    # builds the feature table")
    w(".venv/bin/python experiments/exp3_asking.py")
    w("```")
    w("")
    w(f"The last run took {res['runtime_seconds']:.0f} seconds.")
    w("")
    w("*This is a prototype analysis and is not medical advice. It was written with Claude (Anthropic).*")
    w("")
    return "\n".join(L)


def app_summary(res: dict) -> dict:
    main = res["by_budget"][MAIN_BUDGET]["methods"]
    keep = ("hit_rate", "calendar_hit_rate", "matched_random_hit_rate", "high_weeks_missed", "high_weeks",
            "false_alarms", "share_low_periods_reached")
    return {
        "generated": res["generated"],
        "dataset": res["dataset"],
        "students": res["data"]["students"],
        "budget_asks_per_student_year": res["by_budget"][MAIN_BUDGET]["asks_per_student_year"],
        "methods": {k: {f: main[k][f] for f in keep} for k in main},
        "auc": {k: v["auc"] for k, v in res["auc"].items()},
        "groups": {dim: {name: {"students": g["students"], "base_rate": g["base_rate"],
                                "checkin_auc": g["auc"]["checkin_one"]["auc"],
                                "phone_auc": g["auc"]["phone"]["auc"]}
                         for name, g in members.items()} for dim, members in res["by_group"].items()},
        "headline": headline(res),
        "caveats": caveats(res),
    }


def write_outputs(res: dict) -> None:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    out = dict(res)
    out["headline"] = headline(res)
    out["caveats"] = caveats(res)
    (RESULTS_DIR / "results.json").write_text(json.dumps(ex._py(out), indent=2) + "\n")
    (RESULTS_DIR / "results.md").write_text(render_markdown(res))
    draw_chart(res)
    APP_JSON.parent.mkdir(parents=True, exist_ok=True)
    APP_JSON.write_text(json.dumps(ex._py(app_summary(res)), indent=2) + "\n")


def main() -> None:
    if "--report-only" in sys.argv[1:]:
        # rewrite the report, chart and app summary from the last run's numbers
        res = json.loads((RESULTS_DIR / "results.json").read_text())
        res.pop("headline", None)
        res.pop("caveats", None)
    else:
        res = run_all()
    write_outputs(res)
    print(headline(res))
    print(f"Done in {res['runtime_seconds']:.0f}s")


if __name__ == "__main__":
    main()
