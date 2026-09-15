// Wuthering Tools+: the TypeScript cast mapper must reproduce the validated
// Python mapper (wuwa-tools/rotation-port) on Riley's executed loops.
import { describe, expect, it, vi } from "vitest";
import loops from "./__fixtures__/wuwaCalcLoops.json";
import { getCharByName } from "../../characters/characters";
import { mainEchoesData } from "../../echoes/index";
import { OVERRIDES, appKeyOf, appRowsOf, echoRowsOf, emptyReport, enemyConfigOf, enemyStacksOf, knownRatios, mvOf, ratio, rileyNameOf, toActions, type Cast } from "./castMapper";
// Riley's tables grew (Sept 2026): this replay takes more than vitest's 5 s default under a full-suite run
vi.setConfig({ testTimeout: 60_000 });

describe("cast mapper: primitives", () => {
  it("sums level-10 talent expressions into motion values", () => {
    expect(mvOf("37.88%*4+117.83%*3")).toBe(505.01);
    expect(mvOf("105.97%*2")).toBe(211.94);
    expect(mvOf("20.00%+100")).toBe(20);
    expect(mvOf("abc")).toBeNull();
    expect(mvOf(null)).toBeNull();
  });
  it("matches Python's difflib ratio on simple cases", () => {
    expect(ratio("abcd", "abcd")).toBe(1);
    expect(ratio("abcd", "bcde")).toBeCloseTo(0.75, 5);
    expect(ratio("", "x")).toBe(0);
  });
  it("reads the enemy debuffs a traced hit held", () => {
    expect(enemyStacksOf([{ name: "Havoc Bane x6" }, { name: "Chisa: Unseen Snare - Finality" }, { name: "Tune Strain - Interfered x3" }, { name: "Electro Flare x13 (tick in 2s)" }])).toEqual({ havocBane: 6, strain: 3, electroFlare: 13 });
    expect(enemyStacksOf([])).toBeUndefined();
    expect(enemyStacksOf(null)).toBeUndefined();
  });
  it("derives a loop's team enemy settings: tick ceilings, held debuffs on most casts, panel caps", () => {
    const cast = (name: string, mv: number | null, count = 1, held?: Cast["held"]): Cast => ({ name, mv, count, cast: null, node: null, held });
    expect(
      enemyConfigOf([
        cast("Aero Erosion - 3 Stacks", 225, 2, { aeroErosion: 3, havocBane: 6 }),
        cast("Basic - Sword 1", 50, 1, { havocBane: 6 }),
        cast("Aero Erosion - 12 Stacks", 225, 1, { aeroErosion: 12, havocBane: 6 }),
        cast("Skill - Something", 100, 1, { havocBane: 9, strain: 3 }),
        cast("Electro Flare - 16 Stacks", 50, 1, { electroFlare: 16, electroRage: 4 }),
        cast("Electro Rage - 2 Stacks", 50, 1),
        cast("Utility - Dodge", 0, 1, { havocBane: 9 }),
      ]),
      // Havoc Bane 6 and 9 each held on one damage cast, Tune Strain 0 and 3 likewise: the tie goes to the higher count
    ).toEqual({ spectroFrazzleStacks: 0, aeroErosionStacks: 12, havocBaneStacks: 9, fusionBurstStacks: 0, electroFlareStacks: 13, electroRageStacks: 4, glacioChafeStacks: 0, strainStacks: 3 });
    // the count held on most damage casts wins outright
    expect(enemyConfigOf([cast("Basic 1", 50, 3, { havocBane: 6 }), cast("Skill", 100, 1, { havocBane: 9 })]).havocBaneStacks).toBe(6);
    // a tie on the held count goes to the higher stack
    expect(enemyConfigOf([cast("Basic 1", 50, 1, { havocBane: 3 }), cast("Basic 2", 50, 1, { havocBane: 6 })]).havocBaneStacks).toBe(6);
  });
  it("maps Riley's resonator names to app keys and back", () => {
    expect(appKeyOf("Xuanling")).toBe("YangyangXuanling");
    expect(appKeyOf("Aero Rover")).toBe("RoverAeroFemale");
    expect(appKeyOf("Luuk Herssen")).toBe("LuukHerssen");
    expect(appKeyOf("Aemeath")).toBe("Aemeath");
    expect(rileyNameOf("YangyangXuanling")).toBe("Xuanling");
    expect(rileyNameOf("RoverAeroFemale")).toBe("Aero Rover");
    expect(rileyNameOf("RoverAeroMale")).toBe("Aero Rover");
    expect(rileyNameOf("Roverelectromale")).toBe("Electro Rover");
    expect(rileyNameOf("Aemeath")).toBe("Aemeath");
  });
});

describe("cast mapper: Riley's loops replayed", () => {
  it("reproduces the Python mapper's actions for every fixture loop", async () => {
    const echoRows = echoRowsOf(mainEchoesData as never);
    const rowsByKey = new Map<string, ReturnType<typeof appRowsOf>>();
    const castsByResonator = new Map<string, Cast[]>();
    for (const loop of loops) castsByResonator.set(loop.resonator, [...(castsByResonator.get(loop.resonator) ?? []), ...(loop.casts as Cast[])]);
    let checked = 0;
    for (const loop of loops) {
      if (!rowsByKey.has(loop.appKey)) rowsByKey.set(loop.appKey, appRowsOf((await getCharByName(loop.appKey)) as Record<string, unknown>));
      const rows = rowsByKey.get(loop.appKey)!;
      const overrides = OVERRIDES[loop.resonator] ?? {};
      // kit multipliers: recomputed over the fixture's loops must match Python on the same loops …
      const ratios = knownRatios(castsByResonator.get(loop.resonator)!, rows, overrides);
      expect([...ratios].sort((a, b) => a - b), `${loop.resonator} ratios`).toEqual(loop.ratiosTop3);
      // … and the actions are mapped with the pooled set Python used (every loop of the character)
      const report = emptyReport();
      const actions = toActions(loop.casts as Cast[], rows, echoRows, overrides, report, new Set(loop.ratiosPooled));
      const got = actions.map((a) => [a.key, a.type, a.count, a.mainEcho ?? null, a.negativeStatusStacks ?? null]);
      expect(got, `${loop.resonator} loop ${checked}`).toEqual(loop.expected);
      expect(report.unmatched, `${loop.resonator} unmatched`).toEqual(loop.unmatched);
      // … and the team enemy settings read off the loop (negative-status ceilings, the debuffs held on most casts)
      expect(enemyConfigOf(loop.casts as Cast[]), `${loop.resonator} enemy`).toEqual(loop.enemy);
      checked += 1;
    }
    expect(checked).toBe(loops.length);
  });
});
