#!/usr/bin/env python3
"""Experiment 7: do the digital-life signals line up with depression signs in US high schools?

The app reads signals from a teen's phone life, among them sleep hours and phone screen time.
This checks, on national US data, whether the survey's closest digital-life items go with
depression signs across many teens. It also checks the two
screening cut-offs the app uses (PHQ-2 of 3 or more opens the eight questions, PHQ-8 of 10 or
more sends a parent note) against the full PHQ-9 on a national sample.

Data, all from the CDC and in the public domain (US government work):
  - Youth Risk Behavior Survey (YRBS), national high school files for 2023 and 2025,
    https://www.cdc.gov/yrbs/data/index.html . Fixed-width .dat files. Column positions and
    short labels are read from CDC's SAS input program, and answer codes from CDC's SAS
    formats program, for each year. The script checks every label and code it uses and stops
    if one does not match, because question numbers moved between the two years.
  - NHANES August 2021 to August 2023, DPQ_L (PHQ-9) and DEMO_L (age, sex, weights),
    https://wwwn.cdc.gov/nchs/nhanes/ . The public DPQ_L file has PHQ-9 answers only for
    ages 18 and over, so the youngest group is 18 to 24.

Labels:
  - YRBS main: felt sad or hopeless almost every day for two weeks or more in a row in the
    past 12 months, so that they stopped some usual activities (CDC's QN26).
  - YRBS second: seriously considered attempting suicide in the past 12 months (QN27).
  - YRBS third: mental health most of the time or always not good in the past 30 days
    (QN84 in 2023, QN81 in 2025).
  - NHANES: PHQ-9 of 10 or more.

Method:
  - YRBS features are only digital-life items: social media frequency (8 levels), hours of
    sleep on a school night (7 levels) and electronic bullying (yes or no). Neither file has a
    screen-time or video-game item, so social media frequency stands in for the app's screen
    time. The app does not read bullying. Sleep plus social media alone is also scored, as the
    pair closest to what the app reads. Each feature is one-hot coded with its own "missing"
    level, so a skipped question is a missing indicator.
  - Logistic regression (fit without survey weights) trained on 2023 students and tested on
    2025 students (different students, two years later). Three models: digital signals only, digital signals plus
    sex and grade, and sex and grade only.
  - AUC 95% intervals come from resampling the survey's primary sampling units (PSUs) of the
    2025 file, 2000 times, so students from the same area move together. The same resamples
    give intervals for the gaps between models.
  - Survey-weighted share who felt sad or hopeless, by social media level, by sleep hours and
    by electronic bullying (CDC's WEIGHT), with PSU-resampled intervals.
  - AUC by sex and by race/ethnicity on the 2025 test set.
  - NHANES: weighted with the exam weight WTMEC2YR (the PHQ-9 is asked in the exam centre).
    Codes 7 (refused) and 9 (don't know) are treated as missing, and only people with all
    nine items count. Intervals resample the survey's PSUs (SDMVSTRA and SDMVPSU), 2000
    times, as for the YRBS, so people from the same area move together.
  - Odds ratios in results.json are against a reference answer for each item (REFERENCE).

Writes results/exp7/results.{json,md} and app/public/data/exp7_summary.json.

Usage: cd <repo> && .venv/bin/python -I experiments/exp7_digital_life.py
"""
from __future__ import annotations

import json
import re
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

ROOT = Path(__file__).resolve().parent.parent
YRBS = ROOT / "data" / "yrbs"
NHANES = ROOT / "data" / "nhanes"
RESULTS = ROOT / "results" / "exp7"
APP_SUMMARY = ROOT / "app" / "public" / "data" / "exp7_summary.json"
GENERATED = "2026-11-15"
SEED = 7
REPS = 2000
GROUP_REPS = 1000
MIN_GROUP = 30  # a group needs at least this many students with and without the outcome

# Which CDC variable holds each item, by year, and the short label CDC gives it.
# The script stops if a label in the SAS input program does not match.
ITEMS = {
    2023: {"sex": "Q2", "grade": "Q3", "ebully": "Q25", "social": "Q80", "sleep": "Q85",
           "sad": "QN26", "suicide": "QN27", "mental": "QN84", "sad_raw": "Q26", "suicide_raw": "Q27",
           "ebully_qn": "QN25", "social_qn": "QN80", "sleep_qn": "QN85",
           "race": "RACEETH", "weight": "WEIGHT", "stratum": "STRATUM", "psu": "PSU"},
    2025: {"sex": "Q2", "grade": "Q3", "ebully": "Q24", "social": "Q77", "sleep": "Q83",
           "sad": "QN26", "suicide": "QN27", "mental": "QN81", "sad_raw": "Q26", "suicide_raw": "Q27",
           "ebully_qn": "QN24", "social_qn": "QN77", "sleep_qn": "QN83",
           "race": "RACEETH", "weight": "WEIGHT", "stratum": "STRATUM", "psu": "PSU"},
}
LABELS = {
    "sex": {2023: "What is your sex", 2025: "What is your sex"},
    "grade": {2023: "In what grade are you", 2025: "In what grade are you"},
    "ebully": {2023: "Electronic bullying", 2025: "Electronic bullying"},
    "social": {2023: "Social media", 2025: "Social media"},
    "sleep": {2023: "Hours of sleep on school night", 2025: "Sleep"},
    "sad": {2023: "Felt sad or hopeless", 2025: "Felt sad or hopeless"},
    "suicide": {2023: "Seriously considered attempting suicide", 2025: "Seriously considered attempting suicide"},
    "mental": {y: "Reported that their mental health was most of the time or always not good" for y in (2023, 2025)},
    "sad_raw": {y: "Sad or hopeless" for y in (2023, 2025)},
    "suicide_raw": {y: "Considered suicide" for y in (2023, 2025)},
    "ebully_qn": {y: "Were electronically bullied" for y in (2023, 2025)},
    "social_qn": {y: "Used social media several times a day" for y in (2023, 2025)},
    "sleep_qn": {y: "Got 8 or more hours of sleep" for y in (2023, 2025)},
    "race": {y: "Race/Ethnicity" for y in (2023, 2025)},
    "weight": {y: "Overall Analysis Weight" for y in (2023, 2025)},
}
# Answer codes, checked against the SAS formats program for both years.
CODES = {
    "sex": {"1": "Female", "2": "Male"},
    "grade": {"1": "9th grade", "2": "10th grade", "3": "11th grade", "4": "12th grade", "5": "Ungraded or other grade"},
    "ebully": {"1": "Yes", "2": "No"},
    "social": {"1": "I do not use social media", "2": "A few times a month", "3": "About once a week",
               "4": "A few times a week", "5": "About once a day", "6": "Several times a day",
               "7": "About once an hour", "8": "More than once an hour"},
    "sleep": {"1": "4 or less hours", "2": "5 hours", "3": "6 hours", "4": "7 hours", "5": "8 hours",
              "6": "9 hours", "7": "10 or more hours"},
    "sad_raw": {"1": "Yes", "2": "No"},
    "suicide_raw": {"1": "Yes", "2": "No"},
}
# The answer each odds ratio is against. The models one-hot code every answer, so a single
# exp(coefficient) is not an odds ratio; the gap to the reference answer's coefficient is.
REFERENCE = {"social": "1", "sleep": "5", "ebully": "2", "sex": "2", "grade": "1"}
DIGITAL = ["social", "sleep", "ebully"]
DEMO = ["sex", "grade"]
MODELS = {"digital": DIGITAL, "digital_plus_sex_grade": DIGITAL + DEMO, "sex_grade_only": DEMO}
MODEL_NAMES = {"digital": "Digital signals only", "digital_plus_sex_grade": "Digital signals plus sex and grade",
               "sex_grade_only": "Sex and grade only"}
# Scored for the main label only: each signal alone, and the pair closest to what the app reads.
EXTRA = {"sleep_social": ["sleep", "social"], "sleep_only": ["sleep"], "social_only": ["social"], "ebully_only": ["ebully"]}
EXTRA_NAMES = {"sleep_social": "Sleep and social media only", "sleep_only": "Sleep only",
               "social_only": "Social media only", "ebully_only": "Electronic bullying only"}
OUTCOMES = {"sad": "Felt sad or hopeless (main)", "suicide": "Considered suicide",
            "mental": "Mental health mostly not good (past 30 days)"}
SCREEN_WORDS = re.compile(r"screen|video|game|computer|television|\btv\b|phone|internet", re.I)


# ---------------------------------------------------------------- reading the CDC files

def sas_layout(year: int) -> tuple[dict, dict]:
    """Column positions and short labels from CDC's SAS input program."""
    text = (YRBS / f"{year}XXH-SAS-Input-Program.sas").read_text(errors="replace")
    pos = {m.group(2).upper(): (int(m.group(1)), int(m.group(3)))
           for m in re.finditer(r"^@(\d+)\s+(\w+)\s+\$?(\d+)\.", text, re.M)}
    labels = {m.group(1).upper(): m.group(2).strip() for m in re.finditer(r"^(\w+)\s*=\s*\"(.*)\"", text, re.M)}
    return pos, labels


def sas_formats(year: int) -> dict:
    """Answer codes from CDC's SAS formats program: {format name: {code: text}}."""
    text = (YRBS / f"{year}XXH-Formats-Program.sas").read_text(errors="replace")
    out = {}
    for m in re.finditer(r"value\s+\$(\w+)(.*?);", text, re.S | re.I):
        out[m.group(1).upper()] = {a: b for a, b in re.findall(r"\"(\w)\"\s*=\s*\"([^\"]*)\"", m.group(2))}
    return out


def check_layout(year: int, pos: dict, labels: dict, fmts: dict) -> dict:
    """Stop if any item, label or answer code is not what this script assumes."""
    checked = {}
    for key, var in ITEMS[year].items():
        assert var in pos, f"{year}: {var} not in the SAS input program"
        if key in LABELS:
            assert labels.get(var) == LABELS[key][year], f"{year}: {var} label is {labels.get(var)!r}"
        if key in CODES:
            fmt = fmts.get(f"H{var[1:]}S")
            assert fmt is not None, f"{year}: no format for {var}"
            assert fmt == CODES[key], f"{year}: {var} codes are {fmt}"
        checked[key] = {"variable": var, "column": pos[var][0], "width": pos[var][1], "label": labels.get(var)}
    screen = sorted(f"{v}: {t}" for v, t in labels.items() if SCREEN_WORDS.search(t) and re.match(r"^QN?\d+$", v))
    return {"items": checked, "screen_time_or_gaming_items": screen}


def load_yrbs(year: int) -> tuple[pd.DataFrame, dict]:
    pos, labels = sas_layout(year)
    fmts = sas_formats(year)
    layout = check_layout(year, pos, labels, fmts)
    race = fmts["HRCE"]
    names = list(ITEMS[year])
    specs = [(pos[ITEMS[year][k]][0] - 1, pos[ITEMS[year][k]][0] - 1 + pos[ITEMS[year][k]][1]) for k in names]
    raw = pd.read_fwf(YRBS / f"XXH{year}_YRBS_Data.dat", colspecs=specs, names=names, header=None, dtype=str)
    raw = raw.apply(lambda c: c.str.strip()).replace({"": np.nan})
    d = pd.DataFrame(index=raw.index)
    for k in DIGITAL + DEMO:
        d[k] = raw[k].where(raw[k].isin(list(CODES[k])), np.nan)
    for k in ("sad", "suicide", "mental", "ebully_qn", "social_qn", "sleep_qn"):
        v = pd.to_numeric(raw[k], errors="coerce")
        d[k] = np.where(v == 1, 1.0, np.where(v == 2, 0.0, np.nan))
    for k in ("sad_raw", "suicide_raw"):
        d[k] = raw[k]
    d["race"] = raw["race"].map(lambda c: race.get(str(c).strip(), np.nan) if pd.notna(c) else np.nan)
    d["weight"] = pd.to_numeric(raw["weight"], errors="coerce")
    d["psu"] = raw["stratum"].astype(str) + "-" + raw["psu"].astype(str)
    layout["race_codes"] = race
    layout["students_in_file"] = int(len(d))
    layout["agreement_with_cdc_flags"] = cross_check(d)
    return d, layout


def cross_check(d: pd.DataFrame) -> dict:
    """Our coding of the raw answers should match CDC's own yes/no flags."""
    pairs = {
        "sad (Q26 yes vs QN26)": (d["sad_raw"] == "1", d["sad"] == 1, d["sad"].notna() & d["sad_raw"].notna()),
        "suicide (Q27 yes vs QN27)": (d["suicide_raw"] == "1", d["suicide"] == 1, d["suicide"].notna() & d["suicide_raw"].notna()),
        "electronic bullying yes vs CDC flag": (d["ebully"] == "1", d["ebully_qn"] == 1, d["ebully"].notna() & d["ebully_qn"].notna()),
        "social media several times a day or more vs CDC flag": (d["social"].isin(["6", "7", "8"]), d["social_qn"] == 1,
                                                                 d["social"].notna() & d["social_qn"].notna()),
        "8 or more hours of sleep vs CDC flag": (d["sleep"].isin(["5", "6", "7"]), d["sleep_qn"] == 1,
                                                 d["sleep"].notna() & d["sleep_qn"].notna()),
    }
    out = {}
    for name, (a, b, both) in pairs.items():
        agree = float((a[both] == b[both]).mean())
        assert agree > 0.99, f"coding check failed for {name}: {agree:.3f}"
        out[name] = round(agree, 5)
    return out


# ---------------------------------------------------------------- YRBS analysis

def design(d: pd.DataFrame, feats: list[str]) -> np.ndarray:
    """One-hot code each feature, with its own 'missing' level (the missing indicator)."""
    cols = []
    for f in feats:
        v = d[f].fillna("missing")
        for c in list(CODES[f]) + ["missing"]:
            cols.append((v == c).to_numpy(float))
    return np.column_stack(cols)


def feature_names(feats: list[str]) -> list[str]:
    return [f"{f}={CODES[f][c]}" if c != "missing" else f"{f}=missing" for f in feats for c in list(CODES[f]) + ["missing"]]


def odds_ratios(feats: list[str], coef: np.ndarray) -> dict:
    """Each answer against its item's reference answer, from the same fit."""
    c = dict(zip(feature_names(feats), coef))
    out = {}
    for f in feats:
        ref = c[f"{f}={CODES[f][REFERENCE[f]]}"]
        for n in feature_names([f]):
            out[n] = float(np.exp(c[n] - ref))
    return out


def psu_index(d: pd.DataFrame) -> list[np.ndarray]:
    return [np.flatnonzero(d["psu"].to_numpy() == p) for p in pd.unique(d["psu"])]


def boot_aucs(y: np.ndarray, scores: dict, groups: list[np.ndarray], reps: int, rng) -> dict:
    """PSU-resampled AUCs for several scores on the same resamples (paired)."""
    out = {k: [] for k in scores}
    for _ in range(reps):
        pick = rng.integers(0, len(groups), len(groups))
        idx = np.concatenate([groups[i] for i in pick])
        yy = y[idx]
        if yy.min() == yy.max():
            continue
        for k, s in scores.items():
            out[k].append(roc_auc_score(yy, s[idx]))
    return {k: np.array(v) for k, v in out.items()}


def ci(a: np.ndarray) -> list[float]:
    return [float(np.percentile(a, 2.5)), float(np.percentile(a, 97.5))]


def fit_and_test(train: pd.DataFrame, test: pd.DataFrame, outcome: str, rng, extra: bool = False) -> dict:
    tr = train[train[outcome].notna()]
    te = test[test[outcome].notna()].reset_index(drop=True)
    y_tr, y_te, w_te = tr[outcome].to_numpy(int), te[outcome].to_numpy(int), te["weight"].to_numpy(float)
    scores, res = {}, {"train_students": int(len(tr)), "test_students": int(len(te)),
                       "train_rate_weighted": float(np.average(tr[outcome], weights=tr["weight"])),
                       "test_rate_weighted": float(np.average(y_te, weights=w_te)),
                       "test_rate_unweighted": float(y_te.mean()), "models": {}}
    for name, feats in {**MODELS, **(EXTRA if extra else {})}.items():
        m = LogisticRegression(max_iter=5000, C=1.0)
        m.fit(design(tr, feats), y_tr)
        s = m.predict_proba(design(te, feats))[:, 1]
        scores[name] = s
        res["models"][name] = {
            "features": feats,
            "train_auc_2023": float(roc_auc_score(y_tr, m.predict_proba(design(tr, feats))[:, 1])),
            "test_auc": float(roc_auc_score(y_te, s)),
            "test_auc_weighted": float(roc_auc_score(y_te, s, sample_weight=w_te)),
            "odds_ratios_vs_reference": odds_ratios(feats, m.coef_[0]),
            "reference": {f: CODES[f][REFERENCE[f]] for f in feats},
        }
    boots = boot_aucs(y_te, scores, psu_index(te), REPS, rng)
    for name in scores:
        res["models"][name]["test_auc_ci"] = ci(boots[name])
    res["gaps"] = {
        "plus_sex_grade_minus_digital": {"auc": res["models"]["digital_plus_sex_grade"]["test_auc"] - res["models"]["digital"]["test_auc"],
                                         "ci": ci(boots["digital_plus_sex_grade"] - boots["digital"])},
        "digital_minus_sex_grade_only": {"auc": res["models"]["digital"]["test_auc"] - res["models"]["sex_grade_only"]["test_auc"],
                                         "ci": ci(boots["digital"] - boots["sex_grade_only"])},
    }
    res["_scores"] = scores
    res["_test"] = te
    return res


def weighted_shares(d: pd.DataFrame, by: str, outcome: str, rng, M=None) -> list[dict]:
    """Survey-weighted share with the outcome at each level of `by`, PSU-resampled intervals."""
    d = d[d[outcome].notna()]
    psus = pd.unique(d["psu"])
    code = pd.Series(np.arange(len(psus)), index=psus)
    p = code[d["psu"]].to_numpy()
    if M is None:
        M = rng.multinomial(len(psus), np.full(len(psus), 1 / len(psus)), size=REPS).astype(float)
    rows = []
    levels = list(CODES[by]) + (["missing"] if d[by].isna().any() else [])
    for lev in levels:
        mask = (d[by].isna() if lev == "missing" else (d[by] == lev)).to_numpy()
        w, y = d["weight"].to_numpy()[mask], d[outcome].to_numpy()[mask]
        wy_p = np.bincount(p[mask], weights=w * y, minlength=len(psus))
        w_p = np.bincount(p[mask], weights=w, minlength=len(psus))
        with np.errstate(invalid="ignore", divide="ignore"):
            b = (M @ wy_p) / (M @ w_p)
        b = b[np.isfinite(b)]
        rows.append({"level": CODES[by].get(lev, "Did not answer"), "code": lev, "students": int(mask.sum()),
                     "share": float(np.sum(w * y) / np.sum(w)) if mask.any() else None,
                     "ci": ci(b) if len(b) else None})
    return rows


def dose_response(d23: pd.DataFrame, d25: pd.DataFrame, rng) -> dict:
    out = {}
    for by in DIGITAL:
        rows = []
        all25 = weighted_shares(d25, by, "sad", rng)
        girls = {r["code"]: r for r in weighted_shares(d25[d25["sex"] == "1"], by, "sad", rng)}
        boys = {r["code"]: r for r in weighted_shares(d25[d25["sex"] == "2"], by, "sad", rng)}
        y23 = {r["code"]: r for r in weighted_shares(d23, by, "sad", rng)}
        sui = {r["code"]: r for r in weighted_shares(d25, by, "suicide", rng)}
        for r in all25:
            c = r["code"]
            rows.append({"level": r["level"], "code": c, "students_2025": r["students"], "sad_2025": r["share"],
                         "sad_2025_ci": r["ci"], "sad_2025_girls": girls.get(c, {}).get("share"),
                         "sad_2025_boys": boys.get(c, {}).get("share"), "sad_2023": y23.get(c, {}).get("share"),
                         "students_2023": y23.get(c, {}).get("students"), "suicide_2025": sui.get(c, {}).get("share")})
        out[by] = rows
    return out


def group_aucs(main: dict, rng) -> dict:
    te, sc = main["_test"], main["_scores"]
    y = te["sad"].to_numpy(int)
    out = {"by_sex": {}, "by_race_ethnicity": {}, "too_small": []}
    sex_names = {"1": "Girls", "2": "Boys"}
    splits = [("by_sex", te["sex"].map(sex_names)), ("by_race_ethnicity", te["race"])]
    for key, lab in splits:
        for g in sorted(lab.dropna().unique()):
            mask = (lab == g).to_numpy()
            pos, neg = int(y[mask].sum()), int((1 - y[mask]).sum())
            if pos < MIN_GROUP or neg < MIN_GROUP:
                out["too_small"].append({"group": g, "students": int(mask.sum()), "sad": pos})
                continue
            sub = te[mask].reset_index(drop=True)
            scores = {k: sc[k][mask] for k in ("digital", "digital_plus_sex_grade")}
            b = boot_aucs(y[mask], scores, psu_index(sub), GROUP_REPS, rng)
            out[key][g] = {"students": int(mask.sum()), "sad": pos,
                           "sad_share_weighted": float(np.average(y[mask], weights=sub["weight"])),
                           "auc_digital": float(roc_auc_score(y[mask], scores["digital"])),
                           "auc_digital_ci": ci(b["digital"]),
                           "auc_digital_plus_sex_grade": float(roc_auc_score(y[mask], scores["digital_plus_sex_grade"])),
                           "auc_digital_plus_sex_grade_ci": ci(b["digital_plus_sex_grade"])}
    return out


# ---------------------------------------------------------------- NHANES analysis

def load_nhanes() -> pd.DataFrame:
    dpq = pd.read_sas(NHANES / "DPQ_L.xpt")
    demo = pd.read_sas(NHANES / "DEMO_L.xpt")[["SEQN", "RIDAGEYR", "RIAGENDR", "WTMEC2YR", "SDMVSTRA", "SDMVPSU"]]
    d = dpq.merge(demo, on="SEQN", how="left")
    items = [f"DPQ0{i}0" for i in range(1, 10)]
    for c in items:
        v = d[c].round()  # SAS stores 0 as a tiny float
        d[c] = v.where(v.isin([0, 1, 2, 3]), np.nan)  # 7 refused, 9 don't know, blank: missing
    d["complete"] = d[items].notna().all(axis=1)
    d["phq2"] = d["DPQ010"] + d["DPQ020"]
    d["phq8"] = d[items[:8]].sum(axis=1, min_count=8)
    d["phq9"] = d[items].sum(axis=1, min_count=9)
    return d


def screen_stats(d: pd.DataFrame, rng) -> dict:
    d = d[d["complete"] & (d["WTMEC2YR"] > 0)].reset_index(drop=True)
    n = len(d)
    w = d["WTMEC2YR"].to_numpy(float)
    pos = (d["phq9"] >= 10).to_numpy()
    flag2 = (d["phq2"] >= 3).to_numpy()
    flag8 = (d["phq8"] >= 10).to_numpy()
    both = flag2 & flag8
    item9 = (d["DPQ090"] >= 1).to_numpy()
    # Resample PSUs, keep weights: each person counts as often as their PSU was drawn.
    psu = d["SDMVSTRA"].round().astype(int).astype(str) + "-" + d["SDMVPSU"].round().astype(int).astype(str)
    units, of_person = np.unique(psu.to_numpy(), return_inverse=True)
    draws = rng.multinomial(len(units), np.full(len(units), 1 / len(units)), size=REPS).astype(float)
    M = draws[:, of_person] * w

    def wshare(num, den):
        est = float(np.sum(w * num * den) / np.sum(w * den)) if np.sum(den) else None
        with np.errstate(invalid="ignore", divide="ignore"):
            b = (M @ (num & den)) / (M @ den.astype(float))
        b = b[np.isfinite(b)]
        return {"weighted": est, "ci": ci(b) if len(b) else None, "count": int(np.sum(num & den)), "of": int(np.sum(den))}

    allp = np.ones(n, bool)
    out = {
        "people_with_all_nine_items": n,
        "psus": int(len(units)),
        "girls_women": int((d["RIAGENDR"] == 2).sum()), "boys_men": int((d["RIAGENDR"] == 1).sum()),
        "phq9_10_or_more": wshare(pos, allp),
        "phq2_step": {"sensitivity": wshare(flag2, pos), "specificity": wshare(~flag2, ~pos),
                      "share_flagged": wshare(flag2, allp), "ppv": wshare(pos, flag2)},
        "phq8_vs_phq9": {"sensitivity": wshare(flag8, pos), "specificity": wshare(~flag8, ~pos),
                         "agreement": wshare(flag8 == pos, allp),
                         "phq9_only": int(np.sum(pos & ~flag8)), "phq8_only": int(np.sum(flag8 & ~pos)),
                         "kappa_unweighted": kappa(flag8, pos)},
        "both_steps": {"sensitivity": wshare(both, pos), "specificity": wshare(~both, ~pos),
                       "share_flagged": wshare(both, allp)},
        "item9_any": {"share": wshare(item9, allp), "caught_by_both_steps": int(np.sum(item9 & both)),
                      "caught_by_phq2_step": int(np.sum(item9 & flag2)), "people": int(item9.sum())},
    }
    return out


def kappa(a: np.ndarray, b: np.ndarray) -> float:
    po = np.mean(a == b)
    pe = np.mean(a) * np.mean(b) + np.mean(~a) * np.mean(~b)
    return float((po - pe) / (1 - pe))


# ---------------------------------------------------------------- main

def main() -> None:
    t0 = time.time()
    rng = np.random.default_rng(SEED)
    d23, lay23 = load_yrbs(2023)
    d25, lay25 = load_yrbs(2025)
    res = {"generated": GENERATED, "seed": SEED, "reps": REPS,
           "yrbs": {"layout": {"2023": lay23, "2025": lay25}, "outcomes": {}}}
    for o in OUTCOMES:
        res["yrbs"]["outcomes"][o] = fit_and_test(d23, d25, o, rng, extra=(o == "sad"))
    main_res = res["yrbs"]["outcomes"]["sad"]
    res["yrbs"]["groups"] = group_aucs(main_res, rng)
    res["yrbs"]["dose_response"] = dose_response(d23, d25, rng)
    res["yrbs"]["missing_share_2025"] = {k: float(d25[k].isna().mean()) for k in DIGITAL + DEMO + ["sad"]}
    for o in OUTCOMES:
        res["yrbs"]["outcomes"][o].pop("_scores")
        res["yrbs"]["outcomes"][o].pop("_test")

    nh = load_nhanes()
    ages = nh[nh["complete"]]["RIDAGEYR"]
    res["nhanes"] = {
        "phq9_ages": [int(ages.min()), int(ages.max())],
        "teens_12_to_17_with_phq9": int(((nh["RIDAGEYR"] >= 12) & (nh["RIDAGEYR"] <= 17)).sum()),
        "rows_in_dpq": int(len(nh)),
        "age_18_to_24": screen_stats(nh[(nh["RIDAGEYR"] >= 18) & (nh["RIDAGEYR"] <= 24)], rng),
        "all_adults": screen_stats(nh, rng),
    }
    res["run_seconds"] = round(time.time() - t0, 1)

    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "results.json").write_text(json.dumps(res, indent=2) + "\n")
    (RESULTS / "results.md").write_text(render(res))
    APP_SUMMARY.write_text(json.dumps(summary(res), indent=2) + "\n")
    print(headline(res))
    print(f"Run time {res['run_seconds']} s")


# ---------------------------------------------------------------- writing

def pc(x, nd=0):
    return "n/a" if x is None else f"{100 * x:.{nd}f}%"


def auc_txt(a, c):
    return f"{a:.2f} ({c[0]:.2f} to {c[1]:.2f})"


def headline(r) -> str:
    m = r["yrbs"]["outcomes"]["sad"]["models"]
    n = r["nhanes"]["age_18_to_24"]["phq2_step"]["sensitivity"]
    dr = {x["code"]: x for x in r["yrbs"]["dose_response"]["social"]}
    sl = {x["code"]: x for x in r["yrbs"]["dose_response"]["sleep"]}
    mid = [dr[c]["sad_2025"] for c in "234567"]
    return (f"On {r['yrbs']['outcomes']['sad']['test_students']:,} US high school students in 2025, a model trained on 2023 "
            f"students using only digital-life answers (social media use, sleep and online bullying) sorted who had felt sad "
            f"or hopeless with an AUC of {auc_txt(m['digital']['test_auc'], m['digital']['test_auc_ci'])}. Sex and grade alone "
            f"scored {m['sex_grade_only']['test_auc']:.2f}. Sleep showed the clearest steps: {pc(sl['1']['sad_2025'])} of "
            f"students sleeping 4 hours or less felt sad or hopeless, against {pc(sl['5']['sad_2025'])} at 8 hours. "
            f"{pc(dr['8']['sad_2025'])} of those on social media more than once an hour did, against {pc(dr['1']['sad_2025'])} "
            f"of non-users and {pc(min(mid))} to {pc(max(mid))} in between. In NHANES adults aged 18 to 24 (the public file has "
            f"no PHQ-9 answers under 18), a PHQ-2 of 3 or more caught {pc(n['weighted'])} ({pc(n['ci'][0])} to {pc(n['ci'][1])}) of those with a "
            f"PHQ-9 of 10 or more.")


def caveats(r) -> list[str]:
    i9 = r["nhanes"]["age_18_to_24"]["item9_any"]
    miss = r["yrbs"]["missing_share_2025"]
    return [
        "This is a one-time survey of many teens. It shows that these signals go with depression signs across teens. It does "
        "not show that a change in one teen's week predicts that teen's mood. Experiments 1 and 1b found that passive weekly "
        "phone data scored only an AUC of 0.57 to 0.61 for that.",
        "Everything in the YRBS is self-reported on one day, including the social media, sleep and bullying answers. The app "
        "reads sleep and screen time from the phone, which may not match what teens report. The app does not read bullying, "
        "and social media frequency is only a stand-in for screen time.",
        "The design is cross-sectional, so it cannot say which comes first. Poor sleep may follow low mood as much as cause it.",
        "Question numbers moved between 2023 and 2025, and CDC's short label for sleep changed from \"Hours of sleep on school "
        "night\" to \"Sleep\". The answer codes for every item used here are the same in both years. We did not compare the "
        "full printed question wording. The race/ethnicity groups also changed in 2025, which added Middle Eastern or North "
        "African.",
        f"Neither YRBS file has a screen-time or video-game question, so those app signals are not tested here. In 2025, "
        f"{pc(miss['sleep'])} of students left the sleep question blank and {pc(miss['social'])} the social media question.",
        "The sad or hopeless question is a yes or no about the past 12 months. It is a sign of depression. It is not a diagnosis.",
        "Intervals resample the survey's sampling units and ignore its strata, so they are approximate.",
        f"The public NHANES file has PHQ-9 answers only for ages 18 and over, so the cut-off check uses ages 18 to 24 "
        f"({r['nhanes']['age_18_to_24']['people_with_all_nine_items']} people), not teens. The interval is wide. The app "
        "also opens the other six questions after two weeks of signals outside the usual range, even with a low PHQ-2, and "
        "that path is not tested here.",
        f"The PHQ-8 leaves out the self-harm question. In the 18 to 24 group, {i9['people']} people answered it above zero and "
        f"{i9['people'] - i9['caught_by_phq2_step']} of them did not pass the PHQ-2 step. The app watches for self-harm language "
        "in what the teen types instead, and that check is not tested here.",
    ]


def render(r) -> str:
    L = []
    w = L.append
    y = r["yrbs"]
    lay23, lay25 = y["layout"]["2023"], y["layout"]["2025"]
    w("# Experiment 7: do the digital-life signals line up with depression signs in US high schools?")
    w("")
    w(f"Generated {r['generated']} by `experiments/exp7_digital_life.py`. Data: CDC Youth Risk Behavior Survey, national high "
      "school files for 2023 and 2025, and NHANES August 2021 to August 2023 (DPQ_L, DEMO_L). CDC data are public domain. "
      "Every number is an aggregate.")
    w("")
    w("## Short answer")
    w("")
    w(headline(r))
    w("")
    w("This is one survey of many teens on one day. It says these signals go with depression signs across teens. It does "
      "not say that a change in one teen's week predicts that teen's mood.")
    w("")
    w("## What we tested")
    w("")
    so = y["outcomes"]["sad"]
    w(f"- **Students.** {lay23['students_in_file']:,} students in the 2023 file, {so['train_students']:,} of whom answered "
      f"the sad or hopeless question, trained the models. {lay25['students_in_file']:,} different students in the 2025 file "
      f"({so['test_students']:,} answered it) tested them.")
    w("- **Label.** Felt so sad or hopeless almost every day for two weeks or more in a row in the past 12 months that "
      "they stopped some usual activities (CDC's QN26). Second labels: seriously considered suicide in the past 12 months "
      "(QN27), and mental health most of the time or always not good in the past 30 days.")
    w("- **Inputs.** Only digital-life answers: how often the student uses social media (8 levels), hours of sleep on a "
      "school night (7 levels) and whether they were bullied electronically in the past 12 months. Each has its own "
      "\"did not answer\" level. The app reads sleep and phone screen time. Neither year has a screen-time or video-game "
      "question, so social media use stands in for screen time. The app does not read bullying, so sleep and social media "
      "alone are also scored.")
    w("- **Models.** Logistic regression with the digital signals only, then with sex and grade added, then sex and grade "
      "alone, to see how much is demographics. The models are fit without survey weights, and AUC is shown both "
      "unweighted and survey-weighted.")
    w("- **Intervals.** 95% intervals resample the 2025 survey's sampling units (areas), so students from one area move "
      "together.")
    w("")
    w("Question numbers moved between years, so the script reads every position from CDC's SAS programs and stops if a "
      "label or answer code differs from what it expects:")
    w("")
    rows = []
    for k, name in (("social", "Social media frequency"), ("sleep", "Sleep hours, school night"),
                    ("ebully", "Electronic bullying"), ("sad", "Sad or hopeless (label)"), ("suicide", "Considered suicide"),
                    ("mental", "Mental health mostly not good"), ("sex", "Sex"), ("grade", "Grade")):
        a, b = lay23["items"][k], lay25["items"][k]
        rows.append([name, f"{a['variable']} (column {a['column']})", f"{b['variable']} (column {b['column']})",
                     f"\"{a['label']}\"" + ("" if a["label"] == b["label"] else f" / \"{b['label']}\"")])
    w(table(["Item", "2023", "2025", "CDC label"], rows))
    w("")
    low = min(list(lay23["agreement_with_cdc_flags"].values()) + list(lay25["agreement_with_cdc_flags"].values()))
    w("Our coding of the raw answers matched CDC's own yes/no flags "
      + ("for every student on every item checked." if low == 1 else f"for at least {pc(low, 1)} of students on every item checked."))
    o = y["outcomes"]
    w("")
    w(f"The 2023 weighted shares ({pc(o['sad']['train_rate_weighted'])} sad or hopeless, "
      f"{pc(o['suicide']['train_rate_weighted'])} considered suicide) match what CDC published for 2023, which checks the "
      "reading of the files and weights.")
    w("")
    w("## Results")
    w("")
    w("### How well the signals sort students (trained on 2023, tested on 2025)")
    w("")
    rows = []
    for o, oname in OUTCOMES.items():
        e = y["outcomes"][o]
        for mk, mname in MODEL_NAMES.items():
            m = e["models"][mk]
            rows.append([oname if mk == "digital" else "", mname, auc_txt(m["test_auc"], m["test_auc_ci"]),
                         f"{m['test_auc_weighted']:.2f}", f"{m['train_auc_2023']:.2f}",
                         f"{e['test_students']:,}" if mk == "digital" else "",
                         pc(e["test_rate_weighted"]) if mk == "digital" else ""])
    w(table(["Label", "Model", "AUC on 2025 (95% interval)", "AUC, survey-weighted", "AUC on 2023 (training)",
             "2025 students", "Share with label (weighted)"], rows))
    w("")
    g = y["outcomes"]["sad"]["gaps"]
    w(f"For the main label, adding sex and grade moved the AUC by {g['plus_sex_grade_minus_digital']['auc']:+.2f} "
      f"({g['plus_sex_grade_minus_digital']['ci'][0]:+.2f} to {g['plus_sex_grade_minus_digital']['ci'][1]:+.2f}). The digital "
      f"signals beat sex and grade alone by {g['digital_minus_sex_grade_only']['auc']:+.2f} "
      f"({g['digital_minus_sex_grade_only']['ci'][0]:+.2f} to {g['digital_minus_sex_grade_only']['ci'][1]:+.2f}). The same "
      f"model scored {y['outcomes']['sad']['models']['digital']['train_auc_2023']:.2f} on the 2023 students it was fit on, "
      "so it sorted the 2025 students a little less well than the students it learned from. "
      f"{pc(y['outcomes']['sad']['train_rate_weighted'])} of students felt sad or hopeless in 2023 and "
      f"{pc(y['outcomes']['sad']['test_rate_weighted'])} in 2025.")
    w("")
    w("Each signal on its own, for the main label:")
    w("")
    w(table(["Model", "AUC on 2025 (95% interval)", "AUC, survey-weighted"],
            [[EXTRA_NAMES[k], auc_txt(y["outcomes"]["sad"]["models"][k]["test_auc"], y["outcomes"]["sad"]["models"][k]["test_auc_ci"]),
              f"{y['outcomes']['sad']['models'][k]['test_auc_weighted']:.2f}"] for k in EXTRA]))
    w("")
    w("### Share who felt sad or hopeless, by each signal (survey-weighted)")
    w("")
    names = {"social": "Social media use", "sleep": "Sleep on a school night", "ebully": "Bullied electronically (past 12 months)"}
    for by in DIGITAL:
        w(f"**{names[by]}**")
        w("")
        rows = []
        for x in y["dose_response"][by]:
            rows.append([x["level"], f"{x['students_2025']:,}",
                         f"{pc(x['sad_2025'])} ({pc(x['sad_2025_ci'][0])} to {pc(x['sad_2025_ci'][1])})" if x["sad_2025_ci"] else pc(x["sad_2025"]),
                         pc(x["sad_2025_girls"]), pc(x["sad_2025_boys"]), pc(x["sad_2023"]), pc(x["suicide_2025"])])
        w(table(["Answer", "2025 students", "Sad or hopeless, 2025 (95% interval)", "Girls 2025", "Boys 2025",
                 "All 2023", "Considered suicide, 2025"], rows))
        w("")
    w("Girls report more sadness and a little more social media use than boys, so part of the social media pattern is sex. The "
      "girls and boys columns show the pattern within each sex.")
    w("")
    w("### Checking the app's two cut-offs on a national sample (NHANES)")
    w("")
    n = r["nhanes"]
    w(f"The public NHANES file has PHQ-9 answers only for ages {n['phq9_ages'][0]} to {n['phq9_ages'][1]}, with no one aged "
      f"12 to 17 ({n['teens_12_to_17_with_phq9']} rows). So this uses the youngest group, 18 to 24, with all adults as a "
      "larger comparison. Weighted with the exam weight. Intervals resample the survey's "
      f"{n['age_18_to_24']['psus']} sampling units, as for the YRBS.")
    w("")
    rows = []
    for key, name in (("age_18_to_24", "Ages 18 to 24"), ("all_adults", "All adults 18 and over")):
        s = n[key]
        ci_t = lambda v: f"{pc(v['weighted'])} ({pc(v['ci'][0])} to {pc(v['ci'][1])})"
        rows.append([name, f"{s['people_with_all_nine_items']:,}", f"{ci_t(s['phq9_10_or_more'])}",
                     ci_t(s["phq2_step"]["sensitivity"]), ci_t(s["phq2_step"]["specificity"]),
                     pc(s["phq2_step"]["share_flagged"]["weighted"]),
                     ci_t(s["phq8_vs_phq9"]["sensitivity"]), ci_t(s["phq8_vs_phq9"]["specificity"]),
                     ci_t(s["both_steps"]["sensitivity"])])
    w(table(["Group", "People", "PHQ-9 of 10 or more", "PHQ-2 of 3+ catches PHQ-9 10+", "PHQ-2 of 3+ specificity",
             "Share PHQ-2 flags", "PHQ-8 of 10+ catches PHQ-9 10+", "PHQ-8 specificity", "Both steps catch"], rows))
    w("")
    s = n["age_18_to_24"]
    p8 = s["phq8_vs_phq9"]
    w("The PHQ-8 can never be higher than the PHQ-9, so it never flags someone the PHQ-9 would not. Its specificity is "
      "100% by construction.")
    w("")
    w(f"In the 18 to 24 group, PHQ-8 and PHQ-9 at 10 agreed for {pc(p8['agreement']['weighted'], 1)} of people (kappa "
      f"{p8['kappa_unweighted']:.2f}). {p8['phq9_only']} people reached 10 on the PHQ-9 but not the PHQ-8, and "
      f"{p8['phq8_only']} the other way. The PHQ-2 step is where most people with a PHQ-9 of 10 or more are lost: the "
      f"two steps together caught {s['both_steps']['sensitivity']['count']} of {s['both_steps']['sensitivity']['of']} "
      f"(weighted {pc(s['both_steps']['sensitivity']['weighted'])}).")
    w("")
    i9 = s["item9_any"]
    w(f"{i9['people']} people aged 18 to 24 gave any answer above zero to the self-harm question (weighted "
      f"{pc(i9['share']['weighted'])}). {i9['caught_by_phq2_step']} of them passed the PHQ-2 step and "
      f"{i9['caught_by_both_steps']} passed both steps.")
    w("")
    w("## Groups")
    w("")
    gr = y["groups"]
    rows = []
    for key, title in (("by_sex", "Sex"), ("by_race_ethnicity", "Race/ethnicity")):
        for name, v in gr[key].items():
            rows.append([title, name, f"{v['students']:,}", pc(v["sad_share_weighted"]),
                         auc_txt(v["auc_digital"], v["auc_digital_ci"]),
                         auc_txt(v["auc_digital_plus_sex_grade"], v["auc_digital_plus_sex_grade_ci"])])
    w(table(["Split", "Group", "2025 students", "Sad or hopeless (weighted)", "AUC, digital signals (95% interval)",
             "AUC, plus sex and grade"], rows))
    w("")
    if gr["too_small"]:
        w("Too few students to score: " + "; ".join(f"{t['group']} ({t['students']} students, {t['sad']} sad or hopeless)"
                                                  for t in gr["too_small"]) + ".")
        w("")
    sx = gr["by_sex"]
    w("All groups use the main label on the 2025 test set. Within one sex, everyone has the same sex input, so the "
      "second column differs from the first through grade and through the digital weights, which were fit alongside sex "
      "and grade. "
      + (f"Within girls alone and boys alone the digital signals scored {sx['Girls']['auc_digital']:.2f} and "
         f"{sx['Boys']['auc_digital']:.2f}, so the link is not only a difference between girls and boys. "
         if "Girls" in sx and "Boys" in sx else "")
      + "Groups of a few hundred students or fewer have wide intervals.")
    w("")
    w("## Caveats")
    w("")
    for c in caveats(r):
        w(f"- {c}")
    w("")
    w("## How to run")
    w("")
    w("```")
    w("bash scripts/get_data.sh       # downloads the YRBS and NHANES files into data/yrbs/ and data/nhanes/")
    w(".venv/bin/python -I experiments/exp7_digital_life.py")
    w("```")
    w("")
    w(f"Run time on a laptop: about {r['run_seconds']:.0f} seconds.")
    w("")
    w("*This project is a prototype and is not medical advice. It was written with Claude (Anthropic).*")
    w("")
    return "\n".join(L)


def summary(r) -> dict:
    y, n = r["yrbs"], r["nhanes"]["age_18_to_24"]
    m = y["outcomes"]["sad"]["models"]
    short = lambda rows: [{"level": x["level"], "students": x["students_2025"], "sad_share": x["sad_2025"],
                           "sad_share_ci": x["sad_2025_ci"]} for x in rows]
    return {
        "generated": r["generated"],
        "headline": headline(r),
        "students_train_2023": y["outcomes"]["sad"]["train_students"],
        "students_test_2025": y["outcomes"]["sad"]["test_students"],
        "sad_share_2025": y["outcomes"]["sad"]["test_rate_weighted"],
        "auc": m["digital"]["test_auc"], "auc_ci": m["digital"]["test_auc_ci"],
        "auc_plus_sex_grade": m["digital_plus_sex_grade"]["test_auc"],
        "auc_plus_sex_grade_ci": m["digital_plus_sex_grade"]["test_auc_ci"],
        "auc_sex_grade_only": m["sex_grade_only"]["test_auc"], "auc_sex_grade_only_ci": m["sex_grade_only"]["test_auc_ci"],
        "auc_sleep_social_only": m["sleep_social"]["test_auc"], "auc_sleep_social_only_ci": m["sleep_social"]["test_auc_ci"],
        "auc_considered_suicide": y["outcomes"]["suicide"]["models"]["digital"]["test_auc"],
        "auc_considered_suicide_ci": y["outcomes"]["suicide"]["models"]["digital"]["test_auc_ci"],
        "dose_response": {k: short(v) for k, v in y["dose_response"].items()},
        "nhanes_age_group": "18 to 24 (the public NHANES file has no PHQ-9 answers under 18)",
        "nhanes_people": n["people_with_all_nine_items"],
        "nhanes_phq9_10_or_more": n["phq9_10_or_more"]["weighted"],
        "phq2_sensitivity": n["phq2_step"]["sensitivity"]["weighted"], "phq2_sensitivity_ci": n["phq2_step"]["sensitivity"]["ci"],
        "phq2_specificity": n["phq2_step"]["specificity"]["weighted"], "phq2_specificity_ci": n["phq2_step"]["specificity"]["ci"],
        "phq2_share_flagged": n["phq2_step"]["share_flagged"]["weighted"],
        "phq8_sensitivity_vs_phq9": n["phq8_vs_phq9"]["sensitivity"]["weighted"],
        "phq8_specificity_vs_phq9": n["phq8_vs_phq9"]["specificity"]["weighted"],
        "phq8_agreement_with_phq9": n["phq8_vs_phq9"]["agreement"]["weighted"],
        "both_steps_sensitivity": n["both_steps"]["sensitivity"]["weighted"],
        "groups": {**{k: v["auc_digital"] for k, v in y["groups"]["by_sex"].items()},
                   **{k: v["auc_digital"] for k, v in y["groups"]["by_race_ethnicity"].items()}},
        "caveats": caveats(r)[:3] + caveats(r)[7:9],
    }


def table(head, rows) -> str:
    out = ["| " + " | ".join(map(str, head)) + " |", "| " + " | ".join("---" for _ in head) + " |"]
    out += ["| " + " | ".join(map(str, r)) + " |" for r in rows]
    return "\n".join(out)


if __name__ == "__main__":
    main()
