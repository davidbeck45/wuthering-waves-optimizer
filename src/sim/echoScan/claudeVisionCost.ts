// Wuthering Tools+ — "Read with Claude": the image size Claude gets and what a read should cost. Split out of
// claudeVision.ts so the importer (eager, upstream's inventory modal) can show the estimate without pulling the
// reader, its schema and the API client into the main bundle: those load on the first "Read with Claude" click.
import type { AiModel } from "../ai/models";
import { costOfTokens, MODEL_PRICES } from "../ai/pricing";

/** Long edge of the image sent. Opus 5.5 reads up to 2576 px; at 1568 px the stat digits of a 3120-px phone shot
 *  are ≈14 px tall, at 2576 px ≈23 px — accuracy first (≈3.9K image tokens per phone shot). */
export const VISION_LONG_EDGE = 2576;
/** the most image tokens one image costs on the high-resolution models */
export const MAX_IMAGE_TOKENS = 4784;
/** the API's other image limit: 3.75 megapixels (a near-square tablet shot hits it before the long edge does) */
export const VISION_MAX_PIXELS = 3_750_000;
export const VISION_CONCURRENCY = 2;
/** Estimate inputs (guidance, not a quote): the system prompt + the schema with ≈230 echo names + the instruction,
 *  and the output of a low-effort read of one echo (thinking + the JSON). */
export const VISION_PROMPT_TOKENS = 2_700;
export const VISION_OUTPUT_TOKENS = 1_500;
/** the glyph pass (a crop + 2–3 small icons) on roughly half the shots without a printed set */
export const SET_PASS_ALLOWANCE = 0.1;
/** a 3120×1440 phone shot — assumed when a screenshot's size isn't known yet */
export const DEFAULT_SHOT = { width: 3120, height: 1440 } as const;

/** The size a screenshot is sent at: long edge ≤ `VISION_LONG_EDGE` and ≤ `VISION_MAX_PIXELS`, never upscaled. */
export function visionSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, VISION_LONG_EDGE / Math.max(width, height), Math.sqrt(VISION_MAX_PIXELS / (width * height)));
  let w = Math.round(width * scale);
  let h = Math.round(height * scale);
  if (w * h > VISION_MAX_PIXELS) [w, h] = [Math.floor(width * scale), Math.floor(height * scale)];
  return { width: Math.max(1, w), height: Math.max(1, h) };
}

/** Image tokens for a screenshot of this size once downscaled (`visionSize`; ≈ one token per 28×28 px). */
export function imageTokens(width: number, height: number): number {
  if (!(width > 0 && height > 0)) return MAX_IMAGE_TOKENS;
  const { width: w, height: h } = visionSize(width, height);
  return Math.min(MAX_IMAGE_TOKENS, Math.ceil((w * h) / 784));
}

export interface VisionEstimate {
  count: number;
  usd: number;
  perImageUsd: number;
  /** average image tokens per screenshot */
  imageTokens: number;
}

/** What reading these screenshots should cost at the model's list price (shown before anything is sent). */
export function estimateVisionCost(sizes: ReadonlyArray<{ width: number; height: number } | null>, model: AiModel): VisionEstimate {
  const price = MODEL_PRICES[model];
  let usd = 0;
  let tokens = 0;
  for (const size of sizes) {
    const t = imageTokens(size?.width ?? DEFAULT_SHOT.width, size?.height ?? DEFAULT_SHOT.height);
    tokens += t;
    usd += costOfTokens(price, { input: t + VISION_PROMPT_TOKENS, output: VISION_OUTPUT_TOKENS, cacheRead: 0, cacheWrite: 0 }) * (1 + SET_PASS_ALLOWANCE);
  }
  const count = sizes.length;
  return { count, usd, perImageUsd: count ? usd / count : 0, imageTokens: count ? Math.round(tokens / count) : 0 };
}
