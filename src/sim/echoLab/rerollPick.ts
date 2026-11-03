// Wuthering Tools+ Echo Lab — when a Transducer re-roll is worth it, and which echo of a build to re-roll first.
// No engine imports (types only), so the page chunk and the calculator panel can share the exact rule the engine
// uses (rerollAdvice.ts recommends only plans above MIN_PLAN_GAIN; engineView.ts picks with pickRerollFirst).
import type { LockPlan } from "./rerollAdvice";

/** A plan whose expected gain is below this (0.05 % of the rotation) is not worth Transducers. */
export const MIN_PLAN_GAIN = 0.0005;

/**
 * The echo to re-roll first among a build's advice: the one whose recommended plan pays most per Transducer (ties:
 * the bigger expected gain, then the lower slot). Null when no echo has a plan that pays. The Echo Lab's re-roll
 * tab and the calculator's engine panel both pick with this, so the two always name the same echo.
 */
export function pickRerollFirst<T extends { slot: number; recommended: LockPlan | null }>(advices: readonly T[]): T | null {
  let best: T | null = null;
  for (const advice of advices) {
    const plan = advice.recommended;
    if (!plan || plan.expectedGain < MIN_PLAN_GAIN) continue;
    const top = best?.recommended;
    if (
      !best ||
      !top ||
      plan.gainPerTransducer > top.gainPerTransducer ||
      (plan.gainPerTransducer === top.gainPerTransducer && (plan.expectedGain > top.expectedGain || (plan.expectedGain === top.expectedGain && advice.slot < best.slot)))
    )
      best = advice;
  }
  return best;
}

/** The re-roll options of one character with their ER need (`erNeedsOf(useEnergyNeeds())`) — the very options the
 *  Echo Lab's re-roll tab, the calculator panel's `reroll` jobs and `engineView` use, so the worker's result cache
 *  answers any of them from another's run. `{}` without a need (the job's cache key is then the old one). */
export const rerollOptionsFor = (needs: Readonly<Record<string, number>> | null | undefined, id: string): { erNeed?: number } =>
  needs?.[id] != null && Number.isFinite(needs[id]) ? { erNeed: needs[id] } : {};

export type PlanChip = "lock" | "reroll" | "keep";

/**
 * The chip on each line of an echo card, read off the plan the card headlines (the one that pays best per Transducer):
 * its re-rolled lines "Re-roll #1, #2…" (numbered by the line's rank: #1 is the line most worth replacing), the lines
 * it locks "Lock"; with no plan worth Transducers (`plan` null) every line reads "Keep". The per-line verdict (worth
 * against a fresh roll) once drove the chips, so "Lock 3, re-roll 2" sat over four Lock chips (2026-11-02 audit D8).
 */
export function planChips(lines: ReadonlyArray<{ field: number; rank: number }>, plan: Pick<LockPlan, "rerolledFields"> | null): Map<number, { chip: PlanChip; order: number | null }> {
  const out = new Map<number, { chip: PlanChip; order: number | null }>();
  const rerolled = new Set(plan?.rerolledFields ?? []);
  const order = [...lines].filter((l) => rerolled.has(l.field)).sort((a, b) => a.rank - b.rank || a.field - b.field);
  for (const l of lines) {
    if (!plan) out.set(l.field, { chip: "keep", order: null });
    else if (rerolled.has(l.field)) out.set(l.field, { chip: "reroll", order: order.indexOf(l) + 1 });
    else out.set(l.field, { chip: "lock", order: null });
  }
  return out;
}

/** The plan's re-rolled lines, most worth replacing first (the order `planChips` numbers them). */
export function rerolledLines<L extends { field: number; rank: number }>(lines: readonly L[], plan: Pick<LockPlan, "rerolledFields"> | null): L[] {
  const rerolled = new Set(plan?.rerolledFields ?? []);
  return lines.filter((l) => rerolled.has(l.field)).sort((a, b) => a.rank - b.rank || a.field - b.field);
}
