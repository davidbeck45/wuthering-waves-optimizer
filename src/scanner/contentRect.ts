/**
 * Finds where the game itself sits inside a captured frame, so layout.ts's
 * ROI fractions are applied to the game's own area instead of the whole
 * capture. See docs/scanner.md's "Aspect ratios".
 *
 * Captures don't always contain only the game. The rejected sizes seen in
 * beta analytics are standard 16:9/16:10 game windows plus window chrome:
 * 1762x1022 is 1760x990 (16:9) plus a 32px title bar and 1px borders,
 * 1368x800 is 1366x768 plus the same, and 860x498 is 1762x1022 downscaled.
 * A 16:9 game shown full screen on a 16:10 display arrives with black bars
 * instead.
 *
 * Both cases are found by geometry first: the game's area must come out at
 * a known game aspect (16:10 or 16:9). Pixels only confirm it (bars are
 * near-black, a title bar is mostly flat). Anything that doesn't fit either
 * shape is treated as all game, which is the old behavior.
 *
 * Pure: runs over raw RGBA so it's unit-testable without a canvas, like
 * capture.ts's detectIconBounds.
 */
import type { FrameSize, RegionFrac } from "./types";

export type ContentKind = "full" | "titlebar" | "letterbox";

export type ContentDetection = {
  /** The game's area, as fractions of the captured frame. */
  rect: RegionFrac;
  kind: ContentKind;
};

/** Aspects WuWa actually renders at — the game area must come out at one of these. */
const GAME_ASPECTS = [16 / 10, 16 / 9];
/** A trimmed area counts as a game aspect within this much (covers downscale rounding and 1px borders). */
const GAME_ASPECT_TOLERANCE = 0.02;
/** Pixels darker than this count as black (video compression lifts pure black a little). */
const BLACK_LUMA = 20;
/** A bar row/column must be at least this share black. */
const BAR_BLACK_SHARE = 0.98;
/** Black bars from centering differ by a pixel or two at most; allow 1% of the frame. */
const BAR_SYMMETRY = 0.01;
/** A title bar is 0.5%–7% of the frame height (about 23–40px at 100–150% scaling on common sizes). */
const TITLEBAR_MIN = 0.005;
const TITLEBAR_MAX = 0.07;
/** Luma standard deviation below which the title bar's middle counts as flat. */
const TITLEBAR_MAX_STD = 12;

const FULL: RegionFrac = { x: 0, y: 0, width: 1, height: 1 };

function isGameAspect(aspect: number): boolean {
  return GAME_ASPECTS.some((a) => Math.abs(aspect - a) < GAME_ASPECT_TOLERANCE);
}

/**
 * `data`/`width`/`height` are a (typically downscaled) RGBA grab of the
 * whole frame; `frame` is the real capture size, used for the geometry so
 * downscale rounding doesn't skew the aspect math. Returns null for a blank
 * (all-black) frame, which says nothing about the layout yet — the caller
 * should try again on a later frame.
 */
export function detectContentRect(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  frame: FrameSize,
): ContentDetection | null {
  if (width < 4 || height < 4) return null;
  const luma = new Uint8Array(width * height);
  let maxLuma = 0;
  for (let i = 0, p = 0; i < luma.length; i++, p += 4) {
    const l = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000;
    luma[i] = l;
    if (l > maxLuma) maxLuma = l;
  }
  if (maxLuma < BLACK_LUMA) return null;

  const letterbox = detectLetterbox(luma, width, height, frame);
  if (letterbox) return { rect: letterbox, kind: "letterbox" };

  const frameAspect = frame.width / frame.height;
  if (isGameAspect(frameAspect)) return { rect: FULL, kind: "full" };

  const titlebar = detectTitlebar(luma, width, height, frame);
  if (titlebar) return { rect: titlebar, kind: "titlebar" };

  return { rect: FULL, kind: "full" };
}

function rowBlackShare(luma: Uint8Array, width: number, y: number, x0: number, x1: number): number {
  let black = 0;
  for (let x = x0; x < x1; x++) if (luma[y * width + x] < BLACK_LUMA) black++;
  return black / (x1 - x0);
}

function colBlackShare(luma: Uint8Array, width: number, x: number, y0: number, y1: number): number {
  let black = 0;
  for (let y = y0; y < y1; y++) if (luma[y * width + x] < BLACK_LUMA) black++;
  return black / (y1 - y0);
}

/**
 * Symmetric black bars on top+bottom and/or left+right, leaving a game
 * aspect behind. Requiring both the symmetry and the resulting aspect keeps
 * a dark scene from being mistaken for bars.
 */
function detectLetterbox(luma: Uint8Array, width: number, height: number, frame: FrameSize): RegionFrac | null {
  let top = 0;
  while (top < height / 2 && rowBlackShare(luma, width, top, 0, width) >= BAR_BLACK_SHARE) top++;
  let bottom = 0;
  while (bottom < height / 2 && rowBlackShare(luma, width, height - 1 - bottom, 0, width) >= BAR_BLACK_SHARE) bottom++;
  const y0 = top;
  const y1 = height - bottom;
  if (y1 - y0 < height / 2) return null;

  let left = 0;
  while (left < width / 2 && colBlackShare(luma, width, left, y0, y1) >= BAR_BLACK_SHARE) left++;
  let right = 0;
  while (right < width / 2 && colBlackShare(luma, width, width - 1 - right, y0, y1) >= BAR_BLACK_SHARE) right++;
  if (width - left - right < width / 2) return null;

  // A one-pixel dark edge isn't a bar.
  const hasVertical = top > 1 && bottom > 1;
  const hasHorizontal = left > 1 && right > 1;
  if (!hasVertical && !hasHorizontal) return null;
  if (hasVertical && Math.abs(top - bottom) > Math.max(2, height * BAR_SYMMETRY)) return null;
  if (hasHorizontal && Math.abs(left - right) > Math.max(2, width * BAR_SYMMETRY)) return null;

  const rect: RegionFrac = hasVertical
    ? { x: 0, y: top / height, width: 1, height: (height - top - bottom) / height }
    : { x: 0, y: 0, width: 1, height: 1 };
  if (hasHorizontal) {
    rect.x = left / width;
    rect.width = (width - left - right) / width;
  }
  const aspect = (rect.width * frame.width) / (rect.height * frame.height);
  return isGameAspect(aspect) ? rect : null;
}

/**
 * A window title bar above a 16:10 or 16:9 game: the frame is exactly a
 * game aspect plus a thin band on top. Only one game aspect can fit
 * (16:10 and 16:9 need bands ~10% of the height apart), and the band's
 * middle must be flat — a title bar's text is at the left and its buttons
 * at the right.
 */
function detectTitlebar(luma: Uint8Array, width: number, height: number, frame: FrameSize): RegionFrac | null {
  for (const aspect of GAME_ASPECTS) {
    const band = 1 - frame.width / aspect / frame.height;
    if (band < TITLEBAR_MIN || band > TITLEBAR_MAX) continue;
    // Skip the last sampled row: downscaling blends it with the game's first row.
    const rows = Math.max(1, Math.floor(band * height) - 1);
    const x0 = Math.floor(width * 0.25);
    const x1 = Math.ceil(width * 0.65);
    let sum = 0;
    let sumSq = 0;
    let n = 0;
    for (let y = 0; y < rows; y++) {
      for (let x = x0; x < x1; x++) {
        const l = luma[y * width + x];
        sum += l;
        sumSq += l * l;
        n++;
      }
    }
    const mean = sum / n;
    const std = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
    if (std > TITLEBAR_MAX_STD) continue;
    return { x: 0, y: band, width: 1, height: 1 - band };
  }
  return null;
}
