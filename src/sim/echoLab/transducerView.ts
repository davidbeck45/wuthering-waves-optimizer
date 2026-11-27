// Wuthering Tools+ Echo Lab — the Transducers tab's pure helpers: the view in the address (no storage key), the order
// the run asks for echoes in, which resonators are fully read (the ranking re-sorts only when a resonator's five are
// in, so rows never jump under a finger), and the words for a row that does not pay. No engine imports.
import type { RerollOptions } from "./rerollAdvice";
import type { TransducerRow, TransducerSort } from "./transducerRank";
import { MAX_BUDGET } from "./transducerRank";

/** The choices a page may add to a re-roll job (the Transducers tab's switches). None of them = the very job the
 *  Re-roll tab and the calculator's panel send, under the same cache key, so the pages share one cache. That job keeps
 *  Energy Regen on a resonator the app knows no need for (rerollPick.ts `rerollOptionsFor`); `rerollUnknownEr` lifts it
 *  for a read. */
export interface RerollExtra {
  canRepeat?: RerollOptions["canRepeat"];
  /** let a plan re-roll Energy Regen on a resonator the app knows no need for (in no saved team) */
  rerollUnknownEr?: boolean;
}

/** The part of the re-roll cache key the extra options add: "" for the default job. */
export function rerollExtraKey(extra?: RerollExtra | null): string {
  const parts: string[] = [];
  if (extra?.canRepeat === false) parts.push("norepeat");
  if (extra?.rerollUnknownEr) parts.push("rerollEr");
  return parts.length ? `|${parts.join(",")}` : "";
}

export type TransducerWho = "dealers" | "everyone";

export interface TransducerView {
  character: string | null;
  /** Transducers a try: 1, 2 or 3 */
  cost: number | null;
  /** lines kept: 0 to 4 */
  keep: number | null;
  who: TransducerWho;
  sort: TransducerSort;
  /** Transducers in hand */
  have: number;
  /** a re-rolled line can come back as the stat it was (the default) */
  repeat: boolean;
  /** keep Energy Regen where the app knows no need (the default, and what the Re-roll tab always does) */
  keepEr: boolean;
}

export const DEFAULT_HAVE = 3;
export const DEFAULT_VIEW: TransducerView = { character: null, cost: null, keep: null, who: "dealers", sort: "damage", have: DEFAULT_HAVE, repeat: true, keepEr: true };
const SORTS: readonly TransducerSort[] = ["damage", "percent", "chance", "gain"];

/** Transducers a try for a number of kept lines: the game's rule (1 with up to two kept, 2 with three, 3 with four). */
export const costOfKeep = (keep: number): number => (keep <= 2 ? 1 : keep - 1);

const intIn = (raw: unknown, lo: number, hi: number): number | null => {
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= lo && n <= hi ? n : null;
};

/** The view a link asks for; anything it does not say, or says wrong, is the default. A cost and a lines-kept count that
 *  cannot go together keep the lines kept (the more specific of the two). */
export function viewFromQuery(query: Readonly<Record<string, unknown>>): TransducerView {
  const keep = intIn(query.keep, 0, 4);
  let cost = intIn(query.cost, 1, 3);
  if (keep != null && cost != null && costOfKeep(keep) !== cost) cost = null;
  const sort = SORTS.includes(query.sort as TransducerSort) ? (query.sort as TransducerSort) : DEFAULT_VIEW.sort;
  return {
    character: typeof query.character === "string" && query.character ? query.character : null,
    cost,
    keep,
    who: query.who === "everyone" ? "everyone" : "dealers",
    sort,
    have: intIn(query.have, 1, MAX_BUDGET) ?? DEFAULT_HAVE,
    repeat: query.repeat !== "0",
    keepEr: query.keepEr !== "0",
  };
}

/** The address of a view: only what differs from the default. */
export function viewToQuery(view: TransducerView): Record<string, string> {
  const q: Record<string, string> = {};
  if (view.character) q.character = view.character;
  if (view.cost != null) q.cost = String(view.cost);
  if (view.keep != null) q.keep = String(view.keep);
  if (view.who !== "dealers") q.who = view.who;
  if (view.sort !== DEFAULT_VIEW.sort) q.sort = view.sort;
  if (view.have !== DEFAULT_HAVE) q.have = String(view.have);
  if (!view.repeat) q.repeat = "0";
  if (!view.keepEr) q.keepEr = "0";
  return q;
}

/** Picking a cost or a lines-kept count clears the other when the two cannot go together, so the table is never empty
 *  by construction. */
export function withCost(view: TransducerView, cost: number | null): TransducerView {
  return { ...view, cost, keep: cost != null && view.keep != null && costOfKeep(view.keep) !== cost ? null : view.keep };
}
export function withKeep(view: TransducerView, keep: number | null): TransducerView {
  return { ...view, keep, cost: keep != null && view.cost != null && costOfKeep(keep) !== view.cost ? null : view.cost };
}

/** The extra job options a view asks for (undefined = the Re-roll tab's own job). */
export const extraOf = (view: Pick<TransducerView, "repeat" | "keepEr">): RerollExtra | undefined =>
  view.repeat && view.keepEr ? undefined : { ...(view.repeat ? {} : { canRepeat: false }), ...(view.keepEr ? {} : { rerollUnknownEr: true }) };

export interface QueueCharacter {
  id: string;
  base: number;
  slots: ReadonlyArray<{ slot: number; lines: readonly unknown[] } | null>;
}

export interface QueueItem {
  characterId: string;
  slot: number;
}

/**
 * The order the run asks for echoes in: damage dealers first, then the rest; within each, the biggest rotation damage
 * first, and a resonator's five-line echoes slot by slot, so the rows that matter most arrive first and a resonator's
 * five come in together.
 */
// eslint-disable-next-line no-unused-vars -- the parameters of a function type
export function runQueue(characters: readonly QueueCharacter[], isDealer: (id: string) => boolean): QueueItem[] {
  const order = [...characters].sort((a, b) => Number(isDealer(b.id)) - Number(isDealer(a.id)) || b.base - a.base || a.id.localeCompare(b.id));
  const out: QueueItem[] = [];
  for (const c of order) for (const s of c.slots) if (s && s.lines.length >= 5) out.push({ characterId: c.id, slot: s.slot });
  return out;
}

/** The resonators whose every queued echo has an answer (a result or an error): the ones the ranking shows. */
// eslint-disable-next-line no-unused-vars -- the parameters of a function type
export function readCharacters(queue: readonly QueueItem[], answered: (item: QueueItem) => boolean): Set<string> {
  const pending = new Set<string>();
  const all = new Set<string>();
  for (const item of queue) {
    all.add(item.characterId);
    if (!answered(item)) pending.add(item.characterId);
  }
  return new Set([...all].filter((id) => !pending.has(id)));
}

/** Why a row is not worth a Transducer, in words. */
export function notWorthText(row: Pick<TransducerRow, "plan" | "blocked" | "pays">): string | null {
  if (row.pays) return null;
  if (row.blocked === "noPlan") return "no plan under this filter";
  if (row.blocked === "erFloor") return "its only plans under this filter re-roll Energy Regen the build needs";
  return "not worth a Transducer: under 0.05 % expected";
}

/** A best result rarer than this is said to be one not to plan on (one in ten thousand tries: far past any player's
 *  Transducers). */
export const RARE_TOP = 1e-4;
export const rareTopText = (chance: number): string | null => (chance > 0 && chance < RARE_TOP ? "a ceiling, not something to plan on" : null);

export interface WorthLine {
  field: number;
  key: string;
  value: number;
  /** what the build loses without this line (relative): the engine's figure */
  worth: number;
}

export interface CritRerollFacts {
  /** the crit line the plan re-rolls (the one worth most, when it re-rolls both) */
  crit: WorthLine;
  /** the lines the plan keeps, the one worth most first */
  kept: WorthLine[];
  /** every kept line is worth at least as much on this build as the crit line that goes */
  keptWorthMore: boolean;
}

/**
 * A plan that re-rolls a Crit Rate or Crit DMG line goes against the usual rule of thumb, so a row says what the
 * search weighed: the crit line and what it is worth on this build, against the lines kept instead. Null when the plan
 * re-rolls no crit line.
 */
export function critRerollFacts(lines: readonly WorthLine[], plan: { lockedFields: readonly number[]; rerolledFields: readonly number[] } | null): CritRerollFacts | null {
  if (!plan) return null;
  const isCrit = (key: string): boolean => key === "CritRate" || key === "CritDMG";
  const gone = lines.filter((l) => isCrit(l.key) && plan.rerolledFields.includes(l.field)).sort((a, b) => b.worth - a.worth || a.field - b.field);
  if (!gone.length) return null;
  const kept = lines.filter((l) => plan.lockedFields.includes(l.field)).sort((a, b) => b.worth - a.worth || a.field - b.field);
  return { crit: gone[0], kept, keptWorthMore: kept.length > 0 && kept.every((l) => l.worth >= gone[0].worth) };
}

/** The note under an echo whose Energy Regen lines are kept because the app knows no need for the resonator: which
 *  lines, why, and how to read the echo without the rule. Null when none is kept for that reason. */
export function keptErNote(lines: readonly string[], name: string): string | null {
  if (!lines.length) return null;
  return `Keeps ${lines.join(" and ")}: the app knows no Energy Regen need for ${name} (in no saved team). Turn "Keep Energy Regen where the app knows no need" off to read this echo without it, or save the team you play them in.`;
}

/** "1 try in N" for the chance of a result; null when it cannot happen. */
export function oneIn(chance: number): string | null {
  if (!(chance > 0)) return null;
  const n = 1 / chance;
  if (n < 1.5) return "almost every try";
  return `1 try in ${n >= 1000 ? Math.round(n).toLocaleString("en-US") : Math.round(n)}`;
}

/** "A good try" in words: what one try in ten gains or more, read from the engine's `goodTry` (null when fewer than one
 *  try in ten beats the lines the echo has, said so in words: never "+0.00%"). */
export const NO_GOOD_TRY = "fewer than one try in ten beats the lines it has";
export const goodTryText = (good: number | null): string => (good == null ? NO_GOOD_TRY : `${good > 0 ? "+" : "−"}${Math.abs(good * 100).toFixed(2)}%`);

/** The equipped echoes the ranking cannot read, with why: fewer than five lines. */
export function unfinished(characters: readonly QueueCharacter[]): Array<{ characterId: string; slot: number; lines: number }> {
  const out: Array<{ characterId: string; slot: number; lines: number }> = [];
  for (const c of characters) for (const s of c.slots) if (s && s.lines.length < 5) out.push({ characterId: c.id, slot: s.slot, lines: s.lines.length });
  return out;
}

/** A chance in words, the CLI's rule (`chanceText` in transducerCli.ts): one that is not certain never reads "100%"
 *  (12 tries at 61 % is 99.99 %, "over 99%"), one that is not zero never "0%" ("under 1%"). */
export function chanceText(p: number): string {
  if (!(p > 0)) return "0%";
  if (p >= 1) return "100%";
  const pc = p * 100;
  if (pc >= 99.5) return "over 99%";
  if (pc < 0.5) return "under 1%";
  return `${Math.round(pc)}%`;
}

/** Rows of one resonator with a known Energy Regen need whose plans each re-roll Energy Regen: each alone leaves the
 *  build at its need, all of them together would not (the ranking reads one echo at a time; "I have N Transducers"
 *  plans them together). Row key → how many rows of that resonator share it. */
interface ErRow {
  key: string;
  pays: boolean;
  plan: { rerolledFields: readonly number[] } | null;
  advice: { characterId: string; erNeed: number | null; erHave: number | null; lines: ReadonlyArray<{ field: number; key: string; value: number }> };
}
export function jointErRows(rows: readonly ErRow[]): Map<string, number> {
  const byCharacter = new Map<string, Array<{ key: string; lost: number }>>();
  for (const row of rows) {
    const { advice, plan } = row;
    if (!plan || !row.pays || advice.erNeed == null || advice.erHave == null) continue;
    const lost = advice.lines.filter((l) => l.key === "EnergyRegen" && plan.rerolledFields.includes(l.field)).reduce((sum, l) => sum + l.value, 0);
    if (lost <= 0) continue;
    const list = byCharacter.get(advice.characterId) ?? [];
    list.push({ key: row.key, lost });
    byCharacter.set(advice.characterId, list);
  }
  const out = new Map<string, number>();
  for (const [, list] of byCharacter) {
    if (list.length < 2) continue;
    const advice = rows.find((r) => r.key === list[0].key)!.advice;
    const lost = list.reduce((sum, x) => sum + x.lost, 0);
    if ((advice.erHave as number) - lost >= (advice.erNeed as number) - 1e-9) continue;
    for (const x of list) out.set(x.key, list.length);
  }
  return out;
}

/** The crit check's echoes left out because keeping exactly the crit lines would re-roll Energy Regen the build needs
 *  (`CritKeepCheck.erBound`), in words; null when there are none. */
export function critErBoundText(n: number): string | null {
  if (!(n > 0)) return null;
  return `${n} echo${n === 1 ? " is" : "es are"} left out: keeping exactly the crit lines there would re-roll Energy Regen the build needs, so the rule cannot be followed on ${n === 1 ? "it" : "them"}.`;
}

/** The best-use block's heading: while echoes are still being read, the best use may still change, and says so. */
export const bestHeading = (running: boolean, answered: number, total: number): string =>
  running && answered < total ? `Best use so far: ${answered} of ${total} echoes read, it may still change` : "Best use of a Transducer";

/** What an empty ranking says: still reading, or why it is empty and what to do (supports are left out under "Damage
 *  dealers": switch to Everyone). */
export function noRowsText(running: boolean, who: TransducerWho, supportsLeftOut: number): string {
  if (running) return "The first resonator is being read…";
  if (who === "dealers" && supportsLeftOut > 0) return `No damage dealer here has a fully tuned echo under these filters. ${supportsLeftOut} support${supportsLeftOut === 1 ? " is" : "s are"} left out: choose "Everyone" under Who to rank ${supportsLeftOut === 1 ? "its" : "their"} echoes.`;
  return "No echo under these filters.";
}
