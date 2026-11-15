// Shared by the app and SteadyReport. The app asks for a report by this name, and the report
// extension draws the scene that has the same name.

import DeviceActivity
import SwiftUI

extension DeviceActivityReport.Context {
    static let steadyWeek = Self("Stability week")
}
