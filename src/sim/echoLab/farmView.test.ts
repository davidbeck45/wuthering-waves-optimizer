// Wuthering Tools+ Echo Lab — the "Farm next" tab's view model: the order the rows stand in, the character filter and
// the words for a target. Only echoLabFarm.cy.ts reached these before (the critic's item 18).
import { describe, expect, it } from "vitest";
import type { FarmRow } from "./farmNext";
import { blockedText, farmCharacters, filterFarmRows, sortFarmRows, speciesText, targetMainText, targetSetText, triesText, withTeamResult } from "./farmView";

type Sortable = Pick<FarmRow, "key" | "expectedGain" | "team">;
const team = (expectedGain: number) => ({ expectedGain }) as FarmRow["team"];
const row = (key: string, expectedGain: number, teamGain?: number): Sortable => ({ key, expectedGain, team: teamGain == null ? null : team(teamGain) });
const keys = (rows: readonly Sortable[]): string[] => rows.map((r) => r.key);

describe("sortFarmRows", () => {
  const rows = [row("own-only-big", 0.2), row("team-low", 0.01, 0.001), row("team-high", 0.02, 0.05), row("own-only-small", 0.03)];

  it("by team: rows with a team figure first, best first, then the rest by own gain", () => {
    expect(keys(sortFarmRows(rows))).toEqual(["team-high", "team-low", "own-only-big", "own-only-small"]);
    expect(keys(sortFarmRows(rows, "team"))).toEqual(keys(sortFarmRows(rows)));
  });

  it("by own: every row by its own gain, whatever its team figure says", () => {
    expect(keys(sortFarmRows(rows, "own"))).toEqual(["own-only-big", "own-only-small", "team-high", "team-low"]);
  });

  it("a team tie falls back to own gain, and an exact tie to the key, so the order never jitters", () => {
    expect(keys(sortFarmRows([row("a", 0.01, 0.05), row("b", 0.02, 0.05)]))).toEqual(["b", "a"]);
    expect(keys(sortFarmRows([row("z", 0.01), row("a", 0.01), row("m", 0.01)]))).toEqual(["a", "m", "z"]);
    expect(keys(sortFarmRows([row("z", 0.01), row("a", 0.01)], "own"))).toEqual(["a", "z"]);
  });

  it("leaves the list it was given alone", () => {
    const given = [row("low", 0.01), row("high", 0.02)];
    sortFarmRows(given);
    expect(keys(given)).toEqual(["low", "high"]);
  });
});

describe("withTeamResult", () => {
  const pending = { key: "k", team: null, teamNote: null, teamPending: true } as unknown as FarmRow;

  it("fills a pending row in, and it stops being pending", () => {
    const filled = withTeamResult(pending, { team: team(0.03), teamNote: "on her best team" });
    expect(filled).toMatchObject({ team: { expectedGain: 0.03 }, teamNote: "on her best team", teamPending: false });
    expect(pending.teamPending).toBe(true);
  });

  it("a figure the first pass already has stays; so does a row with no answer yet", () => {
    const done = { ...pending, team: team(0.01), teamPending: false } as FarmRow;
    expect(withTeamResult(done, { team: team(0.9), teamNote: null })).toBe(done);
    expect(withTeamResult(pending, null)).toBe(pending);
    expect(withTeamResult(pending, undefined)).toBe(pending);
  });
});

describe("the character filter", () => {
  const rows = [
    { characterId: "Zani", name: "Zani" },
    { characterId: "Aemeath", name: "Aemeath" },
    { characterId: "Zani", name: "Zani" },
  ];

  it("'all' keeps every row in a new list, a name only that character's", () => {
    const all = filterFarmRows(rows, "all");
    expect(all).toEqual(rows);
    expect(all).not.toBe(rows);
    expect(filterFarmRows(rows, "Zani")).toHaveLength(2);
    expect(filterFarmRows(rows, "Nobody")).toEqual([]);
  });

  it("lists each character once, by name, with its row count", () => {
    expect(farmCharacters(rows, (id) => id)).toEqual([
      { id: "Aemeath", name: "Aemeath", count: 1 },
      { id: "Zani", name: "Zani", count: 2 },
    ]);
  });

  it("sorts by the name shown, and falls back to the row's own name", () => {
    const named = farmCharacters(rows, (id) => (id === "Zani" ? "A Zani" : ""));
    expect(named.map((c) => c.name)).toEqual(["A Zani", "Aemeath"]);
  });
});

describe("the words", () => {
  it("names a target's cost and main stat", () => {
    expect(targetMainText({ cost: 3, main: "Spectro" } as Parameters<typeof targetMainText>[0])).toMatch(/^Cost 3 · /);
  });

  it("says which Sonata, and what the farmed echo adds to it", () => {
    const set = "EternalRadiance";
    expect(targetSetText({ set, anySet: true, adds: [] })).toBe("Any Sonata: this slot is not part of a set bonus");
    const plain = targetSetText({ set, anySet: false, adds: [] });
    expect(plain.length).toBeGreaterThan(0);
    expect(targetSetText({ set, anySet: false, adds: ["Eternal Radiance 5 Set"] })).toBe(`${plain}: completes the 5-piece`);
    expect(targetSetText({ set, anySet: false, adds: ["Eternal Radiance 2 Set", "Eternal Radiance 5 Set"] })).toBe(`${plain}: completes the 2-piece and completes the 5-piece`);
    expect(targetSetText({ set, anySet: false, adds: ["a bonus with no count"] })).toBe(`${plain}: adds a bonus with no count`);
  });

  it("lists the echoes to farm, a few by name and the rest as a count", () => {
    expect(speciesText([])).toBe("");
    expect(speciesText(["Diurnus Knight"])).toBe("Diurnus Knight");
    expect(speciesText(["Diurnus Knight", "Lumiscale Construct"])).toBe("Diurnus Knight or Lumiscale Construct");
    expect(speciesText(["A", "B", "C"])).toBe("A, B or C");
    expect(speciesText(["A", "B", "C", "D", "E"])).toBe("A, B, C or 2 more");
    expect(speciesText(["A", "B", "C"], 2)).toBe("A, B or 1 more");
  });

  it("says why the swap rules close an alternative, and nothing for an open one", () => {
    expect(blockedText({ blocked: "er" })).toBe("would cost more Energy Regen than one roll");
    expect(blockedText({ blocked: "heal" })).toBe("would lower the build's Healing Bonus");
    expect(blockedText({ blocked: "set" })).toBe("would break a set bonus");
    expect(blockedText({ blocked: null })).toBeNull();
  });

  it("puts a number of tries in words, down to the two that need none", () => {
    expect(triesText(null)).toBe("no try beats it");
    expect(triesText(1)).toBe("every try does");
    expect(triesText(1.005)).toBe("every try does");
    expect(triesText(1.04)).toBe("almost every try does");
    expect(triesText(3.84)).toBe("about 3.8 tries for one that does");
    expect(triesText(12.4)).toBe("about 12 tries for one that does");
  });
});
