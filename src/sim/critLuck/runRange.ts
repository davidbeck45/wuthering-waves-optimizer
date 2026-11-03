// Wuthering Tools+ — crit luck on a wuwa_calc run (the Riley seam's RunLite): its DPS as a range. Pure.
import type { RunLite } from "../engine/rileyRun";
import { critHit, damageRange, type DamageRange } from "./spread";

/** One run's DPS, every hit critting or not at the crit the damage formula read for it (`RunLite.hitCrit`). The mean is
 *  the run's own `total` exactly (the hits' damage × the fight's frames, scaled onto it). Null for a run that carries no
 *  per-hit crit (hand-made in a test, or older than the field). */
export function runRange(run: Pick<RunLite, "hits" | "hitCrit" | "total" | "teamKey" | "rowKey">): DamageRange | null {
  const crit = run.hitCrit;
  if (!crit || crit.length !== run.hits.length || !run.hits.length) return null;
  let sum = 0;
  const hits = run.hits.map((h, i) => {
    sum += h[3];
    return critHit(h[3], crit[i]?.[0], crit[i]?.[1]);
  });
  if (!(sum > 0)) return null;
  return damageRange(hits, { scale: run.total / sum, seed: run.rowKey || run.teamKey });
}
