// Wuthering Tools+ automatic backups — the words the list and its confirms use. Pure.
import type { BackupCounts, BackupMeta, BackupReason } from "./backupStore";
import { countsText } from "./counts";

export const REASON_TEXT: Record<BackupReason, string> = {
  daily: "Daily",
  manual: "Made by you",
  "before-import": "Before an import",
  "before-restore": "Before a restore",
  "before-delete": "Before a bulk delete",
};

/** why it was taken, in a sentence (the chip's tooltip) */
export const REASON_TITLE: Record<BackupReason, string> = {
  daily: "Taken automatically: the first visit of a day on which something had changed since the last backup",
  manual: "Taken when you pressed Back up now",
  "before-import": "Taken just before a Settings import replaced the account",
  "before-restore": "Taken just before a backup was restored over the account",
  "before-delete": "Taken just before several echoes or teams were deleted at once",
};

const sameDay = (a: Date, b: Date): boolean => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "Today 14:02", "Yesterday 21:15", "Nov 12, 21:15" (with the year when it is not this one). Local time; the clock
 *  time never breaks inside. */
export function whenText(at: number, nowMs = Date.now(), locale?: string): string {
  const d = new Date(at);
  const today = new Date(nowMs);
  const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }).replace(/\s/g, "\u00a0");
  if (sameDay(d, today)) return `Today ${time}`;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(d, yesterday)) return `Yesterday ${time}`;
  const date = d.toLocaleDateString(locale, { month: "short", day: "numeric", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) });
  return `${date}, ${time}`;
}

/** How old: "just now", "12 minutes ago", "3 hours ago", then whole days on the calendar ("yesterday", "5 days ago"). */
export function ageText(at: number, nowMs = Date.now()): string {
  const minutes = Math.floor(Math.max(0, nowMs - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24 && sameDay(new Date(at), new Date(nowMs))) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const day = (ms: number): number => {
    const d = new Date(ms);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  };
  const days = Math.max(1, Math.round((day(nowMs) - day(at)) / 86_400_000));
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/** "3.2 MB", "640 KB" (a no-break space: the unit never wraps away from its number) */
export function sizeText(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}\u00a0MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}\u00a0KB`;
  return `${bytes}\u00a0bytes`;
}

/** "41 KB in this browser · 330 KB as a file" */
export const sizesText = (meta: Pick<BackupMeta, "bytes" | "textLength">): string => `${sizeText(meta.bytes)} in this browser · ${sizeText(meta.textLength)} as a file`;

/** "the backup of Nov 12, 14:02" */
export const backupName = (at: number | null, nowMs = Date.now()): string => (at === null ? "this backup file" : `the backup of ${whenText(at, nowMs)}`);

export interface ConfirmText {
  title: string;
  message: string;
  items: string[];
  confirmLabel: string;
}

/** The Restore confirm: what is replaced, in plain words, and what happens first. `keeps`: this browser keeps
 *  backups, so today's account is saved before anything is replaced. `plus`: the backup carries the plus records.
 *  What is replaced and what is saved first is the paragraph; the list is two short lines at most, because the
 *  dialog's list scrolls inside a 12 rem box (ConfirmDialog.vue) and a 360 px phone at 130 % text has room for two. */
export function restoreConfirm(at: number | null, counts: BackupCounts, opts: { keeps: boolean; plus: boolean; nowMs?: number }): ConfirmText {
  const name = backupName(at, opts.nowMs);
  const first = opts.keeps
    ? "Today's account is saved first as a backup of its own (\"Before a restore\"), so you can come back to it."
    : "This browser isn't keeping backups, so today's account is NOT saved first: download a copy before you go on.";
  return {
    title: "Restore this backup?",
    message: `This replaces your characters and their saved builds, your echoes and your teams with ${name} (${countsText(counts)}). ${first}`,
    items: opts.plus
      ? ["Pull history: merged. Pulls are added, none are removed.", "Logged Tower clears and Echo plan: back to that backup's."]
      : ["A plain export: your pull history, logged Tower clears and Echo plan stay as they are."],
    confirmLabel: "Restore",
  };
}

export function deleteConfirm(meta: Pick<BackupMeta, "at" | "reason">, nowMs = Date.now()): ConfirmText {
  return {
    title: "Delete this backup?",
    message: `${backupName(meta.at, nowMs).replace(/^t/, "T")} (${REASON_TEXT[meta.reason].toLowerCase()}) is removed from this browser. It cannot be undone. Your account is not touched.`,
    items: [],
    confirmLabel: "Delete",
  };
}

/** What a take that kept nothing says to someone who pressed Back up now. */
export function notTakenText(why: "empty" | "unchanged" | "today" | "unavailable" | "full" | "failed", newest: Pick<BackupMeta, "at"> | undefined, nowMs = Date.now()): string {
  switch (why) {
    case "empty":
      return "There is nothing to back up yet: no character set up, no echoes, no teams and no pulls.";
    case "unchanged":
    case "today":
      return newest ? `Nothing has changed since ${backupName(newest.at, nowMs)}, so no new one was made.` : "Nothing has changed since the last backup, so no new one was made.";
    case "unavailable":
      return "This browser isn't keeping backups (a private window, or storage turned off). Download a copy instead.";
    case "full":
      return "This browser has no room for another backup, even after the oldest were removed. Download a copy instead.";
    default:
      return "The backup could not be made. Download a copy instead.";
  }
}

export const WHAT_IS_INSIDE_TEXT =
  "A backup holds your characters with every saved build, your echoes and echo presets, your teams and starred teams, your Convene pull history, the Tower clears you logged and your Echo plan.";
export const WHAT_IS_LEFT_OUT_TEXT =
  "Left out: this device's settings, results the site can work out again (rankings, checks), Build history and every Undo, and the assistant's API key, which never goes into a backup or a file.";
export const HOW_KEPT_TEXT = "Kept: the newest 7 daily ones, one a week for the 4 weeks before that, and the newest 20 made before an import, a restore or by you.";
