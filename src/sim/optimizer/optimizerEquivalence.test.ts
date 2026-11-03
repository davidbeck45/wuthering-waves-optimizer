// Wuthering Tools+ — the optimizer's exact speedups (track "optimizer-speed"): the inline backend as it is now returns
// the top five the loop before the speedups (`referenceOptimize`) returns — the same echoes slot for slot, in the same
// order, with the same score and energy regen to the last bit — on a fixture subset of the bench's cases: crit DPS,
// a 4-star, Rover, a healer with ER floors, the three formats, set and main-stat filters, a `Stat:` target, an empty
// pool, a pool without its main echo and a 250-echo pool. The full bench (`npm run cli -- optimizer-bench`) runs the
// same comparison on an export.
import { describe, expect, it } from "vitest";
import { inlineBackend } from "../buildTeam/headlessOptimizer";
import { casesFor, diffOutcomes, edgeCases, prepareCase, type BenchCase, type BenchSource } from "./optimizerBench";
import { referenceOptimize } from "./referenceOptimizer";
import { syntheticPool, testSource } from "./testFixture";

/* eslint-disable @typescript-eslint/no-explicit-any */

const source: BenchSource = testSource();

const synthetic = (characterId: string, kind: string, mainEcho: string, sets: string[], seed: number, n: number): BenchCase[] => {
  const pool = syntheticPool(seed, n, mainEcho, sets);
  const base = { characterId, kind, target: "rotation" as const, pool, mainEchoKeys: [mainEcho], erFloor: null, topN: 5 };
  return [
    { ...base, name: `${characterId} · Any · synthetic ${sets.join("+")}`, loadoutFormat: "Any" },
    { ...base, name: `${characterId} · 43311 · synthetic ${sets.join("+")}`, loadoutFormat: "43311" },
    { ...base, name: `${characterId} · 44111 · synthetic ${sets.join("+")}`, loadoutFormat: "44111" },
  ];
};

async function check(cases: BenchCase[]): Promise<{ checked: number; full: number; pruned: number; scoredBefore: number; scoredAfter: number }> {
  let checked = 0;
  let full = 0;
  let pruned = 0;
  let scoredBefore = 0;
  let scoredAfter = 0;
  for (const c of cases) {
    const p = await prepareCase(c, source, { fastObjective: true });
    expect(p, c.name).not.toBeNull();
    const before = referenceOptimize(p!.job, p!.request);
    const after = await inlineBackend().optimize(p!.job, p!.request);
    expect(diffOutcomes(before, after), c.name).toBeNull();
    if (before.results.length === 5) full += 1;
    checked += 1;
    pruned += after.pruned ?? 0;
    scoredBefore += before.processed;
    scoredAfter += after.scored ?? 0;
  }
  return { checked, full, pruned, scoredBefore, scoredAfter };
}

describe("the fast inline optimizer returns the reference loop's top five, bit for bit", () => {
  it("crit DPS on the fixture's own echoes and preset plans: Cartethyia, Galbrena, Zani, three formats and a Stat target", async () => {
    const cases: BenchCase[] = [];
    cases.push(...(await casesFor({ characterId: "Cartethyia", kind: "crit DPS", formats: ["Any", "44111"] }, source)));
    cases.push(...(await casesFor({ characterId: "Galbrena", kind: "crit DPS", formats: ["Any", "43311"], plan: true, stats: ["Stat:totalAtk"] }, source)));
    cases.push(...(await casesFor({ characterId: "Zani", kind: "crit DPS", formats: ["Any"] }, source)));
    const r = await check(cases);
    expect(r.checked).toBeGreaterThanOrEqual(6);
    // the comparisons ran on real top fives
    expect(r.full).toBeGreaterThanOrEqual(5);
    // the bound did skip work here (a regression to "never skips" would still be exact, and slow)
    expect(r.pruned).toBeGreaterThan(0);
    expect(r.scoredAfter).toBeLessThan(r.scoredBefore);
  }, 120_000);

  it("a 4-star (Danjin) and Rover on synthetic pools of real species and sets, all three formats", async () => {
    const cases = [...synthetic("Danjin", "4-star", "NightmareCrownless", ["HavocEclipse", "MoonlitClouds"], 11, 22), ...synthetic("RoverHavocFemale", "Rover", "NightmareCrownless", ["HavocEclipse"], 23, 24)];
    const r = await check(cases);
    expect(r.checked).toBe(6);
    expect(r.full).toBeGreaterThanOrEqual(4);
  }, 120_000);

  it("a healer with ER floors (met, tight, out of reach) and the ER run's Stat:energyRegen target", async () => {
    const pool = syntheticPool(37, 22, "BellBorneGeochelone", ["RejuvenatingGlow", "MoonlitClouds"]);
    const base = { characterId: "Verina", kind: "healer", target: "rotation" as const, pool, mainEchoKeys: ["BellBorneGeochelone"], loadoutFormat: "Any" as const, topN: 5 };
    const cases: BenchCase[] = [
      { ...base, name: "Verina · Any · ER ≥ 120 %", erFloor: 120 },
      { ...base, name: "Verina · Any · ER ≥ 175 %", erFloor: 175 },
      { ...base, name: "Verina · Any · ER ≥ 400 %", erFloor: 400 },
      { ...base, name: "Verina · 43311 · ER ≥ 150 %", erFloor: 150, loadoutFormat: "43311" },
      { ...base, name: "Verina · Any · Stat:energyRegen", erFloor: null, target: "Stat:energyRegen" },
    ];
    const r = await check(cases);
    expect(r.checked).toBe(5);
    // 400 % is out of reach: both sides find nothing
    expect(r.full).toBe(4);
  }, 120_000);

  it("edge pools: empty, no copy of the main echo, and 250 echoes (25 × 10 stat-identical copies) under Any and 43311", async () => {
    const seedCases = await casesFor({ characterId: "Cartethyia", kind: "crit DPS", formats: ["Any"] }, source);
    const edges = edgeCases(seedCases.map((c) => ({ ...c, pool: [...c.pool, ...syntheticPool(5, 25 - c.pool.length, c.mainEchoKeys[0]!, ["WindwardPilgrimage"])] })));
    expect(edges.map((c) => c.pool.length)).toEqual([0, expect.any(Number), 250, 250]);
    const r = await check(edges);
    expect(r.checked).toBe(4);
  }, 120_000);
});
