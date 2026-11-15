# Steady: knowing when to ask

**Track:** Health
**Team:** two high school students (names are on the submission form)
**Try it:** [the app](https://ameyachoudhary.github.io/VeritasAIHackathon/app/) runs in a browser with nothing to install, and [the site](https://ameyachoudhary.github.io/VeritasAIHackathon/) walks through the idea.

*This project is a prototype and is not medical advice.*

## The problem

One in five US teenagers has a major depressive episode in a year, and only about 40% of them get treatment ([NIMH](https://www.nimh.nih.gov/health/statistics/major-depression)). It builds over weeks, and the screening questions that work are asked about once a year. Our user is Maya, 16, and her mom, who would not see a slow slide until it became a crisis.

## What we built

Steady is a prototype app on a teen's phone, linked once to a parent's phone.

- **In:** a two-tap check-in each week (how stressed, how much time with other people), the teen's answers to the PHQ-2 and PHQ-8 screening questions, weekly phone signals (sleep, messaging, activity), and the words the teen types.
- **Out:** for the teen, the screening questions when a model picks, and a nudge to see a doctor. For the parent, a short note on what changed and how to start the conversation, never messages, answers or scores.
- **Demo:** Maya's phone and her mom's, side by side. In week 6 the model asks Maya early; in week 8 her mom gets the note.

![Week 8: Maya's phone suggests a doctor, and her mom's phone gets the note](docs/img/week8-both-phones.png)

## What we added

Our own idea, with our own question: can a phone tell us when to ask a teenager the screening questions, better than a calendar can?

## How it works

- **When to ask.** Everyone gets the two PHQ-2 questions once a month. Each week an ask model (logistic regression, computed on the phone) scores the check-in and earlier PHQ-2 answers, and asks sooner when the score is high. Trained on the [College Experience Study](https://www.kaggle.com/datasets/subigyanepal/college-experience-dataset): 213 students and 16,886 weeks with a PHQ-2, split by student.
- **When a parent is told.** When the PHQ-8 is 10 or more, or on self-harm words. Phone signals only name what changed, and pick when to ask if check-ins stop.
- **Tone.** TF-IDF and logistic regression (698 KB) on [GoEmotions](https://huggingface.co/datasets/google-research-datasets/go_emotions) Reddit comments (low mood: sadness, grief, disappointment or remorse).
- **Self-harm.** A phrase list, then a model in the same format (1 MB) trained on 282,768 posts from [two](https://www.kaggle.com/datasets/nikhileswarkomati/suicide-watch) [Kaggle sets](https://www.kaggle.com/datasets/szegeelim/mental-health). A flag from the model alone only asks the teen "Are you safe right now?"; only "no" reaches a parent.
- **Failure tests.** 60 teen-style messages (jokes, lyrics, sarcasm, real risk) written by a separate AI session.

## Results

| Question | Simple baseline | Our model | Held-out test |
| --- | --- | --- | --- |
| Is this message low mood? | Keyword list finds 24%: 263 missed, 89 false alarms | Tone model finds 50%: 171 missed, 123 false alarms | 5,427 comments, 345 low mood |
| Is this message about self-harm? | Phrase list finds 52%: 6,075 missed, 596 false alarms | Model finds 92% at 90% precision: 989 missed, 1,316 false alarms | 28,277 posts, labelled by forum |
| Is this person at risk? | Phrase list flags 70% of at-risk users and 45% of users helping others | AUC 0.66; flags 99% of at-risk users (4 missed) but 86% of users helping others | 500 Reddit users rated by psychiatrists |
| Which weeks should Steady ask, at 12 asks a year? | Fixed calendar: 13% of asks land on a high week; 1,670 missed, 3,391 false alarms | Ask model: 44% (AUC 0.89); 586 of 2,171 high weeks missed, 2,012 false alarms | 213 college students never seen |
| Does the ask model hold up on teens? | Asking at random: 41% of asks land on a high answer | Same model, unchanged: 74% (AUC 0.85); 14 of 46 high answers missed, 11 false alarms | 113 teens aged 12 to 17 never seen |

**Our first idea failed.** A drift rule (ask when two phone signals leave the student's own range) picked weeks no better than chance: 14.6% against 14.9% for random weeks from the same student and term. 686 phone features reached only 18%. So we rebuilt Steady to ask first ([Experiment 1](results/exp1/results.md), [Experiment 3](results/exp3/results.md)).

**Our self-harm model failed a harder test.** Its training labels came from the forum a post was in, with r/teenagers as "not suicidal". On users rated by psychiatrists, all from the same forums, it could not tell a crisis from someone helping: "please don't kill yourself" reads like a crisis. So alone it now only asks the teen, and no answer sends nothing ([Experiment 5b](results/exp5b/results.md)).

**What the ask model does.** It finds who to ask more often, not which week: random weeks for the same students did as well (45%). A random forest, gradient-boosted trees (the XGBoost method) and a neural net all tied at 0.89, so we kept the one anyone can read ([Experiment 4](results/exp4/results.md)). On 113 teenagers (mostly German-speaking, in the pandemic, with no check-in) it scored 0.85 without retraining ([Experiment 6](results/exp6/results.md)).

**Where it fails**

- **Groups.** The ask model scored 0.93 for boys and 0.86 for girls on the teens' later answers. A check-in model scored 0.75 for college men and 0.66 for women. GoEmotions records nothing about its writers, so the tone model could not be checked.
- **Self-harm.** On our 60 messages the phrase list found 6 of 15 risk messages; with the model, 13 of 15, with 5 false alarms against 4. It also flags 32% of depression posts ([Experiment 5](results/exp5/results.md)).
- **Tone.** It found 12 of our 33 low-mood messages, and "sorry im late lol" scores as low mood ([Experiment 2](results/exp2/results.md)).

## What we'd do next

1. **A better tone model.** A fine-tuned `all-MiniLM-L6-v2` found 62% of low-mood comments, but is 91 MB and flags dark jokes ([Experiment 2b](results/exp2b/results.md)).
2. **A self-harm model trained on clinician labels** (Reddit C-SSRS, UMD Suicidality), built and reviewed with a clinician, along with every parent note.
3. **US high school students.** Test whether they answer the check-in weekly, and whether the model holds up with it.

## Sources

- **Datasets:** College Experience Study (Nepal et al., IMWUT 2024; CC BY-NC-SA 4.0), GoEmotions (Apache-2.0), Suicide and Depression Detection (Komati et al., IEEE 2021; CC BY-SA 4.0), Sentiment Analysis for Mental Health (Sze Gee Lim; ODbL), [Reddit C-SSRS](https://zenodo.org/records/4543776) (Gaur et al., WWW 2019; CC BY 4.0), [Corona Health adolescent study](https://zenodo.org/records/15101756) (University of Wurzburg; CC BY 4.0), [Depresjon](https://datasets.simula.no/depresjon/) (Garcia-Ceja et al., MMSys 2018) and [StudentLife](https://zenodo.org/records/3529253) (Wang et al., UbiComp 2014; CC BY 4.0).
- **Questionnaires:** PHQ-2 and PHQ-8 (Kroenke, Spitzer and Williams).
- **Libraries:** scikit-learn, pandas, React, Vite, Remotion, PyTorch ([full list](app/README.md)).
- **AI tools:** Claude (Anthropic), through Claude Code, wrote the code and drafted the documents with us. Codex (OpenAI) reviewed Experiment 1b. The video's placeholder voice is en-US-AvaNeural, via edge-tts.
- **Full results:** [results/](results/), one write-up per experiment.
