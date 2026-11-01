// Wuthering Tools+ Echo Lab — the Tuner plan's engine half (tunerPlan.ts), "How good is this roll" (rollQuality.ts)
// and the budget planner (tunerBudget.ts), on the Echo Lab's public test account (echoLabAccount.json: Cartethyia,
// Galbrena, Zani, synthesised "lab" echoes) and small synthetic candidates.
import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/echoLabAccount.json";
import { ECHO_LEVEL_EXP, FULL_TUNE_RESOURCES } from "../../echoes/levelingCost";
import { SUBSTAT_KEYS, maxRoll } from "../substats/substatWeights";
import { createLabSession, type LabAccount } from "./core";
import { bestOwners } from "./bestOwner";
import { ratingOf } from "./echoLabView";
import { additivePlan, rerollAdvice } from "./rerollAdvice";
import { rollQuality } from "./rollQuality";
import { outcomeCount } from "./rolls";
import { tunerCandidates, tuneToMaxResources, type FreshSlot, type TunerCandidate } from "./tunerPlan";
import { EMPTY_BUDGET, WEEKS_AHEAD, normalizeBudget, planTuners, readTunerBudget, triesCovered, whenText, writeTunerBudget } from "./tunerBudget";
import { createEchoLabHost, type EchoLabResponse } from "./workerHost";

const account = fixture as unknown as LabAccount;
const clone = (): LabAccount => JSON.parse(JSON.stringify(account));
const quiet = { yieldMs: 0 };
const T = 60_000;

// eslint-disable-next-line no-unused-vars -- the parameters of a function type
function withEcho(base: LabAccount, echoId: string, edit: (e: Record<string, any>) => void): LabAccount {
  const next = JSON.parse(JSON.stringify(base)) as LabAccount;
  const echo = next.echoes.find((e) => e.echoId === echoId);
  if (!echo) throw new Error(`no echo ${echoId}`);
  edit(echo);
  return next;
}

/** Galbrena wearing the four-line labtune0004 in slot 2 (a 1-cost Flamewing's Shadow ATK echo, like the one there). */
function wearingPartial(): LabAccount {
  const next = clone();
  const galbrena = next.characters.Galbrena;
  const replaced = galbrena.echoes[2].echoId;
  galbrena.echoes[2] = { ...galbrena.echoes[2], echoId: "labtune0004" };
  delete next.equipped![replaced];
  next.equipped!.labtune0004 = { Galbrena: 2 };
  return next;
}

describe("Tuner plan costs", () => {
  it("prices finishing an echo from Ryan's 5★ levelling table: +5 per line, 10 Tuners a tune", () => {
    expect(tuneToMaxResources(0)).toEqual(FULL_TUNE_RESOURCES);
    expect(tuneToMaxResources(0).tuners).toBe(50);
    expect(tuneToMaxResources(3)).toMatchObject({ tuners: 20, exp: ECHO_LEVEL_EXP[25] - ECHO_LEVEL_EXP[15] });
    expect(tuneToMaxResources(4)).toMatchObject({ tuners: 10, exp: 142600 - 79100 });
    expect(tuneToMaxResources(5)).toMatchObject({ tuners: 0, exp: 0, shellCredits: 0 });
    // Shell Credits: 0.1 per EXP plus 2,000 a tune
    expect(tuneToMaxResources(4).shellCredits).toBeCloseTo(63500 * 0.1 + 2000, 9);
  });
});

describe("Tuner plan candidates", () => {
  it(
    "rolls out every unfinished spare echo in the same owner's slot as the pass, counting it only when it ends up better",
    async () => {
      const session = createLabSession(account);
      const pass = await bestOwners(session, {}, quiet);
      const result = await tunerCandidates(session, { freshSlots: 0 }, quiet);
      expect(result.fresh).toEqual([]);
      const ids = result.candidates.map((c) => c.echoId).sort();
      expect(ids).toEqual(["labtune0003", "labtune0004"]);
      for (const c of result.candidates) {
        const row = pass.echoes.find((e) => e.echoId === c.echoId)!;
        expect(c.kind).toBe("spare");
        // the pass's Tune or Feed target, and its numbers (the session memo answers the second ask)
        expect({ characterId: c.characterId, slot: c.slot }).toEqual({ characterId: row.potential!.characterId, slot: row.potential!.slot });
        expect(c.pKeep).toBeCloseTo(row.potential!.pBeat, 12);
        expect(c.expectedGain).toBeCloseTo(row.potential!.expectedUpside, 12);
        expect(c.expectedGain).toBeGreaterThanOrEqual(Math.max(0, row.potential!.expectedGain) - 1e-12);
        expect(c.expectedDamage).toBeCloseTo(c.expectedGain * c.base, 6);
        expect(c.resources).toEqual(tuneToMaxResources(c.lines));
        expect(c.level).toBe(c.lines * 5);
        expect(c.damagePerTuner).toBeCloseTo(c.expectedDamage / c.resources.tuners, 9);
      }
      // most damage per Tuner first
      expect(result.candidates[0].damagePerTuner).toBeGreaterThanOrEqual(result.candidates[1].damagePerTuner);
      expect(result.leftOut).toEqual([]);
    },
    T,
  );

  it(
    "tunes a worn unfinished echo where it sits: every line counts, and the spread matches the hope-for lines",
    async () => {
      const session = createLabSession(wearingPartial());
      const result = await tunerCandidates(session, { freshSlots: 0 }, quiet);
      const worn = result.candidates.find((c) => c.echoId === "labtune0004")!;
      expect(worn).toMatchObject({ kind: "worn", characterId: "Galbrena", slot: 2, pKeep: null, method: "exact", lines: 4, level: 20 });
      expect(worn.resources.tuners).toBe(10);
      // a line only ever adds: no outcome loses damage
      expect(worn.p10).toBeGreaterThanOrEqual(-1e-12);
      expect(worn.expectedGain).toBeGreaterThan(0);
      // the same expectation through the other code path: each open substat equally likely, at its tier odds
      const quality = await rollQuality(session, "labtune0004", { characterId: "Galbrena", slot: 2 }, {}, quiet);
      expect(quality.worn).toBe(true);
      const viaHope = quality.hopeFor.reduce((s, h) => s + h.chance * h.expectedGain, 0);
      expect(worn.expectedGain).toBeCloseTo(viaHope, 3);
    },
    T,
  );

  it(
    "leaves out unfinished echoes below 5★ and those no built character can slot, saying why",
    async () => {
      let next = withEcho(account, "labtune0003", (e) => (e.rank = 4));
      next = withEcho(next, "labnoslot01", (e) => {
        e.echoSubStatsType4 = null;
        e.echoSubStatsValue4 = null;
        e.echoSubStatsType5 = null;
        e.echoSubStatsValue5 = null;
      });
      const result = await tunerCandidates(createLabSession(next), { freshSlots: 0 }, quiet);
      expect(result.candidates.map((c) => c.echoId)).toEqual(["labtune0004"]);
      expect(result.leftOut).toEqual([
        { echoId: "labnoslot01", echo: "Chirpuff", lines: 3, reason: "no-slot" },
        { echoId: "labtune0003", echo: "NightmareBabyViridblazeSaurian", lines: 3, reason: "not-5-star" },
      ].sort((a, b) => next.echoes.findIndex((e) => e.echoId === a.echoId) - next.echoes.findIndex((e) => e.echoId === b.echoId)));
    },
    T,
  );

  it(
    "finds where a fresh echo pays most, with the re-roll advisor's all-five-lines model, the same answer every run",
    async () => {
      const session = createLabSession(account);
      const result = await tunerCandidates(session, { freshSlots: 3 }, quiet);
      expect(result.fresh.length).toBeGreaterThan(0);
      expect(result.fresh.length).toBeLessThanOrEqual(3);
      for (const f of result.fresh) {
        expect(f.resources).toEqual(FULL_TUNE_RESOURCES);
        expect(f.pKeep).toBeGreaterThan(0);
        expect(f.pKeep).toBeLessThanOrEqual(1);
        expect(f.expectedGain).toBeGreaterThan(0);
        expect(f.damagePerTuner).toBeCloseTo(f.expectedDamage / 50, 9);
      }
      for (let i = 1; i < result.fresh.length; i++) expect(result.fresh[i - 1].damagePerTuner).toBeGreaterThanOrEqual(result.fresh[i].damagePerTuner);
      // a fresh echo is "re-roll all five lines, keep the better": the advisor's 0-lock plan, sampled with another seed
      const top = result.fresh[0];
      const advice = await rerollAdvice(session, top.characterId, top.slot, {}, quiet);
      const zero = advice.plans.find((p) => p.locks === 0)!;
      expect(Math.abs(top.pKeep - zero.pImprove)).toBeLessThan(0.02);
      expect(top.expectedGain).toBeCloseTo(zero.expectedGain, 2);
      expect(Math.abs(top.expectedGain - zero.expectedGain) / zero.expectedGain).toBeLessThan(0.06);
      // deterministic
      const again = await tunerCandidates(createLabSession(clone()), { freshSlots: 3 }, quiet);
      expect(again.fresh).toEqual(result.fresh);
      expect(again.candidates).toEqual(result.candidates);
    },
    T,
  );

  it("prices a fresh echo with all five lines, even against an unfinished echo in the slot", async () => {
    // every line adds 1 % of the build, whatever it is: a fresh echo's five lines beat the slot's one line by 4 %
    const scoreLines = async (list: Array<{ key: string; value: number }>) => 1000 * (1 + 0.01 * list.length);
    const current = [{ field: 1, key: "CritRate", value: 6.3 }];
    const deps = { scoreLines, base: 1000, canRepeat: true, samples: 50, seed: "fresh-five" };
    const five = await additivePlan([], current, { ...deps, draw: 5 });
    expect(five.every(([g]) => Math.abs(g - 0.04) < 1e-9)).toBe(true);
    // the re-roll advisor's own use (no draw): one line re-rolled for one line
    const reroll = await additivePlan([], current, deps);
    expect(reroll.every(([g]) => Math.abs(g) < 1e-9)).toBe(true);
  });

  it(
    "runs as a worker job, cached for the same account",
    async () => {
      const posts: EchoLabResponse[] = [];
      const host = createEchoLabHost((m) => posts.push(m), { yieldMs: 0 });
      await host.onMessage({ type: "run", id: 1, job: { kind: "tunerPlan", options: { freshSlots: 1 } }, account: clone() });
      await host.onMessage({ type: "run", id: 2, job: { kind: "tunerPlan", options: { freshSlots: 1 } }, account: clone() });
      const results = posts.filter((m) => m.type === "result") as Array<Extract<EchoLabResponse, { type: "result" }>>;
      expect(results.map((r) => r.cached)).toEqual([false, true]);
      expect((results[0].result as { candidates: unknown[] }).candidates).toHaveLength(2);
      expect(posts.some((m) => m.type === "progress")).toBe(true);
    },
    T,
  );
});

describe("How good is this roll", () => {
  it(
    "places a worn five-line echo among every +25 echo of its kind, by damage, the same answer every run",
    async () => {
      const session = createLabSession(account);
      const q = await rollQuality(session, "8xziafu5n3", null, {}, quiet); // Galbrena's main echo, found where it sits
      expect(q).toMatchObject({ characterId: "Galbrena", slot: 1, worn: true, lines: 5, level: 25, method: "monte-carlo", outcomes: 1000 });
      expect(q.percentile).toBeGreaterThan(0);
      expect(q.percentile).toBeLessThan(1);
      expect(q.p10).toBeLessThanOrEqual(q.p50);
      expect(q.p50).toBeLessThanOrEqual(q.p90);
      expect(q.hopeFor).toEqual([]);
      const again = await rollQuality(createLabSession(clone()), "8xziafu5n3", null, {}, quiet);
      expect(again.percentile).toBe(q.percentile);
    },
    T,
  );

  it(
    "rates better lines higher: dead lines near the bottom, top crit rolls near the top",
    async () => {
      const dead = withEcho(account, "8xziafu5n3", (e) => {
        ["DEF", "DEF_FLAT", "HP", "HP_FLAT", "EnergyRegen"].forEach((k, i) => {
          e[`echoSubStatsType${i + 1}`] = k;
          e[`echoSubStatsValue${i + 1}`] = maxRoll(k as never);
        });
      });
      const great = withEcho(account, "8xziafu5n3", (e) => {
        ["CritRate", "CritDMG", "ATK", "ResonanceSkillDMGBonus", "BasicAttackDMGBonus"].forEach((k, i) => {
          e[`echoSubStatsType${i + 1}`] = k;
          e[`echoSubStatsValue${i + 1}`] = maxRoll(k as never);
        });
      });
      const low = await rollQuality(createLabSession(dead), "8xziafu5n3", null, {}, quiet);
      const high = await rollQuality(createLabSession(great), "8xziafu5n3", null, {}, quiet);
      expect(low.percentile).toBeLessThan(0.1);
      expect(high.percentile).toBeGreaterThan(0.95);
    },
    T,
  );

  it(
    "enumerates a one-line echo exactly and lists the lines to hope for, most helpful first",
    async () => {
      const one = withEcho(account, "labtune0003", (e) => {
        e.echoSubStatsType2 = null;
        e.echoSubStatsValue2 = null;
        e.echoSubStatsType3 = null;
        e.echoSubStatsValue3 = null;
      });
      const session = createLabSession(one);
      const q = await rollQuality(session, "labtune0003", { characterId: "Galbrena", slot: 2 }, {}, quiet);
      expect(q).toMatchObject({ worn: false, lines: 1, level: 5, method: "exact" });
      expect(q.outcomes).toBe(outcomeCount([...SUBSTAT_KEYS], 1));
      expect(q.openLines).toBe(12);
      expect(q.deadLines + q.hopeFor.length).toBe(12);
      expect(q.hopeFor.length).toBeGreaterThan(0);
      for (const h of q.hopeFor) {
        expect(h.chance).toBeCloseTo(1 / 12, 12);
        expect(h.bestGain).toBeGreaterThanOrEqual(h.expectedGain - 1e-12);
      }
      for (let i = 1; i < q.hopeFor.length; i++) expect(q.hopeFor[i - 1].expectedGain).toBeGreaterThanOrEqual(q.hopeFor[i].expectedGain);
      // Galbrena scales on ATK: flat DEF adds nothing, so it is never hoped for
      expect(q.hopeFor.some((h) => h.key === "DEF_FLAT")).toBe(false);
      // a top Crit Rate roll is the best single line there is for her
      expect(q.percentile).toBeGreaterThan(0.8);
    },
    T,
  );

  it("says why it cannot rate an echo", async () => {
    const session = createLabSession(account);
    await expect(rollQuality(session, "labnoslot01", null, {}, quiet)).rejects.toThrow(/no build to rate it on/);
    await expect(rollQuality(session, "nope", null, {}, quiet)).rejects.toThrow(/No echo/);
  });

  it("words the percentile plainly, never claiming 100 %", () => {
    expect(ratingOf(0.998)).toMatchObject({ headline: "Top 1%", band: "Excellent roll" });
    expect(ratingOf(0.82)).toMatchObject({ headline: "Better than 82%", band: "Good roll" });
    expect(ratingOf(0.5).band).toBe("Average roll");
    expect(ratingOf(0.2).band).toBe("Below average");
    expect(ratingOf(0.004)).toMatchObject({ headline: "Bottom 1%", band: "Poor roll" });
  });
});

// ── the budget planner (pure) ──

const res = (tuners: number, exp: number) => ({ tuners, exp, shellCredits: exp * 0.1 + (tuners / 10) * 2000 });
function cand(id: string, tuners: number, exp: number, damage: number): TunerCandidate {
  return {
    kind: "spare",
    echoId: id,
    echo: null,
    set: null,
    echoCost: 1,
    main: null,
    rank: 5,
    subs: [],
    lines: 5 - tuners / 10,
    level: 25 - (tuners / 10) * 5,
    characterId: "X",
    name: "X",
    slot: 1,
    replacedEchoId: null,
    replacedEcho: null,
    base: 1_000_000,
    resources: res(tuners, exp),
    expectedGain: damage / 1_000_000,
    expectedDamage: damage,
    pKeep: 0.5,
    p10: 0,
    p50: 0,
    p90: 0,
    method: "exact",
    damagePerTuner: damage / tuners,
  };
}
const freshSlot = { resources: res(50, 142600) } as FreshSlot;

describe("Tuner budget planner", () => {
  const list = [cand("a", 10, 63500, 5000), cand("b", 30, 126100, 9000), cand("c", 20, 103000, 4000), cand("z", 10, 63500, 0)];

  it("remembers only what was typed: whole non-negative numbers, anything else not entered", () => {
    expect(readTunerBudget(null)).toEqual(EMPTY_BUDGET);
    expect(readTunerBudget("{bad")).toEqual(EMPTY_BUDGET);
    expect(readTunerBudget(JSON.stringify({ v: 2, tuners: 5 }))).toEqual(EMPTY_BUDGET);
    const b = normalizeBudget({ tuners: "120", exp: "", weeklyTuners: -3, weeklyExp: 9.7 });
    expect(b).toEqual({ tuners: 120, exp: null, weeklyTuners: null, weeklyExp: 9 });
    expect(readTunerBudget(writeTunerBudget(b))).toEqual(b);
  });

  it("orders by expected damage per Tuner and, with no budget typed, only ranks", () => {
    const plan = planTuners(list, EMPTY_BUDGET);
    expect(plan.steps.map((s) => s.candidate.echoId)).toEqual(["a", "b", "c"]); // 500, 300, 200 per Tuner
    expect(plan.steps.every((s) => s.when.kind === "unbudgeted")).toBe(true);
    expect(plan.notWorth.map((c) => c.echoId)).toEqual(["z"]);
    expect(plan.left.tuners).toBeNull();
    expect(plan.freshTries).toBeNull();
    expect(whenText({ kind: "unbudgeted" })).toBe("");
  });

  it("takes each echo while what is left pays for it, a cheaper one after a dear one that did not fit", () => {
    const plan = planTuners(list, { ...EMPTY_BUDGET, tuners: 35 }, [freshSlot]);
    expect(plan.steps.map((s) => [s.candidate.echoId, s.when.kind])).toEqual([
      ["a", "now"],
      ["b", "later"],
      ["c", "now"],
    ]);
    expect(plan.now).toMatchObject({ count: 2, expectedDamage: 9000 });
    expect(plan.now.resources.tuners).toBe(30);
    expect(plan.left).toEqual({ tuners: 5, exp: null });
    expect(plan.steps[1]).toMatchObject({ shortTuners: 25, shortExp: 0 });
    expect(plan.freshTries).toBe(0);
    expect(plan.weekly).toBe(false);
  });

  it("counts Echo EXP when it is typed", () => {
    const plan = planTuners(list, { ...EMPTY_BUDGET, tuners: 100, exp: 150000 }, [freshSlot]);
    expect(plan.steps.map((s) => s.when.kind)).toEqual(["now", "later", "later"]);
    expect(plan.left).toEqual({ tuners: 90, exp: 86500 });
    expect(plan.steps[1]).toMatchObject({ shortTuners: 0, shortExp: 126100 - 86500 });
    // 90 Tuners would pay for one fresh echo, but 86.5k EXP does not
    expect(plan.freshTries).toBe(0);
    expect(triesCovered(90, null, freshSlot.resources)).toBe(1);
  });

  it("gives the waiting echoes their week from the typed income, in order, and a fresh-echo rate", () => {
    const plan = planTuners(list, { tuners: 10, exp: null, weeklyTuners: 15, weeklyExp: null }, [freshSlot]);
    expect(plan.steps.map((s) => [s.candidate.echoId, s.when])).toEqual([
      ["a", { kind: "now" }],
      ["b", { kind: "week", week: 2 }],
      ["c", { kind: "week", week: 4 }],
    ]);
    expect(plan.freshPerWeek).toBeCloseTo(15 / 50, 12);
    expect(whenText({ kind: "week", week: 2 })).toBe("Week 2");
    // an income too small to reach the next echo within the horizon leaves it "later"
    const slow = planTuners(list, { tuners: 0, exp: null, weeklyTuners: 1, weeklyExp: null });
    expect(slow.steps.map((s) => s.when.kind)).toEqual(WEEKS_AHEAD >= 10 ? ["week", "later", "later"] : ["later", "later", "later"]);
  });
});
