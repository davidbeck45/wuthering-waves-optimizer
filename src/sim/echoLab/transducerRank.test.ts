// Wuthering Tools+ Echo Lab — the Transducer ranking's view model (transducerRank.ts): the rows and their order under
// each filter, the "I have N Transducers" split against every split tried one by one, and the crit rule of thumb
// against the full search. Advice objects are written by hand: no engine here.
import { describe, expect, it } from "vitest";
import type { LineAdvice, LockPlan, LockSetPlan, RerollAdviceResult } from "./rerollAdvice";
import { chanceOfAny, critKeepCheck, gainAfter, MAX_BUDGET, plansFor, rowPlan, spendPlan, transducerRows, type SpendPlan } from "./transducerRank";

const COST = [1, 1, 1, 2, 3];

/** a plan that keeps the first `locks` fields; `first` is one try's expected gain, each further try adds `fade` × the last */
function plan(locks: number, first: number, options: { p?: number; fade?: number; locked?: number[] } = {}): LockPlan {
  const locked = options.locked ?? [1, 2, 3, 4, 5].slice(0, locks);
  const fade = options.fade ?? 0.6;
  const bestOf: number[] = [];
  let step = first;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += step;
    bestOf.push(sum);
    step *= fade;
  }
  const cost = COST[locks];
  const pImprove = options.p ?? 0.3;
  return {
    locks,
    lockedFields: locked,
    rerolledFields: [1, 2, 3, 4, 5].filter((f) => !locked.includes(f)),
    cost,
    method: "counted",
    pImprove,
    expectedGain: first,
    expectedChange: first - 0.01,
    gainPerTransducer: first / cost,
    transducersPerSuccess: pImprove > 0 ? cost / pImprove : null,
    p10: -0.02,
    p50: 0,
    p90: first * 3,
    bestOf,
    top: { gain: first * 10, lines: [], chance: 1e-6 },
  };
}

const KEYS = ["CritRate", "CritDMG", "ATK", "DEF_FLAT", "HP"];

function advice(characterId: string, slot: number, base: number, plans: LockPlan[], extra: Partial<RerollAdviceResult> & { keys?: string[]; floor?: number[] } = {}): RerollAdviceResult {
  const keys = extra.keys ?? KEYS;
  const lines: LineAdvice[] = keys.map((key, i) => ({
    field: i + 1,
    key,
    value: 10,
    worth: 0.01,
    freshWorth: 0.005,
    delta: -0.005,
    rank: i + 1,
    advice: "lock",
    ...(extra.floor?.includes(i + 1) ? { erFloor: true } : {}),
  }));
  const sorted = [...plans].sort((a, b) => b.locks - a.locks);
  const paying = sorted.filter((p) => p.expectedGain >= 0.0005 && !p.rerolledFields.some((f) => extra.floor?.includes(f)));
  const recommended = paying.length ? [...paying].sort((a, b) => b.gainPerTransducer - a.gainPerTransducer || a.cost - b.cost)[0] : null;
  return {
    characterId,
    name: extra.name ?? characterId,
    slot,
    echoId: `${characterId}-${slot}`,
    echo: "TestEcho",
    base,
    lines,
    plans: sorted,
    recommended,
    allPlans: extra.allPlans ?? (sorted as LockSetPlan[]),
    lockCostNote: "",
    assumptions: [],
    scorings: 0,
    erNeed: extra.erNeed ?? null,
    erHave: extra.erHave ?? null,
  };
}

describe("Transducer ranking rows", () => {
  // a carry with a 10M rotation and a support with a 1M one
  const carryA = advice("Carry", 0, 10_000_000, [plan(2, 0.004), plan(3, 0.006), plan(4, 0.003)]);
  const carryB = advice("Carry", 1, 10_000_000, [plan(2, 0.001), plan(3, 0.007), plan(4, 0.009)]);
  const support = advice("Support", 0, 1_000_000, [plan(2, 0.03), plan(3, 0.032), plan(4, 0.01)]);
  const done = advice("Carry", 2, 10_000_000, [plan(2, 0.0001), plan(3, 0.0002), plan(4, 0.0003)]);
  const all = [support, done, carryB, carryA];

  it("ranks by expected damage per Transducer: a carry's small gain outranks a support's big one", () => {
    const rows = transducerRows(all);
    // carryA: 0.4 % of 10M for 1 = 40,000 · carryB: 0.7 % for 2 = 35,000 · support: 3 % of 1M for 1 = 30,000
    expect(rows.map((r) => [r.key, r.rank, r.plan?.locks, Math.round(r.damagePerTransducer)])).toEqual([
      ["Carry|0", 1, 2, 40_000],
      ["Carry|1", 2, 3, 35_000],
      ["Support|0", 3, 2, 30_000],
      // 0.01 % a Transducer at every cost: the cheapest try stands for the row, and it is not worth one
      ["Carry|2", 0, 2, 1_000],
    ]);
    expect(rows[3].pays).toBe(false);
    expect(rows[0].damage).toBeCloseTo(40_000, 6);
    expect(rows[1].percentPerTransducer).toBeCloseTo(0.0035, 12);
  });

  it("the other orders: share of the resonator's own rotation, chance, the gain of one try", () => {
    expect(transducerRows(all, {}, "percent").map((r) => r.key)).toEqual(["Support|0", "Carry|0", "Carry|1", "Carry|2"]);
    expect(transducerRows(all, {}, "gain").map((r) => r.key)).toEqual(["Support|0", "Carry|1", "Carry|0", "Carry|2"]);
    const chancy = advice("Lucky", 0, 100, [plan(2, 0.001, { p: 0.9 })]);
    expect(transducerRows([...all, chancy], {}, "chance")[0].key).toBe("Lucky|0");
  });

  it("the same answer whatever order the advice came in", () => {
    const a = transducerRows(all).map((r) => r.key);
    expect(transducerRows([...all].reverse()).map((r) => r.key)).toEqual(a);
    // two echoes with the very same plan: the resonator's name, then the slot
    const twins = [advice("Zed", 3, 100, [plan(2, 0.01)]), advice("Abe", 4, 100, [plan(2, 0.01)]), advice("Abe", 1, 100, [plan(2, 0.01)])];
    expect(transducerRows(twins).map((r) => r.key)).toEqual(["Abe|1", "Abe|4", "Zed|3"]);
  });

  it("filters by Transducers a try, by lines kept, by resonator and by a set of resonators", () => {
    // 2 Transducers a try = three lines kept
    const two = transducerRows(all, { cost: 2 });
    expect(two.map((r) => [r.key, r.plan?.locks, r.plan?.cost])).toEqual([
      ["Carry|1", 3, 2],
      ["Carry|0", 3, 2],
      ["Support|0", 3, 2],
      ["Carry|2", 3, 2],
    ]);
    expect(transducerRows(all, { keep: 4 }).map((r) => [r.key, r.plan?.cost])).toEqual([
      ["Carry|1", 3],
      ["Carry|0", 3],
      ["Support|0", 3],
      ["Carry|2", 3],
    ]);
    expect(transducerRows(all, { characterId: "Support" }).map((r) => r.key)).toEqual(["Support|0"]);
    expect(transducerRows(all, { characterIds: new Set(["Carry"]) }).map((r) => r.key)).toEqual(["Carry|0", "Carry|1", "Carry|2"]);
    // a filter no plan passes: the row stays, with nothing to act on
    const none = transducerRows(all, { cost: 2, keep: 4 });
    expect(none.every((r) => r.plan === null && r.blocked === "noPlan" && !r.pays && r.rank === 0)).toBe(true);
    expect(plansFor(carryA, { cost: 1 }).map((p) => p.locks)).toEqual([2]);
  });

  it("never advises a plan that re-rolls Energy Regen the build needs, and flags Energy Regen it knows no need for", () => {
    // field 3 is an Energy Regen line the floor needs: the two-line plan re-rolls it, the three-line plan keeps it
    const needs = advice("Needy", 0, 1000, [plan(2, 0.02), plan(3, 0.01), plan(4, 0.004)], { keys: ["CritRate", "CritDMG", "EnergyRegen", "DEF_FLAT", "HP"], floor: [3], erNeed: 120, erHave: 121 });
    expect(rowPlan(needs).plan?.locks).toBe(3);
    expect(transducerRows([needs])[0]).toMatchObject({ pays: true, blocked: null, erUnknown: false });
    const forced = transducerRows([needs], { keep: 2 })[0];
    expect(forced).toMatchObject({ pays: false, blocked: "erFloor", rank: 0 });
    expect(forced.plan?.locks).toBe(2);
    // the same echo on a resonator in no saved team: no floor is known, the plan re-rolls the line and says so
    const unknown = advice("Loner", 0, 1000, [plan(2, 0.02), plan(3, 0.01)], { keys: ["CritRate", "CritDMG", "EnergyRegen", "DEF_FLAT", "HP"] });
    expect(transducerRows([unknown])[0]).toMatchObject({ pays: true, erUnknown: true });
    expect(transducerRows([unknown], { keep: 3 })[0].erUnknown).toBe(false);
  });
});

describe("Spending N Transducers", () => {
  const a = advice("A", 0, 1000, [plan(2, 0.01, { fade: 0.5 }), plan(3, 0.03, { fade: 0.5 }), plan(4, 0.02, { fade: 0.9 })]);
  const b = advice("B", 0, 3000, [plan(2, 0.004, { fade: 0.8 }), plan(3, 0.005, { fade: 0.8 })]);
  const c = advice("C", 0, 500, [plan(2, 0.02, { fade: 0.3 })]);
  const dud = advice("D", 0, 9000, [plan(2, 0.0001), plan(3, 0.0002)]);
  const all = [a, b, c, dud];

  /** every split tried one by one: per echo nothing, or one plan and a number of tries */
  function bruteForce(advices: RerollAdviceResult[], budget: number): number {
    let best = 0;
    const walk = (i: number, left: number, value: number): void => {
      if (value > best) best = value;
      if (i === advices.length) return;
      walk(i + 1, left, value);
      for (const p of advices[i].plans) {
        if (p.expectedGain < 0.0005) continue;
        for (let tries = 1; tries * p.cost <= left && tries <= p.bestOf.length; tries++) walk(i + 1, left - tries * p.cost, value + advices[i].base * p.bestOf[tries - 1]);
      }
    };
    walk(0, budget, 0);
    return best;
  }

  it("finds the split no other split beats, for every budget", () => {
    for (let budget = 1; budget <= 9; budget++) {
      const got = spendPlan(all, budget);
      expect(got.expectedDamage).toBeCloseTo(bruteForce(all, budget), 9);
      expect(got.used).toBeLessThanOrEqual(budget);
      expect(got.used).toBe(got.steps.reduce((s, x) => s + x.transducers, 0));
      for (const s of got.steps) {
        expect(s.transducers).toBe(s.tries * s.plan.cost);
        expect(s.expectedGain).toBe(gainAfter(s.plan, s.tries));
        expect(s.expectedDamage).toBeCloseTo(s.expectedGain * s.advice.base, 9);
        expect(s.pAny).toBeCloseTo(1 - 0.7 ** s.tries, 12);
        expect(s.key).not.toBe("D|0"); // an echo with no plan that pays gets nothing
      }
      expect(new Set(got.steps.map((s) => s.key)).size).toBe(got.steps.length); // one set of locks an echo
    }
  });

  it("one Transducer goes where one try adds most; a second can change the first one's plan", () => {
    const one = spendPlan(all, 1);
    // A's two-line plan: 1 % of 1,000 = 10 · B's: 0.4 % of 3,000 = 12 · C's: 2 % of 500 = 10
    expect(one.steps.map((s) => [s.key, s.plan.locks, s.tries])).toEqual([["B|0", 2, 1]]);
    const two = spendPlan(all, 2);
    // with two, A's three-line plan (3 % of 1,000 = 30 for 2 Transducers) beats any two one-Transducer tries
    expect(two.steps.map((s) => [s.key, s.plan.locks, s.tries])).toEqual([["A|0", 3, 1]]);
    expect(two.expectedDamage).toBeCloseTo(30, 9);
  });

  it("spends no Transducer that adds nothing, and nothing at all when no plan pays", () => {
    const flat = advice("F", 0, 1000, [plan(2, 0.01, { fade: 0 })]); // a second try adds nothing
    const plan5: SpendPlan = spendPlan([flat], 5);
    expect(plan5).toMatchObject({ budget: 5, used: 1 });
    expect(spendPlan([dud], 5)).toMatchObject({ used: 0, steps: [], expectedDamage: 0 });
    expect(spendPlan(all, 0).steps).toEqual([]);
    expect(spendPlan(all, -3).budget).toBe(0);
    expect(spendPlan(all, 1e9).budget).toBe(MAX_BUDGET);
  });

  it("respects the filter and the unit", () => {
    expect(spendPlan(all, 4, { characterId: "C" }).steps.map((s) => s.key)).toEqual(["C|0"]);
    // only three-line plans (2 Transducers a try): C has none
    const three = spendPlan(all, 6, { keep: 3 });
    expect(three.steps.every((s) => s.plan.locks === 3)).toBe(true);
    expect(three.steps.map((s) => s.key)).not.toContain("C|0");
    // by share of each resonator's own rotation, C's 2 % comes before B's 0.4 %
    expect(spendPlan(all, 1, {}, "percent").steps.map((s) => s.key)).toEqual(["C|0"]);
    // never a plan that re-rolls Energy Regen the build needs
    const needs = advice("N", 0, 1e6, [plan(2, 0.05), plan(3, 0.001)], { keys: ["CritRate", "CritDMG", "EnergyRegen", "DEF_FLAT", "HP"], floor: [3], erNeed: 120, erHave: 121 });
    expect(spendPlan([needs], 2).steps.map((s) => s.plan.locks)).toEqual([3]);
  });

  it("reads a run of tries off the plan's curve", () => {
    const p = plan(2, 0.01, { fade: 0.5, p: 0.25 });
    expect(gainAfter(p, 0)).toBe(0);
    expect(gainAfter(p, 1)).toBe(0.01);
    expect(gainAfter(p, 2)).toBeCloseTo(0.015, 12);
    expect(gainAfter(p, 99)).toBe(p.bestOf[p.bestOf.length - 1]);
    expect(chanceOfAny(p, 0)).toBe(0);
    expect(chanceOfAny(p, 2)).toBeCloseTo(1 - 0.75 ** 2, 12);
  });
});

describe("Keep Crit Rate and Crit DMG, re-roll the rest?", () => {
  const set = (locked: number[], gain: number): LockSetPlan => plan(locked.length, gain, { locked });
  const both = ["CritRate", "CritDMG", "ATK", "DEF_FLAT", "HP"];

  it("counts where exactly the two crit lines are the best one-Transducer plan, and what the rule gives up elsewhere", () => {
    // 1: the two crit lines are the best pair to keep
    const agrees = advice("Agrees", 0, 1000, [plan(2, 0.01, { locked: [1, 2] })], { keys: both, allPlans: [set([1, 2], 0.01), set([1, 3], 0.004)] });
    // 2: a low Crit DMG line: Crit Rate and ATK % are the better pair (0.8 % against 0.2 % for the two crit lines)
    const lowCd = advice("LowCd", 0, 1000, [plan(2, 0.008, { locked: [1, 3] })], { keys: both, allPlans: [set([1, 3], 0.008), set([1, 2], 0.002)] });
    // 3: only Crit DMG is worth keeping
    const oneOnly = advice("OneOnly", 0, 1000, [plan(1, 0.006, { locked: [2] }), plan(2, 0.005, { locked: [1, 2] })], { keys: both, allPlans: [set([2], 0.006), set([1, 2], 0.005)] });
    // 4: nothing pays at one Transducer: counted, left out
    const fine = advice("Fine", 0, 1000, [plan(2, 0.0001, { locked: [1, 2] }), plan(3, 0.01)], { keys: both });
    // one crit line, kept; one crit line, dropped for two better lines; no crit line
    const single = advice("Single", 0, 1000, [plan(2, 0.01, { locked: [1, 3] })], { keys: ["CritDMG", "HP", "ATK", "DEF", "DEF_FLAT"], allPlans: [set([1, 3], 0.01), set([1], 0.007)] });
    const dropped = advice("Dropped", 0, 1000, [plan(2, 0.01, { locked: [2, 3] })], { keys: ["CritRate", "ATK", "EnergyRegen", "DEF", "DEF_FLAT"], allPlans: [set([2, 3], 0.01), set([1], 0.004)] });
    const none = advice("None", 0, 1000, [plan(2, 0.02, { locked: [1, 2] })], { keys: ["ATK", "ATK_FLAT", "HP", "DEF", "DEF_FLAT"] });
    const check = critKeepCheck([agrees, lowCd, oneOnly, fine, single, dropped, none]);
    expect(check).toMatchObject({ echoes: 7, paying: 6, none: { echoes: 1 } });
    expect(check.both).toMatchObject({ echoes: 3, keepsBoth: 1, keepsOneAndOther: 1, keepsLess: 1 });
    // the rule's gain over the best plans': (1 + 0.2 + 0.5) / (1 + 0.8 + 0.6) %
    expect(check.both.shareOfBest).toBeCloseTo(0.017 / 0.024, 12);
    expect(check.both.exceptions.map((x) => [x.key, x.kept, Math.round(x.edge * 1e4)])).toEqual([
      ["LowCd|0", ["CritRate", "ATK"], 60],
      ["OneOnly|0", ["CritDMG"], 10],
    ]);
    expect(check.one).toMatchObject({ echoes: 2, keepsCrit: 1 });
    expect(check.one.exceptions.map((x) => [x.key, x.kept, x.critPlan?.lockedFields])).toEqual([["Dropped|0", ["ATK", "EnergyRegen"], [1]]]);
  });

  it("reads only the echoes a filter lets through, and never a plan that re-rolls Energy Regen the build needs", () => {
    const a = advice("A", 0, 1000, [plan(2, 0.01, { locked: [1, 2] })], { keys: both });
    const b = advice("B", 0, 1000, [plan(2, 0.01, { locked: [1, 3] })], { keys: both });
    expect(critKeepCheck([a, b], { characterIds: new Set(["A"]) })).toMatchObject({ echoes: 1, both: { echoes: 1, keepsBoth: 1 } });
    // the only one-Transducer plan re-rolls the Energy Regen line the floor needs: nothing to compare
    const needs = advice("N", 0, 1000, [plan(2, 0.02, { locked: [1, 2] }), plan(3, 0.01)], { keys: ["CritRate", "CritDMG", "EnergyRegen", "DEF_FLAT", "HP"], floor: [3], erNeed: 120, erHave: 121 });
    expect(critKeepCheck([needs])).toMatchObject({ echoes: 1, paying: 0 });
  });
});
