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
 * Two simplifications, both from real usage:
 * - **No level or cost OCR.** The app doesn't persist echo level yet (every
 *   scanned echo is treated as max-level), so there's nothing to gain from
 *   reading "+n" at all. Cost is derived from the resolved echo's own class
 *   (getCostByClass) once name+set narrow it down, the same fallback
 *   CalculatorEchoParser.vue already has for when its own cost OCR misses —
 *   just always taken now, rather than only as a fallback. That means the
 *   header crop only needs the name line: WuWa doesn't wrap long echo names,
 *   it shrinks the font to fit instead, so NAME_BLOCK stays a single-line,
 *   fixed-height crop regardless of name length.
 * - **Stat rows exclude the small leading stat-type icon** (the glyph
 *   matching subStatIconMap's icons, e.g. a sword for ATK) rather than
 *   including it in the OCR crop. Real debug-crop text showed tesseract
 *   reading that icon as garbage characters ahead of the real label
 *   ("QQ HP 957", "% DEF") — a real noise source parseStatRow's
 *   plausibility check has to work around. Measured the icon/text gap
 *   directly (column-variance scan of a real row) rather than guessing.
 *
 * Stat rows are still captured as individually-cropped regions — one OCR
 * call per row — mirroring CalculatorEchoParser.vue's proven-reliable
 * Discord-bot-image approach (5 separate substat crops there too), rather
 * than one big multi-line block asking tesseract to segment rows itself.
 * Row Y-positions are fixed fractions: the main-stat row starts at 0.384
 * and every following row sits at a further ~0.0373 down, consistently
 * across all three measured resolutions.
 *
 * SUBSTAT_BLOCK is a *fallback*, not the primary path: if the 5 individual
 * substat-row crops don't yield all 5 substats (expected every time now
 * that level is assumed max), one extra OCR call against this wider block
 * — spanning all 5 rows plus wrap allowance — is parsed with
 * `splitStatBlock` instead. Long labels wrapping to a second line
 * ("Resonance Skill DMG Bonus") is the main reason per-row crops fall
 * short: the game doesn't reserve consistent spacing for a wrap, so a
 * wrapped row can shift everything below it down by an amount that varies
 * echo to echo — something no *fixed*-position per-row crop can fully
 * account for, but a wide-enough block re-read still generally recovers.
 */
import type { FrameSize, RegionFrac, RegionPx } from "./types";

export const FULL_FRAME: RegionFrac = { x: 0, y: 0, width: 1, height: 1 };

export const PANEL_BOX: RegionFrac = {
  x: 0.685,
  y: 0.095,
  width: 0.29,
  height: 0.67,
};

/**
 * Echo name only — single line, tight height. Pixel-measured off a real
 * screenshot (luma-variance row scan of just the title text, excluding
 * both the top HUD bar above it and the portrait art below): the title
 * band sits at y≈0.109-0.132. Checked against both a short name
 * ("Thousand-Puppet Pavilion") and a long one ("Reminiscence - Nightmare:
 * Adam Smasher") — the game shrinks the font for the long one rather than
 * wrapping it, so both fit this same fixed-height single-line crop.
 */
export const NAME_BLOCK: RegionFrac = {
  x: 0.685,
  y: 0.104,
  width: 0.27,
  height: 0.034,
};

/**
 * Small set-icon badge on the "+level" line (the level text itself isn't
 * read — see this file's top doc comment — but the icon sitting on that
 * line still needs its own crop for matchSetFirst).
 *
 * The first version of this constant (x 0.685, y 0.127) was an eyeballed
 * guess, and wrong enough to consistently miss the actual icon and land on
 * background/portrait art instead — every `matchSetFirst` call was
 * confidently returning whatever set happened to be closest to that muted
 * background blur, regardless of which echo was on screen. A second
 * version (x 0.724, y 0.155) was pixel-measured but still left the icon
 * occupying under half the crop, real background margin around it (a
 * screenshot comparison against the actual reference icon image, e.g.
 * https://ryanbenson.github.io/wuthering-waves-assets/images/echoes/sets/CelestialLight.webp,
 * which is cropped tight to its content) — that surrounding margin
 * competes with the icon itself once matchSetFirst resizes to 32x32,
 * diluting the real signal.
 *
 * These values are cropped as tight as the icon's own measured bounds
 * allow (a couple of pixels of margin, not a generous box around it),
 * verified visually against two different echoes' icons.
 */
export const SET_ICON_BOX: RegionFrac = {
  x: 0.7266,
  y: 0.1583,
  width: 0.0191,
  height: 0.0328,
};

/** Starts right after the stat-type icon glyph (see this file's top doc comment) — measured gap, not guessed. */
const STAT_ROW_X = 0.713;
const STAT_ROW_WIDTH = 0.262;
const FIRST_STAT_ROW_Y = 0.384;
const STAT_ROW_PITCH = 0.0373;
/** Tall enough for one line + padding; main/secondary labels never wrap. */
const SINGLE_LINE_ROW_HEIGHT = 0.028;
/**
 * Tall enough to also catch a wrapped label's continuation line, which
 * lands in the next row's space (WRAP_SAFE_ROW_HEIGHT / STAT_ROW_PITCH ≈
 * 1.3x). This was originally 0.065 (≈1.74x pitch) — real footage showed
 * that was tall enough to regularly capture a *neighboring* row's actual
 * text as well as this row's own (visible in the debug crop grid as two
 * consecutive substat crops both containing the same line), not just
 * blank overlap margin. Reduced to lessen how often that happens for the
 * common single-line case. The real fix for when a wrap still throws a
 * row off is SUBSTAT_BLOCK below — a per-row crop's *height* alone can't
 * solve an *earlier* row's wrap shifting every row below it down by a
 * variable amount, since the game doesn't reserve consistent spacing for
 * a wrap.
 */
const WRAP_SAFE_ROW_HEIGHT = 0.048;

export const MAIN_STAT_ROW: RegionFrac = {
  x: STAT_ROW_X,
  y: FIRST_STAT_ROW_Y,
  width: STAT_ROW_WIDTH,
  height: SINGLE_LINE_ROW_HEIGHT,
};

/** Not persisted (getEchoStats derives it from cost+rank) — cropped and OCR'd anyway as a sanity signal the debug view can show. */
export const SECONDARY_STAT_ROW: RegionFrac = {
  x: STAT_ROW_X,
  y: FIRST_STAT_ROW_Y + STAT_ROW_PITCH,
  width: STAT_ROW_WIDTH,
  height: SINGLE_LINE_ROW_HEIGHT,
};

/** Up to 5 possible substat slots, in panel order — the primary pass. */
export const SUBSTAT_ROWS: RegionFrac[] = [2, 3, 4, 5, 6].map((rowIndex) => ({
  x: STAT_ROW_X,
  y: FIRST_STAT_ROW_Y + rowIndex * STAT_ROW_PITCH,
  width: STAT_ROW_WIDTH,
  height: WRAP_SAFE_ROW_HEIGHT,
}));

/**
 * Fallback pass: all 5 substat rows plus wrap allowance, as one block.
 * Spans from the first substat row's own start (row index 2) through
 * enough extra height for 5 rows at full pitch plus ~2 extra wrapped
 * lines — generous on purpose, since this only runs when the per-row
 * pass came up short and a wider net is exactly the point.
 */
export const SUBSTAT_BLOCK: RegionFrac = {
  x: STAT_ROW_X,
  y: FIRST_STAT_ROW_Y + 2 * STAT_ROW_PITCH,
  width: STAT_ROW_WIDTH,
  height: 5 * STAT_ROW_PITCH + 2 * SINGLE_LINE_ROW_HEIGHT,
};

/**
 * Every named ROI in one list, for the debug view (EchoScannerCapture.vue):
 * dashed boxes drawn over the live preview, and — per captured candidate —
 * a labeled crop thumbnail + its raw OCR text, so a mismatch like the
 * set-icon one (see SET_ICON_BOX's doc comment) is visible and diagnosable
 * from the UI itself instead of guessed at blind.
 */
export const DEBUG_REGIONS: { key: string; label: string; region: RegionFrac }[] = [
  { key: "panel", label: "Detail panel", region: PANEL_BOX },
  { key: "name", label: "Name", region: NAME_BLOCK },
  { key: "setIcon", label: "Set icon", region: SET_ICON_BOX },
  { key: "main", label: "Main stat", region: MAIN_STAT_ROW },
  { key: "secondary", label: "Fixed secondary", region: SECONDARY_STAT_ROW },
  ...SUBSTAT_ROWS.map((region, i) => ({ key: `sub${i}`, label: `Substat ${i + 1}`, region })),
  { key: "substatBlock", label: "Substat fallback block", region: SUBSTAT_BLOCK },
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
