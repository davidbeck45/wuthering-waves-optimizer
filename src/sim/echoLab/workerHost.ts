// Wuthering Tools+ Echo Lab — the message host behind echoLab.worker.ts (and the client's main-thread fallback):
// runs jobs one at a time, posts progress, honours cancel, and caches by account fingerprint — a session (the
// prepared characters, their best rotations and per-point prices) per account, a result per (account, job).
// Plain data in, plain data out (structured-clone safe). No DOM.
import type { TeamEnemyConfig } from "../../calculator/buildCharacterContext";
import { createLabSession, isCancelled, type LabAccount, type LabProgress, type LabSession } from "./core";
import { accountFingerprint, stableKey } from "./fingerprint";
import { runJob, type EchoLabJob } from "./pass";

export interface EchoLabRunMessage {
  type: "run";
  id: number;
  job: EchoLabJob;
  account: LabAccount;
  /** freshly scanned echoes to judge before they are saved (appended to the inventory for scoring) */
  extraEchoes?: any[];
  enemy?: TeamEnemyConfig;
}

export interface EchoLabCancelMessage {
  type: "cancel";
  id: number;
}

export type EchoLabRequest = EchoLabRunMessage | EchoLabCancelMessage;

export type EchoLabResponse =
  | { type: "progress"; id: number; progress: LabProgress }
  | { type: "result"; id: number; result: unknown; cached: boolean; fingerprint: string; ms: number }
  | { type: "error"; id: number; message: string; cancelled: boolean };

export interface EchoLabHostOptions {
  /** yield to the event loop this often while working, in ms (default 25 — lets a cancel message in) */
  yieldMs?: number;
  /** results kept (default 24) and sessions kept (default 2) */
  resultCache?: number;
  sessionCache?: number;
}

export interface EchoLabHost {
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  onMessage: (message: EchoLabRequest) => Promise<void>;
  /** jobs finished, results served from cache — for tests and diagnostics */
  stats: { runs: number; cacheHits: number };
}

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

// eslint-disable-next-line no-unused-vars -- the parameters of a function type
export function createEchoLabHost(post: (message: EchoLabResponse) => void, options: EchoLabHostOptions = {}): EchoLabHost {
  const sessions = new Map<string, LabSession>();
  const results = new Map<string, unknown>();
  const cancelled = new Set<number>();
  const queue: EchoLabRunMessage[] = [];
  const stats = { runs: 0, cacheHits: 0 };
  let running = false;
  let current: number | null = null;

  const remember = <T>(map: Map<string, T>, key: string, value: T, limit: number): void => {
    map.delete(key);
    map.set(key, value);
    while (map.size > limit) map.delete(map.keys().next().value as string);
  };

  async function runOne(message: EchoLabRunMessage): Promise<void> {
    const { id, job, account, extraEchoes, enemy } = message;
    const started = now();
    const fingerprint = accountFingerprint({ ...account, echoes: [...(account.echoes ?? []), ...(extraEchoes ?? [])] });
    const sessionKey = `${fingerprint}|${stableKey(enemy ?? null)}`;
    const resultKey = `${sessionKey}|${stableKey(job)}`;
    if (results.has(resultKey)) {
      stats.cacheHits += 1;
      const result = results.get(resultKey);
      remember(results, resultKey, result, options.resultCache ?? 24);
      post({ type: "result", id, result, cached: true, fingerprint, ms: now() - started });
      return;
    }
    let session = sessions.get(sessionKey);
    if (!session) {
      session = createLabSession(account, { enemy, extraEchoes, fingerprint });
      remember(sessions, sessionKey, session, options.sessionCache ?? 2);
    }
    try {
      const result = await runJob(session, job, {
        shouldCancel: () => cancelled.has(id),
        onProgress: (progress) => post({ type: "progress", id, progress }),
        yieldMs: options.yieldMs ?? 25,
      });
      stats.runs += 1;
      remember(results, resultKey, result, options.resultCache ?? 24);
      post({ type: "result", id, result, cached: false, fingerprint, ms: now() - started });
    } catch (err) {
      post({ type: "error", id, message: err instanceof Error ? err.message : String(err), cancelled: isCancelled(err) });
    } finally {
      cancelled.delete(id);
    }
  }

  async function drain(): Promise<void> {
    if (running) return;
    running = true;
    try {
      while (queue.length) {
        const next = queue.shift() as EchoLabRunMessage;
        current = next.id;
        await runOne(next);
        current = null;
      }
    } finally {
      running = false;
      current = null;
    }
  }

  return {
    stats,
    async onMessage(message) {
      if (!message || typeof message !== "object") return;
      if (message.type === "cancel") {
        const queued = queue.findIndex((m) => m.id === message.id);
        if (queued >= 0) {
          queue.splice(queued, 1);
          post({ type: "error", id: message.id, message: "Echo Lab job cancelled", cancelled: true });
        } else if (message.id === current) {
          cancelled.add(message.id);
        }
        return;
      }
      if (message.type === "run") {
        queue.push(message);
        await drain();
      }
    },
  };
}
