// @vitest-environment node
// Wuthering Tools+ AI: the link team_rotation gives for a saved team that pins a build. The tool plays a pinned team at
// the builds it pins (rileyForTeam), but it linked /rotation by the row it had solved, and a row link carries its own
// picks: the page runs such a row at the ACTIVE builds (useRotationRun keeps a Team rankings row at the account
// /rankings showed it at). So the answer read the pinned builds' DPS and its link opened on another figure. A team at
// its own account is linked by its three members, which the page reads at the saved team's account too.
// A synthetic account; the real engine.
import { describe, expect, it } from "vitest";
import fixture from "../__fixtures__/aiAccount.json";
import { parseExport, type ExportFile } from "../../cli/exportShape";
import { headlessRiley } from "../../cli/aiRiley";
import { energyReport } from "../../energy/energyCli";
import { parseRotationHash } from "../../rotation/hash";
import { runTool } from "./index";
import { MAX_RESULT_CHARS, type ToolContext } from "./shared";

/* eslint-disable @typescript-eslint/no-explicit-any */

const live: ExportFile = parseExport(fixture, "aiAccount.json");
const team = live.teams[0]!;
const ids = team.characterIds as string[];
const dps = ids[0]!;
const weapon: string = live.characters[dps].weapon;
const liveRank = Number(live.characters[dps].weapons?.[weapon]?.refinement ?? 1);
const planRank = liveRank > 3 ? liveRank - 4 : liveRank + 4;

/** The main DPS with a second build, "Account plan", whose weapon sits at another refinement. */
function withPlan(): Record<string, any> {
  const data = live.characters[dps];
  const { builds: _b, activeBuildId: _a, ...rest } = data;
  const fields = JSON.parse(JSON.stringify(rest));
  const plan = { ...fields, id: "plan", name: "Account plan", weapons: { ...fields.weapons, [weapon]: { ...fields.weapons?.[weapon], refinement: String(planRank) } } };
  return { ...live.characters, [dps]: { ...data, activeBuildId: data.activeBuildId ?? "live", builds: [...(data.builds ?? []), plan] } };
}
/** the plan saved and the team pinned to it: a plan saved without "Also make active" */
const pinned: ExportFile = { ...live, characters: withPlan(), teams: [{ ...team, buildIds: ["plan", null, null] }] };
/** the same plan saved, the team left on the active builds */
const unpinned: ExportFile = { ...live, characters: withPlan(), teams: [team] };

const ctxOf = (exp: ExportFile): ToolContext => ({ exp, now: new Date("2026-10-31T06:00:00Z"), riley: headlessRiley });
async function call(name: string, input: unknown, c: ToolContext): Promise<any> {
  const r = await runTool(name, input, c);
  expect(r.content.length).toBeLessThanOrEqual(MAX_RESULT_CHARS);
  if (!r.ok) throw new Error(`${name} failed: ${r.content}`);
  return JSON.parse(r.content);
}

describe("team_rotation on a team that pins a build", () => {
  it("links the page at the address that reads the pinned builds too, and names them", async () => {
    const page = await energyReport(pinned); // `cli er`: the team at its own account, what /rotation#chars=… runs
    const total = page.teams[0]!.measure.status === "ok" ? page.teams[0]!.measure.energy.total : NaN;
    const r = await call("team_rotation", { team: "1" }, ctxOf(pinned));
    expect(r.teamDps).toBe(Math.round(total));
    expect(r.members.find((m: any) => m.character === dps).gear).toContain(` R${planRank} `);
    // by its three members: no picks in the address, so the page asks at the saved team's account
    expect(r.path).toBe(`/rotation#chars=${ids.join(",")}`);
    expect(parseRotationHash(r.path.slice(r.path.indexOf("#"))).target).toEqual({ kind: "chars", chars: ids });
    expect(r.builds).toContain(`${dps} on “Account plan”`);
    // by name, by three names and by his team key: the same team, the same link
    for (const arg of [ids.join(", "), r.wuwaCalcTeam]) expect((await call("team_rotation", { team: arg }, ctxOf(pinned))).path).toBe(r.path);
  }, 180_000);

  it("keeps the row link for a team on the active builds: the row and the page are one account's", async () => {
    const off = await call("team_rotation", { team: "1" }, ctxOf(unpinned));
    expect(off.members.find((m: any) => m.character === dps).gear).toContain(` R${liveRank} `);
    expect(off.path).toMatch(/^\/rotation#team=t\d+-/);
    expect(parseRotationHash(off.path.slice(off.path.indexOf("#"))).target).toMatchObject({ kind: "team", rowKey: expect.any(String) });
    expect(off).not.toHaveProperty("builds");
    // three nobody saved keep it too
    const loose = await call("team_rotation", { team: ids.join(", ") }, ctxOf({ ...unpinned, teams: [] }));
    expect(loose.path).toMatch(/^\/rotation#team=t\d+-/);
    expect(loose).not.toHaveProperty("builds");
  }, 180_000);
});
