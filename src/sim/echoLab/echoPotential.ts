// Wuthering Tools+ Echo Lab — "Tune or Feed?": what an echo that has not rolled all five substat lines can
// still become in a character's slot. WuWa lines never upgrade once they appear, so the only unknowns are
// the lines still to come: an echo with n lines (≥ +5n) rolls 5 − n more, each a type it does not hold yet
// (drawn uniformly — the game publishes no type odds; stated in the output) at a value from Kuro's
// published tier odds. Small outcome spaces are enumerated exactly; larger ones are sampled with a seeded
// PRNG (the same answer every run). Every outcome is scored by the engine with the echo swapped into the
// slot (memoised per distinct outcome). Pure/async, worker-safe.
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
  type LabSession,
  type RunControl,
  type SwapRules,
} from "./core";
import { seededRandom } from "./fingerprint";
import { rankSlots } from "./prescore";
import { enumerateOutcomes, outcomeCount, outcomeKey, remainingTypes, sampleOutcome, type NewLine } from "./rolls";

/** Cumulative echo EXP to reach +0, +5, … +25 (approx. — community sources, not the game's own table). */
export const APPROX_TUNING_EXP = [0, 4400, 16500, 39600, 79100, 142600] as const;
/** Tuners spent per substat line revealed (approx. — community sources). */
export const APPROX_TUNERS_PER_LINE = 10;

export const POTENTIAL_ASSUMPTIONS = [
  "Each line still to roll is a substat type the echo does not hold yet, drawn uniformly — the game does not publish type odds.",
  "Values follow Kuro's published tier odds (7/8/21/25/18/15/6/3; crit 70/70/70/24/24/24/9/9; flat ATK 7/54/39/3; flat DEF 15/46/33/9).",
  "Tuning costs are approx. (community sources).",
] as const;

export type PotentialVerdict = "tune" | "gamble" | "feed" | "done";

export interface PotentialOptions {
  /** Monte Carlo samples when the outcome space is too large to enumerate (min 1000, default 1000) */
  samples?: number;
  seed?: number | string;
  /** enumerate exactly up to this many outcomes (default: the sample count) */
  exactLimit?: number;
  /** P(beats the current echo) at which the verdict says tune (default 0.5) and gamble (default 0.15) */
  tuneAt?: number;
  gambleAt?: number;
  /** the swap rules the slot must pass (see core `SwapRules`) */
  rules?: SwapRules;
}

export interface PotentialTarget {
  characterId: string;
  /** a legal slot; default: the slot the expected full echo pre-scores best in */
  slot?: number;
}

export interface EchoPotentialResult {
  echoId: string;
  characterId: string;
  name: string;
  slot: number;
  replacedEchoId: string | null;
  /** lines the echo has, and how many it will still roll */
  lines: number;
  remaining: number;
  method: "complete" | "exact" | "monte-carlo";
  /** outcomes enumerated or samples drawn, and the engine scorings that took (distinct outcomes) */
  outcomes: number;
  scored: number;
  seed: number | string | null;
  /** relative gain over the character's current build of the echo as it is now */
  current: number;
  /** probability the finished echo beats the echo now in that slot */
  pBeat: number;
  expectedGain: number;
  p10: number;
  p50: number;
  p90: number;
  best: number;
  worst: number;
  verdict: PotentialVerdict;
  cost: { tuners: number; exp: number; approx: true; note: string };
  /** approx. tuners spent per finished echo that beats the current one (null when none can) */
  tunersPerUpgrade: number | null;
  assumptions: readonly string[];
}

const verdictOf = (pBeat: number, remaining: number, tuneAt: number, gambleAt: number): PotentialVerdict => {
  if (remaining <= 0) return "done";
  if (pBeat >= tuneAt) return "tune";
  if (pBeat >= gambleAt) return "gamble";
  return "feed";
};

/**
 * The potential of one inventory echo in one character's slot. Throws when the echo or character is unknown
 * or the echo has no legal slot on that character.
 */
export async function echoPotential(
  session: LabSession,
  echoId: string,
  target: PotentialTarget,
  options: PotentialOptions = {},
  control: RunControl = {},
): Promise<EchoPotentialResult> {
  const pace = makePacer(control);
  const echo = session.echoById.get(echoId);
  if (!echo) throw new Error(`No echo ${echoId} in the inventory`);
  const lab = await prepareCharacter(session, target.characterId, pace);
  if (!lab) throw new Error(`${target.characterId} can't be scored: ${session.skipped.get(target.characterId) ?? "unknown"}`);
  const legal = legalSlots(lab, echo, options.rules);
  let slot = target.slot;
  if (slot === undefined) slot = (await rankSlots(session, lab, echo, { fill: true, rules: options.rules }))[0]?.slot;
  if (slot === undefined || !legal.includes(slot)) throw new Error(`${lab.name} has no slot for ${echo.echo ?? echoId}`);

  const samples = Math.max(1000, Math.floor(options.samples ?? 1000));
  const exactLimit = options.exactLimit ?? samples;
  const tuneAt = options.tuneAt ?? 0.5;
  const gambleAt = options.gambleAt ?? 0.15;
  const lines = echoLines(echo);
  const remaining = Math.max(0, 5 - lines.length);
  const pool = remainingTypes(lines.map((l) => l.key));

  // the swap is the same for every outcome (same set, same species): compute it once
  const characters = swapInto(session, lab, session.account.echoes, echoId, slot);
  const memo = new Map<string, number>();
  const scoreLines = async (extra: NewLine[]): Promise<number> => {
    const key = outcomeKey(extra);
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const record = withLines(echo, [...lines.map((l) => ({ key: l.key, value: l.value })), ...extra]);
    const echoes = withInventoryRecord(session.account.echoes, record);
    const gain = relGain(lab.base, await scoreBuild(session, lab, characters, echoes));
    memo.set(key, gain);
    await pace({ phase: "potential", done: memo.size, total: Math.min(samples, outcomeCount(pool, remaining)), label: lab.name });
    return gain;
  };

  const current = await scoreLines([]);
  const pairs: Array<[number, number]> = [];
  let method: EchoPotentialResult["method"] = "complete";
  let outcomes = 1;
  const k = Math.min(remaining, pool.length);
  if (k <= 0) {
    pairs.push([current, 1]);
  } else if (outcomeCount(pool, k) <= exactLimit) {
    method = "exact";
    outcomes = 0;
    for (const outcome of enumerateOutcomes(pool, k)) {
      pairs.push([await scoreLines(outcome.lines), outcome.p]);
      outcomes += 1;
    }
  } else {
    method = "monte-carlo";
    outcomes = samples;
    const rng = seededRandom(options.seed ?? `${echoId}|${lab.id}|${slot}`);
    for (let i = 0; i < samples; i++) pairs.push([await scoreLines(sampleOutcome(rng, pool, k)), 1 / samples]);
  }

  const total = pairs.reduce((s, [, w]) => s + w, 0);
  const pBeat = pairs.reduce((s, [g, w]) => s + (g > 0 ? w : 0), 0) / total;
  const expectedGain = pairs.reduce((s, [g, w]) => s + g * w, 0) / total;
  const tuners = remaining * APPROX_TUNERS_PER_LINE;
  const exp = APPROX_TUNING_EXP[5] - APPROX_TUNING_EXP[Math.min(5, lines.length)];
  return {
    echoId,
    characterId: lab.id,
    name: lab.name,
    slot,
    replacedEchoId: lab.slots[slot]?.echoId ?? null,
    lines: lines.length,
    remaining,
    method,
    outcomes,
    scored: memo.size,
    seed: method === "monte-carlo" ? options.seed ?? `${echoId}|${lab.id}|${slot}` : null,
    current,
    pBeat,
    expectedGain,
    p10: weightedQuantile(pairs, 0.1),
    p50: weightedQuantile(pairs, 0.5),
    p90: weightedQuantile(pairs, 0.9),
    best: Math.max(...pairs.map(([g]) => g)),
    worst: Math.min(...pairs.map(([g]) => g)),
    verdict: verdictOf(pBeat, remaining, tuneAt, gambleAt),
    cost: { tuners, exp, approx: true, note: "approx. — tuner and EXP costs are from community sources" },
    tunersPerUpgrade: remaining > 0 && pBeat > 0 ? tuners / pBeat : null,
    assumptions: POTENTIAL_ASSUMPTIONS,
  };
}
