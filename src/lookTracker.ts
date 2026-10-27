import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

export type LookTarget = {
  /** [-1, 1], mirrored so subject left → pupil left */
  x: number;
  /** [-1, 1], up is positive */
  y: number;
  detected: boolean;
};

const WASM_URL = `${import.meta.env.BASE_URL}mediapipe/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const NOSE_TIP = 1;

export type LookTracker = {
  target: LookTarget;
  start: () => Promise<void>;
  update: (nowMs: number) => void;
  stop: () => void;
};

/** Simple face-position tracker for L/R/U/D pupil movement. */
export function createLookTracker(video: HTMLVideoElement): LookTracker {
  const target: LookTarget = { x: 0, y: 0, detected: false };
  let landmarker: FaceLandmarker | null = null;
  let stream: MediaStream | null = null;
  let lastVideoTime = -1;
  let running = false;

  const start = async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });
    } catch {
      return;
    }

    video.srcObject = stream;
    await video.play();

    try {
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      try {
        landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numFaces: 1,
        });
      } catch {
        landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
          runningMode: "VIDEO",
          numFaces: 1,
        });
      }
      running = true;
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
      video.srcObject = null;
    }
  };

  const applyResult = (result: FaceLandmarkerResult) => {
    const face = result.faceLandmarks[0];
    const tip = face?.[NOSE_TIP];
    if (!tip) {
      target.detected = false;
      return;
    }
    // tip.x grows as the subject moves right in the camera frame.
    // Map directly so lean-left → pupil left (Chrome/macOS often differs from a mirrored preview).
    target.x = clamp((tip.x - 0.5) * 2, -1, 1);
    target.y = clamp((0.5 - tip.y) * 2, -1, 1);
    target.detected = true;
  };

  const update = (nowMs: number) => {
    if (!running || !landmarker || video.readyState < 2) return;
    if (video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;
    applyResult(landmarker.detectForVideo(video, nowMs));
  };

  const stop = () => {
    running = false;
    landmarker?.close();
    landmarker = null;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
  };

  return { target, start, update, stop };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
