# 화면 녹화 권한 복구 · v0.12.2

증상: macOS 설정에서 허용하고 재시작해도 화면 권한 오류가 반복된다.

확인한 원인: 개발용 ad-hoc 서명의 designated requirement가 앱 버전의 cdhash에 묶여 있다. 업데이트 전 권한 기록과 현재 앱이 일치하지 않을 수 있다. 이 Mac에는 사용 가능한 Developer ID/Apple Development 서명 인증서가 없었다. 또한 기존 코드는 macOS의 denied 사전 판정에서 getSources 호출을 막아 최초 권한 요청에도 도달하지 못했다.

수정: restricted는 계속 차단하고 denied/미결정에서는 Electron의 정식 화면 캡처 API로 OS 권한 요청을 시도한다. 요청 뒤 granted 상태와 유효한 캡처를 모두 확인해야만 질문을 보낸다. 요청이 8초 안에 돌아오지 않아도 앱 창은 복원하고 늦은 프레임은 사용하지 않는다. 마이크·화면 권한 철회 시 전송 차단도 유지한다.

설정 → 음성 질문 → 권한 확인에서 현재 실행 앱의 버전·위치와 권한 상태를 확인한다. ‘화면 권한 요청·테스트’는 질문이나 마이크 없이 실제 화면 캡처가 되는지만 검사한다. 픽셀은 반환·저장·서버 전송하지 않는다.

허용 상태가 꼬이면 ‘화면 권한 복구’를 사용한다. 설치판에서만 `/usr/bin/tccutil reset ScreenCapture dev.studysignal.mac`을 실행하고 설정을 연 뒤 현재 설치판을 재시작한다. 다른 앱, 카메라, 마이크 권한은 건드리지 않는다. 복구는 권한을 자동 허용하는 작업이 아니며 사용자가 현재 앱을 macOS에서 다시 허용해야 한다. 설정에 오래된 Study Signal 항목이 남으면 해당 항목을 제거하고 /Applications/Study Signal.app을 다시 추가한다.

정식 배포에서 업데이트 간 권한을 유지하려면 같은 개발자 서명 신원을 사용하는 빌드가 필요하다. 식별자만 검사하도록 서명 요구사항을 약화하거나 TCC 데이터베이스를 직접 수정하지 않는다. 현재 ad-hoc 빌드에서 이후 업데이트의 권한 보존을 보장하지 않는다.

검증: 거절 상태에서도 OS 요청 도달, 거절·정책 제한 시 미전송, 허용 후 로컬 캡처 테스트, 응답 지연 시 창 복원, 캡처 후 권한 철회 시 미전송, 앱별 ScreenCapture만 초기화를 단위 시험한다. 실기기 허용/캡처 결과는 qa/release-v0122.json을 따른다.

근거: [Apple: code requirements와 권한 신원](https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements), [Electron desktopCapturer](https://www.electronjs.org/docs/latest/api/desktop-capturer), [권한 상태와 재시작](https://www.electronjs.org/docs/latest/api/system-preferences).

실기기 결과: 사용자 재허용이 시스템에 적용된 뒤 같은 0.12.2 설치판을 재실행했다. 화면 상태 granted, 실제 캡처 2940×1912 성공. 이미지 저장과 모델 호출 없이 확인했다. 허용 후 앱 파일을 재빌드·재서명하지 않았다.
