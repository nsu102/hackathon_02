"use client";
import { useRef, useState } from "react";

type Props = {
  onFile: (file: File) => void;
  onSample: () => void;
  loading: { done: number; total: number } | null;
  error: string | null;
};

const features = [
  {
    title: "PDF에 바로 질문",
    body: "올린 자료를 근거로 답하고, 근거가 된 쪽을 [p.3]처럼 짚어 줘요. 누르면 그 쪽으로 이동해요.",
    icon: <path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4" />,
  },
  {
    title: "브라우저 안 시선 추적",
    body: "MediaPipe 얼굴 모델로 화면을 보고 있는지 확인하고, 8초 넘게 딴 데를 보면 살짝 알려 줘요.",
    icon: <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />,
  },
  {
    title: "카메라 영상은 이 탭 안에서만",
    body: "얼굴 영상과 시선 값은 서버로 보내지 않아요. 질문할 때만 PDF 구절과 질문이 AI로 가요.",
    icon: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4" />,
  },
];

export function Landing({ onFile, onSample, loading, error }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <main className="relative isolate overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[70vh] bg-[radial-gradient(ellipse_70%_75%_at_50%_100%,rgb(199_255_62/0.55)_0%,rgb(199_255_62/0.22)_35%,rgb(199_255_62/0.06)_62%,transparent_85%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[45vh] bg-[repeating-linear-gradient(90deg,rgb(8_11_13/0.16)_0_1px,transparent_1px_4px)] [mask-image:radial-gradient(ellipse_55%_90%_at_50%_100%,#000,transparent_85%)]" />

      <section className="mx-auto flex max-w-5xl flex-col items-center px-4 pt-16 pb-24 text-center sm:px-6 sm:pt-24">
        <p className="animate-rise rounded-full border border-line-strong px-3 py-1 text-xs text-body">Study Signal · 체험판</p>
        <h1 className="mt-6 animate-rise font-serif text-[clamp(48px,8vw,96px)] leading-[1.02] tracking-[-0.02em] [animation-delay:80ms]">
          Read it. Ask it.
          <br />
          <em className="text-lime">Stay on it.</em>
        </h1>
        <p className="mt-6 max-w-xl animate-rise text-base leading-relaxed text-body sm:text-lg [animation-delay:160ms]">
          PDF를 올리고 궁금한 걸 물어보세요.
          <br className="hidden sm:block" /> 카메라를 켜면 화면을 보고 있는지 브라우저 안에서 확인해 줘요.
        </p>

        <div
          className={`mt-10 w-full max-w-xl animate-rise rounded-3xl border border-dashed p-6 backdrop-blur-sm transition-colors [animation-delay:240ms] sm:p-8 ${over ? "border-lime bg-lime/10" : "border-line-strong bg-surface/70"}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const file = e.dataTransfer.files[0];
            if (file) onFile(file);
          }}
        >
          {loading ? (
            <div className="py-6" role="status">
              <p className="text-sm text-body">PDF를 읽고 있어요… {loading.total ? `${loading.done} / ${loading.total}쪽` : ""}</p>
              <div className="mx-auto mt-4 h-1 w-48 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-lime transition-[width]" style={{ width: `${loading.total ? (loading.done / loading.total) * 100 : 8}%` }} />
              </div>
            </div>
          ) : (
            <>
              <p className="font-serif text-2xl">PDF를 여기에 놓아 주세요</p>
              <p className="mt-2 text-sm text-muted">글자를 선택할 수 있는 PDF · 40MB, 300쪽까지</p>
              <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                <button type="button" onClick={() => input.current?.click()} className="h-11 rounded-full bg-lime px-6 text-sm font-medium text-night transition hover:bg-lime/85 active:scale-[0.98]">
                  PDF 고르기
                </button>
                <button type="button" onClick={onSample} className="h-11 rounded-full border border-line-strong px-6 text-sm text-ink transition hover:bg-white/5 active:scale-[0.98]">
                  예제 PDF로 해보기
                </button>
              </div>
              <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
            </>
          )}
          {error && <p className="mt-4 text-sm text-alert" role="alert">{error}</p>}
        </div>

        <div className="mt-16 grid w-full gap-4 text-left sm:grid-cols-3">
          {features.map((f, i) => (
            <article key={f.title} className="animate-rise rounded-2xl border border-line bg-surface/80 p-5 backdrop-blur-sm" style={{ animationDelay: `${320 + i * 80}ms` }}>
              <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-lime" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{f.icon}</svg>
              <h2 className="mt-4 text-base font-medium">{f.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-body">{f.body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
