// Wuthering Tools+ — display helpers for the Convene tabs (numbers, durations, server clocks, item art).
import { characterPortraitUrl } from "../../../characters/characters";
import { recordTimeMs } from "../pity";

export const fmtInt = (n: number): string => Math.round(n).toLocaleString();
export const fmtPct = (x: number, digits = 1): string => `${(x * 100).toFixed(digits)}%`;
export const fmtGain = (g: number, digits = 1): string => `${g >= 0 ? "+" : "−"}${Math.abs(g * 100).toFixed(digits)}%`;
export const fmtK = (n: number): string => (n >= 100_000 ? `${Math.round(n / 1000)}k` : n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : fmtInt(n));

/** "8d 21h", "5h 12m", "42m", "<1m" */
export function fmtDuration(ms: number): string {
  if (!(ms > 0)) return "0m";
  const m = Math.floor(ms / 60_000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${mm}m`;
  return mm > 0 ? `${mm}m` : "<1m";
}

/** "3 days", "5 months" — a coarse span for "ago" / "between runs" */
export function fmtSpan(ms: number): string {
  const days = Math.round(ms / 86_400_000);
  if (days < 1) return "today";
  if (days < 60) return `${days} day${days === 1 ? "" : "s"}`;
  const months = Math.round(days / 30.4);
  return `${months} months`;
}

export function fmtAgo(ms: number, now = Date.now()): string {
  const diff = now - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h ago`;
  return `${Math.floor(diff / 86_400_000)} d ago`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** an instant on a fixed server clock: "Oct 22, 09:59" (with the year when it isn't `yearOf`'s) */
export function fmtServerTime(ms: number, offsetHours: number, opts: { year?: boolean; time?: boolean } = {}): string {
  const d = new Date(ms + offsetHours * 3_600_000);
  const date = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}${opts.year ? `, ${d.getUTCFullYear()}` : ""}`;
  return opts.time === false ? date : `${date}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** a record's CST wall clock "2026-10-01 12:00:00" → "Oct 1, 2026" */
export function fmtRecordDate(time: string): string {
  const ms = recordTimeMs(time);
  return Number.isFinite(ms) ? fmtServerTime(ms, 8, { year: true, time: false }) : time.slice(0, 10);
}

/** the app's weapon art (upstream's asset repo); a few weapons ship .webp only — the icon falls back */
export function weaponIconUrl(key: string, ext: "png" | "webp" = "png"): string {
  return `https://ryanbenson.github.io/wuthering-waves-assets/images/weapons/${key}.${ext}`;
}

export function itemIconUrl(kind: "resonator" | "weapon", key: string): string {
  return kind === "weapon" ? weaponIconUrl(key) : characterPortraitUrl(key);
}

export function initials(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}
