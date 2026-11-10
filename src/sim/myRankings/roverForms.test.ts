// Wuthering Tools+ — a male Rover is the same kit as the female one (2026-11-08 hunt, numbers 4). wuwa_calc has one
// Rover per element and everything generated from it is filed under the female key, so a male Rover read 0 wuwa_calc
// loops and 0 stock teams where the female form read 3 to 6: on a real account his best rotation was the curated
// "Standard" at 101,653 while the six Aero Rover loops scored 108,907 to 170,451 on the same build. Every Rover element,
// both forms.
import { describe, expect, it } from "vitest";
import { teamRotationPresets } from "../../teamRotations/presets";
import { hasWuwaCalcRotationPresets, loadWuwaCalcRotationPresets, loadWuwaCalcTeamPresets, teamPresetForAccount } from "../presets";
import { accountKeyOf, roverTwinOf } from "../rankings/rileyNames";
import { rankRoster, rotationCandidates, teamCandidatesOf } from "./rankRoster";

/** element, the key the generated presets carry, the male key, wuwa_calc loops and stock teams at the time of writing */
const FORMS = [
  { element: "Aero", female: "RoverAeroFemale", male: "RoverAeroMale", loops: true, teams: false },
  { element: "Electro", female: "Roverelectrofemale", male: "Roverelectromale", loops: true, teams: true },
  { element: "Spectro", female: "RoverSpectroFemale", male: "RoverSpectroMale", loops: true, teams: true },
  { element: "Havoc", female: "RoverHavocFemale", male: "RoverHavocMale", loops: false, teams: false },
] as const;

const SWORD = "BloodpactsPledge";
const built = { weapon: SWORD };
const T = 60_000;

/** Every stock team with this Rover (the presets name the female key), and an account that owns all their members with
 *  the Rover under `key`. */
async function accountFor(female: string, key: string): Promise<{ characters: Record<string, any>; stock: number }> {
  const stock = [...teamRotationPresets, ...(await loadWuwaCalcTeamPresets())].filter((p) => (p.data.actions ?? []).length && p.data.characterIds.includes(female));
  const characters: Record<string, any> = {};
  for (const p of stock) for (const id of p.data.characterIds) if (id && id !== female) characters[id] = built;
  characters[key] = built;
  return { characters, stock: stock.length };
}

describe("the two keys of a Rover", () => {
  it("names each form's other gender, and nobody else's", () => {
    for (const f of FORMS) {
      expect(roverTwinOf(f.female)).toBe(f.male);
      expect(roverTwinOf(f.male)).toBe(f.female);
    }
    expect(roverTwinOf("Cartethyia")).toBeNull();
    expect(roverTwinOf("YangyangXuanling")).toBeNull();
  });

  it("reads a generated key as the form the account plays", () => {
    for (const f of FORMS) {
      expect(accountKeyOf(f.female, { [f.male]: built })).toBe(f.male);
      expect(accountKeyOf(f.female, { [f.female]: built })).toBe(f.female);
      // both records there: the one with a weapon is the one played; the generated key on a tie
      expect(accountKeyOf(f.female, { [f.female]: {}, [f.male]: built })).toBe(f.male);
      expect(accountKeyOf(f.female, { [f.female]: built, [f.male]: built })).toBe(f.female);
      expect(accountKeyOf(f.female, { [f.female]: {}, [f.male]: {} })).toBe(f.female);
      // not in the account at all: the key as it came
      expect(accountKeyOf(f.female, {})).toBe(f.female);
    }
    expect(accountKeyOf("Cartethyia", { Cartethyia: built })).toBe("Cartethyia");
  });
});

describe.each(FORMS)("$element Rover", (f) => {
  it("gets the same wuwa_calc loops in both forms", async () => {
    const female = await loadWuwaCalcRotationPresets(f.female);
    const male = await loadWuwaCalcRotationPresets(f.male);
    expect(male.map((p) => p.name)).toEqual(female.map((p) => p.name));
    expect(female.length > 0).toBe(f.loops);
    expect(hasWuwaCalcRotationPresets(f.male)).toBe(f.loops);
    expect(hasWuwaCalcRotationPresets(f.female)).toBe(f.loops);
    const loopsOf = async (key: string): Promise<string[]> => (await rotationCandidates(key, {})).filter((c) => c.source === "wuwa_calc").map((c) => c.name);
    expect(await loopsOf(f.male)).toEqual(await loopsOf(f.female));
    expect((await loopsOf(f.male)).length > 0).toBe(f.loops);
  });

  it(
    "ranks the same in both forms: as many rotations tried, the same best one, the same damage",
    async () => {
      const rank = async (key: string) => (await rankRoster({ [key]: built }, [], [], { investment: false, yieldToUi: false })).characters[0];
      const female = await rank(f.female);
      const male = await rank(f.male);
      expect(male.id).toBe(f.male);
      expect(male.rotationsEvaluated).toBe(female.rotationsEvaluated);
      expect(female.best!.avgDamage).toBeGreaterThan(0);
      expect(male.best!.name).toBe(female.best!.name);
      expect(male.best!.source).toBe(female.best!.source);
      expect(male.best!.avgDamage).toBeCloseTo(female.best!.avgDamage, 6);
      expect(male.rotations.map((r) => [r.name, r.source])).toEqual(female.rotations.map((r) => [r.name, r.source]));
      // with loops to try, the pick is no longer the lone curated rotation a male Rover was left with
      if (f.loops) expect(male.rotationsEvaluated).toBeGreaterThan(1);
    },
    T,
  );

  it(
    "fields the same stock teams in both forms, each team naming the form the account plays",
    async () => {
      const her = await accountFor(f.female, f.female);
      const his = await accountFor(f.female, f.male);
      expect(her.stock > 0).toBe(f.teams);
      const hers = (await teamCandidatesOf(her.characters, [])).candidates.filter((c) => c.team.characterIds.includes(f.female));
      const mine = (await teamCandidatesOf(his.characters, [])).candidates.filter((c) => c.team.characterIds.includes(f.male));
      expect(hers).toHaveLength(her.stock);
      expect(mine.map((c) => c.id)).toEqual(hers.map((c) => c.id));
      for (const c of mine) {
        // his key in the members and in who hands off to whom; the female key nowhere in the team that gets scored
        expect(JSON.stringify([c.team.characterIds, c.team.handoffs ?? null])).not.toContain(f.female);
        const hersOf = hers.find((h) => h.id === c.id)!;
        expect(c.team.actions).toBe(hersOf.team.actions);
        expect(JSON.stringify(c.team.handoffs ?? null).split(f.male).join(f.female)).toBe(JSON.stringify(hersOf.team.handoffs ?? null));
      }
    },
    T,
  );
});

describe("a stock team for the account", () => {
  it("comes back untouched when the account plays the form it names, and never changes the preset itself", async () => {
    const preset = (await loadWuwaCalcTeamPresets()).find((p) => p.data.characterIds.includes("Roverelectrofemale"))!;
    const before = JSON.stringify(preset);
    expect(teamPresetForAccount(preset, { Roverelectrofemale: built })).toBe(preset);
    expect(teamPresetForAccount(preset, {})).toBe(preset);
    const his = teamPresetForAccount(preset, { Roverelectromale: built });
    expect(his).not.toBe(preset);
    expect(his.name).toBe(preset.name);
    expect(his.data.characterIds).toEqual(preset.data.characterIds.map((id) => (id === "Roverelectrofemale" ? "Roverelectromale" : id)));
    expect(JSON.stringify(his.data)).not.toContain("Roverelectrofemale");
    expect(JSON.stringify(preset)).toBe(before);
  });
});
