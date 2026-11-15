# Experiment 8: music, gaming, social media and stress language

Generated 2026-11-15 by `experiments/exp8_music_gaming.py`. Data: the Music & Mental Health survey (Rasgaitis, 2022; CC0), the Spotify Tracks Dataset (Pandya; BSD), the Online Gaming Anxiety survey (Sauter and Draschkow, via Kaggle), the Social Media and Mental Health survey (Ahmed, via Kaggle) and Dreaddit (Turcan and McKeown, 2019). `scripts/get_data.sh` downloads them. Every number is an aggregate.

## Short answer

Across people, music habits lined up with high self-rated depression only weakly: AUC 0.57, 95% interval 0.53 to 0.61, where 0.50 is chance. Gaming habits lined up with moderate anxiety at 0.59 (0.58 to 0.61). Social media use alone lined up with often feeling down at 0.67 (0.63 to 0.72). A word model trained on stressed Reddit posts scored 0.82 on new posts. The app's own tone model, never trained on stress, scored 0.75 (0.71 to 0.78). All four are one-time snapshots, so none shows that a signal predicts one teen's week.

- In an open survey of 736 music listeners, listening habits told apart people with high self-rated depression only a little better than chance (AUC 0.57, where 0.50 is chance). People who listened more hours a day, and to higher-energy genres like metal and rock, rated their depression a little higher. How happy their genres sound made no clear difference.
- Among 13,413 mostly adult male gamers, play habits weakly told apart those with moderate anxiety (AUC 0.59). The scale measures anxiety and says nothing direct about depression. The share with moderate anxiety was about 15% at 10 to 19 hours of play a week and 35% at 70 hours or more.
- In a survey of 481 people, how much and how aimlessly they used social media told apart those who often feel down at an AUC of 0.67. Of people on social media more than five hours a day, 62% said they often feel down, against 12% of those under an hour.
- A simple word model trained on stressed Reddit posts scored an AUC of 0.82 on posts it never saw. The app's own tone model, built to spot low mood, scored 0.75 on the same posts with no retraining.

## What we tested

Each part asks one question: across many people, how well does this part of digital life line up with signs of depression or distress? Parts 1 to 3 use logistic regression in 5-fold cross-validation repeated 20 times. Each person's score comes only from models that never saw them. The 95% interval resamples people. A label-shuffle check reruns one round of the cross-validation 100 times with the outcome shuffled; it should sit near 0.50, and it shows roughly how far chance alone can move the AUC. Part 4 trains once and tests once on a held-out split, and its intervals resample whole Reddit posts.

- **Music.** 736 people aged 10 to 89 (median 21). Outcome: depression self-rating of 7 or more out of 10 (35% of people). BPM was kept only between 40 and 220 (8 answers outside that were set to missing, as were 107 blanks). The anxiety, insomnia, OCD and "music effects" answers were left out of every model.
- **Gaming.** 13,413 gamers. Outcome: GAD-7 total of 10 or more, moderate anxiety (17%). GAD-7 measures anxiety and says nothing direct about depression. Hours per week over 168 were set to missing (2 answers). Game, playstyle and reason for playing were grouped into their most common answers plus "other".
- **Social media.** 481 people aged 13 to 91 (median 22). Outcome: "How often do you feel depressed or down?" of 4 or 5 out of 5 (46%).
- **Stress language.** Dreaddit: 2835 training posts and 715 test posts from Reddit, 52% of test posts labelled stressed.

## Results

### 1. Music (MxMH survey and Spotify genre moods)

| Model | People | Share with the outcome | AUC (95% interval, resampling people) | Single-fold AUC spread | Shuffled labels AUC (middle 95%) |
| --- | --- | --- | --- | --- | --- |
| Music habits only: hours, 16 genre frequencies, listening valence and energy, exploratory, while working, BPM | 736 | 35% | 0.57 (0.53 to 0.61) | 0.49 to 0.66 | 0.50 (0.44 to 0.55) |
| Music mood (listening valence and energy) and hours per day | 736 | 35% | 0.60 (0.56 to 0.64) | 0.51 to 0.68 | 0.49 (0.43 to 0.56) |
| Age only (baseline) | 736 | 35% | 0.48 (0.44 to 0.53) | 0.40 to 0.57 | 0.49 (0.45 to 0.54) |
| Age plus music habits | 736 | 35% | 0.58 (0.53 to 0.62) | 0.50 to 0.67 | 0.50 (0.44 to 0.55) |

Gradient-boosted trees on the same music habits scored 0.57 (0.53 to 0.61), so a more flexible model did not find more. The three-input mood and hours model (0.60) did a little better than all 22 music inputs (0.57), a sign the extra genre columns mostly add noise. Age alone sat at chance (0.48; a value a little under 0.50 is what cross-validation gives a feature with no signal), so a straight-line age effect does not explain the music signal.

Rank correlation with the 0 to 10 depression rating (95% interval):

| Feature | Spearman rho | People |
| --- | --- | --- |
| listening_valence | -0.03 (-0.10 to +0.04) | 736 |
| listening_energy | +0.14 (+0.07 to +0.21) | 736 |
| hours_per_day | +0.14 (+0.06 to +0.21) | 736 |
| fav_genre_valence | -0.01 (-0.09 to +0.07) | 692 |
| exploratory | +0.06 (-0.01 to +0.14) | 736 |
| while_working | +0.06 (-0.02 to +0.13) | 733 |
| bpm | +0.06 (-0.02 to +0.13) | 621 |
| age | +0.01 (-0.07 to +0.08) | 735 |
| freq_Classical | -0.01 (-0.08 to +0.06) | 736 |
| freq_Country | -0.04 (-0.11 to +0.03) | 736 |
| freq_EDM | +0.11 (+0.04 to +0.18) | 736 |
| freq_Folk | +0.11 (+0.04 to +0.18) | 736 |
| freq_Gospel | -0.00 (-0.07 to +0.07) | 736 |
| freq_Hip hop | +0.10 (+0.02 to +0.17) | 736 |
| freq_Jazz | +0.05 (-0.02 to +0.11) | 736 |
| freq_K pop | +0.01 (-0.06 to +0.08) | 736 |
| freq_Latin | +0.04 (-0.04 to +0.11) | 736 |
| freq_Lofi | +0.05 (-0.02 to +0.13) | 736 |
| freq_Metal | +0.19 (+0.11 to +0.26) | 736 |
| freq_Pop | +0.08 (+0.00 to +0.15) | 736 |
| freq_R&B | +0.07 (-0.01 to +0.14) | 736 |
| freq_Rap | +0.14 (+0.06 to +0.21) | 736 |
| freq_Rock | +0.18 (+0.11 to +0.25) | 736 |
| freq_Video game music | +0.10 (+0.03 to +0.17) | 736 |

The music-habits model's score had a rank correlation of +0.16 with the 0 to 10 rating.

**Direction.** Listening valence (how happy the genres sound) showed no clear link with the 0 to 10 rating (rho -0.03, 95% interval -0.10 to +0.04). With age taken out it was -0.03. Listening energy did line up: people who play higher-energy genres rated depression higher (rho +0.14, 95% interval +0.07 to +0.21). The genres behind this are mostly metal and rock (rho +0.19 and +0.18). More hours of listening a day went with higher ratings (rho +0.14, 95% interval +0.06 to +0.21). 26% rated 7 or more at up to an hour a day, against 48% at over six hours. All of these are small, and none says which way the cause runs. People who feel low may play more music, or louder music, to cope.

Share with depression 7 or more, by third of listening valence (edges 0.295, 0.470, 0.494, 0.596):

| Listening valence | People | Depression 7+ | 95% interval |
| --- | --- | --- | --- |
| lowest third | 246 | 34% | 28% to 40% |
| middle third | 245 | 38% | 32% to 44% |
| highest third | 245 | 33% | 27% to 39% |

By hours of listening per day:

| Hours per day | People | Depression 7+ | 95% interval |
| --- | --- | --- | --- |
| 0 to 1 | 148 | 26% | 20% to 34% |
| over 1 to 2 | 190 | 28% | 22% to 35% |
| over 2 to 4 | 209 | 39% | 32% to 46% |
| over 4 to 6 | 102 | 39% | 30% to 49% |
| over 6 | 87 | 48% | 38% to 59% |

Largest standardised weights in the music-habits model (one fit on everyone; positive means more likely 7+):

| Feature | Weight |
| --- | --- |
| freq_Rap | +0.242 |
| hours_per_day | +0.203 |
| freq_Rock | +0.166 |
| listening_valence | -0.160 |
| freq_Lofi | -0.149 |
| freq_Gospel | -0.147 |
| freq_Country | -0.130 |
| freq_Latin | +0.113 |
| listening_energy | +0.107 |
| freq_Folk | +0.095 |

Listening valence and energy are built from the same genre frequencies, so their weights here are tangled with the genre weights. The single correlations above are the cleaner read on direction.

**Teens and young adults (aged 19 or under).** 299 people, 89 with depression 7+ (153 were 17 or under).

| Model | People | Share with the outcome | AUC (95% interval, resampling people) | Single-fold AUC spread | Shuffled labels AUC (middle 95%) |
| --- | --- | --- | --- | --- | --- |
| Music habits only: hours, 16 genre frequencies, listening valence and energy, exploratory, while working, BPM | 299 | 30% | 0.56 (0.49 to 0.63) | 0.41 to 0.67 | 0.49 (0.39 to 0.58) |
| Music mood (listening valence and energy) and hours per day | 299 | 30% | 0.59 (0.52 to 0.66) | 0.47 to 0.70 | 0.49 (0.40 to 0.58) |
| Age only (baseline) | 299 | 30% | 0.47 (0.41 to 0.54) | 0.31 to 0.59 | 0.49 (0.39 to 0.57) |

With 299 people the intervals are wide. The full music-habits model (0.49 to 0.63) cannot be told apart from chance in this group. Mood and hours alone did 0.59 (0.52 to 0.66).

Within this group, listening valence against the 0 to 10 rating: rho -0.04 (-0.15 to +0.08). Hours per day: rho +0.14 (+0.02 to +0.25).

**Genre mapping.** Each MxMH genre took the mean valence and energy of the Spotify tracks in these genres (1,000 tracks per Spotify genre, duplicates removed):

| MxMH genre | Spotify genres | Tracks | Mean valence | Mean energy |
| --- | --- | --- | --- | --- |
| Classical | classical, opera | 1893 | 0.295 | 0.257 |
| Country | country, honky-tonk, bluegrass | 2979 | 0.596 | 0.499 |
| EDM | edm, house, electro, dubstep, trance | 3825 | 0.373 | 0.753 |
| Folk | folk, acoustic | 1970 | 0.458 | 0.491 |
| Gospel | gospel | 999 | 0.321 | 0.576 |
| Hip hop | hip-hop | 991 | 0.550 | 0.682 |
| Jazz | jazz | 999 | 0.490 | 0.353 |
| K pop | k-pop | 999 | 0.557 | 0.676 |
| Latin | latin, latino, reggaeton, salsa | 2631 | 0.702 | 0.724 |
| Lofi | study, chill | 1997 | 0.403 | 0.419 |
| Metal | metal, heavy-metal, metalcore, death-metal, black-metal | 4639 | 0.315 | 0.884 |
| Pop | pop, indie-pop, synth-pop | 2975 | 0.518 | 0.627 |
| R&B | r-n-b, soul | 1958 | 0.578 | 0.589 |
| Rap | hip-hop | 991 | 0.550 | 0.682 |
| Rock | rock, alt-rock, alternative, hard-rock, punk-rock | 3909 | 0.529 | 0.744 |
| Video game music | none (left out of the mood average) | 0 | n/a | n/a |

Spotify's genre list has no rap, lo-fi or video game music genre. Rap uses hip-hop, Lofi uses "study" and "chill", and video game music is left out. Everyone played at least one mapped genre.

### 2. Gaming (Online Gaming Anxiety survey)

| Model | People | Share with the outcome | AUC (95% interval, resampling people) | Single-fold AUC spread | Shuffled labels AUC (middle 95%) |
| --- | --- | --- | --- | --- | --- |
| Gaming habits: hours per week, stream hours, game, platform, playstyle, why they play | 13413 | 17% | 0.59 (0.58 to 0.61) | 0.57 to 0.62 | 0.50 (0.48 to 0.52) |
| Hours per week alone | 13413 | 17% | 0.55 (0.54 to 0.56) | 0.53 to 0.58 | not run |
| Gaming habits, players aged 18 and 19 only (5 repeats) | 5728 | 18% | 0.58 (0.56 to 0.60) | 0.54 to 0.63 | not run |

Hours per week against the GAD-7 total: rho +0.07 (+0.05 to +0.08).

Share with GAD-7 of 10 or more, by hours of play per week:

| Hours per week | Gamers | GAD-7 10+ | 95% interval |
| --- | --- | --- | --- |
| 0 to 9 | 1637 | 15% | 14% to 17% |
| 10 to 19 | 4367 | 15% | 14% to 17% |
| 20 to 29 | 4108 | 16% | 15% to 18% |
| 30 to 39 | 1749 | 19% | 17% to 20% |
| 40 to 49 | 809 | 24% | 21% to 27% |
| 50 to 69 | 520 | 29% | 25% to 33% |
| 70 or more | 191 | 35% | 28% to 42% |

Largest standardised weights (positive means more likely GAD-7 10+):

| Feature | Weight |
| --- | --- |
| hours_per_week | +0.174 |
| whyplay=winning | +0.120 |
| whyplay=having fun | -0.102 |
| whyplay=relaxing | +0.089 |
| playstyle=Multiplayer - online - with real life friends | -0.087 |
| stream_hours_per_week | +0.083 |
| game=Starcraft 2 | -0.059 |
| playstyle=Multiplayer - online - with strangers | +0.053 |
| game=Other | +0.045 |
| playstyle=Singleplayer | +0.040 |

**Who answered.** 94% male, aged 18 to 63 (median 20), 99% recruited through Reddit, 84% League of Legends players, 98% on PC. Nobody was under 18, so this says nothing direct about teens under 18. 5,728 were 18 or 19.

### 3. Social media (smmh survey)

| Model | People | Share with the outcome | AUC (95% interval, resampling people) | Single-fold AUC spread | Shuffled labels AUC (middle 95%) |
| --- | --- | --- | --- | --- | --- |
| Usage only (the fair model) | 481 | 46% | 0.67 (0.63 to 0.72) | 0.58 to 0.76 | 0.50 (0.43 to 0.56) |
| Age only (baseline) | 481 | 46% | 0.60 (0.55 to 0.65) | 0.53 to 0.69 | 0.49 (0.42 to 0.55) |
| Usage plus age | 481 | 46% | 0.68 (0.63 to 0.73) | 0.58 to 0.77 | 0.50 (0.43 to 0.56) |
| Usage plus feeling items (not fair: the feeling items sit close to the label) | 481 | 46% | 0.80 (0.76 to 0.83) | 0.72 to 0.85 | 0.50 (0.43 to 0.56) |

Only the usage-only model is a fair test. The feeling items ask about worry, concentration, sleep and interest, which are themselves signs of low mood, so a model that uses them is close to reading the answer.

Usage-only columns:

- `daily_time_band`: 8. What is the average time you spend on social media every day?
- `number_of_platforms`: count of platforms in: 7. What social media platforms do you commonly use?
- `uses_YouTube`: YouTube named in: 7. What social media platforms do you commonly use?
- `uses_Facebook`: Facebook named in: 7. What social media platforms do you commonly use?
- `uses_Instagram`: Instagram named in: 7. What social media platforms do you commonly use?
- `uses_Discord`: Discord named in: 7. What social media platforms do you commonly use?
- `uses_Snapchat`: Snapchat named in: 7. What social media platforms do you commonly use?
- `uses_Pinterest`: Pinterest named in: 7. What social media platforms do you commonly use?
- `uses_Twitter`: Twitter named in: 7. What social media platforms do you commonly use?
- `uses_Reddit`: Reddit named in: 7. What social media platforms do you commonly use?
- `uses_TikTok`: TikTok named in: 7. What social media platforms do you commonly use?
- `use_without_purpose`: 9. How often do you find yourself using Social media without a specific purpose?
- `distracted_by_it_when_busy`: 10. How often do you get distracted by Social media when you are busy doing something?

Feeling columns (kept out of the fair model). Comparing yourself to others and seeking validation are asked about social media. They still measure a thought or a feeling about it, so they sit here:

- `restless_without_it`: 11. Do you feel restless if you haven't used Social media in a while?
- `easily_distracted`: 12. On a scale of 1 to 5, how easily distracted are you?
- `bothered_by_worries`: 13. On a scale of 1 to 5, how much are you bothered by worries?
- `hard_to_concentrate`: 14. Do you find it difficult to concentrate on things?
- `compares_self_to_others`: 15. On a scale of 1-5, how often do you compare yourself to other successful people through the use of social media?
- `feels_bad_about_comparisons`: 16. Following the previous question, how do you feel about these comparisons, generally speaking?
- `seeks_validation`: 17. How often do you look to seek validation from features of social media?
- `interest_fluctuates`: 19. On a scale of 1 to 5, how frequently does your interest in daily activities fluctuate?
- `sleep_problems`: 20. On a scale of 1 to 5, how often do you face issues regarding sleep?

Gender, relationship status, occupation and organisation were left out of every model. So was "Do you use social media?", since only 3 people said no.

Younger people here used social media more (rank correlation of age with daily time -0.30) and felt down more often (age with the outcome -0.22). Age alone scored 0.60. Adding age to usage moved the AUC from 0.67 to 0.68, so age added little to what usage already showed. This does not show how much of the usage signal is itself age.

Rank correlation of usage items with the 1 to 5 "depressed or down" answer:

| Usage item | Spearman rho | People |
| --- | --- | --- |
| daily_time_band | +0.32 (+0.23 to +0.40) | 481 |
| number_of_platforms | +0.20 (+0.11 to +0.29) | 481 |
| use_without_purpose | +0.30 (+0.21 to +0.38) | 481 |
| distracted_by_it_when_busy | +0.36 (+0.28 to +0.45) | 481 |

Share feeling depressed or down often (4 or 5), by daily time on social media:

| Daily time | People | Often down | 95% interval |
| --- | --- | --- | --- |
| Less than an Hour | 34 | 12% | 5% to 27% |
| Between 1 and 2 hours | 70 | 27% | 18% to 39% |
| Between 2 and 3 hours | 101 | 46% | 36% to 55% |
| Between 3 and 4 hours | 93 | 46% | 36% to 56% |
| Between 4 and 5 hours | 67 | 55% | 43% to 67% |
| More than 5 hours | 116 | 62% | 53% to 70% |

Largest standardised weights in the usage-only model:

| Feature | Weight |
| --- | --- |
| daily_time_band | +0.356 |
| distracted_by_it_when_busy | +0.314 |
| use_without_purpose | +0.224 |
| uses_Snapchat | +0.187 |
| uses_YouTube | -0.121 |
| uses_TikTok | +0.104 |
| uses_Twitter | -0.092 |
| uses_Reddit | -0.050 |
| uses_Instagram | +0.041 |
| uses_Discord | -0.025 |

Only 51 people were aged 19 or under, too few for a separate teen model.

### 4. Stress language (Dreaddit)

| Model | Test posts | AUC (95% interval) | F1 | Notes |
| --- | --- | --- | --- | --- |
| TF-IDF word model trained on Dreaddit train | 715 | 0.82 (0.79 to 0.85) | 0.76 | C = 2 picked on train only; accuracy 73% |
| The app's tone model, zero-shot | 715 | 0.75 (0.71 to 0.78) | 0.70 | F1 at the app's threshold 0.19; flags 76% of stressed posts and 43% of the rest |

Median tone score: 0.299 for stressed posts and 0.160 for the rest.

Over all 3550 Dreaddit posts (train and test, none used to build it) the tone model scored 0.76.

The tone model was trained on GoEmotions to spot low mood (sadness, grief, disappointment, remorse) and never saw a Dreaddit post. Stress and low mood are different things, so it is expected to rank stressed posts less well than a model trained on stress.

Words the Dreaddit model leans on most for stressed: me, my, feel, even, because, am, just, anxiety, what to, don. For not stressed: you, we, url, her, met, your, she, more, would, years.

**Checking the Python copy of the tone model.** The scoring in this script copies `scoreTone()` in `app/src/engine/tone.ts`. It matched these cases worked by hand from the numbers in `tone.json`:

| Text | How it was worked | By hand | Python copy |
| --- | --- | --- | --- |
| (empty) | no features, sigmoid(intercept) | 0.034284 | 0.034284 |
| `sad` | one feature, x = 1, sigmoid(intercept + coef[sad]) | 0.999731 | 0.999731 |
| `SOOOO sad` | features in vocab ['soo', 'sad'], raw tf 1 each, idf-weighted, L2-normalised | 0.987791 | 0.987791 |
| `I'm sad, sad, sad` | counts {'im': 1, 'sad': 3, 'im sad': 1}, raw tf, idf-weighted, L2-normalised | 0.999542 | 0.999542 |

It also matched `tone.ts` itself, run under Node v25.9.0, on all 715 test posts (largest difference 1.1e-16).

## Caveats

- Every dataset here is a one-time survey or a single post. Each result shows how a signal relates to distress across people at one moment. None shows that a change in a teen's music, gaming or scrolling comes before a bad week.
- All three surveys are self-selected online samples. The music survey was an open online form (median age 21). The gaming survey is 94% male, all aged 18 or older, 84% League of Legends players. The social media survey has only 51 people aged 19 or under.
- The outcomes are single self-ratings (depression 0 to 10, "feel depressed or down" 1 to 5) or a screening score (GAD-7). None is a diagnosis. The gaming outcome measures anxiety and says nothing direct about depression.
- Listening valence comes from genre averages. Two people who both play pop "very frequently" get the same value even if one plays sad songs. Real Spotify data would give per-track valence; this test cannot say whether that would do better.
- Dreaddit posts are long posts from Reddit users, most likely adults, in support subreddits such as anxiety, PTSD and relationships. Teens writing a short check-in note may write differently.
- The tone model's threshold was set for low mood on GoEmotions. On Dreaddit it flags many posts that are not labelled stressed, so its flag should not be read as a stress alarm.

## How to run

```
bash scripts/get_data.sh       # downloads the five datasets into data/
.venv/bin/python -I experiments/exp8_music_gaming.py
```

*This project is a prototype and is not medical advice. It was written with Claude (Anthropic).*
