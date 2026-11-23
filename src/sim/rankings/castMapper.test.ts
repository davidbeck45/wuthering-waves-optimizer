// Wuthering Tools+: the TypeScript cast mapper must reproduce the validated
// Python mapper (wuwa-tools/rotation-port) on Riley's executed loops.
import { describe, expect, it, vi } from "vitest";
import loops from "./__fixtures__/wuwaCalcLoops.json";
import { getCharByName } from "../../characters/characters";
import { mainEchoesData } from "../../echoes/index";
import { DIFFERS, OVERRIDES, appKeyOf, appRowsOf, duetBurstOf, echoRowsOf, echoStage, fusionBurstCapOf, emptyReport, enemyConfigOf, enemyStacksOf, finishTicks, knownRatios, landedRepeats, mvOf, ratio, rileyNameOf, toActions, type AppRow, type Cast, type TickState } from "./castMapper";
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
    ).toEqual({ spectroFrazzleStacks: 0, aeroErosionStacks: 12, havocBaneStacks: 9, fusionBurstStacks: 0, electroFlareStacks: 16, electroRageStacks: 2, glacioChafeStacks: 0, strainStacks: 3 });
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
  it("presses an echo cast that lands only some of its row's repeat hits at that share", () => {
    // Myriad Snare: the app's row is the impact + 19 crushes (10.20%+0.37%*19 = 17.23), Riley lands the impact + 5
    const echoRows = echoRowsOf(mainEchoesData as never);
    const rows = echoRows.MyriadSnareRustfireChassis.rows;
    expect(rows.map((r) => [r.key, r.mv, r.expr])).toEqual([["MyriadSnareRustfireChassisSummonDMG", 17.23, "10.20%+0.37%*19"]]);
    const cast: Cast = { name: "Echo - Myriad Snare", mv: 12.05, count: 1, cast: null, node: null };
    expect(landedRepeats(cast, rows)?.slice(1)).toEqual([5, 19]);
    const report = emptyReport();
    const acts = toActions([cast], [], echoRows, {}, report, new Set());
    expect(acts.map((a) => [a.key, a.mainEcho, a.buffs])).toEqual([
      ["MyriadSnareRustfireChassisSummonDMG", "MyriadSnareRustfireChassis", [{ modifier: "talentModifierMultiply", modifierValue: -30.06 }]],
    ]);
    expect(report.multipliers).toEqual(["Echo - Myriad Snare = MyriadSnareRustfireChassisSummonDMG × 0.70 (5 of its 19 repeat hits landed)"]);
    // the full count, or one the row can't make, is no partial landing
    expect(landedRepeats({ ...cast, mv: 17.23 }, rows)).toBeNull();
    expect(landedRepeats({ ...cast, mv: 11.15 }, rows)).toBeNull();
  });
  it("presses Lily's released Basic Attack stages by their motion values, with no override", async () => {
    // Riley's 7b4acd0 (2026-11-21) moved her kit from the 3.8 beta's to the released game's: his four stages now read
    // the app's own 63.62 / 116.60 / 95.43 / 153.80, so the four overrides that named her rows are gone
    const rows = appRowsOf((await getCharByName("Lily")) as Record<string, unknown>);
    expect(rows.filter((r) => /^BasicAttackStage\dDMG$/.test(r.key)).map((r) => r.mv)).toEqual([63.62, 116.6, 95.43, 153.8]);
    expect(OVERRIDES.Lily).toBeUndefined();
    const stage = (n: number, mv: number): Cast => ({ name: `Basic - Mend and Cleanse ${n}`, mv, count: 1, cast: "Basic", node: "Normal" });
    const loop: Cast[] = [stage(3, 95.43), stage(4, 153.8), stage(1, 63.62), stage(2, 116.6), { name: "Skill - Reverie Blend", mv: 159.05, count: 1, cast: "Skill", node: "Skill" }];
    const report = emptyReport();
    const acts = toActions(loop, rows, {}, {}, report, new Set());
    expect(acts.map((a) => [a.key, a.type, a.count, a.buffs])).toEqual([
      ["BasicAttackStage3DMG", "basic", 1, []],
      ["BasicAttackStage4DMG", "basic", 1, []],
      ["BasicAttackStage1DMG", "basic", 1, []],
      ["BasicAttackStage2DMG", "basic", 1, []],
      ["ResonanceSkillReverieBlendDMG", "skill", 1, []],
    ]);
    expect(report.unmatched).toEqual([]);
    expect(report.multipliers).toEqual([]);
    expect(report.differs).toBeUndefined();
  });
  it("says a hand-mapped cast under `_differs` is other data on the two sides, never a kit multiplier", () => {
    const rows: AppRow[] = [{ group: "basic", key: "BasicAttackStage1DMG", label: "Stage 1 DMG", mv: 63.62 }];
    const cast: Cast = { name: "Basic - Stage 1", mv: 74.28, count: 1, cast: "Basic", node: "Normal" };
    const report = emptyReport();
    const acts = toActions([cast], rows, {}, { [DIFFERS]: "two kits", "Basic - Stage 1": "BasicAttackStage1DMG" }, report, new Set());
    expect(acts.map((a) => [a.key, a.buffs])).toEqual([["BasicAttackStage1DMG", []]]);
    expect(report.multipliers).toEqual([]);
    expect(report.differs).toEqual(["Basic - Stage 1 74.28% → BasicAttackStage1DMG 63.62%"]);
    // an override whose value is the kit's own multiplier still reads as one (Qingxiao's Heaven's Reckoning × 2.75)
    const kit = emptyReport();
    toActions([{ name: "Skill - X", mv: 200, count: 1, cast: "Skill", node: "Skill" }], [{ group: "skill", key: "XDMG", label: "X DMG", mv: 100 }], {}, { "Skill - X": "XDMG" }, kit, new Set());
    expect(kit.multipliers).toEqual(["Skill - X = XDMG × 2.00"]);
    expect(kit.differs).toBeUndefined();
  });
  it("presses each stage of a staged echo as the app's one row at its share (Lampylumen Myriad)", () => {
    // the app's row is the whole transform, 200.16%*2 + 266.88% = 667.20; Riley presses it as three casts
    const echoRows = echoRowsOf(mainEchoesData as never);
    expect(echoRows.LampylumenMyriad.rows.map((r) => [r.key, r.mv])).toEqual([["LampylumenMyriadAttacks", 667.2]]);
    const st = (n: number, mv: number): Cast => ({ name: `Echo - Lampylumen Myriad ${n}`, mv, count: 1, cast: "Echo", node: null });
    expect(echoStage(st(3, 266.88), echoRows.LampylumenMyriad.rows)?.[1]).toBe(3);
    expect(echoStage({ ...st(1, 200.16), name: "Echo - Lampylumen Myriad" }, echoRows.LampylumenMyriad.rows)).toBeNull();
    const report = emptyReport();
    const acts = toActions([st(1, 200.16), st(2, 200.16), st(3, 266.88)], [], echoRows, {}, report, new Set());
    expect(acts.map((a) => [a.key, a.mainEcho, a.buffs])).toEqual([
      ["LampylumenMyriadAttacks", "LampylumenMyriad", [{ modifier: "talentModifierMultiply", modifierValue: -70 }]],
      ["LampylumenMyriadAttacks", "LampylumenMyriad", [{ modifier: "talentModifierMultiply", modifierValue: -70 }]],
      ["LampylumenMyriadAttacks", "LampylumenMyriad", [{ modifier: "talentModifierMultiply", modifierValue: -60 }]],
    ]);
    // the three shares add up to one press of the row, not three
    expect(acts.reduce((t, a) => t + 1 + (a.buffs[0]!.modifierValue as number) / 100, 0)).toBeCloseTo(1, 2);
    expect(report.unmatched).toEqual([]);
    expect(report.review).toEqual([]);
  });
  it("presses a stage of several hits, or one that is a whole fraction of the row, at its share (Crownless)", () => {
    // Riley's other staged echoes (jinzhou.ts): Crownless 134.08 / 134.08 / 100.56 × 2 / 67.04 × 3 against the app's one row
    // 134.08%*2 + 100.56%*2 + 67.04%*3 (670.40). Stages 3 and 4 are runs of hits, not one term, and stages 1 and 2 are a
    // fifth of the row, so before 2026-11-23 they read as ticks and as the name: 2 presses where Riley makes 1. No loop
    // of tonight's table presses them (his loops use the Nightmare forms); a live import of another loadout can
    const echoRows = echoRowsOf(mainEchoesData as never);
    const pressed = (echo: string, mvs: number[]) => {
      const report = emptyReport();
      const acts = toActions(mvs.map((mv, i) => ({ name: `Echo - ${echo} ${i + 1}`, mv, count: 1, cast: "Echo", node: null })), [], echoRows, {}, report, new Set());
      expect(report.unmatched).toEqual([]);
      return acts.reduce((t, a) => t + a.count * (1 + ((a.buffs[0]?.modifierValue as number | undefined) ?? 0) / 100), 0);
    };
    expect(pressed("Crownless", [134.08, 134.08, 201.12, 201.12])).toBeCloseTo(1, 2);
    expect(pressed("Stonewall Bracer", [168.96, 112.64])).toBeCloseTo(1, 2);
    expect(pressed("Lampylumen Myriad", [200.16, 200.16, 266.88])).toBeCloseTo(1, 2);
    // Thundering Mephis' five strikes are 0.15 of the row each; his sixth (189.44 + three thunders of 31.56) is not the
    // app's last two hits (189.44 + one of 31.57), so it still goes by its name, flagged for review
    expect(pressed("Thundering Mephis", [132.61, 132.61, 132.61, 132.61, 132.61])).toBeCloseTo(0.75, 2);
  });
  it("presses Lingyang's Mech Abomination as the Strike, which the app writes without a percent sign", () => {
    const echoRows = echoRowsOf(mainEchoesData as never);
    const strike = echoRows.MechAbomination.rows.find((r) => r.key === "MechAbominationStrike")!;
    expect([strike.expr, strike.mv]).toEqual(["48.64", null]);
    const cast: Cast = { name: "Echo - Mech Abomination", mv: 48.64, count: 1, cast: "Echo", node: null };
    const bare = toActions([cast], [], echoRows, {}, emptyReport(), new Set());
    expect(bare.map((a) => a.key)).toEqual(["MechAbominationMechWaste"]); // by its name alone: the 320 % summon
    const report = emptyReport();
    const acts = toActions([cast], [], echoRows, OVERRIDES.Lingyang, report, new Set());
    expect(acts.map((a) => [a.key, a.mainEcho, a.buffs])).toEqual([["MechAbominationStrike", "MechAbomination", []]]);
    expect(report.review).toEqual([]);
    expect(report.differs).toBeUndefined();
  });
  it("presses Lingyang's Lion Awakens at the game's 99.41 % per hit and says Riley's kit holds two thirds of it", async () => {
    // the game's own Lv 10 table (and the community wiki's) holds Lion Awakens at 99.41 % × 2, before Lion's Pride's +50 %;
    // Riley's kit holds 66.27 % × 2 and adds Lion's Pride on top, so his run reads the Intro at 198.81 %, the app at
    // 198.82 % with the inherent still to come. By name alone it passed as a "name-only" review match, saying nothing
    const rows = appRowsOf((await getCharByName("Lingyang")) as Record<string, unknown>);
    expect(rows.find((r) => r.key === "LionAwakensDMG")?.mv).toBeCloseTo(198.82, 2);
    const cast: Cast = { name: "Intro - Lion Awakens", mv: 132.54, count: 1, cast: "Intro", node: "Intro" };
    const report = emptyReport();
    const acts = toActions([cast], rows, {}, OVERRIDES.Lingyang, report, new Set());
    expect(acts.map((a) => [a.key, a.count, a.buffs])).toEqual([["LionAwakensDMG", 1, []]]);
    expect(report.review).toEqual([]);
    expect(report.multipliers).toEqual([]);
    expect(report.differs).toEqual(["Intro - Lion Awakens 132.54% → LionAwakensDMG 198.82%"]);
    expect(OVERRIDES.Lingyang[DIFFERS]).toMatch(/Lion's Pride/);
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
