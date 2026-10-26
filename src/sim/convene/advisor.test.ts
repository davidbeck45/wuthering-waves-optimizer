// Wuthering Tools+ — the pull advisor's cost model (exact convolution of upstream's pity curve) and ranking; the cost
// side is checked against upstream's own Monte Carlo (src/convene/simulateConvene.ts).
import { describe, expect, it } from "vitest";
import { ASTRITE_PER_WISH, runMonteCarlo } from "../../convene/simulateConvene";
import {
  adviceSummary,
  advisorTargets,
  chanceWithin,
  convolve,
  featuredCost,
  priceAdvice,
  pullsForAstrite,
  pullsToFiveStar,
  type AdviceDamage,
  type AdviceTarget,
} from "./advisor";
import type { ConveneBanner } from "./banners";
import { modelAveragePity } from "./pity";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const meanOf = (pmf: number[]) => pmf.reduce((m, p, n) => m + n * p, 0);

describe("cost of featured copies", () => {
  it("convolves upstream's curve: one 5★ from a fresh pity averages the model's ~54.1 pulls", () => {
    const fresh = pullsToFiveStar(0);
    expect(sum(fresh)).toBeCloseTo(1, 12);
    expect(fresh.length - 1).toBe(79); // 100 % on pull 79
    expect(meanOf(fresh)).toBeCloseTo(modelAveragePity(), 9);
    expect(meanOf(fresh)).toBeCloseTo(54.1, 1);
    // pity 78 → the very next pull is the 5★
    expect(pullsToFiveStar(78)).toEqual([0, 1]);
    // a counter past the simulator's 78 is clamped like the sim clamps it
    expect(pullsToFiveStar(79)).toEqual([0, 1]);
    expect(convolve([0, 1], [0, 0.5, 0.5])).toEqual([0, 0, 0.5, 0.5]);
  });

  it("prices a featured resonator: 1.5 × 54.1 ≈ 81.15 pulls without a guarantee, the bare 5★ with one", () => {
    const flip = featuredCost({ alwaysFeatured: false, pity: 0, guaranteed: false, copies: 1 });
    expect(flip.meanPulls).toBeCloseTo(1.5 * modelAveragePity(), 6);
    expect(flip.meanPulls).toBeCloseTo(81.15, 1); // the figure ConveneView's header quotes
    expect(flip.meanAstrite).toBeCloseTo(flip.meanPulls * ASTRITE_PER_WISH, 6);
    expect(flip.maxPulls).toBe(158); // two hard pities
    expect(sum(flip.pmf)).toBeCloseTo(1, 10);
    const sure = featuredCost({ alwaysFeatured: false, pity: 0, guaranteed: true, copies: 1 });
    expect(sure.meanPulls).toBeCloseTo(modelAveragePity(), 6);
    expect(sure.maxPulls).toBe(79);
    // pity carries: 60 pulls in, the first 5★ is close
    const deep = featuredCost({ alwaysFeatured: false, pity: 60, guaranteed: true, copies: 1 });
    expect(deep.meanPulls).toBeLessThan(15);
    expect(deep.maxPulls).toBe(19);
    expect(deep.p50Pulls).toBeLessThanOrEqual(deep.p90Pulls);
  });

  it("prices weapons and extra copies: every 5★ featured, each further copy from a fresh pity", () => {
    const two = featuredCost({ alwaysFeatured: true, pity: 0, guaranteed: false, copies: 2 });
    expect(two.meanPulls).toBeCloseTo(2 * modelAveragePity(), 6);
    expect(two.maxPulls).toBe(158);
    const s2 = featuredCost({ alwaysFeatured: false, pity: 10, guaranteed: false, copies: 3 });
    const first = featuredCost({ alwaysFeatured: false, pity: 10, guaranteed: false, copies: 1 });
    expect(s2.meanPulls).toBeCloseTo(first.meanPulls + 2 * 1.5 * modelAveragePity(), 6);
  });

  it("agrees with upstream's Monte Carlo on P(k copies within a budget)", () => {
    for (const q of [
      { mode: "character" as const, pity: 30, guaranteed: false, copies: 2, wishes: 140 },
      { mode: "character" as const, pity: 70, guaranteed: true, copies: 1, wishes: 20 },
      { mode: "weapon" as const, pity: 5, guaranteed: false, copies: 2, wishes: 100 },
    ]) {
      const mc = runMonteCarlo(
        { wishes: q.wishes, mode: q.mode, startingPity: q.pity, guaranteedNextFeatured: q.guaranteed, maxCopies: q.copies, copiesOwnedBefore: 0 },
        40_000,
      );
      const exact = chanceWithin(featuredCost({ alwaysFeatured: q.mode === "weapon", pity: q.pity, guaranteed: q.guaranteed, copies: q.copies }), q.wishes);
      expect(Math.abs(exact - mc.targetMetRate), JSON.stringify(q)).toBeLessThan(0.015);
    }
  });

  it("turns Astrite into whole pulls", () => {
    expect(pullsForAstrite(12_000)).toBe(75);
    expect(pullsForAstrite(159)).toBe(0);
    expect(pullsForAstrite(-5)).toBe(0);
  });
});

const target = (id: string, kind: "resonator" | "weapon", name: string, key: string | null, poolType = kind === "weapon" ? 2 : 1): AdviceTarget => ({
  id,
  bannerId: id,
  bannerLabel: "3.7 Phase I",
  bannerTitle: null,
  endMs: 0,
  poolType,
  kind,
  alwaysFeatured: kind === "weapon",
  item: { name, key },
});

const damage = (targetId: string, steps: [string, number, number][], extra: Partial<AdviceDamage> = {}): AdviceDamage => ({
  targetId,
  status: "ok",
  characterKey: "X",
  characterName: "X",
  current: "S0",
  baseDamage: 100,
  rotation: "Loop",
  steps: steps.map(([label, copies, gain]) => ({ label, copies, gain, avgDamage: 100 * (1 + gain) })),
  note: null,
  ...extra,
});

describe("ranking advice", () => {
  it("ranks by % damage per 1,000 Astrite on the next copy and spells out the ladder", () => {
    const targets = [target("a", "resonator", "Chisa", "Chisa"), target("b", "weapon", "Kumokiri", "Kumokiri"), target("c", "resonator", "Iuno", "Iuno")];
    const rows = priceAdvice(
      targets,
      [
        damage("a", [["S1", 1, 0.12], ["S2", 2, 0.2]], { characterName: "Chisa" }),
        damage("b", [["R2", 1, 0.06]], { characterName: "Chisa" }),
        { ...damage("c", []), status: "not-owned", characterName: "Iuno" },
      ],
      { pity: { 1: { pity: 0, guaranteed: false }, 2: { pity: 0, guaranteed: false } }, budgetAstrite: 16_000 },
    );
    expect(rows.map((r) => r.target.id)).toEqual(["a", "b", "c"]);
    const [chisa, kumo, iuno] = rows;
    expect(chisa!.rank).toBe(1);
    expect(iuno!.rank).toBeNull();
    // 12 % for ≈ 81.15 pulls × 160 = 12,984 Astrite → 0.924 % per 1k
    expect(chisa!.steps[0]!.cost.meanAstrite).toBeCloseTo(1.5 * modelAveragePity() * 160, 3);
    expect(chisa!.steps[0]!.perThousand).toBeCloseTo(12 / (chisa!.steps[0]!.cost.meanAstrite / 1000), 9);
    // the second step's marginal rate: 8 more points for one more copy's Astrite
    const extra = chisa!.steps[1]!.cost.meanAstrite - chisa!.steps[0]!.cost.meanAstrite;
    expect(chisa!.steps[1]!.marginalPerThousand).toBeCloseTo(8 / (extra / 1000), 9);
    // 6 % for ≈ 54.1 pulls → 0.693 % per 1k, second
    expect(kumo!.rank).toBe(2);
    expect(kumo!.steps[0]!.perThousand).toBeLessThan(chisa!.steps[0]!.perThousand);
    // the budget column: 16,000 Astrite = 100 pulls
    expect(chisa!.steps[0]!.chance).toBeCloseTo(chanceWithin(chisa!.steps[0]!.cost, 100), 12);
    expect(adviceSummary(rows)).toMatch(/^Most damage per Astrite right now: Chisa S1 — \+12\.0% on Loop/);
    expect(adviceSummary(rows)).toMatch(/Next: Kumokiri R2 on Chisa at 0\.\d\d% per 1k\./);
  });

  it("reads the pity per pool: a guarantee makes the same copy cheaper", () => {
    const targets = [target("a", "resonator", "Chisa", "Chisa")];
    const d = [damage("a", [["S1", 1, 0.1]])];
    const coin = priceAdvice(targets, d, { pity: {} })[0]!;
    const sure = priceAdvice(targets, d, { pity: { 1: { pity: 40, guaranteed: true } } })[0]!;
    expect(sure.steps[0]!.cost.meanPulls).toBeLessThan(coin.steps[0]!.cost.meanPulls);
    expect(sure.steps[0]!.perThousand).toBeGreaterThan(coin.steps[0]!.perThousand);
    expect(coin.steps[0]!.chance).toBeNull();
  });

  it("says plainly when nothing can be scored", () => {
    const targets = [target("a", "resonator", "Iuno", "Iuno")];
    expect(adviceSummary(priceAdvice(targets, [{ ...damage("a", []), status: "not-owned" }], { pity: {} }))).toMatch(/can be scored/);
    expect(adviceSummary(priceAdvice(targets, [{ ...damage("a", []), status: "maxed" }], { pity: {} }))).toMatch(/already maxed/);
    expect(adviceSummary([])).toMatch(/No banner/);
  });
});

describe("advisor targets", () => {
  const banner = (id: string, type: "resonator" | "weapon", names: string[], startMs: number, endMs: number, poolTypes: number[]): ConveneBanner => ({
    id,
    articleId: 1,
    sourceIds: [id],
    title: null,
    category: "featured",
    type,
    poolTypes,
    selectable: names.length > 1,
    fiveStars: names.map((name) => ({ name, key: name.replace(/\W/g, "") })),
    fourStars: [],
    version: "3.7",
    phase: "I",
    label: "3.7 Phase I",
    startMs,
    endMs,
    startApprox: false,
  });

  it("lists every featured 5★ on the running banners with its pool", () => {
    const now = 1_000;
    const t = advisorTargets(
      [
        banner("r", "resonator", ["Chisa"], 0, 2_000, [1]),
        banner("w", "weapon", ["Kumokiri"], 0, 2_000, [2]),
        banner("rv", "resonator", ["Jiyan", "Yinlin"], 0, 2_000, [12]),
        banner("old", "resonator", ["Lupa"], 0, 500, [1]),
      ],
      now,
    );
    expect(t.map((x) => `${x.item.name}@${x.poolType}${x.alwaysFeatured ? "!" : ""}`)).toEqual(["Chisa@1", "Kumokiri@2!", "Jiyan@12", "Yinlin@12"]);
  });
});
