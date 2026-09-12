// Wuthering Tools+: the roster ranking on a real exported account (the
// Cartethyia optimizer fixture: full build, echoes, one saved rotation).
import { describe, expect, it } from "vitest";
import account from "./__fixtures__/cartethyiaAccount.json";
import { isSetUp, nodeOf, rankRoster, refinementOf, sequenceOf } from "./rankRoster";

describe("rank roster", () => {
  it("reads sequence and refinement off the stored character", () => {
    const c = account.characters.Cartethyia as Record<string, unknown>;
    expect(sequenceOf(c)).toBe(2);
    expect(refinementOf(c)).toBe(1); // the fixture stores no refinement
    expect(sequenceOf(undefined)).toBe(0);
    expect(isSetUp(c)).toBe(true);
    expect(nodeOf("SequenceNode4SacrificeMadeforSalvation")).toBe(4);
    expect(nodeOf("S6BBloomForYouThousandTimesOverDeepSlumberBuff")).toBe(6);
    expect(nodeOf("Sequence5Something")).toBe(5);
    expect(nodeOf("StatBonusCritRate1")).toBe(0);
    expect(sequenceOf({ resonanceChains: { S1SomewhereNoOneTravelled: { isEnabled: true }, S2CallingUpontheSilentRose: { isEnabled: false } } })).toBe(1);
    expect(isSetUp({})).toBe(false);
    expect(refinementOf({ weapon: "X", weapons: {} })).toBe(1);
  });

  it("ranks the character's own, curated and wuwa_calc rotations on her real build", async () => {
    const ranking = await rankRoster({ ...account.characters, Ghost: {}, NotACharacter: { weapon: "X" } }, account.echoes, [], { investment: true, yieldToUi: false });
    expect(ranking.characters).toHaveLength(1); // no weapon → not ranked; unknown character → skipped
    const [c] = ranking.characters;
    expect(c.id).toBe("Cartethyia");
    expect(c.name).toBe("Cartethyia");
    expect(c.rotationsEvaluated).toBeGreaterThan(3);
    expect(c.rotations.some((r) => r.source === "yours" && r.name === "Rexlent's Fleurdelys Rotation")).toBe(true);
    expect(c.rotations.some((r) => r.source === "wuwa_calc")).toBe(true);
    expect(c.rotations.some((r) => r.source === "curated")).toBe(true);
    expect(c.best?.avgDamage).toBeGreaterThan(100000);
    expect(c.best?.avgDamage).toBe(Math.max(...c.rotations.map((r) => r.avgDamage)));
    expect(c.errors).toEqual([]);
    // investment estimates: S2 → S3 and R1 → R5 must not lower the best rotation
    expect(c.nextSequence?.label).toBe("S3");
    expect(c.nextSequence?.gain ?? 0).toBeGreaterThanOrEqual(0);
    expect(c.refineFive?.label).toBe("R5");
    expect(c.refineFive?.gain ?? 0).toBeGreaterThan(0);
    // no teams: the fixture has no team rotations and no 3 owned characters for the presets
    expect(ranking.teams).toEqual([]);
    expect(ranking.enemy.enemyLevel).toBe(100);
  });
});
