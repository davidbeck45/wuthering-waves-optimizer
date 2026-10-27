// Wuthering Tools+ — what /today keeps per browser: the last Waveplate count typed, the checklist ticks, hidden
// checklist items, the time display (local / server) and the "notify me" opt-in. localStorage `wtplus:today:v1`,
// versioned; anything unreadable falls back to defaults field by field (settings and hand-typed counters — nothing here
// is worth refusing the page over). The server region is NOT here: it is the Convene page's (`wtplus:convene:prefs`
// `server`), so a player picks it once for both. Pure: storage is injected.
import type { KeyValueStorage } from "../convene/banners";
import type { Tick } from "./checklist";
import { normalizeEntry, type WaveplateEntry } from "./waveplates";

export const TODAY_STATE_KEY = "wtplus:today:v1";
export const TODAY_STATE_VERSION = 1;

export interface TodayState {
  waveplates: WaveplateEntry | null;
  ticks: Record<string, Tick>;
  hidden: string[];
  /** how clock times read: the device's own zone or the server's */
  timeMode: "local" | "server";
  /** the player asked for a browser notification when Waveplates fill (only while a tab is open) */
  notify: boolean;
  /** the live/upcoming list is open */
  showLive: boolean;
}

export function defaultTodayState(): TodayState {
  return { waveplates: null, ticks: {}, hidden: [], timeMode: "local", notify: false, showLive: true };
}

export function decodeTodayState(raw: string | null): TodayState {
  const out = defaultTodayState();
  if (!raw) return out;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || o.v !== TODAY_STATE_VERSION) return out;
    const w = o.waveplates as Partial<WaveplateEntry> | null | undefined;
    if (w && typeof w === "object" && Number.isFinite(w.value) && Number.isFinite(w.atMs))
      out.waveplates = normalizeEntry({ value: w.value!, crystals: Number.isFinite(w.crystals) ? w.crystals! : 0, atMs: w.atMs! });
    if (o.ticks && typeof o.ticks === "object") {
      for (const [id, t] of Object.entries(o.ticks as Record<string, Partial<Tick>>)) {
        if (/^[a-z0-9-]{1,40}$/.test(id) && t && Number.isFinite(t.n) && Number.isFinite(t.at) && t.n! > 0) out.ticks[id] = { n: Math.floor(t.n!), at: t.at! };
      }
    }
    if (Array.isArray(o.hidden)) out.hidden = o.hidden.filter((x): x is string => typeof x === "string" && /^[a-z0-9-]{1,40}$/.test(x));
    if (o.timeMode === "server" || o.timeMode === "local") out.timeMode = o.timeMode;
    out.notify = o.notify === true;
    if (typeof o.showLive === "boolean") out.showLive = o.showLive;
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

export function readTodayState(storage: KeyValueStorage | null = defaultStorage()): TodayState {
  try {
    return decodeTodayState(storage?.getItem(TODAY_STATE_KEY) ?? null);
  } catch {
    return defaultTodayState();
  }
}

export function writeTodayState(state: TodayState, storage: KeyValueStorage | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(TODAY_STATE_KEY, JSON.stringify({ v: TODAY_STATE_VERSION, ...state }));
    return true;
  } catch {
    return false;
  }
}
