// Wuthering Tools+ — one pool's imported pity as a hand-off to upstream's odds simulator, with the sentence the page
// shows once the simulator has it (the Simulator strip and the pool cards both use it).
import { simulatorPrefill, type PoolPity } from "../pity";
import type { ConvenePrefillRequest } from "./types";

export function poolPrefillRequest(p: PoolPity): ConvenePrefillRequest | null {
  const mode = p.pool.kind === "weapon" ? "weapon" : "character";
  const fill = simulatorPrefill([p], mode, p.poolType);
  if (!fill) return null;
  const parts = [`Pity ${fill.startingPity}`];
  if (mode === "character") parts.push(fill.guaranteedNextFeatured ? "the guarantee" : "a 50/50");
  let note = `${parts.join(" and ")} from your ${p.pool.short} history are in the simulator's Advanced panel.`;
  if (fill.clamped) note += " (Your counter is 79; the simulator's curve already gives a 5★ on pull 79, so it reads 78.)";
  if (fill.pityLowerBound)
    note += ` Your history starts mid-count with no 5★ in it yet, so your real pity is at least ${p.pity5}${mode === "character" ? " and the guarantee is a guess" : ""}.`;
  else if (!fill.certain && mode === "character") note += " Your history starts mid-count, so the guarantee is a guess.";
  return { prefill: { mode, startingPity: fill.startingPity, guaranteedNextFeatured: fill.guaranteedNextFeatured }, note };
}
