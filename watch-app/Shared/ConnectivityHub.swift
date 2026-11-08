import Foundation
import WatchConnectivity

/// 워치 → 아이폰: 현재 측정값. 값이 없는 센서는 nil이다.
struct WatchReading: Codable {
    let isRunning: Bool
    let heartRateBPM: Double?
    /// 테스트용 가상 심박이면 true. 실제 측정값과 구분해 표시한다.
    let isSimulated: Bool
    let movementG: Double?
    let sentAt: Date
}

/// 아이폰 → 워치: 건강 데이터 읽기 상태와 최근 수면.
struct PhoneStatus: Codable {
    let message: String
    let lastNightDate: String?
    let lastNightSleepMin: Double?
    let sentAt: Date
}

#if os(iOS)
typealias OutgoingMessage = PhoneStatus
typealias IncomingMessage = WatchReading
#else
typealias OutgoingMessage = WatchReading
typealias IncomingMessage = PhoneStatus
#endif

private let payloadKey = "payload"

/// 아이폰 앱과 워치 앱 사이의 메시지 통로.
/// 상대가 깨어 있으면 바로 보내고, 아니면 최신 값만 남겨 두었다가 상대가 켜질 때 전달한다.
@MainActor
final class ConnectivityHub: NSObject, ObservableObject {
    static let shared = ConnectivityHub()

    @Published private(set) var received: IncomingMessage?
    @Published private(set) var isReachable = false
    var onReceive: ((IncomingMessage) -> Void)?

    private var latest: OutgoingMessage?

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    func send(_ message: OutgoingMessage) {
        latest = message
        flush()
    }

    private func flush() {
        guard WCSession.isSupported(),
              WCSession.default.activationState == .activated,
              let latest,
              let data = try? JSONEncoder().encode(latest)
        else { return }

        let payload = [payloadKey: data]
        guard WCSession.default.isReachable else {
            updateContext(payload)
            return
        }
        WCSession.default.sendMessage(payload, replyHandler: nil) { [weak self] _ in
            Task { @MainActor in self?.updateContext(payload) }
        }
    }

    private func updateContext(_ payload: [String: Data]) {
        do {
            try WCSession.default.updateApplicationContext(payload)
        } catch {
            print("WatchConnectivity 전달 실패: \(error.localizedDescription)")
        }
    }

    private func apply(_ data: Data?) {
        guard let data, let message = try? JSONDecoder().decode(IncomingMessage.self, from: data) else { return }
        // 바로 보낸 메시지와 남겨 둔 값의 도착 순서가 바뀌어도 오래된 값으로 되돌리지 않는다.
        if let received, received.sentAt > message.sentAt { return }
        received = message
        onReceive?(message)
    }
}

extension ConnectivityHub: WCSessionDelegate {
    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        let context = session.receivedApplicationContext[payloadKey] as? Data
        let reachable = session.isReachable
        Task { @MainActor in
            self.isReachable = reachable
            self.apply(context)
            self.flush()
        }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        let reachable = session.isReachable
        Task { @MainActor in
            self.isReachable = reachable
            if reachable { self.flush() }
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        let data = message[payloadKey] as? Data
        Task { @MainActor in self.apply(data) }
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        let data = applicationContext[payloadKey] as? Data
        Task { @MainActor in self.apply(data) }
    }

    #if os(iOS)
    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}

    nonisolated func sessionDidDeactivate(_ session: WCSession) {
        // 사용자가 다른 워치로 바꾸면 새 워치와 다시 연결한다.
        session.activate()
    }
    #endif
}
