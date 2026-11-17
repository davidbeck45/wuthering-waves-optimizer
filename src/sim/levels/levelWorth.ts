// Wuthering Tools+ — "What each level is worth": the plan's shape, how its steps are ordered and the words that go
// with it. Pure and free of the damage engine (levelPlan.ts fills these in), so the drawer's view model, the CLI's
// printer and a Cypress spec can read a plan without bundling the calculator.
import type { TeamImpact } from "../account/investPlan";
import type { RotationSource } from "../myRankings/rankRoster";
import { isForteTrack, trackLabel, TRACKS, type LevelCost, type LevelStepDef, type LevelsToday } from "./levelSteps";

/** one run of the rotation: average damage, and the healing and shield it gives */
export interface Score {
  damage: number;
  healing: number;
  shield: number;
}

export interface Figure {
  base: number;
  after: number;
  /** relative: 0.031 = +3.1 % */
  gain: number;
}

export interface StepWorth {
  /** the character's own average damage per rotation on their best rotation; null when nothing could be scored */
  own: Figure | null;
  /** the rotation's healing / shield, when it has any */
  healing: Figure | null;
  shield: Figure | null;
  team: TeamImpact | null;
  /** why this step has no team figure (null with one) */
  teamNote: string | null;
  /** nothing the engine scores moves with this step on this rotation: no damage, healing or shield, no team change */
  inert: boolean;
}

export interface LevelRow extends LevelStepDef, StepWorth {}

export interface PathStep extends LevelRow {
  /** 1 = the first step to take */
  index: number;
  /** from the starting levels through this step */
  running: { gain: number | null; teamGain: number | null; healingGain: number | null; shieldGain: number | null; cost: LevelCost };
}

export type PathState = "complete" | "capped" | "cancelled" | "none";

export interface LevelPlan {
  characterId: string;
  name: string;
  /** where the steps start: the calculator's saved levels, level 1 across the board, or levels the caller gave */
  from: "saved" | "scratch" | "custom";
  table: { gameVersion: string; fetched: string };
  /** null when the cost table has no entry for the character (a kit newer than the table): nothing else is filled */
  today: LevelsToday | null;
  /** "Level 80+ · weapon level 90 · Forte skills 6 / 10 / 10 / 8 / 1" */
  startText: string;
  /** every track is at its top */
  done: boolean;
  rotation: { name: string; source: RotationSource } | null;
  /** why no gain could be scored (the rows then carry costs only): no weapon, no rotation, a rotation with no damage */
  noGain: string | null;
  /** the rotation at the starting levels */
  base: Score | null;
  team: { id: string; name: string; characterIds: string[]; base: number } | null;
  /** why there is no team figure at all */
  teamNote: string | null;
  /** the team runs another saved build of the character: what that means for these figures */
  buildNote: string | null;
  /** what the rows and the path are ordered by */
  basis: Basis;
  /** one row per track with something left, the biggest gain on `basis` first; inert rows last */
  rows: LevelRow[];
  /** how each path step was picked: the most gain per Shell Credit ("value"), or the biggest gain */
  pathOrder: "value" | "gain";
  path: PathStep[];
  pathState: PathState;
  /** steps the path leaves out because they move nothing on this rotation, as whole tracks */
  inert: LevelRow[];
  /** every step taken: all that is left */
  everything: { cost: LevelCost; own: Figure | null; healing: Figure | null; shield: Figure | null; team: TeamImpact | null } | null;
  errors: string[];
}

/** What the steps are ordered by: the team's damage where the character has a team figure (a support's own damage
 *  says little), their own damage without one, and healing or shields for a character whose rotation heals or shields
 *  more than it hits (their levels buy healing; the team's damage hardly moves). */
export type Basis = "team" | "own" | "healing" | "shield";

export const BASIS_WORDS: Record<Basis, string> = {
  team: "team damage",
  own: "own damage",
  healing: "healing",
  shield: "shield strength",
};

/** The basis for a rotation and whether a team could be scored. */
export function basisOf(base: Score | null, hasTeam: boolean): Basis {
  if (base && base.healing + base.shield > base.damage) return base.shield > base.healing ? "shield" : "healing";
  return hasTeam ? "team" : "own";
}

/** A row's gain on the basis, null when it has no figure there (a weapon step the team's build does not carry). */
export function basisGain(row: Pick<LevelRow, "own" | "healing" | "shield" | "team">, basis: Basis): number | null {
  if (basis === "team") return row.team ? row.team.gain : null;
  if (basis === "healing") return row.healing ? row.healing.gain : 0;
  if (basis === "shield") return row.shield ? row.shield.gain : 0;
  return row.own ? row.own.gain : null;
}

/**
 * Best first on `basis`: rows with a figure there before rows without, then the other figures (team, own, healing),
 * then the tracks' own order, so the order never jitters. Inert rows last. `perCredit` ranks by the gain each Shell
 * Credit buys (the path: a ten-level weapon step and one cheap Forte level are only comparable per cost).
 */
// eslint-disable-next-line no-unused-vars -- the parameters of a function type
export function compareWorth(basis: Basis, perCredit = false): (a: LevelRow, b: LevelRow) => number {
  const per = (gain: number, row: LevelRow): number => (perCredit ? (row.cost.credits > 0 ? gain / row.cost.credits : gain > 0 ? Infinity : 0) : gain);
  const others: Basis[] = (["team", "own", "healing", "shield"] as Basis[]).filter((b) => b !== basis);
  return (a, b) => {
    if (a.inert !== b.inert) return a.inert ? 1 : -1;
    const ga = basisGain(a, basis);
    const gb = basisGain(b, basis);
    if (ga != null && gb == null) return -1;
    if (ga == null && gb != null) return 1;
    if (ga != null && gb != null) {
      const d = per(gb, b) - per(ga, a);
      if (d) return d;
    }
    for (const other of others) {
      const d = per(basisGain(b, other) ?? 0, b) - per(basisGain(a, other) ?? 0, a);
      if (d) return d;
    }
    return TRACKS.findIndex((t) => t.key === a.track) - TRACKS.findIndex((t) => t.key === b.track);
  };
}

/** "not used in this rotation" for a Forte skill, "changes nothing on this rotation" for a level. */
export function inertText(row: Pick<LevelRow, "track">, rotation: string | null): string {
  const where = rotation ? ` (${rotation})` : "";
  return isForteTrack(row.track) ? `not used in this rotation${where}` : `changes nothing on this rotation${where}`;
}

/** Which values the calculator has not saved, for the note under the head: "level, weapon level or Forte levels". */
export function assumedWords(today: LevelsToday): string {
  const words: string[] = [];
  if (today.assumed.includes("level")) words.push("level");
  if (today.assumed.includes("weapon")) words.push("weapon level");
  const forte = today.assumed.filter(isForteTrack);
  if (forte.length === 5) words.push("Forte levels");
  else if (forte.length) words.push(forte.map((k) => trackLabel(k)).join(", "));
  return words.length > 1 ? `${words.slice(0, -1).join(", ")} or ${words.at(-1)}` : (words[0] ?? "");
}

/** The path's headline: "The first 3 steps give +9.1 % team damage for 1,300,000 Shell Credits". Null without a scored path. */
export function pathHeadline(plan: Pick<LevelPlan, "path" | "basis">, steps = 3): { steps: number; gain: number; basis: Basis; credits: number } | null {
  const upTo = plan.path[Math.min(steps, plan.path.length) - 1];
  if (!upTo) return null;
  const r = upTo.running;
  const gain = plan.basis === "team" ? r.teamGain : plan.basis === "healing" ? r.healingGain : plan.basis === "shield" ? r.shieldGain : r.gain;
  if (gain == null) return null;
  return { steps: upTo.index, gain, basis: plan.basis, credits: r.cost.credits };
}
