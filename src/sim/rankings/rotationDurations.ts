// Wuthering Tools+ — the rotation time of member loops imported before the frame-accurate engine (2026-11-02 audit M5).
//
// "Import team into Wuthering Tools+" with "also save each member's loop" writes each member's steady-state loop to that
// character's rotations. Since the frame-accurate engine (2026-10-26) the loop carries `duration` (wuwa_calc's loop
// length, the same seconds the team gets); a loop saved before that has none. With the Labs flag "Rotation timing from
// frame data" on, the calculator then divides the loop's damage by that one character's own frames (12 s for Aemeath
// instead of the team's 25 s) and prints about twice the team's DPS; with it off, no DPS at all.
//
// Sync my teams (and `npm run cli -- sync-teams`) fills those gaps from the synced wuwa_calc team that ran the same
// loop: the same three characters and the same investment tier in both names ("S6R5 DPS · S1R1/S6R1 team"), so the
// seconds are the very loop wuwa_calc timed. A loop whose team is not saved, is ambiguous, or has no rotation time
// itself is left alone and listed. Only an empty duration is ever written; the player's own numbers stay. Pure: plain
// data in and out (the browser writes through the character store, the CLI into its copy of the export).
import { parsePresetName } from "../presets/presetName";

/** The first words of a member loop's description (importFromRankings.ts `prepareTeamImport`). */
export const MEMBER_LOOP_PREFIX = "Steady-state loop from the Team Rankings page";

export interface DurationFill {
  characterId: string;
  rotationId: string;
  /** the rotation's stored name */
  name: string;
  /** the seconds written: the synced team's loop */
  to: number;
  /** the team it came from */
  teamId: string;
  teamName: string;
}

export interface DurationGap {
  characterId: string;
  rotationId: string;
  name: string;
  /** why no time could be filled */
  reason: "noTeam" | "ambiguous";
}

export interface DurationPlan {
  fills: DurationFill[];
  /** member loops with no duration that no saved team can time */
  gaps: DurationGap[];
}

const hasDuration = (d: unknown): boolean => Number(d) > 0;
const sameMembers = (a: readonly string[], b: ReadonlyArray<string | null | undefined>): boolean => {
  const bb = b.filter((x): x is string => Boolean(x));
  return a.length === bb.length && [...a].sort().join("|") === [...bb].sort().join("|");
};
/** the investment chips of a generated name, as one comparable key ("dps:main DPS S6R5|team:supports S1R1 / S6R1") */
const tierKey = (name: string): string =>
  parsePresetName(name)
    .chips.filter((c) => c.kind === "dps" || c.kind === "team" || c.kind === "tier")
    .map((c) => `${c.kind === "tier" ? "tier" : c.kind}:${c.label}`)
    .sort()
    .join("|");

/** A team-level tier key for a member loop: its own state is the loop's, not the team's ("Aemeath S6R5 …" carries "S6R5"
 *  as an `own` chip and the team's "S6R5 DPS · S1R1/S6R1 team" as dps / team chips; a one-tier team only `tier`). */
function loopTierKey(name: string): string {
  const parts = parsePresetName(name);
  const dps = parts.chips.find((c) => c.kind === "dps")?.label ?? null;
  const team = parts.chips.find((c) => c.kind === "team")?.label ?? null;
  const tier = parts.chips.find((c) => c.kind === "tier")?.label ?? null;
  const own = parts.chips.find((c) => c.kind === "own")?.label ?? null;
  // the importer writes "<own> … · <tag>": a one-tier team's tag equals the loop's own state and parsePresetName folds
  // it away (no chip); "S6R5 DPS · S1R1/S6R1 team" stays as dps (when it differs from own) and team chips
  if (team) return [`dps:${dps ?? `main DPS ${own ?? ""}`.trim()}`, `team:${team}`].sort().join("|");
  if (tier) return `tier:${tier}`;
  return own ? `tier:${own}` : "";
}

/** The member loops (saved character rotations from a /rankings import) with no rotation time, and the time each gets. */
export function planRotationDurations(characters: Record<string, any>, teams: readonly any[]): DurationPlan {
  const fills: DurationFill[] = [];
  const gaps: DurationGap[] = [];
  const timed = (teams ?? []).filter((t) => hasDuration(t?.duration) && parsePresetName(t?.name ?? "").generated);
  // a Rover form in the gender the account holds (parsePresetName's `owned`)
  const owned = Object.keys(characters ?? {});
  for (const [characterId, record] of Object.entries(characters ?? {})) {
    for (const r of (record?.rotations ?? []) as any[]) {
      if (!r || hasDuration(r.duration) || !String(r.description ?? "").startsWith(MEMBER_LOOP_PREFIX)) continue;
      const parts = parsePresetName(r.name ?? "", { owned });
      const members = parts.mainKey ? [parts.mainKey, ...parts.teammateKeys] : [];
      const base = { characterId, rotationId: String(r.id ?? ""), name: String(r.name ?? "") };
      if (members.length !== 3 || !members.includes(characterId)) {
        gaps.push({ ...base, reason: "noTeam" });
        continue;
      }
      const want = loopTierKey(r.name ?? "");
      const same = timed.filter((t) => sameMembers(members, t.characterIds ?? []) && tierKey(t.name) === want);
      const seconds = [...new Set(same.map((t) => Math.round(Number(t.duration) * 100) / 100))];
      if (!same.length) gaps.push({ ...base, reason: "noTeam" });
      else if (seconds.length > 1) gaps.push({ ...base, reason: "ambiguous" });
      else fills.push({ ...base, to: seconds[0]!, teamId: String(same[0].id ?? ""), teamName: String(same[0].name ?? "") });
    }
  }
  return { fills, gaps };
}

/** The rotations of one character with the plan's times written in (a new array; untouched records are shared). */
export function rotationsWithDurations(rotations: readonly any[], fills: readonly DurationFill[]): any[] {
  const byId = new Map(fills.map((f) => [f.rotationId, f.to]));
  return (rotations ?? []).map((r) => (r && byId.has(String(r.id)) && !hasDuration(r.duration) ? { ...r, duration: byId.get(String(r.id)) } : r));
}

/** Every character's rotations with the plan applied, in place on `characters` (the CLI's copy of the export). */
export function applyRotationDurations(characters: Record<string, any>, fills: readonly DurationFill[]): number {
  let written = 0;
  for (const id of new Set(fills.map((f) => f.characterId))) {
    const record = characters?.[id];
    if (!record?.rotations) continue;
    const next = rotationsWithDurations(record.rotations, fills.filter((f) => f.characterId === id));
    written += next.filter((r, i) => r !== record.rotations[i]).length;
    record.rotations = next;
  }
  return written;
}

/** Undo: the filled rotations back to no duration, unless the player has set another time since. */
export function revertRotationDurations(rotations: readonly any[], fills: readonly DurationFill[]): any[] {
  const byId = new Map(fills.map((f) => [f.rotationId, f.to]));
  return (rotations ?? []).map((r) => (r && byId.has(String(r.id)) && Number(r.duration) === byId.get(String(r.id)) ? { ...r, duration: null } : r));
}

/** The last sync's filled times, for its Undo (beside syncUndo.ts's teams, under a key of its own). */
export const DURATION_UNDO_KEY = "wtplus:rankings:sync:durations:v1";

const safeStorage = (): Storage | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

export function readDurationUndo(storage: Pick<Storage, "getItem"> | null = safeStorage()): DurationFill[] {
  try {
    const raw = storage?.getItem(DURATION_UNDO_KEY);
    const list = raw ? (JSON.parse(raw) as DurationFill[]) : [];
    return Array.isArray(list) ? list.filter((f) => f && typeof f.rotationId === "string" && Number(f.to) > 0) : [];
  } catch {
    return [];
  }
}

/** False when the browser would not store it (quota): the caller keeps the times for this visit and says so. */
export function saveDurationUndo(fills: readonly DurationFill[] | null, storage: Pick<Storage, "setItem" | "removeItem"> | null = safeStorage()): boolean {
  try {
    if (!storage) return false;
    if (fills?.length) storage.setItem(DURATION_UNDO_KEY, JSON.stringify(fills));
    else storage.removeItem(DURATION_UNDO_KEY);
    return true;
  } catch {
    return false;
  }
}
