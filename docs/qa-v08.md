# v0.8 시나리오 검증

환경: Apple M4, macOS 15.6.1, 1470×956 DIP / Retina 2×. 직접 작성한 확률 문제, 합성 한국어 음성, 코드 37이 들어 있는 테스트 PDF만 외부 모델에 보냈다. 사용자 화면이나 얼굴 영상은 테스트 자료로 저장하지 않았다.

| 시나리오 | 확인 결과와 범위 |
|---|---|
| 브라우저에서 “이거 어렵네, 알려줘” | 합성 음성의 실제 WebM/Opus 녹음 → 시작 시점 화면 표시 → 명시적 보내기 → 답변 버블 IPC. 모의 네이티브 브리지 UI 통과 |
| 질문과 동시에 화면+PDF 참고 | 동결 서비스의 실제 OpenRouter 호출에서 PDF에만 있는 코드 37과 화면에만 있는 확률 1/2를 모두 확인. 약 4.25초 |
| 음성+화면+자료 | 실제 OpenRouter STT→Vision 약 5.46초. 한국어 전사와 분모 4 설명 수신. 답변은 확률 의미를 설명했으나 불필요한 오타 언급도 있어 출력 품질 보장은 아님 |
| 녹음 취소·최대 시간·키 해제 실패 | 자동 전송하지 않고 폐기. 키 반복·세션 변경·권한 실패는 단위 시험 |
| 무음·전사 실패 | 설명 모델 호출 차단. 서버 계약 시험 |
| 읽기·이탈·깜빡임·얼굴 가림·휴식·필기·질문 | 합성 신호로 8/20/2/90초 전이와 예외 확인. 실제 사용자 응시·이탈 전환 보고도 있음. 정량 정확도나 10분 오탐률은 미측정 |
| 버블이 답변·잔소리를 표시 | 별도 창의 동의·보내기·자료 개수·해제 유예·안전한 텍스트·370px 레이아웃 통과. 캡처 중 자체 창 숨김/복원 단위 시험 |
| Retina·음수 모니터 원점 | DIP/픽셀 변환, 선택 영역, 버블 위치 단위·UI 시험 통과. 여러 실제 외장 모니터 시험은 남음 |
| 파일 추가·삭제·잘못된 자료 | PDF/TXT/MD/DOCX 추출, CP949, 크기 제한·빈 문서·암호/스캔 안내 시험. 원본 대신 텍스트 저장 |
| 최종 DMG | hdiutil 체크섬·ad-hoc 서명 검사 통과. 읽기 전용 마운트에서 외부 Python 없는 PATH로 API·PDF·MPS 모델 실행 확인 |
| 실제 macOS 버블·메뉴 아이콘 | DMG 앱에서 우하단 bounds와 focusable=false, visible=true 확인. 메뉴 막대 template=true, 1×/2× 등록 확인 |

자동 시험: Node 56개 통과. Python 71개 실행 중 69개 통과·기존 OpenAI SDK 전용 2개 제외. Chrome 메인 UI 17개 흐름·버블 UI 8개 시나리오 통과, JavaScript 오류 0. 제품·설치 페이지도 1440/1024/768/390 너비의 8개 화면에서 이미지·모달·오버플로 검사를 통과했다.

실제 권한 거절/철회, 사람의 마이크→OS 화면 캡처→전역 키 해제 전체 흐름, 장시간 정상 학습 오탐률은 완료로 표시하지 않는다. 컴퓨터 제어 도구가 비정상 장시간 응답 지연을 일으켜 추가 네이티브 클릭 검증을 중단했다. 운영체제 보안 설정은 바꾸지 않았다. 실제 앱 실행과 네이티브 창 메타데이터, 합성 미디어·화면 UI 시험은 각각 별도 증거다.

재현 명령은 프로젝트 루트에서 실행한다. UI 시험에는 Playwright와 시스템 Chrome, 네트워크 실호출에는 본인의 OpenRouter 키가 필요하다.

```sh
npm run check --prefix overlay
npm test --prefix overlay
LAST_HOUR_BROWSER_TESTS=1 .gaze-venv/bin/python -m unittest discover -s tests -v
.gaze-venv/bin/python tests/browser_ui_qa.py
.gaze-venv/bin/python tests/bubble_ui_qa.py
```

근거: `docs/qa/browser-qa.json`, `bubble-ui.json`, `macos-runtime.json`, `macos-dmg-runtime.json`, `native-dmg.json`. 과거 버전의 시험 기록은 `study-validation.md`에 남긴다.
