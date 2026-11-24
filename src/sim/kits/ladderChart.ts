// Wuthering Tools+ — the bar charts of a resonator brief (/kit/<name>), as a pure model: the investment ladder
// (sequences, weapons, refinement ranks) and the best team at each Team Cost. Every bar is drawn from the rows the
// tables print (kits.ts `ladderSteps`, `weaponSteps`, `rankSteps`, `teamsByCost`): nothing here computes a figure of its
// own, it only scales them and words them. Bars start at zero; a bar's length is its share of the chart's largest figure.
import { dpsText, signedPercent, type LadderStep, type WeaponStep } from "./kits";

/** a change in team DPS smaller than this (a twentieth of a percent) reads as no change, as `signedPercent` does */
const FLAT = 0.0005;

export type BarMark = "you" | "held" | "biggest" | "lower";

export interface Bar {
  id: string;
  /** what the bar is: "S2", "Defier's Thorn R1", "R3" */
  label: string;
  value: number;
  /** the value as the table prints it: "108.5K" */
  valueText: string;
  /** the bar's length, 0..1 of the chart's largest value */
  width: number;
  /** the change the bar carries, in words: "+26.6% over S1" */
  note: string;
  marks: BarMark[];
}

/** length of a bar against the largest figure of its chart; zero-based, never negative, never past 1 */
export function barWidth(value: number, max: number): number {
  if (!(max > 0) || !(value > 0)) return 0;
  return Math.min(1, value / max);
}

const maxOf = (values: number[]): number => values.reduce((m, v) => (v > m ? v : m), 0);

export interface SequenceChart {
  bars: Bar[];
  /** the step with the largest gain over the level below, when one gains anything */
  biggest: { from: number; to: number; step: number } | null;
  /** "The biggest step is S5 to S6: +44.7% team DPS over S5." */
  biggestText: string;
  /** levels that lower team DPS against the level below (a data oddity worth saying, not hiding) */
  lower: number[];
}

/** The sequence ladder as bars: each level's team DPS, its gain over the level below, the biggest step, and the
 *  account's own sequence when owned (`own`, else null). */
export function sequenceChart(steps: readonly LadderStep[], own: number | null): SequenceChart {
  const max = maxOf(steps.map((s) => s.dps));
  let biggest: SequenceChart["biggest"] = null;
  steps.forEach((s, i) => {
    if (i === 0 || s.step == null || s.step <= FLAT) return;
    if (!biggest || s.step > biggest.step) biggest = { from: steps[i - 1]!.level, to: s.level, step: s.step };
  });
  const big = biggest as SequenceChart["biggest"];
  const lower = steps.filter((s) => s.step != null && s.step < -FLAT).map((s) => s.level);
  const bars = steps.map((s, i): Bar => {
    const prev = i ? steps[i - 1]!.level : null;
    const marks: BarMark[] = [];
    if (own != null && s.level === own) marks.push("you");
    if (big && s.level === big.to) marks.push("biggest");
    if (lower.includes(s.level)) marks.push("lower");
    return {
      id: `S${s.level}`,
      label: `S${s.level}`,
      value: s.dps,
      valueText: dpsText(s.dps),
      width: barWidth(s.dps, max),
      note: s.step == null || prev == null ? "the start" : Math.abs(s.step) < FLAT ? `no change over S${prev}` : `${signedPercent(s.step)} over S${prev}`,
      marks,
    };
  });
  const biggestText = big ? `The biggest step is S${big.from} to S${big.to}: ${signedPercent(big.step)} team DPS over S${big.from}.` : "No sequence here adds team DPS.";
  return { bars, biggest: big, biggestText, lower };
}

/** "Defier's Thorn" and the app's "Defier’s Thorn": the same weapon written two ways */
export const sameWeaponName = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return Boolean(a && b && norm(a) === norm(b));
};

/** The weapons, best first (as `weaponSteps` sorts them), each with its difference to the weapon the ladder holds;
 *  the held one and the account's own (by name) marked. */
export function weaponChart(weapons: readonly WeaponStep[], held: { weapon: string; rank: number }, ownWeapon: string | null): Bar[] {
  const max = maxOf(weapons.map((w) => w.dps));
  const heldRow = weapons.find((w) => w.weapon === held.weapon) ?? null;
  return weapons.map((w) => {
    const isHeld = heldRow === w;
    const vs = heldRow && heldRow.dps ? (w.dps - heldRow.dps) / heldRow.dps : null;
    const marks: BarMark[] = [];
    if (isHeld) marks.push("held");
    if (sameWeaponName(w.weapon, ownWeapon)) marks.push("you");
    return {
      id: w.weapon,
      label: `${w.weapon} R${w.rank}`,
      value: w.dps,
      valueText: dpsText(w.dps),
      width: barWidth(w.dps, max),
      note: isHeld ? "the weapon the rest of this section holds" : vs == null ? "" : Math.abs(vs) < FLAT ? `same as ${held.weapon}` : `${signedPercent(vs)} against ${held.weapon}`,
      marks,
    };
  });
}

/** The held weapon's refinement ranks, each with its gain over the rank below; the account's own rank marked when it
 *  holds this weapon (`ownRank`, else null). */
export function rankChart(ranks: ReadonlyArray<{ rank: number; dps: number }>, ownRank: number | null): Bar[] {
  const max = maxOf(ranks.map((r) => r.dps));
  return ranks.map((r, i) => {
    const prev = i ? ranks[i - 1]! : null;
    const step = prev && prev.dps ? (r.dps - prev.dps) / prev.dps : null;
    const marks: BarMark[] = [];
    if (ownRank != null && r.rank === ownRank) marks.push("you");
    if (step != null && step < -FLAT) marks.push("lower");
    return {
      id: `R${r.rank}`,
      label: `R${r.rank}`,
      value: r.dps,
      valueText: dpsText(r.dps),
      width: barWidth(r.dps, max),
      note: step == null || !prev ? "the start" : Math.abs(step) < FLAT ? `no change over R${prev.rank}` : `${signedPercent(step)} over R${prev.rank}`,
      marks,
    };
  });
}

/** The best team's figure at each Team Cost as a length against the largest of them, keyed by cost code. */
export function costWidths(costs: ReadonlyArray<{ cost: string; teams: ReadonlyArray<{ dps: number }> }>): Record<string, number> {
  const max = maxOf(costs.map((c) => c.teams[0]?.dps ?? 0));
  return Object.fromEntries(costs.map((c) => [c.cost, barWidth(c.teams[0]?.dps ?? 0, max)]));
}

/** The words a mark puts beside its bar: the second cue, so a mark never rests on colour alone. */
export const MARK_WORDS: Record<BarMark, string> = {
  you: "you are here",
  held: "held",
  biggest: "biggest step",
  lower: "lower than the one below",
};

/** One bar read aloud: "S2: 108.5K team DPS, +26.6% over S1, biggest step". */
export function barSpeech(bar: Bar, unit = "team DPS"): string {
  return [`${bar.label}: ${bar.valueText} ${unit}`, bar.note, ...bar.marks.map((m) => MARK_WORDS[m])].filter(Boolean).join(", ");
}

export interface StripStep {
  level: number;
  /** the kind of loop change at this level, when it has one */
  kind: string | null;
  /** the account has this level (owned and at or above it) */
  have: boolean;
  /** the account's own sequence */
  current: boolean;
}

/** The S1–S6 strip of "Sequences that change how you play": which levels change the loop, which the account has, and
 *  the step that opens selected (the first change the account does not have yet, else the first change, else S1). */
export function sequenceStrip(rows: ReadonlyArray<{ level: number; kind?: string | null }>, own: number | null): { steps: StripStep[]; first: number } {
  const steps = rows.map((r) => ({ level: r.level, kind: r.kind ?? null, have: own != null && r.level <= own, current: own != null && r.level === own }));
  const changing = steps.filter((s) => s.kind);
  const first = (changing.find((s) => !s.have) ?? changing[0] ?? steps[0])?.level ?? 1;
  return { steps, first };
}
