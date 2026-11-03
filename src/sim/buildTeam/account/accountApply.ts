// Wuthering Tools+ — "Whole account": write the plan, after the player confirmed it, and take it back.
//
// Each character gets a NEW build named "Account plan" (" (2)", " (3)" … when the name is taken — never an existing
// build overwritten), pinned through upstream's `setTeamCharacterBuild` in every chosen saved team they play in (so
// Teams reads the numbers the review showed). The active build stays as it was unless the player asks ("Also make
// active": upstream's `equipBuild`, which re-syncs the `equipped` map). Echoes are never taken off anyone.
//
// The page snapshots every affected character into build history first ("Before Account plan", src/sim/buildHistory/)
// and keeps one undo (`wtplus:buildAccount:undo:v1`, the last apply): created ids, every previous pin, the records of
// the characters switched to their new build and the `equipped` maps. Restored verbatim while the touched records still
// fingerprint as right after the apply; otherwise only what is still ours and unused is removed, and the page says what
// it kept. Same rules as Build my team's apply.ts.
import { cyrb53, stableStringify } from "../../myRankings/rankingCache";
import { snapshotCharacters } from "../../buildHistory/history";
import { randomString } from "../../../utils/strings";
import type { BuildTeamStores } from "../apply";
import type { BuildAccountResult } from "./buildAccount";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const ACCOUNT_UNDO_KEY = "wtplus:buildAccount:undo:v1";
export const ACCOUNT_BUILD_NAME = "Account plan";

export interface AccountApplyMember {
  characterId: string;
  /** the build fields to save (buildTeam.ts `draftBuildFields`) */
  draft: Record<string, any>;
  /** the saved teams and slots this character plays in among the chosen teams */
  pins: Array<{ teamId: string; slot: number }>;
}

export interface AccountApplyRequest {
  members: AccountApplyMember[];
  makeActive?: boolean;
  now?: number;
}

export interface AccountUndoRecord {
  v: 1;
  at: number;
  created: Array<{ characterId: string; buildId: string; name: string }>;
  /** every pin the apply set, with what the slot held before */
  pins: Array<{ teamId: string; slot: number; previous: string | null; buildId: string; characterId: string }>;
  /** characters whose record had no builds list (ensureCharacterBuilds made the "Default build") */
  synthesized: string[];
  activated: Array<{ characterId: string; record: Record<string, any> }>;
  inventory: { equipped: Record<string, Record<string, number>>; equippedPresets: Record<string, string> } | null;
  /** fingerprints right after the apply: each touched character, each touched team's pins, the inventory maps */
  after: Record<string, string>;
}

export interface AccountApplyOutcome {
  undo: AccountUndoRecord;
  created: AccountUndoRecord["created"];
  activated: string[];
  /** saved teams that got a pin */
  pinnedTeams: string[];
  undoInMemoryOnly: boolean;
}

export interface AccountUndoOutcome {
  kind: "exact" | "partial";
  removed: Array<{ characterId: string; name: string }>;
  kept: Array<{ characterId: string; name: string; why: string }>;
  pinsRestored: number;
}

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const fp = (v: unknown): string => cyrb53(stableStringify(v ?? null));

/** "Account plan", or "Account plan (2)", (3) … when the character already has one. */
export function accountBuildName(existing: readonly string[]): string {
  if (!existing.includes(ACCOUNT_BUILD_NAME)) return ACCOUNT_BUILD_NAME;
  for (let n = 2; ; n++) if (!existing.includes(`${ACCOUNT_BUILD_NAME} (${n})`)) return `${ACCOUNT_BUILD_NAME} (${n})`;
}

const teamFp = (stores: BuildTeamStores, teamId: string): string => fp(stores.team.teams.find((t) => t.id === teamId)?.buildIds ?? null);
const invFp = (stores: BuildTeamStores): string => fp({ e: stores.inventory.equipped ?? {}, p: stores.inventory.equippedPresets ?? {} });

export function applyAccountPlan(stores: BuildTeamStores, request: AccountApplyRequest): AccountApplyOutcome {
  const now = request.now ?? Date.now();
  const created: AccountUndoRecord["created"] = [];
  const pins: AccountUndoRecord["pins"] = [];
  const synthesized: string[] = [];
  const activated: AccountUndoRecord["activated"] = [];

  // snapshots first, before any write
  for (const m of request.members) {
    const record = stores.character.characters[m.characterId];
    if (!Array.isArray(record?.builds) || record.builds.length === 0) synthesized.push(m.characterId);
    if (request.makeActive) activated.push({ characterId: m.characterId, record: clone(record ?? {}) });
  }
  const inventory = request.makeActive ? { equipped: clone(stores.inventory.equipped ?? {}), equippedPresets: clone(stores.inventory.equippedPresets ?? {}) } : null;

  for (const m of request.members) {
    stores.character.ensureCharacterBuilds(m.characterId);
    const record = stores.character.characters[m.characterId];
    const name = accountBuildName((record.builds ?? []).map((b: any) => String(b.name ?? "")));
    const build = { id: randomString(12), name, createdAt: now, updatedAt: now, ...clone(m.draft) };
    record.builds.push(build);
    created.push({ characterId: m.characterId, buildId: build.id, name });
    for (const pin of m.pins) {
      const team = stores.team.teams.find((t) => t.id === pin.teamId);
      if (!team) continue;
      pins.push({ teamId: pin.teamId, slot: pin.slot, previous: team.buildIds?.[pin.slot] ?? null, buildId: build.id, characterId: m.characterId });
      stores.team.setTeamCharacterBuild(team.id, pin.slot, build.id);
    }
    if (request.makeActive) stores.character.equipBuild(m.characterId, build.id);
  }

  const pinnedTeams = [...new Set(pins.map((p) => p.teamId))];
  const after: Record<string, string> = { inventory: inventory ? invFp(stores) : "" };
  for (const id of pinnedTeams) after[`team:${id}`] = teamFp(stores, id);
  for (const m of request.members) after[m.characterId] = fp(stores.character.characters[m.characterId]);
  const undo: AccountUndoRecord = { v: 1, at: now, created, pins, synthesized, activated, inventory, after };
  const stored = saveAccountUndo(undo);
  return { undo, created, activated: activated.map((a) => a.characterId), pinnedTeams, undoInMemoryOnly: !stored };
}

export function undoAccountPlan(stores: BuildTeamStores, undo: AccountUndoRecord): AccountUndoOutcome {
  const touched = [...new Set(undo.created.map((c) => c.characterId))];
  const teamIds = [...new Set(undo.pins.map((p) => p.teamId))];
  const untouched =
    touched.every((id) => fp(stores.character.characters[id]) === undo.after[id]) &&
    teamIds.every((id) => teamFp(stores, id) === undo.after[`team:${id}`]) &&
    (!undo.inventory || invFp(stores) === undo.after.inventory);
  const removed: AccountUndoOutcome["removed"] = [];
  const kept: AccountUndoOutcome["kept"] = [];
  let pinsRestored = 0;
  const restorePin = (p: AccountUndoRecord["pins"][number]): void => {
    if (!stores.team.teams.some((t) => t.id === p.teamId)) return;
    stores.team.setTeamCharacterBuild(p.teamId, p.slot, p.previous);
    pinsRestored += 1;
  };

  if (untouched) {
    for (const a of undo.activated) stores.character.characters[a.characterId] = clone(a.record);
    if (undo.inventory) {
      stores.inventory.equipped = clone(undo.inventory.equipped);
      stores.inventory.equippedPresets = clone(undo.inventory.equippedPresets);
    }
    const restoredIds = new Set(undo.activated.map((a) => a.characterId));
    for (const c of undo.created) {
      if (restoredIds.has(c.characterId)) {
        removed.push({ characterId: c.characterId, name: c.name });
        continue;
      }
      const record = stores.character.characters[c.characterId];
      if (!record) continue;
      record.builds = (record.builds ?? []).filter((b: any) => b.id !== c.buildId);
      if (undo.synthesized.includes(c.characterId)) {
        delete record.builds;
        delete record.activeBuildId;
      }
      removed.push({ characterId: c.characterId, name: c.name });
    }
    for (const p of [...undo.pins].reverse()) restorePin(p);
    clearAccountUndo();
    return { kind: "exact", removed, kept, pinsRestored };
  }

  // something changed since: never overwrite a record, only take out what is still ours and unused
  for (const c of undo.created) {
    const record = stores.character.characters[c.characterId];
    const build = record?.builds?.find((b: any) => b.id === c.buildId);
    if (!build) continue;
    if (record.activeBuildId === c.buildId) {
      kept.push({ characterId: c.characterId, name: c.name, why: "it is the active build now" });
      continue;
    }
    if ((build.updatedAt ?? 0) > undo.at) {
      kept.push({ characterId: c.characterId, name: c.name, why: "it was edited after it was made" });
      continue;
    }
    record.builds = record.builds.filter((b: any) => b.id !== c.buildId);
    removed.push({ characterId: c.characterId, name: c.name });
  }
  for (const p of [...undo.pins].reverse()) {
    const gone = !stores.character.characters[p.characterId]?.builds?.some((b: any) => b.id === p.buildId);
    const team = stores.team.teams.find((t) => t.id === p.teamId);
    if (gone && team?.buildIds?.[p.slot] === p.buildId) restorePin(p);
  }
  clearAccountUndo();
  return { kind: "partial", removed, kept, pinsRestored };
}

/** Who the plan saves: every member with a new build, except one who keeps exactly today's echoes and plays in no
 *  other chosen team (nothing would change for them). Each pinned in every chosen saved team they play in. */
export function accountApplyRequest(result: Pick<BuildAccountResult, "members" | "teams">, makeActive: boolean): AccountApplyRequest {
  const members: AccountApplyMember[] = [];
  result.members.forEach((m, index) => {
    if (m.status !== "ok" || !m.draft) return;
    if (m.sameEchoes && !m.alsoIn.length) return;
    const pins = result.teams.flatMap((t) => (t.spec.id ? t.slots.filter((s) => s.member === index).map((s) => ({ teamId: t.spec.id!, slot: s.slot })) : []));
    members.push({ characterId: m.characterId, draft: m.draft, pins });
  });
  return { members, makeActive };
}

/** The confirmed save: every affected character's build into build history first ("Before Account plan"), then the
 *  new builds. */
export function saveAccountPlan(stores: BuildTeamStores, request: AccountApplyRequest, history: { echoes: any[] }): AccountApplyOutcome {
  snapshotCharacters(request.members.map((m) => m.characterId), "before-account-plan", { characters: stores.character.characters, echoes: history.echoes });
  return applyAccountPlan(stores, request);
}

/** Undo from the page: the builds as they are into build history first ("Before undoing Account plan"), then the undo. */
export function undoAccountPlanSaved(stores: BuildTeamStores, undo: AccountUndoRecord, history: { echoes: any[] }): AccountUndoOutcome {
  snapshotCharacters(undo.created.map((c) => c.characterId), "before-account-plan-undo", { characters: stores.character.characters, echoes: history.echoes });
  return undoAccountPlan(stores, undo);
}

/* ------------------------------------------------------------------------------------------------ storage */

let memoryUndo: AccountUndoRecord | null = null;

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function saveAccountUndo(undo: AccountUndoRecord): boolean {
  memoryUndo = undo;
  try {
    const s = storage();
    if (!s) return false;
    s.setItem(ACCOUNT_UNDO_KEY, JSON.stringify(undo));
    return true;
  } catch {
    return false;
  }
}

export function readAccountUndo(): AccountUndoRecord | null {
  try {
    const raw = storage()?.getItem(ACCOUNT_UNDO_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AccountUndoRecord;
      if (parsed?.v === 1 && Array.isArray(parsed.created) && Array.isArray(parsed.pins)) return parsed;
    }
  } catch {
    // unreadable: fall back to memory
  }
  return memoryUndo;
}

export function clearAccountUndo(): void {
  memoryUndo = null;
  try {
    storage()?.removeItem(ACCOUNT_UNDO_KEY);
  } catch {
    // nothing to clear
  }
}

/** Does this undo still have something to undo (one of its builds exists)? */
export function accountUndoIsLive(stores: Pick<BuildTeamStores, "character">, undo: AccountUndoRecord | null): boolean {
  if (!undo) return false;
  return undo.created.some((c) => stores.character.characters[c.characterId]?.builds?.some((b: any) => b.id === c.buildId));
}
