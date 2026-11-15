"""Experiment 2b for Steady: does a fine-tuned small language model read low mood better
than the word-count model the app ships?

The shipped tone model (Experiment 2) counts words and word pairs. This experiment takes a
small pretrained language model, sentence-transformers/all-MiniLM-L6-v2 (Apache-2.0, 22.7
million weights), and fine-tunes all of it for one job: is this comment low mood (sadness,
grief, disappointment or remorse)? It uses the same GoEmotions splits, the same label and
the same test comments as Experiment 2, so the two models can be set side by side.

Two recipes are trained, as in Experiment 2:
  hard  the "simplified" training split, label 1 or 0
  soft  every comment outside validation and test, with the share of its raters who marked
        a low-mood emotion as the target
Epochs, recipe and threshold are chosen on the validation split only. The test split is
scored once, for the chosen model. Our 60 messages are test-only.

Data: data/goemotions/*.parquet and data/goemotions_raw/raw.parquet (scripts/get_data.sh).
The pretrained model downloads from Hugging Face on first use (about 90 MB).

Usage: .venv/bin/python experiments/exp2b_finetune.py      (about 10 minutes on an Apple GPU)
       EXP2B_SMOKE=1 .venv/bin/python experiments/exp2b_finetune.py   (a one-minute dry run on 600 comments; writes under data/ only)
       .venv/bin/python experiments/exp2b_finetune.py --render       (rewrite results.md from results.json without training)
Writes: results/exp2b/results.json, results/exp2b/results.md,
        data/models/tone_minilm/ (the fine-tuned weights; data/ is not in the repo)
"""
import csv
import json
import math
import random
import sys
import time
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
import numpy as np
import pandas as pd
import torch
from sklearn.metrics import average_precision_score, precision_recall_curve, roc_auc_score
from transformers import AutoModel, AutoTokenizer, get_linear_schedule_with_warmup

sys.path.insert(0, str(Path(__file__).resolve().parent))
import exp2_words as e2  # noqa: E402  (same splits, label, metrics and keyword list as Experiment 2)

ROOT = e2.ROOT
RES_DIR = ROOT / "results" / "exp2b"
MODEL_DIR = ROOT / "data" / "models" / "tone_minilm"
BASE = "sentence-transformers/all-MiniLM-L6-v2"
GENERATED = "2026-11-15"
SEED = 20261115
EPOCHS = 3
BATCH = 64
MAX_LEN = 64
LR = 3e-5
WARMUP = 0.06
THRESHOLDS = np.round(np.arange(0.02, 0.9501, 0.005), 4)
PROBES = ["i miss how things used to be, nothing feels fun anymore", "nothing feels fun anymore",
          "omw, save me a seat at lunch", "sorry im late lol"]
DEVICE = "mps" if torch.backends.mps.is_available() else ("cuda" if torch.cuda.is_available() else "cpu")
import os
SMOKE = os.environ.get("EXP2B_SMOKE") == "1"   # a one-minute dry run on a few hundred comments, written to data/, to test the script
if SMOKE:
    EPOCHS, RES_DIR, MODEL_DIR = 1, ROOT / "data" / "exp2b_smoke", ROOT / "data" / "models" / "tone_minilm_smoke"


class ToneNet(torch.nn.Module):
    """The pretrained encoder, mean pooling over the tokens, and one output for low mood."""

    def __init__(self):
        super().__init__()
        self.encoder = AutoModel.from_pretrained(BASE)
        self.head = torch.nn.Linear(self.encoder.config.hidden_size, 1)

    def forward(self, input_ids, attention_mask):
        h = self.encoder(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
        m = attention_mask.unsqueeze(-1).to(h.dtype)
        pooled = (h * m).sum(1) / m.sum(1).clamp(min=1.0)
        return self.head(pooled).squeeze(-1)


def encode(tok, texts):
    return tok(list(texts), padding=True, truncation=True, max_length=MAX_LEN, return_tensors="pt")


@torch.no_grad()
def predict(model, tok, texts, device=DEVICE, batch=256):
    model.eval()
    out = []
    texts = list(texts)
    for i in range(0, len(texts), batch):
        b = encode(tok, texts[i:i + batch])
        z = model(b["input_ids"].to(device), b["attention_mask"].to(device))
        out.append(torch.sigmoid(z).float().cpu().numpy())
    return np.concatenate(out)


def best_threshold(y, prob):
    best = None
    for t in THRESHOLDS:
        m = e2.confusion(y, prob >= t)
        if best is None or m["f1"] > best[1]["f1"]:
            best = (float(t), m)
    return best


def train_recipe(name, texts, targets, tok, va_text, va_y):
    """Fine-tune from the pretrained weights. Returns one row per epoch and the state of the best epoch
    by validation average precision."""
    torch.manual_seed(SEED); np.random.seed(SEED); random.seed(SEED)
    model = ToneNet().to(DEVICE)
    opt = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=0.01)
    steps = math.ceil(len(texts) / BATCH) * EPOCHS
    sched = get_linear_schedule_with_warmup(opt, int(WARMUP * steps), steps)
    loss_fn = torch.nn.BCEWithLogitsLoss()
    texts = np.asarray(texts, dtype=object); targets = np.asarray(targets, dtype=np.float32)
    rng = np.random.default_rng(SEED)
    rows, best = [], None
    for ep in range(1, EPOCHS + 1):
        model.train()
        order = rng.permutation(len(texts))
        t0 = time.time(); tot = 0.0; nb = 0
        for i in range(0, len(order), BATCH):
            idx = order[i:i + BATCH]
            b = encode(tok, texts[idx])
            z = model(b["input_ids"].to(DEVICE), b["attention_mask"].to(DEVICE))
            loss = loss_fn(z, torch.from_numpy(targets[idx]).to(DEVICE))
            opt.zero_grad(); loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step(); sched.step()
            tot += float(loss.detach()); nb += 1
        pva = predict(model, tok, va_text)
        ap = float(average_precision_score(va_y, pva))
        t_best, m_best = best_threshold(va_y, pva)
        row = {"recipe": name, "epoch": ep, "train_loss": round(tot / nb, 4), "val_ap": round(ap, 4),
               "val_roc_auc": round(float(roc_auc_score(va_y, pva)), 4), "val_best_f1": round(m_best["f1"], 4),
               "val_best_threshold": t_best, "seconds": round(time.time() - t0, 1)}
        rows.append(row)
        print(f"  {name} epoch {ep}: loss {row['train_loss']:.4f}  val AP {ap:.4f}  best F1 {m_best['f1']:.4f} at {t_best}  ({row['seconds']:.0f}s)", flush=True)
        if best is None or ap > best["val_ap"]:
            best = {"val_ap": ap, "epoch": ep, "threshold": t_best, "val": m_best,
                    "state": {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}}
    del model
    return rows, best


def shipped_scores(texts):
    """The shipped model's scores, computed from app/public/models/tone.json the way tone.ts does."""
    m = json.loads(e2.TONE_JSON.read_text())
    idx = {t: i for i, t in enumerate(m["vocab"])}
    idf, coef, sub = m["idf"], m["coef"], m["tf"] != "raw"
    out = []
    for text in texts:
        c = {}
        for f in e2.analyzer(text):
            j = idx.get(f)
            if j is not None:
                c[j] = c.get(j, 0) + 1
        sq = dot = 0.0
        for j, n in c.items():
            v = ((1 + math.log(n)) if sub else n) * idf[j]
            sq += v * v; dot += v * coef[j]
        z = m["intercept"] + (dot / math.sqrt(sq) if sq > 0 else 0.0)
        out.append(1 / (1 + math.exp(-z)))
    return np.array(out), float(m["threshold"])


def full_metrics(y, prob, threshold):
    m = e2.confusion(y, prob >= threshold)
    m.update(e2.bootstrap_ci(y, (prob >= threshold).astype(int)))
    m["threshold"] = threshold
    m["average_precision"] = round(float(average_precision_score(y, prob)), 4)
    m["roc_auc"] = round(float(roc_auc_score(y, prob)), 4)
    return m


def at_matched_points(y, prob, precision_target, recall_target):
    """Read off the test curve: the best recall with precision at or above the other model's precision,
    and the best precision with recall at or above the other model's recall. Descriptive, not a tested threshold."""
    p, r, _ = precision_recall_curve(y, prob)
    ok_p = p[:-1] >= precision_target
    ok_r = r[:-1] >= recall_target
    return {"recall_at_other_models_precision": round(float(r[:-1][ok_p].max()), 4) if ok_p.any() else None,
            "precision_at_other_models_recall": round(float(p[:-1][ok_r].max()), 4) if ok_r.any() else None}


def main():
    t0 = time.time()
    RES_DIR.mkdir(parents=True, exist_ok=True)
    splits = {s: pd.read_parquet(e2.DATA / f"{s}.parquet") for s in ["train", "validation", "test"]}
    for d in splits.values():
        d["text"] = d["text"].astype(str)
        d["y"] = d["labels"].apply(lambda ls: int(any(int(l) in e2.LOW_MOOD_IDS for l in ls)))
    tr, va, te = splits["train"], splits["validation"], splits["test"]
    soft = e2.load_soft_pool(set(va["id"]) | set(te["id"]))
    print(f"device {DEVICE}; train {len(tr):,}, soft pool {len(soft):,}, validation {len(va):,}, test {len(te):,}", flush=True)
    if SMOKE:
        tr, soft = tr.sample(600, random_state=0), soft.sample(600, random_state=0)
    tok = AutoTokenizer.from_pretrained(BASE)
    va_y = va["y"].values

    # ---- train both recipes; everything here is judged on validation only
    grid, best = [], None
    for name, texts, targets in (("hard", tr["text"].values, tr["y"].values), ("soft", soft["text"].values, soft["q"].values)):
        rows, b = train_recipe(name, texts, targets, tok, va["text"].values, va_y)
        grid += rows
        b["recipe"] = name
        if best is None or b["val_ap"] > best["val_ap"]:
            best = b
    print(f"chosen on validation: {best['recipe']} labels, epoch {best['epoch']}, threshold {best['threshold']}", flush=True)

    model = ToneNet()
    model.load_state_dict(best["state"])
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    model.encoder.save_pretrained(MODEL_DIR)
    tok.save_pretrained(MODEL_DIR)
    torch.save(model.head.state_dict(), MODEL_DIR / "head.pt")
    weight_bytes = sum(f.stat().st_size for f in MODEL_DIR.glob("*") if f.suffix in (".safetensors", ".bin", ".pt"))

    # ---- the test split, once, for the chosen model
    model.to(DEVICE)
    te_y = te["y"].values
    p_ft = predict(model, tok, te["text"].values)
    p_ship, t_ship = shipped_scores(te["text"].values)
    kw = np.array([e2.keyword_flag(t) for t in te["text"].values]).astype(int)
    test = {
        "finetuned": full_metrics(te_y, p_ft, best["threshold"]),
        "shipped_tfidf": full_metrics(te_y, p_ship, t_ship),
        "baseline_keyword": {**e2.confusion(te_y, kw), **e2.bootstrap_ci(te_y, kw)},
    }
    ship, ft = test["shipped_tfidf"], test["finetuned"]
    test["finetuned"]["matched"] = at_matched_points(te_y, p_ft, ship["precision"], ship["recall"])
    test["shipped_tfidf"]["matched"] = at_matched_points(te_y, p_ship, ft["precision"], ft["recall"])
    # paired bootstrap on the same resampled comments: fine-tuned minus shipped
    rng = np.random.default_rng(0)
    d_ap, d_f1 = [], []
    f_ft, f_sh = (p_ft >= best["threshold"]).astype(int), (p_ship >= t_ship).astype(int)
    for _ in range(2000):
        i = rng.integers(0, len(te_y), len(te_y))
        if te_y[i].sum() == 0:
            continue
        d_ap.append(average_precision_score(te_y[i], p_ft[i]) - average_precision_score(te_y[i], p_ship[i]))
        d_f1.append(e2.confusion(te_y[i], f_ft[i])["f1"] - e2.confusion(te_y[i], f_sh[i])["f1"])
    ci = lambda a: [round(float(np.percentile(a, 2.5)), 4), round(float(np.percentile(a, 97.5)), 4)]
    test["finetuned_minus_shipped"] = {"average_precision": round(ft["average_precision"] - ship["average_precision"], 4),
                                       "average_precision_95ci": ci(d_ap), "f1": round(ft["f1"] - ship["f1"], 4), "f1_95ci": ci(d_f1)}

    # ---- our 60 messages (test-only) and the probe messages
    with open(e2.MSG_CSV, newline="", encoding="utf-8") as f:
        msgs = list(csv.DictReader(f))
    m_text = [m["text"] for m in msgs]
    m_y = np.array([int(m["low_mood"]) for m in msgs])
    m_ft = predict(model, tok, m_text) >= best["threshold"]
    m_sh = shipped_scores(m_text)[0] >= t_ship
    by_slice = {}
    for s in e2.SLICES:
        idx = [i for i, m in enumerate(msgs) if m["slice"] == s]
        c1, c2 = e2.confusion(m_y[idx], m_ft[idx]), e2.confusion(m_y[idx], m_sh[idx])
        by_slice[s] = {"n": len(idx), "labelled_low_mood": int(m_y[idx].sum()),
                       "finetuned": {k: c1[k] for k in ("flagged", "tp", "missed", "false_alarms")},
                       "shipped_tfidf": {k: c2[k] for k in ("flagged", "tp", "missed", "false_alarms")}}
    messages = {"n": len(msgs), "finetuned": e2.confusion(m_y, m_ft), "shipped_tfidf": e2.confusion(m_y, m_sh), "by_slice": by_slice,
                "found_only_by_finetuned": [msgs[i]["id"] for i in range(len(msgs)) if m_y[i] and m_ft[i] and not m_sh[i]],
                "found_only_by_shipped": [msgs[i]["id"] for i in range(len(msgs)) if m_y[i] and m_sh[i] and not m_ft[i]]}
    pr_ft, pr_sh = predict(model, tok, PROBES), shipped_scores(PROBES)[0]
    probes = [{"text": t, "finetuned_score": round(float(a), 4), "finetuned_low_mood": bool(a >= best["threshold"]),
               "shipped_score": round(float(b), 4), "shipped_low_mood": bool(b >= t_ship)} for t, a, b in zip(PROBES, pr_ft, pr_sh)]

    # ---- speed on CPU: 100 messages, one at a time, the way a phone would score them
    cpu = ToneNet(); cpu.load_state_dict(best["state"]); cpu.eval()
    sample = list(te["text"].values[:100])
    predict(cpu, tok, sample[:8], device="cpu", batch=1)
    times = []
    for _ in range(3):
        t1 = time.time(); predict(cpu, tok, sample, device="cpu", batch=1); times.append(time.time() - t1)
    t1 = time.time(); shipped_scores(sample); ship_time = time.time() - t1

    res = {
        "generated": GENERATED,
        "dataset": "GoEmotions (Google), Apache-2.0: the simplified splits and the rater-level file",
        "base_model": {"name": BASE, "license": "Apache-2.0", "parameters": int(sum(p.numel() for p in cpu.parameters()))},
        "settings": {"seed": SEED, "epochs": EPOCHS, "batch": BATCH, "max_tokens": MAX_LEN, "learning_rate": LR,
                     "warmup_share": WARMUP, "loss": "binary cross-entropy on the hard or soft label", "device": DEVICE,
                     "chosen_by": "validation average precision; threshold = best F1 on validation"},
        "data": {"train": int(len(tr)), "soft_pool": int(len(soft)), "validation": int(len(va)), "test": int(len(te)),
                 "test_low_mood": int(te_y.sum())},
        "validation_grid": grid,
        "chosen": {"recipe": best["recipe"], "epoch": best["epoch"], "threshold": best["threshold"], "val_ap": round(best["val_ap"], 4),
                   "val_f1": round(best["val"]["f1"], 4)},
        "test": test,
        "messages": messages,
        "probes": probes,
        "size": {"finetuned_weight_bytes": int(weight_bytes), "shipped_tone_json_bytes": int(e2.TONE_JSON.stat().st_size)},
        "speed_cpu": {"finetuned_seconds_per_100_messages": round(float(np.median(times)), 2),
                      "shipped_python_seconds_per_100_messages": round(ship_time, 4)},
        "runtime_seconds": round(time.time() - t0, 1),
    }
    (RES_DIR / "results.json").write_text(json.dumps(res, indent=2) + "\n", encoding="utf-8")
    (RES_DIR / "results.md").write_text(render_md(res), encoding="utf-8")
    print(headline(res))
    print(f"done in {res['runtime_seconds']:.0f}s")


# ---------------------------------------------------------------- write-up
def pct(x, nd=1):
    return "n/a" if x is None else f"{100 * x:.{nd}f}%"


def verdict(res):
    d = res["test"]["finetuned_minus_shipped"]
    lo, hi = d["average_precision_95ci"]
    if lo > 0:
        return "beat"
    if hi < 0:
        return "did worse than"
    return "was not clearly better than"


def headline(res):
    ft, sh = res["test"]["finetuned"], res["test"]["shipped_tfidf"]
    return (f"On the same {res['data']['test']:,} test comments, the fine-tuned language model {verdict(res)} the shipped word-count model: "
            f"it found {pct(ft['recall'], 0)} of low-mood comments at {pct(ft['precision'], 0)} precision "
            f"(average precision {ft['average_precision']:.2f}, AUC {ft['roc_auc']:.2f}), against {pct(sh['recall'], 0)} at "
            f"{pct(sh['precision'], 0)} ({sh['average_precision']:.2f}, {sh['roc_auc']:.2f}).")


def render_md(res):
    L = []
    w = L.append
    t = res["test"]; ft, sh, kw = t["finetuned"], t["shipped_tfidf"], t["baseline_keyword"]
    d = t["finetuned_minus_shipped"]; ch = res["chosen"]; ms = res["messages"]; sz = res["size"]; sp = res["speed_cpu"]
    mb = lambda b: f"{b / 1e6:.0f} MB" if b >= 1e6 else f"{b / 1024:.0f} KB"
    dj = ms["by_slice"]["dark_joke"]
    ci = lambda c: f"{pct(c[0])} to {pct(c[1])}" if c else "n/a"
    w("# Experiment 2b: a fine-tuned language model against the word-count model")
    w("")
    w(f"Run on {res['generated']} with `.venv/bin/python experiments/exp2b_finetune.py` ({res['runtime_seconds'] / 60:.0f} minutes on an Apple GPU). "
      "Every number here is written by that script into `results/exp2b/results.json`.")
    w("")
    w("## Short answer")
    w("")
    w(headline(res))
    w("")
    w(f"- **The gain.** Average precision rose by {d['average_precision']:+.3f} (95% interval {d['average_precision_95ci'][0]:+.3f} to {d['average_precision_95ci'][1]:+.3f}, "
      f"from resampling the same test comments for both models). F1 changed by {d['f1']:+.3f} ({d['f1_95ci'][0]:+.3f} to {d['f1_95ci'][1]:+.3f}).")
    w(f"- **At the same precision as the shipped model** ({pct(sh['precision'], 0)}), the fine-tuned model finds {pct(ft['matched']['recall_at_other_models_precision'], 0)} "
      f"of low-mood comments against {pct(sh['recall'], 0)}. **At the same recall** ({pct(sh['recall'], 0)}), {pct(ft['matched']['precision_at_other_models_recall'], 0)} "
      f"of its flags are right against {pct(sh['precision'], 0)}. These two are read off the test curve, so they describe it and are not tested thresholds.")
    w(f"- **Our 60 teen-style messages.** The fine-tuned model found {ms['finetuned']['tp']} of {ms['finetuned']['positives']} with {ms['finetuned']['false_alarms']} false alarms. "
      f"The shipped model found {ms['shipped_tfidf']['tp']} with {ms['shipped_tfidf']['false_alarms']}. "
      f"The gain did not carry over: it flagged {dj['finetuned']['false_alarms']} of the {dj['n']} dark jokes as low mood, against {dj['shipped_tfidf']['false_alarms']} for the shipped model.")
    w(f"- **The cost.** Its weights are {mb(sz['finetuned_weight_bytes'])} against {mb(sz['shipped_tone_json_bytes'])}, and it takes {sp['finetuned_seconds_per_100_messages']:.1f} seconds "
      "for 100 messages on this laptop's CPU. It is not in the app.")
    w("")
    w("## What we tested")
    w("")
    w("The shipped tone model counts words and word pairs, so it cannot tell that \"nothing feels fun anymore\" is sad unless those exact words carried weight in training. "
      f"A language model starts out knowing how words relate. We took `{res['base_model']['name']}` ({res['base_model']['license']}, "
      f"{res['base_model']['parameters'] / 1e6:.1f} million weights), added one output for low mood, and fine-tuned every weight on GoEmotions. "
      "Low mood means sadness, grief, disappointment or remorse, the same as Experiment 2.")
    w("")
    w("## Data and protocol")
    w("")
    dd = res["data"]; st = res["settings"]
    w(f"- **Splits.** GoEmotions' own: {dd['train']:,} training, {dd['validation']:,} validation and {dd['test']:,} test comments, {dd['test_low_mood']} of the test comments low mood.")
    w(f"- **Two recipes.** Hard labels on the training split, and soft labels (the share of a comment's raters who marked a low-mood emotion) on the {dd['soft_pool']:,} comments outside validation and test. "
      "The soft pool is built by Experiment 2's own code, which checks that no validation or test comment is in it.")
    w(f"- **Training.** {st['epochs']} epochs, batch {st['batch']}, at most {st['max_tokens']} tokens, learning rate {st['learning_rate']}, one fixed seed.")
    w("- **Choosing.** The recipe and the epoch with the best average precision on validation, and the threshold with the best F1 on validation. "
      "The test split was scored once, for that one model. Our 60 messages were never used to choose anything.")
    w("- **The shipped model's numbers** are recomputed here from `app/public/models/tone.json`, the file the app loads, on the same comments.")
    w("")
    w("## Validation")
    w("")
    w("| Recipe | Epoch | Training loss | Validation average precision | Validation AUC | Best F1 | At threshold |")
    w("| --- | --- | --- | --- | --- | --- | --- |")
    for g in res["validation_grid"]:
        star = " (chosen)" if g["recipe"] == ch["recipe"] and g["epoch"] == ch["epoch"] else ""
        w(f"| {g['recipe']} labels{star} | {g['epoch']} | {g['train_loss']:.4f} | {g['val_ap']:.3f} | {g['val_roc_auc']:.3f} | {g['val_best_f1']:.3f} | {g['val_best_threshold']} |")
    w("")
    w("For comparison, the shipped model's validation average precision was 0.592 (from `results/exp2/results.md`).")
    w("")
    w("## Test results")
    w("")
    w(f"All three were scored on the same {dd['test']:,} test comments.")
    w("")
    w("| Method | Flagged | Precision (95% range) | Recall (95% range) | Missed cases | False alarms | F1 | Average precision | AUC |")
    w("| --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    w(f"| Keyword list (32 words) | {kw['flagged']} | {pct(kw['precision'])} ({ci(kw['precision_95ci'])}) | {pct(kw['recall'])} ({ci(kw['recall_95ci'])}) | {kw['missed']} | {kw['false_alarms']} | {kw['f1']:.3f} | n/a | n/a |")
    for name, m in (("Shipped word-count model", sh), ("Fine-tuned language model", ft)):
        w(f"| {name}, threshold {m['threshold']} | {m['flagged']} | {pct(m['precision'])} ({ci(m['precision_95ci'])}) | {pct(m['recall'])} ({ci(m['recall_95ci'])}) | {m['missed']} | {m['false_alarms']} | {m['f1']:.3f} | {m['average_precision']:.3f} | {m['roc_auc']:.3f} |")
    w("")
    w("At matched operating points, read off each model's test curve:")
    w("")
    w("| | Shipped word-count model | Fine-tuned language model |")
    w("| --- | --- | --- |")
    w(f"| Recall when precision is at least {pct(sh['precision'])} | {pct(sh['recall'])} | {pct(ft['matched']['recall_at_other_models_precision'])} |")
    w(f"| Precision when recall is at least {pct(sh['recall'])} | {pct(sh['precision'])} | {pct(ft['matched']['precision_at_other_models_recall'])} |")
    w(f"| Recall when precision is at least {pct(ft['precision'])} | {pct(sh['matched']['recall_at_other_models_precision'])} | {pct(ft['recall'])} |")
    w(f"| Precision when recall is at least {pct(ft['recall'])} | {pct(sh['matched']['precision_at_other_models_recall'])} | {pct(ft['precision'])} |")
    w("")
    w("## Our 60 messages")
    w("")
    w("| Slice | Messages | Labelled low mood | Fine-tuned: found | Fine-tuned: missed | Fine-tuned: false alarms | Shipped: found | Shipped: missed | Shipped: false alarms |")
    w("| --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for s, b in ms["by_slice"].items():
        a, c = b["finetuned"], b["shipped_tfidf"]
        w(f"| {s} | {b['n']} | {b['labelled_low_mood']} | {a['tp']} | {a['missed']} | {a['false_alarms']} | {c['tp']} | {c['missed']} | {c['false_alarms']} |")
    a, c = ms["finetuned"], ms["shipped_tfidf"]
    w(f"| **all** | {ms['n']} | {a['positives']} | {a['tp']} | {a['missed']} | {a['false_alarms']} | {c['tp']} | {c['missed']} | {c['false_alarms']} |")
    w("")
    w(f"Found by the fine-tuned model only: {', '.join(ms['found_only_by_finetuned']) or 'none'}. Found by the shipped model only: {', '.join(ms['found_only_by_shipped']) or 'none'}. "
      "The ids are in `experiments/exp2_words/test_messages.csv`. One message moves these counts, so read them as examples.")
    w("")
    w("## Four messages")
    w("")
    w("| Message | Fine-tuned score | Fine-tuned says | Shipped score | Shipped says |")
    w("| --- | --- | --- | --- | --- |")
    say = lambda b: "low mood" if b else "not low mood"
    for p in res["probes"]:
        w(f"| {p['text']} | {p['finetuned_score']:.3f} | {say(p['finetuned_low_mood'])} | {p['shipped_score']:.3f} | {say(p['shipped_low_mood'])} |")
    w("")
    w(f"The thresholds are {ch['threshold']} for the fine-tuned model and {sh['threshold']} for the shipped one. The scores are rankings and are not calibrated chances.")
    w("")
    w("## What shipping it would cost")
    w("")
    w(f"- **Size.** {mb(sz['finetuned_weight_bytes'])} of weights against {mb(sz['shipped_tone_json_bytes'])}. Storing the weights in 8 bits would cut that to roughly a quarter. We did not build or test that version.")
    w("- **A runtime.** The shipped model is about 30 lines of TypeScript with no dependencies. This one needs a tokenizer and a neural-network runtime in the browser, such as ONNX Runtime Web, which we have not added or tested.")
    w("- **The Android copy.** The Android keyboard runs the same word-count model in Kotlin and checks it against the web app. It would need its own runtime and a new parity check.")
    w(f"- **Speed.** {sp['finetuned_seconds_per_100_messages']:.1f} seconds for 100 messages, one at a time, on this laptop's CPU in PyTorch. A phone would be slower. The word-count model scores 100 messages in about {max(sp['shipped_python_seconds_per_100_messages'], 0.001) * 1000:.0f} milliseconds here.")
    w("")
    w("## Caveats")
    w("")
    w("- **One run, one seed.** GPU training is not exactly repeatable, so a second run will move these numbers a little.")
    w("- **GoEmotions is Reddit comments, mostly by adults.** None of it is teen texting, and the labels are emotions, which say nothing about depression or suicide risk.")
    w("- **The matched-point rows are read off the test curve.** They describe the curve. Only the two thresholds chosen on validation were tested.")
    w("- **The 60 messages are few and made up.** A Claude session wrote and labelled them, not teens.")
    w("- **Nothing in the app changed.** The app still loads the word-count model.")
    w("")
    w("*This project is a prototype and is not medical advice. The code and this write-up were made with Claude (Anthropic).*")
    w("")
    return "\n".join(L)


if __name__ == "__main__":
    if "--render" in sys.argv:
        (RES_DIR / "results.md").write_text(render_md(json.loads((RES_DIR / "results.json").read_text())), encoding="utf-8")
    else:
        main()
