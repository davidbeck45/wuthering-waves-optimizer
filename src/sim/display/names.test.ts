// Wuthering Tools+: display names for registry keys (the /my-rankings audit found "EverbrightPolestar" and
// "RoverAeroFemale" on screen).
import { describe, expect, it } from "vitest";
import { characterDisplayName, characterMeta, characterShortName, elementColor, isRosterCharacter, weaponDisplayName, weaponIconUrl, weaponMeta } from "./names";

describe("display names", () => {
  it("names characters the way the pickers do, every Rover form alike", () => {
    expect(characterDisplayName("Aemeath")).toBe("Aemeath");
    expect(characterDisplayName("RoverAeroFemale")).toBe("Rover Aero (Female)");
    expect(characterDisplayName("RoverAeroMale")).toBe("Rover Aero (Male)");
    expect(characterDisplayName("Roverelectrofemale")).toBe("Rover Electro (Female)");
    expect(characterDisplayName("Roverelectromale")).toBe("Rover Electro (Male)");
    expect(characterDisplayName("LuukHerssen")).toBe("Luuk Herssen");
    expect(characterDisplayName("NotACharacter")).toBe("NotACharacter");
    expect(characterDisplayName(null)).toBe("");
    expect(characterShortName("RoverSpectroMale")).toBe("Rover Spectro");
    expect(characterShortName("YangyangXuanling")).toBe("Xuanling");
  });

  it("reads element and rarity, and draws portraits only for roster characters", () => {
    expect(characterMeta("Aemeath")).toMatchObject({ element: "Fusion", rarity: 5 });
    expect(characterMeta("Sanhua")).toMatchObject({ element: "Glacio", rarity: 4 });
    expect(characterMeta("Nobody")).toBeNull();
    expect(elementColor("Havoc")).toMatch(/^#/);
    expect(elementColor(null)).toContain("oklch");
    expect(isRosterCharacter("Aemeath")).toBe(true);
    expect(isRosterCharacter("Suoming")).toBe(true); // released 2026-10 (Ryan #655–#672)
    expect(isRosterCharacter("Lily")).toBe(false); // a wuwa_calc kit the app has no folder for, named by stock presets
  });

  it("names weapons from the registry with their rarity and art", () => {
    expect(weaponDisplayName("EverbrightPolestar")).toBe("Everbright Polestar");
    expect(weaponDisplayName("DefiersThorn")).toBe("Defier's Thorn");
    expect(weaponMeta("EverbrightPolestar")).toMatchObject({ rarity: 5, type: "Swords" });
    expect(weaponMeta("Variation")?.rarity).toBe(4);
    expect(weaponDisplayName("SomeNewBlade")).toBe("Some New Blade");
    expect(weaponDisplayName(null)).toBe("");
    expect(weaponIconUrl("RedSpring")).toMatch(/\/weapons\/RedSpring\.png$/);
  });
});
