// @vitest-environment node
// Wuthering Tools+ AI: the tools on Riley31415's engine (energy_check, team_rotation, build_team_plan, toa_check) on the
// fixture account (Aemeath / Mornye / Lynae, src/sim/ai/__fixtures__/aiAccount.json) through the headless seam the CLI
// uses (src/sim/cli/aiRiley.ts — the browser hands in rileyClient() instead), plus fakes for the refusals.
import { describe, expect, it } from "vitest";
import fixture from "../__fixtures__/aiAccount.json";
import { parseExport, type ExportFile } from "../../cli/exportShape";
import { headlessRiley } from "../../cli/aiRiley";
import { readOnlyStorage, runTool } from "./index";
import { MAX_RESULT_CHARS, type ToolContext } from "./shared";
import { teamTarget, type RileyToolEngine } from "./riley";
import { floorIdOf, seasonCheck, TOA_CHECK_KEY } from "./endgame";

const exp: ExportFile = parseExport(fixture, "aiAccount.json");
/** inside ToA season 41 (2026-10-12 → 11-09) */
const ctx: ToolContext = { exp, now: new Date("2026-10-31T06:00:00Z"), riley: headlessRiley };

async function call(name: string, input: unknown, c: ToolContext = ctx): Promise<any> {
  const r = await runTool(name, input, c);
  expect(r.content.length).toBeLessThanOrEqual(MAX_RESULT_CHARS);
  if (!r.ok) throw new Error(`${name} failed: ${r.content}`);
  return JSON.parse(r.content);
}

describe("team arguments", () => {
  it("a saved team by name or index, or three characters by name", () => {
    expect(teamTarget("1", exp)).toMatchObject({ characterIds: ["Aemeath", "Mornye", "Lynae"] });
    expect(teamTarget("aemeath", exp).saved).not.toBeNull();
    const three = teamTarget("lynae, aemeath + Mornye", exp);
    expect(three.characterIds).toEqual(["Lynae", "Aemeath", "Mornye"]);
    expect(three.saved?.id).toBe("ay50jixqddo"); // the same three are a saved team: its builds and name
    expect(teamTarget("Shorekeeper, Lynae, Iuno", exp)).toMatchObject({ name: "Shorekeeper · Lynae · Iuno", saved: null });
    expect(() => teamTarget("Aemeath, Mornye", exp)).toThrow(/three characters/);
    expect(() => teamTarget("Aemeath, Aemeath, Mornye", exp)).toThrow(/same character twice/);
    expect(() => teamTarget("Ganymede", exp)).toThrow(/No team "Ganymede"/);
  });
});

describe("tools on Riley's engine", () => {
  it("energy_check: each member's ER need beside the build's, and every saved team's floors", async () => {
    const r = await call("energy_check", { team: "1" });
    expect(r).toMatchObject({ measured: true, saved: true, path: "/energy", label: "Energy check" });
    expect(r.wuwaCalcTeam).toMatch(/^t\d+$/);
    expect(r.teamDps).toBeGreaterThan(100_000);
    expect(r.members.map((m: any) => m.character).sort()).toEqual(["Aemeath", "Lynae", "Mornye"]);
    for (const m of r.members) {
      expect(m.erHavePct).toBeGreaterThan(100);
      expect(m.erNeedPct === null || m.erNeedPct >= 100).toBe(true);
      expect(m.status).toMatch(/^(short|enough|enough, but within 5 points|no energy gate)/);
      if (m.status === "short") expect(m.erRollsShort).toBeGreaterThanOrEqual(1);
    }
    const shares = r.members.reduce((n: number, m: any) => n + m.teamDpsSharePct, 0);
    expect(shares).toBeGreaterThan(90); // the rest is the Tune Break slot
    const all = await call("energy_check", { team: null });
    expect(all).toMatchObject({ savedTeams: 1, measured: 1 });
    expect(all.erFloors.length).toBeGreaterThan(0);
    expect(all.teams[0].members).toHaveLength(3);
  }, 60_000);

  it("team_rotation: the cue card as swap lines, opener then the loop, and the page link", async () => {
    const r = await call("team_rotation", { team: "Aemeath, Mornye, Lynae" });
    expect(r.blocks[0].block).toBe("Opener");
    expect(r.blocks.length).toBeGreaterThan(1);
    for (const b of r.blocks) for (const line of b.swaps) expect(line).toMatch(/^(Aemeath|Mornye|Lynae): .+ · \d+\.\d s/);
    expect(r.fightSeconds).toBeGreaterThan(60);
    expect(r.path).toMatch(/^\/rotation#team=t\d+-/);
    // the page's own address names a row of his list: the tools read it as that composition
    const byKey = await call("team_rotation", { team: r.path.replace(/^\/rotation#team=/, "") });
    expect(byKey.wuwaCalcTeam).toBe(r.wuwaCalcTeam);
    expect(byKey.team).toBe(r.team);
    const solo = await runTool("team_rotation", { team: "Aemeath" }, { ...ctx, riley: null });
    expect(JSON.parse(solo.content).error).toMatch(/not available here/);
  }, 60_000);

  it("build_team_plan: sets, main echo, layout and ER need per member, as a dry run", async () => {
    const before = JSON.stringify(exp);
    const r = await call("build_team_plan", { team: "1" });
    expect(r.path).toBe("/build-team?team=ay50jixqddo");
    expect(r.members).toHaveLength(3);
    for (const m of r.members) {
      expect(m.planFrom).toBe("wuwa_calc's best pick at your account");
      expect(m.sets).toMatch(/\dpc/);
      expect(m.layout).toMatch(/^4/);
      expect(m.mainStats).toHaveLength(5);
      expect(m.fittingEchoes).toBeGreaterThanOrEqual(0);
    }
    expect(r.teamDpsToday).toBeGreaterThan(0);
    // a dry run: the account is exactly as it was
    expect(JSON.stringify(exp)).toBe(before);
  }, 60_000);

  it("toa_check: a floor's best teams with kill time and crests, every floor with a Vigor plan, the page's check reused", async () => {
    const found = await seasonCheck(ctx, null);
    expect(found?.season.season).toBe(41);
    expect(found!.reused).toBe(false);
    const stored = { [TOA_CHECK_KEY]: JSON.stringify({ v: 1, check: found!.check }) };
    // an engine that may not solve: the stored check must answer
    const real = await headlessRiley(exp);
    const noSolve: RileyToolEngine = { ...real, solveMine: async () => Promise.reject(new Error("solved again")), curves: async () => Promise.reject(new Error("fought again")) };
    const cached: ToolContext = { ...ctx, riley: async () => noSolve, storage: readOnlyStorage(stored) };
    const one = await call("toa_check", { floor: "Hazard 4" }, cached);
    expect(one.from).toMatch(/last check/);
    expect(one.floor).toBe("Hazard 4");
    expect(one.crestGoalsSecondsLeft).toHaveLength(3);
    expect(one.best.length).toBeGreaterThan(0);
    for (const b of one.best) {
      expect(b.crests).toBeGreaterThanOrEqual(0);
      expect(b.killTime).toMatch(/^\d+:\d\d$|doesn't clear/);
    }
    // the best saved team is named below the list only when the list doesn't already hold it
    if (one.best.some((b: any) => b.saved)) expect(one.yourBestSavedTeam).toBeUndefined();
    else if (one.yourBestSavedTeam) expect(one.yourBestSavedTeam.saved).toBeTruthy();
    const every = await call("toa_check", { floor: null }, cached);
    for (const f of every.floors) if (f.best.some((b: any) => b.saved)) expect(f.yourBestSavedTeam, f.floor).toBeUndefined();
    expect(every.floors.map((f: any) => f.floor)).toContain("Hazard 1");
    expect(every.plan.stages).toHaveLength(12);
    expect(every.plan.crests).toMatch(/^\d+ of \d+$/);
    await expect(runTool("toa_check", { floor: "Hazard 9" }, cached).then((x) => JSON.parse(x.content).error)).resolves.toMatch(/not a timed floor/);
    expect(floorIdOf("hazard-4", found!.season)).toBe("hazard-4");
    expect(floorIdOf("Echoing Tower 4", found!.season)).toBe("echoing-4");
    expect(floorIdOf("Resonant 2", found!.season)).toBeNull(); // not timed
  }, 120_000);
});

describe("refusals, on a fake engine", () => {
  const fake = (over: Partial<RileyToolEngine> = {}): ToolContext => ({
    ...ctx,
    riley: async () => ({
      commit: "fake",
      account: null,
      teams: async () => [],
      teamKeysFor: async () => [],
      solveMine: async () => [],
      tracedRun: async () => Promise.reject(new Error("no run")),
      curves: async () => [],
      ...over,
    }),
  });

  it("a team wuwa_calc doesn't list is 'not measured' / has no rotation, never a guess", async () => {
    const er = await call("energy_check", { team: "1" }, fake());
    expect(er).toMatchObject({ measured: false, why: "not one of wuwa_calc's current compositions" });
    const rot = await call("team_rotation", { team: "1" }, fake());
    expect(rot.rotation).toBeNull();
    expect(rot.why).toMatch(/not one of wuwa_calc's current compositions/);
  });

  it("an unreleased member is named", async () => {
    const hidden = fake({
      teamKeysFor: async () => ["t1"],
      solveMine: async (keys) => keys.map((teamKey) => ({ teamKey, names: [], appKeys: [], status: "skipped" as const, reason: "notInApp" as const, notInApp: ["Lily"], fieldable: false, best: null })),
    });
    const rot = await call("team_rotation", { team: "1" }, hidden);
    expect(rot.why).toMatch(/Lily, not released in this app/);
  });
});
