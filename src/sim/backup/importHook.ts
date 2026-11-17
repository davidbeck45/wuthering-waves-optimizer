// Wuthering Tools+ automatic backups — the two things that happen around an import that replaces the account
// (Ryan's `applyImportedDatabase`, src/utils/settingsBackup.ts: Settings › Import & overwrite, and a Restore here).
//
//   const plus = beforeAccountReplaced(raw, getExportData);   // after his checks, before his first write
//   … his three stores are replaced …
//   plus.restore();                                            // after his last write
//
// Before: the account as it is stored is read on the spot (synchronously: his writes follow at once) and kept as a
// "Before an import" backup. Build history keeps the builds worn; this keeps everything, teams and other builds
// included. After: what a Tools+ backup carries beyond his export goes back (plusRestore.ts), one tick later, so his
// stores are in storage first and a full browser refuses these rather than them.
import { nextTick } from "vue";
import { useToast } from "../../composables/useToast";
import { backups, type Backups } from "./autoBackup";
import { captureAccount, type RyanExport } from "./backupFile";
import { backupAllowed } from "./install";
import { plusFailureText, plusKeysOf, restorePlusKeys, type PlusRestoreResult } from "./plusRestore";

const NOTHING: PlusRestoreResult = { plus: false, pullsAdded: 0, written: [], failed: [] };

/** What the hook leans on: this browser's backups, and whether they run at all here. A test swaps them. */
export const hookEnv: { allowed: () => boolean; take: Backups["take"] } = {
  allowed: () => backupAllowed(),
  take: (reason, capture) => backups.take(reason, capture),
};

/** The plus half of the import under way: a Restore waits on it to say what came back. */
let lastPlusRestore: Promise<PlusRestoreResult> = Promise.resolve(NOTHING);
export const settledPlusRestore = (): Promise<PlusRestoreResult> => lastPlusRestore;

function localArea(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function beforeAccountReplaced(raw: string, exportNow: () => RyanExport): { restore: () => void } {
  // a backup must never stop the import it guards
  try {
    if (hookEnv.allowed()) {
      const capture = captureAccount(exportNow);
      void hookEnv.take("before-import", capture).catch(() => undefined);
    }
  } catch {
    /* storage blocked */
  }
  let keys: Record<string, string | null> | null = null;
  try {
    keys = plusKeysOf(raw);
  } catch {
    keys = null;
  }
  return {
    restore(): void {
      const wanted = keys;
      if (!wanted) {
        lastPlusRestore = Promise.resolve(NOTHING);
        return;
      }
      lastPlusRestore = nextTick().then(() => {
        const storage = localArea();
        const result = storage ? restorePlusKeys(wanted, storage) : { ...NOTHING, plus: true, failed: Object.keys(wanted).filter((k) => wanted[k] !== null) };
        if (result.failed.length) {
          try {
            useToast().showToast(plusFailureText(result.failed), "error", 12000);
          } catch {
            /* no page to say it on */
          }
        }
        return result;
      });
    },
  };
}
