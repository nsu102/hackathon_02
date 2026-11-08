import CoreMotion
import Foundation
import HealthKit

/// 측정 중 실시간 심박과 움직임을 읽어 아이폰으로 보낸다.
/// 움직임은 심박 상승이 운동 때문인지 구분하는 데 쓴다.
@MainActor
final class SensorMonitor: ObservableObject {
    @Published private(set) var heartRateBPM: Double?
    @Published private(set) var movementG: Double?
    @Published private(set) var isRunning = false
    @Published private(set) var status = "대기 중"
    /// 시뮬레이터에는 심박 센서가 없으므로 기본으로 켠다.
    #if targetEnvironment(simulator)
    @Published var useSimulatedHeartRate = true
    #else
    @Published var useSimulatedHeartRate = false
    #endif
    private(set) var isSimulatingHeartRate = false
    private let simulatedHeartRate = SimulatedHeartRate()

    private let healthStore = HKHealthStore()
    private let motionManager = CMMotionManager()
    private var publishTimer: Timer?
    private var heartRateSession: HeartRateSession?

    func start() {
        guard !isRunning else { return }
        isRunning = true
        status = "측정 중"
        #if DEBUG
        if useSimulatedHeartRate {
            isSimulatingHeartRate = true
            status = "측정 중 (가상 심박)"
            simulatedHeartRate.start { [weak self] bpm in self?.heartRateBPM = bpm }
        }
        #endif
        publishToPhone()
        publishTimer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.publishToPhone() }
        }
        startMotion()
        guard !isSimulatingHeartRate else { return }
        Task {
            await requestHealthAccess()
            startHeartRate()
        }
    }

    func stop() {
        isRunning = false
        status = "대기 중"
        motionManager.stopDeviceMotionUpdates()
        publishTimer?.invalidate()
        publishTimer = nil
        heartRateSession?.stop()
        heartRateSession = nil
        simulatedHeartRate.stop()
        isSimulatingHeartRate = false
        // 멈춘 뒤에는 오래된 값이 현재 값처럼 보이지 않게 지운다.
        heartRateBPM = nil
        movementG = nil
        publishToPhone()
    }

    private func startHeartRate() {
        guard isRunning, heartRateSession == nil else { return }
        let session = HeartRateSession(
            store: healthStore,
            onHeartRate: { [weak self] bpm in self?.heartRateBPM = bpm },
            onError: { [weak self] message in self?.status = message }
        )
        do {
            try session.start()
            heartRateSession = session
        } catch {
            status = "심박 측정 오류: \(error.localizedDescription)"
        }
    }

    private func publishToPhone() {
        ConnectivityHub.shared.send(WatchReading(
            isRunning: isRunning,
            heartRateBPM: heartRateBPM,
            isSimulated: isSimulatingHeartRate,
            movementG: movementG,
            sentAt: .now
        ))
    }

    private func startMotion() {
        guard motionManager.isDeviceMotionAvailable else {
            status = "모션 센서 없음 (시뮬레이터에서는 정상)"
            return
        }
        motionManager.deviceMotionUpdateInterval = 1
        motionManager.startDeviceMotionUpdates(to: .main) { [weak self] motion, _ in
            guard let a = motion?.userAcceleration else { return }
            let magnitude = (a.x * a.x + a.y * a.y + a.z * a.z).squareRoot()
            MainActor.assumeIsolated { self?.movementG = magnitude }
        }
    }

    private func requestHealthAccess() async {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        do {
            try await healthStore.requestAuthorization(
                toShare: [HKObjectType.workoutType()],
                read: [HKQuantityType(.heartRate)]
            )
        } catch {
            status = "HealthKit 오류: \(error.localizedDescription)"
        }
    }
}
