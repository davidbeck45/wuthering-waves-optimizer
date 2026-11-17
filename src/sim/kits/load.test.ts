// Wuthering Tools+: the briefs' loader under failure — a dropped connection can be retried in place, an answer that
// is not the briefs (a tab older than the site) is told apart from it, and a good fetch is made once.
import { beforeEach, describe, expect, it } from "vitest";
import kitsFile from "./data/kits.json";
import { BriefsError, KIT_INDEX_ENTRIES, fetchBriefs, forgetKits, loadKits } from "./load";

const ok = (body: unknown) => ({ ok: true, json: async () => body });

describe("loading the briefs", () => {
  beforeEach(() => forgetKits());

  it("fetches the table once and hands the same one to every caller", async () => {
    let calls = 0;
    const fetchImpl = async (url: string) => {
      calls += 1;
      expect(url).toBe("/briefs.json");
      return ok(kitsFile);
    };
    const [a, b] = await Promise.all([loadKits("/briefs.json", fetchImpl), loadKits("/briefs.json", fetchImpl)]);
    expect(a).toBe(b);
    expect(Object.keys(a.kits).length).toBe(KIT_INDEX_ENTRIES.length);
    await loadKits("/briefs.json", fetchImpl);
    expect(calls).toBe(1);
  });

  it("a dropped connection is a failure that the next call can undo", async () => {
    let online = false;
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      if (!online) throw new TypeError("Failed to fetch");
      return ok(kitsFile);
    };
    await expect(loadKits("/briefs.json", fetchImpl)).rejects.toMatchObject({ name: "BriefsError", kind: "network" });
    await expect(loadKits("/briefs.json", fetchImpl)).rejects.toBeInstanceOf(BriefsError); // not kept: it asked again
    expect(calls).toBe(2);
    online = true;
    expect(Object.keys((await loadKits("/briefs.json", fetchImpl)).kits).length).toBeGreaterThan(40);
    expect(calls).toBe(3);
  });

  it("an answer that is not the briefs reads as a tab older than the site, never as the table", async () => {
    // the site's own page served for a file that is gone, a 404, and JSON of another shape
    const html = { ok: true, json: async () => { throw new SyntaxError("Unexpected token <"); } };
    await expect(fetchBriefs("/x", async () => html)).rejects.toMatchObject({ kind: "stale" });
    await expect(fetchBriefs("/x", async () => ({ ok: false, json: async () => ({}) }))).rejects.toMatchObject({ kind: "stale" });
    await expect(fetchBriefs("/x", async () => ok({ hello: 1 }))).rejects.toMatchObject({ kind: "stale" });
    await expect(fetchBriefs("/x", async () => ok(null))).rejects.toMatchObject({ kind: "stale" });
  });
});
