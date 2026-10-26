// Wuthering Tools+ Echo Lab — the cheap linear pre-score that picks which (character, slot) pairs get an exact
// engine scoring: the set-bonus change at that slot (scored exactly, once per distinct outcome) plus the stat
// change priced at the build's own per-point values (finite differences through the engine). Pure/async.
import { expectedRoll } from "../substats/substatWeights";
import {
  echoLines,
  legalSlots,
  linearGain,
  setDeltaOf,
  statDelta,
  statsOf,
  type LabCharacter,
  type LabSession,
  type SwapRules,
} from "./core";
import { remainingTypes } from "./rolls";

/**
 * An echo's stat totals with the lines it has not rolled yet counted at their expectation: each of the
 * m = 5 − n missing lines lands on one of the r types the echo lacks with probability m / r (uniform type
 * draw), at that type's expected roll. A full echo is just its stats.
 */
export function expectedFullStats(echo: Record<string, any>): Record<string, number> {
  const stats = { ...statsOf(echo) };
  const lines = echoLines(echo);
  const missing = 5 - lines.length;
  if (missing <= 0) return stats;
  const pool = remainingTypes(lines.map((l) => l.key));
  if (!pool.length) return stats;
  const share = Math.min(1, missing / pool.length);
  for (const key of pool) stats[key] = (stats[key] ?? 0) + share * expectedRoll(key);
  return stats;
}

export interface SlotPreScore {
  slot: number;
  /** estimated relative gain over the character's current build */
  pre: number;
  setDelta: number;
}

/**
 * Pre-scores every slot of a character an echo may go into (under `rules`), best first. `fill`: count the lines
 * it has not rolled yet at their expectation.
 */
export async function rankSlots(
  session: LabSession,
  lab: LabCharacter,
  echo: Record<string, any>,
  options: { fill?: boolean; rules?: SwapRules } = {},
): Promise<SlotPreScore[]> {
  const out: SlotPreScore[] = [];
  const next = options.fill ? expectedFullStats(echo) : statsOf(echo);
  for (const slot of legalSlots(lab, echo, options.rules)) {
    const own = lab.slots[slot];
    if (!own) continue;
    const setDelta = await setDeltaOf(session, lab, slot, echo.echoSet ?? null);
    const linear = await linearGain(session, lab, statDelta(next, statsOf(own.record)));
    out.push({ slot, pre: setDelta + linear, setDelta });
  }
  return out.sort((a, b) => b.pre - a.pre || a.slot - b.slot);
}

/** What an echo's substat lines are worth on a build, linearly (Σ perPoint × value) — a quality measure. */
export async function substatWorth(session: LabSession, lab: LabCharacter, echo: Record<string, any>): Promise<number> {
  const delta: Record<string, number> = {};
  for (const line of echoLines(echo)) delta[line.key] = (delta[line.key] ?? 0) + line.value;
  return linearGain(session, lab, delta);
}
