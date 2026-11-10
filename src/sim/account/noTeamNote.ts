// Wuthering Tools+: why a character has no team figure. A team figure needs a team ROTATION in the app (a saved team
// with actions, a curated team or one of wuwa_calc's team presets) whose three members are all set up. The pages said
// "not in a team you can field" whenever none was found — also for a character the account fields in three teams but
// the app has no team rotation for (Danjin: his own rotations come from wuwa_calc teams the 149 team presets don't
// carry; 2026-11-09 hunt 2, item 7). That is a fact about the app, not about the account, so it is said as one.
import { teamRotationPresets } from "../../teamRotations/presets";
import { characterShortName } from "../display/names";
import { loadWuwaCalcTeamPresets } from "../presets";
import { rileyNameOf } from "../rankings/rileyNames";

/** The app has team rotations with the character, and each needs a member the account has not set up. */
export const NO_FIELDABLE_TEAM = "not in a team you can field";

/** The app has no team rotation with the character at all: nothing the account could do short of saving one. */
export const noTeamRotationNote = (characterId: string): string =>
  `the app has no team rotation with ${characterShortName(characterId) || characterId} (save one on Teams to get a team figure)`;

/** both Rover genders are one kit: a team rotation written for one stands for the other */
const sameCharacter = (a: string | null | undefined, b: string): boolean => !!a && (a === b || rileyNameOf(a) === rileyNameOf(b));

interface TeamRotationLike {
  characterIds?: Array<string | null> | null;
  actions?: unknown[] | null;
}

/** Whether any team rotation the app knows lists the character, whoever else is in it: the player's saved teams with
 *  actions, the curated teams, wuwa_calc's team presets. */
export async function hasTeamRotation(characterId: string, teams: ReadonlyArray<TeamRotationLike> | null | undefined): Promise<boolean> {
  const lists = (ids: Array<string | null> | null | undefined): boolean => (ids ?? []).some((id) => sameCharacter(id, characterId));
  if ((teams ?? []).some((t) => (t?.actions?.length ?? 0) > 0 && lists(t.characterIds))) return true;
  const stock = [...teamRotationPresets, ...(await loadWuwaCalcTeamPresets())];
  return stock.some((p) => ((p.data?.actions ?? []) as unknown[]).length > 0 && lists(p.data?.characterIds as Array<string | null>));
}

/** The sentence for a character with no team to score them in ("no team figure: …"): which of the two it is. */
export async function noTeamNote(characterId: string, teams: ReadonlyArray<TeamRotationLike> | null | undefined): Promise<string> {
  return (await hasTeamRotation(characterId, teams)) ? NO_FIELDABLE_TEAM : noTeamRotationNote(characterId);
}
