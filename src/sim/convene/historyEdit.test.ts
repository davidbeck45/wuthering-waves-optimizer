// Wuthering Tools+ — the Convene page's edits to the stored history (file import, forget a player, switch player)
// and its preferences. Same refusal rule as the API import: a history this build can't read is never overwritten.
import { describe, expect, it } from "vitest";
import {
  CONVENE_HISTORY_KEY,
  decodeConveneHistory,
  deleteConvenePlayer,
  emptyConveneHistory,
  encodeConveneHistory,
  exportConveneBackup,
  importConveneFile,
  mergeIntoHistory,
  rawConveneHistory,
  resetConveneHistory,
  setActiveConvenePlayer,
  type ConveneRecord,
  type KeyValueStorage,
} from "./gachaImport";
import { CONVENE_PREFS_KEY, decodeConvenePrefs, guessServerRegion, readConvenePrefs, serverOffsetHours, writeConvenePrefs } from "./prefs";

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

const rec = (time: string, name: string, quality = 3, resourceId = 0): ConveneRecord => ({ time, name, qualityLevel: quality, resourceId });

function storedWith(players: Record<string, Record<string, ConveneRecord[]>>, active: string | null = null) {
  let h = emptyConveneHistory();
  for (const [id, pools] of Object.entries(players)) h = mergeIntoHistory(h, id, "global", pools, "api", 1_000).history;
  h.activePlayerId = active ?? h.activePlayerId;
  return memoryStorage({ [CONVENE_HISTORY_KEY]: encodeConveneHistory(h) });
}

describe("importConveneFile", () => {
  it("merges a WuWa Tracker export into the stored history and never duplicates on a second run", () => {
    const storage = storedWith({ "900000001": { "1": [rec("2026-10-01 12:00:00", "Chisa", 5, 1608)] } });
    const file = JSON.stringify({
      playerId: "900000001",
      pulls: [
        { cardPoolType: 1, resourceId: 1608, qualityLevel: 5, name: "Chisa", time: "2026-10-01T04:00:00.000Z" },
        { cardPoolType: 1, qualityLevel: 3, name: "Originite: Type II", time: "2026-09-30T04:00:00.000Z" },
      ],
    });
    const first = importConveneFile(file, { storage, now: () => 2_000 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.summary.added).toBe(1); // the Chisa pull is the same one (UTC 04:00 = CST 12:00)
    expect(first.summary.source).toBe("wuwatracker");
    expect(first.saved).toBe(true);
    const again = importConveneFile(file, { storage, now: () => 3_000 });
    expect(again.ok && again.summary.added).toBe(0);
    const h = decodeConveneHistory(storage.data.get(CONVENE_HISTORY_KEY)!);
    expect(h.ok && h.history.players["900000001"]!.pools["1"]!.map((r) => r.name)).toEqual(["Originite: Type II", "Chisa"]);
  });

  it("round-trips our own backup and refuses what it can't read", () => {
    const storage = storedWith({ "900000001": { "2": [rec("2026-10-02 10:00:00", "Kumokiri", 5, 21020056)] } });
    const h = decodeConveneHistory(storage.data.get(CONVENE_HISTORY_KEY)!);
    const backup = exportConveneBackup(h.ok ? h.history : emptyConveneHistory(), "900000001", 5_000)!;
    const fresh = memoryStorage();
    const r = importConveneFile(backup, { storage: fresh });
    expect(r.ok && r.summary.added).toBe(1);
    expect(importConveneFile("{nope", { storage: fresh })).toEqual({ ok: false, reason: "not-json" });
    expect(importConveneFile(JSON.stringify({ hello: 1 }), { storage: fresh })).toEqual({ ok: false, reason: "unknown-format" });
    // a corrupt stored history is never overwritten by a file import
    const corrupt = memoryStorage({ [CONVENE_HISTORY_KEY]: "{broken" });
    expect(importConveneFile(backup, { storage: corrupt })).toEqual({ ok: false, reason: "corrupt" });
    expect(corrupt.data.get(CONVENE_HISTORY_KEY)).toBe("{broken");
    expect(importConveneFile(backup, { storage: null })).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("forget / switch players", () => {
  it("deletes one player and moves the page to another", () => {
    const storage = storedWith({ "900000001": { "1": [rec("2026-10-01 12:00:00", "A")] }, "900000002": { "1": [rec("2026-10-01 12:00:00", "B")] } }, "900000001");
    const r = deleteConvenePlayer("900000001", { storage });
    expect(r.ok && r.history.activePlayerId).toBe("900000002");
    expect(r.ok && Object.keys(r.history.players)).toEqual(["900000002"]);
    const last = deleteConvenePlayer("900000002", { storage });
    expect(last.ok && last.history.activePlayerId).toBeNull();
    const h = decodeConveneHistory(storage.data.get(CONVENE_HISTORY_KEY)!);
    expect(h.ok && h.history.players).toEqual({});
  });

  it("switches the active player, ignores unknown ids, and leaves an unreadable history alone until reset", () => {
    const storage = storedWith({ "900000001": {}, "900000002": {} }, "900000002");
    const r = setActiveConvenePlayer("900000001", { storage });
    expect(r.ok && r.history.activePlayerId).toBe("900000001");
    expect(setActiveConvenePlayer("123456789", { storage }).ok).toBe(true);
    const corrupt = memoryStorage({ [CONVENE_HISTORY_KEY]: '{"v":99}' });
    expect(deleteConvenePlayer("900000001", { storage: corrupt })).toEqual({ ok: false, reason: "newer-version" });
    expect(rawConveneHistory(corrupt)).toBe('{"v":99}');
    expect(resetConveneHistory(corrupt)).toBe(true);
    expect(decodeConveneHistory(corrupt.data.get(CONVENE_HISTORY_KEY)!).ok).toBe(true);
  });
});

describe("prefs", () => {
  it("reads defaults from nothing or junk and keeps valid fields only", () => {
    expect(decodeConvenePrefs(null)).toEqual({ tab: "simulator", server: null, budgetAstrite: null, manualPity: {} });
    expect(decodeConvenePrefs("{junk").tab).toBe("simulator");
    expect(decodeConvenePrefs(JSON.stringify({ v: 2, tab: "pulls" })).tab).toBe("simulator");
    const p = decodeConvenePrefs(JSON.stringify({ v: 1, tab: "advisor", server: "mars", budgetAstrite: "16000", manualPity: { "1": { pity: 120, guaranteed: true }, bad: {} } }));
    expect(p).toEqual({ tab: "advisor", server: null, budgetAstrite: 16000, manualPity: { "1": { pity: 79, guaranteed: true } } });
  });

  it("round-trips through storage", () => {
    const storage = memoryStorage();
    expect(writeConvenePrefs({ tab: "banners", server: "europe", budgetAstrite: null, manualPity: { "2": { pity: 12, guaranteed: false } } }, storage)).toBe(true);
    expect(JSON.parse(storage.data.get(CONVENE_PREFS_KEY)!).v).toBe(1);
    expect(readConvenePrefs(storage)).toEqual({ tab: "banners", server: "europe", budgetAstrite: null, manualPity: { "2": { pity: 12, guaranteed: false } } });
    expect(writeConvenePrefs(readConvenePrefs(null), null)).toBe(false);
  });

  it("guesses the server clock from the browser's offset", () => {
    expect(guessServerRegion(-300)).toBe("america"); // New York
    expect(guessServerRegion(-180)).toBe("america"); // São Paulo
    expect(guessServerRegion(60)).toBe("europe");
    expect(guessServerRegion(180)).toBe("europe"); // Moscow
    expect(guessServerRegion(480)).toBe("asia");
    expect(guessServerRegion(330)).toBe("asia"); // India
    expect(serverOffsetHours("america")).toBe(-5);
    expect(serverOffsetHours("europe")).toBe(1);
    expect(serverOffsetHours("asia")).toBe(8);
  });
});
