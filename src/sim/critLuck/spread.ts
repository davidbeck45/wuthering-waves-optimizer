// Wuthering Tools+ — crit luck: how far one run's damage lands from the average every page shows. Pure.
//
// Every damage figure on the site is an average: each hit counted at non-crit × (1 − Crit Rate) + crit × Crit Rate.
// In a real run each hit either crits or it doesn't, so a rotation's total is a sum of independent two-outcome hits.
// This module turns a list of those hits into the spread of the total: mean (equal to the engine's average, to float
// precision), standard deviation, skew, and the 10th / 50th / 90th percentiles ("8 runs in 10 land between …").
//
//   critHit(avg, critRate%, critDmg%)   one hit as the engine averaged it → non-crit / crit / chance (mean kept exactly)
//   hitFromFigures(n, c, avg)           one hit (or a whole attack) from its non-crit, crit and average figures
//   momentsOf(hits)                     mean, variance, third moment, effective hit count
//   damageRange(hits)                   the percentiles, by the method the hits allow (see `methodFor`)
//
// What it does not model: anything but crits. Enemy actions, dodges, invulnerable phases and a player's timing
// move a real run too; the engines assume a perfect, fixed rotation, and so does this.
import { seededRandom } from "../echoLab/fingerprint";

/** One hit: `n` its damage when it doesn't crit, `c` when it does, `p` the chance it crits (0–1). A hit that cannot
 *  crit (a Negative Status tick, a fixed-damage hit, Crit Rate 0) has `p` 0 and `c` = `n`. */
export interface CritHit {
  n: number;
  c: number;
  p: number;
}

/** One hit as the engine averaged it: `avg` = n × (1 + p × (critDmg − 1)), p = Crit Rate capped at 100 %. Crit Rate and
 *  Crit DMG in % (65 = 65 %, 250 = ×2.5). The non-crit figure is backed out of the average, so the hit's mean is the
 *  engine's own number exactly (a floored crit figure would drift by up to a point per hit). */
export function critHit(avg: number, critRatePct: number | null | undefined, critDmgPct: number | null | undefined): CritHit {
  const p = Math.min(1, Math.max(0, Number(critRatePct) / 100 || 0));
  const m = Number(critDmgPct) / 100 || 1;
  if (!(avg > 0) || p === 0 || !(m > 1)) return { n: avg, c: avg, p: 0 };
  if (p === 1) return { n: avg / m, c: avg, p: 1 };
  const n = avg / (1 + p * (m - 1));
  return { n, c: n * m, p };
}

/** A hit (or a whole attack) from its three figures — non-crit, crit and average, as the app's calculator reports them.
 *  The chance is the one those figures imply ((avg − n) / (c − n)), so the mean is `avg` exactly. */
export function hitFromFigures(nonCrit: number, crit: number, avg: number): CritHit {
  const n = Number(nonCrit) || 0;
  const c = Number(crit) || 0;
  const a = Number(avg) || 0;
  if (!(c > n)) return { n: a, c: a, p: 0 };
  const p = Math.min(1, Math.max(0, (a - n) / (c - n)));
  return { n, c, p };
}

export const hitMean = (h: CritHit): number => h.n + h.p * (h.c - h.n);
export const hitVariance = (h: CritHit): number => h.p * (1 - h.p) * (h.c - h.n) ** 2;
/** E[(X − μ)³] of one two-outcome hit */
export const hitThird = (h: CritHit): number => h.p * (1 - h.p) * (1 - 2 * h.p) * (h.c - h.n) ** 3;
/** a hit whose outcome is not in doubt (it cannot crit, or it always does) */
export const isFixed = (h: CritHit): boolean => h.p <= 0 || h.p >= 1 || !(h.c > h.n);

export interface Moments {
  mean: number;
  variance: number;
  /** third central moment (skew × sd³) */
  third: number;
  /** Σ variance² — what the effective hit count is made of */
  varSq: number;
  /** hits counted, and those whose crit is in doubt */
  hits: number;
  rolls: number;
}

export const EMPTY_MOMENTS: Readonly<Moments> = Object.freeze({ mean: 0, variance: 0, third: 0, varSq: 0, hits: 0, rolls: 0 });

export function addHit(m: Moments, h: CritHit, scale = 1): void {
  const v = hitVariance(h) * scale * scale;
  m.mean += hitMean(h) * scale;
  m.variance += v;
  m.third += hitThird(h) * scale * scale * scale;
  m.varSq += v * v;
  m.hits += 1;
  if (!isFixed(h)) m.rolls += 1;
}

export function momentsOf(hits: Iterable<CritHit>): Moments {
  const m: Moments = { ...EMPTY_MOMENTS };
  for (const h of hits) addHit(m, h);
  return m;
}

export const sdOf = (m: Pick<Moments, "variance">): number => Math.sqrt(Math.max(0, m.variance));
export const skewOf = (m: Pick<Moments, "variance" | "third">): number => (m.variance > 0 ? m.third / m.variance ** 1.5 : 0);
/** How many equal hits would spread the total this much: 1 when one hit decides it, the roll count when all are alike.
 *  The normal approximation needs this to be large — a total ruled by a few big hits is lumpy, not bell-shaped. */
export const effectiveHits = (m: Pick<Moments, "variance" | "varSq">): number => (m.varSq > 0 ? (m.variance * m.variance) / m.varSq : 0);

/* --------------------------------------------------------------------------------------------- the normal */

/** Φ(x), the standard normal CDF, off the complementary error function below. */
export function normalCdf(x: number): number {
  if (x === Infinity) return 1;
  if (x === -Infinity) return 0;
  return 0.5 * erfc(-x / Math.SQRT2);
}

function erfc(x: number): number {
  // Numerical Recipes' erfc (Chebyshev fit), fractional error < 1.2e-7 everywhere — ample for whole percents
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

/** φ(x), the standard normal density */
export const normalPdf = (x: number): number => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

/** Φ⁻¹(p) (Acklam's rational approximation, relative error < 1.2e-9). */
export function normalInv(p: number): number {
  if (!(p > 0)) return -Infinity;
  if (!(p < 1)) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  if (p > 1 - lo) return -normalInv(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
}

/** P(total ≤ x) under the normal approximation with the first skew term (Edgeworth), clamped to [0, 1]. */
export function normalCdfSkewed(x: number, mean: number, sd: number, skew: number): number {
  if (!(sd > 0)) return x >= mean ? 1 : 0;
  const z = (x - mean) / sd;
  return Math.min(1, Math.max(0, normalCdf(z) - (skew / 6) * (z * z - 1) * normalPdf(z)));
}

/** The q-th quantile under the normal approximation with the Cornish–Fisher skew term. */
export function normalQuantile(q: number, mean: number, sd: number, skew: number): number {
  const z = normalInv(q);
  return mean + sd * (z + (skew / 6) * (z * z - 1));
}

/* ------------------------------------------------------------------------------------------ the methods */

export type RangeMethod = "exact" | "normal" | "monteCarlo";

/** Hits whose crit is in doubt, at most this many: every outcome is enumerated (2^12 = 4,096 totals). */
export const EXACT_MAX_ROLLS = 12;
/** The normal approximation is used when the total is made of at least this many effective hits … */
export const NORMAL_MIN_HITS = 25;
/** … and its skew stays this small (at 0.3 the Cornish–Fisher term moves a P10 / P90 by ~3 % of a standard deviation). */
export const NORMAL_MAX_SKEW = 0.3;
export const MONTE_CARLO_SAMPLES = 5000;
export const DEFAULT_SEED = "wtplus:crit-luck";

/** Which way the percentiles are worked out: every outcome when only a few hits can crit, the normal curve when the
 *  total is many comparable hits and barely skewed, a seeded Monte Carlo otherwise (a few big hits among many small). */
export function methodFor(m: Moments): RangeMethod {
  if (m.rolls <= EXACT_MAX_ROLLS) return "exact";
  if (effectiveHits(m) >= NORMAL_MIN_HITS && Math.abs(skewOf(m)) <= NORMAL_MAX_SKEW) return "normal";
  return "monteCarlo";
}

/** Every total the hits can make and its chance, ascending — only for a handful of hits in doubt (≤ EXACT_MAX_ROLLS). */
export function exactDistribution(hits: readonly CritHit[]): Array<[total: number, chance: number]> {
  let fixed = 0;
  let dist: Array<[number, number]> = [[0, 1]];
  for (const h of hits) {
    if (isFixed(h)) {
      fixed += hitMean(h);
      continue;
    }
    const next = new Map<number, number>();
    for (const [x, w] of dist) {
      next.set(x + h.n, (next.get(x + h.n) ?? 0) + w * (1 - h.p));
      next.set(x + h.c, (next.get(x + h.c) ?? 0) + w * h.p);
    }
    dist = [...next];
  }
  return dist.map(([x, w]) => [x + fixed, w] as [number, number]).sort((a, b) => a[0] - b[0]);
}

/** The smallest total whose cumulative chance reaches q (a discrete distribution's q-th quantile). */
export function quantileOfDistribution(dist: ReadonlyArray<readonly [number, number]>, q: number): number {
  let acc = 0;
  for (const [x, w] of dist) {
    acc += w;
    if (acc >= q - 1e-12) return x;
  }
  return dist[dist.length - 1]?.[0] ?? 0;
}

/** `samples` totals of one run each, every hit rolling its own crit off a seeded generator — the same seed gives the
 *  same totals. Sorted ascending. */
export function sampleTotals(hits: readonly CritHit[], samples = MONTE_CARLO_SAMPLES, seed: number | string = DEFAULT_SEED): Float64Array {
  let fixed = 0;
  const live: CritHit[] = [];
  for (const h of hits) {
    if (isFixed(h)) fixed += hitMean(h);
    else live.push(h);
  }
  const rng = seededRandom(seed);
  const out = new Float64Array(samples);
  for (let s = 0; s < samples; s++) {
    let total = fixed;
    for (const h of live) total += rng() < h.p ? h.c : h.n;
    out[s] = total;
  }
  return out.sort();
}

/** The q-th quantile of sorted samples (the smallest sample with at least q of them at or below it). */
export const quantileOfSamples = (sorted: ArrayLike<number>, q: number): number =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]! : 0;

/* --------------------------------------------------------------------------------------------- the range */

export interface DamageRange {
  /** the engine's average (Σ of each hit's average) */
  mean: number;
  sd: number;
  skew: number;
  /** effective hit count (see `effectiveHits`) and how many hits could crit at all */
  effectiveHits: number;
  rolls: number;
  hits: number;
  /** 10th / 50th / 90th percentile of one run's total: 8 runs in 10 land between p10 and p90 */
  p10: number;
  p50: number;
  p90: number;
  method: RangeMethod;
}

export interface RangeOptions {
  /** force one method (tests, validation) */
  method?: RangeMethod;
  samples?: number;
  seed?: number | string;
  /** multiply every figure (damage → DPS: 60 / frames) */
  scale?: number;
}

/** One run's total off its hits: the engine's average plus how far a run lands from it. */
export function damageRange(hits: readonly CritHit[], opts: RangeOptions = {}): DamageRange {
  const m = momentsOf(hits);
  const method = opts.method ?? methodFor(m);
  const k = opts.scale ?? 1;
  const sd = sdOf(m);
  const skew = skewOf(m);
  let q: [number, number, number];
  if (method === "exact") {
    const dist = exactDistribution(hits);
    q = [quantileOfDistribution(dist, 0.1), quantileOfDistribution(dist, 0.5), quantileOfDistribution(dist, 0.9)];
  } else if (method === "normal") {
    q = [normalQuantile(0.1, m.mean, sd, skew), normalQuantile(0.5, m.mean, sd, skew), normalQuantile(0.9, m.mean, sd, skew)];
  } else {
    const s = sampleTotals(hits, opts.samples, opts.seed);
    q = [quantileOfSamples(s, 0.1), quantileOfSamples(s, 0.5), quantileOfSamples(s, 0.9)];
  }
  return {
    mean: m.mean * k,
    sd: sd * k,
    skew,
    effectiveHits: effectiveHits(m),
    rolls: m.rolls,
    hits: m.hits,
    p10: q[0] * k,
    p50: q[1] * k,
    p90: q[2] * k,
    method,
  };
}

/** A spread worth showing: the 10th and 90th percentiles differ by at least 0.5 % of the average (a build with no
 *  crit at all, or Crit Rate at 100 %, has none). */
export const hasSpread = (r: Pick<DamageRange, "mean" | "p10" | "p90">): boolean => r.mean > 0 && r.p90 - r.p10 >= 0.005 * r.mean;
