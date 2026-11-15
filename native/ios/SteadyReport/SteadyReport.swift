// The Device Activity Report extension. It draws the teen's week inside the app.
//
// Apple runs this extension in a sandbox: "This sandbox prevents your extension from making
// network requests or moving sensitive content outside the extension's address space."
// https://developer.apple.com/documentation/deviceactivity/deviceactivityreport
// So the hourly detail below can be shown to the teen. It cannot be saved, exported or
// passed back to the app. That is why the export holds threshold buckets only.

import DeviceActivity
import ExtensionKit
import SwiftUI

@main
struct SteadyReportExtension: DeviceActivityReportExtension {
    var body: some DeviceActivityReportScene {
        WeekReport { days in
            WeekView(days: days)
        }
    }
}

struct ReportDay: Identifiable {
    let id: Date
    var total: TimeInterval = 0
    var night: TimeInterval = 0
}

struct WeekReport: DeviceActivityReportScene {
    let context: DeviceActivityReport.Context = .steadyWeek
    let content: ([ReportDay]) -> WeekView

    // The app asks for hourly segments (see ContentView.weekFilter), so each segment is one hour.
    func makeConfiguration(representing data: DeviceActivityResults<DeviceActivityData>) async -> [ReportDay] {
        let calendar = Calendar.current
        var byDay: [Date: ReportDay] = [:]
        for await device in data {
            for await segment in device.activitySegments {
                let start = segment.dateInterval.start
                let day = calendar.startOfDay(for: start)
                var entry = byDay[day] ?? ReportDay(id: day)
                entry.total += segment.totalActivityDuration
                if calendar.component(.hour, from: start) < 5 {
                    entry.night += segment.totalActivityDuration
                }
                byDay[day] = entry
            }
        }
        return byDay.values.sorted { $0.id < $1.id }
    }
}

struct WeekView: View {
    let days: [ReportDay]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if days.isEmpty {
                Text("No Screen Time data yet.")
                    .foregroundStyle(.secondary)
            }
            ForEach(days) { day in
                HStack(alignment: .firstTextBaseline) {
                    Text(day.id, format: .dateTime.weekday(.abbreviated).day().month(.abbreviated))
                    Spacer()
                    VStack(alignment: .trailing) {
                        Text(Self.duration(day.total))
                        Text("midnight to 5 a.m.: \(Self.duration(day.night))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .padding()
    }

    static func duration(_ seconds: TimeInterval) -> String {
        let minutes = Int((seconds / 60).rounded())
        return minutes >= 60 ? "\(minutes / 60) h \(minutes % 60) min" : "\(minutes) min"
    }
}
