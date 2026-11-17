// Wuthering Tools+ numbers log — "What moved in your numbers": a small log of the account's own figures, one entry per
// roster ranking that finished with something different from the entry before it. Pure: the shapes, what counts as
// "the same record", the caps, and the stored form. recordRanking.ts writes it, compare.ts reads two entries against
// each other, logStore.ts is the localStorage around it.
//
// One entry = when, which app build, whether the team-aware buffs switch was on, and
//   per character   the best rotation's name and its average damage per rotation, with the signature of the build scored
//   per team        (every team the roster can field: all three members armed) its damage, its members and, for a saved
//                   team, a hash of the team as defined
// A ranking that did not fully score is never an entry (recordRanking.ts refuses it: a half-scored ranking shown as whole
// was a batch 3 bug). An entry equal to the last one is not stored. The log keeps the last MAX_ENTRIES entries and stays
// under MAX_BYTES of JSON, oldest dropped first.
//
// Stored form (`{ v, s, e, seen }`): every string (ids, rotation and team names, hashes) sits once in the table `s` and
// the entries hold indexes into it, because the same 24 characters and 96 team names repeat in every entry. On David's
// account that is about 3 KB an entry instead of 12.
import type { RosterRanking, RotationSource } from "../myRankings/rankRoster";
import { buildSignature, echoIndex, teamDefinitionHash, type BuildSig } from "./signature";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const NUMBERS_LOG_KEY = "wtplus:numbers:log:v1";
export const MAX_ENTRIES = 30;
/** characters of JSON, about bytes: the log shares localStorage's few MB with the account itself */
export const MAX_BYTES = 160_000;

export interface CharacterFigure {
  id: string;
  /** the best rotation's name; null when no rotation scored */
  rotation: string | null;
  /** average damage per rotation on that rotation, to the unit */
  damage: number;
  sig: BuildSig;
}

export interface TeamFigure {
  id: string;
  name: string;
  source: RotationSource;
  members: string[];
  /** average damage per rotation, to the unit */
  damage: number;
  /** a saved team as defined (signature.ts `teamDefinitionHash`); "" for a stock team, which only an app update changes */
  def: string;
}

export interface LogEntry {
  /** when the ranking finished (ms since epoch) */
  at: number;
  /** the app build that scored it (persist/savedResults.ts `appBuildId`) */
  build: string;
  /** the team-aware buffs switch: it changes team figures */
  autoTeamBuffs: boolean;
  /** set when a Settings import replaced the account between the entry before this one and this one: when (ms) */
  importedAt?: number;
  characters: CharacterFigure[];
  teams: TeamFigure[];
}

/** The last finished ranking this browser saw, stored as an entry or not: what "is the log up to date?" asks. */
export interface LastSeen {
  /** the ranking's fingerprint (myRankings/rankingCache.ts) */
  fp: string;
  build: string;
  at: number;
}

export interface NumbersLog {
  /** oldest first */
  entries: LogEntry[];
  seen: LastSeen | null;
}

export const emptyLog = (): NumbersLog => ({ entries: [], seen: null });

export interface RankedAccount {
  characters: Record<string, any>;
  echoes: readonly any[];
  teams: readonly any[];
}

/** One entry from a finished ranking and the account it scored. Null for a ranking that did not fully score. */
export function entryFromRanking(ranking: RosterRanking, account: RankedAccount, meta: { at: number; build: string; autoTeamBuffs: boolean }): LogEntry | null {
  if (!ranking || ranking.incomplete || !Array.isArray(ranking.characters) || !Array.isArray(ranking.teams)) return null;
  const index = echoIndex(account.echoes);
  const savedTeams = new Map((account.teams ?? []).map((t) => [String(t?.id), t]));
  const characters: CharacterFigure[] = ranking.characters.map((c) => ({
    id: c.id,
    rotation: c.best?.name ?? null,
    damage: Math.round(c.best?.avgDamage ?? 0),
    sig: buildSignature(account.characters?.[c.id], index),
  }));
  const teams: TeamFigure[] = ranking.teams
    .filter((t) => !t.unarmed.length) // "fieldable", as /account lists them
    .map((t) => ({
      id: t.id,
      name: t.name,
      source: t.source,
      members: [...t.characterIds],
      damage: Math.round(t.avgDamage),
      def: t.source === "yours" ? teamDefinitionHash(savedTeams.get(t.id)) : "",
    }));
  return { at: meta.at, build: meta.build, autoTeamBuffs: meta.autoTeamBuffs, characters, teams };
}

const sigKey = (s: BuildSig): string => [s.weapon ?? "", s.refinement, s.sequence, s.hw, s.hs, s.hl, s.he, s.ho, s.rec].join("|");
const characterKey = (c: CharacterFigure): string => [c.id, c.rotation ?? "", c.damage, sigKey(c.sig)].join("|");
const teamKey = (t: TeamFigure): string => [t.id, t.name, t.source, t.members.join("+"), t.damage, t.def].join("|");

/** Everything of an entry but when it was taken, as one string: two entries with the same one are the same record. */
export function recordKey(entry: LogEntry): string {
  return [entry.build, entry.autoTeamBuffs ? "a" : "-", ...entry.characters.map(characterKey).sort(), "#", ...entry.teams.map(teamKey).sort()].join("\n");
}

export const sameRecord = (a: LogEntry, b: LogEntry): boolean => recordKey(a) === recordKey(b);

export interface AppendResult {
  log: NumbersLog;
  /** false: equal to the last entry (or too big to keep), so nothing was added */
  stored: boolean;
}

/** `entry` at the end of the log, unless it equals the last one; then the caps. `seen` is noted either way (null: this
 *  entry is not a ranking just seen, the log's own note stands). */
export function appendEntry(log: NumbersLog, entry: LogEntry, seen: LastSeen | null, caps: { maxEntries?: number; maxBytes?: number } = {}): AppendResult {
  seen ??= log.seen;
  const maxEntries = caps.maxEntries ?? MAX_ENTRIES;
  const maxBytes = caps.maxBytes ?? MAX_BYTES;
  const last = log.entries[log.entries.length - 1];
  if (last && sameRecord(last, entry)) return { log: { entries: log.entries, seen }, stored: false };
  let entries = [...log.entries, entry].slice(-maxEntries);
  while (entries.length > 1 && encodeLog({ entries, seen }).length > maxBytes) entries = entries.slice(1);
  // one entry bigger than the whole budget: nothing to compare it with could ever be kept beside it
  if (encodeLog({ entries, seen }).length > maxBytes) return { log: { entries: log.entries, seen }, stored: false };
  return { log: { entries, seen }, stored: true };
}

/** The oldest half dropped (the newest entry always stays): what a write the browser refused falls back to. */
export function halved(log: NumbersLog): NumbersLog {
  return { entries: log.entries.slice(Math.floor(log.entries.length / 2)), seen: log.seen };
}

// ---- the stored form

const SOURCES: RotationSource[] = ["yours", "curated", "wuwa_calc"];

interface Stored {
  v: 1;
  s: string[];
  e: Array<{ t: number; b: number; o: 0 | 1; i?: number; c: number[][]; m: number[][] }>;
  seen: [number, number, number] | null;
}

export function encodeLog(log: NumbersLog): string {
  const table: string[] = [];
  const at = new Map<string, number>();
  const idx = (text: string | null): number => {
    if (text === null) return -1;
    let i = at.get(text);
    if (i === undefined) {
      i = table.length;
      table.push(text);
      at.set(text, i);
    }
    return i;
  };
  const stored: Stored = {
    v: 1,
    s: table,
    e: log.entries.map((entry) => ({
      t: entry.at,
      b: idx(entry.build),
      o: entry.autoTeamBuffs ? 1 : 0,
      ...(entry.importedAt ? { i: entry.importedAt } : {}),
      c: entry.characters.map((c) => [idx(c.id), idx(c.rotation), c.damage, idx(c.sig.weapon), c.sig.refinement, c.sig.sequence, idx(c.sig.hw), idx(c.sig.hs), idx(c.sig.hl), idx(c.sig.he), idx(c.sig.ho), idx(c.sig.rec)]),
      m: entry.teams.map((t) => [idx(t.id), idx(t.name), SOURCES.indexOf(t.source), t.damage, idx(t.def), ...t.members.map((id) => idx(id))]),
    })),
    seen: log.seen ? [idx(log.seen.fp), idx(log.seen.build), log.seen.at] : null,
  };
  return JSON.stringify(stored);
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The log as stored; anything this module did not write (or cannot read whole) is an empty log, never a throw. An
 *  entry with a hole in it is dropped on its own. */
export function decodeLog(raw: string | null | undefined): NumbersLog {
  if (!raw) return emptyLog();
  let data: Stored;
  try {
    data = JSON.parse(raw) as Stored;
  } catch {
    return emptyLog();
  }
  if (!data || data.v !== 1 || !Array.isArray(data.s) || !Array.isArray(data.e) || data.s.some((s) => typeof s !== "string")) return emptyLog();
  const table = data.s;
  const text = (i: unknown): string => {
    if (!isNum(i) || !Number.isInteger(i) || i < 0 || i >= table.length) throw new Error("bad index");
    return table[i]!;
  };
  const maybe = (i: unknown): string | null => (i === -1 ? null : text(i));
  const num = (v: unknown): number => {
    if (!isNum(v)) throw new Error("bad number");
    return v;
  };
  const entries: LogEntry[] = [];
  for (const e of data.e) {
    try {
      if (!e || !Array.isArray(e.c) || !Array.isArray(e.m)) continue;
      const entry: LogEntry = {
        at: num(e.t),
        build: text(e.b),
        autoTeamBuffs: e.o === 1,
        characters: e.c.map((r) => ({
          id: text(r[0]),
          rotation: maybe(r[1]),
          damage: num(r[2]),
          sig: { weapon: maybe(r[3]), refinement: num(r[4]), sequence: num(r[5]), hw: text(r[6]), hs: text(r[7]), hl: text(r[8]), he: text(r[9]), ho: text(r[10]), rec: text(r[11]) },
        })),
        teams: e.m.map((r) => {
          const source = SOURCES[num(r[2])];
          if (!source || r.length < 6) throw new Error("bad team");
          return { id: text(r[0]), name: text(r[1]), source, damage: num(r[3]), def: text(r[4]), members: r.slice(5).map(text) };
        }),
      };
      if (isNum(e.i)) entry.importedAt = e.i;
      entries.push(entry);
    } catch {
      /* a torn entry: the others still read */
    }
  }
  entries.sort((a, b) => a.at - b.at);
  let seen: LastSeen | null = null;
  try {
    if (Array.isArray(data.seen)) seen = { fp: text(data.seen[0]), build: text(data.seen[1]), at: num(data.seen[2]) };
  } catch {
    seen = null;
  }
  return { entries, seen };
}
