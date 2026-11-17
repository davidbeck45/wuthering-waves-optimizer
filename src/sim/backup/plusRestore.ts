// Wuthering Tools+ automatic backups — putting back what a backup carries beyond Ryan's export.
//
// His import replaces his three stores. This writes the plus records of the same backup, after his stores are stored:
//   · the Convene pull history is MERGED, never replaced. Pulls are facts about the game, the game drops them after
//     six months, and Convene's own imports only ever add (gachaImport.ts). A restore adds the pulls the backup has
//     and today's history lacks; it removes none. A history this build cannot read is left alone.
//   · the logged Tower clears, Echo plan and the album-import record go back to what the backup held (removed when it
//     held none): they are about the teams and echoes that were just replaced.
// A plain export from Ryan's Settings has none of this, and nothing is touched.
import { CONVENE_HISTORY_KEY, decodeConveneHistory, encodeConveneHistory, mergeIntoHistory, type ConveneHistory } from "../convene/gachaImport";
import { BACKUP_PLUS_KEYS, parseBackupText } from "./backupFile";

export interface PlusRestoreResult {
  /** the file had a plus part */
  plus: boolean;
  /** pulls added to the history by the merge */
  pullsAdded: number;
  /** keys written or removed */
  written: string[];
  /** keys the browser refused, or that could not be merged: left as they were */
  failed: string[];
}

type Area = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The backup's pull history merged into the stored one. null = nothing to write. Throws when either side cannot be
 *  read by this build: the stored history is then left exactly as it is. */
export function mergedPulls(storedRaw: string | null, backupRaw: string | null, at: number): { raw: string; added: number } | null {
  if (!backupRaw) return null;
  const incoming = decodeConveneHistory(backupRaw);
  const stored = decodeConveneHistory(storedRaw);
  if (!incoming.ok || !stored.ok) throw new Error("a pull history this build cannot read");
  let history: ConveneHistory = stored.history;
  let added = 0;
  for (const [playerId, player] of Object.entries(incoming.history.players)) {
    const merged = mergeIntoHistory(history, playerId, player.region, player.pools, "backup", at);
    if (!merged.summary.added) continue; // nothing new for this player: their record and import log stay as they are
    added += merged.summary.added;
    history = merged.history;
  }
  if (!added) return null;
  // which player the page shows stays the stored choice; a browser that had none takes the backup's
  const active = stored.history.activePlayerId ?? incoming.history.activePlayerId ?? history.activePlayerId;
  return { raw: encodeConveneHistory({ ...history, activePlayerId: active && history.players[active] ? active : history.activePlayerId }), added };
}

/** Writes the plus records of a backup file. Never throws; a key that fails is named and left as it was. */
export function restorePlusKeys(keys: Record<string, string | null>, storage: Area, at = Date.now()): PlusRestoreResult {
  const result: PlusRestoreResult = { plus: true, pullsAdded: 0, written: [], failed: [] };
  for (const key of BACKUP_PLUS_KEYS) {
    if (!(key in keys)) continue; // a backup from before this record was kept: it says nothing about it
    const value = keys[key] ?? null;
    try {
      if (key === CONVENE_HISTORY_KEY) {
        const merged = mergedPulls(storage.getItem(key), value, at);
        if (!merged) continue;
        storage.setItem(key, merged.raw);
        result.pullsAdded = merged.added;
      } else if (value === null) {
        if (storage.getItem(key) === null) continue;
        storage.removeItem(key);
      } else {
        if (storage.getItem(key) === value) continue;
        storage.setItem(key, value);
      }
      result.written.push(key);
    } catch {
      result.failed.push(key);
    }
  }
  return result;
}

/** The plus part of a file about to be imported, or null for a plain export or anything unreadable (his import has
 *  its own say on that). */
export function plusKeysOf(raw: string): Record<string, string | null> | null {
  const parsed = parseBackupText(raw);
  return parsed.ok && parsed.plus ? parsed.capture.keys : null;
}

/** What each record is called when one could not be put back. */
export const PLUS_KEY_NAMES: Record<string, string> = {
  "wtplus:convene:history": "the Convene pull history",
  "wtplus:endgame:clears": "the logged Tower clears",
  "wtplus:echoPlan:v1": "the Echo plan",
  "wuthering-tools-plus.echoScan.albums": "the list of album photos already imported",
};

export function plusFailureText(failed: readonly string[]): string {
  const names = failed.map((k) => PLUS_KEY_NAMES[k] ?? k);
  return `Your characters, echoes and teams were restored. Not restored, and left as it was: ${names.join(", ")}. This browser's storage may be full; the backup still holds it.`;
}
