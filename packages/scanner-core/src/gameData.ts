/**
 * The game data the scanner logic needs, supplied by the host app.
 *
 * scanner-core holds logic only. Each app passes its own copy of the tables in once at
 * startup with `setScannerGameData`:
 * - Wuthering Tools builds it from `src/echoes/*` (see `src/scanner/gameData.ts`).
 * - Wavescan builds it from a generated `scanner-data.json` snapshot.
 *
 * Keeping data out of the package means the CLI generators keep writing to the app's own
 * files, and a new echo released mid-patch only needs new data, not a new package version.
 */

/** The parts of an echo the scanner uses to identify it. */
export interface ScannerEcho {
  key: string;
  name: string;
  /** Echo class ("Calamity", "Overlord", "Elite", "Common"); maps to cost via `echoCostByClass`. */
  class: string;
  /** Sonata sets this echo can roll, when known. */
  sets?: string[];
}

export interface ScannerGameData {
  /** Every echo, keyed by its registry key (e.g. "AbyssalGladius"). */
  echoes: Record<string, ScannerEcho>;
  /** Echo class → cost (1, 3 or 4). */
  echoCostByClass: Record<string, number>;
  /** Main-stat values: cost → stat key → rank → value. */
  statsTable: Record<number, Record<string, Record<string, number>>>;
  /** Legal substat rolls per stat key, lowest to highest. */
  subStatsTable: Record<string, number[]>;
  /** Display label (including OCR-friendly aliases) → canonical stat key. */
  verboseStatLabelMap: Record<string, string>;
  /** Fixed secondary-stat value per cost and rank (cost 1: HP, cost 3/4: ATK). */
  flatBonusesByRankByType: Record<number, Record<number, number>>;
}

let current: ScannerGameData | null = null;

/** Supplies the game data. Call once at startup, and again whenever the data changes. */
export function setScannerGameData(data: ScannerGameData): void {
  current = data;
}

/** The current game data. Throws if the host app never called `setScannerGameData`. */
export function scannerGameData(): ScannerGameData {
  if (!current) {
    throw new Error("scanner-core: call setScannerGameData() before using the scanner");
  }
  return current;
}

/**
 * The echo with this key. Like Wuthering Tools' `getEchoData`, an unknown key yields
 * `undefined` at runtime despite the type; callers only pass keys from the data itself.
 */
export function getScannerEcho(key: string): ScannerEcho {
  return scannerGameData().echoes[key];
}

/** Cost (1, 3 or 4) for an echo class (same semantics as Wuthering Tools' `getCostByClass`). */
export function costByClass(echoClass: string): number {
  return scannerGameData().echoCostByClass[echoClass];
}

/**
 * Caches a value derived from the game data, recomputing it whenever
 * `setScannerGameData` is called with a different object.
 */
export function derivedFromGameData<T>(compute: (data: ScannerGameData) => T): () => T {
  let cachedFor: ScannerGameData | null = null;
  let cached: T;
  return () => {
    const data = scannerGameData();
    if (cachedFor !== data) {
      cached = compute(data);
      cachedFor = data;
    }
    return cached;
  };
}
