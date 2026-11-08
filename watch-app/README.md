# SleepEnv — Apple Watch 심박 측정 앱

Apple Watch에서 실시간 심박을 재고, iPhone 앱이 그 값을 심박 수집 서버의 `POST /hr`로 보내는 앱입니다. Study Signal 데스크톱 앱이 서버에서 최신 심박을 읽는 방식은 `docs/heart-server.md`에 있습니다.

## 구성

| 폴더 | 내용 |
|---|---|
| `SleepEnvWatch/` | 워치 앱. 워크아웃 세션으로 실시간 심박을 읽고(`HeartRateSession`), 움직임(CoreMotion)과 함께 약 3초마다 iPhone으로 보냄 |
| `SleepEnviOS/` | iPhone 앱. 워치 값을 받아 외부 주소로 전송(`ExternalHeartRate`), 건강 앱의 최근 7일 수면·심박 변이도·안정 시 심박 표시 |
| `Shared/` | 워치 ↔ iPhone 통신(WatchConnectivity, `ConnectivityHub`) |

## 데이터 흐름

```
Apple Watch ──(3초마다, WatchConnectivity)──▶ iPhone ──(POST {"bpm": 72})──▶ 외부 주소 /hr?token=…
```

- 워치에서 **측정 시작**을 누른 동안만 보냅니다. 10초보다 오래된 값은 보내지 않습니다.
- iPhone 앱의 **심박 외부 전송 주소** 칸에 `https://…/hr?token=…`을 넣으면 전송하고, 비워 두면 보내지 않습니다. 토큰은 코드에 넣지 않고 앱에서 입력합니다.
- 응답: 403은 토큰 오류, 400은 심박이 허용 범위(20–250) 밖. 결과가 앱의 "상태"에 표시됩니다.
- 수면·HRV·안정 시 심박 같은 건강 기록은 화면에만 표시하고 외부로 보내지 않습니다.

## 실행

요구 사항: Xcode 16 이상, iOS 17 / watchOS 10 이상.

1. `SleepEnv.xcodeproj`를 엽니다. (`project.yml`을 고쳤다면 `xcodegen generate`로 프로젝트를 다시 만듭니다.)
2. 실기기에 설치하려면 `project.yml`의 `DEVELOPMENT_TEAM`에 Apple Developer Team ID를 넣습니다.
3. 시뮬레이터: 짝지어진 iPhone + Apple Watch 시뮬레이터를 고르고 `SleepEnv` 스킴을 실행합니다.

### 가상 심박 (테스트용)

시뮬레이터는 실제 심박이 잘 안 나오므로, Debug 빌드 워치 앱에 **가상 심박 (테스트)** 스위치가 있습니다. 시뮬레이터에서는 기본으로 켜져 있고, 75 bpm 근처에서 움직이다 가끔 105 bpm까지 오릅니다. iPhone 앱에는 "심박 (가상)"으로 표시되고, 외부 전송도 실제 값과 같은 형식으로 갑니다. Release 빌드에서는 스위치가 없고 가상 심박이 동작하지 않습니다.

## 확인한 것 / 남은 것

- 시뮬레이터에서 워치 → iPhone → 외부 주소 전송까지 확인했습니다(가상 심박).
- 실기기에서는 아직 확인하지 않았습니다. 특히 측정을 멈춘 뒤 워치가 심박 측정을 바로 멈추는지 확인이 필요합니다.
