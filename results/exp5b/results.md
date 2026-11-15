# Experiment 5b: the self-harm model on posts labelled by psychiatrists

Generated 2026-11-15 by `experiments/exp5b_cssrs.py`. Data: Gaur et al., WWW 2019, 500 Reddit users labelled on the Columbia Suicide Severity Rating Scale by four psychiatrists, CC BY 4.0, https://zenodo.org/records/4543776 .

## Short answer

On 500 Reddit users labelled by psychiatrists, the shipped self-harm model ranked at-risk users above the rest at an AUC of 0.66. With the phrase list it flagged 99% of at-risk users, but also 87% of users who were only supporting others.

## Why this test

Experiment 5 learned from posts labelled by the forum they came from. A model can learn the forum instead of the risk. Here every user comes from the same group of forums, and psychiatrists gave the labels, so the forum cannot give the answer away. The model was not changed. A user counts as flagged when any one of their posts is flagged, because Steady scores each message on its own.

## Results

500 users, 9,138 posts. At risk: Ideation, Behavior or Attempt (293 users).

| Method | Users flagged | At-risk users found | Missed | False alarms |
| --- | --- | --- | --- | --- |
| Phrase list | 300 | 204 of 293 (70%) | 89 | 96 |
| Model | 472 | 289 of 293 (99%) | 4 | 183 |
| Phrase list or model (the app) | 474 | 289 of 293 (99%) | 4 | 185 |

Share of each group with at least one flagged post:

| Label | Users | At risk | Model | Phrase list | Either | Phrase list says plan |
| --- | --- | --- | --- | --- | --- | --- |
| Supportive | 108 | no | 86% | 45% | 87% | 2% |
| Indicator | 99 | no | 91% | 47% | 92% | 1% |
| Ideation | 171 | yes | 98% | 62% | 98% | 2% |
| Behavior | 77 | yes | 100% | 78% | 100% | 9% |
| Attempt | 45 | yes | 100% | 84% | 100% | 7% |

Ranking users by their highest post score, the model scored an AUC of 0.66 overall and 0.65 for Ideation against Supportive.

## What this means

- The model does more than learn the forum: it ranks at-risk users above the rest inside the same forums.
- It cannot tell a person in crisis from a person talking someone else down. Supportive posts are full of the same words ("please don't kill yourself"). So in the app a flag from the model alone only asks the teen "Are you safe right now?" with 988 on screen. No answer sends nothing, and it does not count toward the repeat-flag rules. "No" still sends the urgent note. The phrase list keeps its 30-minute rule.
- These are users with many long posts. One short message carries much less.
- Next: train on labels like these, with a clinician, instead of forum labels.

*This project is a prototype and is not medical advice. It was written with Claude (Anthropic).*
