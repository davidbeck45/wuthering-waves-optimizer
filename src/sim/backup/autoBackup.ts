// Wuthering Tools+ automatic backups — taking one, reading one back, and keeping the list within its rules.
//
// A backup is taken from a `Capture` (backupFile.ts): the caller reads the account, this decides whether it is worth
// keeping. It is not when the account is empty, when nothing changed since the newest backup (the content hash), or,
// for the automatic one, when today already has one. The day's automatic backup has the day in its id and is stored
// with "only if not there" in one transaction, so two tabs make one. After every write the list is pruned
// (retention.ts). A browser that is full gives up its oldest backups, as many as the new one needs, and the write is
// tried once more.
//
// Nothing here throws into the app: a failed backup is a result, never an error on the page.
import { shallowRef } from "vue";
import { backupFile, contentHash, localDay, parseBackupText, type Capture } from "./backupFile";
import { browserIndexedDb, idbBackupStore, type BackupMeta, type BackupReason, type BackupStore } from "./backupStore";
import { pack, unpack } from "./codec";
import { captureCounts, isEmptyAccount } from "./counts";
import { BACKUP_BYTE_CAP, newestFirst, retention } from "./retention";

export type TakeResult =
  | { saved: true; meta: BackupMeta }
  | {
      saved: false;
      /** `empty`: nothing to back up · `unchanged`: the newest backup (`meta`) already holds exactly this ·
       *  `today`: today's automatic one is there · `unavailable`: this browser keeps none · `full`: no room even
       *  after the oldest went · `failed`: the account could not be read, or the browser refused the write for a
       *  reason other than room */
      why: "empty" | "unchanged" | "today" | "unavailable" | "full" | "failed";
      meta?: BackupMeta;
    };

export type ReadResult = { ok: true; meta: BackupMeta; text: string } | { ok: false; why: "gone" | "damaged" | "unavailable" };

export interface BackupsEnv {
  /** null: this browser has no IndexedDB, or will not let the page use it */
  store: BackupStore | null;
  now?: () => number;
  cap?: number;
}

/** The browser has no room left (IndexedDB aborts the transaction with this name). */
const isQuotaError = (e: unknown): boolean => (e as { name?: string } | null)?.name === "QuotaExceededError";

/** Counts every change to the stored backups in this tab: a list on screen reads it to know when to look again. */
export const backupsChanged = shallowRef(0);

export function createBackups(env: BackupsEnv) {
  const now = env.now ?? Date.now;
  const store = env.store;
  const touched = (): void => void (backupsChanged.value += 1);

  /** Newest first. Empty when the browser keeps none or the read fails. */
  async function list(): Promise<BackupMeta[]> {
    if (!store) return [];
    try {
      return newestFirst(await store.list());
    } catch {
      return [];
    }
  }

  /** Can this browser keep backups at all? (A private window may have no IndexedDB, or one that refuses to open.) */
  async function available(): Promise<boolean> {
    if (!store) return false;
    try {
      await store.list();
      return true;
    } catch {
      return false;
    }
  }

  async function prune(justWritten?: string): Promise<void> {
    if (!store) return;
    try {
      const { drop } = retention(await store.list(), { cap: env.cap ?? BACKUP_BYTE_CAP, justWritten });
      if (drop.length) await store.remove(drop.map((m) => m.id));
    } catch {
      /* the list stays a little long until the next write */
    }
  }

  async function take(reason: BackupReason, capture: Capture): Promise<TakeResult> {
    if (!store) return { saved: false, why: "unavailable" };
    let counts, hash: string;
    try {
      counts = captureCounts(capture);
      hash = contentHash(capture);
    } catch {
      return { saved: false, why: "failed" };
    }
    if (isEmptyAccount(counts)) return { saved: false, why: "empty" };

    let metas: BackupMeta[];
    try {
      metas = newestFirst(await store.list());
    } catch {
      return { saved: false, why: "unavailable" };
    }
    const at = now();
    const id = reason === "daily" ? `auto-${localDay(at)}` : `${reason}-${at.toString(36)}`;
    const sameDay = reason === "daily" ? metas.find((m) => m.id === id) : undefined;
    if (sameDay) return { saved: false, why: "today", meta: sameDay };
    if (metas[0] && metas[0].hash === hash) return { saved: false, why: "unchanged", meta: metas[0] };

    const text = JSON.stringify(backupFile(capture, reason, at));
    const packed = await pack(text);
    const meta: BackupMeta = { id, at, reason, hash, bytes: packed.bytes, textLength: text.length, enc: packed.enc, counts, dataVersion: capture.meta.version };
    let added: boolean;
    try {
      added = await store.add(meta, packed.data);
    } catch (e) {
      // Only a full browser costs old backups, and only as many as the new one needs: the oldest go, never more than
      // half the list, and it is tried once more. Any other refusal leaves every backup where it is.
      if (!isQuotaError(e)) return { saved: false, why: "failed" };
      const victims: string[] = [];
      let freed = 0;
      for (const m of [...metas].reverse()) {
        if (freed >= packed.bytes || victims.length >= Math.ceil(metas.length / 2)) break;
        victims.push(m.id);
        freed += m.bytes;
      }
      if (!victims.length) return { saved: false, why: "full" };
      try {
        await store.remove(victims);
        touched();
        added = await store.add(meta, packed.data);
      } catch {
        return { saved: false, why: "full" };
      }
    }
    if (!added) return { saved: false, why: "today", meta: (await list()).find((m) => m.id === id) }; // another tab was first
    await prune(meta.id);
    touched();
    return { saved: true, meta };
  }

  /** The file text of a stored backup, checked: both halves there, the bytes unpack, and the content still gives the
   *  hash it was stored under. Anything else is "damaged", and nothing is done with it. */
  async function read(id: string): Promise<ReadResult> {
    if (!store) return { ok: false, why: "unavailable" };
    let found: Awaited<ReturnType<BackupStore["get"]>>;
    try {
      found = await store.get(id);
    } catch {
      return { ok: false, why: "unavailable" };
    }
    if (!found.meta && found.data === undefined) return { ok: false, why: "gone" };
    if (!found.meta || found.data === undefined) return { ok: false, why: "damaged" };
    let text: string;
    try {
      text = await unpack(found.meta.enc, found.data);
    } catch {
      return { ok: false, why: "damaged" };
    }
    const parsed = parseBackupText(text);
    if (!parsed.ok || parsed.hash !== found.meta.hash) return { ok: false, why: "damaged" };
    return { ok: true, meta: found.meta, text };
  }

  async function remove(id: string): Promise<boolean> {
    if (!store) return false;
    try {
      await store.remove([id]);
      touched();
      return true;
    } catch {
      return false;
    }
  }

  async function clear(): Promise<boolean> {
    if (!store) return false;
    try {
      await store.clear();
      touched();
      return true;
    } catch {
      return false;
    }
  }

  return { list, available, take, read, remove, clear, prune };
}

export type Backups = ReturnType<typeof createBackups>;

function browserStore(): BackupStore | null {
  const factory = browserIndexedDb();
  return factory ? idbBackupStore(factory) : null;
}

/** This browser's backups. */
export const backups: Backups = createBackups({ store: browserStore() });
