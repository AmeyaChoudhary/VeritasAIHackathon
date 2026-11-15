# Steady: knowing when to ask

Entry for the Veritas AI International High School Hackathon 2026, AI + Health track.

Steady is a concept for an app on a teenager's phone. Each week the student answers a two-tap check-in, and once a month Steady asks the two screening questions doctors use. A small model reads the check-ins and the earlier answers and asks sooner when its score is high. Steady also learns the student's own normal for sleep, activity, contact with friends and the tone of what they type, and shows where those stand. When the answers are high, or those signals stay outside the normal for four weeks while the questions go unanswered, it sends a linked parent a short note asking them to talk with their teen. Words about suicide or self-harm can send an urgent note. The student is told at setup that a parent is linked, and notes never contain their messages, answers or scores. It asks and never diagnoses.

**This project is a prototype and is not medical advice.**

**Start with [the one-page write-up](WRITEUP.md).** It covers the problem, what we built, the results against a baseline, and where it fails.

- **[The Steady site](https://ameyachoudhary.github.io/VeritasAIHackathon/)** tells the whole idea as you scroll, with the video and a link to the app.
- **[The app](https://ameyachoudhary.github.io/VeritasAIHackathon/app/)** runs in a browser with nothing to install. On a laptop it shows Maya's phone and her mom's side by side: pick "Maya's 12 weeks" and press Play. On a phone it can be added to the home screen and opens offline.
- **[The demo video](docs/video/steady-demo.mp4)** is 1 minute 53 seconds.

![Week 8 in the app: Maya's phone suggests a doctor, and her mom's phone gets the note](docs/img/week8-both-phones.png)

## Status

The experiments have run, and the app works end to end on sample data. No clinician has reviewed any of it.

- **Timing (Experiment 1).** On 213 Dartmouth students, the drift rule picked weeks to ask no better than random weeks from the same student and season. A heads-up from phone signals alone did no better than a calendar. The questionnaire does the real work. [Results](results/exp1/results.md).
- **Deeper check (Experiment 1b).** Using only phone data recorded before the answer, models picked out high PHQ-2 weeks in students they never saw at AUC 0.57 to 0.60. A single check-in from the week before (mood picture, stress, time with others) reached 0.69, and every earlier check-in together 0.74 to 0.78. With every questionnaire input at least 14 days old, earlier PHQ-2 answers plus check-ins reached 0.89, mostly from students who stay high. Adding phone data to the answer history added nothing reliable. Versions built to cheat on purpose reached 0.98. These are cross-validation estimates for each model, checked by an outside review. [Results](results/exp1b/results.md).
- **Asking (Experiment 3).** Every way of picking the week, scored the same way at 12 asks per student-year. 24% of the asks chosen from one short check-in landed on a high week, against 13% for a fixed calendar and 18% for a phone model. Random weeks from the same student and quarter reached 23%, so the check-in finds which students and which term to ask in, and the exact week adds about one point. [Results](results/exp3/results.md).
- **The ask model (Experiment 4).** The model the app now runs to decide when to ask: a logistic regression on this week's check-in, the student's usual check-in, and their last and average PHQ-2 scores. On students it never saw it scored an AUC of 0.89 (0.87 to 0.91). At 12 asks per student-year, 44% of its asks landed on a high week, against 13% for a fixed calendar. It missed 586 of 2,171 high weeks and raised 2,012 false alarms. It finds who to ask more often and does not pick the week: random weeks from the same student and quarter reached 45%. The earlier answers it saw were at least 11 days old, as they would be in the app; with last week's answers the same model scored 0.91. [Results](results/exp4/results.md).
- **Groups (Experiment 3).** The check-in model ranked weeks better for men (AUC 0.75) than for women (0.66). Phone data was near chance for every gender and race group with at least 20 students.
- **Words (Experiment 2).** The tone model found 50% of low-mood Reddit comments at 59% precision, against 24% at 48% for a keyword list. It was retrained on how many raters marked each comment; the earlier version found 55% at 52% precision. The self-harm phrase list missed 9 of 15 risk messages written blind. [Results](results/exp2/results.md).
- **A fine-tuned tone model (Experiment 2b).** A small language model (`all-MiniLM-L6-v2`), fine-tuned on the same data, found 62% of low-mood comments at 63% precision (131 missed, 127 false alarms), against 50% at 59% (171 missed, 123 false alarms) for the model in the app. On our 60 teen-style messages it found 13 of 33 with 8 false alarms, against 12 with 2, because it flags dark jokes. It is 91 MB against 698 KB. It is not in the app. [Results](results/exp2b/results.md).
- **The app.** A teen phone and a parent phone side by side, playing the rules in [Parent alerts](docs/parent-alerts.md) with made-up data and a simulated clock. The teen's Home screen has the two-tap check-in, and the ask model from Experiment 4 decides when the two questions come up. Events move between browser tabs; there is no server yet. It installs to a phone's home screen and opens offline.
- **Connected accounts.** The teen can connect Gmail, Google Calendar, Last.fm and screen time. Each one works with sample data now. Real sign-in needs two keys the team has to create (see [app/README.md](app/README.md)), and has not been tested end to end.
- **Screen time.** The Android app in [native/android](native/android/) builds and runs in an emulator. The iPhone version in [native/ios](native/ios/) builds with no warnings in Xcode 27 and runs in the Simulator up to the Screen Time permission, which the Simulator cannot grant. Reading real screen time needs a real iPhone and an Apple developer team.

## What is here

| Path | What it is |
| --- | --- |
| [WRITEUP.md](WRITEUP.md) | The one-page write-up in the hackathon's template |
| [docs/video-script.md](docs/video-script.md) | The demo video's script, and how to record your own voice over it |
| [docs/concept.md](docs/concept.md) | The concept: the problem, what people need, what Steady is, how it decides, how we will build it, and the hard questions |
| [docs/parent-alerts.md](docs/parent-alerts.md) | When a parent is told, what each note says, what leaves the phone, and what this does not solve |
| [docs/signals-and-model-ideas.md](docs/signals-and-model-ideas.md) | Every signal we considered, how music fits, nine ideas for the model, and what a phone can and cannot see |
| [docs/Steady-product-concept.pdf](docs/Steady-product-concept.pdf) | An earlier, longer version of the concept (17 pages). It describes our first design, where the student decided whether an adult was told. [Parent alerts](docs/parent-alerts.md) replaces that part. Where the PDF and these docs differ, the docs are current |
| [app/](app/) | The working prototype: teen phone, parent phone and demo controls. See [app/README.md](app/README.md) |
| [site/](site/) | The landing page: a static, scroll-driven page with no build step |
| [video/](video/) | The demo video's source: script, teleprompter, scenes, and the tools that time every animation to the voice. See [docs/video-script.md](docs/video-script.md) |
| [native/](native/) | Screen-time collectors: an Android app and an iPhone app with two Screen Time extensions, both building |
| [experiments/exp1_timing.py](experiments/exp1_timing.py) | Experiment 1: does the drift rule pick better weeks to ask, and to alert a parent, than a calendar? |
| [experiments/exp1b_deeper.py](experiments/exp1b_deeper.py) | Experiment 1b: the best honest numbers across five framings, with leakage checks, deliberate leaks for comparison, and two outside datasets (Depresjon, StudentLife) |
| [experiments/exp2_words.py](experiments/exp2_words.py) | Experiment 2: the tone model and the self-harm phrase check, with [our 60 test messages](experiments/exp2_words/test_messages.csv) |
| [experiments/exp3_asking.py](experiments/exp3_asking.py) | Experiment 3: the drift rule, a phone model, check-in models and a follow-up rule at the same number of asks, and the same numbers by gender and race |
| [experiments/exp4_ask_model.py](experiments/exp4_ask_model.py) | Experiment 4: trains and tests the ask model, and writes the weights the app loads (`app/src/engine/ask_model.json`) |
| [experiments/exp2b_finetune.py](experiments/exp2b_finetune.py) | Experiment 2b: fine-tunes a small language model for tone and compares it with the model in the app |
| [notebooks/](notebooks/) | The experiments as executed notebooks with charts |
| [results/](results/) | Write-ups and every number for each experiment |
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

Then open http://localhost:5210. Pick "Maya's 12 weeks" and press Next week or Play. `npm test` runs the 206 rule tests. Everything runs in the browser and works offline once loaded.

**The site** has no build step. From the repo root, run `python3 -m http.server 8000` and open http://localhost:8000/site/. Its links to the app work once the site is deployed, where the app sits at `/app/`.

**The video** needs Node 22 and ffmpeg:

```
cd video
npm install
npx remotion render src/index.ts Main out/steady-demo.mp4
```

**The experiments** need Python 3.13. The College Experience Study has its own terms: academic or educational use only, and no attempt to re-identify anyone. Downloading it means you accept them.

```
bash scripts/get_data.sh
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python experiments/exp1_timing.py
python experiments/exp1b_deeper.py
python experiments/exp2_words.py
python experiments/exp3_asking.py
python experiments/exp4_ask_model.py
python experiments/exp2b_finetune.py   # optional
```

Experiment 1 takes about a minute, Experiment 1b about five, Experiment 2 about ten seconds, Experiment 3 about two minutes and Experiment 4 under a minute. Experiments 3 and 4 read the tables the first two build. Experiment 4 also writes the ask model the app loads. Experiment 2b is optional: it needs `torch` and `transformers` (both in `requirements.txt`), downloads a 90 MB pretrained model from Hugging Face, and took 11 minutes on an Apple GPU. We re-ran Experiments 1, 1b and 2 from the raw data on a second computer: Experiments 1 and 2 gave the same numbers, and Experiment 1b's AUCs matched to within 0.001. The data script carries on if Depresjon or StudentLife fails to download, and Experiment 1b then leaves that dataset out. Depresjon asks for a citation of Garcia-Ceja et al., MMSys 2018, and StudentLife (CC BY 4.0) of Wang et al., UbiComp 2014. Experiment 2 also writes the tone model the app loads.

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
