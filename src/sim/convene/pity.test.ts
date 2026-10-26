// Wuthering Tools+: pity / guarantee / luck on synthetic Convene histories, and the hand-off to upstream's odds
// simulator. The pity numbers are Kuro's (article 758: 5★ by pull 80, 50 on the Beginner banner, 4★-or-better by
// pull 10); the simulator's empirical curve tops out one pull earlier, which the hand-off clamps.
import { describe, expect, it } from "vitest";
import { FIVE_STAR_GUARANTEED_ON_PULL, MAX_PULLS_SINCE_LAST_FIVE, fiveStarChance } from "../../convene/simulateConvene";
import type { ConveneRecord } from "./gachaImport";
import {
  coinFlipPercentile,
  firstApiImportAt,
  historyPity,
  isLikelyTruncated,
  luckPercentile,
  modelAveragePity,
  pityPercentile,
  poolPity,
  recordTimeMs,
  simulatorPrefill,
} from "./pity";
import { CONVENE_POOLS, isStandardFiveStarResonator, poolOf } from "./pools";

/** a run of pulls, one per minute from `start`: n × filler, then the given drop */
function pulls(start: string, spec: (string | [string, number] | number)[]): ConveneRecord[] {
  const t0 = recordTimeMs(start);
  const out: ConveneRecord[] = [];
  const push = (name: string, quality: number, resourceId = 0) => {
    const d = new Date(t0 + out.length * 60_000 + 8 * 3600_000);
    const p = (n: number) => String(n).padStart(2, "0");
    const time = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00`;
    out.push({ time, resourceId, qualityLevel: quality, name });
  };
  for (const s of spec) {
    if (typeof s === "number") for (let i = 0; i < s; i++) push("Sword of Night", 3, 21010013);
    else if (typeof s === "string") push(s, 5);
    else push(s[0], s[1]);
  }
  return out;
}

describe("the numbers", () => {
  it("are Kuro's: 80 / 10 everywhere, 50 on the Beginner banner; the simulator's curve hits 100 % one pull earlier", () => {
    for (const p of CONVENE_POOLS) {
      expect(p.hardPity4).toBe(10);
      expect(p.hardPity5).toBe(p.type === 5 ? 50 : 80);
    }
    expect(FIVE_STAR_GUARANTEED_ON_PULL).toBe(79);
    expect(fiveStarChance(MAX_PULLS_SINCE_LAST_FIVE)).toBe(1);
    expect(modelAveragePity()).toBeCloseTo(54.1, 1);
  });

  it("knows the standard 5★ resonators by id or name", () => {
    expect(isStandardFiveStarResonator(1503, "")).toBe(true);
    expect(isStandardFiveStarResonator(0, "Verina")).toBe(true);
    expect(isStandardFiveStarResonator(0, " lingyang ")).toBe(true);
    expect(isStandardFiveStarResonator(1606, "Chisa")).toBe(false);
    expect(poolOf(1)?.fiftyFifty).toBe(true);
    expect(poolOf(2)?.alwaysFeatured).toBe(true);
  });
});

describe("poolPity", () => {
  it("counts 5★ pity to the pull, up to the hard pity of 80", () => {
    const r = poolPity(1, pulls("2026-09-01 10:00:00", [79, "Chisa", 12]));
    expect(r.fiveStars).toHaveLength(1);
    expect(r.fiveStars[0]).toMatchObject({ pity: 80, outcome: "won", lowerBound: false, index: 79 });
    expect(r.pity5).toBe(12);
    expect(r.toHardPity5).toBe(68);
    expect(r.pulls).toBe(92);
    expect(r.astrite).toBe(92 * 160);
  });

  it("reads the 50/50: lost → guaranteed → won, and the guarantee after a loss", () => {
    const records = pulls("2026-09-01 10:00:00", [29, ["Verina", 5], 39, "Chisa", 19, "Iuno", 14]);
    records[29]!.resourceId = 1503;
    const r = poolPity(1, records);
    expect(r.fiveStars.map((f) => [f.name, f.pity, f.outcome])).toEqual([
      ["Verina", 30, "lost"],
      ["Chisa", 40, "guaranteed"],
      ["Iuno", 20, "won"],
    ]);
    expect(r.guaranteed).toBe(false);
    expect(r.guaranteeKnown).toBe(true);
    expect(r.fiftyFifty).toMatchObject({ won: 1, lost: 1, guaranteed: 1, unknown: 0, winRate: 0.5, luckPercentile: 0.5 });
    expect(r.avgPity5).toBe(30);
    expect(r.pity5).toBe(14);

    const lostLast = poolPity(1, pulls("2026-09-01 10:00:00", [50, "Encore", 7]));
    expect(lostLast.guaranteed).toBe(true);
    expect(lostLast.fiveStars[0]!.outcome).toBe("lost");
  });

  it("counts 4★ pity from the last 4★ or 5★ (a 5★ resets it)", () => {
    const r = poolPity(1, pulls("2026-09-01 10:00:00", [9, ["Taoqi", 4], 5, "Chisa", 3, ["Buling", 4], 6]));
    expect(r.fourStars).toBe(2);
    expect(r.pity4).toBe(6);
    expect(r.toHardPity4).toBe(4);
    expect(r.avgPity4).toBeCloseTo((10 + 6 + 4) / 3, 9);
  });

  it("a cut-off history: the first 5★'s pity is a lower bound and its coin flip unknown, kept out of the averages", () => {
    const r = poolPity(1, pulls("2026-04-01 10:00:00", [20, "Chisa", 60, "Phrolova", 5]), { truncated: true });
    expect(r.truncated).toBe(true);
    expect(r.fiveStars[0]).toMatchObject({ pity: 21, lowerBound: true, outcome: "unknown" });
    expect(r.fiveStars[1]).toMatchObject({ pity: 61, lowerBound: false, outcome: "won" });
    expect(r.avgPity5).toBe(61);
    expect(r.luck?.samples).toBe(1);
    expect(r.fiftyFifty).toMatchObject({ won: 1, unknown: 1, winRate: 1 });
    // no 5★ yet in a cut-off history: the guarantee can't be read
    const blind = poolPity(1, pulls("2026-04-01 10:00:00", [33]), { truncated: true });
    expect(blind).toMatchObject({ guaranteed: false, guaranteeKnown: false, pity5: 33, pity5LowerBound: true, pity4LowerBound: true });
    expect(simulatorPrefill([blind], "character")).toMatchObject({ startingPity: 33, certain: false, pityLowerBound: true });
    // once a 5★ is in the window the counter is exact again
    expect(r).toMatchObject({ pity5: 5, pity5LowerBound: false, pity4LowerBound: false });
    expect(poolPity(1, pulls("2026-04-01 10:00:00", [33]))).toMatchObject({ pity5LowerBound: false, pity4LowerBound: false });
    // a standard 5★ still reads as a loss — a guaranteed pull can't give one
    const lost = poolPity(1, pulls("2026-04-01 10:00:00", [10, "Calcharo", 2]), { truncated: true });
    expect(lost.fiveStars[0]!.outcome).toBe("lost");
    expect(lost.guaranteed).toBe(true);
  });

  it("weapon and standard pools have no 50/50", () => {
    const w = poolPity(2, pulls("2026-09-01 10:00:00", [60, "Kumokiri", 3]));
    expect(w.fiveStars[0]!.outcome).toBe("featured");
    expect(w).toMatchObject({ guaranteed: null, guaranteeKnown: true, fiftyFifty: null });
    const s = poolPity(3, pulls("2026-09-01 10:00:00", [60, "Verina"]));
    expect(s.fiveStars[0]!.outcome).toBe("standard");
    const beginner = poolPity(5, pulls("2026-09-01 10:00:00", [49, "Jianxin"]));
    expect(beginner).toMatchObject({ luck: null, toHardPity5: 50 });
    expect(beginner.fiveStars[0]!.pity).toBe(50);
  });

  it("luck: percentiles from the simulator's curve", () => {
    expect(pityPercentile(1)).toBeGreaterThan(0.99);
    expect(pityPercentile(79)).toBeLessThan(0.001);
    expect(pityPercentile(30)).toBeGreaterThan(pityPercentile(70));
    expect(luckPercentile([])).toBeNull();
    expect(luckPercentile([54])).toBeCloseTo(pityPercentile(54), 12);
    expect(luckPercentile([20, 20])).toBeGreaterThan(luckPercentile([60, 60])!);
    // exact convolution (60) and the normal approximation (61) agree closely
    expect(Math.abs(luckPercentile(Array(60).fill(54))! - luckPercentile(Array(61).fill(54))!)).toBeLessThan(0.02);
    expect(coinFlipPercentile(0, 0)).toBeNull();
    expect(coinFlipPercentile(3, 3)).toBeCloseTo(0.9375, 12);
    expect(coinFlipPercentile(0, 4)).toBeCloseTo(0.03125, 12);
  });
});

describe("truncation and the whole history", () => {
  it("calls a history cut off when its oldest pull is ~5 months older than the first API import", () => {
    const records = pulls("2026-04-20 10:00:00", [5]);
    const firstImport = Date.UTC(2026, 9, 12);
    expect(isLikelyTruncated(records, firstImport)).toBe(true);
    expect(isLikelyTruncated(pulls("2026-08-20 10:00:00", [5]), firstImport)).toBe(false);
    expect(isLikelyTruncated(records, null)).toBe(true);
    expect(isLikelyTruncated([], null)).toBe(false);
    // the first API import that brought pulls: an empty answer (a bogus or expired token) says nothing about the window
    expect(firstApiImportAt({ imports: [{ at: 5, source: "backup", added: 1 }, { at: 9, source: "api", added: 1 }, { at: 7, source: "api", added: 0 }] })).toBe(9);
    expect(firstApiImportAt({ imports: [{ at: 7, source: "api", added: 0 }] })).toBeNull();
  });

  it("summarises every pool and merges the 5★ timeline in time order", () => {
    const featured = pulls("2026-09-01 10:00:00", [40, "Chisa"]);
    const weapon = pulls("2026-09-01 10:20:00", [10, "Kumokiri"]);
    const h = historyPity({ pools: { "1": featured, "2": weapon, "3": [] }, imports: [{ at: Date.UTC(2026, 9, 1), source: "api", added: 52 }] });
    expect(h.pools.map((p) => p.poolType)).toEqual([1, 2]);
    expect(h.pulls).toBe(52);
    expect(h.astrite).toBe(52 * 160);
    expect(h.timeline.map((f) => [f.name, f.poolType])).toEqual([["Kumokiri", 2], ["Chisa", 1]]);
    expect(h.pools[0]!.truncated).toBe(false);
  });
});

describe("simulatorPrefill", () => {
  it("hands pity and the guarantee to the odds simulator", () => {
    const records = pulls("2026-09-01 10:00:00", [44, "Encore", 23]);
    const pools = [poolPity(1, records), poolPity(2, pulls("2026-09-01 10:00:00", [61]))];
    expect(simulatorPrefill(pools, "character")).toEqual({ mode: "character", startingPity: 23, guaranteedNextFeatured: true, clamped: false, poolType: 1, certain: true, pityLowerBound: false });
    expect(simulatorPrefill(pools, "weapon")).toEqual({ mode: "weapon", startingPity: 61, guaranteedNextFeatured: false, clamped: false, poolType: 2, certain: true, pityLowerBound: false });
    expect(simulatorPrefill([pools[1]!], "character")).toBeNull();
  });

  it("caps a counter of 79 at the simulator's 78 and says so", () => {
    const p = simulatorPrefill([poolPity(1, pulls("2026-09-01 10:00:00", [79]))], "character")!;
    expect(p).toMatchObject({ startingPity: MAX_PULLS_SINCE_LAST_FIVE, clamped: true });
  });
});
