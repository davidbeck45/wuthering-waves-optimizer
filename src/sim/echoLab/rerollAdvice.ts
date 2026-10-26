// Wuthering Tools+ Echo Lab — Transducer re-roll advice ("which line do I replace?") for an equipped echo with
// all five substat lines. Per line: its worth (the damage the build loses without it — the
// `withoutEchoSubstats` idea, one line at a time) against the expected worth of a fresh random line in its
// place (every type the other four lines leave open × every tier, scored by the engine) → which lines to
// lock and which to re-roll. Per lock count (0-4, the most valuable lines locked): the chance the re-roll beats
// the current lines, the expected gain when you keep the better of old and new, and the Transducers it costs.
// Re-rolling one line is enumerated exactly; re-rolling two or more adds the exact single-line values of the
// new lines (see the assumptions). Pure/async, worker-safe.
import { MIN_PLAN_GAIN } from "./rerollPick";
import { SUBSTAT_KEYS, type SubstatKey } from "../substats/substatWeights";
import {
  echoLines,
  makePacer,
  prepareCharacter,
  relGain,
  scoreBuild,
  weightedQuantile,
  withLines,
  withSlotRecord,
  type EchoLine,
  type LabSession,
  type RunControl,
} from "./core";
import { seededRandom, stableKey } from "./fingerprint";
import { outcomeKey, sampleOutcome, tierOdds, type NewLine } from "./rolls";

/** Transducers per re-roll by the number of locked lines (index 0-4) — verify in game. */
export const DEFAULT_LOCK_COSTS: readonly number[] = [1, 1, 1, 2, 3];

export const REROLL_ASSUMPTIONS = [
  "A re-rolled line takes a type the locked lines do not hold, drawn uniformly (it may come back as the type it replaced), at a value from Kuro's published tier odds — verify in game.",
  "You may keep the old lines when the new ones are worse; the Transducers are spent either way.",
  "Lock costs default to 0–2 locks: 1 Transducer, 3 locks: 2, 4 locks: 3 — verify in game.",
  "Re-rolling two or more lines adds each new line's exact single-line value; how two new crit lines meet the crit cap together is not modelled.",
] as const;

export interface RerollOptions {
  /** Transducers per re-roll by locked-line count (index 0-4) */
  lockCosts?: readonly number[];
  /** a re-rolled line may come back as the type it replaced (default true) */
  canRepeat?: boolean;
  /** samples for the plans that re-roll two or more lines (default 20000; no engine call per sample) */
  samples?: number;
  seed?: number | string;
}

export interface LineAdvice {
  field: number;
  key: string;
  value: number;
  /** what the build loses without this line, relative to the build without it */
  worth: number;
  /** what a fresh random line in its place is worth on average, on the same scale */
  freshWorth: number;
  /** freshWorth − worth: above 0, re-rolling this line pays on average */
  delta: number;
  /** 1 = the line to re-roll first */
  rank: number;
  advice: "lock" | "reroll";
}

export interface LockPlan {
  locks: number;
  lockedFields: number[];
  rerolledFields: number[];
  /** Transducers per attempt */
  cost: number;
  method: "exact" | "additive";
  /** chance the new lines beat the current ones */
  pImprove: number;
  /** expected relative gain when you keep the better of old and new */
  expectedGain: number;
  /** expected relative change if you always took the new lines */
  expectedChange: number;
  /** 90th percentile of the change */
  p90: number;
  gainPerTransducer: number;
  /** Transducers spent per attempt that beats the current lines */
  transducersPerSuccess: number | null;
}

export interface RerollAdviceResult {
  characterId: string;
  name: string;
  slot: number;
  echoId: string | null;
  echo: string | null;
  base: number;
  lines: LineAdvice[];
  /** one plan per lock count, 4 locks first */
  plans: LockPlan[];
  /** the plan with the best expected gain per Transducer; null when no re-roll is expected to pay */
  recommended: LockPlan | null;
  lockCostNote: string;
  assumptions: readonly string[];
  scorings: number;
}

// the threshold and the "re-roll first" pick live in rerollPick.ts (no engine imports, so the page can use them)
export { MIN_PLAN_GAIN, pickRerollFirst } from "./rerollPick";

/**
 * Scores a fresh line of `key` at every tier on top of `base` lines. A stat that changes nothing at its lowest and
 * its highest tier changes nothing in between (damage never falls as a stat grows), so its other tiers are not
 * scored — exact, and most of the work on a build where half the stats are dead.
 */
async function tierScores(
  base: Array<{ key: string; value: number }>,
  key: SubstatKey,
  baseline: number,
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  scoreLines: (list: Array<{ key: string; value: number }>) => Promise<number>,
): Promise<number[]> {
  const { values } = tierOdds(key);
  const same = (avg: number): boolean => Math.abs(avg - baseline) <= 1e-12 * Math.max(1, Math.abs(baseline));
  const top = await scoreLines([...base, { key, value: values[values.length - 1] }]);
  if (same(top) && same(await scoreLines([...base, { key, value: values[0] }]))) return values.map(() => baseline);
  const out: number[] = [];
  for (const value of values) out.push(await scoreLines([...base, { key, value }]));
  return out;
}

export async function rerollAdvice(
  session: LabSession,
  characterId: string,
  slot: number,
  options: RerollOptions = {},
  control: RunControl = {},
): Promise<RerollAdviceResult> {
  const memoKey = `reroll|${characterId}|${slot}|${stableKey(options)}`;
  const memoised = session.memo.get(memoKey) as RerollAdviceResult | undefined;
  if (memoised) return { ...memoised, scorings: 0 };
  const result = await computeRerollAdvice(session, characterId, slot, options, control);
  session.memo.set(memoKey, result);
  return result;
}

async function computeRerollAdvice(
  session: LabSession,
  characterId: string,
  slot: number,
  options: RerollOptions,
  control: RunControl,
): Promise<RerollAdviceResult> {
  const pace = makePacer(control);
  const lab = await prepareCharacter(session, characterId, pace);
  if (!lab) throw new Error(`${characterId} can't be scored: ${session.skipped.get(characterId) ?? "unknown"}`);
  const own = lab.slots[slot];
  if (!own) throw new Error(`${lab.name} has no echo in slot ${slot}`);
  const lines = echoLines(own.record);
  if (lines.length < 5) throw new Error(`${own.species ?? "This echo"} has ${lines.length} of 5 lines: finish tuning it first (Tune or Feed)`);
  const lockCosts = options.lockCosts ?? DEFAULT_LOCK_COSTS;
  const canRepeat = options.canRepeat ?? true;
  const samples = Math.max(1000, Math.floor(options.samples ?? 20000));
  const startScorings = session.scorings;

  // engine scoring of the echo with a given set of lines in this slot, memoised by the line set
  const memo = new Map<string, number>();
  const asLines = (list: Array<{ key: string; value: number }>): NewLine[] => list.map((l) => ({ key: l.key as SubstatKey, value: l.value }));
  memo.set(outcomeKey(asLines(lines)), lab.base);
  let work = 0;
  const scoreLines = async (list: Array<{ key: string; value: number }>): Promise<number> => {
    const key = outcomeKey(asLines(list));
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const clone = withSlotRecord(session, lab, slot, withLines(own.record, list));
    const avg = await scoreBuild(session, lab, clone.characters, clone.echoes);
    memo.set(key, avg);
    work += 1;
    await pace({ phase: "reroll", done: work, total: 750, label: lab.name });
    return avg;
  };

  // 1. per line: worth vs the expected fresh line (exact: every open type × every tier); `tables` keeps each
  // line's outcomes (relative change vs the build, probability) for the one-line plan
  const perLine: LineAdvice[] = [];
  const tables = new Map<number, Array<[number, number]>>();
  for (const line of lines) {
    const others = lines.filter((l) => l !== line);
    const without = await scoreLines(others);
    const held = new Set(others.map((l) => l.key));
    if (!canRepeat) held.add(line.key);
    const pool = SUBSTAT_KEYS.filter((k) => !held.has(k));
    let fresh = 0;
    const table: Array<[number, number]> = [];
    for (const key of pool) {
      const odds = tierOdds(key);
      const scores = await tierScores(others, key, without, scoreLines);
      for (let i = 0; i < odds.values.length; i++) {
        const p = odds.probs[i] / pool.length;
        fresh += p * relGain(without, scores[i]);
        table.push([relGain(lab.base, scores[i]), p]);
      }
    }
    const worth = relGain(without, lab.base);
    tables.set(line.field, table);
    perLine.push({ field: line.field, key: line.key, value: line.value, worth, freshWorth: fresh, delta: fresh - worth, rank: 0, advice: fresh > worth ? "reroll" : "lock" });
  }
  const order = [...perLine].sort((a, b) => b.delta - a.delta || a.field - b.field);
  order.forEach((l, i) => (l.rank = i + 1));

  // 2. per lock count: lock the lines most worth keeping, re-roll the rest
  const keepOrder = [...order].reverse(); // most worth keeping first
  const plans: LockPlan[] = [];
  for (let locks = 4; locks >= 0; locks--) {
    const locked = keepOrder.slice(0, locks);
    const rerolled = keepOrder.slice(locks);
    const cost = lockCosts[locks] ?? lockCosts[lockCosts.length - 1] ?? 1;
    let pairs: Array<[number, number]>;
    let method: LockPlan["method"];
    if (rerolled.length === 1) {
      method = "exact";
      pairs = tables.get(rerolled[0].field) ?? [[0, 1]];
    } else {
      method = "additive";
      pairs = await additivePlan(locked, rerolled, { scoreLines, base: lab.base, canRepeat, samples, seed: options.seed ?? `${own.echoId ?? lab.id}|${slot}|${locks}` });
    }
    const total = pairs.reduce((s, [, w]) => s + w, 0) || 1;
    const pImprove = pairs.reduce((s, [g, w]) => s + (g > 1e-12 ? w : 0), 0) / total;
    const expectedGain = pairs.reduce((s, [g, w]) => s + Math.max(0, g) * w, 0) / total;
    const expectedChange = pairs.reduce((s, [g, w]) => s + g * w, 0) / total;
    plans.push({
      locks,
      lockedFields: locked.map((l) => l.field),
      rerolledFields: rerolled.map((l) => l.field),
      cost,
      method,
      pImprove,
      expectedGain,
      expectedChange,
      p90: weightedQuantile(pairs, 0.9),
      gainPerTransducer: cost > 0 ? expectedGain / cost : expectedGain,
      transducersPerSuccess: pImprove > 0 ? cost / pImprove : null,
    });
  }
  const paying = plans.filter((p) => p.expectedGain >= MIN_PLAN_GAIN);
  const recommended = paying.length ? [...paying].sort((a, b) => b.gainPerTransducer - a.gainPerTransducer || a.cost - b.cost || b.locks - a.locks)[0] : null;

  return {
    characterId: lab.id,
    name: lab.name,
    slot,
    echoId: own.echoId,
    echo: own.species,
    base: lab.base,
    lines: [...perLine].sort((a, b) => a.rank - b.rank),
    plans,
    recommended,
    lockCostNote: "verify in game",
    assumptions: REROLL_ASSUMPTIONS,
    scorings: session.scorings - startScorings,
  };
}

interface AdditiveDeps {
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  scoreLines: (list: Array<{ key: string; value: number }>) => Promise<number>;
  base: number;
  canRepeat: boolean;
  samples: number;
  seed: number | string;
}

/**
 * Re-rolling several lines at once: each candidate line's exact value on top of the locked lines alone (one
 * engine scoring per type × tier), then the joint outcome as the sum of the new lines' values against the sum
 * of the current re-rolled lines' — sampled with a seeded PRNG. Returns (relative change vs the build, weight).
 */
async function additivePlan(locked: EchoLine[], rerolled: EchoLine[], deps: AdditiveDeps): Promise<Array<[number, number]>> {
  const lockedLines = locked.map((l) => ({ key: l.key, value: l.value }));
  const context = await deps.scoreLines(lockedLines);
  if (!(context > 0)) return [[0, 1]];
  const held = new Set(locked.map((l) => l.key));
  if (!deps.canRepeat) for (const l of rerolled) held.add(l.key);
  const pool = SUBSTAT_KEYS.filter((k) => !held.has(k));
  const g = new Map<string, number>();
  const lineValue = async (key: string, value: number): Promise<number> => {
    const id = `${key}=${value}`;
    const hit = g.get(id);
    if (hit !== undefined) return hit;
    const v = relGain(context, await deps.scoreLines([...lockedLines, { key, value }]));
    g.set(id, v);
    return v;
  };
  for (const key of pool) {
    const values = tierOdds(key).values;
    const scores = await tierScores(lockedLines, key, context, deps.scoreLines);
    values.forEach((value, i) => g.set(`${key}=${value}`, relGain(context, scores[i])));
  }
  let current = 0;
  for (const l of rerolled) current += await lineValue(l.key, l.value);
  const scale = context / deps.base;
  const rng = seededRandom(deps.seed);
  const k = Math.min(rerolled.length, pool.length);
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < deps.samples; i++) {
    const outcome = sampleOutcome(rng, pool, k);
    let sum = 0;
    for (const line of outcome) sum += g.get(`${line.key}=${line.value}`) ?? 0;
    pairs.push([(sum - current) * scale, 1]);
  }
  return pairs;
}
