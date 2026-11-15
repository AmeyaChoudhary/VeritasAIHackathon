# Steady: the working prototype

A web app that plays Steady on two phones: the teen's phone and the linked parent's phone, side by side, with a control rail for the demo. It follows [docs/parent-alerts.md](../docs/parent-alerts.md) and [docs/concept.md](../docs/concept.md), and uses their wording where they give it.

**Prototype. Not medical advice.** No clinician has reviewed the rules or the wording.

## Run it

You need Node 22 or newer.

```
cd app
npm install
npm test          # the rules engine tests
npm run dev -- --port 5210
```

Then open http://localhost:5210. Any port works for the demo; Google sign-in needs the port that is listed in your Google OAuth client (see Connected accounts below).

To build a static copy: `npm run build`. The output in `dist/` runs from any folder (`base: "./"`), for example with `npx vite preview` or any static file server.

Everything works offline once the page has loaded. Fonts are bundled, there are no CDN links, and the only files fetched are the app's own (`models/tone.json` and `data/exp*_summary.json`). The demo can turn the laptop's Wi-Fi off on camera.

## Three ways to open it

| Address | What you get |
| --- | --- |
| `#/` on a wide screen | Both phones in device frames, the amber light between them, and the control rail: scenario, Next week, Play, Reset, the simulated clock, the event log and "How we know" |
| `#/` under 768 px wide | One phone full screen, with a switch at the bottom: Teen, Parent, Demo |
| `#/teen` and `#/parent` | One phone alone. Open them in two tabs of the same browser and they stay in sync through a BroadcastChannel and localStorage, with no network |

One tab runs the clock and the rules (the "driver", chosen with the Web Locks API). Other tabs pass what you tap to it. Open the demo or `#/teen` before pairing from `#/parent`.

## Scenarios

Pick one in the control rail. **Next week** plays to just after the next week ends. **Play** steps a week every few seconds and stops at the interesting moments. **Scripted answers and replies** answers the questions and taps the parent's replies the way the story says; turn it off to answer on the phones yourself.

| Scenario | What happens |
| --- | --- |
| Maya's 12 weeks | Weeks 1 to 4 learn her range (week 3 has one four-hour night, and nothing happens). Finals in weeks 5 and 6: sleep, messaging and activity leave the range, she gets the two questions and answers low, and Steady takes her at her word. Weeks 7 and 8: sleep and messaging stay low. At the end of week 8 her two answers are high, the other six follow, and her score on the eight is 10 or more. Her phone shows the doctor suggestion; Mom gets the heads-up ("For the past 4 weeks, Maya has been sleeping less than usual and messaging people less often.") and taps "Booked a doctor" the next evening. Weeks 9 to 12 come back into range |
| Steady week to week | Everything stays in range. The two questions come up once anyway, at week 8. Week 10 has two days of data, so Mom's app shows "On, but not enough data" for a few days. Week 11 has days without the Steady keyboard. No notes |
| Skips the questions | From week 5 sleep and messaging drop and stay down. Every question set is skipped. At the end of week 8 (four weeks outside, last two asks skipped) Mom gets a heads-up. The evidence keeps coming and is held; three weeks later a second heads-up goes out. Maya's doctor suggestion waits for the next weekly note |
| Urgent: plan words | Late on a Wednesday in week 3 a message states a plan. 988 and 911 fill her screen and Mom gets an urgent note at once |
| Urgent: concern, no answer | In week 3 a message has self-harm words without a plan. "Are you safe right now?" appears with 988 behind it. Nobody answers, so 30 minutes later Mom gets an urgent note. Nobody replies, so it sounds again every 5 minutes, and after 15 minutes it shows on Dad's phone and Ms. Patel's phone (the trusted adult Maya named) |

The clock buttons (+5 MIN, +30 MIN, +1 DAY, and speeds up to an hour a second) show the 30 minutes, the 15 minutes, the 26 hours before "Not connected" and the two-day reminder in seconds.

You can also do it by hand: pair with "Scan the code" on Mom's phone, read the setup screen on Maya's phone, answer the eight, then use Next week. Type in the Type tab to try the self-harm check, and turn Steady off in Settings to watch Mom's app go to "Not connected".

## What is real and what is simulated

| Real | Simulated |
| --- | --- |
| The rules: every rule in docs/parent-alerts.md is in `src/engine/rules.ts`, with all numbers in `src/engine/config.ts` | Maya and all weekly data. The weekly numbers are made up in `src/engine/simulate.ts` |
| The tone model runs in the browser on what you type (`src/engine/tone.ts`, weights in `public/models/tone.json`, from Experiment 2) | Sleep, steps and messaging counts. A real app would read them from the phone |
| The self-harm phrase check runs on what you type (`src/engine/selfharm.ts`). It is a short list and is not validated | The keyboard. The Type tab stands in for the Steady keyboard |
| Typed text is scored and dropped. It is never stored, and TEXT SENT stays at 0 BYTES | Time. The clock is simulated, so a week passes in a click |
| Each note is the JSON event from the doc, and the log shows its exact bytes | The relay. Events move between tabs of one browser, not between phones, and are not encrypted |
| Connect, then Import a file, parses a Spotify history file or a sleep and steps CSV in the browser, and uploads nothing | Pairing. "Scan the code" reads the code from the teen phone on the same page |
| The parent app's timing: urgent notes repeat every 5 minutes, reach the other adults after 15, reminders after 2 days, "Not connected" after 26 hours, heads-ups held quietly for six weeks after "Booked a doctor" | Do Not Disturb, Critical Alerts, phone calls and texts. The `tel:` and `sms:` links open the phone's dialer or messages app if there is one |

"How we know" reads `public/data/exp1_summary.json`, `exp2_summary.json` and `exp3_summary.json` at runtime and shows "Results pending" for any that is missing. If `models/tone.json` fails to load, the Type tab says "Tone model not loaded" and the self-harm check still runs.

## Choices the doc leaves open

- **Tone plus one other.** Tone counts (two weeks outside) and any other signal is outside this week.
- **Two more weeks outside** is counted in weeks with enough data, from the week the outside state began.
- **An unfinished set** is counted as skipped when the next week ends, or at once when the teen taps "Not now".
- **Four weeks** for the skip rule start when the second of the two signals leaves its range, and a low answer restarts them.
- **Two flags in 14 days** send a heads-up (inside the three-week limit). When the second flag is within 7 days the urgent note goes instead, so the heads-up is not sent as well. An urgent note replaces an overlapping two-flags heads-up.
- **The two-week pause after a low answer** is counted in calendar weeks from the week the questions were asked, not 14 days from the moment of the answer. A set asked at the end of week 6 and answered low comes back at the end of week 8, even if the answer came a few days late.
- **The four weeks of the skip rule** need two signals that each stayed outside for four valid weeks in a row. Signals that take turns do not add up.
- **While Steady is off** nothing is asked or sent, an open question set is dropped (it does not count as skipped), and the week is left out of the count. A week counts only by the days the phone actually had data and Steady was on.
- **Daily status** counts only days with real data, so the first few days after setup report "not enough data". If no status ever arrives, the parent app shows "Not connected" 26 hours after pairing.
- **A "yes" to "Are you safe right now?"** holds the note, and the 988 screen stays up until the teen goes back.
- **The doctor suggestion** shows at once after a high score, and waits for the next weekly note after skipped asks or two flags.
- **Asking anyway** every eight weeks and the slow-moving range come from docs/concept.md. Sleep under six hours a night counts as outside for everyone.
- **ALERTS SENT** is shown under the teen's phone frame, outside the phone, because the teen never sees that a note was sent. TEXT SENT: 0 BYTES is on the Type tab and in the caption.
- **Receipts.** When the parent taps a reply to an urgent note, the parent app sends a small receipt to the relay so the other adults' apps know whether to show the note. It never reaches the teen's phone. The log shows it.

## Connected accounts

The teen connects each source on their own phone, from the Connect tab, by signing in themselves or choosing their own export file. Each has its own screen that says what it reads, with Connect and Not now, and a switch in Settings turns it off in one tap. Steady never shows a password field and never signs in to an app with the teen's password or session. The rules are in [docs/parent-alerts.md](../docs/parent-alerts.md), "Connected accounts".

### How each source connects

| Source | How | From a web page? | Reads | Keeps (weekly) | Signal |
| --- | --- | --- | --- | --- | --- |
| Gmail | Google sign-in (GIS token model), `gmail.readonly` | Yes | Sent emails, last 28 days, at most 200. For replies, only Message-ID and In-Reply-To of the thread. Own bodies with a field mask | Emails sent, median hours to reply, share after midnight, low-mood share | Reaching out, tone, reply time |
| Google Calendar | Google sign-in, `calendar.events.readonly` | Yes | Events four weeks back and ahead | Exam weeks; titles dropped | Context only |
| Google Classroom | Google sign-in, `classroom.courses.readonly` and `classroom.coursework.me.readonly` | Yes | Own coursework due dates and own submissions; field masks leave titles out | Due, late, missing, turned in after midnight | School |
| Google Drive activity | Google sign-in, `drive.activity.readonly` (Drive Activity API v2) | Yes | Own edits only (actor is the current user); a field mask leaves file names out | Days with edits, edits after midnight | Late-night activity |
| Microsoft 365 | MSAL.js (`@azure/msal-browser`, PKCE popup, memory cache), `Mail.Read` and `Calendars.Read` | Yes | Sent Items only, `$select` of what scoring needs and Graph's text body; for replies, the In-Reply-To value read as Graph's extended property `String 0x1042` (the only header asked for), then the answered message's time and sender address only. When a sent message has no In-Reply-To, Steady uses its conversation id and the latest earlier message in that conversation the teen did not send, asking only for `receivedDateTime` and `from`; calendar subjects matched and dropped | As Gmail, plus exam weeks | Reaching out, tone, reply time, context |
| Last.fm | API key, public profile name | Yes | Plays, fixed 28-day window | Plays, share after midnight, repetition | Late listening |
| Fitbit | OAuth 2.0 PKCE popup, `sleep activity` | Yes (CORS allowed), but see below | Sleep logs (main sleep) and daily steps | Sleep hours, bedtime, steps | Sleep, activity |
| Canvas | The teen's own access token and school address | **No: needs the phone app or a server** | Own submissions: late and missing flags, every page by the `Link` header up to the page cap (a cut list is marked partial) | Late and missing | School |
| Schoology | The teen's own API key and secret, two-legged OAuth 1.0a (PLAINTEXT) | **No: needs the phone app or a server** | Own grades (missing is exception 3, late flag) and due dates; assignments paged by `links.next` up to the page cap (a cut list is marked partial) | Late and missing | School |
| Phone data (Android) | File from the Steady app, version 1 or 2 | File | Screen time; in version 2 also Health Connect sleep and steps, the Steady keyboard's daily numbers (no words) and self-harm flags as opaque ids | Screen and night minutes, sleep, bedtime, steps, keyboard messages, speed, pauses, corrections, low-mood share | Sleep, activity, reaching out, tone, typing, night phone use, screen time |
| Instagram, TikTok, Snapchat, Discord | The teen's own export (.zip or .json) | File | Only the owner's sent messages and own activity times; owner found from the export's own profile file and matched to exactly one participant of each conversation | Messages sent, actions after midnight, low-mood share of own messages | Reaching out, tone, late-night activity |
| YouTube | Google Takeout, history as JSON | File | Watch and search times only, no titles or search terms | Actions, actions after midnight | Late-night activity |

**Which platforms allow browser calls.** Checked on November 14, 2026 with a CORS preflight from `http://localhost:5210`: Microsoft Graph (`Access-Control-Allow-Origin: *`), Google Classroom and Drive Activity (echo the origin), Fitbit (echoes the origin) and Last.fm (`*`) allow it. Schoology's API answered the preflight with no `Access-Control-Allow-Origin` header, so a browser blocks it. Canvas does not support API calls from other sites' JavaScript; Instructure's community and staff answers say to call it from a server, and tokens are not meant for browser code. Their readers (`src/integrations/school.ts`) are written to run in the Android app or a future server and are tested on parsed responses; the web app shows "Needs the phone app or a server" and offers sample data only.

**Fitbit's status.** Google ended support for the Fitbit Web API on September 30, 2026 and lists November 2, 2026 as the day its endpoints and Fitbit OAuth turn off, answering HTTP 410 ([Google Health API](https://developers.google.com/health/about)). Its replacement, the Google Health API, uses Google OAuth with restricted scopes that need Google's review. The Fitbit connection here follows the Web API and will most likely fail; the screen says so, and its reader can serve the Android app or a server that still has data in that shape. A Google Health API reader is not built.

**Why some sources are files.** Instagram, TikTok, Snapchat and Discord offer no way for an app to read a person's own activity or messages with their permission, and YouTube no longer gives watch history through its API. Steady reads the export each app gives the teen.

**Export layouts read.** The JSON forms, checked against the apps' help pages and known exports. Instagram: `personal_information/.../personal_information.json` and `(your_instagram_activity/)messages/inbox/<thread>/message_N.json` (with Instagram's broken UTF-8 repaired), likes. TikTok: `user_data_tiktok.json` (or `user_data.json`) with "Profile", "Direct Message(s)" and "Activity"/"Your Activity". Snapchat: `json/account.json` and `json/chat_history.json`, both the newer per-conversation layout with `IsSender` and the older "Sent/Received Saved Chat History" lists. Discord: `account/user.json` and `messages/c<id>/messages.json` or the older `messages/<id>/messages.csv`, any capitalisation. YouTube: `.../history/watch-history.json` and `search-history.json`. An HTML export, a missing profile file or an unknown layout imports nothing and says why. Instagram names people by display name, so each conversation's participant list is read: when the owner's name is not among them, or more than one participant has it, the conversation is skipped and counted as unreadable, and the Connect screen says how many. Zip files are read with `fflate` in two streaming passes: the profile files first, then each data file is parsed as soon as it is unpacked and its text dropped. HTML files are never unpacked. One entry over 300 MB is not read, and no more than 1 GB is unpacked from one export; when either cap is hit the import says so, and every week it gives is partial.

**Signals and merges.** New signals: school (late plus missing in a week, higher is worse), late-night activity (share of own actions after midnight, pooled across Drive, YouTube, Instagram, TikTok, Snapchat and Discord), typing speed (lower is worse) and typing corrections (higher is worse). Messages sent from every source add into reaching out; low-mood shares average into tone; sleep and steps from Fitbit and Health Connect average with the phone's own. A merged value is only ever compared with a range learned from the same mix of sources (for example "phone+discord"), so connecting a source starts a new four-week baseline for every signal it joins. The range of the old mix is kept, and comes back if the source is disconnected. A real source that did not fully cover a week is left out of that week's mix; a source that covered the week but lacks one number drops out of that signal's mix for that week. For example, a Fitbit week with steps and no sleep leaves the phone's own sleep, compared with the phone's own range, and an Instagram week with no scored messages leaves the keyboard's tone. Every number is in `src/engine/config.ts`. The new lines show on the teen's Home chart only while a source that gives them is connected.

**Disconnecting** forgets everything that came from the source: its numbers in every past week (the weeks are rebuilt without it), the marks and ranges drawn from them, and the "outside range" state or open question set that rested on them (dropped, not counted as skipped). Safety handling that already happened stays.

**Each flagged item is checked once.** Emails and messages sent in the last 24 hours go through the self-harm check; only the teen's own words, with quoted and forwarded text cut first (in chats only lines starting with ">" are cut, so a line like "From: me" stays). The rules check the time again for every source in one place (`flag()` in `src/engine/rules.ts`): an item flag older than 24 hours, or more than 2 minutes in the future, is logged and goes no further, so an old flag in a file never sends an urgent note. A flag key is a SHA-256 of the platform, the owner, the item's time to the second and a hash of the normalised own words (lower case, straight apostrophes, single spaces); never a list position or a file path, so the same message in a new export, or in a renamed conversation, has the same key. Android flags arrive as opaque ids. The phone keeps a ledger of these keys for 35 days, at most 5000, kept through a disconnect, which is longer than any file's list of flags. A flag reaches the rules with the item's own sent time and a hash of its words; two flags within 2 minutes with the same words count as one message, whichever source each came from (the keyboard and Gmail, say). The trace names the source.

**Complete weeks only.** Each reader marks every week complete or not: the edges of a 28-day window, and any week cut by a cap are partial. An export's window starts at the later of 12 weeks before its newest item and its earliest own item, so no empty weeks are made before the export's own coverage; its first week and the week of its newest item are partial. In the phone file, a week is complete only with all 7 dates and a `generated` time after the week's Sunday, so the week the file was made in is partial. Only complete weeks reach the rules.

**School items.** In Classroom, work with no `dueTime` is due at 23:59 on the teen's own clock; a `dueTime` is UTC, with a missing hour or minute read as 0. Work counts as late only when it was turned in or returned. If the submissions list was cut by the page cap, work with no submission is not counted as missing and every week is partial.

**Fitbit dates.** Fitbit's sleep and step dates are already local dates, so each goes in the week of its own Monday with no time zone step.

**The Android phone file, version 2.** Agreed with the Android app on November 15, 2026; `native/sample/steady_android_v2_sample.json` is read by a test in `src/integrations/android.test.ts`. `kb_messages` is 0 when the keyboard was used and nothing was sent, and null when it was not used that day; the weekly number is the mean over keyboard days times 7, so a short week is not a drop. `kb_correction_rate` is a share from 0 to 1 (corrections over characters plus corrections); a value above 1 is not read. Each flag may carry `"answer": "yes" | "no" | null`, the teen's answer on the phone to "Are you safe right now?". "no" sends the urgent note at once. "yes" holds it, but the flag still counts toward the 7-day and 14-day rules. null, or no answer field, follows the normal rule: 30 minutes from the flag's own time, so a flag already older than that sends the urgent note when the file is read.

**Phone-free hours** follow the exporters: `last_use` belongs to its own date ("23:59" when use ran past midnight), and `first_use` can be night use. A night is measured only when use ended before midnight and the next first use is after 5 a.m., using dated times in the phone's time zone. iPhone files have no clock times, so they never give one.

### Keys

Copy `.env.example` to `.env.local` (gitignored), fill in the keys you have, and restart the dev server. With a key missing, that source's screen says "Not set up yet" and offers "Use sample data", so the demo works with no keys and no network.

**Google (Gmail, Calendar, Classroom, Drive activity).** One OAuth client covers all four.

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project.
2. Under APIs and Services, enable the Gmail API, Google Calendar API, Google Classroom API and Drive Activity API.
3. On the OAuth consent screen, choose External and leave the app in Testing mode. Add the scopes `gmail.readonly`, `calendar.events.readonly`, `classroom.courses.readonly`, `classroom.coursework.me.readonly` and `drive.activity.readonly` (all under `https://www.googleapis.com/auth/`), and add each tester's Google account as a test user (up to 100).
4. Under Credentials, create an OAuth client ID of type Web application. Add `http://127.0.0.1:5210` and `http://localhost:5210` as authorized JavaScript origins.
5. Put the client ID in `VITE_GOOGLE_CLIENT_ID`. No client secret is needed.

Gmail's read scope is restricted: in Testing mode only the listed test users can sign in, and a public launch needs Google's review and security assessment. School Google accounts for students under 18 block unapproved apps until an admin allows them, so testers should use personal accounts (Classroom then needs a class on that account).

**Microsoft 365.** In the [Microsoft Entra admin center](https://entra.microsoft.com/), register an application for "Accounts in any organizational directory and personal Microsoft accounts". Under Authentication, add a Single-page application platform with the redirect URIs `http://localhost:5210/auth.html` and `http://127.0.0.1:5210/auth.html`. Under API permissions, add the delegated Microsoft Graph permissions `Mail.Read` and `Calendars.Read`. Put the Application (client) ID in `VITE_MS_CLIENT_ID`. No secret. Some school tenants need an admin to consent first.

**Fitbit.** At [dev.fitbit.com](https://dev.fitbit.com/apps/new), register an app of OAuth 2.0 application type "Client" with the redirect URL `http://localhost:5210/auth.html`, and put its client ID in `VITE_FITBIT_CLIENT_ID`. See Fitbit's status above: expect it to fail.

**Last.fm.** Create a free API account at https://www.last.fm/api/account/create and put the API key in `VITE_LASTFM_API_KEY`. The teen types their Last.fm username; Steady can't check that the profile is theirs (Last.fm sign-in needs a server-side secret), and the name is used once and not kept. To get Spotify plays into Last.fm, the teen connects Spotify under Settings, then Applications, on last.fm. The screen credits "Music data from Last.fm". Steady does not read Spotify's API, because Spotify's developer policy does not allow building user metrics from listening.

**Canvas and Schoology** need no key here, because the web app can't call them. In a phone app or server: Canvas uses a personal access token from the teen's Account, Settings, Approved Integrations, and the school's Canvas address; Schoology uses the API key and secret from the teen's account (app.schoology.com/api), where the school allows it.

**Offline.** Nothing loads from the network until the teen taps Connect. Google's script (`https://accounts.google.com/gsi/client`) loads on that tap; MSAL is bundled and split into its own file. The second tap opens the sign-in window, so the browser allows it. Microsoft and Fitbit sign-in windows return to `auth.html`, which hands the result back and closes.

### Real and sample

| Real | Sample ("Use sample data") |
| --- | --- |
| Read from the teen's own accounts or files on the teen's phone (this browser) by the readers in `src/integrations/` | The same readers over bundled fixtures in `src/integrations/fixtures/`, shaped like each real API answer and export layout, with no network |
| The rules get the source's own weekly numbers, joined to the demo's weeks by the Monday of the week. The demo's weeks run from November 2, 2026, so a real source mostly fills only the first weeks. The scenario's made-up values for that source are never used | The rules get the scenario's made-up values for that source. Maya: later listening, slower replies and fewer emails, more missing schoolwork, later nights on Drive and YouTube, fewer Discord and Snapchat messages, slower typing and more corrections, in weeks 5 to 8 |
| Real items sent in the last 24 hours that trip the self-harm check go to the rules once each | Sample items never go to the self-harm check |

**The demo clock.** The rules check a real item's time against the demo's clock, which starts on November 2, 2026 and moves by weeks. A real flag reaches the rules only while the demo clock is within a day of the item's real time; otherwise it is logged as too old (or from the future) and goes no further.

The Connect screen shows what the phone kept, in words, with partial weeks marked. The older Spotify history and sleep-and-steps CSV viewer is still under Connect; it shows a file and does not join the rules.

**What leaves the phone.** The transport only sends the schema fields of each event type (`heads_up`, `urgent`, `status`, and the parent's `receipt`), in order, and refuses a malformed event. Nothing from a connected source changes that.

## Files

```
src/engine/   pure TypeScript: types, config, rules, clock, transport, runner, scenarios, notes, tests
src/store/    the driver tab, cross-tab sync, tone model loading
src/teen/     Pair, setup screen, questions, Home and chart, Type, Connect, Are you safe, Help, Settings, Import
src/parent/   Pair (with the second adult, Do Not Disturb and "What Steady misses"), Home, Note, What to say, I can't reach her, other adults
src/demo/     the demo shell, control rail, event log, How we know
src/integrations/  readers for every source, Google, Microsoft and Fitbit sign-in, the zip reader, fixtures, sample data
src/auth/     the page sign-in windows return to (auth.html)
```

The real relay with encryption (two phones on the same Wi-Fi) is not built. See the doc's "What leaves the phone" for the design.

## Credits

Built with Claude Code (Anthropic). The PHQ-8 items are from the published questionnaire by Spitzer, Williams, Kroenke and colleagues, which needs no permission to reproduce. Fonts: Inter and IBM Plex Mono, both under the SIL Open Font License, bundled through Fontsource.
