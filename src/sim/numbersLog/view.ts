// Wuthering Tools+ numbers log — what "What moved in your numbers" shows for a log as it stands: one of four states,
// and the sentences that go with them. Pure; NumbersMoved.vue (the list on /whats-new) and NumbersMovedCard.vue
// (/account) render it.
import { compareEntries, whenText, type Comparison } from "./compare";
import type { LastSeen, LogEntry, NumbersLog } from "./log";

export type NumbersState =
  /** nothing set up in this browser and nothing recorded */
  | { kind: "no-account" }
  /** an account, and no ranking has finished here since the log exists */
  | { kind: "empty" }
  /** the first record ever: nothing to read it against */
  | { kind: "first"; entry: LogEntry }
  | {
      kind: "compared";
      comparison: Comparison;
      /** the older records the newest can be read against, newest first; the first is the default */
      choices: LogEntry[];
    };

/** `baseAt`: the `at` of the older record the reader picked ("since 9 Nov"); null = the one just before the newest. */
export function numbersState(log: NumbersLog, hasAccount: boolean, baseAt: number | null = null): NumbersState {
  const entries = log.entries;
  if (!entries.length) return hasAccount ? { kind: "empty" } : { kind: "no-account" };
  const newest = entries[entries.length - 1]!;
  if (entries.length === 1) return { kind: "first", entry: newest };
  const older = entries.slice(0, -1);
  const base = older.find((e) => e.at === baseAt) ?? older[older.length - 1]!;
  return { kind: "compared", comparison: compareEntries(base, newest, entries.filter((e) => e.at > base.at)), choices: [...older].reverse() };
}

/** The pick as the list can honour it: an older record that is no longer among the choices (the cap took it) is no
 *  pick, so the picker shows "the one before", which is what `numbersState` then compares with. */
export function pickedBase(state: NumbersState, baseAt: number | null): number | null {
  if (state.kind !== "compared" || baseAt === null) return null;
  // the first choice is the default: picking it is the same as picking nothing
  return state.choices.slice(1).some((e) => e.at === baseAt) ? baseAt : null;
}

/** "just now", "4 min ago", "2 h ago", else the day and time. */
export function agoText(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `on ${whenText(at, now)}`;
}

export const NO_ACCOUNT_TEXT = "No account in this browser yet. Set a character up or import your data: from then on this page keeps a record of your characters' and teams' damage, and says what moved and why.";
export const EMPTY_TEXT = "No record yet. Open My account once: it scores your roster, and the first record is taken when that finishes.";
export const RUNNING_TEXT = "A ranking is running right now. This updates on its own when it finishes.";
/** said once on the page, as /account says it */
export const BASIS_TEXT =
  "Every figure is average damage per rotation from this app's engine on your own builds, at My roster rankings' target: an enemy of level 100 with 20 % RES and no stacks on it. A character's figure is their best rotation; a team's is the whole team.";

export function firstRecordText(entry: LogEntry, now = Date.now()): string {
  return `Nothing to compare yet. This is the first record, taken ${agoText(entry.at, now)}.`;
}

/** "3 figures moved, 21 did not · 2 new." — the count line over the list. */
export function summaryText(c: Comparison): string {
  const n = c.moves.length;
  const head = n ? `${n} figure${n === 1 ? "" : "s"} moved, ${c.steady} did not` : `No figure moved (${c.steady} compared)`;
  const extra = [c.appeared.length ? `${c.appeared.length} new` : "", c.gone.length ? `${c.gone.length} gone` : ""].filter(Boolean);
  return `${[head, ...extra].join(" · ")}.`;
}

export type Stale =
  /** the app was updated since the last ranking this browser saw */
  | "app"
  /** the account (or the team-aware buffs switch) changed since */
  | "account"
  | null;

/** Whether the newest thing the log saw is still the account and the app as they are now. `current.fp` is the ranking
 *  fingerprint of the stores as they are; the two option letters at its end are compared apart, because a ranking with
 *  the investment estimates off is the same figures. */
export function staleness(seen: LastSeen | null, current: { fp: string; build: string }): Stale {
  if (!seen) return null;
  if (seen.build !== current.build) return "app";
  const data = (fp: string): string => fp.slice(0, -2);
  const buffs = (fp: string): string => fp.slice(-1);
  return data(seen.fp) !== data(current.fp) || buffs(seen.fp) !== buffs(current.fp) ? "account" : null;
}

export function staleText(stale: Exclude<Stale, null>): string {
  return stale === "app"
    ? "The app was updated since the last record. Open My account: it scores your roster on the new version and a new record lands here."
    : "Your account changed since the last record. Open My account: it scores your roster again and a new record lands here.";
}
