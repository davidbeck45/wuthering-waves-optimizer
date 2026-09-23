/**
 * Echo Scanner OCR Worker
 *
 * Purely mechanical: given a named list of ImageBitmap crops, preprocess
 * and recognize each and return the raw text per key. All echo-data
 * lookups, name/stat matching, and value snapping happen on the main
 * thread in src/scanner/parse.ts — this worker doesn't import
 * src/echoes/*, keeping the "workers receive/return plain serializable
 * objects only" rule simple to hold to.
 *
 * One region per named crop (header, main stat, fixed secondary, and each
 * of up to 5 individually-cropped substat rows — see layout.ts) rather
 * than one big multi-line block, mirroring CalculatorEchoParser.vue's
 * proven-reliable per-row Discord-bot-image approach: a crop that can only
 * contain one row's text can't have that row's text merged into or lost
 * behind a neighboring row the way a whole block's line segmentation can.
 *
 * Uses a small pool of self-hosted tesseract.js workers (public/tesseract/)
 * so a candidate's several row crops OCR in parallel, and so scanning
 * works without depending on a CDN.
 *
 * Message flow:
 *  {type:"init"} -> {type:"ready"}
 *  {type:"recognizeCandidate", id, regions: {key, bitmap}[]} ->
 *    {type:"candidateResult", id, texts: Record<key, string>}
 *  {type:"terminate"}
 */
import { createWorker, type Worker as TesseractWorker } from "tesseract.js";

const CHAR_WHITELIST =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜàáâãäåèéêëìíîïòóôõöùúûü0123456789.:,-'+% ";
const PSM_SINGLE_BLOCK = 6;
/** Header + main + secondary + up to 5 substats = up to 8 crops per candidate, up from 2 when this was two big blocks — a bigger pool keeps per-candidate latency down. */
const POOL_SIZE = 3;

type Region = { key: string; bitmap: ImageBitmap };

type RecognizeCandidateMessage = {
  type: "init" | "recognizeCandidate" | "terminate";
  id?: string;
  regions?: Region[];
};

let pool: TesseractWorker[] = [];
let nextWorkerIndex = 0;

// tesseract.js spawns its own nested worker by wrapping workerPath in a
// `Blob` and calling `importScripts()` from *inside* that blob's own
// `blob:` context (its `workerBlobURL` default). A path-absolute URL like
// "/tesseract/worker.min.js" fails to resolve against a blob: base in that
// nested context ("Failed to execute 'importScripts' ... URL is invalid"),
// even though it resolves fine as a normal fetch from this worker itself —
// self.location.origin is unaffected by that nesting, so build fully
// qualified URLs instead. (The Discord-bot importer's tesseract.js usage
// never hit this because it uses tesseract's default CDN path, which is
// already a full https:// URL.)
const TESSERACT_ASSET_ORIGIN = self.location.origin;

async function createPooledWorker(): Promise<TesseractWorker> {
  const worker = await createWorker("eng", 1, {
    workerPath: `${TESSERACT_ASSET_ORIGIN}/tesseract/worker.min.js`,
    corePath: `${TESSERACT_ASSET_ORIGIN}/tesseract/tesseract-core-simd-lstm.wasm.js`,
    langPath: `${TESSERACT_ASSET_ORIGIN}/tesseract`,
    gzip: true,
  });
  await worker.setParameters({
    tessedit_char_whitelist: CHAR_WHITELIST,
    tessedit_pageseg_mode: PSM_SINGLE_BLOCK as never,
  });
  return worker;
}

async function initPool() {
  pool = await Promise.all(Array.from({ length: POOL_SIZE }, createPooledWorker));
}

function nextWorker(): TesseractWorker {
  const worker = pool[nextWorkerIndex % pool.length];
  nextWorkerIndex++;
  return worker;
}

/** Grayscale + contrast stretch + 3x upscale — same recipe CalculatorEchoParser.vue already uses for the Discord-bot flow, just on OffscreenCanvas. */
function preprocess(bitmap: ImageBitmap): OffscreenCanvas {
  const scale = 3;
  const canvas = new OffscreenCanvas(bitmap.width * scale, bitmap.height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Couldn't get an OffscreenCanvas 2d context.");
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.5 + 128));
    data[i] = contrasted;
    data[i + 1] = contrasted;
    data[i + 2] = contrasted;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

async function recognizeBitmap(bitmap: ImageBitmap): Promise<string> {
  const canvas = preprocess(bitmap);
  const worker = nextWorker();
  const blob = await canvas.convertToBlob();
  const result = await worker.recognize(blob);
  return result.data.text.trim();
}

self.addEventListener("message", (event: MessageEvent<RecognizeCandidateMessage>) => {
  const { data } = event;
  void handleMessage(data);
});

async function handleMessage(data: RecognizeCandidateMessage) {
  try {
    if (data.type === "init") {
      await initPool();
      self.postMessage({ type: "ready" });
      return;
    }

    if (data.type === "recognizeCandidate") {
      if (!data.regions?.length) {
        throw new Error("Missing regions for recognizeCandidate");
      }
      const regions = data.regions;
      const recognized = await Promise.all(
        regions.map((region) => recognizeBitmap(region.bitmap)),
      );
      for (const region of regions) region.bitmap.close();

      const texts: Record<string, string> = {};
      regions.forEach((region, i) => {
        texts[region.key] = recognized[i];
      });
      self.postMessage({ type: "candidateResult", id: data.id, texts });
      return;
    }

    if (data.type === "terminate") {
      await Promise.all(pool.map((worker) => worker.terminate()));
      pool = [];
      return;
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      id: data.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
