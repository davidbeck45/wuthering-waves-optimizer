import { describe, expect, it } from "vitest";
import account from "../myRankings/__fixtures__/cartethyiaAccount.json";
import { calcCharacterRotationDamage } from "../../calculator/characterRotation";
import { RANKING_ENEMY, rankRoster, rotationCandidates, rotationRange } from "../myRankings/rankRoster";
import { hitsOfAttack, hitsOfAttacks } from "./appHits";
import { damageRange, hitMean, momentsOf } from "./spread";

describe("the app calculator's attacks as hits", () => {
  it("one attack: its hits average to its avgDamage, share its non-crit by instance, and roll each press apart", () => {
    const attack = { count: 2, damage: { totalDamage: 3_000, critDamage: 7_500, avgDamage: 3_000 + 0.4 * 4_500, instanceDamageEntries: [{ damage: 500 }, { damage: 1_000 }] } };
    const hits = hitsOfAttack(attack);
    expect(hits).toHaveLength(4);
    expect(hits.reduce((s, h) => s + hitMean(h), 0)).toBeCloseTo(4_800, 9);
    expect(hits[0]!.n).toBeCloseTo(500, 9);
    expect(hits[1]!.n).toBeCloseTo(1_000, 9);
    for (const h of hits) {
      expect(h.p).toBeCloseTo(0.4, 12);
      expect(h.c / h.n).toBeCloseTo(2.5, 12);
    }
    // switched off, a heal, a legacy Negative Status figure
    expect(hitsOfAttack({ ...attack, originalIsEnabled: false })).toEqual([]);
    expect(hitsOfAttack({ damage: { healing: 900 } })).toEqual([]);
    expect(hitsOfAttack({ type: "ElementalEffect", damage: { damage: 640 } })).toEqual([{ n: 640, c: 640, p: 0 }]);
  });

  it("a real rotation's hits average to the calculator's own figure", async () => {
    const chars = account.characters as Record<string, any>;
    const candidates = await rotationCandidates("Cartethyia", chars.Cartethyia);
    expect(candidates.length).toBeGreaterThan(2);
    for (const c of candidates.slice(0, 4)) {
      const result = await calcCharacterRotationDamage(c.rotation, null, "Cartethyia", chars, RANKING_ENEMY, account.echoes);
      const hits = hitsOfAttacks(result.attacks);
      const m = momentsOf(hits);
      const avg = result.damageAggregation.avgDamage ?? 0;
      expect(Math.abs(m.mean - avg) / avg).toBeLessThan(1e-9);
      expect(m.rolls).toBeGreaterThan(0);
      const r = damageRange(hits);
      expect(r.p10).toBeLessThanOrEqual(r.p50);
      expect(r.p50).toBeLessThanOrEqual(r.p90);
    }
  }, 60_000);

  it("the roster ranking keeps the best rotation's range around its average", async () => {
    const ranking = await rankRoster(account.characters, account.echoes, [], { yieldToUi: false });
    const best = ranking.characters[0]!.best!;
    expect(best.range).toBeDefined();
    expect(best.range!.p10).toBeLessThan(best.avgDamage);
    expect(best.range!.p90).toBeGreaterThan(best.avgDamage);
    const again = await rotationRange(ranking.characters[0]!.bestRotation!, "Cartethyia", account.characters as Record<string, any>, RANKING_ENEMY, account.echoes);
    expect(again).toEqual(best.range);
  }, 60_000);
});
