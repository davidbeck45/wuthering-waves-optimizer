// "What each level is worth": the words and figures the drawer, the CLI and the assistant print.
import { describe, expect, it } from "vitest";
import type { LevelPlan, LevelRow, PathStep } from "./levelPlan";
import type { LevelCost } from "./levelSteps";
import { basisLine, costText, everythingText, gainChips, gainText, headlineText, inertLine, materialsText, NOT_MODELLED, pathHow, runningText, smallTeamLine, stepChip } from "./levelsView";

const cost = (credits: number, extra: Partial<LevelCost> = {}): LevelCost => ({ credits, resonatorExp: 0, weaponExp: 0, expItems: [], ascensions: 0, materials: [], ...extra });
const fig = (gain: number) => ({ base: 100, after: 100 * (1 + gain), gain });
const row = (label: string, track: LevelRow["track"], own: number | null, team: number | null, healing: number | null = null): LevelRow =>
  ({ track, from: "", to: "", label, next: {} as never, cost: cost(30_000), own: own == null ? null : fig(own), healing: healing == null ? null : fig(healing), shield: null, team: team == null ? null : ({ gain: team } as never), teamNote: null, inert: false }) as LevelRow;
const step = (index: number, r: LevelRow, running: PathStep["running"]): PathStep => ({ ...r, index, running });

describe("figures", () => {
  it("prints a gain with one decimal, two when it is under a tenth of a percent, and never a zero that is not one", () => {
    expect(gainText(0.151)).toBe("+15.1%");
    expect(gainText(-0.02)).toBe("-2.0%");
    expect(gainText(0)).toBe("+0.0%");
    expect(gainText(0.0003)).toBe("+0.03%");
    expect(gainText(0.00002)).toBe("+<0.01%");
    expect(gainText(19.009)).toBe("+1,900.9%");
  });

  it("prints a step's cost: Shell Credits, the EXP items, the ascensions, and counts the materials", () => {
    const level = cost(349_115, { resonatorExp: 762_000, expItems: [{ id: 1, name: "Premium Resonance Potion", rarity: 5, count: 39 }], ascensions: 1, materials: [{ id: 2, name: "A", rarity: 4, count: 4 }, { id: 3, name: "B", rarity: 4, count: 16 }, { id: 4, name: "C", rarity: 3, count: 20 }] });
    expect(costText(level)).toBe("349,115 Shell Credits · 39 × Premium Resonance Potion · 1 ascension");
    expect(materialsText(level)).toBe("3 materials");
    expect(costText(cost(1_500))).toBe("1,500 Shell Credits");
    expect(materialsText(cost(1_500))).toBe("");
    expect(materialsText(cost(1, { materials: [{ id: 2, name: "A", rarity: 4, count: 4 }] }))).toBe("1 material");
  });

  it("orders a row's figures with the basis first and says what each percent is of", () => {
    const r = row("Resonance Skill 6 → 10", "skill", 0.1817, 0.1513, 0.05);
    expect(gainChips(r, "team").map((c) => `${c.text} ${c.scope}`)).toEqual(["+15.1% team", "+18.2% own", "+5.0% healing"]);
    expect(gainChips(r, "healing").map((c) => c.scope)).toEqual(["healing", "team", "own"]);
    // a weapon step with no team figure: its own figure leads
    expect(stepChip(step(1, row("Weapon level 80 → 90", "weapon", 0.088, null), { gain: 0.088, teamGain: null, healingGain: null, shieldGain: null, cost: cost(496_480) }), "team")).toMatchObject({ scope: "own", text: "+8.8%" });
  });
});

describe("sentences", () => {
  const plan = {
    noGain: null,
    base: { damage: 1000, healing: 0, shield: 0 },
    basis: "team",
    pathOrder: "value",
    team: { id: "t", name: "wuwa_calc team", characterIds: [], base: 5000 },
    teamNote: null,
    inert: [],
    path: [],
    everything: { cost: cost(2_125_595), own: fig(0.592), healing: null, shield: null, team: { gain: 0.4012 } as never },
  } as unknown as LevelPlan;
  const titles = { name: "Camellya", rotation: "Camellya · Verina + Sanhua", team: "Camellya · Mornye + Lynae" };

  it("says what own and team are measured on, and why there is no team figure when there is none", () => {
    expect(basisLine(plan, titles)).toBe(
      "Own = Camellya's average damage per rotation on their best rotation (Camellya · Verina + Sanhua). Team = the damage of Camellya · Mornye + Lynae, the strongest team Camellya can field. Enemy level 100, 20 % RES.",
    );
    expect(basisLine({ ...plan, team: null, teamNote: "not in a team you can field" }, titles)).toContain("No team figure: not in a team you can field.");
    expect(basisLine({ ...plan, noGain: "no weapon" }, titles)).toBe("");
  });

  it("says a healer's steps are ordered by healing, and that a DPS's self-heal rides along", () => {
    const healer = { ...plan, basis: "healing", base: { damage: 100, healing: 900, shield: 0 } } as LevelPlan;
    expect(basisLine(healer, titles)).toContain("This rotation heals for more than it hits, so the steps are ordered by healing; healing and shields are not in the damage figures.");
    const selfHeal = { ...plan, base: { damage: 1000, healing: 50, shield: 20 } } as LevelPlan;
    expect(basisLine(selfHeal, titles)).toContain("This rotation also heals and shields: a step's healing or shield gain is shown beside its damage.");
  });

  it("says how the order is built, for both ways of picking a step", () => {
    expect(pathHow({ basis: "team", pathOrder: "value" })).toBe("Each step is the one that adds the most team damage for its Shell Credits at that point. After every step the build is scored again, because level-ups multiply each other.");
    expect(pathHow({ basis: "own", pathOrder: "gain" })).toMatch(/^Each step is the one that adds the most own damage at that point\./);
  });

  it("headlines the first steps with their running gain and bill, and each step with its own", () => {
    const a = step(1, row("Resonance Skill 6 → 7", "skill", 0.0447, 0.0373), { gain: 0.0447, teamGain: 0.0373, healingGain: null, shieldGain: null, cost: cost(30_000) });
    const b = step(2, row("Intro Skill 1 → 2", "intro", 0.0017, 0.0013), { gain: 0.0465, teamGain: 0.0386, healingGain: null, shieldGain: null, cost: cost(31_500) });
    const c = step(3, row("Resonance Skill 7 → 8", "skill", 0.0428, 0.0359), { gain: 0.0912, teamGain: 0.0759, healingGain: null, shieldGain: null, cost: cost(81_500) });
    expect(headlineText({ path: [a, b, c], basis: "team" })).toBe("The first 3 steps give +7.6% team damage for 81,500 Shell Credits.");
    expect(headlineText({ path: [a], basis: "own" })).toBe("The first step gives +4.5% own damage for 30,000 Shell Credits.");
    expect(headlineText({ path: [], basis: "team" })).toBeNull();
    expect(runningText(b, "team")).toBe("so far +3.9% team for 31,500 Shell Credits");
    expect(runningText(b, "own")).toBe("so far +4.7% own for 31,500 Shell Credits");
    expect(runningText({ ...b, running: { ...b.running, teamGain: null } }, "team")).toBe("so far for 31,500 Shell Credits");
  });

  it("sums everything up, with costs only when nothing could be scored", () => {
    expect(everythingText(plan)).toBe("+40.1% team · +59.2% own for 2,125,595 Shell Credits");
    expect(everythingText({ basis: "own", everything: { cost: cost(2_423_300), own: null, healing: null, shield: null, team: null } })).toBe("2,423,300 Shell Credits");
    expect(everythingText({ basis: "own", everything: null })).toBeNull();
  });

  it("names the tracks the order leaves out, and why", () => {
    const inert = [{ ...row("Resonance Skill 6 → 10", "skill", 0, 0), inert: true }, { ...row("Resonance Liberation 6 → 10", "liberation", 0, 0), inert: true }];
    expect(inertLine({ inert }, "Shorekeeper · Lynae + Aemeath")).toBe("Resonance Skill 6 → 10 and Resonance Liberation 6 → 10: not used in this rotation (Shorekeeper · Lynae + Aemeath)");
    expect(inertLine({ inert: [{ ...row("Weapon level 80 → 90", "weapon", 0, null), inert: true }] }, null)).toBe("Weapon level 80 → 90: changes nothing on this rotation");
    expect(inertLine({ inert: [] }, null)).toBeNull();
  });

  it("tells a support that their levels hardly move the team, and stays quiet for a carry", () => {
    expect(smallTeamLine({ basis: "team", everything: { ...plan.everything!, team: { gain: 0.0046 } as never } }, "Shorekeeper")).toBe(
      "Every level-up here together moves this team's damage by +0.5%: Shorekeeper's own hits are a small part of what the team deals.",
    );
    expect(smallTeamLine(plan, "Camellya")).toBeNull();
    expect(smallTeamLine({ basis: "own", everything: { ...plan.everything!, team: null } }, "Zani")).toBeNull();
  });

  it("says in one line what is not a step here", () => {
    expect(NOT_MODELLED).toMatch(/^Not in this list: the two inherent skills and the eight stat bonuses\./);
    expect(NOT_MODELLED).toContain("Cost to max prices them");
  });
});
