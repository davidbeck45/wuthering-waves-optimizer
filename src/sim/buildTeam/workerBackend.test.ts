// Wuthering Tools+ "Build it for me" — the browser backend's scorer (a processor worker reused for the swap pass) on
// fake workers: results come back matched to the loadouts asked for, and a crash or a cancel mid-batch rejects
// instead of leaving the run waiting forever.
import { describe, expect, it } from "vitest";
import type { MemberJob } from "./headlessOptimizer";
import { workerBackend } from "./workerBackend";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Mode = "ok" | "crash" | "silent";

/** A processor worker stand-in: ready on init; on process, every loadout scored as the sum of its echo numbers and
 *  returned the way the real one returns it (slot 0, then the rest sorted). */
function fakeProcessor(mode: Mode) {
  const w: any = {
    onmessage: null,
    onerror: null,
    terminated: false,
    postMessage(msg: any) {
      setTimeout(() => {
        if (w.terminated) return;
        if (msg.type === "init") w.onmessage?.({ data: { type: "ready" } });
        else if (msg.type === "process") {
          if (mode === "crash") return w.onerror?.({ message: "boom" });
          if (mode === "silent") return;
          const results = msg.data.batch.map((l: any[]) => ({
            loadout: [l[0], ...l.slice(1).sort((a: any, b: any) => (a.echoId < b.echoId ? -1 : 1))],
            targetValue: l.reduce((n: number, e: any) => n + Number(String(e.echoId).slice(1)), 0),
            context: { finalStats: { energyRegen: 1.25 } },
          }));
          w.onmessage?.({ data: { type: "result", results, processed: results.length } });
        }
      }, 0);
    },
    terminate() {
      w.terminated = true;
    },
  };
  return w;
}

const job = { id: "j1", characterId: "X", context: {}, echoSetPassiveBuffs: {}, mainEchoStats: {}, target: "Rotation:r", damageType: "Average", rotationData: {} } as unknown as MemberJob;
const echo = (n: number) => ({ echoId: `e${n}`, echo: `S${n}`, echoSet: "Set", type: n < 3 ? 4 : 1, stat: "ATK" });

describe("workerBackend score()", () => {
  it("matches every result to the loadout asked for, whatever order the worker returns its echoes in", async () => {
    const backend = workerBackend({ workerCount: 2, createProcessor: () => fakeProcessor("ok"), createGenerator: () => fakeProcessor("ok") });
    const a = [echo(1), echo(9), echo(3), echo(5), echo(4)];
    const b = [echo(2), echo(8), echo(7), echo(6), echo(3)];
    const [ra, rb] = await backend.score(job, [a, b]);
    expect(ra!.targetValue).toBe(22);
    expect(rb!.targetValue).toBe(26);
    expect(ra!.energyRegen).toBe(1.25);
    // the caller's own echo objects come back
    expect(ra!.loadout[0]).toBe(a[0]);
    backend.dispose?.();
  });

  it("rejects when the worker crashes mid-batch, and a later batch gets a fresh worker", async () => {
    let made = 0;
    const backend = workerBackend({ workerCount: 2, createProcessor: () => fakeProcessor(made++ === 0 ? "crash" : "ok") });
    await expect(backend.score(job, [[echo(1), echo(3), echo(4), echo(5), echo(6)]])).rejects.toThrow(/worker failed/);
    const [r] = await backend.score(job, [[echo(1), echo(3), echo(4), echo(5), echo(6)]]);
    expect(r!.targetValue).toBe(19);
    backend.dispose?.();
  });

  it("rejects with an AbortError when the run is cancelled mid-batch", async () => {
    const backend = workerBackend({ workerCount: 2, createProcessor: () => fakeProcessor("silent") });
    const ctrl = new AbortController();
    const pending = backend.score(job, [[echo(1), echo(3), echo(4), echo(5), echo(6)]], { signal: ctrl.signal });
    setTimeout(() => ctrl.abort(), 5);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    backend.dispose?.();
  });
});
