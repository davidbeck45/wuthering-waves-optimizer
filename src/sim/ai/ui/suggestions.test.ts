// Wuthering Tools+ AI: the questions the empty panel offers per page, and the page context sent with a question.
import { describe, expect, it } from "vitest";
import { pageContextFor, suggestionsFor } from "./suggestions";

describe("suggestionsFor", () => {
  it("fits the page the player is on", () => {
    expect(suggestionsFor("/", { activeCharacter: "Aemeath" })[0]).toBe("How can I raise Aemeath's damage?");
    expect(suggestionsFor("/my-rankings")).toContain("What should I invest in next?");
    expect(suggestionsFor("/rankings#tc=mine")).toContain("Which of these teams can I field best?");
    expect(suggestionsFor("/teams")).toContain("Why is my team lower than Riley's?");
    expect(suggestionsFor("/teams", { openTeam: "Hypercarry" })[0]).toBe('Where does "Hypercarry" get its damage from?');
    expect(suggestionsFor("/inventory")).toContain("Which echoes can I feed?");
    expect(suggestionsFor("/convene")).toContain("Who should I pull for?");
    // the batch-2 pages, each with questions its tool answers
    expect(suggestionsFor("/energy")[0]).toBe("Is anyone short on Energy Regen?");
    expect(suggestionsFor("/energy", { activeCharacter: "Aemeath" })[0]).toBe("How much Energy Regen does Aemeath need in my teams?");
    expect(suggestionsFor("/endgame")).toContain("Can my teams clear Hazard 4 this season?");
    expect(suggestionsFor("/rotation#team=t269")).toContain("What's the rotation for my strongest team?");
    expect(suggestionsFor("/build-team?team=x")).toContain("What should my strongest team wear?");
    expect(suggestionsFor("/echo-lab", { activeCharacter: "Lynae" })).toContain("Which of Lynae's echoes should I re-roll first?");
    expect(suggestionsFor("/weapons")).toContain("Which signature weapon adds the most for me?");
    expect(suggestionsFor("/today")).toContain("When's the reset, and what ends soon?");
    for (const path of ["/", "/my-rankings/", "/settings", "/info/formulas", "/convene", "/energy", "/endgame", "/rotation", "/build-team", "/weapons", "/echo-lab", "/today"]) {
      const list = suggestionsFor(path);
      expect(list.length, path).toBeGreaterThanOrEqual(3);
      expect(list.length, path).toBeLessThanOrEqual(4);
    }
  });

  it("builds the page context (the open team only on /teams)", () => {
    expect(pageContextFor("/teams?x=1", { activeCharacterKey: "Aemeath", openTeam: "Hypercarry" })).toEqual({ route: "/teams", title: "Team rotations", activeCharacter: "Aemeath", openTeam: "Hypercarry" });
    expect(pageContextFor("/inventory", { openTeam: "Hypercarry" }).openTeam).toBeNull();
    expect(pageContextFor("/build-team?team=t1", { openTeam: "Hypercarry" }).openTeam).toBe("Hypercarry");
  });
});
