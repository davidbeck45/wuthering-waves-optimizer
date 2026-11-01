// Wuthering Tools+ Echo Lab — the Tuner budget planner's engine half: every echo a Tuner could go into next, what
// it is expected to add on its owner's best rotation, what it costs (Ryan's levelling tables, levelingCost.ts) and
// the chance it ends up worth keeping. Two kinds of owned echo, plus the slots where a new one pays most:
//   worn  — an echo a built character wears that has not rolled all five lines: tuned where it sits, every outcome
//           of the lines still to come scored with the echo in its slot (it stays on, so every line counts);
//   spare — an unfinished inventory echo nobody wears: Tune or Feed's potential in its most promising owner's slot
//           (the pass's pick), kept only if it ends up beating the echo there;
//   fresh — no echo yet: a freshly farmed copy of a slot's echo (same set, cost and main stat) tuned to +25 — the
//           re-roll advisor's "re-roll all five lines" model, each new line's exact value added up.
// What fits a budget (and when, from a weekly income the player types) is worked out on the page by tunerBudget.ts,
// so changing the numbers never re-runs the engine. Pure/async, worker-safe.
import { ECHO_LEVEL_EXP, ECHO_MAX_LEVEL, LEVELS_PER_TUNE, TUNERS_PER_TUNE, echoResources, type EchoResources } from "../../echoes/levelingCost";
import { SUBSTAT_KEYS } from "../substats/substatWeights";
import {
  builtCharacterIds,
  echoLines,
  makePacer,
  perPointOf,
  prepareCharacter,
  relGain,
  scoreBuild,
  weightedQuantile,
  withLines,
  withSlotRecord,
  wornByIndex,
  type LabCharacter,
  type LabSession,
  type RunControl,
  type SwapRules,
} from "./core";
import { echoPotential } from "./echoPotential";
import { seededRandom } from "./fingerprint";
import { rankSlots } from "./prescore";
import { additivePlan } from "./rerollAdvice";
import { enumerateOutcomes, outcomeCount, outcomeKey, remainingTypes, sampleOutcome, type NewLine } from "./rolls";

export const TUNER_PLAN_ASSUMPTIONS = [
  "Echo levels are not imported, so an echo with n substat lines is taken to sit at +5n: the EXP shown is the most it can still take.",
  "Costs are the game's levelling table for 5★ echoes (10 Tuners and 2,000 Shell Credits a tune, EXP per level); 4★ and lower echoes are left out.",
  "Each line still to roll is a substat the echo does not hold yet, drawn uniformly (the game does not publish type odds), at Kuro's published tier odds.",
  "A spare echo counts only if it ends up beating the echo in its owner's slot; a worn one stays on, so every line it rolls counts.",
  "A fresh echo is a new copy of the slot's echo (same set, cost and main stat) tuned to +25; its five lines are each scored exactly and added up, as the re-roll advisor does.",
  "Feeding a failed echo back returns 75 % of its EXP and 30 % of its Tuners; the plan does not count that refund.",
] as const;

export type TunerCandidateKind = "worn" | "spare";

export interface TunerCandidate {
  kind: TunerCandidateKind;
  echoId: string;
  echo: string | null;
  set: string | null;
  /** echo cost (1, 3 or 4) */
  echoCost: number | null;
  main: string | null;
  rank: number | null;
  subs: Array<{ key: string; value: number }>;
  lines: number;
  /** the level it is taken to sit at: +5 per line */
  level: number;
  characterId: string;
  name: string;
  slot: number;
  /** spare: the echo it would replace */
  replacedEchoId: string | null;
  replacedEcho: string | null;
  /** the owner's average damage per rotation on their build as it is */
  base: number;
  /** Tuners, EXP and Shell Credits to take it from `level` to +25 */
  resources: EchoResources;
  /** expected relative gain on the owner's best rotation, the echo kept only when it ends up better */
  expectedGain: number;
  /** the same in damage per rotation */
  expectedDamage: number;
  /** chance the finished echo is worth keeping (beats the slot's echo); null for a worn echo, which stays on */
  pKeep: number | null;
  p10: number;
  p50: number;
  p90: number;
  method: "exact" | "monte-carlo" | "complete";
  /** expected damage per rotation added per Tuner spent: the plan's order */
  damagePerTuner: number;
}

export interface FreshSlot {
  characterId: string;
  name: string;
  slot: number;
  /** the echo in the slot now */
  echoId: string | null;
  echo: string | null;
  set: string | null;
  echoCost: number | null;
  main: string | null;
  base: number;
  /** one try: level a new echo to +25 and tune all five lines */
  resources: EchoResources;
  /** chance a fresh one beats the echo in the slot */
  pKeep: number;
  /** expected relative gain per try, keeping the better echo */
  expectedGain: number;
  expectedDamage: number;
  damagePerTuner: number;
  method: "additive";
}

export type LeftOutReason = "not-5-star" | "no-slot";

export interface TunerCandidatesResult {
  fingerprint: string;
  /** owned echoes worth a Tuner, most expected damage per Tuner first (zero-gain ones last) */
  candidates: TunerCandidate[];
  /** the slots where a freshly farmed echo pays most, best first */
  fresh: FreshSlot[];
  /** unfinished echoes the plan leaves out, and why */
  leftOut: Array<{ echoId: string; echo: string | null; lines: number; reason: LeftOutReason }>;
  assumptions: readonly string[];
  scorings: number;
  ms: number;
}

export interface TunerPlanOptions {
  /** Monte Carlo samples when an echo's outcomes are too many to enumerate (min 1000, default 1000) */
  samples?: number;
  /** fresh-echo slots to work out exactly (default 5; 0 = none) */
  freshSlots?: number;
  /** samples for the fresh-echo sums (default 20000; no engine call per sample) */
  freshSamples?: number;
  rules?: SwapRules;
}

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** What taking a 5★ echo from `lines` substat lines (+5 per line) to +25 costs. */
export function tuneToMaxResources(lines: number): EchoResources {
  const n = Math.max(0, Math.min(5, Math.floor(lines)));
  const level = Math.min(ECHO_MAX_LEVEL, n * LEVELS_PER_TUNE);
  return echoResources(ECHO_LEVEL_EXP[ECHO_MAX_LEVEL] - ECHO_LEVEL_EXP[level], (5 - n) * TUNERS_PER_TUNE);
}

const isFiveStar = (echo: Record<string, any>): boolean => Number(echo?.rank ?? 5) === 5;

interface Spread {
  pairs: Array<[number, number]>;
  method: TunerCandidate["method"];
}

/** Every outcome of an echo's lines still to come, scored with the echo where it sits on the lab character. */
async function inPlaceSpread(session: LabSession, lab: LabCharacter, slot: number, samples: number, pace: ReturnType<typeof makePacer>): Promise<Spread> {
  const own = lab.slots[slot];
  if (!own) return { pairs: [[0, 1]], method: "complete" };
  const lines = echoLines(own.record).map((l) => ({ key: l.key, value: l.value }));
  const remaining = Math.max(0, 5 - lines.length);
  const pool = remainingTypes(lines.map((l) => l.key));
  const k = Math.min(remaining, pool.length);
  if (k <= 0) return { pairs: [[0, 1]], method: "complete" };
  const memo = new Map<string, number>();
  const score = async (extra: NewLine[]): Promise<number> => {
    const key = outcomeKey(extra);
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const clone = withSlotRecord(session, lab, slot, withLines(own.record, [...lines, ...extra]));
    const gain = relGain(lab.base, await scoreBuild(session, lab, clone.characters, clone.echoes));
    memo.set(key, gain);
    await pace({ phase: "tuners", done: memo.size, total: Math.min(samples, outcomeCount(pool, k)), label: lab.name });
    return gain;
  };
  const pairs: Array<[number, number]> = [];
  if (outcomeCount(pool, k) <= samples) {
    for (const outcome of enumerateOutcomes(pool, k)) pairs.push([await score(outcome.lines), outcome.p]);
    return { pairs, method: "exact" };
  }
  const rng = seededRandom(`${own.echoId ?? lab.id}|${slot}|in-place`);
  for (let i = 0; i < samples; i++) pairs.push([await score(sampleOutcome(rng, pool, k)), 1 / samples]);
  return { pairs, method: "monte-carlo" };
}

const upsideOf = (pairs: Array<[number, number]>): { upside: number; pKeep: number } => {
  const total = pairs.reduce((s, [, w]) => s + w, 0) || 1;
  return {
    upside: pairs.reduce((s, [g, w]) => s + Math.max(0, g) * w, 0) / total,
    pKeep: pairs.reduce((s, [g, w]) => s + (g > 1e-12 ? w : 0), 0) / total,
  };
};

/**
 * The linear pre-screen for fresh echoes: what a new copy of a slot's echo is expected to add over it, every line
 * priced at the build's per-point value (the pass's prices). Only picks which slots get the exact sums.
 */
async function freshLinear(session: LabSession, lab: LabCharacter, slot: number, samples: number): Promise<number> {
  const own = lab.slots[slot];
  if (!own) return 0;
  const price = new Map<string, number>();
  for (const key of SUBSTAT_KEYS) price.set(key, await perPointOf(session, lab, key));
  const current = echoLines(own.record).reduce((s, l) => s + (price.get(l.key) ?? 0) * l.value, 0);
  const rng = seededRandom(`${lab.id}|${slot}|fresh-linear`);
  let upside = 0;
  for (let i = 0; i < samples; i++) {
    const worth = sampleOutcome(rng, SUBSTAT_KEYS, 5).reduce((s, l) => s + (price.get(l.key) ?? 0) * l.value, 0);
    upside += Math.max(0, worth - current);
  }
  return upside / samples;
}

/** A fresh copy of the slot's echo tuned to +25: each new line's exact value added up (the re-roll advisor's 0-lock plan). */
async function freshSlot(session: LabSession, lab: LabCharacter, slot: number, samples: number, pace: ReturnType<typeof makePacer>): Promise<FreshSlot | null> {
  const own = lab.slots[slot];
  if (!own) return null;
  const memo = new Map<string, number>();
  let work = 0;
  const scoreLines = async (list: Array<{ key: string; value: number }>): Promise<number> => {
    const key = outcomeKey(list.map((l) => ({ key: l.key as NewLine["key"], value: l.value })));
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const clone = withSlotRecord(session, lab, slot, withLines(own.record, list));
    const avg = await scoreBuild(session, lab, clone.characters, clone.echoes);
    memo.set(key, avg);
    work += 1;
    await pace({ phase: "fresh", done: work, total: 80, label: lab.name });
    return avg;
  };
  const current = echoLines(own.record);
  // a fresh echo rolls all five lines, even when the one in the slot has not finished tuning
  const pairs = await additivePlan([], current, { scoreLines, base: lab.base, canRepeat: true, samples, seed: `${own.echoId ?? lab.id}|${slot}|fresh`, draw: 5 });
  const { upside, pKeep } = upsideOf(pairs);
  const resources = tuneToMaxResources(0);
  const expectedDamage = upside * lab.base;
  return {
    characterId: lab.id,
    name: lab.name,
    slot,
    echoId: own.echoId,
    echo: own.species,
    set: own.set,
    echoCost: own.cost,
    main: own.record?.stat ?? null,
    base: lab.base,
    resources,
    pKeep,
    expectedGain: upside,
    expectedDamage,
    damagePerTuner: expectedDamage / resources.tuners,
    method: "additive",
  };
}

/** Every echo a Tuner could go into next on this account, and the slots where a fresh echo pays most. */
export async function tunerCandidates(session: LabSession, options: TunerPlanOptions = {}, control: RunControl = {}): Promise<TunerCandidatesResult> {
  const started = now();
  const startScorings = session.scorings;
  const pace = makePacer(control);
  const samples = Math.max(1000, Math.floor(options.samples ?? 1000));

  // the owners: built characters with five echoes (as the pass takes them)
  const ids = builtCharacterIds(session.account);
  const labs: LabCharacter[] = [];
  for (let i = 0; i < ids.length; i++) {
    const lab = await prepareCharacter(session, ids[i], pace);
    if (lab?.complete) labs.push(lab);
    await pace({ phase: "characters", done: i + 1, total: ids.length, label: lab?.name ?? ids[i] });
  }
  const labById = new Map(labs.map((l) => [l.id, l]));
  const worn = wornByIndex(session.account);

  const candidates: TunerCandidate[] = [];
  const leftOut: TunerCandidatesResult["leftOut"] = [];
  const partial = session.account.echoes.filter((e) => e?.echoId && echoLines(e).length < 5);
  for (let n = 0; n < partial.length; n++) {
    const echo = partial[n];
    const lines = echoLines(echo);
    const common = {
      echoId: String(echo.echoId),
      echo: echo.echo ?? null,
      set: echo.echoSet ?? null,
      echoCost: Number(echo.type) || null,
      main: echo.stat ?? null,
      rank: echo.rank != null ? Number(echo.rank) : null,
      subs: lines.map((l) => ({ key: l.key, value: l.value })),
      lines: lines.length,
      level: lines.length * LEVELS_PER_TUNE,
      resources: tuneToMaxResources(lines.length),
    };
    if (!isFiveStar(echo)) {
      leftOut.push({ echoId: common.echoId, echo: common.echo, lines: common.lines, reason: "not-5-star" });
      continue;
    }
    // worn by a built character (the slot really points at it): tune it where it sits
    const wearer = (worn.get(common.echoId) ?? []).find((w) => !w.stale && labById.get(w.characterId)?.slots[w.slot]?.echoId === common.echoId);
    if (wearer) {
      const lab = labById.get(wearer.characterId) as LabCharacter;
      const spread = await inPlaceSpread(session, lab, wearer.slot, samples, pace);
      const { upside } = upsideOf(spread.pairs);
      const expectedDamage = upside * lab.base;
      candidates.push({
        ...common,
        kind: "worn",
        characterId: lab.id,
        name: lab.name,
        slot: wearer.slot,
        replacedEchoId: null,
        replacedEcho: null,
        base: lab.base,
        expectedGain: upside,
        expectedDamage,
        pKeep: null,
        p10: weightedQuantile(spread.pairs, 0.1),
        p50: weightedQuantile(spread.pairs, 0.5),
        p90: weightedQuantile(spread.pairs, 0.9),
        method: spread.method,
        damagePerTuner: common.resources.tuners > 0 ? expectedDamage / common.resources.tuners : 0,
      });
    } else {
      // a spare: the pass's Tune or Feed target — the (character, slot) whose pre-score of the expected full echo is best
      let target: { lab: LabCharacter; slot: number; pre: number } | null = null;
      for (const lab of labs) {
        for (const r of await rankSlots(session, lab, echo, { fill: true, rules: options.rules })) {
          if (!target || r.pre > target.pre) target = { lab, slot: r.slot, pre: r.pre };
        }
      }
      if (!target) {
        leftOut.push({ echoId: common.echoId, echo: common.echo, lines: common.lines, reason: "no-slot" });
      } else {
        // the pass's own options when the sample count is the default, so its session memo answers
        const potentialOptions = options.samples === undefined ? { rules: options.rules } : { rules: options.rules, samples };
        const p = await echoPotential(session, common.echoId, { characterId: target.lab.id, slot: target.slot }, potentialOptions, control);
        const expectedDamage = p.expectedUpside * target.lab.base;
        candidates.push({
          ...common,
          kind: "spare",
          characterId: target.lab.id,
          name: target.lab.name,
          slot: target.slot,
          replacedEchoId: p.replacedEchoId,
          replacedEcho: target.lab.slots[target.slot]?.species ?? null,
          base: target.lab.base,
          expectedGain: p.expectedUpside,
          expectedDamage,
          pKeep: p.pBeat,
          p10: p.p10,
          p50: p.p50,
          p90: p.p90,
          method: p.method,
          damagePerTuner: common.resources.tuners > 0 ? expectedDamage / common.resources.tuners : 0,
        });
      }
    }
    await pace({ phase: "tuners", done: n + 1, total: partial.length, label: common.echo ?? common.echoId });
  }
  candidates.sort((a, b) => b.damagePerTuner - a.damagePerTuner || b.expectedDamage - a.expectedDamage || a.echoId.localeCompare(b.echoId));

  // fresh echoes: pre-screen every 5★ slot linearly, work out the most promising ones exactly
  const want = Math.max(0, Math.floor(options.freshSlots ?? 5));
  const fresh: FreshSlot[] = [];
  if (want > 0) {
    const screened: Array<{ lab: LabCharacter; slot: number; score: number }> = [];
    for (const lab of labs) {
      for (let slot = 0; slot < 5; slot++) {
        const own = lab.slots[slot];
        if (!own || !isFiveStar(own.record)) continue;
        screened.push({ lab, slot, score: (await freshLinear(session, lab, slot, 2000)) * lab.base });
      }
      await pace();
    }
    screened.sort((a, b) => b.score - a.score || a.lab.id.localeCompare(b.lab.id) || a.slot - b.slot);
    const freshSamples = Math.max(1000, Math.floor(options.freshSamples ?? 20000));
    for (const s of screened.slice(0, want + 3)) {
      const slot = await freshSlot(session, s.lab, s.slot, freshSamples, pace);
      if (slot && slot.expectedDamage > 0) fresh.push(slot);
    }
    fresh.sort((a, b) => b.damagePerTuner - a.damagePerTuner || a.characterId.localeCompare(b.characterId) || a.slot - b.slot);
    fresh.splice(want);
  }

  return {
    fingerprint: session.fingerprint,
    candidates,
    fresh,
    leftOut,
    assumptions: TUNER_PLAN_ASSUMPTIONS,
    scorings: session.scorings - startScorings,
    ms: now() - started,
  };
}
