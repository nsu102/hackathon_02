import SwiftUI

/// 각 센서가 실제로 값을 주는지 확인하는 점검 화면.
struct SensorCheckView: View {
    @StateObject private var monitor = SensorMonitor()
    @ObservedObject private var hub = ConnectivityHub.shared

    var body: some View {
        List {
            phoneSection
            row("심박", monitor.heartRateBPM, "bpm", digits: 0)
            row("움직임", monitor.movementG, "g", digits: 3)
            Text(monitor.status)
                .font(.footnote)
                .foregroundStyle(.secondary)
            Button(monitor.isRunning ? "중지" : "측정 시작") {
                monitor.isRunning ? monitor.stop() : monitor.start()
            }
            #if DEBUG
            Toggle("가상 심박 (테스트)", isOn: $monitor.useSimulatedHeartRate)
                .disabled(monitor.isRunning)
            #endif
        }
    }

    private var phoneSection: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(hub.isReachable ? "아이폰 연결됨" : "아이폰 연결 안 됨")
                .font(.footnote.weight(.semibold))
            if let phone = hub.received {
                if let minutes = phone.lastNightSleepMin {
                    let total = Int(minutes.rounded())
                    Text("최근 수면 \(total / 60)시간 \(total % 60)분")
                }
                Text(phone.message)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else {
                Text("받은 정보 없음")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func row(_ title: String, _ value: Double?, _ unit: String, digits: Int) -> some View {
        LabeledContent(title) {
            Text(value.map { "\($0.formatted(.number.precision(.fractionLength(digits)))) \(unit)" } ?? "—")
        }
    }
}
