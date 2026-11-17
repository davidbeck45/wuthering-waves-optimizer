// Wuthering Tools+ numbers log — when a Settings import last replaced the account. buildHistory/importGuard.ts stamps it
// in the same listener that keeps a version of the builds being replaced; the log reads it so "What moved" can say once
// that an import sits between two records, instead of putting every change on the player. Light on purpose: importGuard
// is in the entry chunk.

export const IMPORT_STAMP_KEY = "wtplus:numbers:importedAt";

type Area = Pick<Storage, "getItem" | "setItem">;

function local(): Area | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // storage blocked
  }
}

/** The account is being replaced by an import right now. Never throws: an import must not fail on it. */
export function stampImport(now: number = Date.now(), storage: Area | null = local()): void {
  try {
    storage?.setItem(IMPORT_STAMP_KEY, String(now));
  } catch {
    /* a full browser: the next record just does not mention the import */
  }
}

/** When the last import was (ms), or null. */
export function readImportStamp(storage: Area | null = local()): number | null {
  try {
    const at = Number(storage?.getItem(IMPORT_STAMP_KEY));
    return Number.isFinite(at) && at > 0 ? at : null;
  } catch {
    return null;
  }
}
