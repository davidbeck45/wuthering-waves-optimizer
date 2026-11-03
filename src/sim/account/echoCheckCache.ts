// Wuthering Tools+ — the /account echo check's cache ("Check my echoes", echoCheck.ts). The check is heavy (an
// optimizer run per character), so it runs on demand and is kept for this tab: module memory (coming back to the
// page) and sessionStorage (a reload), keyed by the roster ranking's fingerprint (every character, echo and team the
// scoring reads) plus an inventory fingerprint (the echoes and who wears them, which the ranking's hash does not
// read) and the run's settings (Build my team's switches, the wuwa_calc commit). Any edit moves a key, and a stale
// entry is simply never read. A cancelled check is never kept. The investCache pattern.
import { cyrb53, stableStringify } from "../myRankings/rankingCache";
import type { EchoCheck } from "./echoCheck";

/** bump when EchoUpgrade's shape or the check's rules change */
export const ECHO_CHECK_CACHE_VERSION = 2;
export const ECHO_CHECK_CACHE_KEY = "wtplus:account:echoCheck";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const sessionStore = (): StorageLike | null => {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
};

/** A hash of the inventory as Build my team reads it: every echo and the `equipped` map (who wears what). */
export function inventoryFingerprint(echoes: unknown, equipped: unknown): string {
  const data = stableStringify({ echoes: echoes ?? [], equipped: equipped ?? {} });
  return `${cyrb53(data)}:${data.length.toString(36)}`;
}

/** The cache key: ranking fingerprint · inventory fingerprint · the run's settings (any string; hashed). */
export function echoCheckKey(rankingFingerprint: string, inventoryFp: string, settings: unknown = null): string {
  return `e${ECHO_CHECK_CACHE_VERSION}:${rankingFingerprint}|inv:${inventoryFp}|s:${cyrb53(stableStringify(settings))}`;
}

let memory: { key: string; check: EchoCheck } | null = null;

export function readCachedEchoCheck(key: string, storage: StorageLike | null = sessionStore()): EchoCheck | null {
  if (memory?.key === key) return memory.check;
  if (!storage) return null;
  try {
    const entry = JSON.parse(storage.getItem(ECHO_CHECK_CACHE_KEY) ?? "null") as { key?: string; check?: EchoCheck } | null;
    if (entry?.key !== key || !entry.check || !Array.isArray(entry.check.items)) return null;
    memory = { key, check: entry.check };
    return entry.check;
  } catch {
    return null;
  }
}

/** Keep a finished check (a cancelled one never); false when sessionStorage refused it (memory still holds it). */
export function writeCachedEchoCheck(key: string, check: EchoCheck, storage: StorageLike | null = sessionStore()): boolean {
  if (check.cancelled) return false;
  memory = { key, check };
  if (!storage) return false;
  try {
    storage.setItem(ECHO_CHECK_CACHE_KEY, JSON.stringify({ key, check }));
    return true;
  } catch {
    try {
      storage.removeItem(ECHO_CHECK_CACHE_KEY);
    } catch {
      /* nothing to do */
    }
    return false;
  }
}

export function clearEchoCheckMemory(): void {
  memory = null;
}
