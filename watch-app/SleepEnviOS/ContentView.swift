import SwiftUI

struct ContentView: View {
    @AppStorage(AppKeys.consent) private var hasConsent = false

    var body: some View {
        if hasConsent {
            MainView()
        } else {
            ConsentView { hasConsent = true }
        }
    }
}

private struct ConsentView: View {
    let onAgree: () -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    section("읽는 데이터", "Apple 건강 앱의 수면 기록, 심박 변이도, 안정 시 심박을 읽어 이 기기와 Apple Watch에만 표시합니다. Apple Watch 기록은 iPhone 건강 앱에 동기화된 것을 사용합니다.")
                    section("외부 전송", "심박 외부 전송 주소를 입력하면, Apple Watch에서 측정 중인 실시간 심박을 그 주소로 보냅니다. 건강 기록은 보내지 않습니다.")
                    section("철회", "앱에서 언제든 동의를 철회해 읽기와 전송을 멈출 수 있습니다. 읽기 권한은 건강 앱에서도 끌 수 있습니다.")
                }
                .padding()
            }
            .safeAreaInset(edge: .bottom) {
                Button(action: onAgree) {
                    Text("동의하고 계속")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .padding()
            }
            .navigationTitle("건강 데이터 동의")
        }
    }

    private func section(_ title: String, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.headline)
            Text(text).foregroundStyle(.secondary)
        }
    }
}

private struct MainView: View {
    @AppStorage(AppKeys.status) private var status = ""
    @AppStorage(AppKeys.nightsCache) private var nightsData = Data()
    @AppStorage(AppKeys.vitalsCache) private var vitalsData = Data()
    @AppStorage(AppKeys.externalHeartRateURL) private var externalURL = ""
    @AppStorage(AppKeys.externalStatus) private var externalStatus = "아직 보내지 않음"
    @ObservedObject private var hub = ConnectivityHub.shared

    private var nights: [NightSleep] {
        (try? JSONDecoder().decode([NightSleep].self, from: nightsData)) ?? []
    }

    private var vitals: VitalSigns? {
        try? JSONDecoder().decode(VitalSigns.self, from: vitalsData)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if nights.isEmpty {
                        Text("Apple Watch 수면 기록 없음")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(nights.reversed()) { night in
                        LabeledContent(night.date) {
                            Text("\(Self.duration(night.totalSleepMin)) · 효율 \(Int((night.efficiency * 100).rounded()))%")
                        }
                    }
                } header: {
                    Text("최근 7일 수면 (Apple Watch)")
                } footer: {
                    Text(status.isEmpty ? "아래로 당기면 다시 읽습니다." : "\(status) · 아래로 당기면 다시 읽습니다.")
                }

                Section("Apple Watch 실시간") {
                    LabeledContent("연결", value: hub.isReachable ? "연결됨" : "연결 안 됨")
                    if let reading = hub.received {
                        LabeledContent("측정", value: reading.isRunning ? "측정 중" : "중지됨")
                        LabeledContent(
                            reading.isSimulated ? "심박 (가상)" : "심박",
                            value: Self.format(reading.heartRateBPM, digits: 0, unit: "bpm")
                        )
                        LabeledContent("움직임", value: Self.format(reading.movementG, digits: 3, unit: "g"))
                        LabeledContent("받은 시각", value: reading.sentAt.formatted(date: .omitted, time: .standard))
                    } else {
                        Text("워치에서 측정을 시작하면 여기에 표시됩니다.")
                            .foregroundStyle(.secondary)
                    }
                }

                Section("최근 신체 신호 (건강 앱)") {
                    vitalRow("심박 변이도", vitals?.hrvMs, digits: 0, unit: "ms")
                    vitalRow("안정 시 심박", vitals?.restingHeartRate, digits: 0, unit: "bpm")
                }

                Section {
                    TextField("https://…/hr?token=…", text: $externalURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    if !externalURL.isEmpty {
                        LabeledContent("상태", value: externalStatus)
                    }
                } header: {
                    Text("심박 외부 전송 주소")
                } footer: {
                    Text("워치에서 측정 중일 때 심박을 약 3초마다 이 주소로 보냅니다. 비워 두면 보내지 않습니다.")
                }

                Button("동의 철회", role: .destructive) {
                    Task { await HealthManager.shared.revokeConsent() }
                }
            }
            .navigationTitle("SleepEnv")
            .refreshable {
                await HealthManager.shared.refresh()
            }
        }
        .task {
            await HealthManager.shared.connect()
        }
    }

    private func vitalRow(_ title: String, _ vital: VitalSigns.Value?, digits: Int, unit: String) -> some View {
        LabeledContent {
            Text(Self.format(vital?.value, digits: digits, unit: unit))
        } label: {
            Text(title)
            Text(vital?.measuredAt.formatted(date: .abbreviated, time: .shortened) ?? "최근 7일 기록 없음")
        }
    }

    private static func format(_ value: Double?, digits: Int, unit: String) -> String {
        guard let value else { return "—" }
        return "\(value.formatted(.number.precision(.fractionLength(digits)))) \(unit)"
    }

    private static func duration(_ minutes: Double) -> String {
        let total = Int(minutes.rounded())
        return "\(total / 60)시간 \(total % 60)분"
    }
}
