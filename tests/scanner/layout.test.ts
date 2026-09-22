import { describe, it, expect } from "vitest";
import {
  PANEL_BOX,
  HEADER_BLOCK,
  MAIN_STAT_ROW,
  SECONDARY_STAT_ROW,
  SUBSTAT_ROWS,
  SET_ICON_BOX,
  DEBUG_REGIONS,
  toPixelRegion,
  isSupportedAspect,
} from "../../src/scanner/layout";

// Real capture resolutions reviewed from the user's provided footage
// (~/Downloads/ScreenshotsEchoes) — all WuWa's fixed 16:10 Echo Management
// UI, at three different pixel sizes. The panel fractions must resolve to
// consistent, in-bounds pixel regions at each.
const REAL_RESOLUTIONS = [
  { width: 2880, height: 1800 }, // screenshots
  { width: 2304, height: 1440 }, // recorded video
  { width: 2800, height: 1752 }, // first session's sample screenshot
];

describe("layout", () => {
  it.each(REAL_RESOLUTIONS)("keeps the panel box in-bounds at %ox%o", (frame) => {
    const region = toPixelRegion(PANEL_BOX, frame);
    expect(region.x).toBeGreaterThan(0);
    expect(region.y).toBeGreaterThan(0);
    expect(region.x + region.width).toBeLessThanOrEqual(frame.width);
    expect(region.y + region.height).toBeLessThanOrEqual(frame.height);
  });

  it.each(REAL_RESOLUTIONS)("keeps the main/secondary stat rows inside the panel box at %ox%o", (frame) => {
    const panel = toPixelRegion(PANEL_BOX, frame);
    for (const row of [MAIN_STAT_ROW, SECONDARY_STAT_ROW]) {
      const region = toPixelRegion(row, frame);
      expect(region.x).toBeGreaterThanOrEqual(panel.x);
      expect(region.y).toBeGreaterThanOrEqual(panel.y);
      expect(region.x + region.width).toBeLessThanOrEqual(panel.x + panel.width + 2);
      expect(region.y + region.height).toBeLessThanOrEqual(panel.y + panel.height + 2);
    }
  });

  it.each(REAL_RESOLUTIONS)("keeps the header above the main stat row, which sits above the secondary row at %ox%o", (frame) => {
    const header = toPixelRegion(HEADER_BLOCK, frame);
    const main = toPixelRegion(MAIN_STAT_ROW, frame);
    const secondary = toPixelRegion(SECONDARY_STAT_ROW, frame);
    expect(header.y + header.height).toBeLessThanOrEqual(main.y);
    expect(main.y).toBeLessThan(secondary.y);
  });

  it.each(REAL_RESOLUTIONS)("lays out all 5 substat row slots below the secondary row, each further down than the last, at %ox%o", (frame) => {
    const secondary = toPixelRegion(SECONDARY_STAT_ROW, frame);
    expect(SUBSTAT_ROWS).toHaveLength(5);
    let previousY = secondary.y;
    for (const row of SUBSTAT_ROWS) {
      const region = toPixelRegion(row, frame);
      expect(region.y).toBeGreaterThan(previousY);
      previousY = region.y;
    }
  });

  it("gives substat rows a taller crop than main/secondary rows, to catch a wrapped label's continuation line", () => {
    expect(SUBSTAT_ROWS[0].height).toBeGreaterThan(MAIN_STAT_ROW.height);
    expect(SUBSTAT_ROWS[0].height).toBeGreaterThan(SECONDARY_STAT_ROW.height);
  });

  it.each(REAL_RESOLUTIONS)(
    "keeps the (pixel-measured) set icon box inside the header block at %ox%o — regression: the original guessed box missed the icon entirely, causing every scan to return the same wrong set",
    (frame) => {
      const header = toPixelRegion(HEADER_BLOCK, frame);
      const icon = toPixelRegion(SET_ICON_BOX, frame);
      expect(icon.x).toBeGreaterThanOrEqual(header.x);
      expect(icon.y).toBeGreaterThanOrEqual(header.y);
      expect(icon.x + icon.width).toBeLessThanOrEqual(header.x + header.width + 2);
      expect(icon.y + icon.height).toBeLessThanOrEqual(header.y + header.height + 2);
    },
  );

  it("lists every named ROI exactly once in DEBUG_REGIONS, for the scanner's debug view", () => {
    const keys = DEBUG_REGIONS.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(
      expect.arrayContaining(["panel", "header", "setIcon", "main", "secondary", "sub0", "sub1", "sub2", "sub3", "sub4"]),
    );
  });

  it("accepts WuWa's real 16:10 aspect ratios", () => {
    for (const frame of REAL_RESOLUTIONS) {
      expect(isSupportedAspect(frame)).toBe(true);
    }
  });

  it("rejects a very different aspect ratio (e.g. a webcam or unrelated capture)", () => {
    expect(isSupportedAspect({ width: 1920, height: 1080 })).toBe(false); // 16:9
    expect(isSupportedAspect({ width: 640, height: 480 })).toBe(false); // 4:3
  });

  it("resolves fractional regions to integer pixels", () => {
    const region = toPixelRegion({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }, { width: 1001, height: 999 });
    expect(Number.isInteger(region.x)).toBe(true);
    expect(Number.isInteger(region.y)).toBe(true);
    expect(Number.isInteger(region.width)).toBe(true);
    expect(Number.isInteger(region.height)).toBe(true);
  });
});
