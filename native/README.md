# Native phone apps

Two small phone apps that collect Stability's phone signals and save them as a file the Stability web app can import. On both phones that means screen time: how long the phone is used each day, and how much of that is between midnight and 5 a.m. On Android it also means sleep and steps from Health Connect, and the Stability keyboard.

**Status.** The Android app builds, and its 72 JVM tests pass. These include tone and self-harm results that match the web app's own code exactly. Its first version worked on an Android 15 emulator: the Health Connect permission flow, the keyboard, the 988 screen and the version 2 export. The review fixes since then have been unit tested but not run on a device. They include the safety question, cursor tracking, message counting, sleep merging and the keyboard notification. Health Connect with real records, and any real phone, have not been tried yet. The iOS app and both extensions build with no warnings in Xcode 27.2 (iOS 27.2 SDK), for iPhone and for the Simulator. In the Simulator the app opens, shows its disclosure, and reports "Screen Time access was not turned on" when asked, because the Simulator cannot grant Screen Time access. Nothing has run on a real iPhone yet. The details are in each app's README.

| Folder | What it is |
| --- | --- |
| [`android/`](android/README.md) | Kotlin app for Android 8 and later: screen time from `UsageStatsManager`, sleep and steps from Health Connect, and the Stability keyboard. |
| [`ios/`](ios/README.md) | Swift sources for an iOS 16 app with two extensions, using Apple's Screen Time API. |
| [`sample/steady_android_v2_sample.json`](sample/steady_android_v2_sample.json) | 28 made-up days in the Android version 2 format, for testing the web app. |
| [`sample/screen_time_android_sample.json`](sample/screen_time_android_sample.json) | The same 28 screen days in the older version 1 format. |

## What each app reads

**Android** reads the times the screen turned on and off, from the phone's own usage log. From those it works out, for each day, the minutes the screen was on and the minutes between midnight and 5 a.m. It also notes when the phone was first and last used. On Android 9 and later it never reads app names. On Android 8 it uses them in memory to pair events and never keeps them.

If the teen connects Health Connect, the Android app also reads sleep sessions and steps. It keeps each night's sleep minutes and bedtime, and each day's steps.

If the teen turns on the Stability keyboard, it scores each message at the end of the message and then drops the words. The scores are the web app's tone model, its self-harm phrase check, and typing rhythm. It keeps daily sums only. A self-harm match opens a full-screen 988 screen and records a random id, the time and the level, never the words. For words short of a plan, that screen first asks "Are you safe right now?", and the answer is kept on the flag. Password, incognito, email, web address and number fields are skipped. While the keyboard is on, an ongoing notification says so.

**iPhone** cannot read exact numbers. Apple shows the teen their week inside a sealed report that cannot be saved or sent. Stability's own code learns only when the day's use passes set lines, such as 3 hours in the day or 30 minutes after midnight. That is all the iPhone file can hold.

Both apps explain this on screen before asking for access.

## What leaves the phone

Nothing, unless the teen chooses to share it. Neither app sends anything over the network. The Android app does not even have the internet permission, and none of its libraries adds it. The teen taps **Save as file**, picks where it goes, and opens it in the Stability web app. The web app reads imported files in the browser and uploads nothing.

The file has one entry per day. The web app works out the weeks, as the Stability phone app would. In the product, no daily or weekly number goes to a parent, and no typed words ever do. A note to a parent can say that phone use changed and for how long, as [docs/parent-alerts.md](../docs/parent-alerts.md) describes.

## The file format

### Android: `"source": "android_usage_stats"`, version 2

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

| Field | Type | Meaning |
| --- | --- | --- |
| `source` | string | Always `"android_usage_stats"`. |
| `version` | int | `2`. Version 1 files have only the first five day fields and no `flags`. |
| `generated` | string | When the file was made, ISO 8601 in UTC, to the second. |
| `days` | array | Up to 28 complete days, oldest first. Today is never included. A day appears if any source has something for it. Every day has every key below. |
| `date` | string | `YYYY-MM-DD`, a calendar day in the phone's time zone. |
| `screen_minutes` | int or null | Minutes the screen was on that day. Null when Android had no screen record for the day. |
| `night_minutes` | int or null | Minutes the screen was on from 00:00 to 05:00 of that date, the night that ends that morning. Never more than `screen_minutes`. |
| `first_use` | `"HH:MM"` or null | First time the screen came on that day. Glances under a minute do not count. |
| `last_use` | `"HH:MM"` or null | Last time the screen went off that day. `"23:59"` when use ran past midnight, and then the next day's `first_use` is `"00:00"`. |
| `sleep_minutes` | int or null | Minutes asleep in the main sleep of the night that ended this morning: the longest Health Connect session ending that date, minus time marked awake or out of bed. |
| `bedtime` | `"HH:MM"` or null | When that sleep started. `"23:40"` on Nov 10 means 23:40 on Nov 9. |
| `steps` | int or null | Steps that day from Health Connect, with overlap between phone and watch removed. |
| `kb_messages` | int or null | Counted messages typed with the Stability keyboard that day. `0` means the keyboard was open but no counted message ended; the other `kb_` fields are then null. `null` means the keyboard was not used that day. A message counts when it was typed in a message field, or sent with the Send key, or the app emptied the field after its own send button. |
| `kb_chars_per_min` | number or null | Characters a minute while typing steadily: characters typed within 2 seconds of the key before, over the time those gaps took. One decimal. |
| `kb_pause_share` | number or null | Share of gaps between keys longer than 2 seconds, 0 to 1. Three decimals. |
| `kb_correction_rate` | number or null | Share of key presses that were delete: corrections / (characters typed + corrections), 0 to 1. Three decimals. |
| `kb_low_mood_share` | number or null | Share of messages that read as low mood by the web app's tone model at its 0.595 threshold, 0 to 1. Three decimals. |
| `flags` | array | Self-harm matches in the last 28 days, today included, oldest first. |
| `flags[].id` | string | 16 hex characters from SHA-256 of random bytes. It says nothing about the words. |
| `flags[].time` | string | ISO 8601 in UTC, to the second. |
| `flags[].level` | string | `"concern"` or `"plan"`, as in `app/src/engine/selfharm.ts`. |
| `flags[].answer` | string or null | The teen's answer to "Are you safe right now?": `"yes"` or `"no"`. `null` when it was not answered, and always for `"plan"`, which shows 911 and 988 at once without asking. |

### iPhone: `"source": "ios_device_activity"`

Same keys. `screen_minutes` and `night_minutes` are strings that name a bucket, and `first_use` and `last_use` are always null.

```json
{
  "source": "ios_device_activity",
  "version": 1,
  "generated": "2026-11-14T17:00:00Z",
  "days": [
    { "date": "2026-11-09", "screen_minutes": ">=180", "night_minutes": "<15", "first_use": null, "last_use": null },
    { "date": "2026-11-10", "screen_minutes": null, "night_minutes": ">=30", "first_use": null, "last_use": null }
  ]
}
```

| Field | Values |
| --- | --- |
| `screen_minutes` | `">=60"`, `">=120"`, `">=180"`, `">=240"`, `">=300"`, `">=360"`, `">=480"`, `"<60"` or null |
| `night_minutes` | `">=15"`, `">=30"`, `">=60"`, `">=120"`, `"<15"` or null |

`">=N"` is the highest line passed that day. `"<N"` means the schedule ended under the lowest line. Null means there is no record. iPhone minutes count time in apps and websites, which is a different measure from Android's screen-on time.

### Notes for the importer

- Weeks start on Monday, as in `app/src/engine/importers.ts`.
- A week counts only with at least 4 days of data, the rule in [docs/parent-alerts.md](../docs/parent-alerts.md).
- A missing day means no data. A day with `0` means the phone was not used, or was off.
- In version 2, read each source's fields on their own. A day can have keyboard numbers and no screen numbers, or the reverse.

## The sample files

`sample/steady_android_v2_sample.json` is made up. It has the same screen days as the version 1 sample, with sleep, steps and keyboard numbers added. From Nov 3, sleep gets shorter and starts after midnight, steps drop, and typing gets slower. Typing also has more pauses and corrections, and more messages read as low mood. Two nights have no sleep record. One day has no keyboard numbers, and Nov 8 has `kb_messages` 0, so both kinds of empty keyboard day can be tested. It has two flags: one answered "yes", one not answered.

`sample/screen_time_android_sample.json` is made up too. It covers Oct 17 to Nov 13, 2026. The first two and a half weeks are a steady routine with almost no use after midnight. School days have about 3 to 4 hours of use, and weekends have more. From Nov 3 use after midnight climbs to 30 to 70 minutes most nights, and use often runs past midnight. It follows the field rules above, so it can be used to test an importer.

## Building

- **Android:** `./gradlew testDebugUnitTest assembleDebug` in `native/android`, with JDK 17 to 21 and Android SDK platform 36, or open the folder in Android Studio. See [android/README.md](android/README.md).
- **iPhone:** Xcode on a Mac with a developer account, and a real iPhone to run it on. The Screen Time API does not work in the Simulator. The Family Controls entitlement must be approved by Apple before App Store release. See [ios/README.md](ios/README.md).
