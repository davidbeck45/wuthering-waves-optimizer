// Wuthering Tools+ AI: the worker-backed ToolRunner, with an in-thread stand-in for the Worker (jsdom has none).
import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/aiAccount.json";
import { parseExport } from "../cli/exportShape";
import { runTool } from "./tools/index";
import { createToolWorkerRunner } from "./toolWorker";
import type { ToolWorkerRequest } from "./tools/tools.worker";

const exp = parseExport(fixture, "aiAccount.json");
const ctx = { exp, now: new Date("2026-10-12T12:00:00Z") };

function fakeWorker(behaviour: "ok" | "crash" = "ok") {
  const posted: ToolWorkerRequest[] = [];
  let terminated = false;
  const w = {
    // eslint-disable-next-line no-unused-vars -- the parameters of a function type
    onmessage: null as ((e: MessageEvent) => void) | null,
    // eslint-disable-next-line no-unused-vars -- the parameters of a function type
    onerror: null as ((e: ErrorEvent) => void) | null,
    postMessage(message: ToolWorkerRequest) {
      posted.push(structuredClone(message)); // what a real worker receives: a clone
      const req = posted[posted.length - 1];
      setTimeout(async () => {
        if (behaviour === "crash") return w.onerror?.({ message: "out of memory", preventDefault() {} } as ErrorEvent);
        const result = await runTool(req.name, req.input, { exp: req.exp, autoBuffs: req.autoBuffs, now: new Date(req.now) });
        w.onmessage?.({ data: { id: req.id, result } } as MessageEvent);
      }, 0);
    },
    terminate() {
      terminated = true;
    },
  };
  return { worker: w as unknown as Worker, posted, isTerminated: () => terminated };
}

describe("tool worker runner", () => {
  it("runs tools through the worker with a plain copy of the account", async () => {
    const fake = fakeWorker();
    let spawned = 0;
    const runner = createToolWorkerRunner(() => {
      spawned += 1;
      return fake.worker;
    });
    const [a, b] = await Promise.all([runner.runTool("get_account_summary", {}, ctx), runner.runTool("calc_team", { team: "1" }, { ...ctx, autoBuffs: false })]);
    expect(a.ok && b.ok).toBe(true);
    expect(JSON.parse(a.content).totals.setUp).toBe(3);
    expect(spawned).toBe(1);
    expect(fake.posted.map((p) => p.name)).toEqual(["get_account_summary", "calc_team"]);
    expect(fake.posted[1]).toMatchObject({ autoBuffs: false, now: "2026-10-12T12:00:00.000Z" });
    runner.dispose();
    expect(fake.isTerminated()).toBe(true);
  });

  it("a crashed worker rejects its pending calls and is replaced on the next call", async () => {
    const workers = [fakeWorker("crash"), fakeWorker("ok")];
    let i = 0;
    const runner = createToolWorkerRunner(() => workers[i++].worker);
    await expect(runner.runTool("get_account_summary", {}, ctx)).rejects.toThrow(/tool worker stopped: out of memory/);
    expect(workers[0].isTerminated()).toBe(true);
    const ok = await runner.runTool("get_account_summary", {}, ctx);
    expect(ok.ok).toBe(true);
    expect(i).toBe(2);
  });
});
