// Wuthering Tools+ Echo Lab page — the view model (filters, sort, the feed list, line colours) on a real best-owner
// result of the public test account, and the "re-roll first" rule the re-roll tab and the calculator panel share.
import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/echoLabAccount.json";
import { createLabSession, type LabAccount } from "./core";
import { bestOwners, type BestOwnerResult } from "./bestOwner";
import { engineView } from "./engineView";
import { rerollAdvice, type LockPlan } from "./rerollAdvice";
import { MIN_PLAN_GAIN, pickRerollFirst } from "./rerollPick";
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  applyFilters,
  feedGroups,
  feedListText,
  lineTier,
  reasonText,
  scoreBand,
  sortRows,
  worthwhilePlan,
} from "./echoLabView";

const account = fixture as unknown as LabAccount;
const quiet = { yieldMs: 0 };
const T = 60_000;

const plan = (gainPerTransducer: number, expectedGain = gainPerTransducer): LockPlan => ({
  locks: 4,
  lockedFields: [1, 2, 3, 4],
  rerolledFields: [5],
  cost: 1,
  method: "exact",
  pImprove: 0.5,
  expectedGain,
  expectedChange: 0,
  p90: 0,
  gainPerTransducer,
  transducersPerSuccess: 2,
});

describe("re-roll first (pickRerollFirst)", () => {
  it("picks the plan that pays most per Transducer, skips plans below the threshold, breaks ties by gain then slot", () => {
    expect(pickRerollFirst([])).toBeNull();
    expect(pickRerollFirst([{ slot: 0, recommended: null }])).toBeNull();
    expect(pickRerollFirst([{ slot: 1, recommended: plan(0.01, MIN_PLAN_GAIN / 2) }])).toBeNull();
    const advices = [
      { slot: 0, recommended: plan(0.002) },
      { slot: 1, recommended: plan(0.004, 0.004) },
      { slot: 2, recommended: plan(0.004, 0.006) },
      { slot: 3, recommended: plan(0.004, 0.006) },
    ];
    expect(pickRerollFirst(advices)?.slot).toBe(2);
    expect(worthwhilePlan(plan(0.01, MIN_PLAN_GAIN / 2))).toBeNull();
    expect(worthwhilePlan(plan(0.01))).not.toBeNull();
  });

  it("the calculator panel's engine view names the same echo as the re-roll tab's rule over every full echo", async () => {
    const session = createLabSession(account);
    const view = await engineView(session, "Galbrena", {}, quiet);
    expect(view.benchmark?.score).not.toBeNull();
    expect(view.substats.map((s) => s.gain)).toEqual([...view.substats.map((s) => s.gain)].sort((a, b) => b - a));
    const full = view.echoes.filter((e) => e.lines >= 5);
    expect(full.length).toBeGreaterThan(0);
    const advices = [];
    for (const e of full) advices.push(await rerollAdvice(createLabSession(account), "Galbrena", e.slot, {}, quiet));
    const pick = pickRerollFirst(advices);
    expect(pick).not.toBeNull();
    expect(view.rerollFirst?.slot).toBe(pick!.slot);
    expect(view.rerollFirst?.recommended).toEqual(pick!.recommended);

    // the panel's first step skips the advice entirely
    const light = await engineView(createLabSession(account), "Galbrena", { reroll: false }, quiet);
    expect(light.rerollFirst).toBeNull();
    expect(light.benchmark?.score).toBeCloseTo(view.benchmark!.score!, 9);
  }, T);
});

describe("the inventory verdict view model", () => {
  let cached: BestOwnerResult | null = null;
  const result = async (): Promise<BestOwnerResult> => (cached ??= await bestOwners(createLabSession(account), {}, quiet));

  it("filters by verdict, cost, worn and search, and counts the active filters", async () => {
    const { echoes } = await result();
    expect(applyFilters(echoes, DEFAULT_FILTERS)).toHaveLength(echoes.length);
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    for (const verdict of ["keep", "spare", "feed"] as const) {
      const rows = applyFilters(echoes, { ...DEFAULT_FILTERS, verdict });
      expect(rows.every((r) => r.verdict === verdict)).toBe(true);
      expect(rows).toHaveLength(echoes.filter((r) => r.verdict === verdict).length);
    }
    const worn = applyFilters(echoes, { ...DEFAULT_FILTERS, worn: "worn" });
    const free = applyFilters(echoes, { ...DEFAULT_FILTERS, worn: "free" });
    expect(worn.length + free.length).toBe(echoes.length);
    expect(worn.every((r) => r.wornBy.length > 0)).toBe(true);
    const cost4 = applyFilters(echoes, { ...DEFAULT_FILTERS, cost: 4 });
    expect(cost4.length).toBeGreaterThan(0);
    expect(cost4.every((r) => r.cost === 4)).toBe(true);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, cost: 4, search: "  " })).toBe(1);
    expect(applyFilters(echoes, { ...DEFAULT_FILTERS, search: "no such echo anywhere" })).toHaveLength(0);
  }, T);

  it("sorts by best gain (biggest first), by verdict, and reverses", async () => {
    const { echoes } = await result();
    const gains = sortRows(echoes, "gain").map((r) => r.best?.gain ?? -Infinity);
    expect(gains).toEqual([...gains].sort((a, b) => b - a));
    const order = { keep: 0, spare: 1, feed: 2 };
    const verdicts = sortRows(echoes, "verdict").map((r) => order[r.verdict]);
    expect(verdicts).toEqual([...verdicts].sort((a, b) => a - b));
    expect(sortRows(echoes, "gain", true).map((r) => r.echoId)).toEqual(sortRows(echoes, "gain").map((r) => r.echoId).reverse());
  }, T);

  it("groups the feed verdicts the way the game filters echoes (Sonata, Cost, Main Stat)", async () => {
    const { echoes } = await result();
    const groups = feedGroups(echoes);
    const feeds = echoes.filter((r) => r.verdict === "feed");
    expect(feeds.length).toBeGreaterThan(0);
    expect(groups.reduce((n, g) => n + g.count, 0)).toBe(feeds.length);
    for (const g of groups) {
      for (const id of g.echoIds) {
        const row = echoes.find((r) => r.echoId === id)!;
        expect([row.verdict, row.cost, row.set, row.main]).toEqual(["feed", g.cost, g.set, g.main]);
      }
    }
    expect(groups.map((g) => g.count)).toEqual([...groups.map((g) => g.count)].sort((a, b) => b - a));
    const text = feedListText(groups);
    expect(text.split("\n")).toHaveLength(groups.length + 1);
    expect(text).toContain(`${feeds.length} echo`);
    for (const row of echoes) expect(reasonText(row)).toMatch(/\S/);
  }, T);

  it("colours a line by its worth against one expected roll of the build's best substat", () => {
    const perPoint = { CritRate: 0.01, CritDMG: 0.005, DEF_FLAT: 0 };
    expect(lineTier(perPoint, "CritRate", 7.5).tier).toBe("great"); // the best substat at its expectation
    expect(lineTier(perPoint, "CritDMG", 6).tier).toBe("good");
    expect(lineTier(perPoint, "CritRate", 0.5).tier).toBe("weak");
    expect(lineTier(perPoint, "DEF_FLAT", 60).tier).toBe("dead");
    expect(lineTier(null, "CritRate", 7.5).tier).toBe("good"); // no build to price it on: neutral
    expect([0.2, 0.7, 1, 1.5].map(scoreBand)).toEqual(["low", "fair", "good", "great"]);
  });
});
