# Study Signal v0.10 구조

```
카메라 → MediaPipe 얼굴 정렬 → 같은 Mac의 UniGaze-L/MPS 워커
  ├─ ScreenPresence: 시선·머리 방향 + 짧은 현재 기준 → 화면 응시/이탈/unknown
  │    → FocusController: 8/20/2/90초 → 시각 알림/OS 음성/집계 이벤트
  └─ 선택 ScreenGazeModel: 9점 개인 회귀 + 5점 검증 → 실험 좌표
       → 검증된 계수만 로컬 저장, 재실행 시 5점 검증

전역 음성 단축키 → native 고정 캡처(자체 창 숨김)
  → WebM/Opus → 명시적 보내기 → 전체 선택 모니터 또는 수동 크롭
  → 로컬 context-help → OpenRouter STT → 의도 분기(번역/요약/질문) → 기존 Vision 설명
  → 좌상단 ScratchpadStore 결과 블록 + 우하단 완료 버블/선택 TTS

메뉴 막대 Tray → 제한된 app:action → 설정/감지/음소거/휴식
```

`screen-presence.mjs`는 픽셀 보정과 독립적이다. 첫 안정 구간의 각도 중앙값을 기준으로 하고 이탈 중에는 자동으로 새 기준을 만들지 않는다. 원시 좌표가 없다고 unknown으로 강제하지 않지만 얼굴/눈 품질·지연·위치 변화는 unknown으로 분리한다. 기본 각도 임계값은 초기 제품 설정이며 실측 성능이 아니다.

`native-voice.cjs`는 캡처/녹음 요청 상태·세션·20초/60초 기한을 관리한다. 현재 UI는 단축키 입력을 사용한다. 키보드 경로는 uiohook과 손쉬운 사용 권한을 요구하며 내부 버튼 IPC는 호환용으로 남아 있다. 캡처·음성은 요청 동안 메모리에서만 유지한다. DIP와 이미지 픽셀은 `dipToPixels`로 구분한다.

`tray.cjs`는 macOS 템플릿 이미지와 컨텍스트 메뉴를 만들고, 원시 센서 없이 6상태 집계만 받는다. `preload.cjs`의 app:action은 정해진 명령만 전달한다. 창 닫기는 숨김, 명시적 메뉴 종료는 모델/백엔드/키 훅을 정리한다. backgroundThrottling을 끄고 숨겨진 동안에도 감지 타이밍을 유지한다.

`last_hour/context_help.py`는 voice 입력을 전사한 뒤 텍스트와 캡처를 설명 모델에 전달한다. `target.selection=screen`은 정밀 시선 보정 ID를 요구하지 않는다. 기존 text screen-help/assist API는 호환용으로 유지하며 메인 UI에서는 사용하지 않는다. 음성·이미지 프롬프트를 로그/학습 예시에 저장하지 않는다.

Watch 수집 서버는 별도 경로다. 기본 앱은 OpenRouter를 사용하며, 개인 비전 학습 경로는 중단했으며 현재 추론에 사용하지 않는다. API 키·로컬 인증 토큰은 main/서버에만 두고 renderer에 노출하지 않는다.


v0.8 설치판: `runtime.cjs`가 앱 리소스(서비스·모델)와 쓰기 가능한 Application Support(개인 .env·기록·Chromium 저장소)를 분리한다. `scripts/bundled_service.py`는 PyInstaller 독립 바이너리 진입점이다. OpenRouter용 공개 CA 인증서와 Torchvision stable 연산 파일을 포함한다. `connection-ui.mjs`는 공개 연결 상태만 읽고, 입력한 키는 저장 IPC 후 비우며 localStorage에 저장하지 않는다. DMG 빌드는 개인 .env·기록을 복사하지 않는다.

`bubbles.cjs`는 focusable=false 투명 창을 선택 모니터 workArea 우하단에 둔다. `bubble-preload.cjs`는 고정 동작과 높이 변경만 전달한다. 캡처 중 suppress와 자체 창 숨김으로 버블이 이미지에 들어가지 않게 한다. 큰 창은 설정·기록·자료 관리용이다.

자료 선택 → frozen `extract-material` → `materials.py` 로컬 추출 → `materials-ui.mjs` 로컬 텍스트 보관 → `/study/sessions/:id/materials` 세션 갱신. 질문 시작 때 세션 자료를 복사해 전사 문장·고정 캡처와 함께 Vision 모델에 전달한다. 원본 파일은 서버에 복사하지 않는다.

음성 읽기: `speech.mjs`의 세대 번호·중단 상태 → 인증된 `/study/speech` → `speech.py` → OpenRouter Gemini TTS PCM → 검증된 WAV → renderer Blob 재생. 키는 서버만 보관한다. 취소 후 응답은 버리고 Blob URL을 해제한다. 글 답변은 음성 생성과 독립적으로 표시한다.

## 좌상단 스크래치패드

`scratchpad.cjs`는 선택 모니터 workArea의 좌상단 +20 DIP에 별도 투명 창을 만든다. `showInactive`로 타 앱 입력 포커스를 빼앗지 않으며 메모를 클릭하면 편집할 수 있다. 자체 캡처 제외 창 목록에 포함한다. 학습 목록과 동시에 겹치지 않게 전환한다.

`scratchpad-store.cjs`는 data/scratchpad에 0600 JSON 메모/결과를 저장한다. 이전 버전의 파일 복사본은 호환용 저장소에만 보존한다. 원자적 교체·상한·안전한 파일 ID를 사용하고 중단된 요청은 완료로 복원하지 않는다. IPC는 실제 패드 webContents와 고정 URL을 검사한다. 모델/메모 텍스트는 textContent로 표시한다.

`document_help.py`는 전사된 번역/요약 의도를 분리하고 현재 캡처의 읽을 수 있는 범위로 프롬프트를 제한한다. 번역·요약 출력의 문자열 계약을 검사해 artifact를 반환한다. 요청 시작의 pending 블록을 완료/실패 상태로 바꾸며 취소된 응답은 화면에 적용하지 않는다. 패드에는 파일 업로드 경로가 없다. 기존 학습 세션의 material을 음성 모델 프롬프트에 사용하고, 제한된 scratchpad-context IPC는 자료 이름·목표·자료 존재 여부만 패드에 표시한다.

index.html과 scratchpad.html은 study-theme.css를 공유한다. study-opacity 저장소 변경 이벤트로 패드 불투명도도 갱신한다.
