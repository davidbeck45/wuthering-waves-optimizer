// @vitest-environment node
// Wuthering Tools+ "Build it for me" — the page and the CLI give the same answer (critic item 3, batch 3c). The page
// runs upstream's generator / processor workers (`workerBackend`), the CLI the inline backend. Here the worker modules
// themselves run in this thread, one fresh module instance per worker, each message delivered later than the last by a
// seeded delay, so batches finish in an order the test does not choose: what the browser's scheduler does. Fixture data
// only: the public Cartethyia account and synthetic echoes with ties built in.
import { beforeAll, describe, expect, it } from "vitest";
import account from "../myRankings/__fixtures__/cartethyiaAccount.json";
import { DEFAULT_OPTIONS } from "./constraints";
import { emptyPlan, echoKeysOf, parseMainStats, type MemberPlan } from "./rileyPlan";
import { bestLoadoutOf, inlineBackend, MAX_TIE_SEARCH, scoreLoadoutInline, type MemberJob, type OptimizerBackend, type ScoredLoadout } from "./headlessOptimizer";
import { buildMyTeam, type BuildTeamResult } from "./buildTeam";
import { workerBackend } from "./workerBackend";
import { speciesByCost } from "../optimizer/testFixture";

/* eslint-disable @typescript-eslint/no-explicit-any */

/* ---------------------------------------------------------------------------- the workers, in this thread */

// eslint-disable-next-line no-unused-vars -- the parameter of a function type
type Post = (message: unknown) => void;

interface WorkerModule {
  handle: Post;
  free: boolean;
}

let sender: Post | null = null;
let generatorSender: Post | null = null;
const processors: WorkerModule[] = [];
let generator: WorkerModule;

async function loadWorkerModule(path: string): Promise<WorkerModule> {
  const self: any = { onmessage: null, postMessage: (message: unknown) => (sender ?? generatorSender)?.(message) };
  (globalThis as any).self = self;
  await import(/* @vite-ignore */ path);
  // every module's handler reads the global `self` only to post, which routes by who is running
  return { handle: (message) => self.onmessage({ data: message }), free: true };
}

beforeAll(async () => {
  generator = await loadWorkerModule("../../workers/generator.worker.ts?parity");
  for (let i = 0; i < 8; i++) processors.push(await loadWorkerModule(`../../workers/processor.worker.ts?parity=${i}`));
  const route = (globalThis as any).self;
  route.postMessage = (message: unknown) => (sender ?? generatorSender)?.(message);
}, 60_000);

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** A worker over a module instance: messages in order, each after a seeded delay, and its replies the same way. */
function localWorker(mod: WorkerModule, rand: () => number, kind: "generator" | "processor", batchSize: number): any {
  const inbox: unknown[] = [];
  let busy = false;
  // a processor now and then stalls, so a batch handed out later can answer first; the generator keeps them fed
  const delay = (): number => (kind === "processor" && rand() < 0.3 ? 3 + rand() * 9 : 0);
  const w: any = {
    onmessage: null,
    onerror: null,
    terminated: false,
    postMessage(message: any) {
      const copy = structuredClone(message);
      if (kind === "generator" && copy.type === "start") copy.data.batchSize = batchSize;
      inbox.push(copy);
      pump();
    },
    terminate() {
      w.terminated = true;
      mod.free = true;
    },
  };
  const reply = (message: unknown): void => {
    const copy = structuredClone(message);
    setTimeout(() => {
      if (!w.terminated) w.onmessage?.({ data: copy });
    }, delay());
  };
  function pump(): void {
    if (busy || !inbox.length) return;
    busy = true;
    setTimeout(() => {
      busy = false;
      if (w.terminated) return;
      const message = inbox.shift();
      if (kind === "generator") generatorSender = reply;
      else sender = reply;
      try {
        mod.handle(message);
      } finally {
        sender = null;
      }
      pump();
    }, delay());
  }
  return w;
}

/** The page's backend on the real worker modules: `workers` total, batches of `batchSize`, a seeded schedule. */
function pageBackend(workers: number, seed: number, batchSize = 7): OptimizerBackend {
  const rand = seeded(seed);
  return workerBackend({
    workerCount: workers,
    createGenerator: () => localWorker(generator, rand, "generator", batchSize),
    createProcessor: () => {
      const mod = processors.find((p) => p.free);
      if (!mod) throw new Error("the test ran out of processor modules");
      mod.free = false;
      return localWorker(mod, rand, "processor", batchSize);
    },
  });
}

/* ------------------------------------------------------------------------------------------------ the fixture */

const characters: Record<string, any> = JSON.parse(JSON.stringify(account.characters));

const plan = (erNeed: number | null): MemberPlan => ({
  ...emptyPlan("Cartethyia"),
  source: "riley",
  mainDps: true,
  share: 0.87,
  sets: [{ key: "WindwardPilgrimage", pieces: 5 }],
  setsLabel: "Windward Pilgrimage 5pc",
  mainEcho: { name: "Reminiscence: Fleurdelys", keys: echoKeysOf("Reminiscence: Fleurdelys") },
  mainStats: parseMainStats("44111 CR CD hp hp hp"),
  erNeed,
});

const echo = (echoId: string, species: string, type: number, stat: string, lines: Array<[string, number]>): any => {
  const out: any = { echo: species, type, rank: 5, stat, echoId, echoSet: "WindwardPilgrimage" };
  lines.forEach(([k, v], i) => {
    out[`echoSubStatsType${i + 1}`] = k;
    out[`echoSubStatsValue${i + 1}`] = v;
  });
  return out;
};

const ONE_COSTS = speciesByCost()[1]!;

/** Tied on ER, not on damage: every echo that holds ER is in every top build, the rest differ in crit only, so a good
 *  many loadouts hold the most ER and each deals its own damage. */
function erTies(): any[] {
  return [
    echo("m1", "ReminiscenceFleurdelys", 4, "CritRate", [["EnergyRegen", 10], ["CritDMG", 12]]),
    echo("m2", "ReminiscenceFleurdelys", 4, "CritRate", [["EnergyRegen", 10], ["CritDMG", 20]]),
    echo("k1", "NightmareKelpie", 4, "CritDMG", [["EnergyRegen", 8], ["CritRate", 6]]),
    echo("k2", "NightmareKelpie", 4, "CritDMG", [["EnergyRegen", 8], ["CritRate", 9]]),
    echo("o2", ONE_COSTS[1]!, 1, "HP", [["CritRate", 6.3]]),
    echo("o3", ONE_COSTS[2]!, 1, "HP", [["CritRate", 7.5]]),
    echo("o4", ONE_COSTS[3]!, 1, "HP", [["CritRate", 8.1]]),
    echo("o5", ONE_COSTS[4]!, 1, "HP", [["CritDMG", 12.6]]),
    echo("o6", ONE_COSTS[5]!, 1, "HP", [["CritDMG", 15]]),
    echo("o7", ONE_COSTS[6]!, 1, "HP", [["CritDMG", 21]]),
    // last in the pool: the stream reaches the most ER late, so each backend's top five has to throw loadouts out,
    // and upstream's heap and the inline list throw out different ones
    echo("o9", ONE_COSTS[0]!, 1, "HP", [["EnergyRegen", 12]]),
  ];
}

/** Tied on damage as well: 1-cost echoes of different species with the same numbers, so dozens of loadouts score alike
 *  and only their ids tell them apart. Two copies of the main echo with the same numbers too: the optimizer keeps one. */
function damageTies(): any[] {
  const list = [
    echo("zm", "ReminiscenceFleurdelys", 4, "CritRate", [["CritDMG", 20]]),
    echo("am", "ReminiscenceFleurdelys", 4, "CritRate", [["CritDMG", 20]]),
    echo("k1", "NightmareKelpie", 4, "CritDMG", [["CritRate", 9]]),
    // weak ones first, so each top five fills with them and has to throw them out
    ...ONE_COSTS.slice(8, 11).map((species, i) => echo(`b${i}`, species, 1, "HP", [["CritRate", 6.3]])),
  ];
  ONE_COSTS.slice(0, 8).forEach((species, i) => list.push(echo(`t${7 - i}`, species, 1, "HP", [["CritRate", 8.1]])));
  return list;
}

const shuffled = <T>(list: readonly T[], seed: number): T[] => {
  const rand = seeded(seed);
  return list
    .map((x) => ({ x, k: rand() }))
    .sort((a, b) => a.k - b.k)
    .map((p) => p.x);
};

const run = (echoes: any[], erNeed: number | null, backend: OptimizerBackend): Promise<BuildTeamResult> =>
  buildMyTeam({ characters, inventory: { echoes, equipped: {} }, team: { id: null, name: "Cartethyia", characterIds: ["Cartethyia", null, null] }, plans: [plan(erNeed)], order: [0], options: DEFAULT_OPTIONS, erFloors: [erNeed] }, backend);

const summary = (r: BuildTeamResult): string => {
  const m = r.members[0]!;
  return `${m.status} ${m.after?.picks.map((p) => p.echo.echoId).join(",")} ${m.after?.value} ${m.after?.menuEr}`;
};

describe("the page's workers and the CLI's inline backend agree", () => {
  it("an ER floor out of reach: the same build, the most damage of the many tied on the most ER", async () => {
    const echoes = erTies();
    const inline = await run(echoes, 400, inlineBackend());
    const m = inline.members[0]!;
    expect(m.status).toBe("ok");
    expect(m.erMet).toBe(false);
    expect(m.erUnreachable).toBe(true);

    // every complete build by hand: the search must land on the best of those holding the most ER
    const job = m.after!.picks.length ? await jobOf(echoes) : null;
    const pool = echoes;
    const mains = pool.filter((e) => e.echo === "ReminiscenceFleurdelys");
    const fours = pool.filter((e) => e.echo === "NightmareKelpie");
    const ones = pool.filter((e) => e.type === 1);
    const all: ScoredLoadout[] = [];
    for (const a of mains) for (const b of fours) for (let i = 0; i < ones.length; i++) for (let j = i + 1; j < ones.length; j++) for (let k = j + 1; k < ones.length; k++) all.push(scoreLoadoutInline(job!, [a, b, ones[i], ones[j], ones[k]]));
    const most = Math.max(...all.map((l) => l.energyRegen));
    const tied = all.filter((l) => l.energyRegen >= most - 1e-9);
    // the top five can't hold them: the case the first-of-a-top-five rule got wrong
    expect(tied.length).toBeGreaterThan(5);
    expect(new Set(tied.map((l) => l.targetValue)).size).toBeGreaterThan(5);
    const best = tied.reduce((a, b) => (b.targetValue > a.targetValue ? b : a));
    expect(m.after!.optimizerValue).toBeCloseTo(best.targetValue, 6);
    expect([...m.after!.picks.map((p) => p.echo.echoId)].sort()).toEqual(best.loadout.map((e) => e.echoId).sort());

    const want = summary(inline);
    for (const [workers, seed, batch] of [[2, 1, 7], [5, 2, 7], [5, 3, 3], [9, 4, 1000]] as const) {
      const backend = pageBackend(workers, seed, batch);
      expect(summary(await run(echoes, 400, backend)), `${workers} workers, seed ${seed}, batches of ${batch}`).toBe(want);
      backend.dispose?.();
    }
  }, 120_000);

  it("a floor in reach with dozens of builds tied on damage: the same build, the lowest echo ids", async () => {
    const echoes = damageTies();
    const inline = await run(echoes, null, inlineBackend());
    const ids = inline.members[0]!.after!.picks.map((p) => String(p.echo.echoId));
    expect(ids[0]).toBe("am");
    // eight 1-cost echoes alike, three worn: the lowest three ids, whichever order the pool walks them in
    expect(ids.filter((id) => id.startsWith("t")).sort()).toEqual(["t0", "t1", "t2"]);
    const want = summary(inline);
    for (const [workers, seed, batch] of [[2, 5, 7], [5, 6, 7], [5, 7, 2], [5, 8, 3], [9, 9, 2], [9, 10, 5], [9, 13, 1]] as const) {
      const backend = pageBackend(workers, seed, batch);
      expect(summary(await run(echoes, null, backend)), `${workers} workers, seed ${seed}, batches of ${batch}`).toBe(want);
      backend.dispose?.();
    }
  }, 120_000);

  it("the inventory's order changes nothing, on either backend", async () => {
    for (const [make, need] of [[erTies, 400], [damageTies, null]] as const) {
      const want = summary(await run(make(), need, inlineBackend()));
      for (const seed of [11, 12]) {
        expect(summary(await run(shuffled(make(), seed), need, inlineBackend()))).toBe(want);
        const backend = pageBackend(5, seed);
        expect(summary(await run(shuffled(make(), seed), need, backend))).toBe(want);
        backend.dispose?.();
      }
    }
  }, 120_000);
});

/** A job for the fixture's objective, through the run's own path (the search API hands it back). */
async function jobOf(echoes: any[]): Promise<MemberJob> {
  let job: MemberJob | null = null;
  const inner = inlineBackend();
  await run(echoes, 400, {
    ...inner,
    optimize(j, request, opts) {
      if (!j.id.endsWith(":er")) job = j;
      return inner.optimize(j, request, opts);
    },
  });
  return job!;
}

describe("bestLoadoutOf", () => {
  const loadout = (...ids: string[]): any[] => ids.map((echoId) => ({ echoId }));
  const scored = (value: number, ...ids: string[]): ScoredLoadout => ({ loadout: loadout(...ids), targetValue: value, energyRegen: 1 });
  const job = { id: "j", characterId: "x" } as MemberJob;
  const request = { pool: [], mainEchoKeys: [], loadoutFormat: "Any" as const, minStats: [], topN: 5 };
  /** a backend whose top N is the first N of `all`, best first, as a first-come heap would leave it */
  const fake = (all: ScoredLoadout[], calls: number[] = []): OptimizerBackend => ({
    optimize: async (_job, r) => {
      calls.push(r.topN);
      return { results: all.slice(0, r.topN), processed: all.length, generated: all.length };
    },
    score: async () => [],
  });

  it("takes the top score when nothing ties", async () => {
    const calls: number[] = [];
    const out = await bestLoadoutOf(fake([scored(9, "z"), scored(8, "a")], calls), job, request);
    expect(out.best?.loadout[0].echoId).toBe("z");
    expect(calls).toEqual([5]);
  });

  it("breaks a tie on the main echo's id, then the other ids, whatever order the backend gave", async () => {
    const out = await bestLoadoutOf(fake([scored(9, "b", "a"), scored(9, "a", "z", "y"), scored(9, "a", "y", "x"), scored(1, "a")]), job, request);
    expect(out.best?.loadout.map((e) => e.echoId)).toEqual(["a", "y", "x"]);
  });

  it("a tie between a full loadout and a shorter one goes to the full one, whatever the ids", async () => {
    const out = await bestLoadoutOf(fake([scored(9, "a", "b"), scored(9, "z", "y", "x"), scored(1, "a")]), job, request);
    expect(out.best?.loadout.map((e) => e.echoId)).toEqual(["z", "y", "x"]);
  });

  it("counts on across a widened search: the progress never runs backwards", async () => {
    const seen: number[] = [];
    const all = [...Array.from({ length: 6 }, (_, i) => scored(9, `t${i}`)), scored(1, "low")];
    const backend: OptimizerBackend = {
      optimize: async (_job, r, opts) => {
        opts?.onProgress?.({ processed: 7, generated: 7 });
        return { results: all.slice(0, r.topN), processed: 7, generated: 7 };
      },
      score: async () => [],
    };
    await bestLoadoutOf(backend, job, request, { onProgress: (p) => seen.push(p.processed) });
    expect(seen).toEqual([7, 14]);
  });

  it("counts scores a rounding apart as tied, and a real gap as a gap", async () => {
    const out = await bestLoadoutOf(fake([scored(1000 * (1 + 1e-12), "z"), scored(1000, "a")]), job, request);
    expect(out.best?.loadout[0].echoId).toBe("a");
    const gap = await bestLoadoutOf(fake([scored(1000 * (1 + 1e-6), "z"), scored(1000, "a")]), job, request);
    expect(gap.best?.loadout[0].echoId).toBe("z");
  });

  it("widens the search until the tied group ends inside the results: a full top N of ties may leave some out", async () => {
    const calls: number[] = [];
    // the backend's top five is all ties; the lowest ids only come back once the top N reaches past the group
    const all = [...Array.from({ length: 12 }, (_, i) => scored(9, `t${String(99 - i)}`)), scored(1, "low")];
    const out = await bestLoadoutOf(fake(all, calls), job, request);
    expect(calls).toEqual([5, 40]);
    expect(out.best?.loadout[0].echoId).toBe("t88");
    expect(out.processed).toBe(all.length * 2);
  });

  it("stops widening at the cap", async () => {
    const calls: number[] = [];
    const all = Array.from({ length: MAX_TIE_SEARCH * 3 }, (_, i) => scored(9, `t${i}`));
    await bestLoadoutOf(fake(all, calls), job, request);
    expect(calls[calls.length - 1]).toBe(MAX_TIE_SEARCH);
  });

  it("nothing found is nothing found", async () => {
    expect((await bestLoadoutOf(fake([]), job, request)).best).toBeNull();
  });
});

