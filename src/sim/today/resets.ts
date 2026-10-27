// Wuthering Tools+ — server clocks and resets for /today. Kuro runs every server on a fixed UTC offset with no
// daylight saving (Asia / HMT / SEA / CN UTC+8, Europe UTC+1, America UTC−5 — convene's SERVER_REGIONS): the day
// turns at 04:00 server time, the week on Monday 04:00, and the 28-day endgame cycles (Tower of Adversity, Whimpering
// Wastes) on a Monday 04:00 too. Pure: every function takes `now` and the offset.
import { wallClockMs } from "../convene/banners";
import type { CycleRule } from "./rules";

export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
export const WEEK_MS = 7 * DAY_MS;
export const RESET_HOUR = 4;

/** a moment as the server's wall clock: its UTC fields are the server's local fields */
export function serverDate(ms: number, offsetHours: number): Date {
  return new Date(ms + offsetHours * HOUR_MS);
}

/** the latest daily reset at or before `now` (04:00 server time) */
export function lastDailyReset(now: number, offsetHours: number, hour = RESET_HOUR): number {
  const local = now + offsetHours * HOUR_MS;
  const sinceMidnight = ((local % DAY_MS) + DAY_MS) % DAY_MS;
  const midnight = local - sinceMidnight;
  let reset = midnight + hour * HOUR_MS;
  if (reset > local) reset -= DAY_MS;
  return reset - offsetHours * HOUR_MS;
}

export function nextDailyReset(now: number, offsetHours: number, hour = RESET_HOUR): number {
  return lastDailyReset(now, offsetHours, hour) + DAY_MS;
}

/** the latest weekly reset at or before `now` (Monday 04:00 server time; weekday 1 = Monday) */
export function lastWeeklyReset(now: number, offsetHours: number, hour = RESET_HOUR, weekday = 1): number {
  const daily = lastDailyReset(now, offsetHours, hour);
  const dow = serverDate(daily, offsetHours).getUTCDay();
  const back = (dow - weekday + 7) % 7;
  return daily - back * DAY_MS;
}

export function nextWeeklyReset(now: number, offsetHours: number, hour = RESET_HOUR, weekday = 1): number {
  return lastWeeklyReset(now, offsetHours, hour, weekday) + WEEK_MS;
}

export interface CycleWindow {
  /** this cycle's first moment */
  startMs: number;
  /** the next cycle's first moment (this one's last minute is 03:59 the same morning) */
  nextMs: number;
  /** cycles since the anchor (0 = the anchor's own; negative before it) */
  index: number;
  /** the community season number when the rule carries one */
  season: number | null;
}

/** the cycle running at `now` for a rule anchored on a server-time wall clock, repeating every `periodDays` */
export function cycleWindow(rule: Pick<CycleRule, "anchor" | "periodDays" | "anchorSeason">, now: number, offsetHours: number): CycleWindow | null {
  const anchor = wallClockMs(rule.anchor, offsetHours);
  const period = rule.periodDays * DAY_MS;
  if (!Number.isFinite(anchor) || !(period > 0)) return null;
  const index = Math.floor((now - anchor) / period);
  const startMs = anchor + index * period;
  return { startMs, nextMs: startMs + period, index, season: rule.anchorSeason != null ? rule.anchorSeason + index : null };
}

/** how far through [start, end) `now` is, 0–1 */
export function progressOf(startMs: number, endMs: number, now: number): number {
  if (!(endMs > startMs)) return 0;
  return Math.min(1, Math.max(0, (now - startMs) / (endMs - startMs)));
}

/** "UTC+8", "UTC−5", "UTC+1" */
export function utcLabel(offsetHours: number): string {
  return `UTC${offsetHours >= 0 ? "+" : "−"}${Math.abs(offsetHours)}`;
}

/** the browser's own offset in minutes east (−getTimezoneOffset), 480 when unknown */
export function browserOffsetMinutes(at = Date.now()): number {
  try {
    return -new Date(at).getTimezoneOffset();
  } catch {
    return 480;
  }
}
