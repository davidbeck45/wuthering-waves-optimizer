// Wuthering Tools+ automatic backups — a backup before several echoes or teams are deleted at once.
//
// Three of Ryan's actions delete a lot behind one confirm, with no undo: the inventory's "Delete selected" and
// "Delete all trash", Settings › Wavescan in Replace mode (it removes every unlocked echo, then adds the scanned
// ones), and Teams' "Delete selected". All of them call the same two store actions in a loop, `inventory.deleteEcho`
// and `teamRotations.deleteTeam`, so they are heard there (Pinia's `$onAction`, which runs before the action) with no
// line in his files.
//
// The account is read at the first delete of a burst, before anything is gone, and held. If the burst turns out to
// be a bulk one (5 echoes or 2 teams before 1.5 s pass without another delete) that capture is kept as a "Before a
// bulk delete" backup; a single delete drops it. One echo deleted by hand is not worth a place among the 20
// "before …" backups, and it has its own confirm.
import type { TakeResult } from "./autoBackup";
import type { Capture } from "./backupFile";

export const BULK_ECHOES = 5;
export const BULK_TEAMS = 2;
export const BURST_QUIET_MS = 1500;

/* eslint-disable no-unused-vars -- the parameters of interface methods */
export interface ActionStore {
  $onAction(listener: (context: { name: string }) => void, detached?: boolean): () => void;
}

export interface BulkGuardEnv {
  allowed: () => boolean;
  /** the account as stored right now (liveCapture.ts `captureNow`) */
  capture: () => Capture;
  take: (reason: "before-delete", capture: Capture) => Promise<TakeResult>;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}
/* eslint-enable no-unused-vars */

/** Starts listening; returns the stop. */
export function installBulkGuard(stores: { inventory: ActionStore; teams: ActionStore }, env: BulkGuardEnv): () => void {
  const setTimer = env.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = env.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let burst: { capture: Capture; echoes: number; teams: number; timer: unknown } | null = null;

  const end = (): void => {
    const done = burst;
    burst = null;
    if (!done || (done.echoes < BULK_ECHOES && done.teams < BULK_TEAMS)) return;
    try {
      void env.take("before-delete", done.capture).catch(() => undefined);
    } catch {
      /* a backup never stops what it guards, and here that is already done */
    }
  };

  const heard = (kind: "echoes" | "teams"): void => {
    try {
      if (!burst) {
        if (!env.allowed()) return;
        burst = { capture: env.capture(), echoes: 0, teams: 0, timer: null };
      } else {
        clearTimer(burst.timer);
      }
      burst[kind] += 1;
      burst.timer = setTimer(end, BURST_QUIET_MS);
    } catch {
      burst = null; // storage blocked: the delete goes on without a backup
    }
  };

  const stops = [
    stores.inventory.$onAction(({ name }) => {
      if (name === "deleteEcho") heard("echoes");
    }, true),
    stores.teams.$onAction(({ name }) => {
      if (name === "deleteTeam") heard("teams");
    }, true),
  ];
  return () => {
    for (const stop of stops) stop();
    if (burst) clearTimer(burst.timer);
    burst = null;
  };
}
