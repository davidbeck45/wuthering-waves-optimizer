// Wuthering Tools+ — /weapons' caches: the weapon-value run keyed by the roster ranking's fingerprint
// (myRankings/rankingCache.ts — a hash of every character, echo and team the scoring reads, plus its options), and the
// selector's wuwa_calc results keyed by that fingerprint + the engine commit + the account and builds keys. Module
// memory (coming back to the page) and sessionStorage (a reload of the tab), the investCache.ts pattern: a result is
// only ever shown for exactly the data it was computed on, and a cancelled run is never kept.
//
// The spec asked for `accountKeyOf` as the key; that fingerprints sequences, weapons and ranks only, so an echo edit
// would have served stale numbers. The ranking fingerprint covers everything the engine reads.
//
// Since 2026-11-02 a cache created with a `saved` name also keeps each value in this browser's saved results
// (persist/savedResults.ts, IndexedDB, under the same key + the app build); `readSaved` reads it back in a new tab.
import { onSavedResultsCleared, savedSlot, tabCopyStamp, type Saved } from "../persist/savedResults";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const sessionStore = (): StorageLike | null => {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
};

/* eslint-disable no-unused-vars -- the parameters of method and function types */
export interface ValueCache<T> {
  read(key: string, storage?: StorageLike | null): T | null;
  /** false when sessionStorage refused it (module memory still holds it); `persist` false keeps it to this page load:
   *  what did not fully score is not read back after a reload */
  write(key: string, value: T, storage?: StorageLike | null, persist?: boolean): boolean;
  /** the value this browser saved for `key` and this app build (null on a miss, or for a cache without a `saved`
   *  name); a hit becomes this tab's value too */
  readSaved(key: string, storage?: StorageLike | null): Promise<Saved<T> | null>;
  clearMemory(): void;
  /** stop answering Settings › Clear: a cache made per component (the selector's) calls it on unmount, so the
   *  hook does not keep the component's last value alive after it is gone */
  dispose(): void;
}

/** One cache slot under `storageKey` (the last value written wins), versioned by `version`; with `saved`, every value
 *  is also kept in this browser's saved results under that cache name. */
export function createValueCache<T>(storageKey: string, version: number, isValid: (value: unknown) => boolean = () => true, saved?: string): ValueCache<T> {
  /* eslint-enable no-unused-vars */
  let memory: { key: string; value: T } | null = null;
  const full = (key: string): string => `v${version}:${tabCopyStamp()}:${key}`;
  const slot = saved ? savedSlot<T>(saved, version, isValid) : null;
  // Settings › Clear saved results: this tab's copies go too
  const off = onSavedResultsCleared(() => {
    memory = null;
    try {
      sessionStore()?.removeItem(storageKey);
    } catch {
      /* nothing to do */
    }
  });
  const keep = (key: string, value: T, storage: StorageLike | null): boolean => {
    const k = full(key);
    memory = { key: k, value };
    if (!storage) return false;
    try {
      storage.setItem(storageKey, JSON.stringify({ key: k, value }));
      return true;
    } catch {
      try {
        storage.removeItem(storageKey);
      } catch {
        /* nothing to do */
      }
      return false;
    }
  };
  return {
    read(key, storage = sessionStore()) {
      const k = full(key);
      if (memory?.key === k) return memory.value;
      if (!storage) return null;
      try {
        const entry = JSON.parse(storage.getItem(storageKey) ?? "null") as { key?: string; value?: T } | null;
        if (entry?.key !== k || entry.value == null || !isValid(entry.value)) return null;
        memory = { key: k, value: entry.value };
        return entry.value;
      } catch {
        return null;
      }
    },
    write(key, value, storage = sessionStore(), persist = true) {
      if (slot && persist) void slot.write(key, value);
      return keep(key, value, persist ? storage : null);
    },
    async readSaved(key, storage = sessionStore()) {
      const hit = slot ? await slot.read(key) : null;
      if (hit) keep(key, hit.value, storage);
      return hit;
    },
    clearMemory() {
      memory = null;
    },
    dispose() {
      off();
    },
  };
}

export const WEAPON_VALUE_CACHE_KEY = "wtplus:weapons:value";
export const SELECTOR_CACHE_KEY = "wtplus:weapons:selector";
