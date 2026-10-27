// Wuthering Tools+ — the browser side of the Riley run seam (Wave 0): promise-based `solveMine` / `tracedRun`
// over the EXISTING solver worker (src/sim/rankings/solver.worker.ts answers the seam's messages through
// rileyWorker.ts). Request ids, progress, cancellation through an AbortSignal, and a memo keyed by engine commit
// + account (+ its builds) + spread + team key + picks, so a page re-opened on the same account never re-solves.
// The release guard runs here, on the main thread, where the app's character list lives: the worker only ever
// receives the blocked keys (Lily, until the app ships her).
//
//   const riley = rileyClient();                         // one worker for the app
//   const account = rileyAccountOf(characters, { echoes, equipped }, teams)   // or useRileyAccount()
//   const best = await riley.bestFor(["Shorekeeper", "Lynae", "Iuno"], { account });
//   const run = await riley.tracedRun(best!.teamKey, best!.best!.picks, { account, signal });
import { notInApp } from "../rankings/importFromRankings";
import { rileyTeamKeysFor } from "../rankings/syncTeams";
import { WUWA_CALC_COMMIT } from "./engineCommit";
import { bestOf, blockedKeysOf, DEFAULT_SUBS, memoKey, type FightCurve, type MineSolve, type RileyAccount, type RileyPick, type RileyTeamInfo, type RunError, type RunLite, type SubsMode } from "./rileyRun";
import { profileSignature, type FloorProfileSpec } from "../endgame/effects";
import { RILEY_CANCEL, RILEY_MESSAGE, RILEY_PROGRESS, type RileyRequest, type RileyResponse, type RileyResult, type RileyTeamsResult } from "./rileyWorker";

/** What the client needs of a worker — a real `Worker`, or an in-process stand-in in tests. */
export interface WorkerLike {
  postMessage(message: unknown): void;
  terminate(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: { message?: string; preventDefault?: () => void }) => void) | null;
}

export interface ClientRunOptions {
  account?: RileyAccount | null;
  subs?: SubsMode;
  signal?: AbortSignal;
}

export interface RileyClient {
  /** the wuwa_calc commit the worker runs (engineCommit.ts) */
  readonly commit: string;
  /** his team list (cached) */
  teams(signal?: AbortSignal): Promise<RileyTeamInfo[]>;
  /** app keys the app has not released, among his resonators */
  blocked(signal?: AbortSignal): Promise<string[]>;
  /** his keys for a composition (app character keys, any order): every loadout variant of those three */
  teamKeysFor(characterIds: Array<string | null>, signal?: AbortSignal): Promise<string[]>;
  /** the best `mine` row per key, in the order asked; skipped teams come back with a reason, never a rejection */
  solveMine(teamKeys: string[], opts?: ClientRunOptions & { onProgress?: (done: number, total: number) => void }): Promise<MineSolve[]>;
  /** the best row across a composition's variants, null when none solves */
  bestFor(characterIds: Array<string | null>, opts?: ClientRunOptions): Promise<MineSolve | null>;
  /** the traced run on these picks (null: the best `mine` row); rejects with a `RunError` (reason "notInApp",
   *  "stalePicks", …) or an AbortError */
  tracedRun(teamKey: string, picks?: RileyPick[] | null, opts?: ClientRunOptions): Promise<RunLite>;
  /** the ToA clear check: an untraced run of fixed picks against each enemy profile (null = the engine's own
   *  level-100 / 20 % enemy) as its damage curve, index-aligned; memoised per profile */
  curves(teamKey: string, picks: RileyPick[], profiles: Array<FloorProfileSpec | null>, opts?: ClientRunOptions & { onProgress?: (done: number, total: number) => void }): Promise<FightCurve[]>;
  /** forget every memoised solve and run (the worker stays) */
  clear(): void;
  dispose(): void;
}

export interface RileyClientOptions {
  createWorker?: () => WorkerLike;
  /** memo entries kept, least recently used dropped first */
  memo?: number;
}

const defaultWorker = (): WorkerLike =>
  new Worker(new URL("../rankings/solver.worker.ts", import.meta.url), { type: "module" }) as unknown as WorkerLike;

const abortError = (signal: AbortSignal): unknown => signal.reason ?? new DOMException("The operation was aborted.", "AbortError");

export function createRileyClient(options: RileyClientOptions = {}): RileyClient {
  const limit = options.memo ?? 200;
  const memo = new Map<string, Promise<unknown>>();
  const remember = <T>(key: string, value: Promise<T>): Promise<T> => {
    memo.set(key, value);
    while (memo.size > limit) memo.delete(memo.keys().next().value as string);
    // a failure or a cancel is never kept: the next ask runs it again
    value.catch(() => {
      if (memo.get(key) === value) memo.delete(key);
    });
    return value;
  };
  const recall = <T>(key: string): Promise<T> | undefined => {
    const hit = memo.get(key) as Promise<T> | undefined;
    if (hit) {
      memo.delete(key);
      memo.set(key, hit);
    }
    return hit;
  };

  let worker: WorkerLike | null = null;
  let nextId = 1;
  const pending = new Map<number, { resolve: (r: RileyResult) => void; reject: (e: unknown) => void; onProgress?: (done: number, total: number) => void }>();

  const start = (): WorkerLike => {
    if (worker) return worker;
    const w = (options.createWorker ?? defaultWorker)();
    w.onmessage = ({ data }) => {
      const msg = data as RileyResponse;
      if (!msg || typeof msg !== "object") return;
      const entry = pending.get(msg.id);
      if (!entry) return;
      if (msg.type === RILEY_PROGRESS) {
        entry.onProgress?.(msg.done, msg.total);
        return;
      }
      if (msg.type !== RILEY_MESSAGE) return;
      pending.delete(msg.id);
      if (msg.ok) entry.resolve(msg.result);
      else entry.reject(Object.assign(new Error(msg.error), msg.reason ? { reason: msg.reason } : {}, msg.notInApp ? { notInApp: msg.notInApp } : {}) as RunError);
    };
    w.onerror = (e) => {
      e?.preventDefault?.();
      // the worker is gone (a load failure, an engine crash): fail what was asked, start afresh next time
      const err = new Error(`The rankings engine worker failed${e?.message ? `: ${e.message}` : ""}`);
      for (const p of pending.values()) p.reject(err);
      pending.clear();
      worker?.terminate();
      worker = null;
    };
    worker = w;
    return w;
  };

  type Body = RileyRequest extends infer R ? (R extends { id: number } ? Omit<R, "id" | "type"> : never) : never;
  const request = <T extends RileyResult>(body: Body, signal?: AbortSignal, onProgress?: (done: number, total: number) => void): Promise<T> => {
    if (signal?.aborted) return Promise.reject(abortError(signal));
    const w = start();
    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
      const onAbort = (): void => {
        if (!pending.delete(id)) return;
        w.postMessage({ type: RILEY_CANCEL, id });
        reject(abortError(signal!));
      };
      pending.set(id, {
        resolve: (r) => {
          signal?.removeEventListener("abort", onAbort);
          resolve(r as T);
        },
        reject: (e) => {
          signal?.removeEventListener("abort", onAbort);
          reject(e);
        },
        onProgress,
      });
      signal?.addEventListener("abort", onAbort, { once: true });
      w.postMessage({ type: RILEY_MESSAGE, id, ...body } as RileyRequest);
    });
  };

  let teamList: Promise<{ teams: RileyTeamInfo[]; blocked: string[]; byKey: Record<string, Array<{ name: string }>> }> | null = null;
  const teamData = (signal?: AbortSignal): Promise<{ teams: RileyTeamInfo[]; blocked: string[]; byKey: Record<string, Array<{ name: string }>> }> => {
    teamList ??= request<RileyTeamsResult>({ op: "teams" }, signal).then((r) => ({
      teams: r.teams,
      blocked: blockedKeysOf(r.teams, notInApp),
      byKey: Object.fromEntries(r.teams.map((t) => [t.key, t.members])),
    }));
    teamList.catch(() => (teamList = null));
    return teamList;
  };

  const client: RileyClient = {
    commit: WUWA_CALC_COMMIT,
    teams: async (signal) => (await teamData(signal)).teams,
    blocked: async (signal) => (await teamData(signal)).blocked,
    teamKeysFor: async (ids, signal) => rileyTeamKeysFor(ids, (await teamData(signal)).byKey),

    async solveMine(teamKeys, opts = {}) {
      const { blocked } = await teamData(opts.signal);
      const account = opts.account ?? null;
      const subs = opts.subs ?? DEFAULT_SUBS;
      const keyOf = (teamKey: string): string => memoKey({ op: "solve", commit: WUWA_CALC_COMMIT, account, subs, teamKey });
      const found = new Map<string, Promise<MineSolve>>();
      const missing: string[] = [];
      for (const k of new Set(teamKeys)) {
        const hit = recall<MineSolve>(keyOf(k));
        if (hit) found.set(k, hit);
        else missing.push(k);
      }
      const known = teamKeys.length - missing.length;
      if (missing.length) {
        const batch = request<MineSolve[]>({ op: "solveMine", teamKeys: missing, opts: { account, subs, blocked } }, opts.signal, (done) =>
          opts.onProgress?.(known + done, teamKeys.length),
        );
        missing.forEach((k, i) => found.set(k, remember(keyOf(k), batch.then((r) => r[i]!))));
      } else opts.onProgress?.(teamKeys.length, teamKeys.length);
      return Promise.all(teamKeys.map((k) => found.get(k)!));
    },

    async bestFor(ids, opts = {}) {
      const keys = await client.teamKeysFor(ids, opts.signal);
      return keys.length ? bestOf(await client.solveMine(keys, opts)) : null;
    },

    async tracedRun(teamKey, picks = null, opts = {}) {
      const { blocked } = await teamData(opts.signal);
      const account = opts.account ?? null;
      const subs = opts.subs ?? DEFAULT_SUBS;
      const key = memoKey({ op: "trace", commit: WUWA_CALC_COMMIT, account, subs, teamKey, picks });
      return recall<RunLite>(key) ?? remember(key, request<RunLite>({ op: "trace", teamKey, picks, opts: { account, subs, blocked } }, opts.signal));
    },

    async curves(teamKey, picks, profiles, opts = {}) {
      const { blocked } = await teamData(opts.signal);
      const account = opts.account ?? null;
      const subs = opts.subs ?? DEFAULT_SUBS;
      const keyOf = (spec: FloorProfileSpec | null): string =>
        `curve|${memoKey({ op: "trace", commit: WUWA_CALC_COMMIT, account, subs, teamKey, picks })}|${spec ? profileSignature(spec) : "-"}`;
      const found = new Map<number, Promise<FightCurve>>();
      const missing: number[] = [];
      profiles.forEach((spec, i) => {
        const hit = recall<FightCurve>(keyOf(spec));
        if (hit) found.set(i, hit);
        else missing.push(i);
      });
      const known = profiles.length - missing.length;
      if (missing.length) {
        const batch = request<FightCurve[]>({ op: "curves", teamKey, picks, profiles: missing.map((i) => profiles[i]!), opts: { account, subs, blocked } }, opts.signal, (done) =>
          opts.onProgress?.(known + done, profiles.length),
        );
        missing.forEach((i, j) => found.set(i, remember(keyOf(profiles[i]!), batch.then((r) => r[j]!))));
      } else opts.onProgress?.(profiles.length, profiles.length);
      return Promise.all(profiles.map((_, i) => found.get(i)!));
    },

    clear: () => memo.clear(),
    dispose() {
      for (const p of pending.values()) p.reject(new Error("The rankings engine client was disposed"));
      pending.clear();
      worker?.terminate();
      worker = null;
      teamList = null;
      memo.clear();
    },
  };
  return client;
}

let shared: RileyClient | null = null;
/** The app's one client (one solver worker for every page that reads the seam). */
export function rileyClient(): RileyClient {
  shared ??= createRileyClient();
  return shared;
}
