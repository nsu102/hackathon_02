// 질문과 관련 있는 PDF 구절을 고른다. 형태소 분석 없이 한글에도 통하도록 글자 2개씩 묶은 조각(bigram)으로 점수를 매긴다.
import type { PdfPageText } from "./pdf";

export type Excerpt = { page: number; text: string };

const BUDGET = 24_000; // 서버 한도(30,000자)보다 여유 있게
const CHUNK = 900;

type Chunk = { page: number; index: number; text: string; grams: Set<string> };

function grams(text: string): Set<string> {
  const out = new Set<string>();
  const clean = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ");
  for (const word of clean.split(" ")) {
    if (!word) continue;
    if (/^[a-z0-9]+$/.test(word)) {
      if (word.length > 1) out.add(word);
      continue;
    }
    if (word.length === 1) out.add(word);
    for (let i = 0; i < word.length - 1; i++) out.add(word.slice(i, i + 2));
  }
  return out;
}

function chunks(pages: PdfPageText[]): Chunk[] {
  const out: Chunk[] = [];
  for (const { page, text } of pages) {
    const paragraphs = text.split(/\n{2,}|\n(?=\s*(?:\d+[.)]|[-•·]))/);
    let current = "";
    let index = 0;
    const push = () => {
      if (current.trim()) out.push({ page, index: index++, text: current.trim(), grams: grams(current) });
      current = "";
    };
    for (const p of paragraphs) {
      if (current.length + p.length > CHUNK) push();
      if (p.length > CHUNK) {
        for (let i = 0; i < p.length; i += CHUNK) {
          current = p.slice(i, i + CHUNK);
          push();
        }
      } else current += (current ? "\n" : "") + p;
    }
    push();
  }
  return out;
}

/**
 * 문서가 작으면 전부, 크면 (1) 지금 보고 있는 쪽 (2) 질문과 겹치는 조각 순으로 예산만큼 담는다.
 * 결과는 쪽 순서로 묶어 돌려준다.
 */
export function selectExcerpts(pages: PdfPageText[], question: string, focusPage: number | null): Excerpt[] {
  const total = pages.reduce((n, p) => n + p.text.length, 0);
  if (total <= BUDGET) return pages.filter((p) => p.text.trim()).map((p) => ({ page: p.page, text: p.text }));

  const all = chunks(pages);
  const df = new Map<string, number>();
  for (const c of all) for (const g of c.grams) df.set(g, (df.get(g) ?? 0) + 1);
  const q = grams(question);
  const scored = all.map((c) => {
    let score = 0;
    for (const g of q) if (c.grams.has(g)) score += Math.log(1 + all.length / (df.get(g) ?? 1));
    if (focusPage && Math.abs(c.page - focusPage) <= 1) score *= 1.25; // 보고 있는 쪽 근처를 조금 우대
    return { c, score };
  });

  const picked = new Map<string, Chunk>();
  let used = 0;
  const take = (c: Chunk) => {
    const key = `${c.page}:${c.index}`;
    if (picked.has(key) || used + c.text.length > BUDGET) return;
    picked.set(key, c);
    used += c.text.length;
  };
  if (focusPage) for (const c of all.filter((c) => c.page === focusPage)) take(c);
  for (const { c, score } of scored.sort((a, b) => b.score - a.score)) {
    if (score <= 0 && picked.size >= 4) break;
    take(c);
    if (used > BUDGET * 0.95) break;
  }

  const byPage = new Map<number, Chunk[]>();
  for (const c of picked.values()) byPage.set(c.page, [...(byPage.get(c.page) ?? []), c]);
  return [...byPage.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([page, list]) => ({ page, text: list.sort((a, b) => a.index - b.index).map((c) => c.text).join("\n…\n") }));
}
