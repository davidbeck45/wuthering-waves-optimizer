import { describe, it, expect } from "vitest";
import { detectContentRect } from "../../src/scanner/contentRect";

type Rgb = [number, number, number];

/**
 * A synthetic frame: "game" pixels are a busy pattern (so they never read
 * as flat or black), with optional bands painted over them.
 */
function makeFrame(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const v = 60 + ((x * 7 + y * 13) % 120);
      data[i] = v;
      data[i + 1] = (v * 3) % 200;
      data[i + 2] = 255 - v;
      data[i + 3] = 255;
    }
  }
  const fill = (x0: number, y0: number, x1: number, y1: number, [r, g, b]: Rgb) => {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
      }
    }
  };
  return { data, width, height, fill };
}

/** Title-bar-like band: flat color, with "text" at the left and "buttons" at the right. */
function paintTitlebar(frame: ReturnType<typeof makeFrame>, rows: number, color: Rgb, ink: Rgb) {
  frame.fill(0, 0, frame.width, rows, color);
  const mid = Math.floor(rows / 2);
  frame.fill(Math.floor(frame.width * 0.01), mid - 1, Math.floor(frame.width * 0.12), mid + 1, ink);
  frame.fill(Math.floor(frame.width * 0.9), mid - 1, frame.width - 2, mid + 1, ink);
}

describe("detectContentRect", () => {
  it("treats a bare 16:10 or 16:9 frame as all game", () => {
    for (const size of [
      { width: 640, height: 400 },
      { width: 640, height: 360 },
    ]) {
      const frame = makeFrame(size.width, size.height);
      const result = detectContentRect(frame.data, frame.width, frame.height, size);
      expect(result?.kind).toBe("full");
      expect(result?.rect).toEqual({ x: 0, y: 0, width: 1, height: 1 });
      expect(result?.alternates).toEqual([]);
    }
  });

  it("returns null for a blank (all-black) frame so the caller retries later", () => {
    const frame = makeFrame(640, 371);
    frame.fill(0, 0, 640, 371, [0, 0, 0]);
    expect(detectContentRect(frame.data, 640, 371, { width: 1762, height: 1022 })).toBeNull();
  });

  // The real rejected sizes from beta analytics, downscaled to the 640px
  // grab the scanner actually runs detection on.
  it.each([
    { real: { width: 1762, height: 1022 }, gameHeight: 990, label: "1760x990 16:9 + 32px title bar" },
    { real: { width: 1368, height: 800 }, gameHeight: 768, label: "1366x768 16:9 + 32px title bar" },
    { real: { width: 860, height: 498 }, gameHeight: 484, label: "1762x1022 downscaled" },
    { real: { width: 1440, height: 932 }, gameHeight: 900, label: "1440x900 16:10 + 32px title bar" },
  ])("finds the game under a title bar: $label", ({ real, gameHeight }) => {
    for (const [color, ink] of [
      [[32, 32, 32], [230, 230, 230]],
      [[243, 243, 243], [20, 20, 20]],
    ] as [Rgb, Rgb][]) {
      const scale = 640 / real.width;
      const width = 640;
      const height = Math.round(real.height * scale);
      const frame = makeFrame(width, height);
      paintTitlebar(frame, Math.round((real.height - gameHeight) * scale), color, ink);
      const result = detectContentRect(frame.data, width, height, real);
      expect(result?.kind).toBe("titlebar");
      // Within a couple of real pixels of the true title bar height.
      expect(Math.abs(result!.rect.y * real.height - (real.height - gameHeight))).toBeLessThanOrEqual(3);
      const aspect = real.width / (result!.rect.height * real.height);
      expect([16 / 10, 16 / 9].some((a) => Math.abs(aspect - a) < 0.01)).toBe(true);
      expect(result?.alternates).toEqual([]);
      expect(result?.bandStd).toBeLessThanOrEqual(12);
    }
  });

  it("doesn't trim a band that fits the geometry but isn't flat (real game content)", () => {
    const real = { width: 1762, height: 1022 };
    const frame = makeFrame(640, 371);
    const result = detectContentRect(frame.data, 640, 371, real);
    expect(result?.kind).toBe("full");
    expect(result?.rect).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    // Still offered as an alternate, for the scanner to try by OCR result.
    expect(result?.alternates).toHaveLength(1);
    expect(Math.abs(result!.alternates[0].y * real.height - 32)).toBeLessThanOrEqual(3);
    expect(result?.bandStd).toBeGreaterThan(12);
  });

  // Reported in analytics as content: full, then scanner-layout-mismatch:
  // a 16:9 game (~1866x1050) under a ~30px band whose middle isn't flat
  // (a centered title, a translucent bar, an overlay).
  it("offers a non-flat title bar over a 1866x1080 frame as an alternate", () => {
    const real = { width: 1866, height: 1080 };
    const width = 640;
    const height = Math.round(real.height * (width / real.width));
    const frame = makeFrame(width, height);
    const bandRows = Math.round(30 * (width / real.width));
    paintTitlebar(frame, bandRows, [32, 32, 32], [230, 230, 230]);
    // A centered window title, right where the flatness check samples.
    frame.fill(Math.floor(width * 0.42), 3, Math.floor(width * 0.58), bandRows - 3, [230, 230, 230]);

    const result = detectContentRect(frame.data, width, height, real);
    expect(result?.kind).toBe("full");
    expect(result?.alternates).toHaveLength(1);
    const alt = result!.alternates[0];
    expect(Math.abs(alt.y * real.height - 30)).toBeLessThanOrEqual(1);
    expect(real.width / (alt.height * real.height)).toBeCloseTo(16 / 9, 2);
  });

  it("finds a 16:9 game letterboxed in a 16:10 frame", () => {
    // 1920x1200 frame, 1920x1080 game, 60px bars → 640x400 grab with 20px bars.
    const frame = makeFrame(640, 400);
    frame.fill(0, 0, 640, 20, [0, 0, 0]);
    frame.fill(0, 380, 640, 400, [3, 3, 3]);
    const result = detectContentRect(frame.data, 640, 400, { width: 1920, height: 1200 });
    expect(result?.kind).toBe("letterbox");
    expect(result?.alternates).toEqual([]);
    expect(result!.rect.y).toBeCloseTo(0.05);
    expect(result!.rect.height).toBeCloseTo(0.9);
  });

  it("finds a 16:10 game pillarboxed in a 16:9 frame", () => {
    // 1920x1080 frame, 1728x1080 game, 96px bars → 640x360 grab with 32px bars.
    const frame = makeFrame(640, 360);
    frame.fill(0, 0, 32, 360, [0, 0, 0]);
    frame.fill(608, 0, 640, 360, [0, 0, 0]);
    const result = detectContentRect(frame.data, 640, 360, { width: 1920, height: 1080 });
    expect(result?.kind).toBe("letterbox");
    expect(result!.rect.x).toBeCloseTo(0.05);
    expect(result!.rect.width).toBeCloseTo(0.9);
  });

  it("ignores lopsided dark bands (a dark scene, not bars)", () => {
    const frame = makeFrame(640, 400);
    frame.fill(0, 0, 640, 40, [0, 0, 0]);
    const result = detectContentRect(frame.data, 640, 400, { width: 1920, height: 1200 });
    expect(result?.kind).toBe("full");
  });

  it("ignores symmetric bars that don't leave a game aspect behind", () => {
    const frame = makeFrame(640, 400);
    frame.fill(0, 0, 640, 50, [0, 0, 0]);
    frame.fill(0, 350, 640, 400, [0, 0, 0]);
    const result = detectContentRect(frame.data, 640, 400, { width: 1920, height: 1200 });
    expect(result?.kind).toBe("full");
  });

  it("leaves an ultrawide frame as all game (rejected later by the aspect range)", () => {
    const frame = makeFrame(640, 274);
    const result = detectContentRect(frame.data, 640, 274, { width: 3440, height: 1440 });
    expect(result?.kind).toBe("full");
    expect(result?.alternates).toEqual([]);
  });
});
