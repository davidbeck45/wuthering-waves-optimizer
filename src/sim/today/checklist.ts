// Wuthering Tools+ — the caps checklist that resets itself. Each item (data/rules.json `checklist`) counts up to its
// cap and belongs to a period: the server day (04:00), the server week (Monday 04:00), an endgame cycle (Tower of
// Adversity / Whimpering Wastes, 28 days from a Monday 04:00 anchor) or the Endstate Matrix phase (one per version).
// A tick stores its count and when it was made; a tick made before its period began reads as 0 — nothing is ever
// rewritten on a timer, so a page left open over a reset (or a browser closed for a week) is right on the next render.
// Pure.
import { cycleWindow, lastDailyReset, lastWeeklyReset, nextDailyReset, nextWeeklyReset } from "./resets";
import { RULES, type ChecklistRule, type ResetKind, type TodayRules } from "./rules";

export interface Tick {
  /** how many of the cap are done */
  n: number;
  /** when the count last changed */
  at: number;
}

export interface Period {
  startMs: number;
  /** the next reset (null: not known — the Matrix phase without a stated version end) */
  nextMs: number | null;
  /** the next reset is an estimate */
  approx?: boolean;
}

export interface ChecklistContext {
  now: number;
  offsetHours: number;
  /** the live version's start and (estimated) end, for the Matrix phase */
  phase: { startMs: number; endMs: number | null; approx: boolean } | null;
  rules?: TodayRules;
}

/** the period an item's count belongs to at `now` */
export function periodOf(reset: ResetKind, ctx: ChecklistContext): Period | null {
  const rules = ctx.rules ?? RULES;
  const hour = rules.resets.hour;
  if (reset === "daily") return { startMs: lastDailyReset(ctx.now, ctx.offsetHours, hour), nextMs: nextDailyReset(ctx.now, ctx.offsetHours, hour) };
  if (reset === "weekly")
    return {
      startMs: lastWeeklyReset(ctx.now, ctx.offsetHours, hour, rules.resets.weekday),
      nextMs: nextWeeklyReset(ctx.now, ctx.offsetHours, hour, rules.resets.weekday),
    };
  if (reset === "matrix") return ctx.phase ? { startMs: ctx.phase.startMs, nextMs: ctx.phase.endMs, approx: ctx.phase.approx } : null;
  if (reset.startsWith("cycle:")) {
    const rule = rules.cycles.find((c) => c.id === reset.slice(6));
    const w = rule ? cycleWindow(rule, ctx.now, ctx.offsetHours) : null;
    return w ? { startMs: w.startMs, nextMs: w.nextMs, approx: rule!.confidence !== "official" } : null;
  }
  return null;
}

export interface ItemState {
  rule: ChecklistRule;
  count: number;
  max: number;
  done: boolean;
  /** when this item clears again */
  resetsAt: number | null;
  resetsApprox: boolean;
}

/** a tick's count in the current period (0 when it was made before the period began, or the period is unknown) */
export function countIn(tick: Tick | undefined, period: Period | null, max: number): number {
  if (!tick || !period || tick.at < period.startMs) return 0;
  return Math.min(max, Math.max(0, Math.floor(tick.n)));
}

export function itemState(rule: ChecklistRule, tick: Tick | undefined, ctx: ChecklistContext): ItemState {
  const period = periodOf(rule.reset, ctx);
  // without a known period (the Matrix phase before the feed has been read) a tick stands as made
  const count = period ? countIn(tick, period, rule.max) : Math.min(rule.max, Math.max(0, Math.floor(tick?.n ?? 0)));
  return { rule, count, max: rule.max, done: count >= rule.max, resetsAt: period?.nextMs ?? null, resetsApprox: !!period?.approx };
}

/** the items to show: hidden ones out, the double-drop counter only while a double drop runs */
export function visibleItems(rules: readonly ChecklistRule[], opts: { hidden: readonly string[]; doubleDropLive: boolean }): ChecklistRule[] {
  return rules.filter((r) => !opts.hidden.includes(r.id) && (!r.doubleDropOnly || opts.doubleDropLive));
}

/** set an item's count (clamped to its cap) at `now` */
export function setCount(ticks: Readonly<Record<string, Tick>>, rule: ChecklistRule, n: number, now: number): Record<string, Tick> {
  const next = { ...ticks };
  const v = Math.min(rule.max, Math.max(0, Math.floor(n)));
  if (v === 0) delete next[rule.id];
  else next[rule.id] = { n: v, at: now };
  return next;
}

/** done / to do across the visible items */
export function checklistSummary(states: readonly ItemState[]): { done: number; total: number } {
  return { done: states.filter((s) => s.done).length, total: states.length };
}
