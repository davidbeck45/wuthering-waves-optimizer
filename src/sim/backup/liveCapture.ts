// Wuthering Tools+ automatic backups — the account as it is stored right now, through Ryan's own export code, and a
// backup taken from it. Apart from autoBackup.ts so that module never imports his settingsBackup.ts, which imports
// the import hook, which imports autoBackup.ts.
import { getExportData } from "../../utils/settingsBackup";
import { backups, type TakeResult } from "./autoBackup";
import { backupFile, captureAccount, type Capture, type RyanExport } from "./backupFile";
import type { BackupReason } from "./backupStore";

export const captureNow = (): Capture => captureAccount(getExportData as () => RyanExport);

/** Takes a backup of the account as it is now, if it is worth one (autoBackup.ts `take`). Never rejects. */
export async function takeNow(reason: BackupReason): Promise<TakeResult> {
  let capture: Capture;
  try {
    capture = captureNow();
  } catch {
    return { saved: false, why: "failed" }; // storage blocked
  }
  try {
    return await backups.take(reason, capture);
  } catch {
    return { saved: false, why: "failed" };
  }
}

/** The account as it is now as a backup file's text: what Download and Share send when no stored backup is named.
 *  Works where the browser keeps no backups at all. */
export function currentFileText(now = Date.now()): { text: string; at: number; capture: Capture } {
  const capture = captureNow();
  return { text: JSON.stringify(backupFile(capture, "manual", now)), at: now, capture };
}
