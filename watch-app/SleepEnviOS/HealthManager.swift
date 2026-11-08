import Foundation
import HealthKit

enum AppKeys {
    static let status = "healthStatus"
    static let consent = "healthAndUploadConsent"
    static let nightsCache = "nightsCache"
    static let vitalsCache = "vitalsCache"
    static let externalHeartRateURL = "externalHeartRateURL"
    static let externalStatus = "externalHeartRateStatus"
}

/// 최근 7일 안의 가장 최근 값. 자주 갱신되지 않으므로 측정 시각과 함께 보여준다.
struct VitalSigns: Codable {
    struct Value: Codable {
        let value: Double
        let measuredAt: Date
    }
    let hrvMs: Value?
    let restingHeartRate: Value?
}

/// 건강 앱에서 수면과 신체 신호를 읽어 아이폰과 워치에 보여주고,
/// 워치에서 측정 중인 심박을 외부 주소로 전달한다. 건강 기록 자체는 어디에도 업로드하지 않는다.
actor HealthManager {
    static let shared = HealthManager()

    private let store = HKHealthStore()
    private let defaults = UserDefaults.standard
    private let sleepType = HKCategoryType(.sleepAnalysis)
    private var lastPublishedToWatch: String?

    /// 대시보드 서버로 업로드하던 이전 버전의 설정(서버 주소와 토큰 등)과 백그라운드 전달을 정리한다.
    func removeObsoleteSettings() async {
        let obsolete = ["serverURL", "liveStatus", "syncStatus", "healthAuthRequested", "hasUploaded"]
        let anchors = defaults.dictionaryRepresentation().keys.filter { $0.hasPrefix("anchor.") }
        guard (obsolete + anchors).contains(where: { defaults.object(forKey: $0) != nil }) else { return }
        (obsolete + anchors).forEach(defaults.removeObject(forKey:))
        try? await store.disableAllBackgroundDelivery()
    }

    /// 권한을 요청하고(최초 1회만 창이 뜸) 화면에 보여줄 값을 읽는다.
    func connect() async {
        guard hasConsent else { return }
        guard HKHealthStore.isHealthDataAvailable() else {
            setStatus("이 기기에서는 HealthKit을 사용할 수 없음")
            return
        }
        do {
            try await store.requestAuthorization(toShare: [], read: [
                sleepType,
                HKQuantityType(.heartRateVariabilitySDNN),
                HKQuantityType(.restingHeartRate),
            ])
            await refresh()
        } catch {
            setStatus("HealthKit 권한 오류: \(error.localizedDescription)")
        }
    }

    func refresh() async {
        guard hasConsent else { return }
        await refreshVitals()
        do {
            let nights = try await recentWatchNights()
            defaults.set(try? JSONEncoder().encode(nights), forKey: AppKeys.nightsCache)
            setStatus(nights.isEmpty ? "최근 7일 Apple Watch 수면 기록 없음" : "최근 7일 수면 기록 \(nights.count)일 확인")
        } catch {
            setStatus("건강 데이터를 읽지 못함: \(error.localizedDescription)")
        }
    }

    /// 동의를 철회하면 외부 전송을 멈추고 기기에 저장한 값을 지운다.
    /// 이미 외부 주소로 보낸 심박은 지워지지 않는다.
    func revokeConsent() async {
        defaults.set(false, forKey: AppKeys.consent)
        defaults.removeObject(forKey: AppKeys.nightsCache)
        defaults.removeObject(forKey: AppKeys.vitalsCache)
        defaults.removeObject(forKey: AppKeys.externalStatus)
        defaults.removeObject(forKey: AppKeys.status)
        // 워치에 남은 수면 정보도 지운다.
        publishToWatch(message: "동의 철회됨", lastNight: nil)
    }

    /// 지나간 실시간 값은 쓸모가 없으므로 실패해도 다시 보내지 않는다.
    func forwardLive(_ reading: WatchReading) async {
        let address = (defaults.string(forKey: AppKeys.externalHeartRateURL) ?? "")
            .trimmingCharacters(in: .whitespaces)
        // 앱을 다시 켤 때 받은 예전 값은 현재 심박처럼 보내지 않는다.
        guard hasConsent, !address.isEmpty, reading.isRunning, let bpm = reading.heartRateBPM,
              Date.now.timeIntervalSince(reading.sentAt) < 10
        else { return }
        guard let url = URL(string: address), url.scheme != nil else {
            defaults.set("주소 형식 오류", forKey: AppKeys.externalStatus)
            return
        }
        do {
            try await ExternalHeartRate.send(bpm: bpm, to: url)
            defaults.set("\(Int(bpm.rounded())) bpm 전송됨", forKey: AppKeys.externalStatus)
        } catch {
            defaults.set("실패: \(error.localizedDescription)", forKey: AppKeys.externalStatus)
        }
    }

    private var hasConsent: Bool { defaults.bool(forKey: AppKeys.consent) }

    private func refreshVitals() async {
        let vitals = VitalSigns(
            hrvMs: await latest(.heartRateVariabilitySDNN, unit: .secondUnit(with: .milli)),
            restingHeartRate: await latest(.restingHeartRate, unit: HKUnit.count().unitDivided(by: .minute()))
        )
        defaults.set(try? JSONEncoder().encode(vitals), forKey: AppKeys.vitalsCache)
    }

    /// 조회에 실패하거나 기록이 없으면 nil을 돌려준다.
    private func latest(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit) async -> VitalSigns.Value? {
        let predicate = HKQuery.predicateForSamples(withStart: Date.now.addingTimeInterval(-7 * 86_400), end: nil)
        let newestFirst = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        return await withCheckedContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: HKQuantityType(identifier), predicate: predicate,
                limit: 1, sortDescriptors: [newestFirst]
            ) { _, samples, _ in
                let value = (samples?.first as? HKQuantitySample).map {
                    VitalSigns.Value(value: $0.quantity.doubleValue(for: unit), measuredAt: $0.startDate)
                }
                continuation.resume(returning: value)
            }
            store.execute(query)
        }
    }

    /// 최근 7일 안에 깬 수면을 Apple Watch 기록만으로 계산한다.
    private func recentWatchNights() async throws -> [NightSleep] {
        let now = Date.now
        let cutoff = now.addingTimeInterval(-7 * 86_400)
        // 7일 경계에 걸친 수면이 잘리지 않도록 하루 더 넉넉히 읽는다.
        let predicate = HKQuery.predicateForSamples(withStart: cutoff.addingTimeInterval(-86_400), end: now)
        let samples: [HKSample] = try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: sleepType, predicate: predicate,
                limit: HKObjectQueryNoLimit, sortDescriptors: nil
            ) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: samples ?? [])
                }
            }
            store.execute(query)
        }
        let segments: [SleepSegment] = samples.compactMap { sample in
            guard let category = sample as? HKCategorySample,
                  sample.sourceRevision.productType?.hasPrefix("Watch") == true,
                  let stage = Self.stage(category.value)
            else { return nil }
            return SleepSegment(start: sample.startDate, end: sample.endDate, stage: stage)
        }
        return SleepMetrics.nights(from: segments).filter { $0.wakeTime >= cutoff }
    }

    private func setStatus(_ message: String) {
        defaults.set(message, forKey: AppKeys.status)
        let nights = defaults.data(forKey: AppKeys.nightsCache)
            .flatMap { try? JSONDecoder().decode([NightSleep].self, from: $0) }
        publishToWatch(message: message, lastNight: nights?.last)
    }

    private func publishToWatch(message: String, lastNight: NightSleep?) {
        // 내용이 바뀔 때만 워치로 보낸다.
        let signature = "\(message)|\(lastNight?.date ?? "")|\(lastNight?.totalSleepMin ?? -1)"
        guard signature != lastPublishedToWatch else { return }
        lastPublishedToWatch = signature
        let status = PhoneStatus(
            message: message,
            lastNightDate: lastNight?.date,
            lastNightSleepMin: lastNight?.totalSleepMin,
            sentAt: .now
        )
        Task { @MainActor in ConnectivityHub.shared.send(status) }
    }

    private static func stage(_ value: Int) -> SleepStage? {
        switch HKCategoryValueSleepAnalysis(rawValue: value) {
        case .inBed: .inBed
        case .awake: .awake
        case .asleepCore: .core
        case .asleepDeep: .deep
        case .asleepREM: .rem
        case .asleepUnspecified: .asleepUnspecified
        default: nil
        }
    }
}
