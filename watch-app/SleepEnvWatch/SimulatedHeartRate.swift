import Foundation

/// 센서 없이 전송 경로를 시험하기 위한 가상 심박. 건강 앱에는 저장하지 않는다.
/// 평소 75 bpm 근처에서 오르내리고, 가끔 짧게 올라간다.
@MainActor
final class SimulatedHeartRate {
    private var timer: Timer?
    private var bpm = 72.0
    private var spikeSecondsLeft = 0

    func start(onValue: @escaping @MainActor (Double) -> Void) {
        stop()
        onValue(bpm)
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                onValue(self.next())
            }
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    private func next() -> Double {
        if spikeSecondsLeft == 0, Int.random(in: 0..<60) == 0 {
            spikeSecondsLeft = 15
        }
        let target = spikeSecondsLeft > 0 ? 105.0 : 75.0
        spikeSecondsLeft = max(0, spikeSecondsLeft - 1)
        bpm += (target - bpm) * 0.15 + Double.random(in: -2...2)
        bpm = min(120, max(60, bpm))
        return bpm
    }
}
