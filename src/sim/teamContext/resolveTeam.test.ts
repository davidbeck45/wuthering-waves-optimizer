import { describe, expect, it } from "vitest";
import { buildCharacterCalculationContext, resolveTeamEnemyConfig } from "../../calculator/buildCharacterContext";
import { resolveTeamCharacters } from "./resolveTeam";

const enemy = resolveTeamEnemyConfig({});
const echo = (set: string, i: number) => ({
  echoId: `${set}-${i}`,
  echo: "Hurriclaw",
  echoSet: set,
  type: 3,
  rank: 5,
  stat: "ATK",
  echoSubStatsType1: "CritRate",
  echoSubStatsValue1: 8.1,
});
const fiveOf = (set: string) => Object.fromEntries([0, 1, 2, 3, 4].map((i) => [i, echo(set, i)]));

function roster(iunoSequenceTwo: boolean) {
  return {
    Augusta: {
      weapon: "ThunderflareDominion",
      teamBuffs: { selectedCharacter1: "Iuno", selectedCharacter2: "Shorekeeper", buffs: { OutroSkillFromGloomtoGleam: { isEnabled: true } } },
    },
    Iuno: {
      weapon: "Stringmaster",
      resonanceChains: { SequenceNode2DayorNightLetThisBeEternal: { isEnabled: iunoSequenceTwo } },
      teamBuffs: { selectedCharacter1: null, selectedCharacter2: null, buffs: {} },
    },
    Shorekeeper: {
      weapon: "StellarSymphony",
      weapons: { StellarSymphony: { refinement: "5" } },
      mainEcho: { echo: "FallacyOfNoReturn", rank: 5 },
      echoes: fiveOf("RejuvenatingGlow"),
      teamBuffs: { selectedCharacter1: "Camellya", selectedCharacter2: "Sanhua", buffs: { Silversnow: { isEnabled: true } } },
    },
  } as Record<string, any>;
}
const team = { characterIds: ["Augusta", "Iuno", "Shorekeeper"], enemyConfig: {} };

describe("resolveTeamCharacters", () => {
  it("keeps a Team Buffs panel that already names exactly these teammates", async () => {
    const characters = roster(true);
    const res = await resolveTeamCharacters(team, characters, [], { enemyConfig: enemy });
    expect(res.slots[0]).toMatchObject({ characterId: "Augusta", buffSource: "panel", enabled: ["OutroSkillFromGloomtoGleam"] });
    expect(res.characters.Augusta.teamBuffs).toBe(characters.Augusta.teamBuffs);
    expect(res.buildIds).toEqual([null, null, null]);
  });

  it("derives a member's team buffs from what the real teammates' builds provide", async () => {
    const characters = roster(true);
    const res = await resolveTeamCharacters(team, characters, [], { enemyConfig: enemy });
    const iuno = res.slots[1];
    expect(iuno.buffSource).toBe("derived");
    expect(iuno.teammates).toEqual(["Augusta", "Shorekeeper"]);
    const buffs = res.characters.Iuno.teamBuffs.buffs as Record<string, { isEnabled: boolean; baseAttrValue?: number; refinement?: unknown }>;
    expect(res.characters.Iuno.teamBuffs.selectedCharacter1).toBe("Augusta");
    expect(res.characters.Iuno.teamBuffs.selectedCharacter2).toBe("Shorekeeper");
    // Shorekeeper's weapon, main echo and 5-piece set travel with her build
    expect(buffs.StellarSymphonyATK).toMatchObject({ isEnabled: true, refinement: "5" });
    expect(buffs.FallacyOfNoReturn?.isEnabled).toBe(true);
    expect(buffs.RejuvenatingGlow?.isEnabled).toBe(true);
    expect(buffs.MoonlitClouds).toBeUndefined();
    // her Energy-Regen-scaled buff is fed from her real stats, not a typed guess
    const shorekeeper = await buildCharacterCalculationContext("Shorekeeper", res.characters, enemy, []);
    const expectedEr = Math.round((shorekeeper.finalStats.energyRegen as number) * 1000) / 10;
    expect(buffs.SophisticatedStellarealmCritRate?.baseAttrValue).toBe(expectedEr);
    expect(expectedEr).toBeGreaterThan(0);
    // the original records are untouched
    expect(characters.Iuno.teamBuffs.selectedCharacter1).toBeNull();
  });

  it("enables a teammate's sequence-node buff only when that node is on their build", async () => {
    const withS2 = await resolveTeamCharacters(team, roster(true), [], { enemyConfig: enemy });
    const withoutS2 = await resolveTeamCharacters(team, roster(false), [], { enemyConfig: enemy });
    expect(withS2.characters.Shorekeeper.teamBuffs.buffs.SequenceNode2DayorNightLetThisBeEternal?.isEnabled).toBe(true);
    expect(withoutS2.characters.Shorekeeper.teamBuffs.buffs.SequenceNode2DayorNightLetThisBeEternal).toBeUndefined();
    expect(withoutS2.slots[2].skipped).toContainEqual({ key: "SequenceNode2DayorNightLetThisBeEternal", from: "Iuno", reason: "needs S2" });
  });

  it("picks the saved build named after the teammates, unless a slot is pinned", async () => {
    const characters = roster(true);
    characters.Iuno = {
      ...characters.Iuno,
      activeBuildId: "b-main",
      builds: [
        { id: "b-main", name: "Main", weapon: "Stringmaster" },
        { id: "b-team", name: "Support (Augusta + Shorekeeper)", weapon: "Cosmicripple" },
      ],
    };
    const named = await resolveTeamCharacters(team, characters, [], { enemyConfig: enemy });
    expect(named.slots[1]).toMatchObject({ buildId: "b-team", buildName: "Support (Augusta + Shorekeeper)", buildSource: "named" });
    expect(named.characters.Iuno.weapon).toBe("Cosmicripple");
    const pinned = await resolveTeamCharacters({ ...team, buildIds: [null, "b-main", null] }, characters, [], { enemyConfig: enemy });
    expect(pinned.slots[1]).toMatchObject({ buildId: "b-main", buildSource: "pinned" });
    expect(pinned.characters.Iuno.weapon).toBe("Stringmaster");
  });

  it("counts a teammate with no build: a matching panel is kept, a 4-star is assumed S6, a 5-star S0", async () => {
    const characters: Record<string, any> = {
      Camellya: {
        weapon: "RedSpring",
        teamBuffs: { selectedCharacter1: "Sanhua", selectedCharacter2: "Shorekeeper", buffs: { Silversnow: { isEnabled: true } } },
      },
      Shorekeeper: { weapon: "StellarSymphony", teamBuffs: { buffs: {} } },
    };
    const res = await resolveTeamCharacters({ characterIds: ["Shorekeeper", "Sanhua", "Camellya"] }, characters, [], { enemyConfig: enemy });
    const camellya = res.slots.find((s) => s.characterId === "Camellya")!;
    expect(camellya.teammates).toEqual(["Shorekeeper", "Sanhua"]);
    expect(camellya.buffSource).toBe("panel");
    // Shorekeeper's panel is empty, so hers is derived: Sanhua (4-star, unbuilt) still brings her outro and her S6 node
    const shorekeeper = res.slots.find((s) => s.characterId === "Shorekeeper")!;
    expect(shorekeeper.buffSource).toBe("derived");
    const buffs = res.characters.Shorekeeper.teamBuffs.buffs as Record<string, { isEnabled: boolean }>;
    expect(buffs.Silversnow?.isEnabled).toBe(true);
    expect(buffs.SequenceNode6DaybreakRadiance?.isEnabled).toBe(true);
    // an unbuilt 5-star contributes no sequence-node buffs
    const withIuno = await resolveTeamCharacters({ characterIds: ["Shorekeeper", "Iuno", null] }, { Shorekeeper: characters.Shorekeeper }, [], { enemyConfig: enemy });
    const sk = withIuno.slots[0];
    expect(withIuno.characters.Shorekeeper.teamBuffs.buffs.OutroSkillFromGloomtoGleam?.isEnabled).toBe(true);
    expect(withIuno.characters.Shorekeeper.teamBuffs.buffs.SequenceNode2DayorNightLetThisBeEternal).toBeUndefined();
    expect(sk.skipped).toContainEqual({ key: "SequenceNode2DayorNightLetThisBeEternal", from: "Iuno", reason: "needs S2, not set up (assumed S0)" });
  });

  it("matches any word of a teammate's name in a build name, in any order", async () => {
    const characters: Record<string, any> = {
      Chisa: {
        weapon: "Kumokiri",
        activeBuildId: "b-main",
        builds: [
          { id: "b-main", name: "Default build", weapon: "Kumokiri" },
          { id: "b-moonlit", name: "Moonlit Chisa (Yangyang Suisui)", weapon: "Stringmaster" },
        ],
        teamBuffs: { buffs: {} },
      },
      YangyangXuanling: { weapon: "AzureOath", teamBuffs: { buffs: {} } },
      Suisui: { weapon: "Cosmicripple", teamBuffs: { buffs: {} } },
    };
    const res = await resolveTeamCharacters({ characterIds: ["YangyangXuanling", "Chisa", "Suisui"] }, characters, [], { enemyConfig: enemy });
    expect(res.slots[1]).toMatchObject({ characterId: "Chisa", buildName: "Moonlit Chisa (Yangyang Suisui)", buildSource: "named" });
    expect(res.characters.Chisa.weapon).toBe("Stringmaster");
    // a name that mentions only one teammate does not qualify
    characters.Chisa.builds[1].name = "Moonlit Chisa (Suisui)";
    const one = await resolveTeamCharacters({ characterIds: ["YangyangXuanling", "Chisa", "Suisui"] }, characters, [], { enemyConfig: enemy });
    expect(one.slots[1].buildSource).toBe("active");
  });

  it("auto: false is a strict passthrough of upstream behaviour", async () => {
    const characters = roster(true);
    const res = await resolveTeamCharacters({ ...team, buildIds: [null, "x", null] }, characters, [], { auto: false });
    expect(res.characters).toBe(characters);
    expect(res.buildIds).toEqual([null, "x", null]);
    expect(res.slots.every((s) => s.buffSource === "off")).toBe(true);
  });
});
