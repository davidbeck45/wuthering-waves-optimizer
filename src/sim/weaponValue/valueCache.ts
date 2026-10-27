// Wuthering Tools+ — /weapons' caches: the weapon-value run keyed by the roster ranking's fingerprint
// (myRankings/rankingCache.ts — a hash of every character, echo and team the scoring reads, plus its options), and the
// selector's wuwa_calc results keyed by that fingerprint + the engine commit + the account and builds keys. Module
// memory (coming back to the page) and sessionStorage (a reload of the tab), the investCache.ts pattern: a result is
// only ever shown for exactly the data it was computed on, and a cancelled run is never kept.
//
// The spec asked for `accountKeyOf` as the key; that fingerprints sequences, weapons and ranks only, so an echo edit
// would have served stale numbers. The ranking fingerprint covers everything the engine reads.

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
  /** false when sessionStorage refused it (module memory still holds it) */
  write(key: string, value: T, storage?: StorageLike | null): boolean;
  clearMemory(): void;
}

/** One cache slot under `storageKey` (the last value written wins), versioned by `version`. */
export function createValueCache<T>(storageKey: string, version: number, isValid: (value: unknown) => boolean = () => true): ValueCache<T> {
  /* eslint-enable no-unused-vars */
  let memory: { key: string; value: T } | null = null;
  const full = (key: string): string => `v${version}:${key}`;
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
    write(key, value, storage = sessionStore()) {
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
    },
    clearMemory() {
      memory = null;
    },
  };
}

export const WEAPON_VALUE_CACHE_KEY = "wtplus:weapons:value";
export const SELECTOR_CACHE_KEY = "wtplus:weapons:selector";
