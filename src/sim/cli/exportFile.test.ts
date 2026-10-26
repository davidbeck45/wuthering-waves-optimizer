// Wuthering Tools+: `writeSyncedExport` is the one place the CLI writes an export ("Sync my teams", headless). The export is
// the user's whole account — these pin that it never clobbers its source, keeps the double-encoded stores double-encoded,
// leaves every field it was not asked to replace byte-for-byte, and reads back through the importer's parser.
import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseExport, readExport, writeSyncedExport } from "./exportFile";

const character = { characters: { Aemeath: { weapon: "EverbrightPolestar", weapons: { EverbrightPolestar: { refinement: "5" } } } }, activeCharacter: "Aemeath", favoriteCharacters: ["Aemeath"] };
const inventory = { echoes: [{ echoId: "e1", echo: "Hurriclaw" }], equipped: { e1: { Aemeath: 0 } }, echoPresets: [], equippedPresets: {} };
const teamRotations = { teams: [{ id: "t1", name: "wuwa_calc Aemeath S6R5 · Mornye + Lynae", characterIds: ["Aemeath", "Mornye", "Lynae"], actions: [] }], activeTeamId: "t1" };

const dirs: string[] = [];
const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "wtplus-export-"));
  dirs.push(dir);
  return dir;
};
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/** a v9 export as Settings › Backup writes it: the three stores are JSON strings inside the JSON */
function writeSource(dir: string, name = "character_data_2026-9-16.json"): string {
  const path = join(dir, name);
  writeFileSync(
    path,
    JSON.stringify({
      meta: { version: "9", source: "WutheringTools" },
      data: { character: JSON.stringify(character), inventory: JSON.stringify(inventory), teamRotations: JSON.stringify(teamRotations) },
    }),
  );
  return path;
}

const newTeams = [{ id: "t1", name: "wuwa_calc Aemeath S6R5 · Mornye + Lynae", characterIds: ["Aemeath", "Mornye", "Lynae"], actions: [{ slot: 0, order: 1, key: "X", type: "basic", count: 2 }], handoffs: { Aemeath: ["Mornye"] } }];

describe("writeSyncedExport", () => {
  it("writes a copy with the teams replaced and every other store untouched, still double-encoded", () => {
    const dir = tempDir();
    const source = writeSource(dir);
    const before = readFileSync(source, "utf8");
    const out = join(dir, "character_data_2026-9-16_synced.json");
    writeSyncedExport(source, out, newTeams);

    expect(readFileSync(source, "utf8")).toBe(before); // the source is never modified
    const raw = JSON.parse(readFileSync(out, "utf8"));
    const src = JSON.parse(before);
    expect(raw.meta).toEqual({ version: "9", source: "WutheringTools" });
    expect(typeof raw.data.teamRotations).toBe("string");
    expect(raw.data.character).toBe(src.data.character); // not asked to replace: the very same string
    expect(raw.data.inventory).toBe(src.data.inventory);
    const rotations = JSON.parse(raw.data.teamRotations);
    expect(rotations.teams).toEqual(newTeams);
    expect(rotations.activeTeamId).toBe("t1"); // the store's other fields survive
  });

  it("replaces the characters when given them, keeping the character store's other fields", () => {
    const dir = tempDir();
    const source = writeSource(dir);
    const out = join(dir, "out.json");
    const characters = { ...character.characters, Aemeath: { ...character.characters.Aemeath, rotations: [{ id: "r1", name: "loop" }] } };
    writeSyncedExport(source, out, newTeams, characters);
    const raw = JSON.parse(readFileSync(out, "utf8"));
    expect(typeof raw.data.character).toBe("string");
    const store = JSON.parse(raw.data.character);
    expect(store.characters).toEqual(characters);
    expect(store.activeCharacter).toBe("Aemeath");
    expect(store.favoriteCharacters).toEqual(["Aemeath"]);
  });

  it("refuses to write over its source — however the path is spelled — and leaves it as it was", () => {
    const dir = tempDir();
    const source = writeSource(dir);
    const before = readFileSync(source, "utf8");
    expect(() => writeSyncedExport(source, source, newTeams)).toThrow(/refusing to overwrite the source export/);
    expect(() => writeSyncedExport(source, join(dir, ".", "character_data_2026-9-16.json"), newTeams)).toThrow(/refusing/);
    expect(readFileSync(source, "utf8")).toBe(before);
    expect(readdirSync(dir)).toEqual(["character_data_2026-9-16.json"]);
  });

  it("allowSelf rewrites a synced copy in place through a temp file that does not stay behind", () => {
    const dir = tempDir();
    const source = writeSource(dir, "character_data_2026-9-16_synced.json");
    writeSyncedExport(source, source, newTeams, null, { allowSelf: true });
    expect(readdirSync(dir)).toEqual(["character_data_2026-9-16_synced.json"]);
    const exp = readExport(source);
    expect(exp.teams).toEqual(newTeams);
    expect(exp.characters).toEqual(character.characters);
    expect(exp.inventory.echoes).toEqual(inventory.echoes);
  });

  it("round-trips through the parser the app's import uses, and keeps an object-shaped store an object", () => {
    const dir = tempDir();
    // an export whose stores are plain objects (older writers) stays that way
    const source = join(dir, "plain.json");
    writeFileSync(source, JSON.stringify({ meta: { version: "4" }, data: { character, inventory, teamRotations } }));
    const out = join(dir, "plain_synced.json");
    writeSyncedExport(source, out, newTeams, character.characters);
    const raw = JSON.parse(readFileSync(out, "utf8"));
    expect(typeof raw.data.teamRotations).toBe("object");
    expect(typeof raw.data.character).toBe("object");
    const exp = parseExport(raw, out);
    expect(exp.version).toBe("4");
    expect(exp.teams).toEqual(newTeams);
    expect(exp.activeCharacter).toBe("Aemeath");

    // a double-encoded one read, synced and read again gives the same account back, teams aside
    const v9 = writeSource(dir);
    const v9out = join(dir, "v9_synced.json");
    writeSyncedExport(v9, v9out, newTeams);
    const a = readExport(v9);
    const b = readExport(v9out);
    expect(b.characters).toEqual(a.characters);
    expect(b.inventory).toEqual(a.inventory);
    expect(b.activeCharacter).toBe(a.activeCharacter);
    expect(b.teams).toEqual(newTeams);
  });
});
