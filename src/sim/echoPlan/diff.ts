// Wuthering Tools+ — what the player still has to tap into the game. A card ticked "done in game" stores a snapshot
// of what it said then (state + the chips kept); after a patch, a roster change or a switch flip, the cards whose
// verdicts moved since are "changed", with the chips that flipped. A Sonata the page has never shown before (a new
// patch's set the app just shipped) is "new". Pure.
import { parseChipId, sonatas, type ChipId } from "./catalog";
import type { CardState, EchoPlan, SonataCard } from "./plan";

export interface CardSnapshot {
  state: CardState;
  /** chip ids that were KEEP, sorted */
  keep: ChipId[];
}

/** done: in game as the page says · changed: ticked, but the plan moved since · todo: a plan to set · idle: no plan, nothing to do */
export type CardStatus = "done" | "changed" | "todo" | "idle";

export interface CardProgress {
  set: string;
  status: CardStatus;
  isNew: boolean;
  /** what was ticked (changed / done cards) */
  from: CardSnapshot | null;
  /** chips KEEP now that were not when ticked */
  nowKept: ChipId[];
  /** chips no longer KEEP since the tick */
  nowDiscarded: ChipId[];
  stateChanged: boolean;
}

export interface SavedProgress {
  /** every set the page had shown when last saved */
  sets: string[];
  grid: Record<string, CardSnapshot>;
  done: Record<string, boolean>;
}

export interface PlanProgress {
  cards: Record<string, CardProgress>;
  newSets: string[];
  changed: string[];
  todo: string[];
  done: string[];
  /** cards that need a tap in game: todo + changed */
  toUpdate: string[];
  /** cards that carry a plan or were ticked */
  actionable: number;
}

export function snapshotOf(card: SonataCard): CardSnapshot {
  const keep = card.rows.flatMap((r) => r.chips.filter((c) => c.verdict === "keep").map((c) => c.id)).sort();
  return { state: card.state, keep };
}

export const sameSnapshot = (a: CardSnapshot | null | undefined, b: CardSnapshot | null | undefined): boolean =>
  Boolean(a && b && a.state === b.state && a.keep.length === b.keep.length && a.keep.every((id, i) => id === b.keep[i]));

export function cardProgress(card: SonataCard, saved: SavedProgress): CardProgress {
  const isNew = saved.sets.length > 0 && !saved.sets.includes(card.set);
  const now = snapshotOf(card);
  const from = saved.done[card.set] ? (saved.grid[card.set] ?? null) : null;
  const base = { set: card.set, isNew, from, nowKept: [] as ChipId[], nowDiscarded: [] as ChipId[], stateChanged: false };
  if (!from) return { ...base, status: card.state === "off" ? "idle" : "todo" };
  if (sameSnapshot(from, now)) return { ...base, status: "done" };
  return {
    ...base,
    status: "changed",
    nowKept: now.keep.filter((id) => !from.keep.includes(id)),
    nowDiscarded: from.keep.filter((id) => !now.keep.includes(id)),
    stateChanged: from.state !== now.state,
  };
}

export function planProgress(plan: EchoPlan, saved: SavedProgress): PlanProgress {
  const cards: Record<string, CardProgress> = {};
  for (const c of plan.cards) cards[c.set] = cardProgress(c, saved);
  const list = Object.values(cards);
  const of = (s: CardStatus) => list.filter((p) => p.status === s).map((p) => p.set);
  const changed = of("changed");
  const todo = of("todo");
  return {
    cards,
    newSets: list.filter((p) => p.isNew).map((p) => p.set),
    changed,
    todo,
    done: of("done"),
    toUpdate: [...changed, ...todo],
    actionable: list.filter((p) => p.status !== "idle").length,
  };
}

/** Sanitises a stored snapshot (persisted data: never trust its shape). */
export function readSnapshot(raw: unknown): CardSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const state = r.state === "planned" || r.state === "off" || r.state === "thrown" ? r.state : null;
  if (!state) return null;
  const keep = (Array.isArray(r.keep) ? r.keep : []).filter((id): id is ChipId => typeof id === "string" && parseChipId(id) !== null);
  return { state, keep: [...new Set(keep)].sort() };
}

/** Every set the app ships now (the baseline a first visit stores, so nothing reads as "new" on day one). */
export const currentSetKeys = (): string[] => sonatas().map((s) => s.key);
