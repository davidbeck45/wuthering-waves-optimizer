// "What each level is worth", the order, where one level adds nothing by itself. The calculator's multiplier tables
// hold a few levels equal to the one before (Galbrena's Resonance Skill reads level 9 like level 8, Lucilla's
// Resonance Liberation level 2 like level 1), so the engine scores that one step at +0. The order used to drop the
// track there for good: the levels after it never came, and it still said it was complete.
// Synthetic account: two armed characters, no echoes; nobody's export.
import { beforeAll, describe, expect, it } from "vitest";
import table from "../materials/data/materials.json";
import { savedProgressOf, type MaterialsData } from "../materials/costToMax";
import { RANKING_ENEMY, rankRoster, scoreRotation, type RosterRanking } from "../myRankings/rankRoster";
import { levelPlan, type LevelPlan, type LevelPlanOptions } from "./levelPlan";
import { levelsToday, topState, withLevels } from "./levelSteps";
import { flatNote } from "./levelsView";

const materials = table as unknown as MaterialsData;

const characters: Record<string, any> = {
  // everything at the top but the Resonance Skill, at 8: the two levels left are 9 (reads like 8) and 10
  Galbrena: { weapon: "LuxUmbra", characterLevel: "90", talents: { basic: 10, skill: 8, forte: 10, liberation: 10, intro: 10 }, weapons: { LuxUmbra: { weaponLevel: "90" } } },
  // nothing saved: measured from level 1 below
  Lucilla: { weapon: "FreezeFrame" },
};
const echoes: any[] = [];

let ranking: RosterRanking;
const rankOf = (id: string) => ranking.characters.find((c) => c.id === id) ?? null;
const run = (id: string, options: LevelPlanOptions = {}): Promise<LevelPlan> =>
  levelPlan({ characterId: id, characters, inventoryEchoes: echoes, teams: [], rank: rankOf(id), rankingTeams: ranking.teams, materials }, { yieldToUi: false, ...options });

beforeAll(async () => {
  ranking = await rankRoster(characters, echoes, [], { yieldToUi: false });
}, 120_000);

describe("a level that adds nothing by itself", () => {
  it("the engine reads Galbrena's Resonance Skill 9 like 8, and 10 above both", async () => {
    const rotation = rankOf("Galbrena")!.bestRotation!;
    const at = async (skill: number): Promise<number> =>
      (await scoreRotation(rotation, "Galbrena", { ...characters, Galbrena: { ...characters.Galbrena, talents: { ...characters.Galbrena.talents, skill } } }, RANKING_ENEMY, echoes)).avgDamage;
    const [eight, nine, ten] = [await at(8), await at(9), await at(10)];
    expect(nine).toBe(eight);
    expect(ten).toBeGreaterThan(nine);
  }, 60_000);

  it("is taken together with the next level that does: the order still ends at the top, on the whole bill", async () => {
    const plan = await run("Galbrena");
    expect(plan.rows.map((r) => r.label)).toEqual(["Resonance Skill 8 → 10"]);
    expect(plan.rows[0]!.inert).toBe(false);
    expect(plan.pathState).toBe("complete");
    // one step, not none: 8 → 9 alone moves nothing, so it comes with 9 → 10
    expect(plan.path.map((s) => s.label)).toEqual(["Resonance Skill 8 → 10"]);
    const step = plan.path[0]!;
    expect(step.flat).toEqual(["9"]);
    expect(step.cost.credits).toBe(70_000 + 100_000);
    expect(step.cost.credits).toBe(plan.rows[0]!.cost.credits);
    expect(step.cost.materials).toEqual(plan.rows[0]!.cost.materials);
    expect(step.own!.gain).toBeGreaterThan(0);
    expect(step.inert).toBe(false);
    const today = levelsToday(materials, savedProgressOf(characters.Galbrena));
    expect(step.next).toEqual(topState(today, today.state));
    // the end of the order is "all of it together", to the digit and to the credit
    expect(step.running.gain).toBe(plan.everything!.own!.gain);
    expect(step.running.cost.credits).toBe(plan.everything!.cost.credits);
    // and the row says why two levels are one step
    expect(flatNote(step)).toBe("Counted as one step: level 9 alone adds nothing here (the calculator's table gives it level 8's figures).");
  }, 60_000);

  it("by the biggest gain the same step is there", async () => {
    const plan = await run("Galbrena", { pathOrder: "gain" });
    expect(plan.path.map((s) => s.label)).toEqual(["Resonance Skill 8 → 10"]);
  }, 60_000);

  it("from level 1, Lucilla's Resonance Liberation is in the order (level 2 reads like level 1), and the order ends where the list's total does", async () => {
    const plan = await run("Lucilla", { from: "scratch" });
    expect(plan.errors).toEqual([]);
    const liberation = plan.rows.find((r) => r.track === "liberation")!;
    expect(liberation.inert).toBe(false);
    const steps = plan.path.filter((s) => s.track === "liberation");
    expect(steps[0]!.label).toBe("Resonance Liberation 1 → 3");
    expect(steps[0]!.flat).toEqual(["2"]);
    expect(steps[0]!.cost.credits).toBe(1_500 + 2_000);
    expect(steps.at(-1)!.to).toBe("10");
    expect(steps).toHaveLength(8); // 1 → 3, then one level at a time to 10
    expect(steps.reduce((n, s) => n + s.cost.credits, 0)).toBe(liberation.cost.credits);
    // every track the list does not call unused reaches its top, so the order's end is the list's "all of it together"
    const last = plan.path.at(-1)!;
    const unused = plan.inert.map((r) => r.track);
    const today = plan.today!;
    const top = topState(today, today.state);
    for (const key of ["basic", "skill", "forte", "liberation", "intro"] as const) {
      if (!unused.includes(key)) expect(last.next.talents[key], key).toBe(top.talents[key]);
    }
    expect(last.next.level).toEqual(top.level);
    expect(last.next.weapon).toEqual(top.weapon);
    expect(last.running.cost.credits).toBe(plan.everything!.cost.credits - plan.inert.reduce((n, r) => n + r.cost.credits, 0));
    const rotation = rankOf("Lucilla")!.bestRotation!;
    const scored = (await scoreRotation(rotation, "Lucilla", { ...characters, Lucilla: withLevels(characters.Lucilla, last.next, today.weaponTop) }, RANKING_ENEMY, echoes)).avgDamage;
    expect(last.running.gain).toBe(scored / plan.base!.damage - 1);
    expect(last.running.gain).toBeCloseTo(plan.everything!.own!.gain, 9);
  }, 120_000);
});
