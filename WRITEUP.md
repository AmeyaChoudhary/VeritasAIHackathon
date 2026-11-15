# Stability: knowing when to ask

**Track:** Health
**Team:** two high school students (names are on the submission form)
**Try it:** [the app](https://ameyachoudhary.github.io/VeritasAIHackathon/app/) runs in a browser with nothing to install, and [the site](https://ameyachoudhary.github.io/VeritasAIHackathon/) walks through the idea.

*This project is a prototype and is not medical advice.*

## The problem

One in five US teenagers has a major depressive episode in a year, and only about 40% of them get treatment ([NIMH](https://www.nimh.nih.gov/health/statistics/major-depression)). It builds over weeks, and the screening questions that work are asked about once a year. Our user is Maya, 16, and her mom, who would not see a slow slide until it became a crisis.

## What we built

Stability is a prototype app on a teen's phone, linked once to a parent's phone.

- **In:** a two-tap weekly check-in from Stable, the app's mascot (stress, time with others), PHQ-2 and PHQ-8 answers, and her digital life from 17 sources read on the phone: Instagram, TikTok, YouTube, browsing and news, Spotify, games, chats, sleep and school. Only weekly numbers are kept.
- **Out:** for the teen, the screening questions when a model picks, and a nudge to see a doctor. For the parent, a short note on what changed and how to start the conversation, never messages, answers or scores.
- **Demo:** Maya's phone and her mom's. In week 6 the model asks Maya early; in week 8 her mom gets the note.

![Week 8: Maya's phone suggests a doctor, and her mom's phone gets the note](docs/img/week8-both-phones.png)

## What we added

Our own idea, with our own question: can a phone tell us when to ask a teenager the screening questions, better than a calendar can?

## How it works

- **When to ask.** Everyone gets the two PHQ-2 questions once a month. Each week an ask model (logistic regression, computed on the phone) scores the check-in and earlier PHQ-2 answers, and asks sooner when the score is high. Trained on the [College Experience Study](https://www.kaggle.com/datasets/subigyanepal/college-experience-dataset): 213 students and 16,886 weeks with a PHQ-2, split by student.
- **When a parent is told.** When the PHQ-8 is 10 or more, or on self-harm words. Phone signals only name what changed, and pick when to ask if check-ins stop.
- **Tone.** TF-IDF and logistic regression (698 KB) on [GoEmotions](https://huggingface.co/datasets/google-research-datasets/go_emotions) Reddit comments (low mood: sadness, grief, disappointment or remorse).
- **Self-harm.** A phrase list, then a model (1 MB) trained on 282,768 posts from [two](https://www.kaggle.com/datasets/nikhileswarkomati/suicide-watch) [Kaggle sets](https://www.kaggle.com/datasets/szegeelim/mental-health). The model alone only asks "Are you safe right now?"; only "no" reaches a parent.
- **Failure tests.** 60 teen-style messages (jokes, lyrics, sarcasm, real risk) written by a separate AI session.

## Results

| Question | Simple baseline | Our model | Held-out test |
| --- | --- | --- | --- |
| Is this message low mood? | Keyword list finds 24%: 263 missed, 89 false alarms | Tone model finds 50%: 171 missed, 123 false alarms | 5,427 comments, 345 low mood |
| Is this message about self-harm? | Phrase list finds 52%: 6,075 missed, 596 false alarms | Model finds 92% at 90% precision: 989 missed, 1,316 false alarms | 28,277 posts, labelled by forum |
| Is this person at risk? | Phrase list flags 70% of at-risk users and 45% of users helping others | AUC 0.66; flags 99% of at-risk users (4 missed) but 86% of users helping others | 500 Reddit users rated by psychiatrists |
| Which weeks should Stability ask, at 12 asks a year? | Fixed calendar: 13% of asks land on a high week; 1,670 missed, 3,391 false alarms | Ask model: 44% (AUC 0.89); 586 of 2,171 high weeks missed, 2,012 false alarms | 213 college students never seen |
| Does the ask model hold up on teens? | Asking at random: 41% of asks land on a high answer | Same model, unchanged: 74% (AUC 0.85); 14 of 46 high answers missed, 11 false alarms | 113 teens aged 12 to 17 never seen |
| Does her digital life go with distress? | Sex and grade alone: 0.62 | Sleep, social media and online bullying: 0.65; social media use 0.67; gaming 0.59 (anxiety); music 0.57 | 10,483 US high schoolers; 481 users; 13,413 gamers; 736 listeners |

**Our first idea failed.** A drift rule (ask when two phone signals leave the student's range) picked weeks no better than chance: 14.6% against 14.9% for random weeks from the same student. 686 phone features reached 18%. So Stability now asks first ([Experiment 1](results/exp1/results.md), [Experiment 3](results/exp3/results.md)).

**Our self-harm model failed a harder test.** Trained on forum labels, with r/teenagers as "not suicidal", it could not tell psychiatrist-rated users in crisis from users helping them: "please don't kill yourself" reads like a crisis. So alone it now only asks the teen ([Experiment 5b](results/exp5b/results.md)).

**What the ask model does.** It finds who to ask, not which week: random weeks for the same students did as well (45%). Bigger models tied at 0.89, so we kept the one anyone can read ([Experiment 4](results/exp4/results.md)). On 113 German-speaking teens in the pandemic it scored 0.85 without retraining ([Experiment 6](results/exp6/results.md)).

**Her digital life is context.** 54% of US high schoolers sleeping 4 hours or less felt sad or hopeless, against 24% at 8. One-time surveys show signals go with distress across people; Experiment 1 found one student's weeks near chance ([Experiment 7](results/exp7/results.md), [Experiment 8](results/exp8/results.md)).

**Where it fails**

- **Groups.** The ask model scored 0.93 for boys and 0.86 for girls on the teens' later answers. A check-in model scored 0.75 for college men and 0.66 for women. Digital-life answers scored 0.61 for Black students and 0.68 for White students. GoEmotions records nothing about its writers.
- **Self-harm.** On our 60 messages the phrase list found 6 of 15 risk messages; with the model, 13 of 15 (5 false alarms against 4). It flags 32% of depression posts ([Experiment 5](results/exp5/results.md)).
- **Tone.** It found 12 of our 33 low-mood messages, and "sorry im late lol" scores as low mood ([Experiment 2](results/exp2/results.md)).
- **The PHQ-2 step.** In US adults aged 18 to 24, a PHQ-2 of 3 or more caught 59% of PHQ-9 scores of 10 or more ([Experiment 7](results/exp7/results.md)).

## What we'd do next

1. **A better tone model.** A fine-tuned MiniLM found 62% of low-mood comments, but is 91 MB ([Experiment 2b](results/exp2b/results.md)).
2. **A self-harm model trained on clinician labels** (Reddit C-SSRS, UMD Suicidality), built and reviewed with a clinician, along with every parent note.
3. **US high school students, weekly.** Test whether they answer the check-in, and whether the model holds up with it.

## Sources

- **Datasets:** College Experience Study, GoEmotions, Suicide and Depression Detection, Sentiment Analysis for Mental Health, Reddit C-SSRS, Corona Health, Depresjon, StudentLife, the CDC's YRBS and NHANES, Music & Mental Health, Spotify Tracks, Online Gaming Anxiety, Social Media and Mental Health, and Dreaddit. Licences, links and citations are in [docs/datasets.md](docs/datasets.md).
- **Questionnaires:** PHQ-2 and PHQ-8 (Kroenke, Spitzer and Williams).
- **Libraries:** scikit-learn, pandas, React, Vite, Remotion, PyTorch ([full list](app/README.md)).
- **AI tools:** Claude (Anthropic), in Claude Code, wrote the code and drafted documents with us. Codex (OpenAI) reviewed experiments and app code. The video's placeholder voice is en-US-AvaNeural, via edge-tts.
- **Full results:** [results/](results/), one write-up per experiment.
