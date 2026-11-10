// Wuthering Tools+ — stars on stock teams follow their names (hunt round 1, 2026-11-06), on either side of the rename
// (hunt round 2, 2026-11-09).
//
// Ryan's store keeps a starred preset by its name, as presets have no id. The 2026-11-04 rename ("wuwa_calc Aemeath
// S6R5 · Chisa + Denia" to "Aemeath · Chisa + Denia · S6R5 (wuwa_calc)", `wuwaCalcTeamName`'s form) moved all 149, so
// every star on a stock team stopped matching. The old strings were still in storage, so nothing was lost.
//
// A starred stock team is kept under BOTH names. The first fix rewrote each old name to the new one, and a rollback to
// a build from before the rename then showed no star at all: its presets still carry the old names (F3). A name that
// matches no preset is ignored by either build, so each build reads its own and the stars show on both.
//
// Keeping both has one trap: an unstar on this build removes the new name, and the old one left behind would bring the
// star back on the next load. So the pair moves together: `installStarTwins` adds or removes the other name whenever
// this build stars or unstars a stock team. Nothing is ever unstarred on a guess. A lone name gets its twin on the next
// load, never the reverse, so an unstar made on the old build during a rollback comes back on return: that build
// removes one name only, and a lone name cannot be told from a star that never had its twin.
//
// `migrateStarredPresets` runs on every load, before Pinia reads the record, not once behind a flag: an old backup
// restored later, or a tab still on the old build writing its state back, brings lone names in again. It stands alone
// (no name parser, no team data) because it sits in the entry chunk.

const STORE_KEY = "teamRotations";
/** "wuwa_calc <Main> <tag> · <A + B>", the tag being "S6R5" or "S6R5 DPS · S0R1 team" */
const OLD_STOCK_TEAM = /^wuwa_calc (.+?) (S\d(?:R\d)?(?: DPS · \S+ team)?) · (.+ \+ .+)$/;
/** "<Main> · <A + B> · <tag> (wuwa_calc)": the same team since the rename */
const NEW_STOCK_TEAM = /^(.+?) · (.+ \+ .+) · (S\d(?:R\d)?(?: DPS · \S+ team)?) \(wuwa_calc\)$/;

export function upgradeStarredPresetName(name: string): string {
  const old = OLD_STOCK_TEAM.exec(name);
  return old ? `${old[1]} · ${old[3]} · ${old[2]} (wuwa_calc)` : name;
}

/** The name a stock team had before the rename: what a build from before it (a rollback) looks a star up by. */
export function oldStarredPresetName(name: string): string {
  const now = NEW_STOCK_TEAM.exec(name);
  return now ? `wuwa_calc ${now[1]} ${now[3]} · ${now[2]}` : name;
}

/** A stock team's other name (the new one for an old, the old one for a new), or null for any other preset. Only a
 *  pair that maps back onto itself counts, so a name is never given a twin that would ask for a third. */
export function starTwin(name: string): string | null {
  const up = upgradeStarredPresetName(name);
  if (up !== name) return oldStarredPresetName(up) === name ? up : null;
  const down = oldStarredPresetName(name);
  return down !== name && upgradeStarredPresetName(down) === name ? down : null;
}

/** The stars with both names of every stock team among them, each twin right after the name that brought it. */
export function withStarTwins(stars: readonly unknown[]): unknown[] {
  const out: unknown[] = [];
  const add = (name: unknown): void => {
    if (!out.includes(name)) out.push(name);
  };
  const held = new Set(stars);
  for (const name of stars) {
    add(name);
    const twin = typeof name === "string" ? starTwin(name) : null;
    if (twin && !held.has(twin)) add(twin);
  }
  return out;
}

type StarStorage = Pick<Storage, "getItem" | "setItem">;

export function migrateStarredPresets(storage?: StarStorage): void {
  try {
    const store = storage ?? localStorage;
    const raw = store.getItem(STORE_KEY);
    if (!raw?.includes("wuwa_calc")) return; // no stock team anywhere in the record: not worth parsing the teams
    const data = JSON.parse(raw);
    const stars: unknown = data?.favoritePresetNames;
    if (!Array.isArray(stars)) return;
    const next = withStarTwins(stars);
    if (next.length === stars.length && next.every((name, i) => name === stars[i])) return;
    store.setItem(STORE_KEY, JSON.stringify({ ...data, favoritePresetNames: next }));
  } catch {
    /* a record that is not ours to read or storage that refuses: the stars stay as they were, and nothing else depends on this */
  }
}

/* eslint-disable no-unused-vars -- the parameters of interface methods and function types */
/** The part of Ryan's teams store the pairing needs. */
export interface StarStore {
  favoritePresetNames: string[];
  $onAction(listener: (context: { name: string; args: unknown[]; after: (callback: () => void) => void }) => void): () => void;
}
/* eslint-enable no-unused-vars */

/**
 * Keeps a stock team's two names together while this build stars and unstars (PlusShell installs it once). After
 * `toggleFavoritePreset(name)`: starred, its twin is starred too, so a rollback shows a star made here; unstarred, its
 * twin goes too, so the next load does not bring the star back. Returns the unsubscribe.
 */
export function installStarTwins(store: StarStore): () => void {
  return store.$onAction(({ name, args, after }) => {
    if (name !== "toggleFavoritePreset") return;
    const preset = args[0];
    const twin = typeof preset === "string" ? starTwin(preset) : null;
    if (!twin) return;
    after(() => {
      const starred = store.favoritePresetNames.includes(preset as string);
      const at = store.favoritePresetNames.indexOf(twin);
      if (starred && at < 0) store.favoritePresetNames.push(twin);
      else if (!starred && at >= 0) store.favoritePresetNames.splice(at, 1);
    });
  });
}
