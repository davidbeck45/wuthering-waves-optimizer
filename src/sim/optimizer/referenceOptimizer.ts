// Wuthering Tools+ — the headless optimizer as it stood before track "optimizer-speed" (plus-b3, 2026-11-02): kept as
// the oracle the equivalence harness and the bench compare the fast path against. Test / bench only; nothing in the
// app imports it.
//
// It is `inlineBackend().optimize` from headlessOptimizer.ts at that commit, line for line in what it computes:
// perf's deduped stream (`planOptimizerGeneration` + `optimizerLoadoutStream`), upstream's `normalizeOptimizerLoadout`,
// `computeLoadoutFinalStats` and `scoreOptimizerRotation` on every loadout, the energy-regen floor checked after the
// score, and the same top-N rule (kept only when strictly above the N-th score, stable sort). The one addition is a
// clock around the generator's `next()` and around the scoring, for the bench's time split.
import {
  computeLoadoutFinalStats,
  computeOverrideBuffVariants,
  normalizeLoadoutFormat,
  normalizeOptimizerLoadout,
  scoreOptimizerRotation,
  type OptimizerContext,
} from "../../calculator/optimizer";
import { meetsMinStatThreshold } from "../../calculator/meetsMinStatThreshold";
import { computeResonanceChainsBuffs, computeSelfBuffs } from "../../calculator/stats";
import type { MemberJob, OptimizeOutcome, OptimizeRequest, ScoredLoadout } from "../buildTeam/headlessOptimizer";
import { optimizerLoadoutStream, planOptimizerGeneration } from "./optimizerPool";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ReferenceOutcome extends OptimizeOutcome {
  /** milliseconds in the generator (its `next()` calls) and in scoring */
  generationMs: number;
  scoringMs: number;
}

export function referenceOptimize(job: MemberJob, request: OptimizeRequest): ReferenceOutcome {
  const context = { ...job.context, getRotationById: () => job.rotation } as OptimizerContext;
  const resonanceChainsBuffsData = computeResonanceChainsBuffs(context.activeCharacterResonanceChains ?? {}, context.chosenChar?.resonanceChains ?? [], context.talentData ?? {}, context.activeStance ?? null);
  const selfBuffsData = computeSelfBuffs(
    context.activeCharacterBuffs ?? {},
    context.chosenChar?.buffs ?? [],
    context.activeCharacterResonanceChains ?? {},
    context.talentData ?? {},
    context.character ?? null,
    context.activeStance ?? null,
    { havocBaneStacks: context.havocBaneStacks ?? 0 },
  );
  const overrideBuffVariants = job.rotationData.overrideActions.length ? computeOverrideBuffVariants(job.rotationData.overrideActions, context) : new Map();
  const score = (loadout: any[]): ScoredLoadout => {
    const normalized = normalizeOptimizerLoadout(loadout);
    const stats = computeLoadoutFinalStats(normalized, context, selfBuffsData, resonanceChainsBuffsData, job.echoSetPassiveBuffs, job.mainEchoStats);
    const energyRegen = Number(stats.finalStats?.energyRegen ?? 0);
    const [targetType, targetObject] = job.target.split(":");
    if (targetType === "Stat") return { loadout: normalized, targetValue: Number(stats.finalStats?.[targetObject!] ?? 0) || 0, energyRegen };
    const { damageAggregation } = scoreOptimizerRotation(job.rotationData, normalized, stats, context, overrideBuffVariants);
    return { loadout: normalized, targetValue: Number(damageAggregation.avgDamage ?? 0) || 0, energyRegen };
  };

  const plan = planOptimizerGeneration({
    echoes: request.pool,
    mainEchoKeys: request.mainEchoKeys,
    loadoutFormat: request.loadoutFormat,
    topN: request.topN,
    target: job.target,
    echoSetPassiveBuffs: job.echoSetPassiveBuffs,
    context: job.context,
    rotationData: job.rotationData,
  });
  const heap: ScoredLoadout[] = [];
  let generated = 0;
  let processed = 0;
  let generationMs = 0;
  let scoringMs = 0;
  const format = normalizeLoadoutFormat(request.loadoutFormat);
  const stream = optimizerLoadoutStream(plan.echoes, request.mainEchoKeys, format, 0, 1, { uniquePool: plan.uniquePool, skipDominatedPartials: plan.skipDominatedPartials });
  for (;;) {
    let t = performance.now();
    const next = stream.next();
    generationMs += performance.now() - t;
    if (next.done) break;
    const loadout = next.value;
    generated += 1;
    processed += 1;
    t = performance.now();
    const scored = score(loadout);
    scoringMs += performance.now() - t;
    if (request.minStats.length) {
      const er = { energyRegen: scored.energyRegen } as Record<string, number>;
      if (!request.minStats.every((m) => meetsMinStatThreshold(er[m.stat], m.minValue, m.stat))) continue;
    }
    if (heap.length < request.topN) heap.push(scored);
    else if (scored.targetValue > heap[heap.length - 1]!.targetValue) heap[heap.length - 1] = scored;
    else continue;
    heap.sort((a, b) => b.targetValue - a.targetValue);
  }
  return { results: heap, processed, generated, generationMs, scoringMs };
}
