# 시선 감지 선택 설치 · v0.11

기본 Mac 앱은 음성 질문·화면 번역·자료 읽기·스크래치패드·TTS를 제공한다. UniGaze 모델·PyTorch·OpenCV는 기본 DMG에 포함하지 않는다.

1. Study-Signal-0.11.0-arm64.dmg로 앱을 설치한다. OpenRouter 키와 음성 권한을 설정하면 바로 사용할 수 있다.
2. 시선이 필요할 때만 Study-Signal-Gaze-arm64-v1.zip을 받는다. ZIP은 압축을 풀지 않고 보관한다.
3. 메뉴 막대 시그널 → 설정 → 시선 감지 설치…에서 ZIP을 선택한다. Python/Homebrew를 별도로 설치할 필요는 없다.
4. 진행률이 완료되면 감지 켜기를 누른다. 카메라 권한과 화면 중앙 기준을 확인한다. 설치만으로 카메라를 켜지는 않는다.

별도 패키지는 약 1.41 GB이며 구성 요소의 설치 공간은 약 2 GB다. 기본 앱은 추가 패키지 파일을 포함하지 않는다. 현재 전달 방식은 별도 ZIP을 받는 방식이며, 앱이 인터넷에서 자동 다운로드하거나 공개 배포 서버에 올리지는 않는다.

기본 DMG는 약 168 MB로 이전 1.61 GB보다 약 89.6% 작아졌다. 큰 시선 패키지는 이 크기에 포함되지 않는다.

## 설치와 데이터

앱 내부의 공개 manifest가 패키지의 파일 크기와 SHA-256을 고정한다. 정확히 일치하는 파일만 풀고 경로 이동·외부 심볼릭 링크·비정상 파일/크기를 거절한다. 임시 위치에서 런타임 self-check를 마친 뒤 교체한다. 취소·실패 시 기존 구성 요소와 학습 데이터/API 키를 유지한다.

설치 위치는 Application Support/Study Signal/components/gaze-v1이다. 다음 실행에서는 작은 설치 marker만 확인하고 모델을 자동 로딩하지 않는다. 설치되지 않은 상태에서 학습을 시작해도 카메라/시선 워커를 자동 실행하지 않는다. 음성 도움은 시선 설치와 독립적이다.

## 검증

- Node 73개 통과, Python 93개 중 91개 통과/기존 SDK 전용 2개 제외.
- 추가 설치 UI 8개: 미설치 안내, 진행률, 중복 시작 방지, 취소/재시도, 완료, 설치만으로 카메라/모델을 켜지 않음, 같은 앱 실행에서 설치 후 새 학습 시작.
- 실제 별도 ZIP을 독립 테스트 경로에 설치하고 self-check·앱 NeuralWorker 방식의 UniGaze-L/MPS float16 준비를 확인했다. 카메라 영상은 사용하지 않았다.
- 기본 설치판에서 시선 미설치 학습 시작·카메라 미시작·패드 저장/복원·공통 투명도를 확인했다.
- 기본 동결 서비스의 self-check에서 gaze_bundled=false를 확인했다. PATH=/usr/bin:/bin에서도 API·PDF 읽기와 실제 OpenRouter 화면+자료 설명(4.70초), 합성 한국어 음성+화면 설명(5.31초)이 작동했다. 사용자 논문 PDF는 전송하지 않았다.

Apple Silicon/macOS 15 이상 개발 빌드이며 Apple 공증은 포함하지 않는다. 사람의 시선 정확도·장시간 오탐률은 이 설치 검증과 별도다.

[기본 서비스](qa/macos-v011-core-runtime.json) · [설치 후 MPS](qa/gaze-addon-installed.json) · [설치 UI](qa/gaze-addon-ui.json) · [실제 기본 앱](qa/native-scratchpad.json)

## 개발 빌드

시선 개발 환경과 공식 모델을 준비한 후 `python scripts/build_gaze_addon.py --freeze-service`로 선택 패키지와 공개 manifest를 만든다. `python scripts/build_macos.py`는 작은 기본 백엔드와 DMG를 만든다. 기본 앱 안에는 manifest만 복사하며 추가 ZIP은 상위 outputs에 따로 둔다. 이후 UI만 바뀌면 --reuse-service를 사용할 수 있다. 소스 실행의 학습 보조 실행.command도 신경망 자동 설치를 하지 않는다.

[배포 크기·서명·추가 패키지 정보](qa/dmg-v011-artifact.json)
