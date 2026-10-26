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
