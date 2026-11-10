// @vitest-environment node
// Wuthering Tools+ — `runOptimizerWorkers` (Ryan's src/workers/optimizerRun.ts, moved out of Calculator.vue by #687)
// with plus's hooks in it. Every caller goes through it now: the calculator's optimizer and his team optimizer, which
// asks for the best 2,000 loadouts, not 5, on top of stat floors and required set bonuses.
//
// `new Worker` is faked, the workers are not: the real generator and processor modules run in this thread, one module
// instance each, every message structured-cloned and delivered on a later task, as the browser does. What comes back is
// checked against a brute force of upstream's own generator, normaliser, stats and scorer with nothing skipped. A sync
// that drops a hook fails here by name, not months later as a slower or quietly different optimizer.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildTeamOptimizerSlotPlan, TEAM_OPTIMIZER_LIST_DEPTH } from "../../calculator/teamOptimizer";
import { computeLoadoutFinalStats, computeOverrideBuffVariants, filterEchoesForOptimizer, generateLoadouts, getOptimizerLoadoutHash, hasRequiredSetBonuses, normalizeLoadoutFormat, normalizeOptimizerLoadout, scoreOptimizerRotation } from "../../calculator/optimizer";
import { meetsMinStatThreshold } from "../../calculator/meetsMinStatThreshold";
import { computeResonanceChainsBuffs, computeSelfBuffs } from "../../calculator/stats";
import { installFakeWorkers, type FakeWorker } from "./fakeWorkers";
import { scalingPool, statScaledKit } from "./testFixture";

/* eslint-disable @typescript-eslint/no-explicit-any */

const enemyConfig = { enemyLevel: 90, enemyResist: 0.1, enemyType: "Calamity" };
const MAIN = "FallacyOfNoReturn";

// the pruners the processors build, so a run can tell the bound did skip work (an exact run that skipped nothing proves little)
const pruners: any[] = [];
vi.mock("./loadoutBound", async (importOriginal) => {
  const mod: any = await importOriginal();
  return {
    ...mod,
    createLoadoutPruner: (...args: any[]) => {
      const pruner = mod.createLoadoutPruner(...args);
      if (pruner) pruners.push(pruner);
      return pruner;
    },
  };
});

let runOptimizerWorkers: typeof import("../../workers/optimizerRun").runOptimizerWorkers;
let made: FakeWorker[];

beforeAll(async () => {
  made = await installFakeWorkers(2);
  ({ runOptimizerWorkers } = await import("../../workers/optimizerRun"));
}, 60_000);

afterAll(() => {
  vi.unstubAllGlobals();
});

async function planFor(characterId: string, sets: string[], extra: { overrideFirstAction?: boolean; seed?: number } = {}) {
  const { data, actions } = await statScaledKit(characterId);
  if (extra.overrideFirstAction) actions[0] = { ...actions[0], advancedConfig: { buffs: { OutroSkillRecursion: { isEnabled: false } } } };
  const team: any = { name: "Hooks", characterIds: [characterId, null, null], buildIds: [null, null, null], actions, duration: null };
  // a stat-identical copy of an echo, so the pool dedup has something to drop
  const base = scalingPool(extra.seed ?? 11, MAIN, sets, { main: 2, four: 2, three: 4, one: 5 });
  const pool = [...base, { ...base[5], echoId: `${base[5].echoId}-copy` }];
  const plan = await buildTeamOptimizerSlotPlan({ team, slot: 0, characterId, characterData: data, enemyConfig, inventoryEchoes: pool, mainEchoKeys: [MAIN] });
  return { plan, pool };
}

/** Upstream's generator, normaliser, hash and scorer on every loadout: the rows nothing skipped would keep. */
function bruteForce(plan: Awaited<ReturnType<typeof planFor>>["plan"], pool: any[], format: string, minStats: any[], labels: string[]): Array<{ score: number; ids: string }> {
  const context: any = JSON.parse(JSON.stringify(plan.context));
  const self = computeSelfBuffs(context.activeCharacterBuffs ?? {}, context.chosenChar?.buffs ?? [], context.activeCharacterResonanceChains ?? {}, context.talentData ?? {}, context.character ?? null, context.activeStance ?? null, { havocBaneStacks: context.havocBaneStacks ?? 0 });
  const chains = computeResonanceChainsBuffs(context.activeCharacterResonanceChains ?? {}, context.chosenChar?.resonanceChains ?? [], context.talentData ?? {}, context.activeStance ?? null);
  const variants = computeOverrideBuffVariants(plan.rotationData.overrideActions, context);
  const seen = new Set<number>();
  const rows: Array<{ score: number; ids: string }> = [];
  for (const raw of generateLoadouts(filterEchoesForOptimizer(pool), [MAIN], 0, [], 0, new Set(), new Set(), normalizeLoadoutFormat(format)) as Iterable<any[]>) {
    const loadout = normalizeOptimizerLoadout(raw);
    const hash = getOptimizerLoadoutHash(loadout);
    if (seen.has(hash)) continue;
    seen.add(hash);
    const stats = computeLoadoutFinalStats(loadout, context, self, chains, plan.echoBuffs.echoSetPassiveBuffs, plan.echoBuffs.mainEchoStats);
    if (!hasRequiredSetBonuses(stats, labels)) continue;
    if (!minStats.every((m) => meetsMinStatThreshold(stats.finalStats[m.stat], m.minValue, m.stat))) continue;
    const { damageAggregation } = scoreOptimizerRotation(plan.rotationData, loadout, stats, context, variants);
    rows.push({ score: Number(damageAggregation.avgDamage), ids: loadout.map((e: any) => e.echoId).join(",") });
  }
  return rows.sort((a, b) => b.score - a.score);
}

function run(plan: Awaited<ReturnType<typeof planFor>>["plan"], pool: any[], over: Record<string, unknown>): Promise<{ results: any[]; totalProcessed: number }> {
  return new Promise((resolve, reject) => {
    runOptimizerWorkers(
      {
        echoes: pool,
        context: plan.context,
        topN: 5,
        mainEchoKeys: [MAIN],
        minStats: [],
        echoSetPassiveBuffs: plan.echoBuffs.echoSetPassiveBuffs,
        mainEchoStats: plan.echoBuffs.mainEchoStats,
        target: plan.target,
        damageType: "Average",
        rotationData: plan.rotationData,
        loadoutFormat: "Any",
        workerCount: 3,
        ...over,
      },
      { onFinished: resolve, onAborted: () => reject(new Error("aborted")) },
    );
  });
}

const sentBy = (kind: string, type: string): any[] => made.filter((w) => w.kind === kind).flatMap((w) => w.posted.filter((m) => m.type === type));

async function expectExact(plan: any, pool: any[], format: string, topN: number, minStats: any[] = [], labels: string[] = []): Promise<void> {
  made.length = 0;
  const { results } = await run(plan, pool, { topN, minStats, requiredSetBonusLabels: labels, loadoutFormat: format, slimResults: topN > 5 });
  const oracle = bruteForce(plan, pool, format, minStats, labels);
  const want = oracle.slice(0, topN);
  expect(oracle.length).toBeGreaterThan(0);
  expect(results.map((r) => r.targetValue)).toEqual(want.map((r) => r.score));
  // ties aside, the same loadouts: every score that occurs once is the same echoes
  const counts = new Map<number, number>();
  for (const r of oracle) counts.set(r.score, (counts.get(r.score) ?? 0) + 1);
  results.forEach((r, i) => {
    if (counts.get(want[i]!.score) === 1) expect(r.loadout.map((e: any) => e.echoId).join(",")).toBe(want[i]!.ids);
  });
}

describe("runOptimizerWorkers with plus's hooks", () => {
  it("sends the planned pool to the generator and the bound's setup to every processor", async () => {
    const { plan, pool } = await planFor("Mornye", ["RejuvenatingGlow", "MoonlitClouds"]);
    made.length = 0;
    await run(plan, pool, {});
    const [start] = sentBy("generator", "start");
    expect(start.data.uniquePool).toBe(true);
    expect(start.data.skipDominatedPartials).toBe(5);
    expect(start.data.echoes).toHaveLength(pool.length - 1); // the stat-identical copy is gone
    const inits = sentBy("processor", "init");
    expect(inits).toHaveLength(2);
    for (const init of inits) {
      expect(init.data.pruning.mainEchoKeys).toEqual([MAIN]);
      expect(init.data.pruning.pool).toHaveLength(pool.length - 1);
    }
  }, 60_000);

  it("gives the calculator's top five to the last bit: Mornye (Energy Regen), Jingran (HP), Any and 43311", async () => {
    const mornye = await planFor("Mornye", ["RejuvenatingGlow", "MoonlitClouds"]);
    await expectExact(mornye.plan, mornye.pool, "Any", 5);
    await expectExact(mornye.plan, mornye.pool, "43311", 5);
    const jingran = await planFor("Jingran", ["MoltenRift", "RejuvenatingGlow"]);
    await expectExact(jingran.plan, jingran.pool, "Any", 5);
  }, 120_000);

  it("gives the team optimizer's deep list exactly: a full list, a truncated one, a stat floor and a required set bonus", async () => {
    const { plan, pool } = await planFor("Mornye", ["RejuvenatingGlow", "MoonlitClouds"]);
    const all = bruteForce(plan, pool, "Any", [], []).length;
    expect(all).toBeGreaterThan(200);
    expect(all).toBeLessThan(TEAM_OPTIMIZER_LIST_DEPTH);
    await expectExact(plan, pool, "Any", TEAM_OPTIMIZER_LIST_DEPTH); // the whole run fits: no bar ever forms
    pruners.length = 0;
    await expectExact(plan, pool, "Any", 200); // truncated: the bar forms and the bound works
    expect(pruners.reduce((n, p) => n + p.stats.skipped, 0)).toBeGreaterThan(0);
    await expectExact(plan, pool, "Any", 200, [{ stat: "energyRegen", minValue: 240 }]);
    await expectExact(plan, pool, "Any", 50, [], ["Moonlit Clouds 2 Set"]);
    await expectExact(plan, pool, "Any", 50, [{ stat: "totalCritRate", minValue: 60 }], ["Moonlit Clouds 2 Set"]);
  }, 180_000);

  it("a stat floor row with no stat picked is not applied: the run gives what it gives with no floors, and a real floor beside it holds", async () => {
    const { plan, pool } = await planFor("Mornye", ["RejuvenatingGlow", "MoonlitClouds"]);
    const blank = { id: "373ytdazci", stat: null, minValue: null };
    made.length = 0;
    const free = await run(plan, pool, {});
    made.length = 0;
    const withBlank = await run(plan, pool, { minStats: [blank] });
    expect(free.results).toHaveLength(5);
    expect(withBlank.results.map((r) => r.targetValue)).toEqual(free.results.map((r) => r.targetValue));
    // no processor is handed the blank row
    for (const init of sentBy("processor", "init")) expect(init.data.minStats).toEqual([]);
    // a floor that does name a stat is still checked on every loadout, with the blank row beside it
    const floor = { stat: "energyRegen", minValue: 240 };
    expect(bruteForce(plan, pool, "Any", [floor], []).length).toBeLessThan(bruteForce(plan, pool, "Any", [], []).length);
    made.length = 0;
    const both = await run(plan, pool, { minStats: [blank, floor] });
    expect(both.results.map((r) => r.targetValue)).toEqual(bruteForce(plan, pool, "Any", [floor], []).slice(0, 5).map((r) => r.score));
  }, 120_000);

  it("turns the bound off for a rotation with per-action overrides, and the run stays exact", async () => {
    const { plan, pool } = await planFor("Mornye", ["RejuvenatingGlow", "MoonlitClouds"], { overrideFirstAction: true });
    expect(plan.rotationData.overrideActions.length).toBeGreaterThan(0);
    await expectExact(plan, pool, "Any", 5);
    expect(sentBy("processor", "init")[0].data.pruning).toBeNull();
  }, 60_000);

  it("a worker that cannot load ends the run and says so, once, and tears the rest down", async () => {
    const { plan, pool } = await planFor("Mornye", ["RejuvenatingGlow", "MoonlitClouds"]);
    const failure = async (extra: Record<string, unknown>) => {
      made.length = 0;
      const calls: string[] = [];
      runOptimizerWorkers(
        { echoes: pool, context: plan.context, topN: 5, mainEchoKeys: [MAIN], minStats: [], echoSetPassiveBuffs: plan.echoBuffs.echoSetPassiveBuffs, mainEchoStats: plan.echoBuffs.mainEchoStats, target: plan.target, damageType: "Average", rotationData: plan.rotationData, loadoutFormat: "Any", workerCount: 3 },
        { onAborted: () => calls.push("aborted"), onCleanedUp: () => calls.push("cleaned"), onFinished: () => calls.push("finished"), ...extra },
      );
      const event = { preventDefault: vi.fn(), message: "boom", type: "error" };
      made[0]!.onerror!(event);
      made[1]!.onerror!(event); // a second failure on its way in: nothing more happens
      await new Promise((r) => setTimeout(r, 5));
      expect(event.preventDefault).toHaveBeenCalled();
      expect(made.every((w) => w.terminated)).toBe(true);
      return calls;
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    // the team optimizer passes no handler: its onAborted rejects the search, where it used to wait for good
    expect(await failure({})).toEqual(["cleaned", "aborted"]);
    const failed = vi.fn();
    expect(await failure({ onWorkerFailed: failed })).toEqual(["cleaned"]);
    expect(failed).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  }, 60_000);

  it("a stopped run publishes nothing, however late its last message lands", async () => {
    const { plan, pool } = await planFor("Mornye", ["RejuvenatingGlow", "MoonlitClouds"]);
    made.length = 0;
    const finished = vi.fn();
    const handle = runOptimizerWorkers(
      { echoes: pool, context: plan.context, topN: 5, mainEchoKeys: [MAIN], minStats: [], echoSetPassiveBuffs: plan.echoBuffs.echoSetPassiveBuffs, mainEchoStats: plan.echoBuffs.mainEchoStats, target: plan.target, damageType: "Average", rotationData: plan.rotationData, loadoutFormat: "Any", workerCount: 3 },
      { onFinished: finished },
    );
    await new Promise((r) => setTimeout(r, 5));
    handle.cancel();
    // the shape a queued message has: a processor reporting in after the teardown, its generator already done
    const generator = made.find((w) => w.kind === "generator")!;
    const processors = made.filter((w) => w.kind === "processor");
    processors.forEach((w) => w.onmessage?.({ data: { type: "ready" } }));
    generator.onmessage?.({ data: { type: "done", totalGenerated: 0 } });
    processors.forEach((w) => w.onmessage?.({ data: { type: "result", results: [], processed: 0 } }));
    await new Promise((r) => setTimeout(r, 5));
    expect(finished).not.toHaveBeenCalled();
  }, 60_000);
});
