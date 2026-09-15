// Wuthering Tools+ — "Sync my teams" without a browser (`npm run cli -- sync-teams`). Loads the fork's
// engine (vendor/wuwa_calc, the `mine` Team Cost) straight from its TypeScript under tsx, registers the
// export's Account State, solves each saved wuwa_calc team's composition at that state, runs the best row
// traced and hands it to the same `prepareTeamImport` the page uses; the result is a new teams array
// (and, with `rotations`, characters) for `writeSyncedExport` — the export on disk is never touched.
// Node-only: nothing under src/ that Vite bundles may import this module.
import { randomString } from "../../utils/strings";
import { accountKeyOf, accountStateOf, rileyAccountEntries } from "../account/accountState";
import type { ExportFile } from "../cli/exportFile";
import {
  isGeneratedTeamName,
  prepareTeamImport,
  reslotActions,
  toCharacterRotation,
  toImportedActions,
  type ImportResult,
} from "./importFromRankings";
import { buildRollsOf } from "./myBuilds";
import { runSync, type SolvedBest, type SyncReport, type TeamLike } from "./syncTeams";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type SubsMode = "standard" | "high" | "mine";

export interface HeadlessSyncOptions {
  /** the substat spread every row runs — the account bar's Substats box (default ChemX32) */
  subs?: SubsMode;
  /** also append each member's loop to that character's saved rotations */
  rotations?: boolean;
}

export interface HeadlessSyncResult {
  report: SyncReport;
  /** the export's teams with every synced team updated in place */
  teams: any[];
  /** the export's characters, with the loops appended when `rotations` was asked for */
  characters: Record<string, any>;
  account: string;
  subs: SubsMode;
  seconds: number;
}

// the fork's engine from its sources: tsx resolves the `.js`-suffixed imports Riley writes to his `.ts` files, and
// the URL keeps vue-tsc from type-checking his tree (the page reaches the same modules through the `@skittle` alias)
const VENDOR = new URL("../../../vendor/wuwa_calc/src/", import.meta.url).href;
async function loadEngine(): Promise<{ S: any; T: any; R: any; St: any; SUB: any }> {
  const load = (file: string): Promise<any> => import(/* @vite-ignore */ VENDOR + file);
  const [S, T, R, St, SUB] = await Promise.all([load("solver.ts"), load("teams.ts"), load("teamrun.ts"), load("engine/stats.ts"), load("shared/substats.ts")]);
  return { S, T, R, St, SUB };
}

export async function syncTeamsHeadless(exp: ExportFile, options: HeadlessSyncOptions = {}): Promise<HeadlessSyncResult> {
  const t0 = Date.now();
  const { S, T, R, St, SUB } = await loadEngine();
  if (typeof S.setAccountState !== "function") throw new Error("this engine has no `mine` Team Cost — vendor/wuwa_calc must be the fork's plus branch");

  const state = accountStateOf(exp.characters, exp.inventory, exp.teams);
  const entries = rileyAccountEntries(state);
  const account = accountKeyOf(entries);
  S.setAccountState(entries, account);
  const subs: SubsMode = options.subs ?? "standard";
  if (subs === "mine") for (const b of buildRollsOf(exp.characters, exp.inventory.echoes)) S.setMySubstat(b.name, SUB.customSubstats("My build", b.rolls), b.key);
  const filters = { ...S.defaultFilters(), cost: "mine", scope: "all", subs };

  // Riley's teams by key, as page/model.ts builds TEAMS
  const rileyTeams: Record<string, any[]> = Object.fromEntries(
    (T.ALL_TEAMS as any[]).map((team, i) => [T.teamKey(i), team.loadouts.map((l: any, j: number) => S.member(l, team.mdps[j]))]),
  );

  const teams: any[] = JSON.parse(JSON.stringify(exp.teams));
  const characters: Record<string, any> = JSON.parse(JSON.stringify(exp.characters));
  const engine = { teamrun: R, solver: S, stats: St };

  const solveBest = async (keys: string[]): Promise<Map<string, SolvedBest | null>> => {
    const out = new Map<string, SolvedBest | null>();
    for (const key of keys) {
      const members = rileyTeams[key];
      if (!members.every((m: any) => S.hasBuild(m, filters))) { out.set(key, null); continue; }
      const solved = S.solveTeam(key, members, filters, null);
      // the table's row, not the bare best picks: the best build settled in the spread mode (solve_mine.mjs does the same)
      const row = solved.rows?.[0] ?? solved.picks;
      if (!row) { out.set(key, null); continue; }
      const combos = row.map((p: any, j: number) => S.comboOf(members[j].loadout, p));
      const run = R.runTeam(key, members, combos, true);
      out.set(key, { total: Number(run.total), ref: run });
    }
    return out;
  };

  const importInto = async (team: TeamLike, best: SolvedBest): Promise<ImportResult> => {
    const prepared = await prepareTeamImport(engine, best.ref);
    const target = teams.find((t) => t.id === team.id);
    if (!target) throw new Error("The team to update no longer exists.");
    const written = reslotActions(prepared, target.characterIds as Array<string | null>);
    if (!written) throw new Error(`${target.name} does not hold the same three characters as the rankings row.`);
    target.actions = written.map((a) => ({ ...a, id: randomString(12) }));
    target.enemyConfig = { ...(target.enemyConfig ?? {}), ...prepared.enemyConfig };
    if (isGeneratedTeamName(target.name)) target.name = prepared.teamName;
    target.description = prepared.description;
    const saved: string[] = [];
    const skipped: string[] = [];
    if (options.rotations) {
      for (const r of prepared.rotations) {
        const c = characters[r.key];
        if (!c || !r.actions.length) { skipped.push(r.name); continue; }
        c.rotations = [...(c.rotations ?? []), toCharacterRotation(r, (c.rotations ?? []).length)];
        saved.push(r.name);
      }
    }
    return {
      teamId: target.id,
      teamName: prepared.teamName,
      actions: prepared.actions.length,
      actionList: toImportedActions(written),
      replaced: true,
      members: prepared.members.slice().sort((a, b) => a.slot - b.slot).map((m) => m.name),
      memberDetails: prepared.members,
      enemyConfig: prepared.enemyConfig,
      enemySeen: prepared.enemySeen,
      characterRotationsSaved: saved,
      characterRotationsSkipped: skipped,
      notPorted: prepared.notPorted,
      statuses: prepared.statuses,
    };
  };

  const report = await runSync({ teams: exp.teams as TeamLike[], rileyTeams, solveBest, importInto });
  return { report, teams, characters, account, subs, seconds: (Date.now() - t0) / 1000 };
}
