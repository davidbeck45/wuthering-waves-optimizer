// Wuthering Tools+ Echo Lab — the words the Transducer ranking prints (transducerCli.ts): a figure a player reads as a
// promise must be one.
import { describe, expect, it } from "vitest";
import type { LockPlan, RerollAdviceResult } from "./rerollAdvice";
import { chancePct, chanceText, goodTryText, NO_GATE_NEED, planReport, strongestTeamNeeds } from "./transducerCli";
import { goodTry } from "./transducerRank";

const plan = (pImprove: number, p90: number): LockPlan => ({
  locks: 2,
  lockedFields: [1, 2],
  rerolledFields: [3, 4, 5],
  cost: 1,
  method: "counted",
  pImprove,
  expectedGain: 0.0006,
  expectedChange: -0.02,
  gainPerTransducer: 0.0006,
  transducersPerSuccess: 1 / pImprove,
  p10: -0.05,
  p50: -0.02,
  p90,
  bestOf: [0.0006],
  top: { gain: 0.05, lines: [], chance: 1e-5 },
});
const advice = { lines: [1, 2, 3, 4, 5].map((field) => ({ field, key: "HP", value: 8.6 })), base: 1000 } as unknown as RerollAdviceResult;

describe("A good try", () => {
  it("is what the best one try in ten gains, and nothing is promised when fewer than one in ten beat the echo", () => {
    // Carlotta's Chop Chop on the account this was found on: 8 % of tries beat it, and the table said "+0.00%"
    expect(goodTry(plan(0.08, -0.001))).toBeNull();
    expect(planReport(advice, plan(0.08, -0.001)).goodTryPct).toBeNull();
    expect(goodTryText(null)).toBe("fewer than one try in ten beats the lines it has");
    expect(goodTry(plan(0.3, 0.012))).toBe(0.012);
    expect(planReport(advice, plan(0.3, 0.012)).goodTryPct).toBe(1.2);
    expect(goodTryText(1.2)).toBe("a good try (one in ten) gains +1.20% or more");
  });
});

describe("A chance", () => {
  it("never reads as certain or impossible when it is not", () => {
    // 12 tries at 61 % each: 1 − 0.39¹² = 99.99 %, and the spend table said "100%" chance of a better echo
    const pct = chancePct(1 - 0.39 ** 12);
    expect(pct).toBe(99.99);
    expect(chancePct(1)).toBe(100);
    expect(chancePct(0.00001)).toBe(0.01);
    expect(chanceText(pct)).toBe("over 99%");
    expect(chanceText(100)).toBe("100%");
    expect(chanceText(0.3)).toBe("under 1%");
    expect(chanceText(0)).toBe("0%");
    expect(chanceText(61.4)).toBe("61%");
  });
});


describe("An Energy Regen need for a resonator in no saved team", () => {
  const team = (name: string, total: number, checks: Array<[string, number | null]>, status = "ok") => ({ name, measure: { status, energy: { total } }, checks: checks.map(([characterId, need]) => ({ characterId, need })) });

  it("is their need in the strongest team that fields them, by that team's damage per second", () => {
    const needs = strongestTeamNeeds([
      team("Weak · Carry", 100_000, [["Carry", 131], ["Weak", 150]]),
      team("Strong · Carry", 250_000, [["Carry", 118.2], ["Strong", 240]]),
      team("Mid · Carry", 200_000, [["Carry", 105], ["Mid", null]]),
    ]);
    expect(needs.get("Carry")).toEqual({ need: 118.2, team: "Strong · Carry", dps: 250_000 });
    expect(needs.get("Weak")).toEqual({ need: 150, team: "Weak · Carry", dps: 100_000 });
    // nothing Mid presses in that team waits on energy: a need the app knows, and it is none
    expect(needs.get("Mid")).toEqual({ need: null, team: "Mid · Carry", dps: 200_000 });
    expect(NO_GATE_NEED).toBe(100);
  });

  it("skips a team that could not be measured, and keeps the first of two equally strong teams", () => {
    const needs = strongestTeamNeeds([
      team("Unmeasured", 900_000, [["Carry", 300]], "notMeasured"),
      { name: "No checks", measure: { status: "ok", energy: { total: 800_000 } }, checks: null },
      team("First", 250_000, [["Carry", 110]]),
      team("Second", 250_000, [["Carry", 140]]),
    ]);
    expect(needs.get("Carry")).toEqual({ need: 110, team: "First", dps: 250_000 });
    expect(strongestTeamNeeds([]).size).toBe(0);
  });
});
