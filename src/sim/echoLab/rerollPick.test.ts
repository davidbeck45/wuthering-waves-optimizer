// Wuthering Tools+ Echo Lab — the re-roll card's chips follow the plan it headlines (2026-11-02 audit D8).
import { describe, expect, it } from "vitest";
import { planChips, rerolledLines } from "./rerollPick";
import { planLinesText } from "./echoLabView";

// Aemeath's Sigillum as the audit saw it: by worth against a fresh roll only Heavy (rank 1) should go, but locking four
// costs 3 Transducers and three cost 2, so the plan that pays best per Transducer re-rolls two lines
const lines = [
  { field: 1, key: "CritRate", value: 8.7, rank: 5, advice: "lock" },
  { field: 2, key: "CritDMG", value: 17.4, rank: 4, advice: "lock" },
  { field: 3, key: "HeavyAttackDMGBonus", value: 8.6, rank: 1, advice: "reroll" },
  { field: 4, key: "ATK", value: 10.9, rank: 2, advice: "lock" },
  { field: 5, key: "ResonanceLiberationDMGBonus", value: 9.4, rank: 3, advice: "lock" },
];
const lock3 = { locks: 3, rerolledFields: [4, 3] };

describe("re-roll chips from the plan", () => {
  it("marks exactly the plan's re-rolled lines, numbered by rank, and locks the rest", () => {
    const chips = planChips(lines, lock3);
    expect([...chips.entries()].map(([f, c]) => [f, c.chip, c.order])).toEqual([
      [1, "lock", null],
      [2, "lock", null],
      [3, "reroll", 1],
      [4, "reroll", 2],
      [5, "lock", null],
    ]);
    // as many Re-roll chips as the headline says it re-rolls, as many Lock chips as it locks
    expect([...chips.values()].filter((c) => c.chip === "reroll")).toHaveLength(lock3.rerolledFields.length);
    expect([...chips.values()].filter((c) => c.chip === "lock")).toHaveLength(lock3.locks);
    expect(rerolledLines(lines, lock3).map((l) => l.field)).toEqual([3, 4]);
    expect(planLinesText(lock3, lines)).toBe("Re-roll Heavy 8.6% and ATK% 10.9%; lock the other 3.");
  });

  it("reads Keep on every line when no plan is worth Transducers, and re-roll all when nothing is locked", () => {
    expect([...planChips(lines, null).values()].every((c) => c.chip === "keep" && c.order === null)).toBe(true);
    const all = { locks: 0, rerolledFields: [1, 2, 3, 4, 5] };
    expect([...planChips(lines, all).values()].map((c) => c.order)).toEqual([5, 4, 1, 2, 3]);
    expect(planLinesText(all, lines)).toMatch(/^Re-roll Heavy 8\.6%, ATK% 10\.9%, Lib 9\.4%, CD 17\.4% and CR 8\.7%\.$/);
  });
});
