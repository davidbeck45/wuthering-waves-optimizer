// Wuthering Tools+ — the energy check's measurements kept across visits: localStorage `wtplus:energy:v1`, one entry per
// composition keyed by the engine commit + the account (sequences, weapons, ranks: `accountKeyOf`) + its "My build"
// rolls + the three characters. His team keys are slots in his list and move with his commits, so the commit is part
// of every key and entries of another commit are dropped on save. A failure ("error") is never kept; "not one of his
// compositions" and "no build at this state" are, being as deterministic as a measurement. Each entry is ~1.7 KB; the
// store keeps the most recently used ENERGY_CACHE_LIMIT (a full scan of a big account is ~190 compositions).
import type { RileyAccount } from "../engine/rileyRun";
import { compositionKey, TEAM_ENERGY_VERSION } from "./energyNeed";
import type { TeamMeasure } from "./energyCheck";

export const ENERGY_CACHE_KEY = "wtplus:energy:v1";
export const ENERGY_CACHE_LIMIT = 220;

export interface CachedMeasure {
  /** last used (ms since epoch) */
  at: number;
  m: TeamMeasure;
}

interface Stored {
  v: 1;
  entries: Record<string, CachedMeasure>;
}

/** The cache key of one composition's measurement. */
export function energyCacheKey(commit: string, account: Pick<RileyAccount, "key" | "buildsKey"> | null | undefined, characterIds: ReadonlyArray<string | null | undefined>): string {
  return ["energy", commit, account?.key || "-", account?.buildsKey || "-", compositionKey(characterIds)].join("|");
}

const commitOf = (key: string): string => key.split("|")[1] ?? "";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const defaultStorage = (): StorageLike | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

/** A kept measurement this build can read: a `notMeasured` with its reason, or a `TeamEnergy` of this version (an
 *  entry written by a build whose shape differed is dropped, never half-read). */
const validMeasure = (m: unknown): m is TeamMeasure => {
  const x = m as TeamMeasure | null;
  if (!x || typeof x !== "object") return false;
  if (x.status === "notMeasured") return typeof x.reason === "string";
  return x.status === "ok" && x.energy?.v === TEAM_ENERGY_VERSION && Array.isArray(x.energy.members);
};

/** Read every kept measurement (an unreadable or foreign value reads as empty). */
export function loadEnergyCache(storage: StorageLike | null = defaultStorage()): Map<string, CachedMeasure> {
  const out = new Map<string, CachedMeasure>();
  if (!storage) return out;
  try {
    const parsed = JSON.parse(storage.getItem(ENERGY_CACHE_KEY) ?? "null") as Stored | null;
    if (!parsed || parsed.v !== 1 || typeof parsed.entries !== "object") return out;
    for (const [key, entry] of Object.entries(parsed.entries)) {
      if (entry && typeof entry.at === "number" && validMeasure(entry.m)) out.set(key, entry);
    }
  } catch {
    /* a corrupt value is rebuilt on the next save */
  }
  return out;
}

/** Whether a measurement is worth keeping. */
export const keepable = (m: TeamMeasure): boolean => m.status === "ok" || m.reason !== "error";

/** Write the measurements back: only `commit`'s, failures left out, the most recent `limit`. Over quota, it drops the
 *  oldest half and tries once more (the app's own data matters more than this cache). */
export function saveEnergyCache(entries: Map<string, CachedMeasure>, commit: string, storage: StorageLike | null = defaultStorage(), limit = ENERGY_CACHE_LIMIT): void {
  if (!storage) return;
  let kept = [...entries].filter(([key, e]) => commitOf(key) === commit && keepable(e.m)).sort((a, b) => b[1].at - a[1].at).slice(0, limit);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      storage.setItem(ENERGY_CACHE_KEY, JSON.stringify({ v: 1, entries: Object.fromEntries(kept) } satisfies Stored));
      return;
    } catch {
      kept = kept.slice(0, Math.floor(kept.length / 2));
    }
  }
  try {
    storage.removeItem(ENERGY_CACHE_KEY);
  } catch {
    /* nothing more to do */
  }
}
