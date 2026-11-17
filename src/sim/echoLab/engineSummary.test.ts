// Wuthering Tools+ Echo Lab — what the calculator's closed Engine view says on its one line.
import { describe, expect, it } from "vitest";
import { engineSummary, type EngineSummaryInput } from "./engineSummary";

const base: EngineSummaryInput = { error: null, ready: true, score: 1.32, erShort: false, reroll: { running: false, done: 5, total: 5 }, pick: "Reminiscence: Kronaclaw", fullEchoes: 5 };
const text = (input: EngineSummaryInput): string =>
  engineSummary(input)
    .map((p) => [p.label, p.value, p.note].filter(Boolean).join(" "))
    .join(" · ");

describe("the closed Engine view's line (engineSummary)", () => {
  it("says the benchmark with its scale and the echo to re-roll first", () => {
    expect(text(base)).toBe("Benchmark 132% (100 % = a realistic spread) · Re-roll first: Reminiscence: Kronaclaw");
    // the figure and the echo's name are the strong parts, each with its label
    expect(engineSummary(base).map((p) => [p.key, p.value])).toEqual([
      ["benchmark", "132%"],
      ["reroll", "Reminiscence: Kronaclaw"],
    ]);
  });

  it("never prints a number of the one-more-roll list: that is Ryan's table on this panel", () => {
    for (const input of [base, { ...base, erShort: true }, { ...base, pick: null }, { ...base, score: null }]) {
      expect(engineSummary(input).map((p) => p.key)).not.toContain("substats");
      expect(text(input)).not.toMatch(/one more roll|Crit DMG|ATK/i);
    }
  });

  it("flags an Energy Regen shortfall as a warning, between the two findings", () => {
    const parts = engineSummary({ ...base, erShort: true });
    expect(parts.map((p) => p.key)).toEqual(["benchmark", "er", "reroll"]);
    expect(parts[1]).toMatchObject({ label: "Energy Regen", value: "short", warn: true });
    expect(parts.filter((p) => p.warn)).toHaveLength(1);
  });

  it("says what it is doing before the numbers are in, and counts the echoes as they are simulated", () => {
    expect(text({ ...base, ready: false, score: null, pick: null })).toBe("Scoring this build on its best rotation…");
    expect(text({ ...base, pick: null, reroll: { running: true, done: 0, total: 5 } })).toContain("Re-roll first: simulating echo 1 of 5");
    expect(text({ ...base, pick: null, reroll: { running: true, done: 4, total: 5 } })).toContain("simulating echo 5 of 5");
    // the count never runs past the total while the last job's result is being stored
    expect(text({ ...base, pick: null, reroll: { running: true, done: 5, total: 5 } })).toContain("simulating echo 5 of 5");
  });

  it("says why there is no pick: nothing worth it, or no echo with five lines", () => {
    expect(text({ ...base, pick: null })).toContain("Re-roll first: no re-roll is worth a Transducer");
    expect(text({ ...base, pick: null, fullEchoes: 0, reroll: { running: false, done: 0, total: 0 } })).toContain("Re-roll first: no echo has all five lines yet");
  });

  it("says so when the build has no benchmark, and shows an error alone", () => {
    expect(text({ ...base, score: null })).toBe("No benchmark for this build · Re-roll first: Reminiscence: Kronaclaw");
    expect(text({ ...base, error: "Equip a weapon to see the engine view." })).toBe("Equip a weapon to see the engine view.");
  });
});
