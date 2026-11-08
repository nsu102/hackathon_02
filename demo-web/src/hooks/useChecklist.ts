"use client";
import { useCallback, useEffect, useState } from "react";
import type { PdfPageText } from "@/lib/pdf";
import { makeItem, materialText, outlinePlan, pageOf, type Plan, storageKey } from "@/lib/plan";

function read(key: string): Plan | null {
  try {
    const raw = localStorage.getItem(key);
    const plan = raw ? (JSON.parse(raw) as Plan) : null;
    return plan && Array.isArray(plan.items) ? plan : null;
  } catch {
    return null;
  }
}
function write(key: string, plan: Plan) {
  try { localStorage.setItem(key, JSON.stringify(plan)); } catch { /* 저장 공간이 없어도 화면에서는 계속 쓴다 */ }
}

/** PDF 한 개의 학습 체크리스트. 같은 PDF를 다시 열면 체크한 진행이 이어진다. */
export function useChecklist(name: string, pages: PdfPageText[]) {
  const key = storageKey(name, pages);
  const [plan, setPlan] = useState<Plan>(() => read(key) ?? outlinePlan(name, pages));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { write(key, plan); }, [key, plan]);

  const change = useCallback((fn: (plan: Plan) => Plan) => setPlan((p) => ({ ...fn(p), updatedAt: Date.now() })), []);

  const toggle = useCallback((id: string, done: boolean) => change((p) => ({ ...p, items: p.items.map((i) => (i.id === id ? { ...i, done } : i)) })), [change]);
  const rename = useCallback((id: string, label: string) => {
    const clean = label.trim().slice(0, 120);
    if (clean) change((p) => ({ ...p, items: p.items.map((i) => (i.id === id ? { ...i, label: clean } : i)) }));
  }, [change]);
  const remove = useCallback((id: string) => change((p) => ({ ...p, items: p.items.filter((i) => i.id !== id) })), [change]);
  const add = useCallback((label: string, page: number | null) => {
    const clean = label.trim().slice(0, 120);
    if (clean) change((p) => ({ ...p, items: [...p.items, makeItem(clean, "", page)] }));
  }, [change]);

  const rebuildOutline = useCallback(() => {
    setError(null);
    setPlan(outlinePlan(name, pages));
  }, [name, pages]);

  const buildWithAi = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: name.replace(/\.pdf$/i, ""), material: materialText(pages) }),
      });
      const data = (await response.json().catch(() => ({}))) as { title?: string; items?: { label: string; evidence: string }[]; error?: string };
      if (!response.ok || !data.items) throw new Error(data.error ?? "체크리스트를 만들지 못했어요.");
      setPlan({ title: data.title ?? name, source: "ai", items: data.items.map((i) => makeItem(i.label, i.evidence, pageOf(i.evidence, pages))), updatedAt: Date.now() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "체크리스트를 만들지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, [name, pages]);

  const done = plan.items.filter((i) => i.done).length;
  return { plan, done, total: plan.items.length, loading, error, toggle, rename, remove, add, rebuildOutline, buildWithAi };
}

export type ChecklistApi = ReturnType<typeof useChecklist>;
