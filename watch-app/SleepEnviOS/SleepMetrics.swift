import Foundation

enum SleepStage {
    case inBed, awake, core, deep, rem, asleepUnspecified

    var isAsleep: Bool {
        switch self {
        case .core, .deep, .rem, .asleepUnspecified: true
        case .inBed, .awake: false
        }
    }
}

struct SleepSegment {
    let start: Date
    let end: Date
    let stage: SleepStage
}

/// 하룻밤의 주 수면 지표. date는 잠에서 깬 날의 현지 날짜다.
struct NightSleep: Codable, Identifiable {
    var id: String { date }
    let date: String
    let sleepOnset: Date
    let wakeTime: Date
    let totalSleepMin: Double
    let timeInBedMin: Double
    let efficiency: Double
    let latencyMin: Double
    let wasoMin: Double
    let coreMin: Double
    let deepMin: Double
    let remMin: Double
}

struct SleepSummary: Codable {
    let nightCount: Int
    let meanTotalSleepMin: Double
    /// 표준편차는 기록이 2일 이상일 때만 값이 있다.
    let sdTotalSleepMin: Double?
    let meanEfficiency: Double
    let meanWasoMin: Double
    let lastNightTotalSleepMin: Double
    let bedtimeSdMin: Double?
}

enum SleepMetrics {
    /// 이보다 긴 공백이 있으면 별도의 수면으로 본다.
    private static let sessionGap: TimeInterval = 90 * 60

    /// 수면 구간을 밤 단위 지표로 묶는다. 같은 날짜에 수면이 여럿이면(낮잠 등) 가장 긴 수면만 쓴다.
    static func nights(from segments: [SleepSegment], calendar: Calendar = .current) -> [NightSleep] {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"

        var longestByDate: [String: NightSleep] = [:]
        for session in sessions(from: segments) {
            guard let night = night(from: session, formatter: formatter) else { continue }
            if let existing = longestByDate[night.date], existing.totalSleepMin >= night.totalSleepMin {
                continue
            }
            longestByDate[night.date] = night
        }
        return longestByDate.values.sorted { $0.date < $1.date }
    }

    /// nights는 날짜 오름차순이어야 한다.
    static func summary(of nights: [NightSleep], calendar: Calendar = .current) -> SleepSummary? {
        guard let last = nights.last else { return nil }
        // 자정을 넘는 취침 시각이 끊기지 않도록 정오 기준 분으로 바꾼다.
        let bedtimes = nights.map { night -> Double in
            let parts = calendar.dateComponents([.hour, .minute], from: night.sleepOnset)
            let minutes = Double((parts.hour ?? 0) * 60 + (parts.minute ?? 0))
            return minutes < 720 ? minutes + 1440 : minutes
        }
        return SleepSummary(
            nightCount: nights.count,
            meanTotalSleepMin: mean(nights.map(\.totalSleepMin)),
            sdTotalSleepMin: standardDeviation(nights.map(\.totalSleepMin)),
            meanEfficiency: mean(nights.map(\.efficiency)),
            meanWasoMin: mean(nights.map(\.wasoMin)),
            lastNightTotalSleepMin: last.totalSleepMin,
            bedtimeSdMin: standardDeviation(bedtimes)
        )
    }

    private static func sessions(from segments: [SleepSegment]) -> [[SleepSegment]] {
        var result: [[SleepSegment]] = []
        var current: [SleepSegment] = []
        var currentEnd = Date.distantPast
        for segment in segments.sorted(by: { $0.start < $1.start }) {
            if !current.isEmpty, segment.start.timeIntervalSince(currentEnd) > sessionGap {
                result.append(current)
                current = []
            }
            currentEnd = current.isEmpty ? segment.end : max(currentEnd, segment.end)
            current.append(segment)
        }
        if !current.isEmpty { result.append(current) }
        return result
    }

    private static func night(from session: [SleepSegment], formatter: DateFormatter) -> NightSleep? {
        let asleep = session.filter(\.stage.isAsleep)
        guard let onset = asleep.map(\.start).min(),
              let wake = asleep.map(\.end).max(),
              let start = session.map(\.start).min(),
              let end = session.map(\.end).max(),
              end > start
        else { return nil }

        let total = unionMinutes(asleep.map { ($0.start, $0.end) })
        let awakeInsideSleep = session
            .filter { $0.stage == .awake }
            .map { (max($0.start, onset), min($0.end, wake)) }
            .filter { $0.0 < $0.1 }
        let timeInBed = end.timeIntervalSince(start) / 60

        func minutes(_ stage: SleepStage) -> Double {
            unionMinutes(session.filter { $0.stage == stage }.map { ($0.start, $0.end) })
        }

        return NightSleep(
            date: formatter.string(from: wake),
            sleepOnset: onset,
            wakeTime: wake,
            totalSleepMin: total,
            timeInBedMin: timeInBed,
            efficiency: total / timeInBed,
            latencyMin: onset.timeIntervalSince(start) / 60,
            wasoMin: unionMinutes(awakeInsideSleep),
            coreMin: minutes(.core),
            deepMin: minutes(.deep),
            remMin: minutes(.rem)
        )
    }

    /// 겹치는 구간을 한 번만 세어 분 단위로 더한다.
    private static func unionMinutes(_ intervals: [(Date, Date)]) -> Double {
        var total: TimeInterval = 0
        var currentEnd = Date.distantPast
        for (start, end) in intervals.sorted(by: { $0.0 < $1.0 }) {
            let from = max(start, currentEnd)
            if end > from { total += end.timeIntervalSince(from) }
            currentEnd = max(currentEnd, end)
        }
        return total / 60
    }

    private static func mean(_ values: [Double]) -> Double {
        values.reduce(0, +) / Double(values.count)
    }

    private static func standardDeviation(_ values: [Double]) -> Double? {
        guard values.count >= 2 else { return nil }
        let average = mean(values)
        let variance = values.reduce(0) { $0 + ($1 - average) * ($1 - average) } / Double(values.count - 1)
        return variance.squareRoot()
    }
}
