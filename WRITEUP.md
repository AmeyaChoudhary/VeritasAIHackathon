# Steady: knowing when to ask

**Track:** Health
**Team:** two high school students (names are on the submission form)

*This project is a prototype and is not medical advice.*

## The problem

One in five US teenagers has a major depressive episode in a year, and only about 40% of them get treatment ([NIMH](https://www.nimh.nih.gov/health/statistics/major-depression)). It builds over weeks, so no single day looks alarming, and the screening questions that work are asked about once a year at a checkup. Our user is Maya, 16, and her mom, who would not see a slow slide until it became a crisis.

## What we built

Steady is a prototype app on a teen's phone, linked once to a parent's phone.

- **In:** weekly phone signals (sleep, messaging, activity), the words the teen types, and their answers to the PHQ-2 and PHQ-8 screening questions.
- **Out:** for the teen, the screening questions and a suggestion to see a doctor. For the parent, a short note saying what changed, for how long, and how to start the conversation. A note never contains messages, answers or scores.
- **Demo:** [`app/`](app/) shows both phones side by side. Press Play to watch Maya's 12 weeks. Type in the Type tab and the tone model scores your words in the browser.

![Week 8: Maya's phone suggests a doctor, and her mom's phone gets the note](docs/img/week8-both-phones.png)

## What we added

Our own idea, with our own question: does watching a phone pick the week to ask better than a calendar does?

## How it works

**Data**

- [College Experience Study](https://www.kaggle.com/datasets/subigyanepal/college-experience-dataset) (Dartmouth): 213 students and 16,886 student-weeks with a PHQ-2 answer. A week needs four usable days of phone data, and it counts as high when PHQ-2 is 3 or more (12.9% of weeks).
- [GoEmotions](https://huggingface.co/datasets/google-research-datasets/go_emotions) (Google): 54,263 Reddit comments in its own train, validation and test split. Low mood means sadness, grief, disappointment or remorse (6.4% of test comments).
- 60 teen-style messages to find failures, written by a separate AI session that had not seen our rules.

**Models**

- **Timing.** A drift rule (two signals outside the student's own range for two weeks) and a logistic regression on the same signals. Then gradient boosting and a random forest on 686 phone features. Students, never weeks, are split between training and test.
- **Tone.** TF-IDF over words and word pairs, then logistic regression. It is 496 KB, so it runs on the phone. The threshold was chosen on validation data only.
- **Self-harm check.** A phrase list kept separate from the tone model. It is not machine learning and is not validated.

## Results

| Question | Simple baseline | Our model | Held-out test data |
| --- | --- | --- | --- |
| Is this message low mood? | Keyword list finds 24%: 263 missed, 89 false alarms | Tone model finds 55%: 156 missed, 176 false alarms | 5,427 comments, 345 of them low mood |
| Which week should Steady ask? | Fixed calendar: 12.9% of asks land on a high week | Drift rule: 14.6%. Random weeks from the same student and season: 14.9%. Logistic regression: AUC 0.48 | 213 students; the regression is scored on the half it never saw |
| Is this a high week, for a student never seen? | The student's most recent answer alone: AUC 0.88 | Phone data alone: 0.57 to 0.60. One short check-in from the week before: 0.69 | Five folds, split by student |

**Our main finding is that asking beat watching.** The tone model beats its baseline. The timing model does not: phone signals picked the week no better than chance, and one short check-in from the student did better than 686 phone features.

**Where it fails**

- **Timing.** The drift rule left 1,164 of 2,171 high weeks without an ask, and 5,869 of its asks landed on weeks that were not high.
- **Tone.** On our teen-style messages the model found 11 of 33. It learned from adult Reddit comments, and "sorry im late lol" scores as low mood.
- **Self-harm.** The phrase list missed 9 of 15 risk messages, most by one word: it has "this is my goodbye" and missed "this is goodbye". It also flagged 4 of 24 jokes, lyrics and sarcastic messages.
- **Groups.** The rule did no better than chance on iPhone (183 students) or Android (30). We have not checked by sex, and every student was in college, not high school.

## What we'd do next

1. Rebuild the rules around what worked: a one-tap check-in each week and the two questions on a schedule, with phone signals as context. Then test it with high school students.
2. Replace the phrase list with a model built for self-harm language, and have a clinician review every rule and every parent note.

## Sources

- **Datasets:** College Experience Study (CC BY-NC-SA 4.0), GoEmotions (Apache-2.0), [Depresjon](https://datasets.simula.no/depresjon/) (Garcia-Ceja et al., MMSys 2018) and [StudentLife](https://zenodo.org/records/3529253) (Wang et al., UbiComp 2014, CC BY 4.0).
- **Questionnaires:** PHQ-2 and PHQ-8 (Kroenke, Spitzer and Williams).
- **Libraries:** scikit-learn, pandas, React and Vite; the rest are listed in [app/README.md](app/README.md). No pretrained models.
- **AI tools:** Claude (Anthropic), through Claude Code, wrote the code and drafted the documents with us. Codex (OpenAI) reviewed Experiment 1b.
- **Full results:** [Experiment 1](results/exp1/results.md), [Experiment 1b](results/exp1b/results.md) and [Experiment 2](results/exp2/results.md).
