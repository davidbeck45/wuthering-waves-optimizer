import { describe, expect, it } from "vitest";
import { ownedWeaponCandidate } from "./ownedWeaponCandidate";
import { estimateWeaponSwapImpactBatch } from "../../weapons/weaponImpact";
import type { TeamEnemyConfig } from "../../calculator/buildCharacterContext";

const enemy: TeamEnemyConfig = { enemyLevel: 90, enemyResist: 0.1, enemyType: "Calamity" };

describe("ownedWeaponCandidate", () => {
  it("leaves a weapon the character has no settings for at the upstream default (R1, max level)", () => {
    expect(ownedWeaponCandidate({}, "PulsationBracer")).toEqual({ weaponKey: "PulsationBracer" });
    expect(ownedWeaponCandidate(null, "PulsationBracer")).toEqual({ weaponKey: "PulsationBracer" });
    expect(ownedWeaponCandidate({ weapons: { Other: { refinement: "5" } } }, "PulsationBracer")).toEqual({
      weaponKey: "PulsationBracer",
    });
  });

  it("carries the saved refinement and level, as the strings the store uses", () => {
    expect(ownedWeaponCandidate({ weapons: { PulsationBracer: { refinement: "5" } } }, "PulsationBracer")).toEqual({
      weaponKey: "PulsationBracer",
      refinement: "5",
    });
    expect(
      ownedWeaponCandidate({ weapons: { PulsationBracer: { refinement: 3, weaponLevel: 80 } } }, "PulsationBracer"),
    ).toEqual({ weaponKey: "PulsationBracer", refinement: "3", weaponLevel: "80" });
  });
});

describe("Recommended rail: a held weapon is scored at its own refinement", () => {
  // Iuno holding Pulsation Bracer R5 with both passives on at max stacks: scoring the same weapon as a
  // bare `{ weaponKey }` candidate drops it to R1 (24 % → 12 % ATK, 9 % → 6 % Basic per stack) and the
  // rail painted the equipped weapon red against itself.
  const characters = {
    Iuno: {
      weapon: "PulsationBracer",
      weapons: { PulsationBracer: { refinement: "5" } },
      weaponPassives: {
        PulsationBracerATK: { isEnabled: true },
        PulsationBracerBasic: { isEnabled: true, stacks: 4 },
      },
      rotations: [
        {
          id: "r1",
          name: "Test rotation",
          duration: 10,
          actions: [{ id: "a1", type: "basic", key: "MoonringBasicAttack1DMG", count: 1 }],
        },
      ],
    },
  };

  it("an R1 candidate reads as a loss; the owned candidate measures zero against the equipped build", async () => {
    const [bare, owned] = await Promise.all([
      estimateWeaponSwapImpactBatch("Iuno", characters, [{ weaponKey: "PulsationBracer" }], enemy),
      estimateWeaponSwapImpactBatch(
        "Iuno",
        characters,
        [ownedWeaponCandidate(characters.Iuno, "PulsationBracer")],
        enemy,
      ),
    ]);
    const r1 = bare.get("PulsationBracer")!;
    const r5 = owned.get("PulsationBracer")!;
    expect(r1.fullyBuffedPct).toBeLessThan(-0.05);
    expect(r5.fullyBuffedDelta).toBeCloseTo(0, 6);
    // refinement only moves the passive: the stat-only bracket is the same weapon either way
    expect(r5.statOnlyDamage).toBeCloseTo(r1.statOnlyDamage, 6);
  });
});
