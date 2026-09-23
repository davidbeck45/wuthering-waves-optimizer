/**
 * Turns a stream of panel fingerprints into "an echo panel just settled on
 * something new — go OCR it" events, without ever running OCR itself.
 *
 * Two gates, per plan (docs/scanner.md):
 * 1. Stability: the panel must stop changing (distance to the previous tick
 *    stays under `settleThreshold` for `settleTicks` consecutive ticks)
 *    before we trust it — otherwise a mid-click-animation frame gets OCR'd.
 * 2. Novelty: once settled, only fire if this fingerprint differs from both
 *    the last one we actually scanned AND the recent scan history (catches
 *    the user scrolling back over already-captured echoes).
 *
 * Factory/closure, not a class, per CLAUDE.md's "no classes for domain logic".
 */
import { fingerprintDistance } from "./fingerprint";

export type StabilityEvent = "unstable" | "stable-repeat" | "stable-novel";

export type StableFrameDetectorOptions = {
  settleThreshold?: number;
  settleTicks?: number;
  noveltyThreshold?: number;
  historyThreshold?: number;
  historySize?: number;
};

export function createStableFrameDetector(
  options: StableFrameDetectorOptions = {},
) {
  const settleThreshold = options.settleThreshold ?? 0.035;
  const settleTicks = options.settleTicks ?? 2;
  const noveltyThreshold = options.noveltyThreshold ?? 0.035;
  const historyThreshold = options.historyThreshold ?? 0.018;
  const historySize = options.historySize ?? 80;

  let previousTick: Float32Array | null = null;
  let consecutiveStableTicks = 0;
  let lastScanned: Float32Array | null = null;
  const history: Float32Array[] = [];

  function observe(fingerprint: Float32Array): StabilityEvent {
    if (previousTick) {
      const tickDistance = fingerprintDistance(fingerprint, previousTick);
      consecutiveStableTicks =
        tickDistance <= settleThreshold ? consecutiveStableTicks + 1 : 0;
    } else {
      consecutiveStableTicks = 0;
    }
    previousTick = fingerprint;

    if (consecutiveStableTicks < settleTicks) {
      return "unstable";
    }

    if (
      lastScanned &&
      fingerprintDistance(fingerprint, lastScanned) <= noveltyThreshold
    ) {
      return "stable-repeat";
    }

    const matchesHistory = history.some(
      (past) => fingerprintDistance(fingerprint, past) <= historyThreshold,
    );
    if (matchesHistory) {
      return "stable-repeat";
    }

    return "stable-novel";
  }

  /** Call after successfully OCR'ing a "stable-novel" frame. */
  function commitScan(fingerprint: Float32Array) {
    lastScanned = fingerprint;
    history.push(fingerprint);
    if (history.length > historySize) {
      history.shift();
    }
    // A just-scanned frame is trivially stable again next tick.
    consecutiveStableTicks = settleTicks;
  }

  function reset() {
    previousTick = null;
    consecutiveStableTicks = 0;
    lastScanned = null;
    history.length = 0;
  }

  return { observe, commitScan, reset };
}

export type StableFrameDetector = ReturnType<typeof createStableFrameDetector>;
