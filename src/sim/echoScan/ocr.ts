// Wuthering Tools+: tesseract.js wrapper for the phone-screenshot echo scanner.
// One worker per batch; regions are cropped, scaled and preprocessed on a canvas
// before recognition (the in-game text is light on a dark panel). Besides plain
// text it returns word boxes, which the geometry-first stat-table reader needs.
import { createWorker } from "tesseract.js";
import type { Region, Word } from "./phoneEchoScan";

type TessWorker = Awaited<ReturnType<typeof createWorker>>;

/** tesseract page-segmentation modes we use (numeric values of Tesseract.PSM) */
export const PSM = { SINGLE_BLOCK: 6, SINGLE_LINE: 7 } as const;

export interface OcrOptions {
  /** crop up-scaling before recognition */
  scale?: number;
  psm?: number;
  /** threshold = black text on white (default); invert = inverted greyscale; plain = greyscale; color = the pixels as they are */
  mode?: "threshold" | "invert" | "plain" | "color";
  /** 0..1 luma cut for `threshold` */
  threshold?: number;
  /** characters tesseract may emit for this call (default: letters, digits and stat punctuation) */
  whitelist?: string;
}

const DEFAULT_WHITELIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.%+:-'’ ";

export class EchoOcr {
  private worker: TessWorker | null = null;
  private psm: number | null = null;
  private whitelist: string | null = null;

  async init(): Promise<void> {
    this.worker = await createWorker("eng");
    await this.setParams(PSM.SINGLE_LINE, DEFAULT_WHITELIST);
  }

  private async setParams(psm: number, whitelist: string): Promise<void> {
    if (!this.worker) throw new Error("OCR worker not initialised");
    const params: Record<string, string> = {};
    if (this.psm !== psm) params.tessedit_pageseg_mode = String(psm);
    if (this.whitelist !== whitelist) params.tessedit_char_whitelist = whitelist;
    if (Object.keys(params).length) await this.worker.setParameters(params as never);
    this.psm = psm;
    this.whitelist = whitelist;
  }

  /** Crops `region` out of `source` onto a canvas, scaled and preprocessed per `options`. */
  private prepare(source: CanvasImageSource, region: Region, options: OcrOptions): HTMLCanvasElement {
    const { scale = 1.5, mode = "threshold", threshold = 0.55 } = options;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(region.width * scale));
    canvas.height = Math.max(1, Math.round(region.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d canvas context");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, region.x, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height);
    if (mode === "color") return canvas;
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
    return canvas;
  }

  /** Crops `region` out of `source`, preprocesses it and returns the recognised text. */
  async recognize(source: CanvasImageSource, region: Region, options: OcrOptions = {}): Promise<string> {
    if (!this.worker) throw new Error("OCR worker not initialised");
    const canvas = this.prepare(source, region, options);
    await this.setParams(options.psm ?? PSM.SINGLE_LINE, options.whitelist ?? DEFAULT_WHITELIST);
    const result = await this.worker.recognize(canvas);
    return result.data.text;
  }

  /** Like `recognize`, but also returns every word with its box in `region` pixels (the stat table's block pass). */
  async recognizeWords(source: CanvasImageSource, region: Region, options: OcrOptions = {}): Promise<{ text: string; words: Word[] }> {
    if (!this.worker) throw new Error("OCR worker not initialised");
    const scale = options.scale ?? 1.5;
    const canvas = this.prepare(source, region, { ...options, scale });
    await this.setParams(options.psm ?? PSM.SINGLE_BLOCK, options.whitelist ?? DEFAULT_WHITELIST);
    const result = await this.worker.recognize(canvas, {}, { text: true, blocks: true });
    const words: Word[] = [];
    for (const block of result.data.blocks ?? []) {
      for (const paragraph of block.paragraphs) {
        for (const line of paragraph.lines) {
          for (const word of line.words) {
            const text = word.text.trim();
            if (!text) continue;
            words.push({
              x: Math.round(word.bbox.x0 / scale),
              y: Math.round(word.bbox.y0 / scale),
              width: Math.round((word.bbox.x1 - word.bbox.x0) / scale),
              height: Math.round((word.bbox.y1 - word.bbox.y0) / scale),
              conf: word.confidence,
              text,
            });
          }
        }
      }
    }
    return { text: result.data.text, words };
  }

  async terminate(): Promise<void> {
    await this.worker?.terminate();
    this.worker = null;
  }
}
