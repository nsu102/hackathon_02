// 브라우저 안 시선 추적. MediaPipe Face Landmarker(얼굴 478점 + 눈 방향 블렌드셰이프 + 머리 자세)를 WebAssembly로 돌린다.
// 카메라 영상은 이 탭 밖으로 나가지 않는다. 화면 좌표는 9점 보정 후 릿지 회귀로 추정한다(웹캠 기준 근사치).
import type { FaceLandmarker, FaceLandmarkerResult } from "@mediapipe/tasks-vision";

/** [홍채 가로, 홍채 세로, 머리 좌우(yaw), 머리 상하(pitch), 눈 방향 가로, 눈 방향 세로] */
export type Features = [number, number, number, number, number, number];
export type Frame = { at: number; face: boolean; features: Features | null; blink: number };

type Point = { x: number; y: number };

// ---------------------------------------------------------------- 특징 추출
const L = { outer: 33, inner: 133, upper: 159, lower: 145, iris: 468 };
const R = { outer: 263, inner: 362, upper: 386, lower: 374, iris: 473 };

function eyeRatio(p: { x: number; y: number }[], e: typeof L) {
  const a = p[e.outer], b = p[e.inner], c = p[e.iris], u = p[e.upper], d = p[e.lower];
  const left = Math.min(a.x, b.x), width = Math.abs(a.x - b.x);
  const height = Math.abs(d.y - u.y);
  if (width < 1e-4) return null;
  return { x: (c.x - left) / width, y: height < 1e-4 ? 0.5 : (c.y - Math.min(u.y, d.y)) / height, open: height / width };
}

export function extract(result: FaceLandmarkerResult, at: number): Frame {
  const points = result.faceLandmarks?.[0];
  if (!points || points.length < 478) return { at, face: false, features: null, blink: 0 };
  const shapes = new Map((result.faceBlendshapes?.[0]?.categories ?? []).map((c) => [c.categoryName, c.score]));
  const s = (name: string) => shapes.get(name) ?? 0;
  const blink = (s("eyeBlinkLeft") + s("eyeBlinkRight")) / 2;
  const l = eyeRatio(points, L), r = eyeRatio(points, R);
  if (!l || !r) return { at, face: true, features: null, blink };

  const m = result.facialTransformationMatrixes?.[0]?.data;
  // 4x4 열 우선 행렬의 세 번째 열 = 얼굴이 바라보는 방향
  const yaw = m ? Math.atan2(m[8], m[10]) : 0;
  const pitch = m ? Math.atan2(-m[9], Math.hypot(m[8], m[10])) : 0;
  // 두 눈이 함께 한쪽을 볼 때: 왼눈 Out + 오른눈 In (또는 그 반대)
  const lookX = (s("eyeLookOutLeft") + s("eyeLookInRight") - s("eyeLookInLeft") - s("eyeLookOutRight")) / 2;
  const lookY = (s("eyeLookUpLeft") + s("eyeLookUpRight") - s("eyeLookDownLeft") - s("eyeLookDownRight")) / 2;
  return { at, face: true, blink, features: [(l.x + r.x) / 2, (l.y + r.y) / 2, yaw, pitch, lookX, lookY] };
}

// ---------------------------------------------------------------- 보정: 특징 → 화면 좌표 (릿지 회귀)
function solve(a: number[][], b: number[]): number[] {
  const n = b.length, m = a.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[pivot][c])) pivot = r;
    [m[c], m[pivot]] = [m[pivot], m[c]];
    if (Math.abs(m[c][c]) < 1e-12) throw new Error("보정 신호가 부족해요. 다시 보정해주세요.");
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

export class GazeModel {
  private mean: number[] = [];
  private scale: number[] = [];
  private wx: number[] = [];
  private wy: number[] = [];
  error = 0; // 보정 점 기준 평균 오차(화면 대각선 대비 비율)

  fit(samples: { f: Features; target: Point }[], lambda = 0.02) {
    const d = samples[0].f.length;
    this.mean = Array.from({ length: d }, (_, i) => samples.reduce((s, x) => s + x.f[i], 0) / samples.length);
    this.scale = Array.from({ length: d }, (_, i) => Math.sqrt(samples.reduce((s, x) => s + (x.f[i] - this.mean[i]) ** 2, 0) / samples.length) || 1);
    const rows = samples.map((s) => [1, ...this.norm(s.f)]);
    const k = d + 1;
    const ata = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => rows.reduce((s, r) => s + r[i] * r[j], 0) + (i === j && i > 0 ? lambda * samples.length : 0)));
    const atb = (pick: (p: Point) => number) => Array.from({ length: k }, (_, i) => rows.reduce((s, r, n) => s + r[i] * pick(samples[n].target), 0));
    this.wx = solve(ata, atb((p) => p.x));
    this.wy = solve(ata, atb((p) => p.y));
    this.error = samples.reduce((s, x) => { const p = this.predict(x.f); return s + Math.hypot(p.x - x.target.x, p.y - x.target.y); }, 0) / samples.length;
    return this;
  }
  private norm(f: Features) { return f.map((v, i) => (v - this.mean[i]) / this.scale[i]); }
  /** 화면 좌표(0~1, 화면 밖이면 범위를 벗어남) */
  predict(f: Features): Point {
    const r = [1, ...this.norm(f)];
    return { x: r.reduce((s, v, i) => s + v * this.wx[i], 0), y: r.reduce((s, v, i) => s + v * this.wy[i], 0) };
  }
}

/** 9점 보정 위치(화면 비율). 가장자리에서 8% 안쪽. */
export const CALIBRATION_POINTS: Point[] = [0.08, 0.5, 0.92].flatMap((y) => [0.08, 0.5, 0.92].map((x) => ({ x, y })));

export function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}
export function medianFeatures(list: Features[]): Features {
  return [0, 1, 2, 3, 4, 5].map((i) => median(list.map((f) => f[i]))) as Features;
}

/** 깜빡임 같은 작은 떨림을 줄이는 1차 저역 필터 */
export class Smoother {
  private p: Point | null = null;
  constructor(private alpha = 0.22) {}
  push(next: Point): Point {
    this.p = this.p ? { x: this.p.x + this.alpha * (next.x - this.p.x), y: this.p.y + this.alpha * (next.y - this.p.y) } : next;
    return this.p;
  }
  reset() { this.p = null; }
}

// ---------------------------------------------------------------- 카메라 + 모델 실행
export class GazeTracker {
  private landmarker: FaceLandmarker | null = null;
  private stream: MediaStream | null = null;
  private raf = 0;
  private lastVideoTime = -1;
  running = false;

  constructor(private video: HTMLVideoElement, private onFrame: (frame: Frame) => void) {}

  async start() {
    if (this.running) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("이 브라우저는 카메라를 지원하지 않아요.");
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 960 }, height: { ideal: 540 }, facingMode: "user", frameRate: { ideal: 30, max: 30 } }, audio: false });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      throw new Error(name === "NotAllowedError" ? "카메라 권한이 막혀 있어요. 주소창의 사이트 설정에서 카메라를 허용해주세요." : name === "NotFoundError" ? "연결된 카메라를 찾지 못했어요." : "카메라를 켜지 못했어요. 다른 앱이 카메라를 쓰고 있지 않은지 확인해주세요.");
    }
    this.video.srcObject = this.stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play();
    if (!this.landmarker) {
      const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks("/vendor/mediapipe");
      const options = (delegate: "GPU" | "CPU") => ({
        baseOptions: { modelAssetPath: "/models/face_landmarker.task", delegate },
        runningMode: "VIDEO" as const,
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      });
      this.landmarker = await FaceLandmarker.createFromOptions(vision, options("GPU")).catch(() => FaceLandmarker.createFromOptions(vision, options("CPU")));
    }
    this.running = true;
    this.loop();
  }

  private loop = () => {
    if (!this.running || !this.landmarker) return;
    const v = this.video;
    if (v.readyState >= 2 && v.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = v.currentTime;
      const at = performance.now();
      try {
        this.onFrame(extract(this.landmarker.detectForVideo(v, at), at));
      } catch {
        this.onFrame({ at, face: false, features: null, blink: 0 });
      }
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.lastVideoTime = -1;
  }

  dispose() {
    this.stop();
    this.landmarker?.close();
    this.landmarker = null;
  }
}
