// @vitest-environment node
// Wuthering Tools+ — a Healing or Shield target through the processor worker (hunt round 1). Upstream's inline `optimize()`
// reads `healAmount` / `shieldAmount` for these attacks; the worker read `avgDamage`, which they do not have, so every
// loadout scored 0, the "top five" were the first five it met and Equip loadout was on offer for them. The module itself
// runs here, driven by its own messages. Fixture data only.
import { describe, expect, it } from "vitest";
import { normalizeLoadoutFormat, optimize } from "../../calculator/optimizer";
import { casesFor, prepareCase, type BenchCase, type BenchSource } from "./optimizerBench";
import { optimizerLoadoutStream, planOptimizerGeneration } from "./optimizerPool";
import { syntheticPool, testSource } from "./testFixture";

/* eslint-disable @typescript-eslint/no-explicit-any */

const posted: any[] = [];
(globalThis as any).self = { postMessage: (message: any) => posted.push(message) };

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const blank = { echoes: { 0: {}, 1: {}, 2: {}, 3: {}, 4: {} }, mainEcho: { echo: null, rank: 5 } };
const source: BenchSource = testSource();
source.characters.Brant = { ...blank, weapon: "EmeraldOfGenesis" };

/** One run through the worker on every loadout of the case: its results, best first. */
async function viaProcessor(c: BenchCase, target: string, damageType: string): Promise<{ results: any[]; job: any; request: any }> {
  await import("../../workers/processor.worker");
  const p = (await prepareCase(c, source, { fastObjective: true }))!;
  expect(p, c.name).not.toBeNull();
  const plan = planOptimizerGeneration({ echoes: p.request.pool, mainEchoKeys: p.request.mainEchoKeys, loadoutFormat: p.request.loadoutFormat, topN: 5, target, echoSetPassiveBuffs: p.job.echoSetPassiveBuffs, context: p.job.context, rotationData: null });
  const batch = clone([...optimizerLoadoutStream(plan.echoes, p.request.mainEchoKeys, normalizeLoadoutFormat(p.request.loadoutFormat), 0, 1, { uniquePool: plan.uniquePool, skipDominatedPartials: plan.skipDominatedPartials })]);
  const send = (data: unknown): void => (globalThis as any).self.onmessage({ data });
  posted.length = 0;
  send({ type: "init", data: { context: clone(p.job.context), minStats: [], echoSetPassiveBuffs: clone(p.job.echoSetPassiveBuffs), mainEchoStats: clone(p.job.mainEchoStats), target, damageType, rotationData: null, topN: 5, pruning: null } });
  posted.length = 0;
  send({ type: "process", data: { batch, batchId: 0 } });
  expect(posted[0]?.type, posted[0]?.error).toBe("result");
  return { results: [...posted[0].results].sort((a, b) => b.targetValue - a.targetValue), job: p.job, request: p.request };
}

const inline = (job: any, request: any, target: string, damageType: string): any[] =>
  optimize(request.pool, { ...job.context, getRotationById: () => job.rotation }, [], 5, request.mainEchoKeys, [], job.echoSetPassiveBuffs, job.mainEchoStats, target, damageType) ?? [];

const synthetic = (characterId: string, main: string, sets: string[], seed: number): BenchCase => ({
  name: `${characterId} ${seed}`,
  characterId,
  kind: "test",
  target: "rotation",
  pool: syntheticPool(seed, 18, main, sets),
  mainEchoKeys: [main],
  loadoutFormat: "Any",
  erFloor: null,
  topN: 5,
});

describe("the processor worker scores Healing and Shield targets", () => {
  const healing = "Attack:forteCircuitAttacks|StarflowerBloomsHealing";
  const shield = "Attack:forteCircuitAttacks|ReturnedfromAshesShield";

  it("a heal reads its healing, ranked as upstream's inline optimize() ranks it", async () => {
    const { results, job, request } = await viaProcessor(synthetic("Verina", "BellBorneGeochelone", ["RejuvenatingGlow", "MoonlitClouds"], 37), healing, "Average");
    expect(results.length).toBe(5);
    for (const r of results) {
      expect(r.targetValue).toBeGreaterThan(0);
      expect(r.targetValue).toBe(r.context.attacks[0].damage.healAmount);
    }
    expect(results[0].targetValue).toBeGreaterThan(results[4].targetValue);
    expect(results.map((r) => r.targetValue)).toEqual(inline(job, request, healing, "Average").map((r) => r.targetValue));
  }, 30_000);

  it("a shield reads its shield, whichever damage type the run has", async () => {
    const c = synthetic("Brant", "InfernoRider", ["MoltenRift", "MoonlitClouds"], 41);
    const { results, job, request } = await viaProcessor(c, shield, "Crit");
    expect(results.length).toBe(5);
    for (const r of results) expect(r.targetValue).toBe(r.context.attacks[0].damage.shieldAmount);
    expect(results[0].targetValue).toBeGreaterThan(0);
    expect(results.map((r) => r.targetValue)).toEqual(inline(job, request, shield, "Crit").map((r) => r.targetValue));
  }, 30_000);

  it("an ordinary attack still reads the damage type the run asked for", async () => {
    const [c] = await casesFor({ characterId: "Galbrena", kind: "crit DPS", formats: ["Any"] }, source);
    const attack = "Attack:basicAttacks|BasicAttackStage1DMG";
    const average = await viaProcessor(c!, attack, "Average");
    const crit = await viaProcessor(c!, attack, "Crit");
    for (const r of average.results) expect(r.targetValue).toBe(r.context.attacks[0].damage.avgDamage);
    for (const r of crit.results) expect(r.targetValue).toBe(r.context.attacks[0].damage.critDamage);
  }, 30_000);
});
