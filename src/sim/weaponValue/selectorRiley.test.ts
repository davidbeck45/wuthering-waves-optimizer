// @vitest-environment node
// Wuthering Tools+: /weapons' browser adapter over the solver-worker client (selectorRiley.ts): a solve is reused across
// calls for the same account, a failed batch is never kept, and the page-session cache stays bounded. A fake client —
// no worker, no engine.
import { describe, expect, it } from "vitest";
import type { RileyClient } from "../engine/rileyClient";
import type { MineSolve, RileyAccount } from "../engine/rileyRun";
import { MAX_SOLVES, browserSelectorRiley } from "./selectorRiley";

const account = (key: string): RileyAccount => ({ key, entries: {}, builds: [], buildsKey: "b" });
const solveOf = (teamKey: string): MineSolve => ({ teamKey, names: [], appKeys: [], status: "ok", fieldable: true, best: null });

function fakeClient(commit: string): { client: RileyClient; asked: string[][]; failNext: { on: boolean } } {
  const asked: string[][] = [];
  const failNext = { on: false };
  const client = {
    commit,
    teams: async () => [],
    blocked: async () => [],
    async solveMine(keys: string[]) {
      asked.push([...keys]);
      if (failNext.on) {
        failNext.on = false;
        throw new Error("worker died");
      }
      return keys.map(solveOf);
    },
  } as unknown as RileyClient;
  return { client, asked, failNext };
}

describe("selector wuwa_calc adapter", () => {
  it("solves each team once per account, in the order asked, and never keeps a failed batch", async () => {
    const { client, asked, failNext } = fakeClient("c-reuse");
    const riley = await browserSelectorRiley(account("a1"), undefined, client);
    expect((await riley.solve(["t1", "t2"], account("a1"))).map((s) => s.teamKey)).toEqual(["t1", "t2"]);
    expect((await riley.solve(["t2", "t3", "t1"], account("a1"))).map((s) => s.teamKey)).toEqual(["t2", "t3", "t1"]);
    expect(asked).toEqual([["t1", "t2"], ["t3"]]);
    await riley.solve(["t1"], account("a2")); // another account: its own solve
    expect(asked[asked.length - 1]).toEqual(["t1"]);
    failNext.on = true;
    await expect(riley.solve(["t9"], account("a1"))).rejects.toThrow("worker died");
    await riley.solve(["t9"], account("a1"));
    expect(asked.slice(-2)).toEqual([["t9"], ["t9"]]);
  });

  it("keeps at most MAX_SOLVES, dropping the least recently used, and answers a call that needs the oldest entry from the cache", async () => {
    const { client, asked } = fakeClient("c-cap");
    const riley = await browserSelectorRiley(account("a"), undefined, client);
    const keys = Array.from({ length: MAX_SOLVES }, (_, i) => `k${i}`);
    await riley.solve(keys, account("a"));
    await riley.solve(["k0"], account("a")); // touched: now the most recent
    expect(asked).toHaveLength(1);
    // one new key over the cap: the oldest untouched entry (k1) goes, k0 stays
    await riley.solve(["fresh"], account("a"));
    await riley.solve(["k0"], account("a"));
    expect(asked).toEqual([keys, ["fresh"]]);
    await riley.solve(["k1"], account("a"));
    expect(asked[asked.length - 1]).toEqual(["k1"]);
    // the oldest entry (now k3: k2 went for k1) asked beside a new key — it is answered from the cache, not lost
    const out = await riley.solve(["k3", "fresh2"], account("a"));
    expect(out.map((s) => s.teamKey)).toEqual(["k3", "fresh2"]);
    expect(asked[asked.length - 1]).toEqual(["fresh2"]);
  });
});
