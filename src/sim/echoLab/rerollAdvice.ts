// Wuthering Tools+ Echo Lab — Transducer re-roll advice ("which lines do I keep, which do I re-roll?") for an equipped
// echo with all five substat lines.
//
// The game's rule (version 3.1, Data Bank > Data Modify): a Transducer re-rolls a fully tuned 5-star echo's substats to
// random stats, excluding the locked ones; a try costs 1 Transducer with up to two lines locked, 2 with three, 3 with
// four; the result may be kept or discarded, and the Transducers are spent either way.
//
// Every way to lock the echo is compared: the 31 lock sets (0 to 4 lines kept), each read through the line model of the
// echo with no substats (lockSets.ts, lineModel.ts) on top of the engine's own score of its locked lines. Per line: its
// worth (the damage the build loses without it, the engine's figure) against a fresh random line in its place → lock or
// re-roll. Per lock count: the best set of lines to keep, the chance a try beats the current lines, the expected gain
// when you keep the better of old and new, what a run of tries with the same locks is expected to reach, and the
// Transducers it costs. `allPlans` carries all 31. Pure/async, worker-safe.
import { MIN_PLAN_GAIN } from "./rerollPick";
import { SUBSTAT_KEYS, type SubstatKey } from "../substats/substatWeights";
import { echoLines, makePacer, prepareCharacter, relGain, scoreBuild, withLines, withSlotRecord, type EchoLine, type LabSession, type RunControl } from "./core";
import { stableKey } from "./fingerprint";
import { confirmDead, lineModel, lineOutcomes, lineTable } from "./lineModel";
import { LINE_MODEL_NOTE } from "./lineModelNote";
import { bitCount, lockSetReader, maskFields, type LockSetReader, type LockSetStats } from "./lockSets";
import { outcomeKey, tierOdds, type NewLine } from "./rolls";
// Wuthering Tools+ energy check: Energy Regen as a floor (src/sim/energy/)
import { menuEnergyRegen } from "../energy/energyHave";
import { showNeed, shortBy } from "../energy/energyNeed";
import { erFactorFor } from "../energy/erAwareScorer";

/** Transducers per re-roll by the number of locked lines (index 0-4): the game's rule since version 3.1 ("With 2 or
 *  fewer locked stats, consume 1 Transducer. With 3 locked stats, consume 2 Transducers. With 4 locked stats, consume 3
 *  Transducers."). */
export const DEFAULT_LOCK_COSTS: readonly number[] = [1, 1, 1, 2, 3];

/** Where the lock costs come from, in the words a page prints beside them. */
export const LOCK_COST_NOTE = "the game's rule since version 3.1";

export const REROLL_ASSUMPTIONS = [
  "A try costs 1 Transducer with up to two lines kept, 2 with three kept and 3 with four kept, and only a fully tuned 5-star echo can be re-rolled: the game's rule since version 3.1.",
  "You may keep the old lines when the new ones are worse; the Transducers are spent either way (the game's rule).",
  "A re-rolled line takes a type the kept lines do not hold, every type as likely as the next (it may come back as the type it replaced), at a value from Kuro's published tier odds. The game does not publish how often each type lands.",
  `Every way to keep lines is compared, 31 of them, and each number of kept lines shows its best. ${LINE_MODEL_NOTE}`,
] as const;

/** The type assumption under `canRepeat: false`, in place of REROLL_ASSUMPTIONS[2]. */
export const REROLL_NO_REPEAT_ASSUMPTION =
  "A re-rolled line takes a type the echo did not hold before the re-roll (it never comes back as the stat it replaced), every type as likely as the next, at a value from Kuro's published tier odds. The game does not publish how often each type lands, nor whether a line can come back as the stat it was.";

/** The assumptions an advice stands on, as its options read the game's unpublished rules. */
export const rerollAssumptions = (canRepeat: boolean, erNeed: number | null): readonly string[] => {
  const base: readonly string[] = canRepeat ? REROLL_ASSUMPTIONS : REROLL_ASSUMPTIONS.map((a, i) => (i === 2 ? REROLL_NO_REPEAT_ASSUMPTION : a));
  return erNeed != null ? [...base, rerollErNote(erNeed)] : base;
};

export interface RerollOptions {
  /** Transducers per re-roll by locked-line count (index 0-4) */
  lockCosts?: readonly number[];
  /** a re-rolled line may come back as the type it replaced (default true) */
  canRepeat?: boolean;
  /** tries drawn for a lock set with too many outcomes to count one by one (default 40000; no engine call per try) */
  samples?: number;
  seed?: number | string;
  /** the character's ER need (%) in their saved teams (`erNeedsOf(useEnergyNeeds())[id]`): every line set scores
   *  damage × (1 − ER deficit), so an Energy Regen line the build needs is worth what its deficit costs, and an ER
   *  line whose loss would drop the build under the need is always locked */
  erNeed?: number;
  /** with no ER need known for the character (they are in no saved team the energy check could measure), treat every
   *  Energy Regen line as one the build needs: never re-rolled by a recommended plan. Default false: the plan may
   *  re-roll it, and the pages flag that (transducerRank.ts `rerollsUnknownEr`) */
  keepUnknownEr?: boolean;
  /** what each lock set's outcomes stand on: "locked" (default) = the engine's own score of the locked lines alone;
   *  "model" = the line model's figure for them (30 fewer engine runs an echo; kept to measure the two against each other) */
  anchor?: "locked" | "model";
}

export interface LineAdvice {
  field: number;
  key: string;
  value: number;
  /** what the build loses without this line, relative to the build without it */
  worth: number;
  /** what a fresh random line in its place is worth on average, on the same scale */
  freshWorth: number;
  /** freshWorth − worth: above 0, re-rolling this line pays on average */
  delta: number;
  /** 1 = the line to re-roll first */
  rank: number;
  advice: "lock" | "reroll";
  /** an Energy Regen line the build needs to stay at its ER need: locked whatever the numbers say */
  erFloor?: boolean;
}

/** One way to lock the echo, as every one of the 31 is read. */
export interface LockSetPlan {
  locks: number;
  lockedFields: number[];
  rerolledFields: number[];
  /** Transducers per attempt */
  cost: number;
  /** "counted": every outcome of these locks read through the line model; "drawn": too many to count, so seeded tries */
  method: "counted" | "drawn";
  /** chance the new lines beat the current ones */
  pImprove: number;
  /** expected relative gain when you keep the better of old and new */
  expectedGain: number;
  /** expected relative change if you always took the new lines */
  expectedChange: number;
  gainPerTransducer: number;
  /** Transducers spent per attempt that beats the current lines */
  transducersPerSuccess: number | null;
}

/** The best way to keep a given number of lines, with what a run of tries is expected to reach. */
export interface LockPlan extends LockSetPlan {
  /** one try in ten does worse than p10, half do worse than p50, one in ten does better than p90 (always taking the result) */
  p10: number;
  p50: number;
  p90: number;
  /** expected relative gain keeping the best of n tries with these locks: `bestOf[0]` is one try (= expectedGain) */
  bestOf: number[];
  /** the best result these locks can give: its gain, the new lines that make it and the chance of exactly that */
  top: { gain: number; lines: Array<{ key: string; value: number }>; chance: number };
}

export interface RerollAdviceResult {
  characterId: string;
  name: string;
  slot: number;
  echoId: string | null;
  echo: string | null;
  base: number;
  lines: LineAdvice[];
  /** one plan per lock count, 4 locks first: the best set of lines to keep at that count */
  plans: LockPlan[];
  /** the plan with the best expected gain per Transducer; null when no re-roll is expected to pay */
  recommended: LockPlan | null;
  /** every way to lock the echo (31 for five lines), the best expected gain per Transducer first */
  allPlans: LockSetPlan[];
  lockCostNote: string;
  assumptions: readonly string[];
  scorings: number;
  /** the ER floor the advice respects (%), null without one; the ER the build has (%) */
  erNeed: number | null;
  erHave: number | null;
}

// the threshold and the "re-roll first" pick live in rerollPick.ts (no engine imports, so the page can use them)
export { MIN_PLAN_GAIN, pickRerollFirst } from "./rerollPick";

/**
 * Scores a fresh line of `key` at every tier on top of `base` lines. A stat that changes nothing at its lowest and
 * its highest tier changes nothing in between (damage never falls as a stat grows), so its other tiers are not
 * scored — exact, and most of the work on a build where half the stats are dead.
 */
export async function tierScores(
  base: Array<{ key: string; value: number }>,
  key: SubstatKey,
  baseline: number,
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  scoreLines: (list: Array<{ key: string; value: number }>) => Promise<number>,
): Promise<number[]> {
  const { values } = tierOdds(key);
  const same = (avg: number): boolean => Math.abs(avg - baseline) <= 1e-12 * Math.max(1, Math.abs(baseline));
  const top = await scoreLines([...base, { key, value: values[values.length - 1] }]);
  if (same(top) && same(await scoreLines([...base, { key, value: values[0] }]))) return values.map(() => baseline);
  const out: number[] = [];
  for (const value of values) out.push(await scoreLines([...base, { key, value }]));
  return out;
}

export async function rerollAdvice(
  session: LabSession,
  characterId: string,
  slot: number,
  options: RerollOptions = {},
  control: RunControl = {},
): Promise<RerollAdviceResult> {
  const memoKey = `reroll|${characterId}|${slot}|${stableKey(options)}`;
  const memoised = session.memo.get(memoKey) as RerollAdviceResult | undefined;
  if (memoised) return { ...memoised, scorings: 0 };
  const result = await computeRerollAdvice(session, characterId, slot, options, control);
  session.memo.set(memoKey, result);
  return result;
}

/** Engine runs one echo's advice takes at most, for the progress bar: the blank echo, the line table, the pairs, the anchors. */
const WORK_ESTIMATE = 90;

/** One echo's lock sets ready to read: the lines, the engine's scorer for them, the line model, the reader. */
export interface EchoLockSets {
  characterId: string;
  name: string;
  slot: number;
  echoId: string | null;
  echo: string | null;
  /** the build's rotation damage as the lab scores it (no ER factor) */
  labBase: number;
  /** the build's score on the scale every lock set is read on (damage × (1 − ER deficit) with an ER need) */
  base: number;
  lines: EchoLine[];
  erNeed: number | null;
  erHave: number | null;
  /** by lock mask: the engine's score of the kept lines alone (NaN where the model stands in) */
  anchors: Float64Array;
  /** the engine's score of the echo with these lines in the slot (memoised) */
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  scoreLines: (list: Array<{ key: string; value: number }>) => Promise<number>;
  reader: LockSetReader;
}

/**
 * Sets one equipped five-line echo up for reading its lock sets: the line model of the echo with no substats (every
 * stat at every tier, every two stats that count together) and the engine's own score of each lock set's kept lines.
 * `rerollAdvice` reads its plans off this; a test or a check can read single outcomes (`reader.changeOf`) against
 * `scoreLines`.
 */
export async function echoLockSets(session: LabSession, characterId: string, slot: number, options: RerollOptions = {}, control: RunControl = {}): Promise<EchoLockSets> {
  const pace = makePacer(control);
  const lab = await prepareCharacter(session, characterId, pace);
  if (!lab) throw new Error(`${characterId} can't be scored: ${session.skipped.get(characterId) ?? "unknown"}`);
  const own = lab.slots[slot];
  if (!own) throw new Error(`${lab.name} has no echo in slot ${slot}`);
  const lines = echoLines(own.record);
  if (lines.length < 5) throw new Error(`${own.species ?? "This echo"} has ${lines.length} of 5 lines: finish tuning it first (Tune or Feed)`);
  const canRepeat = options.canRepeat ?? true;
  // with an ER need every score is damage × (1 − ER deficit): `base` below is the build's score on that scale
  const erNeed = options.erNeed != null && Number.isFinite(options.erNeed) && options.erNeed > 0 ? options.erNeed : null;
  const erFactor = erFactorFor(lab.id, erNeed);
  const erHave = erFactor ? await menuEnergyRegen(lab.id, session.account.characters, session.account.echoes) : null;
  const base = erFactor ? lab.base * (await erFactor(session.account.characters, session.account.echoes)) : lab.base;

  // engine scoring of the echo with a given set of lines in this slot, memoised by the line set
  const memo = new Map<string, number>();
  const asLines = (list: Array<{ key: string; value: number }>): NewLine[] => list.map((l) => ({ key: l.key as SubstatKey, value: l.value }));
  memo.set(outcomeKey(asLines(lines)), base);
  let work = 0;
  const scoreLines = async (list: Array<{ key: string; value: number }>): Promise<number> => {
    const key = outcomeKey(asLines(list));
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const clone = withSlotRecord(session, lab, slot, withLines(own.record, list));
    const raw = await scoreBuild(session, lab, clone.characters, clone.echoes);
    const avg = erFactor ? raw * (await erFactor(clone.characters, clone.echoes)) : raw;
    memo.set(key, avg);
    work += 1;
    await pace({ phase: "reroll", done: Math.min(work, WORK_ESTIMATE), total: WORK_ESTIMATE, label: lab.name });
    return avg;
  };

  // 1. the line model of the echo with no substats: every stat at every tier, every two stats that count together.
  // The stats that added nothing on this character's last echo are checked five at a time first (one engine run a group)
  const blank = await scoreLines([]);
  const guessKey = `deadStats|${lab.id}|${erNeed ?? ""}`;
  const guess = ((session.memo.get(guessKey) as SubstatKey[] | undefined) ?? []).filter((k) => SUBSTAT_KEYS.includes(k));
  const dead = guess.length ? await confirmDead(blank, guess, (ls) => scoreLines(ls)) : new Set<string>();
  const table = await lineTable(blank, (key, value) => scoreLines([{ key, value }]), dead);
  session.memo.set(
    guessKey,
    SUBSTAT_KEYS.filter((k) => (table.get(k) ?? []).every((s) => Math.abs(s - blank) <= 1e-12 * Math.max(1, Math.abs(blank)))),
  );
  const model = await lineModel(blank, table, (ls) => scoreLines(ls), 5);

  // 2. the engine's own score of each lock set's kept lines alone: what its outcomes stand on
  const full = (1 << lines.length) - 1;
  const anchors = new Float64Array(full + 1).fill(Number.NaN);
  anchors[0] = blank;
  anchors[full] = base;
  const keptOf = (mask: number): EchoLine[] => lines.filter((_, i) => mask & (1 << i));
  const anchored = (options.anchor ?? "locked") === "locked";
  for (let mask = 1; mask < full; mask++) {
    // with the model standing in for the kept lines, the four-line sets are still scored: a line's worth is the engine's
    if (anchored || bitCount(mask) === lines.length - 1) anchors[mask] = await scoreLines(keptOf(mask));
  }
  const reader = lockSetReader({
    model,
    lines,
    base,
    anchors: anchored ? anchors : undefined,
    canRepeat,
    samples: options.samples,
    seed: options.seed ?? `${own.echoId ?? lab.id}|${slot}`,
  });
  return { characterId: lab.id, name: lab.name, slot, echoId: own.echoId, echo: own.species, labBase: lab.base, base, lines, erNeed, erHave, anchors, scoreLines, reader };
}

async function computeRerollAdvice(
  session: LabSession,
  characterId: string,
  slot: number,
  options: RerollOptions,
  control: RunControl,
): Promise<RerollAdviceResult> {
  const pace = makePacer(control);
  const lockCosts = options.lockCosts ?? DEFAULT_LOCK_COSTS;
  const startScorings = session.scorings;
  const sets = await echoLockSets(session, characterId, slot, options, control);
  const { lines, base, erNeed, erHave, anchors, reader } = sets;
  const full = (1 << lines.length) - 1;

  // 3. every lock set through the model
  const stats = new Map<number, LockSetStats>();
  for (const mask of reader.masks) {
    stats.set(mask, reader.stats(mask));
    await pace();
  }

  // 4. per line: its worth (the engine's figure) against the average fresh line in its place
  const perLine: LineAdvice[] = lines.map((line, i) => {
    const others = full & ~(1 << i);
    const without = anchors[others];
    const worth = relGain(without, base);
    // the one-line re-roll's average result, on the scale of the build without the line
    const fresh = without > 0 ? (base * (1 + (stats.get(others)?.expectedChange ?? 0))) / without - 1 : 0;
    // the hard rule: an ER line the build can't lose without falling under its need is never re-rolled
    const erFloor = line.key === "EnergyRegen" && (erNeed != null && erHave != null ? shortBy(erNeed, erHave - line.value) > 0 : erNeed == null && Boolean(options.keepUnknownEr));
    return {
      field: line.field,
      key: line.key,
      value: line.value,
      worth,
      freshWorth: fresh,
      delta: fresh - worth,
      rank: 0,
      advice: fresh > worth && !erFloor ? "reroll" : "lock",
      ...(erFloor ? { erFloor: true } : {}),
    };
  });
  // lines the ER floor locks go last (re-rolled last, locked first by every plan)
  const order = [...perLine].sort((a, b) => Number(!!a.erFloor) - Number(!!b.erFloor) || b.delta - a.delta || a.field - b.field);
  order.forEach((l, i) => (l.rank = i + 1));

  // 5. every lock set as a plan, and per lock count the best one
  const costOf = (locks: number): number => lockCosts[locks] ?? lockCosts[lockCosts.length - 1] ?? 1;
  const planOf = (s: LockSetStats): LockSetPlan => {
    const { locked, rerolled } = maskFields(lines, s.mask);
    const cost = costOf(s.locks);
    return {
      locks: s.locks,
      lockedFields: locked,
      rerolledFields: rerolled,
      cost,
      method: s.sampled ? "drawn" : "counted",
      pImprove: s.pImprove,
      expectedGain: s.expectedGain,
      expectedChange: s.expectedChange,
      gainPerTransducer: cost > 0 ? s.expectedGain / cost : s.expectedGain,
      transducersPerSuccess: s.pImprove > 0 ? cost / s.pImprove : null,
    };
  };
  let floorMask = 0;
  perLine.forEach((l, i) => {
    if (l.erFloor) floorMask |= 1 << i;
  });
  const floorCount = bitCount(floorMask);
  // how much keeping these lines is worth beyond fresh lines in their place: the tie-break between equal plans
  const keepValue = (mask: number): number => perLine.reduce((sum, l, i) => (mask & (1 << i) ? sum - l.delta : sum), 0);
  const plans: LockPlan[] = [];
  for (let locks = lines.length - 1; locks >= 0; locks--) {
    let best: LockSetStats | null = null;
    for (const mask of reader.masks) {
      const s = stats.get(mask) as LockSetStats;
      if (s.locks !== locks) continue;
      // a plan that can keep every line the ER floor needs keeps them
      if (locks >= floorCount && (mask & floorMask) !== floorMask) continue;
      if (!best || s.expectedGain > best.expectedGain + 1e-15 || (Math.abs(s.expectedGain - best.expectedGain) <= 1e-15 && keepValue(mask) > keepValue(best.mask))) best = s;
    }
    if (!best) continue;
    plans.push({ ...planOf(best), ...reader.detail(best.mask, best) });
    await pace();
  }
  const floorFields = new Set(perLine.filter((l) => l.erFloor).map((l) => l.field));
  const rerollsFloor = (p: LockSetPlan): boolean => p.rerolledFields.some((f) => floorFields.has(f));
  // a plan that re-rolls an ER line the floor needs is never recommended
  const paying = plans.filter((p) => p.expectedGain >= MIN_PLAN_GAIN && !rerollsFloor(p));
  const recommended = paying.length ? [...paying].sort((a, b) => b.gainPerTransducer - a.gainPerTransducer || a.cost - b.cost || b.locks - a.locks)[0] : null;
  const allPlans = reader.masks
    .map((mask) => planOf(stats.get(mask) as LockSetStats))
    .sort((a, b) => Number(rerollsFloor(a)) - Number(rerollsFloor(b)) || b.gainPerTransducer - a.gainPerTransducer || a.cost - b.cost || b.locks - a.locks);

  return {
    characterId: sets.characterId,
    name: sets.name,
    slot,
    echoId: sets.echoId,
    echo: sets.echo,
    base: sets.labBase,
    lines: [...perLine].sort((a, b) => a.rank - b.rank),
    plans,
    recommended,
    allPlans,
    lockCostNote: LOCK_COST_NOTE,
    assumptions: rerollAssumptions(options.canRepeat ?? true, erNeed),
    scorings: session.scorings - startScorings,
    erNeed,
    erHave,
  };
}

/** The assumption line the advice adds when it respects an ER need. */
export const rerollErNote = (need: number): string =>
  `Energy Regen is a floor: ${showNeed(need).toFixed(1)}% is this character's need in their saved teams. Every line is scored as damage × (1 − ER deficit), and an Energy Regen line the build can't lose without falling under the need is always locked.`;

export interface LinesPlanDeps {
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  scoreLines: (list: Array<{ key: string; value: number }>) => Promise<number>;
  /** the score of the lines the player has now */
  base: number;
  canRepeat: boolean;
  samples: number;
  seed: number | string;
  /** new lines drawn per outcome (default: one per re-rolled line; a fresh echo draws all five) */
  draw?: number;
}

/**
 * Re-rolling several lines at once: the line model on top of the locked lines alone (one engine scoring per type × tier,
 * one per two stats that count), then each outcome against the build as the engine scores it. Returns (relative change
 * vs the build, weight).
 */
export async function linesPlan(locked: EchoLine[], rerolled: EchoLine[], deps: LinesPlanDeps): Promise<Array<[number, number]>> {
  const lockedLines = locked.map((l) => ({ key: l.key, value: l.value }));
  const context = await deps.scoreLines(lockedLines);
  if (!(context > 0) || !(deps.base > 0)) return [[0, 1]];
  const held = new Set(locked.map((l) => l.key));
  if (!deps.canRepeat) for (const l of rerolled) held.add(l.key);
  const pool = SUBSTAT_KEYS.filter((k) => !held.has(k));
  const onTop = (lines: NewLine[]): Promise<number> => deps.scoreLines([...lockedLines, ...lines]);
  const k = Math.min(deps.draw ?? rerolled.length, pool.length);
  const table = await lineTable(context, (key, value) => onTop([{ key, value }]), new Set(), pool);
  return lineOutcomes(await lineModel(context, table, onTop, k), deps.base, pool, k, deps.samples, deps.seed);
}
