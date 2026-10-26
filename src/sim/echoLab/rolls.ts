// Wuthering Tools+ Echo Lab — the substat roll model shared by Tune or Feed and the re-roll advisor.
// Values: Kuro's published tier odds (the KR product info — 7/8/21/25/18/15/6/3 for the percent-shaped stats
// and flat HP, 70/70/70/24/24/24/9/9 for crit, flat ATK 7/54/39/3, flat DEF 15/46/33/9), as
// src/sim/substats/substatWeights.ts carries them. Types: the game does not publish how often each substat
// *type* appears, so a new line is drawn uniformly from the types the echo does not hold yet — stated as an
// assumption wherever it is used. Pure.
import { SUBSTAT_KEYS, TIER_WEIGHTS, rollTiers, type SubstatKey } from "../substats/substatWeights";

export interface TierOdds {
  values: readonly number[];
  /** probability of each value, summing to 1 */
  probs: number[];
}

const ODDS = new Map<string, TierOdds>();

/** The values a substat can roll and how likely each is. */
export function tierOdds(key: SubstatKey): TierOdds {
  const memo = ODDS.get(key);
  if (memo) return memo;
  const values = rollTiers(key);
  const weights = TIER_WEIGHTS[key];
  const usable = weights && weights.length === values.length ? weights : values.map(() => 1);
  const total = usable.reduce((a, b) => a + b, 0);
  const odds = { values, probs: usable.map((w) => w / total) };
  ODDS.set(key, odds);
  return odds;
}

/** The substat types an echo can still roll: the thirteen minus the ones it already holds. */
export const remainingTypes = (held: Iterable<string>): SubstatKey[] => {
  const set = new Set(held);
  return SUBSTAT_KEYS.filter((k) => !set.has(k));
};

/** Every k-subset of `items`, in lexicographic index order. */
export function* subsets<T>(items: readonly T[], k: number): Generator<T[]> {
  const n = items.length;
  if (k < 0 || k > n) return;
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    yield idx.map((i) => items[i]);
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) return;
    idx[i] += 1;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

/** n choose k. */
export function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

/** How many (types, values) outcomes k new lines drawn from `pool` have: Σ over k-subsets of Π tier counts. */
export function outcomeCount(pool: readonly SubstatKey[], k: number): number {
  // elementary symmetric polynomial e_k of the tier counts, by dynamic programming
  const e = new Array<number>(k + 1).fill(0);
  e[0] = 1;
  for (const key of pool) {
    const n = rollTiers(key).length;
    for (let j = k; j >= 1; j--) e[j] += e[j - 1] * n;
  }
  return e[k];
}

/** k distinct items drawn uniformly without replacement. */
export function sampleDistinct<T>(rng: () => number, items: readonly T[], k: number): T[] {
  const copy = [...items];
  const out: T[] = [];
  for (let i = 0; i < k && copy.length; i++) {
    const j = Math.floor(rng() * copy.length);
    out.push(copy[j]);
    copy[j] = copy[copy.length - 1];
    copy.pop();
  }
  return out;
}

/** An index drawn by probability. */
export function pickIndex(rng: () => number, probs: readonly number[]): number {
  const r = rng();
  let seen = 0;
  for (let i = 0; i < probs.length; i++) {
    seen += probs[i];
    if (r < seen) return i;
  }
  return probs.length - 1;
}

/** One new line: a key and a value. */
export interface NewLine {
  key: SubstatKey;
  value: number;
}

/**
 * Every outcome of k new lines from `pool` with its probability (types uniform over k-subsets, values by
 * tier odds, independent). Only for small spaces — check `outcomeCount` first.
 */
export function* enumerateOutcomes(pool: readonly SubstatKey[], k: number): Generator<{ lines: NewLine[]; p: number }> {
  const typeP = 1 / choose(pool.length, k);
  for (const types of subsets(pool, k)) {
    const odds = types.map(tierOdds);
    const idx = new Array<number>(k).fill(0);
    while (true) {
      let p = typeP;
      const lines: NewLine[] = [];
      for (let i = 0; i < k; i++) {
        p *= odds[i].probs[idx[i]];
        lines.push({ key: types[i], value: odds[i].values[idx[i]] });
      }
      yield { lines, p };
      let i = k - 1;
      while (i >= 0 && idx[i] === odds[i].values.length - 1) {
        idx[i] = 0;
        i--;
      }
      if (i < 0) break;
      idx[i] += 1;
    }
  }
}

/** One Monte Carlo outcome of k new lines from `pool`. */
export function sampleOutcome(rng: () => number, pool: readonly SubstatKey[], k: number): NewLine[] {
  return sampleDistinct(rng, pool, k).map((key) => {
    const odds = tierOdds(key);
    return { key, value: odds.values[pickIndex(rng, odds.probs)] };
  });
}

/** A canonical key for a set of new lines (order-free), for memoising engine scorings. */
export const outcomeKey = (lines: readonly NewLine[]): string =>
  lines
    .map((l) => `${l.key}=${l.value}`)
    .sort()
    .join("|");
