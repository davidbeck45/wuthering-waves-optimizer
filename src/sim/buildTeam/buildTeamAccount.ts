// Wuthering Tools+ — "Build it for me": the account wuwa_calc is asked at.
//
// A saved team runs the builds it pins (resolveTeam.ts), and since 2026-11-09 /energy, /rotation, /endgame and `cli er`
// ask wuwa_calc at that team's own account (`rileyAccountForTeam`). Build my team still asked at every character's
// ACTIVE build: on a team whose pins run 353,983 DPS its Plan step read "wuwa_calc · your echoes · 367,567 DPS", the
// figure of builds the team does not wear, and the plan's sets, main stats and Energy Regen needs were worked out on
// those builds too (2026-11-16, second check of 8802ecc0). The review's "wuwa_calc DPS … → …" laid the ticked new builds
// over the active ones as well, so a member whose box is not ticked was counted on a build the team would not run after
// the Save.
//
// One rule, here: a saved team is asked at the builds it runs, a new build in place of a slot's own where there is one;
// a composition nobody saved keeps every member's active build, as on the other wuwa_calc pages. Pure; no Vue.
import { applyBuildFields } from "../../characters/buildFields";
import { rileyAccountForTeam, rileyAccountOf } from "../engine/rileyAccount";
import type { RileyAccount } from "../engine/rileyRun";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A new build a run made for one slot (`MemberResult.draft`), worn for the figure "after". */
export interface DraftOnSlot {
  slot: number;
  characterId: string;
  draft: Record<string, any>;
}

export interface BuildTeamAccountOptions {
  /** team buffs from the team's real members (the Team Rotations switch): with it on a build named after both
   *  teammates counts as the slot's build, as on Teams */
  auto?: boolean;
  /** the new builds to wear: the review's ticked ones. The other members stay on the build the team runs */
  drafts?: ReadonlyArray<DraftOnSlot>;
}

/** The id a draft is pinned under while a figure is worked out (never stored). */
const draftId = (slot: number): string => `__buildTeam_${slot}`;

export function buildTeamAccount(
  team: { id?: string | null; characterIds: Array<string | null>; buildIds?: Array<string | null> | null } | null | undefined,
  characters: Record<string, Record<string, any>>,
  inventory: { echoes?: unknown[]; equipped?: Record<string, unknown> } = {},
  teams: Array<Record<string, any>> = [],
  options: BuildTeamAccountOptions = {},
): RileyAccount {
  const drafts = options.drafts ?? [];
  if (!team?.id) {
    // nobody saved these three: the active builds, a new build laid over its member's
    if (!drafts.length) return rileyAccountOf(characters ?? {}, inventory, teams);
    const worn: Record<string, Record<string, any>> = { ...(characters ?? {}) };
    for (const d of drafts) worn[d.characterId] = applyBuildFields(worn[d.characterId] ?? {}, d.draft);
    return rileyAccountOf(worn, inventory, teams);
  }
  // a saved team: its pins, and a new build pinned in its slot's place — what the Save writes (apply.ts)
  const worn: Record<string, Record<string, any>> = { ...(characters ?? {}) };
  const pins: Array<string | null> = team.characterIds.map((_, slot) => team.buildIds?.[slot] ?? null);
  for (const d of drafts) {
    const data = worn[d.characterId] ?? {};
    worn[d.characterId] = { ...data, builds: [...(Array.isArray(data.builds) ? data.builds : []), { id: draftId(d.slot), name: "draft", ...d.draft }] };
    pins[d.slot] = draftId(d.slot);
  }
  return rileyAccountForTeam({ characterIds: team.characterIds, buildIds: pins }, worn, inventory, teams, { auto: options.auto ?? true });
}
