// Wuthering Tools+ — Convene (gacha) history import: the record link, the PC log that holds it, Kuro's record API,
// and the merged local history that outlives the game's six-month window.
//
// Every request detail below was checked (2026-10-12) against public importers before use:
//   - wuwatracker/wuwatracker import.ps1 / import.sh (GPL-3.0): the link regex, "take the last link in the log", the
//     Client.log XOR (odd byte ^ 0xA5, even byte ^ 0xEF), the KRSDK debug.log fallback
//     https://github.com/wuwatracker/wuwatracker/blob/main/import.ps1
//   - juliy819/wuwa-gacha-tool src-tauri/src/gacha/fetcher.rs: the request body (playerId, recordId, cardPoolId =
//     resources_id, serverId = svr_id, languageCode = lang, cardPoolType), CN `.com` vs global `.net`, code -1 =
//     expired link, parameters read from the `#/record?` fragment with the top-level query as a fallback
//     https://github.com/juliy819/wuwa-gacha-tool/blob/HEAD/src-tauri/src/gacha/fetcher.rs
//   - GoneTone/wuthering-waves-convene-gacha-analyzer lib/services/gacha_fetcher.dart + record_merge.dart: one POST per
//     pool returns that pool's whole kept history newest first, no pagination; a 10-pull shares one timestamp; a
//     WuWa Tracker export carries UTC instants and the API the CST (UTC+8) wall clock on every server
//     https://github.com/GoneTone/wuthering-waves-convene-gacha-analyzer/blob/HEAD/lib/services/record_merge.dart
//   - lyndon0na/wuwa-gacha-export wuwa_gacha.py: the same body, the same XOR
//     https://github.com/lyndon0na/wuwa-gacha-export/blob/HEAD/wuwa_gacha.py
//   - CORS: the API's preflight answers `access-control-allow-origin: *`, POST, `content-type` (probed without ids,
//     2026-10-12), so the browser calls Kuro directly — no proxy.
//
// SECURITY (read before touching): the record link and its ids are a bearer token for the player's history. Never
// put them in the app's route, hash or query string (vercel.json forwards page views to analytics), never log them,
// never persist the token. Only the player id (the UID shown in game) is stored, to keep accounts apart. Error
// messages here never echo the input.
//
// Persisted data: localStorage `wtplus:convene:history`, schema-versioned. Imports MERGE, never replace: an expired
// or bogus token returns `code: 0, data: []`, so an empty answer proves nothing and deletes nothing.
// Pure module (no Vue, no Pinia); storage and fetch are injected so tests and the CLI can drive it.
import { CONVENE_POOL_TYPES, poolOf } from "./pools";

// ── the record link ────────────────────────────────────────────────────────────────────────────────────────────

export type ConveneRegion = "global" | "cn";

export interface ConveneQuery {
  playerId: string;
  /** the short-lived token (about an hour); held in memory only */
  recordId: string;
  /** `svr_id` — Kuro's server hash */
  serverId: string;
  /** `resources_id` — the pool-resource version, shared by every pool type ("" when the link had none) */
  cardPoolId: string;
  /** the link's `lang`; requests use REQUEST_LANGUAGE so names match the app's English keys */
  languageCode: string;
  region: ConveneRegion;
}

export type ConveneLinkError = "no-link" | "missing-player" | "missing-record" | "missing-server" | "bad-value";

export const CONVENE_LINK_ERRORS: Record<ConveneLinkError, string> = {
  "no-link": "That doesn't look like a Convene History link. Open Convene › History in game, then copy the link (or load Client.log).",
  "missing-player": "The link has no player id. Copy the whole link from Convene History.",
  "missing-record": "The link has no record id. Copy the whole link from Convene History.",
  "missing-server": "The link has no server id. Copy the whole link from Convene History.",
  "bad-value": "The link contains unexpected characters. Copy it again from Convene History.",
};

export type ParsedLink = { ok: true; query: ConveneQuery } | { ok: false; error: ConveneLinkError };

/**
 * wuwatracker's pattern, widened: a cloud-gaming link carries a query before the `#` (juliy819's
 * `parses_cloud_query_and_hash_url_with_hash_precedence`), and the match stops at quotes / angle brackets;
 * backslash escapes are cleaned after the match.
 */
const LINK_RE = /https:\/\/aki-gm-resources(?:-oversea)?\.aki-game\.(?:net|com)\/aki\/gacha\/index\.html(?:\?[^#\s"'<>]*)?#\/record[^\s"'<>]*/gi;
const HOST_RE = /^aki-gm-resources(-oversea)?\.aki-game\.(net|com)$/i;

const PLAYER_ID_RE = /^\d{5,12}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{1,128}$/;

function cleanLink(raw: string): string {
  let s = raw.replace(/\\u0026/gi, "&").replace(/\\\//g, "/").replace(/&amp;/gi, "&");
  const slash = s.indexOf("\\");
  if (slash >= 0) s = s.slice(0, slash);
  return s.replace(/[),.;]+$/, "");
}

/** every Convene record link in a block of text, oldest first (the log appends, so the last one is the newest) */
export function findConveneLinks(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(LINK_RE)) out.push(cleanLink(m[0]));
  // a JSON log may escape the slashes too ("https:\/\/aki-gm-resources…")
  if (!out.length && text.includes("\\/")) for (const m of text.replace(/\\\//g, "/").matchAll(LINK_RE)) out.push(cleanLink(m[0]));
  return out;
}

function regionOf(host: string | null, svrArea: string, playerId: string): ConveneRegion {
  if (host) {
    const m = HOST_RE.exec(host);
    if (m?.[1]) return "global";
    const area = svrArea.toLowerCase();
    if (area === "cn") return "cn";
    if (area === "global") return "global";
    if (m) return m[2]!.toLowerCase() === "net" ? "global" : "cn";
  }
  const area = svrArea.toLowerCase();
  if (area === "cn") return "cn";
  if (area === "global") return "global";
  // juliy819's rule for a link without a host: CN player ids start with 1
  return playerId.startsWith("1") ? "cn" : "global";
}

/**
 * Parse a pasted Convene History link (any of the four host variants), a bare `player_id=…&record_id=…` query, or
 * text with a link somewhere inside it (the last link wins). Parameters live after `#/record?`; a cloud-gaming link
 * repeats them in the top-level query — the fragment wins.
 */
export function parseConveneLink(input: string): ParsedLink {
  const text = (input ?? "").trim();
  if (!text) return { ok: false, error: "no-link" };
  const links = findConveneLinks(text);
  const params = new Map<string, string>();
  let host: string | null = null;
  const take = (search: string) => {
    for (const [k, v] of new URLSearchParams(search)) params.set(k.toLowerCase(), v.trim());
  };
  if (links.length) {
    let url: URL;
    try {
      url = new URL(links[links.length - 1]!);
    } catch {
      return { ok: false, error: "no-link" };
    }
    host = url.hostname;
    take(url.search);
    const q = url.hash.indexOf("?");
    if (q >= 0) take(url.hash.slice(q + 1));
  } else if (/(^|[?&#\s])player_id=/i.test(text)) {
    const start = text.search(/[A-Za-z_]+=/);
    take(text.slice(start).split(/\s/)[0]!.replace(/^[?#&]+/, ""));
  } else {
    return { ok: false, error: "no-link" };
  }
  return buildQuery(
    {
      playerId: params.get("player_id") ?? "",
      recordId: params.get("record_id") ?? "",
      serverId: params.get("svr_id") ?? "",
      cardPoolId: params.get("resources_id") ?? "",
      languageCode: params.get("lang") ?? "",
    },
    host,
    params.get("svr_area") ?? "",
  );
}

export interface ManualConveneInput {
  playerId: string;
  recordId: string;
  serverId: string;
  cardPoolId?: string;
  region?: ConveneRegion;
}

/** the console path (PS5 / Xbox): the ids typed in by hand */
export function manualConveneQuery(input: ManualConveneInput): ParsedLink {
  const parsed = buildQuery(
    {
      playerId: input.playerId?.trim() ?? "",
      recordId: input.recordId?.trim() ?? "",
      serverId: input.serverId?.trim() ?? "",
      cardPoolId: input.cardPoolId?.trim() ?? "",
      languageCode: "",
    },
    null,
    input.region ?? "",
  );
  return parsed;
}

function buildQuery(
  raw: { playerId: string; recordId: string; serverId: string; cardPoolId: string; languageCode: string },
  host: string | null,
  svrArea: string,
): ParsedLink {
  if (!raw.playerId) return { ok: false, error: "missing-player" };
  if (!raw.recordId) return { ok: false, error: "missing-record" };
  if (!raw.serverId) return { ok: false, error: "missing-server" };
  if (!PLAYER_ID_RE.test(raw.playerId)) return { ok: false, error: "bad-value" };
  if (!TOKEN_RE.test(raw.recordId) || !TOKEN_RE.test(raw.serverId)) return { ok: false, error: "bad-value" };
  if (raw.cardPoolId && !TOKEN_RE.test(raw.cardPoolId)) return { ok: false, error: "bad-value" };
  const lang = /^[A-Za-z-]{2,10}$/.test(raw.languageCode) ? raw.languageCode : "";
  return {
    ok: true,
    query: {
      playerId: raw.playerId,
      recordId: raw.recordId,
      serverId: raw.serverId,
      cardPoolId: raw.cardPoolId,
      languageCode: lang,
      region: regionOf(host, svrArea, raw.playerId),
    },
  };
}

// ── the PC log ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Kuro obfuscates `Client\Saved\Logs\Client.log` byte by byte: an odd byte was XORed with 0xA5, an even one with
 * 0xEF (both keys are odd, so the low bit tells the two apart). Same transform as wuwatracker's
 * `ClientLogXorDecoderV1` and lyndon0na's `decrypt`.
 */
export function decodeClientLogBytes(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    out[i] = b ^ (b & 1 ? 0xa5 : 0xef);
  }
  return out;
}

function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function latin1Bytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

/**
 * The newest Convene record link in a PC log: `Client.log` (plain, or the XOR-obfuscated build) or the KRSDK
 * `debug.log`. Takes the file's bytes (best) or pasted text. Returns null when no link is in it — the player has to
 * open Convene › History in game first so the client writes one.
 */
export function extractConveneLinkFromLog(input: string | Uint8Array | ArrayBuffer): string | null {
  let plain: string;
  let bytes: Uint8Array | null = null;
  if (typeof input === "string") {
    plain = input;
  } else {
    bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    plain = bytesToText(bytes);
  }
  let links = findConveneLinks(plain);
  if (!links.length) {
    const decoded = decodeClientLogBytes(bytes ?? latin1Bytes(plain));
    links = findConveneLinks(bytesToText(decoded));
  }
  return links.length ? links[links.length - 1]! : null;
}

// ── Kuro's record API ──────────────────────────────────────────────────────────────────────────────────────────

export const GACHA_RECORD_ENDPOINTS: Record<ConveneRegion, string> = {
  global: "https://gmserver-api.aki-game2.net/gacha/record/query",
  cn: "https://gmserver-api.aki-game2.com/gacha/record/query",
};

/** names come back in the request's language; the app's keys are English */
export const REQUEST_LANGUAGE = "en";

/** one record as the API returns it (`cardPoolType` there is the pool's display name, not its number) */
export interface ApiConveneRecord {
  cardPoolType: string;
  resourceId: number;
  qualityLevel: number;
  resourceType: string;
  name: string;
  count: number;
  time: string;
}

/**
 * expired: code -1 (juliy819's `format_api_error`); bad-server: code -4, "当前serverId查询不到区服信息" — Kuro knows no
 * server by that `svr_id` (probed with made-up ids, 2026-10-12); api: any other non-zero code.
 */
export type PoolFetchError = "expired" | "bad-server" | "api" | "http" | "network" | "format" | "aborted" | "skipped";

export type PoolFetchOutcome =
  | { poolType: number; ok: true; records: ApiConveneRecord[] }
  | { poolType: number; ok: false; error: PoolFetchError; code?: number };

export interface FetchDeps {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

const TIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

function isApiRecord(r: unknown): r is ApiConveneRecord {
  if (!r || typeof r !== "object") return false;
  const o = r as Record<string, unknown>;
  return (
    typeof o.time === "string" &&
    TIME_RE.test(o.time) &&
    typeof o.name === "string" &&
    typeof o.qualityLevel === "number" &&
    o.qualityLevel >= 1 &&
    o.qualityLevel <= 5 &&
    (typeof o.resourceId === "number" || o.resourceId == null)
  );
}

/** the POST body for one pool — exactly the six fields the game's own history page sends */
export function recordRequestBody(query: ConveneQuery, poolType: number): Record<string, string | number> {
  return {
    playerId: query.playerId,
    cardPoolId: query.cardPoolId,
    cardPoolType: poolType,
    languageCode: REQUEST_LANGUAGE,
    recordId: query.recordId,
    serverId: query.serverId,
  };
}

/** one pool's whole kept history (newest first, as the API sends it) */
export async function fetchConvenePool(query: ConveneQuery, poolType: number, deps: FetchDeps = {}): Promise<PoolFetchOutcome> {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch.bind(globalThis);
  let res: Response;
  try {
    res = await fetchImpl(GACHA_RECORD_ENDPOINTS[query.region], {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(recordRequestBody(query, poolType)),
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      signal: deps.signal,
    });
  } catch (e) {
    const aborted = deps.signal?.aborted || (e instanceof Error && e.name === "AbortError");
    return { poolType, ok: false, error: aborted ? "aborted" : "network" };
  }
  if (!res.ok) return { poolType, ok: false, error: "http", code: res.status };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { poolType, ok: false, error: "format" };
  }
  const o = (body ?? {}) as { code?: unknown; data?: unknown };
  const code = typeof o.code === "number" ? o.code : Number(o.code);
  if (code !== 0)
    return { poolType, ok: false, error: code === -1 ? "expired" : code === -4 ? "bad-server" : "api", code: Number.isFinite(code) ? code : undefined };
  const data = o.data ?? [];
  if (!Array.isArray(data) || !data.every(isApiRecord)) return { poolType, ok: false, error: "format" };
  return {
    poolType,
    ok: true,
    records: data.map((r) => ({
      cardPoolType: String(r.cardPoolType ?? ""),
      resourceId: typeof r.resourceId === "number" ? r.resourceId : 0,
      qualityLevel: r.qualityLevel,
      resourceType: String(r.resourceType ?? ""),
      name: r.name,
      count: typeof r.count === "number" ? r.count : 1,
      time: r.time,
    })),
  };
}

export interface FetchHistoryOptions extends FetchDeps {
  poolTypes?: readonly number[];
  /** pause between pools, ms (GoneTone waits 600 ms; Kuro rate-limits bursts) */
  delayMs?: number;
  onProgress?: (done: number, total: number, poolType: number) => void;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

/** every pool, one request at a time; stops asking once the link reads as expired or the server id as unknown */
export async function fetchConveneHistory(query: ConveneQuery, opts: FetchHistoryOptions = {}): Promise<PoolFetchOutcome[]> {
  const pools = opts.poolTypes ?? CONVENE_POOL_TYPES;
  const delayMs = opts.delayMs ?? 350;
  const out: PoolFetchOutcome[] = [];
  let stop: PoolFetchError | null = null;
  for (let i = 0; i < pools.length; i++) {
    const poolType = pools[i]!;
    if (stop || opts.signal?.aborted) {
      out.push({ poolType, ok: false, error: opts.signal?.aborted ? "aborted" : "skipped" });
      continue;
    }
    if (i > 0) await sleep(delayMs, opts.signal);
    const outcome = await fetchConvenePool(query, poolType, opts);
    out.push(outcome);
    if (!outcome.ok && (outcome.error === "expired" || outcome.error === "bad-server" || outcome.error === "aborted")) stop = outcome.error;
    opts.onProgress?.(i + 1, pools.length, poolType);
  }
  return out;
}

// ── the stored history ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * One pull. A pool's records are kept OLDEST FIRST; records sharing a `time` are one multi-pull, in the order they
 * were pulled (the API lists newest first, inside a 10-pull too — every importer above reverses the whole list).
 */
export interface ConveneRecord {
  /** server wall clock "YYYY-MM-DD HH:mm:ss" (CST, UTC+8, on every server) */
  time: string;
  /** Kuro's item id (0 when unknown, e.g. an old third-party export) */
  resourceId: number;
  qualityLevel: number;
  name: string;
}

export interface ImportLogEntry {
  at: number;
  source: "api" | "wuwatracker" | "backup";
  added: number;
}

export interface PlayerHistory {
  playerId: string;
  region: ConveneRegion | null;
  /** keyed by pool type ("1".."13") */
  pools: Record<string, ConveneRecord[]>;
  updatedAt: number | null;
  imports: ImportLogEntry[];
}

export interface ConveneHistory {
  version: typeof CONVENE_HISTORY_VERSION;
  activePlayerId: string | null;
  players: Record<string, PlayerHistory>;
}

export const CONVENE_HISTORY_KEY = "wtplus:convene:history";
export const CONVENE_HISTORY_VERSION = 1;
const MAX_IMPORT_LOG = 30;

/** the bit of the Web Storage API this module uses (tests pass a Map-backed one) */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** on disk a record is a tuple — a few thousand pulls stay well under the localStorage budget */
type StoredRecord = [time: string, resourceId: number, qualityLevel: number, name: string];
interface StoredPlayer {
  region: ConveneRegion | null;
  updatedAt: number | null;
  pools: Record<string, StoredRecord[]>;
  imports: ImportLogEntry[];
}
interface StoredHistory {
  v: number;
  active: string | null;
  players: Record<string, StoredPlayer>;
}

export function emptyConveneHistory(): ConveneHistory {
  return { version: CONVENE_HISTORY_VERSION, activePlayerId: null, players: {} };
}

export function emptyPlayerHistory(playerId: string, region: ConveneRegion | null = null): PlayerHistory {
  return { playerId, region, pools: {}, updatedAt: null, imports: [] };
}

export type ReadHistoryResult =
  | { ok: true; history: ConveneHistory }
  | { ok: false; reason: "corrupt" | "newer-version" | "unavailable" };

function isStoredRecord(r: unknown): r is StoredRecord {
  return (
    Array.isArray(r) &&
    typeof r[0] === "string" &&
    TIME_RE.test(r[0]) &&
    typeof r[1] === "number" &&
    typeof r[2] === "number" &&
    typeof r[3] === "string"
  );
}

/** decode the stored JSON; anything it does not recognise is refused, never "repaired" into an empty history */
export function decodeConveneHistory(raw: string | null): ReadHistoryResult {
  if (raw == null || raw === "") return { ok: true, history: emptyConveneHistory() };
  let parsed: StoredHistory;
  try {
    parsed = JSON.parse(raw) as StoredHistory;
  } catch {
    return { ok: false, reason: "corrupt" };
  }
  if (!parsed || typeof parsed !== "object" || typeof parsed.v !== "number") return { ok: false, reason: "corrupt" };
  if (parsed.v > CONVENE_HISTORY_VERSION) return { ok: false, reason: "newer-version" };
  if (parsed.v !== 1 || !parsed.players || typeof parsed.players !== "object") return { ok: false, reason: "corrupt" };
  const history = emptyConveneHistory();
  history.activePlayerId = typeof parsed.active === "string" ? parsed.active : null;
  for (const [playerId, p] of Object.entries(parsed.players)) {
    if (!p || typeof p !== "object" || !p.pools || typeof p.pools !== "object") return { ok: false, reason: "corrupt" };
    const player = emptyPlayerHistory(playerId, p.region === "cn" || p.region === "global" ? p.region : null);
    player.updatedAt = typeof p.updatedAt === "number" ? p.updatedAt : null;
    player.imports = Array.isArray(p.imports) ? p.imports.filter((e) => e && typeof e.at === "number") : [];
    for (const [pool, rows] of Object.entries(p.pools)) {
      if (!Array.isArray(rows) || !rows.every(isStoredRecord)) return { ok: false, reason: "corrupt" };
      player.pools[pool] = rows.map(([time, resourceId, qualityLevel, name]) => ({ time, resourceId, qualityLevel, name }));
    }
    history.players[playerId] = player;
  }
  return { ok: true, history };
}

export function encodeConveneHistory(history: ConveneHistory): string {
  const stored: StoredHistory = { v: CONVENE_HISTORY_VERSION, active: history.activePlayerId, players: {} };
  for (const [playerId, p] of Object.entries(history.players)) {
    const pools: Record<string, StoredRecord[]> = {};
    for (const [pool, rows] of Object.entries(p.pools)) {
      if (rows.length) pools[pool] = rows.map((r) => [r.time, r.resourceId, r.qualityLevel, r.name]);
    }
    stored.players[playerId] = { region: p.region, updatedAt: p.updatedAt, pools, imports: p.imports.slice(-MAX_IMPORT_LOG) };
  }
  return JSON.stringify(stored);
}

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readConveneHistory(storage: KeyValueStorage | null = defaultStorage()): ReadHistoryResult {
  if (!storage) return { ok: false, reason: "unavailable" };
  let raw: string | null;
  try {
    raw = storage.getItem(CONVENE_HISTORY_KEY);
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  return decodeConveneHistory(raw);
}

/** false when the browser refused the write (quota, private mode) — the caller keeps the in-memory copy */
export function writeConveneHistory(history: ConveneHistory, storage: KeyValueStorage | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(CONVENE_HISTORY_KEY, encodeConveneHistory(history));
    return true;
  } catch {
    return false;
  }
}

// ── merge ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** the API's newest-first list → oldest-first records */
export function apiRecordsToHistory(records: readonly ApiConveneRecord[]): ConveneRecord[] {
  const out: ConveneRecord[] = [];
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i]!;
    out.push({ time: r.time, resourceId: r.resourceId > 0 ? r.resourceId : 0, qualityLevel: r.qualityLevel, name: r.name });
  }
  return sortChronological(out);
}

/** stable sort by time; a batch keeps its internal order */
function sortChronological(records: ConveneRecord[]): ConveneRecord[] {
  return records
    .map((r, i) => [r, i] as const)
    .sort((a, b) => (a[0].time < b[0].time ? -1 : a[0].time > b[0].time ? 1 : a[1] - b[1]))
    .map(([r]) => r);
}

function normName(name: string): string {
  return name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** the same pull? (both ids known → the id decides; else the name; the quality must agree either way) */
function samePull(a: ConveneRecord, b: ConveneRecord): boolean {
  if (a.qualityLevel !== b.qualityLevel) return false;
  if (a.resourceId > 0 && b.resourceId > 0) return a.resourceId === b.resourceId;
  return normName(a.name) === normName(b.name);
}

function groupByTime(records: readonly ConveneRecord[]): Map<string, ConveneRecord[]> {
  const m = new Map<string, ConveneRecord[]>();
  for (const r of records) {
    const g = m.get(r.time);
    if (g) g.push(r);
    else m.set(r.time, [r]);
  }
  return m;
}

export interface PoolMerge {
  records: ConveneRecord[];
  /** records the result holds that `stored` did not */
  added: number;
}

/**
 * Merge a fresh pull list into the stored one. Never drops a stored record. Pulls are matched per timestamp batch
 * (pool + time + item + position among the batch's identical items): a batch only one side has is taken whole; a
 * batch both have keeps the larger copy (the stored one on a tie) and gains any pull the other copy has beyond it.
 */
export function mergePoolRecords(stored: readonly ConveneRecord[], fresh: readonly ConveneRecord[]): PoolMerge {
  if (!fresh.length) return { records: stored.slice(), added: 0 };
  if (!stored.length) return { records: sortChronological(fresh.slice()), added: fresh.length };
  const a = groupByTime(stored);
  const b = groupByTime(fresh);
  const times = [...new Set([...a.keys(), ...b.keys()])].sort();
  const out: ConveneRecord[] = [];
  let added = 0;
  for (const t of times) {
    const s = a.get(t) ?? [];
    const f = b.get(t) ?? [];
    if (!f.length) {
      out.push(...s);
      continue;
    }
    if (!s.length) {
      out.push(...f);
      added += f.length;
      continue;
    }
    const [primary, other] = s.length >= f.length ? [s, f] : [f, s];
    const batch = primary.slice();
    const used = new Array<boolean>(primary.length).fill(false);
    for (const r of other) {
      const hit = primary.findIndex((p, i) => !used[i] && samePull(p, r));
      if (hit >= 0) used[hit] = true;
      else batch.push(r);
    }
    out.push(...batch);
    added += batch.length - s.length;
  }
  return { records: out, added };
}

export interface PoolImportSummary {
  poolType: number;
  /** records the API (or file) returned for this pool */
  received: number;
  added: number;
  total: number;
  error?: PoolFetchError;
}

export interface ImportSummary {
  playerId: string;
  source: ImportLogEntry["source"];
  added: number;
  total: number;
  pools: PoolImportSummary[];
  /** the link read as expired (code -1) */
  expired: boolean;
  /** some pools failed for another reason (network, format…) — what did come back is merged */
  failed: number;
}

/** merge oldest-first pools into one player's history (returns a new history; the input is not mutated) */
export function mergeIntoHistory(
  history: ConveneHistory,
  playerId: string,
  region: ConveneRegion | null,
  pools: Record<string, ConveneRecord[]>,
  source: ImportLogEntry["source"],
  at: number,
  errors: Record<string, PoolFetchError> = {},
): { history: ConveneHistory; summary: ImportSummary } {
  const prev = history.players[playerId] ?? emptyPlayerHistory(playerId, region);
  const player: PlayerHistory = { ...prev, region: region ?? prev.region, pools: { ...prev.pools }, imports: prev.imports.slice() };
  const summary: ImportSummary = { playerId, source, added: 0, total: 0, pools: [], expired: false, failed: 0 };
  const poolKeys = [...new Set([...Object.keys(pools), ...Object.keys(errors)])].sort((x, y) => Number(x) - Number(y));
  for (const key of poolKeys) {
    const fresh = pools[key] ?? [];
    const merged = mergePoolRecords(player.pools[key] ?? [], fresh);
    if (merged.records.length) player.pools[key] = merged.records;
    summary.added += merged.added;
    const error = errors[key];
    if (error === "expired") summary.expired = true;
    else if (error && error !== "skipped") summary.failed++;
    summary.pools.push({ poolType: Number(key), received: fresh.length, added: merged.added, total: merged.records.length, ...(error ? { error } : {}) });
  }
  summary.total = Object.values(player.pools).reduce((n, rows) => n + rows.length, 0);
  if (!summary.expired || summary.added > 0) {
    player.updatedAt = at;
    player.imports.push({ at, source, added: summary.added });
    if (player.imports.length > MAX_IMPORT_LOG) player.imports.splice(0, player.imports.length - MAX_IMPORT_LOG);
  }
  return {
    history: { ...history, activePlayerId: playerId, players: { ...history.players, [playerId]: player } },
    summary,
  };
}

/** turn fetch outcomes into a merge (successful pools merged, failed ones reported) */
export function mergeFetchedPools(
  history: ConveneHistory,
  query: Pick<ConveneQuery, "playerId" | "region">,
  outcomes: readonly PoolFetchOutcome[],
  at: number,
): { history: ConveneHistory; summary: ImportSummary } {
  const pools: Record<string, ConveneRecord[]> = {};
  const errors: Record<string, PoolFetchError> = {};
  for (const o of outcomes) {
    if (o.ok) pools[String(o.poolType)] = apiRecordsToHistory(o.records);
    else errors[String(o.poolType)] = o.error;
  }
  return mergeIntoHistory(history, query.playerId, query.region, pools, "api", at, errors);
}

export type ImportFailure = "corrupt" | "newer-version" | "unavailable" | "expired" | "bad-server" | "aborted" | "failed";

export type ImportResult =
  | { ok: true; history: ConveneHistory; summary: ImportSummary; saved: boolean }
  | { ok: false; reason: ImportFailure; summary?: ImportSummary };

/** user-facing lines for each failure (none of them echo the link) */
export const CONVENE_IMPORT_ERRORS: Record<ImportFailure, string> = {
  corrupt: "Your saved Convene history couldn't be read, so nothing was changed. Export a backup before resetting it.",
  "newer-version": "Your saved Convene history was written by a newer version of the app. Reload the page to update.",
  unavailable: "This browser won't let the app save data (private mode or storage turned off).",
  expired: "That Convene link has expired. Open Convene › History in game again and copy a fresh link.",
  "bad-server": "Kuro doesn't recognise the server in that link. Copy the whole link again from Convene › History.",
  aborted: "Import cancelled.",
  failed: "Couldn't reach Kuro's Convene records. Check your connection and try again.",
};

export interface ImportOptions extends FetchHistoryOptions {
  storage?: KeyValueStorage | null;
  now?: () => number;
}

/**
 * The whole import: read the stored history (refuse to touch one this build can't read), ask Kuro for every pool,
 * merge, save. An expired link adds nothing and changes nothing.
 */
export async function importConveneHistory(query: ConveneQuery, opts: ImportOptions = {}): Promise<ImportResult> {
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
  const before = readConveneHistory(storage);
  if (!before.ok) return { ok: false, reason: before.reason };
  const outcomes = await fetchConveneHistory(query, opts);
  if (outcomes.some((o) => !o.ok && o.error === "aborted")) return { ok: false, reason: "aborted" };
  // re-read after the (slow) fetch: another tab may have imported meanwhile — merge onto the newest copy
  const latest = readConveneHistory(storage);
  if (!latest.ok) return { ok: false, reason: latest.reason };
  const { history, summary } = mergeFetchedPools(latest.history, query, outcomes, (opts.now ?? Date.now)());
  if (summary.expired && summary.added === 0) return { ok: false, reason: "expired", summary };
  if (outcomes.some((o) => !o.ok && o.error === "bad-server") && summary.added === 0) return { ok: false, reason: "bad-server", summary };
  if (outcomes.every((o) => !o.ok)) return { ok: false, reason: "failed", summary };
  const saved = writeConveneHistory(history, storage);
  return { ok: true, history, summary, saved };
}

// ── files: WuWa Tracker exports and our own backups ────────────────────────────────────────────────────────────

export type FileImport =
  | { ok: true; playerId: string; pools: Record<string, ConveneRecord[]>; source: "wuwatracker" | "backup" }
  | { ok: false; error: "not-json" | "unknown-format" };

const RECORD_TIME_OFFSET_MS = 8 * 3600_000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** a UTC instant (WuWa Tracker's `time`) → the API's CST wall clock */
export function utcIsoToRecordTime(iso: string): string | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms + RECORD_TIME_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/**
 * A `wuwatracker-pulls` export: `{ playerId, pulls: [{ cardPoolType, resourceId?, qualityLevel, name, time }] }`,
 * times as UTC instants, pulls listed newest first (GoneTone's importer documents the shape:
 * lib/services/importers/wuwa_tracker_importer.dart). Also reads this module's own backup format.
 */
export function parseConveneFile(text: string): FileImport {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "not-json" };
  }
  if (!raw || typeof raw !== "object") return { ok: false, error: "unknown-format" };
  const o = raw as Record<string, unknown>;
  if (o.format === BACKUP_FORMAT) return parseBackup(o);
  const playerId = typeof o.playerId === "string" ? o.playerId : typeof o.playerId === "number" ? String(o.playerId) : "";
  if (!PLAYER_ID_RE.test(playerId) || !Array.isArray(o.pulls)) return { ok: false, error: "unknown-format" };
  const newestFirst: Record<string, ConveneRecord[]> = {};
  for (const p of o.pulls as unknown[]) {
    if (!p || typeof p !== "object") return { ok: false, error: "unknown-format" };
    const e = p as Record<string, unknown>;
    const poolType = Number(e.cardPoolType);
    const time = typeof e.time === "string" ? utcIsoToRecordTime(e.time) : null;
    if (!poolOf(poolType) || !time || typeof e.name !== "string" || typeof e.qualityLevel !== "number") continue;
    (newestFirst[String(poolType)] ??= []).push({
      time,
      resourceId: typeof e.resourceId === "number" && e.resourceId > 0 ? e.resourceId : 0,
      qualityLevel: e.qualityLevel,
      name: e.name,
    });
  }
  const pools: Record<string, ConveneRecord[]> = {};
  for (const [k, rows] of Object.entries(newestFirst)) pools[k] = sortChronological(rows.reverse());
  return { ok: true, playerId, pools, source: "wuwatracker" };
}

export const BACKUP_FORMAT = "wtplus-convene-history";

/** a portable backup of one player's history (merge it back with parseConveneFile + mergeIntoHistory) */
export function exportConveneBackup(history: ConveneHistory, playerId: string, at: number = Date.now()): string | null {
  const p = history.players[playerId];
  if (!p) return null;
  const pools: Record<string, StoredRecord[]> = {};
  for (const [k, rows] of Object.entries(p.pools)) pools[k] = rows.map((r) => [r.time, r.resourceId, r.qualityLevel, r.name]);
  return JSON.stringify({ format: BACKUP_FORMAT, v: CONVENE_HISTORY_VERSION, exportedAt: new Date(at).toISOString(), playerId, pools });
}

function parseBackup(o: Record<string, unknown>): FileImport {
  const playerId = typeof o.playerId === "string" ? o.playerId : "";
  if (!PLAYER_ID_RE.test(playerId) || typeof o.v !== "number" || o.v > CONVENE_HISTORY_VERSION || !o.pools || typeof o.pools !== "object")
    return { ok: false, error: "unknown-format" };
  const pools: Record<string, ConveneRecord[]> = {};
  for (const [k, rows] of Object.entries(o.pools as Record<string, unknown>)) {
    if (!poolOf(Number(k)) || !Array.isArray(rows) || !rows.every(isStoredRecord)) return { ok: false, error: "unknown-format" };
    pools[k] = (rows as StoredRecord[]).map(([time, resourceId, qualityLevel, name]) => ({ time, resourceId, qualityLevel, name }));
  }
  return { ok: true, playerId, pools, source: "backup" };
}

export type FileImportResult =
  | { ok: true; history: ConveneHistory; summary: ImportSummary; saved: boolean }
  | { ok: false; reason: "corrupt" | "newer-version" | "unavailable" | "not-json" | "unknown-format" };

export const CONVENE_FILE_ERRORS: Record<"not-json" | "unknown-format", string> = {
  "not-json": "That file isn't JSON. Choose a WuWa Tracker export or a Wuthering Tools+ Convene backup.",
  "unknown-format": "That file isn't a WuWa Tracker export or a Wuthering Tools+ Convene backup.",
};

/** merge a WuWa Tracker export or one of our backups into the stored history (same refusal rules as the API import) */
export function importConveneFile(text: string, opts: { storage?: KeyValueStorage | null; now?: () => number } = {}): FileImportResult {
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
  const before = readConveneHistory(storage);
  if (!before.ok) return { ok: false, reason: before.reason };
  const parsed = parseConveneFile(text);
  if (!parsed.ok) return { ok: false, reason: parsed.error };
  const { history, summary } = mergeIntoHistory(before.history, parsed.playerId, null, parsed.pools, parsed.source, (opts.now ?? Date.now)());
  return { ok: true, history, summary, saved: writeConveneHistory(history, storage) };
}

export type HistoryEditResult = { ok: true; history: ConveneHistory; saved: boolean } | { ok: false; reason: "corrupt" | "newer-version" | "unavailable" };

/**
 * Forget one player's history (the user asked to). A history this build can't read is left alone — the caller offers
 * `resetConveneHistory` for that, after the user has had the chance to keep a copy.
 */
export function deleteConvenePlayer(playerId: string, opts: { storage?: KeyValueStorage | null } = {}): HistoryEditResult {
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
  const before = readConveneHistory(storage);
  if (!before.ok) return { ok: false, reason: before.reason };
  const players = { ...before.history.players };
  delete players[playerId];
  const rest = Object.keys(players);
  const activePlayerId = before.history.activePlayerId === playerId || !before.history.activePlayerId ? (rest[0] ?? null) : before.history.activePlayerId;
  const history: ConveneHistory = { ...before.history, activePlayerId, players };
  return { ok: true, history, saved: writeConveneHistory(history, storage) };
}

/** which stored player the page shows */
export function setActiveConvenePlayer(playerId: string, opts: { storage?: KeyValueStorage | null } = {}): HistoryEditResult {
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
  const before = readConveneHistory(storage);
  if (!before.ok) return { ok: false, reason: before.reason };
  if (!before.history.players[playerId]) return { ok: true, history: before.history, saved: true };
  const history: ConveneHistory = { ...before.history, activePlayerId: playerId };
  return { ok: true, history, saved: writeConveneHistory(history, storage) };
}

/** the raw stored text (to let the user save an unreadable history before resetting it) */
export function rawConveneHistory(storage: KeyValueStorage | null = defaultStorage()): string | null {
  try {
    return storage?.getItem(CONVENE_HISTORY_KEY) ?? null;
  } catch {
    return null;
  }
}

/** replace an unreadable stored history with an empty one — only on an explicit user action */
export function resetConveneHistory(storage: KeyValueStorage | null = defaultStorage()): boolean {
  return writeConveneHistory(emptyConveneHistory(), storage);
}

/** mask a player id for display ("801****456") — never show or log the full id next to a token */
export function maskPlayerId(playerId: string): string {
  if (playerId.length < 6) return "***";
  return `${playerId.slice(0, 3)}****${playerId.slice(-3)}`;
}
