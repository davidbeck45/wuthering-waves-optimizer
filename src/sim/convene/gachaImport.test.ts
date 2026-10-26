// Wuthering Tools+: Convene history import — link parsing (every host variant), the PC log (plain + XOR), Kuro's
// record API (mocked: no live network), merge/dedupe (an empty answer never deletes), storage and files.
// The ids below are made up; the shapes follow wuwatracker's example link and the importers cited in gachaImport.ts.
import { describe, expect, it, vi } from "vitest";
import {
  CONVENE_HISTORY_KEY,
  apiRecordsToHistory,
  decodeClientLogBytes,
  decodeConveneHistory,
  emptyConveneHistory,
  encodeConveneHistory,
  exportConveneBackup,
  extractConveneLinkFromLog,
  fetchConveneHistory,
  fetchConvenePool,
  importConveneHistory,
  manualConveneQuery,
  maskPlayerId,
  mergeIntoHistory,
  mergePoolRecords,
  parseConveneFile,
  parseConveneLink,
  readConveneHistory,
  recordRequestBody,
  type ApiConveneRecord,
  type ConveneQuery,
  type ConveneRecord,
  type KeyValueStorage,
} from "./gachaImport";

const PLAYER = "900123456";
const RECORD = "0123456789abcdef0123456789abcdef";
const SERVER = "abcdef0123456789abcdef0123456789";
const RESOURCES = "fedcba9876543210fedcba9876543210";
const QS = `svr_id=${SERVER}&player_id=${PLAYER}&lang=en&gacha_id=2&gacha_type=3&svr_area=global&record_id=${RECORD}&resources_id=${RESOURCES}&platform=PC`;
const GLOBAL_LINK = `https://aki-gm-resources-oversea.aki-game.net/aki/gacha/index.html#/record?${QS}`;

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

/** inverse of decodeClientLogBytes: an even byte was XORed with 0xA5, an odd one with 0xEF */
function encodeClientLog(text: string): Uint8Array {
  const bytes = new TextEncoder().encode(text);
  return bytes.map((d) => d ^ (d & 1 ? 0xef : 0xa5));
}

describe("parseConveneLink", () => {
  it("reads the global PC link", () => {
    const r = parseConveneLink(GLOBAL_LINK);
    expect(r).toEqual({
      ok: true,
      query: { playerId: PLAYER, recordId: RECORD, serverId: SERVER, cardPoolId: RESOURCES, languageCode: "en", region: "global" },
    });
  });

  it("tells CN from global on all four host variants", () => {
    const cn = `https://aki-gm-resources.aki-game.com/aki/gacha/index.html#/record?svr_id=${SERVER}&player_id=106485288&lang=zh-Hans&svr_area=cn&record_id=${RECORD}&resources_id=${RESOURCES}`;
    expect(parseConveneLink(cn)).toMatchObject({ ok: true, query: { region: "cn", languageCode: "zh-Hans", playerId: "106485288" } });
    // the "-oversea" word decides, whatever the TLD
    expect(parseConveneLink(GLOBAL_LINK.replace("aki-game.net", "aki-game.com"))).toMatchObject({ ok: true, query: { region: "global" } });
    // no svr_area: the TLD decides
    const bare = QS.replace("&svr_area=global", "");
    expect(parseConveneLink(`https://aki-gm-resources.aki-game.net/aki/gacha/index.html#/record?${bare}`)).toMatchObject({ ok: true, query: { region: "global" } });
    expect(parseConveneLink(`https://aki-gm-resources.aki-game.com/aki/gacha/index.html#/record?${bare}`)).toMatchObject({ ok: true, query: { region: "cn" } });
  });

  it("prefers the fragment over a cloud link's top-level query, and decodes percent escapes", () => {
    const cloud = `https://aki-gm-resources.aki-game.com/aki/gacha/index.html?player_id=111111111&record_id=old&svr_id=old&svr_area=cn#/record?player_id=106485288&record_id=cloud%2Dtoken&resources_id=pool&svr_id=srv&svr_area=cn`;
    expect(parseConveneLink(cloud)).toMatchObject({ ok: true, query: { playerId: "106485288", recordId: "cloud-token", serverId: "srv", cardPoolId: "pool" } });
  });

  it("finds the link inside surrounding text, takes the last one, and undoes JSON escaping", () => {
    const older = GLOBAL_LINK.replace(RECORD, "aaaaaaaaaaaaaaaa");
    const text = `copied: ${older}\nand later "${GLOBAL_LINK}" done`;
    expect(parseConveneLink(text)).toMatchObject({ ok: true, query: { recordId: RECORD } });
    const escaped = `{"url":"${GLOBAL_LINK.replace(/&/g, "\\u0026").replace(/\//g, "\\/")}\\"}`;
    expect(parseConveneLink(escaped)).toMatchObject({ ok: true, query: { recordId: RECORD, cardPoolId: RESOURCES } });
  });

  it("accepts a bare query string", () => {
    expect(parseConveneLink(`?${QS}`)).toMatchObject({ ok: true, query: { playerId: PLAYER, region: "global" } });
  });

  it("refuses what isn't a full Convene link, without echoing the input", () => {
    expect(parseConveneLink("")).toEqual({ ok: false, error: "no-link" });
    expect(parseConveneLink("https://example.com/?player_id=1")).toEqual({ ok: false, error: "missing-record" });
    expect(parseConveneLink("hello")).toEqual({ ok: false, error: "no-link" });
    expect(parseConveneLink(GLOBAL_LINK.replace(`&record_id=${RECORD}`, ""))).toEqual({ ok: false, error: "missing-record" });
    expect(parseConveneLink(GLOBAL_LINK.replace(`svr_id=${SERVER}&`, ""))).toEqual({ ok: false, error: "missing-server" });
    expect(parseConveneLink(GLOBAL_LINK.replace(RECORD, "%3Cscript%3E"))).toEqual({ ok: false, error: "bad-value" });
    expect(parseConveneLink(GLOBAL_LINK.replace(PLAYER, "12ab"))).toEqual({ ok: false, error: "bad-value" });
  });

  it("builds a query from ids typed in by hand (console players)", () => {
    expect(manualConveneQuery({ playerId: ` ${PLAYER} `, recordId: RECORD, serverId: SERVER })).toMatchObject({
      ok: true,
      query: { playerId: PLAYER, cardPoolId: "", region: "global" },
    });
    expect(manualConveneQuery({ playerId: "106485288", recordId: RECORD, serverId: SERVER })).toMatchObject({ ok: true, query: { region: "cn" } });
    expect(manualConveneQuery({ playerId: PLAYER, recordId: "", serverId: SERVER })).toEqual({ ok: false, error: "missing-record" });
  });
});

describe("the PC log", () => {
  const log = [
    "[2026.10.12-09.00.01:000][  0]LogTemp: start",
    `[2026.10.12-09.10.00:000][  1]LogKuro: OpenUrl ${GLOBAL_LINK.replace(RECORD, "bbbbbbbbbbbbbbbb")}`,
    `[2026.10.12-09.20.00:000][  2]LogKuro: OpenUrl "${GLOBAL_LINK}"`,
    "[2026.10.12-09.30.00:000][  3]LogTemp: end",
  ].join("\r\n");

  it("decodes Kuro's XOR byte for byte", () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    const enc = all.map((d) => d ^ (d & 1 ? 0xef : 0xa5));
    expect(Array.from(decodeClientLogBytes(enc))).toEqual(Array.from(all));
  });

  it("finds the newest link in a plain log (text or bytes)", () => {
    expect(extractConveneLinkFromLog(log)).toBe(GLOBAL_LINK);
    expect(extractConveneLinkFromLog(new TextEncoder().encode(log))).toBe(GLOBAL_LINK);
    expect(extractConveneLinkFromLog(new TextEncoder().encode(log).buffer)).toBe(GLOBAL_LINK);
  });

  it("finds it in the XOR-obfuscated Client.log", () => {
    const bytes = encodeClientLog(log);
    expect(new TextDecoder().decode(bytes)).not.toContain("aki-gm-resources");
    expect(extractConveneLinkFromLog(bytes)).toBe(GLOBAL_LINK);
    // pasted as text: every char carries one byte
    expect(extractConveneLinkFromLog(String.fromCharCode(...bytes))).toBe(GLOBAL_LINK);
  });

  it("reads the KRSDK debug.log's JSON-escaped link", () => {
    const debug = `{"level":"info","msg":"load","url":"${GLOBAL_LINK.replace(/&/g, "\\u0026")}"}`;
    expect(extractConveneLinkFromLog(debug)).toBe(GLOBAL_LINK);
  });

  it("returns null when the history page was never opened", () => {
    expect(extractConveneLinkFromLog("LogTemp: nothing here")).toBeNull();
    expect(extractConveneLinkFromLog(encodeClientLog("LogTemp: nothing here"))).toBeNull();
  });
});

const QUERY: ConveneQuery = { playerId: PLAYER, recordId: RECORD, serverId: SERVER, cardPoolId: RESOURCES, languageCode: "de", region: "global" };

function api(time: string, name: string, quality: number, resourceId = 0, pool = "Featured Resonator Convene"): ApiConveneRecord {
  return { cardPoolType: pool, resourceId, qualityLevel: quality, resourceType: resourceId && resourceId < 100000 ? "Resonators" : "Weapons", name, count: 1, time };
}

function respond(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

describe("Kuro's record API", () => {
  it("POSTs the six-field body to the region's endpoint, in English, without credentials", async () => {
    const fetchImpl = vi.fn(async () => respond({ code: 0, message: "success", data: [] }));
    await fetchConvenePool(QUERY, 1, { fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://gmserver-api.aki-game2.net/gacha/record/query");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("omit");
    expect(init.referrerPolicy).toBe("no-referrer");
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(JSON.parse(String(init.body))).toEqual({
      playerId: PLAYER,
      cardPoolId: RESOURCES,
      cardPoolType: 1,
      languageCode: "en",
      recordId: RECORD,
      serverId: SERVER,
    });
    await fetchConvenePool({ ...QUERY, region: "cn" }, 2, { fetchImpl });
    expect((fetchImpl.mock.calls[1] as unknown as [string])[0]).toBe("https://gmserver-api.aki-game2.com/gacha/record/query");
    expect(recordRequestBody(QUERY, 12).cardPoolType).toBe(12);
  });

  it("maps the answers: records, expired, HTTP, malformed, offline, aborted", async () => {
    const rec = api("2026-10-01 12:00:00", "Chisa", 5, 1606);
    expect(await fetchConvenePool(QUERY, 1, { fetchImpl: async () => respond({ code: 0, data: [rec] }) })).toEqual({ poolType: 1, ok: true, records: [rec] });
    expect(await fetchConvenePool(QUERY, 1, { fetchImpl: async () => respond({ code: 0, data: null }) })).toEqual({ poolType: 1, ok: true, records: [] });
    expect(await fetchConvenePool(QUERY, 1, { fetchImpl: async () => respond({ code: -1, message: "x", data: [] }) })).toMatchObject({ ok: false, error: "expired", code: -1 });
    expect(await fetchConvenePool(QUERY, 1, { fetchImpl: async () => respond({ code: -4, message: "当前serverId查询不到区服信息!", data: [] }) })).toMatchObject({ ok: false, error: "bad-server", code: -4 });
    expect(await fetchConvenePool(QUERY, 1, { fetchImpl: async () => respond({ code: 1001, data: [] }) })).toMatchObject({ ok: false, error: "api", code: 1001 });
    expect(await fetchConvenePool(QUERY, 1, { fetchImpl: async () => respond({}, 502) })).toMatchObject({ ok: false, error: "http", code: 502 });
    expect(await fetchConvenePool(QUERY, 1, { fetchImpl: async () => respond({ code: 0, data: [{ time: "yesterday" }] }) })).toMatchObject({ ok: false, error: "format" });
    expect(await fetchConvenePool(QUERY, 1, { fetchImpl: async () => Promise.reject(new TypeError("Failed to fetch")) })).toMatchObject({ ok: false, error: "network" });
    const ctl = new AbortController();
    ctl.abort();
    expect(await fetchConvenePool(QUERY, 1, { fetchImpl: async () => Promise.reject(new DOMException("aborted", "AbortError")), signal: ctl.signal })).toMatchObject({ ok: false, error: "aborted" });
  });

  it("walks every pool and stops asking once the link reads as expired", async () => {
    const fetchImpl = vi.fn(async () => respond({ code: -1, data: [] }));
    const progress = vi.fn();
    const out = await fetchConveneHistory(QUERY, { fetchImpl, delayMs: 0, onProgress: progress });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(out).toHaveLength(13);
    expect(out[0]).toMatchObject({ poolType: 1, error: "expired" });
    expect(out.slice(1).every((o) => !o.ok && o.error === "skipped")).toBe(true);
    const ok = vi.fn(async () => respond({ code: 0, data: [] }));
    const all = await fetchConveneHistory(QUERY, { fetchImpl: ok, delayMs: 0, onProgress: progress });
    expect(ok).toHaveBeenCalledTimes(13);
    expect(all.map((o) => o.poolType)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });
});

/** a 10-pull as the API lists it (newest first): the last pull of the batch comes first */
function tenPullApi(time: string, names: [string, number, number][]): ApiConveneRecord[] {
  return names.map(([n, q, id]) => api(time, n, q, id)).reverse();
}

describe("merge", () => {
  const batchApi = tenPullApi("2026-10-01 12:00:00", [
    ["Sword of Night", 3, 21010013],
    ["Sword of Night", 3, 21010013],
    ["Taoqi", 4, 1601],
    ["Guardian Sword", 3, 21010023],
    ["Sword of Night", 3, 21010013],
    ["Chisa", 5, 1606],
    ["Originite: Type I", 3, 21030013],
    ["Sword of Night", 3, 21010013],
    ["Buling", 4, 1607],
    ["Guardian Sword", 3, 21010023],
  ]);
  const single = api("2026-10-02 08:00:00", "Youhu", 4, 1608);

  it("turns the API's newest-first list into pull order", () => {
    const h = apiRecordsToHistory([single, ...batchApi]);
    expect(h.map((r) => r.name)).toEqual([
      "Sword of Night", "Sword of Night", "Taoqi", "Guardian Sword", "Sword of Night", "Chisa",
      "Originite: Type I", "Sword of Night", "Buling", "Guardian Sword", "Youhu",
    ]);
  });

  it("an empty answer never deletes anything", () => {
    const stored = apiRecordsToHistory(batchApi);
    expect(mergePoolRecords(stored, [])).toEqual({ records: stored, added: 0 });
  });

  it("dedupes by batch + item + position: repeated identical pulls inside a 10-pull survive, re-imports add nothing", () => {
    const stored = apiRecordsToHistory(batchApi);
    const fresh = apiRecordsToHistory([single, ...batchApi]);
    const once = mergePoolRecords(stored, fresh);
    expect(once.added).toBe(1);
    expect(once.records).toHaveLength(11);
    expect(once.records.filter((r) => r.name === "Sword of Night")).toHaveLength(4);
    const twice = mergePoolRecords(once.records, fresh);
    expect(twice).toEqual({ records: once.records, added: 0 });
  });

  it("keeps pulls that fell out of the API's six-month window", () => {
    const old: ConveneRecord = { time: "2026-01-01 10:00:00", resourceId: 1503, qualityLevel: 5, name: "Verina" };
    const stored = [old, ...apiRecordsToHistory(batchApi)];
    const fresh = apiRecordsToHistory([single, ...batchApi]); // Kuro no longer returns January
    const merged = mergePoolRecords(stored, fresh);
    expect(merged.records[0]).toEqual(old);
    expect(merged.records).toHaveLength(12);
    expect(merged.added).toBe(1);
  });

  it("completes a batch one side holds only partly, and matches id-less (file) records by name", () => {
    const full = apiRecordsToHistory(batchApi);
    const partial = full.slice(0, 7).map((r) => ({ ...r, resourceId: 0 }));
    const merged = mergePoolRecords(partial, full);
    expect(merged.records).toHaveLength(10);
    expect(merged.added).toBe(3);
    expect(merged.records.map((r) => r.name)).toEqual(full.map((r) => r.name));
  });

  it("mergeIntoHistory reports per pool and never touches pools the import didn't return", () => {
    let h = emptyConveneHistory();
    ({ history: h } = mergeIntoHistory(h, PLAYER, "global", { "1": apiRecordsToHistory(batchApi), "3": [{ time: "2026-09-01 00:00:00", resourceId: 1503, qualityLevel: 5, name: "Verina" }] }, "api", 1000));
    const { history, summary } = mergeIntoHistory(h, PLAYER, "global", { "1": apiRecordsToHistory([single]) }, "api", 2000);
    expect(summary).toMatchObject({ added: 1, total: 12, expired: false, failed: 0 });
    expect(summary.pools).toEqual([{ poolType: 1, received: 1, added: 1, total: 11 }]);
    expect(history.players[PLAYER]!.pools["3"]).toHaveLength(1);
    expect(history.players[PLAYER]!.updatedAt).toBe(2000);
    expect(history.activePlayerId).toBe(PLAYER);
  });
});

describe("importConveneHistory (storage + mocked API)", () => {
  function apiFor(byPool: Record<number, ApiConveneRecord[]>) {
    return vi.fn(async (_url: string, init: RequestInit) => {
      const pool = JSON.parse(String(init.body)).cardPoolType as number;
      return respond({ code: 0, message: "success", data: byPool[pool] ?? [] });
    });
  }

  it("stores the merged history, schema-versioned, with no token in it", async () => {
    const storage = memoryStorage();
    const res = await importConveneHistory(QUERY, { storage, fetchImpl: apiFor({ 1: [api("2026-10-01 12:00:00", "Chisa", 5, 1606)] }) as never, delayMs: 0, now: () => 5000 });
    expect(res).toMatchObject({ ok: true, saved: true, summary: { added: 1, total: 1 } });
    const raw = storage.data.get(CONVENE_HISTORY_KEY)!;
    expect(JSON.parse(raw).v).toBe(1);
    expect(raw).not.toContain(RECORD);
    expect(raw).not.toContain(SERVER);
    expect(raw).not.toContain(RESOURCES);
    const read = readConveneHistory(storage);
    expect(read.ok && read.history.players[PLAYER]!.pools["1"]![0]!.name).toBe("Chisa");
  });

  it("an expired link and an empty answer both leave the stored history alone", async () => {
    const storage = memoryStorage();
    await importConveneHistory(QUERY, { storage, fetchImpl: apiFor({ 1: [api("2026-10-01 12:00:00", "Chisa", 5, 1606)] }) as never, delayMs: 0 });
    const before = storage.data.get(CONVENE_HISTORY_KEY);
    const expired = await importConveneHistory(QUERY, { storage, fetchImpl: (async () => respond({ code: -1, data: [] })) as never, delayMs: 0 });
    expect(expired).toMatchObject({ ok: false, reason: "expired" });
    expect(storage.data.get(CONVENE_HISTORY_KEY)).toBe(before);
    const empty = await importConveneHistory(QUERY, { storage, fetchImpl: apiFor({}) as never, delayMs: 0 });
    expect(empty).toMatchObject({ ok: true, summary: { added: 0, total: 1 } });
    const read = readConveneHistory(storage);
    expect(read.ok && read.history.players[PLAYER]!.pools["1"]).toHaveLength(1);
  });

  it("an unknown server id stops after one request and changes nothing", async () => {
    const storage = memoryStorage();
    const fetchImpl = vi.fn(async () => respond({ code: -4, message: "当前serverId查询不到区服信息!", data: [] }));
    expect(await importConveneHistory(QUERY, { storage, fetchImpl: fetchImpl as never, delayMs: 0 })).toMatchObject({ ok: false, reason: "bad-server" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(storage.data.size).toBe(0);
  });

  it("refuses to overwrite a history it can't read", async () => {
    const corrupt = memoryStorage({ [CONVENE_HISTORY_KEY]: "{not json" });
    const fetchImpl = apiFor({});
    expect(await importConveneHistory(QUERY, { storage: corrupt, fetchImpl: fetchImpl as never, delayMs: 0 })).toEqual({ ok: false, reason: "corrupt" });
    expect(corrupt.data.get(CONVENE_HISTORY_KEY)).toBe("{not json");
    expect(fetchImpl).not.toHaveBeenCalled();
    const newer = memoryStorage({ [CONVENE_HISTORY_KEY]: JSON.stringify({ v: 99, players: {} }) });
    expect(await importConveneHistory(QUERY, { storage: newer, fetchImpl: fetchImpl as never, delayMs: 0 })).toEqual({ ok: false, reason: "newer-version" });
  });

  it("round-trips the compact on-disk format", () => {
    const { history } = mergeIntoHistory(emptyConveneHistory(), PLAYER, "global", { "1": apiRecordsToHistory(batchApiFixture()) }, "api", 42);
    const back = decodeConveneHistory(encodeConveneHistory(history));
    expect(back).toEqual({ ok: true, history });
  });
});

function batchApiFixture(): ApiConveneRecord[] {
  return tenPullApi("2026-10-01 12:00:00", [
    ["Sword of Night", 3, 21010013], ["Taoqi", 4, 1601], ["Sword of Night", 3, 21010013], ["Guardian Sword", 3, 21010023], ["Sword of Night", 3, 21010013],
    ["Verina", 5, 1503], ["Guardian Sword", 3, 21010023], ["Sword of Night", 3, 21010013], ["Buling", 4, 1607], ["Guardian Sword", 3, 21010023],
  ]);
}

describe("files", () => {
  it("reads a WuWa Tracker export: UTC instants become the API's CST clock, newest-first becomes pull order", () => {
    const file = JSON.stringify({
      playerId: PLAYER,
      date: "2026-10-02T00:00:00.000Z",
      pulls: [
        { cardPoolType: 1, resourceId: 1608, qualityLevel: 4, name: "Youhu", time: "2026-10-02T00:00:00+00:00" },
        { cardPoolType: 1, qualityLevel: 3, name: "Sword of Night", time: "2026-10-01T04:00:00Z" },
        { cardPoolType: 1, resourceId: 1606, qualityLevel: 5, name: "Chisa", time: "2026-10-01T04:00:00Z" },
        { cardPoolType: 99, qualityLevel: 3, name: "Unknown pool", time: "2026-10-01T04:00:00Z" },
      ],
    });
    const r = parseConveneFile(file);
    expect(r).toEqual({
      ok: true,
      source: "wuwatracker",
      playerId: PLAYER,
      pools: {
        "1": [
          { time: "2026-10-01 12:00:00", resourceId: 1606, qualityLevel: 5, name: "Chisa" },
          { time: "2026-10-01 12:00:00", resourceId: 0, qualityLevel: 3, name: "Sword of Night" },
          { time: "2026-10-02 08:00:00", resourceId: 1608, qualityLevel: 4, name: "Youhu" },
        ],
      },
    });
    expect(parseConveneFile("nope")).toEqual({ ok: false, error: "not-json" });
    expect(parseConveneFile("{}")).toEqual({ ok: false, error: "unknown-format" });
  });

  it("our own backup round-trips and merges back without duplicates", () => {
    const { history } = mergeIntoHistory(emptyConveneHistory(), PLAYER, "global", { "1": apiRecordsToHistory(batchApiFixture()) }, "api", 1);
    const text = exportConveneBackup(history, PLAYER, 0)!;
    expect(text).not.toContain(RECORD);
    const file = parseConveneFile(text);
    expect(file.ok).toBe(true);
    if (!file.ok) return;
    const again = mergeIntoHistory(history, file.playerId, null, file.pools, file.source, 2);
    expect(again.summary.added).toBe(0);
    expect(again.history.players[PLAYER]!.pools["1"]).toEqual(history.players[PLAYER]!.pools["1"]);
    expect(exportConveneBackup(history, "123456789")).toBeNull();
  });

  it("masks a player id for display", () => {
    expect(maskPlayerId(PLAYER)).toBe("900****456");
    expect(maskPlayerId("123")).toBe("***");
  });
});
