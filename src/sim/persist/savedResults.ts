// Wuthering Tools+ — saved results: a heavy page's finished result kept in this browser (IndexedDB, resultStore.ts)
// so a new tab, a reload or tomorrow's visit paints it at once instead of scoring for seconds. Each page cache
// already has a fingerprint of everything its result reads (rankingFingerprint, accountFingerprint, …); a saved
// result is read back only when that fingerprint, the cache's own schema version and the app build all match:
//
//   key   = `${cache}|${fingerprint}`            one record per cache and data state (the LRU keeps several)
//   build = package version + wuwa_calc commit + the deployed commit (Vercel's VITE_VERCEL_GIT_COMMIT_SHA; "dev"
//           elsewhere), so any deploy — a Ryan sync that moved the calculator's math included — is a miss
//
// A miss, a mismatched build or schema, a torn record, unparseable JSON or a value its cache rejects reads as
// null (and the record is dropped). Records of other builds go on the next write; past SAVED_RESULTS_CAP (about
// 20 MB of JSON) the least recently used go. No IndexedDB (private windows in some browsers), a refused open, a
// quota error or a slow answer (READ_TIMEOUT_MS) all fall back to today's behaviour: the page computes. Only what fully
// scored may be saved, because a saved result repeats until the data changes: a page load that lost a lazy chunk writes
// nothing (`watchLostChunks`), and the page caches keep their own incomplete results out.
//
// A tab copy (sessionStorage, read before all of this) answers to `tabCopyStamp`: the same build, and no Clear in any tab
// since it was written. What did not fully score is no tab copy at all: it stays in this page load's memory, and the page
// says so, because a reload is how a phone gets its signal back.
import { version as APP_VERSION } from "../../../package.json";
import { WUWA_CALC_COMMIT } from "../engine/engineCommit";
import { idbResultStore, type ResultStore, type SavedMeta } from "./resultStore";

export const SAVED_RESULTS_CAP = 20 * 1024 * 1024;
/** a read slower than this is a miss: the page computes rather than wait on a stuck database */
export const READ_TIMEOUT_MS = 2500;

/** This build's id, stamped on every saved result. */
export function appBuildId(): string {
  // spelled out so Vite replaces exactly this member (a bare import.meta.env would inline every VITE_* variable);
  // under plain Node (tsx) import.meta.env is undefined, hence the try — the same as share/buildCodec.ts appStamp
  let sha: string;
  try {
    sha = String(import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA ?? "");
  } catch {
    sha = "";
  }
  return `${APP_VERSION}+${WUWA_CALC_COMMIT}+${sha ? sha.slice(0, 12) : "dev"}`;
}

/* eslint-disable no-unused-vars -- the parameters of function types */
/** what a page cache accepts back (its result's shape) */
export type Validator = (value: unknown) => boolean;
/** an eviction budget: bytes, or bytes as a function of what is kept now */
type Budget = number | ((total: number) => number);
/** the part of `window` that `watchLostChunks` listens on */
type EventHost = { addEventListener(type: string, listener: () => void): void };
/* eslint-enable no-unused-vars */

export interface Saved<T> {
  value: T;
  /** when it was saved (ms since epoch) */
  savedAt: number;
}

export interface SavedUsage {
  count: number;
  bytes: number;
  /** per cache name */
  caches: Record<string, { count: number; bytes: number }>;
}

/* eslint-disable no-unused-vars -- the parameters of interface methods and function types */
export interface SavedResults {
  /** false when this browser keeps nothing (no IndexedDB, or it refused to open) */
  available(): Promise<boolean>;
  read<T>(cache: string, schema: number, fingerprint: string, isValid: Validator): Promise<Saved<T> | null>;
  /** true once it is stored; false when it could not be (too big, no store, quota) */
  write(cache: string, schema: number, fingerprint: string, value: unknown): Promise<boolean>;
  usage(): Promise<SavedUsage>;
  /** every saved result, and every tab copy a registered cache holds (see `onSavedResultsCleared`) */
  clear(): Promise<boolean>;
}

export interface SavedResultsOptions {
  /** the store, or a getter (null = none in this environment) */
  store: ResultStore | null | (() => ResultStore | null);
  build?: string;
  capBytes?: number;
  now?: () => number;
  readTimeoutMs?: number;
  /** where this tab's copies live (sessionStorage by default) */
  tabStorage?: KeyStorage | null;
  /** true once this page load lost a lazy chunk (`watchLostChunks`): every write is refused from then on */
  chunkLost?: () => boolean;
}
/* eslint-enable no-unused-vars */

const keyOf = (cache: string, fingerprint: string): string => `${cache}|${fingerprint}`;

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/** Whether this page load lost a lazy chunk. The engine's loaders swallow that failure: a weapon that will not load
 *  scores as no weapon at all, a kit as an unknown character, with no error, so a run finishes with numbers that look
 *  fine. Vite's `vite:preloadError` on window is the one sign. perf/chunkReload.ts reloads on it, but stands aside
 *  offline (a phone losing its signal mid-run), which is exactly when this matters. The tab shows what it scored as
 *  before; it just is not kept. Workers have no such event: Echo Lab has its own check (useEchoLab `savedCopyOf`). */
export function watchLostChunks(host: EventHost | null = typeof window === "undefined" ? null : window): () => boolean {
  let lost = false;
  host?.addEventListener("vite:preloadError", () => (lost = true));
  return () => lost;
}

const clearHooks = new Set<() => void>();

/** The sessionStorage keys where the page caches keep this tab's copy (rankingCache, investCache, echoCheckCache,
 *  useEchoLab, valueCache — savedResults.test.ts checks they match). Clear removes them itself, because the page Clear
 *  is pressed on (Settings) usually never loaded those modules, so their hooks are not registered there. */
export const TAB_COPY_KEYS: readonly string[] = [
  "wtplus:myRankings:last",
  "wtplus:account:invest",
  "wtplus:account:echoCheck",
  "wtplus:echoLab:cache",
  "wtplus:weapons:value",
  "wtplus:weapons:selector",
];

/** localStorage: when Settings › Clear saved results was last pressed, in any tab. */
export const RESULTS_CLEARED_KEY = "wtplus:savedResults:clearedAt";

const browserStorage = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

/** What a tab copy must carry to be read. The first read on every page is the tab copy, so a plain reload after a
 *  deploy would otherwise keep the old build's figures, and a Clear in another tab would miss this tab's. A run in
 *  flight compares it too: what started before a Clear is not kept after it. */
export function tabCopyStamp(): string {
  let cleared: string | null = null;
  try {
    cleared = browserStorage()?.getItem(RESULTS_CLEARED_KEY) ?? null;
  } catch {
    /* storage blocked: the build alone */
  }
  return `${appBuildId()}|${cleared ?? ""}`;
}

type KeyStorage = Pick<Storage, "removeItem">;
const tabStorage = (): KeyStorage | null => {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
};

/** A page cache that keeps its own copy (module memory, sessionStorage) registers here, so Settings › Clear saved
 *  results empties that copy too and the next visit really scores again. Returns the unregister function. */
export function onSavedResultsCleared(forget: () => void): () => void {
  clearHooks.add(forget);
  return () => clearHooks.delete(forget);
}

export function createSavedResults(options: SavedResultsOptions): SavedResults {
  const build = options.build ?? appBuildId();
  const cap = options.capBytes ?? SAVED_RESULTS_CAP;
  const now = options.now ?? Date.now;
  const timeout = options.readTimeoutMs ?? READ_TIMEOUT_MS;
  const chunkLost = options.chunkLost ?? (() => false);
  const storeOf = (): ResultStore | null => {
    try {
      return typeof options.store === "function" ? options.store() : options.store;
    } catch {
      return null;
    }
  };
  // writes (and the eviction after each) run one at a time, so the LRU always sees the true total
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(job: () => Promise<T>): Promise<T> => {
    const p = queue.then(job, job);
    queue = p.catch(() => undefined);
    return p;
  };

  /** Drop what this build can never read (another build's records), then the least recently used past `budget`
   *  (a number, or a function of the current total). */
  async function evict(store: ResultStore, keep: string | null, budget: Budget): Promise<void> {
    const all = await store.allMeta();
    const drop = all.filter((m) => m.build !== build).map((m) => m.key);
    const mine = all.filter((m) => m.build === build).sort((a, b) => a.usedAt - b.usedAt); // oldest first
    let total = mine.reduce((n, m) => n + (m.bytes || 0), 0);
    if (typeof budget === "function") budget = budget(total);
    for (const m of mine) {
      if (total <= budget) break;
      if (m.key === keep) continue;
      drop.push(m.key);
      total -= m.bytes || 0;
    }
    if (drop.length) await store.remove(drop);
  }

  async function readNow<T>(store: ResultStore, cache: string, schema: number, fingerprint: string, isValid: Validator): Promise<Saved<T> | null> {
    const key = keyOf(cache, fingerprint);
    const { meta, text } = await store.get(key);
    if (!meta && text === undefined) return null;
    let value: unknown;
    let ok = !!meta && meta.cache === cache && meta.schema === schema && meta.build === build && typeof text === "string";
    if (ok) {
      try {
        value = JSON.parse(text as string);
        ok = value != null && isValid(value);
      } catch {
        ok = false;
      }
    }
    if (!ok) {
      // stale (another build or schema) or corrupt: never shown, and not kept
      void store.remove([key]).catch(() => undefined);
      return null;
    }
    void store.putMeta({ ...(meta as SavedMeta), usedAt: now() }).catch(() => undefined);
    return { value: value as T, savedAt: (meta as SavedMeta).savedAt };
  }

  return {
    async available() {
      const store = storeOf();
      if (!store) return false;
      return withTimeout(
        store.allMeta().then(() => true),
        timeout,
        false,
      );
    },

    read<T>(cache: string, schema: number, fingerprint: string, isValid: Validator): Promise<Saved<T> | null> {
      const store = storeOf();
      if (!store || !fingerprint) return Promise.resolve(null);
      return withTimeout(readNow<T>(store, cache, schema, fingerprint, isValid), timeout, null);
    },

    write(cache, schema, fingerprint, value) {
      return serial(async () => {
        const store = storeOf();
        if (!store || !fingerprint || value == null || chunkLost()) return false;
        // a result is saved right after it is computed: let the page paint it before the JSON is built
        await new Promise((resolve) => setTimeout(resolve, 0));
        let text: string | undefined;
        try {
          text = JSON.stringify(value);
        } catch {
          return false;
        }
        if (typeof text !== "string" || text.length > cap) return false;
        const t = now();
        const meta: SavedMeta = { key: keyOf(cache, fingerprint), cache, schema, build, savedAt: t, usedAt: t, bytes: text.length };
        try {
          await store.put(meta, text);
        } catch {
          // most likely the browser's quota (which can sit below the cap): free half of what is kept, try once more
          try {
            await evict(store, null, (total) => Math.min(total, cap) / 2);
            await store.put(meta, text);
          } catch {
            return false;
          }
        }
        try {
          await evict(store, meta.key, cap);
        } catch {
          /* stored; tidying can wait for the next write */
        }
        return true;
      });
    },

    async usage() {
      const out: SavedUsage = { count: 0, bytes: 0, caches: {} };
      const store = storeOf();
      if (!store) return out;
      const all = await withTimeout(store.allMeta(), timeout, [] as SavedMeta[]);
      for (const m of all) {
        if (m.build !== build) continue; // unreadable here, and gone on the next write
        out.count += 1;
        out.bytes += m.bytes || 0;
        const c = (out.caches[m.cache] ??= { count: 0, bytes: 0 });
        c.count += 1;
        c.bytes += m.bytes || 0;
      }
      return out;
    },

    clear() {
      // before the queue: a run ending right now must already see that it no longer counts
      try {
        browserStorage()?.setItem(RESULTS_CLEARED_KEY, String(now()));
      } catch {
        /* storage blocked: this tab's copies still go below */
      }
      return serial(async () => {
        const tab = options.tabStorage === undefined ? tabStorage() : options.tabStorage;
        for (const key of TAB_COPY_KEYS) {
          try {
            tab?.removeItem(key);
          } catch {
            /* nothing to do */
          }
        }
        for (const forget of clearHooks) {
          try {
            forget();
          } catch {
            /* a cache that fails to forget still loses its saved copy below */
          }
        }
        const store = storeOf();
        if (!store) return false;
        try {
          await store.clear();
          return true;
        } catch {
          return false;
        }
      });
    },
  };
}

let browserStore: ResultStore | null = null;
const defaultStore = (): ResultStore | null => {
  if (browserStore) return browserStore;
  try {
    if (typeof indexedDB === "undefined" || !indexedDB) return null;
    browserStore = idbResultStore(indexedDB);
    return browserStore;
  } catch {
    return null; // a browser that throws on the indexedDB getter (some private modes)
  }
};

/** True once this page load lost a lazy chunk. Whatever is scored from then on can be missing a kit or a weapon. */
export const lostChunk = watchLostChunks();

/** The app's saved results (IndexedDB; nothing under Node, where every read misses and every write is a no-op). */
export const savedResults: SavedResults = createSavedResults({ store: defaultStore, chunkLost: lostChunk });

/* eslint-disable no-unused-vars -- the parameters of interface methods */
/** One page cache's view of the saved results: its name and schema version bound, and what it accepts back. */
export interface SavedSlot<T> {
  read(fingerprint: string): Promise<Saved<T> | null>;
  write(fingerprint: string, value: T): Promise<boolean>;
}
/* eslint-enable no-unused-vars */

export function savedSlot<T>(cache: string, schema: number, isValid: Validator, results: SavedResults = savedResults): SavedSlot<T> {
  return {
    read: (fingerprint) => results.read<T>(cache, schema, fingerprint, isValid),
    write: (fingerprint, value) => results.write(cache, schema, fingerprint, value),
  };
}

/** "saved just now", "saved 4 min ago", "saved 2 h ago", or "saved <date>" */
export function savedAgo(savedAt: number, at = Date.now()): string {
  const s = Math.max(0, Math.round((at - savedAt) / 1000));
  if (s < 45) return "saved just now";
  if (s < 3600) return `saved ${Math.round(s / 60)} min ago`;
  if (s < 86400) return `saved ${Math.round(s / 3600)} h ago`;
  return `saved ${new Date(savedAt).toLocaleDateString()}`;
}

/** The tooltip that goes with `savedAgo`: why the page did not score again. `button` is what the page's own button says. */
export function savedTitle(savedAt: number, button = "Recompute"): string {
  return `Saved in this browser on ${new Date(savedAt).toLocaleString()}. Shown without scoring again because nothing it reads has changed since; ${button} scores it fresh.`;
}
