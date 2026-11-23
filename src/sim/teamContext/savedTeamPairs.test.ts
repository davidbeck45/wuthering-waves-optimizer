// Wuthering Tools+ — saved teams with a character as pairs for the Team Buffs card (batch 5, lane check-panel).
import { describe, expect, it } from "vitest";
import { otherSavedPairs, savedPairsLine, savedTeamPairs } from "./savedTeamPairs";

const teams = [
  { id: "t1", name: "Sigrika core", characterIds: ["Sigrika", "Mornye", "Lucilla"] },
  { id: "t2", name: "same pair again", characterIds: ["Lucilla", "Sigrika", "Mornye"] },
  { id: "t3", name: "not hers", characterIds: ["Aemeath", "Mornye", "Lynae"] },
  { id: "t4", name: "two members", characterIds: ["Sigrika", "Mornye", null] },
  { id: "t5", characterIds: ["Sigrika", "Chisa", "Suisui"] },
];
const names: Record<string, string> = { Mornye: "Mornye", Lucilla: "Lucilla", Chisa: "Chisa", Suisui: "Suisui" };
const nameOf = (id: string) => names[id] ?? id;

describe("savedTeamPairs", () => {
  it("lists each pair of teammates once, only teams with the character and two others", () => {
    expect(savedTeamPairs(teams, "Sigrika").map((p) => p.mates)).toEqual([
      ["Mornye", "Lucilla"],
      ["Chisa", "Suisui"],
    ]);
    expect(savedTeamPairs(undefined, "Sigrika")).toEqual([]);
  });
});

describe("otherSavedPairs: the saved teams to name beside a picked pair", () => {
  it("names the saved teams when the panel's pair is none of them (David's Sigrika: Shorekeeper + Qiuyuan, saved with Mornye + Lucilla)", () => {
    const out = otherSavedPairs(teams.slice(0, 1), "Sigrika", ["Shorekeeper", "Qiuyuan"]);
    expect(out.map((p) => p.mates)).toEqual([["Mornye", "Lucilla"]]);
    expect(savedPairsLine(out, "Sigrika", nameOf)).toBe("You saved a team of Sigrika with Mornye and Lucilla: tap it to use their real buffs instead.");
  });

  it("names nothing when the panel's pair is a saved team's pair, in either order", () => {
    expect(otherSavedPairs(teams, "Sigrika", ["Lucilla", "Mornye"])).toEqual([]);
    expect(otherSavedPairs(teams, "Sigrika", ["Mornye", "Lucilla"])).toEqual([]);
    expect(otherSavedPairs(teams, "Sigrika", ["Suisui", "Chisa"])).toEqual([]);
  });

  it("names nothing for a character with no saved team, and at most three", () => {
    expect(otherSavedPairs(teams, "Carlotta", ["Iuno", "Shorekeeper"])).toEqual([]);
    const many = ["A", "B", "C", "D"].map((x, i) => ({ id: `m${i}`, characterIds: ["Sigrika", `${x}1`, `${x}2`] }));
    expect(otherSavedPairs(many, "Sigrika", ["Shorekeeper", "Qiuyuan"], 3)).toHaveLength(3);
    const all = otherSavedPairs(many, "Sigrika", ["Shorekeeper", "Qiuyuan"]);
    expect(savedPairsLine(all, "Sigrika", nameOf)).toBe("You saved 4 other teams with Sigrika: tap one to use its teammates' real buffs instead.");
    expect(savedPairsLine([], "Sigrika", nameOf)).toBe("");
  });
});
