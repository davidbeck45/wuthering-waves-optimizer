// Wuthering Tools+: the player's own echo substats, in the shape Riley's engine takes for its
// "My build" substat spread (vendor/wuwa_calc plus branch: solver.ts setMySubstat + shared/substats.ts
// customSubstats). Pure: the character store's builds + the inventory in, one roll list per
// resonator out; the rankings controller registers them on the page and in its solver workers.
import { resolveCharacterEchoes } from "../../calculator/buildCharacterContext";
import { rileyNameOf } from "../matrix/planMatrix";

/** app substat keys -> wuwa_calc `Substat` names (Healing Bonus has no counterpart there) */
const KIND: Record<string, string> = {
  CritRate: "CritRate",
  CritDMG: "CritDmg",
  EnergyRegen: "Er",
  ATK: "AtkPct",
  ATK_FLAT: "FlatAtk",
  HP: "HpPct",
  HP_FLAT: "FlatHp",
  DEF: "DefPct",
  DEF_FLAT: "FlatDef",
  BasicAttackDMGBonus: "Basic",
  HeavyAttackDMGBonus: "Heavy",
  ResonanceSkillDMGBonus: "Skill",
  ResonanceLiberationDMGBonus: "Liberation",
};

export interface BuildRoll {
  kind: string;
  value: number;
}
export interface BuildRolls {
  /** Riley's resonator name */
  name: string;
  /** app character key */
  characterKey: string;
  /** tells one build from the next in the engine's row keys */
  key: string;
  rolls: BuildRoll[];
  /** how many of the five slots carried an echo with substats */
  echoes: number;
}

/** A short stable key for a roll list (djb2), so a changed build gets fresh rows. */
export function rollsKey(rolls: BuildRoll[]): string {
  let h = 5381;
  const text = rolls.map((r) => `${r.kind}:${r.value}`).join("|");
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** The substat rolls on the five echoes each character has equipped in the calculator. */
export function buildRollsOf(characters: Record<string, Record<string, unknown>>, inventoryEchoes: Array<Record<string, unknown>>): BuildRolls[] {
  const out: BuildRolls[] = [];
  for (const [characterKey, data] of Object.entries(characters ?? {})) {
    const resolved = resolveCharacterEchoes(data?.echoes as Record<string, unknown> | undefined, inventoryEchoes ?? []);
    const rolls: BuildRoll[] = [];
    let echoes = 0;
    for (const echo of resolved) {
      let any = false;
      for (let i = 1; i <= 5; i++) {
        const type = echo?.[`echoSubStatsType${i}`] as string | null | undefined;
        const value = Number(echo?.[`echoSubStatsValue${i}`]);
        if (!type || !Number.isFinite(value) || value <= 0) continue;
        const kind = KIND[type];
        if (!kind) continue;
        rolls.push({ kind, value });
        any = true;
      }
      if (any) echoes += 1;
    }
    if (!rolls.length) continue;
    out.push({ name: rileyNameOf(characterKey), characterKey, key: rollsKey(rolls), rolls, echoes });
  }
  return out;
}
