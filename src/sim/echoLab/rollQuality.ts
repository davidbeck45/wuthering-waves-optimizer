// Wuthering Tools+ Echo Lab — "How good is this roll?" for one echo: where its substats sit among every echo of its
// kind it could have been at the same level, measured in damage on its owner's best rotation, and which line to hope
// for next. A +5n echo has n lines; every outcome of n lines (types drawn uniformly from the thirteen, values by
// Kuro's published tier odds — the same roll model as Tune or Feed) is scored by the engine with that echo in the
// owner's slot (the slot it sits in when worn, else its best owner's), exactly when there are few enough, else a
// seeded simulation (the same answer every run). "Hope for": each line it can still roll, at every tier, scored on
// top of the lines it has. Pure/async, worker-safe.
import { LEVELS_PER_TUNE } from "../../echoes/levelingCost";
import { SUBSTAT_KEYS, type SubstatKey } from "../substats/substatWeights";
import {
  echoLines,
  legalSlots,
  makePacer,
  prepareCharacter,
  relGain,
  scoreBuild,
  swapInto,
  weightedQuantile,
  withInventoryRecord,
  withLines,
  withSlotRecord,
  wornByIndex,
  type LabCharacter,
  type LabSession,
  type RunControl,
  type SwapRules,
} from "./core";
import { seededRandom, stableKey } from "./fingerprint";
import { tierScores } from "./rerollAdvice";
import { enumerateOutcomes, outcomeCount, outcomeKey, remainingTypes, sampleOutcome, tierOdds, type NewLine } from "./rolls";

export const ROLL_QUALITY_ASSUMPTIONS = [
  "Echo levels are not imported: an echo with n substat lines is rated as a +5n echo.",
  "The echoes it could have been keep its set, cost and main stat; their n lines are drawn uniformly from the thirteen substats (the game does not publish type odds), at Kuro's published tier odds.",
  "Rated in damage on the owner's best rotation (where it sits when worn, else its best owner's slot), never by stat weights.",
] as const;

export interface RollQualityOptions {
  /** Monte Carlo samples when the outcomes are too many to enumerate (min 1000, default 1000) */
  samples?: number;
  seed?: number | string;
  rules?: SwapRules;
}

export interface RollQualityTarget {
  characterId: string;
  slot: number;
}

export interface HopeLine {
  key: string;
  /** chance the next tune rolls this substat (1 / the substats it can still roll) */
  chance: number;
  /** relative gain over the echo as it is now, averaged over the tier odds */
  expectedGain: number;
  /** at its highest tier */
  bestGain: number;
}

export interface RollQualityResult {
  echoId: string;
  echo: string | null;
  characterId: string;
  name: string;
  slot: number;
  /** rated where it sits (worn by this character) or swapped into the slot */
  worn: boolean;
  lines: number;
  /** the level it is rated at: +5 per line */
  level: number;
  /** share of the outcomes this echo beats (ties count half), 0-1 */
  percentile: number;
  /** the outcomes' damage against this echo's, relative: below 0 = worse than yours */
  p10: number;
  p50: number;
  p90: number;
  method: "exact" | "monte-carlo";
  outcomes: number;
  scored: number;
  /** lines it can still roll, most helpful first (empty for a five-line echo) */
  hopeFor: HopeLine[];
  /** substats it can still roll that add nothing on this build (below 0.05 % even at their top tier) */
  deadLines: number;
  /** substats it can still roll */
  openLines: number;
  assumptions: readonly string[];
}

const DEAD_BELOW = 0.0005;

/** Who to rate an echo for: the built character wearing it (its slot really points at it), else none. */
export function wornTarget(session: LabSession, echoId: string): RollQualityTarget | null {
  for (const w of wornByIndex(session.account).get(echoId) ?? []) {
    if (w.stale) continue;
    const pointer = session.account.characters?.[w.characterId]?.echoes?.[w.slot]?.echoId;
    if (pointer === echoId) return { characterId: w.characterId, slot: w.slot };
  }
  return null;
}

export async function rollQuality(
  session: LabSession,
  echoId: string,
  target: RollQualityTarget | null = null,
  options: RollQualityOptions = {},
  control: RunControl = {},
): Promise<RollQualityResult> {
  const memoKey = `rollQuality|${echoId}|${stableKey(target)}|${stableKey(options)}`;
  const memoised = session.memo.get(memoKey) as RollQualityResult | undefined;
  if (memoised) return memoised;
  const result = await computeRollQuality(session, echoId, target, options, control);
  session.memo.set(memoKey, result);
  return result;
}

async function computeRollQuality(
  session: LabSession,
  echoId: string,
  given: RollQualityTarget | null,
  options: RollQualityOptions,
  control: RunControl,
): Promise<RollQualityResult> {
  const pace = makePacer(control);
  const echo = session.echoById.get(echoId);
  if (!echo) throw new Error(`No echo ${echoId} in the inventory`);
  const lines = echoLines(echo).map((l) => ({ key: l.key, value: l.value }));
  if (!lines.length) throw new Error("This echo has no substat lines yet: level it to +5 first");
  const target = given ?? wornTarget(session, echoId);
  if (!target) throw new Error("No built character wears it or can slot it, so there is no build to rate it on");
  const lab = (await prepareCharacter(session, target.characterId, pace)) as LabCharacter | null;
  if (!lab) throw new Error(`${target.characterId} can't be scored: ${session.skipped.get(target.characterId) ?? "unknown"}`);
  const worn = lab.slots[target.slot]?.echoId === echoId;
  if (!worn && !legalSlots(lab, echo, options.rules).includes(target.slot)) throw new Error(`${lab.name} has no slot for this echo`);

  // the echo with other lines, scored where it is rated (memoised per line set)
  const swapped = worn ? null : swapInto(session, lab, session.account.echoes, echoId, target.slot);
  const memo = new Map<string, number>();
  const score = async (list: Array<{ key: string; value: number }>, phase = "rating"): Promise<number> => {
    const key = outcomeKey(list as NewLine[]);
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const record = withLines(echo, list);
    let avg: number;
    if (worn) {
      const clone = withSlotRecord(session, lab, target.slot, record);
      avg = await scoreBuild(session, lab, clone.characters, clone.echoes);
    } else {
      avg = await scoreBuild(session, lab, swapped as Record<string, any>, withInventoryRecord(session.account.echoes, record));
    }
    memo.set(key, avg);
    await pace({ phase, done: memo.size, total: 1000, label: lab.name });
    return avg;
  };

  const yours = await score(lines);
  const n = lines.length;
  const samples = Math.max(1000, Math.floor(options.samples ?? 1000));
  const pool = [...SUBSTAT_KEYS] as SubstatKey[];
  const pairs: Array<[number, number]> = [];
  let method: RollQualityResult["method"];
  let outcomes: number;
  if (outcomeCount(pool, n) <= samples) {
    method = "exact";
    outcomes = 0;
    for (const o of enumerateOutcomes(pool, n)) {
      pairs.push([relGain(yours, await score(o.lines)), o.p]);
      outcomes += 1;
    }
  } else {
    method = "monte-carlo";
    outcomes = samples;
    const rng = seededRandom(options.seed ?? `${echoId}|${lab.id}|${target.slot}|quality`);
    for (let i = 0; i < samples; i++) pairs.push([relGain(yours, await score(sampleOutcome(rng, pool, n))), 1 / samples]);
  }
  const total = pairs.reduce((s, [, w]) => s + w, 0) || 1;
  const tie = (g: number): boolean => Math.abs(g) <= 1e-9;
  const percentile = pairs.reduce((s, [g, w]) => s + (tie(g) ? w / 2 : g < 0 ? w : 0), 0) / total;

  // hope for: each substat it can still roll, every tier, on top of the lines it has
  const hopeFor: HopeLine[] = [];
  let deadLines = 0;
  const open = n < 5 ? remainingTypes(lines.map((l) => l.key)) : [];
  for (const key of open) {
    const odds = tierOdds(key);
    // a substat that changes nothing at its lowest and highest tier changes nothing between (re-roll advisor's rule)
    const scores = await tierScores(lines, key, yours, (list) => score(list, "hope"));
    let expected = 0;
    let best = -Infinity;
    for (let i = 0; i < odds.values.length; i++) {
      const g = relGain(yours, scores[i]);
      expected += odds.probs[i] * g;
      best = Math.max(best, g);
    }
    if (best < DEAD_BELOW) deadLines += 1;
    else hopeFor.push({ key, chance: 1 / open.length, expectedGain: expected, bestGain: best });
  }
  hopeFor.sort((a, b) => b.expectedGain - a.expectedGain || a.key.localeCompare(b.key));

  return {
    echoId,
    echo: echo.echo ?? null,
    characterId: lab.id,
    name: lab.name,
    slot: target.slot,
    worn,
    lines: n,
    level: n * LEVELS_PER_TUNE,
    percentile,
    p10: weightedQuantile(pairs, 0.1),
    p50: weightedQuantile(pairs, 0.5),
    p90: weightedQuantile(pairs, 0.9),
    method,
    outcomes,
    scored: memo.size,
    hopeFor,
    deadLines,
    openLines: open.length,
    assumptions: ROLL_QUALITY_ASSUMPTIONS,
  };
}
