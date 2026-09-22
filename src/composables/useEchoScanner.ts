/**
 * Orchestrates the echo screen scanner: owns whichever FrameSource is
 * active (live share or uploaded video — see src/scanner/capture.ts),
 * drives the fingerprint/stability gate, calls out to the OCR worker
 * (echoScanner.worker.ts) and the existing echo-set-icon matcher
 * (echoParser.worker.ts) on a "stable-novel" tick, and turns the result
 * into a reviewable candidate list. Vue-only glue — all matching/parsing
 * logic lives in src/scanner/*, which stays pure and unit-testable.
 */
import { onBeforeUnmount, ref, computed } from "vue";
import {
  createScreenShareSource,
  createVideoFileSource,
  openVideoFile,
  seekPreview,
  closeVideoHandle,
  grabRegionImageData,
  grabRegionBitmap,
  type FrameSource,
  type VideoFileHandle,
  type VideoScanOptions,
} from "../scanner/capture";
import { computeFingerprint } from "../scanner/fingerprint";
import { createStableFrameDetector } from "../scanner/stability";
import { createDedupeSet, computeSignature } from "../scanner/dedupe";
import { parseEchoCandidate } from "../scanner/parse";
import { PANEL_BOX, HEADER_BLOCK, STATS_BLOCK, SET_ICON_BOX, FULL_FRAME, isSupportedAspect } from "../scanner/layout";
import { echoSetImageMap } from "../echoes/stats";
import { mainEchoesData } from "../echoes/index";
import { randomString } from "../utils/strings";
import type { ScanCandidate } from "../scanner/types";
import EchoScannerWorker from "../workers/echoScanner.worker?worker";
import EchoParserWorker from "../workers/echoParser.worker?worker";

export type ScannerStatus =
  | "idle"
  | "trimming" // a video file is open and previewable, waiting for the user to confirm a range/rate and start scanning
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "error";

export function useEchoScanner() {
  const status = ref<ScannerStatus>("idle");
  const errorMessage = ref<string | null>(null);
  const candidates = ref<ScanCandidate[]>([]);
  const skippedCount = ref(0);
  const duplicateCount = ref(0);
  const progress = ref<{ current: number; total: number | null }>({ current: 0, total: null });
  const unsupportedAspect = ref(false);
  /** The FrameSource's <video> element, for the component to mount as a live preview. Not reactive data — just a handle. */
  const previewVideoEl = ref<HTMLVideoElement | null>(null);
  /** Set once a video file is open (status "trimming") — lets the trim UI show/scrub a range before scanning starts. */
  const videoDuration = ref<number | null>(null);

  const reviewNeededCount = computed(
    () =>
      candidates.value.filter(
        (c) =>
          c.confidence.name === "low" ||
          c.confidence.cost === "low" ||
          c.confidence.mainStat === "low" ||
          c.confidence.set === "low" ||
          c.confidence.substats.some((s) => s === "low"),
      ).length,
  );

  let frameSource: FrameSource | null = null;
  let openVideoHandle: VideoFileHandle | null = null;
  let ocrWorker: Worker | null = null;
  let setWorker: Worker | null = null;
  let setWorkerReady: Promise<void> | null = null;
  const stability = createStableFrameDetector();
  const dedupe = createDedupeSet();

  function resetState() {
    candidates.value = [];
    skippedCount.value = 0;
    duplicateCount.value = 0;
    progress.value = { current: 0, total: null };
    errorMessage.value = null;
    unsupportedAspect.value = false;
    stability.reset();
  }

  async function initWorkers() {
    ocrWorker = new EchoScannerWorker();
    const ocrReady = new Promise<void>((resolve) => {
      const handler = (e: MessageEvent) => {
        if (e.data?.type === "ready") {
          ocrWorker?.removeEventListener("message", handler);
          resolve();
        }
      };
      ocrWorker?.addEventListener("message", handler);
    });
    ocrWorker.postMessage({ type: "init" });

    setWorker = new EchoParserWorker();
    setWorkerReady = new Promise<void>((resolve) => {
      const handler = (e: MessageEvent) => {
        if (e.data?.type === "ready") {
          setWorker?.removeEventListener("message", handler);
          resolve();
        }
      };
      setWorker?.addEventListener("message", handler);
    });
    setWorker.postMessage({ type: "init", data: { echoReferences: [] } });

    await Promise.all([ocrReady, setWorkerReady]);
  }

  function recognizeCandidate(headerBitmap: ImageBitmap, statsBitmap: ImageBitmap) {
    const id = randomString();
    return new Promise<{ headerText: string; statsText: string }>((resolve, reject) => {
      const handler = (e: MessageEvent) => {
        if (e.data?.id !== id) return;
        ocrWorker?.removeEventListener("message", handler);
        if (e.data.type === "candidateResult") {
          resolve({ headerText: e.data.headerText, statsText: e.data.statsText });
        } else {
          reject(new Error(e.data.error ?? "OCR failed"));
        }
      };
      ocrWorker?.addEventListener("message", handler);
      ocrWorker?.postMessage(
        { type: "recognizeCandidate", id, headerBitmap, statsBitmap },
        [headerBitmap, statsBitmap],
      );
    });
  }

  async function matchSetIcon(frameBitmap: ImageBitmap, frame: { width: number; height: number }) {
    if (!setWorker) return null;
    await setWorkerReady;
    const setCoords = {
      x: Math.round(SET_ICON_BOX.x * frame.width),
      y: Math.round(SET_ICON_BOX.y * frame.height),
      width: Math.round(SET_ICON_BOX.width * frame.width),
      height: Math.round(SET_ICON_BOX.height * frame.height),
    };
    return new Promise<string | null>((resolve) => {
      const readyHandler = (e: MessageEvent) => {
        if (e.data?.type !== "ready") return;
        setWorker?.removeEventListener("message", readyHandler);
        const resultHandler = (ev: MessageEvent) => {
          if (ev.data?.type === "setMatch") {
            setWorker?.removeEventListener("message", resultHandler);
            resolve(ev.data.setMatch.setKey as string);
          } else if (ev.data?.type === "error") {
            setWorker?.removeEventListener("message", resultHandler);
            resolve(null);
          }
        };
        setWorker?.addEventListener("message", resultHandler);
        setWorker?.postMessage({
          type: "matchSetFirst",
          data: { setCoords, allSetImageUrls: echoSetImageMap },
        });
      };
      setWorker?.addEventListener("message", readyHandler);
      setWorker?.postMessage(
        { type: "setSourceImage", data: { sourceImageBitmap: frameBitmap } },
        [frameBitmap],
      );
    });
  }

  async function handleTick() {
    if (!frameSource) return;
    const frame = frameSource.frameSize();
    if (frame.width === 0 || frame.height === 0) return;

    if (!isSupportedAspect(frame)) {
      unsupportedAspect.value = true;
      return;
    }

    const panelImageData = grabRegionImageData(frameSource.videoEl, PANEL_BOX);
    const fingerprint = computeFingerprint(panelImageData);
    const event = stability.observe(fingerprint);
    if (event !== "stable-novel") return;

    try {
      const [headerBitmap, statsBitmap, frameBitmap] = await Promise.all([
        grabRegionBitmap(frameSource.videoEl, HEADER_BLOCK),
        grabRegionBitmap(frameSource.videoEl, STATS_BLOCK),
        grabRegionBitmap(frameSource.videoEl, FULL_FRAME),
      ]);

      const [{ headerText, statsText }, matchedSet] = await Promise.all([
        recognizeCandidate(headerBitmap, statsBitmap),
        matchSetIcon(frameBitmap, frame),
      ]);

      const parsed = parseEchoCandidate({ headerText, statsText, matchedSet });
      stability.commitScan(fingerprint);

      if (parsed.needsMainStatSelection) {
        skippedCount.value++;
        return;
      }

      const signature = computeSignature(parsed.slot);
      if (dedupe.has(signature)) {
        duplicateCount.value++;
        return;
      }
      dedupe.add(signature);

      candidates.value.push({
        id: randomString(),
        slot: parsed.slot,
        level: parsed.level,
        confidence: parsed.confidence,
        needsMainStatSelection: false,
        signature,
      });
    } catch (err) {
      // One bad OCR shouldn't kill the whole session — surface it via the
      // low-confidence path implicitly (candidate just won't appear) and
      // keep going. Log for diagnosis.
      console.error("Echo scanner: failed to process a candidate frame", err);
    }
  }

  function releaseResources() {
    frameSource?.stop();
    frameSource = null;
    if (openVideoHandle) {
      closeVideoHandle(openVideoHandle);
      openVideoHandle = null;
    }
    previewVideoEl.value = null;
    videoDuration.value = null;
    ocrWorker?.postMessage({ type: "terminate" });
    ocrWorker?.terminate();
    ocrWorker = null;
    setWorker?.terminate();
    setWorker = null;
  }

  function stop() {
    status.value = "stopping";
    releaseResources();
    status.value = "stopped";
  }

  async function startLive() {
    resetState();
    status.value = "starting";
    try {
      await initWorkers();
      frameSource = await createScreenShareSource();
      previewVideoEl.value = frameSource.videoEl;
      status.value = "running";
      frameSource.start((tick) => {
        progress.value = { current: tick.frameIndex, total: null };
        return handleTick();
      });
    } catch (err) {
      errorMessage.value = err instanceof Error ? err.message : String(err);
      status.value = "error";
    }
  }

  /** Opens a video file and shows a preview so the user can trim a range and pick a sample rate before scanning — see docs/scanner.md. */
  async function openVideo(file: File) {
    resetState();
    status.value = "starting";
    try {
      const handle = await openVideoFile(file);
      openVideoHandle = handle;
      previewVideoEl.value = handle.videoEl;
      videoDuration.value = handle.duration;
      status.value = "trimming";
    } catch (err) {
      errorMessage.value = err instanceof Error ? err.message : String(err);
      status.value = "error";
    }
  }

  /** Scrubs the trim preview to a timestamp without starting a scan. Only valid while status is "trimming". */
  async function previewSeek(timeSeconds: number) {
    if (!openVideoHandle) return;
    await seekPreview(openVideoHandle, timeSeconds);
  }

  /** Discards an opened-but-not-yet-scanned video file (the trim step's "Cancel"). */
  function cancelVideo() {
    if (openVideoHandle) {
      closeVideoHandle(openVideoHandle);
      openVideoHandle = null;
    }
    previewVideoEl.value = null;
    videoDuration.value = null;
    status.value = "idle";
  }

  /** Starts scanning the already-open, already-trimmed video — the "scanVideo" half. */
  async function startVideoScan(options: VideoScanOptions = {}) {
    if (!openVideoHandle) return;
    const handle = openVideoHandle;
    status.value = "starting";
    try {
      await initWorkers();
      frameSource = createVideoFileSource(handle, options);
      openVideoHandle = null; // ownership moves to frameSource — its own stop() closes the handle
      status.value = "running";
      await frameSource.start(async (tick) => {
        progress.value = { current: tick.frameIndex, total: tick.totalFrames };
        await handleTick();
      });
      releaseResources();
      status.value = "stopped";
    } catch (err) {
      errorMessage.value = err instanceof Error ? err.message : String(err);
      status.value = "error";
    }
  }

  function removeCandidate(id: string) {
    candidates.value = candidates.value.filter((c) => c.id !== id);
  }

  function updateCandidate(id: string, updater: (candidate: ScanCandidate) => ScanCandidate) {
    candidates.value = candidates.value.map((c) => (c.id === id ? updater(c) : c));
  }

  onBeforeUnmount(() => {
    if (status.value === "running" || status.value === "starting" || status.value === "trimming") {
      stop();
    }
  });

  return {
    status,
    errorMessage,
    candidates,
    skippedCount,
    duplicateCount,
    reviewNeededCount,
    progress,
    unsupportedAspect,
    previewVideoEl,
    videoDuration,
    isEchoNameKnown: (key: string) => Boolean(mainEchoesData?.[key]),
    startLive,
    openVideo,
    previewSeek,
    cancelVideo,
    startVideoScan,
    stop,
    removeCandidate,
    updateCandidate,
  };
}
