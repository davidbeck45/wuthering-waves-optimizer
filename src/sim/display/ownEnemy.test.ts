// Wuthering Tools+: /account's team figures say what Teams' enemy has that theirs has not (2026-11-09 hunt 2, item 6).
import { describe, expect, it } from "vitest";
import { ONE_ENEMY_TEXT, ownEnemyDifferences, ownEnemyNote } from "./ownEnemy";

const base = { enemyLevel: 100, enemyResist: 0.2, enemyType: "Calamity", enemyBrowserKey: null, spectroFrazzleStacks: 0, aeroErosionStacks: 0, havocBaneStacks: 0, fusionBurstStacks: 0, electroFlareStacks: 0, electroRageStacks: 0, glacioChafeStacks: 0, strainStacks: 0 };

describe("a saved team's own enemy beside the rankings' enemy", () => {
  it("names the stacks a wuwa_calc team carries: Xuanling · Suisui + Chisa reads 5.56M here and 7.66M on Teams", () => {
    const xuanling = { ...base, havocBaneStacks: 9, glacioChafeStacks: 13 };
    expect(ownEnemyDifferences(xuanling)).toEqual(["9 Havoc Bane + 13 Glacio Chafe stacks"]);
    expect(ownEnemyNote(xuanling)).toBe("Teams scores this team at its own enemy (9 Havoc Bane + 13 Glacio Chafe stacks), so it reads a different figure there");
    expect(ownEnemyDifferences({ ...base, glacioChafeStacks: 1 })).toEqual(["1 Glacio Chafe stack"]);
  });

  it("says nothing for a team whose enemy is the rankings' enemy, or that has none of its own", () => {
    expect(ownEnemyNote(base)).toBeNull();
    expect(ownEnemyNote(null)).toBeNull();
    expect(ownEnemyNote(undefined)).toBeNull();
    expect(ownEnemyNote({})).toBeNull();
  });

  it("names another level, another RES and a per-element RES too", () => {
    expect(ownEnemyDifferences({ ...base, enemyLevel: 90, enemyResist: 0.1, strainStacks: 2 })).toEqual(["level 90", "10 % RES", "2 Tune Strain stacks"]);
    expect(ownEnemyDifferences({ ...base, enemyResistByElement: { Fusion: 0.4 } })).toEqual(["its own RES per element"]);
  });

  it("the one-enemy label says there are no stacks, the word that tells it from Teams' label", () => {
    expect(ONE_ENEMY_TEXT).toMatch(/level 100, 20 % RES, no stacks/);
  });
});
