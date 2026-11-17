// Wuthering Tools+ — the generated kit tables. The small index (who has a brief: 6 KB) ships with whatever imports
// it, the list page and the command palette. The briefs themselves (data/kits.json, ~450 KB) are their own chunk,
// fetched when a brief page opens: never import that file statically.
import indexFile from "./data/kitIndex.json";
import type { KitIndexEntry, KitIndexFile, KitsFile } from "./kits";

export const KIT_INDEX: KitIndexFile = indexFile as KitIndexFile;
export const KIT_INDEX_ENTRIES: readonly KitIndexEntry[] = KIT_INDEX.kits;

let briefs: Promise<KitsFile> | null = null;

/** The briefs, loaded once. A failed fetch (a phone that lost its signal) is not kept: the next call tries again. */
export function loadKits(): Promise<KitsFile> {
  briefs ??= import("./data/kits.json").then(
    (m) => m.default as unknown as KitsFile,
    (err) => {
      briefs = null;
      throw err;
    },
  );
  return briefs;
}
