/**
 * Normalized ROI table for the WuWa Echo Management detail panel.
 *
 * All regions are fractions of the *full captured frame*, not fixed pixels —
 * required because the live screen-share stream, an uploaded video file, and
 * a calibration screenshot can all come in at different resolutions. This
 * has been validated against real captures at three different resolutions
 * that all share the game's fixed 16:10 UI aspect (2800x1752, 2880x1800,
 * 2304x1440) — the fractions below were measured directly off those real
 * screenshots (row-band/column detection over luma variance), not guessed.
 * See docs/scanner.md for how these were derived and what to re-measure if
 * a future WuWa UI update moves the panel.
 *
 * The stats block (main stat + fixed secondary + up to 5 substats) is
 * intentionally captured as ONE region and OCR'd as a multi-line block,
 * rather than as 7 rigid per-row boxes: real footage shows unleveled echoes
 * render fewer than 5 substat rows (nothing below the last one — the panel
 * doesn't reserve blank space for it), and long stat labels ("Resonance
 * Skill DMG Bonus") wrap to a second line, which shifts every row after it.
 * parse.ts reassembles rows from the recognized text instead of trusting
 * fixed row slots.
 */
import type { FrameSize, RegionFrac, RegionPx } from "./types";

export const FULL_FRAME: RegionFrac = { x: 0, y: 0, width: 1, height: 1 };

export const PANEL_BOX: RegionFrac = {
  x: 0.685,
  y: 0.095,
  width: 0.29,
  height: 0.67,
};

/** Echo name (title) + "+level <set icon>" + "COST n" — one OCR'd block, 3 known line shapes. */
export const HEADER_BLOCK: RegionFrac = {
  x: 0.685,
  y: 0.1,
  width: 0.27,
  height: 0.1,
};

/**
 * Small set-icon badge on the "+level" line. This one is a first-pass
 * estimate (not independently pixel-measured like the blocks above — the
 * icon is small and its exact bounds weren't isolated during the review of
 * the provided footage). Expect to refine via the calibration UI once real
 * matchSetFirst results come back low-confidence for it.
 */
export const SET_ICON_BOX: RegionFrac = {
  x: 0.685,
  y: 0.127,
  width: 0.032,
  height: 0.045,
};

/** Main stat + fixed secondary + up to 5 substats, multi-line OCR block. */
export const STATS_BLOCK: RegionFrac = {
  x: 0.685,
  y: 0.375,
  width: 0.29,
  height: 0.335,
};

export function toPixelRegion(region: RegionFrac, frame: FrameSize): RegionPx {
  return {
    x: Math.round(region.x * frame.width),
    y: Math.round(region.y * frame.height),
    width: Math.round(region.width * frame.width),
    height: Math.round(region.height * frame.height),
  };
}

/** WuWa's Echo Management screen is 16:10. Frames far off that ratio need the calibration fallback (Phase 4 of the plan). */
export function isSupportedAspect(frame: FrameSize): boolean {
  const aspect = frame.width / frame.height;
  return Math.abs(aspect - 1.6) < 0.05;
}
