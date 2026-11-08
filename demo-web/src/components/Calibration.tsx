"use client";
import { useEffect, useState } from "react";
import { CALIBRATION_POINTS, type Features, GazeModel } from "@/lib/gaze";
import type { FocusApi } from "@/hooks/useFocus";

const SETTLE_MS = 700;
const COLLECT_MS = 900;
const MAX_ERROR = 0.16; // 화면 비율 기준 평균 오차가 이보다 크면 다시 하도록

type Phase = { kind: "intro" } | { kind: "point"; index: number } | { kind: "done"; error: number } | { kind: "failed"; message: string };

/** 9개 점을 차례로 바라보게 해서 얼굴 특징 → 화면 좌표 모델을 만든다. */
export function Calibration({ focus, onClose }: { focus: FocusApi; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: "intro" });

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [onClose]);

  async function run() {
    const samples: { f: Features; target: { x: number; y: number } }[] = [];
    for (let i = 0; i < CALIBRATION_POINTS.length; i++) {
      setPhase({ kind: "point", index: i });
      await new Promise((r) => setTimeout(r, SETTLE_MS));
      const got = await focus.collect(COLLECT_MS);
      if (got.length < 8) {
        setPhase({ kind: "failed", message: "얼굴이 잘 보이지 않았어요. 카메라를 정면에 두고 밝은 곳에서 다시 해주세요." });
        return;
      }
      // 점마다 샘플 몇 개를 고르게 써서 떨림에 덜 민감하게
      const step = Math.max(1, Math.floor(got.length / 6));
      for (let k = 0; k < got.length; k += step) samples.push({ f: got[k], target: CALIBRATION_POINTS[i] });
    }
    try {
      const model = new GazeModel().fit(samples);
      if (model.error > MAX_ERROR) {
        setPhase({ kind: "failed", message: "시선 추정 오차가 커요. 머리를 고정하고 눈으로만 점을 따라가며 다시 해주세요." });
        return;
      }
      focus.applyCalibration(model);
      setPhase({ kind: "done", error: model.error });
    } catch (e) {
      setPhase({ kind: "failed", message: e instanceof Error ? e.message : "보정에 실패했어요." });
    }
  }

  const point = phase.kind === "point" ? CALIBRATION_POINTS[phase.index] : null;
  return (
    <div className="fixed inset-0 z-50 bg-night/96 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="시선 보정">
      {point ? (
        <>
          <div key={phase.kind === "point" ? phase.index : -1} className="absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}>
            <span className="absolute inset-0 animate-shrink rounded-full border-2 border-lime" style={{ ["--shrink-ms" as string]: `${SETTLE_MS + COLLECT_MS}ms` }} />
            <span className="absolute inset-[14px] rounded-full bg-lime" />
          </div>
          <p className="absolute inset-x-0 bottom-8 text-center text-sm text-muted">
            머리는 그대로, 눈으로 점을 바라봐 주세요 · {phase.kind === "point" ? phase.index + 1 : 0} / {CALIBRATION_POINTS.length}
          </p>
        </>
      ) : (
        <div className="flex h-full items-center justify-center p-6">
          <div className="max-w-md text-center">
            {phase.kind === "intro" && (
              <>
                <h2 className="font-serif text-4xl">시선 보정</h2>
                <p className="mt-4 text-sm leading-relaxed text-body">
                  화면에 나오는 점 9개를 차례로 바라봐 주세요. 점마다 약 1.6초 걸려요.
                  <br />보정하면 화면 위에 시선 점이 보이고, 질문할 때 <b className="text-ink">보고 있는 쪽</b>을 함께 알려 줘요.
                </p>
                <p className="mt-3 text-xs text-muted">웹캠 기반이라 대략적인 위치예요. 자세가 바뀌면 다시 보정해 주세요.</p>
                <div className="mt-8 flex justify-center gap-3">
                  <button type="button" onClick={run} className="h-11 rounded-full bg-lime px-6 text-sm font-medium text-night hover:bg-lime/85">시작</button>
                  <button type="button" onClick={onClose} className="h-11 rounded-full border border-line-strong px-6 text-sm hover:bg-white/5">취소</button>
                </div>
              </>
            )}
            {phase.kind === "done" && (
              <>
                <h2 className="font-serif text-4xl">보정 완료</h2>
                <p className="mt-4 text-sm text-body">평균 오차는 화면의 약 {Math.round(phase.error * 100)}%예요. 라임색 점이 시선을 따라가요.</p>
                <button type="button" onClick={onClose} className="mt-8 h-11 rounded-full bg-lime px-6 text-sm font-medium text-night hover:bg-lime/85">자료로 돌아가기</button>
              </>
            )}
            {phase.kind === "failed" && (
              <>
                <h2 className="font-serif text-4xl">다시 해볼까요?</h2>
                <p className="mt-4 text-sm text-body">{phase.message}</p>
                <div className="mt-8 flex justify-center gap-3">
                  <button type="button" onClick={run} className="h-11 rounded-full bg-lime px-6 text-sm font-medium text-night hover:bg-lime/85">다시 보정</button>
                  <button type="button" onClick={onClose} className="h-11 rounded-full border border-line-strong px-6 text-sm hover:bg-white/5">닫기</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
