/**
 * FrameSource abstraction: both the live screen-share path and the
 * upload-a-video path resolve to the same thing downstream — an
 * HTMLVideoElement the caller can grab region crops from on each "tick".
 * Only *how* a tick is driven differs:
 *  - live: a fixed-interval timer (real time, ~8fps) over a getDisplayMedia
 *    MediaStream.
 *  - video-file: a deterministic seek-and-capture loop over an uploaded
 *    File, decoupled from real elapsed time — faster than live, and never
 *    drops a frame to decode/timer jitter the way a live capture can.
 * fingerprint.ts, stability.ts, layout.ts, parse.ts, dedupe.ts are
 * unaffected by which source is active.
 */
import type { FrameSize, RegionFrac } from "./types";
import { toPixelRegion } from "./layout";

export type FrameSourceMode = "live" | "video-file";

export type FrameTick = {
  frameIndex: number;
  /** Known upfront for video-file (duration / step); null for live (unbounded). */
  totalFrames: number | null;
};

export type FrameSource = {
  mode: FrameSourceMode;
  videoEl: HTMLVideoElement;
  frameSize(): FrameSize;
  start(onTick: (tick: FrameTick) => void | Promise<void>): void;
  stop(): void;
};

const LIVE_TICK_MS = 125; // ~8fps
const DEFAULT_VIDEO_STEP_MS = 400;

/**
 * Deliberately left detached from the document — decoding/drawImage works
 * fine on an unattached <video> in Chrome/Edge, and it keeps this module
 * DOM-tree-agnostic. The caller (EchoScannerCapture.vue) mounts this
 * element into a visible container for the live preview; canvas cropping
 * (grabRegionImageData/grabRegionBitmap below) doesn't need it mounted at all.
 */
function createVideoElement(): HTMLVideoElement {
  const videoEl = document.createElement("video");
  videoEl.muted = true;
  videoEl.playsInline = true;
  return videoEl;
}

export async function createScreenShareSource(): Promise<FrameSource> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Screen sharing isn't supported in this browser.");
  }
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: 8, max: 12 } },
    audio: false,
  });

  const videoEl = createVideoElement();
  videoEl.srcObject = stream;
  await videoEl.play();

  let intervalId: ReturnType<typeof setInterval> | null = null;
  let frameIndex = 0;
  let ticking = false;

  function stop() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    for (const track of stream.getTracks()) track.stop();
    videoEl.srcObject = null;
    videoEl.remove();
  }

  // The user can end the share from the browser's own "Stop sharing" UI,
  // not just our Stop button — react to that the same way.
  stream.getVideoTracks()[0]?.addEventListener("ended", stop);

  function start(onTick: (tick: FrameTick) => void | Promise<void>) {
    intervalId = setInterval(() => {
      if (ticking) return; // skip a tick if OCR from the previous one is still running
      ticking = true;
      void Promise.resolve(onTick({ frameIndex: frameIndex++, totalFrames: null })).finally(
        () => {
          ticking = false;
        },
      );
    }, LIVE_TICK_MS);
  }

  return {
    mode: "live",
    videoEl,
    frameSize: () => ({ width: videoEl.videoWidth, height: videoEl.videoHeight }),
    start,
    stop,
  };
}

function seekTo(videoEl: HTMLVideoElement, timeSeconds: number): Promise<void> {
  if (Math.abs(videoEl.currentTime - timeSeconds) < 0.001) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const onSeeked = () => {
      videoEl.removeEventListener("seeked", onSeeked);
      resolve();
    };
    videoEl.addEventListener("seeked", onSeeked);
    videoEl.currentTime = timeSeconds;
  });
}

export async function createVideoFileSource(
  file: File,
  options: { stepMs?: number } = {},
): Promise<FrameSource> {
  const stepSeconds = (options.stepMs ?? DEFAULT_VIDEO_STEP_MS) / 1000;
  const objectUrl = URL.createObjectURL(file);
  const videoEl = createVideoElement();
  videoEl.src = objectUrl;

  await new Promise<void>((resolve, reject) => {
    videoEl.addEventListener("loadedmetadata", () => resolve(), { once: true });
    videoEl.addEventListener(
      "error",
      () => reject(new Error("Couldn't read this video file. Try exporting it as mp4.")),
      { once: true },
    );
  });

  let stopped = false;

  function stop() {
    stopped = true;
    videoEl.pause();
    URL.revokeObjectURL(objectUrl);
    videoEl.remove();
  }

  async function start(onTick: (tick: FrameTick) => void | Promise<void>) {
    const duration = videoEl.duration;
    const totalFrames = Math.max(1, Math.ceil(duration / stepSeconds));
    let frameIndex = 0;
    let t = 0;
    while (!stopped && t <= duration) {
      await seekTo(videoEl, t);
      if (stopped) break;
      await onTick({ frameIndex, totalFrames });
      frameIndex++;
      t += stepSeconds;
    }
    stopped = true;
  }

  return {
    mode: "video-file",
    videoEl,
    frameSize: () => ({ width: videoEl.videoWidth, height: videoEl.videoHeight }),
    start,
    stop,
  };
}

/** Draws one region of the current video frame to a right-sized canvas and reads it back as ImageData — used for the cheap fingerprint gate. */
export function grabRegionImageData(
  videoEl: HTMLVideoElement,
  regionFrac: RegionFrac,
): ImageData {
  const frame: FrameSize = { width: videoEl.videoWidth, height: videoEl.videoHeight };
  const region = toPixelRegion(regionFrac, frame);
  const canvas = document.createElement("canvas");
  canvas.width = region.width;
  canvas.height = region.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Couldn't get a 2d canvas context.");
  ctx.drawImage(
    videoEl,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    region.width,
    region.height,
  );
  return ctx.getImageData(0, 0, region.width, region.height);
}

/** Same crop, but as a transferable ImageBitmap — for handing a region off to the OCR worker. */
export async function grabRegionBitmap(
  videoEl: HTMLVideoElement,
  regionFrac: RegionFrac,
): Promise<ImageBitmap> {
  const frame: FrameSize = { width: videoEl.videoWidth, height: videoEl.videoHeight };
  const region = toPixelRegion(regionFrac, frame);
  const canvas = document.createElement("canvas");
  canvas.width = region.width;
  canvas.height = region.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't get a 2d canvas context.");
  ctx.drawImage(
    videoEl,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    region.width,
    region.height,
  );
  return createImageBitmap(canvas);
}
