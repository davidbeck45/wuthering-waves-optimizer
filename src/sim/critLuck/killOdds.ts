// Wuthering Tools+ — crit luck on a Tower of Adversity floor: how often a team's kill lands by a given second. Pure.
//
// The clear check's kill time (endgame/killTime.ts) is where the AVERAGE damage curve crosses the floor's HP. A real run
// deals a little more or less: each hit crits or it doesn't. The damage dealt by second t, D(t), only ever grows, so
//
//     the kill lands by t   ⇔   D(t) − D(start) ≥ HP,
//
// and the kill-time distribution is read straight off the distribution of D(t). D(t) is a sum of every hit landed by t,
// each crit rolled on its own: its mean is the existing curve, its variance and skew add up hit by hit (critLuck/spread.ts).
//
//   normal       P(D(t) − D(s) ≥ HP) from the mean, variance and skew of the hits between s and t (Edgeworth's first
//                skew term). A floor of several HP segments (two bosses with different RES) chains them: segment k's
//                start is segment k−1's kill-time distribution (kept on a 0.1 s grid), and it fights on its own curve
//                from there — the hits after a kill are other hits, so their crits are independent of the ones before.
//   monteCarlo   when the hits up to the kill are too few or too lopsided for a bell curve (one big Liberation decides
//                it), seeded runs: every hit rolls its crit, segments in order, the kill where the HP runs out.
//
// Past the end of Riley's run (opener + 3 loops, ~100 s) the mean follows killTime.ts's extrapolation (the last loop's
// DPS, times any DMG-taken ramp) and the variance grows at the last loop's own rate (times the ramp squared); a Monte
// Carlo run that is still fighting there draws the rest of its kill from that same extrapolated spread (not the last
// loop's hits replayed: their exact frames would put every kill on the next big hit, seconds off the average kill the
// verdict shows). Not modelled: anything but crits — enemy actions, dodges, phases, timing.
import type { FightCurve } from "../engine/rileyRun";
import { seededRandom } from "../echoLab/fingerprint";
import { steadyRate, type CurveLike, type TimeFactor } from "../endgame/killTime";
import { critHit, hitThird, hitVariance, isFixed, normalCdfSkewed, NORMAL_MAX_SKEW, NORMAL_MIN_HITS, type CritHit } from "./spread";

/** A damage curve that carries each hit's crit (`fightCurve(…, spread)`). */
export type SpreadCurve = CurveLike & Pick<FightCurve, "critHits">;
export interface SpreadSegment {
  hp: number;
  curve: SpreadCurve;
}

export type OddsMethod = "normal" | "mixture" | "monteCarlo";

/** The levels the kill-time distribution is kept at: dense in the middle, out to 1 in 10,000 at both ends. */
export const KILL_LEVELS: readonly number[] = [
  0.0001, 0.001, 0.005, 0.01, 0.02, 0.03, 0.05, 0.075,
  ...Array.from({ length: 33 }, (_, i) => Math.round((0.1 + i * 0.025) * 1000) / 1000),
  0.925, 0.95, 0.97, 0.98, 0.99, 0.995, 0.999, 0.9999,
];

export interface KillOdds {
  /** kill time (s of the clock used) at each of `KILL_LEVELS`: P(kill by q[i]) ≥ KILL_LEVELS[i]; null where the floor is
   *  not down by the clock's end that often */
  q: Array<number | null>;
  method: OddsMethod;
}

const FPS = 60;
/** past the run, the spread is kept every 6 frames (0.1 s) */
const PAST_STEP = 6;
const EPS = 1e-6;

/* ---------------------------------------------------------------------------------------- the spread track */

interface Moments4 {
  mean: number;
  var: number;
  third: number;
  varSq: number;
}

interface Track {
  /** frames with hits inside the run, ascending, and the moments of everything landed up to each */
  frames: number[];
  cum: Moments4[];
  /** the run's end, s, and the moments there */
  seconds: number;
  end: Moments4;
  /** past the run: every 0.1 s from `seconds`, built on first use */
  past: Moments4[] | null;
  rates: { mean: number; var: number; third: number; varSq: number };
  factor: TimeFactor;
  limit: number;
  /** each hit as a two-outcome roll, by frame (the mixture and the Monte Carlo) */
  hits: Array<{ frame: number; hit: CritHit }>;
}

const ZERO: Moments4 = { mean: 0, var: 0, third: 0, varSq: 0 };

function buildTrack(curve: SpreadCurve, factor: TimeFactor, limit: number): Track | null {
  const raw = curve.critHits;
  if (!raw?.length) return null;
  const hits = raw.map(([frame, , avg, cr, cd]) => ({ frame, avg, hit: critHit(avg, cr, cd) }));
  // landing order is not quite frame order (a split press's hits land between later casts): the curve sorts by frame
  const sorted = hits.map((h, i) => ({ ...h, i })).sort((a, b) => a.frame - b.frame || a.i - b.i);
  const frames: number[] = [];
  const cum: Moments4[] = [];
  const m: Moments4 = { ...ZERO };
  for (const { frame, avg, hit } of sorted) {
    const v = hitVariance(hit);
    // the engine's own figure (whole points), so the mean is the curve itself
    m.mean += avg;
    m.var += v;
    m.third += hitThird(hit);
    m.varSq += v * v;
    if (frames.length && frames[frames.length - 1] === frame) cum[cum.length - 1] = { ...m };
    else {
      frames.push(frame);
      cum.push({ ...m });
    }
  }
  // the last loop's rates with the floor's time factor divided out (killTime.ts `steadyRate` for the mean)
  const n = curve.sectionSeconds.length;
  const secs = curve.sectionSeconds[n - 1] ?? 0;
  const from = curve.seconds - secs;
  let f1 = 0, f2 = 0, f3 = 0, f4 = 0, k = 0;
  for (let t = from; t < curve.seconds; t += 1 / FPS, k++) {
    const f = factor(t);
    f1 += f;
    f2 += f * f;
    f3 += f * f * f;
    f4 += f * f * f * f;
  }
  const loop = { var: 0, third: 0, varSq: 0 };
  for (const { frame, hit } of sorted) {
    if (frame / FPS < from) continue;
    const v = hitVariance(hit);
    loop.var += v;
    loop.third += hitThird(hit);
    loop.varSq += v * v;
  }
  const per = (x: number, fk: number): number => (secs > 0 && k ? x / secs / (fk / k || 1) : 0);
  return {
    frames,
    cum,
    seconds: curve.seconds,
    end: { ...m },
    past: null,
    rates: { mean: steadyRate(curve, factor), var: per(loop.var, f2), third: per(loop.third, f3), varSq: per(loop.varSq, f4) },
    factor,
    limit,
    hits: sorted.map(({ frame, hit }) => ({ frame, hit })),
  };
}

/** Everything landed by `t` seconds: the run's hits up to its end, the extrapolation after. */
function momentsAt(tr: Track, t: number): Moments4 {
  if (t <= tr.seconds) {
    const frame = Math.floor(t * FPS + 1e-9);
    let lo = 0, hi = tr.frames.length - 1, at = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (tr.frames[mid]! <= frame) {
        at = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return at < 0 ? ZERO : tr.cum[at]!;
  }
  const past = pastOf(tr);
  const x = ((t - tr.seconds) * FPS) / PAST_STEP;
  const i = Math.min(past.length - 2, Math.floor(x));
  if (i < 0) return past[0]!;
  const a = past[i]!, b = past[i + 1]!, w = Math.min(1, x - i);
  return { mean: a.mean + (b.mean - a.mean) * w, var: a.var + (b.var - a.var) * w, third: a.third + (b.third - a.third) * w, varSq: a.varSq + (b.varSq - a.varSq) * w };
}

/** The extrapolation, frame by frame as killTime.ts integrates it, kept every 0.1 s up to the clock's end. */
function pastOf(tr: Track): Moments4[] {
  if (tr.past) return tr.past;
  const out: Moments4[] = [];
  const m = { ...tr.end };
  out.push({ ...m });
  const step = 1 / FPS;
  const frames = Math.ceil((tr.limit - tr.seconds) * FPS) + PAST_STEP;
  for (let k = 1; k <= frames; k++) {
    const s = tr.seconds + (k - 1) * step;
    const f = tr.factor(s);
    m.mean += tr.rates.mean * f * step;
    m.var += tr.rates.var * f * f * step;
    m.third += tr.rates.third * f * f * f * step;
    m.varSq += tr.rates.varSq * f * f * f * f * step;
    if (k % PAST_STEP === 0) out.push({ ...m });
  }
  tr.past = out;
  return out;
}

/** The times a kill can land at on this track, ascending: every hit frame in the run, then every 0.1 s to the limit. */
function gridOf(tr: Track): number[] {
  const out: number[] = [];
  for (const f of tr.frames) if (f / FPS <= tr.limit) out.push(f / FPS);
  for (let t = tr.seconds + PAST_STEP / FPS; t <= tr.limit + 1e-9; t += PAST_STEP / FPS) out.push(t);
  return out;
}

/** P(the hits after `s` and up to `t` deal at least `hp`), normal with the skew term. */
function chanceDealt(tr: Track, s: number, t: number, hp: number): number {
  if (!(t > s)) return hp <= 0 ? 1 : 0;
  const a = momentsAt(tr, s), b = momentsAt(tr, t);
  const mu = b.mean - a.mean;
  const v = b.var - a.var;
  if (!(v > 1e-9 * mu * mu)) return mu >= hp ? 1 : 0;
  const sd = Math.sqrt(v);
  return 1 - normalCdfSkewed(hp, mu, sd, (b.third - a.third) / v ** 1.5);
}

/* ----------------------------------------------------------------------------------------------- normal */

type Support = Array<[time: number, weight: number]>;

/** The CDF of this segment's kill on its grid, inside the window where it moves (running max: never decreasing). */
function cdfOn(tr: Track, hp: number, start: Support): { t: number[]; p: number[] } {
  const grid = gridOf(tr);
  const G = (t: number): number => {
    let s = 0;
    for (const [tau, w] of start) if (tau < t) s += w * chanceDealt(tr, tau, t, hp);
    return s;
  };
  const total = start.reduce((s, [, w]) => s + w, 0);
  const firstAt = (level: number): number => {
    let lo = 0, hi = grid.length - 1, at = grid.length;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (G(grid[mid]!) >= level) {
        at = mid;
        hi = mid - 1;
      } else lo = mid + 1;
    }
    return at;
  };
  const lo = Math.max(0, firstAt(EPS * total) - 1);
  const hi = Math.min(grid.length - 1, firstAt(total * (1 - EPS)));
  const t: number[] = [];
  const p: number[] = [];
  let run = 0;
  for (let i = lo; i <= hi; i++) {
    run = Math.max(run, G(grid[i]!));
    t.push(grid[i]!);
    p.push(run);
  }
  return { t, p };
}

/** A CDF as a start-time distribution, binned to 0.1 s (weights sum to the chance the kill happened at all). */
function supportOf(cdf: { t: number[]; p: number[] }): Support {
  const bins = new Map<number, [number, number]>();
  let prev = 0;
  for (let i = 0; i < cdf.t.length; i++) {
    const w = cdf.p[i]! - prev;
    prev = cdf.p[i]!;
    if (!(w > 0)) continue;
    const key = Math.floor(cdf.t[i]! * 10);
    const b = bins.get(key) ?? [0, 0];
    bins.set(key, [b[0] + w * cdf.t[i]!, b[1] + w]);
  }
  return [...bins.values()].map(([tw, w]) => [tw / w, w] as [number, number]).sort((a, b) => a[0] - b[0]);
}

function quantilesOf(cdf: { t: number[]; p: number[] }, seconds: number): Array<number | null> {
  return KILL_LEVELS.map((level) => {
    for (let i = 0; i < cdf.t.length; i++) {
      if (cdf.p[i]! < level - 1e-12) continue;
      const t = cdf.t[i]!;
      // inside the run a kill lands on a hit's frame; past it the curve is continuous, so read between the 0.1 s points
      if (i > 0 && cdf.t[i - 1]! > seconds && cdf.p[i]! > cdf.p[i - 1]!) {
        const t0 = cdf.t[i - 1]!, p0 = cdf.p[i - 1]!;
        return t0 + ((level - p0) / (cdf.p[i]! - p0)) * (t - t0);
      }
      return t;
    }
    return null;
  });
}

/* ----------------------------------------------------------------------------------------------- mixture */

/** At most this many of a fight's biggest crit gambles are played out exactly (2^10 = 1,024 outcomes). */
export const MIXTURE_MAX = 10;

const minus = (a: Moments4, b: Moments4): Moments4 => ({ mean: a.mean - b.mean, var: a.var - b.var, third: a.third - b.third, varSq: a.varSq - b.varSq });
const bellShaped = (m: Moments4, total: number): boolean => {
  if (!(m.var > 1e-6 * total)) return true;
  const neff = m.varSq > 0 ? (m.var * m.var) / m.varSq : 0;
  return neff >= NORMAL_MIN_HITS && Math.abs(m.third / m.var ** 1.5) <= NORMAL_MAX_SKEW;
};

/** One segment from the fight's start: its few biggest crit gambles (by variance, among the hits up to where the average
 *  has dealt a quarter more than the HP) enumerated outcome by outcome, the rest a bell curve — as few as leave the rest
 *  bell-shaped (none: the plain normal). Exact where one Liberation decides the kill, cheap where it doesn't. */
function mixtureCdf(tr: Track, hp: number): { t: number[]; p: number[]; big: number } {
  const grid = gridOf(tr);
  const base = momentsAt(tr, 0);
  const hiT = grid.find((x) => momentsAt(tr, x).mean - base.mean >= hp * 1.25) ?? tr.limit;
  const span = minus(momentsAt(tr, hiT), base);
  const pool = tr.hits.filter((h) => h.frame > 0 && h.frame / FPS <= hiT && !isFixed(h.hit)).sort((a, b) => hitVariance(b.hit) - hitVariance(a.hit) || a.frame - b.frame);
  let k = 0;
  let rest = { ...span };
  while (k < MIXTURE_MAX && k < pool.length && !bellShaped(rest, span.var)) {
    const h = pool[k++]!.hit;
    const v = hitVariance(h);
    rest = { mean: rest.mean, var: rest.var - v, third: rest.third - hitThird(h), varSq: rest.varSq - v * v };
  }
  const big = pool.slice(0, k).sort((a, b) => a.frame - b.frame);
  // each prefix of the big hits (by frame): their outcomes, and their moments to take out of the curve's
  const dists: Array<Array<[number, number]>> = [[[0, 1]]];
  const taken: Moments4[] = [{ ...ZERO }];
  for (const { hit } of big) {
    const prev = dists[dists.length - 1]!;
    const next: Array<[number, number]> = [];
    for (const [x, w] of prev) {
      next.push([x + hit.n, w * (1 - hit.p)]);
      next.push([x + hit.c, w * hit.p]);
    }
    dists.push(next);
    const t = taken[taken.length - 1]!;
    const v = hitVariance(hit);
    taken.push({ mean: t.mean + hit.n + hit.p * (hit.c - hit.n), var: t.var + v, third: t.third + hitThird(hit), varSq: t.varSq + v * v });
  }
  const G = (t: number): number => {
    const frame = Math.floor(t * FPS + 1e-9);
    let n = 0;
    while (n < big.length && big[n]!.frame <= frame) n++;
    const small = minus(minus(momentsAt(tr, t), base), taken[n]!);
    let p = 0;
    if (!(small.var > 1e-9 * Math.max(1, small.mean * small.mean))) {
      for (const [x, w] of dists[n]!) if (x + small.mean >= hp - 1e-6) p += w;
      return p;
    }
    const sd = Math.sqrt(small.var);
    const skew = small.third / small.var ** 1.5;
    for (const [x, w] of dists[n]!) p += w * (1 - normalCdfSkewed(hp - x, small.mean, sd, skew));
    return p;
  };
  const firstAt = (level: number): number => {
    let lo = 0, hi = grid.length - 1, at = grid.length;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (G(grid[mid]!) >= level) {
        at = mid;
        hi = mid - 1;
      } else lo = mid + 1;
    }
    return at;
  };
  const lo = Math.max(0, firstAt(EPS) - 1);
  const hi = Math.min(grid.length - 1, firstAt(1 - EPS));
  const t: number[] = [];
  const p: number[] = [];
  let run = 0;
  for (let i = lo; i <= hi; i++) {
    run = Math.max(run, G(grid[i]!));
    t.push(grid[i]!);
    p.push(run);
  }
  return { t, p, big: k };
}

/* ------------------------------------------------------------------------------------------- Monte Carlo */

export const KILL_SAMPLES = 2000;

/** One Monte Carlo run still fighting past the end of the run (or starting a segment there): the time the remaining
 *  `left` HP falls, drawn at `u` off the extrapolated spread from `t0` — the same P(D(t) − D(t0) ≥ left) the normal
 *  method reads (`chanceDealt`), inverted on a 0.1 s grid and read in a straight line inside the step. Null when the
 *  floor is not down by the limit. */
function pastKill(tr: Track, t0: number, left: number, u: number): number | null {
  const step = PAST_STEP / FPS;
  const steps = Math.floor((tr.limit - t0) / step + 1e-9);
  if (steps < 1) return null;
  const F = (j: number): number => chanceDealt(tr, t0, t0 + j * step, left);
  if (F(steps) < u) return null;
  let lo = 1, hi = steps;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (F(mid) >= u) hi = mid;
    else lo = mid + 1;
  }
  const f1 = F(lo), f0 = lo > 1 ? F(lo - 1) : 0;
  const w = f1 > f0 ? Math.min(1, Math.max(0, (u - f0) / (f1 - f0))) : 1;
  return t0 + (lo - 1 + w) * step;
}

function monteCarlo(tracks: Track[], hps: number[], samples: number, seed: string | number): Array<number | null> {
  const rng = seededRandom(seed);
  const kills: number[] = [];
  const roll = (h: CritHit): number => (isFixed(h) ? h.n + h.p * (h.c - h.n) : rng() < h.p ? h.c : h.n);
  for (let s = 0; s < samples; s++) {
    let from = 0; // a frame (fractional past the run): the next segment counts hits after it
    let killed = true;
    for (let k = 0; k < tracks.length && killed; k++) {
      const tr = tracks[k]!;
      const limitFrame = tr.limit * FPS;
      let dealt = 0;
      let hit = false;
      for (const { frame, hit: h } of tr.hits) {
        if (frame <= from) continue;
        if (frame > limitFrame) break;
        dealt += roll(h);
        if (dealt >= hps[k]!) {
          from = frame;
          hit = true;
          break;
        }
      }
      // past the run: the rest from the extrapolated spread (the mean killTime.ts extrapolates, the last loop's variance)
      if (!hit) {
        const t = pastKill(tr, Math.max(from / FPS, tr.seconds), hps[k]! - dealt, rng());
        if (t !== null) {
          from = t * FPS;
          hit = true;
        }
      }
      killed = hit;
    }
    kills.push(killed ? from / FPS : Infinity);
  }
  kills.sort((a, b) => a - b);
  return KILL_LEVELS.map((level) => {
    const x = kills[Math.min(kills.length - 1, Math.max(0, Math.ceil(level * kills.length) - 1))]!;
    return Number.isFinite(x) ? x : null;
  });
}

/* --------------------------------------------------------------------------------------------- the odds */

/** Do the hits along the average path make a bell curve? Each segment's hits from its average start to its average
 *  kill need enough effective hits and little skew (the same bar as spread.ts `methodFor`). */
function normalHolds(tracks: Track[], hps: number[]): boolean {
  let s = 0;
  for (let k = 0; k < tracks.length; k++) {
    const tr = tracks[k]!;
    const grid = gridOf(tr);
    const a = momentsAt(tr, s);
    // the average kill: the first grid time the mean has dealt the HP
    let t = grid.find((x) => x > s && momentsAt(tr, x).mean - a.mean >= hps[k]!) ?? tr.limit;
    const b = momentsAt(tr, t);
    const v = b.var - a.var;
    const varSq = b.varSq - a.varSq;
    if (v > 0) {
      const neff = varSq > 0 ? (v * v) / varSq : 0;
      const skew = (b.third - a.third) / v ** 1.5;
      if (neff < NORMAL_MIN_HITS || Math.abs(skew) > NORMAL_MAX_SKEW) return false;
    }
    s = t;
    if (t >= tr.limit) break;
  }
  return true;
}

/** The kill-time distribution of a floor's HP segments fought in order (null when a curve carries no crits). */
export function killOdds(
  segments: SpreadSegment[],
  factor: TimeFactor = () => 1,
  opts: { limit?: number; method?: OddsMethod; samples?: number; seed?: string | number } = {},
): KillOdds | null {
  const limit = opts.limit ?? 300;
  if (!segments.length) return null;
  const tracks: Track[] = [];
  for (const seg of segments) {
    const tr = buildTrack(seg.curve, factor, limit);
    if (!tr) return null;
    tracks.push(tr);
  }
  const hps = segments.map((s) => s.hp);
  // one segment: the normal, with the few big gambles played out exactly where they'd bend it; several: the normal
  // chained where every segment is bell-shaped, else Monte Carlo
  if ((opts.method === undefined || opts.method === "mixture") && tracks.length === 1) {
    const cdf = mixtureCdf(tracks[0]!, hps[0]!);
    return { q: quantilesOf(cdf, tracks[0]!.seconds), method: cdf.big ? "mixture" : "normal" };
  }
  const method: OddsMethod = opts.method ?? (normalHolds(tracks, hps) ? "normal" : "monteCarlo");
  if (method === "monteCarlo") return { q: monteCarlo(tracks, hps, opts.samples ?? KILL_SAMPLES, opts.seed ?? "wtplus:kill-odds"), method };
  let start: Support = [[0, 1]];
  let cdf = { t: [] as number[], p: [] as number[] };
  for (let k = 0; k < tracks.length; k++) {
    cdf = cdfOn(tracks[k]!, hps[k]!, start);
    if (k < tracks.length - 1) start = supportOf(cdf);
    if (!start.length) return { q: KILL_LEVELS.map(() => null), method };
  }
  return { q: quantilesOf(cdf, tracks[tracks.length - 1]!.seconds), method };
}

/** P(the kill lands by `seconds` of the clock), off the stored distribution — at the player's `pace` (1.4 = their clears
 *  take 1.4× the sim's time), P(kill × pace ≤ seconds). Between the kept levels it reads in a straight line. */
export function chanceBy(odds: Pick<KillOdds, "q"> | null | undefined, seconds: number, pace = 1): number | null {
  if (!odds?.q?.length || !Number.isFinite(seconds)) return null;
  const x = seconds / (pace > 0 ? pace : 1);
  const q = odds.q;
  let at = -1;
  for (let i = 0; i < q.length; i++) if (q[i] !== null && q[i]! <= x + 1e-9) at = i;
  if (at < 0) return 0;
  if (at === q.length - 1) return 1;
  const next = q[at + 1];
  if (next === null || next === undefined) return KILL_LEVELS[at]!;
  const t0 = q[at]!;
  const l0 = KILL_LEVELS[at]!, l1 = KILL_LEVELS[at + 1]!;
  return next > t0 ? l0 + ((l1 - l0) * (x - t0)) / (next - t0) : l1;
}

/** The kill time at a level (0.1 → the fastest tenth of runs), null when the floor isn't down by then. */
export const killAtLevel = (odds: Pick<KillOdds, "q"> | null | undefined, level: number): number | null => {
  if (!odds?.q?.length) return null;
  const i = KILL_LEVELS.findIndex((l) => l >= level - 1e-12);
  return i < 0 ? null : (odds.q[i] ?? null);
};
