import { describe, it, expect } from "vitest";
import { buildCharacterCalculationContext } from "../../src/calculator/buildCharacterContext";
import { calcDamages } from "../../src/calculator/attacks";
import type { TeamEnemyConfig } from "../../src/calculator/buildCharacterContext";
import {
  getEnabledAttackKeys,
  getEnabledAttackKeysForCharacter,
  isAttackUnlocked,
} from "../../src/calculator/enabledAttacks";
import { getCharByName } from "../../src/characters/characters";

// Pins which `requiresResonanceChain` attacks the damage panel shows. The
// attack's `requiresResonanceChain` is an attack-unlock key granted by an
// `EnableAttack` modifier (or a hard-coded push in stats.ts), not necessarily
// the resonance chain's own key — #622 was the rotation editor confusing the
// two. These cover both shapes plus the stats.ts special cases.
const enemyConfig: TeamEnemyConfig = {
  enemyLevel: 90,
  enemyResist: 0.1,
  enemyType: "Calamity",
};

async function damagePanelKeys(
  character: string,
  config: {
    activeStance?: string;
    buffs?: Record<string, unknown>;
    resonanceChains?: Record<string, unknown>;
  },
  group: string,
): Promise<string[]> {
  const built = await buildCharacterCalculationContext(
    character,
    { [character]: { buffs: {}, resonanceChains: {}, ...config } },
    enemyConfig,
  );
  const result = calcDamages(built.context);
  return (result[group] ?? []).map((attack: { key: string }) => attack.key);
}

describe("damage panel attack unlocks", () => {
  it("unlocks Jianxin's S6 Special Chi Counter, whose unlock key differs from the chain key (#622)", async () => {
    const key = "SequenceNode6TruthfromWithinSpecialChiCounter";
    expect(await damagePanelKeys("Jianxin", {}, "forteCircuitAttacks")).not.toContain(key);
    expect(
      await damagePanelKeys(
        "Jianxin",
        { resonanceChains: { SequenceNode6TruthfromWithin: { isEnabled: true } } },
        "forteCircuitAttacks",
      ),
    ).toContain(key);
  });

  it("unlocks every Aalto S3 Half Truths attack from the one chain (#622)", async () => {
    const keys = await damagePanelKeys(
      "Aalto",
      { resonanceChains: { SequenceNode3HazeyTransition: { isEnabled: true } } },
      "basicAttacks",
    );
    expect(keys).toEqual(
      expect.arrayContaining([
        "SequenceNode3HazeyTransitionHalfTruthsStage1DMG",
        "SequenceNode3HazeyTransitionHalfTruthsStage5DMG",
        "SequenceNode3HazeyTransitionHalfTruthsMidAirAttackDMG",
      ]),
    );
  });

  it("unlocks Shorekeeper's S2 healing from its chain", async () => {
    const key = "SequenceNode2NightsGiftandRefusal";
    expect(await damagePanelKeys("Shorekeeper", {}, "forteCircuitAttacks")).not.toContain(key);
    expect(
      await damagePanelKeys(
        "Shorekeeper",
        { resonanceChains: { SequenceNode2NightsGiftandRefusal: { isEnabled: true } } },
        "forteCircuitAttacks",
      ),
    ).toContain(key);
  });

  it("unlocks Hiyuki's Glacio Bite only at 2+ Fine Snow stacks (stats.ts special case)", async () => {
    const at = (stacks: number) =>
      damagePanelKeys(
        "Hiyuki",
        { buffs: { InherentSkillFineSnow: { isEnabled: true, stacks } } },
        "forteCircuitAttacks",
      );
    expect(await at(1)).not.toContain("GlacioBiteDMG");
    expect(await at(2)).toContain("GlacioBiteDMG");
  });

  it("unlocks Hsin's Heart of Thunder delayed hit from the self buff, even at 0 stacks (stats.ts special case)", async () => {
    const keys = await damagePanelKeys(
      "Hsin",
      {
        activeStance: "Electro Flare",
        buffs: { ResonanceModeElectroFlareHeartOfThunderDelayedDMG: { isEnabled: true, stacks: 0 } },
      },
      "forteCircuitAttacks",
    );
    expect(keys).toContain("HeartOfThunderDelayedDMG");
  });

  it("keeps Hsin's delayed hit locked outside the Electro Flare stance", async () => {
    const keys = await damagePanelKeys(
      "Hsin",
      {
        activeStance: "Unison",
        buffs: { ResonanceModeElectroFlareHeartOfThunderDelayedDMG: { isEnabled: true, stacks: 0 } },
      },
      "forteCircuitAttacks",
    );
    expect(keys).not.toContain("HeartOfThunderDelayedDMG");
  });
});

describe("isAttackUnlocked", () => {
  it("treats attacks with no unlock key as always available", () => {
    expect(isAttackUnlocked({}, new Set())).toBe(true);
    expect(isAttackUnlocked({ requiresResonanceChain: false }, new Set())).toBe(true);
  });

  it("matches the unlock key against the enabled set", () => {
    const attack = { requiresResonanceChain: "Foo" };
    expect(isAttackUnlocked(attack, new Set())).toBe(false);
    expect(isAttackUnlocked(attack, getEnabledAttackKeys({ EnableAttack: ["Foo"] }, null))).toBe(true);
    expect(isAttackUnlocked(attack, getEnabledAttackKeys(null, { EnableAttack: ["Foo"] }))).toBe(true);
  });
});

// The rotation editor computes unlocks from definitions + saved state (it has
// no computed buff data for non-active team slots). It must agree with the
// damage panel for every chain-locked attack — #622 was the two disagreeing.
describe("getEnabledAttackKeysForCharacter matches the damage panel", () => {
  type Case = {
    character: string;
    group: string;
    attackKey: string;
    config: { activeStance?: string; buffs?: Record<string, unknown>; resonanceChains?: Record<string, unknown> };
  };
  const cases: Case[] = [
    {
      character: "Jianxin",
      group: "forteCircuitAttacks",
      attackKey: "SequenceNode6TruthfromWithinSpecialChiCounter",
      config: { resonanceChains: { SequenceNode6TruthfromWithin: { isEnabled: true } } },
    },
    {
      character: "Aalto",
      group: "basicAttacks",
      attackKey: "SequenceNode3HazeyTransitionHalfTruthsMidAirAttackDMG",
      config: { resonanceChains: { SequenceNode3HazeyTransition: { isEnabled: true } } },
    },
    {
      character: "Qiuyuan",
      group: "outroAttacks",
      attackKey: "SequenceNode3OBladeIWhoSaveNoMore2",
      config: { resonanceChains: { SequenceNode3OBladeIWhoSaveNoMore: { isEnabled: true } } },
    },
    {
      character: "Shorekeeper",
      group: "forteCircuitAttacks",
      attackKey: "SequenceNode2NightsGiftandRefusal",
      config: { resonanceChains: { SequenceNode2NightsGiftandRefusal: { isEnabled: true } } },
    },
    {
      character: "Hiyuki",
      group: "forteCircuitAttacks",
      attackKey: "GlacioBiteDMG",
      config: { buffs: { InherentSkillFineSnow: { isEnabled: true, stacks: 2 } } },
    },
    {
      character: "Hsin",
      group: "forteCircuitAttacks",
      attackKey: "HeartOfThunderDelayedDMG",
      config: {
        activeStance: "Electro Flare",
        buffs: { ResonanceModeElectroFlareHeartOfThunderDelayedDMG: { isEnabled: true, stacks: 0 } },
      },
    },
  ];

  it.each(cases)("$character $attackKey", async ({ character, group, attackKey, config }) => {
    const defs = (await getCharByName(character)) as any;
    const attack = defs[group].attacks.find((a: { key: string }) => a.key === attackKey);
    expect(attack?.requiresResonanceChain).toBeTruthy();

    const lockedKeys = getEnabledAttackKeysForCharacter(character, defs, {});
    const unlockedKeys = getEnabledAttackKeysForCharacter(character, defs, config);
    expect(isAttackUnlocked(attack, lockedKeys)).toBe(false);
    expect(isAttackUnlocked(attack, unlockedKeys)).toBe(true);
    expect(await damagePanelKeys(character, config, group)).toContain(attackKey);
  });
});
