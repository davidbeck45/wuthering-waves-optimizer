// Wuthering Tools+ build history — a Settings import is checked whole before its first write. Upstream's
// `applyImportedDatabase` parsed and replaced one store at a time, so a damaged inventory left a new character store on
// the old echoes, any JSON read as a version-1 backup and wiped the account, and a backup too big for the browser
// replaced characters while their echoes stayed behind (2026-11-05 hunt, H4, H5, M5). `checkImport` throws
// `ImportRefused`, before anything is replaced, unless all three stores parse, the characters are there and they fit
// along with the "Before a Settings import" versions the panel promises. One call in src/utils/settingsBackup.ts.
import { ACCOUNT_STORE_KEYS, roomFor } from "../storage/persistGuard";
import { pendingFrom } from "./importGuard";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** An import that changed nothing. Its message is the sentence the player reads. */
export class ImportRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportRefused";
  }
}

export interface ImportPayloads {
  character: unknown;
  inventory: unknown;
  teamRotations: unknown;
  dataVersion: number;
}

export interface CheckedImport {
  character: Record<string, any>;
  inventory: Record<string, any> | null | undefined;
  teamRotations: Record<string, any> | null | undefined;
}

const NOT_A_BACKUP = "That is not a backup from this site: it has no characters in it, so nothing was changed. A list of echoes goes under Import echoes.";
const NO_ROOM = "That backup does not fit in this browser's storage, so nothing was changed. Delete some versions in Build history to make room, then import it again.";
const damaged = (what: string): string => `That backup is damaged (its ${what} can't be read), so nothing was changed.`;

const isRecord = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const size = (v: unknown): number => JSON.stringify(v ?? null).length;
/** room for a store to come out a little larger than its payload (fields the backup leaves out) */
const SLACK = 4096;

/** All three stores, read and checked. `parse` is upstream's `parseStorePayload`; nothing here writes. */
export function checkImport(read: ImportPayloads, parse: (payload: unknown, fromVersion: number) => unknown, account: { characters: Record<string, any>; echoes: any[] }, storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = localStorage): CheckedImport {
  const parsed = (what: string, payload: unknown): any => {
    try {
      return parse(payload, read.dataVersion);
    } catch {
      throw new ImportRefused(damaged(what));
    }
  };
  const character = parsed("character list", read.character);
  if (!isRecord(character) || !isRecord(character.characters)) throw new ImportRefused(NOT_A_BACKUP);
  const inventory = parsed("echo inventory", read.inventory);
  if (inventory != null && (!isRecord(inventory) || (inventory.echoes != null && !Array.isArray(inventory.echoes)))) throw new ImportRefused(damaged("echo inventory"));
  const teamRotations = parsed("team list", read.teamRotations);
  if (teamRotations != null && (!isRecord(teamRotations) || (teamRotations.teams != null && !Array.isArray(teamRotations.teams)))) throw new ImportRefused(damaged("team list"));

  // the stash, then the versions it turns into, sit beside the new stores for a moment (importGuard.ts)
  const stash = pendingFrom(account.characters, character.characters, account.echoes);
  const stored = ACCOUNT_STORE_KEYS.reduce((n, key) => n + (storage.getItem(key)?.length ?? 0), 0);
  const needed = size(character) + size(inventory) + size(teamRotations) - stored + (stash ? 2 * size(stash) : 0) + SLACK;
  if (!roomFor(needed, storage)) throw new ImportRefused(NO_ROOM);
  return { character, inventory, teamRotations };
}

/** Runs an import; false once the player has been told why it did nothing. */
export function importOrExplain(apply: () => void, showToast: (text: string, variant: "error", ms: number) => void): boolean {
  try {
    apply();
    return true;
  } catch (e) {
    showToast(e instanceof ImportRefused ? e.message : `The import failed: ${e instanceof Error ? e.message : String(e)}`, "error", 9000);
    return false;
  }
}
