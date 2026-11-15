# Experiment 1: does the drift rule pick better weeks to ask?

Generated 2026-11-14 by `experiments/exp1_timing.py`. Data: College Experience Study (Dartmouth), CC BY-NC-SA 4.0, used for academic purposes only. Every number below is an aggregate over students. No student ids or per-student rows appear in this file.

## Short answer

At 21 asks per student-year, 14.6% of the drift rule's asks landed on weeks with a high mood score against 12.9% for a fixed calendar, but random weeks from the same student in the same three months did as well (14.9%), so the rule found harder stretches and did no better than chance at picking the week.

- **Asks.** At the rule's own budget of 21.4 asks per student-year, its hit rate was 14.6% against 12.9% for a fixed calendar and a base rate of 12.9%. The gap was +1.8 points (95% interval 0.0 to 3.7 points when students are resampled).
- **Why the gap appears.** Random weeks drawn from the same student in the same calendar quarter, with the same number of asks in each, reached 14.9% (95% interval 14.5% to 15.2%). 91% of those draws did at least as well as the rule. The rule asks more often in later years and in harder stretches, when more students score high. Within those stretches it chose weeks no better than chance.
- **Low periods reached.** The calendar reached 88% of low periods (two or more high weeks in a row). The rule reached 55%, because its asks bunch up in some students and some stretches.
- **Learned weights.** A logistic regression trained on half the students scored an AUC of 0.48 (95% interval 0.43 to 0.54) on the other half, which is chance. Over five splits its AUC ran from 0.43 to 0.53. A plain count of signals out of range did slightly better, at 0.56 on average.
- **Parent heads-up.** Chosen on training students: 6 weeks with two signals out, then 3 weeks of cooldown. On test students it sent 2.8 heads-ups per student-year, and 15.8% landed near a high score, against 15.5% for a calendar sending the same number (difference +0.4 points, 95% interval -3.4 to 5.0 points).
- **Check at the door.** 37 students had a high score in one of their four learning weeks. The drift rule never asked 11 of them in weeks 5 to 12, and 10 of those were still scoring high then. It skipped 33% of the other students in those weeks too, so it does not pick out the students who start high.

## What we tested

Steady asks a student two screening questions when their phone signals stay outside their own normal range. The question here is whether that rule picks better weeks to ask than a fixed calendar that asks the same number of times. A second question is whether the parent heads-up rule, run on phone signals alone, picks better weeks than a calendar. The PHQ-2 answers that Dartmouth students gave on their phones are the yardstick: a week counts as high when PHQ-2 is 3 or more, the published screening cut-off.

## Data

| Item | Value |
| --- | --- |
| PHQ-2 answers | 35,348 from 218 students |
| Share of answers at 3 or more | 12.1% |
| Median days between a student's answers | 5 |
| Students analysed (4 learning weeks plus at least one monitored week) | 213 (183 iPhone, 30 Android) |
| Monitored student-weeks | 22,688 (436 student-years) |
| Monitored weeks with a label | 16,886 (74%) |
| Base rate (labelled monitored weeks at 3 or more) | 12.9% |

## Signals

Each of Steady's signals was mapped to a feature recorded on both iPhone and Android. Each weekly value is the mean over the week's usable days unless the note says otherwise.

| Signal | Feature | Worse when | Note |
| --- | --- | --- | --- |
| Sleep | `sleep_duration` | lower | Mean nightly sleep (hours) from the study's sleep model. Nights scored 0 are treated as missing. |
| Bedtime regularity | `sleep_start (weekly SD)` | higher | Standard deviation of sleep start time across the week's usable nights (hours). Needs 3 or more nights. A start coded exactly 0 (8 PM) is treated as missing. |
| Phone use after midnight | `unlock_duration_hr_0..hr_4` | higher | Minutes the phone was unlocked between midnight and 5 AM, summed per day, averaged over the week. |
| Time with others | `loc_social_dur + loc_other_dorm_dur` | lower | Hours a day at social places plus other students' dorms. On campus only, so it falls to near zero during breaks. |
| Places visited | `loc_visit_num_ep_0` | lower | Number of distinct places visited per day. |
| Distance travelled | `loc_dist_ep_0 (log scale)` | lower | log10(1 + km travelled per day), averaged over the week. The log stops one long trip from dominating. |

Steps and late-night audio (iPhone only) and texts, calls and nearby conversation (Android only) were run as secondary checks.

## Rules and choices

- **Usable day:** activity and location data each cover at least 12 hours (`quality_activity` and `quality_loc`).
- **Valid week:** Monday to Sunday with at least 4 usable days. A week short of that breaks every run and cannot hold an ask.
- **Label:** the PHQ-2 answer nearest the end of the week (Sunday), within 3 days either side, so Thursday of that week to Wednesday of the next. These windows do not overlap, so each answer labels one week at most. Weeks without a label still exist but cannot be scored.
- **Personal range:** the mean and spread of each signal over the student's first 4 valid weeks. The spread is the larger of the baseline standard deviation and 0.25 times the standard deviation of that signal across all valid student-weeks. The range is then frozen.
- **Rule:** z is measured in the worse direction. A signal is out when z is 1.0 or more, counts after 2 weeks out in a row, and an ask fires in every week that 2 or more signals count.
- **Budget:** asks per student-year, where a student-year is 52 monitored weeks (valid weeks after the four learning weeks). Every method may only ask in monitored weeks.
- **Fixed calendar:** each student is asked at evenly spaced monitored weeks at the rule's overall rate. Results are averaged over 10 start offsets.
- **Random weeks:** 1000 draws of the same total number of asks. Two stricter versions keep the rule's count of asks for each student, and for each student in each calendar quarter.
- **Hit rate:** the share of scored asks (asks in a labelled week) whose label is high. Lift is hit rate over the base rate.
- **Low period (episode):** two or more consecutive weeks with high labels after the learning weeks. A week without a label ends it. It is reached if any ask falls in it.
- **Student splits:** students, never weeks, are split in half with fixed seeds (5 splits). The first split is the primary one.

## Result 1: asks at the same budget (k = 1.0)

All 213 students. Budget: 21.4 asks per student-year.

| Method | Hit rate (95% interval) | Lift | Low periods reached | High weeks asked | False alarms per student-year |
| --- | --- | --- | --- | --- | --- |
| Steady drift rule | 14.6% | 1.14 | 55% | 46% | 13.5 |
| Fixed calendar | 12.9% | 1.00 | 88% | 41% | 13.9 |
| Random weeks | 12.9% (12.2% to 13.4%) | 1.00 | 73% |  |  |
| Random weeks, same count per student | 13.5% (13.1% to 14.0%) | 1.05 | 70% |  |  |
| Random weeks, same count per student and quarter | 14.9% (14.5% to 15.2%) | 1.16 | 64% |  |  |

Missed cases and false alarms, drift rule: 1,164 of 2,171 high weeks got no ask, and 201 of 451 low periods got none. 5,869 asks landed on labelled weeks that were not high. For the calendar the same counts were 1,277 high weeks missed, 56 low periods missed and 6,056 false alarms.

The rule beat the calendar by 1.8 points, and the 95% interval (0.0 to 3.7 points) only just clears zero. The calendar spreads asks evenly over every student and every year. The rule does not, and the table below shows why that matters: the frozen range drifts, so the rule asks more often each year, and more students score high in later years.

| Year since monitoring began | Students | Weeks with an ask | Rule hit rate | Base rate |
| --- | --- | --- | --- | --- |
| 1 | 213 | 26% | 9.1% | 9.5% |
| 2 | 175 | 44% | 16.7% | 15.2% |
| 3 | 141 | 61% | 16.6% | 15.6% |
| 4 | 96 | 56% | 17.1% | 15.8% |

Random weeks that keep the rule's count of asks for each student in each quarter do as well as the rule (14.9% against 14.6%). So the rule's edge over the calendar comes from where its asks fall across students and seasons. Inside a student's quarter, its choice of week adds nothing.

One check on that comparison: in a quarter where the rule asked every week, the random draw has no choice. 28% of the rule's asks fall in such quarters. Leaving them out, the rule's hit rate was 13.6% against 13.8% for chance in the same quarters, so the result does not depend on them.

## Result 2: other thresholds and the adaptive range

| Setting | Asks per student-year | Rule hit rate | Calendar | Random 95% interval | Random, same student and quarter | Rule minus calendar (95% interval) | Low periods reached, rule | Low periods reached, calendar |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| k = 0.75 | 25.7 | 14.6% | 12.9% | 12.4% to 13.4% | 14.8% | +1.7 points (0.3 to 3.2 points) | 66% | 96% |
| k = 1.0 | 21.4 | 14.6% | 12.9% | 12.2% to 13.4% | 14.9% | +1.8 points (0.0 to 3.7 points) | 55% | 88% |
| k = 1.5 | 14.1 | 14.4% | 12.9% | 12.0% to 13.7% | 14.5% | +1.5 points (-1.4 to 4.9 points) | 36% | 69% |
| k = 1.0, adaptive range | 43.9 | 13.8% | 12.9% | 12.6% to 13.1% | 13.7% | +0.9 points (0.5 to 1.3 points) | 93% | 99% |

The picture is the same at every threshold. The adaptive range follows concept.md: the mean moves 0.3 of the way toward a better week, 0.05 of the way toward a worse week that is still in range, and not at all while that signal is out. Because it ratchets toward the student's best weeks, ordinary weeks then look worse, and the rule asked in 84% of monitored weeks. That is close to asking every week, which is why its hit rate sits near the base rate.

## Result 3: logistic regression

Features: each signal's z this week and last week, plus the number of signals out (13 features). z is clipped to plus or minus 6 and a missing value is set to 0. The model is fit on the training half of the students and scored on the other half. The hit rate uses the rule's budget on the same test students, taking the test weeks with the highest predicted risk.

| Split seed | Test AUC (95% interval) | Within-student AUC | AUC of signals-out count | Logistic hit rate | Rule hit rate | Calendar hit rate |
| --- | --- | --- | --- | --- | --- | --- |
| 20261114 | 0.482 (0.428 to 0.537) | 0.518 | 0.534 | 11.2% | 12.9% | 11.9% |
| 20261214 | 0.528 (0.470 to 0.586) | 0.549 | 0.550 | 13.4% | 14.2% | 12.4% |
| 20261314 | 0.427 (0.370 to 0.516) | 0.508 | 0.590 | 8.4% | 14.5% | 10.9% |
| 20261414 | 0.534 (0.485 to 0.592) | 0.563 | 0.574 | 12.3% | 13.1% | 10.8% |
| 20261514 | 0.495 (0.447 to 0.545) | 0.513 | 0.537 | 14.3% | 14.1% | 13.8% |

Training AUC on the first split was 0.61, and it fell to 0.48 on new students. The weights it learns describe the training students and do not carry over. Splitting weeks at random instead of students, which puts the same students on both sides, gives 0.55, so even that flattering split finds little. Within-student AUC compares only weeks of the same student, and it averaged 0.53.

Weights from the first split (z units):

| Feature | Weight |
| --- | --- |
| intercept | -2.015 |
| z_sleep | 0.023 |
| z_bedtime | -0.019 |
| z_night_phone | 0.110 |
| z_time_with_others | 0.055 |
| z_places | 0.021 |
| z_movement | 0.014 |
| z_sleep_last_week | -0.042 |
| z_bedtime_last_week | -0.034 |
| z_night_phone_last_week | 0.093 |
| z_time_with_others_last_week | 0.008 |
| z_places_last_week | -0.027 |
| z_movement_last_week | -0.031 |
| signals_out | 0.053 |

## Result 4: parent heads-up, phone signals only

This simulates a teen who skips every question. A heads-up fires when two signals have each been out for W weeks in a row, counted from when the second one left its range. After a heads-up, the next C weeks are a cooldown: evidence is held, and from week C + 1 the rule fires again if two signals are still out for W weeks. A heads-up is scored when week t or week t + 1 has a label, and is a hit when either label is high.

W and C were chosen on the training students of the first split: the best hit rate with at most 4 heads-ups per student-year, ties going to fewer heads-ups.

| W | C | Heads-ups per student-year (train) | Hit rate (train) | Scored heads-ups |
| --- | --- | --- | --- | --- |
| 3 | 2 | 6.86 | 20.3% | 1330 |
| 3 | 3 | 5.58 | 20.3% | 1084 |
| 3 | 4 | 4.79 | 18.7% | 924 |
| 4 | 2 | 5.58 | 21.8% | 1073 |
| 4 | 3 | 4.47 | 21.4% | 854 |
| 4 | 4 | 3.80 | 21.2% | 731 |
| 5 | 2 | 4.63 | 20.4% | 896 |
| 5 | 3 | 3.72 | 20.1% | 717 |
| 5 | 4 | 3.18 | 21.1% | 610 |
| 6 | 2 | 4.03 | 22.2% | 780 |
| 6 | 3 | 3.21 | 21.7% | 627 |
| 6 | 4 | 2.71 | 21.5% | 525 |

Chosen: W = 6, C = 3. Frozen and scored on the 107 test students:

| Measure | Heads-up rule | Calendar, same count |
| --- | --- | --- |
| Heads-ups per student-year | 2.81 | 2.78 |
| Hit rate | 15.8% | 15.5% |
| False alarms per student-year (scored and not high) | 2.10 | 2.13 |
| Low periods reached | 12% | 15% |

Base rate under this two-week definition: 15.5%. Random weeks at the same count: 12.6% to 18.3%. Random weeks with the same count per student and quarter: 16.2% (14.4% to 18.2%). The rule minus the calendar was +0.4 points (95% interval -3.4 to 5.0 points). The training hit rate of 21.7% did not hold on new students. 198 of 225 low periods among test students got no heads-up.

Repeated over five student splits, choosing W and C on each training half:

| Split seed | Chosen | Heads-ups per student-year (test) | Hit rate (test) | Calendar (test) | Difference (95% interval) |
| --- | --- | --- | --- | --- | --- |
| 20261114 | W = 6, C = 3 | 2.81 | 15.8% | 15.5% | +0.4 points (-3.4 to 5.0 points) |
| 20261214 | W = 6, C = 3 | 3.04 | 17.8% | 15.6% | +2.3 points (-2.2 to 7.3 points) |
| 20261314 | W = 5, C = 3 | 3.05 | 17.3% | 14.2% | +3.1 points (-1.5 to 8.3 points) |
| 20261414 | W = 6, C = 2 | 3.95 | 16.6% | 14.1% | +2.5 points (-2.0 to 8.7 points) |
| 20261514 | W = 6, C = 2 | 3.89 | 16.7% | 17.5% | -0.8 points (-5.3 to 4.0 points) |

The starting guess in parent-alerts.md, four weeks and at most one heads-up every three weeks (W = 4, C = 2), sent 5.0 heads-ups per student-year on test students with a hit rate of 16.5%, against 15.6% for the calendar.

## Result 5: check at the door

Students with at least 12 valid weeks: 212. Weeks 1 to 4 are the learning weeks and weeks 5 to 12 are the first monitored weeks.

| Group | Students | Never asked in weeks 5 to 12 | Still high in weeks 5 to 12 | Never asked and still high |
| --- | --- | --- | --- | --- |
| A high score in any learning week | 37 | 11 (30%) | 29 | 10 |
| Average PHQ-2 of 3 or more over the learning weeks | 12 | 3 (25%) | 11 | 3 |
| Everyone else | 175 | 58 (33%) | 25 | 5 |

The drift rule alone would leave 11 of the 37 students who started high without a single ask for two months. This is the case the eight questions at setup are for. Their miss rate is about the same as everyone else's (33%): the rule does not find students who start high any more often than students who do not.

## Secondary checks

Single-signal AUC on all monitored labelled weeks (z in the worse direction against a high label; 0.5 is chance):

| Signal | AUC | Share of weeks out (z of 1 or more) |
| --- | --- | --- |
| Sleep | 0.521 | 23% |
| Bedtime regularity | 0.516 | 22% |
| Phone use after midnight | 0.548 | 21% |
| Time with others | 0.505 | 38% |
| Places visited | 0.532 | 59% |
| Distance travelled | 0.532 | 25% |

| Group | Asks per student-year | Rule hit rate | Calendar | Random, same student and quarter |
| --- | --- | --- | --- | --- |
| iPhone (183 students), core signals | 20.7 | 15.5% | 13.5% | 15.7% |
| iPhone (183 students), core plus platform signals | 26.6 | 15.0% | 13.5% | 15.3% |
| Android (30 students), core signals | 25.1 | 11.7% | 10.1% | 12.0% |
| Android (30 students), core plus platform signals | 29.4 | 11.4% | 10.1% | 11.4% |

Single-signal AUC for the platform-only signals: Steps 0.53 (12,850 weeks); Audio playback after midnight 0.53 (13,555 weeks); Texts sent 0.57 (2,605 weeks); Calls made 0.44 (2,605 weeks); Conversation heard 0.63 (2,605 weeks). The Android numbers come from 30 students and should be read as a hint for later work.

## What this shows and what it does not

It shows that, in this dataset, the drift rule as written does not choose better weeks to ask than chance once you account for which student and which season the asks fall in. A fixed calendar at the same budget reaches more low periods. Learned weights did not carry over to new students. The parent heads-up rule, run on phone signals alone, landed near high scores about as often as a calendar with the same number of notes.

It does not show that phone signals are useless for Steady. The features here are the study's own, and typing, tone and music were missing. The students were also older than Steady's users. It cannot say whether a note helped a family. A high mood score only stands in for a note being right.

For the design, this weakens the case for the drift rule as the main trigger. The check at the door and the two-monthly ask do not depend on it. The adaptive range as written asked in most weeks, so its update needs rethinking before it is used.

## Caveats

- Mood scores stand in for a note being right. They cannot show whether a note helped a family.
- The students are Dartmouth undergraduates followed from 2017 to 2022, through the pandemic. Steady is meant for high school students.
- The label is two PHQ-4 items answered on the phone, counted as high at 3 or more. Only 74% of monitored weeks have one.
- The phone signals are the study's own features. Steady would record different ones, and typing, tone and music were not available.
- The personal range is learned in each student's first four valid weeks and then frozen, so it drifts: the rule asked in 26% of weeks in year one and 61% in year three.
- At k = 1.0 the rule asks in 41% of monitored weeks, far more often than a real app should.
- The logistic regression and heads-up numbers come from the test half of one fixed split of students. The spread over five splits is in results.json.
- Nothing here shows that phone signals detect depression.

## How to run

```
.venv/bin/python experiments/exp1_timing.py            # uses the cache in data/cache/
.venv/bin/python experiments/exp1_timing.py --refresh  # rebuilds the weekly table from data/ces/
```

The run takes about 45 seconds after the cache is built. The notebook `notebooks/01_timing_model.ipynb` calls the same functions and draws the charts.

*This is a prototype analysis and is not medical advice. It was written with Claude (Anthropic).*
