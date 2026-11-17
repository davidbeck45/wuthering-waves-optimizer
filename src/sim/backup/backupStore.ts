// Wuthering Tools+ automatic backups — where they are kept. One IndexedDB database, `wtplus-backups`, with two object
// stores, the pattern of persist/resultStore.ts: `meta` (small records: when, why, what is inside, size: what the list
// reads) and `data` (the backup file itself, gzip bytes or plain text, under the same id). Both halves are written in
// one transaction, so a reload mid-write leaves no backup rather than half of one.
//
// `BackupStore` is the seam: the browser's IndexedDB behind the small promise wrapper below, or a Map (the unit
// tests). No dependency, and nothing imported: storage/deleteAccount.ts asks for the database to be deleted from here.

export const BACKUP_DB_NAME = "wtplus-backups";
const BACKUP_DB_VERSION = 1;
const META = "meta";
const DATA = "data";

/** why a backup was taken */
export type BackupReason = "daily" | "manual" | "before-import" | "before-restore" | "before-delete";

export interface BackupCounts {
  /** characters with a weapon equipped: My account's "set up" */
  characters: number;
  /** the saved builds of all characters (Ryan's builds list) */
  builds: number;
  echoes: number;
  teams: number;
  /** Convene pulls of every stored player; null when the stored history could not be read */
  pulls: number | null;
}

export interface BackupMeta {
  /** `auto-2026-11-16` for the day's automatic one (so two tabs cannot make two), `<reason>-<time>` for the rest */
  id: string;
  /** ms since epoch */
  at: number;
  reason: BackupReason;
  /** hash of the content (backupFile.ts `contentHash`): what "nothing changed" and "is it damaged" compare */
  hash: string;
  /** stored size in bytes */
  bytes: number;
  /** characters of the file as JSON text: about the size of a download */
  textLength: number;
  enc: "gzip" | "text";
  counts: BackupCounts;
  /** Ryan's data version the export was written in */
  dataVersion: string;
}

export type BackupData = Uint8Array | string;

/* eslint-disable no-unused-vars -- the parameters of interface methods */
export interface BackupStore {
  /** every meta record, in no particular order */
  list(): Promise<BackupMeta[]>;
  /** both halves of one backup (either may be missing: a torn or foreign record) */
  get(id: string): Promise<{ meta?: BackupMeta; data?: BackupData }>;
  /** Stores a backup unless one with this id is already there; false when it was. Check and write are one transaction,
   *  which is what keeps two tabs to one backup a day. `replacing`: backups that go in that same transaction, to make
   *  room. It is all or nothing: when the write is refused, they are all still there. */
  add(meta: BackupMeta, data: BackupData, replacing?: readonly string[]): Promise<boolean>;
  remove(ids: readonly string[]): Promise<void>;
  clear(): Promise<void>;
}
/* eslint-enable no-unused-vars */

/** A Map-backed store with the same contract: the unit tests' store. */
export function memoryBackupStore(): BackupStore & { records: Map<string, { meta?: BackupMeta; data?: BackupData }> } {
  const records = new Map<string, { meta?: BackupMeta; data?: BackupData }>();
  return {
    records,
    async list() {
      return [...records.values()].flatMap((r) => (r.meta ? [{ ...r.meta, counts: { ...r.meta.counts } }] : []));
    },
    async get(id) {
      const r = records.get(id);
      return { meta: r?.meta ? { ...r.meta, counts: { ...r.meta.counts } } : undefined, data: r?.data };
    },
    async add(meta, data, replacing = []) {
      if (records.get(meta.id)?.meta) return false;
      for (const id of replacing) records.delete(id);
      records.set(meta.id, { meta: { ...meta, counts: { ...meta.counts } }, data });
      return true;
    },
    async remove(ids) {
      for (const id of ids) records.delete(id);
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
    const r = factory.open(name, BACKUP_DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: "id" });
      if (!db.objectStoreNames.contains(DATA)) db.createObjectStore(DATA);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    // another tab still holds an older version open: nothing to wait for here, it lets go on `versionchange`
    r.onblocked = () => reject(new DOMException("the backups database is held open elsewhere", "InvalidStateError"));
  });
}

/** The backups in the browser's IndexedDB. One connection, opened on first use and dropped when the browser closes it
 *  or the database is deleted (Settings › Delete your data, in this tab or another), so a later call reopens. */
export function idbBackupStore(factory: IDBFactory, name = BACKUP_DB_NAME): BackupStore {
  let db: Promise<IDBDatabase> | null = null;
  const connection = (): Promise<IDBDatabase> =>
    (db ??= openDb(factory, name).then(
      (d) => {
        d.onclose = () => (db = null);
        // a deleteDatabase elsewhere waits for this connection: let it go
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
    async list() {
      const t = await tx([META], "readonly");
      return (await request(t.objectStore(META).getAll())) as BackupMeta[];
    },
    async get(id) {
      const t = await tx([META, DATA], "readonly");
      const [meta, data] = await Promise.all([request(t.objectStore(META).get(id)), request(t.objectStore(DATA).get(id))]);
      const usable = typeof data === "string" || data instanceof Uint8Array ? data : data instanceof ArrayBuffer ? new Uint8Array(data) : undefined;
      return { meta: meta as BackupMeta | undefined, data: usable };
    },
    async add(meta, data, replacing = []) {
      const t = await tx([META, DATA], "readwrite");
      const metas = t.objectStore(META);
      const datas = t.objectStore(DATA);
      let added = false;
      const there = metas.get(meta.id);
      there.onsuccess = () => {
        if (there.result !== undefined) return;
        // the ones that make room go in this same transaction: a browser that still refuses the write aborts it,
        // and they are all still there
        for (const id of replacing) {
          metas.delete(id);
          datas.delete(id);
        }
        metas.put(meta);
        datas.put(data, meta.id);
        added = true;
      };
      await finished(t);
      return added;
    },
    async remove(ids) {
      if (!ids.length) return;
      const t = await tx([META, DATA], "readwrite");
      for (const id of ids) {
        t.objectStore(META).delete(id);
        t.objectStore(DATA).delete(id);
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

/** The browser's IndexedDB, or null where there is none or it may not be touched (some private windows). */
export function browserIndexedDb(): IDBFactory | null {
  try {
    return typeof indexedDB === "undefined" ? null : (indexedDB ?? null);
  } catch {
    return null;
  }
}

/** Asks the browser to delete the whole database (Settings › Delete your data). The request is queued at once, so the
 *  page reload that follows a Delete does not cut it short; an open connection lets go on `versionchange`. */
export function dropBackupDatabase(factory: IDBFactory | null = browserIndexedDb(), name = BACKUP_DB_NAME): void {
  try {
    factory?.deleteDatabase(name);
  } catch {
    /* refused: there is nothing this tab can do about it */
  }
}
