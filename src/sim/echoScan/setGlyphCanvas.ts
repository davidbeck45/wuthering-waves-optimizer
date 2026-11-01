// Wuthering Tools+: the canvas half of the set-icon reader (setGlyph.ts is the pure half). Templates are the
// app's own set icons (`echoSetImageMap`, 76 × 76 webp on the assets CDN, which sends CORS headers), decoded
// once per session; the screenshot's search window is read at 1:1 from the bitmap the scanner already holds.
// No worker: the whole match is a few milliseconds on the main thread.
import { echoSetImageMap } from "../../echoes/stats";
import type { Region } from "./phoneEchoScan";
import { badgeFeature, iconFeature, matchGlyph, type GlyphFeature, type GlyphMatch, type Pixels } from "./setGlyph";

const templates = new Map<string, Promise<GlyphFeature | null>>();

function pixelsOf(source: CanvasImageSource, region: Region): Pixels {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, region.width);
  canvas.height = Math.max(1, region.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d canvas context");
  ctx.drawImage(source, region.x, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { data: image.data, width: image.width, height: image.height, channels: 4 };
}

async function loadTemplate(set: string): Promise<GlyphFeature | null> {
  const url = echoSetImageMap[set];
  if (!url) return null;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`set icon ${set}: ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob());
  try {
    return iconFeature(pixelsOf(bitmap, { x: 0, y: 0, width: bitmap.width, height: bitmap.height }));
  } finally {
    bitmap.close();
  }
}

/** The candidate sets' templates (a failed download is retried on the next call). */
export async function setTemplates(sets: readonly string[]): Promise<Record<string, GlyphFeature>> {
  const out: Record<string, GlyphFeature> = {};
  await Promise.all(
    sets.map(async (set) => {
      let pending = templates.get(set);
      if (!pending) {
        pending = loadTemplate(set);
        templates.set(set, pending);
      }
      try {
        const feature = await pending;
        if (feature) out[set] = feature;
      } catch {
        templates.delete(set);
      }
    }),
  );
  return out;
}

/**
 * Reads the set icon right of "+25": `searchWindow` is the layout's search window (screenshot pixels), `scale` the
 * screenshot's width / 3120. Null when no icon is found or no candidate's template could be loaded.
 */
export async function matchSetIcon(source: CanvasImageSource, searchWindow: Region, scale: number, candidates: readonly string[]): Promise<GlyphMatch | null> {
  const badge = badgeFeature(pixelsOf(source, searchWindow), scale);
  if (!badge) return null;
  return matchGlyph(badge.feature, await setTemplates(candidates), candidates);
}
