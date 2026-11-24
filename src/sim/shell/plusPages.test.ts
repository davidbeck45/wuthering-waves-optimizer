// Wuthering Tools+: the Tools+ menu's sections (PLUS_GROUPS) cover the registry, each page exactly once.
import { describe, expect, it } from "vitest";
import { PLUS_GROUPS, PLUS_PAGES, plusPagesIn } from "./plusPages";

describe("PLUS_GROUPS", () => {
  it("lists every page in exactly one section, and no section is empty", () => {
    const listed = PLUS_GROUPS.flatMap((g) => plusPagesIn(g.id).map((p) => p.path));
    expect(listed).toHaveLength(PLUS_PAGES.length);
    expect(new Set(listed)).toEqual(new Set(PLUS_PAGES.map((p) => p.path)));
    for (const g of PLUS_GROUPS) expect(plusPagesIn(g.id).length, g.title).toBeGreaterThan(0);
  });

  it("names every page's section among the groups, and the groups once each", () => {
    const ids = PLUS_GROUPS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PLUS_PAGES) expect(ids, p.path).toContain(p.group);
  });

  it("keeps sections short enough to fit beside the rail and on a phone (at most four pages each)", () => {
    for (const g of PLUS_GROUPS) expect(plusPagesIn(g.id).length, g.title).toBeLessThanOrEqual(4);
  });

  it("puts the 18 pages where the menu shows them", () => {
    expect(Object.fromEntries(PLUS_GROUPS.map((g) => [g.title, plusPagesIn(g.id).map((p) => p.title)]))).toEqual({
      "My account": ["My account", "My roster rankings", "Build history", "Backups"],
      Rankings: ["Team rankings", "Tier list", "Roster value"],
      Teams: ["Build my team", "Rotation cue cards", "Energy check", "Tower of Adversity"],
      "Echoes and weapons": ["Echo Lab", "Echo plan", "Weapon value"],
      More: ["Resonator briefs", "Today", "Share & import builds", "What's new"],
    });
  });
});
