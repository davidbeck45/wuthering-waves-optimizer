// Wuthering Tools+ — the export file's shape, pure: no node:fs, so the browser (the AI tools' live account
// adapter, src/sim/live/liveExport.ts) and the CLI (exportFile.ts re-exports these) read one type.
// Shape: docs in the vault's "WuWa Export Format" note — `data.character` / `data.inventory` /
// `data.teamRotations` are JSON *strings* (double-encoded) in a downloaded file.

export interface ExportFile {
  path: string;
  version: string | null;
  source: string | null;
  characters: Record<string, any>;
  activeCharacter: string | null;
  inventory: { echoes: any[]; equipped: Record<string, any>; echoPresets: any[]; equippedPresets: Record<string, any> };
  teams: any[];
}

/** A store as the export holds it: a JSON string (the usual case), an already-parsed object, or nothing. */
export function parseStore<T>(value: unknown, fallback: T): T {
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
