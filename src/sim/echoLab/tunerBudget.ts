// Wuthering Tools+ Echo Lab — the Tuner budget planner's page half: what the player has (Tuners, Echo EXP, and an
// optional weekly income they type in — never a number we make up), remembered in this browser, and the plan that
// budget buys from the engine's candidates (tunerPlan.ts): best expected damage per Tuner first, each echo taken
// when what is left still covers it (a cheaper one further down may still fit after a dear one did not); with a
// weekly income, the rest in order, week by week. Pure (no Vue, no engine), so editing a number is instant.
import type { EchoResources } from "../../echoes/levelingCost";
import type { FreshSlot, TunerCandidate } from "./tunerPlan";

/** localStorage: the budget the player typed (their own input, small; no account data) */
export const TUNER_BUDGET_KEY = "wtplus:echoLab:tunerBudget";

export interface TunerBudget {
  /** Tuners on hand (null: not entered) */
  tuners: number | null;
  /** Echo EXP on hand (null: not entered — EXP is then not counted) */
  exp: number | null;
  /** what the player says they earn a week (null: no weekly view) */
  weeklyTuners: number | null;
  weeklyExp: number | null;
}

export const EMPTY_BUDGET: TunerBudget = { tuners: null, exp: null, weeklyTuners: null, weeklyExp: null };

/** weeks the weekly view looks ahead before calling the rest "later" */
export const WEEKS_AHEAD = 12;

const amount = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
};

/** A budget from what an input or storage holds: non-negative whole numbers, anything else "not entered". */
export function normalizeBudget(value: Partial<Record<keyof TunerBudget, unknown>> | null | undefined): TunerBudget {
  return {
    tuners: amount(value?.tuners),
    exp: amount(value?.exp),
    weeklyTuners: amount(value?.weeklyTuners),
    weeklyExp: amount(value?.weeklyExp),
  };
}

export function readTunerBudget(text: string | null): TunerBudget {
  try {
    const stored = text ? (JSON.parse(text) as { v?: number } & Partial<TunerBudget>) : null;
    return stored?.v === 1 ? normalizeBudget(stored) : { ...EMPTY_BUDGET };
  } catch {
    return { ...EMPTY_BUDGET };
  }
}

export const writeTunerBudget = (budget: TunerBudget): string => JSON.stringify({ v: 1, ...normalizeBudget(budget) });

/** When a step happens: now (the budget covers it), in week N of the typed income, later, or no budget entered. */
export type StepWhen = { kind: "now" } | { kind: "week"; week: number } | { kind: "later" } | { kind: "unbudgeted" };

export interface PlanStep {
  /** 1 = the first echo to tune */
  order: number;
  candidate: TunerCandidate;
  when: StepWhen;
  /** what the budget is short of when it does not fit now (0 when it fits or no budget is entered) */
  shortTuners: number;
  shortExp: number;
}

export interface TunerPlanSummary {
  /** echoes worth a Tuner, in order */
  steps: PlanStep[];
  /** owned unfinished echoes whose expected gain is nil: feed them instead */
  notWorth: TunerCandidate[];
  /** what the steps that fit now cost, and add (damage per rotation, summed over their owners) */
  now: { count: number; resources: EchoResources; expectedDamage: number };
  /** what is left after them (null: that resource was not entered) */
  left: { tuners: number | null; exp: number | null };
  /** full fresh-echo tunes the leftover covers (null: no Tuner budget entered) */
  freshTries: number | null;
  /** fresh-echo tunes a week's income covers (null: no weekly income entered) */
  freshPerWeek: number | null;
  /** a weekly income was entered */
  weekly: boolean;
}

/** below this expected damage per rotation a step is "not worth a Tuner" (rounding noise) */
const NOTHING = 0.5;

const sumResources = (list: EchoResources[]): EchoResources =>
  list.reduce((s, r) => ({ exp: s.exp + r.exp, tuners: s.tuners + r.tuners, shellCredits: s.shellCredits + r.shellCredits }), { exp: 0, tuners: 0, shellCredits: 0 });

/** Full tunes of a fresh echo (`perTry`) that `tuners` and `exp` cover (EXP not entered: not counted). */
export function triesCovered(tuners: number, exp: number | null, perTry: EchoResources): number {
  const byTuners = perTry.tuners > 0 ? Math.floor(tuners / perTry.tuners) : 0;
  if (exp === null || perTry.exp <= 0) return byTuners;
  return Math.min(byTuners, Math.floor(exp / perTry.exp));
}

/**
 * The plan a budget buys. Steps are the candidates worth a Tuner, most expected damage per Tuner first. With a
 * Tuner budget: each step is done now when what is left covers it (EXP too, when entered), else it waits; with a
 * weekly income the waiting steps follow in order, one week's income at a time, for up to `WEEKS_AHEAD` weeks.
 */
export function planTuners(candidates: readonly TunerCandidate[], budget: TunerBudget, fresh: readonly FreshSlot[] = []): TunerPlanSummary {
  const b = normalizeBudget(budget);
  const ordered = [...candidates].sort((x, y) => y.damagePerTuner - x.damagePerTuner || y.expectedDamage - x.expectedDamage || x.echoId.localeCompare(y.echoId));
  const worth = ordered.filter((c) => c.expectedDamage > NOTHING && c.resources.tuners > 0);
  const notWorth = ordered.filter((c) => !worth.includes(c));
  const steps: PlanStep[] = worth.map((candidate, i) => ({ order: i + 1, candidate, when: { kind: "unbudgeted" }, shortTuners: 0, shortExp: 0 }));
  const weekly = (b.weeklyTuners ?? 0) > 0 || (b.weeklyExp ?? 0) > 0;
  const freshCost = fresh[0]?.resources ?? null;

  if (b.tuners === null) {
    return {
      steps,
      notWorth,
      now: { count: 0, resources: sumResources([]), expectedDamage: 0 },
      left: { tuners: null, exp: b.exp },
      freshTries: null,
      freshPerWeek: weekly && freshCost ? perWeek(b, freshCost) : null,
      weekly,
    };
  }

  let tuners = b.tuners;
  let exp = b.exp === null ? Infinity : b.exp;
  const done: PlanStep[] = [];
  const waiting: PlanStep[] = [];
  for (const step of steps) {
    const r = step.candidate.resources;
    if (r.tuners <= tuners && r.exp <= exp) {
      tuners -= r.tuners;
      exp -= r.exp;
      step.when = { kind: "now" };
      done.push(step);
    } else {
      waiting.push(step);
    }
  }
  for (const step of waiting) {
    step.shortTuners = Math.max(0, step.candidate.resources.tuners - tuners);
    step.shortExp = Number.isFinite(exp) ? Math.max(0, step.candidate.resources.exp - exp) : 0;
    step.when = { kind: "later" };
  }
  // the weekly view: the waiting steps in order, as the typed income comes in (never skipping the next one)
  if (weekly && waiting.length) {
    let t = tuners;
    let e = exp;
    let next = 0;
    for (let week = 1; week <= WEEKS_AHEAD && next < waiting.length; week++) {
      t += b.weeklyTuners ?? 0;
      e += b.weeklyExp ?? 0;
      while (next < waiting.length) {
        const r = waiting[next].candidate.resources;
        if (r.tuners > t || r.exp > e) break;
        t -= r.tuners;
        e -= r.exp;
        waiting[next].when = { kind: "week", week };
        next += 1;
      }
    }
  }
  return {
    steps,
    notWorth,
    now: {
      count: done.length,
      resources: sumResources(done.map((s) => s.candidate.resources)),
      expectedDamage: done.reduce((s, x) => s + x.candidate.expectedDamage, 0),
    },
    left: { tuners, exp: Number.isFinite(exp) ? exp : null },
    freshTries: freshCost ? triesCovered(tuners, Number.isFinite(exp) ? exp : null, freshCost) : null,
    freshPerWeek: weekly && freshCost ? perWeek(b, freshCost) : null,
    weekly,
  };
}

/** Fresh-echo tunes a week of typed income pays for (fractional: 0.5 = one every two weeks). */
function perWeek(b: TunerBudget, perTry: EchoResources): number {
  const byTuners = perTry.tuners > 0 ? (b.weeklyTuners ?? 0) / perTry.tuners : 0;
  // EXP income not typed while an EXP budget is: no EXP comes in; neither typed: EXP is not counted
  if (b.weeklyExp === null && b.exp === null) return byTuners;
  return Math.min(byTuners, perTry.exp > 0 ? (b.weeklyExp ?? 0) / perTry.exp : byTuners);
}

/** "Now", "Week 3", "Later": the step's when, in words. */
export function whenText(when: StepWhen): string {
  if (when.kind === "now") return "Now";
  if (when.kind === "week") return `Week ${when.week}`;
  if (when.kind === "later") return "Later";
  return "";
}
