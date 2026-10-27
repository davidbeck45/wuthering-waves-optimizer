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
    for (const path of ["/", "/my-rankings/", "/settings", "/info/formulas"]) {
      const list = suggestionsFor(path);
      expect(list.length, path).toBeGreaterThanOrEqual(3);
      expect(list.length, path).toBeLessThanOrEqual(4);
    }
  });

  it("builds the page context (the open team only on /teams)", () => {
    expect(pageContextFor("/teams?x=1", { activeCharacterKey: "Aemeath", openTeam: "Hypercarry" })).toEqual({ route: "/teams", title: "Team rotations", activeCharacter: "Aemeath", openTeam: "Hypercarry" });
    expect(pageContextFor("/inventory", { openTeam: "Hypercarry" }).openTeam).toBeNull();
  });
});
