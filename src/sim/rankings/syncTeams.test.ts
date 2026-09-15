// Wuthering Tools+: the plain-data half of "Sync my teams" (the engine half runs on the rankings page).
import { describe, expect, it } from "vitest";
import { actionCounts, diffActions, humanKey, isWuwaCalcTeam, rileyTeamKeysFor } from "./syncTeams";

describe("sync my teams", () => {
  it("touches only wuwa_calc-named teams", () => {
    expect(isWuwaCalcTeam({ name: "wuwa_calc Aemeath S6R5 DPS · S1R1/S6R1 team · Mornye + Lynae" })).toBe(true);
    expect(isWuwaCalcTeam({ name: "Chisa + Denia + Aemeath · S6R5 (wuwa_calc t307)" })).toBe(true);
    expect(isWuwaCalcTeam({ name: "My Aemeath team" })).toBe(false);
    expect(isWuwaCalcTeam({ name: "" })).toBe(false);
  });

  it("finds Riley's team keys for a composition, in any slot order", () => {
    const teams = {
      t1: [{ name: "Mornye" }, { name: "Lynae" }, { name: "Aemeath" }],
      t2: [{ name: "Aemeath" }, { name: "Lynae" }, { name: "Mornye" }], // another loadout variant
      t3: [{ name: "Mornye" }, { name: "Lynae" }, { name: "Xuanling" }],
    };
    expect(rileyTeamKeysFor(["Aemeath", "Mornye", "Lynae"], teams)).toEqual(["t1", "t2"]);
    expect(rileyTeamKeysFor(["YangyangXuanling", "Mornye", "Lynae"], teams)).toEqual(["t3"]); // app key → Riley name
    expect(rileyTeamKeysFor(["Aemeath", "Mornye", null], teams)).toEqual([]);
    expect(rileyTeamKeysFor(["Aemeath", "Mornye", "Zani"], teams)).toEqual([]);
  });

  it("diffs two rotations by slot, attack and main echo", () => {
    const before = [
      { slot: 0, key: "HeavenfallEdictFinaleDMG", count: 2 },
      { slot: 0, key: "SeraphicDuetEncoreDMG", count: 2 },
      { slot: 0, key: "SeraphicDuetEncoreDMG", count: 2 },
      { slot: 1, key: "HyvatiaLasersDMG", count: 1, mainEcho: "Hyvatia" },
      { slot: 2, key: "ConvergenceDMG", count: 1, isDisabled: true },
    ];
    const after = [
      { slot: 0, key: "HeavenfallEdictFinaleDMG", count: 1 },
      { slot: 0, key: "SeraphicDuetEncoreDMG", count: 1 },
      { slot: 0, key: "SeraphicDuetBonusDMGPerInstance", count: 5 },
      { slot: 1, key: "HyvatiaLasersDMG", count: 1, mainEcho: "Hyvatia" },
      { slot: 2, key: "ConvergenceDMG", count: 1 },
    ];
    expect([...actionCounts(before).values()].map((c) => [c.slot, c.key, c.count])).toEqual([
      [0, "HeavenfallEdictFinaleDMG", 2], [0, "SeraphicDuetEncoreDMG", 4], [1, "HyvatiaLasersDMG", 1],
    ]);
    expect(diffActions(before, after, ["Aemeath", "Lynae", "Mornye"])).toEqual([
      { slot: 0, characterId: "Aemeath", key: "HeavenfallEdictFinaleDMG", mainEcho: null, from: 2, to: 1 },
      { slot: 0, characterId: "Aemeath", key: "SeraphicDuetBonusDMGPerInstance", mainEcho: null, from: 0, to: 5 },
      { slot: 0, characterId: "Aemeath", key: "SeraphicDuetEncoreDMG", mainEcho: null, from: 4, to: 1 },
      { slot: 2, characterId: "Mornye", key: "ConvergenceDMG", mainEcho: null, from: 0, to: 1 },
    ]);
    expect(diffActions(after, after)).toEqual([]);
    expect(humanKey("HeavenfallEdictFinaleDMG")).toBe("Heavenfall Edict Finale DMG");
    expect(humanKey("SeraphicDuetBonusDMGPerInstance")).toBe("Seraphic Duet Bonus DMG Per Instance");
  });
});
