# Handoff: Stability (Veritas AI Hackathon, Health track)

Written 2026-11-15, mid-morning Pacific. **Deadline: tonight 11:59 PM ET = 8:59 PM PT.**

Live: site https://ameyachoudhary.github.io/VeritasAIHackathon/ · app https://ameyachoudhary.github.io/VeritasAIHackathon/app/ · repo https://github.com/AmeyaChoudhary/VeritasAIHackathon

---

## 1. The exact request this handoff picks up from

The last instruction, word for word:

> okay so let's do this.
> for the video, we should holistically show that we can getting the complete digital life of the individual. We want to pitch this as a product that can monitor your digital life - insta, youtube, browsing histry, news feeds, gaming, tiktok, chats - and holistically predict the state of the mind to corelate to the depression signs

The reply it got, word for word:

> Got it: the video should show Stability taking in her whole digital life, not just four signals. Two things will keep that pitch strong and safe:
>
> - I'll only show sources the app can really read. Checking the list now, and I'll add anything on your list that's missing (Instagram, for one) so every chip on screen is true.
> - The numbers stay attached to what they measure. Our 0.90 and 3.4× come from the ask model, which uses her own answers. So the story is: her digital life gives Stability the full picture, read privately on her phone, and it combines that with her check-ins to know when to ask. I won't say feeds alone predict depression at 0.90, because our own tests showed they don't, and a judge who reads the write-up would catch it.
>
> The app already reads 17 sources, so most of your list can be covered, with Gaming via Discord and news via browsing history. Instagram now, and I'm rebuilding the video's

Work stopped there (the session was interrupted mid-edit).

---

## 2. What is pushed and live (commit `5763358`)

- **Name:** the product is **Stability** (was "Steady"). Code identifiers like `app.steady`, `SteadyEvent` and `steady-demo.mp4` keep the old name on purpose.
- **Mascot:** **Stable** (`app/src/ui/Stable.tsx`). It sits on the check-in card, turns amber to ask questions, and hops after an answer. It is kept off the 988 / safety screens on purpose.
- **Ask-first rules:**
  - A weekly two-tap check-in.
  - Everyone gets the two questions (PHQ-2) once a month.
  - The ask model asks sooner when its score is ≥ 0.163 and the last ask was at least 2 weeks ago.
  - PHQ-2 ≥ 3 brings up all 8 questions; PHQ-8 ≥ 10 sends the parent a note.
  - Phone signals are context, and only a backstop when the teen stops checking in.
- **Self-harm:**
  - Phrase-list "plan" → urgent note at once.
  - Phrase-list "concern" → "Are you safe right now?"; no answer in 30 minutes → urgent note.
  - Model-only flag → it only asks the teen, and only "No" alerts a parent (see Experiment 5b).
- **Spotify** data-file import. There is no live Spotify sign-in: Spotify's developer policy forbids building user profiles.
- **Pitch video:** 1:57, rendered at `docs/video/steady-demo.mp4` and `site/assets/steady-demo.mp4`.
- **Write-up:** `WRITEUP.md`, about one page; reports the failures honestly.

### Headline numbers (all real; source in `results/`)

| Model | Result |
| --- | --- |
| Ask model (logistic regression, 6 inputs) | AUC 0.89 on 213 college students never seen; 44% of asks on a hard week vs 13% for a calendar (3.4×). Random weeks for the same students reached 45%, so it finds who to ask, not which week. |
| Ask model on teens (Experiment 6, Corona Health) | AUC 0.85 for the first follow-up and 0.90 over all 635 later answers; top asks 74% (first follow-up) and 92% (all answers) vs 41% at random; boys 0.93, girls 0.86. |
| Tone model | 50% of low-mood comments found at 59% precision vs 24% for a keyword list. |
| Self-harm, phrase list + model | 93% on held-out posts; 13 of 15 of our test messages vs 6 for the phrase list alone. On psychiatrist-labelled users (5b): AUC 0.66, and it flags 86% of people supporting others. |
| Bigger models | Trees, boosting and a neural net all tied with logistic regression (0.88–0.89). |

Failures that stay in the write-up (they are required): the drift rule picked a hard week 14.6% of the time vs 14.9% random, phone-only data scored AUC 0.57–0.61, and the 5b result above.

---

## 3. What is done but NOT committed (in the working tree)

### App: all tests pass (240), the build passes

Every source below is the teen's **own export**, read on the phone. Only weekly counts are kept; titles, search words, links and usernames are dropped. Parents see nothing new.

- **YouTube (Google Takeout):**
  - Video titles and searches are scored for mood and self-harm, then dropped.
  - Only weekly counts are kept.
  - A self-harm search from the last 24 hours that the phrase list flags → "Are you safe right now?" with 988.
- **Chrome history (Google Takeout), a new source:** page titles, plus searches extracted from Google, Bing, DuckDuckGo and YouTube search links, get the same treatment.
- **Instagram export:**
  - Searches are scored the same way.
  - Posts and videos viewed are counted by time only.
- **TikTok export:**
  - Searches are scored the same way.
  - Videos watched are counted by time only.
- **Where the counts go:**
  - Views and searches feed the existing late-night activity signal.
  - The new counts (`harmContent`, `lowMoodContent`, `searches`, `viewed`) appear only on the teen's Connect screen. They never reach the rules or a parent's note.
- **Files:**
  - Modified: `app/src/integrations/{exports,agg,sample}.ts`, `app/src/engine/{types,sources,rules,simulate}.ts`, `app/src/teen/{sourceInfo.ts,Connect.tsx}`, `app/README.md`, `app/src/integrations/sources.test.ts`.
  - New: `app/src/integrations/browsing.test.ts`, `app/src/integrations/social.test.ts`, `app/src/integrations/fixtures/chrome.json`.
- **Not done:**
  - Instagram's sample fixture (changing it shifts existing test counts).
  - Instagram "your topics" and `ads_viewed`.
  - A dangerous-domain blocklist: there's no validated public list, so page titles and searches are used instead.
  - Live access to any feed. A web app can't read history; it needs the export file.

The app currently reads **17 sources**, listed in `app/src/teen/sourceInfo.ts`:

| Area | Sources |
| --- | --- |
| School | Classroom, Canvas, Schoology |
| Google and Microsoft | Gmail, Calendar, Microsoft 365, Drive |
| Music | Last.fm, Spotify |
| Health and phone | Fitbit, Android phone data |
| Social and chat | Instagram, TikTok, Snapchat, Discord |
| Video and web | YouTube, Chrome |

For the pitch: gaming means Discord chats, and news feeds come through browsing history. There is no separate gaming or news connector.

### Video: HALF-EDITED. The source does not match the voice. Do not render it as is.

These were changed for the "whole digital life" pitch:

- **`video/script/script.json`:**
  - The `learn` card now says: "Stability connects to her whole digital life: Instagram, YouTube, TikTok, browsing, music, gaming chats and messages. It reads it all on her phone and learns her normal. Once a week, our mascot, Stable, checks in. Two taps."
  - The `private` card now says: "Nothing she types, watches or searches ever leaves her phone. Small models read it there and keep only numbers. And if she types or searches for self-harm, 988 is one tap away."
  - The `how` card now says: "Under the hood, her digital life, Stable's two taps and her past answers feed our engine. It tracks how she's doing and decides when to ask. High answers unlock the full eight questions, and only then is a parent told. No words ever leave the phone."
  - The `drift` card's first sentence now reads "Every month, it asks the two questions doctors use."
- **`video/src/scenes/Demo.tsx`:**
  - The learn beat is now "01 · Her digital life / Sees the whole picture".
  - Rows on the left: Instagram, YouTube, TikTok, Browsing.
  - The right panel shows "17 sources" with Music, Gaming chats and Messages.
  - New cue phrases match the new learn text.
  - The private-scene cues changed ("Nothing she types", "Small models", "keep only numbers").
- **`video/src/components/ui.tsx`:** new icons (music, play, globe, photo, clip, game).
- **`video/src/numbers.json`:** `pitch.sources = 17`.

Still to do, in this order:

1. **`video/src/scenes/Demo.tsx`:** change the drift cue `q("drift", "asks two questions")` to `q("drift", "asks the two questions")`. The new text says "asks the two questions".
2. **`video/src/scenes/Evidence.tsx`:** update the "Under the hood" diagram.
   - The cue phrases must match the new `how` text: `"Under the hood"`, `"her digital life"`, `"two taps"`, `"past answers"`, `"feed our engine"`, `"decides when to ask"`, `"High answers"`, `"full eight"`, `"a parent"`, `"No words ever"`.
   - Add a "Her digital life (17 sources, read on her phone)" input node above "Two taps" and "Past answers".
   - Rename "Ask model" to "Stability engine".
   - Show the mood and self-harm models as a bottom row.
   - Remove the old cues `"our ask model"`, `"Two on-device"`, `"mood"`, `"self-harm risk"` and `"no words ever"` (case changed).
3. **Regenerate the voice:**
   ```
   cd video
   /opt/anaconda3/bin/python3 tools/tts_placeholder.py
   /opt/anaconda3/bin/python3 tools/fix_words.py
   ```
   Check the total stays at or under about 115 s, so the whole video stays under 2:00. Trim words if not.
4. **Check types and cues:** run `npx tsc --noEmit`, then render a few stills (`npx remotion still src/index.ts Main out/stills/x.png --frame=N --scale=0.5`). Watch the render log for "cue not found".
5. **Render and copy:**
   ```
   /opt/anaconda3/bin/python3 tools/music.py
   /opt/anaconda3/bin/python3 tools/teleprompter.py
   npx remotion render src/index.ts Main out/steady-demo.mp4
   ```
   Then make the web copy (ffmpeg, crf 25, aac 128k) into `docs/video/steady-demo.mp4` and `site/assets/steady-demo.mp4`.
6. **Regenerate the script table** in `docs/video-script.md` from `script.json`.

To abandon the video edit instead: `git checkout -- video/` restores the published pitch video source.

### Guardrails for the "digital life" pitch (please keep these)

- **Only claim sources the app really reads** (the 17 above).
- **Keep the numbers attached to what they measure.** 0.90 and 3.4× are the ask model, built on her own answers. Do not say feeds or social data predict depression at 0.90: Experiments 1 and 1b showed phone and passive data alone reach about 0.57–0.61, and the write-up says so.
- **Use "reads on her phone" or "understands", not "monitors her".** Everything is read on the phone, the teen sees what's read, and parents get only the note. Given the Meta teen-harm lawsuits, "monitor a minor's feed" is the wrong look.
- **Keep "Prototype. Not medical advice."** on the end card. The Health track requires it.

---

## 4. Other open items

- [ ] Commit and push the app work above. Run `cd app && npm test && npm run build` first; it should show 240 tests.
- [ ] Finish or revert the video (section 3).
- [ ] Docs and site don't yet mention the YouTube, Chrome, Instagram and TikTok content reading: `README.md`, `docs/concept.md`, `docs/parent-alerts.md` (accounts table), and `WRITEUP.md` (keep it at about 1,170 words or less).
- [ ] Optional: one sourced sentence in the write-up's "The problem" about the 52-state Meta settlement. Cite Meta's SEC 10-Q only: https://www.sec.gov/Archives/edgar/data/0001326801/000162828026066773/meta-20260930.htm
- [ ] Record the voiceover if wanted. The teleprompter is `video/script/teleprompter.html`; then run `python3 tools/ingest_audio.py takes/<file>` and re-render. There are only about 3 seconds of slack, so read briskly.
- [ ] Upload the video (YouTube unlisted or Drive, anyone with the link) and submit the form: Track Health, links to the code and write-up, names, emails, schools. Check the links in a private window.

## 5. Working rules for this repo

- **The repo is public and Round 1 is judged blind.** No names, emails or local paths in committed files. 
- **Never commit a re-run of `experiments/exp1b_deeper.py`** from a new machine: the college-student rows drift by about 0.01. Restore with `git checkout -- results/exp1b app/public/data/exp1b_summary.json`.
- **`npm install` rewrites `app/package-lock.json`.** Restore it with `git checkout`.
- **Data:** run `bash scripts/get_data.sh`. It downloads everything into the ignored `data/` folder, including the Kaggle, Zenodo and Depresjon fallback copies.
- **Deploys:** pushing to `main` runs the Pages workflow, which tests, builds and redeploys the site and app in about 30 seconds.
