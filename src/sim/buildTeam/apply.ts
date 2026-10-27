// Wuthering Tools+ — "Build it for me": write the result, after the player confirmed it, and take it back.
//
// Each member gets a NEW build (never an existing one overwritten), named for the team — "Built for Mornye + Lynae",
// which resolveTeam.ts's by-name rule also reads — and the saved team pins it per slot through upstream's own
// `setTeamCharacterBuild` (`team.buildIds`). The active build stays as it was unless the player asks ("Also make
// active": upstream's `equipBuild`, which commits the live build first and re-syncs the `equipped` map). Echoes are
// never taken off anyone: a pinned build points at inventory echoes, which upstream lets several builds share.
//
// Undo (`wtplus:buildTeam:undo:v1`, the last apply only): the created build ids, the team's previous pins and, for
// members switched to their new build, their whole record and `equipped` entries as they were. While nothing touched
// those records since, undo restores them verbatim; otherwise it removes what it created where that is still safe and
// says what it left.
import { cyrb53, stableStringify } from "../myRankings/rankingCache";
import { characterDisplayName } from "../display/names";
import { randomString } from "../../utils/strings";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const UNDO_KEY = "wtplus:buildTeam:undo:v1";

/** What apply needs of the three Pinia stores (the real stores, or plain stand-ins in tests). */
export interface BuildTeamStores {
  character: {
    characters: Record<string, any>;
    ensureCharacterBuilds(characterId: string): void;
    equipBuild(characterId: string, buildId: string): void;
  };
  team: {
    teams: any[];
    setTeamCharacterBuild(teamId: string, slot: number, buildId: string | null): void;
  };
  inventory: {
    equipped: Record<string, Record<string, number>>;
    equippedPresets: Record<string, string>;
  };
}

export interface ApplyMember {
  slot: number;
  characterId: string;
  /** the build fields to save (buildTeam.ts `draftBuildFields`) */
  draft: Record<string, any>;
}

export interface ApplyRequest {
  team: { id: string | null; name: string; characterIds: Array<string | null> };
  members: ApplyMember[];
  /** also switch each member to the new build (default false) */
  makeActive?: boolean;
  now?: number;
}

export interface UndoRecord {
  v: 1;
  at: number;
  teamId: string | null;
  teamName: string;
  created: Array<{ characterId: string; buildId: string; name: string; slot: number }>;
  /** the saved team's pins before the apply (null: no saved team) */
  previousBuildIds: Array<string | null> | null;
  /** members whose record had no builds list (ensureCharacterBuilds made the "Default build") */
  synthesized: string[];
  /** members switched to the new build: their record as it was */
  activated: Array<{ characterId: string; record: Record<string, any> }>;
  /** with "also make active": upstream's `equipped` / `equippedPresets` maps as they were (equipBuild rewrites them) */
  inventory: { equipped: Record<string, Record<string, number>>; equippedPresets: Record<string, string> } | null;
  /** fingerprints of the touched records (and the team's pins) right after the apply */
  after: Record<string, string>;
}

export interface ApplyOutcome {
  undo: UndoRecord;
  created: UndoRecord["created"];
  /** members switched to their new build */
  activated: string[];
  /** undo could not be stored in this browser (quota / private mode): it lives until the page is left */
  undoInMemoryOnly: boolean;
}

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const fp = (v: unknown): string => cyrb53(stableStringify(v ?? null));

/** "Built for Mornye + Lynae" — the team's other members, as resolveTeam's by-name rule reads a build name; a name
 *  the character already has gets " (2)", " (3)", … so nothing is ever overwritten or ambiguous. */
export function buildNameFor(characterId: string, teamIds: ReadonlyArray<string | null>, existing: readonly string[]): string {
  const mates = teamIds.filter((id): id is string => !!id && id !== characterId).map((id) => characterDisplayName(id));
  const base = mates.length ? `Built for ${mates.join(" + ")}` : "Built from my echoes";
  if (!existing.includes(base)) return base;
  for (let n = 2; ; n++) if (!existing.includes(`${base} (${n})`)) return `${base} (${n})`;
}

const teamFp = (stores: BuildTeamStores, teamId: string | null): string => {
  const team = teamId ? stores.team.teams.find((t) => t.id === teamId) : null;
  return fp(team?.buildIds ?? null);
};

const invFp = (stores: BuildTeamStores): string => fp({ e: stores.inventory.equipped ?? {}, p: stores.inventory.equippedPresets ?? {} });

export function applyBuildTeam(stores: BuildTeamStores, request: ApplyRequest): ApplyOutcome {
  const now = request.now ?? Date.now();
  const teamId = request.team.id;
  const team = teamId ? stores.team.teams.find((t) => t.id === teamId) ?? null : null;
  const previousBuildIds = team ? [0, 1, 2].map((i) => team.buildIds?.[i] ?? null) : null;
  const created: UndoRecord["created"] = [];
  const synthesized: string[] = [];
  const activated: UndoRecord["activated"] = [];

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
    const name = buildNameFor(m.characterId, request.team.characterIds, (record.builds ?? []).map((b: any) => String(b.name ?? "")));
    const build = { id: randomString(12), name, createdAt: now, updatedAt: now, ...clone(m.draft) };
    record.builds.push(build);
    created.push({ characterId: m.characterId, buildId: build.id, name, slot: m.slot });
    if (team) stores.team.setTeamCharacterBuild(team.id, m.slot, build.id);
    if (request.makeActive) stores.character.equipBuild(m.characterId, build.id);
  }

  const after: Record<string, string> = { team: teamFp(stores, teamId), inventory: inventory ? invFp(stores) : "" };
  for (const m of request.members) after[m.characterId] = fp(stores.character.characters[m.characterId]);
  const undo: UndoRecord = { v: 1, at: now, teamId, teamName: request.team.name, created, previousBuildIds, synthesized, activated, inventory, after };
  const stored = saveUndo(undo);
  return { undo, created, activated: activated.map((a) => a.characterId), undoInMemoryOnly: !stored };
}

export interface UndoOutcome {
  /** "exact": every record restored verbatim; "partial": something changed since, only the safe parts undone */
  kind: "exact" | "partial";
  removed: Array<{ characterId: string; name: string }>;
  /** builds left in place (made active or edited since), with why */
  kept: Array<{ characterId: string; name: string; why: string }>;
  pinsRestored: boolean;
}

export function undoBuildTeam(stores: BuildTeamStores, undo: UndoRecord): UndoOutcome {
  const touched = [...new Set(undo.created.map((c) => c.characterId))];
  const team = undo.teamId ? stores.team.teams.find((t) => t.id === undo.teamId) ?? null : null;
  const untouched =
    touched.every((id) => fp(stores.character.characters[id]) === undo.after[id]) &&
    teamFp(stores, undo.teamId) === undo.after.team &&
    (!undo.inventory || invFp(stores) === undo.after.inventory);
  const removed: UndoOutcome["removed"] = [];
  const kept: UndoOutcome["kept"] = [];

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
    if (team && undo.previousBuildIds) undo.previousBuildIds.forEach((id, slot) => stores.team.setTeamCharacterBuild(team.id, slot, id));
    clearUndo();
    return { kind: "exact", removed, kept, pinsRestored: !!team };
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
  let pinsRestored = false;
  if (team && undo.previousBuildIds) {
    for (const c of undo.created) {
      const gone = !stores.character.characters[c.characterId]?.builds?.some((b: any) => b.id === c.buildId);
      if (gone && team.buildIds?.[c.slot] === c.buildId) {
        stores.team.setTeamCharacterBuild(team.id, c.slot, undo.previousBuildIds[c.slot] ?? null);
        pinsRestored = true;
      }
    }
  }
  clearUndo();
  return { kind: "partial", removed, kept, pinsRestored };
}

/* ------------------------------------------------------------------------------------------------ storage */

let memoryUndo: UndoRecord | null = null;

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/** Keeps the undo record (localStorage, else this page's memory). True when it reached localStorage. */
export function saveUndo(undo: UndoRecord): boolean {
  memoryUndo = undo;
  try {
    const s = storage();
    if (!s) return false;
    s.setItem(UNDO_KEY, JSON.stringify(undo));
    return true;
  } catch {
    return false;
  }
}

export function readUndo(): UndoRecord | null {
  try {
    const raw = storage()?.getItem(UNDO_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as UndoRecord;
      if (parsed?.v === 1 && Array.isArray(parsed.created)) return parsed;
    }
  } catch {
    // unreadable: fall back to memory
  }
  return memoryUndo;
}

export function clearUndo(): void {
  memoryUndo = null;
  try {
    storage()?.removeItem(UNDO_KEY);
  } catch {
    // nothing to clear
  }
}

/** Is this undo record about builds that still exist (an undo would do something)? */
export function undoIsLive(stores: Pick<BuildTeamStores, "character">, undo: UndoRecord | null): boolean {
  if (!undo) return false;
  return undo.created.some((c) => stores.character.characters[c.characterId]?.builds?.some((b: any) => b.id === c.buildId));
}
