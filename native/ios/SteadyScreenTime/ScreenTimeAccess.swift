// Screen Time permission for the teen's own phone.
//
// .individual means the person on this phone approves it with Face ID or Touch ID. No parent
// account or Family Sharing is involved. Needs the Family Controls capability (entitlement
// com.apple.developer.family-controls).
// https://developer.apple.com/documentation/familycontrols/authorizationcenter/requestauthorization(for:)

import FamilyControls
import Foundation

@MainActor
final class ScreenTimeAccess: ObservableObject {
    @Published private(set) var isApproved = false
    @Published private(set) var problem: String?

    func refresh() {
        let status = AuthorizationCenter.shared.authorizationStatus
        // Newer SDKs add approvedWithDataAccess. Anything past these two counts as approved.
        isApproved = status != .notDetermined && status != .denied
    }

    func request() async {
        do {
            try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
            problem = nil
        } catch {
            problem = "Screen Time access was not turned on. \(error.localizedDescription)"
        }
        refresh()
    }
}
