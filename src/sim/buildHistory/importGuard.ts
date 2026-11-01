// Wuthering Tools+ build history — a version of every build a Settings import (or a backup restore) is about to replace.
// Upstream's `applyImportedDatabase` overwrites the whole account through `characterStore.hardSetState` and reloads the
// page 1.5 s later. Pinia's `$onAction` runs this listener just before that action, while the stores still hold the old
// account: the characters whose record the import changes are copied (with the inventory echoes they wear) into
// `localStorage["wtplus:buildHistory:pendingImport"]` at once, and turned into versions by the history module — right
// away when its chunk loads in time, else on the next page load. Light on purpose: PlusShell (the main bundle) mounts it,
// so the share codec and the engine stay in the lazy chunk.

/* eslint-disable @typescript-eslint/no-explicit-any */

export const PENDING_KEY = "wtplus:buildHistory:pendingImport";

interface PendingImport {
  v: 1;
  at: number;
  characters: Record<string, any>;
  echoes: any[];
}

interface Stores {
  character: { characters: Record<string, any>; $onAction: (cb: (ctx: { name: string; args: any[] }) => void, detached?: boolean) => () => void };
  inventory: { echoes: any[] };
}

const json = (v: unknown): string => JSON.stringify(v ?? null);

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/** The characters an incoming account changes (or drops), with the inventory echoes their slots point at. */
export function pendingFrom(current: Record<string, any>, incoming: Record<string, any> | undefined, echoes: any[], now = Date.now()): PendingImport | null {
  const characters: Record<string, any> = {};
  const wanted = new Set<string>();
  for (const [id, record] of Object.entries(current ?? {})) {
    if (!record || json(record) === json(incoming?.[id])) continue;
    characters[id] = JSON.parse(json(record));
    for (const slot of Object.values((record.echoes ?? {}) as Record<string, any>)) if (slot?.echoId) wanted.add(slot.echoId);
  }
  if (!Object.keys(characters).length) return null;
  return { v: 1, at: now, characters, echoes: (echoes ?? []).filter((e) => wanted.has(e?.echoId)).map((e) => JSON.parse(json(e))) };
}

/** Turns a stashed import into versions ("Before a Settings import"), then forgets it. */
export async function flushPendingImport(): Promise<number> {
  const s = storage();
  const raw = s?.getItem(PENDING_KEY);
  if (!raw) return 0;
  let pending: PendingImport | null = null;
  try {
    pending = JSON.parse(raw) as PendingImport;
  } catch {
    pending = null;
  }
  if (!pending || pending.v !== 1 || !pending.characters) {
    s?.removeItem(PENDING_KEY);
    return 0;
  }
  const { snapshotCharacters } = await import("./history");
  // still there? (two tabs, or the earlier call already did it)
  if (s?.getItem(PENDING_KEY) !== raw) return 0;
  const results = snapshotCharacters(Object.keys(pending.characters), "before-import", { characters: pending.characters, echoes: pending.echoes ?? [] }, { now: pending.at });
  s?.removeItem(PENDING_KEY);
  return results.filter((r) => r.saved).length;
}

/** Listens for the account being replaced; returns the unsubscribe. */
export function installImportGuard(stores: Stores): () => void {
  void flushPendingImport().catch(() => undefined);
  return stores.character.$onAction(({ name, args }) => {
    if (name !== "hardSetState") return;
    try {
      const pending = pendingFrom(stores.character.characters, args?.[0]?.characters, stores.inventory.echoes);
      if (!pending) return;
      storage()?.setItem(PENDING_KEY, JSON.stringify(pending));
      void flushPendingImport().catch(() => undefined);
    } catch {
      // a history snapshot must never stop the import
    }
  }, true);
}
