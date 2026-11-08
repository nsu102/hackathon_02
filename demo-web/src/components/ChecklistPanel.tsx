"use client";
import { useState } from "react";
import type { FocusApi, FocusStatus } from "@/hooks/useFocus";
import { useChecklist } from "@/hooks/useChecklist";
import type { PdfPageText } from "@/lib/pdf";

const GAZE: Record<FocusStatus, string> = {
  off: "시선 측정 꺼짐",
  loading: "시선 모델 준비 중",
  baseline: "화면 가운데를 2초 봐주세요",
  focused: "화면 응시 중",
  pending: "이탈 확인 중",
  away: "화면 밖 방향",
  noface: "시선 측정 불가",
  drowsy: "눈 감음",
  grace: "필기·생각 유예 중",
  error: "카메라를 켜지 못했어요",
};

type Props = {
  fileName: string;
  pages: PdfPageText[];
  currentPage: number;
  focus: FocusApi;
  onJump: (page: number) => void;
  onHide: () => void;
  folded: boolean;
  onToggleFold: () => void;
};

/** 데스크톱 앱 좌상단 체크리스트와 같은 패널. PDF가 바뀌면 key로 새로 만든다. */
export function ChecklistPanel({ fileName, pages, currentPage, focus, onJump, onHide, folded, onToggleFold }: Props) {
  const list = useChecklist(fileName, pages);
  const { plan, done, total, loading, error } = list;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const allDone = total > 0 && done === total;
  const note = error ?? (loading ? "자료에서 학습 순서를 정리하고 있어요…" : allDone ? "오늘의 목록을 모두 마쳤어요." : null);
  const measuring = focus.status === "focused";

  return (
    <>
      {/* 넓은 화면에서 접으면 왼쪽 얇은 띠가 되고, PDF가 그만큼 넓어진다 */}
      {folded && (
        <button
          type="button"
          onClick={onToggleFold}
          aria-expanded={false}
          aria-label={`체크리스트 펼치기 · ${done} / ${total} 완료`}
          title="체크리스트 펼치기"
          className="hidden w-16 flex-col items-center gap-4 rounded-[18px] border border-line-strong bg-[rgb(22_25_23/0.92)] py-4 shadow-[0_8px_30px_rgb(0_0_0/0.35)] backdrop-blur-md transition-colors hover:border-lime/60 lg:flex xl:h-full"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-muted" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
          <span className="relative grid h-11 w-11 place-items-center">
            <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" aria-hidden>
              <circle cx="22" cy="22" r="19" className="fill-none stroke-white/10" strokeWidth="3" />
              <circle cx="22" cy="22" r="19" className="fill-none stroke-lime transition-[stroke-dashoffset] duration-500" strokeWidth="3" strokeLinecap="round" strokeDasharray={2 * Math.PI * 19} strokeDashoffset={2 * Math.PI * 19 * (1 - (total ? done / total : 0))} />
            </svg>
            <span className="font-serif text-[15px] leading-none">{done}<span className="text-faint">/{total}</span></span>
          </span>
          <span className="text-[11px] tracking-[0.2em] text-body [writing-mode:vertical-rl]">체크리스트</span>
          <span className={`mt-auto h-[6px] w-[6px] rounded-full ${measuring ? "bg-lime" : "bg-faint"}`} aria-hidden title={GAZE[focus.status]} />
        </button>
      )}
    <article className={`rounded-[18px] border border-line-strong bg-[rgb(22_25_23/0.92)] px-4 py-3.5 text-xs shadow-[0_8px_30px_rgb(0_0_0/0.35)] backdrop-blur-md ${folded ? "lg:hidden" : ""}`} aria-labelledby="plan-title">
      <header className="flex items-center gap-2">
        <span className="flex-1 text-[9px] tracking-[0.16em] text-muted">STUDY SIGNAL</span>
        <button type="button" onClick={onToggleFold} aria-expanded={!folded} className="rounded-md px-1.5 py-0.5 text-[10px] text-muted hover:bg-white/10">{folded ? "펼치기" : "접기"}</button>
        <button type="button" onClick={onHide} aria-label="체크리스트 숨기기" className="rounded-md px-1.5 text-base leading-none text-muted hover:bg-white/10">×</button>
      </header>

      <h2 id="plan-title" className="mt-2 line-clamp-2 text-[15px] leading-snug font-semibold">{plan.title}</h2>
      <div className="mt-2 flex items-baseline justify-between gap-2 text-[10px] text-muted">
        <span aria-live="polite">{total ? `${done} / ${total} 완료` : "공부할 항목을 추가해주세요"}</span>
        <span className="text-[9px] text-lime">{plan.source === "ai" ? "AI 학습 계획" : "자료 초안"}</span>
      </div>
      <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="학습 체크리스트 완료율">
        <div className="h-full rounded-full bg-lime transition-[width] duration-500" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
      {note && <p role="status" className={`mt-2.5 text-[11px] ${error ? "text-alert" : allDone ? "text-lime" : "text-[#dfc290]"}`}>{note}</p>}

      {!folded && !editing && (
        <ol className="mt-2 max-h-[min(320px,40dvh)] overflow-y-auto">
          {plan.items.map((item) => (
            <li key={item.id} className="group flex items-start gap-2 border-t border-white/5 first:border-t-0">
              <label className="flex flex-1 cursor-pointer items-start gap-2.5 py-2.5 text-xs leading-relaxed" title={item.evidence || undefined}>
                <input type="checkbox" checked={item.done} disabled={loading} onChange={(e) => list.toggle(item.id, e.target.checked)} className="mt-[3px] h-3.5 w-3.5 shrink-0 accent-lime" />
                <span className={`break-words transition-colors ${item.done ? "text-faint line-through" : "text-body"}`}>{item.label}</span>
              </label>
              {item.page && (
                <button type="button" onClick={() => onJump(item.page!)} className="mt-2 shrink-0 rounded-full border border-line px-1.5 text-[10px] text-muted opacity-70 group-hover:opacity-100 hover:border-lime hover:text-lime" aria-label={`${item.page}쪽으로 이동`}>
                  p.{item.page}
                </button>
              )}
            </li>
          ))}
        </ol>
      )}

      {!folded && editing && (
        <div className="mt-3 space-y-2">
          <ol className="max-h-[min(280px,36dvh)] space-y-1.5 overflow-y-auto">
            {plan.items.map((item) => (
              <li key={item.id} className="flex items-center gap-1.5">
                <input
                  defaultValue={item.label}
                  maxLength={120}
                  onBlur={(e) => list.rename(item.id, e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                  aria-label="항목 이름"
                  className="min-w-0 flex-1 rounded-lg border border-line bg-night/60 px-2 py-1.5 text-xs focus:border-lime focus:outline-none"
                />
                <button type="button" onClick={() => list.remove(item.id)} aria-label={`${item.label} 삭제`} className="h-7 w-7 shrink-0 rounded-md text-muted hover:bg-white/10 hover:text-alert">×</button>
              </li>
            ))}
          </ol>
          <form onSubmit={(e) => { e.preventDefault(); list.add(draft, currentPage); setDraft(""); }} className="flex gap-1.5">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={120} placeholder={`새 항목 (${currentPage}쪽에 연결)`} aria-label="새 항목" className="min-w-0 flex-1 rounded-lg border border-line bg-night/60 px-2 py-1.5 text-xs placeholder:text-faint focus:border-lime focus:outline-none" />
            <button type="submit" disabled={!draft.trim()} className="rounded-lg bg-lime px-2.5 text-xs font-medium text-night disabled:opacity-40">추가</button>
          </form>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <button type="button" disabled={loading} onClick={() => { if (!done || confirm("체크한 진행이 지워져요. 자료 초안으로 다시 만들까요?")) list.rebuildOutline(); }} className="rounded-full border border-line-strong px-2.5 py-1 text-[11px] hover:bg-white/5 disabled:opacity-40">자료 초안으로 다시 만들기</button>
            <button type="button" disabled={loading} onClick={() => { if (!done || confirm("체크한 진행이 지워져요. AI로 다시 만들까요?")) void list.buildWithAi(); }} className="rounded-full border border-lime/60 px-2.5 py-1 text-[11px] text-lime hover:bg-lime hover:text-night disabled:opacity-40">AI로 학습 순서 만들기</button>
          </div>
          <p className="text-[10px] leading-relaxed text-faint">완료는 직접 체크하며, PDF별로 이 브라우저에 저장해요. AI로 만들면 자료 텍스트를 모델에 보내고, 자료에 근거가 있는 항목만 남겨요.</p>
        </div>
      )}

      <section className="mt-2 border-t border-white/10 pt-2.5" aria-label="실시간 시선 측정">
        <div className="flex items-center gap-1.5">
          <span className={`h-[5px] w-[5px] rounded-full ${measuring ? "bg-lime" : "bg-faint"}`} aria-hidden />
          <strong className="flex-1 text-[11px] font-medium">{GAZE[focus.status]}</strong>
          <button type="button" onClick={focus.running ? focus.stop : focus.start} disabled={focus.status === "loading"} className="rounded-md px-1.5 py-0.5 text-[10px] text-muted hover:bg-white/10">
            {focus.running || focus.status === "loading" ? "측정 끄기" : "측정 켜기"}
          </button>
        </div>
        {!folded && <p className="mt-1 text-[10px] leading-relaxed text-muted">{focus.status === "error" ? focus.error : focus.running ? "눈과 머리 방향으로 화면을 보는지 확인해요." : "카메라를 켜면 눈과 머리 방향을 측정해요."}</p>}
      </section>

      {!folded && (
        <footer className="mt-2 flex items-center gap-2 text-[9px] text-faint">
          <span className="min-w-0 flex-1 truncate" title={fileName}>{fileName}</span>
          <button type="button" onClick={() => setEditing((v) => !v)} aria-expanded={editing} className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] whitespace-nowrap text-muted hover:bg-white/10">{editing ? "목록 닫기" : "목록 관리 ↗"}</button>
        </footer>
      )}
    </article>
    </>
  );
}
