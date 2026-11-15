# Steady: knowing when to ask

Entry for the Veritas AI International High School Hackathon 2026, AI + Health track.

Steady is a concept for an app on a teenager's phone. It learns the student's own normal for sleep, activity, contact with friends and the tone of what they type. When those signals stay outside that normal for two weeks, it asks the screening questions doctors use. When the answers are high, or the change lasts four weeks while the questions go unanswered, it sends a linked parent a short note asking them to talk with their teen. Words about suicide or self-harm can send an urgent note. The student is told at setup that a parent is linked, and notes never contain their messages, answers or scores. It asks and never diagnoses.

**This project is a prototype and is not medical advice.**

**Start with [the one-page write-up](WRITEUP.md).** It covers the problem, what we built, the results against a baseline, and where it fails.

![Week 8 of the demo: Maya's phone suggests a doctor, and her mom's phone gets the note](docs/img/week8-both-phones.png)

## Status

Both experiments have run, and the app works end to end on sample data. No clinician has reviewed any of it.

- **Timing (Experiment 1).** On 213 Dartmouth students, the drift rule picked weeks to ask no better than random weeks from the same student and season. A heads-up from phone signals alone did no better than a calendar. The questionnaire does the real work. [Results](results/exp1/results.md).
- **Deeper check (Experiment 1b).** Using only phone data recorded before the answer, models picked out high PHQ-2 weeks in students they never saw at AUC 0.57 to 0.60. A single check-in from the week before (mood picture, stress, time with others) reached 0.69, and every earlier check-in together 0.74 to 0.78. With every questionnaire input at least 14 days old, earlier PHQ-2 answers plus check-ins reached 0.89, mostly from students who stay high. Adding phone data to the answer history added nothing reliable. Versions built to cheat on purpose reached 0.98. These are cross-validation estimates for each model, checked by an outside review. [Results](results/exp1b/results.md).
- **Words (Experiment 2).** The tone model found 55% of low-mood Reddit comments at 52% precision, against 24% for a keyword list. The self-harm phrase list missed 9 of 15 risk messages written blind. [Results](results/exp2/results.md).
- **The app.** A teen phone and a parent phone side by side, playing the rules in [Parent alerts](docs/parent-alerts.md) with made-up data and a simulated clock. Events move between browser tabs; there is no server yet.
- **Connected accounts.** The teen can connect Gmail, Google Calendar, Last.fm and screen time. Each one works with sample data now. Real sign-in needs two keys the team has to create (see [app/README.md](app/README.md)), and has not been tested end to end.
- **Screen time.** The Android app in [native/android](native/android/) builds and runs in an emulator. The iPhone version in [native/ios](native/ios/) builds with no warnings in Xcode 27 and runs in the Simulator up to the Screen Time permission, which the Simulator cannot grant. Reading real screen time needs a real iPhone and an Apple developer team.

## What is here

| Path | What it is |
| --- | --- |
| [WRITEUP.md](WRITEUP.md) | The one-page write-up in the hackathon's template |
| [docs/video-script.md](docs/video-script.md) | The script and click path for the two-minute demo video |
| [docs/concept.md](docs/concept.md) | The concept: the problem, what people need, what Steady is, how it decides, how we will build it, and the hard questions |
| [docs/parent-alerts.md](docs/parent-alerts.md) | When a parent is told, what each note says, what leaves the phone, and what this does not solve |
| [docs/signals-and-model-ideas.md](docs/signals-and-model-ideas.md) | Every signal we considered, how music fits, nine ideas for the model, and what a phone can and cannot see |
| [docs/Steady-product-concept.pdf](docs/Steady-product-concept.pdf) | An earlier, longer version of the concept (17 pages). It describes our first design, where the student decided whether an adult was told. [Parent alerts](docs/parent-alerts.md) replaces that part. Where the PDF and these docs differ, the docs are current |
| [app/](app/) | The working prototype: teen phone, parent phone and demo controls. See [app/README.md](app/README.md) |
| [native/](native/) | Screen-time collectors: an Android app and an iPhone app with two Screen Time extensions, both building |
| [experiments/exp1_timing.py](experiments/exp1_timing.py) | Experiment 1: does the drift rule pick better weeks to ask, and to alert a parent, than a calendar? |
| [experiments/exp1b_deeper.py](experiments/exp1b_deeper.py) | Experiment 1b: the best honest numbers across five framings, with leakage checks, deliberate leaks for comparison, and two outside datasets (Depresjon, StudentLife) |
| [experiments/exp2_words.py](experiments/exp2_words.py) | Experiment 2: the tone model and the self-harm phrase check, with [our 60 test messages](experiments/exp2_words/test_messages.csv) |
| [notebooks/](notebooks/) | Both experiments as executed notebooks with charts |
| [results/](results/) | Write-ups and every number for both experiments |
| [scripts/get_data.sh](scripts/get_data.sh) | Downloads the open data into `data/` |
| [audit/audit_reddit_dataset.py](audit/audit_reddit_dataset.py) | The audit of a dataset we decided not to train on |
| [audit/results.txt](audit/results.txt) | The output of that audit |

## Run it

**The app** needs Node 22 or newer:

```
cd app
npm install
npm run dev -- --port 5210
```

Then open http://localhost:5210. Pick "Maya's 12 weeks" and press Next week. `npm test` runs the rule tests. Everything runs in the browser and works offline once loaded.

**The experiments** need Python 3.13. The College Experience Study has its own terms: academic or educational use only, and no attempt to re-identify anyone. Downloading it means you accept them.

```
bash scripts/get_data.sh
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python experiments/exp1_timing.py
python experiments/exp1b_deeper.py
python experiments/exp2_words.py
```

Experiment 1 takes about a minute, Experiment 1b about four, and Experiment 2 about ten seconds. Depresjon asks for a citation of Garcia-Ceja et al., MMSys 2018, and StudentLife (CC BY 4.0) of Wang et al., UbiComp 2014. Experiment 2 also writes the tone model the app loads.

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

The experiments need everything in `requirements.txt`; the audit needs only these three.

## Credits

The concept was researched and drafted with Claude (Anthropic), using Claude Code. The audit script was written with it too. Sources are linked where each figure appears in the docs.
