// Wuthering Tools+ CLI: an export is read the way the app's import reads it — the store migrations run from the file's
// `meta.version` (src/migrations; `migrateExport` in exportFile.ts, unit-tested in cli.test.ts — this file checks the
// engine's numbers end to end). The public Cartethyia fixture still carries the mistyped team buff
// "BellBorne eochelone" (enabled), which migration 010 renames; before this the CLI dropped that buff and read her
// 2 % low against the pages (2026-10-31 audit M2).
import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import account from "../myRankings/__fixtures__/cartethyiaAccount.json";
import { applyMigrationTransforms } from "../../migrations";
import { calcCharacter } from "./engine";
import { migrateExport, parseExport, readExport } from "./exportFile";

const dirs: string[] = [];
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

const character = { characters: account.characters, activeCharacter: "Cartethyia" };
const inventory = { echoes: account.echoes, equipped: {}, echoPresets: [], equippedPresets: {} };
const teamRotations = { teams: [] };

/** a v9 export as Settings › Backup writes it (the stores double-encoded) */
function v9File(): Record<string, unknown> {
  return {
    meta: { version: "9", source: "WutheringTools" },
    data: { character: JSON.stringify(character), inventory: JSON.stringify(inventory), teamRotations: JSON.stringify(teamRotations) },
  };
}

describe("the CLI reads an export through the app's store migrations", () => {
  it("renames the mistyped keys of a v9 file, keeps the stores double-encoded, and leaves a current file alone", () => {
    expect(JSON.stringify(account)).toContain("BellBorne eochelone");
    const migrated = migrateExport(v9File()) as { data: Record<string, unknown> };
    expect(typeof migrated.data.character).toBe("string");
    const exp = parseExport(migrated);
    expect(exp.characters.Cartethyia.teamBuffs.buffs.BellBorneGeochelone).toEqual({ isEnabled: true });
    expect(exp.characters.Cartethyia.teamBuffs.buffs["BellBorne eochelone"]).toBeUndefined();
    // the same as the app's own import path (settingsBackup.ts parseStorePayload)
    expect(exp.characters).toEqual(JSON.parse(applyMigrationTransforms(JSON.stringify(character), 9)).characters);
    // a v10 file is already current: nothing runs
    const current = { ...v9File(), meta: { version: "10" } };
    expect(migrateExport(current)).toEqual(current);
  });

  it(
    "Cartethyia's rotation damage matches the migrated data, not the raw file (the enabled Bell-Borne buff counts)",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "wtplus-migrate-"));
      dirs.push(dir);
      const path = join(dir, "character_data_2026-10-31.json");
      writeFileSync(path, JSON.stringify(v9File()));
      const before = readFileSync(path, "utf8");
      const read = readExport(path);
      expect(readFileSync(path, "utf8")).toBe(before); // the file is never touched
      const raw = parseExport(v9File(), path);
      const fixed = await calcCharacter("Cartethyia", read, { attacks: false });
      const old = await calcCharacter("Cartethyia", raw, { attacks: false });
      const avg = (c: typeof fixed) => c.rotations.map((r) => r.avg);
      expect(fixed.rotations.length).toBeGreaterThan(0);
      // the renamed buff is enabled, so every rotation gains; the old reading dropped it
      fixed.rotations.forEach((r, i) => expect(r.avg).toBeGreaterThan(old.rotations[i].avg));
      // and the migrated reading equals a file that already had the corrected key
      const file = v9File() as { data: Record<string, string> };
      file.data.character = file.data.character.split("BellBorne eochelone").join("BellBorneGeochelone");
      const corrected = parseExport(file);
      expect(avg(await calcCharacter("Cartethyia", corrected, { attacks: false }))).toEqual(avg(fixed));
    },
    60_000,
  );
});
