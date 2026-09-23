import { describe, it, expect } from "vitest";
import { computeFingerprint, fingerprintDistance, FINGERPRINT_LENGTH } from "../../src/scanner/fingerprint";

function makeImageData(width: number, height: number, fill: (x: number, y: number) => [number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fill(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { data, width, height, colorSpace: "srgb" } as ImageData;
}

describe("fingerprint", () => {
  it("produces a fixed-length vector regardless of input size", () => {
    const small = computeFingerprint(makeImageData(40, 20, () => [128, 128, 128]));
    const large = computeFingerprint(makeImageData(400, 200, () => [128, 128, 128]));
    expect(small.length).toBe(FINGERPRINT_LENGTH);
    expect(large.length).toBe(FINGERPRINT_LENGTH);
  });

  it("distance is 0 for identical frames", () => {
    const a = computeFingerprint(makeImageData(64, 32, (x, y) => [(x * 7) % 255, (y * 13) % 255, 60]));
    const b = computeFingerprint(makeImageData(64, 32, (x, y) => [(x * 7) % 255, (y * 13) % 255, 60]));
    expect(fingerprintDistance(a, b)).toBe(0);
  });

  it("distance is large between a black frame and a white frame", () => {
    const black = computeFingerprint(makeImageData(64, 32, () => [0, 0, 0]));
    const white = computeFingerprint(makeImageData(64, 32, () => [255, 255, 255]));
    expect(fingerprintDistance(black, white)).toBeCloseTo(1, 5);
  });

  it("small localized change produces a small but non-zero distance", () => {
    const base = computeFingerprint(makeImageData(64, 32, () => [100, 100, 100]));
    const changed = computeFingerprint(
      makeImageData(64, 32, (x, y) => (x < 4 && y < 4 ? [255, 255, 255] : [100, 100, 100])),
    );
    const distance = fingerprintDistance(base, changed);
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThan(0.05);
  });
});
