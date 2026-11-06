import { describe, expect, it } from "vitest";
import teams from "./data/teams.json";
import { wuwaCalcTeamName } from "./presetName";
import { migrateStarredPresets, upgradeStarredPresetName } from "./starredPresets";

const stockNames = new Set((teams as { name: string }[]).map((t) => t.name));

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

describe("migrateStarredPresets", () => {
  const oldA = "wuwa_calc Aemeath S6R5 · Chisa + Denia";
  const newA = "Aemeath · Chisa + Denia · S6R5 (wuwa_calc)";

  it("rewrites the stars and nothing else in the record", () => {
    const storage = storageWith({ teams: [{ id: "t1", name: oldA }], favoriteTeamIds: ["t1"], favoritePresetNames: [oldA, "Hypercarry Zani"] });
    migrateStarredPresets(storage);
    expect(storage.read()).toEqual({ teams: [{ id: "t1", name: oldA }], favoriteTeamIds: ["t1"], favoritePresetNames: [newA, "Hypercarry Zani"] });
  });

  it("does not star a team twice when the new name was starred after the deploy", () => {
    const storage = storageWith({ teams: [], favoriteTeamIds: [], favoritePresetNames: [newA, oldA] });
    migrateStarredPresets(storage);
    expect(storage.read().favoritePresetNames).toEqual([newA]);
  });

  it("runs on every load without touching a record that has nothing to change", () => {
    const storage = storageWith({ teams: [], favoriteTeamIds: [], favoritePresetNames: [newA] });
    migrateStarredPresets(storage);
    expect(storage.writes()).toBe(0);
    const old = storageWith({ teams: [], favoriteTeamIds: [], favoritePresetNames: [oldA] });
    migrateStarredPresets(old);
    migrateStarredPresets(old);
    expect(old.writes()).toBe(1);
  });

  it("picks up an old backup restored later: the next load finds old names again", () => {
    const storage = storageWith({ teams: [], favoriteTeamIds: [], favoritePresetNames: [newA] });
    storage.setItem("teamRotations", JSON.stringify({ teams: [], favoriteTeamIds: [], favoritePresetNames: [oldA] }));
    migrateStarredPresets(storage);
    expect(storage.read().favoritePresetNames).toEqual([newA]);
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
