// Wuthering Tools+ — Tower of Adversity crests from a kill time, and the player's own clears beside the sim's
// (calibration). Pure, apart from the two localStorage helpers at the end.
//
// A floor's goals are seconds LEFT on the 300 s clock ("clear with at least 90 s left"); 0 means just clear it.
// A kill at `elapsed` seconds earns every goal with 300 − elapsed ≥ goal.
import { TOA_CLOCK } from "./toaData";

export function crestsFor(goals: readonly number[], elapsed: number | null, clock = TOA_CLOCK): number {
  if (elapsed === null || !Number.isFinite(elapsed) || elapsed > clock) return 0;
  const left = clock - elapsed;
  return goals.filter((g) => left >= g).length;
}

/** The elapsed time each crest needs, ascending crest: [210, 150, 120] for goals [90, 150, 180]. */
export const crestBoundaries = (goals: readonly number[], clock = TOA_CLOCK): number[] => goals.map((g) => clock - g);

/** How many seconds faster the next crest needs — null when there is none left to earn. */
export function nextCrest(goals: readonly number[], elapsed: number | null, clock = TOA_CLOCK): { crest: number; faster: number } | null {
  const have = crestsFor(goals, elapsed, clock);
  if (have >= goals.length) return null;
  const need = clock - [...goals].sort((a, b) => a - b)[have]!;
  return { crest: have + 1, faster: elapsed === null ? Infinity : Math.max(0, elapsed - need) };
}

/* ------------------------------------------------------------------------------------------ calibration */

/** One real clear the player logged for a team: the clock they used on a floor, and what the sim said then. */
export interface LoggedClear {
  season: number;
  floorId: string;
  /** seconds of the 300 s clock used in game */
  seconds: number;
  /** the sim's kill time for that team on that floor when it was logged */
  sim: number;
  /** epoch ms */
  at: number;
}

export interface ClearLog {
  v: 1;
  /** by team signature (`teamSignature`) */
  clears: Record<string, LoggedClear>;
}

/** A team, whoever is in which slot: its members' app keys, sorted. */
export const teamSignature = (appKeys: readonly string[]): string => [...appKeys].sort().join("+");

/** "Your pace": how much longer than the sim this team takes in your hands (1.4 = 40 % slower), from the clear
 *  you logged for it. Execution losses scale with the fight, so the sim's other floors are scaled by the same
 *  ratio — one clear can't tell a fixed overhead (boss phases, invulnerable windows) apart from that. */
export function paceOf(clear: LoggedClear | undefined): number | null {
  if (!clear || !(clear.sim > 0) || !(clear.seconds > 0)) return null;
  return clear.seconds / clear.sim;
}

/** The pace of a team with no clear of its own: the median of the teams that have one, else none. */
export function defaultPace(log: ClearLog): number | null {
  const paces = Object.values(log.clears).map(paceOf).filter((p): p is number => p !== null).sort((a, b) => a - b);
  if (!paces.length) return null;
  const mid = paces.length >> 1;
  return paces.length % 2 ? paces[mid]! : (paces[mid - 1]! + paces[mid]!) / 2;
}

/** "1:42", "0:58" — a clock reading. */
export function clockText(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "1:42", "102", "1m42s", "1 42" → seconds; null where it doesn't read as a time. */
export function parseClock(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  let m = t.match(/^(\d{1,2})\s*[:.m\s]\s*(\d{1,2})\s*s?$/);
  if (m) {
    const s = Number(m[1]) * 60 + Number(m[2]);
    if (Number(m[2]) < 60 && s > 0 && s <= TOA_CLOCK) return s;
    // "87.5" is no clock reading (87 minutes): fall through to plain seconds
  }
  m = t.match(/^(\d{1,3}(?:\.\d+)?)\s*s?$/);
  if (m) {
    const s = Number(m[1]);
    return s > 0 && s <= TOA_CLOCK ? s : null;
  }
  return null;
}

/** What the player reads off the game: the clock still LEFT (how the crest goals and the countdown put it), or the
 *  time USED. Either way the log keeps seconds used. */
export type ClockReading = "left" | "used";

/** A typed clear time → seconds of the 300 s clock used; null where it doesn't read as a time or leaves no fight. */
export function clearSecondsUsed(text: string, reading: ClockReading, clock = TOA_CLOCK): number | null {
  const s = parseClock(text);
  if (s === null) return null;
  const used = reading === "left" ? clock - s : s;
  return used > 0 && used <= clock ? used : null;
}

export const CLEAR_LOG_KEY = "wtplus:endgame:clears";

export function readClearLog(storage: Pick<Storage, "getItem"> | null = typeof localStorage === "undefined" ? null : localStorage): ClearLog {
  try {
    const raw = storage?.getItem(CLEAR_LOG_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed?.v === 1 && parsed.clears && typeof parsed.clears === "object") return parsed as ClearLog;
  } catch {
    /* unreadable: start afresh, never throw on a page load */
  }
  return { v: 1, clears: {} };
}

export function writeClearLog(log: ClearLog, storage: Pick<Storage, "setItem"> | null = typeof localStorage === "undefined" ? null : localStorage): void {
  try {
    storage?.setItem(CLEAR_LOG_KEY, JSON.stringify(log));
  } catch {
    /* full or blocked: the log just isn't kept */
  }
}
