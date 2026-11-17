// Wuthering Tools+ — what Settings › Delete your data takes, beyond upstream's two stores (2026-11-08 hunt, M2).
//
// Upstream blanks `character` and `inventory`. It leaves the teams, and it knows nothing of what the plus pages keep,
// so after a Delete /teams still listed teams pinned to builds that were gone, /build-history offered Restore for
// characters that no longer existed, and /energy read the leftover teams as "3 / 3 checked, every Liberation paid".
// `deleteAccountData` is the one call `clearAllUserData` makes (src/utils/settingsBackup.ts).
//
// The rule. Delete takes the account (characters, echoes, teams: what a backup holds) and everything kept FROM it:
// copies of its builds, results worked out on it, and choices that point at its teams or echoes. It leaves this
// device's settings, and records about the game rather than about builds: the Convene pull history (the game drops
// pulls after six months, so it cannot be fetched again, and My pulls has its own Forget) and Today's checklist.
//
// `STORAGE_RULES` is every place the app keeps something in the browser, with what Delete does to it and why.
// deleteAccount.test.ts reads the source for key names and fails on one that is not listed, so a new key cannot be
// left out without a decision. The words the player reads (DELETE_*) say the same thing as the rules.
//
// Each rule also says whether an automatic backup holds it (`backup`, read by src/sim/backup/backupFile.ts; the guard
// is backup/backupRules.test.ts). A backup is the account and nothing made from it: Ryan's export, plus the records
// only plus keeps that nothing could make again.
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { dropBackupDatabase } from "../backup/backupStore";
import { savedResults, type SavedResults } from "../persist/savedResults";

export type StorageArea = "local" | "session" | "local+session" | "indexedDB";

export interface StorageRule {
  /** the key (a database name for IndexedDB) */
  key: string;
  /** `key` is the start of many keys, one per character */
  prefix?: true;
  area: StorageArea;
  fate: "goes" | "stays";
  /** a record that holds both: these fields stay, the rest goes */
  keep?: readonly string[];
  /** who empties it: upstream's own two lines, the teams store, `savedResults.clear()`, or the backups' own database
   *  delete. None = removed here. */
  by?: "upstream" | "teams" | "savedResults" | "backups";
  /** does a backup hold it? (`BACKUP_CLASS_TEXT` says what each answer means) */
  backup: BackupClass;
  /** what it holds, and so why it goes or stays */
  why: string;
}

/** Whether a backup holds a record, and why. Only "export" and "account" are in one. */
export type BackupClass = "export" | "account" | "copy" | "cache" | "preference" | "session" | "marker" | "secret";

export const BACKUP_CLASS_TEXT: Record<BackupClass, string> = {
  export: "in a backup, inside Ryan's own export: his three stores and the data version they are in",
  account: "in a backup: a record only Tools+ keeps, that nothing could make again",
  copy: "not in a backup: a copy or an Undo of builds the account holds. The backups are the whole-account history",
  cache: "not in a backup: worked out from the account, or fetched from a public page. It is made again",
  preference: "not in a backup: this device's settings, as in Ryan's export",
  session: "not in a backup: this tab's own state, gone when the tab closes",
  marker: "not in a backup: bookkeeping about this browser",
  secret: "never in a backup or a file",
};

const TEAMS_KEY = "teamRotations";

// A second tab (2026-11-16, second check). sessionStorage is per tab, so the tab that deletes cannot reach what another
// tab keeps there, and that tab's pages hold the account in memory: after a Delete its Ask sheet still showed the
// conversation about the deleted account (and would have sent its snapshot again), its copies of the ranking and the
// investment plan stayed (190 KB), and an Energy check still running there wrote the deleted teams' measurements back
// into localStorage when it finished. Delete now leaves a stamp; a tab that sees a stamp it has not acted on drops its
// own copies, and one that is open while it happens reloads, as the deleting tab does (`installDeleteWatch`).
/** localStorage: the last Delete your data, in any tab ("<ms since epoch>:<random>"). */
export const ACCOUNT_DELETED_KEY = "wtplus:account:deletedAt";
/** sessionStorage: the Delete this tab has acted on (the value of `ACCOUNT_DELETED_KEY` then). */
export const DELETE_SEEN_KEY = "wtplus:account:deleteSeen";

export const STORAGE_RULES: readonly StorageRule[] = [
  // ---- the account: what a backup holds
  { key: "character", area: "local", fate: "goes", by: "upstream", backup: "export", why: "your characters and their builds" },
  { key: "inventory", area: "local", fate: "goes", by: "upstream", backup: "export", why: "your echoes and echo presets" },
  { key: TEAMS_KEY, area: "local", fate: "goes", by: "teams", backup: "export", why: "your teams, starred teams and starred stock teams: a backup holds them, and a team pins builds that are gone" },

  // ---- copies of the account's builds
  { key: "wtplus:buildHistory:v1:", prefix: true, area: "local", fate: "goes", backup: "copy", why: "Build history: earlier versions of each character's build, with Restore" },
  { key: "wtplus:buildHistory:pendingImport", area: "local", fate: "goes", backup: "copy", why: "builds an import was about to replace, waiting to become Build history versions" },
  { key: "wtplus:buildTeam:undo:v1", area: "local", fate: "goes", backup: "copy", why: "Build my team's Undo: the builds and pins as they were" },
  { key: "wtplus:buildAccount:undo:v1", area: "local", fate: "goes", backup: "copy", why: "Whole account's Undo: the builds and pins as they were" },
  { key: "wtplus:rankings:sync:undo:v1", area: "local", fate: "goes", backup: "copy", why: "Sync my teams' Undo: the teams as they were" },
  { key: "wtplus:rankings:sync:durations:v1", area: "local", fate: "goes", backup: "copy", why: "Sync my teams' Undo: the loop times it filled on your rotations" },

  // ---- results worked out on the account
  { key: "wtplus:energy:v1", area: "local", fate: "goes", backup: "cache", why: "the Energy check's measurements of your teams" },
  { key: "wtplus:endgame:check", area: "local", fate: "goes", backup: "cache", why: "the last Tower of Adversity check: your teams' kill times" },
  { key: "wtplus:endgame:clears", area: "local", fate: "goes", backup: "account", why: "the clears you logged, each beside what the check gave that team" },
  { key: "wuwa.solves.v1", area: "local", fate: "goes", backup: "cache", why: "the rankings page's solves, the ones at your account among them" },
  { key: "wtplus-results", area: "indexedDB", fate: "goes", by: "savedResults", backup: "cache", why: "saved results (stores meta and data): rankings, the investment plan, echo checks, Echo Lab, weapon value" },
  { key: "wtplus:myRankings:last", area: "session", fate: "goes", by: "savedResults", backup: "cache", why: "this tab's copy of My rankings" },
  { key: "wtplus:account:invest", area: "session", fate: "goes", by: "savedResults", backup: "cache", why: "this tab's copy of the investment plan" },
  { key: "wtplus:account:echoCheck", area: "session", fate: "goes", by: "savedResults", backup: "cache", why: "this tab's copy of Check my echoes" },
  { key: "wtplus:echoLab:cache", area: "session", fate: "goes", by: "savedResults", backup: "cache", why: "this tab's copy of Echo Lab's verdicts" },
  { key: "wtplus:weapons:value", area: "session", fate: "goes", by: "savedResults", backup: "cache", why: "this tab's copy of the weapon values" },
  { key: "wtplus:weapons:selector", area: "session", fate: "goes", by: "savedResults", backup: "cache", why: "this tab's copy of the selector picks" },
  { key: "wtplus:ai:chat", area: "session", fate: "goes", backup: "session", why: "this tab's Ask chat: it opens with a snapshot of the account" },

  // ---- choices that point at the account's teams and echoes
  { key: "wtplus:buildAccount:choice:v1", area: "local", fate: "goes", backup: "preference", why: "the teams picked for Whole account, by team id" },
  { key: "wtplus:echoPlan:v1", area: "local", fate: "goes", keep: ["v", "options", "server"], backup: "account", why: "Echo plan: its done ticks, planned and excluded characters, overrides and Plan Codes go; its switches and server stay" },
  { key: "wuthering-tools-plus.echoScan.albums", area: "local", fate: "goes", backup: "account", why: "which album photos were already imported: kept, a new scan would skip the echoes just deleted" },
  { key: "teamRotationsActiveTeamId", area: "session", fate: "goes", backup: "session", why: "the team open in this tab, by team id" },

  // ---- this device's settings
  { key: "settings", area: "local", fate: "stays", backup: "preference", why: "theme, UI version, Labs switches, echo rating weights, recent enemies, roster filters" },
  { key: "dataVersion", area: "local", fate: "stays", backup: "export", why: "the data format this browser is on" },
  { key: "teamRotationsViewMode", area: "local", fate: "stays", backup: "preference", why: "Teams as a grid or a list" },
  { key: "echoScanner.guideSeen", area: "local", fate: "stays", backup: "preference", why: "the scanner's guide was seen" },
  { key: "echoScanner.captureCue", area: "local", fate: "stays", backup: "preference", why: "the scanner's capture sound" },
  { key: "wt-classic-ui-session-reported", area: "session", fate: "stays", backup: "marker", why: "a once-per-tab marker" },
  { key: "wtplus:ai:key", area: "local+session", fate: "stays", backup: "secret", why: "the assistant's API key" },
  { key: "wtplus:ai:settings", area: "local", fate: "stays", backup: "preference", why: "the assistant's model, effort and budget" },
  { key: "wtplus:account:prefs", area: "local", fate: "stays", backup: "preference", why: "My account's filter and sort" },
  { key: "wtplus:buildTeam:options:v1", area: "local", fate: "stays", backup: "preference", why: "Build my team's five switches" },
  { key: "wtplus:convene:prefs", area: "local", fate: "stays", backup: "preference", why: "Convene's server region and options" },
  { key: "wtplus:echoLab:tunerBudget", area: "local", fate: "stays", backup: "preference", why: "the Tuners and Echo EXP typed into the budget planner: a planner input, read from no build" },
  { key: "wtplus:endgame:prefs", area: "local", fate: "stays", backup: "preference", why: "Endgame's server region and clock options" },
  { key: "wtplus:inventory:sort", area: "local", fate: "stays", backup: "preference", why: "the inventory's plus sort" },
  { key: "wtplus:myRankings:prefs", area: "local", fate: "stays", backup: "preference", why: "My rankings' investment and sort" },
  { key: "wtplus:rankings:tier:v1", area: "local", fate: "stays", backup: "preference", why: "the tier /rankings opens on" },
  { key: "wtplus:rankings:views", area: "local", fate: "stays", backup: "preference", why: "the views saved on /rankings: names and filters" },
  { key: "wtplus:rotation:v1", area: "local", fate: "stays", backup: "preference", why: "the rotation view's beep and text size" },
  { key: "wtplus:share:prefs", area: "local", fate: "stays", backup: "preference", why: "the share card's theme and numbers switch" },
  { key: "wtplus:teamBuffs:auto", area: "local", fate: "stays", backup: "preference", why: "the team-aware buffs switch" },
  { key: "wtplus:weapons:prefs", area: "local", fate: "stays", backup: "preference", why: "Weapon value's scope, sort and filter" },
  { key: "wtplus:weapons:custom", area: "local", fate: "stays", backup: "preference", why: "the resonators added to the custom selector pool" },
  { key: "wtplus:welcome:dismissed", area: "local", fate: "stays", backup: "preference", why: "the welcome card was closed" },
  { key: "wtplus:whatsNew:seen", area: "local", fate: "stays", backup: "preference", why: "which What's new entries this browser has seen: about the site, not about builds" },
  { key: "wtplus:welcome:e2e", area: "local", fate: "stays", backup: "marker", why: "a test switch" },
  { key: "wuwa.tutorialDone", area: "local", fate: "stays", backup: "preference", why: "the rankings page's tutorial was done" },
  { key: "wuwa.tutorialStage", area: "local", fate: "stays", backup: "preference", why: "where its tutorial stopped" },
  { key: "wuwa.logColumns", area: "local", fate: "stays", backup: "preference", why: "its log's column order" },
  { key: "wuwa.copyMode", area: "local", fate: "stays", backup: "preference", why: "its copy format" },

  // ---- records about the game, not about builds
  { key: "wtplus:convene:history", area: "local", fate: "stays", backup: "account", why: "your Convene pull history: the game drops pulls after six months, so it cannot be fetched again; My pulls has its own Forget" },
  { key: "wtplus:today:v1", area: "local", fate: "stays", backup: "preference", why: "Today's Waveplate count, checklist ticks and options" },

  // ---- public data and bookkeeping
  { key: "wtplus:convene:banners", area: "local", fate: "stays", backup: "cache", why: "a copy of the public banner notices" },
  { key: "wtplus:today:news:v1", area: "local", fate: "stays", backup: "cache", why: "a copy of the public news" },
  { key: "wtplus:savedResults:clearedAt", area: "local", fate: "stays", backup: "marker", why: "when saved results were last cleared: Delete sets it" },
  { key: "wtplus:account:deletedAt", area: "local", fate: "stays", backup: "marker", why: "when Delete your data last ran, in any tab: the other tabs drop their own copies when they see it" },
  { key: "wtplus:account:deleteSeen", area: "session", fate: "stays", backup: "session", why: "the last Delete this tab has acted on" },
  { key: "wtplus:chunkReloadAt", area: "session", fate: "stays", backup: "marker", why: "when this tab last reloaded for a new deploy" },
  { key: "wtplus:storage:probe", area: "local", fate: "stays", backup: "marker", why: "a scratch key, never left behind" },

  // ---- the automatic backups (src/sim/backup/)
  { key: "wtplus-backups", area: "indexedDB", fate: "goes", by: "backups", backup: "copy", why: "the automatic backups (stores meta and data): whole copies of the account, so Delete takes them. A downloaded or shared copy is yours to keep" },
  { key: "wtplus:backup:state", area: "local", fate: "goes", backup: "marker", why: "when a copy of this account last left the browser (Download or Share)" },
  { key: "wtplus:backup:e2e", area: "local", fate: "stays", backup: "marker", why: "a test switch" },
];

/** The Danger Zone card. */
export const DELETE_CARD_TEXT = "Deletes your characters, builds, echoes and teams from this browser, with everything this site kept or worked out about them, the automatic backups included. Your settings stay.";

/** The confirm. The paragraph says what goes and that it is final; the list is what stays. The list sits in a box that
 *  scrolls past 12rem, so it is kept to two lines that fit a 360 px phone at 130 % text without scrolling. */
export const DELETE_CONFIRM_TEXT =
  "This deletes your characters and their builds, your echoes and your teams. Build history, every Undo, the automatic backups in this browser, saved results, the Energy and Tower checks, your logged clears, Echo plan progress and this tab's Ask chat go with them. It cannot be undone: download a copy first if you may want them back.";
export const DELETE_CONFIRM_ITEMS: readonly string[] = [
  "Kept: your settings (theme, UI version, Labs switches, page options) and the assistant's API key.",
  "Kept: your Convene pull history (My pulls has its own Forget) and Today's checklist.",
];

/* eslint-disable no-unused-vars -- the parameters of interface methods */
export interface DeleteEnv {
  local: Storage | null;
  session: Storage | null;
  teams: { hardSetState(data?: unknown): void } | null;
  results: Pick<SavedResults, "clear">;
  /** runs `again` once as this page goes away (the reload 1.5 s after a Delete); none = `pagehide` on window */
  onLeave(again: () => void): void;
  now(): number;
  /** deletes the automatic backups' database */
  dropBackups: () => void;
}
/* eslint-enable no-unused-vars */

function browserArea(name: "localStorage" | "sessionStorage"): Storage | null {
  try {
    return typeof window === "undefined" ? null : window[name];
  } catch {
    return null; // storage blocked
  }
}

function keysOf(store: Storage): string[] {
  const out: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k != null) out.push(k);
  }
  return out;
}

/** Removes what `rule` names from one storage area; a record with `keep` is pared down to those fields. */
function drop(store: Storage | null, rule: StorageRule): void {
  if (!store) return;
  try {
    if (rule.prefix) {
      for (const k of keysOf(store)) if (k.startsWith(rule.key)) store.removeItem(k);
      return;
    }
    if (rule.keep) {
      const raw = store.getItem(rule.key);
      if (raw == null) return;
      let kept: Record<string, unknown> | null = null;
      try {
        const data = JSON.parse(raw) as Record<string, unknown> | null;
        if (data && typeof data === "object" && !Array.isArray(data)) kept = Object.fromEntries(rule.keep.filter((f) => f in data).map((f) => [f, data[f]]));
      } catch {
        kept = null; // unreadable: nothing in it is worth keeping
      }
      if (kept) store.setItem(rule.key, JSON.stringify(kept));
      else store.removeItem(rule.key);
      return;
    }
    store.removeItem(rule.key);
  } catch {
    /* a storage that refuses: the other keys still go */
  }
}

/**
 * Everything of the account that upstream's Delete leaves behind. Called by `clearAllUserData` after it has blanked
 * the characters and the inventory; the page reloads 1.5 s later, which drops what the pages hold in memory.
 */
export function deleteAccountData(env: Partial<DeleteEnv> = {}): void {
  const local = "local" in env ? (env.local ?? null) : browserArea("localStorage");
  const session = "session" in env ? (env.session ?? null) : browserArea("sessionStorage");

  // the teams: blanked in storage as upstream blanks its two stores (the reload reads "" as none, and another tab
  // takes it as a delete), and emptied in this tab so nothing written before that reload brings them back
  try {
    local?.setItem(TEAMS_KEY, "");
  } catch {
    /* refused: the store's own write below still empties it */
  }
  try {
    ("teams" in env ? env.teams : useTeamRotationsStore())?.hardSetState(undefined);
  } catch {
    /* no Pinia here (a script): the stored record is blank */
  }

  const sweep = (): void => {
    for (const rule of STORAGE_RULES) {
      if (rule.fate !== "goes" || rule.by) continue;
      if (rule.area === "local" || rule.area === "local+session") drop(local, rule);
      if (rule.area === "session" || rule.area === "local+session") drop(session, rule);
    }
  };
  sweep();

  // the saved results (IndexedDB), each tab copy, and what a loaded page cache holds in memory: they are figures
  // from the account just deleted
  void (env.results ?? savedResults).clear();

  // the automatic backups: whole copies of the account just deleted. The delete is asked for here and now, since the
  // page reloads 1.5 s later
  try {
    (env.dropBackups ?? dropBackupDatabase)();
  } catch {
    /* no IndexedDB here: there were none */
  }

  // a check still running on this page (the Energy check, a Tower check) writes its result when it ends, which can be
  // inside the 1.5 s before the reload: the same keys go once more as the page leaves
  try {
    (env.onLeave ?? leaveOnce)(sweep);
  } catch {
    /* no window (a script): nothing runs on */
  }

  // last, so another tab acts on a finished Delete: the stamp it watches for, already acted on here
  const stamp = `${(env.now ?? Date.now)()}:${Math.random().toString(36).slice(2, 8)}`;
  try {
    local?.setItem(ACCOUNT_DELETED_KEY, stamp);
    session?.setItem(DELETE_SEEN_KEY, stamp);
  } catch {
    /* refused: the other tabs still empty their stores (crossTabSync), they just keep their own copies */
  }
}

function leaveOnce(again: () => void): void {
  if (typeof window === "undefined") return;
  window.addEventListener("pagehide", () => again(), { once: true });
}

/**
 * What a tab does about a Delete it has not acted on (pressed in another tab, now or while this one was asleep): its
 * own copies of the account go: the Ask chat, the tab copies of the scored pages, the team it had open. True when
 * there was such a Delete. The localStorage side was the deleting tab's work.
 */
export function honourDeleteElsewhere(env: Partial<Pick<DeleteEnv, "local" | "session">> = {}): boolean {
  const local = "local" in env ? (env.local ?? null) : browserArea("localStorage");
  const session = "session" in env ? (env.session ?? null) : browserArea("sessionStorage");
  if (!local || !session) return false;
  let stamp: string | null = null;
  try {
    stamp = local.getItem(ACCOUNT_DELETED_KEY);
    if (!stamp || session.getItem(DELETE_SEEN_KEY) === stamp) return false;
  } catch {
    return false;
  }
  for (const rule of STORAGE_RULES) {
    if (rule.fate === "goes" && (rule.area === "session" || rule.area === "local+session")) drop(session, rule);
  }
  try {
    session.setItem(DELETE_SEEN_KEY, stamp);
  } catch {
    /* refused: the copies are gone all the same */
  }
  return true;
}

/* eslint-disable no-unused-vars -- the parameters of function types */
type StorageEventHost = { addEventListener(type: "storage", listener: (e: StorageEvent) => void): void; removeEventListener(type: "storage", listener: (e: StorageEvent) => void): void };
/* eslint-enable no-unused-vars */

/**
 * Started once with the app (PlusShell). On load: a tab that slept through a Delete (a phone restores a background tab
 * with its sessionStorage) drops its copies before any page reads them. While open: a Delete in another tab drops them
 * and reloads this tab, which ends whatever it was scoring on the deleted account and empties what its pages hold in
 * memory. Returns the unsubscribe.
 */
export function installDeleteWatch(
  target: StorageEventHost | null = typeof window === "undefined" ? null : (window as unknown as StorageEventHost),
  reload: () => void = () => window.location.reload(),
  env: Partial<Pick<DeleteEnv, "local" | "session">> = {},
): () => void {
  honourDeleteElsewhere(env);
  if (!target) return () => undefined;
  const onStorage = (e: StorageEvent): void => {
    if (e.key !== ACCOUNT_DELETED_KEY || !e.newValue) return;
    if (honourDeleteElsewhere(env)) reload();
  };
  target.addEventListener("storage", onStorage);
  return () => target.removeEventListener("storage", onStorage);
}
