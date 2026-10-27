// Wuthering Tools+ — the browser half of "Read with Claude": a screenshot file → the downscaled JPEG Claude reads
// (long edge ≤ 2576 px and ≤ 3.75 MP, `visionSize`), a small thumbnail for the review table, and crops of the full-resolution
// screenshot for the set-glyph pass. Canvas work only; claudeVision.ts stays pure.
import type { Box, PreparedImage } from "./claudeVision";
import { visionSize } from "./claudeVisionCost";

/** a crop is enlarged until its long edge is about this (a 48-px glyph becomes ≈ 190 px) */
const CROP_LONG_EDGE = 384;
/** a glyph box is padded to this many times its size, and at least this share of the short side */
const CROP_PAD = 4;
const CROP_MIN_SHARE = 0.06;

function canvasOf(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("this browser can't draw the screenshot (no 2D canvas)");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return { canvas, ctx };
}

async function base64Of(canvas: HTMLCanvasElement, type: "image/jpeg" | "image/png", quality?: number): Promise<string> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob) throw new Error("the screenshot couldn't be encoded");
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** A box (fractions of the image) padded around its centre and clamped to the image, in source pixels. */
export function glyphCropRegion(box: Box, width: number, height: number): { x: number; y: number; width: number; height: number } {
  const side = Math.max(Math.max(box.width * width, box.height * height) * CROP_PAD, Math.min(width, height) * CROP_MIN_SHARE);
  const cx = (box.x + box.width / 2) * width;
  const cy = (box.y + box.height / 2) * height;
  const w = Math.min(width, Math.round(side));
  const h = Math.min(height, Math.round(side));
  const x = Math.round(Math.min(Math.max(0, cx - w / 2), width - w));
  const y = Math.round(Math.min(Math.max(0, cy - h / 2), height - h));
  return { x, y, width: w, height: h };
}

/** A screenshot's pixel size (for the cost estimate) and a thumbnail, without keeping it decoded. */
export async function probeImage(file: Blob): Promise<{ width: number; height: number; thumb: string | null } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const probe = { width: bitmap.width, height: bitmap.height, thumb: thumbOf(bitmap) };
    bitmap.close();
    return probe;
  } catch {
    return null;
  }
}

/** A 96-px-wide JPEG data URL of the whole screenshot (the review table's thumbnail). */
function thumbOf(bitmap: ImageBitmap): string | null {
  try {
    const width = 96;
    const height = Math.max(1, Math.round((width * bitmap.height) / bitmap.width));
    const { canvas, ctx } = canvasOf(width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return null;
  }
}

export interface PreparedScreenshot extends PreparedImage {
  thumb: string | null;
}

/** Decode → downscale to the long edge → JPEG base64; `crop` cuts from the full-resolution screenshot until `dispose`. */
export async function prepareVisionImage(file: Blob): Promise<PreparedScreenshot> {
  const bitmap = await createImageBitmap(file);
  try {
    const sourceWidth = bitmap.width;
    const sourceHeight = bitmap.height;
    const { width, height } = visionSize(sourceWidth, sourceHeight);
    const { canvas, ctx } = canvasOf(width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const data = await base64Of(canvas, "image/jpeg", 0.92);
    let disposed = false;
    return {
      data,
      mediaType: "image/jpeg",
      width,
      height,
      sourceWidth,
      sourceHeight,
      thumb: thumbOf(bitmap),
      async crop(box: Box): Promise<PreparedImage | null> {
        if (disposed) return null;
        const r = glyphCropRegion(box, sourceWidth, sourceHeight);
        if (r.width < 4 || r.height < 4) return null;
        const up = Math.max(1, CROP_LONG_EDGE / Math.max(r.width, r.height));
        const w = Math.round(r.width * up);
        const h = Math.round(r.height * up);
        const c = canvasOf(w, h);
        c.ctx.drawImage(bitmap, r.x, r.y, r.width, r.height, 0, 0, w, h);
        return { data: await base64Of(c.canvas, "image/png"), mediaType: "image/png", width: w, height: h, sourceWidth: r.width, sourceHeight: r.height };
      },
      dispose(): void {
        if (disposed) return;
        disposed = true;
        bitmap.close();
      },
    };
  } catch (error) {
    bitmap.close();
    throw error;
  }
}
