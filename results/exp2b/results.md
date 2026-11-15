# Experiment 2b: a fine-tuned language model against the word-count model

Run on 2026-11-15 with `.venv/bin/python experiments/exp2b_finetune.py` (11 minutes on an Apple GPU). Every number here is written by that script into `results/exp2b/results.json`.

## Short answer

On the same 5,427 test comments, the fine-tuned language model beat the shipped word-count model: it found 62% of low-mood comments at 63% precision (average precision 0.65, AUC 0.94), against 50% at 59% (0.54, 0.89).

- **The gain.** Average precision rose by +0.112 (95% interval +0.076 to +0.149, from resampling the same test comments for both models). F1 changed by +0.082 (+0.044 to +0.121).
- **At the same precision as the shipped model** (59%), the fine-tuned model finds 66% of low-mood comments against 50%. **At the same recall** (50%), 71% of its flags are right against 59%. These two are read off the test curve, so they describe it and are not tested thresholds.
- **Our 60 teen-style messages.** The fine-tuned model found 13 of 33 with 8 false alarms. The shipped model found 12 with 2. The gain did not carry over: it flagged 5 of the 8 dark jokes as low mood, against 1 for the shipped model.
- **The cost.** Its weights are 91 MB against 698 KB, and it takes 0.4 seconds for 100 messages on this laptop's CPU. It is not in the app.

## What we tested

The shipped tone model counts words and word pairs, so it cannot tell that "nothing feels fun anymore" is sad unless those exact words carried weight in training. A language model starts out knowing how words relate. We took `sentence-transformers/all-MiniLM-L6-v2` (Apache-2.0, 22.7 million weights), added one output for low mood, and fine-tuned every weight on GoEmotions. Low mood means sadness, grief, disappointment or remorse, the same as Experiment 2.

## Data and protocol

- **Splits.** GoEmotions' own: 43,410 training, 5,426 validation and 5,427 test comments, 345 of the test comments low mood.
- **Two recipes.** Hard labels on the training split, and soft labels (the share of a comment's raters who marked a low-mood emotion) on the 47,158 comments outside validation and test. The soft pool is built by Experiment 2's own code, which checks that no validation or test comment is in it.
- **Training.** 3 epochs, batch 64, at most 64 tokens, learning rate 3e-05, one fixed seed.
- **Choosing.** The recipe and the epoch with the best average precision on validation, and the threshold with the best F1 on validation. The test split was scored once, for that one model. Our 60 messages were never used to choose anything.
- **The shipped model's numbers** are recomputed here from `app/public/models/tone.json`, the file the app loads, on the same comments.

## Validation

| Recipe | Epoch | Training loss | Validation average precision | Validation AUC | Best F1 | At threshold |
| --- | --- | --- | --- | --- | --- | --- |
| hard labels | 1 | 0.1915 | 0.655 | 0.936 | 0.626 | 0.37 |
| hard labels | 2 | 0.1217 | 0.658 | 0.935 | 0.627 | 0.47 |
| hard labels | 3 | 0.1026 | 0.658 | 0.933 | 0.632 | 0.405 |
| soft labels | 1 | 0.2285 | 0.661 | 0.933 | 0.620 | 0.285 |
| soft labels (chosen) | 2 | 0.1790 | 0.675 | 0.936 | 0.636 | 0.33 |
| soft labels | 3 | 0.1703 | 0.675 | 0.934 | 0.647 | 0.35 |

For comparison, the shipped model's validation average precision was 0.592 (from `results/exp2/results.md`).

## Test results

All three were scored on the same 5,427 test comments.

| Method | Flagged | Precision (95% range) | Recall (95% range) | Missed cases | False alarms | F1 | Average precision | AUC |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Keyword list (32 words) | 171 | 48.0% (40.7% to 55.6%) | 23.8% (19.6% to 28.4%) | 263 | 89 | 0.318 | n/a | n/a |
| Shipped word-count model, threshold 0.19 | 297 | 58.6% (52.9% to 64.3%) | 50.4% (45.3% to 55.8%) | 171 | 123 | 0.542 | 0.541 | 0.892 |
| Fine-tuned language model, threshold 0.33 | 341 | 62.8% (57.7% to 68.1%) | 62.0% (56.8% to 67.1%) | 131 | 127 | 0.624 | 0.653 | 0.944 |

At matched operating points, read off each model's test curve:

| | Shipped word-count model | Fine-tuned language model |
| --- | --- | --- |
| Recall when precision is at least 58.6% | 50.4% | 66.1% |
| Precision when recall is at least 50.4% | 58.6% | 71.0% |
| Recall when precision is at least 62.8% | 47.5% | 62.0% |
| Precision when recall is at least 62.0% | 43.2% | 62.8% |

## Our 60 messages

| Slice | Messages | Labelled low mood | Fine-tuned: found | Fine-tuned: missed | Fine-tuned: false alarms | Shipped: found | Shipped: missed | Shipped: false alarms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| everyday | 10 | 0 | 0 | 0 | 1 | 0 | 0 | 1 |
| low_mood | 11 | 11 | 7 | 4 | 0 | 7 | 4 | 0 |
| lyric_style | 8 | 4 | 1 | 3 | 0 | 0 | 4 | 0 |
| dark_joke | 8 | 0 | 0 | 0 | 5 | 0 | 0 | 1 |
| sarcasm | 8 | 3 | 0 | 3 | 2 | 0 | 3 | 0 |
| risk_concern | 6 | 6 | 2 | 4 | 0 | 2 | 4 | 0 |
| risk_plan | 9 | 9 | 3 | 6 | 0 | 3 | 6 | 0 |
| **all** | 60 | 33 | 13 | 20 | 8 | 12 | 21 | 2 |

Found by the fine-tuned model only: m27, m59. Found by the shipped model only: m58. The ids are in `experiments/exp2_words/test_messages.csv`. One message moves these counts, so read them as examples.

## Four messages

| Message | Fine-tuned score | Fine-tuned says | Shipped score | Shipped says |
| --- | --- | --- | --- | --- |
| i miss how things used to be, nothing feels fun anymore | 0.876 | low mood | 0.554 | low mood |
| nothing feels fun anymore | 0.371 | low mood | 0.095 | not low mood |
| omw, save me a seat at lunch | 0.011 | not low mood | 0.057 | not low mood |
| sorry im late lol | 0.677 | low mood | 0.783 | low mood |

The thresholds are 0.33 for the fine-tuned model and 0.19 for the shipped one. The scores are rankings and are not calibrated chances.

## What shipping it would cost

- **Size.** 91 MB of weights against 698 KB. Storing the weights in 8 bits would cut that to roughly a quarter. We did not build or test that version.
- **A runtime.** The shipped model is about 30 lines of TypeScript with no dependencies. This one needs a tokenizer and a neural-network runtime in the browser, such as ONNX Runtime Web, which we have not added or tested.
- **The Android copy.** The Android keyboard runs the same word-count model in Kotlin and checks it against the web app. It would need its own runtime and a new parity check.
- **Speed.** 0.4 seconds for 100 messages, one at a time, on this laptop's CPU in PyTorch. A phone would be slower. The word-count model scores 100 messages in about 7 milliseconds here.

## Caveats

- **One run, one seed.** GPU training is not exactly repeatable, so a second run will move these numbers a little.
- **GoEmotions is Reddit comments, mostly by adults.** None of it is teen texting, and the labels are emotions, which say nothing about depression or suicide risk.
- **The matched-point rows are read off the test curve.** They describe the curve. Only the two thresholds chosen on validation were tested.
- **The 60 messages are few and made up.** A Claude session wrote and labelled them, not teens.
- **Nothing in the app changed.** The app still loads the word-count model.

*This project is a prototype and is not medical advice. The code and this write-up were made with Claude (Anthropic).*
