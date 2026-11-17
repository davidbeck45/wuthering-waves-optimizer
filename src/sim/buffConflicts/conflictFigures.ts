// Wuthering Tools+ — what a build with two exclusive buffs on reads as saved, and with only the one or only the other.
// The engine runs on copies of the build (`withOnly`): the account handed in is never changed. Figures follow the
// roster ranking's rules (rankRoster.ts): average damage per rotation on the best rotation the build can be scored on,
// enemy level 100 at 20 % RES; the team is the character's strongest team the account can field, scored the way
// /account scores an upgrade (createTeamScorer), exact or absent with the reason.
import { RANKING_ENEMY, isSetUp, rotationCandidates, scoreRotation, scoreTeamCandidate, teamCandidatesOf, type TeamRank } from "../myRankings/rankRoster";
import { createTeamScorer } from "../account/investPlan";
import { conflictId, recordOf, withOnly, type BuffConflict } from "./buffConflicts";

export interface RotationFigure {
  /** the rotation that scored highest on that copy of the build */
  name: string;
  avgDamage: number;
}

export interface ConflictFigures {
  id: string;
  /** best rotation, average damage per rotation: as saved, then with only each side of the pair on */
  rotation: { both: RotationFigure; only: [RotationFigure, RotationFigure] } | null;
  /** the strongest team the account can field with the character, the same three ways */
  team: { id: string; name: string; characterIds: string[]; both: number; only: [number, number] } | null;
  /** why there is no team figure */
  teamNote: string | null;
}

export interface FigureOptions {
  /** teams: builds by name and team buffs from the real members, as the rankings run them (default true) */
  autoTeamBuffs?: boolean;
  /** called between engine runs, so a page can give the browser a turn (investPlan's `slicer`) */
  slice?: () => Promise<void>;
}

async function bestRotation(id: string, characters: Record<string, any>, echoes: any[], slice?: () => Promise<void>): Promise<RotationFigure | null> {
  let best: RotationFigure | null = null;
  for (const c of await rotationCandidates(id, characters[id] ?? {})) {
    try {
      const s = await scoreRotation(c.rotation, id, characters, RANKING_ENEMY, echoes);
      if (!best || s.avgDamage > best.avgDamage) best = { name: c.name, avgDamage: s.avgDamage };
    } catch {
      // a rotation the engine cannot run is left out here, as the roster ranking leaves it out of "best"
    }
    await slice?.();
  }
  return best;
}

/** The three figures for one conflict. Null when its build is gone from `characters`. */
export async function conflictFigures(conflict: BuffConflict, characters: Record<string, any>, inventoryEchoes: any[], teams: any[], options: FigureOptions = {}): Promise<ConflictFigures | null> {
  const id = conflict.characterId;
  const record = recordOf(conflict, characters?.[id]);
  if (!record) return null;
  const variants = [record, withOnly(record, conflict, 0), withOnly(record, conflict, 1)];
  const out: ConflictFigures = { id: conflictId(conflict), rotation: null, team: null, teamNote: null };

  const rotations: Array<RotationFigure | null> = [];
  for (const v of variants) rotations.push(await bestRotation(id, { ...characters, [id]: v }, inventoryEchoes, options.slice));
  if (rotations[0] && rotations[1] && rotations[2]) out.rotation = { both: rotations[0], only: [rotations[1], rotations[2]] };

  if (!conflict.active) {
    out.teamNote = "a team runs the build in use, and this is another saved build";
    return out;
  }
  const auto = options.autoTeamBuffs ?? true;
  // the teams with this character whose members are all set up, scored as the roster ranking scores them
  const ranks: TeamRank[] = [];
  for (const c of (await teamCandidatesOf(characters, teams)).candidates) {
    if (!c.team.characterIds.includes(id) || !c.team.characterIds.every((k) => isSetUp(characters[k]))) continue;
    try {
      ranks.push(await scoreTeamCandidate(c, characters, inventoryEchoes, { autoTeamBuffs: auto }));
    } catch {
      // a team the engine cannot run is no team figure
    }
    await options.slice?.();
  }
  const scorer = await createTeamScorer(characters, inventoryEchoes, teams, ranks, { autoTeamBuffs: auto });
  const ctx = await scorer.teamFor(id);
  if (!ctx) {
    out.teamNote = await scorer.noTeamNote(id);
    return out;
  }
  const block = await scorer.buildBlock(ctx, id);
  if (block) {
    out.teamNote = block;
    return out;
  }
  const only: number[] = [];
  for (const v of variants.slice(1)) {
    const scored = await scorer.impact(ctx, null, { ...characters, [id]: v }, inventoryEchoes);
    if (!scored.team) {
      out.teamNote = scored.note;
      return out;
    }
    only.push(scored.team.avgDamage);
    await options.slice?.();
  }
  out.team = { id: ctx.rank.id, name: ctx.rank.name, characterIds: ctx.rank.characterIds, both: ctx.base, only: [only[0], only[1]] };
  return out;
}
