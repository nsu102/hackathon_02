import Foundation
import HealthKit

/// 워크아웃 세션으로 실시간 심박을 받는다. 세션이 도는 동안 앱도 계속 실행된다.
/// 측정용이므로 끝나면 건강 앱에 운동 기록을 남기지 않고 버린다.
final class HeartRateSession: NSObject {
    private let store: HKHealthStore
    private let onHeartRate: @MainActor (Double) -> Void
    private let onError: @MainActor (String) -> Void
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?

    init(
        store: HKHealthStore,
        onHeartRate: @escaping @MainActor (Double) -> Void,
        onError: @escaping @MainActor (String) -> Void
    ) {
        self.store = store
        self.onHeartRate = onHeartRate
        self.onError = onError
    }

    func start() throws {
        let configuration = HKWorkoutConfiguration()
        configuration.activityType = .other
        configuration.locationType = .unknown

        let session = try HKWorkoutSession(healthStore: store, configuration: configuration)
        let builder = session.associatedWorkoutBuilder()
        builder.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: configuration)
        session.delegate = self
        builder.delegate = self
        self.session = session
        self.builder = builder

        let startDate = Date.now
        session.startActivity(with: startDate)
        builder.beginCollection(withStart: startDate) { [weak self] _, error in
            if let error { self?.report(error) }
        }
    }

    func stop() {
        guard let session, let builder else { return }
        self.session = nil
        self.builder = nil
        session.end()
        builder.endCollection(withEnd: .now) { _, _ in
            builder.discardWorkout()
        }
    }

    private func report(_ error: Error) {
        let message = "심박 측정 오류: \(error.localizedDescription)"
        let onError = onError
        Task { @MainActor in onError(message) }
    }
}

extension HeartRateSession: HKLiveWorkoutBuilderDelegate {
    func workoutBuilder(_ builder: HKLiveWorkoutBuilder, didCollectDataOf types: Set<HKSampleType>) {
        let heartRate = HKQuantityType(.heartRate)
        guard types.contains(heartRate),
              let quantity = builder.statistics(for: heartRate)?.mostRecentQuantity()
        else { return }
        let bpm = quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
        let onHeartRate = onHeartRate
        Task { @MainActor in onHeartRate(bpm) }
    }

    func workoutBuilderDidCollectEvent(_ builder: HKLiveWorkoutBuilder) {}
}

extension HeartRateSession: HKWorkoutSessionDelegate {
    func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {}

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        report(error)
    }
}
