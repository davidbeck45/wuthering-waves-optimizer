// Wuthering Tools+ — Echo Lab inside Ryan's echo inventory: the view model of the small chip on every echo (its Keep /
// Spare / Feed verdict and, once it has substat lines, how lucky its roll is), the plus sort ("Best rolls first",
// "Feed first") and the "Feed candidates" filter. Pure (no Vue, no stores): the verdicts come from the Echo Lab pass
// (bestOwner.ts), the ratings from rollRatings.ts (quick) or rollQuality.ts (exact, when Echo Lab's detail ran it).
import type { EchoVerdict, EchoVerdictKind } from "../echoLab/bestOwner";
import { VERDICT_LABEL, characterName, ratingOf, reasonText, slotLabel } from "../echoLab/echoLabView";

export type InventorySort = "default" | "best-rolls" | "feed-first";

export const INVENTORY_SORTS: ReadonlyArray<{ value: InventorySort; label: string }> = [
  { value: "default", label: "Inventory order" },
  { value: "best-rolls", label: "Best rolls first" },
  { value: "feed-first", label: "Feed first" },
];

export const isInventorySort = (v: unknown): v is InventorySort => INVENTORY_SORTS.some((s) => s.value === v);

/** A roll rating as the chip reads it: the share of outcomes the echo beats, and how it was found. */
export interface ChipRating {
  percentile: number;
  /** substat lines it has (it is rated against echoes with as many) */
  lines: number;
  /** +5 per line */
  level: number;
  characterId: string;
  slot: number;
  worn: boolean;
  /** true: Echo Lab's detail scored every outcome through the engine; false: the quick estimate */
  exact: boolean;
}

export type RollTone = "great" | "good" | "average" | "below" | "poor";

/** "Top 4%" / "Bottom 30%", never "Top 0%". One rounding with Echo Lab's "Better than 96%" (ratingOf), so the two add to 100. */
function rollPlace(percentile: number): string {
  const better = Math.round(percentile * 100);
  return percentile >= 0.5 ? `Top ${Math.max(1, 100 - better)}%` : `Bottom ${Math.max(1, better)}%`;
}

/** "Top 4% roll" / "Bottom 30% roll", with "at +15" for an echo still being tuned. */
export function rollText(percentile: number, lines: number): string {
  return `${rollPlace(percentile)} roll${lines < 5 ? ` at +${lines * 5}` : ""}`;
}

/** the colour of the roll text: Echo Lab's rating bands (ratingOf: Excellent ≥ 90, Good ≥ 70, Average ≥ 40, Below ≥ 15) */
export function rollTone(percentile: number): RollTone {
  return percentile >= 0.9 ? "great" : percentile >= 0.7 ? "good" : percentile >= 0.4 ? "average" : percentile >= 0.15 ? "below" : "poor";
}

export type ChipState =
  /** the Echo Lab pass has not judged this echo yet (the first pass is running, or the echo is new) */
  | "loading"
  /** judged; `roll` may still be on its way (`rollPending`) */
  | "ready"
  /** the last pass's verdict, shown while Echo Lab judges the inventory again after an edit */
  | "stale"
  /** nothing to say: an incomplete echo (no echo, cost or main stat), or no build to judge it against */
  | "none";

export interface QualityChip {
  state: ChipState;
  verdict: EchoVerdictKind | null;
  /** "Keep" / "Spare" / "Feed" */
  verdictLabel: string;
  /** why, in words: "Worn", "Upgrade for 2", "No gain anywhere" … */
  reason: string;
  roll: { text: string; tone: RollTone; exact: boolean } | null;
  /** levelled and rateable, rating not in yet */
  rollPending: boolean;
  /** native hover text (desktop) — the whole story in sentences */
  title: string;
  /** what a screen reader announces for the button */
  aria: string;
}

/** no chip: an incomplete echo, or nothing to judge it against */
export const NO_CHIP: QualityChip = { state: "none", verdict: null, verdictLabel: "", reason: "", roll: null, rollPending: false, title: "", aria: "" };

const LOADING_CHIP: QualityChip = { ...NO_CHIP, state: "loading", title: "Echo Lab is judging your echoes", aria: "Echo Lab: judging" };

/**
 * The chip of one echo.
 * - `row`: its Echo Lab verdict (undefined while the first pass runs, or for an echo added since the last one);
 *   `judged`: the current pass is in and has builds to judge against; `stale`: `row` is the last pass's, shown while
 *   Echo Lab judges the inventory again.
 * - `rating`: its roll rating (exact preferred by the caller); undefined = not in yet, null = could not be rated.
 * - `rateable`: it has lines and a build to rate it on (qualityTarget), so a rating is coming.
 */
export function chipFor(input: {
  row: EchoVerdict | undefined;
  judged: boolean;
  stale?: boolean;
  rating: ChipRating | null | undefined;
  rateable: boolean;
}): QualityChip {
  const { row, judged, rating, rateable } = input;
  const stale = !judged && !!input.stale;
  if (!row) return judged ? NO_CHIP : LOADING_CHIP;
  if (!judged && !stale) return LOADING_CHIP;
  if (!row.echo || !row.cost || !row.main) return NO_CHIP;
  const verdictLabel = VERDICT_LABEL[row.verdict];
  const reason = reasonText(row);
  const roll = rating ? { text: rollText(rating.percentile, rating.lines), tone: rollTone(rating.percentile), exact: rating.exact } : null;
  const rollPending = rateable && rating === undefined && !stale;
  const sentences = [`Echo Lab: ${verdictLabel} (${reason.toLowerCase()}).`];
  if (stale) sentences.unshift("Updating: Echo Lab is judging your echoes again after a change.");
  if (rating) {
    const where = rating.worn ? `where it sits on ${characterName(rating.characterId)}` : `in ${characterName(rating.characterId)}'s ${slotLabel(rating.slot).toLowerCase()}`;
    sentences.push(
      `Roll: ${ratingOf(rating.percentile).band.toLowerCase()}, ${rollPlace(rating.percentile).toLowerCase()} of the +${rating.level} echoes of its kind it could have been, by damage ${where} on their best rotation${rating.exact ? "" : " (a quick estimate)"}.`,
    );
  } else if (!row.lines) {
    sentences.push("No substat lines yet, so no roll to rate.");
  } else if (!rateable) {
    sentences.push("No built character can slot it, so there is no build to rate its roll on.");
  } else if (rating === null) {
    sentences.push("Echo Lab could not rate this roll on its build.");
  }
  sentences.push("Tap for the details in Echo Lab.");
  const aria = `Echo Lab: ${verdictLabel}${roll ? `, ${roll.text}` : ""}${rollPending ? ", rating roll…" : ""}, ${reason}${stale ? " (updating)" : ""}. Open in Echo Lab`;
  return { state: stale ? "stale" : "ready", verdict: row.verdict, verdictLabel, reason, roll, rollPending, title: sentences.join(" "), aria };
}

// ── sort and filter (the hook in Ryan's InventoryEchoesBrowser.vue `echoesList`) ──

export interface InventoryView {
  sort: InventorySort;
  /** only the echoes Echo Lab says to feed */
  feedOnly: boolean;
}

export interface QualityLookup {
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  verdict: (echoId: string) => EchoVerdictKind | null;
  /** the roll percentile, null when not rated (yet) */
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  percentile: (echoId: string) => number | null;
}

const FEED_FIRST: Record<EchoVerdictKind, number> = { feed: 0, spare: 1, keep: 2 };

/**
 * Ryan's filtered list → the plus view: "Feed candidates" keeps the feed verdicts; "Best rolls first" orders by roll
 * percentile (unrated last); "Feed first" orders feed → spare → keep → not judged, the worst roll first inside each
 * (the surest fodder on top). Ties keep the list's own order; "Inventory order" returns the list as it came.
 */
export function applyInventoryView<T extends { echoId: string }>(list: readonly T[], view: InventoryView, q: QualityLookup): T[] {
  let out = view.feedOnly ? list.filter((e) => q.verdict(e.echoId) === "feed") : [...list];
  if (view.sort === "default") return out;
  const index = new Map(out.map((e, i) => [e.echoId, i]));
  const pos = (e: T): number => index.get(e.echoId) ?? 0;
  const pct = new Map(out.map((e) => [e.echoId, q.percentile(e.echoId)]));
  const p = (e: T): number | null => pct.get(e.echoId) ?? null;
  if (view.sort === "best-rolls") {
    out = out.sort((a, b) => {
      const pa = p(a);
      const pb = p(b);
      if (pa === null || pb === null) return pa === pb ? pos(a) - pos(b) : pa === null ? 1 : -1;
      return pb - pa || pos(a) - pos(b);
    });
  } else {
    const group = (e: T): number => {
      const v = q.verdict(e.echoId);
      return v ? FEED_FIRST[v] : 3;
    };
    out = out.sort((a, b) => {
      const g = group(a) - group(b);
      if (g) return g;
      const pa = p(a);
      const pb = p(b);
      if (pa === null || pb === null) return pa === pb ? pos(a) - pos(b) : pa === null ? 1 : -1;
      return pa - pb || pos(a) - pos(b);
    });
  }
  return out;
}

/** how many echoes the "Feed candidates" chip would show (its badge) */
export const feedCount = (list: ReadonlyArray<{ echoId: string }>, q: Pick<QualityLookup, "verdict">): number => list.filter((e) => q.verdict(e.echoId) === "feed").length;

// ── the bar's status line ──

export interface BarStatus {
  kind: "idle" | "empty" | "no-builds" | "judging" | "rating" | "done" | "error";
  text: string;
}

export function barStatus(input: {
  echoes: number;
  builds: number;
  judging: boolean;
  /** the chips show the last pass's verdicts while this one runs */
  stale?: boolean;
  /** 0-1 of the pass, null when unknown */
  progress: number | null;
  error: string | null;
  judged: { keep: number; spare: number; feed: number } | null;
  /** levelled echoes with a build to rate them on, and how many are rated */
  rateable: number;
  rated: number;
  /** a sort by roll is on: it reorders once every roll is in, not batch by batch */
  rollSort?: boolean;
  /** the rating run gave up (the worker failed three times running) */
  ratingFailed?: boolean;
}): BarStatus {
  const { echoes, builds, judging, progress, error, judged, rateable, rated, stale } = input;
  if (!echoes) return { kind: "empty", text: "" };
  if (!builds) return { kind: "no-builds", text: "Build a character (a weapon and five echoes) and Echo Lab will judge these echoes against them." };
  if (error) return { kind: "error", text: `Echo Lab stopped: ${error}` };
  if (judging || !judged) {
    const pct = progress === null ? "" : ` ${Math.round(progress * 100)}%`;
    if (stale) return { kind: "judging", text: `Your echoes changed: Echo Lab is judging them again…${pct} The chips show the last verdicts meanwhile.` };
    return { kind: "judging", text: `Echo Lab is judging ${echoes} echoes on your ${builds} build${builds === 1 ? "" : "s"}…${pct}` };
  }
  const counts = `${judged.keep} keep · ${judged.spare} spare · ${judged.feed} feed`;
  if (rated < rateable && input.ratingFailed) return { kind: "error", text: `${counts}. Echo Lab could not rate every roll (${rated} of ${rateable} done).` };
  if (rated < rateable) return { kind: "rating", text: `${counts}. Rating rolls: ${rated} of ${rateable}…${input.rollSort ? " The order updates when every roll is in." : ""}` };
  return { kind: "done", text: `${counts}. Tap an echo's chip for why.` };
}
