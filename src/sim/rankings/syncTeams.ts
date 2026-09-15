// Wuthering Tools+ — "Sync my teams": every saved team that came from wuwa_calc (an import from the
// Rankings page, or a stock team preset) is re-imported at the account's own state (the `mine` Team
// Cost) and updated in place, with a per-team diff of what moved — actions and the enemy settings the
// run held — and a note on which member's next sequence would switch their loop. The engine work is
// handed in through `SyncDeps`: the rankings page's worker pool in the browser (controller.ts
// `syncMyTeams`), the fork's engine loaded directly on the CLI (syncTeamsHeadless.ts). Everything
// here is plain data.
import { rileyNameOf, type EnemyStacks } from "./castMapper";
import { STACK_LABEL, isGeneratedTeamName, type ImportResult, type ImportedAction } from "./importFromRankings";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface TeamLike {
  id: string;
  name: string;
  characterIds: Array<string | null>;
  actions: Array<Record<string, any>>;
  enemyConfig?: Record<string, any> | null;
}

export interface ActionDelta {
  slot: number;
  characterId: string | null;
  key: string;
  mainEcho: string | null;
  /** a negative-status tick's stack count (part of the row's identity) */
  stacks: number | null;
  from: number;
  to: number;
}

export interface EnemyDelta {
  key: keyof EnemyStacks;
  label: string;
  from: number;
  to: number;
}

export interface SyncMember {
  name: string;
  sequence: number;
  /** the first sequence above the account's at which this member's loop changes; null when none does */
  nextLoopChange: number | null;
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
  /** the enemy settings that moved (negative-status stacks read off the run) */
  enemyDeltas: EnemyDelta[];
  /** the stack fields the run set above zero */
  enemy: Partial<EnemyStacks>;
  members: SyncMember[];
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

const actionKey = (a: { slot: number; key: string; mainEcho?: string | null; stacks?: number | null }): string => `${a.slot}|${a.key}|${a.mainEcho ?? ""}|${a.stacks ?? ""}`;

/** Per (slot, attack, main echo, stack count) how many casts a rotation holds. */
export function actionCounts(actions: Array<Record<string, any>>): Map<string, { slot: number; key: string; mainEcho: string | null; stacks: number | null; count: number }> {
  const out = new Map<string, { slot: number; key: string; mainEcho: string | null; stacks: number | null; count: number }>();
  for (const a of actions ?? []) {
    if (a?.isDisabled) continue;
    const slot = Number(a.slot ?? 0);
    const key = String(a.key ?? "");
    if (!key) continue;
    const mainEcho = (a.mainEcho as string | null | undefined) ?? null;
    const raw = a.negativeStatusStacks ?? a.stacks;
    const stacks = raw == null ? null : Number(raw);
    const k = actionKey({ slot, key, mainEcho, stacks });
    const cur = out.get(k) ?? { slot, key, mainEcho, stacks, count: 0 };
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
    out.push({ slot: ref.slot, characterId: characterIds[ref.slot] ?? null, key: ref.key, mainEcho: ref.mainEcho, stacks: ref.stacks, from, to });
  }
  return out.sort((x, y) => x.slot - y.slot || x.key.localeCompare(y.key) || (x.stacks ?? 0) - (y.stacks ?? 0));
}

/** The enemy stack fields that differ between two enemy configs (a missing field reads as 0). */
export function diffEnemy(before: Record<string, any> | null | undefined, after: Record<string, any> | null | undefined): EnemyDelta[] {
  const out: EnemyDelta[] = [];
  for (const key of Object.keys(STACK_LABEL) as Array<keyof EnemyStacks>) {
    const from = Number(before?.[key] ?? 0) || 0;
    const to = Number(after?.[key] ?? 0) || 0;
    if (from !== to) out.push({ key, label: STACK_LABEL[key], from, to });
  }
  return out;
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

/** "HeavenfallEdictFinaleDMG" → "Heavenfall Edict Finale DMG", "ElementalEffectAeroErosion" → "Aero Erosion", for the report. */
export const humanKey = (key: string): string =>
  key.replace(/^ElementalEffect/, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2").trim();

/** The best row solved for one composition at the account's state, as the engine side hands it back. */
export interface SolvedBest {
  /** Riley's team DPR */
  total: number;
  /** whatever `importInto` needs to re-import that row (a row key on the page, a traced run headless) */
  ref: unknown;
}

export interface SyncDeps {
  teams: TeamLike[];
  /** Riley's teams by key — `page/model.ts` TEAMS, or the same map built from `ALL_TEAMS` */
  rileyTeams: Record<string, Array<{ name: string }>>;
  /** solve these compositions at the account's own state; per key the best row, or null when no build exists at that state */
  solveBest: (keys: string[]) => Promise<Map<string, SolvedBest | null>>;
  /** re-import the solved row into this saved team, in place */
  importInto: (team: TeamLike, best: SolvedBest) => Promise<ImportResult>;
}

/** Re-import every wuwa_calc team at the account's state, in place; the report says what moved. */
export async function runSync(deps: SyncDeps): Promise<SyncReport> {
  const report: SyncReport = { at: new Date().toISOString(), cost: "mine", teams: [], updated: 0, unchanged: 0, skipped: 0, failed: 0 };
  const file = (r: SyncTeamReport): void => {
    report.teams.push(r);
    report[r.status] += 1;
  };
  const blank = (team: TeamLike, status: SyncStatus, reason: string, rileyKey: string | null = null, total: number | null = null): SyncTeamReport => ({
    id: team.id, name: team.name, newName: null, status, reason, rileyKey, total, deltas: [], enemyDeltas: [], enemy: {}, members: [],
  });

  const candidates: Array<{ team: TeamLike; keys: string[] }> = [];
  for (const team of deps.teams) {
    if (!isWuwaCalcTeam(team)) {
      file(blank(team, "skipped", "your own team — only wuwa_calc imports and presets are synced"));
      continue;
    }
    const keys = rileyTeamKeysFor(team.characterIds, deps.rileyTeams);
    if (!keys.length) {
      file(blank(team, "skipped", "wuwa_calc has no team with these three"));
      continue;
    }
    candidates.push({ team, keys });
  }
  if (!candidates.length) return report;

  const solved = await deps.solveBest([...new Set(candidates.flatMap((c) => c.keys))]);
  for (const { team, keys } of candidates) {
    // the best loadout variant for this composition at the account's state — what the table's top row for it shows
    let best: (SolvedBest & { key: string }) | null = null;
    for (const key of keys) {
      const s = solved.get(key);
      if (s && (!best || s.total > best.total)) best = { ...s, key };
    }
    if (!best) {
      file(blank(team, "failed", "no build at your state (a member's rotation needs a higher sequence)"));
      continue;
    }
    const before = team.actions ?? [];
    const enemyBefore = team.enemyConfig ?? null;
    try {
      const result = await deps.importInto(team, best);
      const deltas = diffActions(before, result.actionList as ImportedAction[], team.characterIds);
      const enemyDeltas = diffEnemy(enemyBefore, result.enemyConfig);
      file({
        id: team.id,
        name: team.name,
        newName: result.teamName !== team.name && isGeneratedTeamName(team.name) ? result.teamName : null,
        status: deltas.length || enemyDeltas.length ? "updated" : "unchanged",
        reason: null,
        rileyKey: best.key,
        total: best.total,
        deltas,
        enemyDeltas,
        enemy: result.enemySeen,
        members: result.memberDetails.slice().sort((a, b) => a.slot - b.slot).map((m) => ({ name: m.name, sequence: m.sequence, nextLoopChange: m.nextLoopChange })),
      });
    } catch (err) {
      file(blank(team, "failed", err instanceof Error ? err.message : String(err), best.key, best.total));
    }
  }
  return report;
}
