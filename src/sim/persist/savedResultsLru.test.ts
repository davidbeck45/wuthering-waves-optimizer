// Wuthering Tools+ — saved results: the LRU under the size cap against a plain reference model, on seeded random
// sequences of writes (overwrites, misses, results too big for the cap) and reads (a read counts as use).
import { describe, expect, it } from "vitest";
import { seededRandom } from "../echoLab/fingerprint";
import { memoryResultStore } from "./resultStore";
import { createSavedResults } from "./savedResults";

const isRows = (v: unknown): boolean => Array.isArray((v as { rows?: unknown })?.rows);
const flush = () => new Promise((r) => setTimeout(r, 0));
const blob = (n: number) => ({ rows: ["x".repeat(n - 13)] }); // JSON length = n

/** The rule as written in savedResults.ts: newest kept, the least recently used go until the total fits the cap. */
function model(cap: number) {
  const records = new Map<string, { bytes: number; usedAt: number }>();
  return {
    records,
    write(key: string, bytes: number, at: number): boolean {
      if (bytes > cap) return false;
      records.set(key, { bytes, usedAt: at });
      let total = [...records.values()].reduce((n, r) => n + r.bytes, 0);
      for (const [k, r] of [...records.entries()].sort((a, b) => a[1].usedAt - b[1].usedAt)) {
        if (total <= cap) break;
        if (k === key) continue;
        records.delete(k);
        total -= r.bytes;
      }
      return true;
    },
    read(key: string, at: number): boolean {
      const r = records.get(key);
      if (r) r.usedAt = at;
      return !!r;
    },
  };
}

describe("saved results: LRU against a reference model", () => {
  it("keeps exactly the records the model keeps, never passes the cap, and never drops the newest", async () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const rand = seededRandom(seed);
      const cap = 400 + Math.floor(rand() * 600);
      let t = 1_000;
      const store = memoryResultStore();
      const saved = createSavedResults({ store, build: "b1", capBytes: cap, now: () => t });
      const ref = model(cap);
      const keys = Array.from({ length: 12 }, (_, i) => `fp${i}`);
      for (let step = 0; step < 120; step++) {
        t += 1;
        const key = keys[Math.floor(rand() * keys.length)];
        if (rand() < 0.6) {
          const bytes = 20 + Math.floor(rand() * (cap * 0.7)) + (rand() < 0.05 ? cap : 0);
          const ok = await saved.write("ranking", 1, key, blob(bytes));
          expect(ok, `seed ${seed} step ${step} write`).toBe(ref.write(`ranking|${key}`, bytes, t));
          if (ok) expect(store.records.has(`ranking|${key}`)).toBe(true);
        } else {
          const hit = await saved.read("ranking", 1, key, isRows);
          await flush(); // the "used just now" touch is fire-and-forget
          expect(!!hit, `seed ${seed} step ${step} read`).toBe(ref.read(`ranking|${key}`, t));
        }
        expect([...store.records.keys()].sort(), `seed ${seed} step ${step}`).toEqual([...ref.records.keys()].sort());
        expect((await saved.usage()).bytes).toBeLessThanOrEqual(cap);
      }
    }
  }, 60_000);
});
