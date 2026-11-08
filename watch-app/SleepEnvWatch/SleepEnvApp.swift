import SwiftUI

@main
struct SleepEnvApp: App {
    init() {
        ConnectivityHub.shared.activate()
    }

    var body: some Scene {
        WindowGroup {
            SensorCheckView()
        }
    }
}
