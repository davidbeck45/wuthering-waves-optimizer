// Wuthering Tools+ Echo Lab — every way to lock an echo for a Transducer re-roll, read off the echo's line model.
//
// The game's rule (version 3.1, Data Bank > Data Modify): a Transducer re-rolls the substats of a fully tuned 5-star
// echo "to random stats, excluding locked Substats"; the result may be kept or discarded, and the Transducers are spent
// either way. With five lines that is 31 lock sets (0 to 4 lines locked). A re-rolled line takes a type the locked
// lines do not hold, drawn evenly (the game publishes no type odds), at a value from Kuro's tier odds.
//
// Each lock set is read through the line model of the echo with no substats (lineModel.ts: every stat at every tier,
// every two stats that count together, all scored by the engine). An outcome's score is `anchor × what the model says
// the new lines add on top of the locked ones`, where `anchor` is the engine's own score of the locked lines alone: an
// outcome whose new lines add nothing is then exactly the engine's figure, and the model only carries the new lines.
//
// Stats that add nothing on this echo collapse: only which stats that count land, and at which tier, moves the score.
// So a lock set's outcomes are counted one by one whenever there are few enough (`exactLimit`), else drawn with a
// seeded PRNG. Pure: scores come in as numbers, no engine, no Vue.
import { SUBSTAT_KEYS, type SubstatKey } from "../substats/substatWeights";
import { seededRandom } from "./fingerprint";
import type { LineModel } from "./lineModel";
import { choose, tierOdds } from "./rolls";

const N = SUBSTAT_KEYS.length;
const KEY_INDEX = new Map<string, number>(SUBSTAT_KEYS.map((k, i) => [k, i]));

/** A change below this is no change: the engine's own rounding, not a better or worse echo. */
export const SAME_SCORE = 1e-9;

/** A lock set whose outcomes number at most this is counted outcome by outcome; a bigger one is drawn. */
export const DEFAULT_EXACT_LIMIT = 150_000;
/** Tries drawn for a lock set too big to count. */
export const DEFAULT_LOCK_SAMPLES = 40_000;
/** How many tries with the same locks `bestOf` is worked out for. */
export const MAX_TRIES = 12;

/** A line the echo holds now. */
export interface HeldLine {
  field: number;
  key: string;
  value: number;
}

export interface LockSetInput {
  /** the line model of the echo with no substats */
  model: LineModel;
  /** the echo's lines, in the order the lock masks count them (bit i = lines[i]) */
  lines: readonly HeldLine[];
  /** the engine's score of the build as it is */
  base: number;
  /** by lock mask: the engine's score with only those lines on the echo. Left out (or NaN for a mask), the model's own
   *  figure for the locked lines stands in */
  anchors?: ArrayLike<number>;
  /** a re-rolled line may come back as the type it replaced (the game's rule as far as it is published; default true) */
  canRepeat?: boolean;
  exactLimit?: number;
  samples?: number;
  seed?: number | string;
}

export interface LockSetStats {
  /** bit i set = lines[i] locked */
  mask: number;
  locks: number;
  /** chance the new lines beat the current ones */
  pImprove: number;
  /** expected relative gain when the better of old and new is kept */
  expectedGain: number;
  /** expected relative change if every result were kept */
  expectedChange: number;
  /** the worst and the best change among the outcomes read */
  min: number;
  max: number;
  /** outcomes counted, or tries drawn */
  outcomes: number;
  /** true when the outcomes were too many to count and tries were drawn instead */
  sampled: boolean;
}

export interface LockSetDetail {
  /** one try in ten does worse than p10, half do worse than p50, one in ten does better than p90 (changes if always kept) */
  p10: number;
  p50: number;
  p90: number;
  /** expected relative gain keeping the best of n tries with the same locks: `bestOf[0]` is one try, up to MAX_TRIES */
  bestOf: number[];
  /** the best result these locks can give: its gain, the new lines that make it, and the chance of exactly that */
  top: { gain: number; lines: Array<{ key: SubstatKey; value: number }>; chance: number };
}

interface Row {
  index: number;
  key: SubstatKey;
  values: readonly number[];
  probs: readonly number[];
  /** 1 + what a line of this stat adds alone, by tier */
  mult: number[];
  /** the pair scaling by tier; null for a stat that adds nothing on this echo */
  share: number[] | null;
}

const rowsOf = (model: LineModel): Row[] =>
  SUBSTAT_KEYS.map((key, index) => {
    const odds = tierOdds(key);
    const worth = model.worth[index];
    return {
      index,
      key,
      values: odds.values,
      probs: odds.probs,
      mult: odds.values.map((_, t) => 1 + (worth?.[t] ?? 0)),
      share: model.share[index] ? [...(model.share[index] as number[])] : null,
    };
  });

/** What a line of this stat adds alone at any value: its tier's figure, or a straight line between the tiers around it
 *  (through no line at 0; past the top tier the last stretch carries on). Damage is linear in one stat between caps. */
function worthAt(row: Row, value: number): number {
  const { values, mult } = row;
  const hit = values.findIndex((v) => Math.abs(v - value) <= 1e-6 * Math.max(1, Math.abs(v)));
  if (hit >= 0) return mult[hit] - 1;
  const xs = [0, ...values];
  const ys = [0, ...mult.map((m) => m - 1)];
  let i = 1;
  while (i < xs.length - 1 && value > xs[i]) i++;
  const span = xs[i] - xs[i - 1];
  return span > 0 ? ys[i - 1] + ((ys[i] - ys[i - 1]) * (value - xs[i - 1])) / span : ys[i];
}

interface Held {
  index: number;
  mult: number;
  share: number;
}

function heldOf(rows: readonly Row[], line: HeldLine): Held | null {
  const index = KEY_INDEX.get(line.key);
  if (index === undefined) return null;
  const row = rows[index];
  const worth = worthAt(row, line.value);
  const best = row.mult[row.mult.length - 1] - 1;
  return { index, mult: 1 + worth, share: row.share && Math.abs(best) > 1e-12 ? worth / best / (1 + worth) : 0 };
}

interface Prepared {
  mask: number;
  locks: number;
  /** lines re-rolled */
  k: number;
  /** multiply an outcome's own factor by this for score / base */
  scale: number;
  /** the stats in the pool that count, with what each tier multiplies the score by on top of the locked lines */
  live: Row[];
  eff: number[][];
  /** types in the pool: all, and the ones that add nothing */
  n: number;
  dead: number;
  /** by number of counting stats drawn: the chance of one given set of them (the rest drawn from the dead ones) */
  typeW: number[];
  outcomes: number;
}

function prepare(input: LockSetInput, rows: readonly Row[], held: ReadonlyArray<Held | null>, mask: number): Prepared {
  const { model, lines } = input;
  const canRepeat = input.canRepeat ?? true;
  const locked: Held[] = [];
  const closed = new Set<number>();
  let locks = 0;
  lines.forEach((_line, i) => {
    const h = held[i];
    const isLocked = Boolean(mask & (1 << i));
    if (isLocked) locks += 1;
    if (h && (isLocked || !canRepeat)) closed.add(h.index);
    if (h && isLocked) locked.push(h);
  });
  const k = lines.length - locks;
  // the model's own figure for the locked lines alone
  let lockedFactor = 1;
  for (let i = 0; i < locked.length; i++) {
    lockedFactor *= locked[i].mult;
    for (let j = 0; j < i; j++) {
      const p = model.pair[locked[i].index * N + locked[j].index];
      if (p) lockedFactor *= 1 + p * locked[i].share * locked[j].share;
    }
  }
  const anchor = input.anchors && Number.isFinite(input.anchors[mask]) ? input.anchors[mask] : model.ctx * lockedFactor;
  const pool = rows.filter((r) => !closed.has(r.index));
  const live = pool.filter((r) => r.share !== null);
  const eff = live.map((row) =>
    row.mult.map((m, t) => {
      let f = m;
      for (const l of locked) {
        const p = model.pair[row.index * N + l.index];
        if (p) f *= 1 + p * (row.share as number[])[t] * l.share;
      }
      return f;
    }),
  );
  const n = pool.length;
  const dead = n - live.length;
  const draws = Math.min(k, n);
  const total = choose(n, draws);
  const typeW: number[] = [];
  // elementary symmetric sums of the tier counts: how many (stats, tiers) picks of each size there are
  const e = new Array<number>(draws + 1).fill(0);
  e[0] = 1;
  for (const row of live) for (let j = draws; j >= 1; j--) e[j] += e[j - 1] * row.values.length;
  let outcomes = 0;
  for (let j = 0; j <= draws; j++) {
    const w = j <= live.length && draws - j <= dead ? choose(dead, draws - j) / total : 0;
    typeW.push(w);
    if (w > 0) outcomes += e[j];
  }
  return { mask, locks, k: draws, scale: input.base > 0 ? anchor / input.base : 0, live, eff, n, dead, typeW, outcomes };
}

// eslint-disable-next-line no-unused-vars -- the parameters of a function type
type Emit = (change: number, weight: number, picked: number, rowAt: Int32Array, tierAt: Int32Array) => void;

/** Every outcome of the lock set, each once, with its probability. */
function walkExact(model: LineModel, p: Prepared, emit: Emit): void {
  const { live, eff, typeW, k, scale } = p;
  const rowAt = new Int32Array(5);
  const tierAt = new Int32Array(5);
  const shareAt = new Float64Array(5);
  const indexAt = new Int32Array(5);
  const pair = model.pair;
  const rec = (start: number, j: number, f: number, prob: number): void => {
    if (typeW[j] > 0) emit(scale * f - 1, prob * typeW[j], j, rowAt, tierAt);
    if (j === k) return;
    for (let a = start; a < live.length; a++) {
      const row = live[a];
      const e = eff[a];
      const share = row.share as number[];
      const at = row.index * N;
      for (let t = 0; t < e.length; t++) {
        let g = f * e[t];
        const s = share[t];
        for (let c = 0; c < j; c++) {
          const pv = pair[at + indexAt[c]];
          if (pv) g *= 1 + pv * s * shareAt[c];
        }
        rowAt[j] = a;
        tierAt[j] = t;
        shareAt[j] = s;
        indexAt[j] = row.index;
        rec(a + 1, j + 1, g, prob * row.probs[t]);
      }
    }
  };
  rec(0, 0, 1, 1);
}

/** `samples` tries of the lock set, each with the same weight. One seed draws the same tries on every run. */
function walkSampled(model: LineModel, p: Prepared, samples: number, seed: number | string, emit: Emit): void {
  const { live, eff, k, n, scale } = p;
  const rng = seededRandom(seed);
  const rowAt = new Int32Array(5);
  const tierAt = new Int32Array(5);
  const shareAt = new Float64Array(5);
  const indexAt = new Int32Array(5);
  const pair = model.pair;
  const slots = new Int32Array(n);
  const weight = 1 / samples;
  const m = live.length;
  for (let i = 0; i < samples; i++) {
    for (let x = 0; x < n; x++) slots[x] = x;
    let j = 0;
    let f = 1;
    for (let draw = 0; draw < k; draw++) {
      const at = draw + Math.floor(rng() * (n - draw));
      const a = slots[at];
      slots[at] = slots[draw];
      slots[draw] = a;
      if (a >= m) continue; // a stat that adds nothing: its value does not matter
      const row = live[a];
      const r = rng();
      let t = 0;
      let seen = row.probs[0];
      while (r >= seen && t < row.probs.length - 1) seen += row.probs[++t];
      let g = eff[a][t];
      const s = (row.share as number[])[t];
      const base = row.index * N;
      for (let c = 0; c < j; c++) {
        const pv = pair[base + indexAt[c]];
        if (pv) g *= 1 + pv * s * shareAt[c];
      }
      f *= g;
      rowAt[j] = a;
      tierAt[j] = t;
      shareAt[j] = s;
      indexAt[j] = row.index;
      j += 1;
    }
    emit(scale * f - 1, weight, j, rowAt, tierAt);
  }
}

/** One reader of an echo's lock sets: the model's rows and the held lines are worked out once for all 31. */
export interface LockSetReader {
  /** the relative change one given result makes: the lines `mask` keeps plus these new ones, against the build as it is */
  // eslint-disable-next-line no-unused-vars -- the parameters of a method signature
  changeOf(mask: number, newLines: ReadonlyArray<{ key: string; value: number }>): number;
  /** what a try with these locks is expected to do: every outcome read (or tries drawn, when there are too many) */
  // eslint-disable-next-line no-unused-vars -- the parameters of a method signature
  stats(mask: number): LockSetStats;
  /** the spread of a try, what a run of tries reaches and the best result: a second read of the lock set */
  // eslint-disable-next-line no-unused-vars -- the parameters of a method signature
  detail(mask: number, stats?: LockSetStats): LockSetDetail;
  /** the lock masks there are: every set of the lines but all of them */
  masks: number[];
}

const seedFor = (input: LockSetInput, mask: number): string => `${input.seed ?? "lock"}|${mask}`;

export function lockSetReader(input: LockSetInput): LockSetReader {
  const rows = rowsOf(input.model);
  const held = input.lines.map((line) => heldOf(rows, line));
  const exactLimit = input.exactLimit ?? DEFAULT_EXACT_LIMIT;
  const samples = Math.max(1000, Math.floor(input.samples ?? DEFAULT_LOCK_SAMPLES));
  const walk = (p: Prepared, emit: Emit): boolean => {
    const sampled = p.outcomes > exactLimit;
    if (sampled) walkSampled(input.model, p, samples, seedFor(input, p.mask), emit);
    else walkExact(input.model, p, emit);
    return sampled;
  };

  const stats = (mask: number): LockSetStats => {
    const p = prepare(input, rows, held, mask);
    let total = 0;
    let better = 0;
    let gain = 0;
    let change = 0;
    let min = Infinity;
    let max = -Infinity;
    let count = 0;
    const sampled = walk(p, (d, w) => {
      total += w;
      change += d * w;
      if (d > SAME_SCORE) {
        better += w;
        gain += d * w;
      }
      if (d < min) min = d;
      if (d > max) max = d;
      count += 1;
    });
    const t = total || 1;
    return { mask, locks: p.locks, pImprove: better / t, expectedGain: gain / t, expectedChange: change / t, min: count ? min : 0, max: count ? max : 0, outcomes: count, sampled };
  };

  const detail = (mask: number, known?: LockSetStats): LockSetDetail => {
    const s = known ?? stats(mask);
    const p = prepare(input, rows, held, mask);
    const BINS = 512;
    // two histograms that meet at "no change": the tries that do not beat the echo, and the ones that do
    const lo = Math.min(s.min, 0);
    const hi = Math.max(s.max, 0);
    const negW = new Float64Array(BINS);
    const negSum = new Float64Array(BINS);
    const posW = new Float64Array(BINS);
    const posSum = new Float64Array(BINS);
    let total = 0;
    walk(p, (d, w) => {
      total += w;
      if (d > SAME_SCORE) {
        const b = hi > 0 ? Math.min(BINS - 1, Math.floor((d / hi) * BINS)) : 0;
        posW[b] += w;
        posSum[b] += d * w;
      } else {
        const b = Math.max(0, lo < 0 ? Math.min(BINS - 1, Math.floor(((d - lo) / -lo) * BINS)) : BINS - 1);
        negW[b] += w;
        negSum[b] += d * w;
      }
    });
    const t = total || 1;
    const quantile = (q: number): number => {
      const target = q * t;
      let seen = 0;
      for (let b = 0; b < BINS; b++) {
        seen += negW[b];
        if (seen >= target - 1e-12 && negW[b] > 0) return negSum[b] / negW[b];
      }
      for (let b = 0; b < BINS; b++) {
        seen += posW[b];
        if (seen >= target - 1e-12 && posW[b] > 0) return posSum[b] / posW[b];
      }
      return s.max;
    };
    // best of n tries: Σ over the bins above "no change" of the bin's mean × the chance the best try lands in it
    const bestOf = new Array<number>(MAX_TRIES).fill(0);
    let below = 0;
    for (let b = 0; b < BINS; b++) below += negW[b];
    let before = below / t;
    for (let b = 0; b < BINS; b++) {
      if (!(posW[b] > 0)) continue;
      const after = Math.min(1, before + posW[b] / t);
      const mean = posSum[b] / posW[b];
      let pa = 1;
      let pb = 1;
      for (let nTries = 1; nTries <= MAX_TRIES; nTries++) {
        pa *= after;
        pb *= before;
        bestOf[nTries - 1] += mean * (pa - pb);
      }
      before = after;
    }
    // the best result: every stat that counts at its top tier, whichever set of them multiplies highest
    const topTier = p.live.map((row) => row.values.length - 1);
    let bestGain = -Infinity;
    let bestRows: number[] = [];
    const pair = input.model.pair;
    const pick = (start: number, chosen: number[], f: number): void => {
      if (p.typeW[chosen.length] > 0 && p.scale * f - 1 > bestGain) {
        bestGain = p.scale * f - 1;
        bestRows = [...chosen];
      }
      if (chosen.length === p.k) return;
      for (let a = start; a < p.live.length; a++) {
        const row = p.live[a];
        const s1 = (row.share as number[])[topTier[a]];
        let g = f * p.eff[a][topTier[a]];
        for (const c of chosen) {
          const pv = pair[row.index * N + p.live[c].index];
          if (pv) g *= 1 + pv * s1 * (p.live[c].share as number[])[topTier[c]];
        }
        pick(a + 1, [...chosen, a], g);
      }
    };
    pick(0, [], 1);
    const topLines = bestRows.map((a) => ({ key: p.live[a].key, value: p.live[a].values[topTier[a]] }));
    const topChance = bestRows.reduce((c, a) => c * p.live[a].probs[topTier[a]], p.typeW[bestRows.length] ?? 0);
    return {
      p10: quantile(0.1),
      p50: quantile(0.5),
      p90: quantile(0.9),
      bestOf,
      top: { gain: Number.isFinite(bestGain) ? bestGain : 0, lines: topLines, chance: topChance },
    };
  };

  const changeOf = (mask: number, newLines: ReadonlyArray<{ key: string; value: number }>): number => {
    const p = prepare(input, rows, held, mask);
    const pair = input.model.pair;
    const seen: Array<{ index: number; share: number }> = [];
    let f = 1;
    for (const line of newLines) {
      const a = p.live.findIndex((r) => r.key === line.key);
      if (a < 0) continue; // a stat that adds nothing here
      const row = p.live[a];
      const t = row.values.findIndex((v) => Math.abs(v - line.value) <= 1e-6 * Math.max(1, Math.abs(v)));
      if (t < 0) throw new Error(`${line.key} ${line.value} is not a tier the game rolls`);
      let g = p.eff[a][t];
      const s = (row.share as number[])[t];
      for (const c of seen) {
        const pv = pair[row.index * N + c.index];
        if (pv) g *= 1 + pv * s * c.share;
      }
      f *= g;
      seen.push({ index: row.index, share: s });
    }
    return p.scale * f - 1;
  };

  const full = (1 << input.lines.length) - 1;
  const masks: number[] = [];
  for (let mask = 0; mask < full; mask++) masks.push(mask);
  return { changeOf, stats, detail, masks };
}

/** The fields of the lines a mask locks, and of the ones it re-rolls. */
export function maskFields(lines: readonly HeldLine[], mask: number): { locked: number[]; rerolled: number[] } {
  const locked: number[] = [];
  const rerolled: number[] = [];
  lines.forEach((l, i) => (mask & (1 << i) ? locked : rerolled).push(l.field));
  return { locked, rerolled };
}

/** How many bits a mask has set. */
export const bitCount = (mask: number): number => {
  let n = 0;
  for (let m = mask; m; m &= m - 1) n += 1;
  return n;
};
