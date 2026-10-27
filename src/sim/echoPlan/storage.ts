// Wuthering Tools+ — the echo plan's saved state, localStorage `wtplus:echoPlan:v1`. Everything the player set on the
// page: the switches, planned / excluded characters, per-chip overrides, the "done in game" ticks with the snapshot
// each tick confirmed, the sets the page has shown (to spot a new patch's Sonatas) and the player's own Plan Codes.
// Plan Codes are server-side IDs Kuro issues in game; WT+ never makes or reads one, it only keeps the text.
//
// Persisted data: `parseState` never throws and drops whatever doesn't have the right shape, so a hand-edited or
// half-written entry degrades to defaults instead of breaking the page.
import { parseChipId, type ChipId } from "./catalog";
import { readSnapshot, type CardSnapshot } from "./diff";
import type { Overrides, Verdict } from "./plan";
import type { SourceSwitches } from "./wants";

export const STORAGE_KEY = "wtplus:echoPlan:v1";

export const SERVERS = [
  { id: "america", label: "America" },
  { id: "europe", label: "Europe" },
  { id: "asia", label: "Asia" },
  { id: "sea", label: "SEA" },
  { id: "hmt", label: "TW / HK / MO" },
] as const;
export type ServerId = (typeof SERVERS)[number]["id"];

export interface EchoPlanOptions {
  pairCrit: boolean;
  keepAll4: boolean;
  throwUnused: boolean;
  includePlanned: boolean;
  sources: SourceSwitches;
}

export interface EchoPlanState {
  v: 1;
  /** last time a card was ticked done (ms) */
  savedAt: number | null;
  /** the app's changelog date when last saved (src/content/updates.ts) */
  appVersion: string | null;
  sets: string[];
  grid: Record<string, CardSnapshot>;
  done: Record<string, boolean>;
  codes: Partial<Record<ServerId, string>>;
  server: ServerId;
  planned: string[];
  excluded: string[];
  overrides: Overrides;
  options: EchoPlanOptions;
}

export const defaultOptions = (): EchoPlanOptions => ({
  pairCrit: true,
  keepAll4: false,
  throwUnused: false,
  includePlanned: true,
  sources: { builds: true, presets: true, engine: true },
});

export const defaultState = (): EchoPlanState => ({
  v: 1,
  savedAt: null,
  appVersion: null,
  sets: [],
  grid: {},
  done: {},
  codes: {},
  server: "america",
  planned: [],
  excluded: [],
  overrides: {},
  options: defaultOptions(),
});

const strings = (raw: unknown): string[] =>
  Array.isArray(raw) ? [...new Set(raw.filter((s): s is string => typeof s === "string" && s.length > 0 && s.length < 80))] : [];
const bool = (raw: unknown, fallback: boolean): boolean => (typeof raw === "boolean" ? raw : fallback);
const record = (raw: unknown): Record<string, unknown> => (raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {});

/** A Plan Code as typed or pasted: trimmed, inner whitespace dropped, at most 64 characters. */
export const cleanCode = (raw: unknown): string => (typeof raw === "string" ? raw.replace(/\s+/g, "").slice(0, 64) : "");

/**
 * The one shared code seen so far is 20 letters and digits (hgB5KC7W25WAAcIsH2kv, r/WutheringWaves); anything else only
 * gets a neutral "check it was copied whole" hint — the format isn't documented, so a code is never rejected.
 */
export const looksLikePlanCode = (code: string): boolean => /^[A-Za-z0-9]{20}$/.test(code);

export function parseState(raw: string | null | undefined): EchoPlanState {
  const state = defaultState();
  if (!raw) return state;
  let data: Record<string, unknown>;
  try {
    data = record(JSON.parse(raw));
  } catch {
    return state;
  }
  if (data.v !== 1) return state;
  state.savedAt = typeof data.savedAt === "number" && Number.isFinite(data.savedAt) ? data.savedAt : null;
  state.appVersion = typeof data.appVersion === "string" ? data.appVersion : null;
  state.sets = strings(data.sets);
  for (const [set, snap] of Object.entries(record(data.grid))) {
    const s = readSnapshot(snap);
    if (s) state.grid[set] = s;
  }
  for (const [set, v] of Object.entries(record(data.done))) if (v === true) state.done[set] = true;
  for (const { id } of SERVERS) {
    const code = cleanCode(record(data.codes)[id]);
    if (code) state.codes[id] = code;
  }
  state.server = SERVERS.some((s) => s.id === data.server) ? (data.server as ServerId) : "america";
  state.planned = strings(data.planned);
  state.excluded = strings(data.excluded);
  for (const [set, chips] of Object.entries(record(data.overrides))) {
    const clean: Partial<Record<ChipId, Verdict>> = {};
    for (const [id, v] of Object.entries(record(chips))) if (parseChipId(id) && (v === "keep" || v === "discard")) clean[id as ChipId] = v;
    if (Object.keys(clean).length) state.overrides[set] = clean;
  }
  const o = record(data.options);
  const src = record(o.sources);
  const d = defaultOptions();
  state.options = {
    pairCrit: bool(o.pairCrit, d.pairCrit),
    keepAll4: bool(o.keepAll4, d.keepAll4),
    throwUnused: bool(o.throwUnused, d.throwUnused),
    includePlanned: bool(o.includePlanned, d.includePlanned),
    sources: { builds: bool(src.builds, true), presets: bool(src.presets, true), engine: bool(src.engine, true) },
  };
  return state;
}

export function loadState(storage: Pick<Storage, "getItem"> | null = safeStorage()): EchoPlanState {
  try {
    return parseState(storage?.getItem(STORAGE_KEY));
  } catch {
    return defaultState();
  }
}

/** Writes the state; false when storage is unavailable or full (the page keeps working in memory). */
export function saveState(state: EchoPlanState, storage: Pick<Storage, "setItem"> | null = safeStorage()): boolean {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    return Boolean(storage);
  } catch {
    return false;
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
