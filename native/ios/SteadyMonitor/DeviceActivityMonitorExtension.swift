// The Device Activity Monitor extension. iOS wakes it when a schedule ends, and when phone use
// passes one of the lines set in Monitoring.swift. It never sees app names or exact minutes.
// All it learns is "the line was passed", and it writes that to the App Group.
//
// Callbacks: https://developer.apple.com/documentation/deviceactivity/deviceactivitymonitor
// Keep this extension small. It runs with a tight memory limit.

import DeviceActivity
import Foundation

// The class name matches the principal class in the Xcode template's Info.plist.
// The overrides are marked nonisolated so the target still builds if Xcode sets the
// "Default Actor Isolation" build setting to MainActor.
class DeviceActivityMonitorExtension: DeviceActivityMonitor {

    nonisolated override init() {
        super.init()
    }

    nonisolated override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        guard let kind = ThresholdKind(activityName: activity.rawValue) else { return }
        let day = DayKey.forCallback(kind: kind, now: Date())
        RecordStore()?.update(day) { record in
            switch kind {
            case .night: record.nightEnded = true
            case .day: record.dayEnded = true
            }
        }
    }

    nonisolated override func eventDidReachThreshold(_ event: DeviceActivityEvent.Name, activity: DeviceActivityName) {
        super.eventDidReachThreshold(event, activity: activity)
        guard let (kind, minutes) = ThresholdName.parse(event.rawValue) else { return }
        let day = DayKey.forCallback(kind: kind, now: Date())
        RecordStore()?.update(day) { record in
            switch kind {
            case .night: record.nightMax = max(record.nightMax ?? 0, minutes)
            case .day: record.dayMax = max(record.dayMax ?? 0, minutes)
            }
        }
    }
}
