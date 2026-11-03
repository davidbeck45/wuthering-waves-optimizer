// Wuthering Tools+ — each distinct rotation action scored once (`rotationScore.ts`): the deduped scorer returns
// upstream's `scoreOptimizerRotation` result attack for attack and bit for bit, on the fixture's own and curated
// rotations (a crit DPS, a 4-star, Rover, a healer) and many loadouts each; two actions only share a score when every
// field but `id` holds the same plain data.
import { describe, expect, it } from "vitest";
import { computeLoadoutFinalStats, scoreOptimizerRotation, type OptimizerContext } from "../../calculator/optimizer";
import { computeResonanceChainsBuffs, computeSelfBuffs } from "../../calculator/stats";
import { optimizerLoadoutStream, planOptimizerGeneration, normalizeOptimizerLoadoutCached } from "./optimizerPool";
import { attackKeyOf, planPlainAttacks, scoreOptimizerRotationDeduped } from "./rotationScore";
import { prepareCase, type BenchCase } from "./optimizerBench";
import { syntheticPool, testSource } from "./testFixture";

/* eslint-disable @typescript-eslint/no-explicit-any */

describe("attackKeyOf", () => {
  const a = { key: "Stage1", label: "Stage 1", talents: { "10": "50%" }, count: 1, buffs: null, actionType: "basic" };
  it("ignores the id and nothing else", () => {
    expect(attackKeyOf({ ...a, id: "x" })).toBe(attackKeyOf({ ...a, id: "y" }));
    expect(attackKeyOf({ ...a, count: 2 })).not.toBe(attackKeyOf(a));
    expect(attackKeyOf({ ...a, buffs: { ATK: 10 } })).not.toBe(attackKeyOf(a));
    expect(attackKeyOf({ ...a, talents: { "10": "50.1%" } })).not.toBe(attackKeyOf(a));
  });

  it("keeps apart what plain JSON would merge: NaN and null, -0 and 0, undefined and missing, key order", () => {
    expect(attackKeyOf({ ...a, count: NaN })).not.toBe(attackKeyOf({ ...a, count: null }));
    expect(attackKeyOf({ ...a, count: -0 })).not.toBe(attackKeyOf({ ...a, count: 0 }));
    expect(attackKeyOf({ ...a, extra: undefined })).not.toBe(attackKeyOf(a));
    const { key, ...rest } = a;
    expect(attackKeyOf({ ...rest, key })).not.toBe(attackKeyOf(a));
    expect(attackKeyOf({ ...a, count: "1" })).not.toBe(attackKeyOf(a));
  });

  it("never shares an attack holding a function, a class instance or a cycle", () => {
    expect(attackKeyOf({ ...a, f: () => 1 })).toBeNull();
    expect(attackKeyOf({ ...a, when: new Date(0) })).toBeNull();
    const cyc: any = { ...a };
    cyc.self = cyc;
    expect(attackKeyOf(cyc)).toBeNull();
    expect(attackKeyOf(null)).toBeNull();
    expect(attackKeyOf([a])).toBeNull();
  });

  it("plans repeats onto their first action, memoised per list", () => {
    const list = [{ ...a, id: "1" }, { ...a, id: "2", key: "Stage2" }, { ...a, id: "3" }, { ...a, id: "4", f: () => 0 }, { ...a, id: "5", f: () => 0 }];
    const plan = planPlainAttacks(list);
    expect(plan.unique.map((x) => x.id)).toEqual(["1", "2", "4", "5"]);
    expect(plan.rep).toEqual([0, 1, 0, 2, 3]);
    expect(planPlainAttacks(list)).toBe(plan);
  });
});

describe("scoreOptimizerRotationDeduped equals upstream's scoreOptimizerRotation", () => {
  const source = testSource();
  const cases: BenchCase[] = [
    { name: "Cartethyia", characterId: "Cartethyia", kind: "crit DPS", target: "rotation", pool: source.echoes.filter((e) => e.echoSet === "WindwardPilgrimage"), mainEchoKeys: ["ReminiscenceFleurdelys"], loadoutFormat: "Any", erFloor: null, topN: 5 },
    { name: "Galbrena", characterId: "Galbrena", kind: "crit DPS", target: "rotation", pool: source.echoes.filter((e) => ["FlamewingsShadow", "MoltenRift"].includes(e.echoSet)), mainEchoKeys: ["Corrosaurus"], loadoutFormat: "Any", erFloor: null, topN: 5 },
    { name: "Zani (curated)", characterId: "Zani", kind: "crit DPS", target: "rotation", pool: source.echoes.filter((e) => e.echoSet === "EternalRadiance"), mainEchoKeys: ["Capitaneus"], loadoutFormat: "Any", erFloor: null, topN: 5 },
    { name: "Danjin (curated)", characterId: "Danjin", kind: "4-star", target: "rotation", pool: syntheticPool(3, 16, "NightmareCrownless", ["HavocEclipse"]), mainEchoKeys: ["NightmareCrownless"], loadoutFormat: "Any", erFloor: null, topN: 5 },
    { name: "Rover (curated)", characterId: "RoverHavocFemale", kind: "Rover", target: "rotation", pool: syntheticPool(4, 16, "NightmareCrownless", ["HavocEclipse"]), mainEchoKeys: ["NightmareCrownless"], loadoutFormat: "Any", erFloor: null, topN: 5 },
    { name: "Verina (curated, healing)", characterId: "Verina", kind: "healer", target: "rotation", pool: syntheticPool(6, 16, "BellBorneGeochelone", ["RejuvenatingGlow"]), mainEchoKeys: ["BellBorneGeochelone"], loadoutFormat: "Any", erFloor: null, topN: 5 },
  ];

  it("attack for attack (ids, order, every damage field) and in the aggregation, 60 loadouts per rotation", async () => {
    let repeatsSeen = 0;
    for (const c of cases) {
      const p = (await prepareCase(c, source, { fastObjective: true }))!;
      expect(p, c.name).not.toBeNull();
      const context = { ...p.job.context, getRotationById: () => p.job.rotation } as OptimizerContext;
      const rc = computeResonanceChainsBuffs(context.activeCharacterResonanceChains ?? {}, context.chosenChar?.resonanceChains ?? [], context.talentData ?? {}, context.activeStance ?? null);
      const sb = computeSelfBuffs(context.activeCharacterBuffs ?? {}, context.chosenChar?.buffs ?? [], context.activeCharacterResonanceChains ?? {}, context.talentData ?? {}, context.character ?? null, context.activeStance ?? null, { havocBaneStacks: context.havocBaneStacks ?? 0 });
      const plan = planOptimizerGeneration({ echoes: c.pool, mainEchoKeys: c.mainEchoKeys, loadoutFormat: "Any", topN: 5, target: p.job.target, echoSetPassiveBuffs: p.job.echoSetPassiveBuffs, context: p.job.context, rotationData: p.job.rotationData });
      const dedup = planPlainAttacks(p.job.rotationData.plainAttacks);
      repeatsSeen += p.job.rotationData.plainAttacks.length - dedup.unique.length;
      let n = 0;
      for (const raw of optimizerLoadoutStream(plan.echoes, c.mainEchoKeys, "Any", 0, 1, { uniquePool: plan.uniquePool })) {
        if (n++ % 7 !== 0) continue;
        if (n > 7 * 60) break;
        const loadout = normalizeOptimizerLoadoutCached(raw);
        const stats = computeLoadoutFinalStats(loadout, context, sb, rc, p.job.echoSetPassiveBuffs, p.job.mainEchoStats);
        const upstream = scoreOptimizerRotation(p.job.rotationData, loadout, stats, context, new Map());
        const ours = scoreOptimizerRotationDeduped(p.job.rotationData, loadout, stats, context, new Map());
        expect(ours, `${c.name} #${n}`).toStrictEqual(upstream);
        const lean = scoreOptimizerRotationDeduped(p.job.rotationData, loadout, stats, context, new Map(), { attacks: false });
        expect(lean.damageAggregation, `${c.name} #${n}`).toStrictEqual(upstream.damageAggregation);
      }
    }
    // the fixture rotations do repeat actions (else this test would only check the pass-through)
    expect(repeatsSeen).toBeGreaterThan(5);
  }, 120_000);
});
