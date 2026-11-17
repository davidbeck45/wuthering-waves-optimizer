// `npm run cli -- levels <character>`: the level plan headless, on the assistant's fixture account (Aemeath, Mornye and
// Lynae with their saved team; nothing is saved below the top there, like most real accounts).
import { describe, expect, it } from "vitest";
import fixture from "../ai/__fixtures__/aiAccount.json";
import { parseExport, type ExportFile } from "../cli/exportShape";
import { RANKING_ENEMY, rankRoster, scoreRotation } from "../myRankings/rankRoster";
import { levelsJson, levelsReport, parseLevels, printLevels } from "./levelsCli";
import { withLevels } from "./levelSteps";

const exp: ExportFile = parseExport(fixture, "aiAccount.json");

describe("cli levels", () => {
  it("reads --at as levels by track and refuses what it does not know", () => {
    expect(parseLevels("level=80, weapon=70+,basic=6")).toEqual({ level: "80", weapon: "70+", basic: "6" });
    expect(() => parseLevels("echo=5")).toThrow(/--at takes level=…,weapon=…,basic=…/);
    expect(() => parseLevels(" , ")).toThrow(/needs at least one level/);
  });

  it("from the saved levels of an account that never set any: nothing left, and it says what was not saved", async () => {
    const plan = await levelsReport(exp, "aemeath");
    expect(plan.done).toBe(true);
    const text = printLevels(plan);
    expect(text).toContain("Aemeath: what each level is worth, from the saved levels");
    expect(text).toContain("Not saved in the calculator, so counted at the top: level, weapon level");
    expect(text).toMatch(/Nothing left to level\.$/);
    expect(levelsJson(plan)).toMatchObject({ character: "Aemeath", from: "saved", done: true, rows: [], path: [] });
  }, 60_000);

  it("from levels given by hand: a row is the engine at the new level against the level given, and the tables say so", async () => {
    const plan = await levelsReport(exp, "Lynae", { at: "level=80,liberation=6" });
    expect(plan.from).toBe("custom");
    expect(plan.rows.map((r) => r.label).sort()).toEqual(["Level 80 → 90", "Resonance Liberation 6 → 10"]);
    // the same two runs by hand, through the ranking's own scorer
    const ranking = await rankRoster(exp.characters, exp.inventory.echoes, exp.teams, { yieldToUi: false });
    const rotation = ranking.characters.find((c) => c.id === "Lynae")!.bestRotation!;
    const at = (level: string) => ({ ...exp.characters, Lynae: { ...exp.characters.Lynae, characterLevel: level, talents: { ...(exp.characters.Lynae.talents ?? {}), liberation: 6 } } });
    const low = (await scoreRotation(rotation, "Lynae", at("80"), RANKING_ENEMY, exp.inventory.echoes)).avgDamage;
    const high = (await scoreRotation(rotation, "Lynae", at("90"), RANKING_ENEMY, exp.inventory.echoes)).avgDamage;
    const level = plan.rows.find((r) => r.track === "level")!;
    expect(level.own!.base).toBeCloseTo(low, 6);
    expect(level.own!.after).toBeCloseTo(high, 6);
    expect(withLevels(exp.characters.Lynae, level.next).characterLevel).toBe("90");

    const text = printLevels(plan);
    expect(text).toContain("Lynae: what each level is worth, from the levels given");
    expect(text).toContain("Start: Level 80 · weapon level 90 · Forte skills 10 / 10 / 10 / 6 / 10");
    expect(text).toContain("Each on its own, to its top (biggest gain in team damage first)");
    expect(text).toMatch(/Level 80 → 90\s+\+\d+\.\d\d%\s+\+\d+\.\d\d%\s+349,115 Shell Credits · 39 × Premium Resonance Potion · 1 ascension\s+3 materials/);
    expect(text).toContain("Level in this order. Each step is the one that adds the most team damage for its Shell Credits at that point.");
    expect(text).toMatch(/The first 3 steps give \+[\d.]+% team damage for [\d,]+ Shell Credits\./);
    expect(text).toContain("Not in this list: the two inherent skills and the eight stat bonuses.");

    const json = levelsJson(plan) as any;
    expect(json).toMatchObject({ character: "Lynae", from: "custom", done: false, basis: "team", pathOrder: "value", pathState: "complete" });
    expect(json.rows.find((r: any) => r.track === "level")).toMatchObject({ step: "Level 80 → 90", ownGain: level.own!.gain, cost: { shellCredits: 349_115, ascensions: 1, expItems: [{ name: "Premium Resonance Potion", count: 39 }] } });
    expect(json.path).toHaveLength(5); // one level cap, four Resonance Liberation levels
    expect(json.path.at(-1).soFar.shellCredits).toBe(json.everything.cost.shellCredits);
    expect(JSON.stringify(json)).not.toContain('"next"'); // the engine's working states stay out
  }, 60_000);

  it("--from 1 counts a new copy, --by gain orders by the biggest gain, --team measures on a saved team", async () => {
    const scratch = await levelsReport(exp, "Mornye", { from: "1", by: "gain", team: "1" });
    expect(scratch.from).toBe("scratch");
    expect(scratch.pathOrder).toBe("gain");
    expect(scratch.rows).toHaveLength(7);
    expect(scratch.team).toMatchObject({ id: exp.teams[0].id });
    expect(printLevels(scratch)).toContain("Mornye: what each level is worth, from level 1");
    await expect(levelsReport(exp, "Mornye", { from: "today" })).rejects.toThrow(/--from must be "saved" or "1"/);
    await expect(levelsReport(exp, "Mornye", { by: "luck" })).rejects.toThrow(/--by must be "value" or "gain"/);
    await expect(levelsReport(exp, "Mornye", { team: "no such team" })).rejects.toThrow(/No team "no such team"/);
    await expect(levelsReport(exp, "Phoebe")).rejects.toThrow(/No character "Phoebe"/);
  }, 60_000);
});
