// Wuthering Tools+: the /rankings Compare column as "% of the top row".
import { describe, expect, it } from "vitest";
import { compareScale, shareText, shareWidth, strengthOf, teamFigureOf } from "./compareColumn";

describe("rankings compare column", () => {
  it("computes the team figure the way Riley's table does (DPR per rotation, DPS over the time)", () => {
    const run = { sectionTotals: [2_659_176, 2_720_701, 2_720_701, 2_720_701], seconds: 102.4 };
    expect(teamFigureOf(run, "dpr")).toBe(Math.floor(10_821_279 / 4));
    expect(teamFigureOf(run, "dps")).toBe(Math.floor(10_821_279 / 102.4));
    expect(teamFigureOf({ sectionTotals: [], seconds: 1 }, "dpr")).toBe(0);
  });

  it("measures every row against the top one, or against the pinned row", () => {
    const totals = [2_705_319, 2_647_816, 1_000_000];
    const scale = compareScale(totals);
    expect(scale).toEqual({ top: 2_705_319, low: 1_000_000, ref: 2_705_319, pinned: false });
    expect(shareText(2_705_319, scale.ref)).toBe("100.0%");
    expect(shareText(2_647_816, scale.ref)).toBe("97.8%"); // 97.87… truncated, never rounded up
    const pinned = compareScale(totals, 1_000_000);
    expect(pinned).toMatchObject({ ref: 1_000_000, pinned: true });
    expect(shareText(2_705_319, pinned.ref)).toBe("270.5%");
    expect(shareText(12_045_000, 1_000_000)).toBe("1,204.5%");
    expect(shareText(5, 0)).toBe("");
  });

  it("clamps the share's bar width and eases the rank into a neutral → accent strength", () => {
    expect(shareWidth(50, 100)).toBe(0.5);
    expect(shareWidth(150, 100)).toBe(1);
    const scale = compareScale([100, 80, 50]);
    expect(strengthOf(100, scale)).toBe(1);
    expect(strengthOf(50, scale)).toBe(0);
    expect(strengthOf(75, scale)).toBeCloseTo(0.125); // eased: half way up reads an eighth
    // a one-row table is the top row
    expect(strengthOf(10, compareScale([10]))).toBe(1);
  });
});
