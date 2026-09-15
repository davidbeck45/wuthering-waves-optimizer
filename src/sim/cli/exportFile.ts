// Wuthering Tools+ CLI — the export file is the CLI's database: Settings › Backup › Download
// writes `character_data_YYYY-M-D.json`; every command reads one (newest in ~/Downloads by
// default) and never modifies it. Shape: docs in the vault's "WuWa Export Format" note —
// `data.character` / `data.inventory` / `data.teamRotations` are JSON *strings* (double-encoded).
import { readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface ExportFile {
  path: string;
  version: string | null;
  source: string | null;
  characters: Record<string, any>;
  activeCharacter: string | null;
  inventory: { echoes: any[]; equipped: Record<string, any>; echoPresets: any[]; equippedPresets: Record<string, any> };
  teams: any[];
}

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

function parseStore<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

/** Parses an export (any data version ≥ 2; a v1 file is the bare character payload). */
export function parseExport(raw: unknown, path = "<memory>"): ExportFile {
  const file = (raw ?? {}) as Record<string, any>;
  const data = (file.data ?? file) as Record<string, any>;
  const character = parseStore<Record<string, any>>(data.character, {});
  const inventory = parseStore<Record<string, any>>(data.inventory, {});
  const teamRotations = parseStore<Record<string, any>>(data.teamRotations, {});
  return {
    path,
    version: file.meta?.version != null ? String(file.meta.version) : null,
    source: file.meta?.source ?? null,
    characters: character.characters ?? {},
    activeCharacter: character.activeCharacter ?? null,
    inventory: {
      echoes: inventory.echoes ?? [],
      equipped: inventory.equipped ?? {},
      echoPresets: inventory.echoPresets ?? [],
      equippedPresets: inventory.equippedPresets ?? {},
    },
    teams: teamRotations.teams ?? [],
  };
}

export function readExport(path: string): ExportFile {
  return parseExport(JSON.parse(readFileSync(path, "utf8")), path);
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
