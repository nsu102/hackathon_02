"use client";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Calibration } from "@/components/Calibration";
import { ChatPanel } from "@/components/ChatPanel";
import { FocusPanel } from "@/components/FocusPanel";
import { Landing } from "@/components/Landing";
import { PdfViewer, type PdfViewerHandle } from "@/components/PdfViewer";
import { useFocus } from "@/hooks/useFocus";
import { closePdf, type LoadedPdf, openPdf } from "@/lib/pdf";

const SAMPLE = { url: "/samples/conditional-probability.pdf", name: "조건부 확률 핵심 정리.pdf" };

export function Workspace() {
  const { refs: { videoRef, dotRef }, ...focus } = useFocus();
  const viewer = useRef<PdfViewerHandle>(null);
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [loading, setLoading] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [calibrating, setCalibrating] = useState(false);
  const pageRef = useRef(1);
  useEffect(() => { pageRef.current = page; }, [page]);

  const load = useCallback(async (source: File | ArrayBuffer, name: string) => {
    setError(null);
    setLoading({ done: 0, total: 0 });
    try {
      const next = await openPdf(source, name, (done, total) => setLoading({ done, total }));
      setPdf((old) => { if (old) closePdf(old.doc); return next; });
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF를 열지 못했어요.");
    } finally {
      setLoading(null);
    }
  }, []);

  const onFile = useCallback((file: File) => {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("PDF 파일만 열 수 있어요.");
      return;
    }
    void load(file, file.name);
  }, [load]);

  const onSample = useCallback(async () => {
    try {
      const data = await fetch(SAMPLE.url).then((r) => { if (!r.ok) throw new Error(); return r.arrayBuffer(); });
      await load(data, SAMPLE.name);
    } catch {
      setError("예제 PDF를 불러오지 못했어요.");
    }
  }, [load]);

  const close = useCallback(() => {
    focus.stop();
    setPdf((old) => { if (old) closePdf(old.doc); return null; });
  }, [focus]);

  // 이탈 알림이 떠 있는 동안 Esc로 1분 유예
  useEffect(() => {
    if (focus.status !== "away" && focus.status !== "noface" && focus.status !== "drowsy") return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") focus.graceMinute(); };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [focus.status, focus]);

  const focusPage = useCallback(() => {
    const gaze = focus.gazePage();
    return gaze ? { page: gaze, byGaze: true } : { page: pageRef.current, byGaze: false };
  }, [focus]);

  const nudge = focus.status === "away" || focus.status === "noface" || focus.status === "drowsy";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-night/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 sm:px-6">
          <button type="button" onClick={close} className="flex items-center gap-2.5" aria-label="Study Signal 처음 화면">
            <Image src="/brand/study-signal.svg" alt="" width={24} height={24} priority />
            <span className="text-[17px] font-medium tracking-[-0.03em]">Study Signal</span>
          </button>
          <span className="rounded-full border border-line-strong px-2 py-0.5 text-[11px] text-body">Demo</span>
          {pdf && (
            <div className="ml-auto flex min-w-0 items-center gap-3">
              <span className="hidden min-w-0 truncate text-sm text-body sm:block" title={pdf.name}>{pdf.name}</span>
              <span className="shrink-0 font-serif text-lg text-muted">{page}<span className="text-faint"> / {pdf.pages.length}</span></span>
              <button type="button" onClick={close} className="h-8 shrink-0 rounded-full border border-line-strong px-3 text-xs hover:bg-white/5">다른 PDF</button>
            </div>
          )}
        </div>
      </header>

      {!pdf ? (
        <Landing onFile={onFile} onSample={onSample} loading={loading} error={error} />
      ) : (
        <main className="mx-auto grid w-full max-w-[1440px] flex-1 gap-4 p-4 sm:p-6 lg:h-[calc(100dvh-3.5rem)] lg:min-h-0 lg:flex-none lg:grid-rows-1 lg:grid-cols-[minmax(0,1fr)_400px] lg:overflow-hidden">
          <div className="h-[70dvh] min-h-0 overflow-hidden rounded-2xl border border-line bg-raised/60 lg:h-auto">
            <PdfViewer ref={viewer} doc={pdf.doc} onPageChange={setPage} />
          </div>
          <aside className="flex min-h-0 flex-col gap-4">
            <FocusPanel focus={focus} videoRef={videoRef} onCalibrate={() => setCalibrating(true)} />
            <ChatPanel key={pdf.name + pdf.pages.length} fileName={pdf.name} pages={pdf.pages} focusPage={focusPage} onCite={(p) => viewer.current?.scrollToPage(p)} />
          </aside>
        </main>
      )}

      {calibrating && <Calibration focus={focus} onClose={() => setCalibrating(false)} />}

      {/* 시선 점: useFocus가 위치를 직접 옮긴다 */}
      <div ref={dotRef} aria-hidden className="pointer-events-none fixed top-0 left-0 z-40 -mt-3 -ml-3 h-6 w-6 rounded-full border-2 border-lime bg-lime/20 opacity-0 shadow-[0_0_24px_rgb(199_255_62/0.6)] transition-[opacity,transform] duration-100 ease-out" />

      {nudge && (
        <div role="alert" className="fixed inset-x-4 bottom-6 z-40 mx-auto max-w-md animate-rise rounded-2xl border border-lime/50 bg-surface/95 p-4 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.9)] backdrop-blur-md">
          <p className="font-serif text-2xl leading-tight">
            {focus.status === "drowsy" ? "졸린가요?" : focus.status === "noface" ? "어디 갔어요?" : "눈동자 출장이 길어졌네."}
          </p>
          <p className="mt-1 text-sm text-body">
            {focus.status === "drowsy" ? "눈을 감은 지 꽤 됐어요. 잠깐 스트레칭하고 돌아와요." : "화면으로 돌아와서 한 줄만 더 읽자."}
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={focus.graceMinute} className="h-8 rounded-full bg-lime px-3 text-xs font-medium text-night hover:bg-lime/85">필기·생각 중이에요 (1분)</button>
            <span className="self-center text-[11px] text-faint">화면을 2초 보면 사라져요</span>
          </div>
        </div>
      )}
    </div>
  );
}
