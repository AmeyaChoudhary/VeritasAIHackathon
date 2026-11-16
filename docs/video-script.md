# Demo video script

The demo video is [docs/video/steady-demo.mp4](video/steady-demo.mp4): 1 minute 58 seconds, inside the hackathon's two-minute limit. Its pictures are finished. Its voice is a computer placeholder, there so the timing can be judged, and it is meant to be replaced by yours.

## The script

369 words in nine cards. The times are where each card starts with the placeholder voice.

| Card | Starts | What it is | On screen | Say |
| --- | --- | --- | --- | --- |
| 1 | 0:00 | Maya, then the problem | Night stage. 'Maya, 16'. Three lines (Plans, Sleep, Texts) run level, then each slips amber as it is named. A quote: 'It's just finals.' Then '2 months' before anyone asked. Then five dots, one amber: 1 in 5. Then a bar: 59% get no treatment. Then 'nobody knows when to ask.' | "Maya is sixteen. Last fall she quit soccer. By December she slept five hours a night and texted her friends half as much. Her mom thought it was finals. Two months passed before anyone asked how she really was. Maya is one of many: one in five US teens has depression each year, and fifty-nine percent get no treatment. Nobody knows when to ask." |
| 2 | 0:19 | What we built | The Stability mark draws itself. Two phones slide in, Maya's and her mom's, linked by a dotted line. | "So we built Stability: an app on Maya's phone, linked to her mom's, that knows when to ask." |
| 3 | 0:25 | Her digital life, with consent | Two chips: 'Maya agreed', 'Mom agreed'. Instagram, TikTok, YouTube, browsing and news feeds light up on the left; Spotify, games and chats on the right under '17 sources'. A line: parents never see a message, search or video. Then Stable floats in and settles into the check-in card. | "With consent from Maya and her parents, it connects to her digital life: Instagram, TikTok, YouTube, browsing, news feeds, Spotify, games and chats. It's all read on her phone, and her parents never see a message, search or video. Once a week, our mascot Stable checks in: two taps." |
| 4 | 0:41 | It asks, and asks early | Week 4: the two questions; she answers 'several days' to both, 2 of 6. Weeks 5 and 6: the ring turns amber, her check-in stress goes from 2 to 4, the ask model's score climbs from 0.05 past 0.16, and the questions come up again in week 6. | "Every month, Stable asks the two screening questions doctors use. In week four, Maya scores two of six and is taken at her word. During finals, her stress check-ins jump from two to four, our ask model's score crosses its line, and it asks again two weeks early." |
| 5 | 0:56 | The note | Week 8: she scores 4 of 6, so all eight questions come up; total 12. Maya sees a doctor nudge. Mom's phone slides in; an amber dot crosses; chips: Sleep and messaging down, For 4 weeks, How to start the talk. 'Never her messages.' | "In week eight she scores four, so all eight questions come up: twelve, past the cutoff of ten. Maya is nudged to see a doctor, and her mom gets a note: sleep and messaging down for four weeks, and how to start talking. Never her messages." |
| 6 | 1:09 | Private, with a safety net | Maya types a message. It becomes a single dot. A counter holds at 0 bytes sent. A chip: 988, one tap away. | "Small models read what she types, watches and searches, keep only numbers and delete the words. If she types about self-harm, 988 is one tap away." |
| 7 | 1:18 | The engine | A diagram builds: two taps and past answers feed the ask model, a logistic regression; past 16% it asks; 2 questions, then all 8 at 3 or more, then a note at 10 or more. Below: her digital life feeds the mood, self-harm and music models, all on the phone. | "Under the hood, her two taps and past answers feed our ask model, a logistic regression scoring the chance her next screening is high. Past sixteen percent, it asks. Three or more unlocks all eight; ten or more alerts a parent." |
| 8 | 1:30 | It works | A counter runs to 404,376, broken down: 282,768 posts, 54,263 comments, 30,346 surveyed teens, 16,886 student-weeks and more. Tiles: 3.4x (44% vs 13%), AUC 0.90 on 113 teens, 54% vs 24% for sleep, 2x a keyword list with 13 of 15 self-harm messages. | "Does it work? We tested on over four hundred thousand labelled examples: check-ins, surveys and real posts. Our ask model finds a hard week three times as often as a fixed schedule. On a hundred thirteen teens it had never seen, its AUC was point nine oh. In a CDC survey, teens sleeping four hours or less were twice as likely to feel hopeless." |
| 9 | 1:49 | Close | The Stability mark, 'knowing when to ask', Stable, and a small 'Prototype. Not medical advice.' | "Stability. Knowing when to ask, so more teens like Maya get help sooner." |


The video is a pitch: it shows Stability at its best and leaves the limits and failures to [the write-up](../WRITEUP.md). Every number in it is a real result from the write-up, not a best case: 3.4x is 44% against 13% (Experiment 4), 0.90 is the ask model on 113 teenagers it never saw, over all their later answers (Experiment 6), 54% against 24% is the share of US high schoolers who felt sad or hopeless when sleeping 4 hours or less against 8 hours, across 30,346 students in the CDC's 2023 and 2025 surveys (Experiment 7; the 2025 numbers are shown), 2x is the tone model against a keyword list (Experiment 2), 13 of 15 is the self-harm check on our test messages (Experiment 5), and 400,000+ counts the labelled weeks, comments, posts, answers and survey responses the models were trained and tested on (16,886 student-weeks, 54,263 GoEmotions comments, 282,768 self-harm posts, 500 psychiatrist-rated users, 918 teen answers, 30,346 YRBS students, 515 NHANES adults, 736 music listeners, 13,413 gamers, 481 social media users and 3,550 Dreaddit posts: 404,376). The sleep result is a one-time survey across many teens, so the video says it adds context and does not claim it predicts one teen's week.

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
