// @vitest-environment node
// Wuthering Tools+: a saved team's pins on the wuwa_calc side. Teams, /account and /my-rankings score a saved team on
// the builds it pins (teamPins.test.ts). /energy, /endgame, /rotation and `cli er` asked wuwa_calc at the account's
// ACTIVE builds instead, so a plan saved without "Also make active" read the old builds' DPS (367,567 for a team that
// runs 362,854) beside the pinned builds' Energy Regen (2026-11-09 hunt 2, item 2). A synthetic account; the real engine.
import { describe, expect, it } from "vitest";
import fixture from "../ai/__fixtures__/aiAccount.json";
import { parseExport } from "../cli/exportShape";
import { energyReport } from "../energy/energyCli";
import { teamHaves } from "../energy/energyCheck";
import { rileyNameOf } from "../rankings/castMapper";
import { resolveTeamBuilds } from "../teamContext/resolveTeam";
import { rileyAccountForTeam, rileyAccountOf, savedTeamOf } from "./rileyAccount";

/* eslint-disable @typescript-eslint/no-explicit-any */

const exp = parseExport(fixture, "aiAccount.json");
const team = exp.teams[0]!;
const dps = team.characterIds[0] as string;
const weapon: string = exp.characters[dps].weapon;
const liveRank = Number(exp.characters[dps].weapons?.[weapon]?.refinement ?? 1);
const planRank = liveRank > 3 ? liveRank - 4 : liveRank + 4;

/** `characters` with a second build for the main DPS, "Account plan", whose weapon sits at another refinement. */
function withPlan(characters: Record<string, any> = exp.characters): Record<string, any> {
  const data = characters[dps];
  const { builds: _b, activeBuildId: _a, ...rest } = data;
  const fields = JSON.parse(JSON.stringify(rest));
  const plan = { ...fields, id: "plan", name: "Account plan", weapons: { ...fields.weapons, [weapon]: { ...fields.weapons?.[weapon], refinement: String(planRank) } } };
  return { ...characters, [dps]: { ...data, activeBuildId: data.activeBuildId ?? "live", builds: [...(data.builds ?? []), plan] } };
}
/** the same account with that refinement on the live record: what "Also make active" leaves */
function planActive(): Record<string, any> {
  const data = exp.characters[dps];
  return { ...exp.characters, [dps]: { ...data, weapons: { ...data.weapons, [weapon]: { ...data.weapons?.[weapon], refinement: String(planRank) } } } };
}
const pinned = { ...team, buildIds: ["plan", null, null] };
const entryOf = (account: { entries: Record<string, { refine: number }> }) => account.entries[rileyNameOf(dps)]!;

describe("the builds a team runs (resolveTeamBuilds)", () => {
  it("bakes a slot's pin into the record, with team buffs on or off", () => {
    const characters = withPlan();
    for (const auto of [true, false]) {
      const built = resolveTeamBuilds(pinned, characters, { auto });
      expect(built.slots[0]).toMatchObject({ characterId: dps, buildId: "plan", buildName: "Account plan", buildSource: "pinned" });
      expect(Number(built.characters[dps].weapons[weapon].refinement)).toBe(planRank);
      expect(built.characters[dps].activeBuildId).toBe("plan");
      // the other members and the account's own records are left as they were
      expect(built.characters[team.characterIds[1] as string]).toBe(characters[team.characterIds[1] as string]);
      expect(Number(characters[dps].weapons[weapon].refinement)).toBe(liveRank);
    }
  });

  it("hands the same records back when every slot runs its active build", () => {
    const characters = withPlan();
    expect(resolveTeamBuilds(team, characters, { auto: false }).characters).toBe(characters);
    expect(resolveTeamBuilds({ ...team, buildIds: [characters[dps].activeBuildId, null, null] }, characters).characters).toBe(characters);
    expect(resolveTeamBuilds({ characterIds: [dps, null, "Nobody"], buildIds: ["gone", null, null] }, characters).characters).toBe(characters);
  });

  it("with team buffs off reads pins only: a build named after the teammates is the team editor's rule", () => {
    const data = withPlan()[dps];
    const named = { ...data, builds: data.builds.map((b: any) => (b.id === "plan" ? { ...b, name: `For ${team.characterIds[1]} ${team.characterIds[2]}` } : b)) };
    const characters = { ...exp.characters, [dps]: named };
    expect(resolveTeamBuilds(team, characters, { auto: true }).slots[0]).toMatchObject({ buildId: "plan", buildSource: "named" });
    expect(resolveTeamBuilds(team, characters, { auto: false }).slots[0]).toMatchObject({ buildId: null, buildSource: "active" });
  });
});

describe("the wuwa_calc account of a saved team (rileyAccountForTeam)", () => {
  it("registers the pinned build's weapon rank for that member and leaves everyone else alone", () => {
    const characters = withPlan();
    const base = rileyAccountOf(characters, exp.inventory, [pinned]);
    const own = rileyAccountForTeam(pinned, characters, exp.inventory, [pinned], { base });
    expect(entryOf(base).refine).toBe(liveRank);
    expect(entryOf(own).refine).toBe(planRank);
    expect(own.key).not.toBe(base.key);
    const { [rileyNameOf(dps)]: _mine, ...others } = own.entries;
    const { [rileyNameOf(dps)]: _theirs, ...baseOthers } = base.entries;
    expect(others).toEqual(baseOthers);
    // the account "Also make active" would leave: one team, one account, wherever it is asked
    expect(own).toEqual(rileyAccountOf(planActive(), exp.inventory, [pinned]));
  });

  it("is the base account itself for a team that pins nothing, so its solves and kept measurements are shared", () => {
    const characters = withPlan();
    const base = rileyAccountOf(characters, exp.inventory, [team]);
    expect(rileyAccountForTeam(team, characters, exp.inventory, [team], { base })).toBe(base);
    expect(rileyAccountForTeam(null, characters, exp.inventory, [team], { base })).toBe(base);
  });

  it("finds the saved team of a composition in any order, and none for three nobody saved", () => {
    const [a, b, c] = team.characterIds as string[];
    expect(savedTeamOf([pinned], [c!, a!, b!])).toBe(pinned);
    expect(savedTeamOf([pinned], [a!, b!, "Verina"])).toBeNull();
    expect(savedTeamOf([pinned], [])).toBeNull();
  });
});

describe("the energy check of a saved team", () => {
  it("`cli er` measures the team on its pinned builds: the DPS the same builds read once active", async () => {
    const live = await energyReport({ ...exp, teams: [team] });
    const onPins = await energyReport({ ...exp, characters: withPlan(), teams: [pinned] });
    const active = await energyReport({ ...exp, characters: planActive(), teams: [team] });
    const total = (r: typeof live): number => (r.teams[0]!.measure.status === "ok" ? r.teams[0]!.measure.energy.total : NaN);
    expect(total(live)).toBeGreaterThan(0);
    expect(total(onPins)).toBeCloseTo(total(active), 3);
    expect(Math.abs(total(onPins) - total(live))).toBeGreaterThan(1); // it read the active builds' figure
    // an unpinned team of the same account is still asked at the active builds
    const unpinned = await energyReport({ ...exp, characters: withPlan(), teams: [team] });
    expect(total(unpinned)).toBeCloseTo(total(live), 3);
  }, 120_000);

  it("the ER column names the pinned build with team buffs off too, as the DPS beside it now does", async () => {
    const characters = withPlan();
    for (const auto of [true, false]) {
      const haves = await teamHaves(pinned, characters, exp.inventory.echoes, { auto });
      expect(haves[0]).toMatchObject({ characterId: dps, buildName: "Account plan" });
      expect(haves[1]!.buildName).toBeNull();
    }
  }, 60_000);
});
