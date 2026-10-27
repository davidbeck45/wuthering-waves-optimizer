// Wuthering Tools+ AI: the tool timeline rows, deep links and provenance chips the panel shows per answer.
import { describe, expect, it } from "vitest";
import { compactNumber, deepLinksOf, formatMs, prettyJson, provenanceOf, signedPct, summarizeTool, toolViewsOf } from "./toolSummary";

const team = JSON.stringify({ team: "wuwa_calc Aemeath S6R5 DPS", members: ["Aemeath", "Mornye", "Lynae"], total: { avg: 9466750, dps: 378670 } });

describe("summarizeTool", () => {
  it("reads like the timeline row: label · what it was about → the number", () => {
    expect(summarizeTool({ name: "calc_team", input: { team: "1" }, result: team, status: "ok" })).toEqual({
      label: "Team damage",
      chips: ["Aemeath", "Mornye", "Lynae"],
      headline: "9.47M · 379K DPS",
    });
    expect(summarizeTool({ name: "what_if", input: { character: "Mornye", sequence: 2, team: "1" }, result: JSON.stringify({ character: "Mornye", teamAvg: { gainPct: 4.21 }, scoredOn: { team: "Aemeath team" } }), status: "ok" })).toEqual({
      label: "What if",
      chips: ["Mornye", "S2", "Aemeath team"],
      headline: "+4.21 % team",
    });
    expect(summarizeTool({ name: "get_account_summary", input: {}, result: JSON.stringify({ totals: { setUp: 12, teams: 3, echoes: 250 } }), status: "ok" }).headline).toBe("12 set up · 3 teams · 250 echoes");
  });

  it("shows the error for a failed call and nothing yet for a pending one", () => {
    expect(summarizeTool({ name: "calc_team", input: { team: "9" }, result: JSON.stringify({ error: "No saved team matches \"9\"" }), status: "error" })).toMatchObject({
      label: "Team damage",
      chips: ["9"],
      headline: 'No saved team matches "9"',
    });
    expect(summarizeTool({ name: "rank_roster", input: {}, result: null, status: "running" })).toEqual({ label: "Roster ranking", chips: ["top 8"], headline: null });
    expect(summarizeTool({ name: "unknown_tool", input: {}, result: null, status: "preparing" }).label).toBe("unknown_tool");
  });
});

describe("deep links and provenance", () => {
  it("offers the pages that show what the tools computed, deduplicated, routes from tools first", () => {
    const calls = [
      { name: "rankings_link", input: {}, result: JSON.stringify({ path: "/rankings#tc=mine", label: "Team rankings with your account" }), status: "ok" as const },
      { name: "calc_team", input: {}, result: team, status: "ok" as const },
      { name: "calc_character", input: {}, result: JSON.stringify({ character: "Aemeath" }), status: "ok" as const },
      { name: "rank_roster", input: {}, result: "{}", status: "ok" as const },
      { name: "rank_roster", input: {}, result: "{}", status: "ok" as const },
      { name: "search_inventory", input: {}, result: "{}", status: "error" as const },
    ];
    expect(deepLinksOf(calls, 10)).toEqual([
      { key: "route:/rankings#tc=mine", kind: "route", label: "Team rankings with your account", path: "/rankings#tc=mine" },
      { key: "team:wuwa_calc Aemeath S6R5 DPS", kind: "team", label: 'Open "wuwa_calc Aemeath S6R5 DPS"', name: "wuwa_calc Aemeath S6R5 DPS" },
      { key: "character:Aemeath", kind: "character", label: "Aemeath in the calculator", name: "Aemeath" },
      { key: "route:/my-rankings", kind: "route", label: "My roster rankings", path: "/my-rankings" },
    ]);
    // a path that isn't an in-app path is never offered
    expect(deepLinksOf([{ name: "rankings_link", input: {}, result: JSON.stringify({ path: "//evil.example" }), status: "ok" }])).toEqual([]);
  });

  it("lists each successful tool's source once", () => {
    expect(provenanceOf([{ name: "get_account_summary", status: "ok" }, { name: "get_account_summary", status: "ok" }, { name: "calc_team", status: "error" }])).toEqual(["Your account (live data)"]);
  });
});

describe("formatting", () => {
  it("compacts numbers, signs percentages, formats durations and pretty-prints results", () => {
    expect([compactNumber(9312345), compactNumber(372004), compactNumber(950), compactNumber(-1500), compactNumber("x")]).toEqual(["9.31M", "372K", "950", "−1.5K", null]);
    expect([signedPct(4.21), signedPct(-1.5), signedPct(0)]).toEqual(["+4.21 %", "−1.5 %", "±0 %"]);
    expect([formatMs(340), formatMs(1234)]).toEqual(["340 ms", "1.2 s"]);
    expect(prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(prettyJson("not json")).toBe("not json");
    expect(prettyJson("x".repeat(50), 10)).toHaveLength(10);
  });

  it("maps transcript tools to rows with this tab's timings", () => {
    const rows = toolViewsOf(
      [
        { id: "a", name: "calc_team", input: {}, ok: true, result: "{}" },
        { id: "b", name: "calc_team", input: {}, ok: false, result: "{}" },
        { id: "c", name: "calc_team", input: {}, ok: null, result: null },
      ],
      new Map([["a", 812]]),
    );
    expect(rows.map((r) => [r.status, r.ms])).toEqual([["ok", 812], ["error", null], ["error", null]]);
  });
});
