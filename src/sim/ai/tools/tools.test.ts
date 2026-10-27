// Wuthering Tools+ AI: every tool on a small real account (src/sim/ai/__fixtures__/aiAccount.json — Aemeath,
// Mornye and Lynae with their equipped echoes, five spares and their team, trimmed from a real export).
import { beforeAll, describe, expect, it } from "vitest";
import fixture from "../__fixtures__/aiAccount.json";
import { parseExport, type ExportFile } from "../../cli/exportShape";
import { optionalParamCount, strictSchemaProblems } from "../schema";
import { AI_TOOLS, clearToolMemo, findTool, previewOf, runTool, toolDefinitions } from "./index";
import { rankingFor } from "./memo";
import { compactJson, MAX_RESULT_CHARS, resolveAnyCharacter, resolveOwnCharacter, weaponName } from "./shared";
import { resolveStatKey } from "./inventory";
import { plainText } from "./kit";
import { prettyKey } from "./team";

const exp: ExportFile = parseExport(fixture, "aiAccount.json");
const ctx = { exp, now: new Date("2026-10-12T12:00:00Z") };

async function call(name: string, input: unknown): Promise<any> {
  const r = await runTool(name, input, ctx);
  expect(r.content.length).toBeLessThanOrEqual(MAX_RESULT_CHARS);
  if (!r.ok) throw new Error(`${name} failed: ${r.content}`);
  return JSON.parse(r.content);
}

describe("tool registry", () => {
  it("has the twelve read-only tools in a fixed order with unique names", () => {
    expect(AI_TOOLS.map((t) => t.name)).toEqual([
      "get_account_summary",
      "calc_character",
      "calc_team",
      "rank_roster",
      "substat_weights",
      "what_if",
      "list_rotations",
      "list_team_presets",
      "sequence_breakpoints",
      "get_kit",
      "search_inventory",
      "rankings_link",
    ]);
    expect(new Set(AI_TOOLS.map((t) => t.name)).size).toBe(AI_TOOLS.length);
    for (const t of AI_TOOLS) {
      expect(t.description.length).toBeGreaterThan(120);
      expect(t.provenance.length).toBeGreaterThan(5);
    }
  });

  it("only uses schema features strict tool use accepts, within the request limits", () => {
    for (const t of AI_TOOLS) expect(strictSchemaProblems(t.input_schema), t.name).toEqual([]);
    // 24 optional parameters / 20 strict tools per request
    expect(AI_TOOLS.reduce((n, t) => n + optionalParamCount(t.input_schema), 0)).toBeLessThanOrEqual(24);
    expect(AI_TOOLS.length).toBeLessThanOrEqual(20);
  });

  it("serialises byte-identically every time (tools sit first in the cache prefix)", () => {
    const a = JSON.stringify(toolDefinitions({ eager: true }));
    const b = JSON.stringify(toolDefinitions({ eager: true }));
    expect(a).toBe(b);
    const defs = toolDefinitions({ eager: true });
    expect(defs.every((d) => d.strict === true && d.eager_input_streaming === true)).toBe(true);
    expect(toolDefinitions().some((d) => "eager_input_streaming" in d)).toBe(false);
  });

  it("turns unknown tools, invalid input and thrown errors into error results", async () => {
    const unknown = await runTool("drop_database", {}, ctx);
    expect(unknown.ok).toBe(false);
    expect(JSON.parse(unknown.content).error).toMatch(/Unknown tool/);
    const invalid = await runTool("calc_character", { character: 3 }, ctx);
    expect(invalid.ok).toBe(false);
    expect(JSON.parse(invalid.content)).toMatchObject({ INVALID_JSON: '{"character":3}' });
    const missing = await runTool("calc_team", {}, ctx);
    expect(JSON.parse(missing.content).error).toMatch(/team is required/);
    const thrown = await runTool("calc_character", { character: "Phoebe" }, ctx);
    expect(thrown.ok).toBe(false);
    expect(JSON.parse(thrown.content).error).toMatch(/No character "Phoebe"/);
    expect(thrown.preview).toMatch(/No character/);
  });
});

describe("tools on the fixture account", () => {
  beforeAll(() => clearToolMemo());

  it("get_account_summary lists set-up characters with display names and investment", async () => {
    const r = await call("get_account_summary", {});
    expect(r.totals).toMatchObject({ charactersInApp: 4, setUp: 3, teams: 1, fieldableTeams: 1 });
    expect(r.activeCharacter).toBe("Aemeath");
    expect(r.setUp[0]).toMatchObject({ name: "Aemeath", investment: "S6 · Everbright Polestar R5", builds: 2, savedRotations: 1 });
    expect(r.setUp.map((c: any) => c.name)).toEqual(["Aemeath", "Lynae", "Mornye"]);
    expect(r.notSetUp).toEqual(["Augusta"]);
    expect(r.teams[0].members).toEqual(["Aemeath", "Mornye", "Lynae"]);
  });

  it("calc_character returns the stat cards, top attacks and saved rotations", async () => {
    const r = await call("calc_character", { character: "aemeath" });
    expect(r.character).toBe("Aemeath");
    expect(r.investment).toBe("S6 · Everbright Polestar R5");
    expect(r.stats["Crit Rate"]).toMatch(/%$/);
    expect(r.stats.ATK).toMatch(/^[\d,]+$/);
    expect(r.topAttacks.length).toBe(8);
    expect(r.topAttacks[0].avg).toBeGreaterThanOrEqual(r.topAttacks[1].avg);
    expect(Number.isInteger(r.topAttacks[0].avg)).toBe(true);
    expect(r.savedRotations).toHaveLength(1);
    expect(r.savedRotations[0].avg).toBeGreaterThan(1_000_000);
    const more = await call("calc_character", { character: "Aemeath", include_attacks: true });
    expect(more.topAttacks.length).toBeGreaterThan(8);
  });

  it("calc_team gives the total, each slot's share and where its buffs came from", async () => {
    const r = await call("calc_team", { team: "1" });
    expect(r.members).toEqual(["Aemeath", "Mornye", "Lynae"]);
    expect(r.enemy).toBe("Lv 100 / 20 % RES");
    expect(r.total.avg).toBeGreaterThan(1_000_000);
    expect(r.durationS).toBeGreaterThan(0);
    expect(r.total.dps).toBeCloseTo(r.total.avg / r.durationS, -1);
    const shares = r.slots.map((s: any) => s.sharePct);
    expect(shares.reduce((a: number, b: number) => a + b, 0)).toBeCloseTo(100, 0);
    expect(r.slots[0].character).toBe("Aemeath");
    expect(r.slots.every((s: any) => typeof s.buffs === "string" && s.enabledBuffs >= 0)).toBe(true);
    // the same team by loose name
    const byName = await call("calc_team", { team: "aemeath" });
    expect(byName.total.avg).toBe(r.total.avg);
  });

  it("rank_roster ranks characters and teams on the ranking enemy, memoised", async () => {
    const r = await call("rank_roster", { top: 3 });
    expect(r.enemy).toBe("Lv 100 / 20 % RES");
    expect(r.charactersRanked).toBe(3);
    expect(r.characters).toHaveLength(3);
    expect(r.characters[0].avg).toBeGreaterThanOrEqual(r.characters[1].avg);
    const mornye = r.characters.find((c: any) => c.character === "Mornye");
    expect(mornye.nextSequence.label).toBe("S2");
    expect(r.teams.length).toBeGreaterThan(0);
    expect(r.teams[0].members.sort()).toEqual(["Aemeath", "Lynae", "Mornye"]);
    expect(r.teams[0].slotSharePct).toHaveLength(3);
    // memoised per account state: the same computation is reused until the account changes
    expect(rankingFor(exp)).toBe(rankingFor(exp));
    const edited: ExportFile = { ...exp, characters: { ...exp.characters, Augusta: { weapon: "x" } } };
    const editedRanking = rankingFor(edited);
    expect(editedRanking).not.toBe(rankingFor(exp));
    await editedRanking;
    const again = await call("rank_roster", { top: 3 });
    expect(again.characters).toEqual(r.characters);
    // a clamp, not a schema bound
    expect((await call("rank_roster", { top: 99 })).characters.length).toBe(3);
  });

  it("substat_weights ranks substats and the equipped echoes' worth", async () => {
    const r = await call("substat_weights", { character: "Aemeath" });
    expect(r.weights).toHaveLength(13);
    expect(r.weights[0].weight).toBe(100);
    expect(r.lookFor[0]).toBe(r.weights[0].substat);
    expect(r.equippedEchoes.length).toBe(5);
    expect(r.equippedEchoes[0].worthPct).toBeLessThanOrEqual(r.equippedEchoes[4].worthPct);
    expect(r.equippedEchoes[0].echo).not.toMatch(/^[A-Z][a-z]+[A-Z]/); // display names, not registry keys
    const onTeam = await call("substat_weights", { character: "Aemeath", team: "1" });
    expect(onTeam.scoredOn.members).toEqual(["Aemeath", "Mornye", "Lynae"]);
    expect(onTeam.baselineTeamAvg).toBeGreaterThan(onTeam.baselineAvg);
  });

  it("what_if scores a sequence alone and inside the team", async () => {
    const solo = await call("what_if", { character: "Mornye", sequence: 2 });
    expect(solo.current).toBe("S1 · Starfield Calibrator R1");
    expect(solo.hypothetical).toBe("S2 · Starfield Calibrator R1");
    expect(solo.avg.before).toBeGreaterThan(0);
    const team = await call("what_if", { character: "Mornye", sequence: 2, team: "Aemeath" });
    expect(team.teamAvg.after).toBeGreaterThanOrEqual(team.teamAvg.before);
    expect(team.perMember.map((m: any) => m.character)).toEqual(["Aemeath", "Mornye", "Lynae"]);
    const r1 = await call("what_if", { character: "Aemeath", refinement: 1 });
    expect(r1.avg.gainPct).toBeLessThan(0);
    const weapon = await call("what_if", { character: "Aemeath", weapon: "emerald of genesis" });
    expect(weapon.hypothetical).toBe("S6 · Emerald Of Genesis R1");
    await expect(runTool("what_if", { character: "Aemeath" }, ctx).then((x) => JSON.parse(x.content).error)).resolves.toMatch(/at least one/);
    await expect(runTool("what_if", { character: "Aemeath", weapon: "Stringmaster" }, ctx).then((x) => JSON.parse(x.content).error)).resolves.toMatch(/No weapon "Stringmaster"/);
    await expect(runTool("what_if", { character: "Aemeath", sequence: 7 }, ctx).then((x) => x.ok)).resolves.toBe(false);
  });

  it("list_rotations scores every candidate, best first", async () => {
    const r = await call("list_rotations", { character: "Lynae" });
    expect(r.rotations.length).toBeGreaterThan(1);
    expect(r.rotations[0].avg).toBeGreaterThanOrEqual(r.rotations[1].avg);
    expect(r.rotations.some((x: any) => x.source === "your saved rotation")).toBe(true);
  });

  it("list_team_presets filters to fieldable teams, or shows who is missing", async () => {
    const r = await call("list_team_presets", { character: "Aemeath" });
    expect(r.teams.length).toBeGreaterThan(0);
    for (const t of r.teams) expect(t.members.sort()).toEqual(["Aemeath", "Lynae", "Mornye"]);
    const all = await call("list_team_presets", { character: "Aemeath", fieldable_only: false });
    expect(all.matching).toBeGreaterThan(r.matching);
    expect(all.teams.some((t: any) => t.notSetUp.length > 0)).toBe(true);
  });

  it("sequence_breakpoints and get_kit read any character the app knows", async () => {
    const bp = await call("sequence_breakpoints", { character: "Aemeath" });
    expect(bp.available).toBe(true);
    expect(bp.yourSequence).toBe("S6");
    expect(bp.loadouts[0].summary).toMatch(/S\d|loop/);
    expect(bp.sequences).toHaveLength(6);
    const kit = await call("get_kit", { character: "Mornye" });
    expect(kit.skills["Resonance Liberation"]).toBeTruthy();
    expect(kit.sequences).toHaveLength(6);
    expect(kit.sequences[0]).toMatchObject({ level: "S1", unlocked: true });
    expect(kit.sequences[1]).toMatchObject({ level: "S2", unlocked: false });
    expect(kit.sequences[0].text).not.toMatch(/<[a-z]/i);
    const one = await call("get_kit", { character: "Phoebe", sequence: 2 });
    expect(one.yourSequence).toBe("not set up");
    expect(one.sequences).toHaveLength(1);
    expect(one.sequences[0].level).toBe("S2");
  });

  it("search_inventory filters and sorts echo rows", async () => {
    const all = await call("search_inventory", {});
    expect(all.matching).toBe(exp.inventory.echoes.length);
    expect(all.echoes[0].cv).toBeGreaterThanOrEqual(all.echoes[1].cv);
    const fodder = await call("search_inventory", { equipped: "unequipped", sort: "crit_value_asc" });
    expect(fodder.matching).toBe(5);
    expect(fodder.echoes.every((e: any) => e.equippedBy.length === 0)).toBe(true);
    expect(fodder.echoes[0].cv).toBeLessThanOrEqual(fodder.echoes[1].cv);
    const worn = await call("search_inventory", { equipped_by: "Mornye" });
    expect(worn.matching).toBe(5);
    expect(worn.echoes[0].equippedBy[0]).toMatch(/^Mornye \(slot \d\)$/);
    const crit = await call("search_inventory", { cost: 4, main: "CRIT DMG", sort: "crit_value" });
    for (const e of crit.echoes) expect(e).toMatchObject({ cost: 4, main: "Crit DMG 44%" });
    const sub = await call("search_inventory", { substat: "cr", sort: "substat_value" });
    expect(sub.echoes.every((e: any) => /\bCR \d/.test(e.substats))).toBe(true);
    const bad = await runTool("search_inventory", { sort: "substat_value" }, ctx);
    expect(JSON.parse(bad.content).error).toMatch(/needs the substat filter/);
  });

  it("rankings_link returns a path, never navigates", async () => {
    const r = await call("rankings_link", { characters: ["Aemeath", "Mornye"] });
    expect(r.path).toBe("/rankings#tc=mine&r=Aemeath,Mornye");
    expect((await call("rankings_link", {})).path).toBe("/rankings#tc=mine");
  });
});

describe("tool helpers", () => {
  it("resolves names loosely", () => {
    expect(resolveOwnCharacter("LYNAE", exp)).toBe("Lynae");
    expect(() => resolveOwnCharacter("Phoebe", exp)).toThrow(/No character/);
    expect(resolveAnyCharacter("Phoebe", exp)).toBe("Phoebe");
    expect(resolveAnyCharacter("Yangyang: Xuanling", exp)).toBe("YangyangXuanling");
    expect(() => resolveAnyCharacter("Rover Havoc", exp)).toThrow(/Ambiguous/);
    expect(resolveStatKey("crit dmg")).toBe("CritDMG");
    expect(resolveStatKey("CR")).toBe("CritRate");
    expect(resolveStatKey("flat atk")).toBe("ATK_FLAT");
    expect(resolveStatKey("ATK")).toBe("ATK");
    expect(resolveStatKey("Fusion DMG Bonus")).toBe("Fusion");
    expect(weaponName("EverbrightPolestar")).toBe("Everbright Polestar");
    expect(prettyKey("SequenceNode2IntoLightsVanishingPoint")).toBe("Sequence Node 2 Into Lights Vanishing Point");
    expect(plainText('<div>A <span class="Highlight"><strong>B</strong></span>&amp;C<br>D</div>')).toBe("A B&C D");
  });

  it("compactJson halves the longest list until the text fits, and says so", () => {
    const big = { rows: Array.from({ length: 500 }, (_, i) => ({ i, label: `row ${i}` })), keep: "me" };
    const text = compactJson(big, 2000);
    expect(text.length).toBeLessThanOrEqual(2000);
    const back = JSON.parse(text);
    expect(back.keep).toBe("me");
    expect(back.rows.length).toBeLessThan(500);
    expect(back._truncated).toMatch(/rows/);
    expect(compactJson({ a: 1 })).toBe('{"a":1}');
  });

  it("previews results in one line", () => {
    expect(previewOf('{"character":"Aemeath","avg":123,"rows":[1,2]}')).toBe("character: Aemeath · avg: 123 · rows: 2");
    expect(previewOf('{"error":"nope"}')).toBe("nope");
    expect(findTool("calc_team")?.name).toBe("calc_team");
  });
});
