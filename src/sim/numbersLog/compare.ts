// Wuthering Tools+ numbers log — two records against each other: which figures moved, by how much, and why, from facts
// the two records hold. Pure (the views pass the display names in).
//
// The cause of a move is the first of these that is true:
//   a character's own figure   their build signature changed            → "You changed this build: echoes, weapon"
//   a team's figure            a member's record changed                → "Chisa's build changed"
//                              the saved team itself changed            → "You changed this team"
//                              the team-aware buffs switch was flipped  → says so
//   either                     the app build changed and no build did   → "An app update" (never a named upstream change:
//                                                                         the log cannot know which one)
//   either                     none of it                               → says that nothing recorded explains it
// When a build, a team or the switch changed AND the app was updated between the two records, the row says both: the
// log cannot split a move between the two (`withUpdate`).
// A Settings import inside the window is said once for the whole comparison (`importedAt`), and the rows then say
// "this build is different", not "you changed". A character or team in only one of the two records is listed as
// appeared or gone, never as a move.
import type { CharacterFigure, LogEntry, TeamFigure } from "./log";
import { changedParts, type SigPart } from "./signature";

export type Cause =
  /** `withUpdate`: the app build changed between the two records as well, so the update may be part of the move */
  | { kind: "own-build"; parts: SigPart[]; before: CharacterFigure; after: CharacterFigure; withUpdate: boolean }
  | { kind: "members"; who: string[]; withUpdate: boolean }
  | { kind: "team-edited"; withUpdate: boolean }
  | { kind: "buffs-switch"; on: boolean; withUpdate: boolean }
  | { kind: "app-update" }
  | { kind: "unknown" };

export interface Move {
  kind: "character" | "team";
  id: string;
  /** a team's members, in slot order; a character: just them */
  members: string[];
  /** a team's own name (a character: null) */
  teamName: string | null;
  before: number;
  after: number;
  /** (after − before) / before: the change as a share of the old figure. null when the old figure was 0 */
  change: number | null;
  /** a team: other rotations of the same three with the very same two figures, folded into this row (their names) */
  alsoNamed: string[];
  /** a character whose best rotation is another one now */
  rotation: { before: string | null; after: string | null } | null;
  /** the rotation the newer figure is on (a character), for "Why this number" */
  rotationNow: string | null;
  cause: Cause;
}

export interface Listed {
  kind: "character" | "team";
  id: string;
  members: string[];
  teamName: string | null;
  damage: number;
}

export interface Comparison {
  before: LogEntry;
  after: LogEntry;
  /** the two records were scored by different app builds */
  appUpdated: boolean;
  /** when a Settings import replaced the account between the two (ms), else null */
  importedAt: number | null;
  /** biggest change first (as a share of the old figure) */
  moves: Move[];
  appeared: Listed[];
  gone: Listed[];
  /** figures in both records that did not move (teams folded the same way as the moves) */
  steady: number;
}

const share = (before: number, after: number): number | null => (before > 0 ? (after - before) / before : null);

function teamCause(before: TeamFigure, after: TeamFigure, chars: { before: Map<string, CharacterFigure>; after: Map<string, CharacterFigure> }, from: LogEntry, to: LogEntry): Cause {
  const who = after.members.filter((id) => {
    const a = chars.before.get(id);
    const b = chars.after.get(id);
    return !!a && !!b && a.sig.rec !== b.sig.rec;
  });
  const withUpdate = from.build !== to.build;
  if (who.length) return { kind: "members", who, withUpdate };
  if (before.def !== after.def || before.members.join("+") !== after.members.join("+")) return { kind: "team-edited", withUpdate };
  if (from.autoTeamBuffs !== to.autoTeamBuffs) return { kind: "buffs-switch", on: to.autoTeamBuffs, withUpdate };
  if (withUpdate) return { kind: "app-update" };
  return { kind: "unknown" };
}

function characterCause(before: CharacterFigure, after: CharacterFigure, from: LogEntry, to: LogEntry): Cause {
  const parts = changedParts(before.sig, after.sig);
  if (parts.length) return { kind: "own-build", parts, before, after, withUpdate: from.build !== to.build };
  if (from.build !== to.build) return { kind: "app-update" };
  return { kind: "unknown" };
}

/** `after` read against `before` (the older one). `window` = every entry after `before` up to and including `after`,
 *  so an import anywhere between the two is seen; without it only `after`'s own mark is. */
export function compareEntries(before: LogEntry, after: LogEntry, window: readonly LogEntry[] = [after]): Comparison {
  const chars = { before: new Map(before.characters.map((c) => [c.id, c])), after: new Map(after.characters.map((c) => [c.id, c])) };
  const teams = { before: new Map(before.teams.map((t) => [t.id, t])), after: new Map(after.teams.map((t) => [t.id, t])) };
  const moves: Move[] = [];
  const appeared: Listed[] = [];
  const gone: Listed[] = [];
  let steady = 0;

  for (const c of after.characters) {
    const was = chars.before.get(c.id);
    if (!was) {
      appeared.push({ kind: "character", id: c.id, members: [c.id], teamName: null, damage: c.damage });
      continue;
    }
    if (was.damage === c.damage) {
      steady += 1;
      continue;
    }
    moves.push({
      kind: "character",
      id: c.id,
      members: [c.id],
      teamName: null,
      alsoNamed: [],
      before: was.damage,
      after: c.damage,
      change: share(was.damage, c.damage),
      rotation: was.rotation !== c.rotation ? { before: was.rotation, after: c.rotation } : null,
      rotationNow: c.rotation,
      cause: characterCause(was, c, before, after),
    });
  }
  for (const c of before.characters) if (!chars.after.has(c.id)) gone.push({ kind: "character", id: c.id, members: [c.id], teamName: null, damage: c.damage });

  // Several stock rotations of one trio often score the very same damage (the pages fold them into one row,
  // myRankings/rows.ts `dedupeTeams`). Here: the same three, the same figure before and the same after is one row, his
  // own team first, the others named under it.
  const folded = new Map<string, Move>();
  const steadyTeams = new Set<string>();
  const ordered = [...after.teams].sort((a, b) => Number(b.source === "yours") - Number(a.source === "yours"));
  for (const t of ordered) {
    const was = teams.before.get(t.id);
    if (!was) {
      appeared.push({ kind: "team", id: t.id, members: t.members, teamName: t.name, damage: t.damage });
      continue;
    }
    const trio = [...t.members].sort().join("+");
    if (was.damage === t.damage) {
      steadyTeams.add(`${trio}|${t.damage}`);
      continue;
    }
    const key = `${trio}|${was.damage}|${t.damage}`;
    const row = folded.get(key);
    if (row) {
      row.alsoNamed.push(t.name);
      continue;
    }
    const move: Move = { kind: "team", id: t.id, members: t.members, teamName: t.name, alsoNamed: [], before: was.damage, after: t.damage, change: share(was.damage, t.damage), rotation: null, rotationNow: null, cause: teamCause(was, t, chars, before, after) };
    folded.set(key, move);
    moves.push(move);
  }
  steady += steadyTeams.size;
  for (const t of before.teams) if (!teams.after.has(t.id)) gone.push({ kind: "team", id: t.id, members: t.members, teamName: t.name, damage: t.damage });

  const size = (m: Move): number => (m.change === null ? Number.POSITIVE_INFINITY : Math.abs(m.change));
  moves.sort((a, b) => size(b) - size(a) || Math.abs(b.after - b.before) - Math.abs(a.after - a.before));
  const imports = window.filter((e) => e.at > before.at && e.at <= after.at && e.importedAt).map((e) => e.importedAt as number);
  return { before, after, appUpdated: before.build !== after.build, importedAt: imports.length ? Math.max(...imports) : null, moves, appeared, gone, steady };
}

/** The moves a card has room for: the biggest first, one row per set of members, so three variants of one team (or a
 *  character and nothing but teams they are in) do not fill it. */
export function biggestMoves(moves: readonly Move[], count = 3): Move[] {
  const seen = new Set<string>();
  const out: Move[] = [];
  for (const m of moves) {
    const key = `${m.kind}|${[...m.members].sort().join("+")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
    if (out.length === count) break;
  }
  return out;
}

// ---- the words

/* eslint-disable no-unused-vars -- the parameters of function types */
export interface Namer {
  character: (id: string) => string;
  weapon: (key: string | null) => string;
}
/* eslint-enable no-unused-vars */

const list = (items: readonly string[]): string => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

function partText(part: SigPart, before: CharacterFigure, after: CharacterFigure, names: Namer): string {
  switch (part) {
    case "weapon":
      return `weapon (${names.weapon(before.sig.weapon)} → ${names.weapon(after.sig.weapon)})`;
    case "refinement":
      return `weapon refinement (R${before.sig.refinement} → R${after.sig.refinement})`;
    case "weapon-settings":
      return "weapon level or passive switches";
    case "sequence":
      return `sequence (S${before.sig.sequence} → S${after.sig.sequence})`;
    case "chain":
      return "Resonance Chain switches";
    case "echoes":
      return "echoes";
    case "levels":
      return "levels";
    default:
      return "buffs, rotations or other settings";
  }
}

/** said after a cause that is not the update, when the app was updated between the two records too */
export const ALSO_UPDATED_TEXT = "The app was updated between the two records too, so part of this may be the update.";

/** One or two sentences for a row. `imported`: a Settings import sits between the two records, so nothing is put on
 *  "you". `kind`: whose figure it is (the last sentence names what was looked at). */
export function causeText(cause: Cause, names: Namer, imported = false, kind: Move["kind"] = "team"): string {
  const also = (text: string, withUpdate: boolean): string => (withUpdate ? `${text} ${ALSO_UPDATED_TEXT}` : text);
  switch (cause.kind) {
    case "own-build": {
      const what = list(cause.parts.map((p) => partText(p, cause.before, cause.after, names)));
      return also(imported ? `This build is different: ${what}.` : `You changed this build: ${what}.`, cause.withUpdate);
    }
    case "members": {
      const who = cause.who.map(names.character);
      return also(who.length === 1 ? `${who[0]}'s build changed.` : `The builds of ${list(who)} changed.`, cause.withUpdate);
    }
    case "team-edited":
      return also(imported ? "This team is different: its rotation, its timing or the builds it pins." : "You changed this team: its rotation, its timing or the builds it pins.", cause.withUpdate);
    case "buffs-switch":
      return also(`The team-aware buffs switch was turned ${cause.on ? "on" : "off"}.`, cause.withUpdate);
    case "app-update":
      return "An app update: no build in it changed.";
    default:
      return kind === "character" ? "Nothing the log records changed: the build and the app are the same." : "Nothing the log records changed: the members' builds, the team and the app are the same.";
  }
}

/** "+3.0 %" / "−12.4 %" / "under 0.1 %"; null when there was no old figure to take a share of. */
export function changeText(change: number | null): string | null {
  if (change === null) return null;
  const p = change * 100;
  if (Math.abs(p) < 0.05) return `${p < 0 ? "down" : "up"} under 0.1 %`;
  return `${p > 0 ? "+" : "−"}${Math.abs(p).toFixed(1)} %`;
}

/** "9 Nov, 18:20" in the reader's own time zone; the year only when it is not this one. */
export function whenText(at: number, now = Date.now()): string {
  const d = new Date(at);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  const day = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day}, ${time}`;
}

/** "9 Nov" for the "since …" picker. */
export function dayText(at: number, now = Date.now()): string {
  const d = new Date(at);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}
