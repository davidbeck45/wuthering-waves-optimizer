// Wuthering Tools+ — test helper: `new Worker` faked, the workers real. The generator and processor modules run in this
// thread, one module instance each, every message structured-cloned and delivered on a later task, as a browser does.
import { vi } from "vitest";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface FakeWorker {
  kind: "generator" | "processor";
  posted: any[];
  onmessage: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  terminated: boolean;
}

/**
 * Stubs `self` and `Worker` and loads the worker modules (`processors` instances, each with its own heap). Returns the
 * list of workers made, oldest first: empty it between runs. `vi.unstubAllGlobals()` undoes it.
 */
export async function installFakeWorkers(processors: number): Promise<FakeWorker[]> {
  const later = (fn: () => void): void => void setTimeout(fn, 0);
  /** Which module instance is running right now: a processor's replies are synchronous, a generator's are not. */
  let running: Worker_ | null = null;
  let generatorHandler: (e: any) => void;
  const processorHandlers: Array<(e: any) => void> = [];
  const made: Worker_[] = [];

  class Worker_ implements FakeWorker {
    kind: FakeWorker["kind"];
    handler: (e: any) => void;
    posted: any[] = [];
    onmessage: ((e: any) => void) | null = null;
    onerror: ((e: any) => void) | null = null;
    terminated = false;

    constructor(url: URL) {
      this.kind = String(url).includes("generator") ? "generator" : "processor";
      const count = made.filter((w) => w.kind === "processor").length;
      this.handler = this.kind === "generator" ? generatorHandler : processorHandlers[count % processorHandlers.length]!;
      made.push(this);
    }
    postMessage(message: any): void {
      this.posted.push(message);
      const data = structuredClone(message);
      later(() => {
        if (this.terminated) return;
        running = this;
        try {
          this.handler({ data });
        } finally {
          running = null;
        }
      });
    }
    /** A message from the worker: delivered later, and never after a terminate. */
    reply(message: any): void {
      const data = structuredClone(message);
      later(() => {
        if (!this.terminated) this.onmessage?.({ data });
      });
    }
    terminate(): void {
      this.terminated = true;
    }
  }

  const selfStub: any = {
    postMessage(message: any) {
      (running ?? made.filter((w) => w.kind === "generator" && !w.terminated).at(-1))?.reply(message);
    },
  };
  vi.stubGlobal("self", selfStub);
  vi.stubGlobal("Worker", Worker_);
  await import("../../workers/generator.worker");
  generatorHandler = selfStub.onmessage;
  for (let i = 0; i < processors; i++) {
    vi.resetModules();
    await import("../../workers/processor.worker");
    processorHandlers.push(selfStub.onmessage);
  }
  return made;
}
