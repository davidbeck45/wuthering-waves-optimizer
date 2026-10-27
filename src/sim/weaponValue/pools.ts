// Wuthering Tools+ — the selector pools /weapons ranks (data/pools.json). Kuro's text news does not list selector
// pools, so the file is hand-entered per game version from the sources each pool names: the Beginner's Choice targets
// and the Standard Weapon Convene list (Kuro's Convene Details, news 758, and the 3.0 patch notes, news 3920) are
// official text; a pool only players report (the Moonlit Path pick) carries `verified: false` and the page says to
// check it in game. Refresh at each upstream sync; poolsSchema in weaponValue.test.ts checks every key against the
// app's registries. Released content only: a key the app does not list never reaches the page (`releasedItems`).
import raw from "./data/pools.json";
import { allCharactersList } from "../../characters/characters";
import { weaponMeta } from "../display/names";

export type PoolKind = "resonator" | "weapon";

export interface SelectorPool {
  id: string;
  kind: PoolKind;
  title: string;
  subtitle: string;
  /** app character keys (resonator pools) or weapon keys (weapon pools) */
  items: string[];
  /** the game version the list is for */
  version: string;
  /** read from Kuro's own text (true) or only reported by players (false: "check in game") */
  verified: boolean;
  source: string;
  sourceUrl: string;
}

export interface PoolsFile {
  v: number;
  gameVersion: string;
  /** when the lists were last checked against their sources (YYYY-MM-DD) */
  checked: string;
  pools: SelectorPool[];
}

export const POOLS: PoolsFile = raw as PoolsFile;

/** the custom pool: resonators the player picks (what their in-game selector shows) */
export const CUSTOM_POOL_ID = "custom";

const characterKeys = (): Set<string> => new Set(allCharactersList.map((c) => c.key));

/** The pool's keys the app has released (characters in the roster list, weapons in the registry). */
export function releasedItems(pool: Pick<SelectorPool, "kind" | "items">): string[] {
  if (pool.kind === "weapon") return pool.items.filter((k) => !!weaponMeta(k));
  const listed = characterKeys();
  return pool.items.filter((k) => listed.has(k));
}

/** The standard 5★ weapons (the Standard Weapon Convene's list) — the "standard 5★" option on every character row. */
export function standardWeaponKeys(): string[] {
  const pool = POOLS.pools.find((p) => p.id === "standard-weapon");
  return pool ? releasedItems(pool) : [];
}

