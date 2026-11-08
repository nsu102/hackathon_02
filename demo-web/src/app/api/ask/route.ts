// PDF 질문 API. 브라우저가 고른 PDF 구절과 질문을 받아 OpenRouter 모델의 답을 글자 단위로 흘려보낸다.
// 키(OPENROUTER_API_KEY)는 서버에서만 읽고 브라우저로 보내지 않는다. PDF 파일 자체는 서버에 저장하지 않는다.

type Excerpt = { page: number; text: string };
type Turn = { role: "user" | "assistant"; content: string };
type AskBody = {
  question?: unknown;
  fileName?: unknown;
  pageCount?: unknown;
  focusPage?: unknown;
  excerpts?: unknown;
  history?: unknown;
};

const MAX_QUESTION = 1000;
const MAX_CONTEXT = 30_000;
const MAX_HISTORY = 6;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear(); // 데모 서버 메모리 보호
  return false;
}

const fail = (status: number, error: string) => Response.json({ error }, { status });

function parse(body: AskBody) {
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question || question.length > MAX_QUESTION) return null;
  const excerpts: Excerpt[] = [];
  let size = 0;
  if (Array.isArray(body.excerpts)) {
    for (const item of body.excerpts.slice(0, 40)) {
      if (!item || typeof item !== "object") continue;
      const { page, text } = item as Record<string, unknown>;
      if (!Number.isInteger(page) || typeof text !== "string" || !text.trim()) continue;
      const room = MAX_CONTEXT - size;
      if (room <= 0) break;
      const clipped = text.slice(0, room);
      excerpts.push({ page: page as number, text: clipped });
      size += clipped.length;
    }
  }
  const history: Turn[] = Array.isArray(body.history)
    ? body.history
        .filter((t): t is Turn => !!t && typeof t === "object" && ((t as Turn).role === "user" || (t as Turn).role === "assistant") && typeof (t as Turn).content === "string")
        .slice(-MAX_HISTORY)
        .map((t) => ({ role: t.role, content: t.content.slice(0, 2000) }))
    : [];
  return {
    question,
    excerpts,
    history,
    fileName: typeof body.fileName === "string" ? body.fileName.slice(0, 120) : "문서",
    pageCount: Number.isInteger(body.pageCount) ? (body.pageCount as number) : null,
    focusPage: Number.isInteger(body.focusPage) ? (body.focusPage as number) : null,
  };
}

const SYSTEM = `너는 Study Signal의 학습 도우미다. 학생이 올린 PDF를 함께 읽으며 질문에 답한다.
- 반드시 아래에 주어진 PDF 구절을 근거로 답한다. 구절에 없는 내용이면 "자료에서 찾지 못했어요"라고 먼저 밝히고, 일반 지식으로 보충할 때는 그 사실을 분명히 말한다.
- 근거로 쓴 페이지를 문장 끝에 [p.3] 형식으로 표시한다. 여러 페이지면 [p.2][p.5]처럼 쓴다.
- 학생이 지금 보고 있는 페이지가 주어지면 "이거", "여기"는 그 페이지를 가리킨다고 본다.
- 한국어로, 짧은 단락과 목록 위주로 설명한다. 수식은 P(A|B) = P(A∩B)/P(B)처럼 평문으로 쓴다(LaTeX 금지).
- 풀이를 요구하면 단계별로 보여주고, 마지막에 이해를 확인할 짧은 질문 하나를 덧붙여도 좋다.`;

export async function POST(request: Request) {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) return fail(503, "OpenRouter API 키가 아직 없어요. demo-web/.env.local의 OPENROUTER_API_KEY를 채우고 서버를 다시 시작해주세요.");

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  if (rateLimited(ip)) return fail(429, "질문이 너무 많아요. 10분 뒤에 다시 시도해주세요.");

  let body: AskBody;
  try {
    body = (await request.json()) as AskBody;
  } catch {
    return fail(400, "요청 형식을 확인해주세요.");
  }
  const input = parse(body);
  if (!input) return fail(400, `질문은 1~${MAX_QUESTION}자로 입력해주세요.`);
  if (!input.excerpts.length) return fail(400, "PDF에서 읽은 글자가 없어요. 글자를 선택할 수 있는 PDF인지 확인해주세요.");

  const context = [
    `문서: ${input.fileName}${input.pageCount ? ` (총 ${input.pageCount}쪽)` : ""}`,
    input.focusPage ? `학생이 지금 보고 있는 페이지: ${input.focusPage}쪽` : "",
    ...input.excerpts.map((e) => `--- p.${e.page} ---\n${e.text}`),
  ].filter(Boolean).join("\n\n");

  const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": request.headers.get("origin") ?? "http://localhost:3000",
      "X-Title": "Study Signal Demo",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL?.trim() || "anthropic/claude-sonnet-5.5",
      stream: true,
      max_tokens: 1200,
      temperature: 0.3,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `아래는 PDF에서 질문과 관련 있는 구절이다.\n\n${context}` },
        { role: "assistant", content: "네, 이 구절을 근거로 답할게요." },
        ...input.history,
        { role: "user", content: input.question },
      ],
    }),
    signal: request.signal,
  }).catch(() => null);

  if (!upstream) return fail(502, "AI 서버에 연결하지 못했어요. 인터넷 연결을 확인해주세요.");
  if (!upstream.ok || !upstream.body) {
    const detail = (await upstream.json().catch(() => null)) as { error?: { message?: string } } | null;
    const reason = upstream.status === 401 ? "API 키가 올바르지 않아요." : upstream.status === 402 ? "OpenRouter 크레딧이 부족해요." : upstream.status === 429 ? "AI 서버가 바빠요. 잠시 뒤에 다시 시도해주세요." : detail?.error?.message ?? "AI 답변을 받지 못했어요.";
    return fail(upstream.status === 401 || upstream.status === 402 ? upstream.status : 502, reason);
  }

  // OpenRouter의 SSE(data: {...}) 중 답변 글자만 골라 평문 스트림으로 바꾼다.
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const stream = upstream.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const data = line.startsWith("data:") ? line.slice(5).trim() : "";
          if (!data || data === "[DONE]") continue;
          try {
            const text = JSON.parse(data)?.choices?.[0]?.delta?.content;
            if (typeof text === "string" && text) controller.enqueue(encoder.encode(text));
          } catch {
            // 처리 중 주석(: OPENROUTER PROCESSING)이나 잘린 줄은 건너뛴다.
          }
        }
      },
    }),
  );
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
