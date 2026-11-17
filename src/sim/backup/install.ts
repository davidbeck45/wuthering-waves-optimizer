// Wuthering Tools+ automatic backups — the part the shell starts (PlusShell.vue, the main bundle). Light on purpose:
// a timer, a visibility listener and one lazy import; the backup code itself loads a few seconds after the page.
//
// The day's automatic backup is looked at once after the page has settled, and again whenever the tab comes back into
// view after an hour or more: a site added to the home screen can stay open for days.

/** Under Cypress the backups stand aside (as the welcome card and the team-aware buffs do), so a hundred specs do not
 *  each write to IndexedDB behind their own assertions; backups.cy.ts sets the switch. */
export const BACKUP_E2E_KEY = "wtplus:backup:e2e";

export function backupAllowed(win: { Cypress?: unknown; localStorage?: Pick<Storage, "getItem"> } | null = typeof window === "undefined" ? null : (window as never)): boolean {
  if (!win) return false;
  if (!win.Cypress) return true;
  try {
    return win.localStorage?.getItem(BACKUP_E2E_KEY) === "1";
  } catch {
    return false;
  }
}

export const DAILY_START_DELAY_MS = 4000;
export const DAILY_RECHECK_MS = 60 * 60 * 1000;

/* eslint-disable no-unused-vars -- the parameters of interface methods */
export interface InstallEnv {
  allowed: () => boolean;
  /** takes today's backup if one is due; never rejects */
  daily: () => Promise<unknown>;
  now: () => number;
  doc: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
}
/* eslint-enable no-unused-vars */

const lazyDaily = (): Promise<unknown> =>
  import("./liveCapture").then(
    (m) => m.takeNow("daily"),
    () => undefined, // a stale tab that cannot load the chunk: perf/chunkReload.ts deals with that, not this
  );

/** Starts the automatic backups; returns the stop. */
export function installAutoBackup(env: Partial<InstallEnv> = {}): () => void {
  const allowed = env.allowed ?? backupAllowed;
  const now = env.now ?? Date.now;
  const doc = env.doc ?? document;
  const daily = env.daily ?? lazyDaily;
  const setTimer = env.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = env.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let lastRun = 0;
  const run = (): void => {
    if (!allowed()) return;
    lastRun = now();
    void daily().catch(() => undefined);
  };
  const timer = setTimer(run, DAILY_START_DELAY_MS);
  const onVisible = (): void => {
    if (doc.visibilityState === "visible" && lastRun && now() - lastRun >= DAILY_RECHECK_MS) run();
  };
  doc.addEventListener("visibilitychange", onVisible);
  return () => {
    clearTimer(timer);
    doc.removeEventListener("visibilitychange", onVisible);
  };
}
