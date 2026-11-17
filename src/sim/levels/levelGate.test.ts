// "What each level is worth": the order prices a step in Shell Credits, and a Forte step from level 7 up also takes the
// one material those levels need (a weekly boss's, which no Shell Credits stand in for). A step that takes it says so,
// and one line under the order says the price leaves it out.
import { describe, expect, it } from "vitest";
import fixture from "../ai/__fixtures__/aiAccount.json";
import { parseExport, type ExportFile } from "../cli/exportShape";
import table from "../materials/data/materials.json";
import type { MaterialsData } from "../materials/costToMax";
import type { PathStep } from "./levelPlan";
import { levelsJson, levelsReport, printLevels } from "./levelsCli";
import { forteGateMaterial, levelsToday, nextStep, type LevelCost } from "./levelSteps";
import { gateLine, gateText } from "./levelsView";

const data = table as unknown as MaterialsData;
const exp: ExportFile = parseExport(fixture, "aiAccount.json");

describe("the material Forte levels 7 to 10 take", () => {
  it("is read from the table: one material new at Forte 6 → 7, one of it for each level from 7 to 10, for every character", () => {
    expect(forteGateMaterial(data, "Galbrena")).toEqual({ id: expect.any(Number), name: "Curse of the Abyss" });
    expect(forteGateMaterial(data, "NoSuchCharacter")).toBeNull();
    for (const key of Object.keys(data.characters)) {
      const gate = forteGateMaterial(data, key);
      expect(gate, key).not.toBeNull();
      const today = levelsToday(data, { level: "90", talents: { basic: 1, skill: 10, forte: 10, liberation: 10, intro: 10 }, weapon: null, weaponLevel: null });
      let state = today.state;
      const per: number[] = [];
      for (let lv = 1; lv < 10; lv++) {
        const step = nextStep(data, key, today, state, "basic")!;
        per.push(step.cost.materials.find((m) => m.id === gate!.id)?.count ?? 0);
        state = step.next;
      }
      expect(per, key).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1]);
    }
  });

  const gate = { id: 7, name: "Curse of the Abyss" };
  const cost = (credits: number, curse = 0): LevelCost => ({ credits, resonatorExp: 0, weaponExp: 0, expItems: [], ascensions: 0, materials: [{ id: 1, name: "Refined Phlogiston", rarity: 4, count: 5 }, ...(curse ? [{ id: 7, name: "Curse of the Abyss", rarity: 4, count: curse }] : [])] });
  const step = (index: number, c: LevelCost) => ({ index, cost: c }) as PathStep;

  it("is said beside each step of the order that takes it, and once under the order with how many", () => {
    const path = [step(1, cost(4_500)), step(2, cost(30_000, 1)), step(3, cost(240_340)), step(4, cost(170_000, 2))];
    expect(gateText(path[0]!, gate)).toBeNull();
    expect(gateText(path[1]!, gate)).toBe("1 × Curse of the Abyss");
    expect(gateText(path[3]!, gate)).toBe("2 × Curse of the Abyss"); // a joined step (8 → 10) takes two
    expect(gateLine({ path, gate })).toBe(
      "The order prices each step in Shell Credits only. 2 of its 4 steps also take Curse of the Abyss (3 in all, said beside each), which it does not weigh: if you are short of it, take the next step without it.",
    );
    expect(gateLine({ path: [path[0]!, path[1]!], gate })).toMatch(/^The order prices each step in Shell Credits only\. One step also takes Curse of the Abyss \(1 in all/);
    expect(gateLine({ path: [path[0]!, path[2]!], gate })).toBeNull();
    expect(gateLine({ path, gate: null })).toBeNull();
    expect(gateText(path[1]!, null)).toBeNull();
  });

  it("reaches the CLI's table and JSON (and so the assistant): Lynae's Resonance Liberation 6 → 10 takes one per level", async () => {
    const plan = await levelsReport(exp, "Lynae", { at: "level=80,liberation=6" });
    const name = forteGateMaterial(data, "Lynae")!.name;
    expect(plan.gate?.name).toBe(name);
    const json = levelsJson(plan) as any;
    const lib = json.path.filter((s: any) => s.track === "liberation");
    expect(lib).toHaveLength(4);
    expect(lib.map((s: any) => s.alsoTakes)).toEqual(Array(4).fill(`1 × ${name}`));
    expect(json.path.find((s: any) => s.track === "level").alsoTakes).toBeUndefined();
    expect(json.pathNote).toBe(`The order prices each step in Shell Credits only. 4 of its 5 steps also take ${name} (4 in all, said beside each), which it does not weigh: if you are short of it, take the next step without it.`);
    const text = printLevels(plan);
    expect(text).toMatch(/Shell Credits\s+Also takes\s+So far: team/);
    expect(text).toContain(`1 × ${name}`);
    expect(text).toContain(json.pathNote);
  }, 60_000);
});
