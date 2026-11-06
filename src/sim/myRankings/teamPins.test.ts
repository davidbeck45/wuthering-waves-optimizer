// Wuthering Tools+: a saved team's pins. Build my team and Whole account pin their new builds in the saved team and,
// unless the player also makes them active, that pin is the only thing that says which build the team runs. /account,
// /my-rankings, `cli rank`, Whole account's Teams step and the team figures of Farm next and Set lab all score a team
// through teamCandidatesOf, so a candidate must carry the pins (hunt 1, numbers H1: /account read 9.46M, the plan 9.34M).
import { describe, expect, it } from "vitest";
import fixture from "../ai/__fixtures__/aiAccount.json";
import { parseExport } from "../cli/exportShape";
import { teamTotalOf } from "../buildTeam/buildTeam";
import { accountTeamChoices } from "../buildTeam/account/accountTeams";
import { createTeamScorer } from "../account/investPlan";
import { RANKING_ENEMY, rankRoster, scoreTeamCandidate, teamCandidatesOf } from "./rankRoster";

/* eslint-disable @typescript-eslint/no-explicit-any */

const exp = parseExport(fixture, "aiAccount.json");
const team = exp.teams[0]!;
const echoes: any[] = exp.inventory.echoes;
const dps = team.characterIds[0] as string;

/** The account with a second build for `id` that differs in the weapon's refinement (so its damage differs). */
function withBuild(id: string, buildId: string, name: string, characters: Record<string, any> = exp.characters, step = 4): Record<string, any> {
  const data = characters[id];
  const weapon = data.weapon;
  const now = Number(data.weapons?.[weapon]?.refinement ?? 1);
  const refinement = String(now > 3 ? now - step : now + step);
  const { builds: _b, activeBuildId: _a, ...rest } = data;
  const fields = JSON.parse(JSON.stringify(rest));
  const build = { ...fields, id: buildId, name, weapons: { ...fields.weapons, [weapon]: { ...fields.weapons?.[weapon], refinement } } };
  return { ...characters, [id]: { ...data, activeBuildId: data.activeBuildId ?? "live", builds: [...(data.builds ?? []), build] } };
}

const pinnedTeam = (buildIds: Array<string | null>): any => ({ ...team, buildIds });
const specOf = (t: any): any => ({ id: t.id, name: t.name, characterIds: t.characterIds, buildIds: t.buildIds, actions: t.actions, duration: t.duration, handoffs: t.handoffs ?? null, enemyConfig: null });

describe("a saved team's pins", () => {
  it("the ranking scores the build the team is pinned to, the same figure Build my team reads", async () => {
    const characters = withBuild(dps, "plan", "Account plan");
    const unpinned = await rankRoster(characters, echoes, [team], { investment: false, yieldToUi: false });
    const saved = pinnedTeam(["plan", null, null]);
    const pinned = await rankRoster(characters, echoes, [saved], { investment: false, yieldToUi: false });
    const rank = pinned.teams.find((t) => t.id === team.id)!;
    expect(rank.avgDamage).not.toBeCloseTo(unpinned.teams.find((t) => t.id === team.id)!.avgDamage, 0);
    const reads = await teamTotalOf(specOf(saved), characters, echoes, RANKING_ENEMY, true);
    expect(rank.avgDamage).toBeCloseTo(reads.avg, 3);
    expect(rank.perSlot[0]).toBeCloseTo(reads.perSlot[0]!, 3);
  }, 60_000);

  it("a pin beats the name rule, so a build named after the teammates can't take the slot back", async () => {
    const named = withBuild(dps, "old", `Moonlit ${dps} (${team.characterIds[1]} ${team.characterIds[2]})`, exp.characters, 2);
    const characters = withBuild(dps, "plan", "Account plan", named);
    const saved = pinnedTeam(["plan", null, null]);
    const { candidates } = await teamCandidatesOf(characters, [saved]);
    const c = candidates.find((x) => x.id === team.id)!;
    const rank = await scoreTeamCandidate(c, characters, echoes);
    const reads = await teamTotalOf(specOf(saved), characters, echoes, RANKING_ENEMY, true);
    expect(rank.avgDamage).toBeCloseTo(reads.avg, 3);
    const byName = await scoreTeamCandidate({ ...c, team: { ...c.team, buildIds: undefined } }, characters, echoes);
    expect(rank.avgDamage).not.toBeCloseTo(byName.avgDamage, 0); // no pin: the build named after the teammates
  }, 60_000);

  it("with team buffs off the pin still counts: the stored panels, the pinned build", async () => {
    const characters = withBuild(dps, "plan", "Account plan");
    const saved = pinnedTeam(["plan", null, null]);
    const { candidates } = await teamCandidatesOf(characters, [saved]);
    const c = candidates.find((x) => x.id === team.id)!;
    const rank = await scoreTeamCandidate(c, characters, echoes, { autoTeamBuffs: false, enemy: RANKING_ENEMY });
    const reads = await teamTotalOf(specOf(saved), characters, echoes, RANKING_ENEMY, false);
    expect(rank.avgDamage).toBeCloseTo(reads.avg, 3);
    const plain = await scoreTeamCandidate({ ...c, team: { ...c.team, buildIds: undefined } }, characters, echoes, { autoTeamBuffs: false, enemy: RANKING_ENEMY });
    expect(rank.avgDamage).not.toBeCloseTo(plain.avgDamage, 0);
  }, 60_000);

  it("Whole account's Teams step offers the saved team at the figure the plan starts from", async () => {
    const characters = withBuild(dps, "plan", "Account plan");
    const saved = pinnedTeam(["plan", null, null]);
    const choices = await accountTeamChoices(characters, echoes, [saved], { yieldToUi: false });
    const choice = choices.find((c) => c.id === team.id)!;
    const reads = await teamTotalOf(choice.spec, characters, echoes, RANKING_ENEMY, true);
    expect(choice.avgDamage).toBeCloseTo(reads.avg, 3);
  }, 60_000);

  it("/account's team figures know the slot runs a pinned build: an edit to the active record can't reach it, so they say so", async () => {
    const characters = withBuild(dps, "plan", "Account plan");
    const saved = pinnedTeam(["plan", null, null]);
    const ranking = await rankRoster(characters, echoes, [saved], { investment: false, yieldToUi: false });
    const ranks = ranking.teams.filter((t) => t.id === team.id); // the saved team, not a stock team of the same three
    const scorer = await createTeamScorer(characters, echoes, [saved], ranks, { autoTeamBuffs: true, enemy: RANKING_ENEMY });
    const ctx = (await scorer.teamFor(dps))!;
    expect(ctx.candidate.team.buildIds).toEqual(["plan", null, null]);
    expect(await scorer.buildBlock(ctx, dps)).toMatch(/"Account plan" build/);
    // pinned to the build that is active: the record is that build, so an edit reaches the team and no note is needed
    const active = { ...characters, [dps]: { ...characters[dps], activeBuildId: "plan" } };
    const onActive = await createTeamScorer(active, echoes, [saved], ranks, { autoTeamBuffs: true, enemy: RANKING_ENEMY });
    const ctx2 = (await onActive.teamFor(dps))!;
    expect(await onActive.buildBlock(ctx2, dps)).toBeNull();
  }, 60_000);
});
