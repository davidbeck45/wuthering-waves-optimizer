// Wuthering Tools+ automatic backups — what a backup holds, as one file.
//
// A backup is Ryan's own export, made by his export code (`getExportData`: his three stores as stored, and the data
// version they are in), with one more top-level field, `wtplus`, for the account data only plus keeps. His import
// reads `meta` and `data` and nothing else, so the file imports on plain wutheringtools as it is, and his migrations
// bring an old one up to date here. Which plus records go in is not decided in this file: it is every rule of
// `STORAGE_RULES` whose `backup` is "account" (storage/deleteAccount.ts; backupRules.test.ts pins the list).
import { hashText } from "../echoLab/fingerprint";
import { STORAGE_RULES } from "../storage/deleteAccount";
import type { BackupReason } from "./backupStore";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const BACKUP_FILE_VERSION = 1;

/** What `getExportData` returns: each store as the text localStorage holds, or null. */
export interface RyanExport {
  meta: { version: string; source: string };
  data: Record<string, unknown>;
}

/** The account at one moment: his export, and each plus account record as stored (null = there was none). */
export interface Capture extends RyanExport {
  keys: Record<string, string | null>;
}

export interface BackupFile extends RyanExport {
  wtplus: { v: number; madeAt: number; reason: BackupReason; keys: Record<string, string | null> };
}

/** The localStorage records a backup carries beyond his export. */
export const BACKUP_PLUS_KEYS: readonly string[] = STORAGE_RULES.filter((r) => r.backup === "account").map((r) => r.key);

function localArea(): Pick<Storage, "getItem"> | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Reads the account as it is stored right now. Synchronous on purpose: an import calls it just before its first
 *  write. `exportNow` is his `getExportData`. */
export function captureAccount(exportNow: () => RyanExport, storage: Pick<Storage, "getItem"> | null = localArea()): Capture {
  const exported = exportNow();
  const keys: Record<string, string | null> = {};
  for (const key of BACKUP_PLUS_KEYS) {
    let value: string | null;
    try {
      value = storage?.getItem(key) ?? null;
    } catch {
      value = null; // storage blocked: the backup says there was none
    }
    keys[key] = value === "" ? null : value;
  }
  return { meta: { version: String(exported.meta?.version ?? ""), source: String(exported.meta?.source ?? "") }, data: { ...exported.data }, keys };
}

/** entries by key, so the order a file lists them in changes nothing; a value that is not there is not an entry */
const sorted = (o: Record<string, unknown>): Array<[string, unknown]> =>
  Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => [k, o[k]]);

/** One hash of everything a backup holds and nothing about when or why it was taken: equal hashes mean nothing
 *  changed, and a stored backup that no longer gives its own hash is damaged. Two seeds and the length: 106 bits of a
 *  fast string hash, not cryptography. */
export function contentHash(capture: Pick<Capture, "meta" | "data" | "keys">): string {
  const text = JSON.stringify([capture.meta.version, sorted(capture.data), sorted(capture.keys)]);
  return `${hashText(text, 11)}-${hashText(text, 53)}-${text.length.toString(36)}`;
}

const record = (v: unknown): Record<string, any> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : null);

export function backupFile(capture: Capture, reason: BackupReason, madeAt: number): BackupFile {
  return { meta: capture.meta, data: capture.data, wtplus: { v: BACKUP_FILE_VERSION, madeAt, reason, keys: capture.keys } };
}

export type ParsedBackup =
  | {
      ok: true;
      /** what a restore writes: only the plus records this build puts in a backup */
      capture: Capture;
      /** the hash of the file as written, every plus record it lists included: what a stored backup is checked against */
      hash: string;
      madeAt: number | null;
      reason: BackupReason | null;
      plus: boolean;
    }
  | { ok: false; why: "not-json" | "not-a-backup" | "newer" };

const REASONS: readonly BackupReason[] = ["daily", "manual", "before-import", "before-restore", "before-delete"];

/** Reads a backup file's text: one of ours, or a plain export from Ryan's Settings (no `wtplus` part, `plus: false`).
 *  Only the shape is checked here; his import checks the stores themselves before it writes. */
export function parseBackupText(text: string): ParsedBackup {
  let file: Record<string, any> | null;
  try {
    file = record(JSON.parse(text));
  } catch {
    return { ok: false, why: "not-json" };
  }
  const meta = record(file?.meta);
  const data = record(file?.data);
  if (!file || !meta || !data || data.character == null) return { ok: false, why: "not-a-backup" };
  const plus = record(file.wtplus);
  if (plus && (typeof plus.v !== "number" || plus.v > BACKUP_FILE_VERSION)) return { ok: false, why: "newer" };
  const keys: Record<string, string | null> = {};
  const written: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(record(plus?.keys) ?? {})) {
    if (typeof value !== "string" && value !== null) continue;
    written[key] = value;
    // only records this build puts in a backup: a file is never a way to write any other key
    if (BACKUP_PLUS_KEYS.includes(key)) keys[key] = value === "" ? null : value;
  }
  const head = { version: String(meta.version ?? ""), source: String(meta.source ?? "") };
  return {
    ok: true,
    capture: { meta: head, data: { ...data }, keys },
    hash: contentHash({ meta: head, data, keys: written }),
    madeAt: typeof plus?.madeAt === "number" ? plus.madeAt : null,
    reason: REASONS.includes(plus?.reason) ? (plus!.reason as BackupReason) : null,
    plus: Boolean(plus),
  };
}

const two = (n: number): string => String(n).padStart(2, "0");

/** "2026-11-16", in the player's own time zone: the day an automatic backup belongs to. */
export function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** The name of a downloaded or shared copy: the day and time it was taken, so copies sort by age in any folder. */
export function backupFileName(ms: number, extension: "json" | "txt" = "json"): string {
  const d = new Date(ms);
  return `wuthering-tools-backup-${localDay(ms)}-${two(d.getHours())}${two(d.getMinutes())}.${extension}`;
}
