// @vitest-environment node
// Wuthering Tools+ Build my team: the account wuwa_calc is asked at. A saved team runs the builds it pins, and /energy,
// /rotation and `cli er` have asked at those since 2026-11-09. Build my team asked at the active builds: for a team whose
// pins run 353,983 DPS its Plan read 367,567 (2026-11-16, second check of 8802ecc0). A synthetic account.
import { describe, expect, it } from "vitest";
import fixture from "../ai/__fixtures__/aiAccount.json";
import { parseExport } from "../cli/exportShape";
import { rileyAccountForTeam, rileyAccountOf } from "../engine/rileyAccount";
import { rileyNameOf } from "../rankings/castMapper";
import { buildTeamAccount } from "./buildTeamAccount";

/* eslint-disable @typescript-eslint/no-explicit-any */

const exp = parseExport(fixture, "aiAccount.json");
const team = exp.teams[0]!;
const [dps, support] = team.characterIds as string[];

const weaponOf = (id: string): string => exp.characters[id].weapon;
const rankOf = (id: string): number => Number(exp.characters[id].weapons?.[weaponOf(id)]?.refinement ?? 1);
const otherRank = (id: string): number => (rankOf(id) > 3 ? rankOf(id) - 2 : rankOf(id) + 2);
/** the live build's fields with the weapon at another refinement: a build that reads differently in wuwa_calc */
function fieldsAt(id: string, rank: number): Record<string, any> {
  const { builds: _b, activeBuildId: _a, ...rest } = exp.characters[id];
  const fields = JSON.parse(JSON.stringify(rest));
  return { ...fields, weapons: { ...fields.weapons, [weaponOf(id)]: { ...fields.weapons?.[weaponOf(id)], refinement: String(rank) } } };
}
/** the account with a second build, "Account plan", for the main DPS: the team below pins it, the active one stays */
function withPlan(): Record<string, any> {
  const data = exp.characters[dps];
  return { ...exp.characters, [dps]: { ...data, activeBuildId: data.activeBuildId ?? "live", builds: [...(data.builds ?? []), { ...fieldsAt(dps, otherRank(dps)), id: "plan", name: "Account plan" }] } };
}
const pinned = { ...team, buildIds: ["plan", null, null] };
const refine = (account: { entries: Record<string, { refine: number }> }, id: string): number => account.entries[rileyNameOf(id)]!.refine;

describe("the account Build my team asks wuwa_calc at", () => {
  it("a saved team is asked at the builds it pins: the account /energy and /rotation ask at, not the active builds'", () => {
    const characters = withPlan();
    const account = buildTeamAccount(pinned, characters, exp.inventory, [pinned]);
    expect(refine(account, dps)).toBe(otherRank(dps));
    expect(account).toEqual(rileyAccountForTeam(pinned, characters, exp.inventory, [pinned]));
    // what it read before: every character's active build
    const active = rileyAccountOf(characters, exp.inventory, [pinned]);
    expect(refine(active, dps)).toBe(rankOf(dps));
    expect(account.key).not.toBe(active.key);
  });

  it("a team that pins nothing, and three nobody saved, keep the active builds", () => {
    const characters = withPlan();
    const active = rileyAccountOf(characters, exp.inventory, [team]);
    expect(buildTeamAccount(team, characters, exp.inventory, [team])).toEqual(active);
    // not a saved team: its pins, had it any, are not read
    expect(buildTeamAccount({ id: null, characterIds: team.characterIds, buildIds: ["plan", null, null] }, characters, exp.inventory, [team])).toEqual(active);
    expect(buildTeamAccount(null, characters, exp.inventory, [team])).toEqual(active);
  });

  it("after a Save: a ticked member wears the new build, and one that is not ticked stays on the build the team pins", () => {
    const characters = withPlan();
    const draft = fieldsAt(support!, otherRank(support!));
    const after = buildTeamAccount(pinned, characters, exp.inventory, [pinned], { drafts: [{ slot: 1, characterId: support!, draft }] });
    expect(refine(after, support!)).toBe(otherRank(support!));
    // the main DPS has no new build: the team keeps running "Account plan", so the figure after counts that build.
    // It was counted on the active one, a build the team does not wear before the Save or after it
    expect(refine(after, dps)).toBe(otherRank(dps));
    // a new build for the pinned slot takes the pin's place
    const both = buildTeamAccount(pinned, characters, exp.inventory, [pinned], { drafts: [{ slot: 0, characterId: dps!, draft: fieldsAt(dps!, rankOf(dps!)) }] });
    expect(refine(both, dps)).toBe(rankOf(dps));
    // nothing is written to the account it was read from
    expect(characters[dps].builds.map((b: any) => b.id)).not.toContain("__buildTeam_0");
    expect(characters[support!].builds ?? []).toEqual(exp.characters[support!].builds ?? []);
  });

  it("three nobody saved: a new build is laid over its member's active one", () => {
    const loose = { id: null, characterIds: team.characterIds };
    const after = buildTeamAccount(loose, exp.characters, exp.inventory, [], { drafts: [{ slot: 1, characterId: support!, draft: fieldsAt(support!, otherRank(support!)) }] });
    expect(refine(after, support!)).toBe(otherRank(support!));
    expect(refine(after, dps)).toBe(rankOf(dps));
  });
});
