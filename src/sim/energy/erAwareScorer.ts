// Wuthering Tools+ — Energy Regen as a floor in every score built on a `BuildScorer` (substat weights, the Echo Lab
// benchmark, the invest plan). The app's damage engine is static: Energy Regen moves no damage number (bar the kits
// that convert it — Brant, Sigrika), so every weight used to call an ER roll dead. With the team's measured need
// (energyNeed.ts) the score becomes deficit-aware: `damage × (1 − max(0, need − have)/100)`. Below the need an ER roll
// is worth the share of the deficit it closes; at or above it, nothing; every other stat's relative gain is
// untouched (the factor multiplies both sides of the ratio). Pure over the scorer and `haveOf` handed in.
import { SUBSTAT_KEYS, type BuildScore, type BuildScorer, type SubstatKey } from "../substats/substatWeights";
import { deficitFactor, erRoll, erWeight as erWeightOf, showNeed } from "./energyNeed";
import { memoMenuEr, type HaveOf } from "./energyHave";

/** The ER floor a score respects: the member's need (%) and, for the label, the team that sets it. */
export interface ErFloor {
  need: number;
  /** the team whose wuwa_calc loop asks this much */
  team?: string;
}

export interface ErAwareOptions {
  /** the build's ER (%) for a clone of the data — default: the character screen's ER, memoised per ER signature */
  haveOf?: HaveOf;
}

/**
 * `score` with ER as a floor: the damage it returns times `deficitFactor(need, have)`. `extra.raw` keeps the
 * undiscounted damage and `extra.er` the build's ER, so a caller can show both (a substat weights row reports them
 * as `extraGain.raw` / `extraGain.er`). A build whose ER can't be read (no weapon) scores as the inner scorer does.
 */
export function erAwareScorer(score: BuildScorer, characterId: string, floor: ErFloor | number, options: ErAwareOptions = {}): BuildScorer {
  const need = typeof floor === "number" ? floor : floor.need;
  const haveOf = options.haveOf ?? memoMenuEr(characterId);
  return async (characters, inventoryEchoes): Promise<BuildScore> => {
    const [raw, have] = await Promise.all([score(characters, inventoryEchoes), haveOf(characters, inventoryEchoes)]);
    const factor = deficitFactor(need, have);
    return { avg: raw.avg * factor, extra: { ...(raw.extra ?? {}), raw: raw.avg, ...(have != null ? { er: have } : {}) } };
  };
}

/** What one ER roll is worth against a floor (relative gain on the deficit-aware score; 0 at or above the need). */
export const erWeight = (need: number | null | undefined, have: number | null | undefined, roll = erRoll()): number => erWeightOf(need, have, roll);

/** How many median ER rolls a reference spread (a benchmark's ChemX32 / perfect build) should spend before anything
 *  else so the build meets the floor, given the ER it has without any ER substat (`baseHave`). 0 when the floor is
 *  met already; at most `cap` (five echoes hold at most five ER lines). */
export function erRollsToFloor(need: number | null | undefined, baseHave: number | null | undefined, roll = erRoll(), cap = 5): number {
  if (need == null || baseHave == null || !(roll > 0)) return 0;
  const gap = need - baseHave;
  return gap > 0 ? Math.min(cap, Math.ceil(gap / roll - 1e-9)) : 0;
}

/* -------------------------------------------------------------------------------- hooks for direct engine callers */
// Batch-1's invest plan (src/sim/account/investPlan.ts) and Echo Lab benchmark (src/sim/echoLab/benchmarkScore.ts) call
// the engine directly rather than through a BuildScorer: these are the few lines they need to treat ER as a floor.

// eslint-disable-next-line no-unused-vars -- the parameters of a function type
export type ErFactor = (characters: Record<string, any>, inventoryEchoes: any[]) => Promise<number>;

/** The deficit-aware multiplier of a build (a clone of the data) against a floor: `deficitFactor(need, menu ER)`,
 *  memoised per ER signature so clones that only move other stats cost one lookup. Null without a floor — callers
 *  multiply by nothing, and their numbers stay what they were. Worker-safe (the calculator only). */
export function erFactorFor(characterId: string, need: number | null | undefined, options: ErAwareOptions = {}): ErFactor | null {
  if (need == null || !Number.isFinite(need) || !(need > 0)) return null;
  const haveOf = options.haveOf ?? memoMenuEr(characterId);
  return async (characters, inventoryEchoes) => deficitFactor(need, await haveOf(characters, inventoryEchoes));
}

/** A relative gain the static engine measured (`avgDamage / base − 1`), re-read on the deficit-aware score:
 *  `(1 + gain) × factor(after) / factor(before) − 1`. An Energy Regen roll the engine reads as +0.0 % is worth the
 *  share of the deficit it closes; every other change keeps its gain when the factor does not move. */
export const erAdjustedGain = (gain: number, before: number, after: number): number => (before > 0 ? ((1 + gain) * after) / before - 1 : gain);

/** wuwa_calc's ChemX32 spread (`shared/substats.ts`): five named stats take 5/5/2/2/2 of 24 rolls, each other
 *  substat one. When the bar wants more Energy Regen, ER is promoted to the third place — two rolls on the same
 *  shape, three on 5/4/3/2/2 (his `PROMOTIONS`) — and the fifth named stat falls back to one roll. He stops at three:
 *  past that the solver reaches for an ER main stat, which a benchmark (main stats fixed) can't, so the reference
 *  stays short and the deficit-aware score discounts it like any other build. */
export const CHEMX32_SHAPE = [5, 5, 2, 2, 2] as const;
const ER_PROMOTED_SHAPE: Record<2 | 3, readonly number[]> = { 2: CHEMX32_SHAPE, 3: [5, 4, 3, 2, 2] };

export interface ErReference {
  /** the stats that take the shape, in order (ER third when promoted) */
  named: SubstatKey[];
  counts: Map<SubstatKey, number>;
  /** ER rolls the spread carries: 1 – 3 */
  erRolls: number;
}

/** ChemX32's roll counts over `priority` (most valued first; ER in it is ignored — it is placed by `erRolls`, the
 *  rolls the floor asks for: `erRollsToFloor(need, ER without any ER line)`, at least the one every spread carries). */
export function erReferenceCounts(priority: readonly SubstatKey[], erRolls: number, keys: readonly SubstatKey[] = SUBSTAT_KEYS): ErReference {
  const named = [...new Set(priority.filter((k) => k !== "EnergyRegen" && keys.includes(k)))].slice(0, 5);
  const counts = new Map<SubstatKey, number>(keys.map((k) => [k, 1]));
  const rolls = Math.max(1, Math.min(3, Math.round(Number(erRolls) || 0)));
  if (rolls === 1) {
    named.forEach((k, i) => counts.set(k, CHEMX32_SHAPE[i]!));
    return { named, counts, erRolls: 1 };
  }
  const order = [named[0], named[1], "EnergyRegen", named[2], named[3]].filter((k): k is SubstatKey => k != null);
  const shape = ER_PROMOTED_SHAPE[rolls as 2 | 3];
  order.forEach((k, i) => counts.set(k, shape[i]!));
  return { named: order, counts, erRolls: rolls };
}

/** The benchmark's note on Energy Regen with a floor (replaces "Energy Regen reads as worth nothing…"). */
export function erBenchmarkNote(need: number | null | undefined, erRolls = 1, team?: string): string {
  if (need == null) return "Energy Regen reads as worth nothing to the static engine, so the references spend no rolls chasing it.";
  const where = team ? ` (${team})` : "";
  return `Energy Regen is a floor: ${showNeed(need).toFixed(1)}% is this character's need in their saved teams' wuwa_calc loops${where}. Every build is scored as damage × (1 − ER deficit), and the 100 % reference spends ${erRolls} of its rolls on Energy Regen as wuwa_calc's ChemX32 does.`;
}
