# Stability: knowing when to ask

**Track:** Health
**Team:** two high school students (names are on the submission form)
**Try it:** [the app](https://ameyachoudhary.github.io/VeritasAIHackathon/app/) runs in a browser with nothing to install, [the site](https://ameyachoudhary.github.io/VeritasAIHackathon/) walks through the idea, and [the video](docs/video/steady-demo.mp4) shows it in two minutes.

*This project is a prototype and is not medical advice.*

## The problem

Maya is 16. Last fall she quit soccer. By December she slept five hours a night and texted her friends half as much. Her mom thought it was finals, and two months passed before anyone asked how she really was.

Maya is the teen we built for, and she is one of many. In 2021, 20.1% of US adolescents had a major depressive episode, and 59% of them got no treatment ([NIMH](https://www.nimh.nih.gov/health/statistics/major-depression)). It builds over weeks, and the screening questions that work are asked about once a year. Nobody knows when to ask.

## What we built

Stability is an app on a teen's phone, linked to a parent's phone, that knows when to ask.

- **Consent first.** The teen and a parent both agree at setup. Everything is read on the teen's phone, and parents never see a message, a search or a video.
- **In:** her digital life from 17 sources: Instagram, TikTok, YouTube, browsing, newsfeeds, Spotify, games, chats, sleep and school. Only weekly numbers are kept. Once a week Stable, the app's mascot, asks for two taps: stress and time with people. The PHQ-2 and PHQ-8 screening questions come up when they are due.
- **Out:** for the teen, the screening questions at the right time, a nudge to see a doctor when answers are high, and 988 one tap away on words about self-harm. For the parent, a short note: what changed, for how long, and how to start the conversation.
- **Demo:** Maya's twelve weeks. Week 4: she scores 2 of 6, under the cutoff. During finals her stress check-ins go from 2 to 4, and the ask model asks again two weeks early. Week 8: 4, then 12 on all eight, past the cutoff of 10. Her mom gets a note: sleep and messaging down for four weeks. Never her messages.

![Week 8: Maya's phone suggests a doctor, and her mom's phone gets the note](docs/img/week8-both-phones.png)

## What we added

Our own idea and question: can a phone tell when to ask a teen the screening questions, better than a calendar? We built the app, the models and every test.

## How it works

- **The ask model.** Her two taps and past answers feed a logistic regression on the phone that scores the chance her next screening is high. Past 16% it asks the PHQ-2; everyone is also asked monthly. 3 or more unlocks the PHQ-8; 10 or more alerts a parent. Trained on the [College Experience Study](https://www.kaggle.com/datasets/subigyanepal/college-experience-dataset): 213 students and 16,886 weeks with a PHQ-2, split by student.
- **Small models on the phone.** A mood model (TF-IDF and logistic regression, 698 KB, on [GoEmotions](https://huggingface.co/datasets/google-research-datasets/go_emotions)) reads what she types and searches. A self-harm model (1 MB, on 282,768 posts from [two](https://www.kaggle.com/datasets/nikhileswarkomati/suicide-watch) [Kaggle sets](https://www.kaggle.com/datasets/szegeelim/mental-health)) backs up a phrase list. They keep numbers and delete the words. Her digital life names what changed in the parent's note.
- **Failure tests.** 60 teen-style messages (jokes, lyrics, sarcasm, real risk) written by a separate AI session.

## Results

We tested on 404,376 labelled examples: 282,768 posts, 54,263 comments, 30,346 surveyed high schoolers, 16,886 student check-in weeks and 20,113 more ([full count](docs/video-script.md)). Every model was scored on data it never saw.

- **3.4 times a fixed schedule:** 44% of the ask model's asks landed on a hard week, against 13%.
- **AUC 0.90 on 113 teens aged 12 to 17 it never saw**, unchanged, over 635 later answers (0.85 on first follow-ups alone, where its top asks hit 74% against 41% at random).
- **Sleep:** in the CDC's 2025 survey, 54% of high schoolers sleeping 4 hours or less felt sad or hopeless, against 24% at 8 hours.
- **2 times a keyword list** for low mood, and 13 of our 15 self-harm test messages caught.

| Question | Simple baseline | Our model | Held-out test |
| --- | --- | --- | --- |
| Which weeks to ask, at 12 asks a year? | Fixed schedule: 13%; 1,670 high weeks missed, 3,391 false alarms | Ask model: 44% (AUC 0.89); 586 of 2,171 missed, 2,012 false alarms | 213 college students |
| Does it hold up on teens? | At random: 37% | Ask model, unchanged: 92% (AUC 0.90); 103 of 238 high answers missed, 12 false alarms | 113 teens, 635 answers |
| Is this message low mood? | Keyword list: 24%; 263 missed, 89 false alarms | Mood model: 50%; 171 missed, 123 false alarms | 5,427 comments |
| Is this post about self-harm? | Phrase list: 52%; 6,075 missed, 596 false alarms | Model: 92% at 90% precision; 989 missed, 1,316 false alarms | 28,277 posts |
| Does her digital life go with distress? | Sex and grade alone: AUC 0.62 | Sleep, social media and online bullying: 0.65 | 10,483 US high schoolers |

**What failed, and what we changed.**

- **Our first idea.** A drift rule (ask when two phone signals leave her range) picked weeks no better than chance: 14.6% against 14.9% at random. So Stability asks first ([Experiment 1](results/exp1/results.md), [Experiment 3](results/exp3/results.md)).
- **Our self-harm model on psychiatrist labels.** On 500 rated Reddit users it scored AUC 0.66 and flagged 86% of users only helping others. So a flag from it alone only asks the teen "Are you safe right now?"; only "no" reaches a parent ([Experiment 5b](results/exp5b/results.md)).

**Limits.**

- **Who, more than when.** Random weeks for the same students did as well (45%); bigger models tied ([Experiment 4](results/exp4/results.md)).
- **Groups.** Teens: 0.93 for boys, 0.86 for girls. College check-ins: 0.75 for men, 0.66 for women. Digital-life answers: 0.61 for Black students, 0.68 for White students.
- **The teens** were German-speaking, in the pandemic, with no check-in ([Experiment 6](results/exp6/results.md)).
- **Messages.** The mood model found 12 of our 33 low-mood messages; the safety check raised 5 false alarms on our other 45 and flags 32% of depression posts ([Experiment 2](results/exp2/results.md), [Experiment 5](results/exp5/results.md)).
- **The PHQ-2 step** caught 59% of PHQ-9 scores of 10 or more in adults aged 18 to 24 ([Experiment 7](results/exp7/results.md)).

## What we'd do next

1. **A better mood model.** A fine-tuned MiniLM found 62%, but is 91 MB ([Experiment 2b](results/exp2b/results.md)).
2. **A self-harm model on clinician labels**, reviewed with a clinician, along with every parent note.
3. **US high schoolers, weekly**, to test the check-in and the model together.

## Sources

- **Statistics:** [NIMH, major depression](https://www.nimh.nih.gov/health/statistics/major-depression) (2021 NSDUH); the CDC's [Youth Risk Behavior Survey](https://www.cdc.gov/yrbs/) 2023 and 2025.
- **Datasets:** College Experience Study, GoEmotions, two Kaggle self-harm sets, Reddit C-SSRS, Corona Health, CDC YRBS and NHANES, and more, with licences in [docs/datasets.md](docs/datasets.md).
- **Questionnaires:** PHQ-2 and PHQ-8 (Kroenke, Spitzer and Williams).
- **Libraries:** scikit-learn, pandas, React, Vite, Remotion, PyTorch ([full list](app/README.md)).
- **AI tools:** Claude (Anthropic), in Claude Code, wrote the code and drafted documents with us. Codex (OpenAI) reviewed experiments and app code. The video's narration is our own voices; drafts used a placeholder voice (en-US-AvaNeural via edge-tts) for timing.
- **Full results:** [results/](results/), one write-up per experiment.
