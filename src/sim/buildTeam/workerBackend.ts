// Wuthering Tools+ — "Build it for me" in the browser: upstream's optimizer workers (src/workers/generator.worker.ts,
// processor.worker.ts), driven from the main thread the way Calculator.vue's `optimizeWithWorkers` drives them —
// init → ready → start, pull-based `continue` back-pressure, slim `process` batches, a merged top-N — with perf's
// `planOptimizerGeneration` deciding the deduped pool and the exact fast paths. One generator shard (a team member's
// filtered pool is small), processors as the user's worker setting allows. No nested workers.
//
// `score()` reuses a processor worker as a batch scorer for the swap pass: initialised once per job with a top-N far
// above any batch, so every loadout it scores comes back.
import { getOptimizerLoadoutHash, splitOptimizerWorkerCount } from "../../calculator/optimizer";
import { planOptimizerGeneration } from "../optimizer/optimizerPool";
import type { MemberJob, OptimizeOutcome, OptimizeRequest, OptimizerBackend, ScoredLoadout } from "./headlessOptimizer";

/* eslint-disable @typescript-eslint/no-explicit-any */

type WorkerLike = Pick<Worker, "postMessage" | "terminate"> & { onmessage: ((e: MessageEvent) => void) | null; onerror: ((e: ErrorEvent) => void) | null };

export interface WorkerBackendOptions {
  /** total workers (upstream's Settings › Preferences value); split like the Calculator's */
  workerCount?: number;
  createGenerator?: () => WorkerLike;
  createProcessor?: () => WorkerLike;
}

const defaultGenerator = (): WorkerLike => new Worker(new URL("../../workers/generator.worker.ts", import.meta.url), { type: "module" }) as unknown as WorkerLike;
const defaultProcessor = (): WorkerLike => new Worker(new URL("../../workers/processor.worker.ts", import.meta.url), { type: "module" }) as unknown as WorkerLike;

/** Calculator.vue's `serializeEchoes`: only the fields the optimizer reads, numbers coerced. */
export function serializeOptimizerEchoes(echoes: readonly any[]): any[] {
  const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
  const coerce = (v: unknown): number | null => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return echoes
    .filter((echo) => echo && typeof echo === "object")
    .map((echo) => ({
      echoId: echo.echoId ?? null,
      echo: echo.echo ?? null,
      echoSet: echo.echoSet ?? null,
      echoSubStatsType1: echo.echoSubStatsType1 ?? null,
      echoSubStatsType2: echo.echoSubStatsType2 ?? null,
      echoSubStatsType3: echo.echoSubStatsType3 ?? null,
      echoSubStatsType4: echo.echoSubStatsType4 ?? null,
      echoSubStatsType5: echo.echoSubStatsType5 ?? null,
      echoSubStatsValue1: num(echo.echoSubStatsValue1),
      echoSubStatsValue2: num(echo.echoSubStatsValue2),
      echoSubStatsValue3: num(echo.echoSubStatsValue3),
      echoSubStatsValue4: num(echo.echoSubStatsValue4),
      echoSubStatsValue5: num(echo.echoSubStatsValue5),
      rank: coerce(echo.rank),
      stat: echo.stat ?? null,
      type: coerce(echo.type),
    }));
}

/** Calculator.vue's `createSerializableContext`: a JSON round trip drops functions and Vue proxies. */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "function" ? undefined : v)));

const abortError = (): Error => Object.assign(new Error("The optimizer run was cancelled"), { name: "AbortError" });

function initData(job: MemberJob, minStats: OptimizeRequest["minStats"], topN: number): Record<string, unknown> {
  return {
    context: plain(job.context),
    minStats: minStats.map((s) => ({ ...s })),
    echoSetPassiveBuffs: plain(job.echoSetPassiveBuffs),
    mainEchoStats: plain(job.mainEchoStats),
    target: job.target,
    damageType: job.damageType,
    rotationData: plain(job.rotationData),
    topN,
  };
}

const toScored = (result: any, byId: Map<string, any>): ScoredLoadout | null => {
  if (!result || !Array.isArray(result.loadout) || !result.loadout.length) return null;
  const loadout = result.loadout.map((e: any) => byId.get(e?.echoId) ?? e);
  const targetValue = typeof result.targetValue === "number" ? result.targetValue : Number(result.targetValue);
  if (!Number.isFinite(targetValue)) return null;
  return { loadout, targetValue, energyRegen: Number(result.context?.finalStats?.energyRegen ?? 0) };
};

export function workerBackend(options: WorkerBackendOptions = {}): OptimizerBackend {
  const createGenerator = options.createGenerator ?? defaultGenerator;
  const createProcessor = options.createProcessor ?? defaultProcessor;
  const total = Math.max(2, Math.floor(options.workerCount ?? Math.min(8, (globalThis.navigator?.hardwareConcurrency ?? 4))));
  const { processorCount } = splitOptimizerWorkerCount(total);
  const scorers = new Map<string, { worker: WorkerLike; ready: Promise<void>; queue: Promise<unknown> }>();

  const optimize: OptimizerBackend["optimize"] = (job, request, opts = {}) =>
    new Promise<OptimizeOutcome>((resolve, reject) => {
      if (opts.signal?.aborted) return reject(abortError());
      const byId = new Map(request.pool.map((e) => [e.echoId, e]));
      const serialized = serializeOptimizerEchoes(request.pool);
      const plan = planOptimizerGeneration({
        echoes: serialized,
        mainEchoKeys: [...request.mainEchoKeys],
        loadoutFormat: request.loadoutFormat,
        topN: request.topN,
        target: job.target,
        echoSetPassiveBuffs: job.echoSetPassiveBuffs,
        context: job.context,
        rotationData: job.rotationData,
      });
      const batchSize = (globalThis.navigator?.hardwareConcurrency ?? 4) >= 8 ? 5000 : 2000;
      const generator = createGenerator();
      const processors = Array.from({ length: processorCount }, () => createProcessor());
      const maxQueued = processorCount * 2;
      const busy = new Map<WorkerLike, boolean>();
      const queue: any[][] = [];
      const heap: any[] = [];
      const seen = new Set<number>();
      let ready = 0;
      let generated = 0;
      let processed = 0;
      let generatorDone = false;
      let awaitingContinue = false;
      let finished = false;

      const cleanup = (): void => {
        if (finished) return;
        finished = true;
        opts.signal?.removeEventListener("abort", onAbort);
        for (const w of [generator, ...processors]) {
          try {
            w.postMessage({ type: "stop" });
          } catch {
            // already gone
          }
          w.terminate();
        }
      };
      const fail = (err: unknown): void => {
        cleanup();
        reject(err);
      };
      const onAbort = (): void => fail(abortError());
      opts.signal?.addEventListener("abort", onAbort, { once: true });

      const maybeContinue = (): void => {
        if (finished || generatorDone || !awaitingContinue || queue.length >= maxQueued) return;
        awaitingContinue = false;
        generator.postMessage({ type: "continue" });
      };
      const distribute = (): void => {
        if (finished || ready < processors.length) return;
        while (queue.length) {
          const free = processors.find((w) => !busy.get(w));
          if (!free) break;
          busy.set(free, true);
          free.postMessage({ type: "process", data: { batch: queue.shift(), batchId: 0 } });
        }
        maybeContinue();
        if (generatorDone && !queue.length && processors.every((w) => !busy.get(w))) {
          const results = heap
            .slice()
            .sort((a, b) => b.targetValue - a.targetValue)
            .map((r) => toScored(r, byId))
            .filter((r): r is ScoredLoadout => !!r);
          cleanup();
          resolve({ results, processed, generated });
        }
      };
      const merge = (results: any[]): void => {
        for (const r of results ?? []) {
          if (!r?.loadout?.length) continue;
          const hash = getOptimizerLoadoutHash(r.loadout);
          if (seen.has(hash)) continue;
          seen.add(hash);
          const value = typeof r.targetValue === "number" ? r.targetValue : Number(r.targetValue);
          if (heap.length < request.topN) heap.push({ ...r, targetValue: value });
          else {
            let min = 0;
            for (let i = 1; i < heap.length; i++) if (heap[i].targetValue < heap[min].targetValue) min = i;
            if (value > heap[min].targetValue) heap[min] = { ...r, targetValue: value };
          }
        }
      };

      const init = initData(job, request.minStats, request.topN);
      for (const w of processors) {
        busy.set(w, false);
        w.onerror = (e) => fail(new Error(`An optimizer worker failed${e?.message ? `: ${e.message}` : ""}`));
        w.onmessage = (e) => {
          const msg = e.data ?? {};
          if (msg.type === "ready") {
            ready += 1;
            if (ready === processors.length) distribute();
          } else if (msg.type === "result" || msg.type === "error") {
            busy.set(w, false);
            processed += msg.processed || 0;
            if (msg.type === "result") merge(msg.results);
            opts.onProgress?.({ processed, generated });
            distribute();
          }
        };
        w.postMessage({ type: "init", data: init });
      }
      generator.onerror = (e) => fail(new Error(`The optimizer's generator failed${e?.message ? `: ${e.message}` : ""}`));
      generator.onmessage = (e) => {
        const msg = e.data ?? {};
        if (msg.type === "ready") {
          generator.postMessage({
            type: "start",
            data: { echoes: plan.echoes, mainEchoKeys: [...request.mainEchoKeys], batchSize, loadoutFormat: request.loadoutFormat, shardIndex: 0, shardCount: 1, uniquePool: plan.uniquePool, skipDominatedPartials: plan.skipDominatedPartials },
          });
        } else if (msg.type === "batch") {
          generated = msg.totalGenerated || generated;
          awaitingContinue = true;
          if (msg.batch?.length) queue.push(msg.batch);
          opts.onProgress?.({ processed, generated });
          distribute();
          maybeContinue();
        } else if (msg.type === "done" || msg.type === "error") {
          if (msg.type === "error") return fail(new Error(msg.error || "The optimizer's generator failed"));
          generated = msg.totalGenerated ?? generated;
          generatorDone = true;
          awaitingContinue = false;
          distribute();
        }
      };
      generator.postMessage({ type: "init" });
    });

  /** A processor worker initialised for this job, as a scorer (every loadout of a batch comes back). */
  const scorerFor = (job: MemberJob): { worker: WorkerLike; ready: Promise<void>; queue: Promise<unknown> } => {
    let s = scorers.get(job.id);
    if (s) return s;
    const worker = createProcessor();
    const ready = new Promise<void>((resolve, reject) => {
      worker.onmessage = (e) => {
        if (e.data?.type === "ready") resolve();
      };
      worker.onerror = (e) => reject(new Error(`An optimizer worker failed${e?.message ? `: ${e.message}` : ""}`));
    });
    worker.postMessage({ type: "init", data: initData(job, [], 1e9) });
    s = { worker, ready, queue: Promise.resolve() };
    scorers.set(job.id, s);
    return s;
  };

  const score: OptimizerBackend["score"] = async (job, loadouts, opts = {}) => {
    if (!loadouts.length) return [];
    const s = scorerFor(job);
    const run = async (): Promise<Array<ScoredLoadout | null>> => {
      await s.ready;
      if (scorers.get(job.id) !== s) throw new Error("The optimizer's scorer was stopped");
      if (opts.signal?.aborted) throw abortError();
      const byId = new Map(loadouts.flat().map((e) => [e.echoId, e]));
      const batch = loadouts.map((l) => serializeOptimizerEchoes(l));
      const results: any[] = await new Promise((resolve, reject) => {
        // a worker crash or a cancel mid-batch: drop this scorer (a late reply must never answer the next batch)
        const drop = (err: Error): void => {
          opts.signal?.removeEventListener("abort", onAbort);
          if (scorers.get(job.id) === s) scorers.delete(job.id);
          s.worker.terminate();
          reject(err);
        };
        const onAbort = (): void => drop(abortError());
        opts.signal?.addEventListener("abort", onAbort, { once: true });
        s.worker.onerror = (e) => drop(new Error(`An optimizer worker failed${e?.message ? `: ${e.message}` : ""}`));
        s.worker.onmessage = (e) => {
          const msg = e.data ?? {};
          if (msg.type === "result") {
            opts.signal?.removeEventListener("abort", onAbort);
            resolve(msg.results ?? []);
          } else if (msg.type === "error") drop(new Error(msg.error || "scoring failed"));
        };
        s.worker.postMessage({ type: "process", data: { batch, batchId: 0 } });
      });
      // the processor returns slot 0 + the rest sorted: match on that key
      const keyOf = (ids: string[]): string => `${ids[0]}|${ids.slice(1).sort().join(",")}`;
      const found = new Map<string, any>();
      for (const r of results) found.set(keyOf((r.loadout ?? []).map((e: any) => e?.echoId)), r);
      return loadouts.map((l) => toScored(found.get(keyOf(l.map((e) => e.echoId))), byId));
    };
    const next = s.queue.then(run, run);
    s.queue = next.catch(() => undefined);
    return next;
  };

  return {
    optimize,
    score,
    dispose() {
      for (const s of scorers.values()) s.worker.terminate();
      scorers.clear();
    },
  };
}
