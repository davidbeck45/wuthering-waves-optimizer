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

describe("the batch-2 page tools in the timeline", () => {
  const row = (name: string, result: unknown, input: unknown = {}) => summarizeTool({ name, input, result: JSON.stringify(result), status: "ok" });

  it("labels every number it shows", () => {
    expect(row("energy_check", { members: [{ character: "Aemeath", status: "short", shortByPoints: 4.4 }, { character: "Lynae", status: "enough" }] })).toMatchObject({ label: "Energy check", headline: "Aemeath short 4.4 pts" });
    expect(row("energy_check", { measured: false }).headline).toBe("not measured");
    expect(row("energy_check", { measured: 3, shortCharacters: [] }, { team: null }).headline).toBe("3 teams · none short");
    expect(row("team_rotation", { teamDps: 367567, blocks: [{ seconds: 27.4 }, { seconds: 25 }] }).headline).toBe("368K DPS · 25 s loop");
    expect(row("team_rotation", { rotation: null }).headline).toBe("no wuwa_calc rotation");
    expect(row("toa_check", { season: 41, floor: "Hazard 4", best: [{ killTime: "0:28", crests: 3 }] }).headline).toBe("Hazard 4: best kill 0:28 · 3 crests");
    expect(row("toa_check", { season: 41, plan: { crests: "34 of 36" } }).headline).toBe("plan: 34 of 36 crests");
    expect(row("toa_check", { season: 42, hpNotPublished: true, floors: [] }).headline).toBe("season 42: floor HP not published yet");
    expect(row("echo_lab", { counts: { keep: 128, spare: 59, feed: 71 } }, { show: "feed" })).toMatchObject({ label: "Echo Lab", chips: ["feed"], headline: "128 keep · 59 spare · 71 feed" });
    expect(row("pull_advice", { items: [{ rank: 1, steps: [{ step: "Lucilla S1", damageGainPct: 10.46 }] }] }).headline).toBe("#1 Lucilla S1 · +10.46 % damage");
    expect(row("pull_advice", { onABannerNow: false }).headline).toBe("not on a banner now");
    expect(row("weapon_value", { signature: { steps: [{ weapon: "Spectrum Blaster R2", ownGainPct: 2.1 }] } }, { character: "Lynae" }).headline).toBe("Spectrum Blaster R2 · +2.1 % damage");
    expect(row("weapon_value", { characters: [{ next: "Azure Oath R4", ownGainPct: 7.07, teamGainPct: 6.38 }] }, { character: null }).headline).toBe("#1 Azure Oath R4 · +6.38 % team damage");
    expect(row("weapon_value", { characters: [{ next: "Blazing Justice R2", ownGainPct: 5.78, teamGainPct: null }] }, { character: null }).headline).toBe("#1 Blazing Justice R2 · +5.78 % own damage");
    expect(row("today", { nextDailyReset: "04:00 tomorrow (in 3h 10m)" }).headline).toBe("daily reset 04:00 tomorrow (in 3h 10m)");
  });

  it("offers the page each tool's result names", () => {
    const links = deepLinksOf([
      { name: "energy_check", input: {}, result: JSON.stringify({ path: "/energy", label: "Energy check" }), status: "ok" },
      { name: "toa_check", input: {}, result: JSON.stringify({ path: "/endgame", label: "ToA clear check" }), status: "ok" },
      { name: "build_team_plan", input: {}, result: JSON.stringify({ path: "/build-team?team=t1", label: "Build my team" }), status: "ok" },
      { name: "team_rotation", input: {}, result: JSON.stringify({ path: "/rotation#team=t269-0.0.0.s1.r0", label: "Rotation cue card" }), status: "ok" },
      { name: "pull_advice", input: {}, result: JSON.stringify({ path: "/convene?tab=advisor", label: "Pull advisor" }), status: "error" },
    ]);
    expect(links.map((l) => (l.kind === "route" ? l.path : l.key))).toEqual(["/energy", "/endgame", "/build-team?team=t1", "/rotation#team=t269-0.0.0.s1.r0"]);
  });
});
