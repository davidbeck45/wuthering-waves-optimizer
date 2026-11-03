import { describe, expect, it } from "vitest";
import { damageAt, killTime } from "../endgame/killTime";
import { chanceBy, killAtLevel, killOdds, KILL_LEVELS, type SpreadCurve } from "./killOdds";

/** A made-up fight: a hit of `avg` every `every` frames from frame 10, opener + 3 equal loops over `seconds`; each hit
 *  crits at `cr` % for `cd` % (every `bigEvery`-th hit is `big` times larger). */
function fight(o: { avg?: number; every?: number; seconds?: number; cr?: number; cd?: number; big?: number; bigEvery?: number } = {}): SpreadCurve {
  const avg = o.avg ?? 20_000, every = o.every ?? 6, seconds = o.seconds ?? 100, cr = o.cr ?? 60, cd = o.cd ?? 250;
  const end = Math.round(seconds * 60);
  const critHits: NonNullable<SpreadCurve["critHits"]> = [];
  const points: Array<[number, number]> = [];
  let sum = 0;
  let n = 0;
  for (let f = 10; f <= end; f += every, n++) {
    const a = o.big && o.bigEvery && n % o.bigEvery === 0 ? avg * o.big : avg;
    critHits.push([f, 0, a, cr, cd]);
    sum += a;
    points.push([f, sum]);
  }
  const loop = seconds / 4;
  // per section: the damage landed in its frames (the loops are alike, so the last loop's DPS is the steady one)
  const totals = [0, 1, 2, 3].map((k) => critHits.filter(([f]) => f / 60 >= k * loop && (k === 3 ? f / 60 <= seconds : f / 60 < (k + 1) * loop)).reduce((s, h) => s + h[2], 0));
  return { seconds, sectionSeconds: [loop, loop, loop, loop], sectionTotals: totals, points, critHits };
}

describe("kill odds off the damage curve", () => {
  it("a floor whose HP is exactly the average damage by a second clears by then about half the time", () => {
    const curve = fight();
    for (const t of [12, 30, 55.5]) {
      const hp = damageAt(curve, t);
      const odds = killOdds([{ hp, curve }])!;
      expect(odds.method).toBe("normal");
      const p = chanceBy(odds, t)!;
      expect(p).toBeGreaterThan(0.42);
      expect(p).toBeLessThan(0.58);
      // the median kill is the average path's kill
      const kill = killTime([{ hp, curve }]).seconds!;
      expect(Math.abs(killAtLevel(odds, 0.5)! - kill)).toBeLessThanOrEqual(0.2);
    }
  });

  it("more margin, more chance: well under the average time it fails, well over it clears", () => {
    const curve = fight();
    const hp = damageAt(curve, 30);
    const odds = killOdds([{ hp, curve }])!;
    expect(chanceBy(odds, 25)).toBeLessThan(0.01);
    expect(chanceBy(odds, 35)).toBeGreaterThan(0.99);
    // the CDF never goes down
    let prev = -1;
    for (let t = 20; t <= 40; t += 0.1) {
      const p = chanceBy(odds, t)!;
      expect(p).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = p;
    }
  });

  it("no crit in doubt: the kill is the average one, every time", () => {
    for (const cr of [0, 100]) {
      const curve = fight({ cr });
      const hp = damageAt(curve, 30);
      const odds = killOdds([{ hp, curve }])!;
      const kill = killTime([{ hp, curve }]).seconds!;
      expect(chanceBy(odds, kill - 0.2)).toBe(0);
      expect(chanceBy(odds, kill + 0.01)).toBe(1);
    }
  });

  it("the normal answer matches a seeded Monte Carlo of the same hits", () => {
    const curve = fight();
    const hp = damageAt(curve, 40);
    const normal = killOdds([{ hp, curve }])!;
    const mc = killOdds([{ hp, curve }], undefined, { method: "monteCarlo", samples: 6000, seed: 3 })!;
    expect(mc.method).toBe("monteCarlo");
    for (const level of [0.1, 0.5, 0.9]) expect(Math.abs(killAtLevel(normal, level)! - killAtLevel(mc, level)!)).toBeLessThanOrEqual(0.25);
  });

  it("two HP segments in a row: the second starts where the first fell, by either method", () => {
    const a = fight();
    const b = fight({ avg: 14_000 }); // the second boss resists more
    const segs = [
      { hp: damageAt(a, 20), curve: a },
      { hp: damageAt(b, 45) - damageAt(b, 20), curve: b },
    ];
    const det = killTime(segs).seconds!;
    const normal = killOdds(segs)!;
    const mc = killOdds(segs, undefined, { method: "monteCarlo", samples: 6000, seed: 9 })!;
    expect(Math.abs(killAtLevel(normal, 0.5)! - det)).toBeLessThanOrEqual(0.3);
    for (const level of [0.1, 0.5, 0.9]) expect(Math.abs(killAtLevel(normal, level)! - killAtLevel(mc, level)!)).toBeLessThanOrEqual(0.3);
    // two rolls of the dice spread wider than one
    const one = killOdds([{ hp: damageAt(a, 45), curve: a }])!;
    expect(killAtLevel(normal, 0.9)! - killAtLevel(normal, 0.1)!).toBeGreaterThan(0);
    expect(killAtLevel(one, 0.9)! - killAtLevel(one, 0.1)!).toBeGreaterThan(0);
  });

  it("past the end of the run: the median follows the extrapolated kill, and a ramp keeps it honest", () => {
    const curve = fight({ seconds: 100 });
    const hp = damageAt(curve, 100) * 1.6;
    const det = killTime([{ hp, curve }]).seconds!;
    expect(det).toBeGreaterThan(100);
    const odds = killOdds([{ hp, curve }])!;
    expect(Math.abs(killAtLevel(odds, 0.5)! - det)).toBeLessThanOrEqual(0.3);
    const ramp = (t: number): number => 1 + Math.min(0.5, Math.max(0, t - 60) / 100);
    const detRamp = killTime([{ hp, curve }], ramp).seconds!;
    const oddsRamp = killOdds([{ hp, curve }], ramp)!;
    expect(Math.abs(killAtLevel(oddsRamp, 0.5)! - detRamp)).toBeLessThanOrEqual(0.3);
    const mc = killOdds([{ hp, curve }], undefined, { method: "monteCarlo", samples: 4000, seed: 1 })!;
    for (const level of [0.1, 0.5, 0.9]) expect(Math.abs(killAtLevel(odds, level)! - killAtLevel(mc, level)!)).toBeLessThanOrEqual(0.6);
  });

  it("a floor out of reach never clears; the clock's end caps the distribution", () => {
    const curve = fight({ seconds: 100 });
    const odds = killOdds([{ hp: damageAt(curve, 100) * 10, curve }])!;
    expect(odds.q.every((x) => x === null)).toBe(true);
    expect(chanceBy(odds, 300)).toBe(0);
  });

  it("a kill ruled by a few huge hits plays those out exactly, and agrees with Monte Carlo", () => {
    const curve = fight({ every: 30, avg: 5_000, big: 300, bigEvery: 40, cr: 40, cd: 300 });
    for (const t of [25, 40, 61]) {
      const hp = damageAt(curve, t);
      const mixed = killOdds([{ hp, curve }])!;
      expect(mixed.method).toBe("mixture");
      const normal = killOdds([{ hp, curve }], undefined, { method: "normal" })!;
      const mc = killOdds([{ hp, curve }], undefined, { method: "monteCarlo", samples: 8000, seed: 4 })!;
      for (const x of [t - 5, t, t + 5]) expect(Math.abs(chanceBy(mixed, x)! - chanceBy(mc, x)!)).toBeLessThan(0.03);
      // here the plain bell curve is off by more than that somewhere
      expect(Math.max(...[t - 5, t, t + 5].map((x) => Math.abs(chanceBy(normal, x)! - chanceBy(mc, x)!)))).toBeGreaterThan(0.03);
    }
  });

  it("past the end of the run, Monte Carlo reads the same extrapolated spread as the other methods (a lumpy loop too)", () => {
    // one huge hit late in each loop: replaying the loop's hits past the run put every kill on the next huge hit, seconds
    // off the verdict's average kill (on the real t404 curve a two-segment floor read < 1 % at the average kill + 3 s)
    const curve = fight({ every: 30, avg: 5_000, big: 300, bigEvery: 40, cr: 40, cd: 300 });
    const hp = damageAt(curve, 100) * 1.4;
    const det = killTime([{ hp, curve }]).seconds!;
    expect(det).toBeGreaterThan(130);
    const one = killOdds([{ hp, curve }])!;
    const mc = killOdds([{ hp, curve }], undefined, { method: "monteCarlo", samples: 4000, seed: 6 })!;
    for (const x of [det - 6, det, det + 6]) expect(Math.abs(chanceBy(mc, x)! - chanceBy(one, x)!), `read at ${x} s`).toBeLessThan(0.05);
    // two HP segments, the second on it (lumpy, so the default is Monte Carlo): the median kill stays on the average one,
    // and the chances on the chained normal's (the old replay read 66 % at the average kill, 140 s for the median)
    const smooth = fight();
    const segs = [
      { hp: damageAt(smooth, 30), curve: smooth },
      { hp: hp - damageAt(curve, 30), curve },
    ];
    const two = killOdds(segs, undefined, { seed: "two" })!;
    expect(two.method).toBe("monteCarlo");
    const chained = killOdds(segs, undefined, { method: "normal" })!;
    const det2 = killTime(segs).seconds!;
    expect(det2).toBeGreaterThan(130);
    expect(Math.abs(killAtLevel(two, 0.5)! - det2)).toBeLessThan(2);
    for (const x of [det2 - 6, det2, det2 + 6]) expect(Math.abs(chanceBy(two, x)! - chanceBy(chained, x)!), `two segments, read at ${x} s`).toBeLessThan(0.05);
  });

  it("several lumpy segments go to Monte Carlo, deterministic per seed", () => {
    const a = fight({ every: 30, avg: 5_000, big: 300, bigEvery: 40, cr: 40, cd: 300 });
    const segs = [
      { hp: damageAt(a, 20), curve: a },
      { hp: damageAt(a, 50) - damageAt(a, 20), curve: a },
    ];
    const x = killOdds(segs, undefined, { seed: "x" })!;
    expect(x.method).toBe("monteCarlo");
    expect(killOdds(segs, undefined, { seed: "x" })).toEqual(x);
  });

  it("at the player's pace the same distribution is read at their speed", () => {
    const curve = fight();
    const hp = damageAt(curve, 30);
    const odds = killOdds([{ hp, curve }])!;
    // 1.5× slower: a 45 s boundary is the sim's 30 s
    expect(chanceBy(odds, 45, 1.5)).toBeCloseTo(chanceBy(odds, 30)!, 9);
    expect(chanceBy(null, 30)).toBeNull();
  });

  it("keeps its levels ascending, out to 1 in 10,000", () => {
    expect(KILL_LEVELS[0]).toBe(0.0001);
    expect(KILL_LEVELS[KILL_LEVELS.length - 1]).toBe(0.9999);
    for (let i = 1; i < KILL_LEVELS.length; i++) expect(KILL_LEVELS[i]!).toBeGreaterThan(KILL_LEVELS[i - 1]!);
    expect(KILL_LEVELS).toContain(0.5);
    expect(KILL_LEVELS).toContain(0.1);
    expect(KILL_LEVELS).toContain(0.9);
  });

  it("is null for a curve that carries no crits", () => {
    const { critHits: _drop, ...plain } = fight();
    expect(killOdds([{ hp: 1e6, curve: plain }])).toBeNull();
  });
});
