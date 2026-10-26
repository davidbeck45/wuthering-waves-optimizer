// Wuthering Tools+ Echo Lab client: the UI's door to the Echo Lab worker. `run(job, account)` posts the job,
// streams progress, resolves with the typed result, and cancels on an AbortSignal. The worker caches by account
// fingerprint, so asking again for an unchanged account answers at once. Where a Worker can't be created (old
// browser, tests) the same host runs on this thread, yielding between scorings. No Vue: pages pass plain data
// (`labAccountOf` strips the stores' reactive proxies, which a worker message can't carry).
import type { TeamEnemyConfig } from "../../calculator/buildCharacterContext";
import { CANCELLED, type LabAccount, type LabProgress } from "./core";
import type { EchoLabJob, EchoLabResult } from "./pass";
import { createEchoLabHost, type EchoLabRequest, type EchoLabResponse } from "./workerHost";

export interface EchoLabRunOptions {
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  onProgress?: (progress: LabProgress) => void;
  signal?: AbortSignal;
  /** freshly scanned echoes to judge before they are saved */
  extraEchoes?: any[];
  enemy?: TeamEnemyConfig;
  /** told whether the answer came from the cache, the account fingerprint and the time it took */
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  onInfo?: (info: EchoLabRunInfo) => void;
}

export interface EchoLabRunInfo {
  cached: boolean;
  fingerprint: string;
  ms: number;
}

export interface EchoLabClient {
  // eslint-disable-next-line no-unused-vars -- the parameters of a method signature
  run<J extends EchoLabJob>(job: J, account: LabAccount, options?: EchoLabRunOptions): Promise<EchoLabResult<J>>;
  /** where jobs run: a worker, or this thread (no Worker available) */
  readonly mode: "worker" | "inline";
  dispose(): void;
}

/** Plain, structured-clone-safe account data from the stores (or anything JSON-shaped). */
export function labAccountOf(source: { characters: unknown; echoes: unknown; equipped?: unknown; teams?: unknown }): LabAccount {
  return JSON.parse(JSON.stringify({ characters: source.characters ?? {}, echoes: source.echoes ?? [], equipped: source.equipped ?? {}, teams: source.teams ?? [] }));
}

interface Pending {
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  resolve: (value: any) => void;
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  reject: (reason: unknown) => void;
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  onProgress?: (progress: LabProgress) => void;
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  onInfo?: (info: EchoLabRunInfo) => void;
  cleanup: () => void;
}

const defaultWorker = (): Worker | null => {
  if (typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("./echoLab.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
};

export function createEchoLabClient(options: { worker?: () => Worker | null; onFatal?: () => void } = {}): EchoLabClient {
  const pending = new Map<number, Pending>();
  let nextId = 1;

  const receive = (message: EchoLabResponse): void => {
    const p = pending.get(message.id);
    if (!p) return;
    if (message.type === "progress") {
      p.onProgress?.(message.progress);
      return;
    }
    pending.delete(message.id);
    p.cleanup();
    if (message.type === "result") {
      p.onInfo?.({ cached: message.cached, fingerprint: message.fingerprint, ms: message.ms });
      p.resolve(message.result);
    } else {
      const err = new Error(message.message);
      if (message.cancelled) err.name = CANCELLED;
      p.reject(err);
    }
  };

  const worker = (options.worker ?? defaultWorker)();
  let send: (request: EchoLabRequest) => void; // eslint-disable-line no-unused-vars -- the parameters of a function type
  if (worker) {
    worker.onmessage = (event: MessageEvent<EchoLabResponse>) => receive(event.data);
    worker.onerror = (event) => {
      for (const [id, p] of pending) {
        pending.delete(id);
        p.cleanup();
        p.reject(new Error(`Echo Lab worker failed: ${event.message ?? "unknown error"}`));
      }
      // a worker that failed to load or crashed stays dead: let the next run start a fresh one ("Try again")
      worker.terminate();
      options.onFatal?.();
    };
    send = (request) => worker.postMessage(request);
  } else {
    const host = createEchoLabHost(receive);
    send = (request) => void host.onMessage(request);
  }

  return {
    mode: worker ? "worker" : "inline",
    run(job, account, runOptions = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const { signal } = runOptions;
        if (signal?.aborted) {
          const err = new Error("Echo Lab job cancelled");
          err.name = CANCELLED;
          reject(err);
          return;
        }
        const onAbort = (): void => send({ type: "cancel", id });
        signal?.addEventListener("abort", onAbort, { once: true });
        pending.set(id, { resolve, reject, onProgress: runOptions.onProgress, onInfo: runOptions.onInfo, cleanup: () => signal?.removeEventListener("abort", onAbort) });
        send({ type: "run", id, job, account, extraEchoes: runOptions.extraEchoes, enemy: runOptions.enemy });
      });
    },
    dispose() {
      worker?.terminate();
      for (const [id, p] of pending) {
        pending.delete(id);
        p.cleanup();
        const err = new Error("Echo Lab client disposed");
        err.name = CANCELLED;
        p.reject(err);
      }
    },
  };
}

let shared: EchoLabClient | null = null;

/** One client (one worker) for the whole app, created on first use, and again after its worker failed. */
export function getEchoLabClient(): EchoLabClient {
  if (!shared) {
    const client = createEchoLabClient({
      onFatal: () => {
        if (shared === client) shared = null;
      },
    });
    shared = client;
  }
  return shared;
}
