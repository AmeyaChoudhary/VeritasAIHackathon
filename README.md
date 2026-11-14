# Steady: knowing when to ask

Entry for the Veritas AI International High School Hackathon 2026, AI + Health track.

Steady is a concept for a phone app that a student owns. It learns the student's own normal for sleep, activity, contact with friends and the tone of what they type. When those signals stay outside that normal for two weeks, it asks the screening questions doctors use. It asks and never diagnoses, and nothing reaches an adult without the student's tap.

**This project is a prototype and is not medical advice.**

## Status

This repo is at the concept and plan stage. One dataset audit has been run. No model has been trained and there is no demo yet.

## What is here

| Path | What it is |
| --- | --- |
| [docs/concept.md](docs/concept.md) | The concept: the problem, what people need, what Steady is, how it decides, how we will build it, and the hard questions |
| [docs/signals-and-model-ideas.md](docs/signals-and-model-ideas.md) | Every signal we considered, how music fits, nine ideas for the model, and what a phone can and cannot see |
| [docs/Steady-product-concept.pdf](docs/Steady-product-concept.pdf) | An earlier, longer version of the concept (17 pages) |
| [audit/audit_reddit_dataset.py](audit/audit_reddit_dataset.py) | The audit of a dataset we decided not to train on |
| [audit/results.txt](audit/results.txt) | The output of that audit |

## The dataset audit

Before training on [Depression: Reddit Dataset (Cleaned)](https://www.kaggle.com/datasets/infamouscoder/depression-reddit-cleaned), we checked whether a rule that ignores meaning could score well on it. It can, so we will not train on it.

Results on a held-out test set of 1,530 posts:

| Method | Accuracy | Missed cases | False alarms |
| --- | --- | --- | --- |
| Always guess the most common label | 50.8% | 752 | 0 |
| Word count only ("more than 29 words") | 87.5% | 188 | 4 |
| Keyword list | 82.0% | 268 | 7 |
| TF-IDF + logistic regression, full text | 95.6% | 58 | 9 |
| The same model, first 14 words only, give-away words removed | 81.3% | 161 | 125 |

Counting words gets 87.5% without reading anything. No post labelled "not depression" is longer than 42 words, and the model's strongest words for that label include "sleep", "sad" and "miss". A model can score high here from post length and source alone, so the 95.6% does not show that it has learned signs of depression.

To run it again, download the CSV from the link above, then:

```
python -m venv .venv && source .venv/bin/activate
pip install pandas==3.1.1 numpy==2.5.4 scikit-learn==1.9.1
python audit/audit_reddit_dataset.py path/to/depression_dataset_reddit_cleaned.csv
```

`requirements.txt` also lists the packages for the experiments we have planned.

## Credits

The concept was researched and drafted with Claude (Anthropic), using Claude Code. The audit script was written with it too. Sources are linked where each figure appears in the docs.
