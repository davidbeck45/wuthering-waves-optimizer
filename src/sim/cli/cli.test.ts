import { describe, expect, it } from "vitest";
import { mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diffSnapshots, findTeam, resolveCharacterKey, type Snapshot } from "./engine";
import { findNewestExport, migrateExport, parseExport, readExport } from "./exportFile";

describe("parseExport", () => {
  it("decodes the double-encoded v9 shape", () => {
    const exp = parseExport(
      {
        meta: { version: "9", source: "WutheringTools" },
        data: {
          character: JSON.stringify({ characters: { Zani: { weapon: "X" } }, activeCharacter: "Zani" }),
          inventory: JSON.stringify({ echoes: [{ echoId: "a" }], equipped: { a: { Zani: 0 } } }),
          teamRotations: JSON.stringify({ teams: [{ id: "t1", name: "Team" }] }),
        },
      },
      "x.json",
    );
    expect(exp.version).toBe("9");
    expect(exp.activeCharacter).toBe("Zani");
    expect(exp.characters.Zani.weapon).toBe("X");
    expect(exp.inventory.echoes).toHaveLength(1);
    expect(exp.inventory.equipped.a.Zani).toBe(0);
    expect(exp.teams[0].name).toBe("Team");
  });

  it("accepts a null inventory and a bare v1 payload", () => {
    const withNull = parseExport({ meta: { version: "3" }, data: { character: '{"characters":{}}', inventory: null } });
    expect(withNull.inventory.echoes).toEqual([]);
    expect(withNull.teams).toEqual([]);
    const v1 = parseExport({ character: JSON.stringify({ characters: { Jinhsi: {} } }) });
    expect(v1.version).toBeNull();
    expect(Object.keys(v1.characters)).toEqual(["Jinhsi"]);
  });
});

describe("readExport runs the app's migrations (the pages read migrated localStorage)", () => {
  // a v9 export as David's 2026-09-16 download: keys that migration 010 (Ryan #677) renamed
  const v9 = {
    meta: { version: "9", source: "WutheringTools" },
    data: {
      character: JSON.stringify({
        characters: {
          Cartethyia: { teamBuffs: { buffs: { "BellBorne eochelone": { isEnabled: true } } } },
          RoverAeroMale: { resonanceChains: { "Sequence Node 5: Life and Death Intertwine": { isEnabled: true } } },
          Zani: { teamBuffs: { buffs: { Other: { isEnabled: true } } } },
        },
        activeCharacter: "Zani",
      }),
      inventory: JSON.stringify({ echoes: [], equipped: {} }),
      teamRotations: JSON.stringify({ teams: [{ id: "t1", actions: [{ key: "Undaunted ayfarerDMG" }] }] }),
    },
  };

  it("renames the v10 keys in characters and teams, and leaves the rest alone", () => {
    const dir = mkdtempSync(join(tmpdir(), "ww-cli-"));
    const path = join(dir, "character_data_2026-9-16.json");
    writeFileSync(path, JSON.stringify(v9));
    const exp = readExport(path);
    expect(exp.version).toBe("9"); // the file's own version is still reported
    expect(Object.keys(exp.characters.Cartethyia.teamBuffs.buffs)).toEqual(["BellBorneGeochelone"]);
    expect(Object.keys(exp.characters.RoverAeroMale.resonanceChains)).toEqual(["SequenceNode5LifeandDeathIntertwine"]);
    expect(exp.characters.Zani.teamBuffs.buffs.Other.isEnabled).toBe(true);
    expect(exp.teams[0].actions[0].key).toBe("UndauntedWayfarerDMG");
  });

  it("keeps string stores strings and never touches a file at the current version", () => {
    const migrated = migrateExport(v9) as typeof v9;
    expect(typeof migrated.data.character).toBe("string");
    expect(migrated.data.character).toContain("BellBorneGeochelone");
    expect(v9.data.character).toContain("BellBorne eochelone"); // the input is not mutated
    const current = { ...v9, meta: { version: "10" } };
    expect(migrateExport(current)).toEqual(current);
    // an object store (already-parsed) is migrated too
    const parsed = migrateExport({ meta: { version: "9" }, data: { character: JSON.parse(v9.data.character) } }) as any;
    expect(Object.keys(parsed.data.character.characters.Cartethyia.teamBuffs.buffs)).toEqual(["BellBorneGeochelone"]);
  });
});

describe("findNewestExport", () => {
  it("picks the most recently modified character_data file", () => {
    const dir = mkdtempSync(join(tmpdir(), "ww-cli-"));
    const older = join(dir, "character_data_2026-9-11.json");
    const newer = join(dir, "character_data_2026-9-8 (1).json");
    writeFileSync(older, "{}");
    writeFileSync(newer, "{}");
    writeFileSync(join(dir, "notes.json"), "{}");
    utimesSync(older, new Date("2026-09-11T10:00:00Z"), new Date("2026-09-11T10:00:00Z"));
    utimesSync(newer, new Date("2026-09-12T10:00:00Z"), new Date("2026-09-12T10:00:00Z"));
    expect(findNewestExport(dir)).toBe(newer);
  });
});

describe("resolveCharacterKey / findTeam", () => {
  const characters = { YangyangXuanling: {}, Cartethyia: {}, Camellya: {}, Cantarella: {} };
  it("matches exact, case-insensitive and unique substrings", () => {
    expect(resolveCharacterKey("Camellya", characters)).toBe("Camellya");
    expect(resolveCharacterKey("camellya", characters)).toBe("Camellya");
    expect(resolveCharacterKey("xuanling", characters)).toBe("YangyangXuanling");
  });
  it("rejects ambiguous and unknown names with the candidates", () => {
    expect(() => resolveCharacterKey("ca", characters)).toThrow(/Ambiguous.*Camellya, Cantarella, Cartethyia/);
    expect(() => resolveCharacterKey("Zani", characters)).toThrow(/No character "Zani"/);
  });
  it("finds teams by id, index, or name", () => {
    const teams = [{ id: "t1", name: "Xuanling hypercarry" }, { id: "t2", name: "Phrolova S6R5 (wuwa_calc)" }];
    expect(findTeam("t2", teams).name).toBe("Phrolova S6R5 (wuwa_calc)");
    expect(findTeam("1", teams).id).toBe("t1");
    expect(findTeam("phrolova", teams).id).toBe("t2");
    expect(() => findTeam("nope", teams)).toThrow(/No team "nope"/);
  });
});

describe("diffSnapshots", () => {
  const base: Snapshot = {
    generatedAt: "2026-09-13T00:00:00Z",
    export: "a.json",
    appCommit: "aaaa",
    characters: {
      Zani: { weapon: "W", sequence: 6, stats: { totalAtk: 2743, totalCritRate: 0.688 }, rotations: { Loop: { normal: 100, avg: 200, crit: 300 } } },
    },
    teams: { "Team A": { characterIds: ["Zani", null, null], normal: 1000, avg: 2000, crit: 3000 } },
    errors: {},
  };
  const clone = (): Snapshot => JSON.parse(JSON.stringify(base));

  it("reports nothing for identical snapshots", () => {
    expect(diffSnapshots(base, clone())).toEqual([]);
  });

  it("lists moved numbers with the relative change, and added or removed entries", () => {
    const after = clone();
    after.characters.Zani.rotations.Loop.avg = 210;
    after.characters.Zani.stats.totalCritRate = 0.688000001; // below tolerance
    delete after.teams["Team A"];
    after.teams["Team B"] = { characterIds: ["Zani", null, null], normal: 1, avg: 2, crit: 3 };
    const changes = diffSnapshots(base, after);
    expect(changes.find((c) => c.path === "characters.Zani.rotations.Loop.avg")).toEqual({
      path: "characters.Zani.rotations.Loop.avg",
      before: 200,
      after: 210,
      deltaPct: 0.05,
    });
    expect(changes.find((c) => c.path === "characters.Zani.stats.totalCritRate")).toBeUndefined();
    expect(changes.find((c) => c.path === "teams.Team A.avg")).toMatchObject({ before: 2000, after: null });
    expect(changes.find((c) => c.path === "teams.Team B.avg")).toMatchObject({ before: null, after: 2 });
  });

  it("honours a custom tolerance", () => {
    const after = clone();
    after.characters.Zani.rotations.Loop.avg = 204; // +2 %
    expect(diffSnapshots(base, after, 5)).toEqual([]);
    expect(diffSnapshots(base, after, 1)).toHaveLength(1);
  });
});
