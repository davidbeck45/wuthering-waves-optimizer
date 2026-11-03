// Wuthering Tools+ — where a heavy page's finished result lives between visits (savedResults.ts decides what goes in).
// One IndexedDB database, `wtplus-results`, with two object stores: `meta` (small records: key, cache, schema, build,
// size, times — what the LRU and the Settings card read) and `data` (the result as JSON text, under the same key).
// Splitting them keeps the LRU's "used just now" touch to a few bytes instead of rewriting a multi-MB result.
//
// `ResultStore` is the seam: the browser's IndexedDB behind the tiny promise wrapper below, or a Map (tests, and the
// shape any other backend would take). No dependency: the plain indexedDB API.

export const RESULT_DB_NAME = "wtplus-results";
const RESULT_DB_VERSION = 1;
const META = "meta";
const DATA = "data";

export interface SavedMeta {
  /** `${cache}|${fingerprint}` */
  key: string;
  /** which page cache wrote it ("ranking", "investPlan", …) */
  cache: string;
  /** that cache's own schema version when it was written */
  schema: number;
  /** the app build that computed it (savedResults.ts `appBuildId`) */
  build: string;
  /** ms since epoch */
  savedAt: number;
  /** last read or written (ms since epoch): the LRU's clock */
  usedAt: number;
  /** characters of JSON — about bytes, the text being ASCII apart from a few names */
  bytes: number;
}

/* eslint-disable no-unused-vars -- the parameters of interface methods */
export interface ResultStore {
  /** both halves of one record (either may be missing: a torn or foreign record) */
  get(key: string): Promise<{ meta?: SavedMeta; text?: string }>;
  allMeta(): Promise<SavedMeta[]>;
  /** meta and data in one transaction */
  put(meta: SavedMeta, text: string): Promise<void>;
  /** meta only (the LRU touch); a no-op when the record is gone, so a late touch never leaves a torn record */
  putMeta(meta: SavedMeta): Promise<void>;
  remove(keys: readonly string[]): Promise<void>;
  clear(): Promise<void>;
}
/* eslint-enable no-unused-vars */

/** A Map-backed store: the tests' store, with the same contract as the IndexedDB one. */
export function memoryResultStore(): ResultStore & { records: Map<string, { meta?: SavedMeta; text?: string }> } {
  const records = new Map<string, { meta?: SavedMeta; text?: string }>();
  const copy = (m: SavedMeta | undefined): SavedMeta | undefined => (m ? { ...m } : undefined);
  return {
    records,
    async get(key) {
      const r = records.get(key);
      return { meta: copy(r?.meta), text: r?.text };
    },
    async allMeta() {
      return [...records.values()].flatMap((r) => (r.meta ? [{ ...r.meta }] : []));
    },
    async put(meta, text) {
      records.set(meta.key, { meta: { ...meta }, text });
    },
    async putMeta(meta) {
      const r = records.get(meta.key);
      if (r?.meta) records.set(meta.key, { ...r, meta: { ...meta } });
    },
    async remove(keys) {
      for (const k of keys) records.delete(k);
    },
    async clear() {
      records.clear();
    },
  };
}

// ---- the IndexedDB wrapper

const request = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

const finished = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException("transaction aborted", "AbortError"));
  });

function openDb(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = factory.open(name, RESULT_DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: "key" });
      if (!db.objectStoreNames.contains(DATA)) db.createObjectStore(DATA);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** The saved results in the browser's IndexedDB. One connection, opened on first use and dropped when the browser
 *  closes it or another tab (or Settings › Clear, or a test) deletes the database, so a later call reopens. */
export function idbResultStore(factory: IDBFactory, name = RESULT_DB_NAME): ResultStore {
  let db: Promise<IDBDatabase> | null = null;
  const connection = (): Promise<IDBDatabase> =>
    (db ??= openDb(factory, name).then(
      (d) => {
        d.onclose = () => (db = null);
        // a deleteDatabase / upgrade elsewhere waits for this connection: let it go
        d.onversionchange = () => {
          d.close();
          db = null;
        };
        return d;
      },
      (err) => {
        db = null;
        throw err;
      },
    ));
  const tx = async (stores: string[], mode: IDBTransactionMode): Promise<IDBTransaction> => (await connection()).transaction(stores, mode);

  return {
    async get(key) {
      const t = await tx([META, DATA], "readonly");
      const [meta, text] = await Promise.all([request(t.objectStore(META).get(key)), request(t.objectStore(DATA).get(key))]);
      return { meta: meta as SavedMeta | undefined, text: typeof text === "string" ? text : undefined };
    },
    async allMeta() {
      const t = await tx([META], "readonly");
      return (await request(t.objectStore(META).getAll())) as SavedMeta[];
    },
    async put(meta, text) {
      const t = await tx([META, DATA], "readwrite");
      t.objectStore(META).put(meta);
      t.objectStore(DATA).put(text, meta.key);
      await finished(t);
    },
    async putMeta(meta) {
      // only a record that is still there: a read's touch landing after an eviction, a Clear or another tab's
      // delete would otherwise leave a meta-only record that the LRU and Settings count until it is read again
      const t = await tx([META], "readwrite");
      const metas = t.objectStore(META);
      const r = metas.get(meta.key);
      r.onsuccess = () => {
        if (r.result !== undefined) metas.put(meta);
      };
      await finished(t);
    },
    async remove(keys) {
      if (!keys.length) return;
      const t = await tx([META, DATA], "readwrite");
      for (const k of keys) {
        t.objectStore(META).delete(k);
        t.objectStore(DATA).delete(k);
      }
      await finished(t);
    },
    async clear() {
      const t = await tx([META, DATA], "readwrite");
      t.objectStore(META).clear();
      t.objectStore(DATA).clear();
      await finished(t);
    },
  };
}
