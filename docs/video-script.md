# Demo video script

The demo video is [docs/video/steady-demo.mp4](video/steady-demo.mp4): 1 minute 57 seconds, inside the hackathon's two-minute limit. Its pictures are finished. Its voice is a computer placeholder, there so the timing can be judged, and it is meant to be replaced by yours.

## The script

319 words in nine cards. The times are where each card starts with the placeholder voice.

| Card | Starts | What it is | On screen | Say |
| --- | --- | --- | --- | --- |
| 1 | 0:00 | The problem | Five dots, one turns amber. A bar: 4 in 10 get treatment. Then thin lines that slip down over weeks and fade. | "One in five American teenagers goes through depression in a year, and most get no treatment. It builds slowly: a little less sleep, fewer texts, dropped plans. Nobody knows when to ask." |
| 2 | 0:13 | What we built | The Stability mark draws itself. Two phones slide in: Maya's and her mom's. | "That's why we built Stability. It lives on a teenager's phone, linked to a parent's. Meet Maya." |
| 3 | 0:19 | Her whole digital life | Maya's phone in the centre. Instagram, TikTok, YouTube, browsing and news feeds light up on the left; Spotify, games and chats on the right, under '17 sources'. Then Stable floats in, drifts around, and settles into the check-in card on her phone. | "Stability connects to her whole digital life: Instagram, TikTok, YouTube, browsing, news feeds, Spotify, games and chats. It reads it all on her phone and learns her normal. Once a week, our mascot, Stable, checks in. Two taps." |
| 4 | 0:35 | It asks | Week four: the two questions come up and she answers low. Weeks five and six: the ring turns amber, her check-ins climb, the model's score crosses its line, and the questions come up again. | "Every month, it asks the two questions doctors use. Maya says she's mostly okay, and it takes her at her word. Then finals hit. Her check-ins get tense, and our model doesn't wait a month. It asks again." |
| 5 | 0:48 | The note | Week six she answers low again. Week eight her answers are high. Mom's phone slides in. An amber dot crosses from Maya's phone to hers and the note opens. | "But at week eight, her answers come back high. Maya sees a nudge to see a doctor, and her mom gets a note: what changed, for how long, and how to start the conversation. Never her messages." |
| 6 | 1:00 | Private, with a safety net | Maya types a message. It becomes a bubble, then a single dot. A counter holds at 0 bytes sent. A chip: 988, one tap away. | "Nothing she types, watches or searches ever leaves her phone. Small models read it there and keep only numbers. If she types or searches for self-harm, 988 is one tap away." |
| 7 | 1:13 | The engine | A diagram builds: her digital life, two taps and past answers feed the engine; it opens the two questions, then the eight, then the note. Below, the two on-phone models and a lock: 0 words leave the phone. | "Under the hood, her digital life, Stable's two taps and her past answers feed our engine. It tracks how she's doing and decides when to ask. High answers unlock the full eight questions, and only then is a parent told." |
| 8 | 1:26 | It works | A counter runs to 400,000+. Tiles: 3.4x (the ask model 44% vs a fixed schedule 13%), 0.90 on 113 teens, 54% vs 24% (US high schoolers sleeping 4 hours or less vs 8 hours who felt sad or hopeless), and 2x with 13 of 15. | "And it works. Tested on over four hundred thousand real examples, our ask model finds a hard week three times as often as a schedule, and scored point nine oh on a hundred thirteen teens it had never seen. Across thirty thousand US high schoolers, those sleeping four hours or less were twice as likely to feel sad or hopeless. Our language models catch twice what keyword lists do." |
| 9 | 1:50 | Close | The Stability mark, 'knowing when to ask', and a small 'Prototype. Not medical advice.' | "Stability. Knowing when to ask, so more teens get help sooner." |

The video is a pitch: it shows Stability at its best and leaves the limits and failures to [the write-up](../WRITEUP.md). Every number in it is a real result from the write-up, not a best case: 3.4x is 44% against 13% (Experiment 4), 0.90 is the ask model on 113 teenagers it never saw, over all their later answers (Experiment 6), 54% against 24% is the share of US high schoolers who felt sad or hopeless when sleeping 4 hours or less against 8 hours, across 30,346 students in the CDC's 2023 and 2025 surveys (Experiment 7; the 2025 numbers are shown), 2x is the tone model against a keyword list (Experiment 2), 13 of 15 is the self-harm check on our test messages (Experiment 5), and 400,000+ counts the labelled weeks, comments, posts, answers and survey responses the models were trained and tested on (16,886 student-weeks, 54,263 GoEmotions comments, 282,768 self-harm posts, 500 psychiatrist-rated users, 918 teen answers, 30,346 YRBS students, 515 NHANES adults, 736 music listeners, 13,464 gamers, 481 social media users and 3,553 Dreaddit posts: 404,430). The sleep result is a one-time survey across many teens, so the video says it adds context and does not claim it predicts one teen's week.

## Record your own voice

You only say the words. The pictures re-time themselves to whatever you record.

1. **Open the teleprompter.** Open `video/script/teleprompter.html` in a browser. It shows one card at a time in large type. The right arrow or space moves on.
2. **Record sound only.** Voice Memos on a phone is fine. Use a quiet room, hold the phone a hand's length away, and pause two seconds between cards.
3. **Fluffed a line?** Pause, say that whole card again from its first word, and carry on. The last clean take of each card is the one that gets used.
4. **Two voices?** Take turns card by card, in one recording.
5. **Hand it over.** Put the file in `video/takes/` and run:

```
cd video
python3 tools/ingest_audio.py takes/your-recording.m4a
npx remotion render src/index.ts Main out/steady-demo.mp4
```

The first command transcribes the recording on this computer, picks the takes, cleans the sound, and rewrites the timing that every animation is cued from. It needs ffmpeg and `pip install openai-whisper`. The placeholder read already fills almost the full two minutes, so read at a steady pace. If your read runs past 1:57 it tightens the pauses, then speeds up by at most 6%, and tells you if that is still not enough.

## Change the words

Edit `video/script/script.json`, then run `python3 tools/tts_placeholder.py` for a new placeholder voice (it needs `pip install edge-tts`) and `python3 tools/teleprompter.py` for new cards. A scene looks for the phrases it is cued on, so a reworded sentence can leave one animation without its cue; the render prints "cue not found" for each one, with the phrase to fix in `video/src/scenes/`.

## How it is made

- **The phones are the real app.** `video/public/rec/` holds recordings of Maya's phone and her mom's phone, made by driving the app's own screens through Maya's twelve weeks: her two-tap check-ins, the monthly ask in week 4, the ask model's early ask in week 6, and the high answers in week 8. Nothing on the phones is drawn for the video.
- **The rest is drawn in code** with Remotion, in `video/src/scenes/`. Each beat starts on a spoken word, read from `video/src/timing.json`.
- **The music** is synthesized by `video/tools/music.py`, so there is nothing to license.
- **AI tools:** the script, scenes and tools were written with Claude (Anthropic). The placeholder voice is Microsoft's `en-US-AvaNeural` through `edge-tts`.

## Upload it

Upload the file to YouTube as unlisted, or share it from Google Drive with "anyone with the link can view", and paste that link into the submission form. Open the link in a private window to check that it plays without signing in.
