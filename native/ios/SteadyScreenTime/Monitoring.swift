// Sets up the two daily schedules that wake SteadyMonitor.
//
// An event with no apps, categories or web domains covers all of them: "If your app didn't
// specify any applications, categories, or web domains, the event includes all applications,
// categories, and web domains."
// https://developer.apple.com/documentation/deviceactivity/deviceactivityevent/init(applications:categories:webdomains:threshold:)
// So no app picker is needed, and Steady never holds tokens for single apps.

import DeviceActivity
import Foundation

enum Monitoring {
    static func startIfNeeded(now: Date = Date()) throws {
        let center = DeviceActivityCenter()
        let running = Set(center.activities.map(\.rawValue))

        // Calling startMonitoring again replaces the schedule, and use from before the call
        // is not counted for today. So only start what is not already running.
        // https://developer.apple.com/documentation/deviceactivity/deviceactivitycenter/startmonitoring(_:during:events:)
        var started = false
        if !running.contains(SteadyConfig.nightActivity) {
            try center.startMonitoring(
                DeviceActivityName(SteadyConfig.nightActivity),
                during: daily(endHour: 5, endMinute: 0),
                events: events(.night)
            )
            started = true
        }
        if !running.contains(SteadyConfig.dayActivity) {
            // 00:00 to 23:59, the longest daily window that does not wrap past midnight.
            try center.startMonitoring(
                DeviceActivityName(SteadyConfig.dayActivity),
                during: daily(endHour: 23, endMinute: 59),
                events: events(.day)
            )
            started = true
        }

        // Today's lines started counting part way through, so today is left out of the export.
        if started, let store = RecordStore() {
            store.partialDays.insert(DayKey.string(for: now))
        }
    }

    private static func daily(endHour: Int, endMinute: Int) -> DeviceActivitySchedule {
        DeviceActivitySchedule(
            intervalStart: DateComponents(hour: 0, minute: 0),
            intervalEnd: DateComponents(hour: endHour, minute: endMinute),
            repeats: true
        )
    }

    private static func events(_ kind: ThresholdKind) -> [DeviceActivityEvent.Name: DeviceActivityEvent] {
        var events: [DeviceActivityEvent.Name: DeviceActivityEvent] = [:]
        for minutes in kind.thresholds {
            let name = DeviceActivityEvent.Name(ThresholdName.make(kind, minutes: minutes))
            events[name] = DeviceActivityEvent(threshold: DateComponents(hour: minutes / 60, minute: minutes % 60))
        }
        return events
    }
}
