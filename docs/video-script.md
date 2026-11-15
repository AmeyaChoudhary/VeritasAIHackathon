# Demo video script

The demo video is [docs/video/steady-demo.mp4](video/steady-demo.mp4): 1 minute 59 seconds, just inside the hackathon's two-minute limit. Its pictures are finished. Its voice is a computer placeholder, there so the timing can be judged, and it is meant to be replaced by yours.

## The script

326 words in ten cards. The times are where each card starts with the placeholder voice.

| Card | Starts | What it is | On screen | Say |
| --- | --- | --- | --- | --- |
| 1 | 0:00 | The problem | Five dots, one turns amber. A bar: 4 in 10 get treatment. Then a thin line that slips down over weeks and fades. | "One in five American teenagers goes through depression in a year, and most get no treatment. It builds slowly: a little less sleep, fewer texts, dropped plans. So nobody sees it." |
| 2 | 0:13 | What we built | The Steady mark draws itself. Two phones slide in: Maya's and her mom's. | "So we built Steady. It lives on a teenager's phone, linked to a parent's. Meet Maya." |
| 3 | 0:19 | It learns her normal | Maya's phone in the centre. The ring fills over four weeks. The four signals light up as they are named. Then she taps the two-dot check-in. | "For four weeks, Steady learns what's normal for her: her sleep, how often she reaches out, how much she moves, and the tone of what she types. Once a week, she checks in with two taps." |
| 4 | 0:31 | It asks | Week four: the two questions come up and she answers low. Weeks five and six: the ring turns amber, her check-ins climb, the model's score crosses its line, and the questions come up again. | "Every month, Steady asks two questions, the ones doctors use. Maya says she's mostly okay, and Steady takes her at her word. Then finals hit. Her check-ins get tense, and our model doesn't wait a month. It asks again." |
| 5 | 0:46 | The note | Week six she answers low again. Week eight her answers are high. Mom's phone slides in. An amber dot crosses from Maya's phone to hers and the note opens. | "She still says she's fine. But at week eight, her answers come back high. Maya sees a nudge to see a doctor, and her mom gets a note: what changed, for how long, and how to start the conversation. Never her messages." |
| 6 | 1:00 | Her words stay on her phone | Maya types a message. It becomes a bubble, then a single dot. A counter holds at 0 bytes sent. | "What Maya types never leaves her phone. A small model reads each message there, keeps one dot, and lets the words go." |
| 7 | 1:08 | Does it work: the tone model | Two bars grow: tone model 50%, keyword list 24%. | "Does it work? On five thousand comments it had never seen, our tone model caught half of the low-mood ones. A keyword list caught a quarter." |
| 8 | 1:17 | Does it work: when to ask | 213 dots. 'Our first idea failed.' Then two bars: the ask model 44%, a fixed calendar 13%. Then: 113 teens, never seen, AUC 0.85. | "Then we tested timing on phone data from two hundred thirteen students, and our first idea failed. Phone signals picked the week no better than chance. So we rebuilt Steady to ask first. Its model put forty-four percent of its asks on a hard week. A calendar: thirteen. And on a hundred thirteen teenagers it had never seen, it still held up." |
| 9 | 1:38 | What it can't do yet | Three short lines with icons: who, not yet which week; a crisis or a friend helping; a clinician. | "It knows who to ask, not yet which week. Our self-harm model can't tell someone in crisis from a friend helping them. So on its own, it only asks, and it needs a clinician." |
| 10 | 1:49 | Close | The Steady mark, 'knowing when to ask', and 'Prototype. Not medical advice.' | "Steady is a prototype, not medical advice. But asking at the right time could change who gets help." |

Every number in the script is from [the write-up](../WRITEUP.md).

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
