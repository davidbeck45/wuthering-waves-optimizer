// Wuthering Tools+: the /my-rankings cache must never serve numbers for data that changed — the old
// fingerprint (JSON lengths + echo count) kept the old ranking after an echo substat edit.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import account from "./__fixtures__/cartethyiaAccount.json";
import { clearRankingMemory, cyrb53, RANKING_CACHE_KEY, rankingFingerprint, rankingInFlight, readCachedRanking, sharedRanking, stableStringify, writeCachedRanking } from "./rankingCache";
import type { RankProgressItem, RosterRanking } from "./rankRoster";
import { savedResults } from "../persist/savedResults";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const inputs = (over: Partial<Parameters<typeof rankingFingerprint>[0]> = {}) => ({
  characters: clone(account.characters),
  echoes: clone(account.echoes),
  teams: [] as unknown[],
  investment: true,
  autoTeamBuffs: true,
  ...over,
});

function fakeStorage(limit = Infinity) {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (v.length > limit) throw new DOMException("quota", "QuotaExceededError");
      data.set(k, v);
    },
    removeItem: (k: string) => void data.delete(k),
  };
}

const ranking = (tag: string): RosterRanking =>
  ({ enemy: { enemyLevel: 100 }, characters: [{ id: tag }], teams: [], teamsSkipped: 0, computedAt: "2026-10-12T00:00:00.000Z" }) as unknown as RosterRanking;

describe("ranking fingerprint", () => {
  it("moves when one echo substat value changes, even at the same JSON length", () => {
    const before = inputs();
    const after = inputs();
    const echo = (after.echoes as Array<Record<string, unknown>>).find((e) => typeof e.echoSubStatsValue1 === "number" || typeof e.echoSubStatsValue1 === "string")!;
    expect(echo).toBeTruthy();
    // swap one digit for another: same length, same count — what the old length fingerprint could not see
    const old = String(echo.echoSubStatsValue1);
    const swapped = old.replace(/\d/, (d) => String((Number(d) + 1) % 10));
    expect(swapped.length).toBe(old.length);
    echo.echoSubStatsValue1 = typeof echo.echoSubStatsValue1 === "number" ? Number(swapped) : swapped;
    expect(JSON.stringify(after.echoes).length).toBe(JSON.stringify(before.echoes).length);
    expect(rankingFingerprint(after)).not.toBe(rankingFingerprint(before));
  });

  it("moves with a chain toggle, a team edit and either option", () => {
    const base = rankingFingerprint(inputs());
    const chains = inputs();
    const c = (chains.characters as Record<string, { resonanceChains: Record<string, { isEnabled: boolean }> }>).Cartethyia;
    const first = Object.keys(c.resonanceChains)[0];
    c.resonanceChains[first].isEnabled = !c.resonanceChains[first].isEnabled;
    expect(rankingFingerprint(chains)).not.toBe(base);
    expect(rankingFingerprint(inputs({ teams: [{ id: "t1", name: "A", characterIds: ["Cartethyia", null, null], actions: [] }] }))).not.toBe(base);
    expect(rankingFingerprint(inputs({ investment: false }))).not.toBe(base);
    expect(rankingFingerprint(inputs({ autoTeamBuffs: false }))).not.toBe(base);
  });

  it("ignores key order and is stable for equal data", () => {
    expect(rankingFingerprint(inputs())).toBe(rankingFingerprint(inputs()));
    const a = { characters: { X: { weapon: "W", level: 90 }, Y: { weapon: "V" } }, echoes: [{ a: 1, b: 2 }], teams: [], investment: true, autoTeamBuffs: false };
    const b = { characters: { Y: { weapon: "V" }, X: { level: 90, weapon: "W" } }, echoes: [{ b: 2, a: 1 }], teams: [], investment: true, autoTeamBuffs: false };
    expect(rankingFingerprint(a)).toBe(rankingFingerprint(b));
    // array order is data, not formatting
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
    expect(stableStringify({ b: { d: 1, c: 2 }, a: [{ z: 1, y: 2 }] })).toBe('{"a":[{"y":2,"z":1}],"b":{"c":2,"d":1}}');
  });

  it("hashes with cyrb53", () => {
    expect(cyrb53("")).toBe(cyrb53(""));
    expect(cyrb53("a")).not.toBe(cyrb53("b"));
    expect(cyrb53("a", 1)).not.toBe(cyrb53("a"));
  });
});

describe("ranking cache", () => {
  beforeEach(() => clearRankingMemory());

  it("serves the last ranking only for its own fingerprint, across a reload", () => {
    const storage = fakeStorage();
    expect(readCachedRanking("fp1", storage)).toBeNull();
    expect(writeCachedRanking("fp1", ranking("A"), storage)).toBe(true);
    expect(storage.data.has(RANKING_CACHE_KEY)).toBe(true);
    clearRankingMemory(); // a reload: module memory gone, sessionStorage kept
    expect(readCachedRanking("fp1", storage)?.characters[0].id).toBe("A");
    expect(readCachedRanking("fp2", storage)).toBeNull();
    writeCachedRanking("fp2", ranking("B"), storage);
    clearRankingMemory();
    expect(readCachedRanking("fp1", storage)).toBeNull(); // one entry: the newest
    expect(readCachedRanking("fp2", storage)?.characters[0].id).toBe("B");
  });

  it("keeps working when storage refuses or holds junk", () => {
    const tiny = fakeStorage(10);
    expect(writeCachedRanking("fp", ranking("A"), tiny)).toBe(false);
    expect(readCachedRanking("fp", tiny)?.characters[0].id).toBe("A"); // memory still has it
    clearRankingMemory();
    expect(readCachedRanking("fp", tiny)).toBeNull();
    const junk = fakeStorage();
    junk.data.set(RANKING_CACHE_KEY, "{not json");
    expect(readCachedRanking("fp", junk)).toBeNull();
    junk.data.set(RANKING_CACHE_KEY, JSON.stringify({ fingerprint: "fp", ranking: { characters: "nope" } }));
    expect(readCachedRanking("fp", junk)).toBeNull();
    expect(readCachedRanking("fp", null)).toBeNull();
  });
});

// speed track (2026-11-02): /account, /my-rankings and /weapons share one run per fingerprint, so leaving one of them
// for another mid-run no longer scores the roster twice on the main thread
describe("shared ranking run", () => {
  beforeEach(() => clearRankingMemory());

  type Progress = Parameters<Parameters<typeof sharedRanking>[1]>[0];
  /** a ranking run the test steps by hand: `step(item)` lands one row, `finish()` resolves it */
  function manualRun() {
    let report: Progress | null = null;
    let resolve!: (r: RosterRanking) => void;
    let reject!: (e: unknown) => void;
    let starts = 0;
    const start = (onProgress: Progress): Promise<RosterRanking> => {
      starts += 1;
      report = onProgress;
      return new Promise<RosterRanking>((res, rej) => {
        resolve = res;
        reject = rej;
      });
    };
    const item = (id: string): RankProgressItem => ({ kind: "character", rank: { id } as never });
    return {
      start,
      starts: () => starts,
      step: (done: number, id: string) => report!(done, 3, id, item(id)),
      finish: (r: RosterRanking) => resolve(r),
      fail: (e: unknown) => reject(e),
    };
  }
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("starts the ranking once: a second page joins it, gets the rows so far at once and the rest as they land", async () => {
    const storage = fakeStorage();
    const run = manualRun();
    const first: string[] = [];
    const a = sharedRanking("fp", run.start, { onProgress: (_p, f) => f && first.push((f.rank as { id: string }).id) }, storage);
    await flush();
    run.step(1, "Aemeath");
    run.step(2, "Cartethyia");
    const second: string[] = [];
    const seen: number[] = [];
    const b = sharedRanking("fp", () => { throw new Error("must not start a second run"); }, {
      onProgress: (p, f) => { seen.push(p.done); if (f) second.push((f.rank as { id: string }).id); },
    }, storage);
    expect(a.joined).toBe(false);
    expect(b.joined).toBe(true);
    expect(second).toEqual(["Aemeath", "Cartethyia"]); // replayed in landing order
    run.step(3, "Galbrena");
    expect(second).toEqual(["Aemeath", "Cartethyia", "Galbrena"]);
    expect(first).toEqual(["Aemeath", "Cartethyia", "Galbrena"]);
    expect(seen.at(-1)).toBe(3);
    run.finish(ranking("done"));
    const [ra, rb] = await Promise.all([a.promise, b.promise]);
    expect(ra).toBe(rb);
    expect(run.starts()).toBe(1);
    // the run filled the cache itself, under its fingerprint
    clearRankingMemory();
    expect(readCachedRanking("fp", storage)?.characters[0].id).toBe("done");
    expect(rankingInFlight("fp")).toBe(false);
  });

  it("keeps filling the cache after every page has left, and a later ask starts afresh", async () => {
    const storage = fakeStorage();
    const run = manualRun();
    const heard: string[] = [];
    const a = sharedRanking("fp", run.start, { onProgress: (_p, f) => f && heard.push("x") }, storage);
    await flush();
    a.leave();
    run.step(1, "Aemeath");
    expect(heard).toEqual([]); // nobody listening
    run.finish(ranking("late"));
    await a.promise;
    expect(readCachedRanking("fp", storage)?.characters[0].id).toBe("late");
    const again = manualRun();
    const c = sharedRanking("fp", again.start, {}, storage);
    expect(c.joined).toBe(false);
    await flush();
    expect(again.starts()).toBe(1);
  });

  it("never shares across fingerprints, and a failed run is not kept", async () => {
    const storage = fakeStorage();
    const one = manualRun();
    const two = manualRun();
    const a = sharedRanking("fp-a", one.start, {}, storage);
    const b = sharedRanking("fp-b", two.start, {}, storage);
    expect(b.joined).toBe(false);
    await flush();
    expect(one.starts()).toBe(1);
    expect(two.starts()).toBe(1);
    one.fail(new Error("boom"));
    await expect(a.promise).rejects.toThrow("boom");
    expect(rankingInFlight("fp-a")).toBe(false);
    expect(rankingInFlight("fp-b")).toBe(true);
    two.finish(ranking("B"));
    await b.promise;
    expect(readCachedRanking("fp-a", storage)).toBeNull();
  });
});

describe("ranking cache and the saved results", () => {
  const ranking = (over: Partial<RosterRanking> = {}): RosterRanking => ({ enemy: {} as RosterRanking["enemy"], characters: [], teams: [], teamsSkipped: 0, computedAt: "2026-11-04T00:00:00.000Z", ...over });
  afterEach(() => {
    vi.restoreAllMocks();
    clearRankingMemory();
  });

  it("saves a whole ranking, but keeps one that did not fully score to this tab: a new tab must score it again", () => {
    const write = vi.spyOn(savedResults, "write").mockResolvedValue(true);
    const storage = fakeStorage();
    writeCachedRanking("fp-whole", ranking(), storage);
    expect(write).toHaveBeenCalledTimes(1);
    write.mockClear();
    writeCachedRanking("fp-holes", ranking({ incomplete: true }), storage);
    expect(write).not.toHaveBeenCalled();
    expect(readCachedRanking("fp-holes", storage)?.incomplete).toBe(true); // the tab still shows what it scored
    clearRankingMemory();
    expect(readCachedRanking("fp-holes", storage)?.incomplete).toBe(true);
  });
});
