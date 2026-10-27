// Wuthering Tools+ — the Waveplate clock: 1 Waveplate per 6 minutes up to 240; past that the regeneration goes into
// Waveplate Crystals at 1 per 12 minutes up to 480 (wiki "Waveplate"; constants in data/rules.json). A count the
// player types is taken as "just ticked" — the real next tick is up to 6 minutes sooner, so times are ± one tick.
// Waveplates above 240 (refills, Crystal Solvent) don't regenerate; crystals fill from the moment the count is entered.
// Pure.
import { MINUTE_MS } from "./resets";
import { RULES, type WaveplateRules } from "./rules";

export interface WaveplateEntry {
  /** Waveplates as typed */
  value: number;
  /** Waveplate Crystals as typed */
  crystals: number;
  /** when they were typed */
  atMs: number;
}

export interface WaveplateProjection {
  waveplates: number;
  crystals: number;
  /** when Waveplates reach the cap (null: already there) */
  fullAt: number | null;
  /** when the crystals reach theirs too and regeneration is lost (null: already there) */
  crystalsFullAt: number | null;
  full: boolean;
  crystalsFull: boolean;
}

const clampInt = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.floor(Number.isFinite(n) ? n : 0)));

/** a typed entry made safe: whole numbers, Waveplates 0–999 (refills go past 240), crystals 0–cap */
export function normalizeEntry(e: WaveplateEntry, rules: WaveplateRules = RULES.waveplates): WaveplateEntry {
  return { value: clampInt(e.value, 0, 999), crystals: clampInt(e.crystals, 0, rules.crystalMax), atMs: Number.isFinite(e.atMs) ? e.atMs : 0 };
}

/** where the counts stand at `now`, and when each cap is reached */
export function projectWaveplates(entry: WaveplateEntry, now: number, rules: WaveplateRules = RULES.waveplates): WaveplateProjection {
  const e = normalizeEntry(entry, rules);
  const tick = rules.regenMinutes * MINUTE_MS;
  const crystalTick = rules.crystalRegenMinutes * MINUTE_MS;
  const fullAt = e.value < rules.max ? e.atMs + (rules.max - e.value) * tick : null;
  // crystals start filling once Waveplates are capped (right away when the typed count already is)
  const crystalsFrom = fullAt ?? e.atMs;
  const crystalsFullAt = e.crystals < rules.crystalMax ? crystalsFrom + (rules.crystalMax - e.crystals) * crystalTick : null;
  const elapsed = Math.max(0, now - e.atMs);
  const waveplates = e.value < rules.max ? Math.min(rules.max, e.value + Math.floor(elapsed / tick)) : e.value;
  const crystals = now > crystalsFrom ? Math.min(rules.crystalMax, e.crystals + Math.floor((now - crystalsFrom) / crystalTick)) : e.crystals;
  return {
    waveplates,
    crystals,
    fullAt,
    crystalsFullAt,
    full: fullAt == null || now >= fullAt,
    crystalsFull: crystalsFullAt == null || now >= crystalsFullAt,
  };
}

/** how long a number of Waveplates takes to regenerate from below the cap */
export function regenMs(waveplates: number, rules: WaveplateRules = RULES.waveplates): number {
  return Math.max(0, waveplates) * rules.regenMinutes * MINUTE_MS;
}

/** Waveplates regenerated per day below the cap (240 at 1 per 6 minutes) */
export function dailyRegen(rules: WaveplateRules = RULES.waveplates): number {
  return Math.floor((24 * 60) / rules.regenMinutes);
}
