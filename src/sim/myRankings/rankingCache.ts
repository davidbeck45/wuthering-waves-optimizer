// Wuthering Tools+ — the /my-rankings result cache.
//
// The page used to fingerprint its inputs by JSON *lengths* plus the echo count, so editing one echo substat
// (same length, same count) kept showing the old numbers — an accuracy bug. The fingerprint is now a cyrb53 hash
// over the full, key-normalised JSON of everything `rankRoster` reads (characters, inventory echoes, teams) and
// the two options that change its output. The last result is kept in module memory (coming back to the page)
// and in sessionStorage keyed by that fingerprint (a reload of the tab is instant); anything that moved a
// number moves the hash, and a stale entry is simply never read. Pure apart from the storage it is handed.
// Since 2026-11-02 every ranking written here is also saved in this browser (persist/savedResults.ts, IndexedDB,
// keyed by the same fingerprint + the app build), so a new tab reads it back with `readSavedRanking` instead of
// scoring for seconds.
import { onSavedResultsCleared, savedSlot } from "../persist/savedResults";
import type { RankProgressItem, RosterRanking } from "./rankRoster";

/** bump when RosterRanking's shape or the scoring changes in a way an old cached entry must not survive */
export const RANKING_CACHE_VERSION = 4; // 2: wuwa_calc loops beside a teammate the app lacks (Lily) are no longer scored; 3: the regenerated stock loops (named after a team the app can field, 2026-11-02); 4: each best rotation keeps its crit-luck range
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

const isRanking = (v: unknown): boolean => Array.isArray((v as RosterRanking)?.characters) && Array.isArray((v as RosterRanking)?.teams);
/** the browser-wide copy (IndexedDB): survives the tab */
export const savedRankings = savedSlot<RosterRanking>("ranking", RANKING_CACHE_VERSION, isRanking);

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

/** Keep `ranking` as the result for `fingerprint`; false when sessionStorage refused it (memory still holds it).
 *  It is saved in this browser too (in the background) unless `persist` is false — a ranking that just came out
 *  of the saved results — or it is `incomplete`: this tab shows it, the next one scores again. */
export function writeCachedRanking(fingerprint: string, ranking: RosterRanking, storage: StorageLike | null = sessionStore(), persist = true): boolean {
  memory = { fingerprint, ranking };
  if (persist && !ranking.incomplete) void savedRankings.write(fingerprint, ranking);
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

/** The ranking this browser saved for exactly these inputs and this app build (IndexedDB), with when it was saved;
 *  null on a miss or when the browser keeps nothing. A hit becomes this tab's cached ranking too. */
export async function readSavedRanking(fingerprint: string, storage: StorageLike | null = sessionStore()): Promise<{ ranking: RosterRanking; savedAt: number } | null> {
  const hit = await savedRankings.read(fingerprint);
  if (!hit) return null;
  writeCachedRanking(fingerprint, hit.value, storage, false);
  return { ranking: hit.value, savedAt: hit.savedAt };
}

/** For tests: forget the in-memory entry and any run in flight. */
export function clearRankingMemory(): void {
  memory = null;
  runs.clear();
}

// ---- one run per fingerprint in this tab (speed track, 2026-11-02)
// /account, /my-rankings and /weapons each started their own `rankRoster` when the cache missed. A run cannot be
// stopped, so leaving one of them for another mid-run (the palette, the plus pages menu) ran the same ranking twice on
// the main thread at once, and the second page's first rows waited behind both. Now the first page to ask starts the
// run and the next one joins it: it is handed the rows scored so far at once and the rest as they land, and the run
// writes the cache itself when it ends, whoever is still listening. Same inputs (the fingerprint), same numbers.

export interface RankingProgress {
  done: number;
  total: number;
  label: string;
}
export interface RankingListener {
  /** each step of the run; `finished` is a character or team that just landed (replayed in order on joining) */
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  onProgress?: (progress: RankingProgress, finished?: RankProgressItem) => void;
}
// eslint-disable-next-line no-unused-vars -- the parameters of a function type
type ProgressFn = (done: number, total: number, label: string, finished?: RankProgressItem) => void;
interface Run {
  promise: Promise<RosterRanking>;
  progress: RankingProgress;
  finished: RankProgressItem[];
  listeners: Set<RankingListener>;
}
const runs = new Map<string, Run>();

export interface SharedRanking {
  promise: Promise<RosterRanking>;
  /** this page was handed a run another page had started */
  joined: boolean;
  /** stop listening (the run goes on and still fills the cache) */
  leave: () => void;
}

/** The ranking for `fingerprint`: joins the run in flight for it, else starts one with `start` (handed the progress
 *  callback to pass to `rankRoster`). The finished ranking is written to the cache under `fingerprint`. */
export function sharedRanking(
  fingerprint: string,
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  start: (onProgress: ProgressFn) => Promise<RosterRanking>,
  listener: RankingListener = {},
  storage: StorageLike | null = sessionStore(),
): SharedRanking {
  const joining = runs.get(fingerprint);
  if (joining) {
    // the rows scored so far, in the order they landed, then where the run stands
    for (const item of joining.finished) listener.onProgress?.(joining.progress, item);
    listener.onProgress?.(joining.progress);
    joining.listeners.add(listener);
    return { promise: joining.promise, joined: true, leave: () => void joining.listeners.delete(listener) };
  }
  const fresh: Run = { promise: Promise.resolve(null as unknown as RosterRanking), progress: { done: 0, total: 0, label: "starting" }, finished: [], listeners: new Set([listener]) };
  runs.set(fingerprint, fresh);
  // started in this call, not a microtask later: `rankRoster` begins fetching the stock presets at once, and the page's
  // first render overlaps that fetch instead of going before it (a deferred start cost /my-rankings ~0.4 s of first row)
  let started: Promise<RosterRanking>;
  try {
    started = start((done, total, label, finished) => {
      fresh.progress = { done, total, label };
      if (finished) fresh.finished.push(finished);
      for (const l of [...fresh.listeners]) l.onProgress?.(fresh.progress, finished);
    });
  } catch (err) {
    started = Promise.reject(err);
  }
  fresh.promise = started
    .then((ranking) => {
      writeCachedRanking(fingerprint, ranking, storage);
      return ranking;
    })
    .finally(() => {
      if (runs.get(fingerprint) === fresh) runs.delete(fingerprint);
    });
  return { promise: fresh.promise, joined: false, leave: () => void fresh.listeners.delete(listener) };
}

/** Whether a run for `fingerprint` is in flight (tests, and a page deciding what to say). */
export function rankingInFlight(fingerprint: string): boolean {
  return runs.has(fingerprint);
}

// Settings › Clear saved results: this tab's copies go too
onSavedResultsCleared(() => {
  memory = null;
  try {
    sessionStore()?.removeItem(RANKING_CACHE_KEY);
  } catch {
    /* nothing to do */
  }
});
