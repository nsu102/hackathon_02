"use client";
import type { FocusApi, FocusStatus } from "@/hooks/useFocus";

const LABEL: Record<FocusStatus, { title: string; detail: string; tone: "lime" | "muted" | "alert" }> = {
  off: { title: "카메라 꺼짐", detail: "카메라를 켜면 화면을 보고 있는지 확인해요. 영상은 이 탭 밖으로 나가지 않아요.", tone: "muted" },
  loading: { title: "모델 준비 중", detail: "얼굴 모델을 브라우저에 불러오고 있어요.", tone: "muted" },
  baseline: { title: "화면 가운데를 2초 바라봐 주세요", detail: "지금 자세를 기준으로 화면을 보는지 판단해요.", tone: "muted" },
  focused: { title: "화면 응시 중", detail: "잘하고 있어요. 이대로 한 단락씩 읽어봐요.", tone: "lime" },
  pending: { title: "이탈 확인 중", detail: "잠깐 움직이는 건 괜찮아요. 8초가 넘으면 알려 드릴게요.", tone: "muted" },
  away: { title: "화면 밖을 보고 있어요", detail: "자료로 돌아와 다음 한 줄만 읽어봐요.", tone: "alert" },
  noface: { title: "얼굴이 보이지 않아요", detail: "자리를 비웠거나 카메라 각도가 바뀌었어요.", tone: "alert" },
  drowsy: { title: "눈을 감고 있어요", detail: "졸리면 5분만 쉬었다가 돌아와도 좋아요.", tone: "alert" },
  grace: { title: "필기·생각 중", detail: "1분 동안은 알림을 멈춰요.", tone: "muted" },
  error: { title: "카메라를 켜지 못했어요", detail: "", tone: "alert" },
};

function time(sec: number) {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function FocusPanel({ focus, videoRef, onCalibrate }: { focus: FocusApi; videoRef: React.RefObject<HTMLVideoElement | null>; onCalibrate: () => void }) {
  const { status, stats, running, calibrated } = focus;
  const label = LABEL[status];
  const pct = stats.trackedSec > 3 ? Math.round((stats.focusedSec / stats.trackedSec) * 100) : null;
  const dot = label.tone === "lime" ? "bg-lime" : label.tone === "alert" ? "bg-alert" : "bg-faint";

  return (
    <section className="rounded-2xl border border-line bg-surface p-4" aria-labelledby="focus-title">
      <div className="flex items-start gap-4">
        <div className="relative aspect-[4/3] w-28 shrink-0 overflow-hidden rounded-xl bg-raised sm:w-32">
          <video ref={videoRef} className={`h-full w-full -scale-x-100 object-cover transition-opacity ${running ? "opacity-100" : "opacity-0"}`} muted playsInline aria-label="내 카메라 미리보기" />
          {!running && (
            <svg viewBox="0 0 24 24" className="absolute inset-0 m-auto h-7 w-7 fill-none stroke-faint" strokeWidth={1.5} aria-hidden>
              <path d="M15 10l5-3v10l-5-3M3 7h12v10H3z" strokeLinejoin="round" />
            </svg>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              {status === "focused" && <span className="absolute inline-flex h-full w-full animate-ping-slow rounded-full bg-lime/70" />}
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dot}`} />
            </span>
            <h2 id="focus-title" className="truncate text-sm font-medium" aria-live="polite">{label.title}</h2>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted">{status === "error" ? focus.error : label.detail}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {running ? (
              <button type="button" onClick={focus.stop} className="h-8 rounded-full border border-line-strong px-3 text-xs hover:bg-white/5">카메라 끄기</button>
            ) : (
              <button type="button" onClick={focus.start} disabled={status === "loading"} className="h-8 rounded-full bg-lime px-3 text-xs font-medium text-night hover:bg-lime/85 disabled:opacity-60">카메라 켜기</button>
            )}
            {running && status !== "loading" && status !== "baseline" && (
              <>
                <button type="button" onClick={onCalibrate} className="h-8 rounded-full border border-line-strong px-3 text-xs hover:bg-white/5">{calibrated ? "다시 보정" : "시선 보정 (선택)"}</button>
                <button type="button" onClick={focus.resetBaseline} className="h-8 rounded-full px-2 text-xs text-muted hover:text-ink">기준 다시 잡기</button>
              </>
            )}
          </div>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4">
        <div>
          <dd className="font-serif text-3xl leading-none">{pct === null ? "—" : `${pct}%`}</dd>
          <dt className="mt-1 text-[11px] text-muted">집중 비율</dt>
        </div>
        <div>
          <dd className="font-serif text-3xl leading-none">{time(stats.focusedSec)}</dd>
          <dt className="mt-1 text-[11px] text-muted">화면 본 시간</dt>
        </div>
        <div>
          <dd className="font-serif text-3xl leading-none">{stats.awayCount}</dd>
          <dt className="mt-1 text-[11px] text-muted">이탈 알림</dt>
        </div>
      </dl>

      {running && (
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-body">
          <label className={`flex items-center gap-2 ${calibrated ? "" : "opacity-50"}`}>
            <input type="checkbox" className="accent-lime" checked={focus.showDot} disabled={!calibrated} onChange={(e) => focus.setShowDot(e.target.checked)} />
            시선 점 보기
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-lime" checked={focus.voice} onChange={(e) => focus.setVoice(e.target.checked)} />
            20초 이탈 시 음성 알림
          </label>
        </div>
      )}
    </section>
  );
}
