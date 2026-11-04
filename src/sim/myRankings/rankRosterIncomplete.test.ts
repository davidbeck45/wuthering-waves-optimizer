// Wuthering Tools+: a ranking that did not fully score must say so. A kit that fails to load (the phone lost its signal
// mid-run) reads like an unknown character and drops them with no error, so without this the saved results would keep
// a roster with holes in it and repeat it in every new tab as "data unchanged".
import { beforeEach, describe, expect, it, vi } from "vitest";
import account from "./__fixtures__/cartethyiaAccount.json";
import { rankRoster } from "./rankRoster";

/** kit name -> how many loads succeed before it starts failing */
const failing = vi.hoisted(() => new Map<string, number>());
vi.mock("../../characters/characters", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../characters/characters")>();
  return {
    ...real,
    getCharByName: async (name: string) => {
      const left = failing.get(name);
      if (left !== undefined) {
        if (left <= 0) throw new TypeError("Failed to fetch dynamically imported module");
        failing.set(name, left - 1);
      }
      return real.getCharByName(name);
    },
  };
});

const team = (id: string, characterIds: string[], actions: unknown[]) => ({ id, name: id, characterIds, actions, duration: null });

describe("an incomplete ranking", () => {
  beforeEach(() => failing.clear());

  it("is not marked on a clean run, and a character the app really lacks does not count (the same on every run)", async () => {
    const ranking = await rankRoster({ ...account.characters, NotACharacter: { weapon: "X" } }, account.echoes, [], { yieldToUi: false });
    expect(ranking.characters.map((c) => c.id)).toEqual(["Cartethyia"]);
    expect(ranking.incomplete).toBeUndefined();
    expect("incomplete" in ranking).toBe(false); // a whole ranking's JSON is what it was before this flag
  }, 60_000);

  it("is marked when a character the roster offers loses its kit, though no error is recorded", async () => {
    failing.set("Chisa", 0);
    const ranking = await rankRoster({ ...account.characters, Chisa: { weapon: "X" } }, account.echoes, [], { yieldToUi: false });
    expect(ranking.characters.map((c) => c.id)).toEqual(["Cartethyia"]);
    expect(ranking.characters.flatMap((c) => c.errors)).toEqual([]);
    expect(ranking.incomplete).toBe(true);
  }, 60_000);

  it("is marked when a rotation list could not be read for a character", async () => {
    failing.set("Cartethyia", 1); // the first load (her name) works, the rotation list's does not
    const ranking = await rankRoster(account.characters, account.echoes, [], { yieldToUi: false });
    expect(ranking.characters[0].errors.length).toBeGreaterThan(0);
    expect(ranking.incomplete).toBe(true);
  }, 60_000);

  it("is marked when a runnable team throws, not for a team that could never run", async () => {
    const own = [...Object.keys(account.characters).slice(0, 1), "Chisa", "Baizhi"];
    const roster = { ...account.characters, Chisa: {}, Baizhi: {} };
    const neverRuns = await rankRoster(roster, account.echoes, [team("empty", own, [])], { yieldToUi: false });
    expect(neverRuns.teamsSkipped).toBeGreaterThan(0);
    expect(neverRuns.incomplete).toBeUndefined();
    failing.set("Chisa", 0);
    const threw = await rankRoster(roster, account.echoes, [team("mine", own, [{ characterId: own[0], attackKey: "x" }])], { yieldToUi: false });
    expect(threw.teams.some((t) => t.id === "mine")).toBe(false);
    expect(threw.incomplete).toBe(true);
  }, 60_000);
});
