// Wuthering Tools+ — "What's new on Tools+": the list's shape and the unseen marker. Pure: the page, the plus pages
// menu's dot and /account's card render what this returns (useWhatsNew.ts holds the one reactive copy).
//
// The marker is the ids this browser has seen, written when the page is opened. What counts as new:
//   no account in this browser      nothing: a first-time visitor has no "since your last visit"
//   an account and no marker yet    the newest release day only (he has been using the rest for weeks)
//   an account and a marker         every entry whose id is not in it
// Ids, not a date: an entry added later under a day already seen still counts as new.
import type { WhatsNewEntry } from "./entries";

/** localStorage: `{ v: 1, ids: string[] }`. A preference of this device: Delete your data leaves it (STORAGE_RULES). */
export const WHATS_NEW_SEEN_KEY = "wtplus:whatsNew:seen";
export const WHATS_NEW_PATH = "/whats-new";

export interface DateGroup {
  date: string;
  /** "10 November 2026" */
  label: string;
  entries: WhatsNewEntry[];
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-11-10" → "10 November 2026". Read from the text, not through Date: a day is a day in every time zone. */
export function dateLabel(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && month ? `${Number(m[3])} ${month} ${m[1]}` : date;
}

/** The entries by release day, newest day first; inside a day, in the order the file lists them. */
export function groupByDate(entries: readonly WhatsNewEntry[]): DateGroup[] {
  const byDate = new Map<string, WhatsNewEntry[]>();
  for (const e of entries) {
    const list = byDate.get(e.date);
    if (list) list.push(e);
    else byDate.set(e.date, [e]);
  }
  return [...byDate.entries()].sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0)).map(([date, list]) => ({ date, label: dateLabel(date), entries: list }));
}

/** The stored marker as a set of ids; null when there is none (or it is not one this app wrote). */
export function readSeen(raw: string | null | undefined): Set<string> | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as { v?: unknown; ids?: unknown } | null;
    if (!data || data.v !== 1 || !Array.isArray(data.ids)) return null;
    return new Set(data.ids.filter((id): id is string => typeof id === "string"));
  } catch {
    return null;
  }
}

/** The ids that are new to this browser, in the list's order. */
export function unseenIds(entries: readonly WhatsNewEntry[], seen: ReadonlySet<string> | null, hasAccount: boolean): string[] {
  if (!hasAccount || !entries.length) return [];
  if (!seen) return (groupByDate(entries)[0]?.entries ?? []).map((e) => e.id);
  return entries.filter((e) => !seen.has(e.id)).map((e) => e.id);
}

/** What to store once the page has been opened: every id listed today (ids of entries since removed drop out). */
export function seenMarker(entries: readonly WhatsNewEntry[]): string {
  return JSON.stringify({ v: 1, ids: entries.map((e) => e.id) });
}

/** An entry's Open address. `{character}` becomes a character of the account; without one the link is its path alone
 *  (the page itself, which says what to do with no account). */
export function entryLink(link: string, characterId: string | null | undefined): string {
  if (!link.includes("{character}")) return link;
  return characterId ? link.split("{character}").join(encodeURIComponent(characterId)) : link.split("?")[0];
}

/** The character `{character}` stands for: the one the calculator shows when it is set up, else the first set up. */
export function linkCharacter(characters: Record<string, { weapon?: unknown } | null | undefined> | null | undefined, active: string | null | undefined): string | null {
  const setUp = Object.keys(characters ?? {}).filter((id) => Boolean(characters?.[id]?.weapon));
  if (active && setUp.includes(active)) return active;
  return setUp[0] ?? null;
}

/** "3 new things on Tools+ since your last visit"; a browser that never opened the page gets "in the latest update". */
export function unseenText(count: number, hasMarker: boolean): string {
  return `${count} new thing${count === 1 ? "" : "s"} on Tools+ ${hasMarker ? "since your last visit" : "in the latest update"}`;
}
