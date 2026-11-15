# Experiment 1b: how well can phone data pick out a high week?

Generated 2026-11-14 by `experiments/exp1b_deeper.py`. Main data: College Experience Study (Dartmouth), CC BY-NC-SA 4.0, used for academic purposes only. Every number below is an aggregate over students. No student ids or per-student rows appear in this file.

This is the second version. An independent review of the first version (by Codex) reproduced its numbers and found descriptions and two analyses that needed fixing. The section "What changed after review" lists each change and its effect.

## Short answer

Using only phone data recorded before the answer, models picked out high PHQ-2 weeks in students they never saw at an AUC of 0.57 to 0.60, while a single check-in from the week before reached 0.69.

- **Phone data recorded before the answer (framing 1b).** Using only days before the PHQ-2 answer, three models scored 0.60 with logistic (0.56 to 0.65); 0.58 with gradient boosting (0.53 to 0.64); 0.57 with random forest (0.51 to 0.63), on 16,684 weeks from 213 students they never saw. PR-AUC was about 0.17 against a base rate of 0.13.
- **Phone data from the same calendar week (framing 1a).** 0.57 to 0.58 across the same three models. This is a same-week association: the week runs Monday to Sunday, and the answer can come on Thursday, so up to three days of phone data can come after it. It did no better than the before-the-answer version. The 7 days before the answer may line up better with the two weeks PHQ-2 asks about.
- **A single check-in from the week before.** The latest mood picture, stress and time-with-others answer from the previous calendar week scored 0.69 with logistic (0.66 to 0.73); 0.69 with gradient boosting (0.66 to 0.72). Check-in history, which adds the average of every earlier check-in, scored 0.78 with logistic (0.73 to 0.82); 0.74 with gradient boosting (0.70 to 0.79). Adding phone data recorded before the answer to the history gave 0.77 with logistic (0.72 to 0.80); 0.76 with gradient boosting (0.72 to 0.80).
- **The most recent PHQ-2 before Monday** scored 0.88 (0.85 to 0.90). That answer was dated 1 to 7 days before Monday in 85% of weeks, 8 to 14 days in 10%, and older in 4%. Counting only weeks with an answer in the previous calendar week (14,243 weeks), it scored 0.88 (0.86 to 0.90).
- **With every questionnaire input from before the recall window (framing 5b).** When every PHQ-2 and check-in input is at least 14 days older than the target answer, the latest PHQ-2 alone scored 0.86 (0.83 to 0.88), and all those inputs together scored 0.89 with logistic (0.86 to 0.91); 0.89 with gradient boosting (0.87 to 0.91).
- **Personal models.** After a student's first 16 eligible weeks, a shared phone model plus an intercept learned from their answers scored 0.72 (0.66 to 0.77). The student's own average PHQ-2 score over those weeks scored 0.80 (0.76 to 0.83), but it only ranks students: its within-student AUC is 0.50. Given identical answer information and folds, history alone scored 0.80 with logistic (0.76 to 0.84); 0.67 with gradient boosting (0.59 to 0.74). History plus phone data before the answer scored 0.76 with logistic (0.72 to 0.80); 0.76 with gradient boosting (0.71 to 0.81), and history plus the shared phone model's single score 0.80 (0.75 to 0.83). So phone data added nothing reliable to the answers. As one score it left logistic regression where it was. It lifted only gradient boosting, which fit the two history numbers poorly on its own.
- **Between students, and change.** Term averages of phone data told high terms from the rest at 0.60 to 0.63 across three models, and 0.59 when the model was chosen inside each training part. A rise of 2 or more points over the student's own running mean scored 0.55 to 0.62 from phone data recorded before the answer.
- **Results above 0.90.** Five honest rows came out above 0.90. Every one uses the student's earlier PHQ answers. Their explanation is in "Rows above 0.90" below.
- **External data.** Depresjon (55 adults, wrist actigraphy, patients against healthy controls): 0.71 with logistic (0.55 to 0.85); 0.84 with random forest (0.70 to 0.96); 0.81 (0.67 to 0.94) with the model chosen inside each training part. StudentLife 2013 (38 students, 7 with an end-of-term PHQ-9 of 10 or more): 0.70 with logistic (0.43 to 0.94); 0.76 with random forest (0.50 to 0.97); 0.76 (0.56 to 0.94) with nested choice.

All AUCs are exploratory, model-specific cross-validation estimates. Every model's result is listed, and the intervals do not include the step of choosing among models.

## What changed after review

| Number | First version | Now | What changed |
| --- | --- | --- | --- |
| Phone data alone | 0.57 to 0.58 | 0.57 to 0.60 before the answer; 0.57 to 0.58 same week | The first version used phone days up to three days after the answer. It is now reported as a same-week association, beside a version that uses only earlier days. |
| "Last week's PHQ-2" | 0.88 | 0.88 | Renamed "most recent PHQ-2 before Monday". It can be older than a week. The last-calendar-week version scores 0.88 on its own rows. |
| "One-tap check-in" | 0.77 | single check-in 0.69; history 0.74 to 0.78 | The first number used every earlier check-in and the phone platform. A single answer from last week is now its own row. |
| Check-in plus earlier PHQ-2 | 0.90 | 0.90; 0.89 with no overlap | Now on phone-before-the-answer weeks, plus a version with every questionnaire input before the recall window. |
| Personal, shared model + own intercept (8 / 16) | 0.66 / 0.72 | 0.66 / 0.72 | Phone data now from before the answer; test answers 14 or more days after training answers by actual dates. |
| Own average PHQ-2 (8 / 16) | 0.75 / 0.80 | 0.75 / 0.80 | Same changes. It ranks students only (within-student AUC 0.50). |
| Term level | 0.63 (logistic) | 0.60 to 0.63; nested 0.59 | Nested model choice added. |
| Change detection | 0.60 (logistic) | 0.55 to 0.62 | Phone data now from before the answer. |
| Depresjon | 0.84 (random forest) | 0.71 to 0.84; nested 0.81; 0.85 without all-zero days | Nested choice and a watch-off check added. |
| StudentLife | 0.76 (logistic) | 0.70 to 0.76; nested 0.76 | Calls and texts were logger records, many empty. Calls are now real call events and texts are dropped. |

## What we tested

| Framing | Question | Phone data timing | Rows | Split |
| --- | --- | --- | --- | --- |
| 1a. Same-week association | Is this a high week? (PHQ-2 of 3 or more) | Monday to Sunday of the label week | 16,886 weeks, 213 students | 5 folds by student |
| 1b. Before the answer | Same question | The 7 days before the answer day | 16,684 weeks, 213 students | 5 folds by student |
| 2. Personal model | Same question, after the student's first 8 or 16 eligible weeks | Before the answer | Later weeks, 14 or more days after the last training answer | Own past; shared parts by student folds |
| 3. Same-term association | Is the student's average PHQ-2 over a term 3 or more? | The same term | 1,949 student-terms | 5 folds by student |
| 4. Change detection | Is this week 2 or more points above the student's running mean? | Before the answer | 16,681 weeks | 5 folds by student |
| 5. Check-ins and earlier answers | Same as 1b, adding answers from earlier weeks | Before the answer | Same as 1b | 5 folds by student |
| 5b. Fully separated | Same, with every questionnaire input 14 or more days before the answer | Before the answer | Same as 1b | 5 folds by student |
| 6. Baselines | Base rate, earlier PHQ-2 answers, and a shuffled-label control in every framing | | | |
| 7. External | The closest framing on Depresjon and StudentLife | Whole recording or term | See below | By person |

**Phone features.** Every daily measure in the study's sensing file except the hourly ones: 171 measures of activity, location, phone use, sleep, audio, calls, texts and light, most of them also split into three parts of the day. Night-time phone use and audio (midnight to 5 AM) and steps were added. Each is summarised as a mean and an SD over the usable days, as a z-score against the same student's earlier weeks only, and as the previous week's value: 686 features. iPhone-only and Android-only features are missing for the other platform.

**Timing.** In framing 1a the week is Monday to Sunday. The PHQ-2 answer that labels it can come from Thursday of that week to Wednesday of the next, so some phone days can come after the answer. In framings 1b, 2, 4, 5 and 5b the window is the 7 days before the answer day. The z-score baseline uses only calendar weeks that ended at least 8 days before the answer, and a week counts only with 4 or more usable days in its window. Calendar time is not a feature. Phone habits change with seasons and years too, so this does not rule out calendar effects; that would need a test on held-out later years.

**Check-ins.** The PAM mood picture, stress, and time alone or with others. A *single check-in* is the latest answer given in the previous calendar week. *Last week's check-ins* average every answer from that week. *Check-in history* adds the average of every earlier answer and last week's change from it. All of them come from before Monday of the label week, and so from days before the answer. We could not check how the study numbers the 16 PAM pictures, so each answer is recorded as one of the four 2 by 2 blocks of the grid. On the same day, the share of PHQ-2 answers at 3 or more was 20% for the top left block, 9% for the top right block, 8% for the bottom left block, 21% for the bottom right block.

**Earlier PHQ-2 answers.** "Most recent PHQ-2 before Monday" is the latest answer dated before Monday of the label week, however old. PHQ-2 asks about the last two weeks, so this answer usually describes some of the same days as the target answer. Framing 5b removes that overlap.

**Models and choice.** Logistic regression (quantile scaling and missing-value flags fit inside each training fold, penalty fixed at C = 0.05), gradient boosting (scikit-learn HistGradientBoosting, 150 trees) and a random forest (300 trees). Settings were fixed before the run and never tuned on test students. Every model's result is listed. For the term framing and the two external datasets, a nested version also chooses the model inside each training part by a grouped inner cross-validation.

**Metrics.** AUC, PR-AUC, and sensitivity at 80% specificity, pooled over all test rows. The last is read off the test ROC curve and interpolated between tied scores, so it describes the curve; it is not a tested threshold. Each 95% interval comes from 1000 resamples of students and is conditional on the fitted predictions. Within-student AUC compares only weeks of the same student.

## Every framing

The main rows, with every model. Full tables follow.

| Framing | Model | Data used | AUC (95% interval) | PR-AUC | Base rate | Interpolated test-ROC sensitivity at 80% specificity | Students |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1b. Across students, phone data from before the answer | Logistic regression | Passive data only | 0.60 (0.56 to 0.65) | 0.18 | 0.13 | 32% | 213 |
|  | Gradient boosting (HistGB) | Passive data only | 0.58 (0.53 to 0.64) | 0.18 | 0.13 | 31% | 213 |
|  | Random forest | Passive data only | 0.57 (0.51 to 0.63) | 0.16 | 0.13 | 29% | 213 |
|  | Most recent PHQ-2 before Monday | Baseline | 0.88 (0.85 to 0.90) | 0.55 | 0.13 | 79% | 213 |
|  | PHQ-2 from last calendar week only, rows that have one | Baseline | 0.88 (0.86 to 0.90) | 0.56 | 0.12 | 80% | 213 |
|  | Label-shuffle control (Logistic regression) | Shuffle control | 0.50 (0.48 to 0.51) | 0.13 | 0.13 | 20% | 213 |
| 1a. Across students, same-week association | Logistic regression | Passive data only | 0.57 (0.51 to 0.63) | 0.17 | 0.13 | 30% | 213 |
|  | Gradient boosting (HistGB) | Passive data only | 0.57 (0.52 to 0.62) | 0.16 | 0.13 | 28% | 213 |
|  | Random forest | Passive data only | 0.58 (0.52 to 0.63) | 0.16 | 0.13 | 28% | 213 |
|  | Most recent PHQ-2 before Monday | Baseline | 0.88 (0.85 to 0.90) | 0.55 | 0.13 | 79% | 213 |
|  | PHQ-2 from last calendar week only, rows that have one | Baseline | 0.88 (0.86 to 0.90) | 0.56 | 0.12 | 80% | 213 |
|  | Label-shuffle control (Logistic regression) | Shuffle control | 0.50 (0.49 to 0.51) | 0.13 | 0.13 | 20% | 213 |
| 2. Personal model, first 8 eligible weeks | Pooled gradient boosting + own intercept | Uses the student's own answers | 0.66 (0.59 to 0.73) | 0.30 | 0.14 | 44% | 206 |
|  | Pooled gradient boosting, no personal step | Passive data only | 0.58 (0.52 to 0.64) | 0.18 | 0.14 | 30% | 206 |
|  | Own average PHQ-2 score in the first 8 weeks | Baseline | 0.75 (0.69 to 0.80) | 0.34 | 0.14 | 45% | 206 |
|  | History only (own average and share high): Logistic regression | Uses the student's own answers | 0.72 (0.66 to 0.78) | 0.32 | 0.14 | 45% | 206 |
|  | History plus phone data before the answer: Logistic regression | Uses the student's own answers | 0.69 (0.64 to 0.74) | 0.26 | 0.14 | 43% | 206 |
|  | History only (own average and share high): Gradient boosting (HistGB) | Uses the student's own answers | 0.68 (0.62 to 0.74) | 0.23 | 0.14 | 42% | 206 |
|  | History plus phone data before the answer: Gradient boosting (HistGB) | Uses the student's own answers | 0.70 (0.65 to 0.76) | 0.25 | 0.14 | 44% | 206 |
|  | History plus the shared phone model's score: Logistic regression | Uses the student's own answers | 0.72 (0.66 to 0.78) | 0.34 | 0.14 | 48% | 206 |
|  | Label-shuffle control (pooled + own intercept) | Shuffle control | 0.51 (0.50 to 0.52) | 0.13 | 0.13 | 21% | 206 |
| 2. Personal model, first 16 eligible weeks | Pooled gradient boosting + own intercept | Uses the student's own answers | 0.72 (0.66 to 0.77) | 0.36 | 0.14 | 49% | 191 |
|  | Pooled gradient boosting, no personal step | Passive data only | 0.57 (0.50 to 0.63) | 0.18 | 0.14 | 29% | 191 |
|  | Own average PHQ-2 score in the first 16 weeks | Baseline | 0.80 (0.76 to 0.83) | 0.40 | 0.14 | 63% | 191 |
|  | History only (own average and share high): Logistic regression | Uses the student's own answers | 0.80 (0.76 to 0.84) | 0.42 | 0.14 | 66% | 191 |
|  | History plus phone data before the answer: Logistic regression | Uses the student's own answers | 0.76 (0.72 to 0.80) | 0.33 | 0.14 | 54% | 191 |
|  | History only (own average and share high): Gradient boosting (HistGB) | Uses the student's own answers | 0.67 (0.59 to 0.74) | 0.30 | 0.14 | 42% | 191 |
|  | History plus phone data before the answer: Gradient boosting (HistGB) | Uses the student's own answers | 0.76 (0.71 to 0.81) | 0.34 | 0.14 | 53% | 191 |
|  | History plus the shared phone model's score: Logistic regression | Uses the student's own answers | 0.80 (0.75 to 0.83) | 0.41 | 0.14 | 60% | 191 |
|  | Label-shuffle control (pooled + own intercept) | Shuffle control | 0.50 (0.49 to 0.52) | 0.13 | 0.13 | 20% | 191 |
| 3. Between students, same-term association | Logistic regression | Passive data only | 0.63 (0.56 to 0.70) | 0.14 | 0.09 | 37% | 213 |
|  | Gradient boosting (HistGB) | Passive data only | 0.60 (0.51 to 0.68) | 0.12 | 0.09 | 33% | 213 |
|  | Random forest | Passive data only | 0.61 (0.51 to 0.69) | 0.11 | 0.09 | 27% | 213 |
|  | Nested choice among the three models | Passive data only | 0.59 (0.51 to 0.68) | 0.13 | 0.09 | 34% | 213 |
|  | Last term's average PHQ-2 alone | Baseline | 0.92 (0.89 to 0.95) | 0.67 | 0.09 | 87% | 213 |
|  | Label-shuffle control (Logistic regression) | Shuffle control | 0.49 (0.45 to 0.53) | 0.08 | 0.09 | 14% | 213 |
| 4. Change detection, phone data from before the answer | Logistic regression | Passive data only | 0.62 (0.58 to 0.66) | 0.10 | 0.06 | 34% | 213 |
|  | Gradient boosting (HistGB) | Passive data only | 0.55 (0.52 to 0.59) | 0.07 | 0.06 | 24% | 213 |
|  | Most recent PHQ-2 before Monday minus own running mean | Baseline | 0.78 (0.75 to 0.81) | 0.31 | 0.06 | 65% | 213 |
|  | Label-shuffle control (Logistic regression) | Shuffle control | 0.51 (0.50 to 0.53) | 0.07 | 0.06 | 21% | 213 |
| 5. Check-ins and earlier answers | Single last-week check-in (latest answer): Logistic regression | Uses the student's own answers | 0.69 (0.66 to 0.73) | 0.25 | 0.13 | 42% | 213 |
|  | Single last-week check-in (latest answer): Gradient boosting (HistGB) | Uses the student's own answers | 0.69 (0.66 to 0.72) | 0.24 | 0.13 | 41% | 213 |
|  | Last week's check-ins (mean): Logistic regression | Uses the student's own answers | 0.71 (0.67 to 0.74) | 0.26 | 0.13 | 44% | 213 |
|  | Last week's check-ins (mean): Gradient boosting (HistGB) | Uses the student's own answers | 0.70 (0.67 to 0.74) | 0.25 | 0.13 | 44% | 213 |
|  | Check-in history: Logistic regression | Uses the student's own answers | 0.78 (0.73 to 0.82) | 0.40 | 0.13 | 58% | 213 |
|  | Check-in history: Gradient boosting (HistGB) | Uses the student's own answers | 0.74 (0.70 to 0.79) | 0.27 | 0.13 | 48% | 213 |
|  | Phone before the answer plus check-in history: Logistic regression | Uses the student's own answers | 0.77 (0.72 to 0.80) | 0.36 | 0.13 | 57% | 213 |
|  | Phone before the answer plus check-in history: Gradient boosting (HistGB) | Uses the student's own answers | 0.76 (0.72 to 0.80) | 0.30 | 0.13 | 54% | 213 |
|  | Check-in history plus earlier PHQ-2 answers: Logistic regression | Uses the student's own answers | 0.90 (0.88 to 0.92) | 0.62 | 0.13 | 83% | 213 |
|  | Check-in history plus earlier PHQ-2 answers: Gradient boosting (HistGB) | Uses the student's own answers | 0.90 (0.88 to 0.92) | 0.63 | 0.13 | 83% | 213 |
|  | Phone before the answer plus check-in history plus earlier PHQ-2 answers: Gradient boosting (HistGB) | Uses the student's own answers | 0.90 (0.88 to 0.92) | 0.64 | 0.13 | 83% | 213 |
|  | Label-shuffle control (Logistic regression) | Shuffle control | 0.50 (0.48 to 0.51) | 0.13 | 0.13 | 19% | 213 |
| 5b. Questionnaire inputs from before the recall window | Latest PHQ-2 answered 14 or more days before, alone | Baseline | 0.86 (0.83 to 0.88) | 0.51 | 0.13 | 76% | 213 |
|  | Single check-in 14 or more days before: Logistic regression | Uses the student's own answers | 0.70 (0.66 to 0.73) | 0.25 | 0.13 | 45% | 213 |
|  | All questionnaire inputs 14 or more days before: Logistic regression | Uses the student's own answers | 0.89 (0.86 to 0.91) | 0.58 | 0.13 | 80% | 213 |
|  | All questionnaire inputs 14 or more days before: Gradient boosting (HistGB) | Uses the student's own answers | 0.89 (0.87 to 0.91) | 0.57 | 0.13 | 82% | 213 |
|  | Phone before the answer plus those inputs: Gradient boosting (HistGB) | Uses the student's own answers | 0.89 (0.87 to 0.91) | 0.59 | 0.13 | 81% | 213 |
|  | Label-shuffle control (Logistic regression) | Shuffle control | 0.49 (0.48 to 0.50) | 0.12 | 0.13 | 19% | 213 |
| 7a. Depresjon (external) | Per person: Logistic regression | Passive data only | 0.71 (0.55 to 0.85) | 0.66 | 0.42 | 58% | 55 |
|  | Per person: Random forest | Passive data only | 0.84 (0.70 to 0.96) | 0.87 | 0.42 | 80% | 55 |
|  | Per person: nested choice between the two models | Passive data only | 0.81 (0.67 to 0.94) | 0.86 | 0.42 | 78% | 55 |
|  | Per person, all-zero days removed: Random forest | Passive data only | 0.85 (0.72 to 0.96) | 0.89 | 0.42 | 83% | 55 |
|  | Label-shuffle control (Logistic regression) | Shuffle control | 0.42 (0.26 to 0.57) | 0.36 | 0.42 | 4% | 55 |
| 7b. StudentLife 2013 (external), PHQ-9 >= 10 | Term average: Logistic regression | Passive data only | 0.70 (0.43 to 0.94) | 0.40 | 0.18 | 57% | 38 |
|  | Term average: Random forest | Passive data only | 0.76 (0.50 to 0.97) | 0.58 | 0.18 | 71% | 38 |
|  | Term average: nested choice between the two models | Passive data only | 0.76 (0.56 to 0.94) | 0.44 | 0.18 | 57% | 38 |
|  | PHQ-9 at the start of term alone | Baseline | 0.94 (0.84 to 1.00) | 0.75 | 0.18 | 86% | 38 |
|  | Label-shuffle control (Logistic regression) | Shuffle control | 0.65 (0.45 to 0.83) | 0.27 | 0.18 | 46% | 38 |

### Framing 1a: same-week association

| Model | AUC (95% interval) | PR-AUC | Base rate | Interpolated test-ROC sensitivity at 80% specificity | Within-student AUC | Students | Rows | Kind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Logistic regression | 0.57 (0.51 to 0.63) | 0.17 | 0.13 | 30% | 0.57 | 213 | 16,886 | model |
| Gradient boosting (HistGB) | 0.57 (0.52 to 0.62) | 0.16 | 0.13 | 28% | 0.58 | 213 | 16,886 | model |
| Random forest | 0.58 (0.52 to 0.63) | 0.16 | 0.13 | 28% | 0.58 | 213 | 16,886 | model |
| Gradient boosting, own-past z-scores only | 0.52 (0.47 to 0.57) | 0.14 | 0.13 | 21% | 0.56 | 213 | 16,886 | variant |
| Logistic regression, scored on the rows 1b also has | 0.57 (0.51 to 0.63) | 0.17 | 0.13 | 30% | 0.57 | 213 | 16,581 | variant |
| Gradient boosting (HistGB), scored on the rows 1b also has | 0.57 (0.52 to 0.62) | 0.16 | 0.13 | 27% | 0.58 | 213 | 16,581 | variant |
| Random forest, scored on the rows 1b also has | 0.58 (0.52 to 0.63) | 0.16 | 0.13 | 28% | 0.58 | 213 | 16,581 | variant |
| Most recent PHQ-2 before Monday | 0.88 (0.85 to 0.90) | 0.55 | 0.13 | 79% | 0.74 | 213 | 16,886 | baseline |
| PHQ-2 from last calendar week only, rows that have one | 0.88 (0.86 to 0.90) | 0.56 | 0.12 | 80% | 0.74 | 213 | 14,374 | baseline |
| Base rate (no information) | 0.50 (0.50 to 0.50) | 0.13 | 0.13 | 20% | n/a | 213 | 16,886 | baseline |
| Label-shuffle control (Logistic regression) | 0.50 (0.49 to 0.51) | 0.13 | 0.13 | 20% | n/a | 213 | 16,886 | control |

### Framing 1b: phone data from before the answer

| Model | AUC (95% interval) | PR-AUC | Base rate | Interpolated test-ROC sensitivity at 80% specificity | Within-student AUC | Students | Rows | Kind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Logistic regression | 0.60 (0.56 to 0.65) | 0.18 | 0.13 | 32% | 0.57 | 213 | 16,684 | model |
| Gradient boosting (HistGB) | 0.58 (0.53 to 0.64) | 0.18 | 0.13 | 31% | 0.56 | 213 | 16,684 | model |
| Random forest | 0.57 (0.51 to 0.63) | 0.16 | 0.13 | 29% | 0.57 | 213 | 16,684 | model |
| Gradient boosting, own-past z-scores only | 0.54 (0.49 to 0.59) | 0.14 | 0.13 | 24% | 0.53 | 213 | 16,684 | variant |
| Most recent PHQ-2 before Monday | 0.88 (0.85 to 0.90) | 0.55 | 0.13 | 79% | 0.74 | 213 | 16,684 | baseline |
| PHQ-2 from last calendar week only, rows that have one | 0.88 (0.86 to 0.90) | 0.56 | 0.12 | 80% | 0.74 | 213 | 14,243 | baseline |
| Base rate (no information) | 0.50 (0.50 to 0.50) | 0.13 | 0.13 | 20% | n/a | 213 | 16,684 | baseline |
| Label-shuffle control (Logistic regression) | 0.50 (0.48 to 0.51) | 0.13 | 0.13 | 20% | n/a | 213 | 16,684 | control |

The 1a models scored on the weeks both versions share are in the 1a table, for a like-for-like comparison.

### Framing 2: personal models

**2. Personal model, first 8 eligible weeks**

| Model | AUC (95% interval) | PR-AUC | Base rate | Interpolated test-ROC sensitivity at 80% specificity | Within-student AUC | Students | Rows | Kind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Own model only (6 core signals) | 0.59 (0.55 to 0.65) | 0.22 | 0.14 | 38% | 0.51 | 206 | 14,769 | model |
| Pooled gradient boosting + own intercept | 0.66 (0.59 to 0.73) | 0.30 | 0.14 | 44% | 0.56 | 206 | 14,769 | model |
| Pooled gradient boosting + own intercept and signal weights | 0.65 (0.58 to 0.72) | 0.27 | 0.14 | 43% | 0.55 | 206 | 14,769 | model |
| Pooled gradient boosting, no personal step | 0.58 (0.52 to 0.64) | 0.18 | 0.14 | 30% | 0.56 | 206 | 14,769 | baseline |
| Own average PHQ-2 score in the first 8 weeks | 0.75 (0.69 to 0.80) | 0.34 | 0.14 | 45% | 0.50 | 206 | 14,769 | baseline |
| Own share of high weeks in the first 8 weeks | 0.68 (0.62 to 0.75) | 0.28 | 0.14 | 52% | 0.50 | 206 | 14,769 | baseline |
| Most recent PHQ-2 before Monday | 0.88 (0.86 to 0.90) | 0.57 | 0.14 | 79% | 0.73 | 206 | 14,769 | baseline |
| Base rate (no information) | 0.50 (0.50 to 0.50) | 0.14 | 0.14 | 20% | n/a | 206 | 14,769 | baseline |
| Label-shuffle control (pooled + own intercept) | 0.51 (0.50 to 0.52) | 0.13 | 0.13 | 21% | n/a | 206 | 14,769 | control |
| History only (own average and share high): Logistic regression | 0.72 (0.66 to 0.78) | 0.32 | 0.14 | 45% | 0.50 | 206 | 14,769 | comparison |
| History plus phone data before the answer: Logistic regression | 0.69 (0.64 to 0.74) | 0.26 | 0.14 | 43% | 0.57 | 206 | 14,769 | comparison |
| History only (own average and share high): Gradient boosting (HistGB) | 0.68 (0.62 to 0.74) | 0.23 | 0.14 | 42% | 0.50 | 206 | 14,769 | comparison |
| History plus phone data before the answer: Gradient boosting (HistGB) | 0.70 (0.65 to 0.76) | 0.25 | 0.14 | 44% | 0.60 | 206 | 14,769 | comparison |
| History plus the shared phone model's score: Logistic regression | 0.72 (0.66 to 0.78) | 0.34 | 0.14 | 48% | 0.56 | 206 | 14,769 | comparison |

**2. Personal model, first 16 eligible weeks**

| Model | AUC (95% interval) | PR-AUC | Base rate | Interpolated test-ROC sensitivity at 80% specificity | Within-student AUC | Students | Rows | Kind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Own model only (6 core signals) | 0.63 (0.58 to 0.69) | 0.27 | 0.14 | 44% | 0.51 | 191 | 13,134 | model |
| Pooled gradient boosting + own intercept | 0.72 (0.66 to 0.77) | 0.36 | 0.14 | 49% | 0.55 | 191 | 13,134 | model |
| Pooled gradient boosting + own intercept and signal weights | 0.68 (0.62 to 0.74) | 0.29 | 0.14 | 46% | 0.54 | 191 | 13,134 | model |
| Pooled gradient boosting, no personal step | 0.57 (0.50 to 0.63) | 0.18 | 0.14 | 29% | 0.55 | 191 | 13,134 | baseline |
| Own average PHQ-2 score in the first 16 weeks | 0.80 (0.76 to 0.83) | 0.40 | 0.14 | 63% | 0.50 | 191 | 13,134 | baseline |
| Own share of high weeks in the first 16 weeks | 0.76 (0.71 to 0.81) | 0.38 | 0.14 | 59% | 0.50 | 191 | 13,134 | baseline |
| Most recent PHQ-2 before Monday | 0.88 (0.85 to 0.91) | 0.58 | 0.14 | 79% | 0.72 | 191 | 13,134 | baseline |
| Base rate (no information) | 0.50 (0.50 to 0.50) | 0.14 | 0.14 | 20% | n/a | 191 | 13,134 | baseline |
| Label-shuffle control (pooled + own intercept) | 0.50 (0.49 to 0.52) | 0.13 | 0.13 | 20% | n/a | 191 | 13,134 | control |
| History only (own average and share high): Logistic regression | 0.80 (0.76 to 0.84) | 0.42 | 0.14 | 66% | 0.50 | 191 | 13,134 | comparison |
| History plus phone data before the answer: Logistic regression | 0.76 (0.72 to 0.80) | 0.33 | 0.14 | 54% | 0.57 | 191 | 13,134 | comparison |
| History only (own average and share high): Gradient boosting (HistGB) | 0.67 (0.59 to 0.74) | 0.30 | 0.14 | 42% | 0.50 | 191 | 13,134 | comparison |
| History plus phone data before the answer: Gradient boosting (HistGB) | 0.76 (0.71 to 0.81) | 0.34 | 0.14 | 53% | 0.57 | 191 | 13,134 | comparison |
| History plus the shared phone model's score: Logistic regression | 0.80 (0.75 to 0.83) | 0.41 | 0.14 | 60% | 0.55 | 191 | 13,134 | comparison |

Training uses the student's first 8 or 16 eligible labelled weeks of framing 1b. By then the students had given a median of about 20 and 33 PHQ-2 answers in all, so these are not literally their first answers. Test weeks need an answer 14 or more days after the last training answer, by actual answer dates.

The personal intercept is learned from the binary high or not-high labels of the training weeks. The own-average baseline uses the full 0 to 6 scores, which carry more information, and the own share of high weeks uses the same binary labels as the intercept. Both baselines are constant within a student, so their within-student AUC is 0.50: they rank students, not weeks. The history-only and history-plus-phone rows use the same two history numbers and the same folds, so the only difference is the phone data.

### Framing 3: same-term association

| Model | AUC (95% interval) | PR-AUC | Base rate | Interpolated test-ROC sensitivity at 80% specificity | Within-student AUC | Students | Rows | Kind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Logistic regression | 0.63 (0.56 to 0.70) | 0.14 | 0.09 | 37% | 0.63 | 213 | 1,949 | model |
| Gradient boosting (HistGB) | 0.60 (0.51 to 0.68) | 0.12 | 0.09 | 33% | 0.56 | 213 | 1,949 | model |
| Random forest | 0.61 (0.51 to 0.69) | 0.11 | 0.09 | 27% | 0.61 | 213 | 1,949 | model |
| Nested choice among the three models | 0.59 (0.51 to 0.68) | 0.13 | 0.09 | 34% | 0.58 | 213 | 1,949 | nested |
| Last term's average PHQ-2 alone | 0.92 (0.89 to 0.95) | 0.67 | 0.09 | 87% | 0.74 | 213 | 1,949 | baseline |
| Last term's average PHQ-2, rows that have one | 0.94 (0.91 to 0.96) | 0.70 | 0.09 | 91% | 0.73 | 210 | 1,736 | baseline |
| Base rate (no information) | 0.50 (0.50 to 0.50) | 0.09 | 0.09 | 20% | n/a | 213 | 1,949 | baseline |
| Label-shuffle control (Logistic regression) | 0.49 (0.45 to 0.53) | 0.08 | 0.09 | 14% | n/a | 213 | 1,949 | control |

A student-term needs 4 or more labelled weeks and 4 or more weeks of phone data. The phone data cover the same term as the answers, so this is an association. Nested choices across the 5 outer folds: rf, logistic, hgb, rf, rf.

### Framing 4: change detection

| Model | AUC (95% interval) | PR-AUC | Base rate | Interpolated test-ROC sensitivity at 80% specificity | Within-student AUC | Students | Rows | Kind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Logistic regression | 0.62 (0.58 to 0.66) | 0.10 | 0.06 | 34% | 0.59 | 213 | 16,681 | model |
| Gradient boosting (HistGB) | 0.55 (0.52 to 0.59) | 0.07 | 0.06 | 24% | 0.55 | 213 | 16,681 | model |
| Most recent PHQ-2 before Monday minus own running mean | 0.78 (0.75 to 0.81) | 0.31 | 0.06 | 65% | 0.74 | 213 | 16,681 | baseline |
| Own running mean alone | 0.76 (0.72 to 0.80) | 0.16 | 0.06 | 57% | 0.54 | 213 | 16,681 | baseline |
| Base rate (no information) | 0.50 (0.50 to 0.50) | 0.06 | 0.06 | 20% | n/a | 213 | 16,681 | baseline |
| Label-shuffle control (Logistic regression) | 0.51 (0.50 to 0.53) | 0.07 | 0.06 | 21% | n/a | 213 | 16,681 | control |

The running mean uses every PHQ-2 answer dated before Monday of the week, with at least 4 of them. Students with a higher running mean swing more from week to week, so the running mean alone has skill.

### Framing 5: check-ins and earlier answers

| Model | AUC (95% interval) | PR-AUC | Base rate | Interpolated test-ROC sensitivity at 80% specificity | Within-student AUC | Students | Rows | Kind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Phone before the answer only: Logistic regression | 0.60 (0.56 to 0.65) | 0.18 | 0.13 | 32% | 0.57 | 213 | 16,684 | model |
| Phone before the answer only: Gradient boosting (HistGB) | 0.58 (0.53 to 0.64) | 0.18 | 0.13 | 31% | 0.56 | 213 | 16,684 | model |
| Phone before the answer only: Random forest | 0.57 (0.51 to 0.63) | 0.16 | 0.13 | 29% | 0.57 | 213 | 16,684 | model |
| Single last-week check-in (latest answer): Logistic regression | 0.69 (0.66 to 0.73) | 0.25 | 0.13 | 42% | 0.61 | 213 | 16,684 | model |
| Single last-week check-in (latest answer): Gradient boosting (HistGB) | 0.69 (0.66 to 0.72) | 0.24 | 0.13 | 41% | 0.61 | 213 | 16,684 | model |
| Last week's check-ins (mean): Logistic regression | 0.71 (0.67 to 0.74) | 0.26 | 0.13 | 44% | 0.62 | 213 | 16,684 | model |
| Last week's check-ins (mean): Gradient boosting (HistGB) | 0.70 (0.67 to 0.74) | 0.25 | 0.13 | 44% | 0.62 | 213 | 16,684 | model |
| Check-in history: Logistic regression | 0.78 (0.73 to 0.82) | 0.40 | 0.13 | 58% | 0.63 | 213 | 16,684 | model |
| Check-in history: Gradient boosting (HistGB) | 0.74 (0.70 to 0.79) | 0.27 | 0.13 | 48% | 0.61 | 213 | 16,684 | model |
| Phone before the answer plus check-in history: Logistic regression | 0.77 (0.72 to 0.80) | 0.36 | 0.13 | 57% | 0.61 | 213 | 16,684 | model |
| Phone before the answer plus check-in history: Gradient boosting (HistGB) | 0.76 (0.72 to 0.80) | 0.30 | 0.13 | 54% | 0.62 | 213 | 16,684 | model |
| Check-in history plus earlier PHQ-2 answers: Logistic regression | 0.90 (0.88 to 0.92) | 0.62 | 0.13 | 83% | 0.72 | 213 | 16,684 | with history |
| Check-in history plus earlier PHQ-2 answers: Gradient boosting (HistGB) | 0.90 (0.88 to 0.92) | 0.63 | 0.13 | 83% | 0.74 | 213 | 16,684 | with history |
| Phone before the answer plus check-in history plus earlier PHQ-2 answers: Gradient boosting (HistGB) | 0.90 (0.88 to 0.92) | 0.64 | 0.13 | 83% | 0.74 | 213 | 16,684 | with history |
| Most recent PHQ-2 before Monday | 0.88 (0.85 to 0.90) | 0.55 | 0.13 | 79% | 0.74 | 213 | 16,684 | baseline |
| PHQ-2 from last calendar week only, rows that have one | 0.88 (0.86 to 0.90) | 0.56 | 0.12 | 80% | 0.74 | 213 | 14,243 | baseline |
| Base rate (no information) | 0.50 (0.50 to 0.50) | 0.13 | 0.13 | 20% | n/a | 213 | 16,684 | baseline |
| Label-shuffle control (Logistic regression) | 0.50 (0.48 to 0.51) | 0.13 | 0.13 | 19% | n/a | 213 | 16,684 | control |

### Framing 5b: questionnaire inputs from before the recall window

| Model | AUC (95% interval) | PR-AUC | Base rate | Interpolated test-ROC sensitivity at 80% specificity | Within-student AUC | Students | Rows | Kind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Latest PHQ-2 answered 14 or more days before, alone | 0.86 (0.83 to 0.88) | 0.51 | 0.13 | 76% | 0.70 | 213 | 16,684 | baseline |
| Mean of PHQ-2 answers 14 or more days before, alone | 0.87 (0.84 to 0.90) | 0.55 | 0.13 | 79% | 0.59 | 213 | 16,684 | baseline |
| Single check-in 14 or more days before: Logistic regression | 0.70 (0.66 to 0.73) | 0.25 | 0.13 | 45% | 0.60 | 213 | 16,684 | model |
| All questionnaire inputs 14 or more days before: Logistic regression | 0.89 (0.86 to 0.91) | 0.58 | 0.13 | 80% | 0.68 | 213 | 16,684 | with history |
| All questionnaire inputs 14 or more days before: Gradient boosting (HistGB) | 0.89 (0.87 to 0.91) | 0.57 | 0.13 | 82% | 0.70 | 213 | 16,684 | with history |
| Phone before the answer plus those inputs: Gradient boosting (HistGB) | 0.89 (0.87 to 0.91) | 0.59 | 0.13 | 81% | 0.71 | 213 | 16,684 | with history |
| Base rate (no information) | 0.50 (0.50 to 0.50) | 0.13 | 0.13 | 20% | n/a | 213 | 16,684 | baseline |
| Label-shuffle control (Logistic regression) | 0.49 (0.48 to 0.50) | 0.12 | 0.13 | 19% | n/a | 213 | 16,684 | control |

### Framing 7a: Depresjon

| Model | AUC (95% interval) | PR-AUC | Base rate | Interpolated test-ROC sensitivity at 80% specificity | Students | Rows | Kind |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Per person: Logistic regression | 0.71 (0.55 to 0.85) | 0.66 | 0.42 | 58% | 55 | 55 | model |
| Per person: Random forest | 0.84 (0.70 to 0.96) | 0.87 | 0.42 | 80% | 55 | 55 | model |
| Per person: nested choice between the two models | 0.81 (0.67 to 0.94) | 0.86 | 0.42 | 78% | 55 | 55 | nested |
| Per person, all-zero days removed: Logistic regression | 0.72 (0.56 to 0.86) | 0.71 | 0.42 | 54% | 55 | 55 | variant |
| Per person, all-zero days removed: Random forest | 0.85 (0.72 to 0.96) | 0.89 | 0.42 | 83% | 55 | 55 | variant |
| Base rate (no information) | 0.50 (0.50 to 0.50) | 0.42 | 0.42 | 20% | 55 | 55 | baseline |
| Label-shuffle control (Logistic regression) | 0.42 (0.26 to 0.57) | 0.36 | 0.42 | 4% | 55 | 55 | control |
| Per day, split by person: Random forest | 0.64 (0.52 to 0.76) | 0.51 | 0.35 | 42% | 55 | 1,029 | variant |

### Framing 7b: StudentLife 2013

**7b. StudentLife 2013 (external), PHQ-9 >= 10**

| Model | AUC (95% interval) | PR-AUC | Base rate | Interpolated test-ROC sensitivity at 80% specificity | Students | Rows | Kind |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Term average: Logistic regression | 0.70 (0.43 to 0.94) | 0.40 | 0.18 | 57% | 38 | 38 | model |
| Term average: Random forest | 0.76 (0.50 to 0.97) | 0.58 | 0.18 | 71% | 38 | 38 | model |
| Term average: nested choice between the two models | 0.76 (0.56 to 0.94) | 0.44 | 0.18 | 57% | 38 | 38 | nested |
| First version, with logger record counts in place of calls and texts: Logistic regression | 0.76 (0.54 to 0.94) | 0.42 | 0.18 | 60% | 38 | 38 | note |
| Base rate (no information) | 0.50 (0.50 to 0.50) | 0.18 | 0.18 | 20% | 38 | 38 | baseline |
| PHQ-9 at the start of term alone | 0.94 (0.84 to 1.00) | 0.75 | 0.18 | 86% | 38 | 38 | baseline |
| Label-shuffle control (Logistic regression) | 0.65 (0.45 to 0.83) | 0.27 | 0.18 | 46% | 38 | 38 | control |

**7b. StudentLife 2013 (external), PHQ-9 >= 5**

| Model | AUC (95% interval) | PR-AUC | Base rate | Interpolated test-ROC sensitivity at 80% specificity | Students | Rows | Kind |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Term average: Logistic regression | 0.60 (0.41 to 0.78) | 0.62 | 0.50 | 41% | 38 | 38 | model |
| Term average: Random forest | 0.56 (0.37 to 0.76) | 0.57 | 0.50 | 26% | 38 | 38 | model |
| Base rate (no information) | 0.50 (0.50 to 0.50) | 0.50 | 0.50 | 20% | 38 | 38 | baseline |
| PHQ-9 at the start of term alone | 0.89 (0.78 to 0.97) | 0.88 | 0.50 | 81% | 38 | 38 | baseline |
| Label-shuffle control (Logistic regression) | 0.50 (0.30 to 0.68) | 0.58 | 0.50 | 21% | 38 | 38 | control |

## Leakage checks

| Check | Result | What it does |
| --- | --- | --- |
| student split | passed | Every cross-validation fold is checked in code: no student is in both the training and the test part. |
| past only features | passed | Every week after a cut-off was replaced with noise. The z-scores and last-week values up to the cut-off did not change. |
| checkin before label | passed | The latest check-in answer used for a week is always from an earlier day than that week's PHQ-2 answer, and never from the same survey. |
| earlier phq2 before monday | passed | Every earlier PHQ-2 answer used as a feature is dated before Monday of the week, so at least 4 days before the label answer. PHQ-2 asks about the last two weeks, so the baseline is also scored on pairs 14 or more days apart. |
| label shuffle | passed | The same pipeline run on shuffled labels must score near 0.5: within 0.47 to 0.53 on the Dartmouth framings, and with 0.5 inside the 95% interval on the small external samples. |
| phone before answer | passed | In framings 1b, 2, 4 and 5 every phone day used, including the personal baseline weeks and the eligibility count, is dated strictly before the PHQ-2 answer. |
| personal 14 day separation | passed | In the personal models every test answer comes 14 or more days after the last training answer, by actual answer dates. |
| separated inputs before recall window | passed | In framing 5b every PHQ-2 and check-in input is dated 14 or more days before the answer, so it shares no day with the two weeks the answer describes. |
| no self report in passive | passed | Every passive feature set is checked in code for PHQ, label, check-in or history columns. |
| transforms inside folds | passed | Scaling, imputation and every model are fit on the training part of each fold only. Personal z-scores use only the student's earlier weeks. |
| auc above 0.90 | flagged, explained below | Any honest result above AUC 0.90 is treated as a suspected leak and investigated. |

On framing 1a's weeks, the most recent PHQ-2 before Monday came a median of 9 days before the target answer (at least 4). 85% of those pairs were less than 14 days apart, so the two answers describe some of the same days.

### A leak found in the first run, and fixed

In the first run, check-in history plus earlier PHQ-2 answers scored above 0.90. We treated that as a leak and went looking.

- **Cause.** "Last week's PHQ-2" was taken from last week's label, whose window runs Thursday to Wednesday. So it could be a different answer given on Monday to Wednesday of this week, one to three days before this week's answer, with a recall period that overlaps it almost fully. Before the fix 2% of these pairs were less than 4 days apart. None fell on the same day (0 same-day pairs).
- **Fix.** Use only PHQ-2 answers dated before Monday of this week, the same rule as the check-in. After the fix no pair is less than 4 days apart.

| Result, on framing 1a's weeks | Before the fix | After the fix |
| --- | --- | --- |
| Most recent PHQ-2 before Monday alone | 0.884 | 0.877 |
| Check-in history plus earlier PHQ-2 answers (gradient boosting) | 0.909 | 0.904 |

The fix moved these numbers very little. The pre-Monday cut-off is fixed. The overlap in recall periods is not, and framing 5b handles it separately.

### Rows above 0.90

- 3. Between students, same-term association: Last term's average PHQ-2 alone, 0.92
- 3. Between students, same-term association: Last term's average PHQ-2, rows that have one, 0.94
- 5. Check-ins and earlier answers: Check-in history plus earlier PHQ-2 answers: Gradient boosting (HistGB), 0.90
- 5. Check-ins and earlier answers: Phone before the answer plus check-in history plus earlier PHQ-2 answers: Gradient boosting (HistGB), 0.90
- 7b. StudentLife 2013 (external), PHQ-9 >= 10: PHQ-9 at the start of term alone, 0.94

Each of these uses the student's earlier PHQ answers. Those answers are dated before Monday of the week, or come from an earlier term or the start of the term, and the test students were never in training. Where these rows use phone data, it comes from before the answer. We found no further leak. What lifts them is persistence: a student who answered high before tends to answer high again. The evidence:

- The average of each student's answers before Monday scores 0.88 by itself.
- With every questionnaire input 14 or more days old (framing 5b), the latest PHQ-2 alone scores 0.86 and all those inputs 0.89.
- Within a single student, check-in history plus earlier PHQ-2 ranks weeks at 0.74, against 0.57 for phone data before the answer.

These numbers are real, and they come from asking. Most of the lift is knowing who is usually high and how they felt in the days before. Inside a student it helps because high scores tend to come in runs of weeks.

## What a near-perfect number is made of

These were built wrong on purpose, on framing 1a's weeks, to show what an AUC near 1.0 usually means. Each one has a fair version beside it.

| Built wrong | AUC | Why it is wrong | Fair version | AUC |
| --- | --- | --- | --- | --- |
| Anxiety items from the label's own survey | 0.81 | PHQ-4 items 1 and 2 are answered on the same screen, seconds before the two items that make the label. | Same-week phone plus check-in history (logistic) | 0.74 |
| The PHQ-4 total from the label's own survey | 0.98 | The PHQ-4 total contains the two PHQ-2 items, so it is the label plus noise. | Most recent PHQ-2 before Monday | 0.88 |
| Each student's average PHQ-2 over all their weeks | 0.88 | The average includes this week's answer and every later answer. | Average of earlier answers only | 0.88 |
| Weeks split at random, so each student sits in train and test | 0.82 | The model learns each student's usual phone pattern and their usual mood, then meets the same student again. | Split by student | 0.57 |
| Random week split, with check-ins and earlier PHQ-2 answers as features | 0.91 | Same as above, with mood answers added. The model meets students it already knows. | Same features, split by student | 0.90 |
| z-scores normalised with the student's future weeks | 0.55 | Each week is compared with a mean and spread that include later weeks. | Own-past z-scores only | 0.52 |
| Depresjon days split at random | 0.83 | Days from the same person land in train and test, so the model recognises the person. | Per day, split by person | 0.64 |

## External data

| Dataset | Source | Licence and terms | Used for |
| --- | --- | --- | --- |
| Depresjon (Simula Research Laboratory) | https://datasets.simula.no/depresjon/ , file depresjon.zip (5.4 MB), no account or agreement | No licence named. The page's terms of use ask that any document reporting results cites Garcia-Ceja et al., MMSys 2018. | 55 people (23 depressed patients, 32 controls), 1,029 full days of minute-level wrist activity |
| StudentLife 2013 (Dartmouth), RData copy | Zenodo record 3529253, file dataset_rds.zip (230 MB), open access, no account. The original site studentlife.cs.dartmouth.edu did not answer from this machine. | CC BY 4.0 on the Zenodo record. Cite Wang et al., UbiComp 2014. The original site's own terms could not be read because it was unreachable. | 38 students with an end-of-term PHQ-9 (7 at 10 or more), a median of 62 days of phone data each |

**Closest framing.** Both have one label per person, so both match framing 3. Depresjon: each person's average activity, its spread from day to day, the share of still minutes, and night against day activity, against patient or control. StudentLife: term averages of activity, conversation, darkness, phone lock, charging, distance, places and call events, against the end-of-term PHQ-9. Its baseline is the start-of-term PHQ-9. Both use repeated 5-fold splits by person, and every prediction comes from models that never saw that person. The StudentLife PHQ-9 table has no answer dates, so we cannot check that the phone data came before the answers.

**Depresjon.** A case-control sample: adults with a depression diagnosis against healthy people. Telling those groups apart is far easier than spotting a bad week in a student. In 12 people's recordings some days had no activity at all, which may mean the watch was off. Removing those 70 days gave 0.85 (0.72 to 0.96) with a random forest. Its day-level rows also show the random-split leak in a second dataset.

**StudentLife correction.** The first version counted logger records as texts and calls. Most call-log records are empty polls, and the text table has no message events at all. Calls are now unique call events dated by the call itself, and texts are dropped. The first version's logistic regression scored 0.76; the corrected one scores 0.70. With 7 positive students the intervals run from about 0.43 to 0.97, and the start-of-term PHQ-9 alone scores 0.94.

**Needs the team to apply.** These were left out because they sit behind a login or an agreement:

- GLOBEM (University of Washington, several years of student phone and wearable data with PHQ-4 surveys): PhysioNet credentialed access and a signed data use agreement.
- DAIC-WOZ and E-DAIC (USC, clinical interviews with PHQ-8): a signed end-user licence agreement, academic use.
- BRIGHTEN (phone app study of depression, PHQ-9): a Synapse account and an approved data access request.

No social media posts were collected.

## What the numbers show and what they do not

Phone data alone carries a little information about mood. Using only days before the answer, it scores 0.57 to 0.60 on students the models never saw, and inside a student it ranks weeks at about 0.57. At 80% specificity on the test ROC curve it reaches about 31% sensitivity, which is too low to act on alone.

The student's own answers carry far more. A single check-in from the week before scores 0.69, and the most recent PHQ-2 before Monday 0.88. Personal models gain because they learn how often each student is usually high, from that student's answers. Adding phone data to the same answer history did not reliably help: with 16 training weeks it moved logistic regression from 0.80 to 0.76, and adding the shared phone model's score gave 0.80. Inside a student, phone data does add a little: the history alone ranks weeks at 0.50 and history plus phone at about 0.57.

Nothing here shows that a phone can detect depression. In this data the answers did most of the work. A high PHQ-2 week is a screening result, and a doctor makes the diagnosis.

For the design, this supports the direction Experiment 1 pointed to: ask on a regular schedule with a one-tap check-in, and treat phone signals as context.

## Why not 100%

The team asked for almost 100% accuracy. Here is why that is the wrong target, and why we did not tune toward it.

- **Accuracy hides the problem.** Only 13% of weeks are high. A model that always says "fine" is 87% accurate and catches no one. That is why every number here is AUC, PR-AUC or sensitivity.
- **The label moves by itself.** In this data, among 12,116 pairs of PHQ-2 answers from the same student 1 to 3 days apart, 7% switched between high and not high (Cohen's kappa 0.65). Of the pairs whose first answer was high, 31% were not high on the second. Both answers describe nearly the same two weeks, so a model that predicts one of them cannot be expected to match the other perfectly.
- **The phone sees behaviour.** Sleep, movement and phone use change for many reasons: exams, travel, a new schedule, illness. Mood is only one of them.
- **Near-perfect phone scores come from leaks.** The table above shows each one. Same-survey answers give 0.98. Letting the same students appear in training and test gives 0.82 from phone data, which falls to 0.57 once students are kept apart. The only honest rows near 0.90 use the student's own earlier PHQ answers, so they come from asking.

The honest numbers to quote: phone data recorded before the answer 0.57 to 0.60; a single check-in from the week before 0.69; the most recent PHQ-2 before Monday 0.88.

## Caveats

- These are Dartmouth college students from 2017 to 2022, through the pandemic. Stability is meant for high school students.
- The label is a weekly PHQ-2 answered on the phone. It is a screening score, and a doctor makes the diagnosis.
- Phone features are the study's own daily summaries. Typing, tone and music were not available.
- Every AUC is an exploratory cross-validation estimate for one model. The intervals resample students but do not include choosing among models.
- best_passive_auc is the highest of three models on phone data from before the answer (0.60); the range across models is 0.57 to 0.60.
- Sensitivity at 80% specificity is read off the test ROC curve and interpolated. It is descriptive and is not a tested operating threshold.
- Most earlier PHQ-2 answers fall within the two weeks the target answer describes, so those baselines measure overlapping answers. Framing 5b removes that overlap.
- Leaving calendar time out of the features does not rule out calendar effects, because phone habits change with the seasons and years too. A test on held-out later years would be needed.
- Depresjon compares hospital patients with healthy controls, which is an easier task than spotting a bad week in a student.
- StudentLife has 38 students with an end-of-term PHQ-9, 7 of them at 10 or more, so its intervals are very wide.
- Terms are calendar blocks that follow Dartmouth's quarters by month, so a few weeks near the edges may sit in the wrong term.

## How to run

```
.venv/bin/python experiments/exp1b_deeper.py                # uses the caches in data/cache/
.venv/bin/python experiments/exp1b_deeper.py --refresh      # rebuilds every cache from data/
.venv/bin/python experiments/exp1b_deeper.py --report-only  # rewrites the reports from the last run
```

The last run took 4.7 minutes. `--refresh` also rebuilds Experiment 1's daily and weekly caches and the StudentLife table. It needs `pyreadr` for StudentLife (`uv pip install --python .venv/bin/python pyreadr`). Depresjon goes in `data/depresjon/` and the StudentLife RData copy in `data/studentlife/`; either is skipped when missing. Code hashes and source file sizes are in `results.json` under `provenance`. The notebook `notebooks/03_deeper_evaluation.ipynb` reads `results/exp1b/results.json` and draws the summary chart.

*This is a prototype analysis and is not medical advice. It was written with Claude (Anthropic).*
