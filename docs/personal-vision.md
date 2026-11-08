> 현재 사용하지 않는 준비 경로입니다. 사용자 요청으로 로컬 학습을 중단했으며, 실제 파인튜닝 가중치는 생성되지 않았습니다. 기본 앱은 OpenRouter 추론·프롬프트·화면 맥락 연동을 사용합니다.

# 개인 비전 학습 실험

사용자가 지정한 논문 화면을 보며 질문하는 상황을 위한 별도 LoRA 실험이다. 텍스트 전용 모델 대신 [Qwen3-VL-8B-Instruct](https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct)를 사용한다. 사용자 GPU 서버의 A6000 한 장에서 실행하며 Mac은 인증된 SSH 터널로 연결한다. Mac 단독 오프라인 제품은 아니며 음성 전사·AI TTS는 기존 OpenRouter 설정을 사용한다.

## 데이터

현재 데이터는 사용자가 제공한 PDF를 로컬에서 렌더링하고, 페이지 본문의 근거를 확인한 답에 질문 변형을 더해 만든 작은 실험 세트다. 학습 50개·검증 5개·시험 7개이며 같은 원문 페이지가 분할을 넘지 않는다. 흐린 화면에서 수치를 추측하지 않고 선명한 영역을 요청하는 예제도 있다. 실제 사용자 얼굴·원시 시선·마이크·브라우저 기록은 수집하지 않는다.

합성 데이터·PDF 이미지·사용자 프로필·가중치·상세 응답은 `data/` 또는 GPU 프로젝트 안에만 두며 Git과 소스 ZIP에서 제외한다. 기본 생성은 `training/build_curated_vision.py`의 로컬 근거 검증 경로다. 선택 OpenRouter teacher 경로는 문서 외부 전송 승인을 받은 경우에만 `--allow-remote-document`로 명시적으로 켤 수 있으며 이번 실험에서는 사용하지 않았다.

기본 개인화는 `training/profile.example.json`의 언어·설명 방식·말투 같은 명시적 선호다. 앱은 `data/study-profile.json` 또는 `STUDY_PROFILE_FILE`을 읽어 질문과 함께 전달한다. 시선만으로 이해도나 성향을 추정해 학습시키지 않는다.

## 학습과 평가

`training/vision_data.py`는 이미지 경로 경계·정답 형식·페이지 분리를 검사한다. 모델 입력에 정답이나 평가 근거를 넣지 않는다. 실제 처리기 시험에서 픽셀 입력과 이미지 토큰 마스킹, 답변에만 loss를 주는 구성을 확인했다. 이미지 토큰을 자르지 않도록 최대 토큰 길이의 자동 절단을 끈다. [TRL 공식 VLM 안내](https://huggingface.co/docs/trl/sft_trainer#training-vision-language-models)

`training/train_vision.py`는 언어 모델의 q/v attention projection에만 rank 16 LoRA를 적용한다. 비전 인코더는 고정하고, 기본 실험은 batch 1·누적 4·16 optimizer step이다. 기존 어댑터는 덮어쓰지 않는다. 실행 시 CUDA를 확인하고 환경·실제 step·loss·소요 시간을 기록한다.

`training/evaluate_vision.py`는 동일한 보류 시험 문제로 기본 모델과 어댑터를 비교한다. JSON 형식 준수·필수 사실 문자열 포함률·불분명한 화면에서의 재확인을 기록한다. 문자열 포함률은 의미 정확도나 근거 충실도의 완전한 측정이 아니다. 하나의 논문과 소수 질문만으로 다른 자료의 정확도 개선을 주장하거나 기본 앱을 자동 교체하지 않는다. 상세 답변은 비공개로 검토한다.

## 서빙과 앱 연결

`training/serve_vision.py`는 로컬 가중치와 선택 LoRA를 사용한 Chat Completions 서버다. 인증 키가 필수이고, 인라인 PNG 하나만 받아 외부 이미지 URL은 가져오지 않는다. 프롬프트·이미지·음성을 디스크 로그에 기록하지 않는다. 컨테이너 포트는 서버의 loopback에만 공개하고 Mac에서 SSH 터널로 접속한다.

연결이 준비되면 `scripts/use_personal_model.py`가 `/models`와 전용 키를 확인한 뒤 설명 모델만 변경할 수 있다. 기존 STT·TTS 키는 유지하며 이전 설명 모델로 복원할 수 있다. 앱은 설정 변경 뒤 다시 시작한다. 안정적인 기본 OpenRouter 모델은 별도 평가 없이 자동 교체하지 않는다.

```sh
# GPU 컨테이너 내부: 모델·데이터는 별도 읽기 전용 볼륨으로 연결
python training/smoke_vision.py --model /models/qwen3-vl-8b --data /work/data/vision-pilot
python training/train_vision.py --model /models/qwen3-vl-8b --data /work/data/vision-pilot --output /work/adapters/personal-v1 --max-steps 16 --run
python training/evaluate_vision.py --model /models/qwen3-vl-8b --data /work/data/vision-pilot --adapter /work/adapters/personal-v1 --output /work/data/vision-pilot/evaluation.json

# Mac: 본인 서버에 SSH 터널과 비공개 서빙 키를 준비한 뒤 선택
python3 scripts/use_personal_model.py
python3 scripts/use_personal_model.py --disable
```

서버 시각이 틀린 환경에서는 시스템 시각이나 TLS 검증을 바꾸지 않았다. `download_verified.py`와 `load_public_cuda.py`는 정상 Mac에서 얻은 검증 시각으로 CA 체인·호스트 이름을 검사하고 공개 모델·이미지의 고정 SHA-256도 대조하는 도구다. 개인 PDF를 외부 공개 호스트에 업로드하는 도구가 아니다. 학습 의존성은 검증한 공개 wheel을 이용해 오프라인 설치한다.
