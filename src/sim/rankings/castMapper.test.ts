// Wuthering Tools+: the TypeScript cast mapper must reproduce the validated
// Python mapper (wuwa-tools/rotation-port) on Riley's executed loops.
import { describe, expect, it, vi } from "vitest";
import loops from "./__fixtures__/wuwaCalcLoops.json";
import { getCharByName } from "../../characters/characters";
import { mainEchoesData } from "../../echoes/index";
import { OVERRIDES, appKeyOf, appRowsOf, duetBurstOf, echoRowsOf, fusionBurstCapOf, emptyReport, enemyConfigOf, enemyStacksOf, finishTicks, knownRatios, mvOf, ratio, rileyNameOf, toActions, type AppRow, type Cast, type TickState } from "./castMapper";
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
        // Riley revokes Rage in the hook that fires the Flare tick, so the count comes off the Rage tick that follows
        cast("Electro Flare - 16 Stacks", 50, 1, { electroFlare: 16 }),
        cast("Electro Rage - 2 Stacks", 50, 1),
        cast("Utility - Dodge", 0, 1, { havocBane: 9 }),
      ]),
      // Havoc Bane 6 and 9 each held on one damage cast, Tune Strain 0 and 3 likewise: the tie goes to the higher count
    ).toEqual({ spectroFrazzleStacks: 0, aeroErosionStacks: 12, havocBaneStacks: 9, fusionBurstStacks: 0, electroFlareStacks: 13, electroRageStacks: 2, glacioChafeStacks: 0, strainStacks: 3 });
    // and the Flare tick's own action carries that Rage count
    const flareRows: AppRow[] = [{ group: "basic", key: "X", label: "X", mv: 10 }];
    const flare = toActions([cast("Electro Flare - 10 Stacks", 50, 1, { electroFlare: 10 }), cast("Electro Rage - 5 Stacks", 50, 1)], flareRows, {}, {}, emptyReport(), new Set());
    expect(flare.map((a) => [a.key, a.negativeStatusStacks, a.electroRageStacks])).toEqual([["ElementalEffectElectroFlare", 10, 5]]);
    // the count held on most damage casts wins outright
    expect(enemyConfigOf([cast("Basic 1", 50, 3, { havocBane: 6 }), cast("Skill", 100, 1, { havocBane: 9 })]).havocBaneStacks).toBe(6);
    // a tie on the held count goes to the higher stack
    expect(enemyConfigOf([cast("Basic 1", 50, 1, { havocBane: 3 }), cast("Basic 2", 50, 1, { havocBane: 6 })]).havocBaneStacks).toBe(6);
  });
  it("presses Aemeath's Seraphic Duet: Fusion Burst as her Fusion Burst tick at cap with the run's multiplier", () => {
    const rows: AppRow[] = [{ group: "forteCircuit", key: "SeraphicDuetBonusDMGPerInstance", label: "Seraphic Duet Bonus DMG", mv: 546.75 }];
    const duet: Cast = { name: "Forte - Seraphic Duet: Fusion Burst", mv: 0, mvRun: 19561.64, count: 1, cast: null, node: "Forte" };
    const tick: Cast = { name: "Fusion Burst - 13 Stacks", mv: 1397.26, count: 1, cast: null, node: null };
    const report = emptyReport();
    const acts = toActions([duet, tick], rows, {}, {}, report, new Set());
    expect(acts.map((a) => [a.key, a.type, a.negativeStatusStacks, a.buffs, Object.keys(a.advancedConfig?.buffs ?? {})])).toEqual([
      ["ElementalEffectFusionBurst", "negativeStatus", 13, [{ modifier: "talentModifierMultiply", modifierValue: 1300 }], ["SeraphicDuetFusionBurst", "StardustResonance"]],
      ["ElementalEffectFusionBurst", "negativeStatus", 13, [], ["SeraphicDuetFusionBurst", "StardustResonance"]],
    ]);
    expect(report.multipliers).toEqual(["Forte - Seraphic Duet: Fusion Burst = ElementalEffectFusionBurst @13 × 14.00 (Fusion Trail / Stardust from the run)"]);
    // the cap comes from the loop's own ticks (10 without Denia, 13 beside her), never from the run MV alone
    expect(fusionBurstCapOf([{ name: "Fusion Burst - 10 Stacks", mv: 698.63, count: 1, cast: null, node: null }])).toBe(10);
    expect(fusionBurstCapOf([duet])).toBe(10);
    expect(duetBurstOf({ ...duet, mvRun: 698.63 * 4 }, 10)).toEqual({ cap: 10, mult: 3 });
    // per-hit calls (the team path) take the cap from the caller
    const one = toActions([duet], rows, {}, {}, emptyReport(), new Set(), undefined, 13);
    expect(one[0].negativeStatusStacks).toBe(13);
    // on anyone else's rows the cast stays a 0-MV skip
    const other = emptyReport();
    expect(toActions([duet], [{ group: "basic", key: "X", label: "X", mv: 10 }], {}, {}, other, new Set())).toEqual([]);
    expect(other.skipped).toEqual(["Forte - Seraphic Duet: Fusion Burst (0 MV)"]);
  });
  it("collapses single ticks into the app's N-tick row across per-hit calls when the tick state is shared", () => {
    // Cantarella's Liberation - Diffusion: Riley fires 31 ticks of 14.54; the app's DiffusionDMG row is 21 of them
    const rows: AppRow[] = [{ group: "liberation", key: "DiffusionDMG", label: "Diffusion DMG", mv: 305.34 }];
    const tick = (): Cast => ({ name: "Liberation - Diffusion", mv: 14.54, count: 1, cast: "Liberation", node: "Liberation" });
    // one call over the whole loop (the rotation path): one row, 31/21 ≈ 1 press
    const whole = toActions(Array.from({ length: 31 }, tick), rows, {}, {}, emptyReport(), new Set());
    expect(whole.map((a) => [a.key, a.count])).toEqual([["DiffusionDMG", 1]]);
    // one call per hit with a shared tick state (the team path): the same, once finishTicks settles it
    const shared: TickState = new Map();
    const report = emptyReport();
    const perHit = Array.from({ length: 31 }, () => toActions([tick()], rows, {}, {}, report, new Set(), shared)).flat();
    finishTicks(shared, report);
    expect(perHit.map((a) => [a.key, a.count])).toEqual([["DiffusionDMG", 1]]);
    expect(report.skipped).toEqual(["31 ticks of DiffusionDMG -> 1x the app's 21-hit row"]);
    // without sharing, every hit became a full row — the 2026-09-14 team-import bug (31 rows, 21× the damage)
    const unshared = Array.from({ length: 31 }, () => toActions([tick()], rows, {}, {}, emptyReport(), new Set())).flat();
    expect(unshared).toHaveLength(31);
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
      const got = actions.map((a) => [a.key, a.type, a.count, a.mainEcho ?? null, a.negativeStatusStacks ?? null, a.buffs.find((b) => b.modifier === "talentModifierMultiply")?.modifierValue ?? null]);
      expect(got, `${loop.resonator} loop ${checked}`).toEqual(loop.expected);
      expect(report.unmatched, `${loop.resonator} unmatched`).toEqual(loop.unmatched);
      // … and the team enemy settings read off the loop (negative-status ceilings, the debuffs held on most casts)
      expect(enemyConfigOf(loop.casts as Cast[]), `${loop.resonator} enemy`).toEqual(loop.enemy);
      checked += 1;
    }
    expect(checked).toBe(loops.length);
  });
});
