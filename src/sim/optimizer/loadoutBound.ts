// Wuthering Tools+ — branch and bound for the echo optimizer's scorer (track "optimizer-speed", 2026-11-02).
//
// The generator walks loadouts depth first: a main echo, then echoes in increasing pool order. Every loadout that
// starts with the same k echoes (a "prefix") arrives in one unbroken run, and they can only add echoes that come later
// in the pool. `createLoadoutPruner` gives the scorer a `skip(loadout, bar)` check: for each prefix of the incoming
// loadout it computes, once, an upper bound on the score of anything in that prefix's subtree, and the loadout is
// skipped when a bound is at or under the bar a new loadout must clear to enter the top N (or a min-stat floor is
// out of the subtree's reach). Nothing it skips could have entered the top N, so the top N — loadouts, order, scores —
// is the one the scorer builds without it.
//
// The bound (admissibility, the argument the tests check):
// 1. A loadout L in prefix P's subtree is P plus up to k = 5 − |P| echoes from R, the pool echoes after P's last one
//    (for P = [main echo]: the whole pool) whose species and id P does not hold, whose cost fits the 12 budget and,
//    under 43311 / 44111, a cost the format still has room for.
// 2. L's echo stats are a sum of per-echo records (`getCombinedEchoStats` adds `getEchoStats` key by key), so for every
//    stat s: echoStats(L)[s] ≤ echoStats(P)[s] + V[s], where V[s] is the most stat s that any choice of cost counts
//    the budget and the format allow can hold, taking the best s values of R per cost (a relaxation: each slot may
//    take its best s from a different echo, and species clashes inside R are ignored). Every value is ≥ 0
//    (`canPruneByBound`), so the bound's vector dominates every L's, stat by stat.
// 3. L's set bonuses are `getSetBonusEffects` of P's sets plus at most k sets of R. The bound enumerates every such
//    multiset and takes the union of the labels any of them yields (each with its largest count in one triple), and
//    injects the sum of their set-passive stats and AdditionalBase passives: all ≥ 0, so a superset of L's.
// 4. The stat pipeline and the score are non-decreasing in each of those inputs (the monotonicity argument in the
//    README, the same one the dominated-partials skip rests on; IEEE rounding is monotone), so scoring that virtual
//    loadout gives a number ≥ every score in the subtree, and its final stats are ≥ every L's (the min-stat check).
// 5. Floating point: the bound's vector is summed in a different order than L's, so each entry is inflated by 2^-40
//    relative (summing ≤ 9 non-negative doubles is off by at most 8 ulps, ~1e-15 relative) and the final score by 1e-9
//    relative, which also covers the last-bit noise of the pipeline's few subtractions. A non-finite bound skips nothing.
//
// Exact top N: a loadout that scores at or under the current bar never enters the heap (the inline backend keeps it
// only when strictly above the N-th score, the processor's heap rejects `<=`). Skipping it leaves the heap, and so
// every later decision, unchanged. The bound is computed lazily and only for prefixes whose subtree is big enough to
// repay it (`minSubtree`): the virtual loadout's stats once a bar exists or a floor is set (a floor it misses rules the
// subtree out without scoring a rotation), its score only once a bar exists.
import { calculateFinalStatsFromBuffs } from "../../calculator/stats";
import { meetsMinStatThreshold } from "../../calculator/meetsMinStatThreshold";
import { normalizeLoadoutFormat, type OptimizerContext, type OptimizerLoadoutFormat } from "../../calculator/optimizer";
import type { OptimizerRotationData } from "../../calculator/rotationData";
import { getCombinedEchoStats, getEchoStats } from "../../echoes/stats";
import { getSetBonusEffects } from "../../echoes/sets";
import { hasNegativeNumber, type LoadoutPruneSetup } from "./optimizerPool";
import { scoreOptimizerRotationDeduped } from "./rotationScore";

/* eslint-disable @typescript-eslint/no-explicit-any */

const COST_CAP = 12;
const MAX_ECHOES = 5;
const FORMAT_COSTS: Record<Exclude<OptimizerLoadoutFormat, "Any">, Record<number, number>> = {
  "43311": { 4: 1, 3: 2, 1: 2 },
  "44111": { 4: 2, 1: 3 },
};
/** 2^-40: covers the reordered sums of step 5 with room to spare. */
const VECTOR_SLACK = 1 + 2 ** -40;
const SCORE_SLACK = 1 + 1e-9;

export interface PrunerScoring {
  context: OptimizerContext | Record<string, any>;
  selfBuffsData: any;
  resonanceChainsBuffsData: any;
  echoSetPassiveBuffs: Record<string, any>;
  mainEchoStats: Record<string, any>;
  target: string;
  damageType?: string;
  rotationData?: OptimizerRotationData | null;
  minStats?: Array<{ stat: string; minValue: unknown }>;
}

export interface PrunerOptions {
  /** compute a bound only for prefixes with at least this many loadouts below them (estimated); default 2 (the smallest: a sweep over 30 runs found every larger gate scores more in total) */
  minSubtree?: number;
}

export interface LoadoutPruner {
  /** true when `loadout` (in generation order) cannot enter the top N: `bar` is the score it must beat (null while
   *  the top N is not full) */
  skip(loadout: any[], bar: number | null): boolean;
  /** the bound of a prefix's subtree, computed now (tests; null when `prefix` is not a generator prefix) */
  bound(prefix: any[]): { ub: number; feasible: boolean } | null;
  readonly stats: { bounds: number; skipped: number; checked: number };
}

const echoCost = (echo: any): number => {
  const n = Number(echo?.type);
  return Number.isFinite(n) ? n : 0;
};

/** upstream's private `combineBuffObjects` (optimizer.ts), line for line */
function combineBuffObjects(...sources: Record<string, unknown>[]): Record<string, number> {
  const combined: Record<string, number> = {};
  sources.forEach((buffs) => {
    Object.keys(buffs ?? {}).forEach((key) => {
      combined[key] = (combined[key] ?? 0) + (Number(buffs[key]) || 0);
    });
  });
  return combined;
}

/**
 * `computeLoadoutFinalStats` for a loadout given by its echo stats, main echo and set-bonus labels: the same
 * `combineBuffObjects` and `calculateFinalStatsFromBuffs` call, with any number of labels. With a real loadout's own
 * `getCombinedEchoStats` and its three labels it returns that loadout's numbers bit for bit (`loadoutBound.test.ts`
 * pins it, so a change to upstream's call shows up there first).
 */
export function virtualLoadoutStats(
  scoring: Pick<PrunerScoring, "context" | "selfBuffsData" | "resonanceChainsBuffsData" | "echoSetPassiveBuffs" | "mainEchoStats">,
  echoStats: Record<string, number>,
  mainEchoKey: string,
  labels: Array<string | null>,
): { finalStats: any; combinedEchoBuffs: Record<string, number>; mainEchoBuff: Record<string, number> } {
  const context = scoring.context as any;
  const mainEchoBuff = scoring.mainEchoStats?.[mainEchoKey] ?? {};
  const combinedEchoBuffs = combineBuffObjects(echoStats, mainEchoBuff, ...labels.map((label) => scoring.echoSetPassiveBuffs?.[label as string] ?? {}));
  const { finalStats } = calculateFinalStatsFromBuffs({
    baseHp: context.baseHp,
    baseAtk: context.baseAtk,
    baseDef: context.baseDef,
    weaponAtk: context.weaponData?.attack,
    weaponModifier: context.weaponData?.modifier,
    weaponModifierValue: context.weaponData?.modifierValue,
    weaponPassiveData: context.weaponData?.weaponPassiveStats ?? {},
    buffsConfig: context.activeCharacterBuffs ?? {},
    resonanceChainsConfig: context.activeCharacterResonanceChains ?? {},
    customBuffs: context.customBuffs,
    teamBuffsData: context.teamBuffsData,
    echoStats: context.echoStats,
    buffsCharInfo: context.chosenChar?.buffs ?? [],
    resonanceChainsCharInfo: context.chosenChar?.resonanceChains ?? [],
    character: context.character ?? "",
    talentData: context.talentData ?? {},
    activeStance: context.activeStance ?? null,
    ignoreBuffs: { ignoreEchoes: true },
    setBonusLabels: labels,
    echoSetPassivesConfig: context.echoSetPassivesConfig ?? {},
    selfBuffsData: scoring.selfBuffsData,
    resonanceChainsBuffsData: scoring.resonanceChainsBuffsData,
    injectEchoStats: combinedEchoBuffs,
  });
  return { finalStats, combinedEchoBuffs, mainEchoBuff };
}

const ROTATION_REF: Record<string, "normalDamage" | "avgDamage" | "critDamage"> = { Normal: "normalDamage", Average: "avgDamage", Crit: "critDamage" };

/** The target value of a virtual loadout, the scorer's way (`Stat:` reads final stats; `Rotation:` the plain path). */
function virtualTarget(scoring: PrunerScoring, stats: ReturnType<typeof virtualLoadoutStats>, echoStats: Record<string, number>): number {
  const [targetType, targetObject] = scoring.target.split(":");
  if (targetType === "Stat") return Number(stats.finalStats?.[targetObject!]);
  const { damageAggregation } = scoreOptimizerRotationDeduped(
    scoring.rotationData!,
    [],
    { finalStats: stats.finalStats, combinedEchoBuffs: stats.combinedEchoBuffs, echoStats, mainEchoBuff: stats.mainEchoBuff, setBonusOnePiece: null, setBonusOne: null, setBonusTwo: null },
    scoring.context as OptimizerContext,
    new Map(),
    { attacks: false },
  );
  return Number((damageAggregation as any)[ROTATION_REF[scoring.damageType ?? "Average"] ?? "avgDamage"]);
}

interface Entry {
  index: number;
  /** null = not computed yet; +Infinity = no bound (too small a subtree, or not finite); -Infinity = nothing below */
  ub: number | null;
  feasible: boolean;
  /** the virtual loadout has been built (or the subtree found too small) */
  checked: boolean;
  /** the virtual loadout's stats, kept until a bar exists and its score is wanted */
  pending: VirtualLoadout | null;
}

interface VirtualLoadout {
  stats: ReturnType<typeof virtualLoadoutStats>;
  echoStats: Record<string, number>;
}

function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - i + 1)) / i;
  return r;
}

/**
 * A pruner for one run, or null when the run's data rules the bound out (no main echo, a non-unique pool, an echo
 * value that is not a plain number, a target the bound does not cover, rotation overrides).
 */
export function createLoadoutPruner(setup: LoadoutPruneSetup | null | undefined, scoring: PrunerScoring, options: PrunerOptions = {}): LoadoutPruner | null {
  if (!setup || !Array.isArray(setup.pool) || !Array.isArray(setup.mainEchoKeys) || setup.mainEchoKeys.length === 0) return null;
  const targetType = String(scoring.target ?? "").split(":")[0];
  if (targetType !== "Stat" && targetType !== "Rotation") return null;
  if (targetType === "Rotation" && (!scoring.rotationData || scoring.rotationData.overrideActions?.length)) return null;
  // the main echo's buff is a term of the sums the bound inflates: a negative one could flip a factor (canPruneByBound
  // checks it on the main thread too, when the caller passes it)
  if (hasNegativeNumber(scoring.mainEchoStats) || hasNegativeNumber(scoring.echoSetPassiveBuffs)) return null;
  const format = normalizeLoadoutFormat(setup.loadoutFormat);
  const formatCosts = format === "Any" ? null : FORMAT_COSTS[format];
  const pool = setup.pool;
  const mainKeys = new Set(setup.mainEchoKeys);
  const indexOf = new Map<unknown, number>();
  const statKeys = new Map<string, number>();
  const singles: Array<Record<string, number>> = [];
  for (let i = 0; i < pool.length; i++) {
    const echo = pool[i];
    if (!echo || typeof echo !== "object" || echo.echoId == null || indexOf.has(echo.echoId)) return null;
    indexOf.set(echo.echoId, i);
    let stats: Record<string, number>;
    try {
      stats = getEchoStats(echo);
    } catch {
      // an echo upstream's stats cannot read (a cost outside 1 / 3 / 4): the processor scores around it loadout by
      // loadout as before; the bound stays off rather than failing the run's init
      return null;
    }
    for (const [key, value] of Object.entries(stats)) {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
      if (!statKeys.has(key)) statKeys.set(key, statKeys.size);
    }
    singles.push(stats);
  }
  const nStats = statKeys.size;
  const keyList = [...statKeys.keys()];
  // per echo: its stats as a dense row
  const rows = singles.map((stats) => {
    const row = new Float64Array(nStats);
    for (const [key, value] of Object.entries(stats)) row[statKeys.get(key)!] = value;
    return row;
  });
  const costs = pool.map(echoCost);
  const minStats = (scoring.minStats ?? []).filter((m) => m && typeof m.stat === "string");
  const minSubtree = Math.max(2, Math.floor(options.minSubtree ?? 2));
  const labelMemo = new Map<string, string[]>();
  const stats = { bounds: 0, skipped: 0, checked: 0 };
  const stack: Entry[] = [];

  /** The labels any loadout of the subtree can carry (see step 3), memoised by what decides them. */
  const labelUnion = (prefixSets: unknown[], candidateSets: unknown[], k: number): string[] => {
    const key = `${k}|${prefixSets.map(String).sort().join(",")}|${candidateSets.map(String).sort().join(",")}`;
    const hit = labelMemo.get(key);
    if (hit) return hit;
    const most = new Map<string, number>();
    const record = (list: unknown[]): void => {
      const effects = getSetBonusEffects(list as Array<string | null>);
      const counts = new Map<string, number>();
      for (const label of [effects.setBonusOnePiece, effects.setBonusOne, effects.setBonusTwo]) if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
      for (const [label, n] of counts) most.set(label, Math.max(most.get(label) ?? 0, n));
    };
    if (binomial(candidateSets.length + k, k) > 2000) {
      // too many multisets to walk (a pool of many sets): every label each set reaches on its own, at every piece
      // count it can reach — a superset of any one loadout's labels (each of them is one set's label at a count its
      // loadout reaches), so still an upper bound, only looser
      const reach = new Map<unknown, number>();
      for (const set of prefixSets) reach.set(set, (reach.get(set) ?? 0) + 1);
      for (const set of candidateSets) reach.set(set, (reach.get(set) ?? 0) + k);
      for (const [set, n] of reach) for (let c = 1; c <= Math.min(n, MAX_ECHOES); c++) record(Array.from({ length: c }, () => set));
      const labels = [...most.keys()];
      labelMemo.set(key, labels);
      return labels;
    }
    const visit = (from: number, left: number, list: unknown[]): void => {
      record(list);
      if (left === 0) return;
      for (let j = from; j < candidateSets.length; j++) {
        list.push(candidateSets[j]);
        visit(j, left - 1, list);
        list.pop();
      }
    };
    visit(0, k, [...prefixSets]);
    const labels: string[] = [];
    for (const [label, n] of most) for (let j = 0; j < n; j++) labels.push(label);
    labelMemo.set(key, labels);
    return labels;
  };

  /** Candidates of prefix `p` (pool indices) by cost, and the cost counts the subtree may still add. */
  const candidatesOf = (p: number[]): { byCost: Map<number, number[]>; budget: number; slots: number; remaining: Record<number, number> | null } => {
    const slots = MAX_ECHOES - p.length;
    let cost = 0;
    for (const i of p) cost += costs[i]!;
    const budget = COST_CAP - cost;
    let remaining: Record<number, number> | null = null;
    if (formatCosts) {
      remaining = { ...formatCosts };
      for (const i of p) remaining[costs[i]!] = (remaining[costs[i]!] ?? 0) - 1;
    }
    const byCost = new Map<number, number[]>();
    // generateLoadouts stops at five echoes or a spent budget (cost ≥ 12 adds nothing, not even a 0-cost echo)
    if (slots <= 0 || budget <= 0) return { byCost, budget, slots, remaining };
    const species = new Set(p.map((i) => pool[i]!.echo));
    const ids = new Set(p.map((i) => pool[i]!.echoId));
    const start = p.length === 1 ? 0 : p[p.length - 1]! + 1;
    for (let i = start; i < pool.length; i++) {
      const echo = pool[i]!;
      if (species.has(echo.echo) || ids.has(echo.echoId)) continue;
      const c = costs[i]!;
      if (c > budget) continue;
      if (remaining && !((remaining[c] ?? 0) > 0)) continue;
      let list = byCost.get(c);
      if (!list) byCost.set(c, (list = []));
      list.push(i);
    }
    return { byCost, budget, slots, remaining };
  };

  /** Cost counts (cost → how many) the rest of a subtree may take. */
  const patternsOf = (byCost: Map<number, number[]>, budget: number, slots: number, remaining: Record<number, number> | null): Array<Array<[number, number]>> | null => {
    if (remaining) {
      // a format fills exactly its remaining counts; a count the candidates cannot fill leaves no loadout
      const pattern: Array<[number, number]> = [];
      for (const [c, n] of Object.entries(remaining)) {
        if (n <= 0) continue;
        if ((byCost.get(Number(c))?.length ?? 0) < n) return null;
        pattern.push([Number(c), n]);
      }
      return [pattern];
    }
    const classes = [...byCost.keys()];
    const out: Array<Array<[number, number]>> = [];
    const visit = (ci: number, left: number, money: number, cur: Array<[number, number]>): void => {
      if (ci === classes.length) {
        out.push(cur.slice());
        return;
      }
      const c = classes[ci]!;
      const have = byCost.get(c)!.length;
      for (let n = 0; n <= Math.min(left, have); n++) {
        if (n * c > money) break;
        if (n > 0) cur.push([c, n]);
        visit(ci + 1, left - n, money - n * c, cur);
        if (n > 0) cur.pop();
      }
    };
    visit(0, slots, budget, []);
    return out;
  };

  const subtreeSize = (byCost: Map<number, number[]>, slots: number, remaining: Record<number, number> | null): number => {
    if (remaining) {
      let size = 1;
      for (const [c, n] of Object.entries(remaining)) if (n > 0) size *= binomial(byCost.get(Number(c))?.length ?? 0, n);
      return size;
    }
    let n = 0;
    for (const list of byCost.values()) n += list.length;
    let size = 0;
    for (let j = 0; j <= slots; j++) size += binomial(n, j);
    return size;
  };

  /** Stage 1: the virtual loadout's stats and the floor check (no rotation scored yet). null virtual = no bound. */
  const buildVirtual = (p: number[], cands: ReturnType<typeof candidatesOf>): { feasible: boolean; virtual: VirtualLoadout | null } => {
    const { byCost, budget, slots, remaining } = cands;
    const patterns = patternsOf(byCost, budget, slots, remaining);
    // a format whose remaining counts no candidates can fill: nothing below this prefix reaches the scorer
    if (patterns === null) return { feasible: false, virtual: null };
    stats.bounds += 1;
    // V: per stat, the most any allowed cost pattern holds (the best values per cost class, k ≤ 4 of them)
    const most = new Float64Array(nStats);
    if (patterns.length && byCost.size) {
      const tops = new Map<number, Float64Array[]>();
      for (const [c, list] of byCost) {
        const need = Math.min(list.length, slots);
        const top: Float64Array[] = [];
        for (let s = 0; s < nStats; s++) {
          const best = new Float64Array(need);
          for (const i of list) {
            let v = rows[i]![s]!;
            for (let j = 0; j < need; j++) {
              if (v > best[j]!) {
                const t = best[j]!;
                best[j] = v;
                v = t;
              }
            }
          }
          top.push(best);
        }
        tops.set(c, top);
      }
      for (let s = 0; s < nStats; s++) {
        let best = 0;
        for (const pattern of patterns) {
          let sum = 0;
          for (const [c, n] of pattern) {
            const top = tops.get(c)![s]!;
            for (let j = 0; j < n; j++) sum += top[j]!;
          }
          if (sum > best) best = sum;
        }
        most[s] = best;
      }
    }
    const echoes = p.map((i) => pool[i]);
    const echoStats = getCombinedEchoStats(echoes);
    for (let s = 0; s < nStats; s++) {
      const key = keyList[s]!;
      const total = (Number(echoStats[key]) || 0) + most[s]!;
      if (total > 0) echoStats[key] = total * VECTOR_SLACK;
    }
    const candidateSets = new Set<unknown>();
    for (const list of byCost.values()) for (const i of list) candidateSets.add(pool[i]!.echoSet);
    const labels = labelUnion(echoes.map((e) => e.echoSet), [...candidateSets], slots);
    try {
      const virtual = virtualLoadoutStats(scoring, echoStats, pool[p[0]!]!.echo, labels);
      for (const m of minStats) {
        const value = virtual.finalStats?.[m.stat];
        // only a finite number that misses the floor rules the subtree out
        if (typeof value === "number" && Number.isFinite(value) && !meetsMinStatThreshold(value, m.minValue, m.stat)) return { feasible: false, virtual: null };
      }
      return { feasible: true, virtual: { stats: virtual, echoStats } };
    } catch {
      return { feasible: true, virtual: null };
    }
  };

  /** Stage 2: the virtual loadout's score, inflated (step 5); a non-finite or failed score bounds nothing. */
  const scoreVirtual = (v: VirtualLoadout): number => {
    try {
      const raw = virtualTarget(scoring, v.stats, v.echoStats);
      return Number.isFinite(raw) ? (raw >= 0 ? raw * SCORE_SLACK : raw / SCORE_SLACK) : Infinity;
    } catch {
      return Infinity;
    }
  };

  /** The entry's bound: its virtual loadout built the first time a bar or a floor can use it (when the subtree is big
   *  enough to repay it), its score only once a bar exists — a floor alone needs no rotation scored. */
  const resolve = (entry: Entry, depth: number, bar: number | null): void => {
    if (!entry.checked) {
      if (bar === null && minStats.length === 0) return;
      entry.checked = true;
      const p = prefixIndices.slice(0, depth);
      const cands = candidatesOf(p);
      if (subtreeSize(cands.byCost, cands.slots, cands.remaining) < minSubtree) {
        entry.ub = Infinity;
        return;
      }
      const b = buildVirtual(p, cands);
      if (!b.feasible) {
        entry.feasible = false;
        entry.ub = -Infinity;
        return;
      }
      if (!b.virtual) {
        entry.ub = Infinity;
        return;
      }
      entry.pending = b.virtual;
    }
    if (entry.ub === null && bar !== null && entry.pending) {
      entry.ub = scoreVirtual(entry.pending);
      entry.pending = null;
    }
  };

  const prefixIndices: number[] = [];

  /** pool indices of a generator-order loadout (main echo first, then increasing pool order, distinct species) */
  const indicesOf = (loadout: any[], out: number[]): boolean => {
    out.length = 0;
    for (let j = 0; j < loadout.length; j++) {
      const i = indexOf.get(loadout[j]?.echoId);
      let ok = i !== undefined && (j === 0 ? mainKeys.has(pool[i]!.echo) : j === 1 || i > out[j - 1]!);
      for (let q = 0; ok && q < j; q++) if (pool[out[q]!]!.echo === pool[i!]!.echo) ok = false;
      if (!ok) return false;
      out.push(i!);
    }
    return true;
  };

  return {
    stats,
    bound(prefix) {
      const p: number[] = [];
      if (!Array.isArray(prefix) || !prefix.length || prefix.length > MAX_ECHOES || !indicesOf(prefix, p)) return null;
      const b = buildVirtual(p, candidatesOf(p));
      if (!b.feasible) return { ub: -Infinity, feasible: false };
      return { ub: b.virtual ? scoreVirtual(b.virtual) : Infinity, feasible: true };
    },
    skip(loadout, bar) {
      // the processor calls this outside its per-loadout try: anything unexpected scores the loadout as before
      try {
        return skipChecked(loadout, bar);
      } catch {
        stack.length = 0;
        return false;
      }
    },
  };

  function skipChecked(loadout: any[], bar: number | null): boolean {
    stats.checked += 1;
    if (!Array.isArray(loadout) || loadout.length === 0 || loadout.length > MAX_ECHOES) {
      stack.length = 0;
      return false;
    }
    // the loadout must be the generator's: main echo first, then increasing pool order (anything else — a swap-pass
    // loadout, a non-unique pool's normalised one — is scored as it comes)
    if (!indicesOf(loadout, prefixIndices)) {
      stack.length = 0;
      return false;
    }
    let d = 0;
    while (d < stack.length && d < loadout.length && stack[d]!.index === prefixIndices[d]) d++;
    stack.length = d;
    // a prefix entry for each proper prefix, and for the loadout itself while it can still grow
    const depth = loadout.length < MAX_ECHOES ? loadout.length : loadout.length - 1;
    for (let j = d; j < depth; j++) stack.push({ index: prefixIndices[j]!, ub: null, feasible: true, checked: false, pending: null });
    for (let j = 0; j < stack.length; j++) {
      const entry = stack[j]!;
      if (entry.ub === null) resolve(entry, j + 1, bar);
      if (!entry.feasible || (bar !== null && entry.ub !== null && entry.ub <= bar)) {
        stats.skipped += 1;
        return true;
      }
    }
    return false;
  }
}
