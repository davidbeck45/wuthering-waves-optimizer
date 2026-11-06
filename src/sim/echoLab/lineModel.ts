// Wuthering Tools+ Echo Lab — the line model: what several new substat lines do to an echo, without an engine run per
// outcome. Farm next, the Tuner plan's fresh list and the re-roll advisor all read it, so their figures agree.
//
// Per echo, three kinds of engine score:
//   1. `ctx`: the echo with none of the new lines;
//   2. the line table: each substat at every tier, alone on the echo (`lineTable`, with shortcuts that change no number);
//   3. the pairs: every two stats that both count, together at their top tiers (`lineModel`), one engine run a pair.
// An outcome's score is then `ctx × Π(1 + line)`, each two lines corrected by what the engine says their product got
// wrong:
//   - multiplying is how stats from different parts of the damage formula meet (ATK with a DMG Bonus);
//   - a pair's correction is what the two scored together add beyond their product at the top tiers, scaled by how much
//     of each stat's top value the two lines hold (a two-stat term of the damage formula is linear in each stat, so
//     that scaling is exact for two lines). It is above 0 for Crit Rate with Crit DMG (the crit term is their product,
//     so the lines are worth more together), below 0 for two stats that simply add inside one part of the formula (ATK%
//     with flat ATK, a DMG Bonus with another).
// Adding the lines, the model this replaced, ran 13 % low on David's best slots and 26 % on an average one; the product
// alone 3 % and 9 %; with the pairs the figures sit within 1 % of whole echoes scored by the engine (the numbers are in
// the README). Pure/async: scores come in through a callback, so a build and a team read the same model.
import { SUBSTAT_KEYS, type SubstatKey } from "../substats/substatWeights";
import { enumerateOutcomes, outcomeCount, sampleOutcome, tierOdds, type NewLine } from "./rolls";
import { seededRandom } from "./fingerprint";

/** The score with these lines on the echo, on the scale of `ctx`. */
// eslint-disable-next-line no-unused-vars -- the parameters of a function type
export type LineScorer = (lines: NewLine[]) => Promise<number>;

/** Two stats whose top tiers multiply to less than this can't move a figure by a millionth of a point: no engine run. */
export const MIN_PAIR_WORTH = 1e-8;

const KEY_INDEX = new Map<string, number>(SUBSTAT_KEYS.map((k, i) => [k, i]));
const N = SUBSTAT_KEYS.length;

const topTier = (key: SubstatKey): NewLine => {
  const { values } = tierOdds(key);
  return { key, value: values[values.length - 1] };
};

/**
 * Each substat's score at every tier with one line of it on the echo: `scoreLine(key, value)` is the score with that
 * one line, `ctx` the score with none. Two shortcuts, neither of which changes a number: damage never falls as a stat
 * grows, so a stat whose top tier scores `ctx` scores `ctx` at every tier; and a stat whose lowest and highest tiers lie
 * on one straight line through (0, `ctx`) is linear on that range (damage is linear in one stat, bent only by caps, which
 * bend it one way), so its other tiers are read off the line. Everything else is scored tier by tier. `dead` names
 * stats already shown to add nothing on this echo (`confirmDead`): not scored again. `keys` limits the table to the
 * stats that can roll (default all thirteen).
 */
export async function lineTable(
  ctx: number,
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  scoreLine: (key: SubstatKey, value: number) => Promise<number>,
  dead: ReadonlySet<string> = new Set(),
  keys: readonly SubstatKey[] = SUBSTAT_KEYS,
): Promise<Map<SubstatKey, number[]>> {
  const out = new Map<SubstatKey, number[]>();
  const scale = Math.max(1, Math.abs(ctx));
  for (const key of keys) {
    const { values } = tierOdds(key);
    const n = values.length;
    if (dead.has(key)) {
      out.set(key, values.map(() => ctx));
      continue;
    }
    const top = await scoreLine(key, values[n - 1]);
    if (Math.abs(top - ctx) <= 1e-12 * scale) {
      out.set(key, values.map(() => ctx));
      continue;
    }
    const low = await scoreLine(key, values[0]);
    const slope = (top - ctx) / values[n - 1];
    if (Math.abs(ctx + slope * values[0] - low) <= 1e-9 * scale) {
      out.set(key, values.map((v, i) => (i === 0 ? low : i === n - 1 ? top : ctx + slope * v)));
      continue;
    }
    const scores = [low];
    for (let i = 1; i < n - 1; i++) scores.push(await scoreLine(key, values[i]));
    scores.push(top);
    out.set(key, scores);
  }
  return out;
}

/**
 * Which of `keys` add nothing on this echo, confirmed with their top tiers five lines at a time (one engine run per five):
 * damage never falls as a stat grows, so top tiers that together score `ctx` (the echo with no line) each add nothing at
 * any tier. A group that moves the score confirms none of its stats; `lineTable` then scores them one by one.
 */
export async function confirmDead(ctx: number, keys: readonly SubstatKey[], scoreLines: LineScorer): Promise<Set<string>> {
  const out = new Set<string>();
  const scale = Math.max(1, Math.abs(ctx));
  for (let i = 0; i < keys.length; i += 5) {
    const group = keys.slice(i, i + 5);
    const score = await scoreLines(group.map(topTier));
    if (Math.abs(score - ctx) <= 1e-12 * scale) for (const key of group) out.add(key);
  }
  return out;
}

export interface LineModel {
  /** the score with no new line */
  ctx: number;
  /** by stat (the `SUBSTAT_KEYS` index) and tier: what the line adds alone, relative to `ctx` */
  worth: Array<number[] | null>;
  /** the same, as a share of what the stat's top tier adds, over (1 + line): what a pair's correction scales by */
  share: Array<number[] | null>;
  /** by stat × stat: what the two add beyond their product at both top tiers (relative to `ctx`), 0 when not scored together */
  pair: Float64Array;
  /** engine runs the pairs took */
  pairRuns: number;
}

/**
 * The model of one echo from its line table: every two stats that count are scored together at their top tiers (none
 * when fewer than two lines are drawn: one line is the table itself). `scoreLines` scores lines on the same echo as `ctx`.
 */
export async function lineModel(ctx: number, table: ReadonlyMap<SubstatKey, readonly number[]>, scoreLines: LineScorer, draw = 5): Promise<LineModel> {
  const worth: LineModel["worth"] = new Array(N).fill(null);
  const share: LineModel["share"] = new Array(N).fill(null);
  const top: Array<{ key: SubstatKey; index: number; worth: number }> = [];
  if (ctx > 0) {
    SUBSTAT_KEYS.forEach((key, index) => {
      const scores = table.get(key);
      if (!scores) return;
      const line = scores.map((s) => s / ctx - 1);
      const best = line[line.length - 1];
      worth[index] = line;
      if (Math.abs(best) <= 1e-12) return;
      share[index] = line.map((v) => v / best / (1 + v));
      top.push({ key, index, worth: best });
    });
  }
  const pair = new Float64Array(N * N);
  let pairRuns = 0;
  if (draw >= 2) {
    for (let i = 0; i < top.length; i++) {
      for (let j = i + 1; j < top.length; j++) {
        const a = top[i];
        const b = top[j];
        if (Math.abs(a.worth * b.worth) < MIN_PAIR_WORTH) continue;
        const both = await scoreLines([topTier(a.key), topTier(b.key)]);
        pairRuns += 1;
        const beyond = both / ctx - (1 + a.worth) * (1 + b.worth);
        pair[a.index * N + b.index] = beyond;
        pair[b.index * N + a.index] = beyond;
      }
    }
  }
  return { ctx, worth, share, pair, pairRuns };
}

/** What these lines multiply the echo's score by (1 for no line). Two lines of one stat never happen: types are distinct. */
export function lineFactor(model: LineModel, lines: readonly NewLine[]): number {
  let factor = 1;
  for (let i = 0; i < lines.length; i++) {
    const a = KEY_INDEX.get(lines[i].key) ?? -1;
    const tier = tierOdds(lines[i].key).values.indexOf(lines[i].value);
    const worth = model.worth[a]?.[tier];
    if (worth === undefined) continue;
    factor *= 1 + worth;
    const shareA = model.share[a]?.[tier];
    if (shareA === undefined) continue;
    for (let j = 0; j < i; j++) {
      const b = KEY_INDEX.get(lines[j].key) ?? -1;
      const p = model.pair[a * N + b];
      if (p) factor *= 1 + p * shareA * (model.share[b]?.[tierOdds(lines[j].key).values.indexOf(lines[j].value)] ?? 0);
    }
  }
  return factor;
}

/**
 * What `draw` new lines from `pool` do against `base`, as (relative change, weight) pairs: `ctx / base × factor − 1`. The
 * base is the engine's score of what the player has now, never the model's own idea of it. Every outcome when there are
 * no more of them than `samples`, else `samples` tries with a seeded PRNG (one seed draws the same tries, so an own and a
 * team figure read one set).
 */
export function lineOutcomes(model: LineModel, base: number, pool: readonly SubstatKey[], draw: number, samples: number, seed: number | string): Array<[number, number]> {
  const ratio = model.ctx / base;
  const pairs: Array<[number, number]> = [];
  if (outcomeCount(pool, draw) <= samples) {
    for (const o of enumerateOutcomes(pool, draw)) pairs.push([ratio * lineFactor(model, o.lines) - 1, o.p]);
    return pairs;
  }
  const rng = seededRandom(seed);
  for (let i = 0; i < samples; i++) pairs.push([ratio * lineFactor(model, sampleOutcome(rng, pool, draw)) - 1, 1]);
  return pairs;
}
