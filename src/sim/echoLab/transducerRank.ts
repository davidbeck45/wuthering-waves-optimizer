// Wuthering Tools+ Echo Lab — the Transducer ranking: every re-roll advice of the account side by side, so the question
// is no longer "which line of this echo" but "which echo gets my next Transducer".
//
// Built from the advice the re-roll tab already asks for (rerollAdvice.ts: one `reroll` job per equipped five-line
// echo), so the ranking, the re-roll tab and the calculator's panel read one set of figures. A row is one echo with the
// plan that pays best per Transducer among the plans a filter lets through: by resonator, by Transducers a try (1, 2 or
// 3) and by lines kept (0 to 4). The order is expected damage per rotation per Transducer by default, which is also what
// the Tuner plan orders by, so a carry's +0.5 % outranks a support's +2 %.
//
// `spendPlan` answers "I have N Transducers": which echoes, which locks, how many tries each. A run of tries with the
// same locks is the best of that many draws from one distribution (the kept lines never change, the others are drawn
// again every time), which `LockPlan.bestOf` carries; the split over echoes is then a knapsack solved exactly.
//
// `critKeepCheck` puts the usual rule of thumb, "keep Crit Rate and Crit DMG, re-roll the rest", against every other
// way to lock each echo. No engine imports (types, and the Energy Regen rounding of energyNeed.ts): the page and the CLI
// share it.
import type { LockPlan, LockSetPlan, RerollAdviceResult } from "./rerollAdvice";
import { MIN_PLAN_GAIN } from "./rerollPick";
import { shortBy } from "../energy/energyNeed";

export interface TransducerFilter {
  /** only this resonator's echoes */
  characterId?: string | null;
  /** only these resonators (the damage dealers, say); null or left out: everyone */
  characterIds?: ReadonlySet<string> | null;
  /** only plans that cost this many Transducers a try (1, 2 or 3) */
  cost?: number | null;
  /** only plans that keep this many lines (0 to 4) */
  keep?: number | null;
}

export type TransducerSort = "damage" | "percent" | "chance" | "gain";

export const TRANSDUCER_SORTS: ReadonlyArray<{ id: TransducerSort; label: string; hint: string }> = [
  { id: "damage", label: "Damage per Transducer", hint: "expected damage per rotation gained for each Transducer spent" },
  { id: "percent", label: "Percent per Transducer", hint: "expected gain as a share of that resonator's own rotation, for each Transducer spent" },
  { id: "chance", label: "Chance to improve", hint: "how often one try beats the lines the echo has now" },
  { id: "gain", label: "Gain of one try", hint: "expected gain of one try, whatever it costs" },
];

/** Why a row has no plan to act on. */
export type RowBlock = "erFloor" | "noPlan" | null;

export interface TransducerRow {
  /** `${characterId}|${slot}` */
  key: string;
  advice: RerollAdviceResult;
  /** the plan the row stands on: the best expected gain per Transducer among the plans the filter lets through */
  plan: LockPlan | null;
  /** the plan is worth a Transducer: it is expected to gain at least MIN_PLAN_GAIN and re-rolls no line the ER floor needs */
  pays: boolean;
  /** "erFloor": every plan the filter lets through re-rolls an Energy Regen line the build needs; "noPlan": the filter lets none through */
  blocked: RowBlock;
  /** expected damage per rotation one try adds (the plan's expected gain × the resonator's rotation damage) */
  damage: number;
  damagePerTransducer: number;
  percentPerTransducer: number;
  /** 1 = the best place for a Transducer under this filter and sort; 0 for a row that does not pay */
  rank: number;
  /** the plan re-rolls an Energy Regen line and the app knows no Energy Regen need for this resonator (they are in no
   *  saved team it could measure): the line may be one the build needs */
  erUnknown: boolean;
}

export const rowKey = (advice: Pick<RerollAdviceResult, "characterId" | "slot">): string => `${advice.characterId}|${advice.slot}`;

/** The fields of the lines the ER floor locks on this echo. */
export const floorFields = (advice: Pick<RerollAdviceResult, "lines">): Set<number> => new Set(advice.lines.filter((l) => l.erFloor).map((l) => l.field));

/** True when the plan re-rolls an Energy Regen line while no Energy Regen need is known for the resonator. */
export const rerollsUnknownEr = (advice: Pick<RerollAdviceResult, "lines" | "erNeed">, plan: Pick<LockSetPlan, "rerolledFields"> | null): boolean =>
  Boolean(plan) && advice.erNeed == null && advice.lines.some((l) => l.key === "EnergyRegen" && (plan as Pick<LockSetPlan, "rerolledFields">).rerolledFields.includes(l.field));

/** True when the plan re-rolls an Energy Regen line the build needs to stay at its need. */
export const rerollsFloor = (advice: Pick<RerollAdviceResult, "lines">, plan: Pick<LockSetPlan, "rerolledFields">): boolean => {
  const floor = floorFields(advice);
  return plan.rerolledFields.some((f) => floor.has(f));
};

const matches = (plan: Pick<LockSetPlan, "cost" | "locks">, filter: TransducerFilter): boolean =>
  (filter.cost == null || plan.cost === filter.cost) && (filter.keep == null || plan.locks === filter.keep);

/** The plans of an echo a filter lets through (one per number of kept lines at most), best per Transducer first. */
export function plansFor(advice: RerollAdviceResult, filter: TransducerFilter = {}): LockPlan[] {
  return advice.plans.filter((p) => matches(p, filter)).sort((a, b) => b.gainPerTransducer - a.gainPerTransducer || a.cost - b.cost || b.locks - a.locks);
}

/** The plan a row stands on, and why it has none to act on. */
export function rowPlan(advice: RerollAdviceResult, filter: TransducerFilter = {}): { plan: LockPlan | null; blocked: RowBlock } {
  const open = plansFor(advice, filter);
  if (!open.length) return { plan: null, blocked: "noPlan" };
  const safe = open.filter((p) => !rerollsFloor(advice, p));
  if (!safe.length) return { plan: open[0], blocked: "erFloor" };
  return { plan: safe[0], blocked: null };
}

const sortValue = (row: TransducerRow, sort: TransducerSort): number => {
  if (!row.plan) return -Infinity;
  if (sort === "damage") return row.damagePerTransducer;
  if (sort === "percent") return row.percentPerTransducer;
  if (sort === "chance") return row.plan.pImprove;
  return row.plan.expectedGain;
};

const inScope = (advice: RerollAdviceResult, filter: TransducerFilter): boolean =>
  (!filter.characterId || advice.characterId === filter.characterId) && (!filter.characterIds || filter.characterIds.has(advice.characterId));

/**
 * The ranking: one row an echo, the rows that pay first in the chosen order (ties: the bigger gain of one try, then the
 * resonator's name and the slot, so the order never depends on which answer came in first), then the rows that do not.
 */
export function transducerRows(advices: readonly RerollAdviceResult[], filter: TransducerFilter = {}, sort: TransducerSort = "damage"): TransducerRow[] {
  const rows: TransducerRow[] = [];
  for (const advice of advices) {
    if (!inScope(advice, filter)) continue;
    const { plan, blocked } = rowPlan(advice, filter);
    const gain = plan?.expectedGain ?? 0;
    const cost = plan?.cost || 1;
    const damage = gain * advice.base;
    rows.push({
      key: rowKey(advice),
      advice,
      plan,
      pays: Boolean(plan) && !blocked && gain >= MIN_PLAN_GAIN,
      blocked,
      damage,
      damagePerTransducer: damage / cost,
      percentPerTransducer: gain / cost,
      rank: 0,
      erUnknown: rerollsUnknownEr(advice, plan),
    });
  }
  rows.sort(
    (a, b) =>
      Number(b.pays) - Number(a.pays) ||
      sortValue(b, sort) - sortValue(a, sort) ||
      (b.plan?.expectedGain ?? 0) - (a.plan?.expectedGain ?? 0) ||
      a.advice.name.localeCompare(b.advice.name) ||
      a.advice.slot - b.advice.slot,
  );
  let n = 0;
  for (const row of rows) row.rank = row.pays ? ++n : 0;
  return rows;
}

// ── "I have N Transducers" ──────────────────────────────────────────────────────────────────────────────────────────

/** The most Transducers a spend plan is worked out for. */
export const MAX_BUDGET = 60;

export interface SpendStep {
  key: string;
  advice: RerollAdviceResult;
  plan: LockPlan;
  /** tries on this echo with these locks */
  tries: number;
  transducers: number;
  /** expected relative gain after those tries, keeping the best result (or the echo as it is) */
  expectedGain: number;
  /** the same in damage per rotation */
  expectedDamage: number;
  /** chance at least one of the tries beats the lines the echo has now */
  pAny: number;
}

export interface SpendPlan {
  budget: number;
  /** Transducers the plan uses: under the budget when nothing more is expected to pay */
  used: number;
  steps: SpendStep[];
  /** the steps' expected damage per rotation, added up (each resonator's own rotation) */
  expectedDamage: number;
  /** what the split maximises */
  by: "damage" | "percent";
}

/** What `tries` tries with a plan's locks are expected to reach (relative gain, keeping the best). */
export const gainAfter = (plan: Pick<LockPlan, "bestOf" | "expectedGain">, tries: number): number => {
  if (tries <= 0) return 0;
  const curve = plan.bestOf?.length ? plan.bestOf : [plan.expectedGain];
  return curve[Math.min(tries, curve.length) - 1];
};

/** What "a good try" (the best one in ten) gains with a plan's locks; null when fewer than one try in ten beats the lines
 *  the echo has, where "one in ten gains +0.00 % or more" would read as a promise. */
export const goodTry = (plan: Pick<LockPlan, "pImprove" | "p90">): number | null => (plan.pImprove >= 0.1 && plan.p90 > 1e-9 ? plan.p90 : null);

/** The chance at least one of `tries` tries beats the current lines. */
export const chanceOfAny = (plan: Pick<LockSetPlan, "pImprove">, tries: number): number => 1 - (1 - plan.pImprove) ** Math.max(0, tries);

/**
 * The best way to spend `budget` Transducers over the echoes a filter lets through: per echo one set of locks and a
 * number of tries, chosen so the expected gains add up highest. Exact for what it models: tries on one echo keep the
 * same locks, and one more try on an echo adds less than the one before. The Energy Regen lines a resonator's plans
 * re-roll, all lost at once, leave the build at its need (each line alone may go by the ER floor; two together may not).
 * It does not model changing the locks after a good result: after a re-roll you keep, read the ranking again with the
 * echo as it is then.
 */
export function spendPlan(advices: readonly RerollAdviceResult[], budget: number, filter: TransducerFilter = {}, by: "damage" | "percent" = "damage"): SpendPlan {
  const total = Math.max(0, Math.min(MAX_BUDGET, Math.floor(Number.isFinite(budget) ? budget : 0)));
  interface Option {
    advice: RerollAdviceResult;
    plan: LockPlan;
    tries: number;
    weight: number;
    value: number;
  }
  // one fixed order of the echoes, so a tie goes the same way whichever answer came in first (the first in this order)
  const ordered = advices
    .filter((advice) => inScope(advice, filter))
    .sort((x, y) => x.name.localeCompare(y.name) || x.slot - y.slot || x.characterId.localeCompare(y.characterId));
  // per resonator, per echo: every plan and number of tries that pays
  const byResonator = new Map<string, Option[][]>();
  for (const advice of ordered) {
    const options: Option[] = [];
    for (const plan of plansFor(advice, filter)) {
      if (rerollsFloor(advice, plan) || plan.expectedGain < MIN_PLAN_GAIN || !(plan.cost > 0)) continue;
      const most = Math.min(plan.bestOf?.length || 1, Math.floor(total / plan.cost));
      for (let tries = 1; tries <= most; tries++) {
        const gain = gainAfter(plan, tries);
        options.push({ advice, plan, tries, weight: tries * plan.cost, value: by === "damage" ? gain * advice.base : gain });
      }
    }
    if (!options.length) continue;
    const list = byResonator.get(advice.characterId) ?? [];
    list.push(options);
    byResonator.set(advice.characterId, list);
  }
  // One resonator's echoes together: the ER floor is read one line at a time (each line alone can go), so two echoes
  // that each re-roll an Energy Regen line could take the build under its need. Per resonator, the best use of every
  // number of Transducers whose re-rolled Energy Regen lines, all lost at once, still leave the build at its need.
  interface Combo {
    weight: number;
    value: number;
    parts: Option[];
  }
  const erOf = (o: Option): number => o.advice.lines.reduce((sum, l) => (l.key === "EnergyRegen" && o.plan.rerolledFields.includes(l.field) ? sum + l.value : sum), 0);
  const groups: Combo[][] = [];
  for (const echoes of byResonator.values()) {
    const known = echoes.map((opts) => opts[0].advice).find((a) => a.erNeed != null && a.erHave != null) ?? null;
    const bits = echoes.map((opts, i) => (known && opts.some((o) => erOf(o) > 0) ? 1 << i : 0));
    type Cell = { value: number; parts: Option[] } | null;
    let states = new Map<number, Cell[]>([[0, Array.from({ length: total + 1 }, (_, b): Cell => (b === 0 ? { value: 0, parts: [] } : null))]]);
    echoes.forEach((opts, i) => {
      const next = new Map<number, Cell[]>();
      for (const [mask, cells] of states) next.set(mask, [...cells]);
      for (const [mask, cells] of states) {
        for (let b = 0; b <= total; b++) {
          const cell = cells[b];
          if (!cell) continue;
          for (const o of opts) {
            const nb = b + o.weight;
            if (nb > total) continue;
            const nm = erOf(o) > 0 ? mask | bits[i] : mask;
            let row = next.get(nm);
            if (!row) next.set(nm, (row = new Array<Cell>(total + 1).fill(null)));
            const v = cell.value + o.value;
            const at = row[nb];
            if (!at || v > at.value + 1e-12) row[nb] = { value: v, parts: [...cell.parts, o] };
          }
        }
      }
      states = next;
    });
    const keepsNeed = (parts: readonly Option[]): boolean => {
      if (!known) return true;
      const lost = parts.reduce((sum, o) => sum + erOf(o), 0);
      return lost <= 0 || shortBy(known.erNeed, (known.erHave as number) - lost) <= 0;
    };
    const combos: Combo[] = [];
    for (let b = 1; b <= total; b++) {
      let bestCell: Cell = null;
      for (const cells of states.values()) {
        const cell = cells[b];
        if (cell && cell.parts.length && keepsNeed(cell.parts) && (!bestCell || cell.value > bestCell.value + 1e-12)) bestCell = cell;
      }
      if (bestCell) combos.push({ weight: b, value: bestCell.value, parts: bestCell.parts });
    }
    if (combos.length) groups.push(combos);
  }
  // multiple-choice knapsack over the resonators: best[g][b] = the most value from the first g with b Transducers
  const best: Float64Array[] = [new Float64Array(total + 1)];
  const pick: Int32Array[] = [];
  for (const options of groups) {
    const prev = best[best.length - 1];
    const next = Float64Array.from(prev);
    const chosen = new Int32Array(total + 1).fill(-1);
    for (let b = 1; b <= total; b++) {
      for (let o = 0; o < options.length; o++) {
        const { weight, value } = options[o];
        if (weight > b) continue;
        const v = prev[b - weight] + value;
        if (v > next[b] + 1e-12) {
          next[b] = v;
          chosen[b] = o;
        }
      }
    }
    best.push(next);
    pick.push(chosen);
  }
  // the fewest Transducers that reach the best value: a plan never spends one that adds nothing
  const top = best[best.length - 1];
  let b = 0;
  for (let i = 1; i <= total; i++) if (top[i] > top[b] + 1e-12) b = i;
  const steps: SpendStep[] = [];
  for (let g = groups.length - 1; g >= 0; g--) {
    const o = pick[g][b];
    if (o < 0) continue;
    const combo = groups[g][o];
    for (const { advice, plan, tries, weight } of combo.parts) {
      const gain = gainAfter(plan, tries);
      steps.push({ key: rowKey(advice), advice, plan, tries, transducers: weight, expectedGain: gain, expectedDamage: gain * advice.base, pAny: chanceOfAny(plan, tries) });
    }
    b -= combo.weight;
  }
  const value = (s: SpendStep): number => (by === "damage" ? s.expectedDamage : s.expectedGain) / s.transducers;
  steps.sort((x, y) => value(y) - value(x) || x.advice.name.localeCompare(y.advice.name) || x.advice.slot - y.advice.slot);
  return { budget: total, used: steps.reduce((sum, s) => sum + s.transducers, 0), steps, expectedDamage: steps.reduce((sum, s) => sum + s.expectedDamage, 0), by };
}

// ── "keep Crit Rate and Crit DMG, re-roll the rest": is it the best plan? ────────────────────────────────────────────

const CRIT_RATE = "CritRate";
const CRIT_DMG = "CritDMG";

export interface CritKeepRow {
  key: string;
  advice: RerollAdviceResult;
  /** the best plan at one Transducer a try (0 to 2 lines kept) and the stats it keeps */
  best: LockPlan;
  kept: string[];
  /** "keep exactly the crit lines the echo has": that plan, among all the ways to lock it (null when it has none) */
  critPlan: LockSetPlan | null;
  /** the best plan's expected gain over the crit-only plan's (relative gain points; 0 when they are the same plan) */
  edge: number;
}

export interface CritKeepCheck {
  /** echoes read, and how many of them have a one-Transducer plan that pays */
  echoes: number;
  paying: number;
  /** echoes with both Crit Rate and Crit DMG, where a one-Transducer plan pays */
  both: {
    echoes: number;
    /** the best one-Transducer plan keeps exactly Crit Rate and Crit DMG */
    keepsBoth: number;
    /** it keeps one crit line and another stat */
    keepsOneAndOther: number;
    /** it keeps one crit line alone, or none: the other is worth less than a fresh line */
    keepsLess: number;
    /** the rows where it is not "exactly the two crit lines", biggest edge first */
    exceptions: CritKeepRow[];
    /** over these echoes: the crit-only plan's expected gain as a share of the best plan's (1 = always the best) */
    shareOfBest: number;
  };
  /** echoes with one of the two, where a one-Transducer plan pays */
  one: {
    echoes: number;
    /** the best one-Transducer plan keeps that crit line (alone or with one other line) */
    keepsCrit: number;
    exceptions: CritKeepRow[];
  };
  /** echoes with neither, where a one-Transducer plan pays */
  none: { echoes: number };
  /** echoes where keeping exactly the crit lines would re-roll an Energy Regen line the build needs: the rule cannot be
   *  followed there, so they count in none of the groups above */
  erBound: number;
}

const sameFields = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/**
 * The rule of thumb against the full search, at one Transducer a try (the cost of keeping up to two lines, so keeping
 * both crit lines is free): on how many echoes is "keep exactly the crit lines, re-roll the rest" the best plan, and
 * what does it give up where it is not. Echoes where no one-Transducer plan pays are counted and left out.
 */
export function critKeepCheck(advices: readonly RerollAdviceResult[], filter: TransducerFilter = {}): CritKeepCheck {
  const out: CritKeepCheck = {
    echoes: 0,
    paying: 0,
    both: { echoes: 0, keepsBoth: 0, keepsOneAndOther: 0, keepsLess: 0, exceptions: [], shareOfBest: 1 },
    one: { echoes: 0, keepsCrit: 0, exceptions: [] },
    none: { echoes: 0 },
    erBound: 0,
  };
  let critGain = 0;
  let bestGain = 0;
  for (const advice of advices) {
    if (!inScope(advice, filter)) continue;
    out.echoes += 1;
    const best = plansFor(advice, { cost: 1 }).filter((p) => !rerollsFloor(advice, p))[0];
    if (!best || best.expectedGain < MIN_PLAN_GAIN) continue;
    out.paying += 1;
    const keyOf = new Map(advice.lines.map((l) => [l.field, l.key]));
    const kept = best.lockedFields.map((f) => keyOf.get(f) ?? "");
    const critFields = advice.lines.filter((l) => l.key === CRIT_RATE || l.key === CRIT_DMG).map((l) => l.field);
    const critPlan = critFields.length ? advice.allPlans.find((p) => sameFields(p.lockedFields, critFields)) ?? null : null;
    if (critPlan && rerollsFloor(advice, critPlan)) {
      out.erBound += 1;
      continue;
    }
    const row: CritKeepRow = { key: rowKey(advice), advice, best, kept, critPlan, edge: critPlan ? best.expectedGain - critPlan.expectedGain : 0 };
    const keptCrit = kept.filter((k) => k === CRIT_RATE || k === CRIT_DMG).length;
    if (critFields.length === 2) {
      out.both.echoes += 1;
      critGain += critPlan?.expectedGain ?? 0;
      bestGain += best.expectedGain;
      if (keptCrit === 2) out.both.keepsBoth += 1;
      else {
        if (keptCrit === 1 && kept.length === 2) out.both.keepsOneAndOther += 1;
        else out.both.keepsLess += 1;
        out.both.exceptions.push(row);
      }
    } else if (critFields.length === 1) {
      out.one.echoes += 1;
      if (keptCrit === 1) out.one.keepsCrit += 1;
      else out.one.exceptions.push(row);
    } else {
      out.none.echoes += 1;
    }
  }
  out.both.shareOfBest = bestGain > 0 ? critGain / bestGain : 1;
  const byEdge = (a: CritKeepRow, b: CritKeepRow): number => b.edge - a.edge || a.advice.name.localeCompare(b.advice.name) || a.advice.slot - b.advice.slot;
  out.both.exceptions.sort(byEdge);
  out.one.exceptions.sort(byEdge);
  return out;
}
