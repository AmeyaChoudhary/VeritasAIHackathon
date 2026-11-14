"""Audit of "Depression: Reddit Dataset (Cleaned)" before deciding whether to train on it.

Question: can a rule that never reads the meaning of a post score well on this dataset?
If so, a model trained on it may be learning the shortcut and not signs of depression.

Dataset: https://www.kaggle.com/datasets/infamouscoder/depression-reddit-cleaned
(not included in this repo; download the CSV and pass its path)

Usage: python audit/audit_reddit_dataset.py path/to/depression_dataset_reddit_cleaned.csv
"""
import sys, re, warnings
warnings.filterwarnings("ignore")
import numpy as np, pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, recall_score, precision_score

df = pd.read_csv(sys.argv[1]).drop_duplicates("clean_text")
df["text"] = df["clean_text"].astype(str)
df["n"] = df["text"].str.split().str.len()
y = df["is_depression"].values
tr, te = train_test_split(df, test_size=0.2, stratify=y, random_state=42)

def rep(name, yt, yp):
    miss = int(((yt == 1) & (yp == 0)).sum()); fa = int(((yt == 0) & (yp == 1)).sum())
    print(f"{name:55s} acc {accuracy_score(yt, yp):.3f}  recall {recall_score(yt, yp):.3f}  precision {precision_score(yt, yp, zero_division=0):.3f}  missed {miss}  false alarms {fa}")

yt = te["is_depression"].values
print("test size", len(te), "| share label 1:", round(yt.mean(), 3))
rep("baseline: most common label", yt, np.full(len(te), tr["is_depression"].mode()[0]))
# length-only rule: pick the best word-count threshold on the training set
best = max(range(5, 80), key=lambda k: accuracy_score(tr["is_depression"], (tr["n"] > k).astype(int)))
rep(f"length only: 'more than {best} words'", yt, (te["n"] > best).astype(int).values)
KW = ["depress", "suicid", "anxiety", "hopeless", "worthless", "kill myself", "want to die"]
rep("keyword list", yt, te["text"].apply(lambda t: int(any(k in t for k in KW))).values)

def fit_eval(name, f):
    v = TfidfVectorizer(min_df=2)
    m = LogisticRegression(max_iter=2000).fit(v.fit_transform(tr["text"].map(f)), tr["is_depression"])
    rep(name, yt, m.predict(v.transform(te["text"].map(f))))
    return v, m

fit_eval("TF-IDF + LR, full text", lambda t: t)
first = lambda k: (lambda t: " ".join(t.split()[:k]))
fit_eval("TF-IDF + LR, first 14 words only", first(14))
GIVE = re.compile(r"\b(depress\w*|anxi\w*|suicid\w*|therap\w*|mental|illness|disorder|diagnos\w*|medication|meds|antidepress\w*)\b")
mask = lambda t: GIVE.sub(" ", t)
fit_eval("TF-IDF + LR, give-away words removed", mask)
v, m = fit_eval("TF-IDF + LR, first 14 words + give-aways removed", lambda t: " ".join(mask(t).split()[:14]))
w = np.array(v.get_feature_names_out()); o = np.argsort(m.coef_[0])
print("top words -> label 1:", list(w[o[-25:]][::-1]))
print("top words -> label 0:", list(w[o[:25]]))
# how many label-1 rows look like tweets (short) vs long posts
print("label 1 rows with <= 30 words:", int(((df.is_depression == 1) & (df.n <= 30)).sum()), "of", int((df.is_depression == 1).sum()))
print("label 0 rows with > 42 words:", int(((df.is_depression == 0) & (df.n > 42)).sum()))
