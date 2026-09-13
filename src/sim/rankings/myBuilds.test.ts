// Wuthering Tools+: the player's equipped echoes -> the engine's "My build" substat rolls.
import { describe, expect, it } from "vitest";
import account from "../myRankings/__fixtures__/cartethyiaAccount.json";
import { buildRollsOf, rollsKey } from "./myBuilds";

describe("my builds for the rankings engine", () => {
  it("turns the Cartethyia fixture's equipped echoes into wuwa_calc substat rolls", () => {
    const builds = buildRollsOf(account.characters as Record<string, Record<string, unknown>>, account.echoes as Array<Record<string, unknown>>);
    expect(builds).toHaveLength(1);
    const [b] = builds;
    expect(b.name).toBe("Cartethyia");
    expect(b.echoes).toBe(5);
    expect(b.rolls.length).toBeGreaterThanOrEqual(20);
    const kinds = new Set(b.rolls.map((r) => r.kind));
    for (const k of kinds) expect(["CritRate", "CritDmg", "Er", "AtkPct", "FlatAtk", "HpPct", "FlatHp", "DefPct", "FlatDef", "Basic", "Heavy", "Skill", "Liberation"]).toContain(k);
    expect(b.rolls.every((r) => r.value > 0)).toBe(true);
    expect(b.key).toBe(rollsKey(b.rolls));
  });

  it("maps app keys to Riley's names, skips characters without echo substats, and keys builds by their rolls", () => {
    const echoes = [{ echoId: "e1", echoSubStatsType1: "CritRate", echoSubStatsValue1: 8.7, echoSubStatsType2: "HealingBonus", echoSubStatsValue2: 6.4, echoSubStatsType3: "ATK_FLAT", echoSubStatsValue3: 40 }];
    const builds = buildRollsOf({ YangyangXuanling: { echoes: { 0: { echoId: "e1" } } }, Mornye: { echoes: {} }, Brant: {} }, echoes);
    expect(builds.map((b) => b.name)).toEqual(["Xuanling"]);
    expect(builds[0].rolls).toEqual([
      { kind: "CritRate", value: 8.7 },
      { kind: "FlatAtk", value: 40 },
    ]);
    expect(rollsKey(builds[0].rolls)).not.toBe(rollsKey([{ kind: "CritRate", value: 9.3 }, { kind: "FlatAtk", value: 40 }]));
  });
});
