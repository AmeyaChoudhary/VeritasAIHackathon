# Steady: knowing when to ask

**Track:** Health
**Team:** two high school students (names are on the submission form)
**Try it:** [the app](https://ameyachoudhary.github.io/VeritasAIHackathon/app/) runs in a browser with nothing to install, and [the site](https://ameyachoudhary.github.io/VeritasAIHackathon/) walks through the idea.

*This project is a prototype and is not medical advice.*

## The problem

One in five US teenagers has a major depressive episode in a year, and only about 40% of them get treatment ([NIMH](https://www.nimh.nih.gov/health/statistics/major-depression)). It builds over weeks, so no single day looks alarming, and the screening questions that work are asked about once a year at a checkup. Our user is Maya, 16, and her mom, who would not see a slow slide until it became a crisis.

## What we built

Steady is a prototype app on a teen's phone, linked once to a parent's phone.

- **In:** a two-tap check-in each week (how stressed, how much time with other people), the teen's answers to the PHQ-2 and PHQ-8 screening questions, weekly phone signals (sleep, messaging, activity), and the words the teen types.
- **Out:** for the teen, the screening questions at the weeks a model picks, and a suggestion to see a doctor. For the parent, a short note saying what changed, for how long, and how to start the conversation. A note never contains messages, answers or scores.
- **Demo:** both phones side by side. Press Play to watch Maya's 12 weeks: in week 6 the model asks her two weeks early, and in week 8 her mom gets the note. Type in the Type tab and the tone model scores your words in the browser. On a phone, the app installs to the home screen and runs offline.

![Week 8: Maya's phone suggests a doctor, and her mom's phone gets the note](docs/img/week8-both-phones.png)

## What we added

Our own idea, with our own question: can a phone tell us when to ask a teenager the screening questions, better than a calendar can?

## How it works

**Data**

- [College Experience Study](https://www.kaggle.com/datasets/subigyanepal/college-experience-dataset) (Dartmouth): 213 students and 16,886 student-weeks with a PHQ-2 answer. A week needs four usable days of phone data, and it counts as high when PHQ-2 is 3 or more (12.9% of weeks).
- [GoEmotions](https://huggingface.co/datasets/google-research-datasets/go_emotions) (Google): 54,263 Reddit comments in its own train, validation and test split. Low mood means sadness, grief, disappointment or remorse (6.4% of test comments).
- 60 teen-style messages to find failures, written by a separate AI session that had not seen our rules.

**Models**

- **When to ask.** We started with a drift rule: two phone signals outside the student's own range for two weeks. It failed (see Results), so we rebuilt the app to ask first. Everyone gets the two PHQ-2 questions once a month. Each week an ask model scores six numbers: this week's check-in, the student's usual check-in, their last PHQ-2 score and their average PHQ-2 score. When the score reaches its threshold, and the last ask was at least two weeks ago, Steady asks sooner. It is a logistic regression, small enough that the phone does the sum itself. Students, never weeks, are split between training and test.
- **When a parent is told.** Only the questionnaire can do it: a PHQ-8 score of 10 or more sends the note. The ask model and the check-in never send a parent anything. Phone signals are shown to the teen as context, name what changed in the note, and decide when to ask only if the teen stops checking in.
- **Tone.** TF-IDF over words and word pairs, then logistic regression. It is 698 KB, so it runs on the phone. It is trained on the share of raters who marked each comment as low mood. The threshold was chosen on validation data only.
- **Self-harm check.** A phrase list kept separate from the tone model. It is not machine learning and is not validated.

## Results

| Question | Simple baseline | Our models | Held-out test data |
| --- | --- | --- | --- |
| Is this message low mood? | Keyword list finds 24%: 263 missed, 89 false alarms | Tone model finds 50%: 171 missed, 123 false alarms | 5,427 comments, 345 of them low mood |
| Which weeks should Steady ask, at 12 asks a year? | Fixed calendar: 13% of asks land on a high week; 1,670 of 2,171 high weeks missed, 3,391 false alarms | The ask model the app runs: 44% (AUC 0.89); 586 high weeks missed, 2,012 false alarms. A phone-data model: 18% | 213 students; every model is scored on students it never saw |

![Share of asks that land on a week with a high PHQ-2, by method. The chart is from Experiment 3, before the ask model was built](results/exp3/hit_rates.png)

**Our main finding is that asking beat watching.** Our first idea failed its own test: the drift rule picked weeks no better than random weeks from the same student and term (14.6% against 14.9%), and a model with 686 phone features reached only 18%. A student's own answers did far better, so we built the ask model on them and put it in the app.

**What the ask model does and does not do.** It finds who to ask more often. It does not pick the week: random weeks from the same student and term landed on a high week 45% of the time, as often as the model's 44%. Most of its skill comes from earlier PHQ-2 answers, and the check-in adds a little (it raises the low periods reached from 80% to 83%). We tested it with answers at least 11 days old, as the app would have. With last week's answers it scores 0.91, and we report the lower number. It is a plain logistic regression. On the same inputs and students, a random forest, gradient-boosted trees (the method XGBoost uses) and a three-layer neural net all scored 0.89 as well, inside its 95% interval, so we kept the model a phone can run in a few lines and anyone can read.

**Where it fails**

- **Timing.** The ask model still missed 586 of 2,171 high weeks at this budget, and 2,012 of its asks landed on weeks that were not high. In the app the last answers will often be a month old, so it will do worse than this.
- **Groups.** A model on one check-in ranked weeks better for men (AUC 0.75) than for women (0.66), and we do not know why. We have not yet run this check on the ask model itself. Phone data was near chance for every gender and race group we could check. GoEmotions records nothing about its writers, so the tone model could not be checked.
- **Tone.** On our teen-style messages the model found 12 of 33. It learned from adult Reddit comments, and "sorry im late lol" scores as low mood.
- **Self-harm.** The phrase list missed 9 of 15 risk messages, most by one word: it has "this is my goodbye" and missed "this is goodbye". It also flagged 4 of 24 jokes, lyrics and sarcastic messages.
- **Who was studied.** Every student was in college, not high school.

## What we'd do next

1. **A better tone model.** We fine-tuned a small language model (`all-MiniLM-L6-v2`) on the same data. On the same test comments it found 62% of low-mood comments at 63% precision (131 missed, 127 false alarms), against 50% at 59% for the model in the app. We did not ship it: it is 91 MB against 698 KB, and on our teen-style messages it raised 8 false alarms against 2, mostly on dark jokes.
2. **A real self-harm model.** Replace the phrase list with a model built for self-harm language, and have a clinician review every rule and every parent note.
3. **High school students.** Test whether teens answer a two-tap check-in every week, and whether the ask model holds up on them. Run the group check on the ask model.

## Sources

- **Datasets:** College Experience Study (Nepal et al., IMWUT 2024; CC BY-NC-SA 4.0), GoEmotions (Apache-2.0), [Depresjon](https://datasets.simula.no/depresjon/) (Garcia-Ceja et al., MMSys 2018) and [StudentLife](https://zenodo.org/records/3529253) (Wang et al., UbiComp 2014; CC BY 4.0).
- **Questionnaires:** PHQ-2 and PHQ-8 (Kroenke, Spitzer and Williams).
- **Libraries:** scikit-learn, pandas, matplotlib, React, Vite and Remotion; the rest are listed in [app/README.md](app/README.md). Nothing in the app uses a pretrained model. The fine-tuning test used PyTorch, Transformers and the pretrained `sentence-transformers/all-MiniLM-L6-v2` (Apache-2.0).
- **AI tools:** Claude (Anthropic), through Claude Code, wrote the code and drafted the documents with us. Codex (OpenAI) reviewed Experiment 1b. The demo video's placeholder voice is Microsoft's en-US-AvaNeural, through edge-tts.
- **Full results:** [Experiment 1](results/exp1/results.md), [Experiment 1b](results/exp1b/results.md), [Experiment 2](results/exp2/results.md), [Experiment 2b](results/exp2b/results.md), [Experiment 3](results/exp3/results.md) and [Experiment 4](results/exp4/results.md).
