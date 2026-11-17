// Wuthering Tools+ automatic backups — the account as it is stored right now, through Ryan's own export code, and a
// backup taken from it. Apart from autoBackup.ts so that module never imports his settingsBackup.ts, which imports
// the import hook, which imports autoBackup.ts.
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { getExportData } from "../../utils/settingsBackup";
import { backups, type TakeResult } from "./autoBackup";
import { backupFile, captureAccount, type Capture, type RyanExport } from "./backupFile";
import type { BackupReason } from "./backupStore";
import { installBulkGuard, type ActionStore } from "./bulkGuard";
import { backupAllowed } from "./install";
import { noteAutomatic } from "./outside";

export const captureNow = (): Capture => captureAccount(getExportData as () => RyanExport);

/** Takes a backup of the account as it is now, if it is worth one (autoBackup.ts `take`). Never rejects. */
export async function takeNow(reason: BackupReason): Promise<TakeResult> {
  let capture: Capture;
  try {
    capture = captureNow();
  } catch {
    return { saved: false, why: "failed" }; // storage blocked
  }
  let result: TakeResult;
  try {
    result = await backups.take(reason, capture);
  } catch {
    result = { saved: false, why: "failed" };
  }
  // an automatic backup that could not be stored is said on the Backups page, until one is stored again
  if (reason === "daily" || result.saved) noteAutomatic(result);
  return result;
}

let bulkGuardOn = false;

/** Starts the backup before a bulk delete (bulkGuard.ts), once. Called when this module is first loaded by the
 *  shell's timer (install.ts), so the stores are there. */
export function startBulkGuard(): void {
  if (bulkGuardOn) return;
  try {
    installBulkGuard(
      { inventory: useInventoryStore() as unknown as ActionStore, teams: useTeamRotationsStore() as unknown as ActionStore },
      { allowed: () => backupAllowed(), capture: captureNow, take: (reason, capture) => backups.take(reason, capture) },
    );
    bulkGuardOn = true;
  } catch {
    /* no Pinia here (a script): nothing to guard */
  }
}

/** The account as it is now as a backup file's text: what Download and Share send when no stored backup is named.
 *  Works where the browser keeps no backups at all. */
export function currentFileText(now = Date.now()): { text: string; at: number; capture: Capture } {
  const capture = captureNow();
  return { text: JSON.stringify(backupFile(capture, "manual", now)), at: now, capture };
}
