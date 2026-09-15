// Wuthering Tools+: substat weights on a real exported account (the Cartethyia optimizer fixture —
// an HP scaler with five +25 echoes, so three substat kinds are absent and take the swap path).
import { describe, expect, it } from "vitest";
import account from "../myRankings/__fixtures__/cartethyiaAccount.json";
import { resolveCharacterEchoes } from "../../calculator/buildCharacterContext";
import { getCombinedEchoStats } from "../../echoes/stats";
import { RANKING_ENEMY, rotationCandidates } from "../myRankings/rankRoster";
import {
  SUBSTAT_KEYS,
  equippedSubstatWorth,
  expectedRoll,
  maxRoll,
  rotationScorer,
  substatWeights,
  withSubstat,
  withoutEchoSubstats,
  type SubstatKey,
} from "./substatWeights";

const ID = "Cartethyia";
const characters = account.characters as Record<string, any>;
const echoes = account.echoes as any[];
const combined = (chars: Record<string, any>, inv: any[], id = ID): Record<string, number> =>
  getCombinedEchoStats(resolveCharacterEchoes(chars[id]?.echoes ?? {}, inv));

describe("substat rolls", () => {
  it("knows the expected and the best tier of every substat", () => {
    expect(expectedRoll("CritRate")).toBeCloseTo(7.53, 2);
    expect(expectedRoll("CritDMG")).toBeCloseTo(15.06, 2);
    expect(expectedRoll("ATK")).toBeCloseTo(8.77, 2);
    expect(expectedRoll("ATK_FLAT")).toBeCloseTo(43.7, 1);
    expect(expectedRoll("HP_FLAT")).toBeCloseTo(438.3, 1);
    expect(expectedRoll("DEF_FLAT")).toBeCloseTo(53.5, 1);
    expect(expectedRoll("EnergyRegen")).toBeCloseTo(9.36, 2);
    expect(maxRoll("CritRate")).toBe(10.5);
    expect(maxRoll("CritDMG")).toBe(21);
    expect(maxRoll("ATK_FLAT")).toBe(60);
    for (const key of SUBSTAT_KEYS) {
      expect(expectedRoll(key)).toBeGreaterThan(0);
      expect(expectedRoll(key)).toBeLessThan(maxRoll(key));
    }
  });
});

describe("withSubstat", () => {
  it("adds exactly one roll of every substat to the build's combined echo stats, never touching the inputs", () => {
    const before = combined(characters, echoes);
    const frozenCharacters = JSON.stringify(characters);
    const frozenEchoes = JSON.stringify(echoes);
    const hows = new Set<string>();
    for (const key of SUBSTAT_KEYS) {
      const value = expectedRoll(key);
      const clone = withSubstat(ID, characters, echoes, key, value);
      const after = combined(clone.characters, clone.inventoryEchoes);
      for (const stat of new Set([...Object.keys(before), ...Object.keys(after)])) {
        const expected = (before[stat] ?? 0) + (stat === key ? value : 0);
        expect(after[stat] ?? 0, `${key} roll moved ${stat}`).toBeCloseTo(expected, 6);
      }
      hows.add(clone.placement.how);
      // the equipped pointers are inventory echoes: the roll lands in a cloned inventory, the record is untouched
      expect(clone.characters).toBe(characters);
      expect(clone.inventoryEchoes).not.toBe(echoes);
    }
    expect(JSON.stringify(characters)).toBe(frozenCharacters);
    expect(JSON.stringify(echoes)).toBe(frozenEchoes);
    // her 25 lines hold 10 kinds: present kinds are bumped, the absent three (ATK %, Heavy, ER) swap a twin
    expect(hows).toEqual(new Set(["bumped", "swapped"]));
    expect(withSubstat(ID, characters, echoes, "HeavyAttackDMGBonus", 8).placement).toMatchObject({ how: "swapped", moved: expect.any(Object) });
    expect(withSubstat(ID, characters, echoes, "CritRate", 8).placement.how).toBe("bumped");
  });

  it("fills a free field, an empty slot, or an inline slot on the character record", () => {
    const inline = { echo: "GlacioDrake", type: 1, rank: 5, stat: "HP", echoSubStatsType1: "CritRate", echoSubStatsValue1: 6.3 };
    const chars = {
      Someone: {
        echoes: {
          0: { echoId: "abc" }, // in the inventory, two substats
          1: inline, // legacy inline record, one substat
        },
      },
    };
    const inv = [{ echoId: "abc", echo: "HavocDrake", type: 1, rank: 5, stat: "HP", echoSubStatsType1: "CritDMG", echoSubStatsValue1: 15, echoSubStatsType2: "HP", echoSubStatsValue2: 7.1 }];
    const before = combined(chars, inv, "Someone");

    const filled = withSubstat("Someone", chars, inv, "ATK", 8.6);
    expect(filled.placement).toEqual({ slot: 0, how: "filled" });
    expect(filled.inventoryEchoes[0].echoSubStatsType3).toBe("ATK");
    expect(filled.characters).toBe(chars);
    expect(combined(filled.characters, filled.inventoryEchoes, "Someone").ATK).toBeCloseTo((before.ATK ?? 0) + 8.6, 6);

    const bumpedInline = withSubstat("Someone", chars, inv, "CritRate", 6.9);
    expect(bumpedInline.placement).toEqual({ slot: 1, how: "bumped" });
    expect(bumpedInline.inventoryEchoes).toBe(inv);
    expect(bumpedInline.characters.Someone.echoes[1].echoSubStatsValue1).toBeCloseTo(13.2, 6);
    expect(chars.Someone.echoes[1]).toBe(inline); // the stored record is the same object, untouched

    // a character with nothing equipped: the roll sits alone in an empty slot
    const bare = withSubstat("Nobody", { Nobody: {} }, [], "CritDMG", 21);
    expect(bare.placement).toEqual({ slot: 0, how: "inline" });
    expect(combined(bare.characters as any, bare.inventoryEchoes, "Nobody")).toEqual({ CritDMG: 21 });
  });

  it("blanks one echo's substats and keeps its main stat", () => {
    const before = combined(characters, echoes);
    const blanked = withoutEchoSubstats(ID, characters, echoes, 0);
    const after = combined(blanked.characters, blanked.inventoryEchoes);
    // slot 0 = ReminiscenceFleurdelys, 4-cost Crit Rate main with CR 10.5 / CD 18.6 / HP 8.6 / HP 470 / Lib 9.4 lines
    expect(before.CritRate - after.CritRate).toBeCloseTo(10.5, 6);
    expect(before.CritDMG - after.CritDMG).toBeCloseTo(18.6, 6);
    expect(before.HP - after.HP).toBeCloseTo(8.6, 6);
    expect(before.HP_FLAT - after.HP_FLAT).toBeCloseTo(470, 6);
    expect(after.CritRate).toBeGreaterThan(20); // the 4-cost main stat is still there
    expect(echoes.find((e) => e.echoId === "xtbwqikno2").echoSubStatsType1).toBe("HP");
  });
});

describe("substat weights on Cartethyia's build", () => {
  it("scores one more roll of each substat on her saved rotation, best first", async () => {
    const candidates = await rotationCandidates(ID, characters[ID]);
    const own = candidates.find((c) => c.source === "yours");
    expect(own?.name).toBe("Rexlent's Fleurdelys Rotation");
    const score = rotationScorer(ID, own!.rotation, RANKING_ENEMY);
    const result = await substatWeights(ID, characters, echoes, score);
    expect(result.baseline).toBeGreaterThan(100000);
    expect(result.weights).toHaveLength(SUBSTAT_KEYS.length);
    const by = Object.fromEntries(result.weights.map((w) => [w.key, w])) as Record<SubstatKey, (typeof result.weights)[number]>;
    // an HP scaler: crit and HP move her, ATK does nothing, ER has no model
    expect(by.CritRate.gain).toBeGreaterThan(0.01);
    expect(by.CritDMG.gain).toBeGreaterThan(0.01);
    expect(by.HP.gain).toBeGreaterThan(0.005);
    expect(by.HP_FLAT.gain).toBeGreaterThan(0);
    expect(by.ATK.gain).toBeCloseTo(0, 6);
    expect(by.ATK_FLAT.gain).toBeCloseTo(0, 6);
    expect(by.EnergyRegen.gain).toBeCloseTo(0, 6);
    // sorted best first, the best normalised to 1, a bigger tier never pays less
    expect(result.weights[0].weight).toBe(1);
    for (let i = 1; i < result.weights.length; i++) expect(result.weights[i].gain).toBeLessThanOrEqual(result.weights[i - 1].gain);
    for (const w of result.weights) {
      expect(w.maxGain).toBeGreaterThanOrEqual(w.gain - 1e-9);
      expect(w.avgDamage).toBeCloseTo(result.baseline * (1 + w.gain), 3);
      expect(w.perPoint).toBeCloseTo(w.roll > 0 ? w.gain / w.roll : 0, 9);
    }
    expect(by.HP.flat).toBe(false);
    expect(by.HP_FLAT.flat).toBe(true);
  });

  it("scores what each equipped echo's substats are worth, with a shared baseline", async () => {
    const candidates = await rotationCandidates(ID, characters[ID]);
    const score = rotationScorer(ID, candidates.find((c) => c.source === "yours")!.rotation, RANKING_ENEMY);
    const baseline = await score(characters, echoes);
    const worth = await equippedSubstatWorth(ID, characters, echoes, score, { baseline });
    expect(worth).toHaveLength(5);
    for (const e of worth) {
      expect(e.substats).toHaveLength(5);
      expect(e.worth).toBeGreaterThan(0.02); // every echo carries crit or HP lines
      expect(e.avgDamage).toBeLessThan(baseline.avg);
    }
    expect(worth[0]).toMatchObject({ slot: 0, echo: "ReminiscenceFleurdelys", cost: 4, main: "CritRate", echoId: "xtbwqikno2" });
  });

  it("passes extra measures through as their own relative gains", async () => {
    const score = async (chars: Record<string, any>, inv: any[]) => {
      const cr = combined(chars, inv).CritRate ?? 0;
      return { avg: 1000 + cr, extra: { team: 2000 + cr } };
    };
    const result = await substatWeights(ID, characters, echoes, score, { keys: ["CritRate", "HP"] });
    const cr = result.weights.find((w) => w.key === "CritRate")!;
    expect(cr.gain).toBeCloseTo(expectedRoll("CritRate") / result.baseline, 9);
    expect(cr.extraGain.team).toBeCloseTo(expectedRoll("CritRate") / result.baselineExtra.team, 9);
    expect(result.weights.find((w) => w.key === "HP")!.gain).toBe(0);
  });
});
