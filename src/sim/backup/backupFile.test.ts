// What a backup holds, as a file: Ryan's export plus the plus records the storage rules name, never anything else;
// the file still reads as his export; the content hash is about content alone.
import { describe, expect, it } from "vitest";
import { getImportData } from "../../utils/settingsBackup";
import { STORAGE_RULES } from "../storage/deleteAccount";
import { backupFile, backupFileName, BACKUP_PLUS_KEYS, captureAccount, contentHash, localDay, parseBackupText, type RyanExport } from "./backupFile";
import { captureCounts, countsText, isEmptyAccount } from "./counts";
import { EMPTY_CAPTURE, pull, pullsRaw, testCapture, testStores, THREE_PULLS } from "./__fixtures__/testAccount";

const SECRET = "sk-ant-api03-THIS-IS-THE-KEY";

/** a storage that holds something under every key the app knows, the API key included */
function everyKey(): Pick<Storage, "getItem"> {
  const data = new Map<string, string>();
  for (const rule of STORAGE_RULES) if (rule.area !== "indexedDB") data.set(rule.prefix ? `${rule.key}Jinhsi` : rule.key, JSON.stringify({ was: rule.key }));
  data.set("wtplus:ai:key", SECRET);
  return { getItem: (k) => data.get(k) ?? null };
}

const ryanExport = (): RyanExport => ({ meta: { version: "10", source: "WutheringTools" }, data: testStores() });

describe("what a backup holds", () => {
  it("is his export and the records the rules call account data: four of them, each as stored", () => {
    const capture = captureAccount(ryanExport, everyKey());
    expect(capture.meta).toEqual({ version: "10", source: "WutheringTools" });
    expect(capture.data).toEqual(testStores());
    expect(Object.keys(capture.keys).sort()).toEqual([...BACKUP_PLUS_KEYS].sort());
    expect(BACKUP_PLUS_KEYS).toHaveLength(4);
    expect(capture.keys["wtplus:convene:history"]).toBe(JSON.stringify({ was: "wtplus:convene:history" }));
  });

  it("never holds the assistant's API key, a setting, a cache or an Undo: nothing of them is in the file text", () => {
    const text = JSON.stringify(backupFile(captureAccount(ryanExport, everyKey()), "daily", 1_763_000_000_000));
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("wtplus:ai:");
    for (const rule of STORAGE_RULES) {
      if (rule.backup === "export" || rule.backup === "account") continue;
      expect(text, rule.key).not.toContain(JSON.stringify({ was: rule.key }).slice(1, -1));
    }
  });

  it("a record that is not there, or stored blank, is written as none; a blocked storage still gives his export", () => {
    const capture = captureAccount(ryanExport, { getItem: (k) => (k === "wtplus:endgame:clears" ? "" : null) });
    expect(capture.keys).toEqual({ "wtplus:convene:history": null, "wtplus:endgame:clears": null, "wtplus:echoPlan:v1": null, "wuthering-tools-plus.echoScan.albums": null });
    const blocked = captureAccount(ryanExport, {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(blocked.data).toEqual(testStores());
    expect(captureAccount(ryanExport, null).keys["wtplus:convene:history"]).toBeNull();
  });
});

describe("the file is still Ryan's export", () => {
  it("his import reads the same three stores and version from it as from his own file: the plus part is not his to read", () => {
    const capture = testCapture();
    const ours = JSON.stringify(backupFile(capture, "daily", 5));
    const his = JSON.stringify({ meta: capture.meta, data: capture.data });
    expect(getImportData(ours, true)).toEqual(getImportData(his, true));
    expect(JSON.parse(ours).meta).toEqual({ version: "10", source: "WutheringTools" });
    expect(Object.keys(JSON.parse(ours))).toEqual(["meta", "data", "wtplus"]);
  });

  it("reads back: one of ours with when and why, his plain export as a backup without a plus part", () => {
    const capture = testCapture();
    const ours = parseBackupText(JSON.stringify(backupFile(capture, "before-import", 1234)));
    expect(ours).toMatchObject({ ok: true, madeAt: 1234, reason: "before-import", plus: true });
    if (ours.ok) expect(ours.capture).toEqual(capture);
    const his = parseBackupText(JSON.stringify({ meta: capture.meta, data: capture.data }));
    expect(his).toMatchObject({ ok: true, madeAt: null, reason: null, plus: false });
    if (his.ok) expect(his.capture.keys).toEqual({});
  });

  it("a file is never a way to write another key: only the four records are taken from it, and only as text", () => {
    const file = backupFile(testCapture(), "daily", 1) as unknown as { wtplus: { keys: Record<string, unknown> } };
    file.wtplus.keys["wtplus:ai:key"] = "sk-evil";
    file.wtplus.keys["settings"] = "{}";
    file.wtplus.keys["wtplus:endgame:clears"] = { not: "text" };
    const parsed = parseBackupText(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(Object.keys(parsed.capture.keys).sort()).toEqual(["wtplus:convene:history", "wtplus:echoPlan:v1", "wuthering-tools-plus.echoScan.albums"]);
  });

  it("refuses what is not a backup, and one from a newer format, without guessing", () => {
    expect(parseBackupText("{not json")).toEqual({ ok: false, why: "not-json" });
    expect(parseBackupText("[1,2]")).toEqual({ ok: false, why: "not-a-backup" });
    expect(parseBackupText(JSON.stringify({ meta: { version: "10" }, data: {} }))).toEqual({ ok: false, why: "not-a-backup" });
    expect(parseBackupText(JSON.stringify([{ echo: "Jué" }]))).toEqual({ ok: false, why: "not-a-backup" });
    const newer = { ...backupFile(testCapture(), "daily", 1), wtplus: { v: 2, keys: {} } };
    expect(parseBackupText(JSON.stringify(newer))).toEqual({ ok: false, why: "newer" });
  });
});

describe("the content hash", () => {
  it("is the same for the same account whenever and why ever it was taken, and through a file", () => {
    const a = testCapture();
    const hash = contentHash(a);
    expect(contentHash(testCapture())).toBe(hash);
    for (const [reason, at] of [["daily", 1], ["before-restore", 99999]] as const) {
      const parsed = parseBackupText(JSON.stringify(backupFile(a, reason, at)));
      expect(parsed.ok && parsed.hash).toBe(hash);
    }
  });

  it("moves with any store, any plus record, and the data version", () => {
    const base = contentHash(testCapture());
    expect(contentHash(testCapture({ weapon: "EmeraldOfGenesis" }))).not.toBe(base);
    expect(contentHash(testCapture({ echoes: 4 }))).not.toBe(base);
    expect(contentHash(testCapture({ teams: 2 }))).not.toBe(base);
    expect(contentHash(testCapture({ pulls: [...THREE_PULLS, pull("2026-07-01 08:00:00", "Variation")] }))).not.toBe(base);
    expect(contentHash(testCapture({ clears: null }))).not.toBe(base);
    expect(contentHash({ ...testCapture(), meta: { version: "9", source: "WutheringTools" } })).not.toBe(base);
  });

  it("does not depend on the order a file lists its fields in", () => {
    const a = testCapture();
    const reversed = { meta: a.meta, data: Object.fromEntries(Object.entries(a.data).reverse()), keys: Object.fromEntries(Object.entries(a.keys).reverse()) };
    expect(contentHash(reversed)).toBe(contentHash(a));
  });

  it("a stored backup keeps its hash when a later build stops keeping one of its records: the file is hashed as written", () => {
    const file = backupFile(testCapture(), "daily", 1) as unknown as { wtplus: { keys: Record<string, string | null> } };
    file.wtplus.keys["wtplus:retired:record"] = "{}";
    const parsed = parseBackupText(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.capture.keys).not.toHaveProperty("wtplus:retired:record");
    expect(parsed.hash).toBe(contentHash({ ...testCapture(), keys: file.wtplus.keys }));
    expect(parsed.hash).not.toBe(contentHash(parsed.capture));
  });
});

describe("what is inside, in words", () => {
  it("counts characters set up, their saved builds, echoes, teams and pulls", () => {
    const counts = captureCounts(testCapture());
    expect(counts).toEqual({ characters: 1, builds: 2, echoes: 3, teams: 1, pulls: 3 });
    expect(countsText(counts).replace(/\u00a0/g, " ")).toBe("1 character · 3 echoes · 1 team · 2 saved builds · 3 pulls");
    expect(countsText(counts)).toContain("2\u00a0saved\u00a0builds"); // a number never wraps away from its noun
    expect(countsText({ characters: 12, builds: 1, echoes: 1251, teams: 0, pulls: 1 }).replace(/\u00a0/g, " ")).toBe("12 characters · 1,251 echoes · 0 teams · 1 saved build · 1 pull");
  });

  it("an account with nothing of the player's own is empty; pulls alone are something, and so is a history it cannot read", () => {
    expect(isEmptyAccount(captureCounts(EMPTY_CAPTURE))).toBe(true);
    expect(isEmptyAccount(captureCounts({ ...EMPTY_CAPTURE, keys: { ...EMPTY_CAPTURE.keys, "wtplus:convene:history": pullsRaw(THREE_PULLS) } }))).toBe(false);
    const unreadable = captureCounts({ ...EMPTY_CAPTURE, keys: { ...EMPTY_CAPTURE.keys, "wtplus:convene:history": JSON.stringify({ v: 99, players: {} }) } });
    expect(unreadable.pulls).toBeNull();
    expect(isEmptyAccount(unreadable)).toBe(false);
    expect(countsText(unreadable)).toContain("a\u00a0pull\u00a0history");
    expect(isEmptyAccount(captureCounts(testCapture()))).toBe(false);
  });

  it("stores that cannot be read count as nothing rather than throw", () => {
    expect(captureCounts({ data: { character: "{broken", inventory: null, teamRotations: "[]" }, keys: {} })).toEqual({ characters: 0, builds: 0, echoes: 0, teams: 0, pulls: 0 });
  });
});

describe("names and days", () => {
  it("a copy is named for the day and time it was taken, and a day is the player's own calendar day", () => {
    const at = new Date(2026, 10, 6, 9, 5).getTime();
    expect(localDay(at)).toBe("2026-11-06");
    expect(backupFileName(at)).toBe("wuthering-tools-backup-2026-11-06-0905.json");
    expect(backupFileName(at, "txt")).toBe("wuthering-tools-backup-2026-11-06-0905.txt");
  });
});
