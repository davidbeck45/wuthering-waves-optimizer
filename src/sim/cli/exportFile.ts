// Wuthering Tools+ CLI — the export file is the CLI's database: Settings › Backup › Download
// writes `character_data_YYYY-M-D.json`; every command reads one (newest in ~/Downloads by
// default) and never modifies it. Shape and parser: exportShape.ts (pure, shared with the browser).
import { readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { applyMigrationTransforms, parseMetaDataVersion } from "../../migrations";
import { parseExport, parseStore, type ExportFile } from "./exportShape";

// the pure half (type + parser) lives in exportShape.ts so the browser can use it; re-exported here for the CLI
export { parseExport, type ExportFile };

const EXPORT_NAME = /^character_data_.*\.json$/;

/** The most recently modified `character_data_*.json` in a folder (default ~/Downloads). */
export function findNewestExport(dir = join(homedir(), "Downloads")): string | null {
  let newest: { path: string; mtime: number } | null = null;
  for (const name of readdirSync(dir)) {
    if (!EXPORT_NAME.test(name)) continue;
    const path = join(dir, name);
    const mtime = statSync(path).mtimeMs;
    if (!newest || mtime > newest.mtime) newest = { path, mtime };
  }
  return newest?.path ?? null;
}

const STORE_KEYS = ["character", "inventory", "teamRotations"] as const;

/** An export with each store brought to the app's current schema: every migration transform newer than the file's
 *  `meta.version`, the way Settings › Import does (`utils/settingsBackup.ts` parseStorePayload). The app migrates its
 *  own localStorage at boot (`runMigrations`), so a raw v9 file read as-is loses every key a later migration renamed
 *  (010: Cartethyia's "BellBorne eochelone" team buff, Rover Aero's S5 node) and scores lower than the pages do.
 *  Pure: returns a new object, a string store stays a string. A v1 file (no meta) is migrated from version 1. */
export function migrateExport(raw: unknown): unknown {
  if (raw == null || typeof raw !== "object") return raw;
  const file = raw as Record<string, any>;
  const from = file.meta ? parseMetaDataVersion(file.meta) : 1;
  const nested = file.data != null && typeof file.data === "object";
  const data = { ...((nested ? file.data : file) as Record<string, any>) };
  for (const key of STORE_KEYS) {
    const value = data[key];
    if (typeof value === "string") {
      try {
        data[key] = applyMigrationTransforms(value, from);
      } catch {
        // an unreadable store stays as it was; parseStore falls back on it
      }
    } else if (value != null && typeof value === "object") {
      data[key] = JSON.parse(applyMigrationTransforms(JSON.stringify(value), from));
    }
  }
  return nested ? { ...file, data } : data;
}

/** Reads an export from disk at the app's current schema (`migrateExport`); `version` stays the file's own. */
export function readExport(path: string): ExportFile {
  return parseExport(migrateExport(JSON.parse(readFileSync(path, "utf8"))), path);
}

/** `--export <file>`, else $WUWA_EXPORT, else the newest download. */
export function resolveExportPath(explicit?: string): string {
  const path = explicit ?? process.env.WUWA_EXPORT ?? findNewestExport();
  if (!path) {
    throw new Error(
      "No export file found: pass --export <file>, set WUWA_EXPORT, or download one from Settings › Backup & Restore into ~/Downloads",
    );
  }
  return path;
}

/** A copy of an export with its teams (and, when given, characters) replaced — the double-encoded stores kept
 *  double-encoded, everything else re-serialised as it was. Never writes over the source unless `allowSelf` says the
 *  source is itself a synced copy (then the write goes through a temp file and a rename). */
export function writeSyncedExport(
  source: string,
  out: string,
  teams: any[],
  characters: Record<string, any> | null = null,
  options: { allowSelf?: boolean } = {},
): void {
  const same = resolve(out) === resolve(source);
  if (same && !options.allowSelf) throw new Error("refusing to overwrite the source export — pass another --out path");
  const raw = JSON.parse(readFileSync(source, "utf8")) as Record<string, any>;
  const data = (raw.data ?? raw) as Record<string, any>;
  const encodeLike = (original: unknown, value: unknown): unknown => (typeof original === "string" ? JSON.stringify(value) : value);
  const teamRotations = parseStore<Record<string, any>>(data.teamRotations, {});
  data.teamRotations = encodeLike(data.teamRotations, { ...teamRotations, teams });
  if (characters) {
    const character = parseStore<Record<string, any>>(data.character, {});
    data.character = encodeLike(data.character, { ...character, characters });
  }
  if (same) {
    const tmp = `${out}.tmp-${process.pid}`;
    writeFileSync(tmp, JSON.stringify(raw));
    renameSync(tmp, out);
    return;
  }
  writeFileSync(out, JSON.stringify(raw));
}
