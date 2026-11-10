import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it } from "vitest";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import teams from "./data/teams.json";
import { wuwaCalcTeamName } from "./presetName";
import { installStarTwins, migrateStarredPresets, oldStarredPresetName, starTwin, upgradeStarredPresetName, withStarTwins, type StarStore } from "./starredPresets";

const stockNames = new Set((teams as { name: string }[]).map((t) => t.name));
/* eslint-disable no-unused-vars -- the parameters of method types */
type TeamStore = StarStore & { toggleFavoritePreset(name: string): void; hardSetState(data: unknown): void };
/* eslint-enable no-unused-vars */

/** A storage holding `teamRotations`, counting writes. */
function storageWith(data: unknown) {
  const store = new Map<string, string>([["teamRotations", typeof data === "string" ? data : JSON.stringify(data)]]);
  let writes = 0;
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writes++;
      store.set(key, value);
    },
    read: () => JSON.parse(store.get("teamRotations")!),
    writes: () => writes,
  };
}

describe("upgradeStarredPresetName", () => {
  it("maps both old shapes, a one-word and a two-word main, onto the name a stock team has now", () => {
    const seen: Array<[string, string]> = [
      ["wuwa_calc Aemeath S6R5 · Chisa + Denia", "Aemeath · Chisa + Denia · S6R5 (wuwa_calc)"],
      ["wuwa_calc Electro Rover S6R5 · Mornye + Lynae", "Electro Rover · Mornye + Lynae · S6R5 (wuwa_calc)"],
      ["wuwa_calc Aemeath S6R5 DPS · S0R1 team · Chisa + Denia", "Aemeath · Chisa + Denia · S6R5 DPS · S0R1 team (wuwa_calc)"],
    ];
    for (const [old, now] of seen) {
      expect(upgradeStarredPresetName(old)).toBe(now);
      expect(stockNames.has(now), now).toBe(true);
    }
  });

  it("reaches every stock team: each one's old name comes back to it", () => {
    expect(stockNames.size).toBeGreaterThan(100);
    for (const now of stockNames) {
      const [, main, members, tag] = /^(.+?) · (.+? \+ .+?) · (.+) \(wuwa_calc\)$/.exec(now)!;
      expect(upgradeStarredPresetName(`wuwa_calc ${main} ${tag} · ${members}`), now).toBe(now);
      expect(wuwaCalcTeamName(main!, members!.split(" + "), tag!)).toBe(now);
    }
  });

  it("leaves everything else alone: a name already new, Ryan's curated presets, one that only starts the same", () => {
    for (const name of ["Aemeath · Chisa + Denia · S6R5 (wuwa_calc)", "Hypercarry Zani", "wuwa_calc Aemeath", "wuwa_calc notes · not a team"]) {
      expect(upgradeStarredPresetName(name)).toBe(name);
    }
  });
});

describe("a stock team's two names", () => {
  const oldA = "wuwa_calc Aemeath S6R5 · Chisa + Denia";
  const newA = "Aemeath · Chisa + Denia · S6R5 (wuwa_calc)";

  it("the old name comes back from the new one, for every stock team, and each is the other's twin", () => {
    expect(oldStarredPresetName(newA)).toBe(oldA);
    expect(oldStarredPresetName("Aemeath · Chisa + Denia · S6R5 DPS · S0R1 team (wuwa_calc)")).toBe("wuwa_calc Aemeath S6R5 DPS · S0R1 team · Chisa + Denia");
    for (const now of stockNames) {
      const old = oldStarredPresetName(now);
      expect(old, now).toMatch(/^wuwa_calc /);
      expect(upgradeStarredPresetName(old), now).toBe(now);
      expect(starTwin(now), now).toBe(old);
      expect(starTwin(old), now).toBe(now);
    }
  });

  it("no twin for anything else: Ryan's curated presets, a name that only looks alike", () => {
    for (const name of ["Hypercarry Zani", "wuwa_calc Aemeath", "wuwa_calc notes · not a team", "My team · A + B (wuwa_calc)", ""]) {
      expect(starTwin(name), name).toBeNull();
      expect(oldStarredPresetName(name)).toBe(name);
    }
  });

  it("withStarTwins adds the missing name right after the one that brought it, once, and keeps the order", () => {
    expect(withStarTwins([oldA, "Hypercarry Zani"])).toEqual([oldA, newA, "Hypercarry Zani"]);
    expect(withStarTwins([newA])).toEqual([newA, oldA]);
    expect(withStarTwins([newA, "Hypercarry Zani", oldA])).toEqual([newA, "Hypercarry Zani", oldA]);
    expect(withStarTwins([oldA, oldA, 7, null])).toEqual([oldA, newA, 7, null]);
    expect(withStarTwins(withStarTwins([oldA]))).toEqual(withStarTwins([oldA]));
  });
});

describe("migrateStarredPresets", () => {
  const oldA = "wuwa_calc Aemeath S6R5 · Chisa + Denia";
  const newA = "Aemeath · Chisa + Denia · S6R5 (wuwa_calc)";
  const oldB = "wuwa_calc Aemeath S6R5 · Denia + Lynae";
  const newB = "Aemeath · Denia + Lynae · S6R5 (wuwa_calc)";

  it("adds the new name beside each old one, and changes nothing else in the record", () => {
    const storage = storageWith({ teams: [{ id: "t1", name: oldA }], favoriteTeamIds: ["t1"], favoritePresetNames: [oldA, "Hypercarry Zani"] });
    migrateStarredPresets(storage);
    expect(storage.read()).toEqual({ teams: [{ id: "t1", name: oldA }], favoriteTeamIds: ["t1"], favoritePresetNames: [oldA, newA, "Hypercarry Zani"] });
  });

  it("a rollback still shows the stars: the build from before the rename finds its own names in the list", () => {
    // production's storage, opened once on this build
    const storage = storageWith({ teams: [], favoriteTeamIds: [], favoritePresetNames: [oldA, oldB] });
    migrateStarredPresets(storage);
    const stars: string[] = storage.read().favoritePresetNames;
    // each build stars a card when the list holds that card's name (Ryan's `isFavoritePreset`)
    for (const productionCard of [oldA, oldB]) expect(stars.includes(productionCard), productionCard).toBe(true);
    for (const cardNow of [newA, newB]) expect(stars.includes(cardNow), cardNow).toBe(true);
  });

  it("a star the first fix already rewrote gets its old name back, so a rollback shows it too", () => {
    const storage = storageWith({ teams: [], favoriteTeamIds: [], favoritePresetNames: [newA] });
    migrateStarredPresets(storage);
    expect(storage.read().favoritePresetNames).toEqual([newA, oldA]);
  });

  it("does not star a team twice: both names already there is nothing to do", () => {
    const storage = storageWith({ teams: [], favoriteTeamIds: [], favoritePresetNames: [newA, oldA] });
    migrateStarredPresets(storage);
    expect(storage.read().favoritePresetNames).toEqual([newA, oldA]);
    expect(storage.writes()).toBe(0);
  });

  it("runs on every load without touching a record that has nothing to change", () => {
    const none = storageWith({ teams: [{ id: "t1", name: newA }], favoriteTeamIds: [], favoritePresetNames: ["Hypercarry Zani"] });
    migrateStarredPresets(none);
    expect(none.writes()).toBe(0);
    const old = storageWith({ teams: [], favoriteTeamIds: [], favoritePresetNames: [oldA] });
    migrateStarredPresets(old);
    migrateStarredPresets(old);
    expect(old.writes()).toBe(1);
  });

  it("picks up an old backup restored later: the next load finds a lone old name again", () => {
    const storage = storageWith({ teams: [], favoriteTeamIds: [], favoritePresetNames: [newA, oldA] });
    storage.setItem("teamRotations", JSON.stringify({ teams: [], favoriteTeamIds: [], favoritePresetNames: [oldA] }));
    migrateStarredPresets(storage);
    expect(storage.read().favoritePresetNames).toEqual([oldA, newA]);
  });

  it("never throws: no record, a record that is not JSON, one from before stars, storage that refuses", () => {
    expect(() => migrateStarredPresets({ getItem: () => null, setItem: () => undefined })).not.toThrow();
    const garbled = storageWith("wuwa_calc {not json");
    expect(() => migrateStarredPresets(garbled)).not.toThrow();
    const noStars = storageWith({ teams: [{ name: oldA }] });
    migrateStarredPresets(noStars);
    expect(noStars.writes()).toBe(0);
    const refusing = { getItem: () => JSON.stringify({ favoritePresetNames: [oldA] }), setItem: () => { throw new Error("quota"); } };
    expect(() => migrateStarredPresets(refusing)).not.toThrow();
    expect(() => migrateStarredPresets({ getItem: () => { throw new Error("blocked"); }, setItem: () => undefined })).not.toThrow();
  });
});


describe("installStarTwins: this build stars and unstars both names together", () => {
  const oldA = "wuwa_calc Aemeath S6R5 · Chisa + Denia";
  const newA = "Aemeath · Chisa + Denia · S6R5 (wuwa_calc)";

  function store() {
    setActivePinia(createPinia());
    const teamStore = useTeamRotationsStore();
    const stop = installStarTwins(teamStore as unknown as StarStore);
    return { teamStore: teamStore as unknown as TeamStore, stop };
  }

  it("an unstar stays an unstar: the old name goes with the new one, so the next load has nothing to bring back", () => {
    const { teamStore } = store();
    teamStore.hardSetState({ teams: [], favoriteTeamIds: [], favoritePresetNames: [oldA, newA, "Hypercarry Zani"] });
    teamStore.toggleFavoritePreset(newA); // the card on this build carries the new name
    expect(teamStore.favoritePresetNames).toEqual(["Hypercarry Zani"]);
    // what the store now persists, read by the next load's migration
    const storage = storageWith({ teams: [], favoriteTeamIds: [], favoritePresetNames: [...teamStore.favoritePresetNames] });
    migrateStarredPresets(storage);
    expect(storage.read().favoritePresetNames).toEqual(["Hypercarry Zani"]);
    expect(storage.writes()).toBe(0);
  });

  it("without the pairing the unstar came back: the old name left behind is migrated again", () => {
    setActivePinia(createPinia());
    const teamStore = useTeamRotationsStore() as unknown as TeamStore;
    teamStore.hardSetState({ teams: [], favoriteTeamIds: [], favoritePresetNames: [oldA, newA] });
    teamStore.toggleFavoritePreset(newA);
    expect(teamStore.favoritePresetNames).toEqual([oldA]); // Ryan's store removes the one name it was given
    expect(withStarTwins(teamStore.favoritePresetNames)).toContain(newA); // …and a load would star it again
  });

  it("a star made on this build carries the old name too, so a rollback shows it", () => {
    const { teamStore } = store();
    teamStore.toggleFavoritePreset(newA);
    expect(teamStore.favoritePresetNames).toEqual([newA, oldA]);
    teamStore.toggleFavoritePreset(newA);
    expect(teamStore.favoritePresetNames).toEqual([]);
  });

  it("leaves Ryan's curated presets and every other action alone, and stops when told", () => {
    const { teamStore, stop } = store();
    teamStore.toggleFavoritePreset("Hypercarry Zani");
    expect(teamStore.favoritePresetNames).toEqual(["Hypercarry Zani"]);
    teamStore.hardSetState({ teams: [], favoriteTeamIds: [], favoritePresetNames: [oldA] });
    expect(teamStore.favoritePresetNames).toEqual([oldA]); // an import is the next load's to pair, not this hook's
    stop();
    teamStore.toggleFavoritePreset(newA);
    expect(teamStore.favoritePresetNames).toEqual([oldA, newA]);
  });
});
