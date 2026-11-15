# Stability screen time for iPhone

**Status: builds, not yet run on an iPhone.** On November 14, 2026 the app and both extensions built with no warnings in Xcode 27.2 (iOS 27.2 SDK), for iPhone with signing off and for the Simulator. In the Simulator (iPhone 18 Pro) the app opens, shows its disclosure, and answers "Screen Time access was not turned on" when the button is tapped: the Simulator cannot grant Screen Time access, and the build had no signing team. Threshold events and the report view need a real iPhone with a development team set. **A free Apple ID is not enough:** with a Personal Team, Xcode refuses to sign it with "Personal development teams ... do not support the Family Controls (Development) capability" (seen on November 14, 2026). Running it on any iPhone needs a paid Apple Developer Program team.

Swift source for an iOS 16 app with two extensions, using Apple's Screen Time API.

## What Apple allows

Apple does not let an app read Screen Time numbers directly. There are three pieces, and each sees a different amount.

| Piece | What it sees | What it can do with it |
| --- | --- | --- |
| **SteadyReport**, a Device Activity Report extension | Full usage for the week, hour by hour | Draw it on screen inside the app. Apple runs it in a sandbox that "prevents your extension from making network requests or moving sensitive content outside the extension's address space" ([DeviceActivityReport](https://developer.apple.com/documentation/deviceactivity/deviceactivityreport)). Nothing it sees can be saved or passed back. |
| **SteadyMonitor**, a Device Activity Monitor extension | Only that a schedule ended, or that use passed a line set in advance | Write that fact to a shared App Group. |
| **The app** | Only what SteadyMonitor wrote | Show it and save it as a file. |

So the export holds threshold events only. It cannot hold exact minutes or clock times.

Since iOS 26.4 Apple also has [`DeviceActivityData.activityData(filteredBy:using:)`](https://developer.apple.com/documentation/deviceactivity/deviceactivitydata/activitydata(filteredby:using:)), which can export activity data. It needs a separate entitlement and the `approvedWithDataAccess` status, and on customers' phones it works only in the EU. This app does not use it.

## What it does

1. **Asks for access.** `AuthorizationCenter.shared.requestAuthorization(for: .individual)`. The teen approves it on their own phone with Face ID or Touch ID. No Family Sharing is needed.
2. **Sets two daily schedules** with `DeviceActivityCenter.startMonitoring`:
   - `steady.night`, 00:00 to 05:00, with lines at 15, 30, 60 and 120 minutes.
   - `steady.day`, 00:00 to 23:59, with lines at 60, 120, 180, 240, 300, 360 and 480 minutes.

   Each line is a `DeviceActivityEvent` with no apps, categories or web domains, which [Apple's docs say](https://developer.apple.com/documentation/deviceactivity/deviceactivityevent/init(applications:categories:webdomains:threshold:)) covers all of them. So there is no app picker, and Stability never holds tokens for single apps. The app starts a schedule only if it is not already running, because starting it again resets today's count.
3. **Records lines passed.** SteadyMonitor gets `eventDidReachThreshold` for each line and `intervalDidEnd` when a schedule ends. It saves, for each date, the highest line passed and whether the schedule ended. Night use on Nov 10 between 00:00 and 05:00 counts toward Nov 10, the same as on Android.
4. **Shows the week.** The app embeds `DeviceActivityReport` with hourly segments for the last 7 days. SteadyReport adds the hours into a total for each day and a total for 00:00 to 05:00.
5. **Saves the file.** **Save as file** writes the last 28 complete days with `.fileExporter`, which opens the system Save to Files sheet.

The screen tells the teen all of this in plain words.

## The export

Same keys as the Android file. The minutes are buckets, and the clock times are always `null`.

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

- `">=180"` means use that day passed the 180 minute line and no higher one.
- `"<15"` means the schedule ended without passing the lowest line.
- `null` means Stability has no record, for example because the phone was off when the schedule ended.

Left out: today, the day monitoring started (its count began part way through), and days with no record at all. Keys are written in alphabetical order.

## Limits

- **Apple and Android count different things.** Apple counts the time an app or website is in front. Android counts the time the screen is on. The two numbers will differ.
- **Late callbacks.** The day schedule ends at 23:59. If its last callback arrives after midnight, SteadyMonitor files it under the day before, as long as it arrives before 01:00. A later delay files it under the wrong day.
- **No clock times.** First and last use cannot be known outside SteadyReport.
- **Memory.** Monitor extensions run with a small memory limit, so SteadyMonitor only parses a name and writes a small dictionary.

## Build and run

You need a Mac with Xcode 16 or later and an Apple developer account. You also need a real iPhone on iOS 16 or later with Screen Time turned on.

**Quick way.** `SteadyScreenTime.xcodeproj` is already generated from `project.yml` with [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`, then `xcodegen generate` in this folder after changing `project.yml`). It has the three targets, the extension Info.plists, the entitlements and Swift 5 set. Open it, pick your team under Signing & Capabilities for each target, and run on the iPhone (step 7 below).

**By hand.** If you would rather build the project yourself:

1. In Xcode, create a new iOS App with SwiftUI called `SteadyScreenTime`. Set the deployment target to iOS 16.0.
2. Add a target with **File > New > Target > Device Activity Monitor Extension** called `SteadyMonitor`.
3. Add a target with **File > New > Target > Device Activity Report Extension** called `SteadyReport`.
4. In **Signing & Capabilities**, add **Family Controls** to all three targets. Add **App Groups** to the app and `SteadyMonitor`, with the same group. The `.entitlements` files here show what Xcode should produce. If you use a group other than `group.app.steadyhack.pvslh.screentime`, change `SteadyConfig.appGroup` in `Shared/SteadyShared.swift` to match.
5. Replace the template Swift files with the ones here, then set target membership:
   - `SteadyScreenTime/*.swift`: the app.
   - `SteadyMonitor/DeviceActivityMonitorExtension.swift`: `SteadyMonitor`. The class name matches the template's principal class.
   - `SteadyReport/SteadyReport.swift`: `SteadyReport`. Delete the template's `TotalActivityReport.swift` and `TotalActivityView.swift`.
   - `Shared/SteadyShared.swift`: all three targets.
   - `Shared/ReportContext.swift`: the app and `SteadyReport`.
6. Keep **Swift Language Version** at Swift 5 for all three targets. The report scene did not pass the type check in Swift 6 mode. If Xcode set **Default Actor Isolation** to MainActor, set it to nonisolated for the two extensions.
7. Run on the iPhone, tap **Allow Screen Time access**, and wait a day. Lines show up from the day after setup.

**Use a real iPhone.** Screen Time APIs do not work in the Simulator. Developers on Apple's forums report that the Simulator records no usage, so threshold events never fire ([thread](https://developer.apple.com/forums/thread/746416)), and that the app picker stays empty ([thread](https://developer.apple.com/forums/thread/732949)).

## Before anyone outside the team installs it

The Family Controls entitlement (`com.apple.developer.family-controls`) has to be requested from Apple. Apple's [entitlement page](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.family-controls) says "Before submitting your app to the App Store, you must request permission to use the entitlement", through [this form](https://developer.apple.com/contact/request/family-controls-distribution). Development builds from Xcode run on your own device without that approval. Apple's page names only App Store submission, but TestFlight builds use the same distribution signing, so plan on approval before TestFlight too.
