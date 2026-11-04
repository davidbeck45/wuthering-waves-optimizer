import { describe, expect, it } from "vitest";
import { chancePhrase, chanceText, rangeSentence } from "./format";
import { KILL_LEVELS } from "./killOdds";
import {
  critHit,
  damageRange,
  effectiveHits,
  exactDistribution,
  hasSpread,
  hitFromFigures,
  hitMean,
  hitVariance,
  methodFor,
  momentsOf,
  normalCdf,
  normalCdfSkewed,
  normalInv,
  normalQuantile,
  quantileOfSamples,
  sampleTotals,
  sdOf,
  skewOf,
  type CritHit,
} from "./spread";
import { seededRandom } from "../echoLab/fingerprint";

/** a made-up rotation: `count` hits of mixed sizes at one build's crit (seeded, so the same every run) */
function rotation(count: number, seed = 7, critRate = 62.5, critDmg = 248): Array<{ avg: number; hit: CritHit }> {
  const rng = seededRandom(seed);
  return Array.from({ length: count }, () => {
    const avg = Math.round(2_000 + rng() * 40_000);
    return { avg, hit: critHit(avg, critRate, critDmg) };
  });
}

describe("one hit", () => {
  it("keeps the engine's average exactly, whatever the crit", () => {
    for (const [avg, cr, cd] of [
      [12_345, 62.5, 248],
      [1, 5, 150],
      [987_654_321, 99.9, 312.4],
      [4_321, 100, 250],
      [4_321, 135, 250],
      [800, 0, 250],
      [800, 50, 100],
    ] as const) {
      const h = critHit(avg, cr, cd);
      expect(hitMean(h)).toBeCloseTo(avg, 6);
      expect(h.c).toBeGreaterThanOrEqual(h.n);
    }
  });

  it("is fixed when it cannot crit or always does", () => {
    expect(critHit(800, 0, 250)).toEqual({ n: 800, c: 800, p: 0 });
    expect(critHit(800, null, null)).toEqual({ n: 800, c: 800, p: 0 });
    expect(critHit(800, 50, 100)).toEqual({ n: 800, c: 800, p: 0 });
    const always = critHit(1_000, 120, 250);
    expect(always).toEqual({ n: 400, c: 1_000, p: 1 });
    expect(hitVariance(always)).toBe(0);
  });

  it("reads the chance off the calculator's three figures", () => {
    const h = hitFromFigures(1_000, 2_500, 1_000 + 0.4 * 1_500);
    expect(h.p).toBeCloseTo(0.4, 12);
    expect(hitMean(h)).toBeCloseTo(1_600, 9);
    expect(hitFromFigures(500, 500, 500)).toEqual({ n: 500, c: 500, p: 0 });
  });

  it("analytic: P10 and P50 are the non-crit hit, P90 the crit, and the spread is √(p(1−p))·(c − n)", () => {
    const h: CritHit = { n: 100, c: 250, p: 0.3 };
    const r = damageRange([h]);
    expect(r.method).toBe("exact");
    expect(r.mean).toBeCloseTo(145, 9);
    expect(r.sd).toBeCloseTo(Math.sqrt(0.21) * 150, 9);
    expect([r.p10, r.p50, r.p90]).toEqual([100, 100, 250]);
    // at 50 %: the median is the non-crit hit (P(X ≤ n) = 0.5 reaches 0.5), P90 the crit
    expect(damageRange([{ n: 100, c: 250, p: 0.5 }])).toMatchObject({ p10: 100, p50: 100, p90: 250 });
    // above 90 %: every percentile but P10 crits
    expect(damageRange([{ n: 100, c: 250, p: 0.95 }])).toMatchObject({ p10: 250, p50: 250, p90: 250 });
  });
});

describe("two hits", () => {
  it("analytic: four outcomes, their chances, mean, spread and percentiles", () => {
    const a: CritHit = { n: 100, c: 200, p: 0.5 };
    const b: CritHit = { n: 100, c: 300, p: 0.25 };
    const dist = exactDistribution([a, b]);
    expect(dist).toEqual([
      [200, 0.375],
      [300, 0.375],
      [400, 0.125],
      [500, 0.125],
    ]);
    const r = damageRange([a, b]);
    expect(r.mean).toBeCloseTo(300, 9);
    expect(r.sd).toBeCloseTo(100, 9); // 0.25·100² + 0.1875·200²
    expect([r.p10, r.p50, r.p90]).toEqual([200, 300, 500]);
    // the same by Monte Carlo
    const mc = damageRange([a, b], { method: "monteCarlo", samples: 20_000 });
    expect([mc.p10, mc.p50, mc.p90]).toEqual([200, 300, 500]);
    expect(mc.mean).toBe(r.mean);
  });

  it("a fixed hit just shifts every outcome", () => {
    const r = damageRange([{ n: 100, c: 200, p: 0.5 }, { n: 1_000, c: 1_000, p: 0 }]);
    expect([r.p10, r.p50, r.p90]).toEqual([1_100, 1_100, 1_200]);
    expect(r.rolls).toBe(1);
    expect(r.hits).toBe(2);
  });
});

describe("many hits", () => {
  it("the mean is the sum of the engine's averages", () => {
    const rot = rotation(400);
    const r = damageRange(rot.map((x) => x.hit));
    const sum = rot.reduce((s, x) => s + x.avg, 0);
    expect(Math.abs(r.mean - sum) / sum).toBeLessThan(1e-12);
  });

  it("the normal approximation agrees with a Monte Carlo run of the same hits", () => {
    const hits = rotation(300).map((x) => x.hit);
    const m = momentsOf(hits);
    expect(methodFor(m)).toBe("normal");
    const normal = damageRange(hits);
    const mc = damageRange(hits, { method: "monteCarlo", samples: 20_000, seed: 11 });
    expect(normal.method).toBe("normal");
    for (const k of ["p10", "p50", "p90"] as const) expect(Math.abs(normal[k] - mc[k])).toBeLessThan(0.05 * normal.sd);
    // the Monte Carlo spread matches the analytic one
    const s = sampleTotals(hits, 20_000, 11);
    const mean = s.reduce((a, b) => a + b, 0) / s.length;
    const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length);
    expect(Math.abs(mean - normal.mean)).toBeLessThan(0.03 * normal.sd);
    expect(Math.abs(sd / normal.sd - 1)).toBeLessThan(0.03);
  });

  it("exact enumeration and Monte Carlo agree on a dozen hits", () => {
    const hits = rotation(12, 3).map((x) => x.hit);
    const exact = damageRange(hits);
    expect(exact.method).toBe("exact");
    const mc = damageRange(hits, { method: "monteCarlo", samples: 40_000, seed: 5 });
    for (const k of ["p10", "p50", "p90"] as const) expect(Math.abs(exact[k] - mc[k])).toBeLessThan(0.15 * exact.sd);
  });

  it("a total ruled by a few big hits is not treated as a bell curve", () => {
    const small = rotation(200).map((x) => x.hit);
    const nukes = [critHit(5_000_000, 30, 250), critHit(4_000_000, 30, 250), critHit(4_500_000, 30, 250)];
    const m = momentsOf([...small, ...nukes]);
    expect(effectiveHits(m)).toBeLessThan(5);
    expect(methodFor(m)).toBe("monteCarlo");
    // and a few hundred alike is
    expect(methodFor(momentsOf(small))).toBe("normal");
    expect(methodFor(momentsOf(small.slice(0, 10)))).toBe("exact");
  });

  it("Monte Carlo is deterministic per seed", () => {
    const hits = rotation(50).map((x) => x.hit);
    expect(Array.from(sampleTotals(hits, 500, 42))).toEqual(Array.from(sampleTotals(hits, 500, 42)));
    expect(Array.from(sampleTotals(hits, 500, 42))).not.toEqual(Array.from(sampleTotals(hits, 500, 43)));
    expect(damageRange(hits, { method: "monteCarlo" })).toEqual(damageRange(hits, { method: "monteCarlo" }));
  });

  it("scales every figure (damage → DPS)", () => {
    const hits = rotation(100).map((x) => x.hit);
    const r = damageRange(hits);
    const dps = damageRange(hits, { scale: 1 / 25 });
    for (const k of ["mean", "sd", "p10", "p50", "p90"] as const) expect(dps[k]).toBeCloseTo(r[k] / 25, 6);
  });

  it("Crit Rate at 100 % or 0 % leaves no spread worth a line", () => {
    const always = damageRange(rotation(50, 1, 100, 250).map((x) => x.hit));
    expect(always.sd).toBe(0);
    expect(hasSpread(always)).toBe(false);
    expect(rangeSentence(always, String)).toBeNull();
    const some = damageRange(rotation(50).map((x) => x.hit));
    expect(hasSpread(some)).toBe(true);
  });
});

describe("the normal pieces", () => {
  it("Φ and Φ⁻¹", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 7);
    expect(normalCdf(1.2815515655446004)).toBeCloseTo(0.9, 6);
    expect(normalCdf(-1.959963984540054)).toBeCloseTo(0.025, 6);
    for (const p of [0.001, 0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99, 0.999]) expect(normalCdf(normalInv(p))).toBeCloseTo(p, 6);
    expect(normalCdfSkewed(10, 10, 2, 0)).toBeCloseTo(0.5, 7);
    expect(normalQuantile(0.5, 10, 2, 0)).toBeCloseTo(10, 9);
    // a right skew moves the median below the mean
    expect(normalQuantile(0.5, 10, 2, 0.3)).toBeLessThan(10);
  });

  it("skew and spread of a sum", () => {
    const m = momentsOf([{ n: 100, c: 300, p: 0.25 }]);
    expect(sdOf(m)).toBeCloseTo(Math.sqrt(0.1875) * 200, 9);
    // a rare crit is skewed right
    expect(skewOf(m)).toBeGreaterThan(0);
    expect(quantileOfSamples([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.1)).toBe(1);
    expect(quantileOfSamples([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBe(9);
  });
});

describe("plain words", () => {
  it("a range and a chance", () => {
    expect(rangeSentence({ mean: 8.1e6, p10: 7.6e6, p90: 8.6e6 }, (n) => `${(n / 1e6).toFixed(1)}M`)).toBe("8 runs in 10 land between 7.6M and 8.6M");
    expect(rangeSentence({ mean: 100, p10: 100, p90: 100 }, String)).toBeNull();
    // a spread big enough to show, but both ends read the same once formatted: "between 1.01M and 1.01M" says nothing
    expect(rangeSentence({ mean: 1_007_500, p10: 1_005_100, p90: 1_011_000 }, (n) => `${(n / 1e6).toFixed(2)}M`)).toBeNull();
    expect(chanceText(0.004)).toBe("< 1 %");
    expect(chanceText(0.62)).toBe("62 %");
    expect(chanceText(0.9996)).toBe("> 99 %");
    expect(chanceText(null)).toBe("—");
    // 0.995 is a kept level (`chanceBy` returns it exactly) and rounds to 100: never a false 100 %
    expect(KILL_LEVELS).toContain(0.995);
    expect(chanceText(0.995)).toBe("> 99 %");
    expect(chancePhrase(0.995)).toBe("in more than 99 runs in 100");
    expect(chanceText(0.9949)).toBe("99 %");
    expect(chancePhrase(0.5)).toBe("in 50 % of runs");
    expect(chancePhrase(1)).toBe("in more than 99 runs in 100");
  });
});
