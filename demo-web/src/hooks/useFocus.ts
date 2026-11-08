"use client";
// 시선 추적 결과를 "집중 상태"로 바꾼다. 데스크톱 앱과 같은 기본값: 8초 이탈 시 화면 알림, 20초 시 음성 알림, 2초 복귀 시 해제.
import { useCallback, useEffect, useRef, useState } from "react";
import { type Features, type Frame, GazeModel, GazeTracker, Smoother, medianFeatures } from "@/lib/gaze";

export type FocusStatus = "off" | "loading" | "baseline" | "focused" | "pending" | "away" | "noface" | "drowsy" | "grace" | "error";
export type FocusStats = { trackedSec: number; focusedSec: number; awayCount: number; awaySec: number };

const BASELINE_MS = 2000;
const NUDGE_MS = 8000;
const VOICE_MS = 20000;
const RETURN_MS = 1500;
const NOFACE_MS = 2500;
const DROWSY_MS = 2500;
const GRACE_MS = 60000;

const VOICE_LINE = "화면 밖을 본 지 꽤 됐어요. 자료로 돌아와 한 줄만 더 읽어봐요.";

export function useFocus() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dotRef = useRef<HTMLDivElement | null>(null);
  const tracker = useRef<GazeTracker | null>(null);

  const [status, setStatus] = useState<FocusStatus>("off");
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<FocusStats>({ trackedSec: 0, focusedSec: 0, awayCount: 0, awaySec: 0 });
  const [calibrated, setCalibrated] = useState(false);
  const [showDot, setShowDot] = useState(true);
  const [voice, setVoice] = useState(true);

  // 매 프레임 바뀌는 값은 ref에 두고, 화면 갱신은 4번/초로 줄인다.
  const s = useRef({
    baseline: null as Features | null,
    baselineSamples: [] as Features[],
    baselineStart: 0,
    model: null as GazeModel | null,
    smoother: new Smoother(),
    offSince: null as number | null,
    onSince: null as number | null,
    noFaceSince: null as number | null,
    closedSince: null as number | null,
    awayCounted: false,
    spoke: false,
    graceUntil: 0,
    last: 0,
    lastPublish: 0,
    published: "off" as FocusStatus,
    status: "off" as FocusStatus,
    stats: { trackedSec: 0, focusedSec: 0, awayCount: 0, awaySec: 0 },
    point: null as { x: number; y: number } | null,
    collector: null as Features[] | null,
    showDot: true,
    voice: true,
  });
  useEffect(() => { s.current.showDot = showDot; if (!showDot && dotRef.current) dotRef.current.style.opacity = "0"; }, [showDot]);
  useEffect(() => { s.current.voice = voice; if (!voice && typeof speechSynthesis !== "undefined") speechSynthesis.cancel(); }, [voice]);

  const publish = useCallback((force = false) => {
    const st = s.current;
    const now = performance.now();
    if (!force && st.status === st.published && now - st.lastPublish < 250) return;
    st.lastPublish = now;
    st.published = st.status;
    setStatus(st.status);
    setStats({ ...st.stats });
  }, []);

  const onFrame = useCallback((frame: Frame) => {
    const st = s.current;
    const dt = st.last ? Math.min(200, frame.at - st.last) / 1000 : 0;
    st.last = frame.at;
    if (st.collector && frame.features) st.collector.push(frame.features);

    // 1) 시작 기준: 화면 가운데를 2초 바라본 값
    if (!st.baseline) {
      st.status = "baseline";
      if (frame.features) {
        st.baselineStart ||= frame.at;
        st.baselineSamples.push(frame.features);
        if (frame.at - st.baselineStart >= BASELINE_MS && st.baselineSamples.length >= 15) st.baseline = medianFeatures(st.baselineSamples);
      }
      return publish();
    }

    // 2) 지금 화면을 보고 있는가
    let reason: "ok" | "off" | "noface" | "drowsy" = "ok";
    if (!frame.face || !frame.features) {
      st.noFaceSince ??= frame.at;
      if (frame.at - st.noFaceSince > NOFACE_MS) reason = "noface";
    } else {
      st.noFaceSince = null;
      st.closedSince = frame.blink > 0.55 ? st.closedSince ?? frame.at : null;
      if (st.closedSince && frame.at - st.closedSince > DROWSY_MS) reason = "drowsy";
      else if (st.model) {
        const p = st.smoother.push(st.model.predict(frame.features));
        st.point = p;
        if (p.x < -0.12 || p.x > 1.12 || p.y < -0.15 || p.y > 1.15) reason = "off";
      } else {
        const [, , yaw, pitch, lookX, lookY] = frame.features;
        const b = st.baseline;
        const dYaw = Math.abs(yaw - b[2]), dPitch = pitch - b[3], dLookX = Math.abs(lookX - b[4]), dLookY = lookY - b[5];
        if (dYaw > 0.32 || Math.abs(dPitch) > 0.26 || dLookX > 0.5 || dLookY < -0.5 || dYaw + dLookX * 0.35 > 0.4) reason = "off";
      }
    }
    // 시선 점
    const dot = dotRef.current;
    if (dot) {
      if (st.showDot && st.model && st.point && reason === "ok") {
        dot.style.opacity = "1";
        dot.style.transform = `translate(${Math.round(st.point.x * innerWidth)}px, ${Math.round(st.point.y * innerHeight)}px)`;
      } else dot.style.opacity = "0";
    }

    // 3) 상태와 알림
    st.stats.trackedSec += dt;
    const grace = frame.at < st.graceUntil;
    if (reason === "ok") {
      st.onSince ??= frame.at;
      if (!st.offSince || frame.at - st.onSince >= RETURN_MS) {
        st.offSince = null;
        st.awayCounted = false;
        st.spoke = false;
        if (typeof speechSynthesis !== "undefined" && speechSynthesis.speaking) speechSynthesis.cancel();
      }
    } else {
      st.onSince = null;
      st.offSince ??= frame.at;
    }
    if (!st.offSince) {
      st.stats.focusedSec += dt;
      st.status = grace ? "grace" : "focused";
    } else {
      const awayFor = frame.at - st.offSince;
      st.stats.awaySec += dt;
      if (grace) st.status = "grace";
      else if (awayFor < NUDGE_MS) st.status = "pending";
      else {
        st.status = reason === "noface" ? "noface" : reason === "drowsy" ? "drowsy" : "away";
        if (!st.awayCounted) { st.awayCounted = true; st.stats.awayCount += 1; }
        if (awayFor >= VOICE_MS && !st.spoke && st.voice && typeof speechSynthesis !== "undefined") {
          st.spoke = true;
          const u = new SpeechSynthesisUtterance(VOICE_LINE);
          u.lang = "ko-KR";
          speechSynthesis.speak(u);
        }
      }
    }
    publish();
  }, [publish]);

  const reset = useCallback(() => {
    const st = s.current;
    Object.assign(st, { baseline: null, baselineSamples: [], baselineStart: 0, offSince: null, onSince: null, noFaceSince: null, closedSince: null, awayCounted: false, spoke: false, point: null });
    st.smoother.reset();
  }, []);

  const start = useCallback(async () => {
    if (!videoRef.current) return;
    setError(null);
    s.current.status = "loading";
    setStatus("loading");
    reset();
    tracker.current ??= new GazeTracker(videoRef.current, (f) => onFrameRef.current(f));
    try {
      await tracker.current.start();
    } catch (e) {
      tracker.current.stop();
      s.current.status = "error";
      setStatus("error");
      setError(e instanceof Error ? e.message : "카메라를 켜지 못했어요.");
    }
  }, [reset]);
  const onFrameRef = useRef(onFrame);
  useEffect(() => { onFrameRef.current = onFrame; }, [onFrame]);

  const stop = useCallback(() => {
    tracker.current?.stop();
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    if (dotRef.current) dotRef.current.style.opacity = "0";
    s.current.status = "off";
    setStatus("off");
  }, []);

  useEffect(() => () => tracker.current?.dispose(), []);

  /** 보정 점 하나를 바라보는 동안 특징을 모은다 */
  const collect = useCallback(async (ms: number) => {
    s.current.collector = [];
    await new Promise((r) => setTimeout(r, ms));
    const got = s.current.collector ?? [];
    s.current.collector = null;
    return got;
  }, []);

  const applyCalibration = useCallback((model: GazeModel | null) => {
    s.current.model = model;
    s.current.smoother.reset();
    setCalibrated(Boolean(model));
  }, []);

  const graceMinute = useCallback(() => {
    s.current.graceUntil = performance.now() + GRACE_MS;
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    s.current.status = "grace";
    setStatus("grace");
  }, []);

  /** 시선 점 아래에 있는 PDF 쪽 번호(보정했을 때만) */
  const gazePage = useCallback((): number | null => {
    const p = s.current.point;
    if (!s.current.model || !p || s.current.status !== "focused") return null;
    const el = document.elementFromPoint(p.x * innerWidth, p.y * innerHeight)?.closest<HTMLElement>("[data-page]");
    return el ? Number(el.dataset.page) : null;
  }, []);

  return { refs: { videoRef, dotRef }, status, error, stats, calibrated, showDot, setShowDot, voice, setVoice, start, stop, resetBaseline: reset, collect, applyCalibration, graceMinute, gazePage, running: status !== "off" && status !== "error" };
}

/** 화면 요소 ref(refs)를 뺀 상태·동작. 렌더 중에 읽어도 되는 값만 담는다. */
export type FocusApi = Omit<ReturnType<typeof useFocus>, "refs">;
