// Wuthering Tools+: tesseract.js wrapper for the phone-screenshot echo scanner.
// One worker per batch; regions are cropped, scaled and binarised on a canvas
// before recognition (the in-game text is light on a dark panel).
import { createWorker } from "tesseract.js";
import type { Region } from "./phoneEchoScan";

type TessWorker = Awaited<ReturnType<typeof createWorker>>;

/** tesseract page-segmentation modes we use (numeric values of Tesseract.PSM) */
export const PSM = { SINGLE_BLOCK: 6, SINGLE_LINE: 7 } as const;

export interface OcrOptions {
  /** crop up-scaling before recognition */
  scale?: number;
  psm?: number;
  /** threshold = black text on white (default); invert = inverted greyscale; plain = greyscale */
  mode?: "threshold" | "invert" | "plain";
  /** 0..1 luma cut for `threshold` */
  threshold?: number;
}

const WHITELIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.%+:-'’ ";

export class EchoOcr {
  private worker: TessWorker | null = null;
  private psm: number | null = null;

  async init(): Promise<void> {
    this.worker = await createWorker("eng");
    await this.worker.setParameters({ tessedit_char_whitelist: WHITELIST });
  }

  /** Crops `region` out of `source`, preprocesses it and returns the recognised text. */
  async recognize(source: CanvasImageSource, region: Region, options: OcrOptions = {}): Promise<string> {
    if (!this.worker) throw new Error("OCR worker not initialised");
    const { scale = 1.5, psm = PSM.SINGLE_LINE, mode = "threshold", threshold = 0.55 } = options;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(region.width * scale));
    canvas.height = Math.max(1, Math.round(region.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d canvas context");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, region.x, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = image.data;
    const cut = threshold * 255;
    for (let i = 0; i < d.length; i += 4) {
      const luma = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const v = mode === "threshold" ? (luma >= cut ? 0 : 255) : mode === "invert" ? 255 - luma : luma;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    if (this.psm !== psm) {
      await this.worker.setParameters({ tessedit_pageseg_mode: String(psm) as never });
      this.psm = psm;
    }
    const result = await this.worker.recognize(canvas);
    return result.data.text;
  }

  async terminate(): Promise<void> {
    await this.worker?.terminate();
    this.worker = null;
  }
}
