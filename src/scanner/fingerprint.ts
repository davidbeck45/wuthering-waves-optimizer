/**
 * Cheap perceptual fingerprint used to gate when to run the (expensive) OCR
 * pass — see stability.ts. No OCR happens in this module; it only answers
 * "did the panel change".
 */

const FP_WIDTH = 32;
const FP_HEIGHT = 16;
export const FINGERPRINT_LENGTH = FP_WIDTH * FP_HEIGHT;

/**
 * Downsamples ImageData to a 32x16 luma grid (0-1 range per cell) via
 * nearest-neighbor box averaging. Cheap enough to run on every capture tick.
 */
export function computeFingerprint(imageData: ImageData): Float32Array {
  const { data, width, height } = imageData;
  const out = new Float32Array(FINGERPRINT_LENGTH);
  const cellW = width / FP_WIDTH;
  const cellH = height / FP_HEIGHT;

  for (let cy = 0; cy < FP_HEIGHT; cy++) {
    const y0 = Math.floor(cy * cellH);
    const y1 = Math.max(y0 + 1, Math.floor((cy + 1) * cellH));
    for (let cx = 0; cx < FP_WIDTH; cx++) {
      const x0 = Math.floor(cx * cellW);
      const x1 = Math.max(x0 + 1, Math.floor((cx + 1) * cellW));
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        let rowIndex = (y * width + x0) * 4;
        for (let x = x0; x < x1; x++) {
          const r = data[rowIndex];
          const g = data[rowIndex + 1];
          const b = data[rowIndex + 2];
          sum += 0.299 * r + 0.587 * g + 0.114 * b;
          count++;
          rowIndex += 4;
        }
      }
      out[cy * FP_WIDTH + cx] = count > 0 ? sum / count / 255 : 0;
    }
  }
  return out;
}

/** Mean absolute difference between two fingerprints, in [0, 1]. */
export function fingerprintDistance(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 1;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.abs(a[i] - b[i]);
  }
  return sum / a.length;
}
