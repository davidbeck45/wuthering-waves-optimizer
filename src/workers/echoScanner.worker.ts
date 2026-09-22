/**
 * Echo Scanner OCR Worker
 *
 * Purely mechanical: given an ImageBitmap crop, preprocess it and return
 * the recognized text. All echo-data lookups, name/stat matching, and
 * value snapping happen on the main thread in src/scanner/parse.ts — this
 * worker doesn't import src/echoes/*, keeping the "workers receive/return
 * plain serializable objects only" rule simple to hold to.
 *
 * Uses a small pool of self-hosted tesseract.js workers (public/tesseract/)
 * so header and stats-block crops for one candidate OCR in parallel, and so
 * scanning works without depending on a CDN.
 *
 * Message flow:
 *  {type:"init"} -> {type:"ready"}
 *  {type:"recognizeCandidate", id, headerBitmap, statsBitmap} ->
 *    {type:"candidateResult", id, headerText, statsText}
 *  {type:"terminate"}
 */
import { createWorker, type Worker as TesseractWorker } from "tesseract.js";

const CHAR_WHITELIST =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜàáâãäåèéêëìíîïòóôõöùúûü0123456789.:,-'+% ";
const PSM_SINGLE_BLOCK = 6;

type RecognizeCandidateMessage = {
  type: "init" | "recognizeCandidate" | "terminate";
  id?: string;
  headerBitmap?: ImageBitmap;
  statsBitmap?: ImageBitmap;
};

let pool: TesseractWorker[] = [];
let nextWorkerIndex = 0;

async function createPooledWorker(): Promise<TesseractWorker> {
  const worker = await createWorker("eng", 1, {
    workerPath: "/tesseract/worker.min.js",
    corePath: "/tesseract/tesseract-core-simd-lstm.wasm.js",
    langPath: "/tesseract",
    gzip: true,
  });
  await worker.setParameters({
    tessedit_char_whitelist: CHAR_WHITELIST,
    tessedit_pageseg_mode: PSM_SINGLE_BLOCK as never,
  });
  return worker;
}

async function initPool() {
  pool = await Promise.all([createPooledWorker(), createPooledWorker()]);
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
      if (!data.headerBitmap || !data.statsBitmap) {
        throw new Error("Missing bitmaps for recognizeCandidate");
      }
      const [headerText, statsText] = await Promise.all([
        recognizeBitmap(data.headerBitmap),
        recognizeBitmap(data.statsBitmap),
      ]);
      data.headerBitmap.close();
      data.statsBitmap.close();
      self.postMessage({ type: "candidateResult", id: data.id, headerText, statsText });
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
