// Wuthering Tools+ — Undo for "Sync my teams" (the last sync only), /build-team's pattern (buildTeam/apply.ts): the
// teams a sync rewrote are kept as they were in localStorage["wtplus:rankings:sync:undo:v1"], with a fingerprint of
// each as the sync left it. Undo puts a team back while it still reads as the sync left it; a team edited or deleted
// since is left alone and named. A pin is not an edit: Build my team and Whole account write `buildIds`, a sync never
// does, so the fingerprint leaves pins out and Undo keeps the pins of today. The record is stored before the sync's
// first write, so a tab closed part-way still has its way back (`syncWithUndo`, `settleSyncUndo`). Pure apart from the
// storage helpers; the bar writes the store.
// "Rewrote" is any change to the stored record, not the report's "updated": a team whose loop did not move can still
// have had its enemy level, name, description or handoffs rewritten (2026-11-02). Fresh action ids alone don't count.
// A sync that rewrote no team keeps the last sync's Undo (`carrySyncUndo`), and a sync whose Undo the browser would not
// store ahead of its first write does not run (`SyncRefused`) (2026-11-08 hunt M3, M4). A team that failed was never
// written and stays out of the Undo (L2).
import { cyrb53 } from "../myRankings/rankingCache";
import { isWuwaCalcTeam, type SyncReport, type TeamLike } from "./syncTeams";

export const SYNC_UNDO_KEY = "wtplus:rankings:sync:undo:v1";

export interface SyncUndoRecord {
  v: 1;
  at: string;
  /** the rewritten teams as they were before the sync (whole store records) */
  before: TeamLike[];
  /** per team id, the record as the sync left it (`teamFingerprint`) */
  after: Record<string, string>;
  /** stored ahead of the sync's first write: every team it may rewrite, nothing known yet about after */
  pending?: boolean;
  /** cut short, settled from what it left: it never reached the loop times, so this Undo leaves them alone */
  cut?: boolean;
}

export interface SyncUndoOutcome {
  teams: TeamLike[];
  restored: string[];
  /** teams Undo left as they are, with why */
  kept: Array<{ name: string; why: string }>;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
/** a team record as plain JSON (store proxies and key order as the store holds them), its pins left out */
const teamJson = (team: unknown): string => {
  if (!team) return JSON.stringify(null);
  const { buildIds: _pins, ...rest } = team as Record<string, unknown>;
  return JSON.stringify(rest);
};
/** `teamJson`, hashed: the record then stays smaller than the pending one it replaces, which the browser took */
export const teamFingerprint = (team: unknown): string => `h${cyrb53(teamJson(team))}`;

/** Does this team still read as the sync left it? Records stored before held the JSON itself, and before pins were left
 *  out, the whole team. */
const asSynced = (team: TeamLike, fingerprint: string | undefined): boolean =>
  fingerprint === teamFingerprint(team) || fingerprint === teamJson(team) || fingerprint === JSON.stringify(team);

/** The sync did not run: its Undo could not be stored ahead of the first write. */
export class SyncRefused extends Error {
  constructor() {
    super("Nothing was synced: this browser's storage is full, so the sync could not keep its Undo. Delete some versions in Build history to make room, then sync again.");
    this.name = "SyncRefused";
  }
}

/** The team as it was before the sync, with the pins it has today. */
function withPinsOf(before: TeamLike, now: TeamLike): TeamLike {
  const out = clone(before) as TeamLike & { buildIds?: unknown };
  const pins = (now as TeamLike & { buildIds?: unknown }).buildIds;
  if (pins === undefined) delete out.buildIds;
  else out.buildIds = clone(pins);
  return out;
}

/** A team record as plain JSON without its actions' ids: a re-import gives every action a fresh id, which alone is not
 *  a change Undo should offer to put back. */
const contentFingerprint = (team: TeamLike): string =>
  teamFingerprint({ ...team, actions: (team.actions ?? []).map((a) => Object.fromEntries(Object.entries(a ?? {}).filter(([k]) => k !== "id"))) });

/** What Undo needs after a sync: the records from before of every team the sync rewrote (any stored field moved, the
 *  report's "unchanged" included: a loop that did not move can still come back with wuwa_calc's enemy level or a new
 *  name), fingerprints from after. Null when the sync changed nothing (nothing to undo). */
export function makeSyncUndo(before: TeamLike[], after: TeamLike[], report: SyncReport): SyncUndoRecord | null {
  // a failed team was never written: what differs there is another tab's edit, not the sync's
  const synced = new Set(report.teams.filter((t) => t.status !== "skipped" && t.status !== "failed").map((t) => t.id));
  const now = new Map(after.map((t) => [t.id, t]));
  const ids = new Set(before.filter((t) => synced.has(t.id) && now.has(t.id) && contentFingerprint(t) !== contentFingerprint(now.get(t.id)!)).map((t) => t.id));
  if (!ids.size) return null;
  const fps: Record<string, string> = {};
  for (const t of after) if (ids.has(t.id)) fps[t.id] = teamFingerprint(t);
  return { v: 1, at: report.at, before: clone(before.filter((t) => ids.has(t.id))), after: fps };
}

/** The team list with every team the sync rewrote put back, unless it changed since. */
export function applySyncUndo(current: TeamLike[], undo: SyncUndoRecord): SyncUndoOutcome {
  const teams = current.slice();
  const restored: string[] = [];
  const kept: SyncUndoOutcome["kept"] = [];
  for (const prev of undo.before) {
    const i = teams.findIndex((t) => t.id === prev.id);
    if (i < 0) {
      kept.push({ name: prev.name, why: "deleted since the sync" });
      continue;
    }
    if (!asSynced(teams[i]!, undo.after[prev.id])) {
      kept.push({ name: teams[i]!.name, why: "edited since the sync" });
      continue;
    }
    teams[i] = withPinsOf(prev, teams[i]!);
    restored.push(prev.id);
  }
  return { teams, restored, kept };
}

/** The filled loop times Undo takes out: none from a team it left as synced, since a time goes with its team. */
export function fillsToUndo<T extends { teamId: string }>(fills: readonly T[], undo: Pick<SyncUndoRecord, "before">, outcome: Pick<SyncUndoOutcome, "restored">): T[] {
  const left = new Set(undo.before.map((t) => t.id).filter((id) => !outcome.restored.includes(id)));
  return fills.filter((f) => !left.has(f.teamId));
}

/** What the sync may rewrite, as it is, for the storage before its first write. */
export function pendingSyncUndo(before: readonly TeamLike[], at = new Date().toISOString()): SyncUndoRecord {
  return { v: 1, at, before: clone(before.filter(isWuwaCalcTeam)), after: {}, pending: true };
}

/** A sync cut short (a throw, a tab closed): an Undo for the teams it reached. Null when it reached none. */
export function settleSyncUndo(rec: SyncUndoRecord, current: readonly TeamLike[]): SyncUndoRecord | null {
  const now = new Map(current.map((t) => [t.id, t]));
  const before = rec.before.filter((t) => now.has(t.id) && contentFingerprint(t) !== contentFingerprint(now.get(t.id)!));
  if (!before.length) return null;
  return { v: 1, at: rec.at, before, after: Object.fromEntries(before.map((t) => [t.id, teamFingerprint(now.get(t.id))])), cut: true };
}

/** The last sync's Undo, after a sync that rewrote no team: it still stands. A team this sync re-imported unchanged has
 *  fresh action ids, so its fingerprint moves to the record as it is now, while it still read as the last sync left it. */
export function carrySyncUndo(previous: SyncUndoRecord, before: readonly TeamLike[], after: readonly TeamLike[]): SyncUndoRecord {
  const was = new Map(before.map((t) => [t.id, t]));
  const now = new Map(after.map((t) => [t.id, t]));
  const fps = { ...previous.after };
  for (const id of Object.keys(fps)) {
    const b = was.get(id);
    const a = now.get(id);
    if (b && a && asSynced(b, fps[id]) && contentFingerprint(b) === contentFingerprint(a)) fps[id] = teamFingerprint(a);
  }
  return { ...previous, after: fps };
}

export interface SyncRun {
  report: SyncReport;
  undo: SyncUndoRecord | null;
  after: TeamLike[];
  /** the sync rewrote no team, and `undo` is the last sync's, carried */
  carried: boolean;
  /** `undo` reached the browser's storage (false: it lasts this visit only) */
  stored: boolean;
}

/** Runs a sync with its Undo stored ahead of the first write, and finished when the sync ends. Storage that refuses
 *  that first record refuses the sync (`SyncRefused`, nothing written). A sync that throws leaves the Undo of what it
 *  reached, or the last sync's when it reached nothing; one that rewrote nothing keeps the last sync's. */
export async function syncWithUndo(before: TeamLike[], run: () => Promise<SyncReport>, teamsNow: () => TeamLike[], storage: (Pick<Storage, "getItem" | "setItem" | "removeItem">) | null = safeStorage()): Promise<SyncRun> {
  const stored = readSyncUndo(storage);
  const previous = stored?.pending ? settleSyncUndo(stored, before) : stored;
  const pending = pendingSyncUndo(before);
  if (storage && !saveSyncUndo(pending, storage)) throw new SyncRefused();
  try {
    const report = await run();
    const after = teamsNow();
    const fresh = makeSyncUndo(before, after, report);
    const undo = fresh ?? (previous ? carrySyncUndo(previous, before, after) : null);
    return { report, undo, after, carried: !fresh && !!undo, stored: saveSyncUndo(undo, storage) };
  } catch (err) {
    saveSyncUndo(settleSyncUndo(pending, teamsNow()) ?? previous, storage);
    throw err;
  }
}

export function readSyncUndo(storage: Pick<Storage, "getItem"> | null = safeStorage()): SyncUndoRecord | null {
  try {
    const raw = storage?.getItem(SYNC_UNDO_KEY);
    const rec = raw ? (JSON.parse(raw) as SyncUndoRecord) : null;
    return rec && rec.v === 1 && Array.isArray(rec.before) && rec.after && typeof rec.after === "object" ? rec : null;
  } catch {
    return null;
  }
}

/** False when this browser would not store it (quota, private mode): the undo then lives until the page is left. */
export function saveSyncUndo(rec: SyncUndoRecord | null, storage: Pick<Storage, "setItem" | "removeItem"> | null = safeStorage()): boolean {
  try {
    if (!storage) return false;
    if (rec) storage.setItem(SYNC_UNDO_KEY, JSON.stringify(rec));
    else storage.removeItem(SYNC_UNDO_KEY);
    return true;
  } catch {
    return false;
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
