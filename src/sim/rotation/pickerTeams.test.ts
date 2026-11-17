// Wuthering Tools+ — /rotation's picker and a male Rover. The stock teams are filed under the female Rover key, and the
// picker listed them as they came: a male Rover's account saw "RoverElectroFemale · Mornye + Lynae" with her portrait
// and an address naming her key, and a team opened that way (or by its wuwa_calc key, which names the female form too)
// was not taken for the team he had saved, so its pinned builds were not read. Every Rover element, both genders.
import { describe, expect, it } from "vitest";
import type { TeamRotationPreset } from "../../teamRotations/presets";
import { rileyAccountForTeam, rileyAccountOf, savedTeamOf } from "../engine/rileyAccount";
import { loadWuwaCalcTeamPresets } from "../presets";
import { memberKeysOf, rileyTeamTarget, type RileyToolEngine } from "../ai/tools/riley";
import type { ExportFile } from "../cli/exportShape";
import { rotationPath } from "./hash";
import { stockEntries } from "./pickerTeams";

/* eslint-disable @typescript-eslint/no-explicit-any */

const FORMS = [
  { element: "Aero", female: "RoverAeroFemale", male: "RoverAeroMale" },
  { element: "Electro", female: "Roverelectrofemale", male: "Roverelectromale" },
  { element: "Spectro", female: "RoverSpectroFemale", male: "RoverSpectroMale" },
  { element: "Havoc", female: "RoverHavocFemale", male: "RoverHavocMale" },
] as const;
const built = { weapon: "BloodpactsPledge" };
/** a stock team as the generator files it: the Rover under the female key, in the main DPS slot or a support's */
const preset = (ids: string[], name = "stock"): TeamRotationPreset => ({ name, author: "wuwa_calc", data: { characterIds: ids, actions: [], handoffs: { [ids[0]!]: [ids[1]!] } } }) as unknown as TeamRotationPreset;

describe("the stock teams /rotation's picker lists", () => {
  it.each(FORMS)("names a $element Rover team by the Rover the account plays", (f) => {
    const presets = [preset([f.female, "Mornye", "Lynae"]), preset(["Phoebe", "Chisa", f.female])];
    const short = `Rover ${f.element}`;
    for (const account of [{ [f.male]: built }, { RoverAeroMale: built }, { RoverHavocMale: built, Mornye: built }]) {
      const [main, support] = stockEntries(presets, account);
      expect(main!.chars).toEqual([f.male, "Mornye", "Lynae"]);
      expect(main!.title).toBe(`${short} · Mornye + Lynae`);
      expect(rotationPath({ kind: "chars", chars: main!.chars })).toBe(`/rotation#chars=${f.male},Mornye,Lynae`);
      expect(support!.chars).toEqual(["Phoebe", "Chisa", f.male]);
      expect(support!.title).toBe(`Phoebe · Chisa + ${short}`);
      expect(JSON.stringify([main, support])).not.toContain(f.female);
    }
    // a female Rover, no Rover at all, no account: the key as the presets file it
    for (const account of [{ [f.female]: built }, { RoverSpectroFemale: built }, { Mornye: built }, {}, null]) {
      const [main] = stockEntries(presets, account);
      expect(main!.chars).toEqual([f.female, "Mornye", "Lynae"]);
      expect(main!.title).toBe(`${short} · Mornye + Lynae`);
    }
    // never the presets' own objects: the next reader still finds the generated key
    expect(presets[0]!.data.characterIds).toEqual([f.female, "Mornye", "Lynae"]);
  });

  it("lists each composition once, three members only, titled by its main DPS with short names", () => {
    const entries = stockEntries(
      [preset(["YangyangXuanling", "Suisui", "Chisa"], "a"), preset(["Chisa", "YangyangXuanling", "Suisui"], "the same three"), preset(["Aemeath", "Mornye"], "two"), preset(["Aemeath", "Mornye", "Lynae"], "b")],
      { RoverAeroMale: built },
    );
    expect(entries.map((e) => e.title)).toEqual(["Xuanling · Suisui + Chisa", "Aemeath · Mornye + Lynae"]);
    expect(entries.map((e) => e.id)).toEqual(["Chisa+Suisui+YangyangXuanling", "Aemeath+Lynae+Mornye"]);
  });

  it("gives a male Rover every Rover team of the bundled presets under his keys", async () => {
    const presets = await loadWuwaCalcTeamPresets();
    const female = stockEntries(presets, {});
    const male = stockEntries(presets, { RoverAeroMale: built });
    const rover = (e: { chars: string[] }): boolean => e.chars.some((c) => /^rover/i.test(c));
    expect(female.filter(rover).length).toBeGreaterThan(3);
    expect(male).toHaveLength(female.length);
    for (const e of male.filter(rover)) expect(e.chars.filter((c) => /^rover/i.test(c)).every((c) => /(?<!fe)male$/i.test(c)), e.title).toBe(true);
    for (const e of male) expect(e.title, e.id).not.toMatch(/RoverElectro|Female|\(Male\)/);
    // everyone else's tiles are the same tiles
    expect(male.filter((e) => !rover(e))).toEqual(female.filter((e) => !rover(e)));
  });
});

describe("a male Rover's saved team, named by wuwa_calc's (female) key", () => {
  const f = FORMS[1];
  const characters: Record<string, any> = {
    [f.male]: { weapon: "BloodpactsPledge", weapons: { BloodpactsPledge: { refinement: "1" } }, activeBuildId: "live", builds: [{ id: "plan", name: "Account plan", weapon: "BloodpactsPledge", weapons: { BloodpactsPledge: { refinement: "5" } } }] },
    Mornye: { weapon: "StarfieldCalibrator" },
    Lynae: { weapon: "SpectrumBlaster" },
  };
  const saved = { id: "t-rover", name: "My Rover team", characterIds: [f.male, "Mornye", "Lynae"], buildIds: ["plan", null, null] };

  it("is found from the composition in either gender, any order", () => {
    expect(savedTeamOf([saved], [f.female, "Mornye", "Lynae"])).toBe(saved);
    expect(savedTeamOf([saved], ["Lynae", f.male, "Mornye"])).toBe(saved);
    expect(savedTeamOf([saved], [f.female, "Mornye", "Verina"])).toBeNull();
    // another element's Rover is another resonator build: not this team
    expect(savedTeamOf([saved], ["RoverSpectroFemale", "Mornye", "Lynae"])).toBeNull();
  });

  it("runs at its own account from his key: the pinned build, not the active one", () => {
    const inventory = { echoes: [], equipped: {} };
    const base = rileyAccountOf(characters, inventory, [saved]);
    // /rotation#team=t… reads the members off his list (the female key) and asks for the saved team of those three
    const own = rileyAccountForTeam(savedTeamOf([saved], [f.female, "Mornye", "Lynae"]), characters, inventory, [saved], { base });
    expect(own).not.toBe(base);
    expect(own.entries["Electro Rover"]!.refine).toBe(5);
    expect(base.entries["Electro Rover"]!.refine).toBe(1);
  });

  it("is the team the assistant's tools read for his key, and its builds are read under the keys the team lists", async () => {
    const exp = { characters, inventory: { echoes: [], equipped: {} }, teams: [saved] } as unknown as ExportFile;
    const riley = { teams: async () => [{ key: "t9", members: [{ name: "Electro Rover", appKey: f.female }, { name: "Mornye", appKey: "Mornye" }, { name: "Lynae", appKey: "Lynae" }] }] } as unknown as RileyToolEngine;
    const target = await rileyTeamTarget("t9", exp, riley);
    expect(target.saved).toBe(saved);
    expect(target.name).toBe("My Rover team");
    // the Energy Regen beside the team is looked up under the saved team's own member keys
    expect(memberKeysOf(target)).toEqual([f.male, "Mornye", "Lynae"]);
    // three nobody saved: the keys the argument gave
    const unsaved = await rileyTeamTarget("t9", { ...exp, teams: [] } as unknown as ExportFile, riley);
    expect(unsaved.saved).toBeNull();
    expect(memberKeysOf(unsaved)).toEqual(unsaved.characterIds);
  });
});
