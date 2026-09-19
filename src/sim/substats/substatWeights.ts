// Wuthering Tools+: substat weights — what one more roll of each substat is worth on a build, as the
// app's own engine scores it. "Current build + buffs": the character's real echoes, weapon, chains and
// buffs on a rotation, then the same rotation with one roll of Crit Rate / Crit DMG / ATK% / … added, and
// the relative gain of each. Four sizes of "one roll" per substat: the expected roll (the tiers weighted
// by how often they land — an average, not always a tier the game can show), the median tier (a real
// tier: half of all rolls land on it or lower), the best tier, and one tier step (what an existing line
// gains from going up a tier). The roll is placed on an equipped echo in a *clone* of the data (the store
// and the export are never touched), so it goes through `getEchoStats` exactly like a real substat —
// per-action `excludeEchoes` flags, HP/DEF scalers and the crit cap all behave; no engine change.
// The scorer is pluggable: a character rotation (the /my-rankings number), or a team rotation with the
// buffs derived from the real members (the CLI's `--team`). Pure/async: no Vue, no stores.
import { resolveCharacterEchoes, type TeamEnemyConfig } from "../../calculator/buildCharacterContext";
import { calcCharacterRotationDamage, type CharacterRotationInput } from "../../calculator/characterRotation";
import { subStatsTable } from "../../echoes/stats";

export const SUBSTAT_KEYS = [
  "CritRate",
  "CritDMG",
  "ATK",
  "ATK_FLAT",
  "HP",
  "HP_FLAT",
  "DEF",
  "DEF_FLAT",
  "BasicAttackDMGBonus",
  "HeavyAttackDMGBonus",
  "ResonanceSkillDMGBonus",
  "ResonanceLiberationDMGBonus",
  "EnergyRegen",
] as const;
export type SubstatKey = (typeof SUBSTAT_KEYS)[number];

export const SUBSTAT_LABELS: Record<SubstatKey, string> = {
  CritRate: "Crit Rate",
  CritDMG: "Crit DMG",
  ATK: "ATK %",
  ATK_FLAT: "ATK (flat)",
  HP: "HP %",
  HP_FLAT: "HP (flat)",
  DEF: "DEF %",
  DEF_FLAT: "DEF (flat)",
  BasicAttackDMGBonus: "Basic Attack DMG",
  HeavyAttackDMGBonus: "Heavy Attack DMG",
  ResonanceSkillDMGBonus: "Resonance Skill DMG",
  ResonanceLiberationDMGBonus: "Resonance Liberation DMG",
  EnergyRegen: "Energy Regen",
};

/** Labels that fit a phone column (the view switches to them below 768 px). */
export const SUBSTAT_SHORT_LABELS: Record<SubstatKey, string> = {
  CritRate: "Crit Rate",
  CritDMG: "Crit DMG",
  ATK: "ATK %",
  ATK_FLAT: "ATK flat",
  HP: "HP %",
  HP_FLAT: "HP flat",
  DEF: "DEF %",
  DEF_FLAT: "DEF flat",
  BasicAttackDMGBonus: "Basic DMG",
  HeavyAttackDMGBonus: "Heavy DMG",
  ResonanceSkillDMGBonus: "Skill DMG",
  ResonanceLiberationDMGBonus: "Liberation DMG",
  EnergyRegen: "Energy Regen",
};

/** The abbreviations an echo's substat line reads with (`CR 8.1 · CD 15 · ATK 50`). */
export const SUBSTAT_ABBR: Record<string, string> = {
  CritRate: "CR",
  CritDMG: "CD",
  ATK: "ATK%",
  ATK_FLAT: "ATK",
  HP: "HP%",
  HP_FLAT: "HP",
  DEF: "DEF%",
  DEF_FLAT: "DEF",
  BasicAttackDMGBonus: "Basic",
  HeavyAttackDMGBonus: "Heavy",
  ResonanceSkillDMGBonus: "Skill",
  ResonanceLiberationDMGBonus: "Lib",
  EnergyRegen: "ER",
};

export const isFlatSubstat = (key: SubstatKey): boolean => key.endsWith("_FLAT");

// How often a roll lands on each tier of `subStatsTable[key]`, low to high — Kuro's KR product info
// as vendor/wuwa_calc/src/shared/substats.ts carries it (WEIGHTS / CRIT_WEIGHTS and the flat pairs;
// not exported there). The eight percent-shaped stats and flat HP share one spread; crit has its own.
const TIER_WEIGHTS: Record<SubstatKey, readonly number[]> = (() => {
  const spread = [7, 8, 21, 25, 18, 15, 6, 3];
  const crit = [70, 70, 70, 24, 24, 24, 9, 9];
  return {
    CritRate: crit,
    CritDMG: crit,
    ATK: spread,
    ATK_FLAT: [7, 54, 39, 3],
    HP: spread,
    HP_FLAT: spread,
    DEF: spread,
    DEF_FLAT: [15, 46, 33, 9],
    BasicAttackDMGBonus: spread,
    HeavyAttackDMGBonus: spread,
    ResonanceSkillDMGBonus: spread,
    ResonanceLiberationDMGBonus: spread,
    EnergyRegen: spread,
  };
})();

/** The tiers a substat can roll, low to high (the app's own table). */
export const rollTiers = (key: SubstatKey): readonly number[] => subStatsTable[key] ?? [];

/** The best tier of a substat. */
export const maxRoll = (key: SubstatKey): number => {
  const tiers = rollTiers(key);
  return tiers[tiers.length - 1] ?? 0;
};

/** What a random roll of a substat is worth on average: the tiers weighted by how often they land. */
export function expectedRoll(key: SubstatKey): number {
  const tiers = rollTiers(key);
  const weights = TIER_WEIGHTS[key];
  if (tiers.length !== weights.length) return tiers.reduce((a, b) => a + b, 0) / (tiers.length || 1);
  const total = weights.reduce((a, b) => a + b, 0);
  return tiers.reduce((sum, tier, i) => sum + tier * weights[i], 0) / total;
}

/**
 * The median tier of a substat: the first tier at which the odds of landing there or lower reach one half.
 * Unlike the expectation it is always a value the game can roll (flat ATK: 40, where the expectation is 44).
 */
export function medianRoll(key: SubstatKey): number {
  const tiers = rollTiers(key);
  const weights = TIER_WEIGHTS[key];
  if (!tiers.length) return 0;
  if (tiers.length !== weights.length) return tiers[Math.floor((tiers.length - 1) / 2)];
  const total = weights.reduce((a, b) => a + b, 0);
  let cumulative = 0;
  for (let i = 0; i < tiers.length; i++) {
    cumulative += weights[i];
    if (cumulative * 2 >= total) return tiers[i];
  }
  return tiers[tiers.length - 1];
}

/**
 * One tier step of a substat: the distance between two neighbouring tiers (Crit Rate 0.6, Crit DMG 1.2,
 * flat ATK 10). The tables that are not evenly spaced (ATK % runs 6.4, 7.1, 7.9, …) get the average step.
 */
export function tierStep(key: SubstatKey): number {
  const tiers = rollTiers(key);
  if (tiers.length < 2) return 0;
  return (tiers[tiers.length - 1] - tiers[0]) / (tiers.length - 1);
}

const SUB_FIELDS = [1, 2, 3, 4, 5] as const;
const typeField = (n: number): string => `echoSubStatsType${n}`;
const valueField = (n: number): string => `echoSubStatsValue${n}`;

/** One substat line of an equipped echo, as `getEchoStats` counts it (type and a non-zero value). */
interface SubstatLine {
  slot: number;
  field: number;
  key: string;
  value: number;
}

function substatLines(echo: Record<string, any>, slot: number): SubstatLine[] {
  const lines: SubstatLine[] = [];
  for (const n of SUB_FIELDS) {
    const key = echo?.[typeField(n)];
    const value = Number(echo?.[valueField(n)]);
    if (key && value) lines.push({ slot, field: n, key: String(key), value });
  }
  return lines;
}

const hasEcho = (echo: Record<string, any> | null | undefined): boolean =>
  Boolean(echo && (echo.echoId || echo.echo || echo.type || substatLines(echo, 0).length));

export interface SubstatPlacement {
  /** the echo slot (0-4) the roll landed on */
  slot: number;
  /**
   * bumped: an existing line of the same substat grew by the roll ·
   * filled: a free substat field took it ·
   * inline: the slot was empty, a substat-only record filled it ·
   * swapped: every field held another substat, so a duplicated one gave up a line and its value moved
   * onto its twin (the build's totals are unchanged apart from the roll)
   */
  how: "bumped" | "filled" | "inline" | "swapped";
  /** for `swapped`: the substat that moved and where its value went */
  moved?: { key: string; value: number; toSlot: number };
}

export interface BuildClone {
  characters: Record<string, any>;
  inventoryEchoes: any[];
  placement: SubstatPlacement;
}

/**
 * A copy of the character's data with `value` more of substat `key` on one of the equipped echoes —
 * the roll goes where a real one could sit, on a cloned inventory echo (or a cloned inline slot when
 * the slot carries its own echo data). Never mutates the inputs. With five echoes of five substats
 * over thirteen kinds a duplicated kind always exists, so a place is always found; a build with fewer
 * echoes gets the roll on a free field or an empty slot.
 */
export function withSubstat(
  characterId: string,
  characters: Record<string, any>,
  inventoryEchoes: any[],
  key: SubstatKey,
  value: number,
): BuildClone {
  const data = characters?.[characterId] ?? {};
  const slots = data.echoes ?? {};
  const resolved = resolveCharacterEchoes(slots, inventoryEchoes);
  const fromInventory = resolved.map((echo, i) => {
    const echoId = (slots as Record<string, any>)?.[i]?.echoId ?? null;
    return Boolean(echoId) && echo?.echoId === echoId && inventoryEchoes.some((e) => e?.echoId === echoId);
  });
  const lines = resolved.flatMap((echo, slot) => substatLines(echo, slot));

  // the edits: slot → field → [type, value]; applied to clones below
  const edits = new Map<number, Map<number, [string, number]>>();
  const edit = (slot: number, field: number, type: string, amount: number): void => {
    const perSlot = edits.get(slot) ?? new Map<number, [string, number]>();
    perSlot.set(field, [type, amount]);
    edits.set(slot, perSlot);
  };
  let placement: SubstatPlacement | null = null;

  const same = lines.find((l) => l.key === key);
  if (same) {
    edit(same.slot, same.field, key, same.value + value);
    placement = { slot: same.slot, how: "bumped" };
  }
  if (!placement) {
    for (let slot = 0; slot < 5 && !placement; slot++) {
      if (!hasEcho(resolved[slot])) continue;
      const used = new Set(lines.filter((l) => l.slot === slot).map((l) => l.field));
      const free = SUB_FIELDS.find((n) => !used.has(n));
      if (free) {
        edit(slot, free, key, value);
        placement = { slot, how: "filled" };
      }
    }
  }
  if (!placement) {
    const empty = resolved.findIndex((echo) => !hasEcho(echo));
    if (empty >= 0) {
      edit(empty, 1, key, value);
      placement = { slot: empty, how: "inline" };
    }
  }
  if (!placement) {
    const byKey = new Map<string, SubstatLine[]>();
    for (const l of lines) byKey.set(l.key, [...(byKey.get(l.key) ?? []), l]);
    const twins = [...byKey.values()].find((group) => group.length >= 2);
    if (twins) {
      const [gone, twin] = twins;
      edit(gone.slot, gone.field, key, value);
      edit(twin.slot, twin.field, twin.key, twin.value + gone.value);
      placement = { slot: gone.slot, how: "swapped", moved: { key: gone.key, value: gone.value, toSlot: twin.slot } };
    }
  }
  if (!placement) throw new Error(`No place for a ${key} roll on ${characterId}'s echoes`);

  const apply = (echo: Record<string, any>, perSlot: Map<number, [string, number]>): Record<string, any> => {
    const next = { ...echo };
    for (const [field, [type, amount]] of perSlot) {
      next[typeField(field)] = type;
      next[valueField(field)] = amount;
    }
    return next;
  };
  let nextEchoes = inventoryEchoes;
  const nextSlots: Record<string, any> = Array.isArray(slots) ? [...slots] : { ...slots };
  let slotsChanged = false;
  for (const [slot, perSlot] of edits) {
    if (fromInventory[slot]) {
      const echoId = resolved[slot].echoId;
      nextEchoes = nextEchoes.map((e) => (e?.echoId === echoId ? apply(e, perSlot) : e));
    } else {
      nextSlots[slot] = apply((slots as Record<string, any>)?.[slot] ?? {}, perSlot);
      slotsChanged = true;
    }
  }
  return {
    characters: slotsChanged ? { ...characters, [characterId]: { ...data, echoes: nextSlots } } : characters,
    inventoryEchoes: nextEchoes,
    placement,
  };
}

/** A copy of the character's data with every substat of one equipped echo blanked (main stat and set kept). */
export function withoutEchoSubstats(
  characterId: string,
  characters: Record<string, any>,
  inventoryEchoes: any[],
  slot: number,
): { characters: Record<string, any>; inventoryEchoes: any[] } {
  const data = characters?.[characterId] ?? {};
  const slots = data.echoes ?? {};
  const resolved = resolveCharacterEchoes(slots, inventoryEchoes);
  const echo = resolved[slot];
  const blank = (record: Record<string, any>): Record<string, any> => {
    const next = { ...record };
    for (const n of SUB_FIELDS) {
      next[typeField(n)] = null;
      next[valueField(n)] = null;
    }
    return next;
  };
  const echoId = (slots as Record<string, any>)?.[slot]?.echoId ?? null;
  if (echoId && echo?.echoId === echoId && inventoryEchoes.some((e) => e?.echoId === echoId)) {
    return { characters, inventoryEchoes: inventoryEchoes.map((e) => (e?.echoId === echoId ? blank(e) : e)) };
  }
  const nextSlots: Record<string, any> = Array.isArray(slots) ? [...slots] : { ...slots };
  nextSlots[slot] = blank((slots as Record<string, any>)?.[slot] ?? {});
  return { characters: { ...characters, [characterId]: { ...data, echoes: nextSlots } }, inventoryEchoes };
}

/** What a build scores: `avg` drives the weights; `extra` measures (a team's total, say) ride along. */
export interface BuildScore {
  avg: number;
  extra?: Record<string, number>;
}
// eslint-disable-next-line no-unused-vars -- the parameters of a function type
export type BuildScorer = (characters: Record<string, any>, inventoryEchoes: any[]) => Promise<BuildScore>;

export interface SubstatWeight {
  key: SubstatKey;
  label: string;
  short: string;
  flat: boolean;
  /** the expected roll (tiers weighted by how often they land) and what the build does with it */
  roll: number;
  avgDamage: number;
  /** relative gain of one expected roll, e.g. 0.021 for +2.1 % */
  gain: number;
  /** the same for the median tier (a real tier, half of all rolls land on it or lower) */
  medianRoll: number;
  medianAvgDamage: number;
  medianGain: number;
  /** the same for the best tier */
  maxRoll: number;
  maxAvgDamage: number;
  maxGain: number;
  /** the same for one tier step — what an existing line is worth going up one tier */
  step: number;
  stepAvgDamage: number;
  stepGain: number;
  /** gain per unit of the stat (per 1 % or per 1 flat point), from the expected roll */
  perPoint: number;
  /** gain relative to the best substat's: 1 = the one to look for, 0 = does nothing */
  weight: number;
  /** relative gain of the expected roll on each extra measure the scorer returned */
  extraGain: Record<string, number>;
  placement: SubstatPlacement;
}

export interface SubstatWeightsResult {
  characterId: string;
  baseline: number;
  baselineExtra: Record<string, number>;
  /** best first */
  weights: SubstatWeight[];
}

const rel = (base: number, value: number): number => (base > 0 ? value / base - 1 : 0);

/**
 * One more roll of every substat, scored on the build: the expected roll, the median tier, the best tier
 * and one tier step, each as the relative gain over the build as it is. Sorted by the expected gain, best
 * first; `weight` normalises it to the best substat's.
 */
export async function substatWeights(
  characterId: string,
  characters: Record<string, any>,
  inventoryEchoes: any[],
  score: BuildScorer,
  options: { keys?: readonly SubstatKey[]; baseline?: BuildScore } = {},
): Promise<SubstatWeightsResult> {
  const keys = options.keys ?? SUBSTAT_KEYS;
  const base = options.baseline ?? (await score(characters, inventoryEchoes));
  const weights: SubstatWeight[] = [];
  for (const key of keys) {
    const roll = expectedRoll(key);
    const expected = withSubstat(characterId, characters, inventoryEchoes, key, roll);
    const scored = await score(expected.characters, expected.inventoryEchoes);
    const scoreWith = async (value: number): Promise<number> => {
      const clone = withSubstat(characterId, characters, inventoryEchoes, key, value);
      return (await score(clone.characters, clone.inventoryEchoes)).avg;
    };
    const medianAvgDamage = await scoreWith(medianRoll(key));
    const maxAvgDamage = await scoreWith(maxRoll(key));
    const stepAvgDamage = await scoreWith(tierStep(key));
    const gain = rel(base.avg, scored.avg);
    const extraGain: Record<string, number> = {};
    for (const [name, value] of Object.entries(base.extra ?? {})) extraGain[name] = rel(value, scored.extra?.[name] ?? value);
    weights.push({
      key,
      label: SUBSTAT_LABELS[key],
      short: SUBSTAT_SHORT_LABELS[key],
      flat: isFlatSubstat(key),
      roll,
      avgDamage: scored.avg,
      gain,
      medianRoll: medianRoll(key),
      medianAvgDamage,
      medianGain: rel(base.avg, medianAvgDamage),
      maxRoll: maxRoll(key),
      maxAvgDamage,
      maxGain: rel(base.avg, maxAvgDamage),
      step: tierStep(key),
      stepAvgDamage,
      stepGain: rel(base.avg, stepAvgDamage),
      perPoint: roll > 0 ? gain / roll : 0,
      weight: 0,
      extraGain,
      placement: expected.placement,
    });
  }
  const top = Math.max(0, ...weights.map((w) => w.gain));
  for (const w of weights) w.weight = top > 0 ? Math.max(0, w.gain) / top : 0;
  weights.sort((a, b) => b.gain - a.gain || a.label.localeCompare(b.label));
  return { characterId, baseline: base.avg, baselineExtra: base.extra ?? {}, weights };
}

export interface EchoSubstatWorth {
  slot: number;
  echoId: string | null;
  echo: string | null;
  set: string | null;
  cost: number | null;
  main: string | null;
  substats: Array<{ key: string; value: number }>;
  /** the build's number with this echo's substats blanked */
  avgDamage: number;
  /** what the substats add over that, relative — the echo whose number is lowest is the one to re-roll first */
  worth: number;
}

/** What each equipped echo's substats are worth: the build scored with them blanked, one echo at a time. */
export async function equippedSubstatWorth(
  characterId: string,
  characters: Record<string, any>,
  inventoryEchoes: any[],
  score: BuildScorer,
  options: { baseline?: BuildScore } = {},
): Promise<EchoSubstatWorth[]> {
  const base = options.baseline ?? (await score(characters, inventoryEchoes));
  const data = characters?.[characterId] ?? {};
  const resolved = resolveCharacterEchoes(data.echoes ?? {}, inventoryEchoes);
  const out: EchoSubstatWorth[] = [];
  for (let slot = 0; slot < 5; slot++) {
    const echo = resolved[slot];
    if (!hasEcho(echo)) continue;
    const substats = substatLines(echo, slot).map((l) => ({ key: l.key, value: l.value }));
    const blanked = withoutEchoSubstats(characterId, characters, inventoryEchoes, slot);
    const scored = await score(blanked.characters, blanked.inventoryEchoes);
    out.push({
      slot,
      echoId: echo.echoId ?? null,
      echo: echo.echo ?? null,
      set: echo.echoSet ?? null,
      cost: echo.type != null ? Number(echo.type) : null,
      main: echo.stat ?? null,
      substats,
      avgDamage: scored.avg,
      worth: scored.avg > 0 ? base.avg / scored.avg - 1 : 0,
    });
  }
  return out;
}

/** The scorer of a character rotation: `calcCharacterRotationDamage` on the build, average damage. */
export function rotationScorer(characterId: string, rotation: CharacterRotationInput, enemy: TeamEnemyConfig): BuildScorer {
  return async (characters, inventoryEchoes) => {
    const result = await calcCharacterRotationDamage(rotation, null, characterId, characters, enemy, inventoryEchoes);
    return { avg: result.damageAggregation.avgDamage ?? 0 };
  };
}
