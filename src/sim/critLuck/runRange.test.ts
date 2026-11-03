import { describe, expect, it } from "vitest";
import fixture from "../engine/__fixtures__/runLite.json";
import type { RunLite } from "../engine/rileyRun";
import { runRange } from "./runRange";
import { rangeSentence } from "./format";

const run = fixture as unknown as RunLite;

describe("a wuwa_calc run's crit luck", () => {
  it("keeps the run's DPS as its mean and spreads around it", () => {
    const r = runRange(run)!;
    expect(r).not.toBeNull();
    expect(r.mean).toBeCloseTo(run.total, 6);
    expect(r.p10).toBeLessThan(run.total);
    expect(r.p90).toBeGreaterThan(run.total);
    expect(r.hits).toBe(run.hits.length);
    // Iuno sits past 100 % Crit Rate on the synthetic account: her hits are certain, so not every hit rolls
    expect(r.rolls).toBeLessThan(r.hits);
    expect(rangeSentence(r, (n) => `${Math.round(n)}`, "DPS")).toMatch(/^8 runs in 10 land between \d+ and \d+ DPS$/);
    // deterministic
    expect(runRange(run)).toEqual(r);
  });

  it("is null for a run without per-hit crit", () => {
    const { hitCrit: _drop, ...bare } = run;
    expect(runRange(bare)).toBeNull();
    expect(runRange({ ...run, hitCrit: run.hitCrit!.slice(1) })).toBeNull();
  });
});
