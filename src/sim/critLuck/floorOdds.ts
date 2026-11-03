// Wuthering Tools+ — crit luck on /endgame in plain words: a team's chance to clear a floor and to earn each crest, off
// the kill-time distribution the check keeps per result (killOdds.ts), at the sim's speed or the player's pace. Pure.
import { TOA_CLOCK } from "../endgame/toaData";
import { chanceBy, killAtLevel, type KillOdds } from "./killOdds";
import { chanceText } from "./format";

export interface CrestChance {
  /** 1–3 */
  crest: number;
  /** seconds left the crest asks for (0 = just clear it) */
  goal: number;
  chance: number;
  text: string;
}

export interface FloorOdds {
  /** the floor down before the clock runs out */
  clear: number;
  clearText: string;
  /** each crest's chance, ascending (crest 1 first) — a "just clear it" crest is the clear itself */
  crests: CrestChance[];
  /** every crest in more than 99 runs in 100 */
  sure: boolean;
  /** not even the clear in 1 run in 100 */
  hopeless: boolean;
  /** 8 runs in 10 finish between these (s of the clock used), null where the floor isn't down that often */
  range: [number, number] | null;
}

const SURE = 0.995;

/** A floor result's odds. `pace` scales the sim's kill time the way the plan and the Calibrate tab do (1.4 = your clears
 *  take 1.4× the sim's time). Null when the check kept no distribution for it. */
export function floorOdds(goals: readonly number[], odds: Pick<KillOdds, "q"> | null | undefined, pace = 1, clock = TOA_CLOCK): FloorOdds | null {
  if (!odds?.q?.length) return null;
  const clear = chanceBy(odds, clock, pace) ?? 0;
  const crests = [...goals]
    .sort((a, b) => a - b)
    .map((goal, i) => {
      const chance = chanceBy(odds, clock - goal, pace) ?? 0;
      return { crest: i + 1, goal, chance, text: chanceText(chance) };
    });
  const lo = killAtLevel(odds, 0.1);
  const hi = killAtLevel(odds, 0.9);
  const k = pace > 0 ? pace : 1;
  return {
    clear,
    clearText: chanceText(clear),
    crests,
    sure: clear > SURE && crests.every((c) => c.chance > SURE),
    hopeless: clear < 0.005,
    range: lo !== null && hi !== null ? [lo * k, hi * k] : null,
  };
}

/** The chance a plan's stage earns the crests planned for it (`crests` of the floor's goals), at `pace`; null for a
 *  stage planned at no crest or without odds. */
export function plannedChance(goals: readonly number[], crests: number, odds: Pick<KillOdds, "q"> | null | undefined, pace = 1, clock = TOA_CLOCK): number | null {
  if (crests <= 0 || !odds?.q?.length) return null;
  const goal = [...goals].sort((a, b) => a - b)[crests - 1];
  if (goal === undefined) return null;
  return chanceBy(odds, clock - goal, pace);
}

export interface PlanLuck {
  /** every timed stage earning its planned crests in the same attempt (the stages roll their crits apart); null when no
   *  timed stage is planned at a crest */
  all: number | null;
  /** the crests a plan earns on average once crit luck plays: Σ each crest's chance (spare floors count as planned) */
  expected: number;
  /** timed stages with odds, and those planned at a crest */
  stages: number;
}

/** A plan's crit luck: the chance every planned crest lands together, and its average crests. */
export function planLuck(stages: Array<{ goals: readonly number[]; crests: number; odds: Pick<KillOdds, "q"> | null | undefined; pace?: number; timed: boolean }>, clock = TOA_CLOCK): PlanLuck | null {
  let all = 1;
  let expected = 0;
  let counted = 0;
  let timed = 0;
  for (const s of stages) {
    if (!s.timed) {
      expected += s.crests;
      continue;
    }
    const odds = floorOdds(s.goals, s.odds, s.pace ?? 1, clock);
    if (!odds) {
      if (s.crests > 0) return null;
      continue;
    }
    // a crest past the planned ones can still land on a lucky run: count every crest's chance
    expected += odds.crests.reduce((sum, c) => sum + c.chance, 0);
    timed++;
    if (s.crests <= 0) continue;
    counted++;
    all *= odds.crests[s.crests - 1]!.chance;
  }
  return timed ? { all: counted ? all : null, expected, stages: counted } : null;
}
