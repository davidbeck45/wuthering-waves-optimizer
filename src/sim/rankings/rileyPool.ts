/**
 * Wuthering Tools+: Riley's `src/page/pool.ts` (the solver pool his comparison and team pages share), as the app runs
 * it. His page modules import `./pool.js`; `skittlePoolShim()` (vitePlugin.ts, in vite.config.ts) points that import
 * here, so his `loading.ts` (overlay, `ensureBestPicks`, `solveQuiet`) runs unchanged on this pool. Same exports, same
 * job queue (one team per message, every job carrying the filters of the pass that asked for it, a newer pass
 * dropping the older one's teams still in line, a pass wanting a team already out waiting on that answer). Four
 * differences, all the app's:
 *  - the worker is `solver.worker.ts` (his solver plus the app's "My build" spreads, account state and the run seam),
 *    and each new worker is sent `onWorkerStart()`'s messages first. His worker URL (`./solver.js?v=…`)
 *    is a template string Vite cannot bundle, and would be a ninth worker entry;
 *  - a job's answer is filed only under the `bestKey()` it was asked for (an account changed while it was out);
 *  - a sync's teams are `keep`: a table pass starting behind it never drops them (solveQueue.ts);
 *  - `paint()` races a timeout (rAF never fires in a background tab or a headless runner), and a worker whose
 *    script would not load leaves the pool (chunkReload.ts) instead of leaving its team unanswered.
 * It imports nothing of his: the controller binds his solver and model (`bindEngine`) once they have loaded, so the
 * controller can bring workers up while his modules are still loading (a `mine` visit, `solvesAhead`).
 */
import { reloadOnce, workerWouldNotLoad } from "../perf/chunkReload";
import { dropUnkept, keepInLine } from "./solveQueue";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Member = { name: string; mainDps: boolean };
type Solved = { picks: any; rows: any[]; scores: any; hidden: any[]; hiddenScores: any[] };

/** What the pool calls of his `solve/solver.ts` and `page/model.ts` (his pool.ts imports exactly these). */
export interface PoolEngine {
  solveTeam: (key: string, members: Member[], f: any, known: any, onShare?: (share: number) => void) => Solved;
  bestKey: (key: string, members: Member[], f: any) => string;
  picksKey: (key: string, members: Member[], f: any) => string;
  isProgress: (data: any) => boolean;
  picksCache: Map<string, any>;
  storeSolved: (key: string, solved: Solved, f: any) => void;
  solveFits: (bk: string, solved: Solved) => boolean;
}
let E!: PoolEngine;
/** His solver and model, once loaded: before this nothing is solved (workers may already be up). */
export function bindEngine(engine: PoolEngine): void {
  E = engine;
}

/** Two frames, not one: the first rAF callback runs before the frame is committed. Races a short timeout because
 *  rAF never fires in a background tab (or a headless runner), and every overlay phase awaits this. */
export const paint = (): Promise<void> =>
  new Promise((resolve) => {
    const done = (): void => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(done, 80);
    requestAnimationFrame(() => requestAnimationFrame(done));
  });

/** The one yield the main-thread paths need for the bar to move; throttled to ~50ms of work. */
let lastPaint = performance.now();
export async function breathe(): Promise<void> {
  if (performance.now() - lastPaint <= 50) return;
  await paint();
  lastPaint = performance.now();
}

const WORKER_LIMIT = 8;
let pool: Worker[] | null = null;
let poolTried = false;
let startMessages: () => unknown[] = () => [];

/** What each worker hears before its first team (the controller's "My build" spreads and account state). */
export function onWorkerStart(messages: () => unknown[]): void {
  startMessages = messages;
}
/** A message to every worker up now (a later worker hears it through `onWorkerStart`). */
export function broadcast(message: unknown): void {
  for (const w of pool ?? []) w.postMessage(message);
}
/** Whether the pool has been asked for yet (the controller brings it up early for a `mine` visit). */
export const poolStarted = (): boolean => poolTried;
/** Workers in the pool now (the rows-so-far wave: one paint once each has answered). */
export const poolSize = (): number => pool?.length ?? 0;

export function workerPool(): Worker[] | null {
  if (poolTried) return pool;
  poolTried = true;
  const want = Math.max(1, Math.min(WORKER_LIMIT, (navigator.hardwareConcurrency || 4) - 1));
  try {
    pool = Array.from({ length: want }, () =>
      new Worker(new URL("./solver.worker.ts", import.meta.url), { type: "module" }));
    for (const w of pool) {
      for (const message of startMessages()) w.postMessage(message);
      listen(w);
    }
  } catch (err) {
    console.warn("Workers unavailable, optimizing on the main thread instead:", err);
    pool = null;
  }
  return pool;
}

/** A team to solve: the filters it was asked under, the `bestKey()` it was asked for (the account key is part of a
 *  `mine` key: an answer that comes back after the account changed is not filed under the new one), and who waits. */
interface Job {
  id: number; key: string; members: Member[]; f: any; bk: string; known: any;
  /** a sync's own teams: a table pass starting behind it never drops them */
  keep: boolean;
  onShare: (share: number) => void; done: () => void;
}
const queue: Job[] = [];
const busy = new Map<Worker, Job>();
const inFlight = new Map<string, Promise<void>>();
let jobId = 0;

/** A worker's answers, routed by request id to the team it is on. One that throws or answers with a solve that does
 *  not fit this build is solved here instead, so the table is always complete. */
function listen(w: Worker): void {
  w.onmessage = ({ data }: MessageEvent<any>) => {
    const job = busy.get(w);
    if (!job || data?.id !== job.id) return;
    if (E.isProgress(data)) { job.onShare(data.share); return; }
    const solved: Solved = { picks: data.picks, rows: data.rows, scores: data.scores, hidden: data.hidden ?? [], hiddenScores: data.hiddenScores ?? [] };
    if (E.solveFits(job.bk, solved)) { settle(w, job, solved); return; }
    console.warn(`worker's solve for ${job.key} does not fit this build; solving it here`);
    settle(w, job, E.solveTeam(job.key, job.members, job.f, job.known));
  };
  w.onerror = (e) => {
    const job = busy.get(w);
    e.preventDefault();
    if (workerWouldNotLoad(e)) {
      if (!reloadOnce()) retire(w);
      return;
    }
    if (!job) return;
    console.warn(`worker failed on ${job.key}, solving it here:`, e.message);
    settle(w, job, E.solveTeam(job.key, job.members, job.f, job.known));
  };
}

/** A worker whose script would not load never answers, and a load failure can land before it holds a team, so nothing
 *  would ever ask again: it leaves the pool, its team goes back in line, and with no worker left the line is solved here. */
function retire(w: Worker): void {
  console.warn("a solver worker would not load");
  w.terminate();
  const job = busy.get(w);
  busy.delete(w);
  if (job) queue.unshift(job);
  pool = pool?.filter((other) => other !== w) ?? null;
  if (pool?.length) {
    for (const other of pool) if (!busy.has(other)) handOut(other);
    return;
  }
  pool = null;
  void drainHere();
}

function file(job: Job, solved: Solved): void {
  // filed only under the key it was asked for: the account (or a "My build" spread) moved while it was out otherwise
  if (E.bestKey(job.key, job.members, job.f) === job.bk) E.storeSolved(job.key, solved, job.f);
}
function settle(w: Worker, job: Job, solved: Solved): void {
  file(job, solved);
  busy.delete(w);
  // the worker gets its next team before anything hears of this one: a rows-so-far paint may run on this landing
  handOut(w);
  job.done();
}
function handOut(w: Worker): void {
  const job = queue.shift();
  if (!job) return;
  busy.set(w, job);
  w.postMessage({ id: job.id, teamKey: job.key, filters: job.f, picks: job.known });
}

/** With no pool, the line is solved here, one team at a time, yielding so the bar still moves. */
let draining = false;
async function drainHere(): Promise<void> {
  if (draining) return;
  draining = true;
  for (let job = queue.shift(); job; job = queue.shift()) {
    file(job, E.solveTeam(job.key, job.members, job.f, job.known, job.onShare));
    job.done();
    await breathe();
  }
  draining = false;
}

/** A new pass has started: the old one's teams still in line are dropped, unsolved (a sync's are kept). */
export function cancelQueued(): void {
  for (const job of dropUnkept(queue)) job.done();
}

/** Solve `teams` under `f` — on the pool when there is one — waiting on any already out. His signature, plus `keep`
 *  (a sync's teams) and `onTeam` (each team that lands: the table's rows-so-far paint). */
export function solveAll(
  teams: [string, Member[]][], f: any, share: (members: Member[], part: number) => void, keep = false, onTeam?: () => void,
): Promise<void> {
  const waits = teams.map(([key, members]) => {
    const bk = E.bestKey(key, members, f);
    const out = inFlight.get(bk);
    if (out) {
      if (keep) keepInLine(queue, bk);
      return out.then(() => { share(members, 1); onTeam?.(); });
    }
    const solved = new Promise<void>((resolve) => queue.push({
      id: jobId++, key, members, f, bk, keep, known: E.picksCache.get(E.picksKey(key, members, f)) ?? null,
      onShare: (part) => share(members, part),
      done: () => {
        inFlight.delete(bk);
        share(members, 1);
        onTeam?.();
        resolve();
      },
    }));
    inFlight.set(bk, solved);
    return solved;
  });
  const workers = workerPool();
  if (workers) {
    for (const w of workers) if (!busy.has(w)) handOut(w);
  } else void drainHere();
  return Promise.all(waits).then(() => undefined);
}
