// Wuthering Tools+ — Energy Regen as a floor in a substat-weights panel (/my-rankings today, batch-1's
// MyRankingsSubstats at merge): waits for the energy check of the player's saved teams, then wraps the panel's scorer
// in `erAwareScorer` with the character's worst need. When there is no floor it says why, so the panel can keep the
// old "Energy Regen reads 0" line honest: no saved team with them, no energy gate in any, or the engine failed.
import type { BuildScorer } from "../substats/substatWeights";
import type { CharacterFloor } from "./energyCheck";
import { erAwareScorer } from "./erAwareScorer";
import type { EnergyNeeds } from "./useEnergyNeeds";

export type ErFloorReason = "floor" | "noTeam" | "noGate" | "notMeasured" | "failed";

export interface ErFloorScorer {
  /** the scorer to run substat weights with (the inner one when there is no floor) */
  score: BuildScorer;
  floor: CharacterFloor | null;
  /** the build's ER on its active build (%), null when unknown */
  have: number | null;
  reason: ErFloorReason;
}

export async function erFloorScorer(energy: EnergyNeeds, characterId: string, score: BuildScorer, options: { timeoutMs?: number } = {}): Promise<ErFloorScorer> {
  await energy.ready(options.timeoutMs ?? 20000);
  const have = energy.haves[characterId] ?? null;
  const floor = energy.floorFor(characterId);
  if (floor) return { score: erAwareScorer(score, characterId, { need: floor.need, team: floor.team.name }), floor, have, reason: "floor" };
  const teams = energy.savedTeams.value.filter((t) => t.characterIds.includes(characterId));
  if (!teams.length) return { score, floor: null, have, reason: "noTeam" };
  if (teams.some((t) => t.state?.status === "error" || t.state?.status === "loading" || !t.state)) return { score, floor: null, have, reason: "failed" };
  if (teams.some((t) => t.state?.status === "ok")) return { score, floor: null, have, reason: "noGate" };
  return { score, floor: null, have, reason: "notMeasured" };
}

/** Every character's ER floor (%) once the energy check of the saved teams is in — a plain record a worker job or a
 *  cache key can carry (batch-1's invest plan and Echo Lab benchmark take it as `erNeeds`). Empty when nothing gates. */
export async function erNeedsOf(energy: Pick<EnergyNeeds, "ready" | "floors">, options: { timeoutMs?: number } = {}): Promise<Record<string, number>> {
  await energy.ready(options.timeoutMs ?? 20000);
  const out: Record<string, number> = {};
  for (const [id, floor] of [...energy.floors.value].sort((a, b) => a[0].localeCompare(b[0]))) out[id] = Math.round(floor.need * 100) / 100;
  return out;
}

/** A short stable key of an `erNeeds` record, for a cache that must change when a need does. */
export const erNeedsKey = (needs: Record<string, number>): string =>
  Object.keys(needs)
    .sort()
    .map((id) => `${id}:${needs[id]}`)
    .join(",");
