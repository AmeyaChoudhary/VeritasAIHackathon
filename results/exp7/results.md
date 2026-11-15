# Experiment 7: do the digital-life signals line up with depression signs in US high schools?

Generated 2026-11-15 by `experiments/exp7_digital_life.py`. Data: CDC Youth Risk Behavior Survey, national high school files for 2023 and 2025, and NHANES August 2021 to August 2023 (DPQ_L, DEMO_L). CDC data are public domain. Every number is an aggregate.

## Short answer

On 10,483 US high school students in 2025, a model trained on 2023 students using only digital-life answers (social media use, sleep and online bullying) sorted who had felt sad or hopeless with an AUC of 0.65 (0.64 to 0.67). Sex and grade alone scored 0.62. Sleep showed the clearest steps: 54% of students sleeping 4 hours or less felt sad or hopeless, against 24% at 8 hours. 40% of those on social media more than once an hour did, against 23% of non-users and 25% to 32% in between. In NHANES adults aged 18 to 24 (the public file has no PHQ-9 answers under 18), a PHQ-2 of 3 or more caught 59% (51% to 68%) of those with a PHQ-9 of 10 or more.

This is one survey of many teens on one day. It says these signals go with depression signs across teens. It does not say that a change in one teen's week predicts that teen's mood.

## What we tested

- **Students.** 20,103 students in the 2023 file, 19,863 of whom answered the sad or hopeless question, trained the models. 10,710 different students in the 2025 file (10,483 answered it) tested them.
- **Label.** Felt so sad or hopeless almost every day for two weeks or more in a row in the past 12 months that they stopped some usual activities (CDC's QN26). Second labels: seriously considered suicide in the past 12 months (QN27), and mental health most of the time or always not good in the past 30 days.
- **Inputs.** Only digital-life answers: how often the student uses social media (8 levels), hours of sleep on a school night (7 levels) and whether they were bullied electronically in the past 12 months. Each has its own "did not answer" level. The app reads sleep and phone screen time. Neither year has a screen-time or video-game question, so social media use stands in for screen time. The app does not read bullying, so sleep and social media alone are also scored.
- **Models.** Logistic regression with the digital signals only, then with sex and grade added, then sex and grade alone, to see how much is demographics. The models are fit without survey weights, and AUC is shown both unweighted and survey-weighted.
- **Intervals.** 95% intervals resample the 2025 survey's sampling units (areas), so students from one area move together.

Question numbers moved between years, so the script reads every position from CDC's SAS programs and stops if a label or answer code differs from what it expects:

| Item | 2023 | 2025 | CDC label |
| --- | --- | --- | --- |
| Social media frequency | Q80 (column 111) | Q77 (column 108) | "Social media" |
| Sleep hours, school night | Q85 (column 116) | Q83 (column 114) | "Hours of sleep on school night" / "Sleep" |
| Electronic bullying | Q25 (column 56) | Q24 (column 55) | "Electronic bullying" |
| Sad or hopeless (label) | QN26 (column 203) | QN26 (column 204) | "Felt sad or hopeless" |
| Considered suicide | QN27 (column 204) | QN27 (column 205) | "Seriously considered attempting suicide" |
| Mental health mostly not good | QN84 (column 261) | QN81 (column 259) | "Reported that their mental health was most of the time or always not good" |
| Sex | Q2 (column 18) | Q2 (column 18) | "What is your sex" |
| Grade | Q3 (column 19) | Q3 (column 19) | "In what grade are you" |

Our coding of the raw answers matched CDC's own yes/no flags for every student on every item checked.

The 2023 weighted shares (40% sad or hopeless, 20% considered suicide) match what CDC published for 2023, which checks the reading of the files and weights.

## Results

### How well the signals sort students (trained on 2023, tested on 2025)

| Label | Model | AUC on 2025 (95% interval) | AUC, survey-weighted | AUC on 2023 (training) | 2025 students | Share with label (weighted) |
| --- | --- | --- | --- | --- | --- | --- |
| Felt sad or hopeless (main) | Digital signals only | 0.65 (0.64 to 0.67) | 0.67 | 0.70 | 10,483 | 33% |
|  | Digital signals plus sex and grade | 0.70 (0.69 to 0.71) | 0.71 | 0.73 |  |  |
|  | Sex and grade only | 0.62 (0.61 to 0.63) | 0.61 | 0.63 |  |  |
| Considered suicide | Digital signals only | 0.66 (0.65 to 0.67) | 0.68 | 0.70 | 10,454 | 14% |
|  | Digital signals plus sex and grade | 0.69 (0.67 to 0.70) | 0.70 | 0.72 |  |  |
|  | Sex and grade only | 0.59 (0.57 to 0.60) | 0.57 | 0.60 |  |  |
| Mental health mostly not good (past 30 days) | Digital signals only | 0.64 (0.62 to 0.66) | 0.65 | 0.67 | 8,802 | 23% |
|  | Digital signals plus sex and grade | 0.68 (0.67 to 0.71) | 0.69 | 0.71 |  |  |
|  | Sex and grade only | 0.62 (0.61 to 0.64) | 0.62 | 0.63 |  |  |

For the main label, adding sex and grade moved the AUC by +0.05 (+0.04 to +0.05). The digital signals beat sex and grade alone by +0.04 (+0.02 to +0.05). The same model scored 0.70 on the 2023 students it was fit on, so it sorted the 2025 students a little less well than the students it learned from. 40% of students felt sad or hopeless in 2023 and 33% in 2025.

Each signal on its own, for the main label:

| Model | AUC on 2025 (95% interval) | AUC, survey-weighted |
| --- | --- | --- |
| Sleep and social media only | 0.61 (0.59 to 0.62) | 0.63 |
| Sleep only | 0.60 (0.58 to 0.61) | 0.62 |
| Social media only | 0.55 (0.54 to 0.56) | 0.55 |
| Electronic bullying only | 0.59 (0.58 to 0.60) | 0.59 |

### Share who felt sad or hopeless, by each signal (survey-weighted)

**Social media use**

| Answer | 2025 students | Sad or hopeless, 2025 (95% interval) | Girls 2025 | Boys 2025 | All 2023 | Considered suicide, 2025 |
| --- | --- | --- | --- | --- | --- | --- |
| I do not use social media | 620 | 23% (18% to 28%) | 30% | 19% | 32% | 10% |
| A few times a month | 216 | 29% (21% to 39%) | 38% | 24% | 33% | 13% |
| About once a week | 116 | 28% (17% to 40%) | 34% | 24% | 38% | 21% |
| A few times a week | 440 | 25% (19% to 31%) | 39% | 14% | 35% | 14% |
| About once a day | 475 | 29% (24% to 35%) | 36% | 24% | 28% | 11% |
| Several times a day | 4,151 | 32% (30% to 34%) | 42% | 22% | 40% | 13% |
| About once an hour | 653 | 31% (25% to 36%) | 40% | 24% | 38% | 15% |
| More than once an hour | 3,015 | 40% (38% to 43%) | 51% | 29% | 47% | 19% |
| Did not answer | 797 | 36% (22% to 39%) | 45% | 27% | 38% | 14% |

**Sleep on a school night**

| Answer | 2025 students | Sad or hopeless, 2025 (95% interval) | Girls 2025 | Boys 2025 | All 2023 | Considered suicide, 2025 |
| --- | --- | --- | --- | --- | --- | --- |
| 4 or less hours | 738 | 54% (48% to 59%) | 62% | 47% | 61% | 27% |
| 5 hours | 1,185 | 48% (45% to 51%) | 56% | 38% | 57% | 21% |
| 6 hours | 2,136 | 40% (36% to 43%) | 48% | 30% | 43% | 16% |
| 7 hours | 2,418 | 27% (24% to 30%) | 35% | 20% | 34% | 12% |
| 8 hours | 1,576 | 24% (21% to 27%) | 36% | 14% | 26% | 8% |
| 9 hours | 345 | 17% (12% to 22%) | 28% | 11% | 28% | 10% |
| 10 or more hours | 157 | 20% (12% to 31%) | 31% | 11% | 34% | 7% |
| Did not answer | 1,928 | 30% (25% to 32%) | 43% | 18% | 34% | 14% |

**Bullied electronically (past 12 months)**

| Answer | 2025 students | Sad or hopeless, 2025 (95% interval) | Girls 2025 | Boys 2025 | All 2023 | Considered suicide, 2025 |
| --- | --- | --- | --- | --- | --- | --- |
| Yes | 1,404 | 61% (58% to 64%) | 66% | 54% | 72% | 34% |
| No | 9,038 | 29% (26% to 31%) | 38% | 20% | 33% | 11% |
| Did not answer | 41 | 36% (11% to 62%) | 51% | 33% | 47% | 24% |

Girls report more sadness and a little more social media use than boys, so part of the social media pattern is sex. The girls and boys columns show the pattern within each sex.

### Checking the app's two cut-offs on a national sample (NHANES)

The public NHANES file has PHQ-9 answers only for ages 18 to 80, with no one aged 12 to 17 (0 rows). So this uses the youngest group, 18 to 24, with all adults as a larger comparison. Weighted with the exam weight. Intervals resample the survey's 30 sampling units, as for the YRBS.

| Group | People | PHQ-9 of 10 or more | PHQ-2 of 3+ catches PHQ-9 10+ | PHQ-2 of 3+ specificity | Share PHQ-2 flags | PHQ-8 of 10+ catches PHQ-9 10+ | PHQ-8 specificity | Both steps catch |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Ages 18 to 24 | 515 | 20% (17% to 24%) | 59% (51% to 68%) | 94% (91% to 97%) | 16% | 94% (89% to 98%) | 100% (100% to 100%) | 57% (48% to 67%) |
| All adults 18 and over | 5,455 | 13% (11% to 14%) | 63% (57% to 68%) | 96% (95% to 97%) | 11% | 97% (95% to 98%) | 100% (100% to 100%) | 62% (56% to 68%) |

The PHQ-8 can never be higher than the PHQ-9, so it never flags someone the PHQ-9 would not. Its specificity is 100% by construction.

In the 18 to 24 group, PHQ-8 and PHQ-9 at 10 agreed for 98.7% of people (kappa 0.96). 8 people reached 10 on the PHQ-9 but not the PHQ-8, and 0 the other way. The PHQ-2 step is where most people with a PHQ-9 of 10 or more are lost: the two steps together caught 71 of 120 (weighted 57%).

77 people aged 18 to 24 gave any answer above zero to the self-harm question (weighted 14%). 45 of them passed the PHQ-2 step and 43 passed both steps.

## Groups

| Split | Group | 2025 students | Sad or hopeless (weighted) | AUC, digital signals (95% interval) | AUC, plus sex and grade |
| --- | --- | --- | --- | --- | --- |
| Sex | Boys | 5,314 | 24% | 0.66 (0.64 to 0.67) | 0.66 (0.64 to 0.68) |
| Sex | Girls | 5,132 | 43% | 0.64 (0.63 to 0.66) | 0.64 (0.63 to 0.66) |
| Race/ethnicity | Am Indian/Alaska Native | 77 | 39% | 0.63 (0.49 to 0.74) | 0.78 (0.65 to 0.87) |
| Race/ethnicity | Asian | 508 | 24% | 0.69 (0.65 to 0.74) | 0.71 (0.65 to 0.76) |
| Race/ethnicity | Black or African American | 2,122 | 34% | 0.61 (0.59 to 0.63) | 0.67 (0.65 to 0.70) |
| Race/ethnicity | Hispanic or Latino | 2,341 | 36% | 0.63 (0.61 to 0.65) | 0.69 (0.67 to 0.71) |
| Race/ethnicity | Multiple - Hispanic | 922 | 40% | 0.67 (0.64 to 0.71) | 0.70 (0.67 to 0.73) |
| Race/ethnicity | Multiple - Non-Hispanic | 746 | 39% | 0.65 (0.62 to 0.69) | 0.71 (0.67 to 0.74) |
| Race/ethnicity | White | 3,549 | 31% | 0.68 (0.66 to 0.71) | 0.72 (0.70 to 0.74) |

Too few students to score: Mideast/N African (102 students, 26 sad or hopeless); Native Hawaiian/PI (32 students, 12 sad or hopeless).

All groups use the main label on the 2025 test set. Within one sex, everyone has the same sex input, so the second column differs from the first through grade and through the digital weights, which were fit alongside sex and grade. Within girls alone and boys alone the digital signals scored 0.64 and 0.66, so the link is not only a difference between girls and boys. Groups of a few hundred students or fewer have wide intervals.

## Caveats

- This is a one-time survey of many teens. It shows that these signals go with depression signs across teens. It does not show that a change in one teen's week predicts that teen's mood. Experiments 1 and 1b found that passive weekly phone data scored only an AUC of 0.57 to 0.61 for that.
- Everything in the YRBS is self-reported on one day, including the social media, sleep and bullying answers. The app reads sleep and screen time from the phone, which may not match what teens report. The app does not read bullying, and social media frequency is only a stand-in for screen time.
- The design is cross-sectional, so it cannot say which comes first. Poor sleep may follow low mood as much as cause it.
- Question numbers moved between 2023 and 2025, and CDC's short label for sleep changed from "Hours of sleep on school night" to "Sleep". The answer codes for every item used here are the same in both years. We did not compare the full printed question wording. The race/ethnicity groups also changed in 2025, which added Middle Eastern or North African.
- Neither YRBS file has a screen-time or video-game question, so those app signals are not tested here. In 2025, 19% of students left the sleep question blank and 8% the social media question.
- The sad or hopeless question is a yes or no about the past 12 months. It is a sign of depression. It is not a diagnosis.
- Intervals resample the survey's sampling units and ignore its strata, so they are approximate.
- The public NHANES file has PHQ-9 answers only for ages 18 and over, so the cut-off check uses ages 18 to 24 (515 people), not teens. The interval is wide. The app also opens the other six questions after two weeks of signals outside the usual range, even with a low PHQ-2, and that path is not tested here.
- The PHQ-8 leaves out the self-harm question. In the 18 to 24 group, 77 people answered it above zero and 32 of them did not pass the PHQ-2 step. The app watches for self-harm language in what the teen types instead, and that check is not tested here.

## How to run

```
bash scripts/get_data.sh       # downloads the YRBS and NHANES files into data/yrbs/ and data/nhanes/
.venv/bin/python -I experiments/exp7_digital_life.py
```

Run time on a laptop: about 62 seconds.

*This project is a prototype and is not medical advice. It was written with Claude (Anthropic).*
