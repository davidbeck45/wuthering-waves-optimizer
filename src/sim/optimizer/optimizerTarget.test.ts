import { describe, expect, it } from "vitest";
import { liveOptimizerTarget } from "./optimizerTarget";

const rotations = [{ id: "r1" }, { id: "r2" }];

describe("liveOptimizerTarget", () => {
  it("keeps a rotation the character still has", () => {
    expect(liveOptimizerTarget("Rotation:r2", rotations)).toBe("Rotation:r2");
  });

  it("treats a rotation she no longer has as no target, so the picker's default takes over", () => {
    expect(liveOptimizerTarget("Rotation:gone", rotations)).toBeNull();
    expect(liveOptimizerTarget("Rotation:gone", [])).toBeNull();
    expect(liveOptimizerTarget("Rotation:gone", undefined)).toBeNull();
  });

  it("leaves every other kind of target alone", () => {
    expect(liveOptimizerTarget("Attack:basicAttacks|one", [])).toBe("Attack:basicAttacks|one");
    expect(liveOptimizerTarget("Stat:totalAtk", undefined)).toBe("Stat:totalAtk");
  });

  it("keeps an unset target unset", () => {
    expect(liveOptimizerTarget(null, rotations)).toBeNull();
    expect(liveOptimizerTarget(undefined, rotations)).toBeNull();
  });
});
