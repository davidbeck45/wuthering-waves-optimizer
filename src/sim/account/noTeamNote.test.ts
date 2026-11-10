// Wuthering Tools+: "no team figure: …" says which thing is true (2026-11-09 hunt 2, item 7). A set-up Danjin read "not in
// a team you can field" on every row while Why this number offered "Danjin · Phrolova + Shorekeeper" with all three
// built: his own rotations come from wuwa_calc teams that the app's team presets don't carry, so the app has no team
// ROTATION to score him in. The account can field him; the sentence said it could not.
import { describe, expect, it } from "vitest";
import account from "../myRankings/__fixtures__/cartethyiaAccount.json";
import { rankRoster } from "../myRankings/rankRoster";
import { investPlan } from "./investPlan";
import { hasTeamRotation, NO_FIELDABLE_TEAM, noTeamNote, noTeamRotationNote } from "./noTeamNote";

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

describe("why a character has no team figure", () => {
  it("says the app has no team rotation with them when no saved, curated or wuwa_calc team lists them", async () => {
    expect(await hasTeamRotation("Danjin", [])).toBe(false);
    expect(await noTeamNote("Danjin", [])).toBe("the app has no team rotation with Danjin (save one on Teams to get a team figure)");
    expect(noTeamRotationNote("Danjin")).not.toMatch(/you can field/);
  });

  it("keeps 'not in a team you can field' for a character the app has team rotations for: the account lacks a member", async () => {
    expect(await hasTeamRotation("Cartethyia", [])).toBe(true);
    expect(await noTeamNote("Cartethyia", [])).toBe(NO_FIELDABLE_TEAM);
    expect(NO_FIELDABLE_TEAM).toBe("not in a team you can field");
  });

  it("counts a team the player saved with actions, not one saved without a rotation", async () => {
    const saved = { characterIds: ["Danjin", "Phrolova", "Shorekeeper"], actions: [{ slot: 0 }] };
    expect(await hasTeamRotation("Danjin", [saved])).toBe(true);
    expect(await hasTeamRotation("Danjin", [{ ...saved, actions: [] }])).toBe(false);
    expect(await hasTeamRotation("Danjin", null)).toBe(false);
  });

  it("reads both Rover genders as one kit: a team rotation written for one stands for the other", async () => {
    expect(await hasTeamRotation("RoverSpectroFemale", [])).toBe(true);
    expect(await hasTeamRotation("RoverSpectroMale", [])).toBe(true);
  });

  it("My account's rows carry the true sentence: Danjin set up beside Cartethyia, no team rotation in the app", async () => {
    const characters: Record<string, any> = { ...clone(account.characters), Danjin: { weapon: "EmeraldOfGenesis" } };
    const echoes = clone(account.echoes) as any[];
    const ranking = await rankRoster(characters, echoes, [], { investment: false, yieldToUi: false });
    expect(ranking.characters.find((c) => c.id === "Danjin")?.bestRotation, "Danjin is scored on a rotation of his own").toBeTruthy();
    const plan = await investPlan(characters, echoes, [], ranking, { yieldToUi: false, substatKeys: [] });
    const danjin = plan.items.filter((i) => i.characterId === "Danjin");
    expect(danjin.length).toBeGreaterThan(0);
    for (const item of danjin) {
      expect(item.team).toBeNull();
      expect(item.teamNote, item.id).toBe("the app has no team rotation with Danjin (save one on Teams to get a team figure)");
    }
    // Cartethyia has team rotations (wuwa_calc's, with Ciaccona and Chisa), and neither teammate is set up here
    const cart = plan.items.filter((i) => i.characterId === "Cartethyia");
    expect(cart.length).toBeGreaterThan(0);
    for (const item of cart) expect(item.teamNote, item.id).toBe("not in a team you can field");
  }, 120_000);
});
