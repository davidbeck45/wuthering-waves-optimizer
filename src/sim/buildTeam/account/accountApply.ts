// Wuthering Tools+ — "Whole account": write the plan, after the player confirmed it, and take it back.
//
// Each character gets a NEW build named "Account plan" (" (2)", " (3)" … when the name is taken — never an existing
// build overwritten), pinned through upstream's `setTeamCharacterBuild` in every chosen saved team they play in (so
// Teams wears the builds the review showed). The active build stays as it was unless the player asks ("Also make
// active": upstream's `equipBuild`, which re-syncs the `equipped` map). Echoes are never taken off anyone.
//
// The page snapshots every affected character into build history first ("Before Account plan", src/sim/buildHistory/)
// and keeps one undo (`wtplus:buildAccount:undo:v1`, the last apply): created ids, every previous pin, the records of
// the characters switched to their new build and the `equipped` maps. Each character is decided on its own: one that
// still fingerprints as right after the apply goes back verbatim, one changed since keeps what is in use, and the page
// says which before and after. Same rules as Build my team's apply.ts, whose helpers do the work.
import { cyrb53, stableStringify } from "../../myRankings/rankingCache";
import { snapshotCharacters } from "../../buildHistory/history";
import { randomString } from "../../../utils/strings";
import { afterEntries, buildExists, rollbackWrites, rotationsBeforeOf, snapshotForWrite, undoCharacters, undoFates, type BuildTeamStores, type UndoClash } from "../apply";
import { worthSaving } from "../buildTeamView";
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
  /** fingerprints right after the apply: each touched character (rotations apart, apply.ts `rotationsKey`), each touched
   *  team's pins, the inventory maps */
  after: Record<string, string>;
}

export interface AccountApplyOutcome {
  undo: AccountUndoRecord;
  created: AccountUndoRecord["created"];
  activated: string[];
  /** saved teams that got a pin */
  pinnedTeams: string[];
  undoInMemoryOnly: boolean;
  /** a build from before the save went to Build history in this page's memory only (the browser refused it) */
  historyInMemoryOnly?: boolean;
}

export interface AccountUndoOutcome {
  kind: "exact" | "partial";
  removed: Array<{ characterId: string; name: string }>;
  kept: Array<{ characterId: string; name: string; why: string }>;
  pinsRestored: number;
  clashes: UndoClash[];
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
  const rotationsBefore: Record<string, string> = {};
  for (const m of request.members) {
    const record = stores.character.characters[m.characterId];
    if (!Array.isArray(record?.builds) || record.builds.length === 0) synthesized.push(m.characterId);
    if (request.makeActive) activated.push({ characterId: m.characterId, record: clone(record ?? {}) });
    rotationsBefore[m.characterId] = rotationsBeforeOf(record);
  }
  const inventory = request.makeActive ? { equipped: clone(stores.inventory.equipped ?? {}), equippedPresets: clone(stores.inventory.equippedPresets ?? {}) } : null;
  const before = snapshotForWrite(stores, request.members.map((m) => m.characterId), request.members.flatMap((m) => m.pins.map((p) => p.teamId)));

  try {
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
  } catch (e) {
    rollbackWrites(stores, before);
    throw e;
  }

  const pinnedTeams = [...new Set(pins.map((p) => p.teamId))];
  const after: Record<string, string> = { inventory: inventory ? invFp(stores) : "" };
  for (const id of pinnedTeams) after[`team:${id}`] = teamFp(stores, id);
  for (const m of request.members) Object.assign(after, afterEntries(m.characterId, stores.character.characters[m.characterId], rotationsBefore[m.characterId]!));
  const undo: AccountUndoRecord = { v: 1, at: now, created, pins, synthesized, activated, inventory, after };
  const stored = saveAccountUndo(undo);
  return { undo, created, activated: activated.map((a) => a.characterId), pinnedTeams, undoInMemoryOnly: !stored };
}

export function undoAccountPlan(stores: BuildTeamStores, undo: AccountUndoRecord): AccountUndoOutcome {
  const teamIds = [...new Set(undo.pins.map((p) => p.teamId))];
  const fates = undoFates(stores, undo);
  const exact = fates.every((f) => f.fate === "restore") && teamIds.every((id) => teamFp(stores, id) === undo.after[`team:${id}`]) && (!undo.inventory || invFp(stores) === undo.after.inventory);
  const { removed, kept, clashes } = undoCharacters(stores, undo, fates, exact);
  let pinsRestored = 0;
  for (const p of [...undo.pins].reverse()) {
    const team = stores.team.teams.find((t) => t.id === p.teamId);
    if (!team) continue;
    // changed since: a pin goes back only where its build is gone and the slot still holds it
    if (!exact && (buildExists(stores, p.characterId, p.buildId) || team.buildIds?.[p.slot] !== p.buildId)) continue;
    // and only to a build that still exists: another undo may have taken it out since
    stores.team.setTeamCharacterBuild(p.teamId, p.slot, buildExists(stores, p.characterId, p.previous) ? p.previous : null);
    pinsRestored += 1;
  }
  clearAccountUndo(undo);
  return { kind: exact ? "exact" : "partial", removed, kept, pinsRestored, clashes };
}

/** The saved teams and slots a member plays in among the chosen teams. */
const pinsOf = (result: Pick<BuildAccountResult, "teams">, index: number): AccountApplyMember["pins"] =>
  result.teams.flatMap((t) => (t.spec.id ? t.slots.filter((s) => s.member === index).map((s) => ({ teamId: t.spec.id!, slot: s.slot })) : []));

/** Who the plan saves: every member with a new build, except one who keeps exactly today's echoes, scores the same with
 *  them and plays in no other chosen team (nothing would change for them). The same echoes can score more with the run's
 *  set or main-echo buffs switched on (`worthSaving`, Build my team's rule): the review's team totals count that build,
 *  so it is saved. With `makeActive` the exception also needs them to wear those echoes already: a team can pin a build
 *  they do not wear (an earlier save does), and left on their active build they would still wear echoes the plan gives
 *  to someone else. A pinned build that is also the active one is worn (`activeBuildOf`, echoCheck.ts's rule): planning
 *  again after a save made 7 identical copies and made them active (2026-11-08 hunt M5). Each pinned in every chosen
 *  saved team they play in. */
export function accountApplyRequest(result: Pick<BuildAccountResult, "members" | "teams">, makeActive: boolean, activeBuildOf: (characterId: string) => string | null | undefined = () => null): AccountApplyRequest {
  const members: AccountApplyMember[] = [];
  result.members.forEach((m, index) => {
    if (m.status !== "ok" || !m.draft) return;
    if (m.sameEchoes && !sameEchoesSave(result, index, makeActive, activeBuildOf)) return;
    members.push({ characterId: m.characterId, draft: m.draft, pins: pinsOf(result, index) });
  });
  return { members, makeActive };
}

/** Why the Save writes a build for a member whose echoes stay exactly today's:
 *  - `buffs`: the same echoes score more with the run's set or main-echo buffs switched on (`worthSaving`);
 *  - `teams`: they play in several chosen teams and not every one pins these echoes yet;
 *  - `active`: "Also make active" is on and they do not wear these echoes now (a team pins a build they don't wear). */
export type SameEchoesSave = "buffs" | "teams" | "active";

/** The reason a member who keeps today's echoes still gets a build saved, or null when the Save writes none for them
 *  (also null for a member whose echoes change, or who has no build). The Save's own rule (`accountApplyRequest` asks
 *  this), so the member's card can say the same thing the Save does: a card read "keeps today's echoes" for Mornye while
 *  the Save wrote her a build, three cards under a headline that counted two (2026-11-08 hunt, numbers 5). */
// eslint-disable-next-line no-unused-vars -- the parameter of a function type
export function sameEchoesSave(result: Pick<BuildAccountResult, "members" | "teams">, index: number, makeActive: boolean, activeBuildOf: (characterId: string) => string | null | undefined = () => null): SameEchoesSave | null {
  const m = result.members[index];
  if (!m || m.status !== "ok" || !m.draft || !m.sameEchoes) return null;
  if (worthSaving(m)) return "buffs";
  // one who plays in several chosen teams needs a build only when one of them does not pin these echoes already
  const pinnedEverywhere = m.fromBuild.id != null && pinsOf(result, index).every((p) => result.teams.find((t) => t.spec.id === p.teamId)?.spec.buildIds?.[p.slot] === m.fromBuild.id);
  if (m.alsoIn.length && !pinnedEverywhere) return "teams";
  const wornNow = m.fromBuild.source === "active" || (m.fromBuild.id != null && m.fromBuild.id === activeBuildOf(m.characterId));
  return makeActive && !wornNow ? "active" : null;
}

/** The confirmed save: every affected character's build into build history first ("Before Account plan"), then the
 *  new builds. */
export function saveAccountPlan(stores: BuildTeamStores, request: AccountApplyRequest, history: { echoes: any[] }): AccountApplyOutcome {
  const kept = snapshotCharacters(request.members.map((m) => m.characterId), "before-account-plan", { characters: stores.character.characters, echoes: history.echoes });
  return { ...applyAccountPlan(stores, request), historyInMemoryOnly: kept.some((r) => r.inMemoryOnly) };
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

/** The record in localStorage only (another tab's save writes it too). */
export function readStoredAccountUndo(): AccountUndoRecord | null {
  try {
    const raw = storage()?.getItem(ACCOUNT_UNDO_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AccountUndoRecord;
      if (parsed?.v === 1 && Array.isArray(parsed.created) && Array.isArray(parsed.pins)) return parsed;
    }
  } catch {
    // unreadable: none
  }
  return null;
}

export function readAccountUndo(): AccountUndoRecord | null {
  return readStoredAccountUndo() ?? memoryUndo;
}

/** Forgets the undo record; with `undo`, only while it is that one: a newer save's (another tab's) stays. */
export function clearAccountUndo(undo?: Pick<AccountUndoRecord, "at">): void {
  if (!undo || memoryUndo?.at === undo.at) memoryUndo = null;
  try {
    const stored = readStoredAccountUndo();
    if (!undo || !stored || stored.at === undo.at) storage()?.removeItem(ACCOUNT_UNDO_KEY);
  } catch {
    // nothing to clear
  }
}

/** Does this undo still have something to undo (one of its builds exists)? */
export function accountUndoIsLive(stores: Pick<BuildTeamStores, "character">, undo: AccountUndoRecord | null): boolean {
  if (!undo) return false;
  return undo.created.some((c) => stores.character.characters[c.characterId]?.builds?.some((b: any) => b.id === c.buildId));
}
