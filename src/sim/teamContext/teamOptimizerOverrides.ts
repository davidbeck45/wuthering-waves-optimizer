// Wuthering Tools+ — the one thing Ryan's Optimize team search is known not to read (hunt 2, solver L1): an action that
// switches a weapon effect for that action alone (the Team page's per-action buffs, `advancedConfig.weaponPassives`).
// His scorer works the switch into the stats (`scoreOptimizerRotation`: `weaponPassiveData: variant.weaponPassiveStats`)
// but hands the attack the build's own weapon data, so an effect read per attack (a DMG Amplification for one damage
// type, a DEF ignore for one skill) stays as the build has it. The search then ranks on a score the Team page does not
// calculate, and his page asks the player to report the team in the Discord.
//
// The rows shown are the Team page's figures either way. What changes here is the message: when the Team page
// calculates exactly the search's score once those switches are taken out, the gap is this and nothing else, and the page
// says so in plus's words. Any other mismatch keeps his alert, word for word.
import { verifyTeamCombination } from "../../calculator/teamOptimizer";

type VerifyInput = Parameters<typeof verifyTeamCombination>[0];

export interface OverrideGap {
  /** the members with such an action, in slot order */
  characterIds: string[];
}

const switchesWeapon = (action: any): boolean => !action?.isDisabled && Object.keys(action?.advancedConfig?.weaponPassives ?? {}).length > 0;

/** The members with an action that switches a weapon effect for that action alone. */
export function weaponOverrideMembers(team: { characterIds: Array<string | null>; actions?: any[] }): string[] {
  const slots = new Set((team.actions ?? []).filter(switchesWeapon).map((action) => Number(action.slot)));
  return team.characterIds.filter((id, slot): id is string => !!id && slots.has(slot));
}

/** The team with those switches taken out of its actions. Every other per-action switch stays; the team is not changed. */
export function withoutWeaponOverrides<T extends { actions?: any[] }>(team: T): T {
  return {
    ...team,
    actions: (team.actions ?? []).map((action) => {
      if (!switchesWeapon(action)) return action;
      const { weaponPassives: _dropped, ...rest } = action.advancedConfig;
      void _dropped;
      return { ...action, advancedConfig: rest };
    }),
  };
}

/** For a row the Team page reads differently from the search: the gap when per-action weapon switches are all of it
 *  (the Team page's calculation without them is the search's score), else null. One more team calculation, made only
 *  for a mismatch on a team that has such a switch. */
export async function weaponOverrideGap(input: VerifyInput): Promise<OverrideGap | null> {
  const characterIds = weaponOverrideMembers(input.team);
  if (!characterIds.length) return null;
  const without = await verifyTeamCombination({ ...input, team: withoutWeaponOverrides(input.team), resolveForTeamPage: undefined });
  return without.matches ? { characterIds } : null;
}
