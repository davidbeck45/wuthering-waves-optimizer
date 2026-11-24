// Wuthering Tools+ — the Gear map on /account: every set-up character's five equipped echoes in one grid, each cell
// the Echo Lab chip the inventory shows for that echo (chipFor, inventoryQuality.ts) read through the same layer
// (useInventoryQuality: one Echo Lab pass, one set of roll ratings, one target per echo). Nothing is scored here: a
// cell's step is the chip's roll tone, its words are Echo Lab's rating band (ratingOf). Pure: no Vue, no stores.
import type { EchoVerdict, LabCharacterSummary } from "../echoLab/bestOwner";
import { wearsNow } from "../echoLab/core";
import { echoName, mainLabel, ratingOf } from "../echoLab/echoLabView";
import { chipFor, type ChipRating, type QualityChip, type RollTone } from "../inventoryQuality/inventoryQuality";

/** a cell's step: Echo Lab's five rating bands, then the cells with no roll to rate */
export type GearStep = RollTone | "unrated" | "none" | "empty";

/** the five bands, best first, with Echo Lab's words (ratingOf) and the letter a cell carries beside its colour */
export const GEAR_BANDS: ReadonlyArray<{ step: RollTone; letter: string; words: string; short: string; beats: number }> = [
  { step: "great", letter: "E", words: "Excellent roll", short: "excellent", beats: 90 },
  { step: "good", letter: "G", words: "Good roll", short: "good", beats: 70 },
  { step: "average", letter: "A", words: "Average roll", short: "average", beats: 40 },
  { step: "below", letter: "B", words: "Below average", short: "below average", beats: 15 },
  { step: "poor", letter: "P", words: "Poor roll", short: "poor", beats: 0 },
];

/** the steps the summary counts as "the lowest bands" */
export const LOW_STEPS: ReadonlySet<GearStep> = new Set<GearStep>(["poor", "below"]);

export interface GearCell {
  /** 0-4, the order the echoes are worn in */
  slot: number;
  echoId: string | null;
  echo: string | null;
  set: string | null;
  cost: number | null;
  main: string | null;
  subs: Array<{ key: string; value: number }>;
  /** the inventory's chip for this echo, exactly (state none for an empty slot or an echo not in the inventory) */
  chip: QualityChip;
  /** the roll's percentile (share of the echoes of its kind it beats), null when not rated */
  percentile: number | null;
  /** where Echo Lab rated it (the chip's own target): another character when this one is not a five-echo build */
  ratedOn: { characterId: string; slot: number; worn: boolean } | null;
  step: GearStep;
  /** the short text in the cell: the band's letter, "–" for no roll, "" for an empty slot */
  letter: string;
  /** Echo Lab's band words ("Good roll") or what stands in for them ("No roll yet") */
  words: string;
}

export interface GearRow {
  id: string;
  name: string;
  cells: GearCell[];
  /** echoes worn (0-5) */
  worn: number;
  /** the lowest percentile of its rated echoes, null when none is rated */
  weakest: number | null;
}

export interface GearInput {
  /** the set-up characters, in the roster's order */
  characters: ReadonlyArray<{ id: string; name: string }>;
  /** the Echo Lab verdicts the inventory's chips read (useInventoryQuality().verdicts) */
  verdicts: ReadonlyMap<string, EchoVerdict>;
  /** the pass's five-echo builds (what they wear, slot by slot) */
  labCharacters: ReadonlyMap<string, LabCharacterSummary>;
  judged: boolean;
  stale: boolean;
  /** where an echo is rated (useInventoryQuality().targets): an echo with lines and a build */
  targets: ReadonlyMap<string, { characterId: string; slot: number }>;
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  ratingFor: (echoId: string) => ChipRating | null | undefined;
}

const EMPTY_WORDS = "Empty slot";

function stepOf(chip: QualityChip, percentile: number | null, lines: number): Pick<GearCell, "step" | "letter" | "words"> {
  if (chip.roll && percentile !== null) {
    const band = GEAR_BANDS.find((b) => b.step === chip.roll!.tone)!;
    return { step: band.step, letter: band.letter, words: ratingOf(percentile).band };
  }
  if (chip.state === "none") return { step: "none", letter: "–", words: "Not judged" };
  if (!lines) return { step: "none", letter: "–", words: "No roll yet (no substat lines)" };
  if (chip.rollPending) return { step: "unrated", letter: "…", words: "Rating…" };
  return { step: "unrated", letter: "–", words: "No roll rating" };
}

function cellOf(slot: number, echoId: string | null, input: GearInput, fallback?: Partial<GearCell>): GearCell {
  const row = echoId ? input.verdicts.get(echoId) : undefined;
  if (!echoId || (!row && !fallback?.echo)) {
    return { slot, echoId: null, echo: null, set: null, cost: null, main: null, subs: [], chip: { state: "none", verdict: null, verdictLabel: "", reason: "", roll: null, rollPending: false, title: "", aria: "" }, percentile: null, ratedOn: null, step: "empty", letter: "", words: EMPTY_WORDS };
  }
  const rating = row ? input.ratingFor(echoId) : null;
  const chip = row ? chipFor({ row, judged: input.judged, stale: input.stale, rating, rateable: input.targets.has(echoId) }) : chipFor({ row: undefined, judged: true, rating: null, rateable: false });
  const percentile = chip.roll && rating ? rating.percentile : null;
  const lines = row?.lines ?? fallback?.subs?.length ?? 0;
  return {
    slot,
    echoId,
    echo: row?.echo ?? fallback?.echo ?? null,
    set: row?.set ?? fallback?.set ?? null,
    cost: row?.cost ?? fallback?.cost ?? null,
    main: row?.main ?? fallback?.main ?? null,
    subs: row?.subs ?? fallback?.subs ?? [],
    chip,
    percentile,
    ratedOn: rating ? { characterId: rating.characterId, slot: rating.slot, worn: rating.worn } : null,
    ...stepOf(chip, percentile, lines),
  };
}

/** who wears what now, from the verdicts (covers characters the pass leaves out: fewer than five echoes) */
function wornIndex(verdicts: ReadonlyMap<string, EchoVerdict>): Map<string, Map<number, string>> {
  const out = new Map<string, Map<number, string>>();
  for (const row of verdicts.values()) {
    for (const w of row.wornBy) {
      if (!wearsNow(w)) continue;
      let slots = out.get(w.characterId);
      if (!slots) out.set(w.characterId, (slots = new Map()));
      if (!slots.has(w.slot)) slots.set(w.slot, row.echoId);
    }
  }
  return out;
}

/** The grid: one row per set-up character, five cells in the order they are worn. */
export function gearRows(input: GearInput): GearRow[] {
  const worn = wornIndex(input.verdicts);
  return input.characters.map(({ id, name }) => {
    const lab = input.labCharacters.get(id);
    const cells: GearCell[] = [];
    for (let slot = 0; slot < 5; slot++) {
      const s = lab?.slots[slot];
      if (lab) cells.push(cellOf(slot, s?.echoId ?? (s ? `slot:${id}:${slot}` : null), input, s ? { echo: s.echo, set: s.set, cost: s.cost, main: s.main, subs: s.lines } : undefined));
      else cells.push(cellOf(slot, worn.get(id)?.get(slot) ?? null, input));
    }
    const rated = cells.map((c) => c.percentile).filter((p): p is number => p !== null);
    return { id, name, cells, worn: cells.filter((c) => c.step !== "empty").length, weakest: rated.length ? Math.min(...rated) : null };
  });
}

export type GearSort = "roster" | "weakest";

/** Roster order, or the character with the weakest echo first (rows with nothing rated last; ties keep roster order). */
export function sortGearRows(rows: readonly GearRow[], sort: GearSort): GearRow[] {
  if (sort === "roster") return [...rows];
  const pos = new Map(rows.map((r, i) => [r.id, i]));
  return [...rows].sort((a, b) => {
    if (a.weakest === null || b.weakest === null) return a.weakest === b.weakest ? pos.get(a.id)! - pos.get(b.id)! : a.weakest === null ? 1 : -1;
    return a.weakest - b.weakest || pos.get(a.id)! - pos.get(b.id)!;
  });
}

export interface GearSummary {
  /** equipped echoes (cells that are not empty) */
  equipped: number;
  rated: number;
  /** echoes in each band */
  counts: Record<RollTone, number>;
  /** in the lowest two bands (Poor roll, Below average) */
  low: number;
  /** the five lowest percentiles, with who wears them */
  weakest: Array<{ characterId: string; name: string; cell: GearCell }>;
}

export function gearSummary(rows: readonly GearRow[], n = 5): GearSummary {
  const counts: Record<RollTone, number> = { great: 0, good: 0, average: 0, below: 0, poor: 0 };
  const all: Array<{ characterId: string; name: string; cell: GearCell; order: number }> = [];
  let equipped = 0;
  let order = 0;
  for (const r of rows) {
    for (const c of r.cells) {
      if (c.step === "empty") continue;
      equipped += 1;
      if (c.percentile === null || c.step === "unrated" || c.step === "none") continue;
      counts[c.step] += 1;
      all.push({ characterId: r.id, name: r.name, cell: c, order: order++ });
    }
  }
  all.sort((a, b) => a.cell.percentile! - b.cell.percentile! || a.order - b.order);
  return {
    equipped,
    rated: all.length,
    counts,
    low: counts.poor + counts.below,
    weakest: all.slice(0, n).map(({ characterId, name, cell }) => ({ characterId, name, cell })),
  };
}

/** "9 of your 118 equipped echoes are in the lowest two bands (Poor roll or Below average)." */
export function summaryLine(s: GearSummary): string {
  if (!s.equipped) return "None of your set-up characters wears an echo yet.";
  const of = `${s.low} of your ${s.equipped} equipped echo${s.equipped === 1 ? "" : "es"}`;
  const verb = s.low === 1 ? "is" : "are";
  const unrated = s.equipped - s.rated;
  return `${of} ${verb} in the lowest two bands (Poor roll or Below average).${unrated ? ` ${unrated} could not be rated (no substat lines yet, or no build to rate them on).` : ""}`;
}

/**
 * Whether the map is whole: Echo Lab has judged this account and every equipped echo that can be rated has its rating.
 * A map with ratings still coming is never shown as done (batch 3: a half-scored result shown as whole).
 */
export function gearProgress(rows: readonly GearRow[], judged: boolean): { whole: boolean; rated: number; rateable: number } {
  let rateable = 0;
  let rated = 0;
  for (const r of rows)
    for (const c of r.cells) {
      if (c.step === "empty" || c.step === "none") continue;
      if (c.step === "unrated" && !c.chip.rollPending) continue;
      rateable += 1;
      if (c.step !== "unrated") rated += 1;
    }
  return { whole: judged && rated === rateable, rated, rateable };
}

/** what a screen reader hears for a cell: "Aemeath, slot 3, Fusion DMG 3-cost, Poor roll, Feed" */
export function cellLabel(name: string, c: GearCell): string {
  if (c.step === "empty") return `${name}, slot ${c.slot + 1}, empty`;
  const main = c.main ? mainLabel(c.main) : null;
  const what = [c.echo ? echoName(c.echo) : null, main && c.cost ? `${main} ${c.cost}-cost` : main].filter(Boolean).join(", ");
  const verdict = c.chip.verdictLabel ? `, Echo Lab: ${c.chip.verdictLabel}` : "";
  const roll = c.chip.roll ? `, ${c.words}, ${c.chip.roll.text}` : `, ${c.words}`;
  return `${name}, slot ${c.slot + 1}${what ? `, ${what}` : ""}${roll}${verdict}`;
}
