// "Cost to max" on the generated table (the game's own upgrade tables, version 3.7). The from-level-1 totals below were
// checked step by step on 2026-11-02 against Kuro's own community wiki (ascension per rank, Forte per level, both inherent
// skills, the stat bonuses, weapon ascension per step) and the Fandom wiki's levelling pages (EXP per level, 0.35 / 0.4
// Shell Credits per EXP): spike ~/Projects/wto-wt/b3/materials-spike/scripts/kuro_check.py, curves_check.py.
import { describe, expect, it } from "vitest";
import table from "./data/materials.json";
import { costToMax, hasSavedProgress, parseLevel, savedProgressOf, unsavedWords, type CostToMax, type MaterialsData } from "./costToMax";
import { characterPickerRoster } from "../../characters/characters";
import { getWeaponsByType } from "../../weapons/weapons";

const appEntries = (): { characters: string[]; weapons: string[] } => ({
  characters: Object.values(characterPickerRoster).flat().map((c) => c.key),
  weapons: ["Broadblades", "Swords", "Pistols", "Gauntlets", "Rectifiers"].flatMap((t) => Object.values(getWeaponsByType(t) as Record<string, Array<{ key: string }>>).flat().map((w) => w.key)),
});

const data = table as unknown as MaterialsData;
const scratch = (key: string, weapon: string | null = null): CostToMax =>
  costToMax(data, key, { level: null, talents: {}, weapon, weaponLevel: null }, { from: "scratch" })!;
const part = (c: CostToMax, kind: string) => c.parts.find((p) => p.kind === kind)!;
const mats = (lines: Array<{ name: string; count: number }>): Record<string, number> => Object.fromEntries(lines.map((m) => [m.name, m.count]));

describe("the table", () => {
  it("covers every character and weapon the app lists, and says where it is from", () => {
    const { characters, weapons } = appEntries();
    expect(characters.filter((k) => !data.characters[k])).toEqual([]);
    expect(weapons.filter((k) => !data.weapons[k])).toEqual([]);
    expect(data.gameVersion).toBe("3.7");
    expect(data.fetched).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.characters.Lily).toBeUndefined(); // 3.8, not released
  });
  it("has one resonator EXP curve to 90 and 0.35 / 0.4 Shell Credits per EXP", () => {
    expect(data.resonatorExp.perLevel).toHaveLength(89);
    expect(data.resonatorExp.perLevel.reduce((s, v) => s + v, 0)).toBe(2_438_000);
    expect(data.resonatorExp.creditPerExp).toBe(0.35);
    expect(data.weaponExp.creditPerExp).toBe(0.4);
    expect(data.weaponExp.perLevel["5"].reduce((s, v) => s + v, 0)).toBe(2_692_400);
    expect(data.weaponExp.perLevel["4"].reduce((s, v) => s + v, 0)).toBe(2_289_200);
  });
});

describe("from level 1 — the cross-checked totals", () => {
  it("Hsin (3.7 5★) with Blooming Jadehaven (3.7 5★ weapon)", () => {
    const c = scratch("Hsin", "BloomingJadehaven");
    const level = part(c, "level");
    expect(level.exp).toBe(2_438_000);
    expect(level.expCredits).toBe(853_300);
    expect(level.credits).toBe(1_023_300); // + 170,000 for the six ascensions
    expect(level.ascensions).toBe(6);
    expect(level.expItem).toMatchObject({ name: "Premium Resonance Potion", count: 122 });
    expect(mats(level.materials)).toEqual({
      "LF Autopuppet Kernel": 4,
      "MF Autopuppet Kernel": 12,
      "HF Autopuppet Kernel": 12,
      "FF Autopuppet Kernel": 4,
      "Solidarity's Loneflame": 46,
      "Bloom of Hearkening": 60,
    });
    const forte = part(c, "forte");
    expect(forte.credits).toBe(1_400_000); // 5 × 280,000
    expect(mats(forte.materials)).toEqual({
      "LF Autopuppet Kernel": 25,
      "MF Autopuppet Kernel": 25,
      "HF Autopuppet Kernel": 25,
      "FF Autopuppet Kernel": 45,
      "Broken String": 25,
      "Spliced String": 25,
      "Solidified String": 40,
      "Melodic String": 55,
      "Remnant of the Wheel": 20,
    });
    const extras = part(c, "extras");
    expect(extras.counted).toBe(true);
    expect(extras.credits).toBe(630_000); // inherents 10,000 + 20,000, stat bonuses 4 × (50,000 + 100,000)
    expect(mats(extras.materials)).toEqual({
      "MF Autopuppet Kernel": 3,
      "HF Autopuppet Kernel": 15,
      "FF Autopuppet Kernel": 12,
      "Broken String": 3,
      "Solidified String": 15,
      "Melodic String": 12,
      "Remnant of the Wheel": 6,
    });
    const weapon = part(c, "weapon");
    expect(weapon.exp).toBe(2_692_400);
    expect(weapon.expCredits).toBe(1_076_960);
    expect(weapon.credits).toBe(1_406_960); // + 330,000 for the six ascensions
    expect(weapon.expItem).toMatchObject({ name: "Premium Energy Core", count: 135 });
    expect(mats(weapon.materials)).toEqual({
      "LF Exoswarm Core": 6,
      "MF Exoswarm Core": 6,
      "HF Exoswarm Core": 10,
      "FF Exoswarm Core": 12,
      "Spliced String": 6,
      "Broken String": 8,
      "Solidified String": 6,
      "Melodic String": 20,
    });
    expect(c.total.credits).toBe(1_023_300 + 1_400_000 + 630_000 + 1_406_960);
    expect(mats(c.total.expItems)).toEqual({ "Premium Resonance Potion": 122, "Premium Energy Core": 135 });
    expect(mats(c.total.materials)["Melodic String"]).toBe(55 + 12 + 20);
  });

  it("Changli (1.1 5★): ascension and Forte as Kuro's wiki lists them", () => {
    const c = scratch("Changli");
    expect(part(c, "level").credits).toBe(1_023_300);
    expect(mats(part(c, "level").materials)).toEqual({ "Crude Ring": 4, "Basic Ring": 12, "Improved Ring": 12, "Tailored Ring": 4, "Rage Tacet Core": 46, "Pavo Plum": 60 });
    expect(part(c, "forte").credits).toBe(1_400_000);
    expect(mats(part(c, "forte").materials)).toMatchObject({ "Inert Metallic Drip": 25, "Heterized Metallic Drip": 55, "Sentinel's Dagger": 20, "Tailored Ring": 45 });
    // the inherent skills use tier 2 then tier 3 (the Fandom template's tier 1 / tier 2 is wrong)
    expect(mats(part(c, "extras").materials)).toEqual({
      "Basic Ring": 3,
      "Improved Ring": 15,
      "Tailored Ring": 12,
      "Reactive Metallic Drip": 3,
      "Polarized Metallic Drip": 15,
      "Heterized Metallic Drip": 12,
      "Sentinel's Dagger": 6,
    });
    expect(c.parts.some((p) => p.kind === "weapon")).toBe(false);
    expect(c.total.credits).toBe(3_053_300);
  });

  it("Mortefi (4★) costs what a 5★ does, in his own materials", () => {
    const c = scratch("Mortefi");
    expect(mats(part(c, "level").materials)).toEqual({ "LF Whisperin Core": 4, "MF Whisperin Core": 12, "HF Whisperin Core": 12, "FF Whisperin Core": 4, "Rage Tacet Core": 46, Coriolus: 60 });
    expect(mats(part(c, "forte").materials)).toMatchObject({ "Impure Phlogiston": 25, "Flawless Phlogiston": 55, "Monument Bell": 20 });
    expect(c.total.credits).toBe(3_053_300);
  });

  it("a 4★ weapon and a 1★ weapon that stops at 70", () => {
    const four = part(scratch("Mortefi", "CommandoOfConviction"), "weapon");
    expect(four.exp).toBe(2_289_200);
    expect(mats(four.materials)).toEqual({
      "LF Howler Core": 5,
      "MF Howler Core": 5,
      "HF Howler Core": 9,
      "FF Howler Core": 11,
      "Inert Metallic Drip": 5,
      "Reactive Metallic Drip": 7,
      "Polarized Metallic Drip": 5,
      "Heterized Metallic Drip": 17,
    });
    expect(four.credits).toBe(Math.round(2_289_200 * 0.4) + 264_000);
    const one = Object.entries(data.weapons).find(([, w]) => w.rarity === 1)!;
    const p = part(scratch("Mortefi", one[0]), "weapon");
    expect(p.title).toBe("Weapon 1 → 70");
    expect(p.exp).toBe(data.weaponExp.perLevel["1"].reduce((s, v) => s + v, 0));
  });

  it("Training Broadblade (1★) has four ascensions, 26,000 Shell Credits, as the Fandom wiki lists; at 70 nothing is left", () => {
    const p = part(scratch("Mortefi", "TrainingBroadblade"), "weapon");
    expect(p.ascensions).toBe(4);
    expect(p.credits - p.expCredits).toBe(26_000);
    expect(mats(p.materials)).toMatchObject({ "LF Whisperin Core": 2, "MF Whisperin Core": 2, "HF Whisperin Core": 3 });
    expect(mats(p.materials)["FF Whisperin Core"]).toBeUndefined();
    const at70 = part(
      costToMax(data, "Mortefi", savedProgressOf({ weapon: "TrainingBroadblade", weapons: { TrainingBroadblade: { weaponLevel: "70" } } }), { from: "saved" })!,
      "weapon",
    );
    expect(at70).toMatchObject({ title: "Weapon 70 → 70", ascensions: 0, credits: 0, materials: [] });
    // a priced row at the cap (the 1★ / 2★ tables carry one) is never counted
    const capped: MaterialsData = { ...data, weapons: { ...data.weapons, X: { ...data.weapons.TrainingBroadblade, asc: [...data.weapons.TrainingBroadblade.asc, [70, [[data.credit, 16_000]]]] } } };
    const x = costToMax(capped, "Mortefi", { level: null, talents: {}, weapon: "X", weaponLevel: "70" }, { from: "saved" })!;
    expect(part(x, "weapon").credits).toBe(0);
    expect(part(costToMax(capped, "Mortefi", { level: null, talents: {}, weapon: "X", weaponLevel: null }, { from: "scratch" })!, "weapon").ascensions).toBe(4);
  });
});

describe("from saved levels", () => {
  it("counts what is left: level 50+, Forte 6 / 10 / 10 / 8 / 1, weapon 80", () => {
    const saved = savedProgressOf({
      characterLevel: "50+",
      talents: { basic: "6", skill: "10", forte: 10, liberation: "8" },
      weapon: "BloomingJadehaven",
      weapons: { BloomingJadehaven: { refinement: "1", weaponLevel: "80" } },
    });
    expect(saved).toEqual({ level: "50+", talents: { basic: 6, skill: 10, forte: 10, liberation: 8 }, weapon: "BloomingJadehaven", weaponLevel: "80" });
    const c = costToMax(data, "Hsin", saved, { from: "saved" })!;
    const level = part(c, "level");
    const exp50 = data.resonatorExp.perLevel.slice(49).reduce((s, v) => s + v, 0);
    expect(level.exp).toBe(exp50);
    expect(level.ascensions).toBe(3); // 60, 70, 80 (the one at 50 is paid: "50+")
    expect(level.credits).toBe(Math.round(exp50 * 0.35) + 20_000 + 40_000 + 80_000);
    expect(level.assumed).toBe(false);
    const forte = part(c, "forte");
    expect(forte.title).toBe("Forte 6 / 10 / 10 / 8 / 10 → 10");
    expect(forte.assumed).toBe(true); // intro not saved → 10
    // 6 → 10 = 30,000 + 50,000 + 70,000 + 100,000; 8 → 10 = 70,000 + 100,000
    expect(forte.credits).toBe(250_000 + 170_000);
    const extras = part(c, "extras");
    expect(extras.counted).toBe(false);
    const weapon = part(c, "weapon");
    expect(weapon.ascensions).toBe(1); // the one at 80
    expect(weapon.exp).toBe(data.weaponExp.perLevel["5"].slice(79).reduce((s, v) => s + v, 0));
    expect(c.total.credits).toBe(level.credits + forte.credits + weapon.credits); // the extras are not added in
  });

  it("nothing saved reads as maxed, flags every guess, and is 'done'", () => {
    const saved = savedProgressOf({ weapon: "DefiersThorn", weapons: { DefiersThorn: { refinement: "5" } } });
    expect(hasSavedProgress(saved)).toBe(false);
    const c = costToMax(data, "Cartethyia", saved, { from: "saved" })!;
    expect(c.done).toBe(true);
    expect(c.total.credits).toBe(0);
    expect(c.parts.filter((p) => p.assumed).map((p) => p.kind)).toEqual(["level", "forte", "weapon"]);
    expect(part(c, "level").title).toBe("Level 90 → 90");
  });

  it("level 40 still owes the ascension at 40; 40+ does not", () => {
    const at = (level: string) => part(costToMax(data, "Changli", savedProgressOf({ characterLevel: level }), { from: "saved" })!, "level");
    expect(at("40").ascensions).toBe(5);
    expect(at("40+").ascensions).toBe(4);
    expect(at("40").exp).toBe(at("40+").exp);
    expect(at("1").ascensions).toBe(6);
    expect(at("80+").ascensions).toBe(0);
  });

  it("anything below the top counts as saved progress; junk does not", () => {
    expect(hasSavedProgress(savedProgressOf({ characterLevel: "90" }))).toBe(false);
    expect(hasSavedProgress(savedProgressOf({ characterLevel: "70+" }))).toBe(true);
    expect(hasSavedProgress(savedProgressOf({ talents: { intro: "9" } }))).toBe(true);
    expect(hasSavedProgress(savedProgressOf({ weapon: "DefiersThorn", weapons: { DefiersThorn: { weaponLevel: "20" } } }))).toBe(true);
    expect(savedProgressOf({ characterLevel: "abc", talents: { basic: "11" } })).toEqual({ level: null, talents: {}, weapon: null, weaponLevel: null });
    expect(parseLevel("20+")).toEqual({ level: 20, ascended: true });
    expect(parseLevel(1)).toEqual({ level: 1, ascended: false });
    expect(parseLevel("95")).toBeNull();
  });

  it("the note names only what the store really lacks", () => {
    const words = (record: Record<string, unknown>, from: "saved" | "scratch" = "saved"): string => {
      const saved = savedProgressOf(record);
      return unsavedWords(costToMax(data, "Cartethyia", saved, { from })!, saved);
    };
    const talents = { basic: "10", skill: "10", forte: "10", liberation: "10", intro: "10" };
    const weapon = "DefiersThorn";
    expect(words({ weapon })).toBe("level, Forte levels or weapon level");
    expect(words({})).toBe("level or Forte levels"); // no weapon, so no weapon level to miss
    // all five Forte skills saved at 10: nothing sits below the top, yet they are saved
    expect(words({ talents, weapon })).toBe("level or weapon level");
    expect(words({ talents: { intro: "10" }, weapon })).toBe("level, other Forte levels or weapon level");
    expect(words({ characterLevel: "90", talents, weapon })).toBe("weapon level");
    expect(words({ characterLevel: "90", talents, weapon, weapons: { [weapon]: { weaponLevel: "90" } } })).toBe("");
    expect(words({ weapon }, "scratch")).toBe(""); // from level 1 nothing is taken on trust
  });

  it("an unknown character has no entry", () => {
    expect(costToMax(data, "Nobody", savedProgressOf({}), { from: "scratch" })).toBeNull();
  });
});
