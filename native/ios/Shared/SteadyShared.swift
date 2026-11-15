// Shared by all three targets: the app, SteadyMonitor and SteadyReport.
// Foundation only, so the monitor extension stays small.

import Foundation

enum SteadyConfig {
    /// Use your own App Group ID here and in the .entitlements files of the app and SteadyMonitor.
    static let appGroup = "group.app.steadyhack.pvslh.screentime"

    static let nightActivity = "steady.night"
    static let dayActivity = "steady.day"

    /// Lines for use between 00:00 and 05:00, in minutes.
    static let nightThresholds = [15, 30, 60, 120]
    /// Lines for use across the whole day, in minutes.
    static let dayThresholds = [60, 120, 180, 240, 300, 360, 480]

    static let exportDays = 28
}

enum ThresholdKind: String {
    case night
    case day

    init?(activityName: String) {
        switch activityName {
        case SteadyConfig.nightActivity: self = .night
        case SteadyConfig.dayActivity: self = .day
        default: return nil
        }
    }

    var thresholds: [Int] {
        switch self {
        case .night: return SteadyConfig.nightThresholds
        case .day: return SteadyConfig.dayThresholds
        }
    }
}

/// Event names look like "night.30" or "day.180".
enum ThresholdName {
    static func make(_ kind: ThresholdKind, minutes: Int) -> String {
        "\(kind.rawValue).\(minutes)"
    }

    static func parse(_ raw: String) -> (kind: ThresholdKind, minutes: Int)? {
        let parts = raw.split(separator: ".")
        guard parts.count == 2,
              let kind = ThresholdKind(rawValue: String(parts[0])),
              let minutes = Int(parts[1]) else { return nil }
        return (kind, minutes)
    }
}

/// What the monitor extension learned about one day. No app names, no exact minutes.
struct DayRecord: Codable, Equatable {
    var nightEnded = false
    var nightMax: Int?
    var dayEnded = false
    var dayMax: Int?
}

enum DayKey {
    /// Gregorian on purpose, so a phone set to another calendar still writes 2026-11-14.
    static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        return calendar
    }

    static func string(for date: Date, calendar: Calendar = DayKey.calendar) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /// The day a monitor callback belongs to.
    ///
    /// The day schedule ends at 23:59, and the system can deliver its last callbacks a little
    /// late. No day line can be reached before 01:00, because the lowest is 60 minutes and the
    /// schedule starts at 00:00. So an end or threshold callback for the day schedule that
    /// arrives before 01:00 belongs to the day before. A delay of more than an hour would
    /// still be filed under the wrong day. Night callbacks all fall between 00:00 and a little
    /// after 05:00, so they keep today's date.
    static func forCallback(kind: ThresholdKind, now: Date, calendar: Calendar = DayKey.calendar) -> String {
        var date = now
        if kind == .day, calendar.component(.hour, from: now) < 1,
           let dayBefore = calendar.date(byAdding: .day, value: -1, to: now) {
            date = dayBefore
        }
        return string(for: date, calendar: calendar)
    }
}

/// Records in the shared App Group. The monitor extension writes; the app reads.
final class RecordStore {
    private let defaults: UserDefaults
    private static let recordsKey = "steady.records"
    private static let partialDaysKey = "steady.partialDays"

    init?(suiteName: String = SteadyConfig.appGroup) {
        guard let defaults = UserDefaults(suiteName: suiteName) else { return nil }
        self.defaults = defaults
    }

    func all() -> [String: DayRecord] {
        guard let data = defaults.data(forKey: Self.recordsKey),
              let records = try? JSONDecoder().decode([String: DayRecord].self, from: data) else { return [:] }
        return records
    }

    func update(_ day: String, _ change: (inout DayRecord) -> Void) {
        var records = all()
        var record = records[day] ?? DayRecord()
        change(&record)
        records[day] = record
        // Keep about two months. Keys sort as dates.
        for old in records.keys.sorted().dropLast(60) {
            records[old] = nil
        }
        if let data = try? JSONEncoder().encode(records) {
            defaults.set(data, forKey: Self.recordsKey)
        }
    }

    /// Days when monitoring started part way through. Their lines are incomplete, so they are not exported.
    var partialDays: Set<String> {
        get { Set(defaults.stringArray(forKey: Self.partialDaysKey) ?? []) }
        set { defaults.set(newValue.sorted(), forKey: Self.partialDaysKey) }
    }
}

/// One day in the export file. Same keys as the Android file, but the minutes are buckets.
struct ExportDay: Encodable, Equatable {
    let date: String
    /// ">=180" means the day passed the 3 hour line. "<60" means the day ended under the lowest line.
    let screenMinutes: String?
    /// ">=30" means 30 minutes or more between 00:00 and 05:00. "<15" means under the lowest line.
    let nightMinutes: String?

    enum CodingKeys: String, CodingKey {
        case date
        case screenMinutes = "screen_minutes"
        case nightMinutes = "night_minutes"
        case firstUse = "first_use"
        case lastUse = "last_use"
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(date, forKey: .date)
        // encode(_:forKey:) with an Optional writes null. encodeIfPresent would drop the key.
        try container.encode(screenMinutes, forKey: .screenMinutes)
        try container.encode(nightMinutes, forKey: .nightMinutes)
        // The Screen Time API gives Steady no clock times outside the report extension.
        try container.encodeNil(forKey: .firstUse)
        try container.encodeNil(forKey: .lastUse)
    }
}

struct ExportFileBody: Encodable {
    let source = "ios_device_activity"
    let version = 1
    let generated: String
    let days: [ExportDay]
}

enum Export {
    static func bucket(highest: Int?, ended: Bool, lowest: Int) -> String? {
        if let highest { return ">=\(highest)" }
        if ended { return "<\(lowest)" }
        return nil
    }

    /// The last 28 complete days, oldest first. Today, partial days and days with nothing are left out.
    static func days(records: [String: DayRecord], partialDays: Set<String>, today: Date,
                     calendar: Calendar = DayKey.calendar) -> [ExportDay] {
        (1...SteadyConfig.exportDays).reversed().compactMap { back -> ExportDay? in
            guard let date = calendar.date(byAdding: .day, value: -back, to: today) else { return nil }
            let key = DayKey.string(for: date, calendar: calendar)
            guard !partialDays.contains(key), let record = records[key] else { return nil }
            let screen = bucket(highest: record.dayMax, ended: record.dayEnded, lowest: SteadyConfig.dayThresholds[0])
            let night = bucket(highest: record.nightMax, ended: record.nightEnded, lowest: SteadyConfig.nightThresholds[0])
            if screen == nil && night == nil { return nil }
            return ExportDay(date: key, screenMinutes: screen, nightMinutes: night)
        }
    }

    static func json(days: [ExportDay], generated: Date) throws -> Data {
        let body = ExportFileBody(generated: ISO8601DateFormatter().string(from: generated), days: days)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        return try encoder.encode(body)
    }
}
