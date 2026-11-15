# Steady for Android

**Status: built and unit tested; the first version was also smoke-tested on an emulator.** After the review fixes on November 14, 2026, `./gradlew testDebugUnitTest assembleDebug` passed: 72 JVM tests, no failures. The review fixes have not been run on a device or emulator. They are the safety question, cursor tracking, message counting, sleep merging, the notification and targetSdk 36. Before those fixes, these worked on an Android 15 emulator (API 35, Google APIs image):

- The Health Connect permission screen listed Sleep and Steps, and its privacy policy link opened Steady's own policy screen.
- The keyboard typed in Google Messages and capitalized the first letter.
- A message sent with Messages' own send button was scored, and the 988 screen opened from the keyboard. A plan-level message showed the 911 version.
- `keyboard.json` held only sums and random flag ids. A search of the app's files found none of the typed words.
- **Save as file** wrote a version 2 file that parsed with every key.

Not checked on a device:

- Health Connect with real sleep and step records. The emulator had none.
- The keyboard in a real password field. That rule is covered by unit tests only.
- A real phone of any kind.

One Kotlin app for Android 8 (API 26) and later, with three sources. Each one is optional:

1. **Screen time**, from Android's usage log.
2. **Health Connect**: sleep sessions and steps.
3. **The Steady keyboard**: tone, the self-harm check and typing rhythm, scored as the teen types and never stored.

It shows the last 28 days as weeks and saves them as a JSON file the Steady web app can import. The app has no internet permission.

## Screen time

The app calls [`UsageStatsManager.queryEvents`](https://developer.android.com/reference/android/app/usage/UsageStatsManager#queryEvents(long,%20long)).

- **Android 9 and later.** A session runs from `SCREEN_INTERACTIVE` to `SCREEN_NON_INTERACTIVE`.
- **Android 8.** There are no screen events, so a session is the time some app is on screen. App names are compared in memory to pair events and never stored. The screen says when this method was used.
- **Restarts.** `DEVICE_SHUTDOWN` ends an open session. After `DEVICE_STARTUP` anything still open is dropped.

The teen turns on usage access in Settings; the app opens [`ACTION_USAGE_ACCESS_SETTINGS`](https://developer.android.com/reference/android/provider/Settings#ACTION_USAGE_ACCESS_SETTINGS) for them. Android keeps raw events for "a few days", so the app keeps its own daily numbers in `days.json` for 60 days. The oldest day Android still has is usually cut off part way, so it is left out.

## Health Connect

Setup follows [Google's get-started guide](https://developer.android.com/health-and-fitness/guides/health-connect/develop/get-started), with `connect-client` 1.1.0.

- **Permissions.** `READ_SLEEP` and `READ_STEPS`, asked for on Health Connect's own screen through `PermissionController.createRequestPermissionResultContract()`. Nothing is written to Health Connect.
- **Privacy screen.** Health Connect's permission screen links to a privacy policy. `HealthRationaleActivity` answers `ACTION_SHOW_PERMISSIONS_RATIONALE` (Android 13 and lower), and an activity alias answers `VIEW_PERMISSION_USAGE` with the `HEALTH_PERMISSIONS` category (Android 14 and later). The Android 14 path was tested.
- **Not installed or not available.** `getSdkStatus()` decides what the screen shows:
  - `SDK_UNAVAILABLE` covers Android 8, which Health Connect does not support, and phones where it cannot run. The screen says so.
  - `SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED` covers Android 13 and lower without the app, or with an old one. The screen offers **Get Health Connect**, which opens the Play Store.
- **Sleep.** A night belongs to the date it ends, the morning the teen wakes up, the same as `night_minutes`.
  - Sessions from the same source less than 90 minutes apart are merged into one night. The break counts as awake.
  - A session can be the main sleep only if it overlaps 00:00 to 06:00 of the date it ends, or lasts at least 3 hours.
  - The main sleep is the longest of those. A second copy of the same night from another source is left out.
  - A day with only a nap gets `null` for `sleep_minutes` and `bedtime`.

  `sleep_minutes` is the main sleep minus stages marked awake, awake in bed or out of bed. `bedtime` is when it started.
- **Steps.** `aggregateGroupByPeriod` with one-day slices, which removes overlap between a phone and a watch.
- **History.** Health Connect lets an app read up to 30 days before access was first given. That covers the 28 days used here.
- **Disconnect** asks Health Connect to drop Steady's access with `revokeAllPermissions()`. From Android 14 that only takes effect when the app's process ends, so Steady also stops reading at once on its own. **Manage in Health Connect** opens Health Connect's page for Steady.

## The Steady keyboard

An `InputMethodService` with a QWERTY page and a numbers and symbols page. It has shift with caps lock on double tap, delete that repeats while held, space and enter. The globe key moves to the next keyboard, and a long press opens the keyboard picker. Enter shows the field's action, such as Send or Search.

A small 988 key sits above the letters at all times.

**What it keeps in memory.** The message being typed, while the teen types it. Only what this keyboard typed goes in; pasted text does not. It follows the cursor from `onUpdateSelection`, so typing and deleting land where the cursor is, and deleting a selection removes that range. Each of its own edits records where the cursor should land. A late update that matches one of those is not taken as a cursor move. It also remembers the longest the message has been, so words typed and then deleted are still checked.

**When a message ends.**

- Enter, when enter runs an action such as Send or Done, or in a one-line field. In a multi-line field where enter types a newline, the newline is part of the message.
- The field loses focus.
- The app restarts input and the message is no longer just before the cursor. If it is still there, typing carries on as one message.
- The app empties the field itself, as chat apps do after their own send button.
- **A discard:** the field empties right after a delete from this keyboard, or right after a selection, as with select all then delete or cut. A discard is checked for self-harm words but never counted.

**What counts as a message.** A message in a short or long message field always counts. In other watched fields it counts only when it was sent: the Send key, or the app emptying the field. A search box, or a note left by tapping away, does not count. Every watched message still goes through the self-harm check and the tone model, but only counted messages enter the day's sums.

**At the end of a message**, in this order:

1. **The self-harm check, on the main thread.** A port of `app/src/engine/selfharm.ts` with the same `selfharm_phrases.json`. It checks the final text and the longest version of it. On a match it opens the help screen first and turns the keyboard's 988 key red, then saves a flag: a random id, the time, the level, and later the answer. If Android blocks the screen from opening, the red 988 key opens it with one tap.
2. **Tone, on a background thread.** A port of `app/src/engine/tone.ts`, using the web app's own `tone.json`. A message reads as low mood when its score is at or over the model's threshold, 0.595.
3. **Typing rhythm.** Only character keys and delete count. Shift and page keys do not.
   - *Characters a minute* counts characters typed within 2 seconds of the key before, over the time those gaps took.
   - *Pause share* is the share of gaps between keys longer than 2 seconds.
   - *Correction share* is delete presses over all key presses: corrections / (characters typed + corrections), from 0 to 1.
4. **The day's sums**, written last, on one background thread, in order. Counted messages, characters, gaps, pauses, corrections, and messages that read as low mood go into `keyboard.json` in the app's private files, kept 60 days. Sums only, so a day adds up without keeping any message. A day when the keyboard was open but no counted message ended is kept with 0 messages. Every write catches its own errors, so a full disk cannot crash the keyboard.

**The help screen.** For "plan" words it shows 911 and 988 at once. For other self-harm words ("concern") it asks "Are you safe right now?" with Yes and No, with 988 on the same screen the whole time. "No" adds 911. The answer is saved on the flag as `"yes"` or `"no"`, never with any words. The buttons open the dialer or messages with the number filled in; the teen still taps call or send. A screen showing 911 never drops it when a weaker match arrives.

**The notification.** While the Steady keyboard is the chosen keyboard, an ongoing notification says it is on and checking typed words on the phone. From Android 13 Android asks the teen to allow notifications first. The app's keyboard section explains why, with an **Allow the notification** button.

**Fields it skips.** It still types in them, but counts and checks nothing:

- every password variation;
- any field that sets `IME_FLAG_NO_PERSONALIZED_LEARNING`, which incognito browser tabs use;
- email and web address fields, names, postal addresses, search filters;
- all number, phone and date fields.

It watches plain text, short and long message, email subject and web text fields only.

**The model files.** `tone.json` and `selfharm_phrases.json` are copied from `app/` into the APK's assets at build time by the `copyEngineFiles` task, so there is one copy of each in the repo. The build fails if they are missing.

## The export, version 2

```json
{
  "source": "android_usage_stats",
  "version": 2,
  "generated": "2026-11-14T08:00:00Z",
  "days": [
    {
      "date": "2026-11-10",
      "screen_minutes": 271,
      "night_minutes": 52,
      "first_use": "01:32",
      "last_use": "23:59",
      "sleep_minutes": 359,
      "bedtime": "01:03",
      "steps": 6121,
      "kb_messages": 27,
      "kb_chars_per_min": 150.7,
      "kb_pause_share": 0.083,
      "kb_correction_rate": 0.069,
      "kb_low_mood_share": 0.185
    }
  ],
  "flags": [
    { "id": "3f9a1c07d2e84b6a", "time": "2026-11-10T07:42:13Z", "level": "concern", "answer": "yes" }
  ]
}
```

The full field list is in [native/README.md](../README.md). Each day has every key. A source with nothing for that day gives `null`. `kb_messages` is `0` on a day the keyboard was open but no counted message ended, and `null` when the keyboard was not used. Flags cover the last 28 days, today included. A flag's `answer` is `"yes"`, `"no"` or `null` (not answered, or a "plan" flag, which asks nothing). A flag id is SHA-256 of random bytes, so it says nothing about the words. The file holds no text, no app names and no rule ids.

## Build and run

You need JDK 17 to 21 and the Android SDK with platform 36.

```
cd native/android
./gradlew testDebugUnitTest assembleDebug
```

The wrapper downloads Gradle 8.11.1. Versions: Android Gradle Plugin 8.9.3, Kotlin 2.0.21, compileSdk 36, targetSdk 36, minSdk 26, `connect-client` 1.1.0. Health Connect 1.1.0 needs compileSdk 36 and AGP 8.9.1 or newer.

On a phone or emulator:

1. `adb install -r app/build/outputs/apk/debug/app-debug.apk`
2. Usage access: tap **Open usage access settings**, or `adb shell appops set app.steady.screentime GET_USAGE_STATS allow`.
3. The keyboard: tap **Turn on the keyboard** and then **Choose keyboard**, or `adb shell ime enable app.steady.screentime/.SteadyKeyboardService` and `adb shell ime set app.steady.screentime/.SteadyKeyboardService`.
4. Health Connect: tap **Connect Health Connect** and allow Sleep and Steps.
5. On Android 13 and later, tap **Allow the notification** so the keyboard's notice can show.
6. Come back to the app and tap **Save as file**.

**Tests** (JVM, `./gradlew testDebugUnitTest`, 72 in all):

| File | Checks |
| --- | --- |
| `ToneModelTest` | Scores for 82 sentences match `tone.ts` run under Node, within 1e-6. The largest difference seen was 0.0. |
| `SelfHarmCheckTest` | Level and rule id match `selfharm.ts` on all 60 messages in `experiments/exp2_words/test_messages.csv`, and on 22 more |
| `TypingRhythmTest` | Gaps, pauses, speed, corrections, daily sums, the log's JSON and pruning, flag ids |
| `DayAggregationTest` | Which night counts for which date, the main sleep, bedtime across midnight, the 28-day window, the version 2 export with real nulls, weeks |
| `FieldRulesTest` | Skipped fields, incognito, what enter does |
| `ScreenTimeMathTest` | Screen sessions across midnight, short glances, the Android 8 path |
| `HelpScreenTest` | "Are you safe right now?" for concern only, 911 for plan and after "No", the answer kept on the flag |
| `ExportContractTest` | An export and the sample file against the version 2 contract: keys, answers, `kb_messages` 0, shares from 0 to 1 |
| `KeyboardTextTest` | Typing and deleting at the cursor, selections, input restarts, late cursor updates, discards |
| `MessageEndFlowTest` | The help screen opens before anything is saved, deleted words are checked, a failing disk never throws |
| `SleepMergeTest` | Split nights merge, nap-only days stay empty, sources stay apart, the 3-hour rule |
| `EdgeToEdgeTest` | targetSdk 36, and every activity pads for the system bars |
| `KeyboardNoticeTest` | The notification permission from Android 13, the ongoing notice, still no internet permission |
| `MessageCountingTest` | Which messages count, and uncounted ones only marking the day active |

The expected scores come from `tools/make_parity_fixtures.mjs`, which runs the web app's own `tone.ts` and `selfharm.ts` under Node 23.6 or newer and writes `app/src/test/resources/parity_expected.jsonl`. Run it again whenever either web file changes.

## Limits and edge cases

- **Pasted text.** The keyboard scores what it typed. Text pasted or changed by the app is not in its copy, so later edits near it can land a little off.
- **Deleted words are checked.** The self-harm check also reads the longest version of the message, so words typed and then deleted before sending can open the help screen.
- **The red 988 key stays red** after a match until the teen taps it, even if the help screen did open.
- **A newline in a chat app.** Google Messages sets `IME_FLAG_NO_ENTER_ACTION`, so enter types a newline. The message ends when Messages empties the field after its own send button. This was tested.
- **Background launch.** Android allowed the 988 screen to open because the keyboard's window was showing (`BAL_ALLOW_VISIBLE_WINDOW` in the log). A message that ends when focus leaves, after the keyboard has hidden, may be blocked from opening the screen. The flag is still recorded, and the keyboard's 988 key turns red.
- **This app sends no notes.** The answer to "Are you safe right now?" is saved on the flag for the Steady web app. No timer runs here; the 30-minute rule in [docs/parent-alerts.md](../../docs/parent-alerts.md) is the web app's job.
- **The notification** needs the teen to allow notifications on Android 13 and later. From Android 14 the teen can also swipe away an ongoing notification.
- **The phrase list is not validated.** Experiment 2 found it missed 9 of 15 risk messages written by someone who had not seen it.
- **Health Connect "Disconnect"** on Android 14 and later only takes full effect when the app's process ends.
- **Screen on is a different number from Digital Wellbeing's**, which adds up time in each app.

## What a Play Store build would need

[Google Play's stalkerware and monitoring rules](https://support.google.com/googleplay/android-developer/answer/9888380) apply because Steady can send a parent a note.

- **The monitoring flag.** The manifest declares `<meta-data android:name="isMonitoringTool" android:value="child_monitoring" />`, the value [Play's help page](https://support.google.com/googleplay/android-developer/answer/12955211) gives. That page shows it directly under `<manifest>`; here it sits under `<application>`, where the build tools accept `<meta-data>`. The [`<application>` reference](https://developer.android.com/guide/topics/manifest/application-element) also lists an `android:isMonitoringTool` attribute. Check the current Play Console guidance before upload.
- **A persistent notification while the app runs.** The policy's wording is "at all times when the app is running." The keyboard shows an ongoing notification while it is the chosen keyboard. The app's own screen reads screen time and Health Connect only while it is open.
- **Health Connect access declared in Play Console** for Sleep and Steps, with the same privacy policy the app shows.
- **A unique icon**, which the app has, and **disclosure in the store listing** that it monitors phone use, reads typed words on the phone and can alert a parent.
- **A Data safety form and a privacy policy** in Play Console, and a current target API level.
