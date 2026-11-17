// Wuthering Tools+ — which build Optimize team's Edit drawer addresses for one slot.
//
// `optimizerSettingsScope.ts` makes the drawer read and write a stored build once it is told which one. Its host
// (`TeamOptimizerSetup.vue`) told it the team's PIN and nothing else. The Team page, and so the search, read a slot
// through `resolveTeam.ts`: a pin, else, with team buffs on, a saved build named after both teammates ("Moonlit (Lupa +
// Galbrena)", "Built for Mornye + Lynae" once its pin is gone), else the active build. For a build found by name the
// drawer said 'saved on Sigrika's build "Default build", the one this team uses', wrote the calculator's settings for
// her, and the run read 7,332,626 with Sound of True Name switched on and off alike: the 2026-11-09 finding again, for
// the second way a team picks a build (2026-11-16, second check of ad5aa25b).
//
// One rule for both: the build `resolveTeamBuilds` gives the slot. Kept apart from `optimizerSettingsScope.ts`, which the
// calculator's buff rows import: this one pulls in the team resolver, and only the team page needs it.
import { resolveTeamBuilds } from "./resolveTeam";
import type { OptimizerSettingsScope } from "./optimizerSettingsScope";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The scope of the drawer opened on `member`: the build the Team page reads for that slot. `auto` is the team-buffs
 * switch (`autoTeamBuffs.value`): the by-name rule goes with it, as on Teams. `buildId` is null where the slot runs the
 * active build, so the drawer edits the live record, as the calculator does.
 */
export function drawerScopeOf(
  team: { characterIds?: Array<string | null> | null; buildIds?: Array<string | null> | null } | null | undefined,
  characters: Record<string, any> | null | undefined,
  member: { slot: number; characterId: string },
  auto: boolean,
): OptimizerSettingsScope {
  const built = resolveTeamBuilds({ characterIds: team?.characterIds ?? [], buildIds: team?.buildIds ?? [] }, characters ?? {}, { auto });
  const slot = built.slots.find((s) => s.slot === member.slot && s.characterId === member.characterId);
  return { characterId: member.characterId, buildId: slot?.buildId ?? null };
}
