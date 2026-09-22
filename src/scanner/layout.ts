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
 * Stat rows are captured as individually-cropped regions — one OCR call per
 * row — mirroring CalculatorEchoParser.vue's proven-reliable Discord-bot-image
 * approach (5 separate substat crops there too), rather than one big
 * multi-line block asking tesseract to segment rows itself. Block-level
 * multi-line OCR turned out to be the source of real missing-substat
 * reports: tesseract's own line segmentation can merge or drop a row when
 * two lines sit close together, and there's no way to recover a row that
 * silently vanished from the block's recognized text. An isolated per-row
 * crop can't lose a *different* row's text, because there isn't any in the
 * crop to begin with.
 *
 * Row Y-positions are fixed fractions (measured the same way as the blocks
 * above — see docs/scanner.md): the main-stat row starts at 0.384 and every
 * following row sits at a further ~0.0373 down, consistently across all
 * three measured resolutions. Substat rows (which is where the only
 * wrap-prone labels — "Resonance Skill DMG Bonus" etc. — live; main/fixed-
 * secondary labels never wrap, see docs/scanner.md) get a taller crop that
 * deliberately overlaps into the next row's space, so a 2-line wrapped
 * label+value still lands in one crop; parse.ts takes only the *first*
 * complete "label value" line found and ignores anything after, so that
 * overlap never leaks a neighboring row's text into this one's result. An
 * echo below +25 that simply has fewer populated rows just OCRs a blank
 * crop for the unused slots, handled as "absent" the same as before.
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
 * Small set-icon badge on the "+level" line.
 *
 * The first version of this constant (x 0.685, y 0.127) was an eyeballed
 * guess, explicitly flagged here as unmeasured — and it was wrong enough
 * to consistently miss the actual icon and land on background/portrait art
 * instead, which is why `matchSetFirst` kept confidently returning the
 * same wrong set (whatever was closest to a muted background blur, not any
 * real per-echo icon) regardless of which echo was on screen.
 *
 * These values are now pixel-measured off two real screenshots
 * (~/Downloads/ScreenshotsEchoes/2880x1800): threshold each screenshot's
 * header-line region for bright (icon ring/glyph) pixels and take the
 * bounding box. Both echoes' icons landed at x0≈0.728-0.729, y0≈0.161-0.166
 * — consistent with each other, and well inside HEADER_BLOCK's own bounds
 * as a sanity check. The box below adds a small margin around that
 * measured bound rather than cropping exactly to it.
 */
export const SET_ICON_BOX: RegionFrac = {
  x: 0.724,
  y: 0.155,
  width: 0.032,
  height: 0.042,
};

const STAT_ROW_X = 0.685;
const STAT_ROW_WIDTH = 0.29;
const FIRST_STAT_ROW_Y = 0.384;
const STAT_ROW_PITCH = 0.0373;
/** Tall enough for one line + padding; main/secondary labels never wrap. */
const SINGLE_LINE_ROW_HEIGHT = 0.028;
/** Tall enough to also catch a wrapped label's continuation line, which lands in the next row's space. */
const WRAP_SAFE_ROW_HEIGHT = 0.065;

export const MAIN_STAT_ROW: RegionFrac = {
  x: STAT_ROW_X,
  y: FIRST_STAT_ROW_Y,
  width: STAT_ROW_WIDTH,
  height: SINGLE_LINE_ROW_HEIGHT,
};

/** Not persisted (getEchoStats derives it from cost+rank) — cropped and OCR'd anyway as a sanity signal the calibration/debug view can show. */
export const SECONDARY_STAT_ROW: RegionFrac = {
  x: STAT_ROW_X,
  y: FIRST_STAT_ROW_Y + STAT_ROW_PITCH,
  width: STAT_ROW_WIDTH,
  height: SINGLE_LINE_ROW_HEIGHT,
};

/** Up to 5 possible substat slots, in panel order. */
export const SUBSTAT_ROWS: RegionFrac[] = [2, 3, 4, 5, 6].map((rowIndex) => ({
  x: STAT_ROW_X,
  y: FIRST_STAT_ROW_Y + rowIndex * STAT_ROW_PITCH,
  width: STAT_ROW_WIDTH,
  height: WRAP_SAFE_ROW_HEIGHT,
}));

/**
 * Every named ROI in one list, for the debug view (EchoScannerCapture.vue):
 * dashed boxes drawn over the live preview, and — per captured candidate —
 * a labeled crop thumbnail + its raw OCR text, so a mismatch like the
 * set-icon one (see SET_ICON_BOX's doc comment) is visible and diagnosable
 * from the UI itself instead of guessed at blind.
 */
export const DEBUG_REGIONS: { key: string; label: string; region: RegionFrac }[] = [
  { key: "panel", label: "Detail panel", region: PANEL_BOX },
  { key: "header", label: "Header (name/level/cost)", region: HEADER_BLOCK },
  { key: "setIcon", label: "Set icon", region: SET_ICON_BOX },
  { key: "main", label: "Main stat", region: MAIN_STAT_ROW },
  { key: "secondary", label: "Fixed secondary", region: SECONDARY_STAT_ROW },
  ...SUBSTAT_ROWS.map((region, i) => ({ key: `sub${i}`, label: `Substat ${i + 1}`, region })),
];

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
