# Experiment 4: the ask model the app runs

Generated 2026-11-15 by `experiments/exp4_ask_model.py`. Data: College Experience Study (Dartmouth), CC BY-NC-SA 4.0, used for academic purposes only. Every number below is an aggregate over students.

## Short answer

The ask model the app runs scored an AUC of 0.89 on students it never saw. At 12 asks per student-year, 44% of its asks landed on a week with a high PHQ-2, against 13% for a fixed calendar. It finds who to ask more often, not which week: random weeks for the same students did as well (45%).

## What it is

Experiment 3 found that a student's own answers pick the weeks to ask far better than phone data. This is that model in a form a phone can run: a logistic regression on six numbers the app already has. It decides one thing, when to show the two screening questions. It never sends a parent anything; that still rests on the questionnaire score.

| Input | What it is | Weight | Weight when missing |
| --- | --- | --- | --- |
| stress | This week's check-in: stressed (1 not at all to 5 extremely) | +0.40 | +0.12 |
| with_others | This week's check-in: time with others (1 almost always alone to 5 almost always with others) | -0.07 | +0.12 |
| stress_usual | Average of the student's earlier stress answers | +0.11 | +0.00 |
| with_others_usual | Average of the student's earlier time-with-others answers | -0.05 | +0.00 |
| last_phq2 | Most recent PHQ-2 score (0 to 6), at least two weeks old | +0.74 | +0.00 |
| mean_phq2 | Average of all the student's PHQ-2 scores up to then | +0.81 | +0.00 |

Each input is standardized first, so the weights can be compared. The intercept is -2.80. The app asks when the score is 0.163 or more, which gave 12 asks per student-year here.

## Results

213 students, 16,886 labelled weeks, base rate 12.9%. Five folds split by student, so every score comes from a model that never saw that student. Asks: 12 per student-year.

| Model | AUC (95% interval) | Within-student AUC | Hit rate | Fixed calendar | Random weeks, same student and quarter | High weeks missed | False alarms | Low periods reached |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| The ask model (check-in plus earlier answers) | 0.89 (0.87 to 0.91) | 0.70 | 44.1% | 12.9% | 44.7% | 586 of 2,171 | 2,012 | 83% |
| Earlier PHQ-2 answers alone | 0.89 (0.86 to 0.91) | 0.68 | 43.8% | 12.9% | 44.6% | 602 of 2,171 | 2,013 | 80% |
| Two-tap check-in alone | 0.78 (0.74 to 0.82) | 0.63 | 31.4% | 12.9% | 31.8% | 991 of 2,171 | 2,576 | 65% |
| Reference: the same model with last week's answers | 0.91 (0.89 to 0.93) | 0.75 | 45.9% | 12.9% | 45.1% | 514 of 2,171 | 1,951 | 92% |

- **Against the calendar.** 44.1% of the ask model's asks landed on a high week, against 12.9% (+31.2 points, 95% interval 26.2 to 36.2).
- **What the check-in adds.** A little. Earlier answers alone scored 0.888 and reached 80% of low periods; with the check-in the model scored 0.894 and reached 83%. Within one student's own weeks the AUC went from 0.68 to 0.70. The check-in alone scored 0.78, so it matters most before a student has answered the two questions at all.
- **Who, not when.** Random weeks from the same student and quarter reached 44.7%, as good as the model's 44.1%. The model finds which students to ask more often. It does not pick the week.
- **Older answers.** The model sees earlier answers that are at least 11 days old, as the app would. With last week's answers, which overlap this week's, the same model scored 0.91. We report the lower number.
- **What it still misses.** 586 of 2,171 high weeks got no ask at this budget, and 2,012 asks landed on weeks that were not high.

## Bigger models

The same six inputs, students and folds, in models that can find curves and interactions. None beat the logistic regression: every 95% interval overlaps. Most of the signal is one straight-line pattern (a student who scored high before tends to score high again), so there is little for a bigger model to add. The app keeps the logistic regression because it runs in a few lines on the phone, each input has one weight anyone can read, and a test checks the app gives the same scores as this script.

| Model | AUC (95% interval) | Within-student AUC | Hit rate | High weeks missed | False alarms |
| --- | --- | --- | --- | --- | --- |
| Logistic regression (the ask model in the app) | 0.894 (0.871 to 0.914) | 0.70 | 44.1% | 586 | 2,012 |
| A single decision tree (depth 4) | 0.877 (0.851 to 0.900) | 0.66 | 42.8% | 637 | 2,054 |
| Random forest (300 trees) | 0.890 (0.867 to 0.911) | 0.70 | 44.2% | 568 | 2,026 |
| Gradient-boosted trees (shallow, 300 rounds) | 0.891 (0.868 to 0.912) | 0.70 | 44.2% | 572 | 2,018 |
| Neural net (3 hidden layers: 128, 64, 32) | 0.890 (0.866 to 0.910) | 0.70 | 44.1% | 575 | 2,021 |

Gradient-boosted trees here are scikit-learn's histogram gradient boosting, the same method XGBoost and LightGBM use. Models that cannot take a missing input got the training median and a missing flag.

## In the app

- The weights are in `app/src/engine/ask_model.json`, with 24 test cases. `app/src/engine/askmodel.test.ts` checks that the app's arithmetic gives the same scores as this script.
- Each week the teen can answer the two-tap check-in. At the week's end the app scores it with their earlier answers and asks the two questions when the score reaches the threshold.
- It waits at least two weeks after the last ask. Everyone is also asked once a month, whatever the score.
- If the teen has not checked in for two weeks, the app falls back to its phone signals to decide when to ask.

## Caveats

- These are Dartmouth college students from 2017 to 2022. Stability is meant for high school students.
- The label is a weekly PHQ-2 answered on the phone. It is a screening score, and a doctor makes the diagnosis.
- Most of the model's skill comes from the student's earlier PHQ-2 answers: a student who scored high tends to score high again. It finds who to ask more often. It does not pick the week: random weeks for the same students in the same term did as well.
- The earlier answers were at least 11 days old, a median of 2.1 weeks. The app asks once a month unless the model asks sooner, so its answers will often be older than that, and the model will do worse than this.
- In the study the check-in questions came in the same survey as the PHQ-2. We cannot tell whether students would answer a two-tap check-in every week.
- The study asked the questions about today and now. The app asks them once a week.
- The threshold gives 12 asks per student-year on these students. On other students the number of asks will differ.
- The shipped weights are fit on every student, so the numbers above come from the five-fold versions of the same model.

## How to run

```
.venv/bin/python experiments/exp1_timing.py     # builds the weekly table
.venv/bin/python experiments/exp1b_deeper.py    # builds the feature table
.venv/bin/python experiments/exp4_ask_model.py
```

*This is a prototype analysis and is not medical advice. It was written with Claude (Anthropic).*
