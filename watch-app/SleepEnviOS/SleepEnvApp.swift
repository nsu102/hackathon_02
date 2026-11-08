import SwiftUI
import UIKit

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        ConnectivityHub.shared.onReceive = { reading in
            Task { await HealthManager.shared.forwardLive(reading) }
        }
        ConnectivityHub.shared.activate()
        Task { await HealthManager.shared.removeObsoleteSettings() }
        return true
    }
}

@main
struct SleepEnvApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
