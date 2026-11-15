import DeviceActivity
import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    @StateObject private var access = ScreenTimeAccess()
    @State private var rows: [ExportDay] = []
    @State private var note: String?
    @State private var exporting = false
    @State private var file = JSONFile(data: Data())

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Steady can see how long you use your phone each day, and how much of that is between midnight and 5 a.m.")
                    Text("The week below is drawn inside a sealed area that Apple provides. Nothing in that area can be saved or sent, even by Steady.")
                    Text("What Steady can save is smaller. It notes when your use that day passes a set line: 1, 2, 3, 4, 5, 6 or 8 hours in the day, and 15, 30, 60 or 120 minutes between midnight and 5 a.m. It never learns which apps you used.")
                    Text("This app sends nothing. The lines leave your phone only if you save the file and share it yourself.")
                    Text("Steady is linked to a parent. A note to them can say that your phone use changed, and for how long. It never includes these numbers.")
                }

                Section("Screen Time access") {
                    if access.isApproved {
                        Label("Screen Time access is on.", systemImage: "checkmark.circle")
                    } else {
                        Button("Allow Screen Time access") {
                            Task {
                                await access.request()
                                startMonitoring()
                            }
                        }
                    }
                    if let problem = access.problem {
                        Text(problem).foregroundStyle(.red)
                    }
                }

                if access.isApproved {
                    Section("Your last 7 days") {
                        DeviceActivityReport(.steadyWeek, filter: Self.weekFilter())
                            .frame(minHeight: 360)
                    }

                    Section("Lines passed, last 28 days") {
                        if rows.isEmpty {
                            Text("Nothing yet. The first full day shows up the day after setup.")
                                .foregroundStyle(.secondary)
                        }
                        ForEach(rows, id: \.date) { row in
                            VStack(alignment: .leading) {
                                Text(row.date).font(.headline)
                                Text("Day: \(Self.words(row.screenMinutes))")
                                Text("Midnight to 5 a.m.: \(Self.words(row.nightMinutes))")
                            }
                        }
                    }

                    Section {
                        Button("Save as file") { prepareFile() }
                            .disabled(rows.isEmpty)
                    }
                }

                if let note {
                    Section { Text(note) }
                }
            }
            .navigationTitle("Steady screen time")
        }
        .onAppear {
            access.refresh()
            startMonitoring()
            loadRows()
        }
        .fileExporter(
            isPresented: $exporting,
            document: file,
            contentType: .json,
            defaultFilename: "steady-screen-time-ios"
        ) { result in
            switch result {
            case .success: note = "Saved."
            case .failure(let error): note = "Could not save the file. \(error.localizedDescription)"
            }
        }
    }

    private func startMonitoring() {
        guard access.isApproved else { return }
        do {
            try Monitoring.startIfNeeded()
        } catch {
            note = "Could not start counting. \(error.localizedDescription)"
        }
    }

    private func loadRows() {
        guard let store = RecordStore() else {
            note = "The App Group is not set up, so no lines can be read."
            return
        }
        rows = Export.days(records: store.all(), partialDays: store.partialDays, today: Date())
    }

    private func prepareFile() {
        loadRows()
        do {
            file = JSONFile(data: try Export.json(days: rows, generated: Date()))
            exporting = true
        } catch {
            note = "Could not build the file. \(error.localizedDescription)"
        }
    }

    /// Today and the six days before it, in hourly pieces so the report can pick out 00:00 to 05:00.
    static func weekFilter(now: Date = Date()) -> DeviceActivityFilter {
        let calendar = Calendar.current
        let start = calendar.date(byAdding: .day, value: -6, to: calendar.startOfDay(for: now)) ?? now
        return DeviceActivityFilter(
            segment: .hourly(during: DateInterval(start: start, end: now)),
            users: .all,
            devices: .init([.iPhone])
        )
    }

    static func words(_ bucket: String?) -> String {
        guard let bucket else { return "no record" }
        if bucket.hasPrefix(">="), let minutes = Int(bucket.dropFirst(2)) {
            return "\(length(minutes)) or more"
        }
        if bucket.hasPrefix("<"), let minutes = Int(bucket.dropFirst(1)) {
            return "under \(length(minutes))"
        }
        return bucket
    }

    private static func length(_ minutes: Int) -> String {
        minutes >= 60 && minutes % 60 == 0 ? "\(minutes / 60) h" : "\(minutes) min"
    }
}

/// The export, as a document the system "Save to Files" sheet can write.
struct JSONFile: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }

    var data: Data

    init(data: Data) {
        self.data = data
    }

    init(configuration: ReadConfiguration) throws {
        data = configuration.file.regularFileContents ?? Data()
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}
