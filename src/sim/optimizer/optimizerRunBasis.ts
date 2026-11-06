// Wuthering Tools+ — what a calculator run's rows were scored on (hunt round 1, 2026-11-06).
//
// A run reads the build and the weapon in hand when it starts, and its rows live on after them: a run left going landed
// under the build picked meanwhile with Equip loadout on offer, and a finished run read +30.6 % on its first row, the
// echoes she already wears, after the weapon went R5 to R1: the row kept the old weapon's number and the percent column
// compared it to the new one. So the rows go when either changes, and the setup screen says why.
//
// Echoes are not part of it: Equip loadout changes them and the rows stay true, each still what that loadout scores. Nor
// are buff toggles, the enemy or the team, which the same row would also misstate: dropping a run for every toggle is a
// bigger call than this fix makes (hunt1-solver-fix.md).

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface OptimizerRunBasis {
  character: string;
  key: string;
}

/** The character's active build and weapon, as the record holds them (not what the weapon panel last reported: a
 *  panel reports in stages while it mounts, and a press may start the run between them). */
export function runBasisOf(character: string, record: Record<string, any> | null | undefined): OptimizerRunBasis {
  const weapon = record?.weapon ?? null;
  const held = weapon ? record?.weapons?.[weapon] : null;
  return { character, key: JSON.stringify([record?.activeBuildId ?? "", weapon, held?.weaponLevel ?? null, held?.refinement ?? null, record?.weaponPassives ?? null]) };
}

/** True when a run scored on `scoredOn` no longer matches the page. Another character is not this check's business:
 *  picking one stops the run and clears the rows on its own. */
export function runOutlived(scoredOn: OptimizerRunBasis | null, now: OptimizerRunBasis): boolean {
  return scoredOn !== null && scoredOn.character === now.character && scoredOn.key !== now.key;
}
