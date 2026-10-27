import "./style.css";
import { TERM_GREEN, createAudioCapture } from "./audioLine";
import { createLookTracker } from "./lookTracker";

const canvasEl = document.querySelector<HTMLCanvasElement>("#scene");
const videoEl = document.querySelector<HTMLVideoElement>("#webcam");
const startBtn = document.querySelector<HTMLButtonElement>("#start");
const statusEl = document.querySelector<HTMLParagraphElement>("#status");

if (!canvasEl || !videoEl || !startBtn || !statusEl) {
  throw new Error("Missing required DOM elements");
}

const canvas = canvasEl;
const ctxOrNull = canvas.getContext("2d");
if (!ctxOrNull) throw new Error("Canvas 2D unavailable");
const ctx: CanvasRenderingContext2D = ctxOrNull;

const setStatus = (msg: string) => {
  statusEl.textContent = msg;
};

const audio = createAudioCapture(setStatus);
const look = createLookTracker(videoEl);

const samples = new Float32Array(1024);
let audioRunning = false;
/** Max vertical excursion of the waveform as a fraction of canvas height */
const AMP = 0.14;

/** Smoothed pupil look direction in [-1, 1] */
const gaze = { x: 0, y: 0 };
const GAZE_FOLLOW = 0.12;

/** Blink: lid openness 1 = open, ~0 = closed */
let blinkOpen = 1;
let blinkActive = false;
let blinkStartMs = 0;
const BLINK_MS = 160;
let nextBlinkAt = performance.now() + nextBlinkDelay();

function nextBlinkDelay(): number {
  return 5_000 + Math.random() * 5_000;
}

function updateBlink(now: number) {
  if (!blinkActive && now >= nextBlinkAt) {
    blinkActive = true;
    blinkStartMs = now;
  }
  if (!blinkActive) {
    blinkOpen = 1;
    return;
  }
  const t = (now - blinkStartMs) / BLINK_MS;
  if (t >= 1) {
    blinkActive = false;
    blinkOpen = 1;
    nextBlinkAt = now + nextBlinkDelay();
    return;
  }
  // Close then open: 0→1 maps to 1→0→1
  blinkOpen = t < 0.5 ? 1 - t * 2 : (t - 0.5) * 2;
  // Ease for a softer lid
  blinkOpen = blinkOpen * blinkOpen * (3 - 2 * blinkOpen);
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/** Eye outline + pupil; pupil slides L/R/U/D with webcam look. */
function drawEye(w: number, h: number) {
  const regionH = h * (2 / 3);
  const cx = w * 0.5;
  const cy = regionH * 0.5;

  const rx = Math.min(w * 0.28, regionH * 0.55);
  const ryOpen = rx * 0.42;
  const ry = Math.max(ryOpen * 0.04, ryOpen * blinkOpen);
  const pupilR = ryOpen * 0.55 * blinkOpen;

  // Keep the pupil inside the oval; 0.2× travel for a subtler look
  const maxX = Math.max(0, rx - ryOpen * 0.55) * 0.9 * 0.2;
  const maxY = Math.max(0, ryOpen - ryOpen * 0.55) * 0.9 * 0.2;
  const px = cx + gaze.x * maxX;
  const py = cy - gaze.y * maxY * blinkOpen;

  ctx.save();
  ctx.strokeStyle = TERM_GREEN;
  ctx.fillStyle = TERM_GREEN;
  ctx.lineWidth = 2;
  ctx.shadowColor = TERM_GREEN;
  ctx.shadowBlur = 6;

  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();

  if (pupilR > 0.5) {
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(px, py, pupilR, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function draw(now: number) {
  look.update(now);
  updateBlink(now);

  const goalX = look.target.detected ? look.target.x : 0;
  const goalY = look.target.detected ? look.target.y : 0;
  gaze.x += (goalX - gaze.x) * GAZE_FOLLOW;
  gaze.y += (goalY - gaze.y) * GAZE_FOLLOW;

  const w = window.innerWidth;
  const h = window.innerHeight;
  const baseY = h * (2 / 3);

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);

  drawEye(w, h);

  const live = audioRunning && audio.waveform(samples);
  const level = audioRunning ? audio.level() : 0;

  ctx.strokeStyle = TERM_GREEN;
  ctx.lineWidth = 1.5 + level * 2.2;
  ctx.shadowColor = TERM_GREEN;
  ctx.shadowBlur = 4 + level * 16;
  ctx.beginPath();

  if (!live) {
    ctx.moveTo(0, baseY);
    ctx.lineTo(w, baseY);
  } else {
    const n = samples.length;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * w;
      const y = baseY + samples[i]! * h * AMP * (1.05 + level * 0.9);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
  ctx.shadowBlur = 0;

  requestAnimationFrame(draw);
}

window.addEventListener("resize", resize);
resize();
requestAnimationFrame(draw);

void look.start();

startBtn.addEventListener("click", () => {
  void (async () => {
    try {
      await audio.start();
      audioRunning = true;
      startBtn.hidden = true;
    } catch {
      audioRunning = false;
      startBtn.hidden = false;
    }
  })();
});

window.addEventListener("beforeunload", () => {
  audio.stop();
  look.stop();
});
