# Experiment 5: a model for self-harm language

Generated 2026-11-15 by `experiments/exp5_risk_words.py`. Data: Suicide and Depression Detection (Komati, CC BY-SA 4.0) and Sentiment Analysis for Mental Health (Lim, ODbL), both on Kaggle. Every number is an aggregate.

## Short answer

On 28,277 held-out posts, the self-harm model found 92% of self-harm posts at 90% precision; the phrase list found 52%. On our 60 messages, phrase list plus model found 13 of 15 self-harm messages (phrase list alone 6), with 5 false alarms (phrase list alone 4).

It passed the rule we wrote before running it, so the app now runs it beside the phrase list. It can only raise a concern, which first asks the teen "Are you safe right now?".

## What we tested

The app's self-harm check is a hand-written phrase list. In Experiment 2 it missed 9 of our 15 self-harm test messages. Here a model learns self-harm language from labelled posts, in the same format as the tone model (TF-IDF over words and word pairs, then logistic regression), so the phone can run it. A post counts as self-harm language when it came from r/SuicideWatch or was tagged Suicidal. Depression, anxiety and stress posts count as not, so the model has to tell self-harm language apart from sadness.

- **Posts.** 285,117 in the two files; 415 empty, 1,844 duplicates and 28 texts with both labels removed; 282,768 left. 45% are self-harm language.
- **Split.** 226,214 train, 28,277 validation, 28,277 test, stratified by source and label.
- **Chosen on validation.** 40,000 terms, sublinear tf, C 4.0, threshold 0.415. The model file is 1.0 MB.
- **The rule for the app, written first.** The model only ever adds a "concern", never the "plan" path. It goes in the app only if phrase list or model finds more self-harm test posts than the phrase list alone, and, on our 60 messages, finds more of the 15 self-harm messages with at most one more false alarm among the other 45.

## Held-out posts

| Method | Flagged | Precision (95% range) | Recall (95% range) | Missed | False alarms |
| --- | --- | --- | --- | --- | --- |
| Phrase list (in the app) | 7,183 | 91.7% (91.0% to 92.3%) | 52.0% (51.2% to 52.8%) | 6,075 | 596 |
| Model | 12,989 | 89.9% (89.3% to 90.4%) | 92.2% (91.7% to 92.6%) | 989 | 1,316 |
| Phrase list or model | 13,334 | 88.3% | 93.0% | 886 | 1,558 |

12,662 of the 28,277 test posts are self-harm language. The model's average precision is 0.965 and its AUC 0.972.

Share of each kind of post flagged:

| Posts | How many | Self-harm label | Model flagged | Phrase list flagged |
| --- | --- | --- | --- | --- |
| r/SuicideWatch | 11,600 | yes | 93% | 53% |
| r/teenagers | 11,585 | no | 5% | 2% |
| Normal | 1,562 | no | 4% | 0% |
| Depression | 1,492 | no | 32% | 20% |
| Suicidal | 1,062 | yes | 79% | 47% |
| Anxiety | 366 | no | 10% | 3% |
| Bipolar | 263 | no | 25% | 13% |
| Stress | 238 | no | 22% | 2% |
| Personality disorder | 109 | no | 32% | 6% |

## Our 60 messages

| Slice | Messages | Self-harm | Phrase list: found / false alarms | Model: found / false alarms | Either: found / false alarms |
| --- | --- | --- | --- | --- | --- |
| everyday | 10 | 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| low_mood | 11 | 0 | 0 / 0 | 0 / 1 | 0 / 1 |
| lyric_style | 8 | 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| dark_joke | 8 | 0 | 0 / 4 | 0 / 2 | 0 / 4 |
| sarcasm | 8 | 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| risk_concern | 6 | 6 | 2 / 0 | 5 / 0 | 5 / 0 |
| risk_plan | 9 | 9 | 4 / 0 | 7 / 0 | 8 / 0 |
| **all** | 60 | 15 | 6 / 4 | 12 / 3 | 13 / 5 |

## Words that weigh most

- Toward self-harm: `suicidal`, `suicide`, `kill`, `pills`, `life`, `https t`, `mei`, `helpi`, `sw`, `iti`, `anymorei`, `myself`, `die`, `myselfi`, `killing`, `kill yourself`, `meim`, `method`, `attempt`, `od`
- Away from it: `wa`, `avpd`, `tw`, `teenagers`, `i wa`, `health anxiety`, `minecraft`, `rant`, `horny`, `can t`, `crush`, `bruh`, `ha`, `i m`, `nn`, `it s`, `mania`, `do not`, `bp`, `boys`

## Caveats

- It flagged 32% of posts labelled Depression (the phrase list 20%). Each flag only asks the teen if they are safe, but a clinician has to decide whether that is acceptable.
- The labels come from where a post was written (r/SuicideWatch, or a source dataset's tag), not from a clinician. Some r/SuicideWatch posts are people supporting others, and some posts elsewhere talk about self-harm.
- These are long posts (median 60 words), mostly by adults. Stability reads short messages from teens.
- 45% of these posts are self-harm language. In a teen's real messages it is far rarer, so the share of flags that are right would be much lower than on the test posts.
- The 60 messages were written and labelled by a Claude session, not by teens or clinicians. One message moves a count.
- Nothing here is clinically validated. A clinician has to review any self-harm check before anyone relies on it.

## How to run

```
bash scripts/get_data.sh       # downloads both Kaggle files into data/
.venv/bin/python -I experiments/exp5_risk_words.py
```

*This project is a prototype and is not medical advice. It was written with Claude (Anthropic).*
