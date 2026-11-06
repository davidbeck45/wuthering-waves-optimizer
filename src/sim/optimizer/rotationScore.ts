// Wuthering Tools+ — one rotation score per loadout with each distinct action scored once (track "optimizer-speed",
// 2026-11-02).
//
// A rotation often repeats an action (Galbrena's curated rotation: 18 actions, 14 distinct; Phrolova's wuwa_calc one:
// 22 and 10). Upstream's `scoreOptimizerRotation` sends every action through `processAttacks`, so each repeat runs the
// whole damage pipeline (`calculateAttackDamage` → `calcDamage` and its breakdown strings) again on the same inputs.
// `scoreOptimizerRotationDeduped` scores each distinct action once and lays the results back out in the rotation's own
// order, so the list `aggregateRotationDamage` sums is value-for-value the list upstream sums, in the same order:
// the same additions in the same order, so the same bits.
//
// Why a repeat gets the same result: `processAttacks` maps each attack on its own (a `.map`, the enabled-attack keys
// computed once before it), and neither it nor `calculateAttackDamage` reads `attack.id` except to copy it into the
// output, writes to the attack, the context or the stats they are given (the one clone, MultiplySelfBuff, is a copy),
// or reads a clock or Math.random. Two actions whose attack objects are equal in every other field therefore get equal
// outputs except for `id`. `attackKeyOf` only calls two attacks equal when every field but `id` holds the same plain
// data (numbers compared with Object.is, so NaN, -0 and null stay apart; functions, class instances and cycles make an
// attack unique), and `rotationScore.test.ts` checks the deduped scorer against upstream's, attack for
// attack, on every curated and stock rotation of the characters it covers.
//
// Rotations with per-action overrides (`overrideActions`) go to upstream's function untouched: their per-action
// stats rebuild is where the time goes, and copying that loop here would fork upstream's logic.
import {
  buildOptimizerCalculationContext,
  scoreOptimizerRotation,
  type OptimizerContext,
  type OptimizerLoadoutStats,
  type OverrideBuffVariant,
} from "../../calculator/optimizer";
import { aggregateRotationDamage, processAttacks } from "../../calculator/attacks";
import type { OptimizerRotationData } from "../../calculator/rotationData";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A canonical string for plain data (null when the value holds anything else): numbers by Object.is identity. */
function plainKey(value: unknown, depth: number, seen: Set<object>): string | null {
  if (value === null) return "n";
  switch (typeof value) {
    case "undefined":
      return "u";
    case "boolean":
      return value ? "t" : "f";
    case "number":
      return Object.is(value, -0) ? "#-0" : `#${String(value)}`;
    case "string":
      return `s${JSON.stringify(value)}`;
    case "object":
      break;
    default:
      return null;
  }
  if (depth > 8) return null;
  const obj = value as object;
  if (seen.has(obj)) return null;
  const proto = Object.getPrototypeOf(obj);
  const isArray = Array.isArray(obj);
  if (!isArray && proto !== Object.prototype && proto !== null) return null;
  seen.add(obj);
  const parts: string[] = [];
  if (isArray) {
    for (const item of obj as unknown[]) {
      const k = plainKey(item, depth + 1, seen);
      if (k === null) return null;
      parts.push(k);
    }
    seen.delete(obj);
    return `[${parts.join(",")}]`;
  }
  // own enumerable keys in insertion order: a different order is a different key (no dedup, never a wrong one)
  for (const key of Object.keys(obj)) {
    const k = plainKey((obj as Record<string, unknown>)[key], depth + 1, seen);
    if (k === null) return null;
    parts.push(`${JSON.stringify(key)}:${k}`);
  }
  seen.delete(obj);
  return `{${parts.join(",")}}`;
}

/** The identity of an attack for scoring: every own field but `id`, as plain data; null = never shared. */
export function attackKeyOf(attack: unknown): string | null {
  if (!attack || typeof attack !== "object" || Array.isArray(attack)) return null;
  const proto = Object.getPrototypeOf(attack);
  if (proto !== Object.prototype && proto !== null) return null;
  const rest: Record<string, unknown> = {};
  for (const key of Object.keys(attack)) if (key !== "id") rest[key] = (attack as Record<string, unknown>)[key];
  return plainKey(rest, 0, new Set());
}

export interface PlainAttackPlan {
  /** the distinct attacks, each the first action that has it */
  unique: any[];
  /** per plain attack: its index in `unique` */
  rep: number[];
}

const planCache = new WeakMap<object, PlainAttackPlan>();

/** The distinct plain attacks of a rotation (memoised per `plainAttacks` array; the optimizer never mutates it). */
export function planPlainAttacks(plainAttacks: readonly any[]): PlainAttackPlan {
  const cached = planCache.get(plainAttacks);
  if (cached) return cached;
  const unique: any[] = [];
  const rep: number[] = [];
  const byKey = new Map<string, number>();
  for (const attack of plainAttacks) {
    const key = attackKeyOf(attack);
    const hit = key === null ? undefined : byKey.get(key);
    if (hit !== undefined) {
      rep.push(hit);
      continue;
    }
    if (key !== null) byKey.set(key, unique.length);
    rep.push(unique.length);
    unique.push(attack);
  }
  const plan = { unique, rep };
  planCache.set(plainAttacks, plan);
  return plan;
}

type RotationScore = ReturnType<typeof scoreOptimizerRotation>;

/**
 * Upstream's `scoreOptimizerRotation`, same arguments and same result, with each distinct plain action scored once.
 * `attacks: false` skips building the per-action result list (the headless optimizer only reads the aggregation).
 */
export function scoreOptimizerRotationDeduped(
  rotationData: OptimizerRotationData,
  loadout: any[],
  loadoutStats: OptimizerLoadoutStats,
  context: OptimizerContext,
  overrideBuffVariants: Map<string, OverrideBuffVariant>,
  options: { attacks?: boolean } = {},
): RotationScore {
  const plainAttacks = rotationData.plainAttacks;
  if (rotationData.overrideActions.length || !plainAttacks.length) {
    return scoreOptimizerRotation(rotationData, loadout, loadoutStats, context, overrideBuffVariants);
  }
  const plan = planPlainAttacks(plainAttacks);
  if (plan.unique.length === plainAttacks.length) {
    return scoreOptimizerRotation(rotationData, loadout, loadoutStats, context, overrideBuffVariants);
  }
  const { finalStats, combinedEchoBuffs } = loadoutStats;
  const optimizerContext = buildOptimizerCalculationContext(context, finalStats, combinedEchoBuffs, loadoutStats);
  const scored = processAttacks(plan.unique, optimizerContext, null, false, true, false, finalStats, combinedEchoBuffs);
  if (scored.length !== plan.unique.length) {
    // processAttacks dropped one (it cannot with excludeDisabledAttacks off): let upstream do the whole rotation
    return scoreOptimizerRotation(rotationData, loadout, loadoutStats, context, overrideBuffVariants);
  }
  const wantAttacks = options.attacks !== false;
  const attacks = new Array(plainAttacks.length);
  for (let i = 0; i < plainAttacks.length; i++) {
    const result = scored[plan.rep[i]!];
    const id = plainAttacks[i]?.id ?? plainAttacks[i]?.key;
    // the representative keeps its own object; a repeat gets a copy with its id (its own damage object too, as upstream)
    attacks[i] = !wantAttacks || result.id === id ? result : { ...result, id, damage: result.damage && typeof result.damage === "object" ? { ...result.damage } : result.damage };
  }
  // upstream's addAggregation from nulls, for the one plain batch
  const agg = aggregateRotationDamage(attacks);
  let normalDamage: number | null = null;
  let avgDamage: number | null = null;
  let critDamage: number | null = null;
  let healing: number | null = null;
  let shield: number | null = null;
  if (agg.normalDamage != null) normalDamage = (normalDamage ?? 0) + agg.normalDamage;
  if (agg.avgDamage != null) avgDamage = (avgDamage ?? 0) + agg.avgDamage;
  if (agg.critDamage != null) critDamage = (critDamage ?? 0) + agg.critDamage;
  if (agg.healing != null) healing = (healing ?? 0) + agg.healing;
  if (agg.shield != null) shield = (shield ?? 0) + agg.shield;
  if (!wantAttacks) return { attacks: [], damageAggregation: { normalDamage, avgDamage, critDamage, healing, shield } };
  const attacksById = new Map<string, any>();
  for (const attack of attacks) attacksById.set(attack.id, attack);
  const orderedAttacks = rotationData.actionOrder.map((actionId) => attacksById.get(actionId)).filter((attack) => attack !== undefined);
  return { attacks: orderedAttacks, damageAggregation: { normalDamage, avgDamage, critDamage, healing, shield } };
}
