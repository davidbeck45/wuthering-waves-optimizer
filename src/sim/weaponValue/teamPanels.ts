// Wuthering Tools+ — /weapons' team figures when a teammate's team-buff panel is set by hand.
//
// resolveTeam (src/sim/teamContext/resolveTeam.ts) keeps a member's own Team Buffs panel verbatim when it already names
// the team's other two members: the player curated it. That is right for the team as it is, but a what-if that hands a
// support a new weapon would then never reach the carry — on David's account Sigrika's panel names Shorekeeper +
// Qiuyuan, so Shorekeeper's Stellar Symphony read +0.2 % team (her own healing) while Qiuyuan, whose buffs are derived,
// got the +14 % ATK. A player who equips the weapon also ticks its buff, so for the hypothetical only, a kept panel
// follows the provider's weapon the way they would set it:
//   - a swap: the old weapon's team buffs off, the new weapon's on — each entry exactly as resolveTeam derives it for
//     that member (stacks, refinement, an Outro handoff that goes to someone else leaves it out), read from one
//     resolve with that member's panel picks cleared;
//   - a refinement step of the held weapon: the refinement written onto the entries the panel already has.
// Everything else on the panel stays as the player set it, and the team as it is (the base) is never touched, so the
// gain is the weapon alone. /account's investment plan still keeps panels verbatim (its help says so).
import { allWeaponTeamBuffs } from "../../buffs/index";
import type { TeamEnemyConfig } from "../../calculator/buildCharacterContext";
import { resolveTeamCharacters } from "../teamContext/resolveTeam";

interface TeamLike {
  characterIds: Array<string | null>;
  [k: string]: unknown;
}

// resolveTeam's own matching (a weapon team buff belongs to the weapon named by its image file, else its name)
const compact = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const basename = (url: string | undefined): string | null => {
  if (!url) return null;
  const file = url.split("/").pop() ?? "";
  return file.replace(/\.[a-z0-9]+$/i, "") || null;
};

/** The team-buff keys a weapon brings its wielder's teammates (src/buffs `allWeaponTeamBuffs`), [] for none. */
export function weaponTeamBuffKeys(weaponKey: string | null | undefined): string[] {
  if (!weaponKey) return [];
  return (allWeaponTeamBuffs as Array<{ key: string; name?: string; imageUrl?: string }>)
    .filter((def) => {
      const key = basename(def.imageUrl) ?? compact(def.name ?? "");
      return key === weaponKey || compact(key) === compact(weaponKey);
    })
    .map((def) => def.key);
}

const sameSet = (a: string[], b: string[]): boolean => a.length === b.length && a.every((x) => b.includes(x));

/** The members whose own panel names exactly the team's other members — the ones resolveTeam keeps verbatim. */
export function keptPanelMembers(team: TeamLike, characters: Record<string, any>): string[] {
  const present = (team.characterIds ?? []).filter((id): id is string => Boolean(id));
  return present.filter((id) => {
    const panel = characters[id]?.teamBuffs ?? {};
    const picks = [panel.selectedCharacter1, panel.selectedCharacter2].filter((x: unknown): x is string => typeof x === "string" && !!x);
    const mates = present.filter((m) => m !== id);
    return mates.length > 0 && sameSet(picks, mates);
  });
}

export interface PanelFollow {
  characters: Record<string, any>;
  /** members whose kept panel was changed, with the buff keys turned on / off */
  adjusted: Array<{ member: string; on: string[]; off: string[] }>;
}

/**
 * `hypo` (the characters with `providerId` re-armed) with every kept teammate panel following the provider's weapon
 * change from `before` (see the header). No kept panel, or a weapon change that touches no team buff: `hypo` as is.
 */
export async function panelsFollowWeapon(
  team: TeamLike,
  before: Record<string, any>,
  hypo: Record<string, any>,
  providerId: string,
  inventoryEchoes: any[],
  enemy: TeamEnemyConfig,
): Promise<PanelFollow> {
  const oldWeapon: string | null = before[providerId]?.weapon ?? null;
  const newWeapon: string | null = hypo[providerId]?.weapon ?? null;
  const kept = keptPanelMembers(team, hypo).filter((m) => m !== providerId);
  const oldKeys = weaponTeamBuffKeys(oldWeapon);
  const newKeys = weaponTeamBuffKeys(newWeapon);
  if (!kept.length || (!oldKeys.length && !newKeys.length)) return { characters: hypo, adjusted: [] };

  const out: Record<string, any> = { ...hypo };
  const adjusted: PanelFollow["adjusted"] = [];

  if (oldWeapon === newWeapon) {
    // a refinement step: the entries the panel has take the new refinement
    const refinement = hypo[providerId]?.weapons?.[newWeapon ?? ""]?.refinement;
    for (const m of kept) {
      const panel = hypo[m]?.teamBuffs ?? {};
      const buffs: Record<string, any> = { ...(panel.buffs ?? {}) };
      const on = newKeys.filter((k) => buffs[k]?.isEnabled);
      if (!on.length || refinement == null) continue;
      for (const k of on) buffs[k] = { ...buffs[k], refinement };
      out[m] = { ...hypo[m], teamBuffs: { ...panel, buffs } };
      adjusted.push({ member: m, on, off: [] });
    }
    return { characters: out, adjusted };
  }

  // a swap: what resolveTeam would derive for each kept member, from one resolve with their picks cleared
  const freed: Record<string, any> = { ...hypo };
  for (const m of kept) freed[m] = { ...hypo[m], teamBuffs: { ...(hypo[m]?.teamBuffs ?? {}), selectedCharacter1: null, selectedCharacter2: null } };
  const derived = newKeys.length ? await resolveTeamCharacters(team as never, freed, inventoryEchoes, { auto: true, enemyConfig: enemy }) : null;
  for (const m of kept) {
    const panel = hypo[m]?.teamBuffs ?? {};
    const buffs: Record<string, any> = { ...(panel.buffs ?? {}) };
    const off = oldKeys.filter((k) => !newKeys.includes(k) && buffs[k]?.isEnabled);
    for (const k of off) buffs[k] = { ...buffs[k], isEnabled: false };
    const on: string[] = [];
    for (const k of newKeys) {
      const entry = derived?.characters[m]?.teamBuffs?.buffs?.[k];
      if (entry?.isEnabled) {
        buffs[k] = { ...entry };
        on.push(k);
      }
    }
    if (!on.length && !off.length) continue;
    out[m] = { ...hypo[m], teamBuffs: { ...panel, buffs } };
    adjusted.push({ member: m, on, off });
  }
  return { characters: out, adjusted };
}
