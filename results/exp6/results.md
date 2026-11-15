# Experiment 6: does the ask model hold up on teenagers?

Generated 2026-11-15 by `experiments/exp6_teens.py`. Data: Corona Health, "Mental Health of Adolescents during COVID-19" (University of Wurzburg; CC BY 4.0), https://zenodo.org/records/15101756 . Every number is an aggregate.

## Short answer

On 113 teenagers aged 12 to 17 it never saw, the ask model from college students, unchanged, scored an AUC of 0.85 for their next PHQ-2 (0.78 to 0.92). Asking the top 23% by its score landed on a high answer 74% of the time, against 41% for asking at random. Over all 635 later answers it scored 0.90.

## What we tested

The ask model the app ships, trained on college students in Experiment 4, scored teenagers it never saw. Nothing was retrained and the threshold was not moved. The survey has the two PHQ-2 questions but no check-in, so the model ran as the app does when a teen skips the check-in.

- **Teens.** 283 teens gave 918 answers with both PHQ-2 items, 2020-07-21 to 2025-01-26. 113 answered more than once. Ages at baseline: 12: 19, 13: 32, 14: 40, 15: 45, 16: 71, 17: 76.
- **Label.** A PHQ-2 of 3 or more on that answer, as in every other experiment.
- **Inputs.** Only answers given before it: the most recent PHQ-2 and the average of all earlier ones.

## Results

| Test | Teens | Answers | AUC (95% interval, resampling teens) | Asking at random | Asking the top 23% | High answers missed | False alarms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| First follow-up, from baseline (one per teen) | 113 | 113 | 0.85 (0.78 to 0.92) | 41% | 74% | 14 of 46 | 11 |
| Every later answer, from all earlier ones | 113 | 635 | 0.90 (0.85 to 0.94) | 37% | 92% | 103 of 238 | 12 |

The most recent answer alone scored 0.85 on the first follow-up, so here too nearly all the skill is in the earlier answers.

At the app's own threshold (0.163) the model would have asked 75 of 113 first follow-ups, and 57% of those were high. The threshold was set for college students, so on teens it asks a different share.

## Groups

| Group | Teens | Answers | AUC (95% interval) | Asking at random | Asking the top 23% |
| --- | --- | --- | --- | --- | --- |
| Boys | 57 | 337 | 0.93 (0.87 to 0.96) | 38% | 95% |
| Girls | 51 | 273 | 0.86 (0.74 to 0.93) | 34% | 76% |

These use every later answer, because too few teens answered more than once to split the first follow-ups.

## Caveats

- Only 113 teens answered again, mostly German-speaking, during the pandemic. The interval is wide.
- The answers are not weekly: the median gap was 4 days before the first follow-up. Teens chose when to answer, and the ones who came back may differ from the ones who did not.
- There is no check-in in this survey, so this tests only the earlier-answers part of the model.
- The PHQ-2 here uses the adolescent wording, which adds "irritable". It is a screening score, not a diagnosis.

## How to run

```
bash scripts/get_data.sh       # downloads the three Zenodo files into data/corona_health_ado/
.venv/bin/python -I experiments/exp6_teens.py
```

*This project is a prototype and is not medical advice. It was written with Claude (Anthropic).*
