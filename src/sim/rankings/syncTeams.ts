// Wuthering Tools+ — "Sync my teams": every saved team that came from wuwa_calc (an import from the
// Rankings page, or a stock team preset) is re-imported at the account's own state (the `mine` Team
// Cost) and updated in place, with a per-team diff of what moved. The engine work happens on the
// Rankings page (controller.ts `syncMyTeams` hands in the solved rows); everything here is plain data.
import { rileyNameOf } from "./castMapper";
import { importTeamFromRankings, isGeneratedTeamName, type ImportedAction, type RankingsMods } from "./importFromRankings";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface TeamLike {
  id: string;
  name: string;
  characterIds: Array<string | null>;
  actions: Array<Record<string, any>>;
}

export interface ActionDelta {
  slot: number;
  characterId: string | null;
  key: string;
  mainEcho: string | null;
  from: number;
  to: number;
}

export type SyncStatus = "updated" | "unchanged" | "skipped" | "failed";

export interface SyncTeamReport {
  id: string;
  name: string;
  /** the name after the sync (a generated name follows the new state; a typed one stays) */
  newName: string | null;
  status: SyncStatus;
  reason: string | null;
  /** Riley's team key the row came from */
  rileyKey: string | null;
  /** his team DPR for that row */
  total: number | null;
  deltas: ActionDelta[];
}

export interface SyncReport {
  at: string;
  cost: string;
  teams: SyncTeamReport[];
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
}

/** Teams this sync touches: the ones whose name marks them as wuwa_calc's (never a team the player built). */
export const isWuwaCalcTeam = (team: Pick<TeamLike, "name">): boolean => isGeneratedTeamName(team.name);

const actionKey = (a: { slot: number; key: string; mainEcho?: string | null }): string => `${a.slot}|${a.key}|${a.mainEcho ?? ""}`;

/** Per (slot, attack, main echo) how many casts a rotation holds. */
export function actionCounts(actions: Array<Record<string, any>>): Map<string, { slot: number; key: string; mainEcho: string | null; count: number }> {
  const out = new Map<string, { slot: number; key: string; mainEcho: string | null; count: number }>();
  for (const a of actions ?? []) {
    if (a?.isDisabled) continue;
    const slot = Number(a.slot ?? 0);
    const key = String(a.key ?? "");
    if (!key) continue;
    const mainEcho = (a.mainEcho as string | null | undefined) ?? null;
    const k = actionKey({ slot, key, mainEcho });
    const cur = out.get(k) ?? { slot, key, mainEcho, count: 0 };
    cur.count += Number(a.count ?? 1) || 0;
    out.set(k, cur);
  }
  return out;
}

/** What changed between two rotations, by slot then attack key; an unchanged rotation gives []. */
export function diffActions(before: Array<Record<string, any>>, after: Array<Record<string, any>>, characterIds: Array<string | null> = []): ActionDelta[] {
  const b = actionCounts(before);
  const a = actionCounts(after);
  const out: ActionDelta[] = [];
  for (const k of new Set([...b.keys(), ...a.keys()])) {
    const from = b.get(k)?.count ?? 0;
    const to = a.get(k)?.count ?? 0;
    if (from === to) continue;
    const ref = (a.get(k) ?? b.get(k))!;
    out.push({ slot: ref.slot, characterId: characterIds[ref.slot] ?? null, key: ref.key, mainEcho: ref.mainEcho, from, to });
  }
  return out.sort((x, y) => x.slot - y.slot || x.key.localeCompare(y.key));
}

/** Riley's team keys whose three members are exactly these characters (every loadout variant). */
export function rileyTeamKeysFor(characterIds: Array<string | null>, teams: Record<string, Array<{ name: string }>>): string[] {
  const ids = characterIds.filter((id): id is string => Boolean(id));
  if (ids.length !== 3) return [];
  const want = ids.map((id) => rileyNameOf(id)).sort().join("|");
  return Object.entries(teams)
    .filter(([, members]) => members.length === 3 && members.map((m) => m.name).sort().join("|") === want)
    .map(([key]) => key);
}

/** "HeavenfallEdictFinaleDMG" → "Heavenfall Edict Finale DMG", for the report. */
export const humanKey = (key: string): string => key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2").trim();

export interface SyncDeps {
  mods: RankingsMods & { model: any; solver: any };
  /** solve these team keys under the current filters (the controller's worker pool) */
  ensureSolved: (keys: string[]) => Promise<void>;
  /** run `fn` with the page's filters at the account's own state, restoring them after */
  withMine: <T>(fn: () => Promise<T>) => Promise<T>;
  teams: TeamLike[];
}

/** Re-import every wuwa_calc team at the account's state, in place; the report says what moved. */
export async function runSync(deps: SyncDeps): Promise<SyncReport> {
  const { mods, teams } = deps;
  const M = mods.model;
  const S = mods.solver;
  const report: SyncReport = { at: new Date().toISOString(), cost: "mine", teams: [], updated: 0, unchanged: 0, skipped: 0, failed: 0 };
  const file = (r: SyncTeamReport): void => {
    report.teams.push(r);
    report[r.status] += 1;
  };

  const candidates: Array<{ team: TeamLike; keys: string[] }> = [];
  for (const team of teams) {
    if (!isWuwaCalcTeam(team)) {
      file({ id: team.id, name: team.name, newName: null, status: "skipped", reason: "your own team — only wuwa_calc imports and presets are synced", rileyKey: null, total: null, deltas: [] });
      continue;
    }
    const keys = rileyTeamKeysFor(team.characterIds, M.TEAMS);
    if (!keys.length) {
      file({ id: team.id, name: team.name, newName: null, status: "skipped", reason: "wuwa_calc has no team with these three", rileyKey: null, total: null, deltas: [] });
      continue;
    }
    candidates.push({ team, keys });
  }
  if (!candidates.length) return report;

  await deps.withMine(async () => {
    await deps.ensureSolved([...new Set(candidates.flatMap((c) => c.keys))]);
    for (const { team, keys } of candidates) {
      // the best loadout variant for this composition at the account's state — what the table's top row for it shows
      let best: { key: string; rowKey: string; total: number } | null = null;
      for (const key of keys) {
        const members = M.TEAMS[key];
        const solved = M.bestPicks.get(S.bestKey(key, members, M.filters));
        const row = solved?.rows?.[0];
        if (!row) continue;
        const total = Number(solved.scores?.[0]?.total ?? 0);
        const combo = row.map((p: any, i: number) => S.comboOf(members[i].loadout, p));
        const rowKey = `${key}-${combo.map((c: any) => c.key).join("-")}`;
        if (!best || total > best.total) best = { key, rowKey, total };
      }
      if (!best) {
        file({ id: team.id, name: team.name, newName: null, status: "failed", reason: "no build at your state (a member's rotation needs a higher sequence)", rileyKey: null, total: null, deltas: [] });
        continue;
      }
      const before = team.actions ?? [];
      try {
        const result = await importTeamFromRankings(mods, best.rowKey, { replaceTeamId: team.id });
        const deltas = diffActions(before, result.actionList as ImportedAction[], team.characterIds);
        file({
          id: team.id, name: team.name, newName: result.teamName !== team.name && isGeneratedTeamName(team.name) ? result.teamName : null,
          status: deltas.length ? "updated" : "unchanged", reason: null, rileyKey: best.key, total: best.total, deltas,
        });
      } catch (err) {
        file({ id: team.id, name: team.name, newName: null, status: "failed", reason: err instanceof Error ? err.message : String(err), rileyKey: best.key, total: best.total, deltas: [] });
      }
    }
  });
  return report;
}
