import { describe, it, expect } from "vitest";
import { createStableFrameDetector } from "../../src/scanner/stability";

function vec(...values: number[]): Float32Array {
  return new Float32Array(values);
}

// With settleTicks: 2, reaching "stable" needs 3 observe() calls at the
// same value: the first has no previous tick to compare against (always
// unstable), the second brings the tick-to-tick distance under threshold
// once (consecutiveStableTicks = 1, still < 2), and the third is the 2nd
// consecutive stable comparison (consecutiveStableTicks = 2).

describe("stability", () => {
  it("stays unstable while the fingerprint keeps changing (click animation)", () => {
    const detector = createStableFrameDetector({ settleTicks: 2, settleThreshold: 0.05 });
    expect(detector.observe(vec(0, 0, 0))).toBe("unstable"); // first tick, no previous to compare
    expect(detector.observe(vec(0.5, 0.5, 0.5))).toBe("unstable"); // big jump
    expect(detector.observe(vec(0.9, 0.1, 0.2))).toBe("unstable"); // still moving
  });

  it("fires stable-novel once the panel settles on something new", () => {
    const detector = createStableFrameDetector({ settleTicks: 2, settleThreshold: 0.05 });
    detector.observe(vec(0.1, 0.1, 0.1));
    detector.observe(vec(0.1, 0.1, 0.1));
    expect(detector.observe(vec(0.1, 0.1, 0.1))).toBe("stable-novel");
  });

  it("does not re-fire for the same settled frame after commitScan", () => {
    const detector = createStableFrameDetector({ settleTicks: 2, settleThreshold: 0.05 });
    detector.observe(vec(0.1, 0.1, 0.1));
    detector.observe(vec(0.1, 0.1, 0.1));
    const settled = detector.observe(vec(0.1, 0.1, 0.1));
    expect(settled).toBe("stable-novel");
    detector.commitScan(vec(0.1, 0.1, 0.1));

    // still parked on the same echo
    expect(detector.observe(vec(0.1, 0.1, 0.1))).toBe("stable-repeat");
  });

  it("fires again once a genuinely new echo settles", () => {
    const detector = createStableFrameDetector({ settleTicks: 2, settleThreshold: 0.05 });
    detector.observe(vec(0.1, 0.1, 0.1));
    detector.observe(vec(0.1, 0.1, 0.1));
    detector.observe(vec(0.1, 0.1, 0.1));
    detector.commitScan(vec(0.1, 0.1, 0.1));

    // click to a new echo: transition ticks are unstable, then it settles
    expect(detector.observe(vec(0.9, 0.9, 0.9))).toBe("unstable");
    expect(detector.observe(vec(0.9, 0.9, 0.9))).toBe("unstable"); // 1st consecutive stable tick, still < settleTicks
    expect(detector.observe(vec(0.9, 0.9, 0.9))).toBe("stable-novel"); // 2nd consecutive stable tick
  });

  it("treats a fingerprint matching recent scroll-back history as a repeat", () => {
    const detector = createStableFrameDetector({
      settleTicks: 2,
      settleThreshold: 0.05,
      historyThreshold: 0.02,
    });
    detector.observe(vec(0.1, 0.1, 0.1));
    detector.observe(vec(0.1, 0.1, 0.1));
    detector.observe(vec(0.1, 0.1, 0.1));
    detector.commitScan(vec(0.1, 0.1, 0.1));

    // transition, then settle on a second, different echo
    detector.observe(vec(0.9, 0.9, 0.9));
    detector.observe(vec(0.9, 0.9, 0.9));
    detector.observe(vec(0.9, 0.9, 0.9));
    detector.commitScan(vec(0.9, 0.9, 0.9));

    // user scrolls back up to the first echo — transition, then re-settles
    // on a fingerprint matching history[0], not the just-scanned one.
    detector.observe(vec(0.1, 0.1, 0.1));
    detector.observe(vec(0.1, 0.1, 0.1));
    expect(detector.observe(vec(0.1, 0.1, 0.1))).toBe("stable-repeat");
  });

  it("reset() clears settle progress, novelty, and history", () => {
    const detector = createStableFrameDetector({ settleTicks: 2, settleThreshold: 0.05 });
    detector.observe(vec(0.1, 0.1, 0.1));
    detector.observe(vec(0.1, 0.1, 0.1));
    detector.observe(vec(0.1, 0.1, 0.1));
    detector.commitScan(vec(0.1, 0.1, 0.1));
    detector.reset();

    expect(detector.observe(vec(0.1, 0.1, 0.1))).toBe("unstable");
    expect(detector.observe(vec(0.1, 0.1, 0.1))).toBe("unstable");
    expect(detector.observe(vec(0.1, 0.1, 0.1))).toBe("stable-novel");
  });
});
