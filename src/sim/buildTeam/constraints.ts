// Wuthering Tools+ — "Build it for me": a member's plan (rileyPlan.ts) as optimizer constraints over the player's real
// inventory. Upstream's optimizer takes sets, main echoes, a cost format ("Any" | "43311" | "44111") and min stats;
// it has no per-slot main-stat filter and no 41111. Both are pool filters here: an echo whose main stat Riley's
// layout never puts at its cost is dropped before the optimizer sees it, and 41111 runs as "Any" with every 3-cost
// and every 4-cost but the main echo dropped (slot 0 is the main echo and a species never repeats, so what is left
// can only be 4 + 1 + 1 + 1 + 1). Pure.
import type { OptimizerLoadoutFormat } from "../../calculator/optimizer";
import { filterEchoesForOptimizer } from "../../calculator/optimizer";
import { mainEchoesData } from "../../echoes/index";
import { echoSetLabelMap } from "../../echoes/stats";
import { LAYOUT_COSTS, type MemberPlan, type RileyLayout } from "./rileyPlan";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The switches the page offers (defaults in `DEFAULT_OPTIONS`). */
export interface BuildOptions {
  /** only echoes of the plan's sets (Riley's pick or the preset's) */
  useSets: boolean;
  /** only main stats the plan's layout puts at each cost */
  useMainStats: boolean;
  /** keep each member's current main echo instead of the plan's */
  keepMainEcho: boolean;
  /** take echoes other characters (outside the team) wear in their active build */
  takeFromOthers: boolean;
  /** try every priority order and keep the best team value (only when the pools are small) */
  tryAllOrders: boolean;
}

export const DEFAULT_OPTIONS: BuildOptions = { useSets: true, useMainStats: true, keepMainEcho: false, takeFromOthers: false, tryAllOrders: true };

export interface MemberConstraints {
  characterId: string;
  /** app set keys the pool keeps; null = every set */
  allowedSets: string[] | null;
  /** species slot 0 must be; null = any species of the slot-0 cost */
  mainEchoKeys: string[] | null;
  layout: RileyLayout | null;
  /** what upstream's generator gets: 43311 / 44111 as themselves, 41111 and no layout as "Any" */
  loadoutFormat: OptimizerLoadoutFormat;
  /** main stats allowed per cost; null = any */
  mainStatsByCost: Record<number, string[]> | null;
  /** Energy Regen floor as the character screen reads it (%), null = none */
  erFloor: number | null;
}

/** The cost of an echo the way the optimizer reads it (`type`, coerced). */
export const costOf = (echo: { type?: unknown } | null | undefined): number => {
  const n = Number(echo?.type);
  return Number.isFinite(n) ? n : 0;
};

/** The cost of an echo species from its class (Calamity / Overlord 4, Elite 3, Common 1). */
export function speciesCost(key: string): number {
  const cls = (mainEchoesData as Record<string, { class?: string }>)[key]?.class;
  return cls === "Calamity" || cls === "Overlord" ? 4 : cls === "Elite" ? 3 : cls === "Common" ? 1 : 0;
}

export function constraintsOf(plan: MemberPlan, options: BuildOptions, current: { mainEcho?: string | null; erFloor?: number | null } = {}): MemberConstraints {
  const layout = plan.mainStats?.layout ?? null;
  const loadoutFormat: OptimizerLoadoutFormat = layout === "43311" || layout === "44111" ? layout : "Any";
  let mainEchoKeys: string[] | null = plan.mainEcho?.keys.length ? [...plan.mainEcho.keys] : null;
  if (options.keepMainEcho && current.mainEcho) mainEchoKeys = [current.mainEcho];
  const allowedSets = options.useSets && plan.sets.length ? plan.sets.map((s) => s.key).filter((k) => k in echoSetLabelMap) : null;
  return {
    characterId: plan.characterId,
    allowedSets: allowedSets && allowedSets.length ? allowedSets : null,
    mainEchoKeys,
    layout,
    loadoutFormat,
    mainStatsByCost: options.useMainStats && plan.mainStats ? plan.mainStats.byCost : null,
    erFloor: current.erFloor !== undefined ? current.erFloor : plan.erNeed,
  };
}

/** Why an echo is not in a member's pool (the first rule it fails), or null when it is in. */
export type PoolRule = "ignored" | "set" | "cost" | "mainStat" | "fourCost" | "taken" | "worn";

/** The echoes a member's optimizer run may use, and why the others were left out. `taken` = echoes an earlier
 *  member already holds; `wornOutside` = echoes characters outside the team wear (left out unless allowed). */
export function filterPool(
  echoes: readonly any[],
  c: MemberConstraints,
  sets: { taken?: ReadonlySet<string>; wornOutside?: ReadonlySet<string> } = {},
): { pool: any[]; dropped: Record<PoolRule, number> } {
  const dropped: Record<PoolRule, number> = { ignored: 0, set: 0, cost: 0, mainStat: 0, fourCost: 0, taken: 0, worn: 0 };
  const kept = new Set(filterEchoesForOptimizer(echoes as any[]));
  const pool: any[] = [];
  for (const echo of echoes) {
    const rule = !kept.has(echo) ? "ignored" : ruleOf(echo, c, sets);
    if (rule) dropped[rule] += 1;
    else pool.push(echo);
  }
  return { pool, dropped };
}

function ruleOf(echo: any, c: MemberConstraints, sets: { taken?: ReadonlySet<string>; wornOutside?: ReadonlySet<string> }): PoolRule | null {
  if (!echo || !echo.echoId) return "ignored";
  if (sets.taken?.has(echo.echoId)) return "taken";
  if (sets.wornOutside?.has(echo.echoId)) return "worn";
  if (c.allowedSets && !c.allowedSets.includes(echo.echoSet)) return "set";
  const cost = costOf(echo);
  if (c.layout) {
    const costs = LAYOUT_COSTS[c.layout];
    if (!costs.includes(cost)) return "cost";
    // 41111: the only 4-cost is the main echo (see the file header)
    if (c.layout === "41111" && cost === 4 && c.mainEchoKeys && !c.mainEchoKeys.includes(echo.echo)) return "fourCost";
  }
  // the main echo's own copies keep any main stat: a Crit Rate Sigillum beats a Crit DMG 4-cost without Sigillum's
  // buff, and the optimizer weighs the two
  const isMainSpecies = !!c.mainEchoKeys?.includes(echo.echo);
  if (c.mainStatsByCost && !isMainSpecies) {
    const allowed = c.mainStatsByCost[cost];
    if (allowed && !allowed.includes(echo.stat)) return "mainStat";
    if (!allowed && c.layout) return "cost";
  }
  return null;
}

/** The species slot 0 may be for this pool: the plan's main echo when the pool holds a copy, else every species of
 *  the layout's slot-0 cost in the pool (the optimizer then picks the best). `fallback` says which happened. */
export function mainEchoCandidates(pool: readonly any[], c: MemberConstraints): { keys: string[]; fallback: boolean } {
  const present = new Set(pool.map((e) => e.echo).filter(Boolean));
  if (c.mainEchoKeys) {
    const keys = c.mainEchoKeys.filter((k) => present.has(k));
    if (keys.length) return { keys, fallback: false };
  }
  // the plan's echo sets the slot's cost (Riley runs Elites in the main slot — Suisui's Forbidden Bastion); else the
  // layout's highest cost
  const planned = c.mainEchoKeys?.map(speciesCost).find((n) => n > 0);
  const slotCost = planned ?? (c.layout ? LAYOUT_COSTS[c.layout][0]! : 4);
  const keys = [...present].filter((k) => pool.some((e) => e.echo === k && costOf(e) === slotCost)).sort();
  return { keys, fallback: true };
}

/** How far a member's constraints were relaxed to find a loadout: Riley's plan as is, any main stat in the plan's
 *  layout, or any layout (the sets are kept at every level — they decide a support's team buff). */
export type RelaxLevel = "plan" | "mainStats" | "layout";

/** The levels to try, strictest first, each a full constraint set (duplicates dropped). */
export function relaxLevels(c: MemberConstraints): Array<{ level: RelaxLevel; c: MemberConstraints }> {
  const out: Array<{ level: RelaxLevel; c: MemberConstraints }> = [{ level: "plan", c }];
  if (c.mainStatsByCost) out.push({ level: "mainStats", c: { ...c, mainStatsByCost: null } });
  if (c.layout) out.push({ level: "layout", c: { ...c, mainStatsByCost: null, layout: null, loadoutFormat: "Any" } });
  return out;
}

/** One slot of a layout the pool cannot fill, for the "not enough echoes" message. */
export interface Shortfall {
  cost: number;
  /** the main stats that slot may roll */
  stats: string[];
  need: number;
  have: number;
}

/** Slots of the layout this pool cannot fill: per cost, how many echoes with an allowed main stat it needs and holds
 *  (distinct species only — a loadout never repeats one). Empty when every cost can be filled. */
export function shortfallOf(pool: readonly any[], c: MemberConstraints): Shortfall[] {
  if (!c.layout) return pool.length ? [] : [{ cost: 4, stats: [], need: 1, have: 0 }];
  const costs = LAYOUT_COSTS[c.layout];
  const need = new Map<number, number>();
  for (const cost of costs) need.set(cost, (need.get(cost) ?? 0) + 1);
  const out: Shortfall[] = [];
  for (const [cost, n] of need) {
    const species = new Set(pool.filter((e) => costOf(e) === cost).map((e) => e.echo));
    if (species.size < n) out.push({ cost, stats: c.mainStatsByCost?.[cost] ?? [], need: n, have: species.size });
  }
  return out;
}

/** May `echo` stand in slot `slot` of member `c`'s loadout (the swap pass)? The member's own pool rules (bar
 *  `taken`, which the swap pass handles), slot 0 only for a main-echo species, and no species twice. */
export function legalInSlot(echo: any, slot: number, loadout: readonly any[], c: MemberConstraints, wornOutside?: ReadonlySet<string>): boolean {
  if (!echo?.echoId) return false;
  if (ruleOf(echo, c, { wornOutside })) return false;
  if (costOf(echo) !== costOf(loadout[slot])) return false;
  if (slot === 0 && c.mainEchoKeys && !c.mainEchoKeys.includes(echo.echo)) return false;
  for (let i = 0; i < loadout.length; i++) if (i !== slot && loadout[i]?.echo === echo.echo) return false;
  return true;
}

/** Pieces of each set a loadout wears. */
export function setCounts(loadout: readonly any[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of loadout) if (e?.echoSet) out[e.echoSet] = (out[e.echoSet] ?? 0) + 1;
  return out;
}

/** Does the loadout wear at least the pieces the plan asks for (5pc, 3 + 2, …)? */
export function meetsSetPieces(loadout: readonly any[], plan: Pick<MemberPlan, "sets">): boolean {
  const counts = setCounts(loadout);
  return plan.sets.every((s) => (counts[s.key] ?? 0) >= s.pieces);
}
