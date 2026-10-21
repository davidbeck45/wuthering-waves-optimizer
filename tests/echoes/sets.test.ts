import { describe, it, expect } from "vitest";
import {
  getSetBonusThreshold,
  setBonusEffectsOnePiece,
  setBonusEffectsOne,
  setBonusEffectsTwo,
} from "../../src/echoes/sets";

describe("getSetBonusThreshold", () => {
  it("returns 1 for a 1pc-only exclusive set (Lucy's Shadow of Shattered Dreams)", () => {
    expect(getSetBonusThreshold("ShadowofShatteredDreams")).toBe(1);
  });

  it("returns 3 for a 3pc-only set", () => {
    expect(getSetBonusThreshold("CrownofValor")).toBe(3);
  });

  it("returns 2 for an ordinary 2pc/5pc set", () => {
    expect(getSetBonusThreshold("CelestialLight")).toBe(2);
    expect(getSetBonusThreshold("EternalRadiance")).toBe(2);
  });

  it("defaults to 2 for an unrecognized key", () => {
    expect(getSetBonusThreshold("NotARealSet")).toBe(2);
  });
});

describe("set bonus passives", () => {
  // A passive's toggle is saved under its key. Two bonuses sharing a key share one toggle, and an
  // always-on 2-piece passive then switches its set's conditional 5-piece passive back on.
  it("each passive key belongs to one set bonus", () => {
    // The same bonus can be listed in more than one of these maps, so collect distinct labels.
    const owners: Record<string, Set<string>> = {};
    for (const bonuses of [setBonusEffectsOnePiece, setBonusEffectsOne, setBonusEffectsTwo]) {
      for (const [label, bonus] of Object.entries(bonuses)) {
        for (const passive of bonus.passives ?? []) (owners[String(passive.key)] ??= new Set()).add(label);
      }
    }
    const shared = Object.entries(owners)
      .filter(([, labels]) => labels.size > 1)
      .map(([key, labels]) => [key, [...labels]]);
    expect(shared).toEqual([]);
  });
});
