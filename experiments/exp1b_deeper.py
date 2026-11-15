"""Experiment 1b for Steady: how well can phone data pick out a high PHQ-2 week?

Run end to end with:

    .venv/bin/python experiments/exp1b_deeper.py

Experiment 1 found that the drift rule picks weeks no better than chance. This
script asks the wider question honestly, under these framings:

    1a. across students, phone data from the same calendar week (an association)
    1b. across students, phone data only from days before the PHQ-2 answer
    2.  personal models after each student's first 8 or 16 eligible weeks
    3.  between students, one row per student-term (an association)
    4.  change detection: a rise of 2+ points over the student's running mean
    5.  check-ins (single, last week, history) and earlier PHQ-2 answers
    5b. the same with every questionnaire input 14+ days before the answer
    6.  baselines and a label-shuffle control in every framing
    7.  external data: Depresjon (actigraphy) and StudentLife 2013

Every number is AUC, PR-AUC and interpolated test-ROC sensitivity at 80%
specificity, each with a 95% interval from a bootstrap over students. Features
are normalised only with the student's own past or inside training folds. Any
honest AUC above 0.90 is flagged and investigated, and a separate section
builds deliberate leaks to show what a near-perfect number is made of.

Data terms: College Experience Study, CC BY-NC-SA 4.0, academic use only, no
re-identification, no per-student rows in any output. Depresjon: cite the
dataset paper. StudentLife (Zenodo RData copy): CC BY 4.0, cite the paper.
Everything this script writes is an aggregate.

Outputs:
    results/exp1b/results.json
    results/exp1b/results.md
    app/public/data/exp1b_summary.json
Caches (local, gitignored): data/cache/exp1b_*
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from joblib import Parallel, delayed, parallel_config
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedGroupKFold, StratifiedKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import QuantileTransformer

sys.path.insert(0, str(Path(__file__).resolve().parent))
import exp1_timing as ex  # noqa: E402  (weekly grid, labels, core signals)

warnings.filterwarnings("ignore", category=RuntimeWarning)
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=pd.errors.PerformanceWarning)

# ---------------------------------------------------------------------------
# Paths and settings
# ---------------------------------------------------------------------------

REPO = ex.REPO
DATA = ex.DATA
CACHE = ex.CACHE
RESULTS_DIR = REPO / "results" / "exp1b"
APP_JSON = REPO / "app" / "public" / "data" / "exp1b_summary.json"
DEP_DIR = REPO / "data" / "depresjon"
SL_DIR = REPO / "data" / "studentlife"

GENERATED = "2026-11-14"
SEED = 20261114
N_BOOT = 1000
N_FOLDS = 5
MIN_PAST_WEEKS = 4          # a past-only z needs at least 4 earlier valid weeks
Z_CLIP = 5.0
LEAK_FLAG_AUC = 0.90        # any honest AUC above this is treated as a suspected leak
PERSONAL_N = [8, 16]        # first N labelled weeks per student for personal models
PERSONAL_MIN_TEST = 4       # and at least this many later labelled weeks to test on
TERM_MIN_LABELS = 4         # a student-term needs >= 4 labelled weeks
TERM_MIN_VALID = 4          # and >= 4 valid weeks of phone data
CHANGE_RISE = 2             # framing 4: PHQ-2 at least 2 points over the running mean
CHANGE_MIN_PRIOR = 4        # running mean needs >= 4 earlier answers
SPEC_TARGET = 0.80
CACHE_VERSION = 4

DATA_TERMS = {
    "ces": {
        "name": "College Experience Study (Dartmouth, 2017 to 2022)",
        "source": "Kaggle dataset subigyanepal/college-experience-dataset, already in data/ces/",
        "license": "CC BY-NC-SA 4.0",
        "terms": "Academic use only. No re-identification. No per-student rows in any output. Cite Nepal et al., IMWUT 2024."},
    "depresjon": {
        "name": "Depresjon (Simula Research Laboratory)",
        "source": "https://datasets.simula.no/depresjon/ , file depresjon.zip (5.4 MB), no account or agreement",
        "license": "No licence named. The page's terms of use ask that any document reporting results cites Garcia-Ceja et al., MMSys 2018.",
        "terms": "Cite the dataset paper."},
    "studentlife": {
        "name": "StudentLife 2013 (Dartmouth), RData copy",
        "source": "Zenodo record 3529253, file dataset_rds.zip (230 MB), open access, no account. "
                  "The original site studentlife.cs.dartmouth.edu did not answer from this machine.",
        "license": "CC BY 4.0 on the Zenodo record",
        "terms": "Cite Wang et al., UbiComp 2014. The original site's own terms could not be read because it was unreachable."},
}

NIGHT_HOURS = list(range(5))
PLATFORM_ONLY_NOTE = "iPhone-only and Android-only features are missing for the other platform."


def _log(msg: str, verbose: bool = True) -> None:
    if verbose:
        print(msg, flush=True)


# ---------------------------------------------------------------------------
# 1. Daily and weekly feature tables (CES)
# ---------------------------------------------------------------------------

def _sensing_columns() -> tuple[list[str], list[str]]:
    with open(DATA / "Sensing" / "sensing.csv") as f:
        header = f.readline().strip().split(",")
    day_cols = [c for c in header if "_hr_" not in c and c not in ("uid", "day", "is_ios")]
    night_cols = ([f"unlock_duration_hr_{h}" for h in NIGHT_HOURS]
                  + [f"other_playing_duration_hr_{h}" for h in NIGHT_HOURS])
    return day_cols, night_cols


def load_daily_full(refresh: bool = False, verbose: bool = True) -> tuple[pd.DataFrame, list[str]]:
    """Every daily (non-hourly) sensing feature plus night-time phone use and
    audio, one row per student-day. Cached as parquet."""
    cache = CACHE / "exp1b_daily_full.parquet"
    day_cols, night_cols = _sensing_columns()
    if cache.exists() and not refresh:
        d = pd.read_parquet(cache)
        feats = [c for c in d.columns if c not in ("uid", "is_ios", "date", "monday", "usable")]
        return d, feats
    t0 = time.time()
    raw = pd.read_csv(DATA / "Sensing" / "sensing.csv", engine="pyarrow",
                      usecols=["uid", "is_ios", "day"] + day_cols + night_cols)
    steps = pd.read_csv(DATA / "Sensing" / "steps.csv", usecols=["uid", "day", "step_ep_0"])
    raw = raw.merge(steps, on=["uid", "day"], how="left")
    ios = raw["is_ios"] == 1
    date = pd.to_datetime(raw["day"].astype(str), format="%Y%m%d")
    cols = {"uid": raw["uid"], "is_ios": raw["is_ios"].astype(int), "date": date,
            "monday": ex._monday(date),
            "usable": ((raw["quality_activity"] >= ex.QUALITY_MIN_HOURS)
                       & (raw["quality_loc"] >= ex.QUALITY_MIN_HOURS))}
    no_sleep = ~(raw["sleep_duration"] > 0)
    for c in day_cols:
        v = raw[c].astype("float32")
        if c in ("sleep_duration", "sleep_start", "sleep_end"):
            v = v.where(~no_sleep)
        cols[c] = v
    cols["night_unlock_min"] = (raw[[f"unlock_duration_hr_{h}" for h in NIGHT_HOURS]].sum(axis=1) / 60.0
                                ).astype("float32")
    na = raw[[f"other_playing_duration_hr_{h}" for h in NIGHT_HOURS]].sum(axis=1, min_count=1) / 60.0
    cols["night_audio_min"] = na.where(ios).astype("float32")
    cols["steps"] = raw["step_ep_0"].where(ios & (raw["step_ep_0"] > 0)).astype("float32")
    out = pd.DataFrame(cols)
    CACHE.mkdir(parents=True, exist_ok=True)
    out.to_parquet(cache, index=False)
    feats = [c for c in out.columns if c not in ("uid", "is_ios", "date", "monday", "usable")]
    _log(f"  daily table: {len(out):,} rows, {len(feats)} features ({time.time() - t0:.0f}s)", verbose)
    return out, feats


def _drop_constant(cols: list[str], df: pd.DataFrame) -> list[str]:
    keep = []
    for c in cols:
        s = df[c]
        if s.notna().sum() >= 200 and s.nunique(dropna=True) > 1:
            keep.append(c)
    return keep


def past_only_z(wk: pd.DataFrame, cols: list[str], min_past: int = MIN_PAST_WEEKS,
                clip: float = Z_CLIP) -> pd.DataFrame:
    """z of this week against the mean and SD of the same student's EARLIER
    valid weeks only. Weeks with fewer than `min_past` earlier values get NaN.
    Nothing from the current or any later week enters the mean or the SD."""
    sid = wk["sid"].to_numpy()
    V = wk[cols].astype("float64").where(wk["valid"], axis=0)
    has = V.notna().astype("float64")
    V0 = V.fillna(0.0)
    cnt = has.groupby(sid).cumsum() - has
    s1 = V0.groupby(sid).cumsum() - V0
    s2 = (V0 ** 2).groupby(sid).cumsum() - V0 ** 2
    mean = s1 / cnt.where(cnt > 0)
    var = (s2 - cnt * mean ** 2) / (cnt - 1).where(cnt > 1)
    sd = np.sqrt(var.clip(lower=0.0))
    z = (V - mean) / sd.where(sd > 1e-9)
    same = (sd <= 1e-9) & V.notna()
    z = z.where(~same, np.sign(V - mean).fillna(0.0) * clip)
    z = z.where(cnt >= min_past).clip(-clip, clip)
    z.columns = ["z_" + c[len("mean_"):] if c.startswith("mean_") else "z_" + c for c in cols]
    return z


def last_week(wk: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    """The same features one calendar week earlier (NaN if that week was not valid)."""
    V = wk[cols].where(wk["valid"], axis=0)
    lag = V.groupby(wk["sid"].to_numpy()).shift(1)
    lag.columns = ["lag_" + c[len("mean_"):] if c.startswith("mean_") else "lag_" + c for c in cols]
    return lag


def label_answer_dates(wk: pd.DataFrame) -> pd.Series:
    """The date of the answer that labels each week (same rule as Experiment 1:
    the answer nearest Sunday, within 3 days). Used only for leakage checks."""
    a = ex.load_answers()
    a["monday"] = ex._monday(a["date"] - pd.Timedelta(days=ex.LABEL_WINDOW_DAYS))
    a["dist"] = (a["date"] - (a["monday"] + pd.Timedelta(days=6))).dt.days.abs()
    a = a.sort_values(["uid", "monday", "dist", "date"]).drop_duplicates(["uid", "monday"], keep="first")
    m = wk[["uid", "monday"]].merge(a[["uid", "monday", "date", "phq2"]], on=["uid", "monday"], how="left")
    ok = np.allclose(m["phq2"].fillna(-1).to_numpy(), wk["phq2"].fillna(-1).to_numpy())
    if not ok:
        raise AssertionError("label dates do not match Experiment 1 labels")
    return pd.Series(m["date"].to_numpy(), index=wk.index, name="label_date")


def load_ema() -> pd.DataFrame:
    e = pd.read_csv(DATA / "EMA" / "general_ema.csv",
                    usecols=["uid", "day", "pam", "stress", "social_level", "phq4-1", "phq4-2",
                             "phq4-3", "phq4-4", "phq4_score"])
    e["date"] = pd.to_datetime(e["day"].astype(str), format="%Y%m%d")
    e["monday"] = ex._monday(e["date"])
    # Photographic Affect Meter: the student picks one of 16 pictures in a 4 x 4
    # grid. We could not check the study's own numbering of the grid, so the
    # pictures are grouped into the four 2 x 2 blocks of a grid numbered row by
    # row (1, 2, 5, 6 top left; 3, 4, 7, 8 top right; 9, 10, 13, 14 bottom left;
    # 11, 12, 15, 16 bottom right) and the models learn what each block means.
    p = e["pam"]
    row_, col_ = (p - 1) // 4, (p - 1) % 4
    for name, (r0, c0) in PAM_BLOCKS.items():
        e[name] = (((row_ // 2) == r0) & ((col_ // 2) == c0)).astype(float).where(p.notna())
    return e


PAM_BLOCKS = {"pam_block_top_left": (0, 0), "pam_block_top_right": (0, 1),
              "pam_block_bottom_left": (1, 0), "pam_block_bottom_right": (1, 1)}
CHECKIN_ITEMS = list(PAM_BLOCKS) + ["stress", "social_level"]


def checkin_features(wk: pd.DataFrame, ema: pd.DataFrame) -> pd.DataFrame:
    """One-tap check-ins the app could ask: PAM mood picture, stress and time
    alone or with others. For week t only answers from calendar week t-1
    (Monday to Sunday) and earlier are used. The label answer for week t falls
    on Thursday of week t or later, so no answer from the label survey, and no
    answer from week t itself, enters these features."""
    e = ema.dropna(subset=["pam", "stress", "social_level"], how="all")
    g = e.groupby(["uid", "monday"])
    wsum = g[CHECKIN_ITEMS].sum(min_count=1)
    wcnt = g[CHECKIN_ITEMS].count()
    wmax = g["date"].max().rename("ci_last_date")
    grid = wk[["uid", "monday", "sid"]].copy()
    S = grid.merge(wsum.reset_index(), on=["uid", "monday"], how="left")[CHECKIN_ITEMS]
    C = grid.merge(wcnt.reset_index(), on=["uid", "monday"], how="left")[CHECKIN_ITEMS].fillna(0)
    D = grid.merge(wmax.reset_index(), on=["uid", "monday"], how="left")["ci_last_date"]
    sid = grid["sid"].to_numpy()
    S0 = S.fillna(0.0)
    out = pd.DataFrame(index=wk.index)
    # last calendar week
    lw_s = S0.groupby(sid).shift(1)
    lw_c = C.groupby(sid).shift(1)
    lw_mean = lw_s / lw_c.where(lw_c > 0)
    # all calendar weeks before this one
    cs = S0.groupby(sid).cumsum() - S0
    cc = C.groupby(sid).cumsum() - C
    past_mean = cs / cc.where(cc > 0)
    # all calendar weeks before LAST week (the student's usual, for a change score)
    cs2 = cs - lw_s.fillna(0.0)
    cc2 = cc - lw_c.fillna(0.0)
    older_mean = cs2 / cc2.where(cc2 > 0)
    for c in CHECKIN_ITEMS:
        out[f"ci_lastweek_{c}"] = lw_mean[c].to_numpy()
        out[f"ci_past_{c}"] = past_mean[c].to_numpy()
        out[f"ci_change_{c}"] = (lw_mean[c] - older_mean[c]).to_numpy()
    out["ci_lastweek_n"] = lw_c["pam_block_top_left"].to_numpy()
    out["_ci_last_date_used"] = pd.Series(D.to_numpy()).groupby(sid).shift(1).to_numpy()
    return out


def label_history_window(wk: pd.DataFrame) -> pd.DataFrame:
    """FIRST VERSION, KEPT ONLY TO SHOW THE LEAK. "Last week's PHQ-2" taken as
    last week's label. That label's window runs to Wednesday of THIS week, so
    the answer can sit 1 to 3 days before this week's answer, in the same
    calendar week, and describe almost the same two weeks of mood."""
    sid = wk["sid"].to_numpy()
    p = wk["phq2"]
    prev_any = p.groupby(sid).shift(1).groupby(sid).ffill()
    has = p.notna().astype(float)
    cnt = has.groupby(sid).cumsum() - has
    s = p.fillna(0.0).groupby(sid).cumsum() - p.fillna(0.0)
    run_mean = s / cnt.where(cnt > 0)
    ld = wk["label_date"]
    prev_date = ld.groupby(sid).shift(1).groupby(sid).ffill()
    return pd.DataFrame({"win_prev_phq2": prev_any.to_numpy(), "win_run_mean_phq2": run_mean.to_numpy(),
                         "win_prev_date": prev_date.to_numpy()}, index=wk.index)


def label_history(wk: pd.DataFrame, answers: pd.DataFrame, cut_days_before_monday: int = 0,
                  prefix: str = "") -> pd.DataFrame:
    """Earlier PHQ-2 answers only, dated before Monday of week t (minus
    `cut_days_before_monday`). This week's answer falls on Thursday of week t or
    later, so every answer used here is at least 4 days older. With a cut of 11
    days, the answers used share no day with this week's two-week recall window.

    prev_phq2: the most recent such answer. prev_phq2_exact: the same, only if
    it was given in calendar week t-1. run_mean_phq2: mean of all such answers.
    n_prior_labels: how many there are. weeks_since_prev: age of the latest."""
    a = answers.sort_values("date").copy()
    a["cum_sum"] = a.groupby("uid")["phq2"].cumsum()
    a["cum_n"] = a.groupby("uid").cumcount() + 1
    q = wk[["uid", "monday"]].copy()
    q["_row"] = np.arange(len(q))
    q["cut"] = q["monday"] - pd.Timedelta(days=cut_days_before_monday)
    m = pd.merge_asof(q.sort_values("cut"), a[["uid", "date", "phq2", "cum_sum", "cum_n"]].rename(
        columns={"phq2": "prev"}), left_on="cut", right_on="date", by="uid",
        allow_exact_matches=False, direction="backward").sort_values("_row")
    prev = m["prev"].to_numpy(float)
    age = (m["monday"] - m["date"]).dt.days.to_numpy(float)
    exact = np.where(age <= 7 + cut_days_before_monday, prev, np.nan)
    out = pd.DataFrame({"prev_phq2": prev, "prev_phq2_exact": exact,
                        "run_mean_phq2": (m["cum_sum"] / m["cum_n"]).to_numpy(float),
                        "n_prior_labels": m["cum_n"].fillna(0).to_numpy(float),
                        "weeks_since_prev": age / 7.0, "prev_date": m["date"].to_numpy()}, index=wk.index)
    if prefix:
        out.columns = [prefix + c for c in out.columns]
    return out


def core_past_z(wk: pd.DataFrame) -> pd.DataFrame:
    """Experiment 1's six core signals, z against the student's own past weeks,
    in the worse direction. Used by the personal models."""
    keys = [s["key"] for s in ex.CORE_SIGNALS]
    tmp = wk[["sid", "valid"] + keys].copy()
    z = past_only_z(tmp, keys)
    direc = ex._direction(ex.CORE_SIGNALS)
    z = z * direc
    z.columns = [f"core_z_{k}" for k in keys]
    return z


def asof_events(rows: pd.DataFrame, events: pd.DataFrame, cols: list[str], prefix: str) -> pd.DataFrame:
    """For each row (uid, cutoff), the latest event dated strictly before the
    cutoff and the mean of every event strictly before it, per column."""
    ev = events[["uid", "date"] + cols].sort_values("date").copy()
    sums, cnts = [], []
    for c in cols:
        ev[f"_s_{c}"] = ev[c].fillna(0.0).groupby(ev["uid"]).cumsum()
        ev[f"_n_{c}"] = ev[c].notna().astype(float).groupby(ev["uid"]).cumsum()
        sums.append(f"_s_{c}")
        cnts.append(f"_n_{c}")
    q = rows[["uid", "cutoff"]].copy()
    q["_row"] = np.arange(len(q))
    q = q[q["cutoff"].notna()]
    m = pd.merge_asof(q.sort_values("cutoff"), ev.rename(columns={"date": "_date"}), left_on="cutoff",
                      right_on="_date", by="uid", allow_exact_matches=False, direction="backward")
    m = m.sort_values("_row")
    out = pd.DataFrame(index=np.arange(len(rows)))
    for c in cols:
        out[f"{prefix}latest_{c}"] = np.nan
        out[f"{prefix}mean_{c}"] = np.nan
        out.loc[m["_row"].to_numpy(), f"{prefix}latest_{c}"] = m[c].to_numpy(float)
        out.loc[m["_row"].to_numpy(), f"{prefix}mean_{c}"] = (m[f"_s_{c}"] / m[f"_n_{c}"].where(m[f"_n_{c}"] > 0)
                                                              ).to_numpy(float)
    out[f"{prefix}latest_date"] = pd.NaT
    out.loc[m["_row"].to_numpy(), f"{prefix}latest_date"] = m["_date"].to_numpy()
    out.index = rows.index
    return out


def prospective_features(W: pd.DataFrame, daily: pd.DataFrame, mean_cols: list[str], sd_cols: list[str]) -> pd.DataFrame:
    """Phone features built only from days STRICTLY BEFORE the PHQ-2 answer date.

    Window: the 7 days before the answer (answer day excluded). Mean and SD over
    the window's usable days; usable-day count; last window (8 to 14 days
    before); z against the student's calendar weeks that ended at least 8 days
    before the answer (so the baseline never overlaps the window). Eligible when
    the window has >= 4 usable days and the baseline has >= 4 valid weeks."""
    feats = [c[len("mean_"):] for c in mean_cols]
    sdf = [c[len("sd_"):] for c in sd_cols]
    rows = W.loc[W["label_date"].notna(), ["uid", "label_date"]].copy()
    rows["_row"] = rows.index
    u = daily.loc[daily["usable"], ["uid", "date"] + sorted(set(feats) | set(sdf))]

    def window(k0: int, k1: int):
        k = np.arange(k0, k1 + 1)
        e = rows.loc[rows.index.repeat(len(k))].copy()
        e["date"] = e["label_date"] - pd.to_timedelta(np.tile(k, len(rows)), unit="D")
        mm = e.merge(u, on=["uid", "date"], how="inner")
        return mm.groupby("_row")

    out = pd.DataFrame(index=W.index)
    g = window(1, 7)
    pm = g[feats].mean()
    ps = g[sdf].std(ddof=1)
    n = g.size()
    out = out.join(pm.add_prefix("pmean_")).join(ps.add_prefix("psd_"))
    out["p_usable_days"] = n.reindex(W.index).fillna(0).to_numpy()
    out["_p_last_day_used"] = g["date"].max().reindex(W.index)
    gl = window(8, 14)
    lagm = gl[feats].mean()
    lag_n = gl.size()
    lagm = lagm.where(lag_n.reindex(lagm.index) >= ex.MIN_DAYS_PER_WEEK, axis=0)
    out = out.join(lagm.add_prefix("plag_"))
    # baseline: valid calendar weeks with Monday <= answer date - 14 (so Sunday <= answer - 8)
    V = W[mean_cols].astype("float64").where(W["valid"], axis=0)
    has = V.notna().astype("float64")
    V0 = V.fillna(0.0)
    sid = W["sid"].to_numpy()
    cnt = has.groupby(sid).cumsum()
    s1 = V0.groupby(sid).cumsum()
    s2 = (V0 ** 2).groupby(sid).cumsum()
    nvalid = W["valid"].astype(int).groupby(sid).cumsum()
    key = pd.DataFrame({"uid": W["uid"], "monday": W["monday"]})
    look = rows[["uid"]].copy()
    look["monday"] = ex._monday(rows["label_date"] - pd.Timedelta(days=14))
    look["_row"] = rows.index
    pos = key.reset_index().merge(look, on=["uid", "monday"], how="inner")
    take = pos["index"].to_numpy()
    dest = pos["_row"].to_numpy()
    C = pd.DataFrame(np.nan, index=W.index, columns=mean_cols)
    S1, S2 = C.copy(), C.copy()
    C.loc[dest] = cnt.to_numpy()[take]
    S1.loc[dest] = s1.to_numpy()[take]
    S2.loc[dest] = s2.to_numpy()[take]
    nb = pd.Series(np.nan, index=W.index)
    nb.loc[dest] = nvalid.to_numpy()[take]
    mean_b = S1 / C.where(C > 0)
    sd_b = np.sqrt(((S2 - C * mean_b ** 2) / (C - 1).where(C > 1)).clip(lower=0.0))
    cur = out[[f"pmean_{f}" for f in feats]].to_numpy(float)
    z = (cur - mean_b.to_numpy()) / np.where(sd_b.to_numpy() > 1e-9, sd_b.to_numpy(), np.nan)
    z = np.where(C.to_numpy() >= MIN_PAST_WEEKS, np.clip(z, -Z_CLIP, Z_CLIP), np.nan)
    out = pd.concat([out, pd.DataFrame(z, index=W.index, columns=[f"pz_{f}" for f in feats])], axis=1)
    out["p_baseline_weeks"] = nb.fillna(0).to_numpy()
    out["prosp_ok"] = (W["label"].notna() & (out["p_usable_days"] >= ex.MIN_DAYS_PER_WEEK)
                       & (out["p_baseline_weeks"] >= MIN_PAST_WEEKS)).to_numpy()
    return out


def checkin_single(W: pd.DataFrame, ema: pd.DataFrame) -> pd.DataFrame:
    """The single latest check-in answer given in calendar week t-1."""
    e = ema.dropna(subset=["pam", "stress", "social_level"], how="all")
    rows = pd.DataFrame({"uid": W["uid"].to_numpy(), "cutoff": W["monday"].to_numpy()}, index=W.index)
    a = asof_events(rows, e, CHECKIN_ITEMS, "ci1_")
    recent = (W["monday"] - pd.to_datetime(a["ci1_latest_date"])).dt.days <= 7
    out = pd.DataFrame(index=W.index)
    for c in CHECKIN_ITEMS:
        out[f"ci_last1_{c}"] = a[f"ci1_latest_{c}"].where(recent)
    return out


def separated_questionnaire(W: pd.DataFrame, ema: pd.DataFrame, answers: pd.DataFrame) -> pd.DataFrame:
    """Every questionnaire input dated at least 14 days before this week's PHQ-2
    answer, so it shares no day with the two weeks that answer describes."""
    rows = pd.DataFrame({"uid": W["uid"].to_numpy(),
                         "cutoff": (W["label_date"] - pd.Timedelta(days=13)).to_numpy()}, index=W.index)
    e = ema.dropna(subset=["pam", "stress", "social_level"], how="all")
    ci = asof_events(rows, e, CHECKIN_ITEMS, "sep_ci_")
    ph = asof_events(rows, answers.rename(columns={"phq2": "phq2"}), ["phq2"], "sep_")
    out = pd.concat([ci.drop(columns=["sep_ci_latest_date"]), ph], axis=1)
    out["sep_phq2_age_days"] = (W["label_date"] - pd.to_datetime(out["sep_latest_date"])).dt.days
    out["sep_ci_age_days"] = (W["label_date"] - pd.to_datetime(ci["sep_ci_latest_date"])).dt.days
    out = out.rename(columns={"sep_latest_date": "_sep_phq2_date"})
    out["_sep_ci_date"] = ci["sep_ci_latest_date"]
    return out


def build_tables(refresh: bool = False, verbose: bool = True) -> tuple[pd.DataFrame, dict]:
    """The Experiment 1 weekly grid plus every feature family used here."""
    cache = CACHE / "exp1b_weekly_features.parquet"
    meta_cache = CACHE / "exp1b_weekly_features.json"
    if cache.exists() and meta_cache.exists() and not refresh:
        meta = json.loads(meta_cache.read_text())
        if meta.get("version") == CACHE_VERSION:
            return pd.read_parquet(cache), meta
    t0 = time.time()
    wk = ex.build_weekly(refresh, verbose)  # --refresh rebuilds Experiment 1's weekly cache too
    daily, dfeats = load_daily_full(refresh, verbose)
    u = daily[daily["usable"]]
    g = u.groupby(["uid", "monday"])[dfeats]
    mean = g.mean().add_prefix("mean_")
    sd = g.std(ddof=1).add_prefix("sd_")
    agg = pd.concat([mean, sd], axis=1).copy().reset_index()
    W = wk.merge(agg, on=["uid", "monday"], how="left")
    assert len(W) == len(wk) and (W["uid"].to_numpy() == wk["uid"].to_numpy()).all()
    mean_cols = _drop_constant([f"mean_{c}" for c in dfeats], W[W["valid"]])
    sd_cols = _drop_constant([f"sd_{c}" for c in dfeats], W[W["valid"]])
    W = W.drop(columns=[c for c in agg.columns if c.startswith(("mean_", "sd_"))
                        and c not in mean_cols + sd_cols])
    W[mean_cols + sd_cols] = W[mean_cols + sd_cols].where(W["valid"], axis=0)
    z = past_only_z(W, mean_cols)
    lag = last_week(W, mean_cols)
    W = pd.concat([W, z, lag], axis=1)
    W["label_date"] = label_answer_dates(W)
    ema = load_ema()
    ci = checkin_features(W, ema)
    answers = ex.load_answers()
    W = pd.concat([W, ci, checkin_single(W, ema), label_history(W, answers),
                   label_history(W, answers, 11, prefix="far_"), label_history_window(W), core_past_z(W),
                   separated_questionnaire(W, ema, answers)], axis=1)
    W = pd.concat([W, prospective_features(W, daily, mean_cols, sd_cols)], axis=1)
    # same-survey items, used ONLY by the deliberate-leak demonstrations
    lab_rows = W[["uid", "label_date"]].merge(
        ema[["uid", "date", "phq4-1", "phq4-2", "phq4_score"]].rename(columns={"date": "label_date"}),
        on=["uid", "label_date"], how="left")
    W["leak_same_survey_anx1"] = lab_rows["phq4-1"].to_numpy()
    W["leak_same_survey_anx2"] = lab_rows["phq4-2"].to_numpy()
    W["leak_same_survey_phq4_score"] = lab_rows["phq4_score"].to_numpy()
    W["platform_ios"] = W["is_ios"].astype(float)
    W["usable_days"] = W["n_usable"].astype(float)
    meta = {
        "version": CACHE_VERSION,
        "daily_features": dfeats,
        "mean_cols": mean_cols, "sd_cols": sd_cols,
        "z_cols": list(z.columns), "lag_cols": list(lag.columns),
        "checkin_cols": [c for c in ci.columns if not c.startswith("_")],
        "checkin_lastweek_cols": [c for c in ci.columns if c.startswith("ci_lastweek_") and c != "ci_lastweek_n"],
        "checkin_single_cols": [f"ci_last1_{c}" for c in CHECKIN_ITEMS],
        "separated_cols": ([f"sep_ci_latest_{c}" for c in CHECKIN_ITEMS] + [f"sep_ci_mean_{c}" for c in CHECKIN_ITEMS]
                           + ["sep_latest_phq2", "sep_mean_phq2", "sep_phq2_age_days", "sep_ci_age_days"]),
        "prospective_cols": ([f"pmean_{c[5:]}" for c in mean_cols] + [f"psd_{c[3:]}" for c in sd_cols]
                             + [f"pz_{c[5:]}" for c in mean_cols] + [f"plag_{c[5:]}" for c in mean_cols]
                             + ["p_usable_days", "platform_ios"]),
        "core_z_cols": [f"core_z_{s['key']}" for s in ex.CORE_SIGNALS],
        "context_cols": ["platform_ios", "usable_days"],
    }
    CACHE.mkdir(parents=True, exist_ok=True)
    W.to_parquet(cache, index=False)
    meta_cache.write_text(json.dumps(meta))
    _log(f"  weekly feature table: {len(W):,} rows x {W.shape[1]} columns ({time.time() - t0:.0f}s)", verbose)
    return W, meta


def passive_cols(meta: dict) -> list[str]:
    return meta["mean_cols"] + meta["sd_cols"] + meta["z_cols"] + meta["lag_cols"] + meta["context_cols"]


FORBIDDEN_IN_PASSIVE = ("phq", "label", "pam", "stress", "social_level", "leak", "ci_", "prev_", "run_mean",
                        "win_", "far_")


def assert_passive(cols: list[str]) -> None:
    bad = [c for c in cols if any(t in c for t in FORBIDDEN_IN_PASSIVE)]
    if bad:
        raise AssertionError(f"self-report or label columns in a passive feature set: {bad[:5]}")


# ---------------------------------------------------------------------------
# 2. Metrics with a bootstrap over students
# ---------------------------------------------------------------------------

def _prep_scores(y: np.ndarray, s: np.ndarray) -> tuple[np.ndarray, np.ndarray, int]:
    order = np.argsort(-s, kind="mergesort")
    ss = s[order]
    newblk = np.r_[True, ss[1:] != ss[:-1]]
    blk = np.cumsum(newblk) - 1
    return order, blk, int(blk[-1] + 1)


def _weighted_metrics(yo: np.ndarray, blk: np.ndarray, nblk: int, w: np.ndarray,
                      spec: float = SPEC_TARGET) -> tuple[float, float, float]:
    """AUC, average precision and sensitivity at `spec` specificity for
    weighted rows. Rows are pre-sorted by descending score; ties form blocks.
    With unit weights this matches sklearn's roc_auc_score and
    average_precision_score."""
    bp = np.bincount(blk, weights=w * yo, minlength=nblk)
    bn = np.bincount(blk, weights=w * (1.0 - yo), minlength=nblk)
    P, N = bp.sum(), bn.sum()
    if P <= 0 or N <= 0:
        return np.nan, np.nan, np.nan
    tp, fp = np.cumsum(bp), np.cumsum(bn)
    auc = float((bp * ((N - fp) + 0.5 * bn)).sum() / (P * N))
    ap = float(((tp / (tp + fp)) * bp).sum() / P)
    fpr, tpr = np.r_[0.0, fp / N], np.r_[0.0, tp / P]
    last = np.r_[fpr[1:] != fpr[:-1], True]
    sens = float(np.interp(1.0 - spec, fpr[last], tpr[last]))
    return auc, ap, sens


def evaluate(y, score, groups, n_boot: int = N_BOOT, seed: int = SEED, within: bool = True) -> dict:
    """Point estimates and 95% intervals from resampling students (groups)."""
    y = np.asarray(y, dtype=float)
    s = np.asarray(score, dtype=float)
    groups = np.asarray(groups)
    ok = ~np.isnan(s) & ~np.isnan(y)
    y, s, groups = y[ok], s[ok], groups[ok]
    gcode, guniq = pd.factorize(pd.Series(groups))
    G = len(guniq)
    order, blk, nblk = _prep_scores(y, s)
    yo, go = y[order], gcode[order]
    auc, ap, sens = _weighted_metrics(yo, blk, nblk, np.ones_like(yo))
    rng = np.random.default_rng(seed)
    B = np.empty((n_boot, 3))
    for b in range(n_boot):
        cnt = np.bincount(rng.integers(0, G, G), minlength=G).astype(float)
        B[b] = _weighted_metrics(yo, blk, nblk, cnt[go])
    ci = np.nanpercentile(B, [2.5, 97.5], axis=0)
    out = {"auc": auc, "auc_ci": [float(ci[0, 0]), float(ci[1, 0])],
           "pr_auc": ap, "pr_auc_ci": [float(ci[0, 1]), float(ci[1, 1])],
           "sens_at_80_spec": sens, "sens_at_80_spec_ci": [float(ci[0, 2]), float(ci[1, 2])],
           "base_rate": float(y.mean()), "n_rows": int(len(y)), "n_positive": int(y.sum()),
           "n_students": int(G)}
    if within:
        out["within_student_auc"] = ex.within_student_auc(y.astype(int), s, groups)
    return out


# ---------------------------------------------------------------------------
# 3. Models and grouped cross-validation
# ---------------------------------------------------------------------------

def make_model(name: str, n_rows: int = 10000, seed: int = SEED):
    if name == "logistic":
        return make_pipeline(
            QuantileTransformer(n_quantiles=min(200, max(10, n_rows // 5)), output_distribution="normal",
                                subsample=50000, random_state=seed),
            SimpleImputer(strategy="constant", fill_value=0.0, add_indicator=True, keep_empty_features=False),
            LogisticRegression(C=0.05 if n_rows > 2000 else 0.1, max_iter=1000, tol=1e-3))
    if name == "hgb":
        small = n_rows < 3000
        return HistGradientBoostingClassifier(
            learning_rate=0.05, max_iter=150, max_leaf_nodes=7 if small else 15, max_bins=63,
            min_samples_leaf=20 if small else 100, l2_regularization=1.0, max_features=0.3,
            early_stopping=False, random_state=seed)
    if name == "rf":
        return RandomForestClassifier(
            n_estimators=200 if n_rows < 3000 else 300, min_samples_leaf=5 if n_rows < 3000 else 20,
            max_features="sqrt",
            max_samples=0.5 if n_rows > 3000 else None, n_jobs=-1, random_state=seed)
    raise ValueError(name)


MODEL_LABEL = {"logistic": "Logistic regression", "hgb": "Gradient boosting (HistGB)", "rf": "Random forest"}


def grouped_folds(y: np.ndarray, groups: np.ndarray, n_folds: int = N_FOLDS, seed: int = SEED):
    """Stratified folds that never split a student across train and test."""
    cv = StratifiedGroupKFold(n_splits=n_folds, shuffle=True, random_state=seed)
    folds = list(cv.split(np.zeros(len(y)), y.astype(int), groups))
    for tr, te in folds:
        if np.intersect1d(np.unique(groups[tr]), np.unique(groups[te])).size:
            raise AssertionError("a student appears in both train and test")
    return folds


def _fit_fold(model: str, X: np.ndarray, y: np.ndarray, tr: np.ndarray, te: np.ndarray, seed: int):
    # Keep columns with at least two distinct values in the TRAINING part only.
    Xtr = X[tr]
    lo, hi = np.nanmin(Xtr, axis=0), np.nanmax(Xtr, axis=0)
    keep = np.isfinite(lo) & np.isfinite(hi) & (hi > lo)
    m = make_model(model, n_rows=len(tr), seed=seed)
    m.fit(Xtr[:, keep], y[tr].astype(int))
    return te, m.predict_proba(X[te][:, keep])[:, 1]


def cv_predict(X: np.ndarray, y: np.ndarray, groups: np.ndarray, model: str,
               folds=None, seed: int = SEED) -> np.ndarray:
    """Out-of-fold predicted risk. Every transform is fit inside the training fold."""
    if folds is None:
        folds = grouped_folds(y, groups, seed=seed)
    p = np.full(len(y), np.nan)
    if model in ("logistic", "hgb") and len(y) > 5000:
        # Run the folds side by side, each with a few threads. Gradient boosting
        # with every core on one small fold is much slower on this machine.
        with parallel_config(backend="loky", inner_max_num_threads=3):
            out = Parallel(n_jobs=len(folds))(delayed(_fit_fold)(model, X, y, tr, te, seed) for tr, te in folds)
    else:
        out = [_fit_fold(model, X, y, tr, te, seed) for tr, te in folds]
    for te, pt in out:
        p[te] = pt
    return p


def shuffled(y: np.ndarray, seed: int) -> np.ndarray:
    return np.random.default_rng(seed).permutation(y)


def row(framing: str, model: str, kind: str, metrics: dict, **extra) -> dict:
    r = {"framing": framing, "model": model, "kind": kind}
    r.update(metrics)
    r.update(extra)
    return r


def prior_score(prev: np.ndarray, fill: float) -> np.ndarray:
    """A past-PHQ-2 score with missing values set to a neutral fill (the
    median of the earlier answers), so every row can be ranked."""
    out = np.asarray(prev, dtype=float).copy()
    out[np.isnan(out)] = fill
    return out


# ---------------------------------------------------------------------------
# 4. Framings 1a and 1b: across students
# ---------------------------------------------------------------------------

F1A = "1a. Across students, same-week association"
F1B = "1b. Across students, phone data from before the answer"
F2 = "2. Personal model"
F3 = "3. Between students, same-term association"
F4 = "4. Change detection, phone data from before the answer"
F5 = "5. Check-ins and earlier answers"
F5S = "5b. Questionnaire inputs from before the recall window"
F7D = "7a. Depresjon (external)"
F7S = "7b. StudentLife 2013 (external)"
F1 = F1A  # the leak demonstrations compare against framing 1a

RECENT_PHQ = "Most recent PHQ-2 before Monday"
EXACT_PHQ = "PHQ-2 from last calendar week only, rows that have one"
HISTORY_COLS = ["prev_phq2", "prev_phq2_exact", "run_mean_phq2", "weeks_since_prev"]


def week_rows(W: pd.DataFrame) -> pd.DataFrame:
    """Labelled monitored weeks with same-week phone data: the 16,886
    student-weeks of Experiment 1."""
    return W[W["monitored"] & W["label"].notna()].assign(_w=lambda d: d.index).reset_index(drop=True)


def prospective_rows(W: pd.DataFrame) -> pd.DataFrame:
    """Labelled weeks with at least 4 usable phone days in the 7 days before the
    answer and at least 4 earlier valid weeks for the personal baseline."""
    return W[W["prosp_ok"]].assign(_w=lambda d: d.index).reset_index(drop=True)


def base_and_shuffle(framing: str, y: np.ndarray, g: np.ndarray, X: np.ndarray | None,
                     models=("logistic",), seed: int = SEED) -> list[dict]:
    out = [row(framing, "Base rate (no information)", "baseline", evaluate(y, np.zeros(len(y)), g, within=False))]
    if X is not None:
        for m in models:
            ys = shuffled(y, seed + 99)
            p = cv_predict(X, ys, g, m, grouped_folds(ys, g, seed=seed + 98))
            out.append(row(framing, f"Label-shuffle control ({MODEL_LABEL[m]})", "control",
                           evaluate(ys, p, g, within=False)))
    return out


def phq_baselines(framing: str, R: pd.DataFrame, y: np.ndarray, g: np.ndarray) -> list[dict]:
    """The most recent PHQ-2 answered before Monday of the week, with how old
    that answer is, and the stricter version that needs an answer from the
    previous calendar week (scored on its own, smaller population)."""
    prev = R["prev_phq2"].to_numpy(float)
    age = R["weeks_since_prev"].to_numpy(float) * 7.0
    ok = np.isfinite(age)
    cov = {"share_rows_with_value": float(np.isfinite(prev).mean()),
           "share_answer_1_to_7_days_before_monday": float((age[ok] <= 7).mean()),
           "share_answer_8_to_14_days_before_monday": float(((age[ok] > 7) & (age[ok] <= 14)).mean()),
           "share_answer_over_14_days_before_monday": float((age[ok] > 14).mean()),
           "max_answer_age_days": float(np.nanmax(age))}
    out = [row(framing, RECENT_PHQ, "baseline", evaluate(y, prior_score(prev, float(np.nanmedian(prev))), g), **cov)]
    ex_ = R["prev_phq2_exact"].to_numpy(float)
    m = np.isfinite(ex_)
    out.append(row(framing, EXACT_PHQ, "baseline", evaluate(y[m], ex_[m], g[m]),
                   share_rows_with_value=float(m.mean())))
    return out


def _three_models(framing: str, X: np.ndarray, y: np.ndarray, g: np.ndarray, folds, verbose: bool,
                  models=("logistic", "hgb", "rf"), prefix: str = "", kind: str = "model", **extra):
    rows, preds = [], {}
    for m in models:
        t0 = time.time()
        preds[m] = cv_predict(X, y, g, m, folds)
        rows.append(row(framing, prefix + MODEL_LABEL[m], kind, evaluate(y, preds[m], g), n_features=X.shape[1],
                        **extra))
        _log(f"  {framing[:3]} {prefix}{MODEL_LABEL[m]}: AUC {rows[-1]['auc']:.3f} ({time.time() - t0:.0f}s)", verbose)
    return rows, preds


def framing_same_week(D: pd.DataFrame, P: pd.DataFrame, meta: dict, verbose: bool = True) -> tuple[list[dict], dict]:
    """1a. Phone data from the calendar week of the label (Monday to Sunday).
    The answer can come on Thursday, so up to three days of this phone data
    can postdate it. This is an association, not a forecast."""
    y, g = D["label"].to_numpy(), D["sid"].to_numpy()
    cols = passive_cols(meta)
    assert_passive(cols)
    X = D[cols].to_numpy(np.float32)
    folds = grouped_folds(y, g)
    rows, preds = _three_models(F1A, X, y, g, folds, verbose)
    zc = meta["z_cols"] + meta["context_cols"]
    preds["hgb_z_only"] = cv_predict(D[zc].to_numpy(np.float32), y, g, "hgb", folds)
    rows.append(row(F1A, "Gradient boosting, own-past z-scores only", "variant",
                    evaluate(y, preds["hgb_z_only"], g), n_features=len(zc)))
    shared = D["_w"].isin(P["_w"]).to_numpy()
    for m in ["logistic", "hgb", "rf"]:
        rows.append(row(F1A, f"{MODEL_LABEL[m]}, scored on the rows 1b also has", "variant",
                        evaluate(y[shared], preds[m][shared], g[shared])))
    rows += phq_baselines(F1A, D, y, g)
    rows += base_and_shuffle(F1A, y, g, X)
    return rows, preds


def framing_before(P: pd.DataFrame, meta: dict, verbose: bool = True) -> tuple[list[dict], dict]:
    """1b. Phone data only from days strictly before the answer date."""
    y, g = P["label"].to_numpy(), P["sid"].to_numpy()
    cols = meta["prospective_cols"]
    assert_passive(cols)
    X = P[cols].to_numpy(np.float32)
    folds = grouped_folds(y, g)
    rows, preds = _three_models(F1B, X, y, g, folds, verbose)
    zc = [c for c in cols if c.startswith("pz_")] + ["p_usable_days", "platform_ios"]
    preds["hgb_z_only"] = cv_predict(P[zc].to_numpy(np.float32), y, g, "hgb", folds)
    rows.append(row(F1B, "Gradient boosting, own-past z-scores only", "variant",
                    evaluate(y, preds["hgb_z_only"], g), n_features=len(zc)))
    rows += phq_baselines(F1B, P, y, g)
    rows += base_and_shuffle(F1B, y, g, X)
    return rows, preds


# ---------------------------------------------------------------------------
# 5. Framing 2: personal models from each student's first N eligible weeks
# ---------------------------------------------------------------------------

def _sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def ridge_logit(X: np.ndarray, y: np.ndarray, offset: np.ndarray, lam: np.ndarray, iters: int = 50) -> np.ndarray:
    """Logistic regression with a fixed offset and an L2 penalty, by Newton steps.
    With the pooled model's log-odds as the offset, the coefficients are the
    student's own corrections to the shared model."""
    beta = np.zeros(X.shape[1])
    for _ in range(iters):
        p = _sigmoid(offset + X @ beta)
        grad = X.T @ (y - p) - lam * beta
        H = (X * (p * (1 - p))[:, None]).T @ X + np.diag(lam)
        step = np.linalg.solve(H, grad)
        beta += step
        if np.abs(step).max() < 1e-8:
            break
    return beta


# The six core signals of Experiment 1, rebuilt from days before the answer.
# Bedtime regularity has no z in the window, so time with others is split into
# social places and other dorms. Sign: +1 when higher is worse.
CORE_PROSPECTIVE = [("pz_sleep_duration", -1.0), ("pz_night_unlock_min", 1.0), ("pz_loc_social_dur", -1.0),
                    ("pz_loc_other_dorm_dur", -1.0), ("pz_loc_visit_num_ep_0", -1.0), ("pz_loc_dist_ep_0", -1.0)]


def framing_personal(P: pd.DataFrame, meta: dict, pooled: np.ndarray, seed: int = SEED,
                     verbose: bool = True) -> tuple[list[dict], dict]:
    """Personal models on framing 1b's rows. Each student's first N eligible
    labelled weeks train the personal part. Test weeks are that student's
    later weeks whose answer came 14 or more days after the last training
    answer, so the two never share a recall day."""
    rows, info = [], {}
    y_all = P["label"].to_numpy()
    sid = P["sid"].to_numpy()
    rank = P.groupby("sid").cumcount().to_numpy()
    n_lab = P.groupby("sid")["label"].transform("size").to_numpy()
    zc = np.column_stack([np.nan_to_num(P[c].to_numpy(float), nan=0.0) * d for c, d in CORE_PROSPECTIVE])
    zc = np.clip(zc, -4, 4)
    pc = np.clip(pooled, 1e-4, 1 - 1e-4)
    off_pooled = np.log(pc / (1 - pc))
    phq = P["phq2"].to_numpy(float)
    ldate = P["label_date"]
    phone = meta["prospective_cols"]
    for N in PERSONAL_N:
        last_train = ldate.where(rank == N - 1).groupby(sid).transform("max")
        is_test = ((rank >= N) & (ldate >= last_train + pd.Timedelta(days=14))).to_numpy()
        n_test = pd.Series(is_test).groupby(sid).transform("sum").to_numpy()
        elig = (n_lab >= N + 1) & (n_test >= PERSONAL_MIN_TEST)
        idx_by = pd.Series(np.flatnonzero(elig)).groupby(sid[elig]).apply(np.asarray)

        def run(y: np.ndarray) -> dict[str, np.ndarray]:
            keys = ("own", "pooled_int", "pooled_int_slopes", "own_mean", "own_rate")
            sc = {k: np.full(len(y), np.nan) for k in keys}
            tot_pos, tot_n = y.sum(), len(y)
            for s_id, idx in idx_by.items():
                tr, te = idx[rank[idx] < N], idx[is_test[idx]]
                mine = sid == s_id
                loo = (tot_pos - y[mine].sum()) / (tot_n - mine.sum())  # other students only
                one = np.ones((len(tr), 1))
                Xs = np.c_[one, zc[tr]]
                b = ridge_logit(Xs, y[tr], np.full(len(tr), np.log(loo / (1 - loo))), np.r_[1.0, np.ones(6)])
                sc["own"][te] = np.log(loo / (1 - loo)) + np.c_[np.ones(len(te)), zc[te]] @ b
                b = ridge_logit(one, y[tr], off_pooled[tr], np.array([1.0]))
                sc["pooled_int"][te] = off_pooled[te] + b[0]
                b = ridge_logit(Xs, y[tr], off_pooled[tr], np.r_[1.0, 4.0 * np.ones(6)])
                sc["pooled_int_slopes"][te] = off_pooled[te] + np.c_[np.ones(len(te)), zc[te]] @ b
                sc["own_mean"][te] = phq[tr].mean()
                sc["own_rate"][te] = y[tr].mean()
            return sc

        sc = run(y_all)
        te = elig & is_test
        yt, gt = y_all[te], sid[te]
        gaps = (ldate[te] - last_train[te]).dt.days
        info[f"first_{N}"] = {"students": int(len(np.unique(gt))), "test_weeks": int(te.sum()),
                              "min_days_between_last_training_answer_and_test_answer": int(gaps.min()),
                              "median_raw_phq2_answers_before_last_training_week": float(
                                  P.loc[rank == N - 1, "n_prior_labels"].median() + 1)}
        tag = f"{F2}, first {N} eligible weeks"
        common = {"train_weeks_per_student": N}
        rows.append(row(tag, "Own model only (6 core signals)", "model", evaluate(yt, sc["own"][te], gt), **common))
        rows.append(row(tag, "Pooled gradient boosting + own intercept", "model",
                        evaluate(yt, sc["pooled_int"][te], gt), **common))
        rows.append(row(tag, "Pooled gradient boosting + own intercept and signal weights", "model",
                        evaluate(yt, sc["pooled_int_slopes"][te], gt), **common))
        rows.append(row(tag, "Pooled gradient boosting, no personal step", "baseline",
                        evaluate(yt, pooled[te], gt), **common))
        rows.append(row(tag, f"Own average PHQ-2 score in the first {N} weeks", "baseline",
                        evaluate(yt, sc["own_mean"][te], gt), **common))
        rows.append(row(tag, f"Own share of high weeks in the first {N} weeks", "baseline",
                        evaluate(yt, sc["own_rate"][te], gt), **common))
        rows += [dict(r, **common) for r in phq_baselines(tag, P[te], yt, gt)[:1]]
        rows += [dict(r, **common) for r in base_and_shuffle(tag, yt, gt, None)]
        ys_all = y_all.copy()
        ys_all[elig] = shuffled(y_all[elig], seed + 7 + N)
        scs = run(ys_all)
        rows.append(row(tag, "Label-shuffle control (pooled + own intercept)", "control",
                        evaluate(ys_all[te], scs["pooled_int"][te], gt, within=False), **common))
        # Same answer information, same folds: does phone data add to the history?
        T = P[te]
        H = np.c_[sc["own_mean"][te], sc["own_rate"][te]]
        Xp = np.c_[H, T[phone].to_numpy(np.float32)]
        folds = grouped_folds(yt, gt)
        for m in ["logistic", "hgb"]:
            ph = cv_predict(H, yt, gt, m, folds)
            pp = cv_predict(Xp, yt, gt, m, folds)
            rows.append(row(tag, f"History only (own average and share high): {MODEL_LABEL[m]}", "comparison",
                            evaluate(yt, ph, gt), **common))
            rows.append(row(tag, f"History plus phone data before the answer: {MODEL_LABEL[m]}", "comparison",
                            evaluate(yt, pp, gt), **common))
        # The phone data as one number: the shared model's out-of-fold score.
        ps = cv_predict(np.c_[H, off_pooled[te]], yt, gt, "logistic", folds)
        rows.append(row(tag, "History plus the shared phone model's score: Logistic regression", "comparison",
                        evaluate(yt, ps, gt), **common))
        _log(f"  N={N}: {info[f'first_{N}']['students']} students, {te.sum():,} test weeks; history (logistic) "
             f"{rows[-5]['auc']:.3f}, + phone {rows[-4]['auc']:.3f}, + phone score {rows[-1]['auc']:.3f}", verbose)
    return rows, info


# ---------------------------------------------------------------------------
# 6. Framing 3: between students, one row per student-term
# ---------------------------------------------------------------------------

def term_table(W: pd.DataFrame, meta: dict) -> tuple[pd.DataFrame, list[str]]:
    """Terms follow Dartmouth's quarters by month: winter Jan-Mar, spring
    Apr-Jun, summer Jul-Aug, fall Sep-Dec."""
    m = W["monday"].dt.month
    season = np.select([m <= 3, m <= 6, m <= 8], ["winter", "spring", "summer"], "fall")
    T = W.assign(season=season, term=W["monday"].dt.year.astype(str) + "-" + season)
    lvl = meta["mean_cols"] + meta["sd_cols"]
    v = T[T["valid"]]
    feats = v.groupby(["sid", "term"])[lvl + ["usable_days"]].mean()
    n_valid = v.groupby(["sid", "term"]).size().rename("n_valid")
    lab = T[T["label"].notna()].groupby(["sid", "term"]).agg(
        phq2_mean=("phq2", "mean"), n_labels=("phq2", "size"), start=("monday", "min"))
    info = T.groupby(["sid", "term"]).agg(platform_ios=("platform_ios", "first"), season=("season", "first"))
    R = lab.join(n_valid, how="inner").join(feats).join(info).reset_index()
    R = R[(R["n_labels"] >= TERM_MIN_LABELS) & (R["n_valid"] >= TERM_MIN_VALID)].copy()
    R = R.sort_values(["sid", "start"]).reset_index(drop=True)
    R["label"] = (R["phq2_mean"] >= ex.PHQ2_CUTOFF).astype(float)
    R["prev_term_phq2"] = R.groupby("sid")["phq2_mean"].shift(1)
    for s in ["winter", "spring", "summer", "fall"]:
        R[f"season_{s}"] = (R["season"] == s).astype(float)
    cols = lvl + ["usable_days", "platform_ios"] + [f"season_{s}" for s in ["winter", "spring", "summer", "fall"]]
    return R, cols


def nested_predict(X: np.ndarray, y: np.ndarray, groups: np.ndarray, outer, models=("logistic", "hgb", "rf"),
                   inner_k: int = 3, seed: int = SEED) -> tuple[np.ndarray, list[str]]:
    """Model choice made inside each outer training part, by grouped inner
    cross-validation, then scored on the untouched outer test part."""
    from sklearn.metrics import roc_auc_score
    p = np.full(len(y), np.nan)
    chosen = []
    for tr, te in outer:
        inner = grouped_folds(y[tr], groups[tr], n_folds=inner_k, seed=seed + 1)
        scores = {}
        for m in models:
            pi = cv_predict(X[tr], y[tr], groups[tr], m, inner, seed)
            scores[m] = roc_auc_score(y[tr], pi)
        best = max(scores, key=scores.get)
        _, p[te] = _fit_fold(best, X, y, tr, te, seed)
        chosen.append(best)
    return p, chosen


def framing_term(W: pd.DataFrame, meta: dict, verbose: bool = True) -> tuple[list[dict], dict]:
    R, cols = term_table(W, meta)
    assert_passive(cols)
    y, g = R["label"].to_numpy(), R["sid"].to_numpy()
    X = R[cols].to_numpy(np.float32)
    folds = grouped_folds(y, g)
    rows, _ = _three_models(F3, X, y, g, folds, verbose)
    p, chosen = nested_predict(X, y, g, folds)
    rows.append(row(F3, "Nested choice among the three models", "nested", evaluate(y, p, g),
                    chosen=chosen))
    prev = R["prev_term_phq2"].to_numpy()
    rows.append(row(F3, "Last term's average PHQ-2 alone", "baseline",
                    evaluate(y, prior_score(prev, float(np.nanmedian(prev))), g),
                    share_rows_with_value=float(np.isfinite(prev).mean())))
    has_prev = np.isfinite(prev)
    rows.append(row(F3, "Last term's average PHQ-2, rows that have one", "baseline",
                    evaluate(y[has_prev], prev[has_prev], g[has_prev])))
    rows += base_and_shuffle(F3, y, g, X)
    info = {"student_terms": int(len(R)), "students": int(R["sid"].nunique()),
            "base_rate": float(y.mean()), "share_with_previous_term": float(has_prev.mean()),
            "median_labelled_weeks_per_term": float(R["n_labels"].median()), "nested_choices": chosen}
    return rows, info


# ---------------------------------------------------------------------------
# 7. Framing 4: change detection
# ---------------------------------------------------------------------------

def framing_change(P: pd.DataFrame, meta: dict, verbose: bool = True) -> tuple[list[dict], dict]:
    C = P[P["n_prior_labels"] >= CHANGE_MIN_PRIOR].reset_index(drop=True)
    y = ((C["phq2"] - C["run_mean_phq2"]) >= CHANGE_RISE).astype(float).to_numpy()
    g = C["sid"].to_numpy()
    cols = meta["prospective_cols"]
    X = C[cols].to_numpy(np.float32)
    folds = grouped_folds(y, g)
    rows, _ = _three_models(F4, X, y, g, folds, verbose, models=("logistic", "hgb"))
    rows.append(row(F4, f"{RECENT_PHQ} minus own running mean", "baseline",
                    evaluate(y, (C["prev_phq2"] - C["run_mean_phq2"]).to_numpy(), g)))
    rows.append(row(F4, "Own running mean alone", "baseline", evaluate(y, C["run_mean_phq2"].to_numpy(), g)))
    rows += base_and_shuffle(F4, y, g, X)
    info = {"rows": int(len(C)), "students": int(C["sid"].nunique()), "base_rate": float(y.mean())}
    return rows, info


# ---------------------------------------------------------------------------
# 8. Framing 5: check-ins and earlier answers
# ---------------------------------------------------------------------------

def framing_checkin(P: pd.DataFrame, meta: dict, f1b_rows: list[dict], verbose: bool = True) -> tuple[list[dict], dict]:
    """All rows use framing 1b's weeks, and phone data only from before the
    answer. Check-in answers come from calendar week t-1 or earlier."""
    y, g = P["label"].to_numpy(), P["sid"].to_numpy()
    folds = grouped_folds(y, g)
    phone = meta["prospective_cols"]
    hist_ci = meta["checkin_cols"]
    sets = [
        ("Single last-week check-in (latest answer)", meta["checkin_single_cols"], ("logistic", "hgb"), "model"),
        ("Last week's check-ins (mean)", meta["checkin_lastweek_cols"], ("logistic", "hgb"), "model"),
        ("Check-in history", hist_ci, ("logistic", "hgb"), "model"),
        ("Phone before the answer plus check-in history", phone + hist_ci, ("logistic", "hgb"), "model"),
        ("Check-in history plus earlier PHQ-2 answers", hist_ci + HISTORY_COLS, ("logistic", "hgb"), "with_history"),
        ("Phone before the answer plus check-in history plus earlier PHQ-2 answers",
         phone + hist_ci + HISTORY_COLS, ("hgb",), "with_history"),
    ]
    rows = [dict(r, framing=F5, model="Phone before the answer only: " + r["model"]) for r in f1b_rows
            if r["kind"] == "model"]
    for name, cols, models, kind in sets:
        X = P[cols].to_numpy(np.float32)
        r_, _ = _three_models(F5, X, y, g, folds, verbose, models=models, prefix=f"{name}: ", kind=kind)
        rows += r_
    rows += phq_baselines(F5, P, y, g)
    rows += base_and_shuffle(F5, y, g, P[phone + hist_ci].to_numpy(np.float32))
    e = load_ema().dropna(subset=["pam", "phq4-3", "phq4-4"])
    high = (e["phq4-3"] + e["phq4-4"]) >= ex.PHQ2_CUTOFF
    info = {"same_day_share_phq2_high_by_pam_block": {b: float(high[e[b] == 1].mean()) for b in PAM_BLOCKS},
            "share_weeks_with_single_lastweek_checkin": float(P["ci_last1_stress"].notna().mean())}
    return rows, info


def framing_separated(P: pd.DataFrame, meta: dict, verbose: bool = True) -> list[dict]:
    """Every questionnaire input (PHQ-2 and check-ins) dated 14 or more days
    before this week's answer, so none shares a day with the two weeks that
    answer describes. Phone data from the 7 days before the answer may be added."""
    y, g = P["label"].to_numpy(), P["sid"].to_numpy()
    folds = grouped_folds(y, g)
    sep = meta["separated_cols"]
    rows = [row(F5S, "Latest PHQ-2 answered 14 or more days before, alone", "baseline",
                evaluate(y, P["sep_latest_phq2"].to_numpy(float), g)),
            row(F5S, "Mean of PHQ-2 answers 14 or more days before, alone", "baseline",
                evaluate(y, P["sep_mean_phq2"].to_numpy(float), g))]
    single = [f"sep_ci_latest_{c}" for c in CHECKIN_ITEMS] + ["sep_ci_age_days"]
    r_, _ = _three_models(F5S, P[single].to_numpy(np.float32), y, g, folds, verbose, models=("logistic",),
                          prefix="Single check-in 14 or more days before: ")
    rows += r_
    r_, _ = _three_models(F5S, P[sep].to_numpy(np.float32), y, g, folds, verbose, models=("logistic", "hgb"),
                          prefix="All questionnaire inputs 14 or more days before: ", kind="with_history")
    rows += r_
    r_, _ = _three_models(F5S, P[meta["prospective_cols"] + sep].to_numpy(np.float32), y, g, folds, verbose,
                          models=("hgb",), prefix="Phone before the answer plus those inputs: ", kind="with_history")
    rows += r_
    rows += base_and_shuffle(F5S, y, g, P[sep].to_numpy(np.float32))
    return rows


def label_reliability(answers: pd.DataFrame) -> dict:
    """How often a student's high/not-high status flips between two answers
    1 to 3 days apart. Both answers describe nearly the same two weeks."""
    a = answers.sort_values(["uid", "date"])
    nxt = a.groupby("uid")[["date", "phq2"]].shift(-1)
    gap = (nxt["date"] - a["date"]).dt.days
    m = (gap >= 1) & (gap <= 3)
    h1 = a["phq2"][m] >= ex.PHQ2_CUTOFF
    h2 = nxt["phq2"][m] >= ex.PHQ2_CUTOFF
    po = float((h1 == h2).mean())
    pe = float(h1.mean() * h2.mean() + (1 - h1.mean()) * (1 - h2.mean()))
    return {"pairs_1_to_3_days_apart": int(m.sum()), "share_status_flips": float((h1 != h2).mean()),
            "share_high_first_then_not_high": float((~h2[h1]).mean()),
            "cohen_kappa": float((po - pe) / (1 - pe)),
            "same_score_share": float((a["phq2"][m] == nxt["phq2"][m]).mean())}


# ---------------------------------------------------------------------------
# 9. Deliberate leaks: what a near-perfect number is made of
# ---------------------------------------------------------------------------

def full_period_z(W: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    """WRONG ON PURPOSE: z against the student's mean and SD over ALL their
    valid weeks, future weeks included."""
    V = W[cols].where(W["valid"], axis=0)
    g = V.groupby(W["sid"].to_numpy())
    z = ((V - g.transform("mean")) / g.transform("std")).clip(-Z_CLIP, Z_CLIP)
    z.columns = ["fz_" + c for c in cols]
    return z


def leak_demos(W: pd.DataFrame, D: pd.DataFrame, meta: dict, f1_rows: list[dict],
               verbose: bool = True) -> list[dict]:
    """Built wrong on purpose, on framing 1a's weeks. Each has a fair version."""
    y, g = D["label"].to_numpy(), D["sid"].to_numpy()
    folds = grouped_folds(y, g)
    pas = passive_cols(meta)
    f1 = {r["model"]: r for r in f1_rows}
    out = []

    def add(name, cause, fix, leaky: dict, fixed_name: str, fixed: dict):
        out.append({"name": name, "cause": cause, "fix": fix, "leaky": leaky,
                    "fixed_name": fixed_name, "fixed": fixed})
        _log(f"  {name}: {leaky['auc']:.3f} -> {fixed['auc']:.3f}", verbose)

    # A. answers from the same survey as the label
    X = np.c_[D[pas].to_numpy(np.float32), D[["leak_same_survey_anx1", "leak_same_survey_anx2"]].to_numpy(np.float32)]
    p = cv_predict(X, y, g, "logistic", folds)
    pf = cv_predict(np.c_[D[pas].to_numpy(np.float32), D[meta["checkin_cols"]].to_numpy(np.float32)],
                    y, g, "logistic", folds)
    add("Anxiety items from the label's own survey",
        "PHQ-4 items 1 and 2 are answered on the same screen, seconds before the two items that make the label.",
        "Use only answers from earlier weeks (framing 5).",
        evaluate(y, p, g), "Same-week phone plus check-in history (logistic)", evaluate(y, pf, g))
    s = D["leak_same_survey_phq4_score"].to_numpy(float)
    add("The PHQ-4 total from the label's own survey",
        "The PHQ-4 total contains the two PHQ-2 items, so it is the label plus noise.",
        "Never use a score that contains the label items.",
        evaluate(y, s, g), RECENT_PHQ, evaluate(y, prior_score(D["prev_phq2"].to_numpy(), 0.0), g))
    # B. student's average label over every week, this one and future ones included
    st_mean = D.groupby("sid")["phq2"].transform("mean").to_numpy()
    add("Each student's average PHQ-2 over all their weeks",
        "The average includes this week's answer and every later answer.",
        "Average only the answers from earlier weeks.",
        evaluate(y, st_mean, g), "Average of earlier answers only", evaluate(y, D["run_mean_phq2"].to_numpy(), g))
    # C. random week split instead of a student split
    skf = list(StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=SEED).split(np.zeros(len(y)), y))
    Xp = D[pas].to_numpy(np.float32)
    p = cv_predict(Xp, y, g, "hgb", skf)
    add("Weeks split at random, so each student sits in train and test",
        "The model learns each student's usual phone pattern and their usual mood, then meets the same student again.",
        "Split by student (GroupKFold).",
        evaluate(y, p, g), "Split by student", {k: f1[MODEL_LABEL["hgb"]][k] for k in
                                               ("auc", "auc_ci", "pr_auc", "sens_at_80_spec", "n_students")})
    # C2. random week split with every feature, check-ins and earlier answers included
    Xh = D[passive_cols(meta) + meta["checkin_cols"] + HISTORY_COLS].to_numpy(np.float32)
    p = cv_predict(Xh, y, g, "hgb", skf)
    pg = cv_predict(Xh, y, g, "hgb", folds)
    add("Random week split, with check-ins and earlier PHQ-2 answers as features",
        "Same as above, with mood answers added. The model meets students it already knows.",
        "Split by student.",
        evaluate(y, p, g), "Same features, split by student", evaluate(y, pg, g))
    # D. z-scores normalised with future weeks
    fz = full_period_z(W, meta["mean_cols"]).loc[W["monitored"] & W["label"].notna()].reset_index(drop=True)
    p = cv_predict(np.c_[fz.to_numpy(np.float32), D[meta["context_cols"]].to_numpy(np.float32)], y, g, "hgb", folds)
    add("z-scores normalised with the student's future weeks",
        "Each week is compared with a mean and spread that include later weeks.",
        "Use only earlier weeks for the mean and spread.",
        evaluate(y, p, g), "Own-past z-scores only", {k: f1["Gradient boosting, own-past z-scores only"][k] for k in
                                                     ("auc", "auc_ci", "pr_auc", "sens_at_80_spec", "n_students")})
    return out


def found_leak_record(D: pd.DataFrame, meta: dict) -> dict:
    """The leak found in the first run, measured on framing 1a's weeks."""
    y, g = D["label"].to_numpy(), D["sid"].to_numpy()
    folds = grouped_folds(y, g)
    ci = meta["checkin_cols"]
    wprev = D["win_prev_phq2"].to_numpy()
    before_prev = evaluate(y, prior_score(wprev, float(np.nanmedian(wprev))), g)
    nprev = D["prev_phq2"].to_numpy()
    after_prev = evaluate(y, prior_score(nprev, float(np.nanmedian(nprev))), g)
    pb = cv_predict(D[ci + ["platform_ios", "win_prev_phq2", "win_run_mean_phq2"]].to_numpy(np.float32), y, g, "hgb", folds)
    pa = cv_predict(D[ci + ["platform_ios"] + HISTORY_COLS].to_numpy(np.float32), y, g, "hgb", folds)
    gap_win = (D["label_date"] - pd.to_datetime(D["win_prev_date"])).dt.days.to_numpy(float)
    gap_new = (D["label_date"] - pd.to_datetime(D["prev_date"])).dt.days.to_numpy(float)
    return {
        "what": "In the first run, check-in history plus earlier PHQ-2 answers scored above 0.90.",
        "cause": ("\"Last week's PHQ-2\" was taken from last week's label, whose window runs Thursday to Wednesday. "
                  "So it could be a different answer given on Monday to Wednesday of this week, one to three days "
                  "before this week's answer, with a recall period that overlaps it almost fully."),
        "fix": "Use only PHQ-2 answers dated before Monday of this week, the same rule as the check-in.",
        "same_day_pairs_before_fix": int(np.nansum(gap_win == 0)),
        "share_gaps_under_4_days_before_fix": float(np.nanmean(gap_win[~np.isnan(gap_win)] < 4)),
        "share_gaps_under_4_days_after_fix": float(np.nanmean(gap_new[~np.isnan(gap_new)] < 4)),
        "median_gap_days_before_fix": float(np.nanmedian(gap_win)),
        "median_gap_days_after_fix": float(np.nanmedian(gap_new)),
        "recent_phq2_alone_before_fix": before_prev, "recent_phq2_alone_after_fix": after_prev,
        "checkin_history_plus_phq2_before_fix": evaluate(y, pb, g),
        "checkin_history_plus_phq2_after_fix": evaluate(y, pa, g),
        "population": "framing 1a weeks", "model": MODEL_LABEL["hgb"]}


# ---------------------------------------------------------------------------
# 10. Leakage checks
# ---------------------------------------------------------------------------

def leakage_checks(W: pd.DataFrame, D: pd.DataFrame, P: pd.DataFrame, meta: dict, all_rows: list[dict],
                   personal_info: dict, seed: int = SEED) -> dict:
    checks = {}
    checks["student_split"] = {
        "passed": True,
        "what": "Every cross-validation fold is checked in code: no student is in both the training and the test part."}
    # Past-only features: overwrite every week after a cut-off with noise and
    # confirm that no feature at or before the cut-off changes.
    rng = np.random.default_rng(seed)
    pick = rng.choice(np.unique(W["sid"]), 30, replace=False)
    sub = W[W["sid"].isin(pick)].reset_index(drop=True)
    cut = sub.groupby("sid")["week_idx"].transform("median").to_numpy()
    after = sub["week_idx"].to_numpy() > cut
    cols = meta["mean_cols"]
    poisoned = sub.copy()
    poisoned.loc[after, cols] = (rng.normal(size=(int(after.sum()), len(cols))) * 1e3).astype(np.float32)
    same = True
    for f in (past_only_z, last_week):
        a, b = f(sub, cols).to_numpy()[~after], f(poisoned, cols).to_numpy()[~after]
        same &= bool(np.array_equal(a, b, equal_nan=True))
    checks["past_only_features"] = {
        "passed": same, "students_tested": 30,
        "what": "Every week after a cut-off was replaced with noise. The z-scores and last-week values up to the cut-off did not change."}
    # Check-in answers come from before the label answer.
    m = (D["ci_lastweek_n"] > 0).to_numpy()
    gap = (D["label_date"] - pd.to_datetime(D["_ci_last_date_used"])).dt.days.to_numpy()[m]
    checks["checkin_before_label"] = {
        "passed": bool(gap.min() >= 1), "min_days_before_label": int(gap.min()),
        "median_days_before_label": float(np.median(gap)),
        "what": "The latest check-in answer used for a week is always from an earlier day than that week's PHQ-2 answer, and never from the same survey."}
    # Earlier PHQ-2 answers come from before this week's Monday.
    d = (D["label_date"] - pd.to_datetime(D["prev_date"])).dt.days.to_numpy(float)
    before_monday = (pd.to_datetime(D["prev_date"]) < D["monday"]).to_numpy() | D["prev_date"].isna().to_numpy()
    have = ~np.isnan(d)
    y = D["label"].to_numpy()
    g = D["sid"].to_numpy()
    prev = D["prev_phq2"].to_numpy()
    far = have & (d >= 14)
    checks["earlier_phq2_before_monday"] = {
        "passed": bool(before_monday.all() and np.nanmin(d) >= 4),
        "min_days_between_answers": int(np.nanmin(d)), "median_days_between_answers": float(np.nanmedian(d)),
        "share_sharing_recall_days": float((d[have] < 14).mean()),
        "last_phq2_auc_all": evaluate(y[have], prev[have], g[have], n_boot=200, within=False)["auc"],
        "last_phq2_auc_14_days_or_more": evaluate(y[far], prev[far], g[far], n_boot=200, within=False)["auc"],
        "what": "Every earlier PHQ-2 answer used as a feature is dated before Monday of the week, so at least 4 days before the label answer. PHQ-2 asks about the last two weeks, so the baseline is also scored on pairs 14 or more days apart."}
    ctrl = [r for r in all_rows if r["kind"] == "control"]
    big = [r for r in ctrl if not r["framing"].startswith("7")]
    small = [r for r in ctrl if r["framing"].startswith("7")]
    checks["label_shuffle"] = {
        "passed": bool(all(0.47 <= r["auc"] <= 0.53 for r in big)
                       and all(r["auc_ci"][0] <= 0.5 <= r["auc_ci"][1] for r in small)),
        "aucs": {f"{r['framing']} | {r['model']}": r["auc"] for r in ctrl},
        "what": "The same pipeline run on shuffled labels must score near 0.5: within 0.47 to 0.53 on the Dartmouth framings, and with 0.5 inside the 95% interval on the small external samples."}
    last_used = pd.to_datetime(P["_p_last_day_used"])
    base_sunday = ex._monday(P["label_date"] - pd.Timedelta(days=14)) + pd.Timedelta(days=6)
    checks["phone_before_answer"] = {
        "passed": bool((last_used < P["label_date"]).all() and (base_sunday < P["label_date"] - pd.Timedelta(days=7)).all()),
        "rows": int(len(P)), "latest_phone_day_relative_to_answer_days": int((last_used - P["label_date"]).dt.days.max()),
        "what": "In framings 1b, 2, 4 and 5 every phone day used, including the personal baseline weeks and the eligibility count, is dated strictly before the PHQ-2 answer."}
    gaps = [v["min_days_between_last_training_answer_and_test_answer"] for v in personal_info.values()]
    checks["personal_14_day_separation"] = {
        "passed": bool(min(gaps) >= 14), "min_days": int(min(gaps)),
        "what": "In the personal models every test answer comes 14 or more days after the last training answer, by actual answer dates."}
    sep_age = np.r_[P["sep_phq2_age_days"].dropna().to_numpy(), P["sep_ci_age_days"].dropna().to_numpy()]
    checks["separated_inputs_before_recall_window"] = {
        "passed": bool(sep_age.min() >= 14), "min_days_before_answer": int(sep_age.min()),
        "what": "In framing 5b every PHQ-2 and check-in input is dated 14 or more days before the answer, so it shares no day with the two weeks the answer describes."}
    checks["no_self_report_in_passive"] = {
        "passed": True, "blocked_tokens": list(FORBIDDEN_IN_PASSIVE),
        "what": "Every passive feature set is checked in code for PHQ, label, check-in or history columns."}
    checks["transforms_inside_folds"] = {
        "passed": True,
        "what": "Scaling, imputation and every model are fit on the training part of each fold only. Personal z-scores use only the student's earlier weeks."}
    honest = [r for r in all_rows if r["kind"] in ("model", "variant", "baseline", "with_history")]
    flags = [{"framing": r["framing"], "model": r["model"], "auc": r["auc"],
              "within_student_auc": r.get("within_student_auc")} for r in honest if r["auc"] > LEAK_FLAG_AUC]
    checks["auc_above_0.90"] = {
        "passed": not flags, "rows": flags,
        "outcome": ("Every flagged row uses the student's earlier PHQ answers. One leak was found and fixed "
                    "(see results.md). The rest is persistence: students who scored high before score high again.")
        if flags else "No honest result is above 0.90.",
        "what": "Any honest result above AUC 0.90 is treated as a suspected leak and investigated."}
    return checks


# ---------------------------------------------------------------------------
# 11. External data
# ---------------------------------------------------------------------------

def repeated_oof(X: np.ndarray, y: np.ndarray, groups: np.ndarray, model: str, repeats: int = 10,
                 folds_fn=None) -> np.ndarray:
    """Small datasets: average the out-of-fold prediction over repeated
    student-grouped splits. Each prediction still comes from models that never
    saw that participant."""
    ps = []
    for r in range(repeats):
        folds = grouped_folds(y, groups, seed=SEED + r) if folds_fn is None else folds_fn(r)
        ps.append(cv_predict(X, y, groups, model, folds, seed=SEED + r))
    return np.mean(ps, axis=0)


def repeated_nested(X: np.ndarray, y: np.ndarray, groups: np.ndarray, repeats: int = 3,
                    models=("logistic", "rf")) -> tuple[np.ndarray, list[str]]:
    ps, chosen = [], []
    for r in range(repeats):
        p, c = nested_predict(X, y, groups, grouped_folds(y, groups, seed=SEED + r), models=models, seed=SEED + r)
        ps.append(p)
        chosen += c
    return np.mean(ps, axis=0), chosen


def depresjon_tables(drop_zero_days: bool = False) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    """Full days only (1,440 minutes). With drop_zero_days, days with no
    activity at all, which may be a watch left off, are removed too."""
    root = DEP_DIR / "data"
    scores = pd.read_csv(root / "scores.csv")
    days = []
    for _, r in scores.iterrows():
        grp = "condition" if str(r["number"]).startswith("condition") else "control"
        a = pd.read_csv(root / grp / f"{r['number']}.csv")
        ts = pd.to_datetime(a["timestamp"])
        a["date"] = ts.dt.normalize()
        a["hour"] = ts.dt.hour
        full = a.groupby("date")["activity"].transform("size") == 1440
        if drop_zero_days:
            full &= a.groupby("date")["activity"].transform("max") > 0
        a = a[full]
        act = a["activity"].astype(float)
        a["zero"] = (act == 0).astype(float)
        a["log_act"] = np.log1p(act)
        night = a["hour"] < 6
        dayt = (a["hour"] >= 8) & (a["hour"] < 20)
        gd = a.groupby("date")
        f = pd.DataFrame({
            "mean_log_activity": gd["log_act"].mean(),
            "sd_log_activity": gd["log_act"].std(),
            "share_zero_minutes": gd["zero"].mean(),
            "night_mean_log_activity": a[night].groupby("date")["log_act"].mean(),
            "day_mean_log_activity": a[dayt].groupby("date")["log_act"].mean(),
            "evening_mean_log_activity": a[a["hour"] >= 20].groupby("date")["log_act"].mean(),
            "share_active_minutes": gd["activity"].apply(lambda v: float((v > 100).mean())),
        })
        f["night_minus_day"] = f["night_mean_log_activity"] - f["day_mean_log_activity"]
        f["pid"] = r["number"]
        f["label"] = 1.0 if grp == "condition" else 0.0
        days.append(f.reset_index(drop=True))
    Dd = pd.concat(days, ignore_index=True)
    feat = [c for c in Dd.columns if c not in ("pid", "label")]
    P = Dd.groupby("pid")[feat].mean()
    P = P.join(Dd.groupby("pid")["mean_log_activity"].std().rename("day_to_day_sd"))
    P = P.join(Dd.groupby("pid")["label"].first()).reset_index()
    info = {"participants": int(len(P)), "depressed": int(P["label"].sum()), "controls": int((P["label"] == 0).sum()),
            "full_days": int(len(Dd)), "day_features": feat}
    return Dd, P, info


def external_depresjon(verbose: bool = True) -> tuple[list[dict], dict]:
    if not (DEP_DIR / "data" / "scores.csv").exists():
        return [], {"used": False, "reason": "data/depresjon not found"}
    Dd, P, info = depresjon_tables()
    rows = []
    feat = [c for c in P.columns if c not in ("pid", "label")]
    X, y, g = P[feat].to_numpy(float), P["label"].to_numpy(), P["pid"].to_numpy()
    for m in ["logistic", "rf"]:
        p = repeated_oof(X, y, g, m)
        rows.append(row(F7D, f"Per person: {MODEL_LABEL[m]}", "model", evaluate(y, p, g, within=False),
                        n_features=len(feat)))
    p, chosen = repeated_nested(X, y, g)
    rows.append(row(F7D, "Per person: nested choice between the two models", "nested",
                    evaluate(y, p, g, within=False), chosen=chosen))
    Dz, Pz, iz = depresjon_tables(drop_zero_days=True)
    Xz, yz, gz = Pz[feat].to_numpy(float), Pz["label"].to_numpy(), Pz["pid"].to_numpy()
    for m in ["logistic", "rf"]:
        pz = repeated_oof(Xz, yz, gz, m)
        rows.append(row(F7D, f"Per person, all-zero days removed: {MODEL_LABEL[m]}", "variant",
                        evaluate(yz, pz, gz, within=False), n_features=len(feat)))
    info["all_zero_days_removed"] = int(info["full_days"] - iz["full_days"])
    info["people_with_all_zero_days"] = int(Dd.loc[Dd["mean_log_activity"] == 0, "pid"].nunique())
    rows.append(row(F7D, "Base rate (no information)", "baseline", evaluate(y, np.zeros(len(y)), g, within=False)))
    ys = shuffled(y, SEED + 5)
    rows.append(row(F7D, "Label-shuffle control (Logistic regression)", "control",
                    evaluate(ys, repeated_oof(X, ys, g, "logistic"), g, within=False)))
    dfeat = info["day_features"]
    Xd, yd, gd = Dd[dfeat].to_numpy(float), Dd["label"].to_numpy(), Dd["pid"].to_numpy()
    p = repeated_oof(Xd, yd, gd, "rf", repeats=3)
    rows.append(row(F7D, "Per day, split by person: Random forest", "variant", evaluate(yd, p, gd, within=False),
                    n_features=len(dfeat)))
    skf = lambda r: list(StratifiedKFold(N_FOLDS, shuffle=True, random_state=SEED + r).split(Xd, yd))
    p_leak = repeated_oof(Xd, yd, gd, "rf", repeats=3, folds_fn=skf)
    leak = {"name": "Depresjon days split at random",
            "cause": "Days from the same person land in train and test, so the model recognises the person.",
            "fix": "Split by person.",
            "leaky": evaluate(yd, p_leak, gd, within=False),
            "fixed_name": "Per day, split by person", "fixed": rows[-1]}
    best_two = [r for r in rows if r["model"].startswith("Per person: ") and r["kind"] == "model"]
    _log(f"  Depresjon: per-person AUC {best_two[0]['auc']:.3f}/{best_two[1]['auc']:.3f}; day split by person "
         f"{rows[-1]['auc']:.3f}; random day split {leak['leaky']['auc']:.3f}", verbose)
    info.update({"used": True, "leak_demo": leak, "label": "Depressed patient (unipolar or bipolar) against healthy control"})
    return rows, info


def _sl_read(name: str) -> pd.DataFrame:
    import pyreadr
    return pyreadr.read_r(str(SL_DIR / "dataset_rds" / name))[None]


SL_CACHE_VERSION = 2   # v2: real call events from CALLS__id/CALLS_date; SMS logger counts kept only for a note


def studentlife_table(refresh: bool = False) -> tuple[pd.DataFrame, dict]:
    cache = CACHE / f"exp1b_studentlife_v{SL_CACHE_VERSION}.parquet"
    if cache.exists() and not refresh:
        S = pd.read_parquet(cache)
    else:
        tz = pd.Timedelta(hours=4)  # 2013 spring term, US Eastern daylight time

        def day_of(ts):
            return (pd.to_datetime(ts, unit="s") - tz).dt.normalize()

        act = _sl_read("sensing/activity.Rds")
        act = act[act["activity_inference"].isin([0, 1, 2])]
        act["day"] = day_of(act["timestamp"])
        act["moving"] = act["activity_inference"].isin([1, 2]).astype(float)
        ga = act.groupby(["uid", "day"], observed=True)
        per = pd.DataFrame({"n_inferences": ga.size(), "moving_share": ga["moving"].mean()})
        per = per[per["n_inferences"] >= 1000]
        for name, key in [("sensing/conversation.Rds", "conversation"), ("sensing/dark.Rds", "dark"),
                          ("sensing/phonelock.Rds", "phonelock"), ("sensing/phonecharge.Rds", "phonecharge")]:
            t = _sl_read(name)
            t["day"] = day_of(t["start_timestamp"])
            t["dur_h"] = (t["end_timestamp"] - t["start_timestamp"]) / 3600.0
            gt = t.groupby(["uid", "day"], observed=True)
            per = per.join(gt["dur_h"].sum().rename(f"{key}_hours"), how="left")
            per = per.join(gt.size().rename(f"{key}_count"), how="left")
        gps = _sl_read("sensing/gps.Rds").sort_values(["uid", "timestamp"])
        gps["day"] = day_of(gps["timestamp"])
        lat, lon = np.radians(gps["latitude"].to_numpy()), np.radians(gps["longitude"].to_numpy())
        dlat, dlon = np.diff(lat, prepend=lat[0]), np.diff(lon, prepend=lon[0])
        h = np.sin(dlat / 2) ** 2 + np.cos(lat) * np.cos(np.r_[lat[0], lat[:-1]]) * np.sin(dlon / 2) ** 2
        step = 2 * 6371.0 * np.arcsin(np.sqrt(np.clip(h, 0, 1)))
        newu = np.r_[True, gps["uid"].to_numpy()[1:] != gps["uid"].to_numpy()[:-1]]
        gps["km"] = np.where(newu | (step > 50), 0.0, step)
        gps["cell"] = gps["latitude"].round(3).astype(str) + "," + gps["longitude"].round(3).astype(str)
        gg = gps.groupby(["uid", "day"], observed=True)
        per = per.join(np.log1p(gg["km"].sum()).rename("log_km"), how="left")
        per = per.join(gg["cell"].nunique().rename("places"), how="left")
        # Real call events: one per (student, CALLS__id), dated by CALLS_date (ms).
        cl = _sl_read("other/call_log.Rds")
        calls = cl.dropna(subset=["CALLS__id", "CALLS_date"]).drop_duplicates(["uid", "CALLS__id"]).copy()
        calls["day"] = day_of(calls["CALLS_date"] / 1000.0)
        per = per.join(calls.groupby(["uid", "day"], observed=True).size().rename("call_events_count"), how="left")
        # Logger records (polls, many empty). Kept only to reproduce the first version as a note.
        for name, key in [("other/sms.Rds", "logger_sms_records"), ("other/call_log.Rds", "logger_call_records")]:
            t = _sl_read(name).drop_duplicates("id")
            t["day"] = day_of(t["timestamp"])
            per = per.join(t.groupby(["uid", "day"], observed=True).size().rename(f"{key}_count"), how="left")
        fill0 = [c for c in per.columns if c.endswith(("_count", "_hours"))]
        per[fill0] = per[fill0].fillna(0.0)
        per = per.reset_index()
        S = per.groupby("uid", observed=True).mean(numeric_only=True)
        S["days"] = per.groupby("uid", observed=True).size()
        S = S.reset_index()
        S["uid"] = S["uid"].astype(str)
        q = _sl_read("survey/PHQ-9.Rds")
        mp = {"Not at all": 0, "Several days": 1, "More than half the days": 2, "Nearly every day": 3}
        q["score"] = sum(q[f"Q{i}"].astype(str).map(mp) for i in range(1, 10))
        q["uid"] = q["uid"].astype(str)
        S = S.merge(q[q["type"] == "pre"][["uid", "score"]].rename(columns={"score": "phq9_pre"}), on="uid", how="left")
        S = S.merge(q[q["type"] == "post"][["uid", "score"]].rename(columns={"score": "phq9_post"}), on="uid", how="left")
        S = S.drop(columns=["n_inferences"])
        CACHE.mkdir(parents=True, exist_ok=True)
        S.to_parquet(cache, index=False)
    feat = [c for c in S.columns if c not in ("uid", "days", "phq9_pre", "phq9_post") and not c.startswith("logger_")]
    old = [c for c in feat if c != "call_events_count"] + ["logger_sms_records_count", "logger_call_records_count"]
    return S, {"features": feat, "first_version_features": old}


def external_studentlife(refresh: bool = False, verbose: bool = True) -> tuple[list[dict], dict]:
    if not (SL_DIR / "dataset_rds" / "survey" / "PHQ-9.Rds").exists():
        return [], {"used": False, "reason": "data/studentlife not found"}
    S, info = studentlife_table(refresh)
    T = S[S["phq9_post"].notna() & (S["days"] >= 14)].reset_index(drop=True)
    feat = info["features"]
    X, g = T[feat].to_numpy(float), T["uid"].to_numpy()
    rows = []
    for cut in (10, 5):
        y = (T["phq9_post"] >= cut).astype(float).to_numpy()
        tag = f"{F7S}, PHQ-9 >= {cut}"
        for m in ["logistic", "rf"]:
            p = repeated_oof(X, y, g, m, repeats=10)
            rows.append(row(tag, f"Term average: {MODEL_LABEL[m]}", "model", evaluate(y, p, g, within=False),
                            n_features=len(feat)))
        if cut == 10:
            p, chosen = repeated_nested(X, y, g)
            rows.append(row(tag, "Term average: nested choice between the two models", "nested",
                            evaluate(y, p, g, within=False), chosen=chosen))
            Xo = T[info["first_version_features"]].to_numpy(float)
            po = repeated_oof(Xo, y, g, "logistic", repeats=10)
            rows.append(row(tag, "First version, with logger record counts in place of calls and texts: "
                            "Logistic regression", "note", evaluate(y, po, g, within=False)))
        rows.append(row(tag, "Base rate (no information)", "baseline", evaluate(y, np.zeros(len(y)), g, within=False)))
        rows.append(row(tag, "PHQ-9 at the start of term alone", "baseline",
                        evaluate(y, T["phq9_pre"].fillna(T["phq9_pre"].median()).to_numpy(), g, within=False)))
        ys = shuffled(y, SEED + cut)
        rows.append(row(tag, "Label-shuffle control (Logistic regression)", "control",
                        evaluate(ys, repeated_oof(X, ys, g, "logistic", repeats=10), g, within=False)))
    info.update({"used": True, "students_with_post_phq9": int(len(T)),
                 "post_phq9_at_10_or_more": int((T["phq9_post"] >= 10).sum()),
                 "post_phq9_at_5_or_more": int((T["phq9_post"] >= 5).sum()),
                 "median_days_of_data": float(T["days"].median()),
                 "label": "PHQ-9 at the end of the 10-week term"})
    _log(f"  StudentLife: {len(T)} students; AUC {rows[0]['auc']:.3f}/{rows[1]['auc']:.3f} at PHQ-9 >= 10", verbose)
    return rows, info


# ---------------------------------------------------------------------------
# 12. Run everything
# ---------------------------------------------------------------------------

def provenance() -> dict:
    import hashlib

    def info(p: Path) -> dict | None:
        if not p.exists():
            return None
        st = p.stat()
        return {"bytes": int(st.st_size), "modified": time.strftime("%Y-%m-%d %H:%M", time.localtime(st.st_mtime))}

    code = {p.name: hashlib.sha256(p.read_bytes()).hexdigest()[:16]
            for p in [Path(__file__).resolve(), Path(ex.__file__).resolve()]}
    return {"code_sha256_16": code, "cache_version": CACHE_VERSION, "studentlife_cache_version": SL_CACHE_VERSION,
            "sources": {"sensing.csv": info(DATA / "Sensing" / "sensing.csv"),
                        "general_ema.csv": info(DATA / "EMA" / "general_ema.csv"),
                        "depresjon.zip": info(DEP_DIR / "depresjon.zip"),
                        "studentlife dataset_rds.zip": info(SL_DIR / "dataset_rds.zip")}}


def run_all(refresh: bool = False, write: bool = True, verbose: bool = True) -> dict:
    t0 = time.time()
    _log("Building tables...", verbose)
    W, meta = build_tables(refresh, verbose)
    D = week_rows(W)
    P = prospective_rows(W)
    data = {"students": int(D["sid"].nunique()), "labelled_weeks": int(len(D)),
            "base_rate": float(D["label"].mean()), "daily_features": len(meta["daily_features"]),
            "passive_features": len(passive_cols(meta)), "checkin_features": len(meta["checkin_cols"]),
            "before_answer_weeks": int(len(P)), "before_answer_students": int(P["sid"].nunique()),
            "before_answer_base_rate": float(P["label"].mean()),
            "before_answer_features": len(meta["prospective_cols"]),
            "weeks_in_both": int(D["_w"].isin(P["_w"]).sum())}
    _log(f"  1a: {data['labelled_weeks']:,} weeks; 1b: {data['before_answer_weeks']:,} weeks; "
         f"{data['students']} students", verbose)
    _log(f"Framing 1a: same week [{time.time() - t0:.0f}s]", verbose)
    r1a, _ = framing_same_week(D, P, meta, verbose)
    _log(f"Framing 1b: before the answer [{time.time() - t0:.0f}s]", verbose)
    r1b, pb = framing_before(P, meta, verbose)
    _log(f"Framing 2: personal models [{time.time() - t0:.0f}s]", verbose)
    r2, personal_info = framing_personal(P, meta, pb["hgb"], verbose=verbose)
    _log(f"Framing 3: per term [{time.time() - t0:.0f}s]", verbose)
    r3, term_info = framing_term(W, meta, verbose)
    _log(f"Framing 4: change [{time.time() - t0:.0f}s]", verbose)
    r4, change_info = framing_change(P, meta, verbose)
    _log(f"Framing 5: check-ins and earlier answers [{time.time() - t0:.0f}s]", verbose)
    r5, checkin_info = framing_checkin(P, meta, r1b, verbose)
    r5s = framing_separated(P, meta, verbose)
    _log(f"Deliberate leaks [{time.time() - t0:.0f}s]", verbose)
    leaks = leak_demos(W, D, meta, r1a, verbose)
    found = found_leak_record(D, meta)
    _log(f"External data [{time.time() - t0:.0f}s]", verbose)
    r7d, dep_info = external_depresjon(verbose)
    r7s, sl_info = external_studentlife(refresh, verbose)
    if dep_info.get("used"):
        leaks.append(dep_info.pop("leak_demo"))
    rows = r1a + r1b + r2 + r3 + r4 + r5 + r5s + r7d + r7s
    checks = leakage_checks(W, D, P, meta, rows, personal_info)
    results = {
        "generated": GENERATED,
        "dataset": "College Experience Study (Dartmouth), CC BY-NC-SA 4.0",
        "label": "PHQ-2 >= 3 (PHQ-4 items 3 and 4), the answer nearest the end of each week",
        "metric_notes": {
            "sens_at_80_spec": "Interpolated test-ROC sensitivity at 80% specificity. Descriptive only: the threshold is "
                               "read off the test ROC curve, and tied scores are interpolated. It is not a validated "
                               "operating threshold.",
            "intervals": "95% percentile intervals from 1000 resamples of students, conditional on the fitted "
                         "predictions. They do not include refitting or choosing among models.",
            "model_choice": "Rows marked kind=model are exploratory, model-specific cross-validation estimates. "
                            "Rows marked kind=nested choose the model inside each training part."},
        "settings": {"seed": SEED, "bootstrap_draws": N_BOOT, "folds": N_FOLDS, "min_past_weeks_for_z": MIN_PAST_WEEKS,
                     "z_clip": Z_CLIP, "leak_flag_auc": LEAK_FLAG_AUC, "personal_n": PERSONAL_N,
                     "personal_min_test_weeks": PERSONAL_MIN_TEST, "term_min_labelled_weeks": TERM_MIN_LABELS,
                     "term_min_valid_weeks": TERM_MIN_VALID, "change_rise_points": CHANGE_RISE,
                     "change_min_prior_answers": CHANGE_MIN_PRIOR, "specificity_target": SPEC_TARGET},
        "data": data,
        "feature_families": {k: len(v) for k, v in meta.items() if k.endswith("_cols")},
        "data_terms": DATA_TERMS,
        "term": term_info, "change": change_info, "checkin": checkin_info, "personal": personal_info,
        "label_reliability": label_reliability(ex.load_answers()),
        "external": {"depresjon": dep_info, "studentlife": sl_info},
        "rows": rows,
        "found_leak": found,
        "leak_demos": leaks,
        "leakage_checks": checks,
        "first_version": FIRST_VERSION,
        "provenance": provenance(),
        "runtime_seconds": None,
    }
    finish(results)
    results["runtime_seconds"] = float(time.time() - t0)
    if write:
        write_outputs(results)
    _log(f"Done in {time.time() - t0:.0f}s", verbose)
    return results


def finish(res: dict) -> None:
    res["summary_rows"] = summary_rows(res)
    res["headline_numbers"] = {k: (v if not isinstance(v, dict) else
                                   {kk: v[kk] for kk in ("framing", "model", "auc", "auc_ci", "pr_auc",
                                                         "sens_at_80_spec", "n_students", "n_rows") if kk in v})
                               for k, v in headline_numbers(res).items()}
    res["headline"] = make_headline(res)


def _py(o):
    if isinstance(o, dict):
        return {str(k): _py(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_py(v) for v in o]
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, (np.floating, float)):
        f = float(o)
        return None if np.isnan(f) else round(f, 4)
    if isinstance(o, np.bool_):
        return bool(o)
    if isinstance(o, (pd.Timestamp, np.datetime64)):
        return str(o)
    return o


def write_outputs(res: dict) -> None:
    import pickle
    CACHE.mkdir(parents=True, exist_ok=True)
    (CACHE / "exp1b_results.pkl").write_bytes(pickle.dumps(res))
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    (RESULTS_DIR / "results.json").write_text(json.dumps(_py(res), indent=2))
    (RESULTS_DIR / "results.md").write_text(make_markdown(res))
    APP_JSON.parent.mkdir(parents=True, exist_ok=True)
    APP_JSON.write_text(json.dumps(_py(app_summary(res)), indent=2))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--refresh", action="store_true",
                    help="rebuild every cache from data/: Experiment 1's daily and weekly tables, this "
                         "experiment's feature tables and the StudentLife table")
    ap.add_argument("--report-only", action="store_true",
                    help="rewrite results.md and the JSON files from the last run's cached results")
    args = ap.parse_args()
    if args.report_only:
        import pickle
        res = pickle.loads((CACHE / "exp1b_results.pkl").read_bytes())
        finish(res)
        write_outputs(res)
        print("Rewrote results/exp1b/ and app/public/data/exp1b_summary.json from the cached run.")
        return
    run_all(refresh=args.refresh)


# ---------------------------------------------------------------------------
# 13. Summary rows, app JSON and the write-up
# ---------------------------------------------------------------------------

# Headline numbers of the first version of this report, before the review.
FIRST_VERSION = {
    "phone_same_week": {"auc_by_model": {"logistic": 0.571, "hgb": 0.569, "rf": 0.578}, "label": "Phone data alone"},
    "last_week_phq2": {"auc": 0.877, "label": "Last week's PHQ-2 alone"},
    "one_tap_checkin": {"auc": 0.772, "label": "One-tap check-in (was check-in history with platform)"},
    "phone_plus_checkin": {"auc": 0.771, "label": "Passive plus check-in (gradient boosting)"},
    "checkin_plus_phq2": {"auc": 0.904, "label": "Check-in plus earlier PHQ-2 (gradient boosting)"},
    "personal_8": {"auc": 0.658, "label": "Pooled + own intercept, first 8"},
    "personal_16": {"auc": 0.720, "label": "Pooled + own intercept, first 16"},
    "own_avg_8": {"auc": 0.751, "label": "Own average PHQ-2, first 8"},
    "own_avg_16": {"auc": 0.796, "label": "Own average PHQ-2, first 16"},
    "term": {"auc": 0.627, "label": "Term level, logistic"},
    "change": {"auc": 0.597, "label": "Change detection, logistic"},
    "depresjon": {"auc": 0.840, "label": "Depresjon per person, random forest"},
    "studentlife": {"auc": 0.760, "label": "StudentLife, logistic"},
}


def _find(rows: list[dict], framing: str, model: str) -> dict | None:
    return next((r for r in rows if r["framing"] == framing and r["model"] == model), None)


def _models(rows: list[dict], framing: str, prefix: str = "", kinds=("model", "with_history", "comparison")) -> list[dict]:
    return [r for r in rows if r["framing"] == framing and r["model"].startswith(prefix) and r["kind"] in kinds]


def summary_rows(res: dict) -> list[dict]:
    """The main table, the chart and the app JSON. Every model is listed, so no
    winner is picked. group: phone (passive data only), answers (uses the
    student's own answers), baseline, control. chart marks the rows drawn."""
    rows = res["rows"]
    out = []

    def add(r, group, chart=True):
        if r is not None:
            out.append(dict(r, group=group, chart=chart))

    for f in (F1B, F1A):
        for m in ["logistic", "hgb", "rf"]:
            add(_find(rows, f, MODEL_LABEL[m]), "phone")
        add(_find(rows, f, RECENT_PHQ), "baseline")
        add(_find(rows, f, EXACT_PHQ), "baseline", chart=False)
        add(_find(rows, f, "Label-shuffle control (Logistic regression)"), "control")
    for N in PERSONAL_N:
        tag = f"{F2}, first {N} eligible weeks"
        ch = N == 16
        add(_find(rows, tag, "Pooled gradient boosting + own intercept"), "answers", ch)
        add(_find(rows, tag, "Pooled gradient boosting, no personal step"), "phone", ch)
        add(_find(rows, tag, f"Own average PHQ-2 score in the first {N} weeks"), "baseline", ch)
        for m in ["logistic", "hgb"]:
            add(_find(rows, tag, f"History only (own average and share high): {MODEL_LABEL[m]}"), "answers", ch)
            add(_find(rows, tag, f"History plus phone data before the answer: {MODEL_LABEL[m]}"), "answers", ch)
        add(_find(rows, tag, "History plus the shared phone model's score: Logistic regression"), "answers", ch)
        add(_find(rows, tag, "Label-shuffle control (pooled + own intercept)"), "control", ch)
    for m in ["logistic", "hgb", "rf"]:
        add(_find(rows, F3, MODEL_LABEL[m]), "phone")
    add(_find(rows, F3, "Nested choice among the three models"), "phone")
    add(_find(rows, F3, "Last term's average PHQ-2 alone"), "baseline")
    add(_find(rows, F3, "Label-shuffle control (Logistic regression)"), "control")
    for m in ["logistic", "hgb"]:
        add(_find(rows, F4, MODEL_LABEL[m]), "phone")
    add(_find(rows, F4, f"{RECENT_PHQ} minus own running mean"), "baseline")
    add(_find(rows, F4, "Label-shuffle control (Logistic regression)"), "control")
    for name in ["Single last-week check-in (latest answer)", "Last week's check-ins (mean)", "Check-in history",
                 "Phone before the answer plus check-in history", "Check-in history plus earlier PHQ-2 answers",
                 "Phone before the answer plus check-in history plus earlier PHQ-2 answers"]:
        for r in _models(rows, F5, name + ":"):
            add(r, "answers", chart=name != "Last week's check-ins (mean)")
    add(_find(rows, F5, "Label-shuffle control (Logistic regression)"), "control")
    add(_find(rows, F5S, "Latest PHQ-2 answered 14 or more days before, alone"), "baseline")
    for r in _models(rows, F5S, kinds=("model", "with_history")):
        add(r, "answers")
    add(_find(rows, F5S, "Label-shuffle control (Logistic regression)"), "control")
    for m in ["logistic", "rf"]:
        add(_find(rows, F7D, f"Per person: {MODEL_LABEL[m]}"), "phone")
    add(_find(rows, F7D, "Per person: nested choice between the two models"), "phone")
    add(_find(rows, F7D, f"Per person, all-zero days removed: {MODEL_LABEL['rf']}"), "phone", chart=False)
    add(_find(rows, F7D, "Label-shuffle control (Logistic regression)"), "control")
    tag = f"{F7S}, PHQ-9 >= 10"
    for m in ["logistic", "rf"]:
        add(_find(rows, tag, f"Term average: {MODEL_LABEL[m]}"), "phone")
    add(_find(rows, tag, "Term average: nested choice between the two models"), "phone")
    add(_find(rows, tag, "PHQ-9 at the start of term alone"), "baseline")
    add(_find(rows, tag, "Label-shuffle control (Logistic regression)"), "control")
    return out


def _span(rs: list[dict]) -> str:
    a = [r["auc"] for r in rs]
    return f"{min(a):.2f}" if round(min(a), 2) == round(max(a), 2) else f"{min(a):.2f} to {max(a):.2f}"


def headline_numbers(res: dict) -> dict:
    rows = res["rows"]
    pick = lambda f, n: _find(rows, f, n)
    t16 = f"{F2}, first 16 eligible weeks"
    t8 = f"{F2}, first 8 eligible weeks"
    sl = f"{F7S}, PHQ-9 >= 10"
    return {
        "before_answer": [pick(F1B, MODEL_LABEL[m]) for m in ["logistic", "hgb", "rf"]],
        "same_week": [pick(F1A, MODEL_LABEL[m]) for m in ["logistic", "hgb", "rf"]],
        "recent_phq": pick(F1B, RECENT_PHQ), "recent_phq_1a": pick(F1A, RECENT_PHQ),
        "exact_phq": pick(F1B, EXACT_PHQ),
        "single_checkin": _models(rows, F5, "Single last-week check-in (latest answer):"),
        "lastweek_checkins": _models(rows, F5, "Last week's check-ins (mean):"),
        "checkin_history": _models(rows, F5, "Check-in history:"),
        "phone_checkin_history": _models(rows, F5, "Phone before the answer plus check-in history:"),
        "checkin_history_phq": _models(rows, F5, "Check-in history plus earlier PHQ-2 answers:"),
        "separated": _models(rows, F5S, "All questionnaire inputs 14 or more days before:"),
        "separated_phq": pick(F5S, "Latest PHQ-2 answered 14 or more days before, alone"),
        "personal16": pick(t16, "Pooled gradient boosting + own intercept"),
        "personal8": pick(t8, "Pooled gradient boosting + own intercept"),
        "own_avg16": pick(t16, "Own average PHQ-2 score in the first 16 weeks"),
        "own_avg8": pick(t8, "Own average PHQ-2 score in the first 8 weeks"),
        "hist16": _models(rows, t16, "History only"), "histphone16": _models(rows, t16, "History plus phone"),
        "hist8": _models(rows, t8, "History only"), "histphone8": _models(rows, t8, "History plus phone"),
        "histscore16": pick(t16, "History plus the shared phone model's score: Logistic regression"),
        "histscore8": pick(t8, "History plus the shared phone model's score: Logistic regression"),
        "term": [pick(F3, MODEL_LABEL[m]) for m in ["logistic", "hgb", "rf"]],
        "term_nested": pick(F3, "Nested choice among the three models"),
        "change": [pick(F4, MODEL_LABEL[m]) for m in ["logistic", "hgb"]],
        "dep": [pick(F7D, f"Per person: {MODEL_LABEL[m]}") for m in ["logistic", "rf"]],
        "dep_nested": pick(F7D, "Per person: nested choice between the two models"),
        "dep_zero": pick(F7D, f"Per person, all-zero days removed: {MODEL_LABEL['rf']}"),
        "sl": [pick(sl, f"Term average: {MODEL_LABEL[m]}") for m in ["logistic", "rf"]],
        "sl_nested": pick(sl, "Term average: nested choice between the two models"),
        "sl_old": next((r for r in rows if r["framing"] == sl and r["kind"] == "note"), None),
        "sl_pre": pick(sl, "PHQ-9 at the start of term alone"),
    }


def make_headline(res: dict) -> str:
    h = headline_numbers(res)
    return (f"Using only phone data recorded before the answer, models picked out high PHQ-2 weeks in students they "
            f"never saw at an AUC of {_span(h['before_answer'])}, while a single check-in from the week before "
            f"reached {_span(h['single_checkin'])}.")


CAVEATS = [
    "These are Dartmouth college students from 2017 to 2022, through the pandemic. Steady is meant for high school students.",
    "The label is a weekly PHQ-2 answered on the phone. It is a screening score, and a doctor makes the diagnosis.",
    "Phone features are the study's own daily summaries. Typing, tone and music were not available.",
    "Every AUC is an exploratory cross-validation estimate for one model. The intervals resample students but do not include choosing among models.",
    "best_passive_auc is the highest of three models on phone data from before the answer ({best_passive}); the range across models is {passive_range}.",
    "Sensitivity at 80% specificity is read off the test ROC curve and interpolated. It is descriptive and is not a tested operating threshold.",
    "Most earlier PHQ-2 answers fall within the two weeks the target answer describes, so those baselines measure overlapping answers. Framing 5b removes that overlap.",
    "Leaving calendar time out of the features does not rule out calendar effects, because phone habits change with the seasons and years too. A test on held-out later years would be needed.",
    "Depresjon compares hospital patients with healthy controls, which is an easier task than spotting a bad week in a student.",
    "StudentLife has 38 students with an end-of-term PHQ-9, 7 of them at 10 or more, so its intervals are very wide.",
]


def caveats(res: dict) -> list[str]:
    h = headline_numbers(res)
    nums = {"best_passive": f"{max(r['auc'] for r in h['before_answer']):.2f}",
            "passive_range": _span(h["before_answer"])}
    return [c.format(**nums) for c in CAVEATS]


def app_summary(res: dict) -> dict:
    h = headline_numbers(res)
    fr = [{"name": r["framing"], "model": r["model"], "group": r["group"], "auc": r["auc"], "auc_ci": r["auc_ci"],
           "pr_auc": r["pr_auc"], "sens_at_80_spec": r["sens_at_80_spec"], "n_students": r["n_students"]}
          for r in res["summary_rows"]]
    single = max(h["single_checkin"], key=lambda r: r["auc"])
    return {"generated": GENERATED, "framings": fr,
            "best_passive_auc": max(r["auc"] for r in h["before_answer"]),
            "best_with_checkin_auc": single["auc"],
            "last_week_phq_auc": h["recent_phq"]["auc"],
            "headline": make_headline(res),
            "caveats": caveats(res),
            "definitions": {
                "best_passive_auc": "Highest AUC of three models using phone data recorded before the PHQ-2 answer "
                                    "(framing 1b). Exploratory; not adjusted for picking the highest.",
                "best_with_checkin_auc": "A single check-in answer (mood picture, stress, time with others) from the "
                                         "week before, higher of two models.",
                "last_week_phq_auc": "Most recent PHQ-2 answered before Monday of the week, on framing 1b's weeks. "
                                     "Its recall period usually overlaps the target answer's.",
                "sens_at_80_spec": res["metric_notes"]["sens_at_80_spec"]}}


def _n(k: int) -> str:
    words = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"]
    return words[k] if 0 <= k < 10 else str(k)


def _f(x, nd=2):
    return "n/a" if x is None or (isinstance(x, float) and np.isnan(x)) else f"{x:.{nd}f}"


def _ci(c, nd=2):
    return f"{c[0]:.{nd}f} to {c[1]:.{nd}f}"


def _pc(x, nd=0):
    return f"{100 * x:.{nd}f}%"


def _a(r) -> str:
    return f"{_f(r['auc'])} ({_ci(r['auc_ci'])})"


def _by_model(rs: list[dict]) -> str:
    """'0.56 (logistic), 0.55 (gradient boosting)' with intervals."""
    short = {"Logistic regression": "logistic", "Gradient boosting (HistGB)": "gradient boosting",
             "Random forest": "random forest"}
    out = []
    for r in rs:
        name = r["model"].split(": ")[-1]
        out.append(f"{_f(r['auc'])} with {short.get(name, name)} ({_ci(r['auc_ci'])})")
    return "; ".join(out)


GROUP_LABEL = {"phone": "Passive data only", "answers": "Uses the student's own answers",
               "baseline": "Baseline", "control": "Shuffle control"}
SENS_HEAD = "Interpolated test-ROC sensitivity at 80% specificity"

NEEDS_APPLICATION = [
    ("GLOBEM (University of Washington, several years of student phone and wearable data with PHQ-4 surveys)",
     "PhysioNet credentialed access and a signed data use agreement"),
    ("DAIC-WOZ and E-DAIC (USC, clinical interviews with PHQ-8)",
     "a signed end-user licence agreement, academic use"),
    ("BRIGHTEN (phone app study of depression, PHQ-9)",
     "a Synapse account and an approved data access request"),
]


def _table(rows: list[dict], with_within: bool = True) -> list[str]:
    head = ["Model", "AUC (95% interval)", "PR-AUC", "Base rate", SENS_HEAD]
    if with_within:
        head.append("Within-student AUC")
    head += ["Students", "Rows", "Kind"]
    out = ["| " + " | ".join(head) + " |", "| " + " | ".join("---" for _ in head) + " |"]
    for r in rows:
        cells = [r["model"], _a(r), _f(r["pr_auc"]), _f(r["base_rate"]), _pc(r["sens_at_80_spec"])]
        if with_within:
            cells.append(_f(r.get("within_student_auc")))
        cells += [str(r["n_students"]), f"{r['n_rows']:,}", r["kind"].replace("_", " ")]
        out.append("| " + " | ".join(cells) + " |")
    return out


def make_markdown(res: dict) -> str:
    h = headline_numbers(res)
    rows = res["rows"]
    d = res["data"]
    fl = res["found_leak"]
    rel = res["label_reliability"]
    fv = FIRST_VERSION
    flags = res["leakage_checks"]["auc_above_0.90"]["rows"]
    rp = h["recent_phq"]
    L = []
    w = L.append
    w("# Experiment 1b: how well can phone data pick out a high week?")
    w("")
    w(f"Generated {GENERATED} by `experiments/exp1b_deeper.py`. Main data: College Experience Study (Dartmouth), "
      "CC BY-NC-SA 4.0, used for academic purposes only. Every number below is an aggregate over students. "
      "No student ids or per-student rows appear in this file.")
    w("")
    w("This is the second version. An independent review of the first version (by Codex) reproduced its numbers "
      "and found descriptions and two analyses that needed fixing. The section \"What changed after review\" lists "
      "each change and its effect.")
    w("")
    w("## Short answer")
    w("")
    w(res["headline"])
    w("")
    w(f"- **Phone data recorded before the answer (framing 1b).** Using only days before the PHQ-2 answer, three "
      f"models scored {_by_model(h['before_answer'])}, on {d['before_answer_weeks']:,} weeks from "
      f"{d['before_answer_students']} students they never saw. PR-AUC was about "
      f"{_f(np.mean([r['pr_auc'] for r in h['before_answer']]))} against a base rate of "
      f"{_f(d['before_answer_base_rate'])}.")
    w(f"- **Phone data from the same calendar week (framing 1a).** {_span(h['same_week'])} across the same three "
      "models. This is a same-week association: the week runs Monday to Sunday, and the answer can come on Thursday, "
      "so up to three days of phone data can come after it. It did no better than the before-the-answer version. "
      "The 7 days before the answer may line up better with the two weeks PHQ-2 asks about.")
    w(f"- **A single check-in from the week before.** The latest mood picture, stress and time-with-others answer "
      f"from the previous calendar week scored {_by_model(h['single_checkin'])}. Check-in history, which adds the "
      f"average of every earlier check-in, scored {_by_model(h['checkin_history'])}. Adding phone data recorded "
      f"before the answer to the history gave {_by_model(h['phone_checkin_history'])}.")
    w(f"- **The most recent PHQ-2 before Monday** scored {_a(rp)}. That answer was dated 1 to 7 days before Monday in "
      f"{_pc(rp['share_answer_1_to_7_days_before_monday'])} of weeks, 8 to 14 days in "
      f"{_pc(rp['share_answer_8_to_14_days_before_monday'])}, and older in "
      f"{_pc(rp['share_answer_over_14_days_before_monday'])}. Counting only weeks with an answer in the previous "
      f"calendar week ({h['exact_phq']['n_rows']:,} weeks), it scored {_a(h['exact_phq'])}.")
    w(f"- **With every questionnaire input from before the recall window (framing 5b).** When every PHQ-2 and "
      f"check-in input is at least 14 days older than the target answer, the latest PHQ-2 alone scored "
      f"{_a(h['separated_phq'])}, and all those inputs together scored {_by_model(h['separated'])}.")
    w(f"- **Personal models.** After a student's first 16 eligible weeks, a shared phone model plus an intercept "
      f"learned from their answers scored {_a(h['personal16'])}. The student's own average PHQ-2 score over those "
      f"weeks scored {_a(h['own_avg16'])}, but it only ranks students: its within-student AUC is "
      f"{_f(h['own_avg16'].get('within_student_auc'))}. Given identical answer information and folds, history alone "
      f"scored {_by_model(h['hist16'])}. History plus phone data before the answer scored "
      f"{_by_model(h['histphone16'])}, and history plus the shared phone model's single score "
      f"{_a(h['histscore16'])}. So phone data added nothing reliable to the answers. As one score it left logistic "
      "regression where it was. It lifted only gradient boosting, which fit the two history numbers poorly on its "
      "own.")
    w(f"- **Between students, and change.** Term averages of phone data told high terms from the rest at "
      f"{_span(h['term'])} across three models, and {_f(h['term_nested']['auc'])} when the model was chosen inside "
      f"each training part. A rise of 2 or more points over the student's own running mean scored "
      f"{_span(h['change'])} from phone data recorded before the answer.")
    if flags:
        w(f"- **Results above 0.90.** {_n(len(flags))} honest rows came out above 0.90. Every one uses the "
          "student's earlier PHQ answers. Their explanation is in \"Rows above 0.90\" below.")
    w(f"- **External data.** Depresjon (55 adults, wrist actigraphy, patients against healthy controls): "
      f"{_by_model(h['dep'])}; {_a(h['dep_nested'])} with the model chosen inside each training part. StudentLife "
      f"2013 (38 students, 7 with an end-of-term PHQ-9 of 10 or more): {_by_model(h['sl'])}; "
      f"{_a(h['sl_nested'])} with nested choice.")
    w("")
    w("All AUCs are exploratory, model-specific cross-validation estimates. Every model's result is listed, and the "
      "intervals do not include the step of choosing among models.")
    w("")
    w("## What changed after review")
    w("")
    w("| Number | First version | Now | What changed |")
    w("| --- | --- | --- | --- |")
    fvp = fv["phone_same_week"]["auc_by_model"]
    w(f"| Phone data alone | {min(fvp.values()):.2f} to {max(fvp.values()):.2f} | {_span(h['before_answer'])} "
      f"before the answer; {_span(h['same_week'])} same week | The first version used phone days up to three days "
      "after the answer. It is now reported as a same-week association, beside a version that uses only earlier days. |")
    w(f"| \"Last week's PHQ-2\" | {fv['last_week_phq2']['auc']:.2f} | {_f(rp['auc'])} | Renamed \"most recent PHQ-2 "
      f"before Monday\". It can be older than a week. The last-calendar-week version scores {_f(h['exact_phq']['auc'])} "
      "on its own rows. |")
    w(f"| \"One-tap check-in\" | {fv['one_tap_checkin']['auc']:.2f} | single check-in {_span(h['single_checkin'])}; "
      f"history {_span(h['checkin_history'])} | The first number used every earlier check-in and the phone "
      "platform. A single answer from last week is now its own row. |")
    w(f"| Check-in plus earlier PHQ-2 | {fv['checkin_plus_phq2']['auc']:.2f} | {_span(h['checkin_history_phq'])}; "
      f"{_span(h['separated'])} with no overlap | Now on phone-before-the-answer weeks, plus a version with every "
      "questionnaire input before the recall window. |")
    w(f"| Personal, shared model + own intercept (8 / 16) | {fv['personal_8']['auc']:.2f} / "
      f"{fv['personal_16']['auc']:.2f} | {_f(h['personal8']['auc'])} / {_f(h['personal16']['auc'])} | Phone data now "
      "from before the answer; test answers 14 or more days after training answers by actual dates. |")
    w(f"| Own average PHQ-2 (8 / 16) | {fv['own_avg_8']['auc']:.2f} / {fv['own_avg_16']['auc']:.2f} | "
      f"{_f(h['own_avg8']['auc'])} / {_f(h['own_avg16']['auc'])} | Same changes. It ranks students only "
      "(within-student AUC 0.50). |")
    w(f"| Term level | {fv['term']['auc']:.2f} (logistic) | {_span(h['term'])}; nested {_f(h['term_nested']['auc'])} | "
      "Nested model choice added. |")
    w(f"| Change detection | {fv['change']['auc']:.2f} (logistic) | {_span(h['change'])} | Phone data now from before "
      "the answer. |")
    w(f"| Depresjon | {fv['depresjon']['auc']:.2f} (random forest) | {_span(h['dep'])}; nested "
      f"{_f(h['dep_nested']['auc'])}; {_f(h['dep_zero']['auc'])} without all-zero days | Nested choice and a "
      "watch-off check added. |")
    w(f"| StudentLife | {fv['studentlife']['auc']:.2f} (logistic) | {_span(h['sl'])}; nested "
      f"{_f(h['sl_nested']['auc'])} | Calls and texts were logger records, many empty. Calls are now real call events "
      "and texts are dropped. |")
    w("")
    w("## What we tested")
    w("")
    w("| Framing | Question | Phone data timing | Rows | Split |")
    w("| --- | --- | --- | --- | --- |")
    w(f"| 1a. Same-week association | Is this a high week? (PHQ-2 of 3 or more) | Monday to Sunday of the label week | "
      f"{d['labelled_weeks']:,} weeks, {d['students']} students | 5 folds by student |")
    w(f"| 1b. Before the answer | Same question | The 7 days before the answer day | {d['before_answer_weeks']:,} "
      f"weeks, {d['before_answer_students']} students | 5 folds by student |")
    w("| 2. Personal model | Same question, after the student's first 8 or 16 eligible weeks | Before the answer | "
      "Later weeks, 14 or more days after the last training answer | Own past; shared parts by student folds |")
    w(f"| 3. Same-term association | Is the student's average PHQ-2 over a term 3 or more? | The same term | "
      f"{res['term']['student_terms']:,} student-terms | 5 folds by student |")
    w(f"| 4. Change detection | Is this week 2 or more points above the student's running mean? | Before the answer | "
      f"{res['change']['rows']:,} weeks | 5 folds by student |")
    w("| 5. Check-ins and earlier answers | Same as 1b, adding answers from earlier weeks | Before the answer | "
      "Same as 1b | 5 folds by student |")
    w("| 5b. Fully separated | Same, with every questionnaire input 14 or more days before the answer | Before the "
      "answer | Same as 1b | 5 folds by student |")
    w("| 6. Baselines | Base rate, earlier PHQ-2 answers, and a shuffled-label control in every framing | | | |")
    w("| 7. External | The closest framing on Depresjon and StudentLife | Whole recording or term | See below | "
      "By person |")
    w("")
    w(f"**Phone features.** Every daily measure in the study's sensing file except the hourly ones: "
      f"{d['daily_features']} measures of activity, location, phone use, sleep, audio, calls, texts and light, most of "
      "them also split into three parts of the day. Night-time phone use and audio (midnight to 5 AM) and steps were "
      "added. Each is summarised as a mean and an SD over the usable days, as a z-score against the same student's "
      f"earlier weeks only, and as the previous week's value: {d['passive_features']} features. "
      f"{PLATFORM_ONLY_NOTE}")
    w("")
    w("**Timing.** In framing 1a the week is Monday to Sunday. The PHQ-2 answer that labels it can come from Thursday "
      "of that week to Wednesday of the next, so some phone days can come after the answer. In framings 1b, 2, 4, 5 "
      "and 5b the window is the 7 days before the answer day. The z-score baseline uses only calendar weeks that "
      "ended at least 8 days before the answer, and a week counts only with 4 or more usable days in its window. "
      "Calendar time is not a feature. Phone habits change with seasons and years too, so this does not rule out "
      "calendar effects; that would need a test on held-out later years.")
    w("")
    br = res["checkin"]["same_day_share_phq2_high_by_pam_block"]
    w("**Check-ins.** The PAM mood picture, stress, and time alone or with others. A *single check-in* is the latest "
      "answer given in the previous calendar week. *Last week's check-ins* average every answer from that week. "
      "*Check-in history* adds the average of every earlier answer and last week's change from it. All of them come "
      "from before Monday of the label week, and so from days before the answer. We could not check how the study "
      "numbers the 16 PAM pictures, so each answer is recorded as one of the four 2 by 2 blocks of the grid. On the "
      "same day, the share of PHQ-2 answers at 3 or more was "
      + ", ".join(f"{_pc(v)} for the {k.replace('pam_block_', '').replace('_', ' ')} block" for k, v in br.items())
      + ".")
    w("")
    w("**Earlier PHQ-2 answers.** \"Most recent PHQ-2 before Monday\" is the latest answer dated before Monday of "
      "the label week, however old. PHQ-2 asks about the last two weeks, so this answer usually describes some of the "
      "same days as the target answer. Framing 5b removes that overlap.")
    w("")
    w("**Models and choice.** Logistic regression (quantile scaling and missing-value flags fit inside each training "
      "fold, penalty fixed at C = 0.05), gradient boosting (scikit-learn HistGradientBoosting, 150 trees) and a "
      "random forest (300 trees). Settings were fixed before the run and never tuned on test students. Every model's "
      "result is listed. For the term framing and the two external datasets, a nested version also chooses the "
      "model inside each training part by a grouped inner cross-validation.")
    w("")
    w(f"**Metrics.** AUC, PR-AUC, and sensitivity at 80% specificity, pooled over all test rows. The last is read off "
      "the test ROC curve and interpolated between tied scores, so it describes the curve; it is not a tested "
      f"threshold. Each 95% interval comes from {N_BOOT} resamples of students and is conditional on the fitted "
      "predictions. Within-student AUC compares only weeks of the same student.")
    w("")
    w("## Every framing")
    w("")
    w("The main rows, with every model. Full tables follow.")
    w("")
    head = ["Framing", "Model", "Data used", "AUC (95% interval)", "PR-AUC", "Base rate", SENS_HEAD, "Students"]
    w("| " + " | ".join(head) + " |")
    w("| " + " | ".join("---" for _ in head) + " |")
    cur = None
    for r in res["summary_rows"]:
        fr = r["framing"] if r["framing"] != cur else ""
        cur = r["framing"]
        w(f"| {fr} | {r['model']} | {GROUP_LABEL[r['group']]} | {_a(r)} | {_f(r['pr_auc'])} | {_f(r['base_rate'])} | "
          f"{_pc(r['sens_at_80_spec'])} | {r['n_students']} |")
    w("")
    for title, prefix, within in [("Framing 1a: same-week association", F1A, True),
                                  ("Framing 1b: phone data from before the answer", F1B, True),
                                  ("Framing 2: personal models", F2, True),
                                  ("Framing 3: same-term association", F3, True),
                                  ("Framing 4: change detection", F4, True),
                                  ("Framing 5: check-ins and earlier answers", F5 + "", True),
                                  ("Framing 5b: questionnaire inputs from before the recall window", F5S, True),
                                  ("Framing 7a: Depresjon", F7D, False),
                                  ("Framing 7b: StudentLife 2013", F7S, False)]:
        frs = [r for r in rows if r["framing"] == prefix or r["framing"].startswith(prefix + ",")]
        if not frs:
            continue
        w(f"### {title}")
        w("")
        for name in dict.fromkeys(r["framing"] for r in frs):
            sub = [r for r in frs if r["framing"] == name]
            if name != prefix:
                w(f"**{name}**")
                w("")
            L.extend(_table(sub, with_within=within))
            w("")
        if prefix == F1B:
            w("The 1a models scored on the weeks both versions share are in the 1a table, for a like-for-like "
              "comparison.")
            w("")
        if prefix == F2:
            pi = res["personal"]
            w("Training uses the student's first 8 or 16 eligible labelled weeks of framing 1b. By then the students "
              f"had given a median of about {_f(pi['first_8']['median_raw_phq2_answers_before_last_training_week'], 0)}"
              f" and {_f(pi['first_16']['median_raw_phq2_answers_before_last_training_week'], 0)} PHQ-2 answers in "
              "all, so these are not literally their first answers. Test weeks need an answer 14 or more days after "
              "the last training answer, by actual answer dates.")
            w("")
            w("The personal intercept is learned from the binary high or not-high labels of the training weeks. The "
              "own-average baseline uses the full 0 to 6 scores, which carry more information, and the own share of "
              "high weeks uses the same binary labels as the intercept. Both baselines are constant within a student, "
              "so their within-student AUC is 0.50: they rank students, not weeks. The history-only and "
              "history-plus-phone rows use the same two history numbers and the same folds, so the only difference "
              "is the phone data.")
            w("")
        if prefix == F3:
            w(f"A student-term needs {TERM_MIN_LABELS} or more labelled weeks and {TERM_MIN_VALID} or more weeks of "
              "phone data. The phone data cover the same term as the answers, so this is an association. Nested "
              f"choices across the 5 outer folds: {', '.join(res['term']['nested_choices'])}.")
            w("")
        if prefix == F4:
            w(f"The running mean uses every PHQ-2 answer dated before Monday of the week, with at least "
              f"{CHANGE_MIN_PRIOR} of them. Students with a higher running mean swing more from week to week, so "
              "the running mean alone has skill.")
            w("")
    w("## Leakage checks")
    w("")
    w("| Check | Result | What it does |")
    w("| --- | --- | --- |")
    for k, v in res["leakage_checks"].items():
        result = "passed" if v["passed"] else "flagged, explained below"
        w(f"| {k.replace('_', ' ')} | {result} | {v['what']} |")
    w("")
    c4 = res["leakage_checks"]["earlier_phq2_before_monday"]
    w(f"On framing 1a's weeks, the most recent PHQ-2 before Monday came a median of "
      f"{_f(c4['median_days_between_answers'], 0)} days before the target answer (at least "
      f"{c4['min_days_between_answers']}). {_pc(c4['share_sharing_recall_days'])} of those pairs were less than 14 "
      "days apart, so the two answers describe some of the same days.")
    w("")
    w("### A leak found in the first run, and fixed")
    w("")
    w(f"{fl['what']} We treated that as a leak and went looking.")
    w("")
    w(f"- **Cause.** {fl['cause']} Before the fix {_pc(fl['share_gaps_under_4_days_before_fix'])} of these pairs were "
      f"less than 4 days apart. None fell on the same day ({fl['same_day_pairs_before_fix']} same-day pairs).")
    w(f"- **Fix.** {fl['fix']} After the fix no pair is less than 4 days apart.")
    w("")
    w("| Result, on framing 1a's weeks | Before the fix | After the fix |")
    w("| --- | --- | --- |")
    w(f"| {RECENT_PHQ} alone | {_f(fl['recent_phq2_alone_before_fix']['auc'], 3)} | "
      f"{_f(fl['recent_phq2_alone_after_fix']['auc'], 3)} |")
    w(f"| Check-in history plus earlier PHQ-2 answers (gradient boosting) | "
      f"{_f(fl['checkin_history_plus_phq2_before_fix']['auc'], 3)} | "
      f"{_f(fl['checkin_history_plus_phq2_after_fix']['auc'], 3)} |")
    w("")
    w("The fix moved these numbers very little. The pre-Monday cut-off is fixed. The overlap in recall periods is "
      "not, and framing 5b handles it separately.")
    w("")
    if flags:
        w("### Rows above 0.90")
        w("")
        for f in flags:
            w(f"- {f['framing']}: {f['model']}, {_f(f['auc'])}")
        w("")
        w("Each of these uses the student's earlier PHQ answers. Those answers are dated before Monday of the week, "
          "or come from an earlier term or the start of the term, and the test students were never in training. "
          "Where these rows use phone data, it comes from before the answer. We found no further leak. What lifts "
          "them is persistence: a student who answered high before tends to answer high again. The evidence:")
        w("")
        lb = next(l for l in res["leak_demos"] if l["name"].startswith("Each student"))
        w(f"- The average of each student's answers before Monday scores {_f(lb['fixed']['auc'])} by itself.")
        w(f"- With every questionnaire input 14 or more days old (framing 5b), the latest PHQ-2 alone scores "
          f"{_f(h['separated_phq']['auc'])} and all those inputs {_span(h['separated'])}.")
        best_hist = max(h["checkin_history_phq"], key=lambda r: r["auc"])
        w(f"- Within a single student, check-in history plus earlier PHQ-2 ranks weeks at "
          f"{_f(best_hist.get('within_student_auc'))}, against "
          f"{_f(max(r.get('within_student_auc') or 0 for r in h['before_answer']))} for phone data before the answer.")
        w("")
        w("These numbers are real, and they come from asking. Most of the lift is knowing who is usually high and how "
          "they felt in the days before. Inside a student it helps because high scores tend to come in runs of "
          "weeks.")
        w("")
    w("## What a near-perfect number is made of")
    w("")
    w("These were built wrong on purpose, on framing 1a's weeks, to show what an AUC near 1.0 usually means. Each "
      "one has a fair version beside it.")
    w("")
    w("| Built wrong | AUC | Why it is wrong | Fair version | AUC |")
    w("| --- | --- | --- | --- | --- |")
    for l in res["leak_demos"]:
        w(f"| {l['name']} | {_f(l['leaky']['auc'])} | {l['cause']} | {l['fixed_name']} | {_f(l['fixed']['auc'])} |")
    w("")
    w("## External data")
    w("")
    w("| Dataset | Source | Licence and terms | Used for |")
    w("| --- | --- | --- | --- |")
    ext = res["external"]
    dep_i, sl_i = ext["depresjon"], ext["studentlife"]
    w(f"| {DATA_TERMS['depresjon']['name']} | {DATA_TERMS['depresjon']['source']} | "
      f"{DATA_TERMS['depresjon']['license']} | "
      + (f"{dep_i['participants']} people ({dep_i['depressed']} depressed patients, {dep_i['controls']} controls), "
         f"{dep_i['full_days']:,} full days of minute-level wrist activity |" if dep_i.get("used") else "not used |"))
    w(f"| {DATA_TERMS['studentlife']['name']} | {DATA_TERMS['studentlife']['source']} | "
      f"{DATA_TERMS['studentlife']['license']}. {DATA_TERMS['studentlife']['terms']} | "
      + (f"{sl_i['students_with_post_phq9']} students with an end-of-term PHQ-9 ({sl_i['post_phq9_at_10_or_more']} at "
         f"10 or more), a median of {_f(sl_i['median_days_of_data'], 0)} days of phone data each |"
         if sl_i.get("used") else "not used |"))
    w("")
    w("**Closest framing.** Both have one label per person, so both match framing 3. Depresjon: each person's average "
      "activity, its spread from day to day, the share of still minutes, and night against day activity, against "
      "patient or control. StudentLife: term averages of activity, conversation, darkness, phone lock, charging, "
      "distance, places and call events, against the end-of-term PHQ-9. Its baseline is the start-of-term PHQ-9. "
      "Both use repeated 5-fold splits by person, and every prediction comes from models that never saw that person. "
      "The StudentLife PHQ-9 table has no answer dates, so we cannot check that the phone data came before the "
      "answers.")
    w("")
    w(f"**Depresjon.** A case-control sample: adults with a depression diagnosis against healthy people. Telling those "
      f"groups apart is far easier than spotting a bad week in a student. In "
      f"{dep_i.get('people_with_all_zero_days', 0)} people's recordings some days had no activity at all, which may "
      f"mean the watch was off. Removing those "
      f"{dep_i.get('all_zero_days_removed', 0)} days gave {_a(h['dep_zero'])} with a random forest. Its day-level "
      "rows also show the random-split leak in a second dataset.")
    w("")
    if h["sl_old"]:
        w(f"**StudentLife correction.** The first version counted logger records as texts and calls. Most call-log "
          "records are empty polls, and the text table has no message events at all. Calls are now unique call "
          "events dated by the call itself, and texts are dropped. The first version's logistic regression scored "
          f"{_f(h['sl_old']['auc'])}; the corrected one scores {_f(h['sl'][0]['auc'])}. With "
          f"{sl_i['post_phq9_at_10_or_more']} positive students the intervals run from about "
          f"{_f(min(r['auc_ci'][0] for r in h['sl']))} to {_f(max(r['auc_ci'][1] for r in h['sl']))}, and the "
          f"start-of-term PHQ-9 alone scores {_f(h['sl_pre']['auc'])}.")
        w("")
    w("**Needs the team to apply.** These were left out because they sit behind a login or an agreement:")
    w("")
    for name, need in NEEDS_APPLICATION:
        w(f"- {name}: {need}.")
    w("")
    w("No social media posts were collected.")
    w("")
    w("## What the numbers show and what they do not")
    w("")
    w(f"Phone data alone carries a little information about mood. Using only days before the answer, it scores "
      f"{_span(h['before_answer'])} on students the models never saw, and inside a student it ranks weeks at about "
      f"{_f(max(r.get('within_student_auc') or 0 for r in h['before_answer']))}. At 80% specificity on the test ROC "
      f"curve it reaches about {_pc(np.mean([r['sens_at_80_spec'] for r in h['before_answer']]))} sensitivity, which "
      "is too low to act on alone.")
    w("")
    w(f"The student's own answers carry far more. A single check-in from the week before scores "
      f"{_span(h['single_checkin'])}, and the most recent PHQ-2 before Monday {_f(rp['auc'])}. Personal models gain "
      "because they learn how often each student is usually high, from that student's answers. Adding phone data "
      "to the same answer history did not reliably help: with 16 training weeks it moved logistic regression from "
      f"{_f(h['hist16'][0]['auc'])} to {_f(h['histphone16'][0]['auc'])}, and adding the shared phone model's score "
      f"gave {_f(h['histscore16']['auc'])}. Inside a student, phone data does add a little: the history alone ranks "
      f"weeks at 0.50 and history plus phone at about {_f(h['histphone16'][0].get('within_student_auc'))}.")
    w("")
    w("Nothing here shows that a phone can detect depression. In this data the answers did most of the work. A high "
      "PHQ-2 week is a screening result, and a doctor makes the diagnosis.")
    w("")
    w("For the design, this supports the direction Experiment 1 pointed to: ask on a regular schedule with a one-tap "
      "check-in, and treat phone signals as context.")
    w("")
    w("## Why not 100%")
    w("")
    w("The team asked for almost 100% accuracy. Here is why that is the wrong target, and why we did not tune toward it.")
    w("")
    w(f"- **Accuracy hides the problem.** Only {_pc(d['base_rate'])} of weeks are high. A model that always says "
      f"\"fine\" is {_pc(1 - d['base_rate'])} accurate and catches no one. That is why every number here is AUC, "
      "PR-AUC or sensitivity.")
    w(f"- **The label moves by itself.** In this data, among {rel['pairs_1_to_3_days_apart']:,} pairs of PHQ-2 answers "
      f"from the same student 1 to 3 days apart, {_pc(rel['share_status_flips'])} switched between high and not high "
      f"(Cohen's kappa {_f(rel['cohen_kappa'])}). Of the pairs whose first answer was high, "
      f"{_pc(rel['share_high_first_then_not_high'])} were not high on the second. Both answers describe nearly the "
      "same two weeks, so a model that predicts one of them cannot be expected to match the other perfectly.")
    w("- **The phone sees behaviour.** Sleep, movement and phone use change for many reasons: exams, travel, a new "
      "schedule, illness. Mood is only one of them.")
    ld = next(l for l in res["leak_demos"] if l["name"].startswith("Weeks split at random"))
    lt = next(l for l in res["leak_demos"] if l["name"].startswith("The PHQ-4 total"))
    w(f"- **Near-perfect phone scores come from leaks.** The table above shows each one. Same-survey answers give "
      f"{_f(lt['leaky']['auc'])}. Letting the same students appear in training and test gives {_f(ld['leaky']['auc'])} "
      f"from phone data, which falls to {_f(ld['fixed']['auc'])} once students are kept apart. The only honest rows "
      "near 0.90 use the student's own earlier PHQ answers, so they come from asking.")
    w("")
    w(f"The honest numbers to quote: phone data recorded before the answer {_span(h['before_answer'])}; a single "
      f"check-in from the week before {_span(h['single_checkin'])}; the most recent PHQ-2 before Monday "
      f"{_f(rp['auc'])}.")
    w("")
    w("## Caveats")
    w("")
    for c in caveats(res):
        w(f"- {c}")
    w("- Terms are calendar blocks that follow Dartmouth's quarters by month, so a few weeks near the edges may sit "
      "in the wrong term.")
    w("")
    w("## How to run")
    w("")
    w("```")
    w(".venv/bin/python experiments/exp1b_deeper.py                # uses the caches in data/cache/")
    w(".venv/bin/python experiments/exp1b_deeper.py --refresh      # rebuilds every cache from data/")
    w(".venv/bin/python experiments/exp1b_deeper.py --report-only  # rewrites the reports from the last run")
    w("```")
    w("")
    w(f"The last run took {res['runtime_seconds'] / 60:.1f} minutes. `--refresh` also rebuilds Experiment 1's "
      "daily and weekly caches and the StudentLife table. It needs `pyreadr` for StudentLife "
      "(`uv pip install --python .venv/bin/python pyreadr`). Depresjon goes in `data/depresjon/` and the StudentLife "
      "RData copy in `data/studentlife/`; either is skipped when missing. Code hashes and source file sizes are in "
      "`results.json` under `provenance`. The notebook `notebooks/03_deeper_evaluation.ipynb` reads "
      "`results/exp1b/results.json` and draws the summary chart.")
    w("")
    w("*This is a prototype analysis and is not medical advice. It was written with Claude (Anthropic).*")
    w("")
    return "\n".join(L)


if __name__ == "__main__":
    main()
