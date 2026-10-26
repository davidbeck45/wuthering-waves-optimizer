// Wuthering Tools+ Echo Lab — one whole-account pass (best owner + verdict for every inventory echo, Tune or
// Feed for the ones still being tuned, optionally the benchmark score of every built character), and the job
// dispatcher the worker host runs. Pure/async, worker-safe.
import { bestOwners, type BestOwnerOptions, type BestOwnerResult } from "./bestOwner";
import { benchmarkScore, type BenchmarkOptions, type BenchmarkResult } from "./benchmarkScore";
import { builtCharacterIds, isCancelled, makePacer, type LabSession, type RunControl } from "./core";
import { echoPotential, type EchoPotentialResult, type PotentialOptions, type PotentialTarget } from "./echoPotential";
import { engineView, type EngineViewOptions, type EngineViewResult } from "./engineView";
import { rerollAdvice, type RerollAdviceResult, type RerollOptions } from "./rerollAdvice";

export interface BenchmarkBatchResult {
  results: BenchmarkResult[];
  /** characters that could not be benchmarked, and why */
  errors: Array<{ id: string; reason: string }>;
}

export interface EchoLabPassOptions extends BestOwnerOptions {
  /** also benchmark every built character (true) or these ones (default false) */
  benchmark?: boolean | string[];
  benchmarkOptions?: BenchmarkOptions;
}

export interface EchoLabPassResult {
  fingerprint: string;
  computedAt: string;
  ms: number;
  scorings: number;
  bestOwner: BestOwnerResult;
  benchmarks: BenchmarkBatchResult | null;
}

/** The jobs the worker runs (and the main-thread fallback). */
export type EchoLabJob =
  | { kind: "pass"; options?: EchoLabPassOptions }
  | { kind: "bestOwner"; options?: BestOwnerOptions }
  | { kind: "benchmark"; characterIds?: string[]; options?: BenchmarkOptions }
  | { kind: "potential"; echoId: string; target: PotentialTarget; options?: PotentialOptions }
  | { kind: "reroll"; characterId: string; slot: number; options?: RerollOptions }
  | { kind: "engineView"; characterId: string; options?: EngineViewOptions };

export interface EchoLabResultMap {
  pass: EchoLabPassResult;
  bestOwner: BestOwnerResult;
  benchmark: BenchmarkBatchResult;
  potential: EchoPotentialResult;
  reroll: RerollAdviceResult;
  engineView: EngineViewResult;
}

export type EchoLabResult<J extends EchoLabJob> = EchoLabResultMap[J["kind"]];

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

export async function benchmarkMany(session: LabSession, ids: string[], options: BenchmarkOptions = {}, control: RunControl = {}): Promise<BenchmarkBatchResult> {
  const pace = makePacer(control);
  const results: BenchmarkResult[] = [];
  const errors: Array<{ id: string; reason: string }> = [];
  for (let i = 0; i < ids.length; i++) {
    try {
      // per-character progress inside would reset the bar every character; report per character instead
      results.push(await benchmarkScore(session, ids[i], options, { shouldCancel: control.shouldCancel, yieldMs: control.yieldMs }));
    } catch (err) {
      if (isCancelled(err)) throw err;
      errors.push({ id: ids[i], reason: err instanceof Error ? err.message : String(err) });
    }
    await pace({ phase: "benchmark", done: i + 1, total: ids.length, label: results[results.length - 1]?.name ?? ids[i] });
  }
  return { results, errors };
}

export async function runEchoLabPass(session: LabSession, options: EchoLabPassOptions = {}, control: RunControl = {}): Promise<EchoLabPassResult> {
  const started = now();
  const startScorings = session.scorings;
  const bestOwner = await bestOwners(session, options, control);
  let benchmarks: BenchmarkBatchResult | null = null;
  if (options.benchmark) {
    const ids = Array.isArray(options.benchmark) ? options.benchmark : bestOwner.characters.map((c) => c.id);
    benchmarks = await benchmarkMany(session, ids, options.benchmarkOptions, control);
  }
  return {
    fingerprint: session.fingerprint,
    computedAt: new Date().toISOString(),
    ms: now() - started,
    scorings: session.scorings - startScorings,
    bestOwner,
    benchmarks,
  };
}

/** Runs one job on a session. */
export async function runJob(session: LabSession, job: EchoLabJob, control: RunControl = {}): Promise<EchoLabResultMap[EchoLabJob["kind"]]> {
  switch (job.kind) {
    case "pass":
      return runEchoLabPass(session, job.options, control);
    case "bestOwner":
      return bestOwners(session, job.options, control);
    case "benchmark":
      return benchmarkMany(session, job.characterIds ?? builtCharacterIds(session.account), job.options, control);
    case "potential":
      return echoPotential(session, job.echoId, job.target, job.options, control);
    case "reroll":
      return rerollAdvice(session, job.characterId, job.slot, job.options, control);
    case "engineView":
      return engineView(session, job.characterId, job.options, control);
    default:
      throw new Error(`Unknown Echo Lab job ${(job as { kind?: string }).kind}`);
  }
}
