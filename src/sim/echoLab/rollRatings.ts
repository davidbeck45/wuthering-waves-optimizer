// Wuthering Tools+ Echo Lab — "how good is this roll" for the whole inventory at once (the inventory page's chips and
// its "Best rolls first" sort). The exact answer (rollQuality.ts) scores ~1,000 outcomes through the engine per echo,
// about a second each: four minutes for 250 echoes. This is the same question priced once per echo instead: the echo
// sits in the slot it is rated in (worn: where it is; else its best owner's slot, the swap recomputed) with its lines
// blanked, and each substat's worth there is one engine scoring of one expected roll of it, plus Crit Rate's headroom
// under its 100 % cap and the Crit Rate × Crit DMG cross term (up to three more scorings). Every outcome of n lines
// (the same roll model: n of the thirteen types, Kuro's tier odds) is then valued with those prices, exact for few
// outcomes, else 4,000 seeded samples. On David's export (all 247 rated echoes, checked 2026-11-04) it sat within 2.1
// points of the exact percentile on 9 of 10 (mean 0.89, worst 5.9; the exact one's own 1,000 samples wobble by about
// 1.3), and as close on echoes cut down to 1-4 lines, which that export hardly has (62 of each: mean 0.1-1.1, 9 of 10
// within 2.3, worst 8.9 on a two-line echo), for ~10 engine scorings an echo. Pure/async, worker-safe.
import { LEVELS_PER_TUNE } from "../../echoes/levelingCost";
import { SUBSTAT_KEYS, expectedRoll, rollTiers, type SubstatKey } from "../substats/substatWeights";
import {
  echoLines,
  isCancelled,
  legalSlots,
  makePacer,
  perPointOf,
  prepareCharacter,
  relGain,
  scoreBuild,
  swapInto,
  withInventoryRecord,
  withLines,
  withSlotRecord,
  type LabCharacter,
  type LabSession,
  type Pacer,
  type RunControl,
} from "./core";
import { seededRandom } from "./fingerprint";
import { enumerateOutcomes, outcomeCount, sampleOutcome } from "./rolls";
import type { RollQualityTarget } from "./rollQuality";

export const ROLL_RATING_ASSUMPTIONS = [
  "Echo levels are not imported: an echo with n substat lines is rated as a +5n echo.",
  "The echoes it could have been keep its set, cost and main stat; their n lines are drawn uniformly from the thirteen substats, at Kuro's published tier odds.",
  "A quick estimate: each substat is priced by the damage engine on the owner's best rotation with this echo in the slot (Crit Rate's 100 % cap and Crit Rate × Crit DMG included), and every outcome is valued with those prices. Echo Lab's detail scores every outcome through the engine.",
] as const;

/** one echo to rate, and where (the rule of EchoLabRollQuality: its built wearer, else its best owner's slot) */
export interface RollRatingItem extends RollQualityTarget {
  echoId: string;
}

export interface RollRating {
  echoId: string;
  characterId: string;
  slot: number;
  /** rated where it sits (worn by this character) or swapped into the slot */
  worn: boolean;
  lines: number;
  /** the level it is rated at: +5 per line */
  level: number;
  /** share of the outcomes this echo beats (ties count half), 0-1 */
  percentile: number;
  method: "exact" | "monte-carlo";
  outcomes: number;
}

export interface RollRatingsResult {
  ratings: RollRating[];
  /** items that could not be rated, and why (no lines, no slot, a character that can't be scored) */
  errors: Array<{ echoId: string; reason: string }>;
  /** engine scorings this job ran (memoised items cost none) */
  scorings: number;
}

export interface RollRatingOptions {
  /** samples when the outcomes are too many to enumerate (default 4000) */
  samples?: number;
  /** false: leave out the Crit Rate × Crit DMG term (the accuracy check compares both; default on) */
  critPair?: boolean;
}

/** outcomes enumerated exactly up to this many (one line: 96; two lines already ~4,700) */
const EXACT_UP_TO = 4000;

/** Rates every item (memoised per session, so a later batch or a re-ask costs nothing). */
export async function rollRatings(session: LabSession, items: readonly RollRatingItem[], options: RollRatingOptions = {}, control: RunControl = {}): Promise<RollRatingsResult> {
  const pace = makePacer(control);
  const start = session.scorings;
  const ratings: RollRating[] = [];
  const errors: Array<{ echoId: string; reason: string }> = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const key = `rollRating|${item.echoId}|${item.characterId}|${item.slot}|${options.samples ?? ""}|${options.critPair ?? ""}`;
    let entry = session.memo.get(key) as RollRating | { error: string } | undefined;
    if (!entry) {
      try {
        entry = await rateOne(session, item, options, pace);
      } catch (err) {
        if (isCancelled(err)) throw err;
        entry = { error: err instanceof Error ? err.message : String(err) };
      }
      session.memo.set(key, entry);
    }
    if ("error" in entry) errors.push({ echoId: item.echoId, reason: entry.error });
    else ratings.push(entry);
    await pace({ phase: "ratings", done: i + 1, total: items.length });
  }
  return { ratings, errors, scorings: session.scorings - start };
}

async function rateOne(session: LabSession, item: RollRatingItem, options: RollRatingOptions, pace: Pacer): Promise<RollRating> {
  const echo = session.echoById.get(item.echoId);
  if (!echo) throw new Error(`No echo ${item.echoId} in the inventory`);
  const lines = echoLines(echo).map((l) => ({ key: l.key, value: l.value }));
  if (!lines.length) throw new Error("No substat lines yet");
  const lab = (await prepareCharacter(session, item.characterId, pace)) as LabCharacter | null;
  if (!lab) throw new Error(`${item.characterId} can't be scored: ${session.skipped.get(item.characterId) ?? "unknown"}`);
  const worn = lab.slots[item.slot]?.echoId === item.echoId;
  if (!worn && !legalSlots(lab, echo).includes(item.slot)) throw new Error(`${lab.name} has no slot for this echo`);

  // the echo with other lines, in the slot it is rated in (rollQuality.ts's two cases)
  const swapped = worn ? null : swapInto(session, lab, session.account.echoes, item.echoId, item.slot);
  const score = async (list: Array<{ key: string; value: number }>): Promise<number> => {
    const record = withLines(echo, list);
    if (worn) {
      const clone = withSlotRecord(session, lab, item.slot, record);
      return scoreBuild(session, lab, clone.characters, clone.echoes);
    }
    return scoreBuild(session, lab, swapped as Record<string, any>, withInventoryRecord(session.account.echoes, record));
  };

  // each substat's worth per point with this echo blank in the slot. A stat the build's own price says does nothing
  // (DEF for an ATK scaler, Energy Regen for most kits) does nothing here either, so it is not scored; Crit Rate is
  // always scored: a build over the cap prices it at 0, but without this echo's crit lines it may be under.
  const blank = await score([]);
  const price: Partial<Record<SubstatKey, number>> = {};
  for (const key of SUBSTAT_KEYS) {
    if (key !== "CritRate" && (await perPointOf(session, lab, key)) === 0) {
      price[key] = 0;
      continue;
    }
    const roll = expectedRoll(key);
    price[key] = relGain(blank, await score([{ key, value: roll }])) / roll;
    await pace();
  }
  // Crit Rate stops counting at 100 %: a build a few points under the cap gets as much from a small Crit Rate roll as
  // from a big one. The top roll is scored too (and, when even the average roll overshoots, the lowest), so a line's
  // worth is price × min(value, headroom). Without it a 10.5 % Crit Rate echo on a near-capped build read 9 points
  // luckier than the exact rating (David's export, 2026-11-02).
  let critRoom = Infinity;
  if (price.CritRate) {
    const tiers = rollTiers("CritRate");
    const at = (v: number): Promise<number> => score([{ key: "CritRate", value: v }]).then((d) => relGain(blank, d));
    const e = expectedRoll("CritRate");
    const top = tiers[tiers.length - 1] ?? e;
    const atTop = await at(top);
    if (atTop < price.CritRate * top * 0.995) {
      if (atTop > price.CritRate * e * 1.005) critRoom = atTop / price.CritRate;
      else {
        const low = tiers[0] ?? e;
        price.CritRate = (await at(low)) / low;
        critRoom = price.CritRate > 0 ? atTop / price.CritRate : 0;
      }
    }
  }
  // Crit Rate and Crit DMG multiply (1 + rate × dmg): together they are worth more than apart, the one pair a price
  // list misses. One more scoring measures that extra, per point of each.
  let critPair = 0;
  if (options.critPair !== false && price.CritRate && price.CritDMG) {
    const cr = Math.min(expectedRoll("CritRate"), critRoom);
    const cd = expectedRoll("CritDMG");
    const both = relGain(blank, await score([{ key: "CritRate", value: expectedRoll("CritRate") }, { key: "CritDMG", value: cd }]));
    critPair = cr > 0 ? (both - price.CritRate * cr - price.CritDMG * cd) / (cr * cd) : 0;
  }
  const worth = (list: ReadonlyArray<{ key: string; value: number }>): number => {
    let sum = 0;
    let cr = 0;
    let cd = 0;
    for (const l of list) {
      if (l.key === "CritRate") {
        cr = Math.min(l.value, critRoom);
        sum += (price.CritRate ?? 0) * cr;
        continue;
      }
      if (l.key === "CritDMG") cd = l.value;
      sum += (price[l.key as SubstatKey] ?? 0) * l.value;
    }
    return sum + critPair * cr * cd;
  };

  const yours = worth(lines);
  const n = lines.length;
  const pool = [...SUBSTAT_KEYS] as SubstatKey[];
  const tie = (d: number): boolean => Math.abs(d) <= 1e-12;
  let below = 0;
  let total = 0;
  let method: RollRating["method"];
  let outcomes: number;
  if (outcomeCount(pool, n) <= EXACT_UP_TO) {
    method = "exact";
    outcomes = 0;
    for (const o of enumerateOutcomes(pool, n)) {
      const d = worth(o.lines) - yours;
      below += tie(d) ? o.p / 2 : d < 0 ? o.p : 0;
      total += o.p;
      outcomes += 1;
    }
  } else {
    method = "monte-carlo";
    outcomes = Math.max(1000, Math.floor(options.samples ?? 4000));
    const rng = seededRandom(`${item.echoId}|${lab.id}|${item.slot}|rating`);
    for (let i = 0; i < outcomes; i++) {
      const d = worth(sampleOutcome(rng, pool, n)) - yours;
      below += tie(d) ? 0.5 : d < 0 ? 1 : 0;
      total += 1;
    }
  }
  return {
    echoId: item.echoId,
    characterId: lab.id,
    slot: item.slot,
    worn,
    lines: n,
    level: n * LEVELS_PER_TUNE,
    percentile: total > 0 ? below / total : 0,
    method,
    outcomes,
  };
}
