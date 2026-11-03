// @vitest-environment node
// Wuthering Tools+ — the bound skip in the browser path (track "optimizer-speed", verify 1, 2026-11-02): upstream's
// processor worker (`src/workers/processor.worker.ts`, the module itself, driven by its own messages) posts the same
// candidates, batch for batch, with the bound on (`pruning` from `pruneSetupOf`) as with it off (`pruning: null`).
// That covers what the inline equivalence suite cannot: the calculator's min-stat rows on other stats than energy
// regen (crit rate, HP), Normal and Crit damage types, `Stat:` targets, two generator shards, and a worker that only
// sees every other batch (the multi-processor split). Fixture data only (Echo Lab fixture + seeded synthetic echoes).
import { describe, expect, it, vi } from "vitest";
import { normalizeLoadoutFormat, type OptimizerLoadoutFormat } from "../../calculator/optimizer";
import { echoSetLabelMap } from "../../echoes/stats";
import { optimizerLoadoutStream, planOptimizerGeneration, pruneSetupOf } from "./optimizerPool";
import { casesFor, prepareCase, type BenchCase } from "./optimizerBench";
import { syntheticPool, testSource } from "./testFixture";

/* eslint-disable @typescript-eslint/no-explicit-any */

// the pruners the worker builds, so the test can tell the bound did skip work (an "on" run that skips nothing would
// pass the comparison vacuously)
const pruners: any[] = [];
vi.mock("./loadoutBound", async (importOriginal) => {
  const mod: any = await importOriginal();
  return {
    ...mod,
    createLoadoutPruner: (...args: any[]) => {
      const pruner = mod.createLoadoutPruner(...args);
      pruners.push(pruner);
      return pruner;
    },
  };
});

const posted: any[] = [];
(globalThis as any).self = { postMessage: (message: any) => posted.push(message) };

const source = testSource();
// what crosses postMessage: plain data only
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** One processor run: init, then every batch; per batch, the candidates it posts as "score|echo ids". */
async function runProcessor(init: Record<string, unknown>, batches: any[][]): Promise<string[][]> {
  await import("../../workers/processor.worker");
  const send = (data: unknown): void => (globalThis as any).self.onmessage({ data });
  posted.length = 0;
  send({ type: "init", data: init });
  expect(posted[0]?.type).toBe("ready");
  return batches.map((batch, batchId) => {
    posted.length = 0;
    send({ type: "process", data: { batch, batchId } });
    expect(posted[0]?.type, posted[0]?.error).toBe("result");
    return posted[0].results.map((r: any) => `${r.targetValue}|${r.loadout.map((e: any) => e.echoId).join(",")}`);
  });
}

interface Variant {
  name: string;
  c: BenchCase;
  minStats?: Array<{ stat: string; minValue: number }>;
  damageType?: "Normal" | "Average" | "Crit";
  target?: string;
  /** batch size; `stride` 2 = this worker gets every other batch */
  batch?: number;
  stride?: number;
  shards?: number;
}

async function compare(v: Variant): Promise<{ skipped: number; loadouts: number; posted: number }> {
  const p = (await prepareCase(v.c, source, { fastObjective: true }))!;
  expect(p, v.name).not.toBeNull();
  const target = v.target ?? p.job.target;
  const plan = planOptimizerGeneration({ echoes: p.request.pool, mainEchoKeys: p.request.mainEchoKeys, loadoutFormat: p.request.loadoutFormat, topN: 5, target, echoSetPassiveBuffs: p.job.echoSetPassiveBuffs, context: p.job.context, rotationData: p.job.rotationData });
  expect(plan.pruneByBound, v.name).toBe(true);
  const shards = v.shards ?? 1;
  const all: any[][] = [];
  for (let s = 0; s < shards; s++) {
    for (const l of optimizerLoadoutStream(plan.echoes, p.request.mainEchoKeys, normalizeLoadoutFormat(p.request.loadoutFormat), s, shards, { uniquePool: plan.uniquePool, skipDominatedPartials: plan.skipDominatedPartials })) all.push(l);
  }
  const size = v.batch ?? 50;
  const batches: any[][] = [];
  for (let i = 0, k = 0; i < all.length; i += size, k++) if (k % (v.stride ?? 1) === 0) batches.push(clone(all.slice(i, i + size)));
  const init = {
    context: clone(p.job.context),
    minStats: v.minStats ?? [],
    echoSetPassiveBuffs: clone(p.job.echoSetPassiveBuffs),
    mainEchoStats: clone(p.job.mainEchoStats),
    target,
    damageType: v.damageType ?? "Average",
    rotationData: clone(p.job.rotationData),
    topN: 5,
  };
  const off = await runProcessor({ ...init, pruning: null }, batches);
  const before = pruners.length;
  const on = await runProcessor({ ...init, pruning: clone(pruneSetupOf(plan, p.request.mainEchoKeys, p.request.loadoutFormat)) }, batches);
  expect(on, v.name).toEqual(off);
  const pruner = pruners[before];
  expect(pruner, v.name).toBeTruthy();
  return { skipped: pruner.stats.skipped, loadouts: batches.reduce((n, b) => n + b.length, 0), posted: off.flat().length };
}

describe("the processor worker posts the same candidates with the bound skip on as off", () => {
  it("crit DPS, Rover, a 4-star and a healer: damage types, min-stat rows, Stat targets, shards and split batches", async () => {
    const [galbAny, galb43311] = await casesFor({ characterId: "Galbrena", kind: "crit DPS", formats: ["Any", "43311"] }, source);
    const synthetic = (characterId: string, main: string, sets: string[], seed: number, n: number, loadoutFormat: OptimizerLoadoutFormat): BenchCase => ({
      name: `${characterId} ${loadoutFormat} ${seed}`,
      characterId,
      kind: "test",
      target: "rotation",
      pool: syntheticPool(seed, n, main, sets),
      mainEchoKeys: [main],
      loadoutFormat,
      erFloor: null,
      topN: 5,
    });
    const fourteenSets = Object.keys(echoSetLabelMap).sort().slice(0, 14);
    const verina = synthetic("Verina", "BellBorneGeochelone", ["RejuvenatingGlow", "MoonlitClouds"], 37, 24, "Any");
    const variants: Variant[] = [
      { name: "Galbrena Any, Average", c: galbAny! },
      { name: "Galbrena 43311, Crit", c: galb43311!, damageType: "Crit" },
      { name: "Galbrena Any, Normal, every other batch of 7", c: galbAny!, damageType: "Normal", batch: 7, stride: 2 },
      { name: "Galbrena Any, Stat:totalCritRate", c: galbAny!, target: "Stat:totalCritRate" },
      { name: "Havoc Rover Any, two generator shards", c: synthetic("RoverHavocFemale", "NightmareCrownless", ["HavocEclipse"], 23, 22, "Any"), shards: 2, batch: 31 },
      { name: "Havoc Rover 44111", c: synthetic("RoverHavocFemale", "NightmareCrownless", ["HavocEclipse", "MoonlitClouds"], 47, 26, "44111") },
      { name: "Havoc Rover Any, 14 sets, crit rate ≥ 45 %", c: synthetic("RoverHavocFemale", "NightmareCrownless", fourteenSets, 53, 20, "Any"), minStats: [{ stat: "totalCritRate", minValue: 45 }] },
      { name: "Danjin 43311, HP ≥ 16000", c: synthetic("Danjin", "NightmareCrownless", ["HavocEclipse", "MoonlitClouds", "LingeringTunes"], 13, 22, "43311"), minStats: [{ stat: "totalHp", minValue: 16000 }] },
      { name: "Verina Any, ER ≥ 200 %", c: verina, minStats: [{ stat: "energyRegen", minValue: 200 }] },
      { name: "Verina Any, Stat:healingBonus", c: verina, target: "Stat:healingBonus" },
    ];
    let skipped = 0;
    let loadouts = 0;
    for (const v of variants) {
      const r = await compare(v);
      expect(r.posted, `${v.name}: a run with candidates`).toBeGreaterThan(0);
      skipped += r.skipped;
      loadouts += r.loadouts;
    }
    // not vacuous: the bound skipped a good share of the work
    expect(skipped).toBeGreaterThan(loadouts / 4);
  }, 120_000);
});
