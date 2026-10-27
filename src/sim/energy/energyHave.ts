// Wuthering Tools+ — the "have" side of the energy check: the Energy Regen a build shows on the character screen, in %.
// Riley's ER need (`bar`) is a CONSTANT ER — the conditional ER buffs of the fight are already inside it — so the
// build is read the way upstream's build card reads it (issue #383, `alwaysEnabledOnly`): base, weapon, echoes,
// echo sets, the always-on weapon passives and main-echo buffs, Stat Bonus nodes and permanent sequence nodes, and
// never a toggled conditional, team or custom buff (Shorekeeper's "within a Stellarealm" +10 % stays out — his run
// grants it in the fight). The one gap between the two engines' notion of "constant": an inherent skill whose ER
// bonus has no condition is a toggle in the app but part of the kit's constant stats in wuwa_calc
// (`KIT_CONSTANT_ER`, gated by energy.test.ts against his engine). Main thread / Node: it runs the calculator.
import { buildCharacterCalculationContext, resolveCharacterEchoes, type TeamEnemyConfig } from "../../calculator/buildCharacterContext";
import { erPercent } from "./energyNeed";

/** Constant ER (%) a kit carries in wuwa_calc beyond the base 100 % that the app's build card does not count:
 *  `menuStats([resonator, talent, inherent1, inherent2])` − 100, by app key. Mornye's "Inherent Skill: Blueprint"
 *  (+10 %, no condition) is a toggle in the app. Spectro Rover's +20 % is a sequence node the app marks permanent,
 *  so it is counted on both sides already. energy.test.ts recomputes this table from the engine. */
export const KIT_CONSTANT_ER: Readonly<Record<string, number>> = { Mornye: 10 };

/** The build card's enemy (stats don't depend on it). */
const MENU_ENEMY: TeamEnemyConfig = { enemyLevel: 90, enemyResist: 0.1, enemyType: "Calamity" };


/** The character screen's ER of `characterId`'s build in `characters` (its active build — pass a record with the
 *  team's build baked in for a team slot), in %. Null when the character is not in the data or has no weapon. */
export async function menuEnergyRegen(characterId: string, characters: Record<string, any>, inventoryEchoes: any[]): Promise<number | null> {
  const data = characters?.[characterId];
  if (!data?.weapon) return null;
  const built = await buildCharacterCalculationContext(characterId, characters, MENU_ENEMY, inventoryEchoes ?? [], { alwaysEnabledOnly: true });
  const er = Number(built?.finalStats?.energyRegen);
  if (!Number.isFinite(er)) return null;
  return Math.round((erPercent(er) + (KIT_CONSTANT_ER[characterId] ?? 0)) * 1e4) / 1e4;
}

const SUB_LINES = [1, 2, 3, 4, 5] as const;

/** Everything about a build that can move its menu ER, and nothing else: the weapon and its rank, the sequence
 *  toggles, and per echo slot the record with every non-ER substat line blanked — so a clone that only adds a Crit
 *  Rate roll (substat weights, a benchmark spread) shares the original's ER and is never re-built. */
export function erSignature(characterId: string, characters: Record<string, any>, inventoryEchoes: any[]): string {
  const data = characters?.[characterId] ?? {};
  const slots = resolveCharacterEchoes(data.echoes ?? {}, inventoryEchoes ?? []);
  const echoes = slots.map((e: any) => {
    if (!e || typeof e !== "object") return null;
    const next: Record<string, unknown> = { ...e };
    delete next.echoId;
    for (const n of SUB_LINES) {
      if (next[`echoSubStatsType${n}`] !== "EnergyRegen") {
        next[`echoSubStatsType${n}`] = null;
        next[`echoSubStatsValue${n}`] = null;
      }
    }
    return next;
  });
  return JSON.stringify([data.weapon ?? null, data.weapons?.[data.weapon] ?? null, data.weaponPassives ?? null, data.weaponLevel ?? null, data.resonanceChains ?? null, data.buffs ?? null, echoes]);
}

// eslint-disable-next-line no-unused-vars -- the parameters of a function type
export type HaveOf = (characters: Record<string, any>, inventoryEchoes: any[]) => Promise<number | null>;

/** `menuEnergyRegen` for one character, memoised on `erSignature`: what a scorer over many clones of one build calls. */
export function memoMenuEr(characterId: string): HaveOf {
  const memo = new Map<string, Promise<number | null>>();
  return (characters, inventoryEchoes) => {
    const sig = erSignature(characterId, characters, inventoryEchoes);
    let hit = memo.get(sig);
    if (!hit) {
      hit = menuEnergyRegen(characterId, characters, inventoryEchoes);
      memo.set(sig, hit);
      hit.catch(() => memo.delete(sig));
    }
    return hit;
  };
}
