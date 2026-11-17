// Wuthering Tools+ automatic backups — getting a copy out of the browser, and remembering when one last left.
//
// The backups live in this browser, so they go when the browser's data for the site goes. Download writes a .json
// file. Share hands a file to the phone's share sheet (Drive, Files, email), with no sign-in for the site: the Google
// Drive backup, without an OAuth client.
//
// The shared file is a .txt. Chromium's share sheet (Chrome and Samsung Internet on Android) only takes files of a
// short list of types, and .json is not on it while plain text is: a .json share is refused with "Permission denied"
// even where `canShare` said yes. The text inside is the same backup, character for character. Restore from a file
// (BackupsView) takes either; Ryan's Settings › Import takes the .json, or the .txt's text pasted, or the file renamed.
import { shallowRef } from "vue";
import { downloadBlob } from "../../utils/downloadFile";
import { backupFileName } from "./backupFile";

export const BACKUP_STATE_KEY = "wtplus:backup:state";

/** `full`: one of ours, pull history and all · `plain`: Ryan's Settings › Download .json (characters, echoes, teams) */
export type CopyKind = "full" | "plain";

export interface OutsideState {
  /** when a copy last left this browser (ms) */
  at: number;
  how: "download" | "share";
  kind: CopyKind;
}

/** Bumped when a copy leaves: the status line on screen reads it. */
export const outsideChanged = shallowRef(0);

function localArea(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** An automatic backup that could not be stored: when, and whether the browser was out of room. */
export interface MissedBackup {
  at: number;
  why: "full" | "failed";
}

interface StoredState {
  v: 1;
  outside?: Partial<OutsideState>;
  missed?: Partial<MissedBackup>;
}

type Area = Pick<Storage, "getItem" | "setItem">;

function readState(storage: Pick<Storage, "getItem"> | null): StoredState | null {
  try {
    const state = JSON.parse(storage?.getItem(BACKUP_STATE_KEY) ?? "null") as StoredState | null;
    return state && typeof state === "object" && state.v === 1 ? state : null;
  } catch {
    return null;
  }
}

function writeState(storage: Area | null, change: (state: StoredState) => StoredState): void {
  try {
    storage?.setItem(BACKUP_STATE_KEY, JSON.stringify(change(readState(storage) ?? { v: 1 })));
  } catch {
    /* storage full or blocked: the line stays as it was */
  }
  outsideChanged.value += 1;
}

export function readOutside(storage: Pick<Storage, "getItem"> | null = localArea()): OutsideState | null {
  const o = readState(storage)?.outside;
  if (!o || typeof o.at !== "number" || !Number.isFinite(o.at)) return null;
  return { at: o.at, how: o.how === "share" ? "share" : "download", kind: o.kind === "plain" ? "plain" : "full" };
}

/** A copy just left this browser. A refused write only means the line stays as it was. */
export function noteCopyLeft(how: OutsideState["how"], kind: CopyKind, at = Date.now(), storage: Area | null = localArea()): void {
  writeState(storage, (state) => ({ ...state, outside: { at, how, kind } }));
}

/** The automatic backup that last could not be stored, if the one after it has not been stored since. */
export function readMissed(storage: Pick<Storage, "getItem"> | null = localArea()): MissedBackup | null {
  const m = readState(storage)?.missed;
  if (!m || typeof m.at !== "number" || !Number.isFinite(m.at)) return null;
  return { at: m.at, why: m.why === "full" ? "full" : "failed" };
}

/** What became of an automatic backup: one that could not be stored is remembered until one is. A backup that was
 *  not due (nothing changed, today's is there, an empty account) says nothing either way about room. */
export function noteAutomatic(result: { saved: boolean; why?: string }, at = Date.now(), storage: Area | null = localArea()): void {
  const missed: MissedBackup | null = !result.saved && (result.why === "full" || result.why === "failed") ? { at, why: result.why } : null;
  if (!missed && !result.saved) return;
  if (!missed && !readState(storage)?.missed) return; // nothing to clear: no write on an ordinary day
  writeState(storage, (state) => {
    const next: StoredState = { ...state };
    if (missed) next.missed = missed;
    else delete next.missed;
    return next;
  });
}

/** The words for it, on the Backups page and in Settings. */
export function missedText(missed: MissedBackup, when: string): string {
  return missed.why === "full"
    ? `The automatic backup of ${when} could not be stored: this browser has no room left. The backups it has are kept. Download or share a copy instead.`
    : `The automatic backup of ${when} could not be stored. The backups this browser has are kept. Download or share a copy instead.`;
}

/** "today", "yesterday", "34 days ago": whole days on the player's own calendar. */
export function daysAgoText(at: number, now = Date.now()): string {
  const day = (ms: number): number => {
    const d = new Date(ms);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  };
  const days = Math.max(0, Math.round((day(now) - day(at)) / 86_400_000));
  return days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

/** The status line. `kind: plain` says what that copy lacks. */
export function outsideText(state: OutsideState | null, now = Date.now()): string {
  if (!state) return "Last copy saved outside this browser: never";
  const tail = state.kind === "plain" ? " (a plain .json from Settings: characters, echoes and teams, no pull history)" : "";
  return `Last copy saved outside this browser: ${daysAgoText(state.at, now)}${tail}`;
}

/** A month without a copy outside (or never one): the line is marked, quietly. */
export const OUTSIDE_STALE_DAYS = 30;
export const outsideIsStale = (state: OutsideState | null, now = Date.now()): boolean => !state || now - state.at > OUTSIDE_STALE_DAYS * 86_400_000;

export const WHY_OUTSIDE_TEXT = "Backups here live in this browser. If the phone clears this site's data they go with your account, so put a copy somewhere else now and then.";
/** the same reason in one short sentence, for the line on My account */
export const WHY_OUTSIDE_SHORT = "The backups here go with your account if the phone clears this site's data.";

// ---- download

/* eslint-disable no-unused-vars -- parameter names in function types */
export function downloadBackupText(text: string, at: number, save: (content: string, filename: string) => void = downloadBlob): string {
  const name = backupFileName(at, "json");
  save(text, name);
  noteCopyLeft("download", "full");
  return name;
}

// ---- share

interface ShareNavigator {
  share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  canShare?: (data: { files?: File[] }) => boolean;
}
/* eslint-enable no-unused-vars */

const shareNavigator = (): ShareNavigator | null => (typeof navigator === "undefined" ? null : (navigator as unknown as ShareNavigator));

export function shareFileOf(text: string, at: number): File {
  return new File([text], backupFileName(at, "txt"), { type: "text/plain" });
}

/** Does this browser hand files to a share sheet? Asked with a file of the very kind that would be shared. */
export function canShareFiles(nav: ShareNavigator | null = shareNavigator()): boolean {
  try {
    if (!nav || typeof nav.share !== "function" || typeof nav.canShare !== "function" || typeof File === "undefined") return false;
    return nav.canShare({ files: [shareFileOf("{}", 0)] }) === true;
  } catch {
    return false;
  }
}

export type ShareOutcome = "shared" | "cancelled" | "failed";

/** Opens the share sheet with the backup as a file. `cancelled`: the player closed the sheet, which is no error.
 *  A copy counts as having left only when the sheet reports it was sent. */
export async function shareBackupText(text: string, at: number, nav: ShareNavigator | null = shareNavigator()): Promise<ShareOutcome> {
  if (!nav?.share) return "failed";
  try {
    await nav.share({ files: [shareFileOf(text, at)], title: "Wuthering Tools backup" });
  } catch (e) {
    return (e as { name?: string } | null)?.name === "AbortError" ? "cancelled" : "failed";
  }
  noteCopyLeft("share", "full");
  return "shared";
}

export const SHARE_FAILED_TEXT = "This browser would not share the file. Use Download instead.";
export const SHARED_AS_TEXT = "Shared as a .txt file (share sheets do not take .json). It is the same backup: Restore from a file takes it as it is.";
