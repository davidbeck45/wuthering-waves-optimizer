// Wuthering Tools+ — how /today writes times: countdowns ("3h 10m"), clock times on the device's zone or the server's
// ("21:34 today", "Thu 04:00", "Nov 9, 03:59"), and the server clock itself. Pure (the device zone comes from Date).
import { fmtDuration } from "../convene/ui/format";
import { DAY_MS, HOUR_MS } from "./resets";

export type TimeMode = "local" | "server";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

interface Fields {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
  dow: number;
}

/** a moment's wall-clock fields on the server's clock, or on the device's */
export function fieldsOf(ms: number, mode: TimeMode, offsetHours: number): Fields {
  if (mode === "server") {
    const d = new Date(ms + offsetHours * HOUR_MS);
    return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), dow: d.getUTCDay() };
  }
  const d = new Date(ms);
  return { y: d.getFullYear(), mo: d.getMonth(), d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), s: d.getSeconds(), dow: d.getDay() };
}

/** "21:34" */
export function fmtClock(ms: number, mode: TimeMode, offsetHours: number, seconds = false): string {
  const f = fieldsOf(ms, mode, offsetHours);
  return `${pad(f.h)}:${pad(f.mi)}${seconds ? `:${pad(f.s)}` : ""}`;
}

/** "Mon, Oct 26" */
export function fmtDay(ms: number, mode: TimeMode, offsetHours: number): string {
  const f = fieldsOf(ms, mode, offsetHours);
  return `${WEEKDAYS[f.dow]}, ${MONTHS[f.mo]} ${f.d}`;
}

/** "Nov 9" */
export function fmtDate(ms: number, mode: TimeMode, offsetHours: number): string {
  const f = fieldsOf(ms, mode, offsetHours);
  return `${MONTHS[f.mo]} ${f.d}`;
}

function dayNumber(ms: number, mode: TimeMode, offsetHours: number): number {
  const f = fieldsOf(ms, mode, offsetHours);
  return Math.floor(Date.UTC(f.y, f.mo, f.d) / DAY_MS);
}

/**
 * A moment relative to now, as people say it: "21:34 today", "04:00 tomorrow", "Thu 14:00" (within a week),
 * "Nov 9, 03:59" (further out).
 */
export function fmtWhen(ms: number, now: number, mode: TimeMode, offsetHours: number): string {
  const clock = fmtClock(ms, mode, offsetHours);
  const days = dayNumber(ms, mode, offsetHours) - dayNumber(now, mode, offsetHours);
  if (days === 0) return `${clock} today`;
  if (days === 1) return `${clock} tomorrow`;
  if (days === -1) return `${clock} yesterday`;
  const f = fieldsOf(ms, mode, offsetHours);
  if (days > 1 && days < 7) return `${WEEKDAYS[f.dow]} ${clock}`;
  return `${MONTHS[f.mo]} ${f.d}, ${clock}`;
}

/** "in 3h 10m" / "3h 10m ago" / "now" */
export function fmtIn(ms: number, now: number): string {
  const diff = ms - now;
  if (Math.abs(diff) < 60_000) return "now";
  return diff > 0 ? `in ${fmtDuration(diff)}` : `${fmtDuration(-diff)} ago`;
}

export { fmtDuration };

/** the label a time carries: "server time" or "your time" */
export function modeLabel(mode: TimeMode): string {
  return mode === "server" ? "server time" : "your time";
}
