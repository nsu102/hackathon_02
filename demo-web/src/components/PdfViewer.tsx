"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

export type PdfViewerHandle = { scrollToPage: (page: number) => void };
type Props = { doc: PDFDocumentProxy; onPageChange: (page: number) => void };

/** 화면 가까이 온 쪽만 그린다(긴 PDF도 가볍게). 각 쪽에는 data-page가 있어 시선 점 아래 쪽을 찾을 수 있다. */
export const PdfViewer = forwardRef<PdfViewerHandle, Props>(function PdfViewer({ doc, onPageChange }, ref) {
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [ratio, setRatio] = useState(1.414);
  const [flash, setFlash] = useState<number | null>(null);
  const pages = Array.from({ length: doc.numPages }, (_, i) => i + 1);

  useImperativeHandle(ref, () => ({
    scrollToPage(page) {
      const el = scroller.current?.querySelector<HTMLElement>(`[data-page="${page}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setFlash(page);
      setTimeout(() => setFlash((p) => (p === page ? null : p)), 1400);
    },
  }), []);

  // 첫 쪽 비율로 자리를 먼저 잡아 스크롤이 튀지 않게 한다.
  useEffect(() => {
    let alive = true;
    doc.getPage(1).then((p) => { const v = p.getViewport({ scale: 1 }); if (alive) setRatio(v.height / v.width); });
    return () => { alive = false; };
  }, [doc]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 가장 많이 보이는 쪽 = 지금 읽는 쪽
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const visible = new Map<number, number>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) visible.set(Number((e.target as HTMLElement).dataset.page), e.intersectionRatio);
      let best = 1, max = -1;
      for (const [page, r] of visible) if (r > max) { max = r; best = page; }
      onPageChange(best);
    }, { root, threshold: [0, 0.25, 0.5, 0.75, 1] });
    root.querySelectorAll("[data-page]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [doc, onPageChange]);

  const pageWidth = Math.max(0, width - 32);
  return (
    <div ref={scroller} className="h-full overflow-y-auto overscroll-contain px-4 py-4" aria-label="PDF 보기">
      <div className="mx-auto flex max-w-[880px] flex-col gap-4">
        {pages.map((n) => (
          <Page key={n} doc={doc} page={n} width={Math.min(pageWidth, 880)} ratio={ratio} root={scroller} flash={flash === n} />
        ))}
      </div>
    </div>
  );
});

function Page({ doc, page, width, ratio, root, flash }: { doc: PDFDocumentProxy; page: number; width: number; ratio: number; root: React.RefObject<HTMLDivElement | null>; flash: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { root: root.current, rootMargin: "1200px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [root]);

  useEffect(() => {
    if (!near || !width || !canvas.current) return;
    let task: RenderTask | null = null;
    let alive = true;
    (async () => {
      const p = await doc.getPage(page);
      if (!alive || !canvas.current) return;
      const base = p.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = p.getViewport({ scale: (width / base.width) * dpr });
      const c = canvas.current;
      c.width = Math.floor(viewport.width);
      c.height = Math.floor(viewport.height);
      setHeight(Math.round(viewport.height / dpr));
      task = p.render({ canvas: c, viewport });
      await task.promise.catch(() => {});
    })();
    return () => { alive = false; task?.cancel(); };
  }, [near, width, doc, page]);

  return (
    <div
      ref={box}
      data-page={page}
      className={`relative overflow-hidden rounded-lg bg-white shadow-[0_18px_40px_-20px_rgb(0_0_0/0.8)] ring-2 transition-[box-shadow] duration-500 ${flash ? "ring-lime" : "ring-transparent"}`}
      style={{ width: width || "100%", height: height ?? (width ? width * ratio : undefined), aspectRatio: width ? undefined : `1 / ${ratio}` }}
    >
      <canvas ref={canvas} className="block h-full w-full" aria-label={`${page}쪽`} />
      <span className="absolute right-2 bottom-2 rounded-full bg-night/70 px-2 py-0.5 text-[11px] text-body">{page}</span>
    </div>
  );
}
