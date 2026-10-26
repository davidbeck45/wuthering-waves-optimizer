// Wuthering Tools+ — the Convene page's small preferences: which tab was open, the player's server clock for the
// banner calendar, and the pull advisor's inputs (budget, pity typed by hand when there's no imported history).
// localStorage `wtplus:convene:prefs`, versioned; anything unreadable falls back to the defaults (these are settings,
// not user data — nothing here is worth refusing over). Pure: storage is injected.
import { SERVER_REGIONS } from "./banners";
import type { KeyValueStorage } from "./gachaImport";

export const CONVENE_PREFS_KEY = "wtplus:convene:prefs";
export const CONVENE_PREFS_VERSION = 1;

export const CONVENE_TABS = ["simulator", "pulls", "banners", "advisor"] as const;
export type ConveneTab = (typeof CONVENE_TABS)[number];
export type ServerRegionId = (typeof SERVER_REGIONS)[number]["id"];

export interface ManualPity {
  pity: number;
  guaranteed: boolean;
}

export interface ConvenePrefs {
  tab: ConveneTab;
  /** null = guess from the browser's time zone */
  server: ServerRegionId | null;
  /** Astrite + Lunite the advisor may count on; null = no budget column */
  budgetAstrite: number | null;
  /** per pool type, pity typed into the advisor (used when the history has no records for that pool) */
  manualPity: Record<string, ManualPity>;
}

export function defaultConvenePrefs(): ConvenePrefs {
  return { tab: "simulator", server: null, budgetAstrite: null, manualPity: {} };
}

const isTab = (x: unknown): x is ConveneTab => typeof x === "string" && (CONVENE_TABS as readonly string[]).includes(x);
const isServer = (x: unknown): x is ServerRegionId => typeof x === "string" && SERVER_REGIONS.some((r) => r.id === x);

function clampPity(n: unknown): number {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? Math.min(79, Math.max(0, v)) : 0;
}

export function decodeConvenePrefs(raw: string | null): ConvenePrefs {
  const out = defaultConvenePrefs();
  if (!raw) return out;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || o.v !== CONVENE_PREFS_VERSION) return out;
    if (isTab(o.tab)) out.tab = o.tab;
    if (isServer(o.server)) out.server = o.server;
    const budget = Number(o.budgetAstrite);
    if (o.budgetAstrite != null && Number.isFinite(budget) && budget > 0) out.budgetAstrite = Math.floor(budget);
    if (o.manualPity && typeof o.manualPity === "object") {
      for (const [k, v] of Object.entries(o.manualPity as Record<string, { pity?: unknown; guaranteed?: unknown }>)) {
        if (/^\d{1,2}$/.test(k) && v && typeof v === "object") out.manualPity[k] = { pity: clampPity(v.pity), guaranteed: v.guaranteed === true };
      }
    }
  } catch {
    /* defaults */
  }
  return out;
}

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readConvenePrefs(storage: KeyValueStorage | null = defaultStorage()): ConvenePrefs {
  try {
    return decodeConvenePrefs(storage?.getItem(CONVENE_PREFS_KEY) ?? null);
  } catch {
    return defaultConvenePrefs();
  }
}

export function writeConvenePrefs(prefs: ConvenePrefs, storage: KeyValueStorage | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(CONVENE_PREFS_KEY, JSON.stringify({ v: CONVENE_PREFS_VERSION, ...prefs }));
    return true;
  } catch {
    return false;
  }
}

/**
 * The server clock a browser most likely plays on, from its UTC offset in minutes east (−new Date().getTimezoneOffset()):
 * the Americas → America (UTC−5), Europe / Africa → Europe (UTC+1), the rest → Asia (UTC+8).
 */
export function guessServerRegion(offsetMinutesEast: number): ServerRegionId {
  const h = offsetMinutesEast / 60;
  if (h <= -3) return "america";
  if (h <= 4) return "europe";
  return "asia";
}

export function serverOffsetHours(id: ServerRegionId): number {
  return SERVER_REGIONS.find((r) => r.id === id)?.offsetHours ?? 8;
}
