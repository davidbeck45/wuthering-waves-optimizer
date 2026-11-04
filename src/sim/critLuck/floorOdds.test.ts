import { describe, expect, it } from "vitest";
import { damageAt } from "../endgame/killTime";
import { floorOdds, planLuck, plannedChance } from "./floorOdds";
import { killOdds, type SpreadCurve } from "./killOdds";

/** a hit of 20k every 0.1 s at 60 % / 250 %, opener + 3 loops over 100 s */
function fight(): SpreadCurve {
  const critHits: NonNullable<SpreadCurve["critHits"]> = [];
  const points: Array<[number, number]> = [];
  let sum = 0;
  for (let f = 10; f <= 6000; f += 6) {
    critHits.push([f, 0, 20_000, 60, 250]);
    sum += 20_000;
    points.push([f, sum]);
  }
  const per = critHits.filter(([f]) => f / 60 >= 75).reduce((s, h) => s + h[2], 0);
  return { seconds: 100, sectionSeconds: [25, 25, 25, 25], sectionTotals: [per, per, per, per], points, critHits };
}

describe("a floor's crit luck", () => {
  const curve = fight();
  // the average kill at 150 s left (a Hazard floor's crest 2 boundary exactly), goals as seconds left
  const goals = [90, 150, 180];
  const hp = damageAt(curve, 90);
  const odds = killOdds([{ hp, curve }])!;

  it("reads each crest's chance off the kill-time distribution, ascending crest", () => {
    // at 90 s used: crest 1 (≥90 s left: by 210 s) and the clear are sure, crest 2 (by 150 s) too, crest 3 (by 120 s) too
    const sure = floorOdds(goals, odds)!;
    expect(sure.crests.map((c) => c.crest)).toEqual([1, 2, 3]);
    expect(sure.sure).toBe(true);
    expect(sure.clearText).toBe("> 99 %");
    // at 1.5× pace the kill is at ~135 s: crest 3 (by 120 s) gone, crest 2 (by 150 s) sure
    const paced = floorOdds(goals, odds, 1.5)!;
    expect(paced.crests[2]!.chance).toBeLessThan(0.01);
    expect(paced.crests[1]!.chance).toBeGreaterThan(0.99);
    expect(paced.sure).toBe(false);
    // at 300 / 180 × … pace the kill sits right on the crest-3 boundary (120 s): about half the runs
    const edge = floorOdds(goals, odds, 120 / 90)!;
    expect(edge.crests[2]!.chance).toBeGreaterThan(0.4);
    expect(edge.crests[2]!.chance).toBeLessThan(0.6);
    expect(edge.range![0]).toBeLessThan(120);
    expect(edge.range![1]).toBeGreaterThan(120);
  });

  it("a just-clear-it crest is the clear itself; a hopeless floor says so", () => {
    const side = floorOdds([0, 120, 180], odds)!;
    expect(side.crests[0]!.chance).toBe(side.clear);
    const far = floorOdds(goals, killOdds([{ hp: hp * 10, curve }])!)!;
    expect(far.hopeless).toBe(true);
    expect(far.range).toBeNull();
    expect(floorOdds(goals, undefined)).toBeNull();
  });

  it("never names a finish past the clock: at a slow pace the 90th percentile outruns 5:00, so there is no range to give", () => {
    // the kill sits at ~90 s of the sim: ×3.2 finishes inside the clock, ×3.3 clears ~79 % of runs, ×3.4 ~6 %
    expect(floorOdds(goals, odds, 3.2)!.range![1]).toBeLessThanOrEqual(300);
    for (const pace of [3.3, 3.4]) {
      const o = floorOdds(goals, odds, pace)!;
      expect(o.clear).toBeLessThan(0.9);
      expect(o.hopeless).toBe(false);
      expect(o.range).toBeNull();
    }
  });

  it("a plan's stages: the chance of its planned crest, all of them together, and the crests on average", () => {
    expect(plannedChance(goals, 3, odds, 120 / 90)!).toBeCloseTo(floorOdds(goals, odds, 120 / 90)!.crests[2]!.chance, 12);
    expect(plannedChance(goals, 0, odds)).toBeNull();
    const luck = planLuck([
      { goals, crests: 3, odds, pace: 120 / 90, timed: true },
      { goals, crests: 2, odds, pace: 1.5, timed: true },
      { goals: [0, 90, 150], crests: 3, odds: null, timed: false },
    ])!;
    const a = floorOdds(goals, odds, 120 / 90)!;
    const b = floorOdds(goals, odds, 1.5)!;
    expect(luck.all).toBeCloseTo(a.crests[2]!.chance * b.crests[1]!.chance, 12);
    expect(luck.expected).toBeCloseTo(a.crests.reduce((s, c) => s + c.chance, 0) + b.crests.reduce((s, c) => s + c.chance, 0) + 3, 9);
    expect(luck.stages).toBe(2);
    // a timed stage planned at a crest without odds: no plan figure at all (never a made-up one)
    expect(planLuck([{ goals, crests: 1, odds: null, timed: true }])).toBeNull();
    // nothing timed planned at a crest: no all-together chance, the average still counts a lucky crest
    const none = planLuck([{ goals, crests: 0, odds, pace: 120 / 90, timed: true }])!;
    expect(none.all).toBeNull();
    expect(none.expected).toBeCloseTo(a.crests.reduce((s, c) => s + c.chance, 0), 9);
  });
});
