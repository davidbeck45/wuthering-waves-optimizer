// Wuthering Tools+ — "Use their real buffs" on the calculator's Team Buffs screen (batch 5, lane real-panel): the
// resolver's derivation for one character beside two teammates, in words, and the stamp that keeps a saved team live.
import { describe, expect, it } from "vitest";
import { resolveTeamEnemyConfig } from "../../calculator/buildCharacterContext";
import { buildCharacterCalculationContext } from "../../calculator/buildCharacterContext";
import { deriveRealPanel, panelDifferences, panelNames, realPanelWrite } from "./realPanel";
import { resolveTeamCharacters } from "./resolveTeam";
import { isTypicalPanel, markTypicalPanel, typicalPanelSource } from "./typicalPanel";
import { versionOf } from "../buildHistory/history";
import { restoredRecord } from "../buildHistory/restore";

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

/** Augusta with Iuno (S0 or S2) and Shorekeeper; Augusta's panel already names the two, with one buff on by hand. */
function roster(iunoSequenceTwo: boolean): Record<string, any> {
  return {
    Augusta: {
      weapon: "ThunderflareDominion",
      teamBuffs: {
        selectedCharacter1: "Iuno",
        selectedCharacter2: "Shorekeeper",
        buffs: { OutroSkillFromGloomtoGleam: { isEnabled: true }, MoonlitClouds: { isEnabled: true } },
      },
    },
    Iuno: {
      weapon: "Stringmaster",
      resonanceChains: {
        SequenceNode1: { isEnabled: iunoSequenceTwo },
        SequenceNode2DayorNightLetThisBeEternal: { isEnabled: iunoSequenceTwo },
      },
      teamBuffs: { selectedCharacter1: null, selectedCharacter2: null, buffs: {} },
    },
    Shorekeeper: {
      weapon: "StellarSymphony",
      weapons: { StellarSymphony: { refinement: "5" } },
      mainEcho: { echo: "FallacyOfNoReturn", rank: 5 },
      echoes: fiveOf("RejuvenatingGlow"),
      teamBuffs: { selectedCharacter1: "Camellya", selectedCharacter2: "Sanhua", buffs: {} },
    },
  };
}

/** lodash's merge, as `setCharacterData` uses it, for plain objects */
function merge(target: any, source: any): any {
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === "object" && !Array.isArray(v) && target[k] && typeof target[k] === "object") merge(target[k], v);
    else target[k] = v;
  }
  return target;
}

describe("deriveRealPanel", { timeout: 30_000 }, () => {
  it("derives even when the panel already names the two teammates, and says why each buff is on", async () => {
    const characters = roster(true);
    const real = await deriveRealPanel("Augusta", ["Iuno", "Shorekeeper"], characters, [], enemy);
    // the hand-set Moonlit Clouds is nobody's here: the derivation leaves it out
    expect(real.buffs.MoonlitClouds).toBeUndefined();
    expect(real.buffs.StellarSymphonyATK).toMatchObject({ isEnabled: true, refinement: "5" });
    const line = (key: string) => [...real.on, ...real.off].find((l) => l.key === key)?.reason;
    expect(line("StellarSymphonyATK")).toMatch(/^On: Shorekeeper holds Stellar Symphony at Rank 5/);
    expect(line("RejuvenatingGlow")).toBe("On: Shorekeeper wears 5 pieces of Rejuvenating Glow.");
    expect(line("FallacyOfNoReturn")).toBe("On: Shorekeeper's main echo is Fallacy of No Return.");
    expect(line("SequenceNode2DayorNightLetThisBeEternal")).toBe("On: your Iuno is S2, and it needs S2.");
    // the stat-scaled buff reads Shorekeeper's real Energy Regen, and says the figure
    const sk = await buildCharacterCalculationContext("Shorekeeper", characters, enemy, []);
    const er = Math.round((sk.finalStats.energyRegen as number) * 1000) / 10;
    expect(real.buffs.SophisticatedStellarealmCritRate?.baseAttrValue).toBe(er);
    expect(line("SophisticatedStellarealmCritRate")).toContain(`reads Shorekeeper's real ${er.toLocaleString("en-US", { maximumFractionDigits: 1 })} % Energy Regen`);
    // nothing in the account changed
    expect(characters.Augusta.teamBuffs.buffs.MoonlitClouds.isEnabled).toBe(true);
    // Iuno's Outro is a handoff: a trio has no rotation, so Augusta gets it, said once
    expect(real.notes).toHaveLength(1);
    expect(real.notes[0]).toMatch(/^Outro Skill: From Gloom to Gleam is worded for "the incoming Resonator": .* so Augusta gets it, as in a saved team with no rotation\.$/);
  });

  it("leaves a sequence-node buff off at S0 and says so, on at S2", async () => {
    const s0 = await deriveRealPanel("Augusta", ["Iuno", "Shorekeeper"], roster(false), [], enemy);
    expect(s0.buffs.SequenceNode2DayorNightLetThisBeEternal).toBeUndefined();
    expect(s0.off).toContainEqual(expect.objectContaining({ key: "SequenceNode2DayorNightLetThisBeEternal", from: "Iuno", reason: "Off: your Iuno is S0; it needs S2." }));
    const s2 = await deriveRealPanel("Augusta", ["Iuno", "Shorekeeper"], roster(true), [], enemy);
    expect(s2.buffs.SequenceNode2DayorNightLetThisBeEternal?.isEnabled).toBe(true);
  });

  it("counts a teammate with no build as the resolver does, and says so", async () => {
    const characters = roster(false);
    delete characters.Iuno;
    const real = await deriveRealPanel("Augusta", ["Iuno", "Shorekeeper"], characters, [], enemy);
    expect(real.buffs.OutroSkillFromGloomtoGleam?.isEnabled).toBe(true);
    expect(real.off.find((l) => l.key === "SequenceNode2DayorNightLetThisBeEternal")?.reason).toBe("Off: you have no build of Iuno, so Iuno is counted as S0; it needs S2.");
    expect(real.notes.find((n) => n.startsWith("You have no build"))).toMatch(/^You have no build of Iuno: counted as S0 \(a 5-star\)/);
  });

  it("is the same panel a saved team of the three derives for that character", async () => {
    const characters = roster(true);
    const real = await deriveRealPanel("Augusta", ["Iuno", "Shorekeeper"], characters, [], enemy);
    const asTeam = await resolveTeamCharacters(
      { characterIds: ["Augusta", "Iuno", "Shorekeeper"], enemyConfig: {} },
      { ...characters, Augusta: { ...characters.Augusta, teamBuffs: { buffs: {} } } },
      [],
      { enemyConfig: enemy },
    );
    expect(real.buffs).toEqual(asTeam.characters.Augusta.teamBuffs.buffs);
  });

  it("reads a saved team of the three through its rotation, as the Teams page does: an Outro the rotation hands to someone else stays off (lane check-panel)", async () => {
    const characters = roster(true);
    // in this team's rotation Iuno hands off to Augusta, so Shorekeeper never gets Iuno's "incoming Resonator" Outro
    const team = { characterIds: ["Augusta", "Iuno", "Shorekeeper"], buildIds: [null, null, null], handoffs: { Iuno: ["Augusta"], Augusta: ["Shorekeeper"], Shorekeeper: ["Iuno"] } };
    const cleared = { ...characters, Shorekeeper: { ...characters.Shorekeeper, teamBuffs: { buffs: {} } } };
    const asTeam = await resolveTeamCharacters({ ...team, enemyConfig: {} }, cleared, [], { enemyConfig: enemy });
    expect(asTeam.characters.Shorekeeper.teamBuffs.buffs.OutroSkillFromGloomtoGleam).toBeUndefined();

    const real = await deriveRealPanel("Shorekeeper", ["Iuno", "Augusta"], characters, [], enemy, team);
    expect(real.buffs).toEqual(asTeam.characters.Shorekeeper.teamBuffs.buffs);
    expect(real.off.find((l) => l.key === "OutroSkillFromGloomtoGleam")?.reason).toBe("Off: in your saved team's rotation, Iuno's Outro goes to Augusta.");
    expect(real.notes.some((n) => n.includes("incoming Resonator"))).toBe(false);
    // without a saved team of the three: the no-rotation rule, and the note that says so
    const loose = await deriveRealPanel("Shorekeeper", ["Iuno", "Augusta"], characters, [], enemy);
    expect(loose.buffs.OutroSkillFromGloomtoGleam?.isEnabled).toBe(true);
    // a team of other members is no rotation for this trio
    const other = await deriveRealPanel("Shorekeeper", ["Iuno", "Augusta"], characters, [], enemy, { ...team, characterIds: ["Carlotta", "Iuno", "Shorekeeper"] });
    expect(other.buffs.OutroSkillFromGloomtoGleam?.isEnabled).toBe(true);
  });
});

describe("realPanelWrite and the stamp", { timeout: 30_000 }, () => {
  it("writes the derived panel over the old one, stamps it, and a saved team of the three keeps deriving", async () => {
    const characters = roster(false);
    const real = await deriveRealPanel("Augusta", ["Iuno", "Shorekeeper"], characters, [], enemy);
    merge(characters.Augusta, { teamBuffs: realPanelWrite(real, characters.Augusta.teamBuffs) });
    expect(characters.Augusta.teamBuffs.buffs.MoonlitClouds).toEqual({ isEnabled: false });
    expect(panelDifferences(real, characters.Augusta.teamBuffs)).toEqual([]);
    markTypicalPanel(characters.Augusta, "builds");
    expect(typicalPanelSource(characters.Augusta.teamBuffs)).toBe("builds");

    // Iuno reaches S2 later: the saved team derives the new buff, the panel is not frozen
    characters.Iuno.resonanceChains.SequenceNode1.isEnabled = true;
    characters.Iuno.resonanceChains.SequenceNode2DayorNightLetThisBeEternal.isEnabled = true;
    const team = await resolveTeamCharacters({ characterIds: ["Augusta", "Iuno", "Shorekeeper"], enemyConfig: {} }, characters, [], { enemyConfig: enemy });
    expect(team.slots[0].buffSource).toBe("derived");
    expect(team.characters.Augusta.teamBuffs.buffs.SequenceNode2DayorNightLetThisBeEternal?.isEnabled).toBe(true);
    // and the calculator's screen can say the panel is behind the builds
    const fresh = await deriveRealPanel("Augusta", ["Iuno", "Shorekeeper"], characters, [], enemy);
    expect(panelDifferences(fresh, characters.Augusta.teamBuffs).map((d) => d.key)).toContain("SequenceNode2DayorNightLetThisBeEternal");

    // a change by hand makes it the player's: the team keeps it
    merge(characters.Augusta, { teamBuffs: { buffs: { MoonlitClouds: { isEnabled: true } } } });
    expect(isTypicalPanel(characters.Augusta.teamBuffs)).toBe(false);
    expect(typicalPanelSource(characters.Augusta.teamBuffs)).toBeNull();
    const kept = await resolveTeamCharacters({ characterIds: ["Augusta", "Iuno", "Shorekeeper"], enemyConfig: {} }, characters, [], { enemyConfig: enemy });
    expect(kept.slots[0].buffSource).toBe("panel");
    const diff = panelDifferences(fresh, characters.Augusta.teamBuffs);
    expect(diff.find((d) => d.key === "MoonlitClouds")?.says).toBe("here: on · your builds: off");
  });

  it("the version build history takes before a fill puts the old panel back on Restore", async () => {
    const characters = roster(false);
    const before = structuredClone(characters.Augusta.teamBuffs);
    const version = versionOf("Augusta", characters.Augusta, [], "before-real-buffs");
    const real = await deriveRealPanel("Augusta", ["Iuno", "Shorekeeper"], characters, [], enemy);
    merge(characters.Augusta, { teamBuffs: realPanelWrite(real, characters.Augusta.teamBuffs) });
    markTypicalPanel(characters.Augusta, "builds");
    const restored = restoredRecord(characters.Augusta, version, []);
    expect(restored.teamBuffs.buffs.MoonlitClouds).toEqual(before.buffs.MoonlitClouds);
    expect(restored.teamBuffs.buffs.StellarSymphonyATK).toBeUndefined();
    expect(typicalPanelSource(restored.teamBuffs)).toBeNull();
  });

  it("Recommended teams' stamp still reads as theirs", () => {
    const record: any = { teamBuffs: { selectedCharacter1: "Iuno", selectedCharacter2: "Shorekeeper", buffs: { X: { isEnabled: true } } } };
    markTypicalPanel(record);
    expect(typicalPanelSource(record.teamBuffs)).toBe("recommended");
  });

  it("counts only what the panel reads: a stored buff of a Resonator not picked is no difference, a missing Rank reads 1", async () => {
    const characters = roster(true);
    const real = await deriveRealPanel("Augusta", ["Iuno", "Shorekeeper"], characters, [], enemy);
    const panel = { selectedCharacter1: "Iuno", selectedCharacter2: "Shorekeeper", buffs: structuredClone(real.buffs) as Record<string, any> };
    panel.buffs.Silversnow = { isEnabled: true }; // Sanhua's, left on from an earlier pick: the calculator ignores it
    delete panel.buffs.StellarSymphonyATK.refinement;
    expect(panelDifferences(real, panel).map((d) => d.key)).toEqual(["StellarSymphonyATK"]);
    panel.buffs.StellarSymphonyATK.refinement = "5";
    expect(panelDifferences(real, panel)).toEqual([]);
  });

  it("panelNames reads the two teammates in either order", () => {
    expect(panelNames({ selectedCharacter1: "Shorekeeper", selectedCharacter2: "Iuno" }, ["Iuno", "Shorekeeper"])).toBe(true);
    expect(panelNames({ selectedCharacter1: "Shorekeeper", selectedCharacter2: null }, ["Iuno", "Shorekeeper"])).toBe(false);
  });
});
