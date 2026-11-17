// Wuthering Tools+ numbers log — recording: one entry per ranking that finished whole, on the account it scored; never
// a half-scored one, never twice, never loud when the browser will not keep it. Then the wiring: a run through
// `sharedRanking` is logged, a ranking read back from a cache is not. Synthetic account, pinned clock.
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { clearRankingMemory, fingerprintOptions, rankingFingerprint, readCachedRanking, sharedRanking } from "../myRankings/rankingCache";
import { IMPORT_STAMP_KEY, readImportStamp, stampImport } from "./importStamp";
import type { RankedAccount } from "./entry";
import { NUMBERS_LOG_KEY, decodeLog } from "./log";
import { readLog, withLogLock, type LogArea } from "./logStore";
import { recordScoredRanking, type RecordEnv } from "./recordRanking";
import { DAY, HOUR, T0, account, ranking } from "./testAccount";
import { STORAGE_RULES, deleteAccountData } from "../storage/deleteAccount";

/** A Map behind the three calls the log makes, with switches for a browser that refuses. */
function area(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  const state = { refuse: 0, writes: 0 };
  const store: LogArea & { length: number; key(i: number): string | null; clear(): void } = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      if (state.refuse > 0) {
        state.refuse -= 1;
        throw new DOMException("full", "QuotaExceededError");
      }
      state.writes += 1;
      data.set(k, String(v));
    },
    removeItem: (k) => void data.delete(k),
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
    clear: () => data.clear(),
  };
  return { store, data, state };
}

const fpOf = (acc: RankedAccount, auto = true): string => rankingFingerprint({ characters: acc.characters, echoes: acc.echoes, teams: acc.teams, investment: true, autoTeamBuffs: auto });
const env = (storage: LogArea | null, acc: RankedAccount, over: Partial<RecordEnv> = {}): Partial<RecordEnv> => ({
  storage,
  account: () => acc,
  now: () => T0 + 1000,
  build: "0.0.1+abc+aaaaaaaaaaaa",
  idle: () => Promise.resolve(),
  importedAt: () => null,
  ...over,
});

describe("recording a finished ranking", () => {
  it("stores one entry with the time the ranking finished, the build and the buffs switch", async () => {
    const { store } = area();
    const acc = account();
    expect(await recordScoredRanking(fpOf(acc), ranking(), env(store, acc))).toBe("stored");
    const log = readLog(store);
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]).toMatchObject({ at: T0, build: "0.0.1+abc+aaaaaaaaaaaa", autoTeamBuffs: true });
    expect(log.entries[0].characters.map((c) => c.damage)).toEqual([1_000_000, 400_000, 120_000]);
    expect(log.seen).toEqual({ fp: fpOf(acc), build: "0.0.1+abc+aaaaaaaaaaaa", at: T0 + 1000 });
    // the switch is read from the fingerprint the run was keyed on
    expect(fingerprintOptions(fpOf(acc, false))).toEqual({ investment: true, autoTeamBuffs: false });
    const off = area();
    await recordScoredRanking(fpOf(acc, false), ranking(), env(off.store, acc));
    expect(readLog(off.store).entries[0].autoTeamBuffs).toBe(false);
  });

  it("never records a ranking that did not fully score", async () => {
    const { store, state } = area();
    const acc = account();
    expect(await recordScoredRanking(fpOf(acc), ranking({}, { incomplete: true }), env(store, acc))).toBe("skipped");
    expect(await recordScoredRanking(fpOf(acc), null as never, env(store, acc))).toBe("skipped");
    expect(state.writes).toBe(0);
    expect(store.getItem(NUMBERS_LOG_KEY)).toBeNull();
  });

  it("records nothing when the account is no longer the one the run read", async () => {
    const { store, state } = area();
    const scored = account();
    const edited = account();
    edited.characters.Aaa.echoes[1] = { echoId: "e9" }; // changed while the run was going
    expect(await recordScoredRanking(fpOf(scored), ranking(), env(store, edited))).toBe("skipped");
    expect(state.writes).toBe(0);
  });

  it("does not store the same ranking twice: a Recompute, or a second tab that scored the same account", async () => {
    const { store } = area();
    const acc = account();
    expect(await recordScoredRanking(fpOf(acc), ranking(), env(store, acc))).toBe("stored");
    // the other tab: its own run of the same data, a little later, into the same storage
    expect(await recordScoredRanking(fpOf(acc), ranking({ at: T0 + 5000 }), env(store, account(), { now: () => T0 + 6000 }))).toBe("same");
    const log = readLog(store);
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0].at).toBe(T0);
    expect(log.seen?.at).toBe(T0 + 6000);
    // both at once
    const both = area();
    const outcomes = await Promise.all([recordScoredRanking(fpOf(acc), ranking(), env(both.store, acc)), recordScoredRanking(fpOf(acc), ranking(), env(both.store, account()))]);
    expect(outcomes.sort()).toEqual(["same", "stored"]);
    expect(readLog(both.store).entries).toHaveLength(1);
  });

  it("adds an entry when a figure moved, in the order they were taken", async () => {
    const { store } = area();
    const acc = account();
    await recordScoredRanking(fpOf(acc), ranking(), env(store, acc));
    acc.characters.Aaa.echoes[1] = { echoId: "e9" };
    expect(await recordScoredRanking(fpOf(acc), ranking({ Aaa: 1_080_000, at: T0 + DAY }), env(store, acc, { now: () => T0 + DAY + 1000 }))).toBe("stored");
    const log = readLog(store);
    expect(log.entries.map((e) => [e.at, e.characters[0].damage])).toEqual([
      [T0, 1_000_000],
      [T0 + DAY, 1_080_000],
    ]);
    expect(log.entries[0].characters[0].sig.he).not.toBe(log.entries[1].characters[0].sig.he);
  });

  it("keeps the log in order when the clock was set back", async () => {
    const { store } = area();
    const acc = account();
    await recordScoredRanking(fpOf(acc), ranking(), env(store, acc));
    await recordScoredRanking(fpOf(acc), ranking({ Aaa: 1_010_000, at: T0 - DAY }), env(store, acc, { now: () => T0 - DAY + 1000 }));
    const log = readLog(store);
    expect(log.entries.map((e) => e.characters[0].damage)).toEqual([1_000_000, 1_010_000]);
    expect(log.entries[1].at).toBeGreaterThan(log.entries[0].at);
  });

  it("breaks nothing when the browser will not keep it: no storage, a full one, one that throws on read", async () => {
    const acc = account();
    expect(await recordScoredRanking(fpOf(acc), ranking(), env(null, acc))).toBe("skipped");
    const full = area();
    full.state.refuse = 99;
    expect(await recordScoredRanking(fpOf(acc), ranking(), env(full.store, acc))).toBe("skipped");
    expect(full.store.getItem(NUMBERS_LOG_KEY)).toBeNull();
    const broken: LogArea = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => undefined,
    };
    expect(await recordScoredRanking(fpOf(acc), ranking(), env(broken, acc))).toBe("skipped");
    // and with no stores to read (a script, a test without Pinia): still only "skipped"
    setActivePinia(undefined as never);
    expect(await recordScoredRanking(fpOf(acc), ranking(), { storage: area().store, idle: () => Promise.resolve() })).toBe("skipped");
  });

  it("gives up half the log to a browser that refused the write, and keeps the newest", async () => {
    const { store, state } = area();
    const acc = account();
    for (let i = 0; i < 6; i++) await recordScoredRanking(fpOf(acc), ranking({ Aaa: 1_000_000 + i, at: T0 + i * HOUR }), env(store, acc, { now: () => T0 + i * HOUR + 1 }));
    expect(readLog(store).entries).toHaveLength(6);
    state.refuse = 1; // the next write is refused once
    expect(await recordScoredRanking(fpOf(acc), ranking({ Aaa: 1_000_006, at: T0 + 6 * HOUR }), env(store, acc, { now: () => T0 + 6 * HOUR + 1 }))).toBe("stored");
    const log = readLog(store);
    expect(log.entries.length).toBeLessThan(7);
    expect(log.entries[log.entries.length - 1].characters[0].damage).toBe(1_000_006);
  });

  it("starts over on a log it cannot read", async () => {
    const { store } = area({ [NUMBERS_LOG_KEY]: "{not json" });
    const acc = account();
    expect(await recordScoredRanking(fpOf(acc), ranking(), env(store, acc))).toBe("stored");
    expect(readLog(store).entries).toHaveLength(1);
  });

  it("marks an entry when a Settings import replaced the account since the last record", async () => {
    const { store } = area();
    const acc = account();
    await recordScoredRanking(fpOf(acc), ranking(), env(store, acc));
    acc.characters.Aaa.weapon = "SwordTwo";
    const imported = T0 + DAY - 60_000;
    await recordScoredRanking(fpOf(acc), ranking({ Aaa: 900_000, at: T0 + DAY }), env(store, acc, { now: () => T0 + DAY + 1, importedAt: () => imported }));
    let log = readLog(store);
    expect(log.entries[0].importedAt).toBeUndefined();
    expect(log.entries[1].importedAt).toBe(imported);
    // the same old import is not put on the next record too
    acc.characters.Aaa.weapon = "SwordOne";
    await recordScoredRanking(fpOf(acc), ranking({ at: T0 + 2 * DAY }), env(store, acc, { now: () => T0 + 2 * DAY + 1, importedAt: () => imported }));
    log = readLog(store);
    expect(log.entries).toHaveLength(3);
    expect(log.entries[2].importedAt).toBeUndefined();
  });

  it("does not blame an import that changed nothing for a later change", async () => {
    const { store } = area();
    const acc = account();
    await recordScoredRanking(fpOf(acc), ranking(), env(store, acc));
    const imported = T0 + HOUR; // an import of the same data: the ranking after it equals the record
    expect(await recordScoredRanking(fpOf(acc), ranking({ at: T0 + 2 * HOUR }), env(store, acc, { now: () => T0 + 2 * HOUR, importedAt: () => imported }))).toBe("same");
    acc.characters.Aaa.echoes[1] = { echoId: "e9" };
    await recordScoredRanking(fpOf(acc), ranking({ Aaa: 1_050_000, at: T0 + DAY }), env(store, acc, { now: () => T0 + DAY + 1, importedAt: () => imported }));
    expect(readLog(store).entries[1].importedAt).toBeUndefined();
  });

  it("stamps an import where the log reads it, and never throws doing so", () => {
    const { store, state } = area();
    expect(readImportStamp(store)).toBeNull();
    stampImport(T0, store);
    expect(store.getItem(IMPORT_STAMP_KEY)).toBe(String(T0));
    expect(readImportStamp(store)).toBe(T0);
    state.refuse = 1;
    expect(() => stampImport(T0 + 1, store)).not.toThrow();
    expect(() => stampImport(T0 + 1, null)).not.toThrow();
    expect(readImportStamp(area({ [IMPORT_STAMP_KEY]: "soon" }).store)).toBeNull();
  });

  it("runs the write once even when the lock itself fails after it", async () => {
    let runs = 0;
    const job = (): number => (runs += 1);
    await expect(withLogLock(job, { request: async (_name, cb) => (await cb(), Promise.reject(new Error("lost"))) as never })).rejects.toThrow("lost");
    expect(runs).toBe(1);
    // a browser that will not give the lock at all: the job still runs, unlocked
    expect(await withLogLock(job, { request: () => Promise.reject(new Error("no locks here")) })).toBe(2);
    expect(await withLogLock(job, null)).toBe(3);
  });
});

describe("Delete your data", () => {
  it("deletes the log and the import stamp", () => {
    for (const key of [NUMBERS_LOG_KEY, IMPORT_STAMP_KEY]) expect(STORAGE_RULES.find((r) => r.key === key), key).toMatchObject({ area: "local", fate: "goes" });
    const { store } = area({ [NUMBERS_LOG_KEY]: "x", [IMPORT_STAMP_KEY]: "1", settings: "{}" });
    deleteAccountData({ local: store as unknown as Storage, session: null, teams: null, results: { clear: async () => true } });
    expect(store.getItem(NUMBERS_LOG_KEY)).toBeNull();
    expect(store.getItem(IMPORT_STAMP_KEY)).toBeNull();
    expect(store.getItem("settings")).toBe("{}");
  });
});

describe("the wiring: a run is logged, a ranking read back from a cache is not", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearRankingMemory();
    setActivePinia(createPinia());
  });
  afterEach(() => {
    vi.useRealTimers();
    clearRankingMemory();
  });

  /** the synthetic account in the three stores, as a page would find it */
  function fillStores(acc: ReturnType<typeof account>): void {
    useCharacterStore().$patch({ characters: acc.characters } as never);
    useInventoryStore().$patch({ echoes: acc.echoes } as never);
    useTeamRotationsStore().$patch({ teams: acc.teams } as never);
  }
  const stored = (): number => decodeLog(localStorage.getItem(NUMBERS_LOG_KEY)).entries.length;

  it("logs a ranking that sharedRanking ran, once, and not again when a page reads it from this tab's cache", async () => {
    const acc = account();
    fillStores(acc);
    const fp = rankingFingerprint({ characters: useCharacterStore().characters, echoes: useInventoryStore().echoes, teams: useTeamRotationsStore().teams, investment: true, autoTeamBuffs: true });
    const run = sharedRanking(fp, async () => ranking({ at: Date.now() }), {}, sessionStorage);
    await run.promise;
    await vi.waitFor(() => expect(stored()).toBe(1), { timeout: 5000 });
    const first = decodeLog(localStorage.getItem(NUMBERS_LOG_KEY));
    expect(first.entries[0].characters.map((c) => c.id)).toEqual(["Aaa", "Bbb", "Ccc"]);
    expect(first.seen?.fp).toBe(fp);

    // the page comes back: the ranking is painted from the tab copy, and nothing is recorded as if new
    const before = localStorage.getItem(NUMBERS_LOG_KEY);
    expect(readCachedRanking(fp, sessionStorage)).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(localStorage.getItem(NUMBERS_LOG_KEY)).toBe(before);
  }, 20_000);

  it("logs nothing for a run that did not fully score", async () => {
    const acc = account();
    fillStores(acc);
    const fp = rankingFingerprint({ characters: useCharacterStore().characters, echoes: useInventoryStore().echoes, teams: useTeamRotationsStore().teams, investment: true, autoTeamBuffs: true });
    await sharedRanking(fp, async () => ranking({ at: Date.now() }, { incomplete: true }), {}, sessionStorage).promise;
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(localStorage.getItem(NUMBERS_LOG_KEY)).toBeNull();
  }, 20_000);
});
