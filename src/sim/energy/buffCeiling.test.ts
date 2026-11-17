import { describe, expect, it } from "vitest";
import { buffCeilingNote, erBuffCeiling } from "./buffCeiling";

describe("erBuffCeiling: where a kit's own team buffs stop growing with Energy Regen", () => {
  it("reads Lily's 260 % off her buffs, a stack's own cap and not the four stacks' total", () => {
    // Dream Aroma: 0.1 % ATK per 1 % above 190 %, "up to 7 %" a stack, 28 % over four. 190 + 70 = 260, not 190 + 280
    expect(erBuffCeiling("Lily")).toEqual({ at: 260, buffs: ["Dream Aroma", "Silvered Dream"] });
  });

  it("knows the three kits that had such buffs before her, and nobody else", () => {
    expect(erBuffCeiling("Suisui")?.at).toBe(260);
    expect(erBuffCeiling("Mornye")).toEqual({ at: 260, buffs: ["Interfered Marker"] });
    expect(erBuffCeiling("Shorekeeper")).toEqual({ at: 250, buffs: ["Sophisticated Stellarealm", "Supernal Stellarealm"] });
    // a buff that scales on Crit Rate is no Energy Regen ceiling, and most kits have neither
    expect(erBuffCeiling("Qiuyuan")).toBeNull();
    expect(erBuffCeiling("Galbrena")).toBeNull();
    expect(erBuffCeiling("Nobody")).toBeNull();
  });
});

describe("buffCeilingNote: said beside a need that is lower than the ceiling", () => {
  const lily = { at: 260, buffs: ["Dream Aroma", "Silvered Dream"] };

  it("says how far a build is below it, in Energy Regen points", () => {
    // need 172.6 % (her Liberation in the loop), build at 239.8 %: the row read "ok · +67.2 %" and nothing else
    expect(buffCeilingNote("Lily", lily, 172.6, 239.8)).toEqual({
      below: true,
      text: "Lily's team buffs (Dream Aroma, Silvered Dream) grow with Lily's Energy Regen up to 260%. This build has 239.8%: 20.2 points more would raise them.",
    });
  });

  it("says so when the build is at the ceiling", () => {
    expect(buffCeilingNote("Lily", lily, 172.6, 261.8)).toEqual({
      below: false,
      text: "Lily's team buffs (Dream Aroma, Silvered Dream) grow with Lily's Energy Regen up to 260%. This build has 261.8%, so they are full.",
    });
  });

  it("has nothing to add where the need already asks for it, or where the kit has no such buff", () => {
    // Mornye: wuwa_calc's kit floor is 260 %, the same figure
    expect(buffCeilingNote("Mornye", { at: 260, buffs: ["Interfered Marker"] }, 260, 287)).toBeNull();
    expect(buffCeilingNote("Galbrena", null, 116.5, 118.4)).toBeNull();
  });

  it("names the ceiling alone for a member with no build to compare", () => {
    expect(buffCeilingNote("Lily", lily, 172.6, null)?.text).toBe("Lily's team buffs (Dream Aroma, Silvered Dream) grow with Lily's Energy Regen up to 260%.");
    expect(buffCeilingNote("Lily", lily, null, null)?.below).toBe(false);
  });
});
