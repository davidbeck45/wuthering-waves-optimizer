import { describe, it, expect } from "vitest";
import { createLayoutCheck, readsAsPanel } from "../../src/scanner/layoutCheck";

describe("readsAsPanel", () => {
  it("accepts a resolved name or a known fixed secondary stat", () => {
    expect(readsAsPanel("", true)).toBe(true);
    expect(readsAsPanel("HP 2280", false)).toBe(true);
    expect(readsAsPanel("ATK 100", false)).toBe(true);
    expect(readsAsPanel("ATK 150", false)).toBe(true);
  });

  it("rejects garbage with no resolved name", () => {
    expect(readsAsPanel("", false)).toBe(false);
    expect(readsAsPanel("Lv. 25 ~~", false)).toBe(false);
  });
});

describe("createLayoutCheck", () => {
  it("confirms the current layout when it reads, ignoring alternates", () => {
    const check = createLayoutCheck(3);
    expect(check.observe(true, [true])).toEqual({ kind: "confirmed" });
    expect(check.settled).toBe(true);
    expect(check.observe(false, [true])).toEqual({ kind: "settled" });
  });

  it("adopts the first alternate that reads when the current layout doesn't", () => {
    const check = createLayoutCheck(3);
    expect(check.observe(false, [false, true])).toEqual({ kind: "adopt", index: 1 });
    expect(check.settled).toBe(true);
  });

  it("flags a mismatch once, after maxCandidates misses in a row", () => {
    const check = createLayoutCheck(3);
    expect(check.observe(false, [false])).toEqual({ kind: "pending" });
    expect(check.observe(false, [false])).toEqual({ kind: "pending" });
    expect(check.observe(false, [false])).toEqual({ kind: "mismatch" });
    expect(check.observe(false, [false])).toEqual({ kind: "settled" });
  });

  it("behaves like the old check with no alternates", () => {
    const check = createLayoutCheck(3);
    expect(check.observe(false)).toEqual({ kind: "pending" });
    expect(check.observe(false)).toEqual({ kind: "pending" });
    expect(check.observe(false)).toEqual({ kind: "mismatch" });
  });

  it("doesn't flag a single garbled read followed by a good one", () => {
    const check = createLayoutCheck(3);
    expect(check.observe(false)).toEqual({ kind: "pending" });
    expect(check.observe(true)).toEqual({ kind: "confirmed" });
  });
});
