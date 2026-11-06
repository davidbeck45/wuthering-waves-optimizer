// Wuthering Tools+ — the tab copies (sessionStorage) answer to the build and to Clear, as the saved results do. The first
// read on every page is the tab copy, so one a deploy or a Clear in another tab left behind would repeat old figures on a
// plain reload (2026-11-05 hunt, H3 and L2). What did not fully score is not a tab copy at all (H1, H2).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InvestPlan } from "../account/investPlan";
import type { EchoCheck } from "../account/echoCheck";
import { clearEchoCheckMemory, ECHO_CHECK_CACHE_KEY, echoCheckKey, readCachedEchoCheck, writeCachedEchoCheck } from "../account/echoCheckCache";
import { clearPlanMemory, readCachedPlan, writeCachedPlan } from "../account/investCache";
import { clearRankingMemory, RANKING_CACHE_KEY, rankingResultKey, readCachedRanking, sharedRanking, writeCachedRanking } from "../myRankings/rankingCache";
import type { RosterRanking } from "../myRankings/rankRoster";
import { createValueCache } from "../weaponValue/valueCache";
import { RESULTS_CLEARED_KEY, savedResults, tabCopyStamp } from "./savedResults";

const ranking = (over: Partial<RosterRanking> = {}): RosterRanking => ({ enemy: {} as RosterRanking["enemy"], characters: [], teams: [], teamsSkipped: 0, computedAt: "2026-11-05T00:00:00.000Z", ...over });
const plan = { items: [], characters: 0, errors: [], computedAt: "2026-11-05T00:00:00.000Z" } as unknown as InvestPlan;
const check = { items: [], best: [], skipped: [], errors: [], done: 0, total: 0, computedAt: "2026-11-05T00:00:00.000Z" } as unknown as EchoCheck;

/** a reload: module memory gone, sessionStorage kept */
function reload(value: ReturnType<typeof createValueCache<{ n: number }>>): void {
  clearRankingMemory();
  clearPlanMemory();
  clearEchoCheckMemory();
  value.clearMemory();
}

const deploy = (sha: string): void => void vi.stubEnv("VITE_VERCEL_GIT_COMMIT_SHA", sha);

describe("tab copies", () => {
  const value = createValueCache<{ n: number }>("wtplus:test:value", 1);
  const key = (): string => echoCheckKey("fp", "inv", null);

  function fill(): void {
    writeCachedRanking("fp", ranking());
    writeCachedPlan("fp", plan);
    writeCachedEchoCheck(key(), check);
    value.write("fp", { n: 1 });
  }
  const copies = () => [readCachedRanking("fp"), readCachedPlan("fp"), readCachedEchoCheck(key()), value.read("fp")];

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.spyOn(savedResults, "write").mockResolvedValue(true);
    deploy("aaaaaaaaaaaa1111");
    reload(value);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    reload(value);
  });

  it("are read back on a reload of the same build", () => {
    fill();
    reload(value);
    expect(copies().every(Boolean)).toBe(true);
  });

  it("from another build are misses: a plain reload after a deploy scores on the new build", () => {
    fill();
    deploy("bbbbbbbbbbbb2222");
    reload(value);
    expect(copies()).toEqual([null, null, null, null]);
  });

  it("from before a Clear in another tab are misses, memory included", () => {
    fill();
    localStorage.setItem(RESULTS_CLEARED_KEY, "1793926635593"); // what the other tab's Clear leaves
    expect(copies()).toEqual([null, null, null, null]);
  });

  it("Clear in this tab takes the echo check too", async () => {
    writeCachedEchoCheck(key(), check);
    expect(sessionStorage.getItem(ECHO_CHECK_CACHE_KEY)).not.toBeNull();
    const before = tabCopyStamp();
    await savedResults.clear();
    expect(sessionStorage.getItem(ECHO_CHECK_CACHE_KEY)).toBeNull();
    expect(tabCopyStamp()).not.toBe(before);
  });

  it("hold no ranking that did not fully score: this page load shows it, a reload scores again", () => {
    writeCachedRanking("fp", ranking({ incomplete: true }));
    expect(sessionStorage.getItem(RANKING_CACHE_KEY)).toBeNull();
    expect(readCachedRanking("fp")?.incomplete).toBe(true);
    reload(value);
    expect(readCachedRanking("fp")).toBeNull();
  });

  it("leave a whole copy of the same data alone when a later run comes up short", () => {
    writeCachedRanking("fp", ranking({ computedAt: "whole" }));
    writeCachedRanking("fp", ranking({ incomplete: true }));
    reload(value);
    expect(readCachedRanking("fp")?.computedAt).toBe("whole");
  });

  it("hold no value that did not fully score", () => {
    value.write("fp", { n: 2 }, undefined, false);
    expect(value.read("fp")).toEqual({ n: 2 });
    reload(value);
    expect(value.read("fp")).toBeNull();
  });

  it("hold no plan that did not fully score: a null storage leaves it in memory", () => {
    writeCachedPlan("fp", plan, null, null);
    expect(readCachedPlan("fp")).not.toBeNull();
    reload(value);
    expect(readCachedPlan("fp")).toBeNull();
  });

  it("a result built on a ranking with holes is never read beside the whole ranking of the same data", () => {
    const short = rankingResultKey("fp", ranking({ incomplete: true, computedAt: "t1" }));
    writeCachedPlan(short, plan);
    expect(rankingResultKey("fp", ranking())).toBe("fp");
    expect(short).not.toBe("fp");
    expect(readCachedPlan("fp")).toBeNull();
    expect(rankingResultKey("fp", ranking({ incomplete: true, computedAt: "t2" }))).not.toBe(short); // nor beside a later run
  });
});

describe("a run that outlives a Clear", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    clearRankingMemory();
  });
  afterEach(() => vi.restoreAllMocks());

  it("keeps nothing: the page said the next visit scores again", async () => {
    const write = vi.spyOn(savedResults, "write").mockResolvedValue(true);
    // eslint-disable-next-line no-unused-vars -- the parameters of a function type
    let finish: (r: RosterRanking) => void = () => undefined;
    const run = sharedRanking("fp", () => new Promise((resolve) => (finish = resolve)));
    localStorage.setItem(RESULTS_CLEARED_KEY, "1");
    finish(ranking());
    await run.promise;
    expect(write).not.toHaveBeenCalled();
    expect(readCachedRanking("fp")).toBeNull();
    expect(sessionStorage.getItem(RANKING_CACHE_KEY)).toBeNull();
  });
});

describe("a page load that lost a chunk", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.resetModules();
  });

  it("marks the ranking it scored as incomplete, so nothing built on it is kept either", async () => {
    const cache = await import("../myRankings/rankingCache");
    const persist = await import("./savedResults");
    const write = vi.spyOn(persist.savedResults, "write").mockResolvedValue(true);
    const run = cache.sharedRanking("fp-lost", async () => {
      window.dispatchEvent(new Event("vite:preloadError")); // a weapon that will not load scores as no weapon, with no error
      return ranking();
    });
    const scored = await run.promise;
    expect(scored.incomplete).toBe(true);
    expect(write).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(cache.RANKING_CACHE_KEY)).toBeNull();
    expect(cache.readCachedRanking("fp-lost")?.incomplete).toBe(true); // this page load still shows it
  }, 60_000);

  it("keeps a plan finished after the loss out of the saved results, on a ranking that was whole", async () => {
    const { planSavedUnder: savedUnder } = await import("../account/investCache");
    expect(savedUnder("fp", {}, { errors: [] })).toBe("fp");
    window.dispatchEvent(new Event("vite:preloadError"));
    expect(savedUnder("fp", {}, { errors: [] })).toBeNull();
  }, 60_000);
});

