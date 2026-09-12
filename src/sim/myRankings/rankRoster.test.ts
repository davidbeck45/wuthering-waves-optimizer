// Wuthering Tools+: the roster ranking on a real exported account (the
// Cartethyia optimizer fixture: full build, echoes, one saved rotation).
import { describe, expect, it } from "vitest";
import account from "./__fixtures__/cartethyiaAccount.json";
import { isSetUp, nodeOf, rankRoster, refinementOf, sequenceOf, weaponOptionsFor, whatIf, withSequence, withWeapon } from "./rankRoster";

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
    expect(c.bestRotation?.name).toBe(c.best?.name);
  });

  it("builds what-if copies: a sequence level, a weapon and a refinement", async () => {
    const c = account.characters.Cartethyia as Record<string, unknown>;
    const s6 = await withSequence("Cartethyia", c, 6);
    expect(sequenceOf(s6)).toBe(6);
    const s0 = await withSequence("Cartethyia", c, 0);
    expect(sequenceOf(s0)).toBe(0);
    expect(sequenceOf(await withSequence("Cartethyia", c, 2))).toBe(2); // already there: untouched
    expect(c).toEqual(account.characters.Cartethyia); // copies, never the stored character
    const r5 = withWeapon(c, null, 5);
    expect(refinementOf(r5)).toBe(5);
    expect(r5.weapon).toBe((c as { weapon: string }).weapon);
    const swapped = withWeapon(c, "SwordOfNight", 1);
    expect(swapped.weapon).toBe("SwordOfNight");
    expect(refinementOf(swapped)).toBe(1);
    const options = await weaponOptionsFor("Cartethyia");
    expect(options[0].rarity).toBe(5);
    expect(options.some((w) => w.key === (c as { weapon: string }).weapon)).toBe(true);
  });

  it("scores a hypothetical build on the best rotation", async () => {
    const ranking = await rankRoster(account.characters, account.echoes, [], { investment: false, yieldToUi: false });
    const [c] = ranking.characters;
    const same = await whatIf("Cartethyia", account.characters, account.echoes, c.bestRotation!, {});
    expect(same.avgDamage).toBeCloseTo(c.best!.avgDamage, 0);
    expect(same.gain).toBeCloseTo(0, 6);
    const better = await whatIf("Cartethyia", account.characters, account.echoes, c.bestRotation!, { sequence: 6, refinement: 5 });
    expect(better.label).toMatch(/^S6 · .* R5$/);
    expect(better.base).toBeCloseTo(c.best!.avgDamage, 0);
    expect(better.avgDamage).toBeGreaterThan(same.avgDamage);
    expect(better.gain).toBeGreaterThan(0);
  });
});
