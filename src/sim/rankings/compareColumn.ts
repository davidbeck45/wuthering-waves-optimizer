// Wuthering Tools+ — the comparison table's Compare column, re-read as "% of the top row".
// Pure: the controller's post-render pass (controller.ts `comparePass`) feeds it the totals and
// writes the result into Riley's cells. His column reads each team against the weakest row on screen
// (300 %, 1,200 %), coloured red → green → purple; here every team is a share of the best one
// (100 % down), or of the row the player pinned, on a neutral → accent strength scale.

/** The part of his `TeamRun` the team figure is computed from. */
export interface RunLike {
  sectionTotals: number[];
  seconds: number;
}

export type TeamMode = "dpr" | "dps";

/** His table's `teamFigure()` (vendor/wuwa_calc/src/page/table.ts): the four rotations as the average
 *  damage of one (DPR) or as damage over the time they took (DPS). Every drawn row carries this figure
 *  as `data-total`; this is for the rows his scroll window has not drawn. */
export function teamFigureOf(run: RunLike, mode: TeamMode): number {
  const whole = run.sectionTotals.reduce((a, b) => a + b, 0);
  return Math.floor(whole / (mode === "dpr" ? Math.max(1, run.sectionTotals.length) : run.seconds));
}

export interface CompareScale {
  /** the best team figure in the table */
  top: number;
  /** the weakest */
  low: number;
  /** what every share is taken of: the pinned row, else the top one */
  ref: number;
  pinned: boolean;
}

/** The scale for one table: `totals` are every listed row's figure, `pinnedTotal` the pinned row's
 *  (null when nothing is pinned or the pinned team is no longer listed). */
export function compareScale(totals: number[], pinnedTotal: number | null = null): CompareScale {
  let top = 0;
  let low = Infinity;
  for (const t of totals) {
    if (!(t > 0)) continue;
    if (t > top) top = t;
    if (t < low) low = t;
  }
  if (low === Infinity) low = 0;
  const pinned = pinnedTotal != null && pinnedTotal > 0;
  return { top, low, ref: pinned ? pinnedTotal! : top, pinned };
}

/** `total` as a share of the reference, one decimal truncated (never rounded up to a gain it did not
 *  make — his own `pctTrunc` rule): "100.0%", "97.3%", "1,204.5%". Empty without a reference. */
export function shareText(total: number, ref: number): string {
  if (!(ref > 0) || !Number.isFinite(total)) return "";
  const pct = Math.trunc((total / ref) * 1000) / 10;
  return `${pct.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** The share as a 0-1 bar width (clamped: a row above a pinned reference fills the cell). */
export function shareWidth(total: number, ref: number): number {
  if (!(ref > 0)) return 0;
  return Math.max(0, Math.min(1, total / ref));
}

/** Where a team stands between the weakest (0, neutral) and the best (1, accent) row, eased (cubed) so
 *  the accent gathers at the top of the table rather than washing over its middle: on a 250-team table
 *  whose weakest row is 40 % of the top, a row at 95 % reads 0.77, at 80 % 0.30, at 60 % 0.04. */
export function strengthOf(total: number, scale: CompareScale): number {
  const span = scale.top - scale.low;
  if (!(span > 0)) return total >= scale.top && scale.top > 0 ? 1 : 0;
  const k = Math.max(0, Math.min(1, (total - scale.low) / span));
  return k * k * k;
}
