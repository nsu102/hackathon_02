# Study Signal Demo

PDF를 올려 질문하고, 브라우저 안에서 시선을 추적해 집중을 도와주는 체험용 웹입니다. Next.js 16 + Tailwind CSS 4.

## 시작하기

```sh
cd demo-web
npm install          # 설치 뒤 public/vendor에 MediaPipe·pdf.js 실행 파일을 복사합니다
cp .env.example .env.local   # 이미 있으면 건너뛰기
# .env.local의 OPENROUTER_API_KEY 채우기
npm run dev          # http://localhost:3000
```

키가 없어도 PDF 보기와 시선 추적은 동작하고, 질문하면 키를 넣으라는 안내가 나옵니다. 카메라는 `localhost` 또는 HTTPS에서만 켜집니다. Chrome·Edge·Safari 최신 버전에서 사용하세요.

| 환경 변수 | 설명 |
|---|---|
| `OPENROUTER_API_KEY` | OpenRouter 키. 서버(`/api/ask`)에서만 읽고 브라우저로 보내지 않습니다. |
| `OPENROUTER_MODEL` | 답변 모델. 기본 `anthropic/claude-sonnet-5.5` |

## 기능

**PDF 질의**
- PDF는 브라우저에서 pdf.js로 열고 글자를 뽑습니다. 파일은 서버에 올리지 않습니다.
- 질문하면 관련 구절만 골라(글자 2개 단위 겹침 점수, 문서가 작으면 전체) `/api/ask`로 보내고, OpenRouter 답변을 실시간으로 받습니다.
- 답변의 `[p.3]` 근거 표시를 누르면 그 쪽으로 이동합니다. "이거", "여기"는 지금 보는 쪽(보정했으면 시선 아래 쪽)으로 해석합니다.
- 데모 보호: IP당 10분에 30회, 질문 1,000자, 문맥 30,000자, 답변 1,200토큰 제한.

**시선 추적 (브라우저 안 ML)**
- MediaPipe Face Landmarker(`public/models/face_landmarker.task`, Apache-2.0)를 WebAssembly로 실행합니다. 얼굴 478점, 눈 방향 블렌드셰이프, 머리 자세를 씁니다.
- 기본: 카메라를 켜고 화면 가운데를 2초 보면 그 자세를 기준으로 화면을 보는지 판단합니다. 보정이 필요 없습니다.
- 선택: 9점 보정을 하면 릿지 회귀로 화면 위 시선 점을 추정합니다(웹캠 기준 근사치).
- 데스크톱 앱과 같은 기본값: 8초 이탈 시 화면 알림, 20초 시 음성 알림, 2초 복귀 시 해제, "필기·생각 중"으로 1분 유예. 얼굴이 사라지거나 눈을 오래 감아도 알립니다.
- 카메라 영상과 시선 값은 이 탭 밖으로 나가지 않습니다.

심박수는 이번 데모에서 뺐습니다.

## 구조

```
src/app/page.tsx            → components/Workspace.tsx (화면 전체 상태)
src/app/api/ask/route.ts    OpenRouter 스트리밍 프록시
src/components/             Landing, PdfViewer, FocusPanel, Calibration, ChatPanel
src/hooks/useFocus.ts       시선 → 집중 상태·통계·알림
src/lib/gaze.ts             특징 추출, 보정 모델, 카메라·모델 실행
src/lib/pdf.ts, retrieve.ts PDF 글자 추출, 질문 관련 구절 고르기
scripts/copy-vendor.mjs     node_modules → public/vendor 복사 (설치·dev·build 때 자동)
```

## 에셋 출처

- 글꼴 Instrument Serif, Outfit: `product/assets/fonts` (SIL OFL, `src/app/fonts/*-OFL.txt`)
- 로고: `product/assets/study-signal.svg`
- 얼굴 모델: `overlay/assets/face_landmarker.task` (출처·SHA-256은 `public/models/face-landmarker-source.json`)
- 예제 PDF `public/samples/conditional-probability.pdf`: 데모용으로 새로 작성한 조건부 확률 정리
