// Wuthering Tools+ build history — versions of each character's build over time, in this browser. Store-free: the
// character record and the inventory in, versions out. A version is the share cards' own format (buildCodec.ts
// `buildPayload`, detail "full"): one member with every build field and the five echoes inlined, so a version still
// says exactly what the build was after the echoes it pointed at were re-imported under new ids or deleted.
//
// Storage: one localStorage key per character (`wtplus:buildHistory:v1:<id>`), newest first, at most
// MAX_PER_CHARACTER versions (the oldest drops off), and all characters together at most MAX_TOTAL_CHARS characters
// of JSON (the oldest version of the character with the most versions drops off first). A new version identical to
// the newest one is not stored again. When the browser refuses to store (quota, private mode) the history lives in
// this page's memory and the caller is told.
import { cyrb53, stableStringify } from "../myRankings/rankingCache";
import { buildPayload, parseSharePayload, type ShareMember, type SharePayload } from "../share/buildCodec";
import { randomString } from "../../utils/strings";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const HISTORY_PREFIX = "wtplus:buildHistory:v1:";
export const MAX_PER_CHARACTER = 20;
/** ~1.5 M characters of JSON for every character's history together (localStorage holds ~5 M per site, shared with
 *  the app's own data). A version is 0.3–8 KB on David's export. */
export const MAX_TOTAL_CHARS = 1_500_000;

export type HistoryLabel = "manual" | "before-build-team" | "before-build-team-undo" | "before-account-plan" | "before-account-plan-undo" | "before-restore" | "before-import";

/** What each label reads as in the list. */
export const LABEL_TEXT: Record<HistoryLabel, string> = {
  manual: "Saved by you",
  "before-build-team": "Before Build my team",
  "before-build-team-undo": "Before undoing Build my team",
  "before-account-plan": "Before Account plan",
  "before-account-plan-undo": "Before undoing Account plan",
  "before-restore": "Before a restore",
  "before-import": "Before a Settings import",
};

export interface HistoryVersion {
  id: string;
  /** when it was taken (ms) */
  at: number;
  label: HistoryLabel;
  /** the build it was taken from (`activeBuildId` at the time) and its name */
  buildId: string | null;
  buildName: string;
  /** content fingerprint (versionFingerprint): equal = the same build */
  fp: string;
  /** the share format, one member */
  payload: SharePayload;
}

interface StoredHistory {
  v: 1;
  versions: HistoryVersion[];
}

/** The slice of Web Storage the history uses (localStorage in the browser; a Map in tests). */
export interface HistoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys(): string[];
}

export function memoryStorage(): HistoryStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    keys: () => [...data.keys()],
  };
}

/** Holds what the browser refused to store, for the rest of this visit: one whole list per character, which stands for
 *  that character until a write to the browser takes it (then it is dropped, 2026-11-08 hunt H2). `since` is when the
 *  list went to memory: a version stored after it (another tab's) is shown beside it. An empty list stays too, so a
 *  version deleted while the browser was full does not come back from storage. */
const fallback = memoryStorage();
const memoryKey = (key: string): string | null => fallback.getItem(key);

function keepInMemory(key: string, versions: HistoryVersion[], now = Date.now()): void {
  fallback.setItem(key, JSON.stringify({ v: 1, versions, since: now }));
}

/** The browser took this character's list: the page-memory copy is no longer ahead of it. */
function dropMemory(storage: HistoryStorage, key: string): void {
  if (storage !== fallback) fallback.removeItem(key);
}

/** Forgets every list held in page memory (tests; a reload does the same). */
export function clearHistoryMemory(): void {
  for (const k of fallback.keys()) fallback.removeItem(k);
}

function webStorage(): HistoryStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const ls = localStorage;
    return {
      getItem: (k) => ls.getItem(k),
      setItem: (k, v) => ls.setItem(k, v),
      removeItem: (k) => ls.removeItem(k),
      keys: () => {
        const out: string[] = [];
        for (let i = 0; i < ls.length; i++) {
          const k = ls.key(i);
          if (k) out.push(k);
        }
        return out;
      },
    };
  } catch {
    return null;
  }
}

/** localStorage when the browser has it, else this page's memory. */
export function defaultStorage(): HistoryStorage {
  return webStorage() ?? fallback;
}

/** True while some character's history is held in page memory only (a write the browser refused, not yet followed by
 *  one it took). A write's own `inMemoryOnly` says it for that write. */
export function historyInMemoryOnly(): boolean {
  return fallback.keys().length > 0;
}

const keyOf = (charId: string): string => `${HISTORY_PREFIX}${charId}`;
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v ?? null)) as T;

/**
 * What makes two versions the same build: the member without its build name (a rename is not a new build), level and
 * talents (they belong to the character; a restore leaves them alone).
 */
export function versionFingerprint(member: ShareMember): string {
  const { buildName: _n, level: _l, talents: _t, ...rest } = plain(member);
  void _n;
  void _l;
  void _t;
  return cyrb53(stableStringify(rest));
}

/** A character record worth a version: a weapon or at least one echo (an untouched roster entry is not a build). */
export function hasBuild(record: Record<string, any> | undefined): boolean {
  if (!record) return false;
  if (record.weapon) return true;
  const echoes = record.echoes ?? {};
  return Object.values(echoes as Record<string, any>).some((s) => s && (s.echoId || s.echo));
}

/** The live build of a character as a version (not stored). */
export function versionOf(charId: string, record: Record<string, any>, inventoryEchoes: any[], label: HistoryLabel, now = Date.now()): HistoryVersion {
  const payload = plain(buildPayload(charId, plain(record), null, plain(inventoryEchoes ?? []), { detail: "full", now: new Date(now) }));
  const member = payload.members[0];
  return {
    id: `${now.toString(36)}${randomString(6)}`,
    at: now,
    label,
    buildId: typeof record?.activeBuildId === "string" ? record.activeBuildId : null,
    buildName: member.buildName,
    fp: versionFingerprint(member),
    payload,
  };
}

function parseStored(raw: string | null): HistoryVersion[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as StoredHistory;
    if (data?.v !== 1 || !Array.isArray(data.versions)) return [];
    const out: HistoryVersion[] = [];
    for (const v of data.versions) {
      if (!v || typeof v.id !== "string" || typeof v.at !== "number") continue;
      // the share reader validates and sanitises, exactly as for a received card
      const parsed = parseSharePayload(v.payload);
      if (!parsed.ok || parsed.readOnly || parsed.payload.kind !== "build") continue;
      const { origin: _o, ...payload } = parsed.payload;
      void _o;
      out.push({
        id: v.id,
        at: v.at,
        label: (v.label in LABEL_TEXT ? v.label : "manual") as HistoryLabel,
        buildId: typeof v.buildId === "string" ? v.buildId : null,
        buildName: typeof v.buildName === "string" ? v.buildName : payload.members[0].buildName,
        fp: typeof v.fp === "string" ? v.fp : versionFingerprint(payload.members[0]),
        payload,
      });
    }
    return out.sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

/** A character's versions, newest first. */
export function readHistory(charId: string, storage: HistoryStorage = defaultStorage()): HistoryVersion[] {
  const own = parseStored(storage.getItem(keyOf(charId)));
  if (storage === fallback) return own;
  const raw = memoryKey(keyOf(charId));
  if (raw === null) return own;
  // a refused write left this character's newer list in memory; what another tab stored since comes along
  const mem = parseStored(raw);
  let since = 0;
  try {
    since = Number((JSON.parse(raw) as { since?: unknown }).since) || 0;
  } catch {
    // parseStored read nothing either
  }
  const ids = new Set(mem.map((v) => v.id));
  return [...mem, ...own.filter((v) => !ids.has(v.id) && v.at > since)].sort((a, b) => b.at - a.at);
}

/** Characters that have at least one version. */
export function charactersWithHistory(storage: HistoryStorage = defaultStorage()): string[] {
  return storage
    .keys()
    .filter((k) => k.startsWith(HISTORY_PREFIX))
    .map((k) => k.slice(HISTORY_PREFIX.length))
    .filter((id) => readHistory(id, storage).length > 0);
}

function sizeOfAll(storage: HistoryStorage): Map<string, number> {
  const out = new Map<string, number>();
  for (const k of storage.keys()) if (k.startsWith(HISTORY_PREFIX)) out.set(k, (storage.getItem(k) ?? "").length);
  return out;
}

/**
 * Drops versions until every history together fits `budget`: always the oldest version of the character that has
 * the most versions (a character's last version goes only when nothing else is left).
 */
function enforceBudget(storage: HistoryStorage, budget: number, keep: string): void {
  let sizes = sizeOfAll(storage);
  let total = [...sizes.values()].reduce((a, b) => a + b, 0);
  let guard = 0;
  while (total > budget && guard++ < 2000) {
    const lists = [...sizes.keys()].map((k) => ({ k, versions: parseStored(storage.getItem(k)) })).filter((l) => l.versions.length);
    if (!lists.length) return;
    lists.sort((a, b) => b.versions.length - a.versions.length || a.versions[a.versions.length - 1].at - b.versions[b.versions.length - 1].at);
    const victim = lists.find((l) => l.versions.length > 1) ?? lists.find((l) => l.k !== keep) ?? lists[0];
    victim.versions.pop();
    writeList(storage, victim.k, victim.versions);
    sizes = sizeOfAll(storage);
    total = [...sizes.values()].reduce((a, b) => a + b, 0);
  }
}

function writeList(storage: HistoryStorage, key: string, versions: HistoryVersion[]): void {
  if (!versions.length) {
    storage.removeItem(key);
    return;
  }
  const body: StoredHistory = { v: 1, versions };
  storage.setItem(key, JSON.stringify(body));
}

export interface RecordResult {
  /** stored a new version */
  saved: boolean;
  /** why not: the build is the same as the newest version, or the character has no build yet */
  reason?: "same-as-latest" | "no-build";
  /** the new version, or the newest one it matched */
  version: HistoryVersion | null;
  /** versions dropped to stay under the per-character cap */
  dropped: number;
  /** the browser refused to store it; it is kept in this page's memory */
  inMemoryOnly: boolean;
}

export interface RecordOptions {
  storage?: HistoryStorage;
  now?: number;
  maxPerCharacter?: number;
  maxTotalChars?: number;
}

/** Stores the live build of one character as a version, unless it is the same as the newest version. */
export function recordVersion(charId: string, record: Record<string, any> | undefined, inventoryEchoes: any[], label: HistoryLabel, options: RecordOptions = {}): RecordResult {
  const storage = options.storage ?? defaultStorage();
  if (!record || !hasBuild(record)) return { saved: false, reason: "no-build", version: null, dropped: 0, inMemoryOnly: false };
  const version = versionOf(charId, record, inventoryEchoes, label, options.now ?? Date.now());
  const list = readHistory(charId, storage);
  if (list[0]?.fp === version.fp) return { saved: false, reason: "same-as-latest", version: list[0], dropped: 0, inMemoryOnly: false };
  const max = options.maxPerCharacter ?? MAX_PER_CHARACTER;
  // newest first, also for a version stamped earlier than the newest (an import stash flushed on the next start)
  const next = [version, ...list].sort((a, b) => b.at - a.at);
  const dropped = Math.max(0, next.length - max);
  next.length = Math.min(next.length, max);
  const key = keyOf(charId);
  try {
    writeList(storage, key, next);
    dropMemory(storage, key);
    enforceBudget(storage, options.maxTotalChars ?? MAX_TOTAL_CHARS, key);
    return { saved: true, version, dropped, inMemoryOnly: false };
  } catch {
    // quota: make room from the other histories once, then fall back to this page's memory
    try {
      enforceBudget(storage, Math.floor((options.maxTotalChars ?? MAX_TOTAL_CHARS) * 0.6), key);
      writeList(storage, key, next);
      dropMemory(storage, key);
      return { saved: true, version, dropped, inMemoryOnly: false };
    } catch {
      keepInMemory(key, next, options.now);
      return { saved: true, version, dropped, inMemoryOnly: true };
    }
  }
}

export interface SnapshotAccount {
  characters: Record<string, any>;
  echoes: any[];
}

/** One version per character (deduped), before a write path changes their builds. Never throws. */
export function snapshotCharacters(ids: ReadonlyArray<string | null | undefined>, label: HistoryLabel, account: SnapshotAccount, options: RecordOptions = {}): RecordResult[] {
  const out: RecordResult[] = [];
  for (const id of new Set(ids.filter((x): x is string => !!x))) {
    try {
      out.push(recordVersion(id, account.characters?.[id], account.echoes ?? [], label, options));
    } catch {
      // a snapshot must never stop the write it guards
    }
  }
  return out;
}

export function deleteVersion(charId: string, versionId: string, storage: HistoryStorage = defaultStorage()): boolean {
  const list = readHistory(charId, storage);
  const next = list.filter((v) => v.id !== versionId);
  if (next.length === list.length) return false;
  try {
    writeList(storage, keyOf(charId), next);
    dropMemory(storage, keyOf(charId));
  } catch {
    keepInMemory(keyOf(charId), next);
  }
  return true;
}
