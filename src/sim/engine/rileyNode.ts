// Wuthering Tools+ — the Riley run seam without a browser (CLI, vitest, capture scripts). Loads the fork's engine
// (vendor/wuwa_calc) straight from its TypeScript the way syncTeamsHeadless.ts does — a `file:` URL, so tsx /
// vite-node resolve his `.js` imports to `.ts` and vue-tsc never type-checks his tree — and runs the same
// rileyRun.ts functions the solver worker runs, so the same input gives the same RunLite.
// Node-only: nothing under src/ that Vite bundles for the browser may import this module.
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { ExportFile } from "../cli/exportFile";
import { notInApp } from "../rankings/importFromRankings";
import { rileyTeamKeysFor } from "../rankings/syncTeams";
import { WUWA_CALC_COMMIT } from "./engineCommit";
import { rileyAccountOf } from "./rileyAccount";
import {
  bestOf,
  blockedKeysOf,
  listTeams,
  solveMine as solveMineOn,
  tracedRun as tracedRunOn,
  type MineSolve,
  type RileyAccount,
  type RileyEngine,
  type RileyPick,
  type RileyTeamInfo,
  type RunLite,
  type SubsMode,
} from "./rileyRun";

/* eslint-disable @typescript-eslint/no-explicit-any */
const VENDOR = new URL("../../../vendor/wuwa_calc/src/", import.meta.url).href;

/** The submodule's commit the way scripts/skittle-sync.mjs reads it; the generated constant where git can't say. */
export function engineCommitFromGit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: fileURLToPath(new URL("../../../vendor/wuwa_calc/", import.meta.url)), stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return WUWA_CALC_COMMIT;
  }
}

let engine: Promise<RileyEngine> | null = null;
/** The fork's engine modules, loaded once per process. */
export function loadRileyEngine(): Promise<RileyEngine> {
  engine ??= (async () => {
    const load = (file: string): Promise<any> => import(/* @vite-ignore */ VENDOR + file);
    const [solver, teamrun, stats, model, substats] = await Promise.all([
      load("solve/solver.ts"),
      load("solve/teamrun.ts"),
      load("engine/stats.ts"),
      load("page/model.ts"),
      load("shared/substats.ts"),
    ]);
    if (typeof solver.setAccountState !== "function") throw new Error("this engine has no `mine` Team Cost — vendor/wuwa_calc must be the fork's plus branch");
    return { solver, teamrun, stats, model, substats, commit: engineCommitFromGit() };
  })();
  return engine;
}

export interface HeadlessRiley {
  engine: RileyEngine;
  account: RileyAccount | null;
  /** app keys the app has not released (Lily) — every request carries them */
  blocked: string[];
  teams: RileyTeamInfo[];
  solveMine(teamKeys: string[], opts?: { subs?: SubsMode; onProgress?: (done: number, total: number) => void }): MineSolve[];
  tracedRun(teamKey: string, picks?: RileyPick[] | null, opts?: { subs?: SubsMode }): RunLite;
  /** his keys for a composition (app character keys, any order): every loadout variant of those three */
  teamKeysFor(characterIds: Array<string | null>): string[];
  /** the best `mine` row across a composition's variants, null when none solves */
  bestFor(characterIds: Array<string | null>, opts?: { subs?: SubsMode }): MineSolve | null;
}

/** The seam over an export's account (or a hand-made one; null = nobody registered, everyone `s0r1`). */
export async function rileyHeadless(source: ExportFile | RileyAccount | null = null): Promise<HeadlessRiley> {
  const E = await loadRileyEngine();
  const account = !source ? null : "entries" in source ? source : rileyAccountOf(source.characters, source.inventory, source.teams);
  const teams = listTeams(E);
  const blocked = blockedKeysOf(teams, notInApp);
  const byKey = Object.fromEntries(teams.map((t) => [t.key, t.members]));
  const teamKeysFor = (ids: Array<string | null>): string[] => rileyTeamKeysFor(ids, byKey);
  const solveMine: HeadlessRiley["solveMine"] = (keys, opts = {}) => solveMineOn(E, keys, { account, blocked, subs: opts.subs, onProgress: opts.onProgress });
  return {
    engine: E,
    account,
    blocked,
    teams,
    solveMine,
    tracedRun: (teamKey, picks = null, opts = {}) => tracedRunOn(E, teamKey, picks, { account, blocked, subs: opts.subs }),
    teamKeysFor,
    bestFor: (ids, opts = {}) => bestOf(solveMine(teamKeysFor(ids), opts)),
  };
}
