// Wuthering Tools+ — stars on stock teams follow their names (hunt round 1, 2026-11-06).
//
// Ryan's store keeps a starred preset by its name, as presets have no id. The 2026-11-04 rename ("wuwa_calc Aemeath
// S6R5 · Chisa + Denia" to "Aemeath · Chisa + Denia · S6R5 (wuwa_calc)", `wuwaCalcTeamName`'s form) moved all 149, so
// every star on a stock team stopped matching. The old strings stay in storage, so nothing was lost: this rewrites them.
//
// It runs on every load, before Pinia reads the record, not once behind a flag: an old backup restored later, or a tab
// still on the old build writing its state back, brings old names in again. It stands alone (no name parser, no team
// data) because it sits in the entry chunk.

const STORE_KEY = "teamRotations";
/** "wuwa_calc <Main> <tag> · <A + B>", the tag being "S6R5" or "S6R5 DPS · S0R1 team" */
const OLD_STOCK_TEAM = /^wuwa_calc (.+?) (S\d(?:R\d)?(?: DPS · \S+ team)?) · (.+ \+ .+)$/;

export function upgradeStarredPresetName(name: string): string {
  const old = OLD_STOCK_TEAM.exec(name);
  return old ? `${old[1]} · ${old[3]} · ${old[2]} (wuwa_calc)` : name;
}

type StarStorage = Pick<Storage, "getItem" | "setItem">;

export function migrateStarredPresets(storage?: StarStorage): void {
  try {
    const store = storage ?? localStorage;
    const raw = store.getItem(STORE_KEY);
    if (!raw?.includes("wuwa_calc ")) return; // nearly every load: not worth parsing the teams
    const data = JSON.parse(raw);
    const stars: unknown = data?.favoritePresetNames;
    if (!Array.isArray(stars)) return;
    const next = [...new Set(stars.map((name) => (typeof name === "string" ? upgradeStarredPresetName(name) : name)))];
    if (next.length === stars.length && next.every((name, i) => name === stars[i])) return;
    store.setItem(STORE_KEY, JSON.stringify({ ...data, favoritePresetNames: next }));
  } catch {
    /* a record that is not ours to read or storage that refuses: the stars stay as they were, and nothing else depends on this */
  }
}
