// Wuthering Tools+ AI — a ToolRunner that executes registry tools in a Web Worker (tools/tools.worker.ts), for
// the drawer: pass `createToolWorkerRunner().runTool` as `runTool` to askInConversation / runAgentTurn. The
// account is posted with every call (a structured clone; the tools never see the live Pinia proxies). A crashed
// worker rejects its pending calls (the loop answers them with is_error) and is respawned on the next call.
import type { ToolRunner } from "./agentLoop";
import type { ToolRunResult } from "./tools/index";
import type { ToolWorkerRequest } from "./tools/tools.worker";

export interface ToolWorkerRunner {
  runTool: ToolRunner;
  /** stop the worker (pending calls reject); the next call starts a new one */
  dispose(): void;
}

// eslint-disable-next-line no-unused-vars -- the parameters of a function type
type Pending = { resolve: (r: ToolRunResult) => void; reject: (e: Error) => void };

export function createToolWorkerRunner(spawn: () => Worker = () => new Worker(new URL("./tools/tools.worker.ts", import.meta.url), { type: "module" })): ToolWorkerRunner {
  let worker: Worker | null = null;
  let seq = 0;
  const pending = new Map<number, Pending>();

  const failAll = (error: Error): void => {
    for (const p of pending.values()) p.reject(error);
    pending.clear();
  };
  const ensure = (): Worker => {
    if (worker) return worker;
    const w = spawn();
    w.onmessage = (e: MessageEvent<{ id: number; result: ToolRunResult }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      p.resolve(e.data.result);
    };
    w.onerror = (e: ErrorEvent) => {
      e.preventDefault?.();
      w.terminate();
      if (worker === w) worker = null;
      failAll(new Error(`The tool worker stopped: ${e.message || "unknown error"}`));
    };
    worker = w;
    return w;
  };

  return {
    runTool: (name, input, ctx) =>
      new Promise<ToolRunResult>((resolve, reject) => {
        const id = ++seq;
        pending.set(id, { resolve, reject });
        const request: ToolWorkerRequest = { id, name, input, exp: ctx.exp, autoBuffs: ctx.autoBuffs, now: ctx.now.toISOString() };
        try {
          ensure().postMessage(request);
        } catch (error) {
          pending.delete(id);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }),
    dispose() {
      worker?.terminate();
      worker = null;
      failAll(new Error("The tool worker was stopped"));
    },
  };
}
