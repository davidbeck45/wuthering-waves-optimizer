// Wuthering Tools+ — kill time off Riley's damage curve (the ToA clear check). Pure.
//
// His fight is the opener plus three loops (~100 s) and nothing lands after it. A floor whose HP outlasts it is
// extrapolated at the last loop's DPS — the steady state — scaled by any time-dependent floor effect (a DMG-taken
// ramp) relative to what that loop already held, so a ramp still climbing at the end of the run keeps climbing.
// A floor with several HP segments (two bosses with different RES) is fought in order on one clock: segment k
// takes its own curve from the moment segment k−1 fell.
import type { FightCurve } from "../engine/rileyRun";

export type CurveLike = Pick<FightCurve, "seconds" | "sectionSeconds" | "sectionTotals" | "points">;

/** A floor's time-dependent damage multiplier at t seconds (1 = none). */
export type TimeFactor = (seconds: number) => number;
const NONE: TimeFactor = () => 1;

const FPS = 60;
/** Integration step past the fight, s (one frame). */
const STEP = 1 / FPS;

/** The last loop's own DPS with the floor's time factor taken out — what the extrapolation scales back up. */
function steadyRate(curve: CurveLike, factor: TimeFactor): number {
  const n = curve.sectionSeconds.length;
  const secs = curve.sectionSeconds[n - 1] ?? 0;
  const dmg = curve.sectionTotals[n - 1] ?? 0;
  if (!(secs > 0)) return curve.seconds > 0 ? (curve.points[curve.points.length - 1]?.[1] ?? 0) / curve.seconds : 0;
  // the loop's mean factor, frame by frame
  const from = curve.seconds - secs;
  let sum = 0, k = 0;
  for (let t = from; t < curve.seconds; t += STEP, k++) sum += factor(t);
  const mean = k ? sum / k : 1;
  return dmg / secs / (mean || 1);
}

/** Damage dealt by `t` seconds: the run's own hits up to its end, the extrapolation after. */
export function damageAt(curve: CurveLike, t: number, factor: TimeFactor = NONE): number {
  const pts = curve.points;
  if (t <= curve.seconds) {
    const frame = Math.floor(t * FPS + 1e-9);
    // last point at or before the frame
    let lo = 0, hi = pts.length - 1, at = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (pts[mid]![0] <= frame) {
        at = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return at < 0 ? 0 : pts[at]![1];
  }
  const rate = steadyRate(curve, factor);
  let d = pts[pts.length - 1]?.[1] ?? 0;
  for (let s = curve.seconds; s < t; s += STEP) d += rate * factor(s) * Math.min(STEP, t - s);
  return d;
}

/** The first moment, at or after `from`, by which `hp` more damage has landed on this curve — null past `limit`. */
export function crossing(curve: CurveLike, from: number, hp: number, factor: TimeFactor = NONE, limit = 300): { at: number; extrapolated: boolean } | null {
  const base = damageAt(curve, from, factor);
  const target = base + hp;
  // inside the run: the hit that crosses
  for (const [frame, cum] of curve.points) {
    if (frame / FPS < from) continue;
    if (cum >= target) {
      const at = frame / FPS;
      return at <= limit ? { at, extrapolated: false } : null;
    }
  }
  // past it
  const rate = steadyRate(curve, factor);
  if (!(rate > 0)) return null;
  let d = Math.max(base, curve.points[curve.points.length - 1]?.[1] ?? 0);
  if (from > curve.seconds) d = base;
  let s = Math.max(from, curve.seconds);
  while (s < limit) {
    const step = rate * factor(s) * STEP;
    if (d + step >= target) return { at: s + (target - d) / (rate * factor(s) || 1), extrapolated: true };
    d += step;
    s += STEP;
  }
  return null;
}

export interface KillTime {
  /** seconds of the clock used, null when the floor outlasts `limit` (no clear) */
  seconds: number | null;
  /** the kill (or a segment of it) falls past the end of Riley's run */
  extrapolated: boolean;
  /** each segment's end, s (null from the first one that doesn't fall in time) */
  splits: Array<number | null>;
}

/** Kill time across a floor's HP segments, in order, each on its own curve. */
export function killTime(segments: Array<{ hp: number; curve: CurveLike }>, factor: TimeFactor = NONE, limit = 300): KillTime {
  let t = 0;
  let extrapolated = false;
  const splits: Array<number | null> = [];
  for (const seg of segments) {
    const hit = crossing(seg.curve, t, seg.hp, factor, limit);
    if (!hit) {
      while (splits.length < segments.length) splits.push(null);
      return { seconds: null, extrapolated: true, splits };
    }
    t = hit.at;
    extrapolated ||= hit.extrapolated;
    splits.push(t);
  }
  return { seconds: segments.length ? t : null, extrapolated, splits };
}

/** Steady-state DPS against a curve — the last loop's damage over its seconds. */
export const steadyDps = (curve: CurveLike): number => {
  const n = curve.sectionSeconds.length;
  return n ? (curve.sectionTotals[n - 1] ?? 0) / (curve.sectionSeconds[n - 1] || 1) : 0;
};
