// Wuthering Tools+ — the generated kit tables. The small index (who has a brief: 6 KB) ships with whatever imports
// it: the list page, the command palette, the links on /account and /my-rankings. The briefs themselves
// (data/kits.json, ~450 KB) are a file of their own that a brief page fetches by its address; never import that file
// statically. A fetch and not a dynamic `import()`: a browser keeps a failed module import failed until the page is
// reloaded, so "Try again" on a phone that lost its signal could never work; a fetch can simply be made again.
import indexFile from "./data/kitIndex.json";
import type { KitIndexEntry, KitIndexFile, KitsFile } from "./kits";

export const KIT_INDEX: KitIndexFile = indexFile as KitIndexFile;
export const KIT_INDEX_ENTRIES: readonly KitIndexEntry[] = KIT_INDEX.kits;

/** Why the briefs did not load. `network`: no answer (offline, a dropped connection): trying again can work.
 *  `stale`: the server answered with something that is not the briefs. The file's name carries its build's hash, so
 *  this is a tab older than the site: only a reload gets the new one. */
export class BriefsError extends Error {
  constructor(
    readonly kind: "network" | "stale",
    message: string,
  ) {
    super(message);
    this.name = "BriefsError";
  }
}

const isKitsFile = (v: unknown): v is KitsFile => {
  const f = v as KitsFile | null;
  return Boolean(f && typeof f === "object" && f._meta && Array.isArray(f.builds) && f.kits && typeof f.kits === "object");
};

type FetchLike = (url: string) => Promise<Pick<Response, "ok" | "json">>;

/** One fetch of the briefs. Never resolves with anything but the table. */
export async function fetchBriefs(url: string, fetchImpl: FetchLike): Promise<KitsFile> {
  let res: Pick<Response, "ok" | "json">;
  try {
    res = await fetchImpl(url);
  } catch {
    throw new BriefsError("network", "the briefs did not arrive");
  }
  let data: unknown = null;
  try {
    data = res.ok ? await res.json() : null;
  } catch {
    data = null; // the site's own page in place of the file: an address this build no longer serves
  }
  if (!isKitsFile(data)) throw new BriefsError("stale", "the server no longer has this build's briefs");
  return data;
}

let briefs: Promise<KitsFile> | null = null;

/** The briefs, fetched once per page load. A failure is not kept: the next call fetches again. */
export function loadKits(url: string, fetchImpl: FetchLike = (u) => fetch(u)): Promise<KitsFile> {
  briefs ??= fetchBriefs(url, fetchImpl).catch((err) => {
    briefs = null;
    throw err;
  });
  return briefs;
}

/** For tests: forget the fetched briefs. */
export function forgetKits(): void {
  briefs = null;
}
