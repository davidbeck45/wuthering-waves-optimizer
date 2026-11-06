import { describe, expect, it } from "vitest";
import { calculateAllStats } from "../../src/calculator/stats";

// Wuthering Tools+ (hunt round 1): `selfBuffsData` is what the calculator hands the attacks as charBuffsData, and it
// spread AdditionalBase keys over the self buffs. With a self ATK buff of 12 % and Song of Feathered Trace's 12.8 % it
// read 12.8 %, not 24.8 %, so an attack that re-derives ATK from it (Phrolova's Hecate hits, under Maestro's own ATK)
// moved 0.2 % for a passive worth 12.8 % of ATK, and the stat breakdown's self row (which takes the set's part back
// out) read 0.

const statBuff = (key: string, modifier: string, modifierValue: number) => ({ key, name: key, details: "", hasStacks: false, modifiers: [{ modifier, modifierValue }], minStacks: 0, maxStacks: 0, alwaysEnabled: false });

const context = (overrides: Record<string, unknown> = {}) => ({
  baseHp: 10000,
  baseAtk: 400,
  baseDef: 1000,
  weaponAtk: 500,
  weaponModifier: null,
  weaponModifierValue: 0,
  weaponPassiveData: {},
  buffsConfig: { OwnAtk: { isEnabled: true } },
  resonanceChainsConfig: {},
  customBuffs: {},
  teamBuffsData: {},
  echoStats: { EnergyRegen: 28 },
  buffsCharInfo: [statBuff("OwnAtk", "ATK", 0.12)],
  resonanceChainsCharInfo: [],
  character: "Phrolova",
  talentData: { basic: 10, skill: 10, forte: 10, liberation: 10, intro: 10 },
  activeStance: null,
  ...overrides,
});

describe("the self buffs an attack reads are the ones the final stats summed", () => {
  it("adds an echo set's AdditionalBase ATK to the character's own ATK buff", () => {
    const result = calculateAllStats(
      context({
        setBonusLabels: ["Song of Feathered Trace 5 Set"],
        echoSetPassivesConfig: { SongofFeatheredTrace5SetChongming: { isEnabled: true } },
      }) as never,
    );
    expect(result.echoSetAdditionalBaseBuffsData.ATK).toBeCloseTo(0.128, 10);
    expect(result.selfBuffsData.ATK).toBeCloseTo(0.248, 10);
    expect(result.selfBuffsData.ATK).toBeCloseTo(result.appliedSelfBuffsData.ATK, 12);
  });

  it("adds a kit's AdditionalBase value to a plain self buff of the same name (Sigrika's Echo DMG Bonus read 50 %, not 98 %)", () => {
    const perEr = { key: "PerEr", name: "PerEr", details: "", hasStacks: false, modifiers: [{ modifier: "EchoDMGBonus:AdditionalBase", modifierValue: 0.01, maximumValue: 0.5, modifierStep: 1, modifierBasedOn: "EnergyRegen", modifierTargetAttr: "EchoDMGBonus", minStatValue: 1 }], minStacks: 0, maxStacks: 0, alwaysEnabled: false };
    const result = calculateAllStats(
      context({
        buffsConfig: { OwnEcho: { isEnabled: true }, PerEr: { isEnabled: true } },
        buffsCharInfo: [statBuff("OwnEcho", "EchoDMGBonus", 0.2), perEr],
      }) as never,
    );
    expect(result.selfBuffsData.EchoDMGBonus).toBeCloseTo(0.2 + 0.28, 10);
    expect(result.selfBuffsData.EchoDMGBonus).toBeCloseTo(result.appliedSelfBuffsData.EchoDMGBonus, 12);
  });

  it("keeps the per-talent buffs, which only the breakdown copy carries", () => {
    const perTalent = { key: "PerTalent", name: "PerTalent", details: "", hasStacks: false, modifiers: [{ modifier: "CritRate:AdditionalBase", modifierValue: 0.005, maximumValue: 0.8, modifierStep: 1, modifierBasedOn: "EnergyRegen", modifierTargetAttr: "CritRate", minStatValue: 1, modifySpecificTalents: ["SomeAttack"] }], minStacks: 0, maxStacks: 0, alwaysEnabled: false };
    const result = calculateAllStats(context({ buffsConfig: { PerTalent: { isEnabled: true } }, buffsCharInfo: [perTalent] }) as never);
    expect(result.selfBuffsData.specificTalentBuffs["SomeAttack:CritRate"]).toBeCloseTo(0.14, 10);
  });
});
