// Wuthering Tools+ automatic backups — Restore: a stored backup or a backup file put back as the account.
//
// The order is the promise the confirm makes: (1) the backup is read and checked, and a damaged one stops here with
// today's account untouched; (2) today's account is saved as a "Before a restore" backup, and a browser that keeps
// backups but could not store this one stops here too; (3) the file goes through Ryan's own import
// (`applyImportedDatabase`: his migrations, and plus's checks before its first write, which keep a version of every
// build it replaces in Build history); (4) the plus records the backup carries are put back (plusRestore.ts).
import { CURRENT_DATA_VERSION } from "../../migrations";
import { getImportData, parseStorePayload } from "../../utils/settingsBackup";
import type { TakeResult } from "./autoBackup";
import { parseBackupText, type Capture } from "./backupFile";
import type { BackupCounts, BackupReason } from "./backupStore";
import { countsOf, isEmptyAccount } from "./counts";
import { CONVENE_HISTORY_KEY } from "../convene/gachaImport";
import type { PlusRestoreResult } from "./plusRestore";

/** A restore that changed nothing. Its message is the sentence the player reads. */
export class RestoreRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RestoreRefused";
  }
}

export const NOT_A_BACKUP_TEXT = "That is not a backup this page can read, so nothing was changed. A very old export goes under Settings › Backup & Restore.";
export const NEWER_BACKUP_TEXT = "That backup was made by a newer version of this site, so nothing was changed. Reload the page to update, then restore it again.";
export const DAMAGED_BACKUP_TEXT = "That backup is damaged and can't be read, so nothing was changed. Your account is as it was.";
export const GONE_BACKUP_TEXT = "That backup is no longer in this browser (another tab may have deleted it). Nothing was changed.";
export const UNAVAILABLE_TEXT = "This browser isn't keeping backups (a private window, or storage turned off).";
export const NOT_SAVED_FIRST_TEXT = "Today's account could not be saved as a backup first, so nothing was changed. Download a copy, then try again.";

export interface InspectedBackup {
  capture: Capture;
  counts: BackupCounts;
  /** when it was made, if the file says (one of ours does) */
  madeAt: number | null;
  reason: BackupReason | null;
  /** one of ours: it carries the plus records */
  plus: boolean;
}

/** Reads a backup file's text for the confirm: what is inside, counted on the stores after Ryan's migrations, so an
 *  old file reads as it will import. Throws `RestoreRefused` on anything that is not a backup. */
export function inspectBackupText(text: string): InspectedBackup {
  const parsed = parseBackupText(text);
  if (!parsed.ok) throw new RestoreRefused(parsed.why === "newer" ? NEWER_BACKUP_TEXT : NOT_A_BACKUP_TEXT);
  let read: ReturnType<typeof getImportData>;
  try {
    read = getImportData(text, true);
  } catch {
    throw new RestoreRefused(DAMAGED_BACKUP_TEXT);
  }
  // A data version ahead of this build's (a tab opened before a deploy, a rollback): his migrations would run none
  // and his import would stamp the stores as this build's version, so the next deploy migrates them a second time.
  if (read.dataVersion > CURRENT_DATA_VERSION) throw new RestoreRefused(NEWER_BACKUP_TEXT);
  let counts: BackupCounts;
  try {
    counts = countsOf(
      {
        character: parseStorePayload(read.character, read.dataVersion),
        inventory: parseStorePayload(read.inventory, read.dataVersion),
        teamRotations: parseStorePayload(read.teamRotations, read.dataVersion),
      },
      parsed.capture.keys[CONVENE_HISTORY_KEY],
    );
  } catch {
    throw new RestoreRefused(DAMAGED_BACKUP_TEXT);
  }
  if (isEmptyAccount(counts)) throw new RestoreRefused("That backup has no characters, echoes, teams or pulls in it, so nothing was changed.");
  return { capture: parsed.capture, counts, madeAt: parsed.madeAt, reason: parsed.reason, plus: parsed.plus };
}

/* eslint-disable no-unused-vars -- the parameters of interface methods */
export interface RestoreEnv {
  /** saves today's account first (liveCapture.ts `takeNow("before-restore")`) */
  saveFirst: () => Promise<TakeResult>;
  /** Ryan's `applyImportedDatabase`; throws `ImportRefused` before its first write */
  apply: (raw: string) => void;
  /** the plus half of that import, once written (importHook.ts `settledPlusRestore`) */
  plusDone: () => Promise<PlusRestoreResult>;
}
/* eslint-enable no-unused-vars */

export interface RestoreOutcome {
  /** what became of today's account: saved now, already held by the newest backup, or nothing to save */
  first: TakeResult;
  plus: PlusRestoreResult;
}

/** Puts a backup file's text back as the account. Throws `RestoreRefused` (or the import's own `ImportRefused`) with
 *  the account untouched; resolves once everything is written. The caller reloads the page. */
export async function restoreBackupText(text: string, env: RestoreEnv): Promise<RestoreOutcome> {
  inspectBackupText(text); // refuses anything that is not a backup before today's account is even saved
  const first = await env.saveFirst();
  // `unavailable`: this browser keeps no backups, and the confirm said so. Anything else that did not save is a stop.
  if (!first.saved && (first.why === "full" || first.why === "failed")) throw new RestoreRefused(NOT_SAVED_FIRST_TEXT);
  env.apply(text);
  return { first, plus: await env.plusDone() };
}
