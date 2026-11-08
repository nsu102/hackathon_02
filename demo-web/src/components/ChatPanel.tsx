"use client";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PdfPageText } from "@/lib/pdf";
import { selectExcerpts } from "@/lib/retrieve";

type Message = { id: number; role: "user" | "assistant"; content: string; page?: number | null; error?: boolean; streaming?: boolean };

type Props = {
  fileName: string;
  pages: PdfPageText[];
  /** 질문 순간 학생이 보는 쪽(보정했으면 시선 아래 쪽, 아니면 화면에 가장 많이 보이는 쪽) */
  focusPage: () => { page: number; byGaze: boolean };
  onCite: (page: number) => void;
};

const SUGGESTIONS = ["이 쪽 핵심만 정리해줘", "헷갈리기 쉬운 부분 알려줘", "연습 문제 하나 내줘"];
let nextId = 1;

/** [p.3] → 누르면 그 쪽으로 가는 링크 */
const withCitations = (text: string) => text.replace(/\[p\.?\s?(\d{1,3})\]/gi, "[p.$1](#page-$1)");

export function ChatPanel({ fileName, pages, focusPage, onCite }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const empty = !pages.some((p) => p.text.trim());

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [messages]);
  useEffect(() => () => abort.current?.abort(), []);

  async function ask(question: string) {
    question = question.trim();
    if (!question || busy) return;
    const { page, byGaze } = focusPage();
    // 답을 제대로 받은 질문-답 쌍만 이어지는 대화로 보낸다
    const history = messages
      .flatMap((m, i) => (m.role === "user" && messages[i + 1] && !messages[i + 1].error && !messages[i + 1].streaming ? [m, messages[i + 1]] : []))
      .slice(-6)
      .map(({ role, content }) => ({ role, content }));
    const answerId = nextId++;
    setMessages((m) => [...m, { id: nextId++, role: "user", content: question, page: byGaze ? page : null }, { id: answerId, role: "assistant", content: "", streaming: true }]);
    setDraft("");
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    const update = (patch: Partial<Message>) => setMessages((m) => m.map((x) => (x.id === answerId ? { ...x, ...patch } : x)));
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, fileName, pageCount: pages.length, focusPage: page, excerpts: selectExcerpts(pages, question, page), history }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "답변을 받지 못했어요.");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        update({ content: text });
      }
      update({ content: text || "답변이 비어 있어요. 다시 물어봐 주세요.", streaming: false, error: !text });
    } catch (e) {
      if (controller.signal.aborted) update({ streaming: false, content: "답변을 멈췄어요." , error: true });
      else update({ streaming: false, error: true, content: e instanceof Error ? e.message : "답변을 받지 못했어요." });
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-line bg-surface" aria-labelledby="chat-title">
      <header className="flex items-baseline justify-between border-b border-line px-4 py-3">
        <h2 id="chat-title" className="text-sm font-medium">자료에 질문하기</h2>
        <span className="text-[11px] text-muted">근거 쪽을 함께 알려줘요</span>
      </header>

      <div ref={list} className="min-h-[220px] flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="text-sm text-body">
            {empty ? (
              <p className="text-alert">이 PDF에서 글자를 찾지 못했어요. 스캔한 이미지 PDF는 아직 질문할 수 없어요.</p>
            ) : (
              <>
                <p className="font-serif text-2xl leading-tight text-ink">무엇이 궁금한가요?</p>
                <p className="mt-2 text-muted">“이거”, “여기”라고 물으면 지금 보고 있는 쪽을 기준으로 답해요.</p>
              </>
            )}
          </div>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="ml-8 rounded-2xl rounded-br-md bg-lime px-3.5 py-2.5 text-sm text-night">
              {m.content}
              {m.page && <span className="mt-1 block text-[11px] text-night/70">시선 기준 {m.page}쪽</span>}
            </div>
          ) : (
            <div key={m.id} className={`answer text-sm leading-relaxed ${m.error ? "text-alert" : "text-body"}`}>
              {m.content ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ href, children }) => {
                      const page = href?.startsWith("#page-") ? Number(href.slice(6)) : null;
                      return page ? (
                        <button type="button" onClick={() => onCite(page)} className="mx-0.5 inline-flex h-5 items-center rounded-full border border-lime/50 px-1.5 align-[1px] text-[11px] text-lime hover:bg-lime hover:text-night">
                          {children}
                        </button>
                      ) : (
                        <a href={href} target="_blank" rel="noreferrer" className="text-lime underline underline-offset-2">{children}</a>
                      );
                    },
                  }}
                >
                  {withCitations(m.content)}
                </ReactMarkdown>
              ) : (
                <span className="inline-flex gap-1" aria-label="답변 준비 중">
                  {[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-lime" style={{ animationDelay: `${i * 120}ms` }} />)}
                </span>
              )}
            </div>
          ),
        )}
      </div>

      <div className="border-t border-line p-3">
        {!busy && !empty && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border border-line-strong px-2.5 py-1 text-[11px] text-body hover:border-lime hover:text-ink">{s}</button>
            ))}
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); ask(draft); }} className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(draft); } }}
            rows={2}
            maxLength={1000}
            disabled={empty}
            placeholder={empty ? "글자가 있는 PDF에서 질문할 수 있어요" : "예: 조건부 확률과 독립은 어떻게 달라?"}
            className="min-h-11 flex-1 resize-none rounded-xl border border-line-strong bg-night/60 px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-lime focus:outline-none"
            aria-label="질문"
          />
          {busy ? (
            <button type="button" onClick={() => abort.current?.abort()} className="h-11 rounded-full border border-line-strong px-4 text-sm hover:bg-white/5">멈추기</button>
          ) : (
            <button type="submit" disabled={!draft.trim() || empty} className="h-11 rounded-full bg-lime px-4 text-sm font-medium text-night hover:bg-lime/85 disabled:opacity-40">보내기</button>
          )}
        </form>
      </div>
    </section>
  );
}
