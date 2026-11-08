// 학습 체크리스트. 데스크톱 앱(last_hour/study_plan.py)과 같은 규칙:
// - "자료 초안": 자료의 제목·번호 붙은 소제목을 골라 "… · 읽고 핵심 정리" 항목으로 만든다(최대 9개).
// - "AI 학습 계획": 모델이 만든 항목 중 근거 문장이 자료에 그대로 있는 것만 쓴다(/api/plan).
// - 완료는 사용자가 직접 체크한다. 목록은 PDF별로 이 브라우저에 저장한다.
import type { PdfPageText } from "./pdf";

export type PlanItem = { id: string; label: string; evidence: string; page: number | null; done: boolean };
export type Plan = { title: string; source: "outline" | "ai"; items: PlanItem[]; updatedAt: number };

export const MAX_ITEMS = 12;
export const MATERIAL_LIMIT = 30_000;

/** 공백을 지우고 대소문자를 무시한 비교용 문자열 */
export const compact = (text: string) => text.replace(/\s+/g, "").toLowerCase();

/** 빠른 32비트 해시(FNV-1a). 저장 키와 항목 id에 쓴다. */
export function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export const storageKey = (name: string, pages: PdfPageText[]) =>
  `study-signal-plan:${hash(name + "\0" + pages.map((p) => p.text).join("\f"))}`;

/** 근거 문장이 들어 있는 쪽 */
export function pageOf(evidence: string, pages: PdfPageText[]): number | null {
  const needle = compact(evidence).slice(0, 80);
  if (!needle) return null;
  return pages.find((p) => compact(p.text).includes(needle))?.page ?? null;
}

export const makeItem = (label: string, evidence: string, page: number | null): PlanItem => ({
  id: hash(label + "\0" + evidence + "\0" + Math.random()),
  label,
  evidence,
  page,
  done: false,
});

const letters = (line: string) => (line.match(/[\p{L}]/gu)?.length ?? 0) / Math.max(1, line.replace(/\s/g, "").length);

/** 자료 초안: 번호 붙은 소제목을 우선, 부족하면 짧은 제목 줄로 채운다. */
export function outlinePlan(name: string, pages: PdfPageText[]): Plan {
  const lines: { text: string; page: number }[] = [];
  for (const p of pages) {
    for (const raw of p.text.split("\n")) {
      const text = raw.replace(/^\s*(?:#{1,6}\s*|[-*•·]\s*)/, "").replace(/\s+/g, " ").trim();
      if (text.length < 4 || text.length > 220 || /https?:\/\/|\S+@\S+/.test(text)) continue;
      lines.push({ text, page: p.page });
    }
  }

  // "1. 조건부 확률이란", "3.2 Scheduling Criteria", "Chapter 5: …" 같은 소제목.
  // 번호 목록의 긴 문장("1. P(A|B)와 … 긋습니다.")과 글자 비율이 낮은 수식 줄은 제외한다.
  const numbered = lines.filter(
    (l) => l.text.length <= 48 && !/(다|요)\.$/.test(l.text) && letters(l.text) >= 0.5 && (/^\d+(?:\.\d+)*[.)]?\s+\S/.test(l.text) || /^(chapter|section|part|lecture|unit)\s+\d+/i.test(l.text) || /^제\s?\d+\s?[장절강]/.test(l.text)),
  );
  // 앱과 같은 대체 규칙: 짧은 줄을 제목으로 본다
  const short = lines.filter((l) => l.text.length >= 8 && l.text.length <= 45 && letters(l.text) >= 0.5);
  const picked = numbered.length >= 3 ? numbered : [...numbered, ...short, ...lines.filter((l) => l.text.length >= 8)];

  const seen = new Set<string>();
  const items: PlanItem[] = [];
  for (const l of picked) {
    const key = compact(l.text);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(makeItem(`${l.text.slice(0, 72)} · 읽고 핵심 정리`, l.text, l.page));
    if (items.length >= 9) break;
  }
  if (!items.length) {
    const first = pages.map((p) => p.text).join(" ").replace(/\s+/g, " ").trim().slice(0, 180);
    if (first) items.push(makeItem(`${first.slice(0, 72)} · 읽고 핵심 정리`, first, pages[0]?.page ?? 1));
  }
  return { title: name.replace(/\.pdf$/i, "").slice(0, 100) || "오늘의 학습", source: "outline", items, updatedAt: Date.now() };
}

/** 모델에 보낼 자료 텍스트(쪽 표시 포함, 최대 30,000자) */
export function materialText(pages: PdfPageText[]): string {
  let out = "";
  for (const p of pages) {
    const block = `[p.${p.page}]\n${p.text}\n\n`;
    if (out.length + block.length > MATERIAL_LIMIT) {
      out += block.slice(0, MATERIAL_LIMIT - out.length);
      break;
    }
    out += block;
  }
  return out.trim();
}
