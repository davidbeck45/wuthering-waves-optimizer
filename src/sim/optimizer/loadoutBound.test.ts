// Wuthering Tools+ — the optimizer's bound skip (`loadoutBound.ts`): the virtual-loadout stats are upstream's
// `computeLoadoutFinalStats` bit for bit (a drift pin), every prefix's bound is at or above the score of every loadout
// below it and its floor check never rules out a loadout that meets the floor (admissibility, checked exhaustively on
// small runs), and the pruner stays off wherever the argument does not hold.
import { describe, expect, it } from "vitest";
import { computeLoadoutFinalStats, normalizeLoadoutFormat, type OptimizerContext, type OptimizerLoadoutFormat } from "../../calculator/optimizer";
import { meetsMinStatThreshold } from "../../calculator/meetsMinStatThreshold";
import { computeResonanceChainsBuffs, computeSelfBuffs } from "../../calculator/stats";
import { echoSetLabelMap, getCombinedEchoStats } from "../../echoes/stats";
import { scoreLoadoutInline } from "../buildTeam/headlessOptimizer";
import { createLoadoutPruner, virtualLoadoutStats, type PrunerScoring } from "./loadoutBound";
import { optimizerLoadoutStream, planOptimizerGeneration, pruneSetupOf, normalizeOptimizerLoadoutCached } from "./optimizerPool";
import { prepareCase, type BenchCase, type PreparedCase } from "./optimizerBench";
import { speciesByCost, syntheticPool, testSource } from "./testFixture";

/* eslint-disable @typescript-eslint/no-explicit-any */

const source = testSource();

function scoringOf(p: PreparedCase): PrunerScoring & { context: OptimizerContext } {
  const context = { ...p.job.context, getRotationById: () => p.job.rotation } as OptimizerContext;
  return {
    context,
    resonanceChainsBuffsData: computeResonanceChainsBuffs(context.activeCharacterResonanceChains ?? {}, context.chosenChar?.resonanceChains ?? [], context.talentData ?? {}, context.activeStance ?? null),
    selfBuffsData: computeSelfBuffs(context.activeCharacterBuffs ?? {}, context.chosenChar?.buffs ?? [], context.activeCharacterResonanceChains ?? {}, context.talentData ?? {}, context.character ?? null, context.activeStance ?? null, { havocBaneStacks: context.havocBaneStacks ?? 0 }),
    echoSetPassiveBuffs: p.job.echoSetPassiveBuffs,
    mainEchoStats: p.job.mainEchoStats,
    target: p.job.target,
    damageType: "Average",
    rotationData: p.job.rotationData,
    minStats: p.request.minStats,
  };
}

/** A pool where only set bonuses move the score: no substats, a main echo of one set, two Lingering Tunes (its 2-piece
 *  is ATK) and one echo of twelve other sets, so thirteen candidate sets send the first prefix down the many-sets path. */
function setBonusOnlyPool(main: string): any[] {
  const others = Object.keys(echoSetLabelMap).filter((set) => set !== "LingeringTunes").sort();
  const species = speciesByCost()[1]!;
  const bare = (echo: string, type: number, echoSet: string, echoId: string): any => ({ echo, type, rank: 5, stat: "DEF", echoId, echoSet });
  return [
    bare(main, 4, others[0]!, "bare-main"),
    bare(species[0]!, 1, "LingeringTunes", "bare-tunes-1"),
    bare(species[1]!, 1, "LingeringTunes", "bare-tunes-2"),
    ...others.slice(1, 13).map((set, i) => bare(species[i + 2]!, 1, set, `bare-${i}`)),
  ];
}

const caseOf = (name: string, characterId: string, pool: any[], main: string, format: OptimizerLoadoutFormat, extra: Partial<BenchCase> = {}): BenchCase => ({
  name,
  characterId,
  kind: "test",
  target: "rotation",
  pool,
  mainEchoKeys: [main],
  loadoutFormat: format,
  erFloor: null,
  topN: 5,
  ...extra,
});

function streamOf(p: PreparedCase): { plan: ReturnType<typeof planOptimizerGeneration>; loadouts: any[][] } {
  const plan = planOptimizerGeneration({ echoes: p.request.pool, mainEchoKeys: p.request.mainEchoKeys, loadoutFormat: p.request.loadoutFormat, topN: 5, target: p.job.target, echoSetPassiveBuffs: p.job.echoSetPassiveBuffs, mainEchoStats: p.job.mainEchoStats, context: p.job.context, rotationData: p.job.rotationData });
  const loadouts = [...optimizerLoadoutStream(plan.echoes, p.request.mainEchoKeys, normalizeLoadoutFormat(p.request.loadoutFormat), 0, 1, { uniquePool: plan.uniquePool, skipDominatedPartials: plan.skipDominatedPartials })];
  return { plan, loadouts };
}

describe("virtualLoadoutStats", () => {
  it("is computeLoadoutFinalStats bit for bit on a real loadout's echo stats and its three labels", async () => {
    const c = caseOf("Galbrena", "Galbrena", source.echoes.filter((e) => ["FlamewingsShadow", "MoltenRift"].includes(e.echoSet)), "Corrosaurus", "Any");
    const p = (await prepareCase(c, source, { fastObjective: true }))!;
    const scoring = scoringOf(p);
    const { loadouts } = streamOf(p);
    expect(loadouts.length).toBeGreaterThan(100);
    for (const raw of loadouts.filter((_, i) => i % 9 === 0).slice(0, 120)) {
      const loadout = normalizeOptimizerLoadoutCached(raw);
      const real = computeLoadoutFinalStats(loadout, scoring.context, scoring.selfBuffsData, scoring.resonanceChainsBuffsData, scoring.echoSetPassiveBuffs, scoring.mainEchoStats);
      const virtual = virtualLoadoutStats(scoring, getCombinedEchoStats(loadout), loadout[0].echo, [real.setBonusOnePiece, real.setBonusOne, real.setBonusTwo]);
      expect(virtual.finalStats).toStrictEqual(real.finalStats);
      expect(virtual.combinedEchoBuffs).toStrictEqual(real.combinedEchoBuffs);
    }
  }, 60_000);
});

describe("the bound is admissible", () => {
  const runs: Array<{ c: BenchCase; floor?: number }> = [
    { c: caseOf("Galbrena · Any", "Galbrena", source.echoes.filter((e) => ["FlamewingsShadow", "MoltenRift"].includes(e.echoSet)), "Corrosaurus", "Any") },
    { c: caseOf("Rover · 44111", "RoverHavocFemale", syntheticPool(47, 26, "NightmareCrownless", ["HavocEclipse", "MoonlitClouds"]), "NightmareCrownless", "44111") },
    { c: caseOf("Verina · Any · ER floor", "Verina", syntheticPool(41, 14, "BellBorneGeochelone", ["RejuvenatingGlow", "MoonlitClouds"]), "BellBorneGeochelone", "Any", { erFloor: 160 }) },
    { c: caseOf("Danjin · 43311 · Stat:totalAtk", "Danjin", syntheticPool(43, 26, "NightmareCrownless", ["HavocEclipse"]), "NightmareCrownless", "43311", { target: "Stat:totalAtk" }) },
    // fourteen sets: too many set multisets to walk at the first prefixes, so the bound takes every set's own labels
    { c: caseOf("Rover · Any · 14 sets", "RoverHavocFemale", syntheticPool(53, 18, "NightmareCrownless", Object.keys(echoSetLabelMap).sort().slice(0, 14)), "NightmareCrownless", "Any") },
    // the same path with nothing but set bonuses to lift the score: a candidate's 2-piece the bound forgets shows at once
    // (above, the per-stat maxima of real substats cover for it)
    { c: caseOf("Rover · Any · 13 candidate sets, set bonuses alone", "RoverHavocFemale", setBonusOnlyPool("NightmareCrownless"), "NightmareCrownless", "Any", { target: "Stat:totalAtk" }) },
  ];

  for (const { c } of runs) {
    it(`${c.name}: every prefix's bound ≥ every score below it; its floor check spares every loadout that meets the floor`, async () => {
      const p = (await prepareCase(c, source, { fastObjective: true }))!;
      const scoring = scoringOf(p);
      const { plan, loadouts } = streamOf(p);
      expect(plan.pruneByBound).toBe(true);
      const pruner = createLoadoutPruner(pruneSetupOf(plan, p.request.mainEchoKeys, p.request.loadoutFormat), scoring)!;
      expect(pruner).not.toBeNull();
      expect(loadouts.length).toBeGreaterThan(20);
      const cache = new Map();
      const scored = loadouts.map((l) => ({ raw: l, s: scoreLoadoutInline(p.job, l, cache) }));
      const bounds = new Map<string, { ub: number; feasible: boolean }>();
      let checks = 0;
      let tight = 0;
      for (const { raw, s } of scored) {
        const meets = p.request.minStats.every((m) => meetsMinStatThreshold({ energyRegen: s.energyRegen }[m.stat as "energyRegen"], m.minValue, m.stat));
        for (let len = 1; len <= Math.min(raw.length, 4); len++) {
          const prefix = raw.slice(0, len);
          const key = prefix.map((e: any) => e.echoId).join(",");
          let b = bounds.get(key);
          if (!b) bounds.set(key, (b = pruner.bound(prefix)!));
          expect(b, key).not.toBeNull();
          // a subtree the floor rules out (feasible false, bound -Infinity) holds no loadout that meets the floor
          if (meets) expect(b.feasible, key).toBe(true);
          if (b.feasible) expect(b.ub, `${key} → ${raw.map((e: any) => e.echoId).join(",")}`).toBeGreaterThanOrEqual(s.targetValue);
          if (b.ub < s.targetValue * 1.02) tight += 1;
          checks += 1;
        }
      }
      expect(checks).toBeGreaterThan(50);
      // not vacuous: some bounds sit within 2 % of a real score
      expect(tight).toBeGreaterThan(0);
    }, 60_000);
  }

  it("an ER floor out of reach rules the whole run out at the first prefix", async () => {
    const c = caseOf("Verina · 400 %", "Verina", syntheticPool(41, 14, "BellBorneGeochelone", ["RejuvenatingGlow"]), "BellBorneGeochelone", "Any", { erFloor: 400 });
    const p = (await prepareCase(c, source, { fastObjective: true }))!;
    const { plan, loadouts } = streamOf(p);
    const setup = pruneSetupOf(plan, p.request.mainEchoKeys, p.request.loadoutFormat);
    expect(createLoadoutPruner(setup, scoringOf(p))!.bound(loadouts[0]!.slice(0, 1))!.feasible).toBe(false);
    const pruner = createLoadoutPruner(setup, scoringOf(p))!;
    expect(loadouts.every((l) => pruner.skip(l, null))).toBe(true);
    // one bound per copy of the main echo (each starts its own subtree), nothing below them
    expect(pruner.stats.bounds).toBe(plan.echoes.filter((e) => e.echo === "BellBorneGeochelone").length);
  }, 30_000);
});

describe("the pruner's guards", () => {
  it("skips nothing and computes nothing while there is no bar and no floor; never skips a loadout out of generation order", async () => {
    const c = caseOf("Galbrena", "Galbrena", source.echoes.filter((e) => ["FlamewingsShadow", "MoltenRift"].includes(e.echoSet)), "Corrosaurus", "Any");
    const p = (await prepareCase(c, source, { fastObjective: true }))!;
    const { plan, loadouts } = streamOf(p);
    const pruner = createLoadoutPruner(pruneSetupOf(plan, p.request.mainEchoKeys, p.request.loadoutFormat), scoringOf(p))!;
    expect(loadouts.some((l) => pruner.skip(l, null))).toBe(false);
    expect(pruner.stats.bounds).toBe(0);
    // a bar no loadout reaches: every generator loadout is skipped, a reordered or foreign one never is
    const full = loadouts.find((l) => l.length === 5)!;
    expect(pruner.skip(full, Number.MAX_VALUE)).toBe(true);
    expect(pruner.skip([full[0], ...full.slice(1).reverse()], Number.MAX_VALUE)).toBe(false);
    expect(pruner.skip([...full.slice(0, 4), { ...full[4], echoId: "not-in-pool" }], Number.MAX_VALUE)).toBe(false);
    expect(pruner.skip([full[1], full[0], ...full.slice(2)], Number.MAX_VALUE)).toBe(false);
  }, 30_000);

  it("is off where the argument does not hold", async () => {
    const pool = source.echoes.filter((e) => ["FlamewingsShadow", "MoltenRift"].includes(e.echoSet));
    const c = caseOf("Galbrena", "Galbrena", pool, "Corrosaurus", "Any");
    const p = (await prepareCase(c, source, { fastObjective: true }))!;
    const scoring = scoringOf(p);
    const setup = { pool, mainEchoKeys: ["Corrosaurus"], loadoutFormat: "Any" as const };
    expect(createLoadoutPruner(setup, scoring)).not.toBeNull();
    expect(createLoadoutPruner(null, scoring)).toBeNull();
    expect(createLoadoutPruner({ ...setup, mainEchoKeys: [] }, scoring)).toBeNull();
    expect(createLoadoutPruner({ ...setup, pool: [...pool, { ...pool[0] }] }, scoring)).toBeNull(); // an id twice
    expect(createLoadoutPruner({ ...setup, pool: [...pool, { ...pool[0], echoId: "s", echoSubStatsValue1: "10.5" }] }, scoring)).toBeNull(); // a string value
    // a cost upstream's getEchoStats cannot read (it throws): the bound stays off instead of failing the worker's init
    expect(createLoadoutPruner({ ...setup, pool: [...pool, { ...pool[1], echoId: "c2", type: 2 }] }, scoring)).toBeNull();
    expect(createLoadoutPruner(setup, { ...scoring, target: "Attack:basicAttacks|Stage1" })).toBeNull();
    expect(createLoadoutPruner(setup, { ...scoring, rotationData: { ...scoring.rotationData!, overrideActions: [{ actionId: "a", attack: {}, advancedConfig: {} }] as any } })).toBeNull();
    expect(createLoadoutPruner(setup, { ...scoring, mainEchoStats: { Corrosaurus: { CritRate: -1 } } })).toBeNull();
    // the plan says no as well: a negative custom buff, a resistance over 100 %, an Attack target, no main echo
    const input = { echoes: pool, mainEchoKeys: ["Corrosaurus"], loadoutFormat: "Any", topN: 5, target: p.job.target, echoSetPassiveBuffs: p.job.echoSetPassiveBuffs, mainEchoStats: p.job.mainEchoStats, context: p.job.context, rotationData: p.job.rotationData };
    expect(planOptimizerGeneration(input).pruneByBound).toBe(true);
    expect(planOptimizerGeneration({ ...input, context: { ...p.job.context, customBuffs: { ATK: -5 } } }).pruneByBound).toBe(false);
    expect(planOptimizerGeneration({ ...input, context: { ...p.job.context, enemyResist: 1.2 } }).pruneByBound).toBe(false);
    expect(planOptimizerGeneration({ ...input, target: "Attack:basicAttacks|Stage1" }).pruneByBound).toBe(false);
    expect(planOptimizerGeneration({ ...input, mainEchoKeys: [] }).pruneByBound).toBe(false);
    expect(planOptimizerGeneration({ ...input, mainEchoStats: { Corrosaurus: { ATK: -3 } } }).pruneByBound).toBe(false);
    // and a rotation with per-action overrides (the fixture's Cartethyia rotation has one)
    const cart = (await prepareCase(caseOf("Cartethyia", "Cartethyia", source.echoes.filter((e) => e.echoSet === "WindwardPilgrimage"), "ReminiscenceFleurdelys", "Any"), source, { fastObjective: true }))!;
    expect(cart.job.rotationData.overrideActions.length).toBeGreaterThan(0);
    expect(planOptimizerGeneration({ ...input, echoes: cart.request.pool, mainEchoKeys: ["ReminiscenceFleurdelys"], rotationData: cart.job.rotationData }).pruneByBound).toBe(false);
  }, 30_000);
});
