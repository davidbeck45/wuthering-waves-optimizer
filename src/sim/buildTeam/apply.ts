// Wuthering Tools+ — "Build it for me": write the result, after the player confirmed it, and take it back.
//
// Each member gets a NEW build (never an existing one overwritten), named for the team — "Built for Mornye + Lynae",
// which resolveTeam.ts's by-name rule also reads — and the saved team pins it per slot through upstream's own
// `setTeamCharacterBuild` (`team.buildIds`). The active build stays as it was unless the player asks ("Also make
// active": upstream's `equipBuild`, which commits the live build first and re-syncs the `equipped` map). Echoes are
// never taken off anyone: a pinned build points at inventory echoes, which upstream lets several builds share.
//
// Undo (`wtplus:buildTeam:undo:v1`, the last apply only): the created build ids, the team's previous pins and, for
// members switched to their new build, their whole record and `equipped` entries as they were. Each character is decided
// on its own (`undoFates`): one nothing touched since goes back verbatim, one changed since keeps what is in use, and
// the page says which before and after. A pin only goes back to a build that still exists.
//
// A save is all or nothing: a store write that throws part-way puts back what was written (`snapshotForWrite`), and a
// write the browser refused takes the whole save back (useBuildTeam.ts, useBuildAccount.ts).
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
    echoes?: any[];
    equipped: Record<string, Record<string, number>>;
    equippedPresets: Record<string, string>;
  };
}

/** Why a save did nothing: the account changed since the plan, or the browser's storage is full. */
export class SaveRefused extends Error {
  constructor(readonly reason: "stale" | "storage") {
    super(reason);
    this.name = "SaveRefused";
  }
}

/** What a failed save tells the player. Every failure leaves the account as it was. */
export function saveFailedText(e: unknown): string {
  if (e instanceof SaveRefused && e.reason === "stale") return "Nothing was saved: your builds or teams changed after this plan was made. Plan again from what they are now.";
  if (e instanceof SaveRefused) return "Nothing was saved: this browser's storage is full, and your builds and teams are as they were. Delete some versions in Build history to make room, then save again.";
  return `The save failed and was taken back, so your builds and teams are as they were (${e instanceof Error ? e.message : String(e)}).`;
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

/** What Undo needs of either save (One team's `UndoRecord`, Whole account's `AccountUndoRecord`). */
export interface UndoCore {
  at: number;
  created: Array<{ characterId: string; buildId: string; name: string }>;
  synthesized: string[];
  activated: Array<{ characterId: string; record: Record<string, any> }>;
  inventory: { equipped: Record<string, Record<string, number>>; equippedPresets: Record<string, string> } | null;
  after: Record<string, string>;
}

/** What Undo does with one created build: "restore" (its character is untouched since: back as it was), "remove" (the
 *  character changed, the build is unused: only the build goes), "keep" (in use or edited), "gone" (already deleted). */
export interface UndoFate {
  characterId: string;
  name: string;
  buildId: string;
  fate: "restore" | "remove" | "keep" | "gone";
  /** why a build stays */
  why?: string;
}

/** Two characters wearing one echo after a partial undo: a kept build, and a character gone back to echoes it took. */
export interface UndoClash {
  kept: string;
  wearer: string;
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

/** The account as a plan reads it: a review only stands for the account it was planned on. */
export const accountFingerprint = (stores: BuildTeamStores): string => fp({ c: stores.character.characters, e: stores.inventory.echoes ?? [], q: stores.inventory.equipped ?? {}, t: stores.team.teams });

/** Everything a save can touch, as it is before its first write. */
export interface WriteSnapshot {
  records: Array<{ characterId: string; record: Record<string, any> | undefined }>;
  teams: Array<{ teamId: string; buildIds: Array<string | null> | undefined }>;
  equipped: Record<string, Record<string, number>>;
  equippedPresets: Record<string, string>;
}

export function snapshotForWrite(stores: BuildTeamStores, characterIds: readonly string[], teamIds: readonly string[]): WriteSnapshot {
  return {
    records: [...new Set(characterIds)].map((characterId) => ({ characterId, record: clone(stores.character.characters[characterId]) })),
    teams: [...new Set(teamIds)].map((teamId) => ({ teamId, buildIds: clone(stores.team.teams.find((t) => t.id === teamId)?.buildIds) })),
    equipped: clone(stores.inventory.equipped ?? {}),
    equippedPresets: clone(stores.inventory.equippedPresets ?? {}),
  };
}

/** Puts back a save that failed part-way. Plain assignments: this must not fail too. */
export function rollbackWrites(stores: BuildTeamStores, snapshot: WriteSnapshot): void {
  for (const { characterId, record } of snapshot.records) {
    if (record === undefined) delete stores.character.characters[characterId];
    else stores.character.characters[characterId] = record;
  }
  for (const { teamId, buildIds } of snapshot.teams) {
    const team = stores.team.teams.find((t) => t.id === teamId);
    if (!team) continue;
    if (buildIds === undefined) delete team.buildIds;
    else team.buildIds = buildIds;
  }
  stores.inventory.equipped = snapshot.equipped;
  stores.inventory.equippedPresets = snapshot.equippedPresets;
}

export function buildExists(stores: Pick<BuildTeamStores, "character">, characterId: string | null | undefined, buildId: string | null | undefined): boolean {
  return !!characterId && !!buildId && !!stores.character.characters[characterId]?.builds?.some((b: any) => b.id === buildId);
}

/** Each created build's fate, decided per character: nothing is written, so the confirm can say it before the tap. */
export function undoFates(stores: Pick<BuildTeamStores, "character">, undo: Pick<UndoCore, "created" | "after" | "at">): UndoFate[] {
  return undo.created.map((c) => {
    const base = { characterId: c.characterId, name: c.name, buildId: c.buildId };
    const record = stores.character.characters[c.characterId];
    const build = record?.builds?.find((b: any) => b.id === c.buildId);
    if (!build) return { ...base, fate: "gone" };
    if (fp(record) === undo.after[c.characterId]) return { ...base, fate: "restore" };
    if (record.activeBuildId === c.buildId) return { ...base, fate: "keep", why: "it is the active build now" };
    if ((build.updatedAt ?? 0) > undo.at) return { ...base, fate: "keep", why: "it was edited after it was made" };
    return { ...base, fate: "remove" };
  });
}

const wornBy = (stores: Pick<BuildTeamStores, "character">, characterId: string): Set<string> =>
  new Set(Object.values((stores.character.characters[characterId]?.echoes ?? {}) as Record<string, any>).map((s) => s?.echoId).filter(Boolean));

/** Writes the fates: records back verbatim or a build taken out. `exact` (every fate "restore", nothing else moved) puts
 *  the inventory maps back whole; otherwise only the entries of the characters who went back. */
export function undoCharacters(stores: BuildTeamStores, undo: UndoCore, fates: readonly UndoFate[], exact: boolean): { removed: Array<{ characterId: string; name: string }>; kept: Array<{ characterId: string; name: string; why: string }>; clashes: UndoClash[] } {
  const removed: Array<{ characterId: string; name: string }> = [];
  const kept: Array<{ characterId: string; name: string; why: string }> = [];
  const wentBack: string[] = [];
  for (const f of fates) {
    if (f.fate === "gone") continue;
    if (f.fate === "keep") {
      kept.push({ characterId: f.characterId, name: f.name, why: f.why ?? "it changed since" });
      continue;
    }
    removed.push({ characterId: f.characterId, name: f.name });
    const snapshot = f.fate === "restore" ? undo.activated.find((a) => a.characterId === f.characterId) : undefined;
    if (snapshot) {
      stores.character.characters[f.characterId] = clone(snapshot.record);
      wentBack.push(f.characterId);
      continue;
    }
    const record = stores.character.characters[f.characterId];
    record.builds = (record.builds ?? []).filter((b: any) => b.id !== f.buildId);
    if (f.fate === "restore" && undo.synthesized.includes(f.characterId)) {
      delete record.builds;
      delete record.activeBuildId;
    }
  }
  if (undo.inventory && exact) {
    stores.inventory.equipped = clone(undo.inventory.equipped);
    stores.inventory.equippedPresets = clone(undo.inventory.equippedPresets);
  } else if (undo.inventory) {
    const { equipped, equippedPresets } = undo.inventory;
    for (const id of wentBack) {
      for (const who of Object.values(stores.inventory.equipped)) if (who?.[id] != null) delete who[id];
      for (const [echoId, who] of Object.entries(equipped)) if (who?.[id] != null) stores.inventory.equipped[echoId] = { ...stores.inventory.equipped[echoId], [id]: who[id]! };
      if (equippedPresets[id] != null) stores.inventory.equippedPresets[id] = equippedPresets[id]!;
      else delete stores.inventory.equippedPresets[id];
    }
  }
  const clashes: UndoClash[] = [];
  for (const k of kept) {
    const mine = wornBy(stores, k.characterId);
    for (const id of wentBack) if ([...wornBy(stores, id)].some((e) => mine.has(e))) clashes.push({ kept: k.characterId, wearer: id });
  }
  return { removed, kept, clashes };
}

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
  const before = snapshotForWrite(stores, request.members.map((m) => m.characterId), team ? [team.id] : []);

  try {
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
  } catch (e) {
    rollbackWrites(stores, before);
    throw e;
  }

  const after: Record<string, string> = { team: teamFp(stores, teamId), inventory: inventory ? invFp(stores) : "" };
  for (const m of request.members) after[m.characterId] = fp(stores.character.characters[m.characterId]);
  const undo: UndoRecord = { v: 1, at: now, teamId, teamName: request.team.name, created, previousBuildIds, synthesized, activated, inventory, after };
  const stored = saveUndo(undo);
  return { undo, created, activated: activated.map((a) => a.characterId), undoInMemoryOnly: !stored };
}

export interface UndoOutcome {
  /** "exact": every record restored verbatim; "partial": something changed since, only what is safe undone */
  kind: "exact" | "partial";
  removed: Array<{ characterId: string; name: string }>;
  /** builds left in place (made active or edited since), with why */
  kept: Array<{ characterId: string; name: string; why: string }>;
  pinsRestored: boolean;
  clashes: UndoClash[];
}

export function undoBuildTeam(stores: BuildTeamStores, undo: UndoRecord): UndoOutcome {
  const team = undo.teamId ? stores.team.teams.find((t) => t.id === undo.teamId) ?? null : null;
  const fates = undoFates(stores, undo);
  const exact = fates.every((f) => f.fate === "restore") && teamFp(stores, undo.teamId) === undo.after.team && (!undo.inventory || invFp(stores) === undo.after.inventory);
  const { removed, kept, clashes } = undoCharacters(stores, undo, fates, exact);
  // a pin goes back to a build that still exists: another undo may have taken it out since
  const previousPin = (slot: number): string | null => {
    const id = undo.previousBuildIds?.[slot] ?? null;
    return buildExists(stores, team?.characterIds?.[slot], id) ? id : null;
  };

  if (exact) {
    if (team && undo.previousBuildIds) undo.previousBuildIds.forEach((_, slot) => stores.team.setTeamCharacterBuild(team.id, slot, previousPin(slot)));
    clearUndo();
    return { kind: "exact", removed, kept, pinsRestored: !!team, clashes };
  }

  let pinsRestored = false;
  if (team && undo.previousBuildIds) {
    for (const c of undo.created) {
      if (!buildExists(stores, c.characterId, c.buildId) && team.buildIds?.[c.slot] === c.buildId) {
        stores.team.setTeamCharacterBuild(team.id, c.slot, previousPin(c.slot));
        pinsRestored = true;
      }
    }
  }
  clearUndo();
  return { kind: "partial", removed, kept, pinsRestored, clashes };
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
