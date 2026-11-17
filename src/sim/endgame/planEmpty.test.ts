// The Plan tab's sentence while there is no plan. 2026-11-16, second check of the no-HP season: the day after
// Season 42 ends the tab still read "The plan comes once Season 42's floor HP is published", under a banner that says
// the season is over and Season 43's data is due. An ended season waits for nothing and cannot be checked again.
import { describe, expect, it } from "vitest";
import { planEmptyText } from "./planEmpty";

const base = { season: 42, ended: false, next: null, pending: 0, running: false, hasAccount: true };

describe("what the Plan tab says while there is no plan", () => {
  it("a running season without floor HP waits for the HP", () => {
    expect(planEmptyText({ ...base, pending: 6 })).toBe("The plan comes once Season 42's floor HP is published: until then no team can be timed on the floors still waiting for it.");
    expect(planEmptyText({ ...base, pending: 1 })).toContain("on a floor still waiting for it");
  });

  it("an ended season waits for nothing: it names the season that is due, with or without its own HP", () => {
    for (const pending of [6, 0]) {
      const text = planEmptyText({ ...base, ended: true, next: 43, pending });
      expect(text).toBe("Season 42 has ended. The plan comes with Season 43's floors, once they are in this page's data.");
      expect(text).not.toContain("floor HP is published");
      expect(text).not.toContain("Check your teams");
    }
    // the next season's number, where the status does not carry it
    expect(planEmptyText({ ...base, ended: true })).toContain("Season 43's floors");
  });

  it("a running season with HP: fighting, then the check, then the account", () => {
    expect(planEmptyText({ ...base, running: true })).toBe("The plan appears once every team has fought the floors.");
    expect(planEmptyText(base)).toBe("Check your teams first.");
    expect(planEmptyText({ ...base, hasAccount: false })).toBe("Import your account to plan the zone.");
  });
});
