// Wuthering Tools+ — the Riley run seam's worker protocol (Wave 0). `createRileyHandler(engine, post)` answers the
// seam's messages over whatever engine modules it is handed: src/sim/rankings/solver.worker.ts wires it to its
// `@skittle/*` imports (the existing worker entry — no second one), tests wire it to the fork's sources under
// Node. Requests queue and run one unit at a time (one team of a solve, one traced run), yielding between units
// so a cancel can land; everything posted is plain data (structured-clone and JSON safe).
import { listTeams, solveOne, tracedRun, type MineSolve, type RileyEngine, type RileyPick, type RileyTeamInfo, type RunLite, type RunOptions } from "./rileyRun";

export const RILEY_MESSAGE = "wtplus:riley";
export const RILEY_CANCEL = "wtplus:riley:cancel";
export const RILEY_PROGRESS = "wtplus:riley:progress";

export type RileyRequest =
  | { type: typeof RILEY_MESSAGE; id: number; op: "teams" }
  | { type: typeof RILEY_MESSAGE; id: number; op: "solveMine"; teamKeys: string[]; opts: RunOptions }
  | { type: typeof RILEY_MESSAGE; id: number; op: "trace"; teamKey: string; picks: RileyPick[] | null; opts: RunOptions };
export interface RileyCancel { type: typeof RILEY_CANCEL; id: number }

export interface RileyTeamsResult { commit: string; teams: RileyTeamInfo[] }
export type RileyResult = RileyTeamsResult | MineSolve[] | RunLite;

export type RileyResponse =
  | { type: typeof RILEY_MESSAGE; id: number; ok: true; result: RileyResult; ms: number }
  | { type: typeof RILEY_MESSAGE; id: number; ok: false; error: string; reason?: string; notInApp?: string[]; cancelled?: boolean }
  | { type: typeof RILEY_PROGRESS; id: number; done: number; total: number };

/** Whether a worker message is the seam's (the worker hands everything else on to Riley's own `onmessage`). */
export const isRileyMessage = (data: unknown): data is RileyRequest | RileyCancel =>
  !!data && typeof data === "object" && ((data as { type?: unknown }).type === RILEY_MESSAGE || (data as { type?: unknown }).type === RILEY_CANCEL);

interface Job {
  req: RileyRequest;
  next: number;
  solves: MineSolve[];
  ms: number;
}

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** The seam's message handler: returns true for a message it took. `post` sends a response back. */
export function createRileyHandler(E: RileyEngine, post: (message: RileyResponse) => void): (data: unknown) => boolean {
  const queue: Job[] = [];
  let scheduled = false;
  const schedule = (): void => {
    if (scheduled || !queue.length) return;
    scheduled = true;
    setTimeout(step, 0);
  };
  const finish = (job: Job, result: RileyResult): void => {
    queue.shift();
    post({ type: RILEY_MESSAGE, id: job.req.id, ok: true, result, ms: Math.round(job.ms) });
  };
  const fail = (job: Job, e: unknown): void => {
    queue.shift();
    const err = e as { message?: string; reason?: string; notInApp?: string[] };
    post({ type: RILEY_MESSAGE, id: job.req.id, ok: false, error: err?.message ?? String(e), ...(err?.reason ? { reason: err.reason } : {}), ...(err?.notInApp ? { notInApp: err.notInApp } : {}) });
  };
  // one unit per macrotask: a solve's next team, or a whole traced run
  function step(): void {
    scheduled = false;
    const job = queue[0];
    if (!job) return;
    const t0 = now();
    try {
      const req = job.req;
      if (req.op === "teams") {
        job.ms += now() - t0;
        finish(job, { commit: E.commit, teams: listTeams(E) });
      } else if (req.op === "trace") {
        const run = tracedRun(E, req.teamKey, req.picks, req.opts);
        job.ms += now() - t0;
        finish(job, run);
      } else {
        if (job.next < req.teamKeys.length) {
          job.solves.push(solveOne(E, req.teamKeys[job.next++]!, req.opts));
          job.ms += now() - t0;
          post({ type: RILEY_PROGRESS, id: req.id, done: job.next, total: req.teamKeys.length });
        }
        if (job.next >= req.teamKeys.length) finish(job, job.solves);
      }
    } catch (e) {
      fail(job, e);
    }
    schedule();
  }
  return (data: unknown): boolean => {
    if (!isRileyMessage(data)) return false;
    if (data.type === RILEY_CANCEL) {
      const at = queue.findIndex((j) => j.req.id === data.id);
      if (at >= 0) {
        queue.splice(at, 1);
        post({ type: RILEY_MESSAGE, id: data.id, ok: false, error: "cancelled", cancelled: true });
      }
      return true;
    }
    queue.push({ req: data, next: 0, solves: [], ms: 0 });
    schedule();
    return true;
  };
}
