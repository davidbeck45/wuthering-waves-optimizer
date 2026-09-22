import { describe, it, expect } from "vitest";
import { PANEL_BOX, STATS_BLOCK, HEADER_BLOCK, toPixelRegion, isSupportedAspect } from "../../src/scanner/layout";

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

  it.each(REAL_RESOLUTIONS)("keeps the stats block inside the panel box at %ox%o", (frame) => {
    const panel = toPixelRegion(PANEL_BOX, frame);
    const stats = toPixelRegion(STATS_BLOCK, frame);
    expect(stats.x).toBeGreaterThanOrEqual(panel.x);
    expect(stats.y).toBeGreaterThanOrEqual(panel.y);
    expect(stats.x + stats.width).toBeLessThanOrEqual(panel.x + panel.width + 2); // +2px rounding slack
    expect(stats.y + stats.height).toBeLessThanOrEqual(panel.y + panel.height + 2);
  });

  it.each(REAL_RESOLUTIONS)("keeps the header block above the stats block at %ox%o", (frame) => {
    const header = toPixelRegion(HEADER_BLOCK, frame);
    const stats = toPixelRegion(STATS_BLOCK, frame);
    expect(header.y + header.height).toBeLessThanOrEqual(stats.y);
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
