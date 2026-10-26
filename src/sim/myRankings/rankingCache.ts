// Wuthering Tools+ — the /my-rankings result cache.
//
// The page used to fingerprint its inputs by JSON *lengths* plus the echo count, so editing one echo substat
// (same length, same count) kept showing the old numbers — an accuracy bug. The fingerprint is now a cyrb53 hash
// over the full, key-normalised JSON of everything `rankRoster` reads (characters, inventory echoes, teams) and
// the two options that change its output. The last result is kept in module memory (coming back to the page)
// and in sessionStorage keyed by that fingerprint (a reload of the tab is instant); anything that moved a
// number moves the hash, and a stale entry is simply never read. Pure apart from the storage it is handed.
import type { RosterRanking } from "./rankRoster";

/** bump when RosterRanking's shape or the scoring changes in a way an old cached entry must not survive */
export const RANKING_CACHE_VERSION = 1;
export const RANKING_CACHE_KEY = "wtplus:myRankings:last";

export interface RankingInputs {
  characters: unknown;
  echoes: unknown;
  teams: unknown;
  investment: boolean;
  autoTeamBuffs: boolean;
}

/** JSON with every object's keys sorted, so two equal states hash alike whatever order their keys were written in. */
export function stableStringify(value: unknown): string {
  return (
    JSON.stringify(value, (_key, v: unknown) => {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const src = v as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(src).sort()) out[k] = src[k];
        return out;
      }
      return v;
    }) ?? ""
  );
}

/** cyrb53 (bryc, public domain): a fast 53-bit string hash, as base-36. */
export function cyrb53(text: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** One string that changes whenever anything the ranking reads changes. */
export function rankingFingerprint(inputs: RankingInputs): string {
  const data = stableStringify({ characters: inputs.characters ?? {}, echoes: inputs.echoes ?? [], teams: inputs.teams ?? [] });
  return `v${RANKING_CACHE_VERSION}:${cyrb53(data)}:${data.length.toString(36)}:${inputs.investment ? "i" : "-"}${inputs.autoTeamBuffs ? "a" : "-"}`;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const sessionStore = (): StorageLike | null => {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null; // storage blocked
  }
};

let memory: { fingerprint: string; ranking: RosterRanking } | null = null;

/** The last ranking for exactly these inputs: module memory first, then sessionStorage; null when none matches. */
export function readCachedRanking(fingerprint: string, storage: StorageLike | null = sessionStore()): RosterRanking | null {
  if (memory?.fingerprint === fingerprint) return memory.ranking;
  if (!storage) return null;
  try {
    const raw = storage.getItem(RANKING_CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as { fingerprint?: string; ranking?: RosterRanking };
    if (entry?.fingerprint !== fingerprint || !entry.ranking || !Array.isArray(entry.ranking.characters)) return null;
    memory = { fingerprint, ranking: entry.ranking };
    return entry.ranking;
  } catch {
    return null;
  }
}

/** Keep `ranking` as the result for `fingerprint`; false when sessionStorage refused it (memory still holds it). */
export function writeCachedRanking(fingerprint: string, ranking: RosterRanking, storage: StorageLike | null = sessionStore()): boolean {
  memory = { fingerprint, ranking };
  if (!storage) return false;
  try {
    storage.setItem(RANKING_CACHE_KEY, JSON.stringify({ fingerprint, savedAt: new Date().toISOString(), ranking }));
    return true;
  } catch {
    // quota: drop the old entry rather than leave a stale one behind
    try {
      storage.removeItem(RANKING_CACHE_KEY);
    } catch {
      /* nothing to do */
    }
    return false;
  }
}

/** For tests: forget the in-memory entry. */
export function clearRankingMemory(): void {
  memory = null;
}
