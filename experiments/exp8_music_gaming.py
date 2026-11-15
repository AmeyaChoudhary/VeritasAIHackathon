#!/usr/bin/env python3
"""Experiment 8: music, gaming, social media and stress language, on open data.

The team wants the rest of a teen's digital life in the pitch. This tests, on four open
datasets, how closely each signal goes with depression or distress across people. All
four are one-time surveys or single posts. None follows one person week to week, so
none of this shows that a signal predicts one teen's week.

Data (scripts/get_data.sh downloads all of it; this repo does not copy any of the files):
  1. Music & Mental Health survey, MxMH (Rasgaitis, 2022; CC0, Kaggle). 736 people aged
     10 to 89 gave hours of listening per day, how often they play 16 genres, and rated
     their own anxiety, depression, insomnia and OCD from 0 to 10.
     Spotify Tracks Dataset (Pandya; BSD licence per its Hugging Face card). 114,000 tracks
     with Spotify's audio features, 1,000 per genre, used only for genre valence and energy.
  2. Online Gaming Anxiety Data (Sauter and Draschkow survey, posted on Kaggle by Divyansh;
     licence as listed there). About 13,000 gamers, recruited mostly on Reddit, with GAD-7.
  3. Social Media and Mental Health survey, smmh (Ahmed, Kaggle; licence as listed there).
     481 people with 1-to-5 items, one of them "How often do you feel depressed or down?".
  4. Dreaddit (Turcan and McKeown, 2019; Hugging Face copy, research use). Reddit posts
     labelled stressed or not by crowd workers.

Labels:
  1. Depression self-rating of 7 or more out of 10. Also the plain rank correlation with 0 to 10.
  2. GAD-7 total of 10 or more (moderate anxiety). It measures anxiety, so it says nothing direct about depression.
  3. "Feel depressed or down" of 4 or 5 out of 5.
  4. The Dreaddit stress label.

Method:
  - Parts 1 to 3: logistic regression (median fill, scaling, L2) in 5-fold stratified
    cross-validation repeated 20 times. Each person's out-of-fold score is averaged over the
    repeats. The 95% interval resamples people (2,000 times). The fold spread is the middle
    95% of the 100 single-fold AUCs. A label-shuffle check reruns one round of the
    cross-validation (not the average of 20) 100 times on shuffled labels; it should land
    near 0.50. Gaming answers sent twice are counted once.
  - Music mood: mean Spotify valence and energy per genre, MxMH genres mapped to Spotify
    genres (GENRE_MAP below), then each person's frequency-weighted mean over their 16
    genres (Never 0, Rarely 1, Sometimes 2, Very frequently 3).
  - Part 4: TF-IDF and logistic regression trained on the Dreaddit train split and scored once
    on the test split. Tuning folds and test intervals keep each post's excerpts together. Then the app's tone model (app/public/models/tone.json, scored as in
    app/src/engine/tone.ts) runs zero-shot on the same test posts. The Python copy of its
    scoring is checked against hand-worked cases and, when Node is installed, against
    tone.ts itself.

Writes results/exp8/results.{json,md} and app/public/data/exp8_summary.json.

Usage: .venv/bin/python -I experiments/exp8_music_gaming.py
"""
from __future__ import annotations

import json
import math
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score
from sklearn.model_selection import StratifiedGroupKFold, StratifiedKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
RESULTS = ROOT / "results" / "exp8"
APP_SUMMARY = ROOT / "app" / "public" / "data" / "exp8_summary.json"
TONE_JSON = ROOT / "app" / "public" / "models" / "tone.json"
TONE_TS = ROOT / "app" / "src" / "engine" / "tone.ts"
GENERATED = "2026-11-15"
SEED = 8
FOLDS = 5
REPEATS = 20
SHUFFLES = 100
BOOT = 2000
TEEN_MAX_AGE = 19
MIN_SUBSET = 150  # smallest subset we run a separate model on

FREQ = {"Never": 0, "Rarely": 1, "Sometimes": 2, "Very frequently": 3}
YES = {"Yes": 1, "No": 0}

# MxMH genre -> Spotify track_genre values. Spotify's set has no rap, lo-fi or video game
# music genre: Rap uses hip-hop (so it gets the same mood as Hip hop), Lofi uses the
# "study" and "chill" genres, and Video game music has no match and is left out of the mood.
GENRE_MAP = {
    "Classical": ["classical", "opera"],
    "Country": ["country", "honky-tonk", "bluegrass"],
    "EDM": ["edm", "house", "electro", "dubstep", "trance"],
    "Folk": ["folk", "acoustic"],
    "Gospel": ["gospel"],
    "Hip hop": ["hip-hop"],
    "Jazz": ["jazz"],
    "K pop": ["k-pop"],
    "Latin": ["latin", "latino", "reggaeton", "salsa"],
    "Lofi": ["study", "chill"],
    "Metal": ["metal", "heavy-metal", "metalcore", "death-metal", "black-metal"],
    "Pop": ["pop", "indie-pop", "synth-pop"],
    "R&B": ["r-n-b", "soul"],
    "Rap": ["hip-hop"],
    "Rock": ["rock", "alt-rock", "alternative", "hard-rock", "punk-rock"],
    "Video game music": [],
}


# ---------------------------------------------------------------- shared helpers
def logit_model():
    return make_pipeline(SimpleImputer(strategy="median"), StandardScaler(),
                         LogisticRegression(C=1.0, max_iter=5000))


def tree_model():
    return HistGradientBoostingClassifier(max_depth=3, learning_rate=0.05, max_iter=200, random_state=SEED)


def oof_once(X: np.ndarray, y: np.ndarray, make, seed: int) -> tuple[np.ndarray, list[float]]:
    oof = np.zeros(len(y))
    aucs = []
    for tr, te in StratifiedKFold(FOLDS, shuffle=True, random_state=seed).split(X, y):
        m = make()
        m.fit(X[tr], y[tr])
        oof[te] = m.predict_proba(X[te])[:, 1]
        aucs.append(roc_auc_score(y[te], oof[te]))
    return oof, aucs


def boot_auc(y: np.ndarray, s: np.ndarray, seed: int = SEED, groups=None) -> list[float]:
    """Resamples rows, or whole groups (such as all the excerpts of one Reddit post) when given."""
    rng = np.random.default_rng(seed)
    n = len(y)
    units = None
    if groups is not None:
        _, inv = np.unique(np.asarray(groups), return_inverse=True)
        units = [np.flatnonzero(inv == g) for g in range(inv.max() + 1)]
    out = []
    for _ in range(BOOT):
        i = rng.integers(0, n, n) if units is None else np.concatenate([units[k] for k in rng.integers(0, len(units), len(units))])
        if 0 < y[i].sum() < len(i):
            out.append(roc_auc_score(y[i], s[i]))
    return [float(np.percentile(out, 2.5)), float(np.percentile(out, 97.5))]


def cv_eval(X: pd.DataFrame, y: np.ndarray, make=logit_model, shuffles: int = SHUFFLES,
            repeats: int = REPEATS) -> dict:
    Xv = X.to_numpy(float)
    oof_sum = np.zeros(len(y))
    folds, reps = [], []
    for r in range(repeats):
        oof, aucs = oof_once(Xv, y, make, SEED + r)
        oof_sum += oof
        folds += aucs
        reps.append(roc_auc_score(y, oof))
    score = oof_sum / repeats
    out = {"n": int(len(y)), "positives": int(y.sum()), "base_rate": float(y.mean()),
           "features": int(X.shape[1]), "auc": float(roc_auc_score(y, score)), "auc_ci": boot_auc(y, score),
           "fold_auc_mean": float(np.mean(folds)),
           "fold_auc_spread": [float(np.percentile(folds, 2.5)), float(np.percentile(folds, 97.5))],
           "repeat_auc_range": [float(min(reps)), float(max(reps))]}
    if shuffles:
        rng = np.random.default_rng(SEED + 1000)
        sh = [roc_auc_score(yp, oof_once(Xv, yp, make, SEED + 2000 + k)[0])
              for k, yp in enumerate(rng.permutation(y) for _ in range(shuffles))]
        out["shuffle"] = {"runs": shuffles, "mean_auc": float(np.mean(sh)),
                          "middle_95": [float(np.percentile(sh, 2.5)), float(np.percentile(sh, 97.5))],
                          "share_at_or_above_real": float(np.mean(np.array(sh) >= out["auc"]))}
    return out, score


def weights(X: pd.DataFrame, y: np.ndarray, top: int = 10) -> list[dict]:
    """Standardised logistic weights from one fit on everyone (direction and size only)."""
    m = logit_model().fit(X.to_numpy(float), y)
    coef = m[-1].coef_[0]
    order = np.argsort(-np.abs(coef))[:top]
    return [{"feature": X.columns[i], "weight": round(float(coef[i]), 3)} for i in order]


def spearman(a, b) -> dict:
    a, b = pd.Series(a, dtype=float), pd.Series(b, dtype=float)
    ok = a.notna() & b.notna()
    r, p = spearmanr(a[ok], b[ok])
    rng = np.random.default_rng(SEED)
    av, bv = a[ok].to_numpy(), b[ok].to_numpy()
    boots = []
    for _ in range(BOOT):
        i = rng.integers(0, len(av), len(av))
        boots.append(spearmanr(av[i], bv[i])[0])
    return {"rho": float(r), "ci": [float(np.nanpercentile(boots, 2.5)), float(np.nanpercentile(boots, 97.5))],
            "p": float(p), "n": int(ok.sum())}


def wilson(k: int, n: int) -> list[float]:
    if n == 0:
        return [float("nan"), float("nan")]
    z = 1.96
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return [c - h, c + h]


def rate_table(groups: pd.Series, y: pd.Series, order: list) -> list[dict]:
    out = []
    for g in order:
        yy = y[groups == g]
        k, n = int(yy.sum()), int(len(yy))
        out.append({"group": str(g), "n": n, "rate": (k / n) if n else None, "ci": wilson(k, n)})
    return out


# ---------------------------------------------------------------- part 1: music
def genre_moods() -> tuple[dict, pd.DataFrame]:
    s = pd.read_csv(DATA / "spotify_tracks" / "dataset.csv", usecols=["track_id", "track_genre", "valence", "energy"])
    moods = {}
    for g, sp in GENRE_MAP.items():
        if not sp:
            moods[g] = {"spotify_genres": [], "valence": None, "energy": None, "tracks": 0}
            continue
        pool = s[s["track_genre"].isin(sp)].drop_duplicates("track_id")
        moods[g] = {"spotify_genres": sp, "valence": round(float(pool["valence"].mean()), 4),
                    "energy": round(float(pool["energy"].mean()), 4), "tracks": int(len(pool))}
    return moods, s


def music_frame(moods: dict) -> pd.DataFrame:
    m = pd.read_csv(DATA / "mxmh" / "mxmh_survey_results.csv")
    m = m.dropna(subset=["Depression"]).reset_index(drop=True)
    d = pd.DataFrame(index=m.index)
    d["age"] = m["Age"]
    d["hours_per_day"] = m["Hours per day"].where(m["Hours per day"] <= 24)
    for g in GENRE_MAP:
        d[f"freq_{g}"] = m[f"Frequency [{g}]"].map(FREQ)
    w = d[[f"freq_{g}" for g in GENRE_MAP if GENRE_MAP[g]]].to_numpy(float)
    val = np.array([moods[g]["valence"] for g in GENRE_MAP if GENRE_MAP[g]])
    en = np.array([moods[g]["energy"] for g in GENRE_MAP if GENRE_MAP[g]])
    tot = w.sum(1)
    with np.errstate(invalid="ignore", divide="ignore"):
        d["listening_valence"] = np.where(tot > 0, w @ val / tot, np.nan)
        d["listening_energy"] = np.where(tot > 0, w @ en / tot, np.nan)
    d["exploratory"] = m["Exploratory"].map(YES)
    d["while_working"] = m["While working"].map(YES)
    bpm = m["BPM"]
    d["bpm"] = bpm.where((bpm >= 40) & (bpm <= 220))
    d["fav_genre_valence"] = m["Fav genre"].map({g: v["valence"] for g, v in moods.items()})
    d["depression"] = m["Depression"]
    d["y"] = (m["Depression"] >= 7).astype(int)
    d["bpm_raw_missing"] = int(bpm.isna().sum())
    d["bpm_dropped"] = int((bpm.notna() & ~((bpm >= 40) & (bpm <= 220))).sum())
    return d


MUSIC_HABITS = (["hours_per_day"] + [f"freq_{g}" for g in GENRE_MAP]
                + ["listening_valence", "listening_energy", "exploratory", "while_working", "bpm"])
MUSIC_MOOD = ["listening_valence", "listening_energy", "hours_per_day"]


def part_music() -> dict:
    moods, _ = genre_moods()
    d = music_frame(moods)
    y = d["y"].to_numpy()
    res = {"genre_map": moods, "people": int(len(d)), "ages": [float(d["age"].min()), float(d["age"].max())],
           "median_age": float(d["age"].median()),
           "bpm_cleaning": {"rule": "kept 40 to 220; anything else set to missing", "missing_in_raw": int(d["bpm_raw_missing"][0]),
                            "set_to_missing": int(d["bpm_dropped"][0])},
           "no_mappable_listening": int(d["listening_valence"].isna().sum()), "models": {}}
    sets = {
        "a_music_habits": (MUSIC_HABITS, "Music habits only: hours, 16 genre frequencies, listening valence and energy, exploratory, while working, BPM"),
        "b_mood_and_hours": (MUSIC_MOOD, "Music mood (listening valence and energy) and hours per day"),
        "c_age_only": (["age"], "Age only (baseline)"),
        "d_age_plus_music": (["age"] + MUSIC_HABITS, "Age plus music habits"),
    }
    for key, (cols, label) in sets.items():
        r, score = cv_eval(d[cols], y)
        r["label"] = label
        r["score_vs_0_10"] = float(spearmanr(score, d["depression"])[0])
        res["models"][key] = r
        print(f"music {key}: AUC {r['auc']:.3f} {r['auc_ci']} shuffle {r['shuffle']['mean_auc']:.3f}")
    t, _ = cv_eval(d[MUSIC_HABITS], y, make=tree_model, shuffles=0, repeats=5)
    t["label"] = "Music habits only, gradient-boosted trees (5 repeats, no shuffle check)"
    res["models"]["a_music_habits_trees"] = t
    print(f"music trees: AUC {t['auc']:.3f}")
    res["weights_music_habits"] = weights(d[MUSIC_HABITS], y)
    res["weights_age_plus_music"] = weights(d[["age"] + MUSIC_HABITS], y)
    res["correlations_0_10"] = {c: spearman(d[c], d["depression"]) for c in
                                ["listening_valence", "listening_energy", "hours_per_day", "fav_genre_valence",
                                 "exploratory", "while_working", "bpm", "age"] + [f"freq_{g}" for g in GENRE_MAP]}
    # valence against depression after taking out age (rank residuals)
    ok = d[["listening_valence", "depression", "age"]].dropna()
    rk = ok.rank()
    def resid(col):
        b = np.polyfit(rk["age"], rk[col], 1)
        return rk[col] - np.polyval(b, rk["age"])
    res["valence_vs_depression_age_removed"] = float(np.corrcoef(resid("listening_valence"), resid("depression"))[0, 1])
    res["valence_vs_age"] = float(spearmanr(ok["listening_valence"], ok["age"])[0])
    terc = pd.qcut(d["listening_valence"], 3, labels=["lowest third", "middle third", "highest third"])
    res["rate_by_valence_third"] = rate_table(terc, d["y"], ["lowest third", "middle third", "highest third"])
    res["valence_third_edges"] = [float(x) for x in d["listening_valence"].quantile([0, 1 / 3, 2 / 3, 1])]
    hb = pd.cut(d["hours_per_day"], [-0.1, 1, 2, 4, 6, 24.1], labels=["0 to 1", "over 1 to 2", "over 2 to 4", "over 4 to 6", "over 6"])
    res["rate_by_hours"] = rate_table(hb, d["y"], ["0 to 1", "over 1 to 2", "over 2 to 4", "over 4 to 6", "over 6"])
    teen = d[d["age"] <= TEEN_MAX_AGE].reset_index(drop=True)
    res["teen"] = {"max_age": TEEN_MAX_AGE, "n": int(len(teen)), "positives": int(teen["y"].sum()),
                   "n_17_or_under": int((d["age"] <= 17).sum())}
    if len(teen) >= MIN_SUBSET:
        ty = teen["y"].to_numpy()
        for key in ["a_music_habits", "b_mood_and_hours", "c_age_only"]:
            r, _ = cv_eval(teen[sets[key][0]], ty)
            r["label"] = sets[key][1]
            res["teen"][key] = r
            print(f"music teen {key}: AUC {r['auc']:.3f} {r['auc_ci']}")
        res["teen"]["valence_vs_0_10"] = spearman(teen["listening_valence"], teen["depression"])
        res["teen"]["hours_vs_0_10"] = spearman(teen["hours_per_day"], teen["depression"])
    return res


# ---------------------------------------------------------------- part 2: gaming
def collapse(s: pd.Series, keep: int) -> pd.Series:
    top = s.value_counts().index[:keep]
    return s.where(s.isin(top), "other")


def part_gaming() -> dict:
    g = pd.read_csv(DATA / "gaming" / "GamingStudy_data.csv", encoding="latin-1")
    # The same answers sent twice (every column the same apart from the row number and time)
    # count once, so one person can't sit in both a training fold and a test fold.
    dup = g.duplicated(subset=[c for c in g.columns if c not in ("S. No.", "Timestamp")])
    duplicates = int(dup.sum())
    g = g[~dup].dropna(subset=["GAD_T"]).reset_index(drop=True)
    y = (g["GAD_T"] >= 10).astype(int).to_numpy()
    X = pd.DataFrame(index=g.index)
    X["hours_per_week"] = g["Hours"].where(g["Hours"] <= 168)
    X["stream_hours_per_week"] = g["streams"].where(g["streams"] <= 168)
    cats = {
        "game": collapse(g["Game"].str.strip(), 6),
        "platform": g["Platform"].str.strip(),
        "playstyle": collapse(g["Playstyle"].str.strip(), 5),
        "whyplay": collapse(g["whyplay"].str.strip().str.lower(), 4),
    }
    for k, s in cats.items():
        for v in sorted(s.dropna().unique()):
            X[f"{k}={v}"] = (s == v).astype(int)
    res = {"people": int(len(g)), "base_rate": float(y.mean()),
           "who": {"male_share": float((g["Gender"] == "Male").mean()), "age_min": int(g["Age"].min()),
                   "age_median": float(g["Age"].median()), "age_max": int(g["Age"].max()),
                   "from_reddit_share": float((g["Reference"] == "Reddit").mean()),
                   "league_of_legends_share": float((g["Game"] == "League of Legends").mean()),
                   "pc_share": float((g["Platform"] == "PC").mean()),
                   "aged_18_19": int((g["Age"] <= 19).sum())},
           "cleaning": {"duplicate_responses_dropped": duplicates,
                        "hours_over_168_set_missing": int((g["Hours"] > 168).sum()),
                        "hours_missing": int(X["hours_per_week"].isna().sum()),
                        "stream_hours_over_168_set_missing": int((g["streams"] > 168).sum())},
           "categories": {k: sorted(map(str, s.dropna().unique())) for k, s in cats.items()},
           "models": {}}
    r, _ = cv_eval(X, y)
    r["label"] = "Gaming habits: hours per week, stream hours, game, platform, playstyle, why they play"
    res["models"]["gaming_habits"] = r
    print(f"gaming habits: AUC {r['auc']:.3f} {r['auc_ci']} shuffle {r['shuffle']['mean_auc']:.3f}")
    r2, _ = cv_eval(X[["hours_per_week"]], y, shuffles=0)
    r2["label"] = "Hours per week alone"
    res["models"]["hours_only"] = r2
    print(f"gaming hours only: AUC {r2['auc']:.3f}")
    res["weights"] = weights(X, y)
    res["hours_vs_gad_total"] = spearman(X["hours_per_week"], g["GAD_T"])
    bands = [(0, 10), (10, 20), (20, 30), (30, 40), (40, 50), (50, 70), (70, 169)]
    names = [f"{a} to {b - 1}" if b < 169 else f"{a} or more" for a, b in bands]
    hb = pd.cut(X["hours_per_week"], [a for a, _ in bands] + [169], right=False, labels=names)
    res["rate_by_hours_per_week"] = rate_table(hb, pd.Series(y), names)
    young = g["Age"] <= 19
    if young.sum() >= MIN_SUBSET:
        r3, _ = cv_eval(X[young].reset_index(drop=True), y[young.to_numpy()], shuffles=0, repeats=5)
        r3["label"] = "Gaming habits, players aged 18 and 19 only (5 repeats)"
        res["models"]["aged_18_19"] = r3
    return res


# ---------------------------------------------------------------- part 3: social media
SM_TIME = {"Less than an Hour": 0, "Between 1 and 2 hours": 1, "Between 2 and 3 hours": 2,
           "Between 3 and 4 hours": 3, "Between 4 and 5 hours": 4, "More than 5 hours": 5}


def part_social() -> dict:
    s = pd.read_csv(DATA / "smmh" / "smmh.csv")
    col = {int(c.split(".")[0]): c for c in s.columns if re.match(r"^\d+\.", c)}
    y = (s[col[18]] >= 4).astype(int).to_numpy()
    plats = s[col[7]].fillna("").str.split(",").apply(lambda xs: [x.strip() for x in xs if x.strip()])
    names = pd.Series([p for ps in plats for p in ps]).value_counts()
    names = [n for n, c in names.items() if c >= 20]
    U = pd.DataFrame(index=s.index)
    U["daily_time_band"] = s[col[8]].map(SM_TIME)
    U["number_of_platforms"] = plats.apply(len)
    for n in names:
        U[f"uses_{n}"] = plats.apply(lambda ps, n=n: int(n in ps))
    U["use_without_purpose"] = s[col[9]]
    U["distracted_by_it_when_busy"] = s[col[10]]
    F = pd.DataFrame(index=s.index)
    feel = {11: "restless_without_it", 12: "easily_distracted", 13: "bothered_by_worries", 14: "hard_to_concentrate",
            15: "compares_self_to_others", 16: "feels_bad_about_comparisons", 17: "seeks_validation",
            19: "interest_fluctuates", 20: "sleep_problems"}
    for q, n in feel.items():
        F[n] = s[col[q]]
    age = s[[col[1]]].rename(columns={col[1]: "age"})
    res = {"people": int(len(s)), "base_rate": float(y.mean()),
           "outcome_item": col[18],
           "usage_columns": {"daily_time_band": col[8], "number_of_platforms": f"count of platforms in: {col[7]}",
                             **{f"uses_{n}": f"{n} named in: {col[7]}" for n in names},
                             "use_without_purpose": col[9],
                             "distracted_by_it_when_busy": col[10]},
           "feeling_columns": {n: col[q] for q, n in feel.items()},
           "left_out": [col[q] for q in (2, 3, 4, 5, 6)] + ["Timestamp"],
           "said_no_to_using_social_media": int((s[col[6]] == "No").sum()),
           "age_vs_daily_time_rho": float(spearmanr(age["age"], U["daily_time_band"])[0]),
           "age_vs_outcome_rho": float(spearmanr(age["age"], s[col[18]])[0]),
           "ages": [float(age["age"].min()), float(age["age"].max())], "median_age": float(age["age"].median()),
           "occupation": s[col[4]].value_counts().to_dict(),
           "teen": {"max_age": TEEN_MAX_AGE, "n": int((age["age"] <= TEEN_MAX_AGE).sum())},
           "models": {}}
    sets = {"usage_only": (U, "Usage only (the fair model)"),
            "age_only": (age, "Age only (baseline)"),
            "usage_plus_age": (pd.concat([U, age], axis=1), "Usage plus age"),
            "usage_plus_feelings": (pd.concat([U, F], axis=1), "Usage plus feeling items (not fair: the feeling items sit close to the label)")}
    for k, (X, label) in sets.items():
        r, _ = cv_eval(X, y)
        r["label"] = label
        res["models"][k] = r
        print(f"social {k}: AUC {r['auc']:.3f} {r['auc_ci']} shuffle {r['shuffle']['mean_auc']:.3f}")
    res["weights_usage_only"] = weights(U, y)
    res["usage_correlations_1_5"] = {c: spearman(U[c], s[col[18]]) for c in
                                     ["daily_time_band", "number_of_platforms", "use_without_purpose", "distracted_by_it_when_busy"]}
    order = list(SM_TIME)
    res["rate_by_daily_time"] = rate_table(s[col[8]], pd.Series(y), order)
    return res


# ---------------------------------------------------------------- part 4: stress language
_UPPER = re.compile(r"[A-Z]")
_APOS = re.compile("['‘’`ʼ]")
_REPEAT = re.compile(r"([a-z])\1{2,}")
_TOKEN = re.compile(r"[a-z0-9]+")


def tone_features(text: str) -> list[str]:
    """analyze() in app/src/engine/tone.ts, step by step."""
    s = _UPPER.sub(lambda m: chr(ord(m.group(0)) + 32), text if isinstance(text, str) else "")
    s = _REPEAT.sub(r"\1\1", _APOS.sub("", s))
    t = _TOKEN.findall(s)
    return t + [f"{a} {b}" for a, b in zip(t, t[1:])]


class Tone:
    def __init__(self, j: dict):
        self.index = {v: i for i, v in enumerate(j["vocab"])}
        self.idf = np.array(j["idf"], float)
        self.coef = np.array(j["coef"], float)
        self.intercept = float(j["intercept"])
        self.sublinear = j["tf"] == "sublinear"
        self.threshold = float(j["threshold"])

    def score(self, text: str) -> float:
        """scoreTone() in app/src/engine/tone.ts."""
        counts: dict[int, int] = {}
        for f in tone_features(text):
            j = self.index.get(f)
            if j is not None:
                counts[j] = counts.get(j, 0) + 1
        sq = dot = 0.0
        for j, c in counts.items():
            tf = 1 + math.log(c) if self.sublinear else c
            v = tf * self.idf[j]
            sq += v * v
            dot += v * self.coef[j]
        z = self.intercept + (dot / math.sqrt(sq) if sq > 0 else 0.0)
        return 1 / (1 + math.exp(-z))


def tone_hand_cases(j: dict, tone: Tone) -> list[dict]:
    """Worked by hand from the numbers in tone.json, without the Tone class."""
    ix = {v: i for i, v in enumerate(j["vocab"])}
    b = j["intercept"]
    sig = lambda z: 1 / (1 + math.exp(-z))
    cases = []
    # 1) empty text: no features, so score = sigmoid(intercept)
    cases.append({"text": "", "by_hand": sig(b), "how": "no features, sigmoid(intercept)"})
    # 2) one known word: its TF-IDF vector has one entry, so after L2 it is exactly 1
    cases.append({"text": "sad", "by_hand": sig(b + j["coef"][ix["sad"]]), "how": "one feature, x = 1, sigmoid(intercept + coef[sad])"})
    # 3) "SOOOO sad": uppercase becomes lowercase, sooo squashes to soo, features soo, sad, "soo sad"
    feats = [f for f in ["soo", "sad", "soo sad"] if f in ix]
    v = np.array([1.0 * j["idf"][ix[f]] for f in feats])
    w = np.array([j["coef"][ix[f]] for f in feats])
    cases.append({"text": "SOOOO sad", "by_hand": sig(b + float(v @ w) / float(np.sqrt(v @ v))),
                  "how": f"features in vocab {feats}, raw tf 1 each, idf-weighted, L2-normalised"})
    # 4) "I'm sad, sad, sad": apostrophe deleted, im sad sad sad; counts im 1, sad 3, "im sad" 1, "sad sad" 2
    cnt = {"im": 1, "sad": 3, "im sad": 1, "sad sad": 2}
    cnt = {k: c for k, c in cnt.items() if k in ix}
    v = np.array([c * j["idf"][ix[k]] for k, c in cnt.items()])
    w = np.array([j["coef"][ix[k]] for k in cnt])
    cases.append({"text": "I'm sad, sad, sad", "by_hand": sig(b + float(v @ w) / float(np.sqrt(v @ v))),
                  "how": f"counts {cnt}, raw tf, idf-weighted, L2-normalised"})
    for c in cases:
        c["python_copy"] = tone.score(c["text"])
        c["match"] = abs(c["python_copy"] - c["by_hand"]) < 1e-12
    return cases


NODE_HARNESS = r"""
import fs from "node:fs";
import { pathToFileURL } from "node:url";
const [toneTs, toneJson, inPath, outPath] = process.argv.slice(2);
const tone = await import(pathToFileURL(toneTs).href);
const model = tone.toneModelFromJson(JSON.parse(fs.readFileSync(toneJson, "utf8")));
const texts = JSON.parse(fs.readFileSync(inPath, "utf8"));
fs.writeFileSync(outPath, JSON.stringify({ node: process.version, scores: texts.map((t) => tone.scoreTone(model, t)) }));
"""


def node_parity(texts: list[str], py: np.ndarray) -> dict | None:
    node = shutil.which("node") or ("/opt/homebrew/bin/node" if Path("/opt/homebrew/bin/node").exists() else None)
    if node is None:
        print("node not found, skipping the tone.ts parity check")
        return None
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        shutil.copy(TONE_TS, td / "tone.ts")
        (td / "harness.mjs").write_text(NODE_HARNESS, encoding="utf-8")
        (td / "in.json").write_text(json.dumps(texts), encoding="utf-8")
        r = subprocess.run([node, str(td / "harness.mjs"), str(td / "tone.ts"), str(TONE_JSON),
                            str(td / "in.json"), str(td / "out.json")], capture_output=True, text=True)
        if r.returncode != 0:
            print("tone.ts parity check could not run:", r.stderr.strip()[:300])
            return {"ran": False, "error": r.stderr.strip()[:300]}
        out = json.loads((td / "out.json").read_text(encoding="utf-8"))
    ts = np.array(out["scores"], float)
    return {"ran": True, "node": out["node"], "texts": len(texts), "max_abs_diff": float(np.max(np.abs(ts - py)))}


def part_stress() -> dict:
    tr = pd.read_parquet(DATA / "dreaddit" / "train.parquet")
    te = pd.read_parquet(DATA / "dreaddit" / "test.parquet")
    # The two splits share no post, but a few excerpts appear word for word in both; they are
    # dropped from train so the test posts are new to the trained model.
    same_text = tr["text"].isin(set(te["text"]))
    tr = tr[~same_text].reset_index(drop=True)
    ytr, yte = tr["label"].to_numpy(), te["label"].to_numpy()
    # C picked by 5-fold CV on train only. A post is cut into several excerpts, so the folds keep
    # each post's excerpts together, and the test intervals resample whole posts.
    pick = {}
    for C in [0.5, 1, 2, 4, 8, 16]:
        aucs = []
        for a, b in StratifiedGroupKFold(FOLDS, shuffle=True, random_state=SEED).split(tr["text"], ytr, groups=tr["post_id"]):
            vec = TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True)
            m = LogisticRegression(C=C, max_iter=5000).fit(vec.fit_transform(tr["text"].iloc[a]), ytr[a])
            aucs.append(roc_auc_score(ytr[b], m.predict_proba(vec.transform(tr["text"].iloc[b]))[:, 1]))
        pick[C] = float(np.mean(aucs))
    C = max(pick, key=pick.get)
    vec = TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True)
    m = LogisticRegression(C=C, max_iter=5000).fit(vec.fit_transform(tr["text"]), ytr)
    p = m.predict_proba(vec.transform(te["text"]))[:, 1]
    trained = {"C_by_train_cv": C, "train_cv_auc_by_C": pick, "test_auc": float(roc_auc_score(yte, p)),
               "test_auc_ci": boot_auc(yte, p, groups=te["post_id"]), "test_f1": float(f1_score(yte, p >= 0.5)),
               "train_excerpts_dropped_same_text_as_test": int(same_text.sum()),
               "test_accuracy": float(accuracy_score(yte, p >= 0.5))}
    names = np.array(vec.get_feature_names_out())
    co = m.coef_[0]
    trained["top_stressed_terms"] = names[np.argsort(-co)[:12]].tolist()
    trained["top_calm_terms"] = names[np.argsort(co)[:12]].tolist()
    print(f"dreaddit tfidf: AUC {trained['test_auc']:.3f} F1 {trained['test_f1']:.3f}")

    j = json.loads(TONE_JSON.read_text())
    tone = Tone(j)
    hand = tone_hand_cases(j, tone)
    assert all(c["match"] for c in hand), "Python copy of the tone model disagrees with the hand-worked cases"
    ts = np.array([tone.score(t) for t in te["text"]])
    parity = node_parity(te["text"].tolist(), ts)
    if parity and parity.get("ran"):
        assert parity["max_abs_diff"] < 1e-9, "Python copy and tone.ts disagree"
    flag = ts >= tone.threshold
    all_text = pd.concat([tr, te])
    ts_all = np.array([tone.score(t) for t in all_text["text"]])
    zero = {"model": "app/public/models/tone.json (trained on GoEmotions for low mood; never saw Dreaddit)",
            "threshold": tone.threshold, "test_auc": float(roc_auc_score(yte, ts)), "test_auc_ci": boot_auc(yte, ts, groups=te["post_id"]),
            "test_f1_at_app_threshold": float(f1_score(yte, flag)),
            "flag_rate_stressed": float(flag[yte == 1].mean()), "flag_rate_not_stressed": float(flag[yte == 0].mean()),
            "median_score_stressed": float(np.median(ts[yte == 1])), "median_score_not_stressed": float(np.median(ts[yte == 0])),
            "all_posts_auc": float(roc_auc_score(all_text["label"], ts_all)), "all_posts": int(len(all_text)),
            "hand_cases": hand, "tone_ts_parity": parity}
    print(f"tone zero-shot: AUC {zero['test_auc']:.3f} {zero['test_auc_ci']} parity {parity}")
    return {"train_posts": int(len(tr)), "test_posts": int(len(te)), "test_stressed_share": float(yte.mean()),
            "subreddits": te["subreddit"].value_counts().to_dict(), "trained_on_dreaddit": trained, "tone_zero_shot": zero}


# ---------------------------------------------------------------- write-up
def f2(x):
    return f"{x:.2f}"


def pc(x, nd=0):
    return "n/a" if x is None or (isinstance(x, float) and math.isnan(x)) else f"{100 * x:.{nd}f}%"


def auc_s(r):
    return f"{f2(r['auc'])} ({f2(r['auc_ci'][0])} to {f2(r['auc_ci'][1])})"


def near_chance(r) -> bool:
    return r["auc_ci"][0] <= 0.5


def headline(R) -> str:
    mu, ga, so, st = R["music"], R["gaming"], R["social"], R["stress"]
    a, ag = mu["models"]["a_music_habits"], mu["models"]["c_age_only"]
    g, u = ga["models"]["gaming_habits"], so["models"]["usage_only"]
    tr, z = st["trained_on_dreaddit"], st["tone_zero_shot"]
    return (f"Across people, music habits lined up with high self-rated depression only weakly: AUC {f2(a['auc'])}, 95% interval "
            f"{f2(a['auc_ci'][0])} to {f2(a['auc_ci'][1])}, where 0.50 is chance. Gaming habits lined up with moderate anxiety at "
            f"{f2(g['auc'])} ({f2(g['auc_ci'][0])} to {f2(g['auc_ci'][1])}). Social media use alone lined up with often feeling "
            f"down at {f2(u['auc'])} ({f2(u['auc_ci'][0])} to {f2(u['auc_ci'][1])}). A word model trained on stressed Reddit "
            f"posts scored {f2(tr['test_auc'])} on new posts. The app's own tone model, never trained on stress, scored "
            f"{f2(z['test_auc'])} ({f2(z['test_auc_ci'][0])} to {f2(z['test_auc_ci'][1])}). All four are one-time snapshots, "
            "so none shows that a signal predicts one teen's week.")


def caveats(R) -> list[str]:
    mu, ga, so = R["music"], R["gaming"], R["social"]
    return [
        "Every dataset here is a one-time survey or a single post. Each result shows how a signal relates to distress across "
        "people at one moment. None shows that a change in a teen's music, gaming or scrolling comes before a bad week.",
        f"All three surveys are self-selected online samples. The music survey was an open online form (median age "
        f"{mu['median_age']:.0f}). The gaming survey is {pc(ga['who']['male_share'])} male, all aged "
        f"{ga['who']['age_min']} or older, {pc(ga['who']['league_of_legends_share'])} League of Legends players. "
        f"The social media survey has only {so['teen']['n']} people aged {TEEN_MAX_AGE} or under.",
        "The outcomes are single self-ratings (depression 0 to 10, \"feel depressed or down\" 1 to 5) or a screening score "
        "(GAD-7). None is a diagnosis. The gaming outcome measures anxiety and says nothing direct about depression.",
        "Listening valence comes from genre averages. Two people who both play pop \"very frequently\" get the same value even if "
        "one plays sad songs. Real Spotify data would give per-track valence; this test cannot say whether that would do better.",
        "Dreaddit posts are long posts from Reddit users, most likely adults, in support subreddits such as anxiety, PTSD and "
        "relationships. Teens writing a short check-in note may write differently.",
        "The tone model's threshold was set for low mood on GoEmotions. On Dreaddit it flags many posts that are not labelled "
        "stressed, so its flag should not be read as a stress alarm.",
    ]


def table(head, rows) -> str:
    out = ["| " + " | ".join(map(str, head)) + " |", "| " + " | ".join("---" for _ in head) + " |"]
    out += ["| " + " | ".join(map(str, r)) + " |" for r in rows]
    return "\n".join(out)


def model_rows(models: dict, keys: list[str]) -> list[list]:
    rows = []
    for k in keys:
        r = models[k]
        sh = r.get("shuffle")
        rows.append([r["label"], r["n"], pc(r["base_rate"]), auc_s(r),
                     f"{f2(r['fold_auc_spread'][0])} to {f2(r['fold_auc_spread'][1])}",
                     f"{f2(sh['mean_auc'])} ({f2(sh['middle_95'][0])} to {f2(sh['middle_95'][1])})" if sh else "not run"])
    return rows


MODEL_HEAD = ["Model", "People", "Share with the outcome", "AUC (95% interval, resampling people)",
              "Single-fold AUC spread", "Shuffled labels AUC (middle 95%)"]


def rho_s(c):
    return f"{c['rho']:+.2f} ({c['ci'][0]:+.2f} to {c['ci'][1]:+.2f})"


def rho_l(c):
    return f"rho {c['rho']:+.2f}, 95% interval {c['ci'][0]:+.2f} to {c['ci'][1]:+.2f}"


def render(R) -> str:
    L = []
    w = L.append
    mu, ga, so, st = R["music"], R["gaming"], R["social"], R["stress"]
    w("# Experiment 8: music, gaming, social media and stress language")
    w("")
    w(f"Generated {R['generated']} by `experiments/exp8_music_gaming.py`. Data: the Music & Mental Health survey (Rasgaitis, "
      "2022; CC0), the Spotify Tracks Dataset (Pandya; BSD), the Online Gaming Anxiety survey (Sauter and Draschkow, via Kaggle), "
      "the Social Media and Mental Health survey (Ahmed, via Kaggle) and Dreaddit (Turcan and McKeown, 2019). "
      "`scripts/get_data.sh` downloads them. Every number is an aggregate.")
    w("")
    w("## Short answer")
    w("")
    w(R["headline"])
    w("")
    for s in R["plain_sentences"].values():
        w(f"- {s}")
    w("")
    w("## What we tested")
    w("")
    w("Each part asks one question: across many people, how well does this part of digital life line up with signs of "
      "depression or distress? Parts 1 to 3 use logistic regression in 5-fold cross-validation repeated 20 times. Each "
      "person's score comes only from models that never saw them. The 95% interval resamples people. A label-shuffle check "
      "reruns one round of the cross-validation 100 times with the outcome shuffled; it should sit near 0.50, and it shows "
      "roughly how far chance alone can move the AUC. Part 4 trains once and tests once on a held-out split, and its "
      "intervals resample whole Reddit posts.")
    w("")
    w(f"- **Music.** {mu['people']} people aged {mu['ages'][0]:.0f} to {mu['ages'][1]:.0f} (median {mu['median_age']:.0f}). "
      f"Outcome: depression self-rating of 7 or more out of 10 ({pc(mu['models']['a_music_habits']['base_rate'])} of people). "
      "BPM was kept only between 40 and 220 "
      f"({mu['bpm_cleaning']['set_to_missing']} answers outside that were set to missing, as were {mu['bpm_cleaning']['missing_in_raw']} blanks). "
      "The anxiety, insomnia, OCD and \"music effects\" answers were left out of every model.")
    w(f"- **Gaming.** {ga['people']:,} gamers. Outcome: GAD-7 total of 10 or more, moderate anxiety "
      f"({pc(ga['base_rate'])}). GAD-7 measures anxiety and says nothing direct about depression. Hours per week over 168 were set to missing "
      f"({ga['cleaning']['hours_over_168_set_missing']} answers). Game, playstyle and reason for playing were grouped into their most common "
      "answers plus \"other\".")
    w(f"- **Social media.** {so['people']} people aged {so['ages'][0]:.0f} to {so['ages'][1]:.0f} (median {so['median_age']:.0f}). "
      f"Outcome: \"How often do you feel depressed or down?\" of 4 or 5 out of 5 ({pc(so['base_rate'])}).")
    w(f"- **Stress language.** Dreaddit: {st['train_posts']} training posts and {st['test_posts']} test posts from Reddit, "
      f"{pc(st['test_stressed_share'])} of test posts labelled stressed.")
    w("")
    w("## Results")
    w("")
    w("### 1. Music (MxMH survey and Spotify genre moods)")
    w("")
    w(table(MODEL_HEAD, model_rows(mu["models"], ["a_music_habits", "b_mood_and_hours", "c_age_only", "d_age_plus_music"])))
    w("")
    t = mu["models"]["a_music_habits_trees"]
    ma, mb, mc = mu["models"]["a_music_habits"], mu["models"]["b_mood_and_hours"], mu["models"]["c_age_only"]
    w(f"Gradient-boosted trees on the same music habits scored {auc_s(t)}, so a more flexible model did not find more. "
      f"The three-input mood and hours model ({f2(mb['auc'])}) did a little better than all {ma['features']} music inputs "
      f"({f2(ma['auc'])}), a sign the extra genre columns mostly add noise. Age alone sat at chance ({f2(mc['auc'])}; a value a "
      "little under 0.50 is what cross-validation gives a feature with no signal), so a straight-line age effect does not "
      "explain the music signal.")
    w("")
    c = mu["correlations_0_10"]
    w("Rank correlation with the 0 to 10 depression rating (95% interval):")
    w("")
    rows = [[k, rho_s(v), v["n"]] for k, v in c.items()]
    w(table(["Feature", "Spearman rho", "People"], rows))
    w("")
    w(f"The music-habits model's score had a rank correlation of {mu['models']['a_music_habits']['score_vs_0_10']:+.2f} with the "
      "0 to 10 rating.")
    w("")
    w("**Direction.** " + direction_text(mu))
    w("")
    w("Share with depression 7 or more, by third of listening valence "
      f"(edges {', '.join(f'{x:.3f}' for x in mu['valence_third_edges'])}):")
    w("")
    w(table(["Listening valence", "People", "Depression 7+", "95% interval"],
            [[r["group"], r["n"], pc(r["rate"]), f"{pc(r['ci'][0])} to {pc(r['ci'][1])}"] for r in mu["rate_by_valence_third"]]))
    w("")
    w("By hours of listening per day:")
    w("")
    w(table(["Hours per day", "People", "Depression 7+", "95% interval"],
            [[r["group"], r["n"], pc(r["rate"]), f"{pc(r['ci'][0])} to {pc(r['ci'][1])}"] for r in mu["rate_by_hours"]]))
    w("")
    w("Largest standardised weights in the music-habits model (one fit on everyone; positive means more likely 7+):")
    w("")
    w(table(["Feature", "Weight"], [[x["feature"], f"{x['weight']:+.3f}"] for x in mu["weights_music_habits"]]))
    w("")
    w("Listening valence and energy are built from the same genre frequencies, so their weights here are tangled with the "
      "genre weights. The single correlations above are the cleaner read on direction.")
    w("")
    tn = mu["teen"]
    w(f"**Teens and young adults (aged {tn['max_age']} or under).** {tn['n']} people, {tn['positives']} with depression 7+ "
      f"({tn['n_17_or_under']} were 17 or under).")
    w("")
    if "a_music_habits" in tn:
        w(table(MODEL_HEAD, model_rows(tn, ["a_music_habits", "b_mood_and_hours", "c_age_only"])))
        w("")
        ta = tn["a_music_habits"]
        w(f"With {tn['n']} people the intervals are wide. The full music-habits model ({f2(ta['auc_ci'][0])} to "
          f"{f2(ta['auc_ci'][1])}) cannot be told apart from chance in this group"
          + ("." if near_chance(ta) else ", though its interval sits just above 0.50.")
          + f" Mood and hours alone did {auc_s(tn['b_mood_and_hours'])}.")
        w("")
        w(f"Within this group, listening valence against the 0 to 10 rating: rho {rho_s(tn['valence_vs_0_10'])}. "
          f"Hours per day: rho {rho_s(tn['hours_vs_0_10'])}.")
    else:
        w("Too few to model separately.")
    w("")
    w("**Genre mapping.** Each MxMH genre took the mean valence and energy of the Spotify tracks in these genres "
      "(1,000 tracks per Spotify genre, duplicates removed):")
    w("")
    w(table(["MxMH genre", "Spotify genres", "Tracks", "Mean valence", "Mean energy"],
            [[g, ", ".join(m["spotify_genres"]) or "none (left out of the mood average)", m["tracks"],
              "n/a" if m["valence"] is None else f"{m['valence']:.3f}", "n/a" if m["energy"] is None else f"{m['energy']:.3f}"]
             for g, m in mu["genre_map"].items()]))
    w("")
    w("Spotify's genre list has no rap, lo-fi or video game music genre. Rap uses hip-hop, Lofi uses \"study\" and \"chill\", and "
      "video game music is left out. "
      + ("Everyone played at least one mapped genre." if mu["no_mappable_listening"] == 0 else
         f"{mu['no_mappable_listening']} people had no mapped listening and got the median."))
    w("")
    w("### 2. Gaming (Online Gaming Anxiety survey)")
    w("")
    w(table(MODEL_HEAD, model_rows(ga["models"], [k for k in ["gaming_habits", "hours_only", "aged_18_19"] if k in ga["models"]])))
    w("")
    w(f"Hours per week against the GAD-7 total: rho {rho_s(ga['hours_vs_gad_total'])}.")
    w("")
    w("Share with GAD-7 of 10 or more, by hours of play per week:")
    w("")
    w(table(["Hours per week", "Gamers", "GAD-7 10+", "95% interval"],
            [[r["group"], r["n"], pc(r["rate"]), f"{pc(r['ci'][0])} to {pc(r['ci'][1])}"] for r in ga["rate_by_hours_per_week"]]))
    w("")
    w("Largest standardised weights (positive means more likely GAD-7 10+):")
    w("")
    w(table(["Feature", "Weight"], [[x["feature"], f"{x['weight']:+.3f}"] for x in ga["weights"]]))
    w("")
    wh = ga["who"]
    w(f"**Who answered.** {pc(wh['male_share'])} male, aged {wh['age_min']} to {wh['age_max']} (median {wh['age_median']:.0f}), "
      f"{pc(wh['from_reddit_share'])} recruited through Reddit, {pc(wh['league_of_legends_share'])} League of Legends players, "
      f"{pc(wh['pc_share'])} on PC. Nobody was under 18, so this says nothing direct about teens under 18. "
      f"{wh['aged_18_19']:,} were 18 or 19.")
    w("")
    w("### 3. Social media (smmh survey)")
    w("")
    w(table(MODEL_HEAD, model_rows(so["models"], ["usage_only", "age_only", "usage_plus_age", "usage_plus_feelings"])))
    w("")
    w("Only the usage-only model is a fair test. The feeling items ask about worry, concentration, sleep and interest, which "
      "are themselves signs of low mood, so a model that uses them is close to reading the answer.")
    w("")
    w("Usage-only columns:")
    w("")
    for k, q in so["usage_columns"].items():
        w(f"- `{k}`: {q}")
    w("")
    w("Feeling columns (kept out of the fair model). Comparing yourself to others and seeking validation are asked about social "
      "media. They still measure a thought or a feeling about it, so they sit here:")
    w("")
    for k, q in so["feeling_columns"].items():
        w(f"- `{k}`: {q}")
    w("")
    w(f"Gender, relationship status, occupation and organisation were left out of every model. So was \"Do you use social "
      f"media?\", since only {so['said_no_to_using_social_media']} people said no.")
    w("")
    uo, ua = so["models"]["usage_only"], so["models"]["usage_plus_age"]
    w(f"Younger people here used social media more (rank correlation of age with daily time {so['age_vs_daily_time_rho']:+.2f}) "
      f"and felt down more often (age with the outcome {so['age_vs_outcome_rho']:+.2f}). Age alone scored "
      f"{f2(so['models']['age_only']['auc'])}. Adding age to usage moved the AUC from {f2(uo['auc'])} to {f2(ua['auc'])}, so "
      "age added little to what usage already showed. This does not show how much of the usage signal is itself age.")
    w("")
    w("Rank correlation of usage items with the 1 to 5 \"depressed or down\" answer:")
    w("")
    w(table(["Usage item", "Spearman rho", "People"], [[k, rho_s(v), v["n"]] for k, v in so["usage_correlations_1_5"].items()]))
    w("")
    w("Share feeling depressed or down often (4 or 5), by daily time on social media:")
    w("")
    w(table(["Daily time", "People", "Often down", "95% interval"],
            [[r["group"], r["n"], pc(r["rate"]), f"{pc(r['ci'][0])} to {pc(r['ci'][1])}"] for r in so["rate_by_daily_time"]]))
    w("")
    w("Largest standardised weights in the usage-only model:")
    w("")
    w(table(["Feature", "Weight"], [[x["feature"], f"{x['weight']:+.3f}"] for x in so["weights_usage_only"]]))
    w("")
    w(f"Only {so['teen']['n']} people were aged {TEEN_MAX_AGE} or under, too few for a separate teen model.")
    w("")
    w("### 4. Stress language (Dreaddit)")
    w("")
    tr, z = st["trained_on_dreaddit"], st["tone_zero_shot"]
    w(table(["Model", "Test posts", "AUC (95% interval)", "F1", "Notes"],
            [["TF-IDF word model trained on Dreaddit train", st["test_posts"],
              f"{f2(tr['test_auc'])} ({f2(tr['test_auc_ci'][0])} to {f2(tr['test_auc_ci'][1])})", f2(tr["test_f1"]),
              f"C = {tr['C_by_train_cv']} picked on train only; accuracy {pc(tr['test_accuracy'])}"],
             ["The app's tone model, zero-shot", st["test_posts"],
              f"{f2(z['test_auc'])} ({f2(z['test_auc_ci'][0])} to {f2(z['test_auc_ci'][1])})", f2(z["test_f1_at_app_threshold"]),
              f"F1 at the app's threshold {z['threshold']}; flags {pc(z['flag_rate_stressed'])} of stressed posts and "
              f"{pc(z['flag_rate_not_stressed'])} of the rest"]]))
    w("")
    w(f"Median tone score: {z['median_score_stressed']:.3f} for stressed posts and {z['median_score_not_stressed']:.3f} for the rest.")
    w("")
    w(f"Over all {z['all_posts']} Dreaddit posts (train and test, none used to build it) the tone model scored {f2(z['all_posts_auc'])}.")
    w("")
    w("The tone model was trained on GoEmotions to spot low mood (sadness, grief, disappointment, remorse) and never saw a "
      "Dreaddit post. Stress and low mood are different things, so it is expected to rank stressed posts less well than a model "
      "trained on stress.")
    w("")
    w(f"Words the Dreaddit model leans on most for stressed: {', '.join(tr['top_stressed_terms'][:10])}. For not stressed: "
      f"{', '.join(tr['top_calm_terms'][:10])}.")
    w("")
    p = z["tone_ts_parity"]
    w("**Checking the Python copy of the tone model.** The scoring in this script copies `scoreTone()` in "
      "`app/src/engine/tone.ts`. It matched these cases worked by hand from the numbers in `tone.json`:")
    w("")
    w(table(["Text", "How it was worked", "By hand", "Python copy"],
            [[f"`{c['text']}`" if c["text"] else "(empty)", c["how"], f"{c['by_hand']:.6f}", f"{c['python_copy']:.6f}"] for c in z["hand_cases"]]))
    w("")
    if p and p.get("ran"):
        w(f"It also matched `tone.ts` itself, run under Node {p['node']}, on all {p['texts']} test posts (largest difference "
          f"{p['max_abs_diff']:.1e}).")
    else:
        w("The Node check against `tone.ts` did not run on this machine.")
    w("")
    w("## Caveats")
    w("")
    for cv in R["caveats"]:
        w(f"- {cv}")
    w("")
    w("## How to run")
    w("")
    w("```")
    w("bash scripts/get_data.sh       # downloads the five datasets into data/")
    w(".venv/bin/python -I experiments/exp8_music_gaming.py")
    w("```")
    w("")
    w("*This project is a prototype and is not medical advice. It was written with Claude (Anthropic).*")
    w("")
    return "\n".join(L)


def clear(c) -> int:
    """+1 or -1 when the 95% interval of a correlation sits on one side of zero, else 0."""
    return 1 if c["ci"][0] > 0 else (-1 if c["ci"][1] < 0 else 0)


def direction_text(mu) -> str:
    c = mu["correlations_0_10"]
    v, e, h = c["listening_valence"], c["listening_energy"], c["hours_per_day"]
    word = {1: "higher", -1: "lower"}
    out = []
    if clear(v) == 0:
        out.append(f"Listening valence (how happy the genres sound) showed no clear link with the 0 to 10 rating ({rho_l(v)}). "
                   f"With age taken out it was {mu['valence_vs_depression_age_removed']:+.2f}.")
    else:
        out.append(f"People whose genres are {word[-clear(v)]} in valence rated their depression {word[1]} ({rho_l(v)}).")
    if clear(e) != 0:
        out.append(f"Listening energy did line up: people who play higher-energy genres rated depression "
                   f"{word[clear(e)]} ({rho_l(e)}). The genres behind this are mostly metal and rock "
                   f"(rho {c['freq_Metal']['rho']:+.2f} and {c['freq_Rock']['rho']:+.2f}).")
    if clear(h) != 0:
        r = mu["rate_by_hours"]
        out.append(f"More hours of listening a day went with {word[clear(h)]} ratings ({rho_l(h)}). {pc(r[0]['rate'])} "
                   f"rated 7 or more at up to an hour a day, against {pc(r[-1]['rate'])} at over six hours.")
    out.append("All of these are small, and none says which way the cause runs. People who feel low may play more music, "
               "or louder music, to cope.")
    return " ".join(out)


def plain_sentences(R) -> dict:
    mu, ga, so, st = R["music"], R["gaming"], R["social"], R["stress"]
    a = mu["models"]["a_music_habits"]
    c = mu["correlations_0_10"]
    music = (f"In an open survey of {mu['people']} music listeners, listening habits told apart people with high self-rated "
             f"depression only a little better than chance (AUC {f2(a['auc'])}, where 0.50 is chance).")
    if clear(c["hours_per_day"]) > 0 and clear(c["listening_energy"]) > 0:
        music += (" People who listened more hours a day, and to higher-energy genres like metal and rock, rated their "
                  "depression a little higher.")
    if clear(c["listening_valence"]) == 0:
        music += " How happy their genres sound made no clear difference."
    g = ga["models"]["gaming_habits"]
    r = ga["rate_by_hours_per_week"]
    gaming = (f"Among {ga['people']:,} mostly adult male gamers, play habits weakly told apart those with moderate anxiety "
              f"(AUC {f2(g['auc'])}). The scale measures anxiety and says nothing direct about depression. The share with moderate anxiety was about "
              f"{pc(r[1]['rate'])} at 10 to 19 hours of play a week and {pc(r[-1]['rate'])} at 70 hours or more.")
    u = so["models"]["usage_only"]
    t = so["rate_by_daily_time"]
    social = (f"In a survey of {so['people']} people, how much and how aimlessly they used social media told apart those who often "
              f"feel down at an AUC of {f2(u['auc'])}. Of people on social media more than five hours a day, {pc(t[-1]['rate'])} "
              f"said they often feel down, against {pc(t[0]['rate'])} of those under an hour.")
    tr, z = st["trained_on_dreaddit"], st["tone_zero_shot"]
    stress = (f"A simple word model trained on stressed Reddit posts scored an AUC of {f2(tr['test_auc'])} on posts it never saw. "
              f"The app's own tone model, built to spot low mood, scored {f2(z['test_auc'])} on the same posts with no retraining.")
    return {"music": music, "gaming": gaming, "social": social, "stress": stress}


def main() -> None:
    R = {"generated": GENERATED, "seed": SEED, "folds": FOLDS, "repeats": REPEATS, "shuffles": SHUFFLES, "bootstrap": BOOT}
    R["music"] = part_music()
    R["gaming"] = part_gaming()
    R["social"] = part_social()
    R["stress"] = part_stress()
    R["headline"] = headline(R)
    R["plain_sentences"] = plain_sentences(R)
    R["caveats"] = caveats(R)
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "results.json").write_text(json.dumps(R, indent=2, default=float) + "\n")
    (RESULTS / "results.md").write_text(render(R))
    mu, ga, so, st = R["music"], R["gaming"], R["social"], R["stress"]
    pick = lambda r: {"auc": r["auc"], "auc_ci": r["auc_ci"], "n": r["n"], "base_rate": r["base_rate"]}
    APP_SUMMARY.write_text(json.dumps({
        "generated": GENERATED, "headline": R["headline"],
        "music": {"outcome": "self-rated depression 7+ of 10", "music_habits": pick(mu["models"]["a_music_habits"]),
                  "mood_and_hours": pick(mu["models"]["b_mood_and_hours"]), "age_only": pick(mu["models"]["c_age_only"]),
                  "valence_vs_depression_rho": mu["correlations_0_10"]["listening_valence"]["rho"],
                  "valence_vs_depression_ci": mu["correlations_0_10"]["listening_valence"]["ci"],
                  "teen_n": mu["teen"]["n"],
                  "teen_music_habits_auc": mu["teen"].get("a_music_habits", {}).get("auc"),
                  "teen_music_habits_auc_ci": mu["teen"].get("a_music_habits", {}).get("auc_ci")},
        "gaming": {"outcome": "GAD-7 10+ (an anxiety scale; says nothing direct about depression)", "gaming_habits": pick(ga["models"]["gaming_habits"]),
                   "hours_only_auc": ga["models"]["hours_only"]["auc"],
                   "rate_by_hours_per_week": [{"hours": r["group"], "n": r["n"], "rate": r["rate"]} for r in ga["rate_by_hours_per_week"]]},
        "social_media": {"outcome": "feels depressed or down 4+ of 5", "usage_only": pick(so["models"]["usage_only"]),
                         "age_only_auc": so["models"]["age_only"]["auc"],
                         "usage_plus_feelings_auc_not_fair": so["models"]["usage_plus_feelings"]["auc"]},
        "stress_language": {"trained_on_dreaddit_auc": st["trained_on_dreaddit"]["test_auc"],
                            "trained_on_dreaddit_auc_ci": st["trained_on_dreaddit"]["test_auc_ci"],
                            "trained_on_dreaddit_f1": st["trained_on_dreaddit"]["test_f1"],
                            "app_tone_model_auc": st["tone_zero_shot"]["test_auc"],
                            "app_tone_model_auc_ci": st["tone_zero_shot"]["test_auc_ci"],
                            "test_posts": st["test_posts"]},
        "plain_sentences": R["plain_sentences"],
        "caveats": R["caveats"]}, indent=2) + "\n")
    print(R["headline"])


if __name__ == "__main__":
    main()
