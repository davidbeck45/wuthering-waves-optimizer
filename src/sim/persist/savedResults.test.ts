// Wuthering Tools+ — saved results (IndexedDB-backed page caches), exercised on the Map store with the same contract:
// round trip, build and schema invalidation, corrupt records dropped, the LRU under the size cap, quota handling,
// the silent fallbacks (no store, a throwing store, a stuck store), Clear and the usage count.
import { describe, expect, it } from "vitest";
import { version } from "../../../package.json";
import { WUWA_CALC_COMMIT } from "../engine/engineCommit";
import { memoryResultStore, type ResultStore, type SavedMeta } from "./resultStore";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { INVEST_CACHE_KEY } from "../account/investCache";
import { RANKING_CACHE_KEY } from "../myRankings/rankingCache";
import { SELECTOR_CACHE_KEY, WEAPON_VALUE_CACHE_KEY } from "../weaponValue/valueCache";
import { TAB_COPY_KEYS, appBuildId, createSavedResults, onSavedResultsCleared, savedAgo, savedResults, savedSlot } from "./savedResults";

const isRows = (v: unknown): boolean => Array.isArray((v as { rows?: unknown })?.rows);
const flush = () => new Promise((r) => setTimeout(r, 0));

function clock(start = 1_000) {
  let t = start;
  return { now: () => t, tick: (ms = 1) => (t += ms) };
}

describe("saved results: round trip and keys", () => {
  it("reads back exactly what was written, with when it was saved", async () => {
    const store = memoryResultStore();
    const c = clock(5_000);
    const saved = createSavedResults({ store, build: "b1", now: c.now });
    expect(await saved.write("ranking", 2, "fp-a", { rows: [1, 2, 3], computedAt: "x" })).toBe(true);
    const hit = await saved.read<{ rows: number[] }>("ranking", 2, "fp-a", isRows);
    expect(hit).toEqual({ value: { rows: [1, 2, 3], computedAt: "x" }, savedAt: 5_000 });
    expect([...store.records.keys()]).toEqual(["ranking|fp-a"]);
  });

  it("misses on another fingerprint or another cache name, and keeps one record per (cache, fingerprint)", async () => {
    const store = memoryResultStore();
    const saved = createSavedResults({ store, build: "b1" });
    await saved.write("ranking", 1, "fp-a", { rows: ["a"] });
    await saved.write("ranking", 1, "fp-b", { rows: ["b"] });
    await saved.write("ranking", 1, "fp-a", { rows: ["a2"] });
    expect(await saved.read("ranking", 1, "fp-c", isRows)).toBeNull();
    expect(await saved.read("investPlan", 1, "fp-a", isRows)).toBeNull();
    expect((await saved.read("ranking", 1, "fp-a", isRows))?.value).toEqual({ rows: ["a2"] });
    expect(store.records.size).toBe(2);
  });

  it("savedSlot binds the cache name, schema and validator", async () => {
    const store = memoryResultStore();
    const results = createSavedResults({ store, build: "b1" });
    const slot = savedSlot<{ rows: string[] }>("weaponValue", 3, isRows, results);
    expect(await slot.write("fp", { rows: ["x"] })).toBe(true);
    expect((await slot.read("fp"))?.value.rows).toEqual(["x"]);
    expect(store.records.get("weaponValue|fp")?.meta?.schema).toBe(3);
  });
});

describe("saved results: invalidation", () => {
  it("a result saved by another build is a miss, and is dropped", async () => {
    const store = memoryResultStore();
    await createSavedResults({ store, build: "0.0.1+e95d4e6+aaaa" }).write("ranking", 2, "fp", { rows: [1] });
    const next = createSavedResults({ store, build: "0.0.1+e95d4e6+bbbb" });
    expect(await next.read("ranking", 2, "fp", isRows)).toBeNull();
    await flush();
    expect(store.records.size).toBe(0);
  });

  it("a new wuwa_calc commit is another build", async () => {
    const store = memoryResultStore();
    await createSavedResults({ store, build: "0.0.1+e95d4e6+dev" }).write("ranking", 2, "fp", { rows: [1] });
    expect(await createSavedResults({ store, build: "0.0.1+f00ba47+dev" }).read("ranking", 2, "fp", isRows)).toBeNull();
  });

  it("a bumped schema version is a miss, and is dropped", async () => {
    const store = memoryResultStore();
    const saved = createSavedResults({ store, build: "b1" });
    await saved.write("ranking", 2, "fp", { rows: [1] });
    expect(await saved.read("ranking", 3, "fp", isRows)).toBeNull();
    await flush();
    expect(store.records.size).toBe(0);
  });

  it("other builds' records are swept on the next write", async () => {
    const store = memoryResultStore();
    await createSavedResults({ store, build: "old" }).write("ranking", 1, "fp-1", { rows: [1] });
    await createSavedResults({ store, build: "old" }).write("echoLab", 1, "fp-2", { rows: [2] });
    await createSavedResults({ store, build: "new" }).write("ranking", 1, "fp-3", { rows: [3] });
    expect([...store.records.keys()]).toEqual(["ranking|fp-3"]);
  });

  it("the app build id is the package version + the wuwa_calc commit + the deployed commit (dev without one)", () => {
    const id = appBuildId();
    expect(id.startsWith(`${version}+${WUWA_CALC_COMMIT}+`)).toBe(true);
    expect(id.split("+")).toHaveLength(3);
    // vitest has no VITE_VERCEL_GIT_COMMIT_SHA
    if (!import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA) expect(id.endsWith("+dev")).toBe(true);
  });
});

describe("saved results: corrupt records are dropped, never shown", () => {
  const meta = (key: string, over: Partial<SavedMeta> = {}): SavedMeta => ({
    key,
    cache: key.split("|")[0],
    schema: 1,
    build: "b1",
    savedAt: 1,
    usedAt: 1,
    bytes: 10,
    ...over,
  });

  it("unparseable JSON", async () => {
    const store = memoryResultStore();
    store.records.set("ranking|fp", { meta: meta("ranking|fp"), text: '{"rows": [1, 2' });
    const saved = createSavedResults({ store, build: "b1" });
    expect(await saved.read("ranking", 1, "fp", isRows)).toBeNull();
    await flush();
    expect(store.records.has("ranking|fp")).toBe(false);
  });

  it("data without meta, and meta without data (a torn write)", async () => {
    const store = memoryResultStore();
    store.records.set("ranking|a", { text: '{"rows":[]}' });
    store.records.set("ranking|b", { meta: meta("ranking|b") });
    const saved = createSavedResults({ store, build: "b1" });
    expect(await saved.read("ranking", 1, "a", isRows)).toBeNull();
    expect(await saved.read("ranking", 1, "b", isRows)).toBeNull();
    await flush();
    expect(store.records.size).toBe(0);
  });

  it("JSON its cache does not accept (wrong shape, null)", async () => {
    const store = memoryResultStore();
    store.records.set("ranking|a", { meta: meta("ranking|a"), text: '{"rows":"nope"}' });
    store.records.set("ranking|b", { meta: meta("ranking|b"), text: "null" });
    const saved = createSavedResults({ store, build: "b1" });
    expect(await saved.read("ranking", 1, "a", isRows)).toBeNull();
    expect(await saved.read("ranking", 1, "b", isRows)).toBeNull();
    await flush();
    expect(store.records.size).toBe(0);
  });

  it("a read's late touch never brings back a record that went meanwhile (an eviction, a Clear in another tab)", async () => {
    const inner = memoryResultStore();
    const store: ResultStore = {
      ...inner,
      async get(key) {
        const r = await inner.get(key);
        await inner.clear(); // lands between the read and its "used just now" touch
        return r;
      },
    };
    const saved = createSavedResults({ store, build: "b1" });
    await saved.write("ranking", 1, "fp", { rows: [1] });
    expect((await saved.read("ranking", 1, "fp", isRows))?.value).toEqual({ rows: [1] });
    await flush();
    expect(inner.records.size).toBe(0);
    expect((await saved.usage()).count).toBe(0);
  });

  it("a record filed under one cache's key but naming another", async () => {
    const store = memoryResultStore();
    store.records.set("ranking|fp", { meta: meta("ranking|fp", { cache: "echoLab" }), text: '{"rows":[]}' });
    expect(await createSavedResults({ store, build: "b1" }).read("ranking", 1, "fp", isRows)).toBeNull();
  });
});

describe("saved results: size cap and LRU", () => {
  const blob = (n: number) => ({ rows: ["x".repeat(n - 13)] }); // JSON length = n

  it("evicts the least recently used once the total passes the cap — a read counts as use", async () => {
    const store = memoryResultStore();
    const c = clock();
    const saved = createSavedResults({ store, build: "b1", capBytes: 300, now: c.now });
    await saved.write("ranking", 1, "a", blob(100)); // 100 bytes
    c.tick();
    await saved.write("ranking", 1, "b", blob(100));
    c.tick();
    await saved.write("ranking", 1, "c", blob(100));
    c.tick();
    expect(await saved.read("ranking", 1, "a", isRows)).not.toBeNull(); // a is now the most recent
    await flush();
    c.tick();
    await saved.write("ranking", 1, "d", blob(100)); // 400 > 300: the oldest use (b) goes
    expect([...store.records.keys()].sort()).toEqual(["ranking|a", "ranking|c", "ranking|d"]);
    expect((await saved.usage()).bytes).toBe(300);
  });

  it("evicts as many as it takes, never the one just written", async () => {
    const store = memoryResultStore();
    const c = clock();
    const saved = createSavedResults({ store, build: "b1", capBytes: 300, now: c.now });
    for (const k of ["a", "b", "c"]) {
      await saved.write("ranking", 1, k, blob(100));
      c.tick();
    }
    await saved.write("ranking", 1, "big", blob(250)); // 250 bytes: with any 100-byte one beside it the total passes 300, so all three older ones go
    expect([...store.records.keys()]).toEqual(["ranking|big"]);
  });

  it("refuses a result bigger than the whole cap (and keeps what was there)", async () => {
    const store = memoryResultStore();
    const saved = createSavedResults({ store, build: "b1", capBytes: 100 });
    await saved.write("ranking", 1, "a", blob(30));
    expect(await saved.write("ranking", 1, "huge", blob(500))).toBe(false);
    expect([...store.records.keys()]).toEqual(["ranking|a"]);
  });

  it("over the browser's quota it frees half the cap and tries once more", async () => {
    const inner = memoryResultStore();
    const quota = 250;
    const store: ResultStore = {
      ...inner,
      async put(meta, text) {
        const used = (await inner.allMeta()).filter((m) => m.key !== meta.key).reduce((n, m) => n + m.bytes, 0);
        if (used + text.length > quota) throw new DOMException("quota", "QuotaExceededError");
        await inner.put(meta, text);
      },
    };
    const c = clock();
    const saved = createSavedResults({ store, build: "b1", capBytes: 1000, now: c.now });
    expect(await saved.write("ranking", 1, "a", blob(100))).toBe(true);
    c.tick();
    expect(await saved.write("ranking", 1, "b", blob(100))).toBe(true);
    c.tick();
    expect(await saved.write("ranking", 1, "c", blob(100))).toBe(true); // 300 > 250: room made, then stored
    expect(inner.records.has("ranking|c")).toBe(true);
    expect(inner.records.has("ranking|a")).toBe(false);
  });

  it("counts usage per cache, this build only", async () => {
    const store = memoryResultStore();
    await createSavedResults({ store, build: "old" }).write("ranking", 1, "z", blob(20));
    const saved = createSavedResults({ store, build: "b1" });
    store.records.set("ranking|z2", { meta: { key: "ranking|z2", cache: "ranking", schema: 1, build: "old", savedAt: 0, usedAt: 0, bytes: 99 }, text: "{}" });
    await saved.write("ranking", 1, "a", blob(100));
    await saved.write("echoLab", 1, "b", blob(50));
    const u = await saved.usage();
    expect(u).toEqual({ count: 2, bytes: 150, caches: { ranking: { count: 1, bytes: 100 }, echoLab: { count: 1, bytes: 50 } } });
  });
});

describe("saved results: falls back silently", () => {
  it("no store (no IndexedDB): reads miss, writes report false, nothing throws", async () => {
    const saved = createSavedResults({ store: null, build: "b1" });
    expect(await saved.available()).toBe(false);
    expect(await saved.read("ranking", 1, "fp", isRows)).toBeNull();
    expect(await saved.write("ranking", 1, "fp", { rows: [] })).toBe(false);
    expect(await saved.usage()).toEqual({ count: 0, bytes: 0, caches: {} });
  });

  it("a store whose getter throws (the indexedDB getter in some private modes)", async () => {
    const saved = createSavedResults({
      store: () => {
        throw new DOMException("denied", "SecurityError");
      },
      build: "b1",
    });
    expect(await saved.read("ranking", 1, "fp", isRows)).toBeNull();
    expect(await saved.write("ranking", 1, "fp", { rows: [] })).toBe(false);
  });

  it("a store that throws on every call (IndexedDB refused to open)", async () => {
    const fail = () => Promise.reject(new DOMException("open failed", "InvalidStateError"));
    const store: ResultStore = { get: fail, allMeta: fail, put: fail, putMeta: fail, remove: fail, clear: fail };
    const saved = createSavedResults({ store, build: "b1" });
    expect(await saved.available()).toBe(false);
    expect(await saved.read("ranking", 1, "fp", isRows)).toBeNull();
    expect(await saved.write("ranking", 1, "fp", { rows: [] })).toBe(false);
    expect(await saved.clear()).toBe(false);
  });

  it("a store that never answers: the read gives up after the timeout and the page computes", async () => {
    const never = () => new Promise<never>(() => undefined);
    const store: ResultStore = { get: never, allMeta: never, put: never, putMeta: never, remove: never, clear: never };
    const saved = createSavedResults({ store, build: "b1", readTimeoutMs: 30 });
    const t0 = Date.now();
    expect(await saved.read("ranking", 1, "fp", isRows)).toBeNull();
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(await saved.available()).toBe(false);
  });

  it("a value JSON cannot hold (a cycle) is not written", async () => {
    const store = memoryResultStore();
    const value: Record<string, unknown> = { rows: [] };
    value.self = value;
    expect(await createSavedResults({ store, build: "b1" }).write("ranking", 1, "fp", value)).toBe(false);
    expect(store.records.size).toBe(0);
  });

  it("the app's own instance under Node keeps nothing", async () => {
    expect(await savedResults.available()).toBe(false);
    expect(await savedResults.read("ranking", 1, "fp", isRows)).toBeNull();
  });
});

describe("saved results: Clear", () => {
  it("names exactly the page caches' sessionStorage keys", () => {
    const echoLab = readFileSync(resolve(process.cwd(), "src/sim/echoLab/useEchoLab.ts"), "utf8").match(/ECHO_LAB_CACHE_KEY = "([^"]+)"/)?.[1];
    expect([...TAB_COPY_KEYS].sort()).toEqual([RANKING_CACHE_KEY, INVEST_CACHE_KEY, echoLab, WEAPON_VALUE_CACHE_KEY, SELECTOR_CACHE_KEY].sort());
  });

  it("removes this tab's copies even where no cache module is loaded, and leaves other keys alone", async () => {
    const tab = new Map<string, string>(TAB_COPY_KEYS.map((k) => [k, "{}"]));
    tab.set("wtplus:ai:chat", "keep me");
    const saved = createSavedResults({ store: memoryResultStore(), build: "b1", tabStorage: { removeItem: (k: string) => void tab.delete(k) } });
    await saved.clear();
    expect([...tab.keys()]).toEqual(["wtplus:ai:chat"]);
  });

  it("empties the store and tells every registered cache to forget its tab copy", async () => {
    const store = memoryResultStore();
    const saved = createSavedResults({ store, build: "b1" });
    await saved.write("ranking", 1, "a", { rows: [] });
    let forgot = 0;
    const off = onSavedResultsCleared(() => (forgot += 1));
    const offBad = onSavedResultsCleared(() => {
      throw new Error("broken cache");
    });
    expect(await saved.clear()).toBe(true);
    expect(store.records.size).toBe(0);
    expect(forgot).toBe(1);
    off();
    offBad();
    await saved.clear();
    expect(forgot).toBe(1);
  });
});

describe("savedAgo", () => {
  it("reads like the pages' other times", () => {
    const t = Date.parse("2026-11-02T18:00:00Z");
    expect(savedAgo(t, t + 10_000)).toBe("saved just now");
    expect(savedAgo(t, t + 4 * 60_000)).toBe("saved 4 min ago");
    expect(savedAgo(t, t + 2 * 3600_000)).toBe("saved 2 h ago");
    expect(savedAgo(t, t + 3 * 86400_000)).toBe(`saved ${new Date(t).toLocaleDateString()}`);
  });
});
