// "What each level is worth", the pure half: where a character stands, the steps left on each track and what each
// one costs, on the generated cost table (the game's own upgrade tables). Synthetic records only.
import { describe, expect, it } from "vitest";
import table from "../materials/data/materials.json";
import { costToMax, savedProgressOf, type MaterialsData } from "../materials/costToMax";
import { FORTE_KEYS, LEVEL_OPTIONS, levelOptions, levelsToday, nextStep, parseLevels, stateFrom, stateLevels, stateText, stepsLeft, stepText, sumCosts, topState, TRACKS, trackToTop, withLevels, type LevelCost, type LevelState } from "./levelSteps";

const data = table as unknown as MaterialsData;
const camellya = { weapon: "RedSpring", characterLevel: "70", talents: { basic: 6, skill: "8", forte: 6, liberation: 10 }, weapons: { RedSpring: { weaponLevel: "80+", refinement: "2" } } };
const mats = (cost: LevelCost): Record<string, number> => Object.fromEntries(cost.materials.map((m) => [m.name, m.count]));

describe("where a character stands", () => {
  it("reads what the calculator saved and fills each gap the way the calculator does, flagged", () => {
    const today = levelsToday(data, savedProgressOf(camellya));
    expect(today.state).toEqual({ level: { level: 70, ascended: false }, weapon: { level: 80, ascended: true }, talents: { basic: 6, skill: 8, forte: 6, liberation: 10, intro: 10 } });
    expect(today.assumed).toEqual(["intro"]); // the one Forte skill with no saved level
    expect(today).toMatchObject({ weaponKey: "RedSpring", weaponTop: 90, weaponMissing: false });
    expect(stateText(today, today.state)).toBe("Level 70 · weapon level 80+ · Forte skills 6 / 8 / 6 / 10 / 10");
  });

  it("with nothing saved everything stands at the top, all of it assumed, and nothing is left", () => {
    const today = levelsToday(data, savedProgressOf({ weapon: "RedSpring" }));
    expect(today.assumed).toEqual(["level", "weapon", ...FORTE_KEYS]);
    expect(stepsLeft(today, today.state)).toBe(0);
    expect(TRACKS.map((t) => nextStep(data, "Camellya", today, today.state, t.key))).toEqual([null, null, null, null, null, null, null]);
    expect(stateText(today, today.state)).toBe("Level 90 · weapon level 90 · all five Forte skills at 10");
  });

  it("from level 1 is 59 steps: seven caps for the level, seven for a 5-star weapon, nine levels for each of five skills", () => {
    const today = levelsToday(data, savedProgressOf(camellya), "scratch");
    expect(today.assumed).toEqual([]);
    expect(stepsLeft(today, today.state)).toBe(7 + 7 + 45);
    // a 1-star weapon stops at 70: five caps
    const training = levelsToday(data, savedProgressOf({ weapon: "TrainingSword" }), "scratch");
    expect(training.weaponTop).toBe(70);
    expect(stepsLeft(training, training.state)).toBe(7 + 5 + 45);
    expect(trackToTop(data, "Camellya", training, training.state, "weapon")!.label).toBe("Weapon level 1 → 70");
  });

  it("no weapon, or a weapon the table has no entry for: no weapon track, and it says which", () => {
    const none = levelsToday(data, savedProgressOf({ characterLevel: "80" }));
    expect(none).toMatchObject({ weaponKey: null, weaponTop: null, weaponMissing: false });
    expect(none.state.weapon).toBeNull();
    const unknown = levelsToday(data, savedProgressOf({ weapon: "NotAWeaponYet", weapons: { NotAWeaponYet: { weaponLevel: "40" } } }));
    expect(unknown).toMatchObject({ weaponKey: "NotAWeaponYet", weaponTop: null, weaponMissing: true });
    expect(nextStep(data, "Camellya", unknown, unknown.state, "weapon")).toBeNull();
  });

  it("a saved level the engine has no stats for counts as not saved", () => {
    // the pickers write LEVEL_OPTIONS only; "55" parses as a level, and the engine would read no base stats for it
    const today = levelsToday(data, savedProgressOf({ characterLevel: "55", weapon: "RedSpring", weapons: { RedSpring: { weaponLevel: "85" } } }));
    expect(today.assumed).toContain("level");
    expect(today.assumed).toContain("weapon");
    expect(today.state.level).toEqual({ level: 90, ascended: false });
    for (const option of LEVEL_OPTIONS) expect(levelsToday(data, savedProgressOf({ characterLevel: option })).assumed).not.toContain("level");
  });
});

describe("steps and what they cost", () => {
  const today = levelsToday(data, savedProgressOf(camellya));

  it("a level step runs to the next cap and pays the ascension it stands before", () => {
    const step = nextStep(data, "Camellya", today, today.state, "level")!;
    expect(step).toMatchObject({ track: "level", from: "70", to: "80", label: "Level 70 → 80" });
    expect(step.next.level).toEqual({ level: 80, ascended: false });
    expect(step.cost.ascensions).toBe(1);
    // the ascension at 70 costs 40,000 Shell Credits; the EXP from 70 to 80 is fed at 0.35 Shell Credits each
    const exp = data.resonatorExp.perLevel.slice(69, 79).reduce((s, v) => s + v, 0);
    expect(step.cost.resonatorExp).toBe(exp);
    expect(step.cost.credits).toBe(40_000 + Math.round(exp * 0.35));
    expect(step.cost.expItems).toEqual([{ id: data.resonatorExp.item, name: "Premium Resonance Potion", rarity: 5, count: Math.ceil(exp / 20_000) }]);
    expect(Object.keys(mats(step.cost)).length).toBe(3);
  });

  it("an ascended level owes no ascension for the same levels", () => {
    const ascended: LevelState = { ...today.state, level: { level: 70, ascended: true } };
    const step = nextStep(data, "Camellya", today, ascended, "level")!;
    expect(step).toMatchObject({ from: "70+", to: "80", label: "Level 70+ → 80" });
    expect(step.cost.ascensions).toBe(0);
    expect(step.cost.materials).toEqual([]);
    const plain = nextStep(data, "Camellya", today, today.state, "level")!;
    expect(plain.cost.credits - step.cost.credits).toBe(40_000);
  });

  it("the weapon steps from 80+ to its last level, EXP only", () => {
    const step = nextStep(data, "Camellya", today, today.state, "weapon")!;
    expect(step).toMatchObject({ from: "80+", to: "90", label: "Weapon level 80+ → 90" });
    expect(step.cost.ascensions).toBe(0);
    expect(step.cost.weaponExp).toBeGreaterThan(0);
    expect(step.cost.resonatorExp).toBe(0);
    expect(step.cost.expItems[0]!.name).toBe("Premium Energy Core");
    expect(nextStep(data, "Camellya", today, step.next, "weapon")).toBeNull();
  });

  it("a Forte step is one level, at the table's price for that level", () => {
    const step = nextStep(data, "Camellya", today, today.state, "basic")!;
    expect(step).toMatchObject({ track: "basic", from: "6", to: "7", label: "Normal Attack 6 → 7" });
    expect(step.next.talents).toEqual({ ...today.state.talents, basic: 7 });
    expect(step.cost.credits).toBe(30_000); // Forte level 7
    expect(step.cost.expItems).toEqual([]);
    expect(nextStep(data, "Camellya", today, today.state, "liberation")).toBeNull(); // saved at 10
    expect(nextStep(data, "Camellya", today, today.state, "intro")).toBeNull(); // not saved: the calculator runs 10
  });

  it("a track taken to its top costs what Cost to max has for that part, and its steps add up to it", () => {
    const left = costToMax(data, "Camellya", savedProgressOf(camellya), { from: "saved" })!;
    const levelPart = left.parts.find((p) => p.kind === "level")!;
    const whole = trackToTop(data, "Camellya", today, today.state, "level")!;
    expect(whole.label).toBe("Level 70 → 90");
    expect(whole.cost.credits).toBe(levelPart.credits);
    expect(whole.cost.ascensions).toBe(2);
    expect(mats(whole.cost)).toEqual(Object.fromEntries(levelPart.materials.map((m) => [m.name, m.count])));
    const a = nextStep(data, "Camellya", today, today.state, "level")!;
    const b = nextStep(data, "Camellya", today, a.next, "level")!;
    expect(b.label).toBe("Level 80 → 90");
    const both = sumCosts(data, [a.cost, b.cost]);
    expect(both.credits).toBe(whole.cost.credits);
    expect(both.materials).toEqual(whole.cost.materials);
    expect(both.resonatorExp).toBe(whole.cost.resonatorExp);
    // EXP items are rounded up once over the summed EXP, not once per step
    expect(both.expItems).toEqual(whole.cost.expItems);
  });

  it("every step from level 1 adds up to Cost to max from level 1, without the inherent skills and stat bonuses", () => {
    const scratch = levelsToday(data, savedProgressOf(camellya), "scratch");
    const costs: LevelCost[] = [];
    let state = scratch.state;
    for (const { key } of TRACKS) {
      for (let step = nextStep(data, "Camellya", scratch, state, key); step; step = nextStep(data, "Camellya", scratch, state, key)) {
        costs.push(step.cost);
        state = step.next;
      }
    }
    expect(costs).toHaveLength(59);
    expect(state).toEqual(topState(scratch, scratch.state));
    const total = sumCosts(data, costs);
    const max = costToMax(data, "Camellya", savedProgressOf(camellya), { from: "scratch" })!;
    const counted = max.parts.filter((p) => p.kind !== "extras");
    expect(total.credits).toBe(counted.reduce((n, p) => n + p.credits, 0));
    expect(total.credits).toBe(4_460_260 - 630_000); // the drawer's from-level-1 figure for Camellya and Red Spring, less the 630,000 of the extras
    const want = new Map<string, number>();
    for (const p of counted) for (const m of p.materials) want.set(m.name, (want.get(m.name) ?? 0) + m.count);
    expect(mats(total)).toEqual(Object.fromEntries(want));
    expect(total.expItems.map((m) => [m.name, m.count])).toEqual(max.total.expItems.map((m) => [m.name, m.count]));
  });
});

describe("the record the engine reads", () => {
  it("writes the three fields the calculator's pickers write and leaves the build alone", () => {
    const today = levelsToday(data, savedProgressOf(camellya));
    const next = withLevels(camellya, { level: { level: 80, ascended: true }, weapon: { level: 90, ascended: false }, talents: { basic: 7, skill: 8, forte: 6, liberation: 10, intro: 10 } }, today.weaponTop);
    expect(next.characterLevel).toBe("80+");
    expect(next.talents).toEqual({ basic: 7, skill: 8, forte: 6, liberation: 10, intro: 10 });
    expect(next.weapons.RedSpring).toEqual({ weaponLevel: "90", refinement: "2" });
    expect(camellya.weapons.RedSpring.weaponLevel).toBe("80+"); // the input is not touched
    expect(stepText({ level: 90, ascended: true })).toBe("90");
    // no weapon: no weapons map is invented
    expect(withLevels({ characterLevel: "20" }, { level: { level: 40, ascended: false }, weapon: null, talents: { basic: 1, skill: 1, forte: 1, liberation: 1, intro: 1 } }).weapons).toBeUndefined();
  });

  it("offers a picker every value the calculator can hold up to the top, and a state round-trips through it", () => {
    expect(levelOptions()).toEqual([...LEVEL_OPTIONS]);
    expect(levelOptions(70)).toEqual(["1", "20", "20+", "40", "40+", "50", "50+", "60", "60+", "70"]); // no "70+": a 1-star weapon ends there
    const today = levelsToday(data, savedProgressOf(camellya));
    const levels = stateLevels(today, today.state);
    expect(levels).toEqual({ level: "70", weapon: "80+", basic: "6", skill: "8", forte: "6", liberation: "10", intro: "10" });
    expect(stateFrom(today, levels)).toEqual(today.state);
    expect(stateLevels(levelsToday(data, savedProgressOf({})), { level: { level: 1, ascended: false }, weapon: null, talents: { basic: 1, skill: 1, forte: 1, liberation: 1, intro: 1 } }).weapon).toBeUndefined();
    expect(parseLevels("level=70, weapon=80+")).toEqual({ level: "70", weapon: "80+" });
  });

  it("takes other starting levels by track, and refuses what the calculator could not hold", () => {
    const today = levelsToday(data, savedProgressOf({ weapon: "RedSpring" }));
    const state = stateFrom(today, { level: "80", weapon: "70+", liberation: 6, intro: "1" });
    expect(stateText(today, state)).toBe("Level 80 · weapon level 70+ · Forte skills 10 / 10 / 10 / 6 / 1");
    expect(stepsLeft(today, state)).toBe(1 + 2 + 4 + 9);
    expect(() => stateFrom(today, { level: "85" })).toThrow(/Level must be one of 1, 20, 20\+/);
    expect(() => stateFrom(today, { skill: 11 })).toThrow(/Resonance Skill must be 1 to 10/);
    expect(() => stateFrom(today, { echo: 3 } as never)).toThrow(/Unknown level "echo"/);
    const unarmed = levelsToday(data, savedProgressOf({}));
    expect(() => stateFrom(unarmed, { weapon: "80" })).toThrow(/No weapon level to set/);
  });
});
