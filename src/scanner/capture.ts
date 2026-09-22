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

export function seekTo(videoEl: HTMLVideoElement, timeSeconds: number): Promise<void> {
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

/**
 * A loaded-but-not-yet-scanning video file: metadata is known and the first
 * frame is ready to preview, so the caller (EchoScannerCapture.vue) can show
 * a trim range + sample-rate picker before committing to a scan — same
 * open → preview/trim → scan split as the Tacet-Lab reference UI
 * (ScannerView.tsx's openVideo/scanVideo). Call seekPreview to scrub the
 * mounted preview while trimming, and either createVideoFileSource (to
 * start scanning) or closeVideoHandle (to abandon it) when done.
 */
export type VideoFileHandle = {
  videoEl: HTMLVideoElement;
  duration: number;
  objectUrl: string;
};

export async function openVideoFile(file: File): Promise<VideoFileHandle> {
  const objectUrl = URL.createObjectURL(file);
  const videoEl = createVideoElement();
  videoEl.src = objectUrl;

  await new Promise<void>((resolve, reject) => {
    videoEl.addEventListener("loadedmetadata", () => resolve(), { once: true });
    videoEl.addEventListener(
      "error",
      () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Couldn't read this video file. Try exporting it as mp4."));
      },
      { once: true },
    );
  });

  return { videoEl, duration: videoEl.duration, objectUrl };
}

/** Scrubs the handle's (already-mounted-for-preview) video element to a timestamp, without starting a scan. */
export function seekPreview(handle: VideoFileHandle, timeSeconds: number): Promise<void> {
  return seekTo(handle.videoEl, Math.max(0, Math.min(handle.duration, timeSeconds)));
}

export function closeVideoHandle(handle: VideoFileHandle): void {
  handle.videoEl.pause();
  URL.revokeObjectURL(handle.objectUrl);
  handle.videoEl.remove();
}

export type VideoScanOptions = {
  /** Defaults to the whole clip. */
  startSeconds?: number;
  endSeconds?: number;
  /** Samples per second of video, converted to a seek step. Tacet-Lab defaults to 2fps; we match that. */
  fps?: number;
};

const DEFAULT_VIDEO_FPS = 1000 / DEFAULT_VIDEO_STEP_MS; // 2.5, if fps isn't given

/** Starts scanning an already-open handle over [startSeconds, endSeconds] at the given sample rate — the "scanVideo" half of the open/trim/scan split. */
export function createVideoFileSource(
  handle: VideoFileHandle,
  options: VideoScanOptions = {},
): FrameSource {
  const { videoEl } = handle;
  const stepSeconds = 1 / (options.fps ?? DEFAULT_VIDEO_FPS);
  const startSeconds = Math.max(0, Math.min(handle.duration, options.startSeconds ?? 0));
  const endSeconds = Math.max(startSeconds, Math.min(handle.duration, options.endSeconds ?? handle.duration));

  let stopped = false;

  function stop() {
    stopped = true;
    closeVideoHandle(handle);
  }

  async function start(onTick: (tick: FrameTick) => void | Promise<void>) {
    const totalFrames = Math.max(1, Math.ceil((endSeconds - startSeconds) / stepSeconds));
    let frameIndex = 0;
    let t = startSeconds;
    while (!stopped && t <= endSeconds) {
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

/**
 * Same crop as grabRegionBitmap, but also returns a `data:` URL preview of
 * exactly the same pixels — for the scanner's debug view (see
 * EchoScannerCapture.vue), so what the user sees is provably the same crop
 * the worker actually OCR's, not a re-derived approximation. Only called
 * when debug mode is on — the extra `toDataURL()` encode isn't free, so
 * normal scanning stays on the plain grabRegionBitmap path.
 */
export async function grabRegionWithPreview(
  videoEl: HTMLVideoElement,
  regionFrac: RegionFrac,
): Promise<{ bitmap: ImageBitmap; dataUrl: string }> {
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
  // createImageBitmap doesn't consume the canvas, so both come from one draw.
  const bitmap = await createImageBitmap(canvas);
  const dataUrl = canvas.toDataURL("image/png");
  return { bitmap, dataUrl };
}

/**
 * A downscaled snapshot of the *whole* frame — for the scanner's debug
 * view (EchoScannerCapture.vue) to draw every ROI box on top of, as one
 * reviewable image per candidate rather than only the small per-region
 * crops. Downscaled (default 960px wide, matching the source's aspect) so
 * a long debug session's candidate list doesn't hold a full-resolution PNG
 * per echo — the boxes are still perfectly placeable on it since they're
 * positioned by CSS percentage, not pixels.
 */
export async function grabFullFrameSnapshot(
  videoEl: HTMLVideoElement,
  maxWidth = 960,
): Promise<string> {
  const frame: FrameSize = { width: videoEl.videoWidth, height: videoEl.videoHeight };
  const scale = Math.min(1, maxWidth / frame.width);
  const width = Math.round(frame.width * scale);
  const height = Math.round(frame.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't get a 2d canvas context.");
  ctx.drawImage(videoEl, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.85);
}
