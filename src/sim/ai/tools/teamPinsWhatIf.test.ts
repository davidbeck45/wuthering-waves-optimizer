// @vitest-environment node
// Wuthering Tools+ AI: a change laid over a character inside a team that pins a build for them. what_if with `team` and
// substat_weights with `team` built the change (another weapon rank or sequence, one more substat roll) on the
// character's ACTIVE build and then scored the team — whose resolver put the pinned build back on top. So on a team
// with a pin every hypothetical read +0 %, and the substat weights of a pinned build that wears other echoes were all 0.
// A synthetic account; the app's own engine.
import { describe, expect, it } from "vitest";
import fixture from "../__fixtures__/aiAccount.json";
import { parseExport, type ExportFile } from "../../cli/exportShape";
import { calcSubstatWeights, calcTeam } from "../../cli/engine";
import { runTool } from "./index";
import { MAX_RESULT_CHARS, type ToolContext } from "./shared";

/* eslint-disable @typescript-eslint/no-explicit-any */

const live: ExportFile = parseExport(fixture, "aiAccount.json");
const team = live.teams[0]!;
const dps = (team.characterIds as string[])[0]!;
const weapon: string = live.characters[dps].weapon;
const liveRank = Number(live.characters[dps].weapons?.[weapon]?.refinement ?? 1);
const planRank = liveRank > 3 ? liveRank - 4 : liveRank + 4;

/** the main DPS's fields with the weapon at the plan's rank, and (with `echoIds`) wearing those echoes instead */
function planFields(echoIds: string[] | null): Record<string, any> {
  const { builds: _b, activeBuildId: _a, ...rest } = live.characters[dps];
  const fields = JSON.parse(JSON.stringify(rest));
  fields.weapons = { ...fields.weapons, [weapon]: { ...fields.weapons?.[weapon], refinement: String(planRank) } };
  if (echoIds) for (const [slot, echoId] of echoIds.entries()) fields.echoes[slot] = { ...fields.echoes[slot], echoId };
  return fields;
}
/** the plan saved as a second build and pinned in the team: a plan saved without "Also make active" */
function pinnedOn(fields: Record<string, any>): ExportFile {
  const data = live.characters[dps];
  const characters = { ...live.characters, [dps]: { ...data, activeBuildId: data.activeBuildId ?? "live", builds: [...(data.builds ?? []), { ...fields, id: "plan", name: "Account plan" }] } };
  return { ...live, characters, teams: [{ ...team, buildIds: ["plan", null, null] }] };
}
/** the same fields on the live record, the team left unpinned: what "Also make active" leaves */
function activeOn(fields: Record<string, any>): ExportFile {
  const data = live.characters[dps];
  return { ...live, characters: { ...live.characters, [dps]: { ...data, ...fields } }, teams: [team] };
}
/** the echoes no build of the fixture wears */
const spare: string[] = (() => {
  const worn = new Set<string>();
  for (const data of Object.values(live.characters) as any[]) for (const slot of Object.values(data.echoes ?? {}) as any[]) if (slot?.echoId) worn.add(slot.echoId);
  return (live.inventory.echoes as any[]).map((e) => e.echoId as string).filter((id) => !worn.has(id));
})();

const ctxOf = (exp: ExportFile): ToolContext => ({ exp, now: new Date("2026-10-31T06:00:00Z") });
async function call(name: string, input: unknown, c: ToolContext): Promise<any> {
  const r = await runTool(name, input, c);
  expect(r.content.length).toBeLessThanOrEqual(MAX_RESULT_CHARS);
  if (!r.ok) throw new Error(`${name} failed: ${r.content}`);
  return JSON.parse(r.content);
}

describe("what_if on a team that pins a build for the character", () => {
  it("lays the hypothetical over the pinned build: the gain the same builds read once active, never +0 %", async () => {
    const pinned = pinnedOn(planFields(null));
    const active = activeOn(planFields(null));
    for (const change of [{ refinement: liveRank }, { sequence: 0 }, { refinement: liveRank, sequence: 2 }]) {
      const input = { character: dps, team: "1", ...change };
      const onPins = await call("what_if", input, ctxOf(pinned));
      const onActive = await call("what_if", input, ctxOf(active));
      expect(onPins.teamAvg, JSON.stringify(change)).toEqual(onActive.teamAvg);
      expect(Math.abs(onPins.teamAvg.gainPct), JSON.stringify(change)).toBeGreaterThan(0.5);
      expect(onPins.perMember).toEqual(onActive.perMember);
      // "current" is the build the team runs, and the answer says which build that is
      expect(onPins.current).toBe(onActive.current);
      expect(onPins.current).toContain(`R${planRank}`);
      expect(onPins.hypothetical).toBe(onActive.hypothetical);
      expect(onPins.build).toMatch(/Account plan/);
      expect(onActive).not.toHaveProperty("build");
    }
    // a team that pins nothing reads as before: the active build is the one the team runs
    const plain = await call("what_if", { character: dps, team: "1", refinement: planRank }, ctxOf(live));
    expect(plain.current).toContain(`R${liveRank}`);
    expect(Math.abs(plain.teamAvg.gainPct)).toBeGreaterThan(0.5);
    expect(plain).not.toHaveProperty("build");
  }, 120_000);
});

describe("substat_weights on a team that pins a build wearing other echoes", () => {
  it("rolls the extra line on the pinned build's echoes: the weights the same builds read once active", async () => {
    expect(spare.length).toBeGreaterThanOrEqual(5);
    const pinned = pinnedOn(planFields(spare.slice(0, 5)));
    const active = activeOn(planFields(spare.slice(0, 5)));
    // the team's own figure is the pinned build's either way: the baseline was never the bug
    expect((await calcTeam(pinned.teams[0], pinned)).avg).toBeCloseTo((await calcTeam(active.teams[0], active)).avg, 3);

    const onPins = await calcSubstatWeights(dps, pinned, { team: "1", echoes: true });
    const onActive = await calcSubstatWeights(dps, active, { team: "1", echoes: true });
    expect(onPins.baseline).toBeCloseTo(onActive.baseline, 3);
    const gains = (w: typeof onPins) => Object.fromEntries(w.weights.map((s) => [s.key, [Math.round(s.gain * 1e6), Math.round((s.extraGain.team ?? 0) * 1e6)]]));
    expect(gains(onPins)).toEqual(gains(onActive));
    expect(Math.max(...onPins.weights.map((s) => s.gain))).toBeGreaterThan(0.005);
    // the header and the echoes listed are the pinned build's
    expect(onPins.refinement).toBe(planRank);
    expect(onPins.echoes!.map((e) => e.echoId).sort()).toEqual(spare.slice(0, 5).sort());
    expect(onPins.echoes!.map((e) => [e.echoId, Math.round(e.worth * 1e6)])).toEqual(onActive.echoes!.map((e) => [e.echoId, Math.round(e.worth * 1e6)]));

    const said = await call("substat_weights", { character: dps, team: "1" }, ctxOf(pinned));
    expect(said.investment).toContain(`R${planRank}`);
    expect(said.weights[0].gainPct).toBeGreaterThan(0.5);
  }, 120_000);
});
