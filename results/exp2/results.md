# Experiment 2: words

Run on 2026-11-14 with `.venv/bin/python experiments/exp2_words.py` (about 14 seconds). Every number here is written by that script into `results/exp2/results.json`. The notebook `notebooks/02_words_model.ipynb` shows the same results with charts.

This experiment tests the two checks that read what a student types. Both run on the phone, and the text is discarded after scoring.

- **The tone model** reads low mood in one short message. It feeds the tone signal, the weekly share of the student's own messages that read as low mood.
- **The self-harm check** is a separate phrase list. Words that state a plan send an urgent note at once. Other self-harm words first ask "Are you safe right now?".

## Part A: the tone model

### Data

We used the "simplified" version of [GoEmotions](https://huggingface.co/datasets/google-research-datasets/go_emotions) (Google, Apache-2.0). It has 43,410 training, 5,426 validation and 5,427 test comments from Reddit. Each comment carries one or more of 28 labels: 27 emotions and neutral. We took the label names and their order from the dataset card.

A comment counts as **low mood** if it carries any of sadness, grief, disappointment or remorse (label ids 9, 16, 24 and 25). We picked these four because they are closest to two items on the eight-question form: feeling down, and feeling bad about yourself or that you let people down. We left out fear and nervousness, which are closer to anxiety, and anger and annoyance, which are common in ordinary complaints.

Low mood is rare: 6.9% of training comments, 6.6% of validation comments and 6.4% of test comments (345 of 5,427).

### Soft labels

GoEmotions also publishes a rater-level file: 3.7 raters read each comment on average. The "simplified" labels keep an emotion only when two raters agree, so a comment that one rater in three found sad is labelled plain "not sad". For training we used the share of a comment's raters who marked any of the four low-mood emotions. That gives 47,158 training comments: the 43,410 in the training split and 3,748 that "simplified" dropped for having no agreed label. 18.4% of them got at least one low-mood vote. No validation or test comment is in this pool, and validation and test are still scored against the agreed labels.

### Model

The tokenizer is simple so that the browser can copy it exactly. It lowercases A to Z, deletes apostrophes ("don't" becomes "dont"), squashes a letter repeated three or more times to two ("sooo" becomes "soo"), and keeps runs of letters and digits. The features are single words and pairs of neighboring words, weighted by TF-IDF. A logistic regression turns them into a score.

We tried 52 settings on the validation split only, in two recipes.

- **Hard labels** (36 settings): the agreed labels with balanced class weights, a vocabulary of 10,000, 15,000 or 20,000 terms, raw or log word counts, and six values of C from 0.25 to 8. Its best setting reached a validation average precision of 0.561 (20,000 terms, raw counts, C = 0.5). This was the model we shipped first.
- **Soft labels** (16 settings): the rater shares above with no class weights, every term found in at least 4 or 5 training comments, raw or log word counts, and four values of C from 1 to 8. A cut of 3 comments would put the file at the 1 MB cap, so it was left out.

We kept the setting with the best average precision on validation: soft labels from every rater, 27,599 terms, raw counts, C = 2.0 (validation average precision 0.592).

The threshold is the one with the best F1 on validation: **0.19**. At that threshold validation precision was 61.0% and recall was 53.3%. The score estimates the share of raters who would call a message low mood, which is why the threshold sits well under 0.5. It ranks messages well. It is not a calibrated chance that the writer is low.

We rounded every weight to 4 decimals and evaluated the rounded model, since that is the file the app loads. Rounding moved test scores by at most 2.8e-05.

### Test results

All three methods were scored once on the same 5,427 test comments, of which 345 are low mood.

| Method | Flagged | Precision | Recall | Missed cases | False alarms |
| --- | --- | --- | --- | --- | --- |
| Always "not low mood" | 0 | n/a (flags nothing) | 0.0% | 345 | 0 |
| Keyword list (32 words) | 171 | 48.0% | 23.8% | 263 | 89 |
| Tone model, threshold 0.19 | 297 | 58.6% | 50.4% | 171 | 123 |
| Tone model, threshold 0.5 (for reference only) | 106 | 80.2% | 24.6% | 260 | 21 |
| Earlier tone model (hard labels), threshold 0.595 | 365 | 51.8% | 54.8% | 156 | 176 |

The earlier model is the best setting of the hard-label recipe, with its own validation threshold. Its F1 on the test comments was 0.532 and its average precision 0.521; the model we ship now scores 0.542 and 0.541. The gain comes from the training labels. The words, the features and the code that runs on the phone are the same.

Bootstrap 95% ranges (2,000 resamples of the test set): model precision 52.9% to 64.3%, recall 45.3% to 55.8%; keyword precision 40.7% to 55.6%, recall 19.6% to 28.4%. The model's average precision is 0.541 and its ROC AUC is 0.892.

The model finds 174 low-mood comments where the keyword list finds 82, at higher precision. It still misses 171 of 345, and 123 of its 297 flags are wrong. The keyword list reads only the words on its list, so it misses most comments that never say "sad" or "miss".

Recall by label (a comment can carry more than one):

| Label | Test comments | Model recall | Keyword recall |
| --- | --- | --- | --- |
| sadness | 156 | 62.2% | 38.5% |
| grief | 6 | 50.0% | 16.7% |
| disappointment | 151 | 23.8% | 17.2% |
| remorse | 56 | 91.1% | 7.1% |

Disappointment is the hardest label: the model misses 115 of 151. Reading the missed ones, many are plain complaints such as "Your TLDR sucks", and several also carry the annoyance label.

The words that push hardest toward low mood are "sorry", "sad", "sadly", "disappointed", "disappointing", "hurts", "poor", "regret", "painful", "unfortunately", "miss", "bad". "sorry" is among them, because Reddit comments labelled remorse or sadness often say "sorry". Teens say sorry for small things, and "sorry im late lol" scores as low mood. In Steady the signal is a change against the student's own normal, so a steady habit of using one of these words matters less than a sudden rise.

### Size and browser check

`app/public/models/tone.json` is 714,271 bytes (698 KB) with 27,599 features, under the 1 MB cap.

We ran `app/src/engine/tone.ts` under Node v22.18.0 on 5,487 texts (all 5,427 test comments and our 60 messages) and compared it with sklearn's `predict_proba`. The largest difference was 6.7e-16, far inside the 1e-4 target, and the two agreed on the low-mood decision for every text (0 differences). Outside Vite the default model address is `/models/tone.json`.

## Part B: the self-harm check

`app/src/engine/selfharm_phrases.json` holds 21 plan patterns, 24 concern patterns and 3 negations. **It is not validated, and no clinician has reviewed it.** It is a short list written for the demo.

- **plan:** words that state a plan or intent to end one's life, or that say the writer has just hurt themselves or taken something. These skip the question and send an urgent note at once.
- **concern:** other self-harm language. The app first asks "Are you safe right now?".
- **negations:** phrases such as "i would never kill myself" or "suicide prevention week", blanked out before the check so the rest of the message is still read.

Before matching, the text is lowercased, apostrophes are deleted and every run of other symbols becomes one space. The patterns use only word boundaries, spaces, alternatives and optional words, so JavaScript and Python read them the same way. The answer gives the level and the rule id and never the matched words.

`selfharm.ts` and the Python copy of the check gave the same level and rule on all 5,487 texts we tried (0 differences).

**How we kept this test blind.** The list was written and saved before we read any of the 60 messages, and it was not changed after the results came in. The messages were written by a separate Claude session that never saw the list. One slip: before the list was finished, that session's status note quoted one message (m52, "nobody would even notice if i was gone"). We did not add a rule for it. The same team still made both, so these counts show which kinds of message fail. They are too few to give a rate.

## Part C: our 60 messages

`experiments/exp2_words/test_messages.csv` holds 60 short messages in a teen texting voice. The lyric lines were written to sound like songs and are meant to be original; we did not search a lyrics database to confirm it. The risk messages contain no method details.

The first batch had 60 messages in the planned 12/12/8/8/8/6/6 split. After the plan level was widened to cover harm that has already happened, the same writer added 3 such messages (x01 to x03). To keep 60, we dropped the last two everyday messages and the last low-mood message (m11, m12 and m24), a rule fixed before scoring.

### Tone model by slice

A message is labelled low mood when its own words express sadness, grief, disappointment or regret, including lyric lines and sarcasm.

| Slice | Messages | Labelled low mood | Model flagged | Model missed | Model false alarms | Keyword flagged |
| --- | --- | --- | --- | --- | --- | --- |
| everyday | 10 | 0 | 1 | 0 | 1 | 1 |
| low_mood | 11 | 11 | 7 | 4 | 0 | 4 |
| lyric_style | 8 | 4 | 0 | 4 | 0 | 0 |
| dark_joke | 8 | 0 | 1 | 0 | 1 | 0 |
| sarcasm | 8 | 3 | 0 | 3 | 0 | 0 |
| risk_concern | 6 | 6 | 2 | 4 | 0 | 0 |
| risk_plan | 9 | 9 | 3 | 6 | 0 | 1 |
| **all** | 60 | 33 | 14 | 21 | 2 | 6 |

Across the 60, the model's precision is 85.7% (12 of 14) and its recall is 36.4% (12 of 33). The keyword list finds 5 of 33. Recall here is well below the 50.4% on Reddit comments. Teen texts are short and use different words, and the model learned from Reddit.

The model flagged 0 of the 4 sad lyric lines and 0 of the 3 sarcastic messages labelled low mood. Counted against the labels these are misses. For lyrics that may be the better outcome, since a student quoting a sad song is weak evidence of low mood. For sarcasm it means the model reads the surface words and misses the meaning. It flagged 5 of the 15 risk messages, which is one reason the self-harm check has to stay separate.

### Self-harm check on the 60

| Slice | Messages | none | concern | plan |
| --- | --- | --- | --- | --- |
| everyday | 10 | 10 | 0 | 0 |
| low_mood | 11 | 11 | 0 | 0 |
| lyric_style | 8 | 8 | 0 | 0 |
| dark_joke | 8 | 4 | 4 | 0 |
| sarcasm | 8 | 8 | 0 | 0 |
| risk_concern | 6 | 4 | 2 | 0 |
| risk_plan | 9 | 5 | 0 | 4 |

- **False flags:** 4 of 24 lyric, dark-joke and sarcasm messages (4 at concern, 0 at plan). A flag at concern asks the student first. It sends a parent note only if the student says no, does not answer within 30 minutes, or is flagged again within a day.
- **Misses:** 9 of 15 risk messages got no flag: 4 of 6 concern messages and 5 of 9 plan messages.
- **Plan and concern mixed up:** 0 plan messages were read as concern, and 0 concern messages were read as plan. Every plan message the list caught (4) was caught at plan.
- **Everyday and low-mood messages:** 0 flags.
- **Reddit test comments:** the list flagged 2 of 5,427 at concern and 1 at plan. There are no self-harm labels there, so this only shows how often the list fires on ordinary comments. The plan flag was a comment about leaving "my last words" somewhere, which the rule for a last goodbye catches.

False flags:

| Id | Slice | Message | Level | Rule |
| --- | --- | --- | --- | --- |
| m33 | dark_joke | kms this essay is due at 11:59 and i have one sentence | concern | c_kms |
| m34 | dark_joke | mr k just called on me when i wasnt even listening i want to die | concern | c_want_die |
| m36 | dark_joke | if i have to do one more proof i'm going to kill myself lol | concern | c_kill_myself |
| m39 | dark_joke | gonna unalive myself if this group project gets any worse | concern | c_unalive |

Misses:

| Id | Slice | Message | Why the list missed it |
| --- | --- | --- | --- |
| m49 | risk_concern | i keep thinking everyone would be better off if i wasnt here | The list has "better off without me". It has no form with "if i wasnt here". |
| m51 | risk_concern | sometimes when it gets this bad i think about hurting myself and it scares me | The "thinking about" rule lists killing myself, not hurting myself. |
| m52 | risk_concern | whats the point of any of it, nobody would even notice if i was gone | No rule covers "nobody would notice if i was gone". See the note on how the test was kept blind. |
| m54 | risk_concern | ngl i've been wishing i could fall asleep and just not wake up | The rule needs "fall asleep and not wake up". The extra "just" breaks it. |
| m55 | risk_plan | i've made up my mind. tonight is my last night, i'm done | The rule needs "made up my mind to ...", and "my last night" is only listed as "my last night alive". |
| m56 | risk_plan | this is goodbye. i love u guys, please dont blame yourselves | The list has "this is my goodbye". It does not have "this is goodbye". |
| m58 | risk_plan | gave away my stuff today so nobody has to deal with it after i'm gone | Giving things away is a known warning sign. No rule covers it. |
| m60 | risk_plan | by friday i wont be here anymore. i've thought about it and i'm sure | The rule needs "wont be here" followed by "much longer", "after tonight", "by morning" or "by tomorrow". |
| x03 | risk_plan | just hurt myself again and its worse this time. idk what to do. i'm so sorry | The rule needs "i just hurt myself". The message drops the "i". |

Caught:

| Id | Slice | Level | Rule |
| --- | --- | --- | --- |
| m50 | risk_concern | concern | c_not_live |
| m53 | risk_concern | concern | c_thinking_about |
| m57 | risk_plan | plan | p_time_after |
| m59 | risk_plan | plan | p_intent_now |
| x01 | risk_plan | plan | p_took |
| x02 | risk_plan | plan | p_did_something |

### What the self-harm result means

Most misses are one word away from a rule: a missing "i", an extra "just", "this is goodbye" where the list has "this is my goodbye". A phrase list catches the wording its writer expected, and people in distress word things in many ways. Adding these nine phrasings would catch these nine messages, and then these messages could no longer test the list. Any new version needs fresh messages written by someone who has not seen it. This result supports what the docs already say: a real product needs a model built and tested for this job, with misses counted as carefully as false alarms.

All four false flags were dark jokes, and all four landed at concern, so each would ask the student first. None of the jokes reached plan. The plan rules were written narrowly for that reason, and the five missed plan messages show the cost.

## Caveats

- **GoEmotions is Reddit comments by adults, mostly.** The dataset does not record ages. Its raters were three crowdworkers in India for each comment, according to the dataset card. None of it is teen texting.
- **The labels are emotions.** Sadness, grief, disappointment and remorse in one comment say nothing about depression or suicide risk.
- **One message is not a week.** Steady uses the weekly share of low-mood messages against the student's own range. This test scores single messages only.
- **The self-harm list is not validated.** No clinician has reviewed it. It missed 9 of 15 risk messages here.
- **The 60 messages are few and made up.** A Claude session wrote and labelled them, not teens. One message moves the risk-pool rate by about 7 points.
- **Some labels are borderline.** The writer was unsure about the low-mood label on m29, m34, m37, m43, m46, m60 and x01, and about concern on m52.
- **The score is a ranking.** It comes from a class-balanced model and is not a calibrated chance of low mood.

*This project is a prototype and is not medical advice. The code and this write-up were made with Claude (Anthropic).*
