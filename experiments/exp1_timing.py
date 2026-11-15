"""Experiment 1 for Stability: does the drift rule pick better weeks to ask?

Run end to end with:

    .venv/bin/python experiments/exp1_timing.py

The script reads the College Experience Study (Dartmouth) phone sensing and EMA
files from data/ces/, builds one row per student-week, applies Stability's rules
from docs/concept.md and docs/parent-alerts.md, and compares them with a fixed
calendar and with random weeks at the same number of asks.

Data terms (CC BY-NC-SA 4.0): academic use only, no re-identification, and no
per-student rows in any output. Everything this script writes is an aggregate.
The weekly table cached under data/cache/ keeps student ids and stays local
(data/ is gitignored).

Outputs:
    results/exp1/results.json        every number
    results/exp1/results.md          plain-language write-up
    app/public/data/exp1_summary.json  aggregates for the demo page
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

# ---------------------------------------------------------------------------
# Paths and settings
# ---------------------------------------------------------------------------

REPO = Path(__file__).resolve().parents[1]
DATA = REPO / "data" / "ces"
CACHE = REPO / "data" / "cache"
RESULTS_DIR = REPO / "results" / "exp1"
APP_JSON = REPO / "app" / "public" / "data" / "exp1_summary.json"

GENERATED = "2026-11-14"

QUALITY_MIN_HOURS = 12      # a day is usable if activity and location data each cover >= 12 h
MIN_DAYS_PER_WEEK = 4       # a week counts only with >= 4 usable days (parent-alerts.md)
BASELINE_WEEKS = 4          # the first 4 valid weeks set the personal range
FLOOR_FRACTION = 0.25       # spread floor: max(baseline SD, 0.25 x population SD)
K_DEFAULT = 1.0             # a signal is "out" when z >= k
K_VALUES = [0.75, 1.0, 1.5]
PERSIST_WEEKS = 2           # a signal counts after 2 consecutive weeks out
MIN_SIGNALS = 2             # an ask fires when >= 2 signals count
PHQ2_CUTOFF = 3             # PHQ-2 >= 3 is the published screening cut-off
LABEL_WINDOW_DAYS = 3       # label = answer nearest the end of the week, within 3 days
Z_CLIP = 6.0                # logistic features are clipped to [-6, 6]
ADAPT_FAST = 0.30           # adaptive range: step toward a better week
ADAPT_SLOW = 0.05           # adaptive range: step toward a worse week still in range
SEED = 20261114
N_RANDOM = 1000
N_BOOT = 1000
N_SPLITS = 5
N_PHASES = 10               # fixed-calendar results are averaged over 10 start offsets
W_GRID = [3, 4, 5, 6]
C_GRID = [2, 3, 4]
MAX_ALERTS_PER_YEAR = 4.0
DOOR_FIRST_WEEKS = 12
WEEKS_PER_YEAR = 52.0

# Stability's signals mapped to College Experience Study features available on
# both iPhone and Android. "worse" is the direction that counts against the
# student. Each weekly value is the mean over usable days unless noted.
CORE_SIGNALS = [
    dict(key="sleep", label="Sleep", feature="sleep_duration", worse="lower",
         daily="sleep",
         note="Mean nightly sleep (hours) from the study's sleep model. Nights scored 0 are treated as missing."),
    dict(key="bedtime", label="Bedtime regularity", feature="sleep_start (weekly SD)", worse="higher",
         daily="sleep_start_h",
         note="Standard deviation of sleep start time across the week's usable nights (hours). Needs 3 or more nights. A start coded exactly 0 (8 PM) is treated as missing."),
    dict(key="night_phone", label="Phone use after midnight", feature="unlock_duration_hr_0..hr_4", worse="higher",
         daily="night_phone",
         note="Minutes the phone was unlocked between midnight and 5 AM, summed per day, averaged over the week."),
    dict(key="time_with_others", label="Time with others", feature="loc_social_dur + loc_other_dorm_dur", worse="lower",
         daily="time_with_others",
         note="Hours a day at social places plus other students' dorms. On campus only, so it falls to near zero during breaks."),
    dict(key="places", label="Places visited", feature="loc_visit_num_ep_0", worse="lower",
         daily="places",
         note="Number of distinct places visited per day."),
    dict(key="movement", label="Distance travelled", feature="loc_dist_ep_0 (log scale)", worse="lower",
         daily="movement",
         note="log10(1 + km travelled per day), averaged over the week. The log stops one long trip from dominating."),
]

# Platform-only signals, for secondary analyses only.
IOS_SIGNALS = [
    dict(key="steps", label="Steps", feature="step_ep_0 (steps.csv)", worse="lower", daily="steps",
         note="iPhone step count per day. Days with 0 steps are treated as missing."),
    dict(key="night_audio", label="Audio playback after midnight", feature="other_playing_duration_hr_0..hr_4", worse="higher",
         daily="night_audio",
         note="Minutes of audio playback (music or video) between midnight and 5 AM. The direction is our guess."),
]
ANDROID_SIGNALS = [
    dict(key="sms_out", label="Texts sent", feature="sms_out_num_ep_0", worse="lower", daily="sms_out",
         note="Outgoing SMS per day (Android only)."),
    dict(key="calls_out", label="Calls made", feature="call_out_num_ep_0", worse="lower", daily="calls_out",
         note="Outgoing calls per day (Android only)."),
    dict(key="conversation", label="Conversation heard", feature="audio_convo_duration_ep_0", worse="lower",
         daily="conversation",
         note="Minutes of detected nearby conversation per day (Android only)."),
]
ALL_SIGNALS = CORE_SIGNALS + IOS_SIGNALS + ANDROID_SIGNALS

HOURS_0_4 = list(range(5))
SENSING_COLS = (
    ["uid", "is_ios", "day", "quality_activity", "quality_loc", "sleep_duration", "sleep_start",
     "loc_social_dur", "loc_other_dorm_dur", "loc_visit_num_ep_0", "loc_dist_ep_0",
     "sms_out_num_ep_0", "call_out_num_ep_0", "audio_convo_duration_ep_0"]
    + [f"unlock_duration_hr_{h}" for h in HOURS_0_4]
    + [f"other_playing_duration_hr_{h}" for h in HOURS_0_4]
)


def _log(msg: str, verbose: bool = True) -> None:
    if verbose:
        print(msg, flush=True)


def _monday(dates: pd.Series) -> pd.Series:
    return dates - pd.to_timedelta(dates.dt.dayofweek, unit="D")


# ---------------------------------------------------------------------------
# 1. Daily and weekly tables
# ---------------------------------------------------------------------------

def load_daily(refresh: bool = False) -> pd.DataFrame:
    """Daily rows with the derived signal values. Cached as parquet."""
    cache = CACHE / "exp1_daily.parquet"
    if cache.exists() and not refresh:
        return pd.read_parquet(cache)
    d = pd.read_csv(DATA / "Sensing" / "sensing.csv", usecols=SENSING_COLS)
    steps = pd.read_csv(DATA / "Sensing" / "steps.csv", usecols=["uid", "day", "step_ep_0"])
    d = d.merge(steps, on=["uid", "day"], how="left")
    ios = d["is_ios"] == 1
    out = pd.DataFrame({"uid": d["uid"], "is_ios": d["is_ios"].astype(int)})
    out["date"] = pd.to_datetime(d["day"].astype(str), format="%Y%m%d")
    out["monday"] = _monday(out["date"])
    out["usable"] = (d["quality_activity"] >= QUALITY_MIN_HOURS) & (d["quality_loc"] >= QUALITY_MIN_HOURS)
    out["sleep"] = d["sleep_duration"].where(d["sleep_duration"] > 0)
    out["sleep_start_h"] = (d["sleep_start"] / 7.5).where((d["sleep_start"] > 0) & (d["sleep_duration"] > 0))
    out["night_phone"] = d[[f"unlock_duration_hr_{h}" for h in HOURS_0_4]].sum(axis=1) / 60.0
    out["time_with_others"] = d["loc_social_dur"] + d["loc_other_dorm_dur"]
    out["places"] = d["loc_visit_num_ep_0"]
    out["movement"] = np.log10(1.0 + d["loc_dist_ep_0"] / 1000.0)
    out["steps"] = d["step_ep_0"].where(ios & (d["step_ep_0"] > 0))
    night_audio = d[[f"other_playing_duration_hr_{h}" for h in HOURS_0_4]].sum(axis=1, min_count=1) / 60.0
    out["night_audio"] = night_audio.where(ios)
    out["sms_out"] = d["sms_out_num_ep_0"].where(~ios)
    out["calls_out"] = d["call_out_num_ep_0"].where(~ios)
    out["conversation"] = (d["audio_convo_duration_ep_0"] / 60.0).where(~ios)
    CACHE.mkdir(parents=True, exist_ok=True)
    out.to_parquet(cache, index=False)
    return out


def load_answers() -> pd.DataFrame:
    """Every PHQ-2 answer (PHQ-4 items 3 and 4), one row per student-day."""
    e = pd.read_csv(DATA / "EMA" / "general_ema.csv", usecols=["uid", "day", "phq4-3", "phq4-4"])
    e = e.dropna(subset=["phq4-3", "phq4-4"]).copy()
    e["date"] = pd.to_datetime(e["day"].astype(str), format="%Y%m%d")
    e["phq2"] = e["phq4-3"] + e["phq4-4"]
    return e[["uid", "date", "phq2"]].reset_index(drop=True)


def weekly_labels(answers: pd.DataFrame) -> pd.DataFrame:
    """Label each week with the answer nearest to its end (Sunday), within 3 days.

    The ask for week t fires once the week's data are in, at the end of the
    week. The window Thursday of week t to Wednesday of week t+1 is the set of
    days within 3 days of that Sunday. These windows do not overlap, so each
    answer labels at most one week.
    """
    a = answers.copy()
    a["monday"] = _monday(a["date"] - pd.Timedelta(days=LABEL_WINDOW_DAYS))
    a["dist"] = (a["date"] - (a["monday"] + pd.Timedelta(days=6))).dt.days.abs()
    a = a.sort_values(["uid", "monday", "dist", "date"])
    n = a.groupby(["uid", "monday"]).size().rename("n_answers")
    first = a.drop_duplicates(["uid", "monday"], keep="first").set_index(["uid", "monday"])
    lab = first[["phq2"]].join(n).reset_index()
    lab["label"] = (lab["phq2"] >= PHQ2_CUTOFF).astype(float)
    return lab


def build_weekly(refresh: bool = False, verbose: bool = True) -> pd.DataFrame:
    """One row per student per calendar week (Monday to Sunday), from the
    student's first to last week with any sensing rows. Weeks with no rows are
    kept so that they break runs."""
    cache = CACHE / "exp1_weekly.parquet"
    if cache.exists() and not refresh:
        return pd.read_parquet(cache)
    t0 = time.time()
    daily = load_daily(refresh)
    _log(f"  daily rows: {len(daily):,} ({time.time() - t0:.1f}s)", verbose)
    span = daily.groupby("uid").agg(first=("monday", "min"), last=("monday", "max"),
                                    is_ios=("is_ios", "first"))
    parts = []
    for uid, r in span.iterrows():
        mondays = pd.date_range(r["first"], r["last"], freq="7D")
        parts.append(pd.DataFrame({"uid": uid, "monday": mondays, "is_ios": int(r["is_ios"]),
                                   "week_idx": np.arange(len(mondays))}))
    grid = pd.concat(parts, ignore_index=True)

    u = daily[daily["usable"]]
    g = u.groupby(["uid", "monday"])
    mean_cols = [s["daily"] for s in ALL_SIGNALS if s["key"] != "bedtime"]
    agg = g[mean_cols].mean()
    agg.columns = [next(s["key"] for s in ALL_SIGNALS if s["daily"] == c and s["key"] != "bedtime")
                   for c in agg.columns]
    bed_sd = g["sleep_start_h"].std(ddof=1)
    bed_n = g["sleep_start_h"].count()
    agg["bedtime"] = bed_sd.where(bed_n >= 3)
    agg["n_usable"] = g.size()
    agg = agg.reset_index()

    wk = grid.merge(agg, on=["uid", "monday"], how="left")
    wk["n_usable"] = wk["n_usable"].fillna(0).astype(int)

    lab = weekly_labels(load_answers())
    wk = wk.merge(lab, on=["uid", "monday"], how="left")
    wk["n_answers"] = wk["n_answers"].fillna(0).astype(int)

    wk = wk.sort_values(["uid", "monday"]).reset_index(drop=True)
    wk["sid"] = pd.factorize(wk["uid"])[0]
    wk["valid"] = wk["n_usable"] >= MIN_DAYS_PER_WEEK
    vr = wk.groupby("sid")["valid"].cumsum() - 1
    wk["valid_rank"] = np.where(wk["valid"], vr, -1)
    wk["baseline"] = wk["valid"] & (wk["valid_rank"] < BASELINE_WEEKS)
    wk["monitored"] = wk["valid"] & (wk["valid_rank"] >= BASELINE_WEEKS)
    last_base = (wk[wk["valid_rank"] == BASELINE_WEEKS - 1].set_index("sid")["week_idx"])
    lb = wk["sid"].map(last_base)
    wk["post_baseline"] = lb.notna() & (wk["week_idx"] > lb)

    # Two-week label used for parent heads-ups: label in week t or week t+1.
    nxt = wk.groupby("sid")["label"].shift(-1)
    lab_now = wk["label"]
    wk["scored2"] = lab_now.notna() | nxt.notna()
    wk["pos2"] = (lab_now == 1) | (nxt == 1)
    CACHE.mkdir(parents=True, exist_ok=True)
    wk.to_parquet(cache, index=False)
    _log(f"  weekly rows: {len(wk):,} ({time.time() - t0:.1f}s)", verbose)
    return wk


def data_summary(wk: pd.DataFrame) -> dict:
    ans = load_answers()
    ans = ans.sort_values(["uid", "date"])
    gaps = ans.groupby("uid")["date"].diff().dt.days.dropna()
    analysed = wk.loc[wk["monitored"], "sid"].unique()
    mon = wk["monitored"]
    labelled = mon & wk["label"].notna()
    s = {
        "phq2_answers": int(len(ans)),
        "students_with_answers": int(ans["uid"].nunique()),
        "share_answers_positive": float((ans["phq2"] >= PHQ2_CUTOFF).mean()),
        "median_days_between_answers": float(gaps.median()),
        "students_with_sensing": int(wk["sid"].nunique()),
        "calendar_student_weeks": int(len(wk)),
        "valid_student_weeks": int(wk["valid"].sum()),
        "students_analysed": int(len(analysed)),
        "monitored_student_weeks": int(mon.sum()),
        "monitored_student_years": float(mon.sum() / WEEKS_PER_YEAR),
        "student_weeks_with_label": int(labelled.sum()),
        "share_monitored_weeks_labelled": float(labelled.sum() / mon.sum()),
        "base_rate": float((wk.loc[labelled, "label"] == 1).mean()),
        "students_ios": int(wk.loc[mon].groupby("sid")["is_ios"].first().sum()),
        "students_android": int((wk.loc[mon].groupby("sid")["is_ios"].first() == 0).sum()),
        "labels_with_more_than_one_answer_in_window": int((wk.loc[labelled, "n_answers"] > 1).sum()),
    }
    return s


# ---------------------------------------------------------------------------
# 2. Personal range and z-scores
# ---------------------------------------------------------------------------

def _direction(signals: list[dict]) -> np.ndarray:
    return np.array([1.0 if s["worse"] == "higher" else -1.0 for s in signals])


def personal_z(wk: pd.DataFrame, signals: list[dict], mode: str = "frozen",
               k: float = K_DEFAULT, floor_fraction: float = FLOOR_FRACTION) -> tuple[np.ndarray, dict]:
    """z in the worse direction for every week and signal.

    mode="frozen": mean and spread from the first 4 valid weeks, never updated.
    mode="adaptive": the spread stays fixed; the mean moves toward a better
    week by ADAPT_FAST, toward a worse week still inside the range by
    ADAPT_SLOW, and does not move while that signal is out (z >= k).
    """
    keys = [s["key"] for s in signals]
    vals = wk[keys].to_numpy(dtype=float)
    valid = wk["valid"].to_numpy()
    base = wk["baseline"].to_numpy()
    sid = wk["sid"].to_numpy()
    pop_sd = np.nanstd(np.where(valid[:, None], vals, np.nan), axis=0, ddof=1)
    floor = floor_fraction * pop_sd
    bdf = pd.DataFrame(vals[base], columns=keys)
    bdf["sid"] = sid[base]
    g = bdf.groupby("sid")
    mean = g.mean().where(g.count() >= 2)
    sd = g.std(ddof=1).fillna(0.0)
    spread = np.maximum(sd.to_numpy(), floor[None, :])
    spread = pd.DataFrame(spread, index=sd.index, columns=keys)
    M = mean.reindex(sid).to_numpy()
    S = spread.reindex(sid).to_numpy()
    direc = _direction(signals)
    if mode == "frozen":
        Z = direc * (vals - M) / S
    elif mode == "adaptive":
        Z = np.full_like(vals, np.nan)
        idx_by_sid = pd.Series(np.arange(len(wk))).groupby(sid).indices
        mon = wk["monitored"].to_numpy()
        for s_id, idx in idx_by_sid.items():
            if np.isnan(M[idx[0]]).all():
                continue
            m = M[idx[0]].copy()
            sp = S[idx[0]]
            for i in idx:
                if base[i]:
                    Z[i] = direc * (vals[i] - M[i]) / sp
                    continue
                if not mon[i]:
                    continue
                x = vals[i]
                z = direc * (x - m) / sp
                Z[i] = z
                ok = ~np.isnan(z)
                better = ok & (z < 0)
                inside_worse = ok & (z >= 0) & (z < k)
                m = np.where(better, m + ADAPT_FAST * (x - m), m)
                m = np.where(inside_worse, m + ADAPT_SLOW * (x - m), m)
    else:
        raise ValueError(mode)
    Z[~valid] = np.nan
    info = {"population_sd": dict(zip(keys, pop_sd.tolist())),
            "spread_floor": dict(zip(keys, floor.tolist())),
            "share_students_at_floor": dict(zip(keys, (sd.to_numpy() < floor[None, :]).mean(axis=0).tolist()))}
    return Z, info


def run_lengths(b: np.ndarray, sid: np.ndarray) -> np.ndarray:
    """Length of the current run of True values, per column, within student."""
    b = np.asarray(b, dtype=np.int64)
    if b.ndim == 1:
        b = b[:, None]
    new_group = np.r_[True, sid[1:] != sid[:-1]]
    out = np.zeros_like(b)
    for j in range(b.shape[1]):
        x = b[:, j]
        c = np.cumsum(x)
        reset = (x == 0) | new_group
        basev = pd.Series(np.where(reset, c - x, np.nan)).ffill().to_numpy()
        out[:, j] = c - basev.astype(np.int64)
    return out


def steady_rule(wk: pd.DataFrame, Z: np.ndarray, k: float = K_DEFAULT,
                persist: int = PERSIST_WEEKS, min_signals: int = MIN_SIGNALS) -> dict:
    """Signal out: z >= k. Counts: out for `persist` consecutive monitored weeks.
    Ask: >= `min_signals` signals count. A week without enough data is not out,
    so it breaks every run."""
    mon = wk["monitored"].to_numpy()
    with np.errstate(invalid="ignore"):
        out = (Z >= k) & mon[:, None]
    run = run_lengths(out, wk["sid"].to_numpy())
    counts = run >= persist
    n_count = counts.sum(axis=1)
    ask = (n_count >= min_signals) & mon
    return {"out": out, "run": run, "counts": counts, "n_count": n_count, "ask": ask,
            "n_out": out.sum(axis=1)}


# ---------------------------------------------------------------------------
# 3. Episodes, scoring, calendar and random baselines
# ---------------------------------------------------------------------------

def positive_episodes(wk: pd.DataFrame, min_len: int = 2) -> np.ndarray:
    """Episode id per week, -1 if none. An episode is a run of >= 2 consecutive
    calendar weeks whose labels are positive, after the learning weeks. A week
    without a label ends the run."""
    sid = wk["sid"].to_numpy()
    pos = (wk["label"].to_numpy() == 1) & wk["post_baseline"].to_numpy()
    run = run_lengths(pos, sid)[:, 0]
    start = pos & (run == 1)
    eid = np.cumsum(start) - 1
    eid = np.where(pos, eid, -1)
    if (eid >= 0).any():
        lengths = np.bincount(eid[eid >= 0])
        keep = lengths >= min_len
        eid = np.where((eid >= 0) & keep[np.clip(eid, 0, None)], eid, -1)
    return eid


def _student_mask(wk: pd.DataFrame, sids) -> np.ndarray:
    if sids is None:
        return np.ones(len(wk), dtype=bool)
    return wk["sid"].isin(np.asarray(sids)).to_numpy()


def evaluate_asks(wk: pd.DataFrame, ask: np.ndarray, eid: np.ndarray, sids=None,
                  two_week: bool = False) -> dict:
    """Score a set of asks (or heads-ups) on monitored weeks.

    two_week=False: an ask is scored if its week has a label, and is a hit if
    that label is positive.
    two_week=True: scored if week t or t+1 has a label, hit if either is positive.
    """
    m = wk["monitored"].to_numpy() & _student_mask(wk, sids)
    a = np.asarray(ask, dtype=bool) & m
    if two_week:
        scored_w = wk["scored2"].to_numpy()
        pos_w = wk["pos2"].to_numpy()
    else:
        scored_w = wk["label"].notna().to_numpy()
        pos_w = wk["label"].to_numpy() == 1
    years = m.sum() / WEEKS_PER_YEAR
    n_asks = int(a.sum())
    scored = int((a & scored_w).sum())
    hits = int((a & pos_w & scored_w).sum())
    base_scored = int((m & scored_w).sum())
    base_pos = int((m & pos_w & scored_w).sum())
    base_rate = base_pos / base_scored if base_scored else float("nan")
    hit_rate = hits / scored if scored else float("nan")
    reachable = np.unique(eid[m & (eid >= 0)])
    reached = np.unique(eid[a & (eid >= 0)])
    pos_weeks = m & (wk["label"].to_numpy() == 1)
    asked_pos = int((a & pos_weeks).sum())
    return {
        "asks": n_asks,
        "student_years": float(years),
        "asks_per_student_year": float(n_asks / years) if years else float("nan"),
        "scored_asks": scored,
        "share_asks_scored": float(scored / n_asks) if n_asks else float("nan"),
        "hits": hits,
        "hit_rate": float(hit_rate),
        "base_rate": float(base_rate),
        "lift": float(hit_rate / base_rate) if base_rate else float("nan"),
        "false_alarms": scored - hits,
        "false_alarms_per_student_year": float((scored - hits) / years) if years else float("nan"),
        "positive_weeks": int(pos_weeks.sum()),
        "positive_weeks_asked": asked_pos,
        "positive_weeks_missed": int(pos_weeks.sum()) - asked_pos,
        "share_positive_weeks_asked": float(asked_pos / pos_weeks.sum()) if pos_weeks.sum() else float("nan"),
        "episodes": int(len(reachable)),
        "episodes_reached": int(len(reached)),
        "episodes_missed": int(len(reachable) - len(reached)),
        "share_episodes_reached": float(len(reached) / len(reachable)) if len(reachable) else float("nan"),
    }


def _monitored_index(wk: pd.DataFrame, m: np.ndarray) -> np.ndarray:
    """0-based position of each monitored week within its student's monitored weeks."""
    idx = np.full(len(wk), -1, dtype=np.int64)
    sub = wk.loc[m, "sid"]
    idx[m] = sub.groupby(sub).cumcount().to_numpy()
    return idx


def calendar_mask(wk: pd.DataFrame, rate: float, phase: float, sids=None) -> np.ndarray:
    """Fixed calendar: ask on monitored week i when floor(i*rate + phase) steps up.
    Each student gets close to rate x (their monitored weeks) asks, evenly spaced."""
    m = wk["monitored"].to_numpy() & _student_mask(wk, sids)
    i = _monitored_index(wk, m).astype(float)
    hit = np.floor((i + 1) * rate + phase) > np.floor(i * rate + phase)
    return m & hit


def calendar_eval(wk: pd.DataFrame, rate: float, eid: np.ndarray, sids=None,
                  two_week: bool = False, n_phases: int = N_PHASES) -> dict:
    runs = [evaluate_asks(wk, calendar_mask(wk, rate, p / n_phases, sids), eid, sids, two_week)
            for p in range(n_phases)]
    keys = ["asks", "asks_per_student_year", "scored_asks", "hits", "hit_rate", "lift",
            "false_alarms", "false_alarms_per_student_year", "positive_weeks_asked",
            "positive_weeks_missed", "share_positive_weeks_asked", "episodes_reached",
            "episodes_missed", "share_episodes_reached"]
    out = {k: float(np.mean([r[k] for r in runs])) for k in keys}
    out["hit_rate_range_over_start_weeks"] = [float(min(r["hit_rate"] for r in runs)),
                                              float(max(r["hit_rate"] for r in runs))]
    out["episodes"] = runs[0]["episodes"]
    out["base_rate"] = runs[0]["base_rate"]
    out["n_start_offsets"] = n_phases
    return out


def random_eval(wk: pd.DataFrame, eid: np.ndarray, n_asks: int | None = None,
                per_student: np.ndarray | None = None, sids=None, two_week: bool = False,
                n_draws: int = N_RANDOM, seed: int = SEED, reference: float | None = None,
                strata: np.ndarray | None = None) -> dict:
    """Random monitored weeks. Either n_asks drawn from the whole pool, or
    per_student[g] asks inside each group g (same count per group as a method).
    Groups are students unless `strata` (a group id per week) is given."""
    rng = np.random.default_rng(seed)
    m = wk["monitored"].to_numpy() & _student_mask(wk, sids)
    pool = np.flatnonzero(m)
    if two_week:
        scored_w = wk["scored2"].to_numpy()[pool]
        pos_w = (wk["pos2"].to_numpy() & wk["scored2"].to_numpy())[pool]
    else:
        scored_w = wk["label"].notna().to_numpy()[pool]
        pos_w = (wk["label"].to_numpy() == 1)[pool]
    e = eid[pool]
    reachable = np.unique(e[e >= 0]).size
    hr, er = np.empty(n_draws), np.empty(n_draws)
    if per_student is not None:
        groups = wk["sid"].to_numpy() if strata is None else strata
        psid = groups[pool]
        quota = per_student[psid]
        for d in range(n_draws):
            order = np.lexsort((rng.random(pool.size), psid))
            s_sorted = psid[order]
            starts = np.r_[0, np.flatnonzero(s_sorted[1:] != s_sorted[:-1]) + 1]
            grp_start = np.repeat(starts, np.diff(np.r_[starts, s_sorted.size]))
            rank = np.arange(s_sorted.size) - grp_start
            chosen = order[rank < quota[order]]
            sc = scored_w[chosen].sum()
            hr[d] = pos_w[chosen].sum() / sc if sc else np.nan
            ec = e[chosen]
            er[d] = np.unique(ec[ec >= 0]).size / reachable if reachable else np.nan
    else:
        for d in range(n_draws):
            chosen = rng.choice(pool.size, size=n_asks, replace=False)
            sc = scored_w[chosen].sum()
            hr[d] = pos_w[chosen].sum() / sc if sc else np.nan
            ec = e[chosen]
            er[d] = np.unique(ec[ec >= 0]).size / reachable if reachable else np.nan
    return {
        "draws": n_draws,
        "hit_rate": float(np.nanmean(hr)),
        "ci": [float(np.nanpercentile(hr, 2.5)), float(np.nanpercentile(hr, 97.5))],
        "share_episodes_reached": float(np.nanmean(er)),
        "episodes_ci": [float(np.nanpercentile(er, 2.5)), float(np.nanpercentile(er, 97.5))],
        "share_draws_at_or_above_method": (float(np.nanmean(hr >= reference))
                                           if reference is not None else None),
    }


def _per_student_sums(wk: pd.DataFrame, ask: np.ndarray, sids_all: np.ndarray,
                      two_week: bool = False) -> tuple[np.ndarray, np.ndarray]:
    m = wk["monitored"].to_numpy()
    a = np.asarray(ask, dtype=bool) & m
    if two_week:
        scored_w = wk["scored2"].to_numpy()
        pos_w = wk["pos2"].to_numpy() & scored_w
    else:
        scored_w = wk["label"].notna().to_numpy()
        pos_w = wk["label"].to_numpy() == 1
    sid = wk["sid"].to_numpy()
    n = int(sid.max()) + 1
    hits = np.bincount(sid[a & pos_w], minlength=n)[sids_all]
    scored = np.bincount(sid[a & scored_w], minlength=n)[sids_all]
    return hits.astype(float), scored.astype(float)


def bootstrap_difference(wk: pd.DataFrame, ask_a: np.ndarray, rate_b: float, sids,
                         two_week: bool = False, n_boot: int = N_BOOT, seed: int = SEED,
                         ask_b_list: list[np.ndarray] | None = None) -> dict:
    """Hit rate of method A minus the fixed calendar at rate_b (averaged over
    start offsets), with a 95% interval from resampling students."""
    sids = np.asarray(sorted(sids))
    ha, sa = _per_student_sums(wk, ask_a, sids, two_week)
    if ask_b_list is None:
        ask_b_list = [calendar_mask(wk, rate_b, p / N_PHASES, sids) for p in range(N_PHASES)]
    hb = np.zeros(len(sids))
    sb = np.zeros(len(sids))
    for ab in ask_b_list:
        h, s = _per_student_sums(wk, ab, sids, two_week)
        hb += h / len(ask_b_list)
        sb += s / len(ask_b_list)
    rng = np.random.default_rng(seed)
    diffs = np.empty(n_boot)
    for b in range(n_boot):
        i = rng.integers(0, len(sids), len(sids))
        diffs[b] = ha[i].sum() / sa[i].sum() - hb[i].sum() / sb[i].sum()
    point = ha.sum() / sa.sum() - hb.sum() / sb.sum()
    return {"difference": float(point),
            "ci": [float(np.percentile(diffs, 2.5)), float(np.percentile(diffs, 97.5))]}


def ask_comparison(wk: pd.DataFrame, ask: np.ndarray, eid: np.ndarray, sids=None,
                   seed: int = SEED, two_week: bool = False) -> dict:
    """The method, a fixed calendar and random weeks, all at the method's budget."""
    method = evaluate_asks(wk, ask, eid, sids, two_week)
    m = wk["monitored"].to_numpy() & _student_mask(wk, sids)
    rate = method["asks"] / m.sum()
    cal = calendar_eval(wk, rate, eid, sids, two_week)
    rnd = random_eval(wk, eid, n_asks=method["asks"], sids=sids, two_week=two_week, seed=seed,
                      reference=method["hit_rate"])
    sid = wk["sid"].to_numpy()
    per_student = np.bincount(sid[np.asarray(ask, bool) & m], minlength=int(sid.max()) + 1)
    rnd_ps = random_eval(wk, eid, per_student=per_student, sids=sids, two_week=two_week,
                         seed=seed + 1, reference=method["hit_rate"])
    strata = student_quarter(wk)
    per_stratum = np.bincount(strata[np.asarray(ask, bool) & m], minlength=int(strata.max()) + 1)
    rnd_sq = random_eval(wk, eid, per_student=per_stratum, sids=sids, two_week=two_week,
                         seed=seed + 3, reference=method["hit_rate"], strata=strata)
    use_sids = np.unique(sid[m])
    diff = bootstrap_difference(wk, ask, rate, use_sids, two_week, seed=seed + 2)
    return {"budget_asks_per_student_year": method["asks_per_student_year"],
            "asks_per_student_week": float(rate),
            "method": method, "fixed_calendar": cal, "random": rnd,
            "random_same_students": rnd_ps, "random_same_student_and_quarter": rnd_sq,
            "strata_check": strata_check(wk, ask, sids, two_week),
            "method_minus_calendar": diff}


def strata_check(wk: pd.DataFrame, ask: np.ndarray, sids=None, two_week: bool = False) -> dict:
    """In a student-quarter where the method asked in every monitored week, a
    random draw with the same count has no choice. This drops those quarters and
    compares the method's hit rate with what chance gives in the quarters left."""
    st = student_quarter(wk)
    m = wk["monitored"].to_numpy() & _student_mask(wk, sids)
    a = np.asarray(ask, bool) & m
    if two_week:
        scored_w, pos_w = wk["scored2"].to_numpy(), wk["pos2"].to_numpy()
    else:
        scored_w, pos_w = wk["label"].notna().to_numpy(), wk["label"].to_numpy() == 1
    n = int(st.max()) + 1
    n_ask = np.bincount(st[a], minlength=n)
    n_mon = np.bincount(st[m], minlength=n)
    full = (n_ask == n_mon) & (n_ask > 0)
    keep = a & ~full[st] & scored_w
    pos = np.bincount(st[m & scored_w & pos_w], minlength=n)
    lab = np.bincount(st[m & scored_w], minlength=n)
    chance = pos / np.maximum(lab, 1)
    return {"share_asks_in_full_quarters": float((a & full[st]).sum() / a.sum()) if a.sum() else float("nan"),
            "hit_rate_outside_full_quarters": float(pos_w[keep].mean()) if keep.sum() else float("nan"),
            "chance_outside_full_quarters": float(chance[st[keep]].mean()) if keep.sum() else float("nan")}


def student_quarter(wk: pd.DataFrame) -> np.ndarray:
    """A group id for each student and calendar quarter (Jan-Mar, Apr-Jun, ...)."""
    q = wk["monday"].dt.year.to_numpy() * 4 + (wk["monday"].dt.month.to_numpy() - 1) // 3
    return pd.factorize(pd.Series(wk["sid"].to_numpy()) * 100000 + q)[0]


# ---------------------------------------------------------------------------
# 4. Logistic regression
# ---------------------------------------------------------------------------

def logistic_features(wk: pd.DataFrame, Z: np.ndarray, signals: list[dict],
                      k: float = K_DEFAULT) -> pd.DataFrame:
    keys = [s["key"] for s in signals]
    Zc = np.clip(np.nan_to_num(Z, nan=0.0), -Z_CLIP, Z_CLIP)
    zdf = pd.DataFrame(Zc, columns=keys)
    prev = zdf.groupby(wk["sid"].to_numpy()).shift(1).fillna(0.0)
    X = pd.DataFrame(index=wk.index)
    for key in keys:
        X[f"z_{key}"] = zdf[key].to_numpy()
    for key in keys:
        X[f"z_{key}_last_week"] = prev[key].to_numpy()
    with np.errstate(invalid="ignore"):
        X["signals_out"] = (Z >= k).sum(axis=1).astype(float)
    return X


def student_splits(wk: pd.DataFrame, n_splits: int = N_SPLITS, seed: int = SEED) -> list[dict]:
    students = np.unique(wk.loc[wk["monitored"], "sid"])
    splits = []
    for s in range(n_splits):
        rng = np.random.default_rng(seed + 100 * s)
        perm = rng.permutation(students)
        half = len(perm) // 2
        splits.append({"seed": seed + 100 * s, "train": np.sort(perm[:half]), "test": np.sort(perm[half:])})
    return splits


def _boot_auc(y: np.ndarray, p: np.ndarray, groups: np.ndarray, n_boot: int, seed: int) -> list[float]:
    rng = np.random.default_rng(seed)
    idx_by = pd.Series(np.arange(len(y))).groupby(groups).indices
    keys = np.array(list(idx_by.keys()))
    lists = [idx_by[k] for k in keys]
    aucs = []
    for _ in range(n_boot):
        pick = rng.integers(0, len(keys), len(keys))
        ii = np.concatenate([lists[j] for j in pick])
        yy = y[ii]
        if yy.min() == yy.max():
            continue
        aucs.append(roc_auc_score(yy, p[ii]))
    return [float(np.percentile(aucs, 2.5)), float(np.percentile(aucs, 97.5))]


def within_student_auc(y: np.ndarray, score: np.ndarray, groups: np.ndarray) -> float:
    """AUC that only compares weeks of the same student: per-student AUCs
    weighted by each student's number of positive-negative pairs."""
    num, den = 0.0, 0.0
    for g, idx in pd.Series(np.arange(len(y))).groupby(groups).indices.items():
        yy = y[idx]
        npos = int(yy.sum())
        nneg = len(yy) - npos
        if npos == 0 or nneg == 0:
            continue
        num += roc_auc_score(yy, score[idx]) * npos * nneg
        den += npos * nneg
    return float(num / den) if den else float("nan")


def logistic_split(wk: pd.DataFrame, X: pd.DataFrame, rule: dict, eid: np.ndarray,
                   split: dict, n_boot: int = N_BOOT, compare: bool = True) -> dict:
    mon = wk["monitored"].to_numpy()
    lab = wk["label"].to_numpy()
    has = ~np.isnan(lab)
    tr = mon & has & _student_mask(wk, split["train"])
    te_all = mon & _student_mask(wk, split["test"])
    te = te_all & has
    model = LogisticRegression(C=1.0, max_iter=2000)
    model.fit(X.values[tr], lab[tr].astype(int))
    p = model.predict_proba(X.values)[:, 1]
    y_te = lab[te].astype(int)
    sid = wk["sid"].to_numpy()
    out = {
        "seed": split["seed"],
        "train_students": int(len(split["train"])),
        "test_students": int(len(split["test"])),
        "train_weeks": int(tr.sum()),
        "test_weeks": int(te.sum()),
        "train_auc": float(roc_auc_score(lab[tr].astype(int), p[tr])),
        "test_auc": float(roc_auc_score(y_te, p[te])),
        "test_auc_ci": _boot_auc(y_te, p[te], sid[te], n_boot, split["seed"] + 7),
        "test_auc_signals_out": float(roc_auc_score(y_te, X["signals_out"].values[te])),
        "test_auc_rule_count": float(roc_auc_score(y_te, rule["n_count"][te])),
        "test_within_student_auc": within_student_auc(y_te, p[te], sid[te]),
        "test_within_student_auc_signals_out": within_student_auc(y_te, X["signals_out"].values[te], sid[te]),
        "test_within_student_auc_rule_count": within_student_auc(y_te, rule["n_count"][te].astype(float), sid[te]),
        "intercept": float(model.intercept_[0]),
        "coef": dict(zip(X.columns, model.coef_[0].astype(float).tolist())),
    }
    # Same ask budget as the drift rule on these test students: the top-B
    # monitored test weeks by predicted probability (labels are not used to pick).
    rule_test = evaluate_asks(wk, rule["ask"], eid, split["test"])
    B = rule_test["asks"]
    cand = np.flatnonzero(te_all)
    top = cand[np.argsort(-p[cand], kind="stable")[:B]]
    ask_lr = np.zeros(len(wk), dtype=bool)
    ask_lr[top] = True
    lr_eval = evaluate_asks(wk, ask_lr, eid, split["test"])
    out["test_budget_asks_per_student_year"] = rule_test["asks_per_student_year"]
    out["logistic_at_budget"] = lr_eval
    out["rule_on_test"] = rule_test
    if compare:
        rate = B / te_all.sum()
        out["calendar_on_test"] = calendar_eval(wk, rate, eid, split["test"])
        out["random_on_test"] = random_eval(wk, eid, n_asks=B, sids=split["test"], seed=split["seed"] + 11)
        out["logistic_minus_calendar"] = bootstrap_difference(
            wk, ask_lr, rate, split["test"], seed=split["seed"] + 13)
        out["rule_minus_calendar"] = bootstrap_difference(
            wk, rule["ask"], rate, split["test"], seed=split["seed"] + 17)
    out["_ask_mask"] = ask_lr
    out["_proba"] = p
    return out


def week_split_contrast(wk: pd.DataFrame, X: pd.DataFrame, seed: int = SEED) -> dict:
    """For contrast only: split WEEKS at random instead of students. The same
    students then sit on both sides, which is the mistake a student split avoids."""
    mon = wk["monitored"].to_numpy()
    lab = wk["label"].to_numpy()
    rows = np.flatnonzero(mon & ~np.isnan(lab))
    rng = np.random.default_rng(seed + 900)
    perm = rng.permutation(rows)
    tr, te = perm[: len(perm) // 2], perm[len(perm) // 2:]
    model = LogisticRegression(C=1.0, max_iter=2000).fit(X.values[tr], lab[tr].astype(int))
    return {"test_auc": float(roc_auc_score(lab[te].astype(int), model.predict_proba(X.values[te])[:, 1]))}


def by_year(wk: pd.DataFrame, ask: np.ndarray) -> list[dict]:
    """Ask rate and hit rate by year since the student's first monitored week."""
    mon = wk["monitored"].to_numpy()
    first = wk.loc[mon].groupby("sid")["week_idx"].min()
    yrs = ((wk["week_idx"] - wk["sid"].map(first)) // 52).to_numpy()
    lab = wk["label"].to_numpy()
    a = np.asarray(ask, bool)
    rows = []
    for y in range(0, 5):
        m = mon & (yrs == y)
        if m.sum() < 100:
            continue
        sc = m & a & ~np.isnan(lab)
        rows.append({"year": int(y + 1), "monitored_weeks": int(m.sum()),
                     "students": int(wk.loc[m, "sid"].nunique()),
                     "share_weeks_with_ask": float((m & a).sum() / m.sum()),
                     "asks_per_student_year": float((m & a).sum() / m.sum() * WEEKS_PER_YEAR),
                     "hit_rate": float((lab[sc] == 1).mean()) if sc.sum() else float("nan"),
                     "base_rate": float((lab[m & ~np.isnan(lab)] == 1).mean())})
    return rows


# ---------------------------------------------------------------------------
# 5. Parent heads-up (phone signals only, every question skipped)
# ---------------------------------------------------------------------------

def heads_up_mask(wk: pd.DataFrame, run: np.ndarray, W: int, C: int) -> np.ndarray:
    """A heads-up fires when two signals have each been out for W consecutive
    weeks, which is W weeks after the second of them left its range. After a
    heads-up in week t, weeks t+1..t+C are a cooldown: evidence is held and
    checked again from week t+C+1, when the rule fires if it still holds."""
    if run.shape[1] < 2:
        return np.zeros(len(wk), dtype=bool)
    second = np.sort(run, axis=1)[:, -2]
    cond = (second >= W) & wk["monitored"].to_numpy()
    alerts = np.zeros(len(wk), dtype=bool)
    cand = np.flatnonzero(cond)
    sid = wk["sid"].to_numpy()
    widx = wk["week_idx"].to_numpy()
    last_sid, last_week = -1, -10**9
    for i in cand:
        if sid[i] != last_sid:
            last_sid, last_week = sid[i], -10**9
        if widx[i] > last_week + C:
            alerts[i] = True
            last_week = widx[i]
    return alerts


def heads_up_grid(wk: pd.DataFrame, run: np.ndarray, eid: np.ndarray, sids) -> list[dict]:
    rows = []
    for W in W_GRID:
        for C in C_GRID:
            ev = evaluate_asks(wk, heads_up_mask(wk, run, W, C), eid, sids, two_week=True)
            rows.append({"weeks_out": W, "cooldown_weeks": C,
                         "alerts_per_student_year": ev["asks_per_student_year"],
                         "hit_rate": ev["hit_rate"], "scored_alerts": ev["scored_asks"],
                         "alerts": ev["asks"], "share_episodes_reached": ev["share_episodes_reached"],
                         "base_rate": ev["base_rate"]})
    return rows


def choose_heads_up(grid: list[dict]) -> dict:
    """Best hit rate among settings with <= MAX_ALERTS_PER_YEAR alerts per
    student-year; ties go to fewer alerts."""
    ok = [g for g in grid if g["alerts_per_student_year"] <= MAX_ALERTS_PER_YEAR and g["scored_alerts"] > 0]
    if not ok:
        ok = sorted(grid, key=lambda g: g["alerts_per_student_year"])[:1]
    return sorted(ok, key=lambda g: (-g["hit_rate"], g["alerts_per_student_year"]))[0]


def heads_up_experiment(wk: pd.DataFrame, rule: dict, eid: np.ndarray, splits: list[dict]) -> dict:
    res = {"splits": []}
    for j, sp in enumerate(splits):
        grid = heads_up_grid(wk, rule["run"], eid, sp["train"])
        best = choose_heads_up(grid)
        mask = heads_up_mask(wk, rule["run"], best["weeks_out"], best["cooldown_weeks"])
        comp = ask_comparison(wk, mask, eid, sp["test"], seed=sp["seed"] + 21, two_week=True)
        entry = {"seed": sp["seed"], "chosen": {"weeks_out": best["weeks_out"],
                                               "cooldown_weeks": best["cooldown_weeks"]},
                 "train_choice": best, "test": comp}
        if j == 0:
            entry["train_grid"] = grid
            entry["test_grid"] = heads_up_grid(wk, rule["run"], eid, sp["test"])
            # The doc's starting guess, four weeks and at most one every three weeks.
            m0 = heads_up_mask(wk, rule["run"], 4, 2)
            entry["doc_default_W4_C2_on_test"] = ask_comparison(wk, m0, eid, sp["test"],
                                                                seed=sp["seed"] + 23, two_week=True)
        res["splits"].append(entry)
    res["primary"] = res["splits"][0]
    return res


# ---------------------------------------------------------------------------
# 6. Check at the door
# ---------------------------------------------------------------------------

def door_check(wk: pd.DataFrame, ask: np.ndarray, first_weeks: int = DOOR_FIRST_WEEKS) -> dict:
    """Students whose PHQ-2 was >= 3 in a learning week: how many get no ask
    in their first 12 valid weeks (learning weeks 1-4, monitored weeks 5-12)?"""
    df = pd.DataFrame({"sid": wk["sid"], "rank": wk["valid_rank"], "label": wk["label"],
                       "phq2": wk["phq2"], "ask": np.asarray(ask, bool)})
    df = df[df["rank"] >= 0]
    n_valid = df.groupby("sid")["rank"].max() + 1
    eligible = n_valid[n_valid >= first_weeks].index
    df = df[df["sid"].isin(eligible)]
    learn = df[df["rank"] < BASELINE_WEEKS]
    early = df[(df["rank"] >= BASELINE_WEEKS) & (df["rank"] < first_weeks)]
    any_high = learn.groupby("sid")["label"].max().fillna(0) == 1
    mean_high = learn.groupby("sid")["phq2"].mean() >= PHQ2_CUTOFF
    flagged = early.groupby("sid")["ask"].any().reindex(eligible, fill_value=False)
    high_later = (early.groupby("sid")["label"].max().fillna(0) == 1).reindex(eligible, fill_value=False)
    any_high = any_high.reindex(eligible, fill_value=False)
    mean_high = mean_high.reindex(eligible, fill_value=False)

    def block(mask: pd.Series) -> dict:
        n = int(mask.sum())
        missed = int((mask & ~flagged).sum())
        return {"students": n, "missed_by_drift_rule": missed,
                "share_missed": float(missed / n) if n else float("nan"),
                "still_high_in_weeks_5_to_12": int((mask & high_later).sum()),
                "missed_and_still_high_in_weeks_5_to_12": int((mask & ~flagged & high_later).sum())}

    others = ~any_high
    return {"students_with_12_valid_weeks": int(len(eligible)),
            "any_high_learning_week": block(any_high),
            "mean_high_over_learning_weeks": block(mean_high),
            "comparison_not_high_at_start": block(others)}


# ---------------------------------------------------------------------------
# 7. Single-signal and platform checks
# ---------------------------------------------------------------------------

def signal_auc(wk: pd.DataFrame, Z: np.ndarray, signals: list[dict]) -> dict:
    mon = wk["monitored"].to_numpy()
    lab = wk["label"].to_numpy()
    out = {}
    for j, s in enumerate(signals):
        ok = mon & ~np.isnan(lab) & ~np.isnan(Z[:, j])
        y = lab[ok].astype(int)
        if ok.sum() < 50 or y.min() == y.max():
            continue
        with np.errstate(invalid="ignore"):
            share_out = float(np.mean(Z[ok, j] >= K_DEFAULT))
        out[s["key"]] = {"auc": float(roc_auc_score(y, Z[ok, j])), "weeks": int(ok.sum()),
                         "share_weeks_out": share_out}
    return out


def platform_secondary(wk: pd.DataFrame, eid: np.ndarray) -> dict:
    res = {}
    for name, is_ios, extra in [("ios", 1, IOS_SIGNALS), ("android", 0, ANDROID_SIGNALS)]:
        sids = np.unique(wk.loc[wk["monitored"] & (wk["is_ios"] == is_ios), "sid"])
        r = {"students": int(len(sids))}
        for tag, sigs in [("core_signals", CORE_SIGNALS), ("core_plus_platform", CORE_SIGNALS + extra)]:
            Z, _ = personal_z(wk, sigs)
            rule = steady_rule(wk, Z)
            comp = ask_comparison(wk, rule["ask"], eid, sids, seed=SEED + 31 + is_ios)
            r[tag] = _compact(comp)
        Zx, _ = personal_z(wk, extra)
        r["single_signal_auc"] = signal_auc(wk.assign(monitored=wk["monitored"] & wk["sid"].isin(sids)),
                                            Zx, extra)
        res[name] = r
    return res


def _compact(comp: dict) -> dict:
    m, c, r = comp["method"], comp["fixed_calendar"], comp["random"]
    return {"budget_asks_per_student_year": comp["budget_asks_per_student_year"],
            "hit_rate": m["hit_rate"], "scored_asks": m["scored_asks"],
            "episodes_reached": m["share_episodes_reached"],
            "calendar_hit_rate": c["hit_rate"], "calendar_episodes_reached": c["share_episodes_reached"],
            "random_hit_rate": r["hit_rate"], "random_ci": r["ci"],
            "random_same_students_hit_rate": comp["random_same_students"]["hit_rate"],
            "random_same_students_ci": comp["random_same_students"]["ci"],
            "random_same_student_and_quarter_hit_rate": comp["random_same_student_and_quarter"]["hit_rate"],
            "random_same_student_and_quarter_ci": comp["random_same_student_and_quarter"]["ci"],
            "method_minus_calendar": comp["method_minus_calendar"],
            "base_rate": m["base_rate"]}


# ---------------------------------------------------------------------------
# 8. Run everything
# ---------------------------------------------------------------------------

def run_all(refresh: bool = False, write: bool = True, verbose: bool = True) -> dict:
    t0 = time.time()
    _log("Building weekly table...", verbose)
    wk = build_weekly(refresh, verbose)
    summary = data_summary(wk)
    eid = positive_episodes(wk)
    _log(f"  {summary['students_analysed']} students, {summary['monitored_student_weeks']:,} monitored weeks, "
         f"{summary['student_weeks_with_label']:,} labelled, base rate {summary['base_rate']:.3f}", verbose)

    _log("Stability rule and matched-budget baselines...", verbose)
    Z, zinfo = personal_z(wk, CORE_SIGNALS)
    by_k = {}
    rules = {}
    for k in K_VALUES:
        rules[k] = steady_rule(wk, Z, k)
        by_k[str(k)] = ask_comparison(wk, rules[k]["ask"], eid, seed=SEED + int(k * 100))
        _log(f"  k={k}: {by_k[str(k)]['budget_asks_per_student_year']:.2f} asks/yr, "
             f"hit {by_k[str(k)]['method']['hit_rate']:.3f} vs calendar "
             f"{by_k[str(k)]['fixed_calendar']['hit_rate']:.3f}", verbose)
    rule = rules[K_DEFAULT]

    _log("Adaptive range variant...", verbose)
    Za, _ = personal_z(wk, CORE_SIGNALS, mode="adaptive")
    rule_a = steady_rule(wk, Za, K_DEFAULT)
    adaptive = ask_comparison(wk, rule_a["ask"], eid, seed=SEED + 501)

    _log("Logistic regression over student splits...", verbose)
    X = logistic_features(wk, Z, CORE_SIGNALS)
    splits = student_splits(wk)
    lr_runs = [logistic_split(wk, X, rule, eid, sp) for sp in splits]
    lr_public = [{k: v for k, v in r.items() if not k.startswith("_")} for r in lr_runs]
    aucs = [r["test_auc"] for r in lr_runs]
    lr_hits = [r["logistic_at_budget"]["hit_rate"] for r in lr_runs]
    rule_hits = [r["rule_on_test"]["hit_rate"] for r in lr_runs]
    cal_hits = [r["calendar_on_test"]["hit_rate"] for r in lr_runs]
    logistic = {"features": list(X.columns), "splits": lr_public,
                "spread": {"test_auc_mean": float(np.mean(aucs)), "test_auc_min": float(np.min(aucs)),
                           "test_auc_max": float(np.max(aucs)),
                           "hit_rate_mean": float(np.mean(lr_hits)), "hit_rate_min": float(np.min(lr_hits)),
                           "hit_rate_max": float(np.max(lr_hits)),
                           "rule_hit_rate_mean": float(np.mean(rule_hits)),
                           "calendar_hit_rate_mean": float(np.mean(cal_hits)),
                           "calendar_hit_rate_min": float(np.min(cal_hits)),
                           "calendar_hit_rate_max": float(np.max(cal_hits)),
                           "within_student_auc_mean": float(np.mean([r["test_within_student_auc"] for r in lr_runs])),
                           "signals_out_auc_mean": float(np.mean([r["test_auc_signals_out"] for r in lr_runs])),
                           "signals_out_within_student_auc_mean": float(np.mean(
                               [r["test_within_student_auc_signals_out"] for r in lr_runs]))},
                "week_split_contrast": week_split_contrast(wk, X)}

    _log("Parent heads-up rule...", verbose)
    heads = heads_up_experiment(wk, rule, eid, splits)

    _log("Door check, single signals, platform checks...", verbose)
    door = door_check(wk, rule["ask"])
    door_adaptive = door_check(wk, rule_a["ask"])
    sig_auc = signal_auc(wk, Z, CORE_SIGNALS)
    platform = platform_secondary(wk, eid)

    results = {
        "generated": GENERATED,
        "dataset": "College Experience Study (Dartmouth), CC BY-NC-SA 4.0",
        "label": "PHQ-2 >= 3 (PHQ-4 items 3 and 4)",
        "settings": {
            "quality_min_hours": QUALITY_MIN_HOURS, "min_usable_days_per_week": MIN_DAYS_PER_WEEK,
            "baseline_weeks": BASELINE_WEEKS, "spread_floor_fraction_of_population_sd": FLOOR_FRACTION,
            "k_default": K_DEFAULT, "k_values": K_VALUES, "persist_weeks": PERSIST_WEEKS,
            "min_signals": MIN_SIGNALS, "phq2_cutoff": PHQ2_CUTOFF, "label_window_days": LABEL_WINDOW_DAYS,
            "adaptive_fast": ADAPT_FAST, "adaptive_slow": ADAPT_SLOW, "seed": SEED,
            "random_draws": N_RANDOM, "bootstrap_draws": N_BOOT, "student_splits": N_SPLITS,
            "calendar_start_offsets": N_PHASES, "heads_up_W_grid": W_GRID, "heads_up_C_grid": C_GRID,
            "heads_up_max_alerts_per_student_year": MAX_ALERTS_PER_YEAR, "weeks_per_student_year": WEEKS_PER_YEAR,
        },
        "data": summary,
        "signals": [{k: s[k] for k in ("key", "label", "feature", "worse", "note")} for s in CORE_SIGNALS],
        "personal_range": zinfo,
        "single_signal_auc": sig_auc,
        "ask_comparison_by_k": by_k,
        "rule_by_year_k1": by_year(wk, rule["ask"]),
        "adaptive_range_k1": adaptive,
        "logistic": logistic,
        "heads_up": {k: v for k, v in heads.items() if k != "primary"},
        "door_check": door,
        "door_check_adaptive_range": door_adaptive,
        "platform_secondary": platform,
        "runtime_seconds": None,
    }
    results["runtime_seconds"] = float(time.time() - t0)
    if write:
        write_outputs(results)
    _log(f"Done in {time.time() - t0:.0f}s", verbose)
    return results


# ---------------------------------------------------------------------------
# 9. Writing outputs
# ---------------------------------------------------------------------------

def _py(o):
    if isinstance(o, dict):
        return {str(k): _py(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_py(v) for v in o]
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating, float)):
        f = float(o)
        return None if np.isnan(f) else round(f, 6)
    if isinstance(o, np.ndarray):
        return _py(o.tolist())
    if isinstance(o, (np.bool_,)):
        return bool(o)
    return o


def _pct(x: float, nd: int = 1) -> str:
    return f"{100 * x:.{nd}f}%"


def _r(x: float, nd: int = 3) -> float:
    return round(float(x), nd)


def headline_numbers(results: dict) -> dict:
    """The handful of numbers quoted in the headline, JSON summary and write-up."""
    main = results["ask_comparison_by_k"][str(K_DEFAULT)]
    lr0 = results["logistic"]["splits"][0]
    hu = results["heads_up"]["splits"][0]
    return {"main": main, "lr0": lr0, "hu": hu, "door": results["door_check"]["any_high_learning_week"]}


def _verdict(diff: dict) -> str:
    lo, hi = diff["ci"]
    if lo > 0:
        return "better"
    if hi < 0:
        return "worse"
    return "same"


def _pp(x: float, nd: int = 1) -> str:
    """Percentage points with a sign."""
    return f"{100 * x:+.{nd}f} points"


def _ci(ci, nd: int = 1, pct: bool = True) -> str:
    if pct:
        return f"{100 * ci[0]:.{nd}f}% to {100 * ci[1]:.{nd}f}%"
    return f"{ci[0]:.{nd}f} to {ci[1]:.{nd}f}"


def _ci_pp(ci, nd: int = 1) -> str:
    """An interval of differences, in percentage points."""
    return f"{100 * ci[0]:.{nd}f} to {100 * ci[1]:.{nd}f} points"


def _explained_by_strata(comp: dict) -> bool:
    """True when random weeks from the same student and quarter match the method."""
    return comp["method"]["hit_rate"] <= comp["random_same_student_and_quarter"]["ci"][1]


def make_headline(results: dict) -> str:
    main = results["ask_comparison_by_k"][str(K_DEFAULT)]
    v = _verdict(main["method_minus_calendar"])
    budget = main["budget_asks_per_student_year"]
    hr = main["method"]["hit_rate"]
    cal = main["fixed_calendar"]["hit_rate"]
    sq = main["random_same_student_and_quarter"]["hit_rate"]
    if v == "better" and _explained_by_strata(main):
        return (f"At {budget:.0f} asks per student-year, {_pct(hr)} of the drift rule's asks landed on weeks with a "
                f"high mood score against {_pct(cal)} for a fixed calendar, but random weeks from the same student in "
                f"the same three months did as well ({_pct(sq)}), so the rule found harder stretches and did no better "
                f"than chance at picking the week.")
    if v == "better":
        return (f"At {budget:.0f} asks per student-year, {_pct(hr)} of the drift rule's asks landed on weeks with a "
                f"high mood score against {_pct(cal)} for a fixed calendar with the same number of asks.")
    if v == "worse":
        return (f"At {budget:.0f} asks per student-year, the drift rule did worse than a fixed calendar: "
                f"{_pct(hr)} of its asks landed on weeks with a high mood score, against {_pct(cal)}.")
    return (f"At {budget:.0f} asks per student-year, the drift rule did no better than a fixed calendar: "
            f"{_pct(hr)} of its asks landed on weeks with a high mood score, against {_pct(cal)}.")


def make_caveats(results: dict) -> list[str]:
    d = results["data"]
    yrs = {r["year"]: r for r in results["rule_by_year_k1"]}
    main = results["ask_comparison_by_k"][str(K_DEFAULT)]
    share_weeks = main["method"]["asks"] / d["monitored_student_weeks"]
    cav = [
        "Mood scores stand in for a note being right. They cannot show whether a note helped a family.",
        "The students are Dartmouth undergraduates followed from 2017 to 2022, through the pandemic. Stability is meant for high school students.",
        f"The label is two PHQ-4 items answered on the phone, counted as high at 3 or more. Only {_pct(d['share_monitored_weeks_labelled'], 0)} of monitored weeks have one.",
        "The phone signals are the study's own features. Stability would record different ones, and typing, tone and music were not available.",
    ]
    if 1 in yrs and 3 in yrs:
        cav.append(f"The personal range is learned in each student's first four valid weeks and then frozen, so it drifts: "
                   f"the rule asked in {_pct(yrs[1]['share_weeks_with_ask'], 0)} of weeks in year one and "
                   f"{_pct(yrs[3]['share_weeks_with_ask'], 0)} in year three.")
    cav += [
        f"At k = 1.0 the rule asks in {_pct(share_weeks, 0)} of monitored weeks, far more often than a real app should.",
        "The logistic regression and heads-up numbers come from the test half of one fixed split of students. The spread over five splits is in results.json.",
        "Nothing here shows that phone signals detect depression.",
    ]
    return cav


def app_summary(results: dict) -> dict:
    h = headline_numbers(results)
    main, lr0, hu = h["main"], h["lr0"], h["hu"]
    d = results["data"]
    chosen = hu["chosen"]
    test = hu["test"]
    return {
        "generated": GENERATED,
        "dataset": results["dataset"],
        "label": results["label"],
        "students": int(d["students_analysed"]),
        "student_weeks_with_label": int(d["student_weeks_with_label"]),
        "base_rate": _r(d["base_rate"], 4),
        "signals": [{k: s[k] for k in ("key", "label", "feature", "worse")} for s in CORE_SIGNALS],
        "ask_comparison": {
            "budget_asks_per_student_year": _r(main["budget_asks_per_student_year"], 2),
            "steady_rule": {"hit_rate": _r(main["method"]["hit_rate"], 4),
                            "episodes_reached": _r(main["method"]["share_episodes_reached"], 4)},
            "logistic": {"hit_rate": _r(lr0["logistic_at_budget"]["hit_rate"], 4),
                         "auc": _r(lr0["test_auc"], 4),
                         "auc_ci": [_r(x, 4) for x in lr0["test_auc_ci"]]},
            "fixed_calendar": {"hit_rate": _r(main["fixed_calendar"]["hit_rate"], 4),
                               "episodes_reached": _r(main["fixed_calendar"]["share_episodes_reached"], 4)},
            "random": {"hit_rate": _r(main["random"]["hit_rate"], 4),
                       "ci": [_r(x, 4) for x in main["random"]["ci"]]},
        },
        "heads_up": {
            "weeks_out": int(chosen["weeks_out"]),
            "cooldown_weeks": int(chosen["cooldown_weeks"]),
            "alerts_per_student_year": _r(test["method"]["asks_per_student_year"], 2),
            "hit_rate": _r(test["method"]["hit_rate"], 4),
            "calendar_hit_rate": _r(test["fixed_calendar"]["hit_rate"], 4),
        },
        "door_check": {"students_high_at_start": int(h["door"]["students"]),
                       "missed_by_drift_rule": int(h["door"]["missed_by_drift_rule"])},
        "logistic_weights": {"intercept": _r(lr0["intercept"], 4),
                             "coef": {k: _r(v, 4) for k, v in lr0["coef"].items()}},
        "headline": make_headline(results),
        "caveats": make_caveats(results),
    }


def write_outputs(results: dict) -> None:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    out = dict(results)
    out["headline"] = make_headline(results)
    out["caveats"] = make_caveats(results)
    (RESULTS_DIR / "results.json").write_text(json.dumps(_py(out), indent=2) + "\n")
    (RESULTS_DIR / "results.md").write_text(render_markdown(results))
    APP_JSON.parent.mkdir(parents=True, exist_ok=True)
    APP_JSON.write_text(json.dumps(_py(app_summary(results)), indent=2) + "\n")


def comparison_table(results: dict) -> pd.DataFrame:
    """Hit rate by method at matched budget (all students, k = 1.0), plus the
    logistic regression on the test half."""
    main = results["ask_comparison_by_k"][str(K_DEFAULT)]
    lr0 = results["logistic"]["splits"][0]
    rows = [
        ("Stability drift rule (all students)", main["method"]["asks_per_student_year"], main["method"]["hit_rate"],
         main["method"]["lift"], main["method"]["share_episodes_reached"], main["method"]["false_alarms_per_student_year"]),
        ("Fixed calendar, same budget", main["fixed_calendar"]["asks_per_student_year"], main["fixed_calendar"]["hit_rate"],
         main["fixed_calendar"]["lift"], main["fixed_calendar"]["share_episodes_reached"],
         main["fixed_calendar"]["false_alarms_per_student_year"]),
        ("Random weeks, same budget", main["budget_asks_per_student_year"], main["random"]["hit_rate"],
         main["random"]["hit_rate"] / main["method"]["base_rate"], main["random"]["share_episodes_reached"], np.nan),
        ("Random weeks, same students and counts", main["budget_asks_per_student_year"],
         main["random_same_students"]["hit_rate"], main["random_same_students"]["hit_rate"] / main["method"]["base_rate"],
         main["random_same_students"]["share_episodes_reached"], np.nan),
        ("Stability drift rule (test half)", lr0["rule_on_test"]["asks_per_student_year"], lr0["rule_on_test"]["hit_rate"],
         lr0["rule_on_test"]["lift"], lr0["rule_on_test"]["share_episodes_reached"],
         lr0["rule_on_test"]["false_alarms_per_student_year"]),
        ("Logistic regression (test half)", lr0["logistic_at_budget"]["asks_per_student_year"],
         lr0["logistic_at_budget"]["hit_rate"], lr0["logistic_at_budget"]["lift"],
         lr0["logistic_at_budget"]["share_episodes_reached"], lr0["logistic_at_budget"]["false_alarms_per_student_year"]),
        ("Fixed calendar (test half)", lr0["calendar_on_test"]["asks_per_student_year"], lr0["calendar_on_test"]["hit_rate"],
         lr0["calendar_on_test"]["lift"], lr0["calendar_on_test"]["share_episodes_reached"],
         lr0["calendar_on_test"]["false_alarms_per_student_year"]),
    ]
    return pd.DataFrame(rows, columns=["method", "asks_per_student_year", "hit_rate", "lift",
                                       "episodes_reached", "false_alarms_per_student_year"])


def k_table(results: dict) -> pd.DataFrame:
    rows = []
    for k in K_VALUES:
        c = results["ask_comparison_by_k"][str(k)]
        rows.append({"k": k, "asks_per_student_year": c["budget_asks_per_student_year"],
                     "rule_hit_rate": c["method"]["hit_rate"], "calendar_hit_rate": c["fixed_calendar"]["hit_rate"],
                     "random_ci_low": c["random"]["ci"][0], "random_ci_high": c["random"]["ci"][1],
                     "same_students_random": c["random_same_students"]["hit_rate"],
                     "rule_minus_calendar": c["method_minus_calendar"]["difference"],
                     "diff_ci_low": c["method_minus_calendar"]["ci"][0],
                     "diff_ci_high": c["method_minus_calendar"]["ci"][1],
                     "rule_episodes_reached": c["method"]["share_episodes_reached"],
                     "calendar_episodes_reached": c["fixed_calendar"]["share_episodes_reached"]})
    a = results["adaptive_range_k1"]
    rows.append({"k": "1.0 adaptive", "asks_per_student_year": a["budget_asks_per_student_year"],
                 "rule_hit_rate": a["method"]["hit_rate"], "calendar_hit_rate": a["fixed_calendar"]["hit_rate"],
                 "random_ci_low": a["random"]["ci"][0], "random_ci_high": a["random"]["ci"][1],
                 "same_students_random": a["random_same_students"]["hit_rate"],
                 "rule_minus_calendar": a["method_minus_calendar"]["difference"],
                 "diff_ci_low": a["method_minus_calendar"]["ci"][0],
                 "diff_ci_high": a["method_minus_calendar"]["ci"][1],
                 "rule_episodes_reached": a["method"]["share_episodes_reached"],
                 "calendar_episodes_reached": a["fixed_calendar"]["share_episodes_reached"]})
    return pd.DataFrame(rows)


def heads_up_table(results: dict, which: str = "train_grid") -> pd.DataFrame:
    return pd.DataFrame(results["heads_up"]["splits"][0][which])


def _md_table(headers: list[str], rows: list[list]) -> str:
    out = ["| " + " | ".join(headers) + " |", "| " + " | ".join("---" for _ in headers) + " |"]
    for r in rows:
        out.append("| " + " | ".join(str(x) for x in r) + " |")
    return "\n".join(out)


def _f(x: float, nd: int = 1) -> str:
    return "n/a" if x is None or (isinstance(x, float) and np.isnan(x)) else f"{x:.{nd}f}"


def render_markdown(results: dict) -> str:
    d = results["data"]
    st = results["settings"]
    main = results["ask_comparison_by_k"][str(K_DEFAULT)]
    rule_m, cal, rnd = main["method"], main["fixed_calendar"], main["random"]
    rps, rsq = main["random_same_students"], main["random_same_student_and_quarter"]
    diff = main["method_minus_calendar"]
    lr = results["logistic"]
    lr0 = lr["splits"][0]
    sp = lr["spread"]
    hu_all = results["heads_up"]["splits"]
    hu = hu_all[0]
    hu_t = hu["test"]
    door = results["door_check"]
    dh = door["any_high_learning_week"]
    dm = door["mean_high_over_learning_weeks"]
    dn = door["comparison_not_high_at_start"]
    yrs = results["rule_by_year_k1"]
    budget = main["budget_asks_per_student_year"]
    L = []
    w = L.append

    w("# Experiment 1: does the drift rule pick better weeks to ask?")
    w("")
    w(f"Generated {GENERATED} by `experiments/exp1_timing.py`. Data: College Experience Study (Dartmouth), "
      "CC BY-NC-SA 4.0, used for academic purposes only. Every number below is an aggregate over students. "
      "No student ids or per-student rows appear in this file.")
    w("")
    w("## Short answer")
    w("")
    w(make_headline(results))
    w("")
    w(f"- **Asks.** At the rule's own budget of {budget:.1f} asks per student-year, its hit rate was "
      f"{_pct(rule_m['hit_rate'])} against {_pct(cal['hit_rate'])} for a fixed calendar and a base rate of "
      f"{_pct(rule_m['base_rate'])}. The gap was {_pp(diff['difference'])} (95% interval {_ci_pp(diff['ci'])} "
      f"when students are resampled).")
    w(f"- **Why the gap appears.** Random weeks drawn from the same student in the same calendar quarter, with the "
      f"same number of asks in each, reached {_pct(rsq['hit_rate'])} (95% interval {_ci(rsq['ci'])}). "
      f"{_pct(rsq['share_draws_at_or_above_method'], 0)} of those draws did at least as well as the rule. "
      "The rule asks more often in later years and in harder stretches, when more students score high. Within those "
      "stretches it chose weeks no better than chance.")
    w(f"- **Low periods reached.** The calendar reached {_pct(cal['share_episodes_reached'], 0)} of low periods "
      f"(two or more high weeks in a row). The rule reached {_pct(rule_m['share_episodes_reached'], 0)}, because its "
      "asks bunch up in some students and some stretches.")
    w(f"- **Learned weights.** A logistic regression trained on half the students scored an AUC of "
      f"{lr0['test_auc']:.2f} (95% interval {_ci(lr0['test_auc_ci'], 2, pct=False)}) on the other half, which is "
      f"chance. Over five splits its AUC ran from {sp['test_auc_min']:.2f} to {sp['test_auc_max']:.2f}. A plain count "
      f"of signals out of range did slightly better, at {sp['signals_out_auc_mean']:.2f} on average.")
    w(f"- **Parent heads-up.** Chosen on training students: {hu['chosen']['weeks_out']} weeks with two signals out, "
      f"then {hu['chosen']['cooldown_weeks']} weeks of cooldown. On test students it sent "
      f"{hu_t['method']['asks_per_student_year']:.1f} heads-ups per student-year, and "
      f"{_pct(hu_t['method']['hit_rate'])} landed near a high score, against {_pct(hu_t['fixed_calendar']['hit_rate'])} "
      f"for a calendar sending the same number (difference {_pp(hu_t['method_minus_calendar']['difference'])}, "
      f"95% interval {_ci_pp(hu_t['method_minus_calendar']['ci'])}).")
    w(f"- **Check at the door.** {dh['students']} students had a high score in one of their four learning weeks. "
      f"The drift rule never asked {dh['missed_by_drift_rule']} of them in weeks 5 to 12, and "
      f"{dh['missed_and_still_high_in_weeks_5_to_12']} of those were still scoring high then. "
      f"It skipped {_pct(dn['share_missed'], 0)} of the other students in those weeks too, so it does not pick out "
      "the students who start high.")
    w("")
    w("## What we tested")
    w("")
    w("Stability asks a student two screening questions when their phone signals stay outside their own normal range. "
      "The question here is whether that rule picks better weeks to ask than a fixed calendar that asks the same number "
      "of times. A second question is whether the parent heads-up rule, run on phone signals alone, picks better weeks "
      "than a calendar. The PHQ-2 answers that Dartmouth students gave on their phones are the yardstick: a week counts "
      "as high when PHQ-2 is 3 or more, the published screening cut-off.")
    w("")
    w("## Data")
    w("")
    w(_md_table(["Item", "Value"], [
        ["PHQ-2 answers", f"{d['phq2_answers']:,} from {d['students_with_answers']} students"],
        ["Share of answers at 3 or more", _pct(d["share_answers_positive"])],
        ["Median days between a student's answers", _f(d["median_days_between_answers"], 0)],
        ["Students analysed (4 learning weeks plus at least one monitored week)",
         f"{d['students_analysed']} ({d['students_ios']} iPhone, {d['students_android']} Android)"],
        ["Monitored student-weeks", f"{d['monitored_student_weeks']:,} ({d['monitored_student_years']:.0f} student-years)"],
        ["Monitored weeks with a label", f"{d['student_weeks_with_label']:,} ({_pct(d['share_monitored_weeks_labelled'], 0)})"],
        ["Base rate (labelled monitored weeks at 3 or more)", _pct(d["base_rate"])],
    ]))
    w("")
    w("## Signals")
    w("")
    w("Each of Stability's signals was mapped to a feature recorded on both iPhone and Android. Each weekly value is the "
      "mean over the week's usable days unless the note says otherwise.")
    w("")
    w(_md_table(["Signal", "Feature", "Worse when", "Note"],
                [[s["label"], f"`{s['feature']}`", s["worse"], s["note"]] for s in CORE_SIGNALS]))
    w("")
    w("Steps and late-night audio (iPhone only) and texts, calls and nearby conversation (Android only) were run as "
      "secondary checks.")
    w("")
    w("## Rules and choices")
    w("")
    w(f"- **Usable day:** activity and location data each cover at least {st['quality_min_hours']} hours "
      "(`quality_activity` and `quality_loc`).")
    w(f"- **Valid week:** Monday to Sunday with at least {st['min_usable_days_per_week']} usable days. A week short of "
      "that breaks every run and cannot hold an ask.")
    w(f"- **Label:** the PHQ-2 answer nearest the end of the week (Sunday), within {st['label_window_days']} days "
      "either side, so Thursday of that week to Wednesday of the next. These windows do not overlap, so each answer "
      "labels one week at most. Weeks without a label still exist but cannot be scored.")
    w(f"- **Personal range:** the mean and spread of each signal over the student's first {st['baseline_weeks']} valid "
      f"weeks. The spread is the larger of the baseline standard deviation and {st['spread_floor_fraction_of_population_sd']} "
      "times the standard deviation of that signal across all valid student-weeks. The range is then frozen.")
    w(f"- **Rule:** z is measured in the worse direction. A signal is out when z is {st['k_default']} or more, counts after "
      f"{st['persist_weeks']} weeks out in a row, and an ask fires in every week that {st['min_signals']} or more signals "
      "count.")
    w("- **Budget:** asks per student-year, where a student-year is 52 monitored weeks (valid weeks after the four "
      "learning weeks). Every method may only ask in monitored weeks.")
    w(f"- **Fixed calendar:** each student is asked at evenly spaced monitored weeks at the rule's overall rate. Results "
      f"are averaged over {st['calendar_start_offsets']} start offsets.")
    w(f"- **Random weeks:** {st['random_draws']} draws of the same total number of asks. Two stricter versions keep the "
      "rule's count of asks for each student, and for each student in each calendar quarter.")
    w("- **Hit rate:** the share of scored asks (asks in a labelled week) whose label is high. Lift is hit rate over "
      "the base rate.")
    w("- **Low period (episode):** two or more consecutive weeks with high labels after the learning weeks. A week "
      "without a label ends it. It is reached if any ask falls in it.")
    w(f"- **Student splits:** students, never weeks, are split in half with fixed seeds ({st['student_splits']} splits). "
      "The first split is the primary one.")
    w("")

    w(f"## Result 1: asks at the same budget (k = {K_DEFAULT})")
    w("")
    w(f"All {d['students_analysed']} students. Budget: {budget:.1f} asks per student-year.")
    w("")
    rows = [
        ["Stability drift rule", _pct(rule_m["hit_rate"]), f"{rule_m['lift']:.2f}", _pct(rule_m["share_episodes_reached"], 0),
         _pct(rule_m["share_positive_weeks_asked"], 0), _f(rule_m["false_alarms_per_student_year"])],
        ["Fixed calendar", _pct(cal["hit_rate"]), f"{cal['lift']:.2f}", _pct(cal["share_episodes_reached"], 0),
         _pct(cal["share_positive_weeks_asked"], 0), _f(cal["false_alarms_per_student_year"])],
        ["Random weeks", f"{_pct(rnd['hit_rate'])} ({_ci(rnd['ci'])})", f"{rnd['hit_rate'] / rule_m['base_rate']:.2f}",
         _pct(rnd["share_episodes_reached"], 0), "", ""],
        ["Random weeks, same count per student", f"{_pct(rps['hit_rate'])} ({_ci(rps['ci'])})",
         f"{rps['hit_rate'] / rule_m['base_rate']:.2f}", _pct(rps["share_episodes_reached"], 0), "", ""],
        ["Random weeks, same count per student and quarter", f"{_pct(rsq['hit_rate'])} ({_ci(rsq['ci'])})",
         f"{rsq['hit_rate'] / rule_m['base_rate']:.2f}", _pct(rsq["share_episodes_reached"], 0), "", ""],
    ]
    w(_md_table(["Method", "Hit rate (95% interval)", "Lift", "Low periods reached", "High weeks asked",
                 "False alarms per student-year"], rows))
    w("")
    w(f"Missed cases and false alarms, drift rule: {rule_m['positive_weeks_missed']:,} of {rule_m['positive_weeks']:,} "
      f"high weeks got no ask, and {rule_m['episodes_missed']} of {rule_m['episodes']} low periods got none. "
      f"{rule_m['false_alarms']:,} asks landed on labelled weeks that were not high. For the calendar the same counts were "
      f"{rule_m['positive_weeks'] - cal['positive_weeks_asked']:,.0f} high weeks missed, "
      f"{cal['episodes_missed']:.0f} low periods missed and {cal['false_alarms']:,.0f} false alarms.")
    w("")
    w(f"The rule beat the calendar by {100 * diff['difference']:.1f} points, and the 95% interval ({_ci_pp(diff['ci'])}) "
      f"{'only just clears zero' if 0 < diff['ci'][0] < 0.005 else ('clears zero' if diff['ci'][0] > 0 else 'includes zero')}. "
      "The calendar spreads asks evenly over every student and every year. The rule does not, and the table below shows "
      "why that matters: the frozen range drifts, so the rule asks more often each year, and more students score high in "
      "later years.")
    w("")
    w(_md_table(["Year since monitoring began", "Students", "Weeks with an ask", "Rule hit rate", "Base rate"],
                [[r["year"], r["students"], _pct(r["share_weeks_with_ask"], 0), _pct(r["hit_rate"]), _pct(r["base_rate"])]
                 for r in yrs]))
    w("")
    w(f"Random weeks that keep the rule's count of asks for each student in each quarter do as well as the rule "
      f"({_pct(rsq['hit_rate'])} against {_pct(rule_m['hit_rate'])}). So the rule's edge over the calendar comes from "
      "where its asks fall across students and seasons. Inside a student's quarter, its choice of week adds nothing.")
    w("")
    sc = main["strata_check"]
    w(f"One check on that comparison: in a quarter where the rule asked every week, the random draw has no choice. "
      f"{_pct(sc['share_asks_in_full_quarters'], 0)} of the rule's asks fall in such quarters. Leaving them out, the rule's "
      f"hit rate was {_pct(sc['hit_rate_outside_full_quarters'])} against {_pct(sc['chance_outside_full_quarters'])} "
      "for chance in the same quarters, so the result does not depend on them.")
    w("")

    w("## Result 2: other thresholds and the adaptive range")
    w("")
    krows = []
    for k in K_VALUES:
        c = results["ask_comparison_by_k"][str(k)]
        krows.append([f"k = {k}", f"{c['budget_asks_per_student_year']:.1f}", _pct(c["method"]["hit_rate"]),
                      _pct(c["fixed_calendar"]["hit_rate"]), _ci(c["random"]["ci"]),
                      _pct(c["random_same_student_and_quarter"]["hit_rate"]),
                      f"{_pp(c['method_minus_calendar']['difference'])} ({_ci_pp(c['method_minus_calendar']['ci'])})",
                      _pct(c["method"]["share_episodes_reached"], 0), _pct(c["fixed_calendar"]["share_episodes_reached"], 0)])
    a = results["adaptive_range_k1"]
    krows.append(["k = 1.0, adaptive range", f"{a['budget_asks_per_student_year']:.1f}", _pct(a["method"]["hit_rate"]),
                  _pct(a["fixed_calendar"]["hit_rate"]), _ci(a["random"]["ci"]),
                  _pct(a["random_same_student_and_quarter"]["hit_rate"]),
                  f"{_pp(a['method_minus_calendar']['difference'])} ({_ci_pp(a['method_minus_calendar']['ci'])})",
                  _pct(a["method"]["share_episodes_reached"], 0), _pct(a["fixed_calendar"]["share_episodes_reached"], 0)])
    w(_md_table(["Setting", "Asks per student-year", "Rule hit rate", "Calendar", "Random 95% interval",
                 "Random, same student and quarter", "Rule minus calendar (95% interval)",
                 "Low periods reached, rule", "Low periods reached, calendar"], krows))
    w("")
    w(f"The picture is the same at every threshold. The adaptive range follows concept.md: the mean moves "
      f"{st['adaptive_fast']} of the way toward a better week, {st['adaptive_slow']} of the way toward a worse week that is "
      "still in range, and not at all while that signal is out. Because it ratchets toward the student's best weeks, "
      f"ordinary weeks then look worse, and the rule asked in {_pct(a['method']['asks'] / d['monitored_student_weeks'], 0)} "
      "of monitored weeks. That is close to asking every week, which is why its hit rate sits near the base rate.")
    w("")

    w("## Result 3: logistic regression")
    w("")
    w(f"Features: each signal's z this week and last week, plus the number of signals out ({len(lr['features'])} "
      "features). z is clipped to plus or minus 6 and a missing value is set to 0. The model is fit on the training "
      "half of the students and scored on the other half. The hit rate uses the rule's budget on the same test "
      "students, taking the test weeks with the highest predicted risk.")
    w("")
    srows = []
    for r in lr["splits"]:
        srows.append([r["seed"], f"{r['test_auc']:.3f} ({_ci(r['test_auc_ci'], 3, pct=False)})",
                      f"{r['test_within_student_auc']:.3f}", f"{r['test_auc_signals_out']:.3f}",
                      _pct(r["logistic_at_budget"]["hit_rate"]), _pct(r["rule_on_test"]["hit_rate"]),
                      _pct(r["calendar_on_test"]["hit_rate"])])
    w(_md_table(["Split seed", "Test AUC (95% interval)", "Within-student AUC", "AUC of signals-out count",
                 "Logistic hit rate", "Rule hit rate", "Calendar hit rate"], srows))
    w("")
    w(f"Training AUC on the first split was {lr0['train_auc']:.2f}, and it fell to {lr0['test_auc']:.2f} on new "
      "students. The weights it learns describe the training students and do not carry over. Splitting weeks at random "
      f"instead of students, which puts the same students on both sides, gives {lr['week_split_contrast']['test_auc']:.2f}, "
      "so even that flattering split finds little. Within-student AUC compares only weeks of the same student, and it "
      f"averaged {sp['within_student_auc_mean']:.2f}.")
    w("")
    w("Weights from the first split (z units):")
    w("")
    w(_md_table(["Feature", "Weight"], [["intercept", f"{lr0['intercept']:.3f}"]] +
                [[k, f"{v:.3f}"] for k, v in lr0["coef"].items()]))
    w("")

    w("## Result 4: parent heads-up, phone signals only")
    w("")
    w("This simulates a teen who skips every question. A heads-up fires when two signals have each been out for W "
      "weeks in a row, counted from when the second one left its range. After a heads-up, the next C weeks are a "
      "cooldown: evidence is held, and from week C + 1 the rule fires again if two signals are still out for W weeks. "
      "A heads-up is scored when week t or week t + 1 has a label, and is a hit when either label is high.")
    w("")
    w(f"W and C were chosen on the training students of the first split: the best hit rate with at most "
      f"{st['heads_up_max_alerts_per_student_year']:.0f} heads-ups per student-year, ties going to fewer heads-ups.")
    w("")
    w(_md_table(["W", "C", "Heads-ups per student-year (train)", "Hit rate (train)", "Scored heads-ups"],
                [[g["weeks_out"], g["cooldown_weeks"], f"{g['alerts_per_student_year']:.2f}", _pct(g["hit_rate"]),
                  g["scored_alerts"]] for g in hu["train_grid"]]))
    w("")
    m_, c_, r_, q_ = hu_t["method"], hu_t["fixed_calendar"], hu_t["random"], hu_t["random_same_student_and_quarter"]
    w(f"Chosen: W = {hu['chosen']['weeks_out']}, C = {hu['chosen']['cooldown_weeks']}. Frozen and scored on the "
      f"{lr0['test_students']} test students:")
    w("")
    w(_md_table(["Measure", "Heads-up rule", "Calendar, same count"], [
        ["Heads-ups per student-year", f"{m_['asks_per_student_year']:.2f}", f"{c_['asks_per_student_year']:.2f}"],
        ["Hit rate", _pct(m_["hit_rate"]), _pct(c_["hit_rate"])],
        ["False alarms per student-year (scored and not high)", _f(m_["false_alarms_per_student_year"], 2),
         _f(c_["false_alarms_per_student_year"], 2)],
        ["Low periods reached", _pct(m_["share_episodes_reached"], 0), _pct(c_["share_episodes_reached"], 0)],
    ]))
    w("")
    w(f"Base rate under this two-week definition: {_pct(m_['base_rate'])}. Random weeks at the same count: "
      f"{_ci(r_['ci'])}. Random weeks with the same count per student and quarter: {_pct(q_['hit_rate'])} "
      f"({_ci(q_['ci'])}). The rule minus the calendar was {_pp(hu_t['method_minus_calendar']['difference'])} "
      f"(95% interval {_ci_pp(hu_t['method_minus_calendar']['ci'])}). The training hit rate of "
      f"{_pct(hu['train_choice']['hit_rate'])} did not hold on new students. {m_['episodes_missed']} of "
      f"{m_['episodes']} low periods among test students got no heads-up.")
    w("")
    hrows = [[h["seed"], f"W = {h['chosen']['weeks_out']}, C = {h['chosen']['cooldown_weeks']}",
              f"{h['test']['method']['asks_per_student_year']:.2f}", _pct(h["test"]["method"]["hit_rate"]),
              _pct(h["test"]["fixed_calendar"]["hit_rate"]),
              f"{_pp(h['test']['method_minus_calendar']['difference'])} ({_ci_pp(h['test']['method_minus_calendar']['ci'])})"]
             for h in hu_all]
    w("Repeated over five student splits, choosing W and C on each training half:")
    w("")
    w(_md_table(["Split seed", "Chosen", "Heads-ups per student-year (test)", "Hit rate (test)", "Calendar (test)",
                 "Difference (95% interval)"], hrows))
    w("")
    dd = hu["doc_default_W4_C2_on_test"]
    w(f"The starting guess in parent-alerts.md, four weeks and at most one heads-up every three weeks (W = 4, C = 2), "
      f"sent {dd['method']['asks_per_student_year']:.1f} heads-ups per student-year on test students with a hit rate of "
      f"{_pct(dd['method']['hit_rate'])}, against {_pct(dd['fixed_calendar']['hit_rate'])} for the calendar.")
    w("")

    w("## Result 5: check at the door")
    w("")
    w(f"Students with at least {DOOR_FIRST_WEEKS} valid weeks: {door['students_with_12_valid_weeks']}. Weeks 1 to 4 "
      f"are the learning weeks and weeks 5 to {DOOR_FIRST_WEEKS} are the first monitored weeks.")
    w("")
    w(_md_table(["Group", "Students", "Never asked in weeks 5 to 12", "Still high in weeks 5 to 12",
                 "Never asked and still high"], [
        ["A high score in any learning week", dh["students"], f"{dh['missed_by_drift_rule']} ({_pct(dh['share_missed'], 0)})",
         dh["still_high_in_weeks_5_to_12"], dh["missed_and_still_high_in_weeks_5_to_12"]],
        ["Average PHQ-2 of 3 or more over the learning weeks", dm["students"],
         f"{dm['missed_by_drift_rule']} ({_pct(dm['share_missed'], 0)})", dm["still_high_in_weeks_5_to_12"],
         dm["missed_and_still_high_in_weeks_5_to_12"]],
        ["Everyone else", dn["students"], f"{dn['missed_by_drift_rule']} ({_pct(dn['share_missed'], 0)})",
         dn["still_high_in_weeks_5_to_12"], dn["missed_and_still_high_in_weeks_5_to_12"]],
    ]))
    w("")
    w(f"The drift rule alone would leave {dh['missed_by_drift_rule']} of the {dh['students']} students who started high "
      f"without a single ask for two months. This is the case the eight questions at setup are for. Their miss rate is "
      f"about the same as everyone else's ({_pct(dn['share_missed'], 0)}): the rule does not find students who start "
      "high any more often than students who do not.")
    w("")

    w("## Secondary checks")
    w("")
    w("Single-signal AUC on all monitored labelled weeks (z in the worse direction against a high label; 0.5 is chance):")
    w("")
    w(_md_table(["Signal", "AUC", "Share of weeks out (z of 1 or more)"],
                [[next(s["label"] for s in CORE_SIGNALS if s["key"] == k), f"{v['auc']:.3f}", _pct(v["share_weeks_out"], 0)]
                 for k, v in results["single_signal_auc"].items()]))
    w("")
    prow = []
    for name, nice in [("ios", "iPhone"), ("android", "Android")]:
        r = results["platform_secondary"][name]
        for tag, lab in [("core_signals", "core signals"), ("core_plus_platform", "core plus platform signals")]:
            c = r[tag]
            prow.append([f"{nice} ({r['students']} students), {lab}", f"{c['budget_asks_per_student_year']:.1f}",
                         _pct(c["hit_rate"]), _pct(c["calendar_hit_rate"]),
                         _pct(c["random_same_student_and_quarter_hit_rate"])])
    w(_md_table(["Group", "Asks per student-year", "Rule hit rate", "Calendar", "Random, same student and quarter"], prow))
    w("")
    extra = {**results["platform_secondary"]["ios"]["single_signal_auc"], **results["platform_secondary"]["android"]["single_signal_auc"]}
    labels = {s["key"]: s["label"] for s in IOS_SIGNALS + ANDROID_SIGNALS}
    w("Single-signal AUC for the platform-only signals: " + "; ".join(
        f"{labels[k]} {v['auc']:.2f} ({v['weeks']:,} weeks)" for k, v in extra.items()) + ". The Android numbers come "
      f"from {results['platform_secondary']['android']['students']} students and should be read as a hint for "
      "later work.")
    w("")

    w("## What this shows and what it does not")
    w("")
    w("It shows that, in this dataset, the drift rule as written does not choose better weeks to ask than chance once "
      "you account for which student and which season the asks fall in. A fixed calendar at the same budget reaches "
      "more low periods. Learned weights did not carry over to new students. The parent heads-up rule, run on phone "
      "signals alone, landed near high scores about as often as a calendar with the same number of notes.")
    w("")
    w("It does not show that phone signals are useless for Stability. The features here are the study's own, and typing, "
      "tone and music were missing. The students were also older than Stability's users. It cannot say whether a note "
      "helped a family. A high mood score only stands in for a note being right.")
    w("")
    w("For the design, this weakens the case for the drift rule as the main trigger. The check at the door and the "
      "two-monthly ask do not depend on it. The adaptive range as written asked in most weeks, so its update needs "
      "rethinking before it is used.")
    w("")
    w("## Caveats")
    w("")
    for c in make_caveats(results):
        w(f"- {c}")
    w("")
    w("## How to run")
    w("")
    w("```")
    w(".venv/bin/python experiments/exp1_timing.py            # uses the cache in data/cache/")
    w(".venv/bin/python experiments/exp1_timing.py --refresh  # rebuilds the weekly table from data/ces/")
    w("```")
    w("")
    w(f"The run takes about {results['runtime_seconds']:.0f} seconds after the cache is built. The notebook "
      "`notebooks/01_timing_model.ipynb` calls the same functions and draws the charts.")
    w("")
    w("*This is a prototype analysis and is not medical advice. It was written with Claude (Anthropic).*")
    w("")
    return "\n".join(L)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--refresh", action="store_true", help="rebuild the cached daily and weekly tables")
    args = ap.parse_args()
    run_all(refresh=args.refresh, write=True)


if __name__ == "__main__":
    main()
