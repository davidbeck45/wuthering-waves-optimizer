// Wuthering Tools+ — the fight timeline's shared arithmetic: the ranges it can show (the fight, the opener, each loop
// pass as the cue card plays it), the x scale, ruler steps, step-series lookups, what is on field at a frame. Pure.
import type { CuePlan } from "./cueModel";
import type { RotationModel, Visit } from "./extract";

export interface TimeRange {
  key: string;
  label: string;
  from: number;
  to: number;
}

/** The fight, then each pass the cue card plays (a loop opens on its first swap-in). */
export function rangesOf(model: RotationModel, plan: CuePlan): TimeRange[] {
  const out: TimeRange[] = [{ key: "fight", label: "Whole fight", from: 0, to: model.frames }];
  const sections = [...new Set(plan.steps.map((s) => s.section))];
  for (const s of sections) {
    const visits = plan.steps.filter((p) => p.section === s).map((p) => p.visit);
    if (!visits.length) continue;
    out.push({ key: s === 0 ? "opener" : `loop${s}`, label: s === 0 ? "Opener" : `Loop ${s}`, from: visits[0]!.start, to: visits[visits.length - 1]!.end });
  }
  return out;
}

export interface Scale {
  from: number;
  to: number;
  /** plot width, px */
  width: number;
  fps: number;
}

export const xOf = (s: Scale, frame: number): number => ((frame - s.from) / Math.max(1, s.to - s.from)) * s.width;
export const frameAt = (s: Scale, x: number): number => s.from + (x / Math.max(1, s.width)) * (s.to - s.from);

/** A ruler step in seconds that keeps labels at least `minPx` apart. */
export function rulerStep(seconds: number, width: number, minPx = 64): number {
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60];
  for (const st of steps) if ((st / Math.max(seconds, 0.001)) * width >= minPx) return st;
  return 120;
}

/** The last value of a [frame, value] series at or before `frame` (null before its first point). */
export function valueAt(series: Array<[number, number]>, frame: number): number | null {
  let lo = 0, hi = series.length - 1, hit = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid]![0] <= frame) {
      hit = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return hit < 0 ? null : series[hit]![1];
}

/** The visit on field at a frame, and the press it was on. */
export function onFieldAt(model: Pick<RotationModel, "visits">, frame: number): { visit: Visit; chip: number } | null {
  const visit = model.visits.find((v) => frame >= v.start && frame < v.end);
  if (!visit) return null;
  let chip = -1;
  visit.chips.forEach((c, k) => {
    if (c.frame <= frame) chip = k;
  });
  return { visit, chip };
}

/** Running damage at a frame (the cumulative curve's step). */
export function damageAt(model: Pick<RotationModel, "cumulative">, frame: number): number {
  const { frames, damage } = model.cumulative;
  let lo = 0, hi = frames.length - 1, hit = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid]! <= frame) {
      hit = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return hit < 0 ? 0 : damage[hit]!;
}

/** "1.5M", "3M", "820k" */
export function hpText(hp: number): string {
  if (hp >= 1e6) return `${Number((hp / 1e6).toFixed(hp % 1e6 === 0 ? 0 : 2))}M`;
  if (hp >= 1e3) return `${Math.round(hp / 1e3)}k`;
  return String(Math.round(hp));
}

/** "4.5M" / "4,500,000" / "4.5m" → 4500000; null where it is not a number. */
export function parseHp(text: string): number | null {
  const m = /^\s*([\d.,]+)\s*([kKmM]?)\s*$/.exec(text);
  if (!m) return null;
  const n = Number(m[1]!.replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * (m[2]!.toLowerCase() === "m" ? 1e6 : m[2]!.toLowerCase() === "k" ? 1e3 : 1));
}

/** The HP lines every timeline draws (spec: 1.5M / 3M / 4M), plus the player's own. */
export const BASE_HP = [1_500_000, 3_000_000, 4_000_000];
export const hpLines = (custom: number): number[] => [...new Set([...BASE_HP, ...(custom > 0 ? [custom] : [])])].sort((a, b) => a - b);

/** A downsampled cumulative curve for drawing: at most one point per `px` across [from, to]. */
export function curvePoints(model: Pick<RotationModel, "cumulative">, s: Scale, px = 2): Array<[number, number]> {
  const { frames, damage } = model.cumulative;
  const out: Array<[number, number]> = [[0, damageAt(model, s.from)]];
  let lastX = -Infinity;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i]!;
    if (f < s.from) continue;
    if (f > s.to) break;
    const x = xOf(s, f);
    if (x - lastX < px && i + 1 < frames.length && frames[i + 1]! <= s.to) continue;
    out.push([x, damage[i]!]);
    lastX = x;
  }
  out.push([s.width, damageAt(model, s.to)]);
  return out;
}
