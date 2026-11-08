import Foundation

/// 다른 앱의 심박 수신 주소로 실시간 심박을 보낸다.
/// 주소 예: https://example.ngrok-free.dev/hr?token=… , 본문: {"bpm": 72}
enum ExternalHeartRate {
    enum SendError: LocalizedError {
        case rejected(status: Int)

        var errorDescription: String? {
            switch self {
            case .rejected(403): "토큰이 틀림 (403)"
            case .rejected(400): "심박 값이 허용 범위 밖 (400)"
            case .rejected(let status): "서버 오류 (\(status))"
            }
        }
    }

    static func request(to url: URL, bpm: Double) -> URLRequest {
        var request = URLRequest(url: url, timeoutInterval: 5)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = Data("{\"bpm\": \(Int(bpm.rounded()))}".utf8)
        return request
    }

    static func send(bpm: Double, to url: URL) async throws {
        let (_, response) = try await URLSession.shared.data(for: request(to: url, bpm: bpm))
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw SendError.rejected(status: status) }
    }
}
