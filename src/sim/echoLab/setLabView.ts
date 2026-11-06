// Wuthering Tools+ Echo Lab — the "Set lab" tab's view model: the words for a layout, a conditional bonus and an Energy
// Regen change, the shape filter and the two rankings. Pure, and no engine imports (every number comes from the worker's
// setLab.ts), so the page can sort and filter without loading the engine.
import type { TeamImpact } from "../account/investPlan";
import { setLabel } from "./echoLabView";
import { showHave } from "../energy/energyNeed";

export const SET_LAB_ASSUMPTIONS = [
  "Only the Sonata labels change. Main stats, substats, levels, the weapon and the rotation stay exactly as they are.",
  "The main echo stays too: its buff and its hit in the rotation are held, so a row shows what the set alone does. A layout your main echo cannot carry says so, with the figure for that set's best main echo beside it.",
  "This engine has no uptime. A bonus is on for the whole rotation or off, so a 15 second buff counts as always up. Your own layout reads your calculator's switches; every other layout is scored as the calculator's swap badges score one: on, at its most stacks. One condition is checked instead: Tidebreaking Courage's 250 % Energy Regen.",
  "No figure knows whether a kit can meet a condition (inflicting a status, gaining a Shield, holding 0 Resonance Energy). Each row prints the condition and the figure if it never holds, so you can judge.",
  "A slot marked any Sonata can hold any echo that adds no bonus. A Sonata counts one echo per name, so a layout needs enough different echoes of that set at this build's costs. Layouts that cannot be made are left out and counted.",
  "Energy Regen is read as the Energy check reads it: the build's constant Energy Regen, no conditional buffs. It is not part of the damage figure, and neither is healing.",
  "Team figures re-score the character's strongest team you can field, as My account does. A teammate whose own Team Buffs panel already names this team keeps that panel: a 5-piece buff a layout gives up comes off it, and a layout with a 5-piece team buff the panel doesn't tick has no team figure.",
] as const;

export interface LayoutPart {
  set: string;
  pieces: number;
}

export type SetLabShape = "all" | "5" | "3+2" | "2+2";
export const SET_LAB_SHAPES: ReadonlyArray<{ value: SetLabShape; label: string }> = [
  { value: "all", label: "Every layout" },
  { value: "5", label: "5-piece" },
  { value: "3+2", label: "3 + 2" },
  { value: "2+2", label: "2 + 2" },
];

export type SetLabSort = "team" | "own" | "floor";
export const SET_LAB_SORTS: ReadonlyArray<{ value: SetLabSort; label: string }> = [
  { value: "team", label: "Team gain" },
  { value: "own", label: "Own gain" },
  { value: "floor", label: "Own, conditions off" },
];

/** "Molten Rift 5-piece", "Dream of the Lost 3-piece + Sun-sinking Eclipse 2-piece", "No set bonus". */
export function layoutName(parts: readonly LayoutPart[]): string {
  if (!parts.length) return "No set bonus";
  return parts.map((p) => `${setLabel(p.set)} ${p.pieces}-piece`).join(" + ");
}

/** The filter a layout answers to: the pieces it wears, a 1-piece aside (it rides on top of any of them). */
export function layoutShape(parts: readonly LayoutPart[]): Exclude<SetLabShape, "all"> | "other" {
  const sizes = parts.filter((p) => p.pieces > 1).map((p) => p.pieces);
  if (sizes.includes(5)) return "5";
  if (sizes.includes(3) && sizes.includes(2)) return "3+2";
  if (sizes.length === 2 && sizes.every((n) => n === 2)) return "2+2";
  return "other";
}

/** The Sonatas a layout names, for the optimizer's set filter. */
export const layoutSets = (parts: readonly LayoutPart[]): string[] => parts.map((p) => p.set);

interface FilterRow {
  /** every shape among the layouts in the row */
  shapes: readonly string[];
  current: boolean;
  mainFits: boolean;
}

/** Rows of one shape, or that your main echo can carry. Your own layout always stays, so there is something to read against. */
export function filterSetRows<T extends FilterRow>(rows: readonly T[], shape: SetLabShape, keepsMain: boolean): T[] {
  return rows.filter((r) => r.current || ((shape === "all" || r.shapes.includes(shape)) && (!keepsMain || r.mainFits)));
}

interface SortRow {
  key: string;
  parts?: readonly LayoutPart[];
  gain: number;
  floorGain: number | null;
  current: boolean;
  team: Pick<TeamImpact, "gain"> | null;
}

const pieces = (row: Pick<SortRow, "parts">): number => (row.parts ?? []).reduce((sum, p) => sum + p.pieces, 0);

/** What a row counts for if no condition ever holds: a layout with none is what it is. */
export const floorOf = (row: Pick<SortRow, "gain" | "floorGain">): number => row.floorGain ?? row.gain;

/**
 * Best first: by team gain where there is one and own gain after; by own gain with every condition holding; or by own
 * gain with none of them holding. Ties: your layout, then the key, so the order never jitters.
 */
export function sortSetRows<T extends SortRow>(rows: readonly T[], by: SetLabSort = "own"): T[] {
  const tie = (a: T, b: T): number => Number(b.current) - Number(a.current) || a.key.localeCompare(b.key);
  return [...rows].sort((a, b) => {
    // at the same floor the plainer layout leads: one with no condition, then the fewest pieces, not the one whose condition reads best
    if (by === "floor") return floorOf(b) - floorOf(a) || Number(b.floorGain === null) - Number(a.floorGain === null) || pieces(a) - pieces(b) || tie(a, b);
    if (by === "team") {
      if (a.team && !b.team) return -1;
      if (!a.team && b.team) return 1;
      if (a.team && b.team) {
        const t = b.team.gain - a.team.gain;
        if (t) return t;
      }
    }
    return b.gain - a.gain || tie(a, b);
  });
}

/** A row with the team figure a later request worked out (the first pass gives only the likeliest rows one). */
export function withSetTeam<T extends { team: unknown; teamNote: string | null; teamPending: boolean }>(row: T, extra: { team: T["team"]; teamNote: string | null } | null | undefined): T {
  if (!extra || row.team) return row;
  return { ...row, team: extra.team, teamNote: extra.teamNote, teamPending: false };
}

export interface SetAssumption {
  bonus: string;
  passive: string;
  /** your calculator's switch for a bonus you wear, or the swap badges' on-at-most-stacks for one you don't */
  source: "yours" | "assumed";
  on: boolean;
  stacks: number | null;
  maxStacks: number | null;
  /** this layout's Energy Regen (%) does not reach what the condition names: counted off, or on by your own switch */
  erGate: { need: number; have: number | null } | null;
}

/** "Your calculator's switch: off", "Assumed: on for the whole rotation, 4 of 4 stacks". */
export function assumptionState(a: Pick<SetAssumption, "source" | "on" | "stacks" | "maxStacks"> & Partial<Pick<SetAssumption, "erGate">>): string {
  const who = a.source === "yours" ? "Your calculator's switch" : "Assumed";
  if (a.erGate) {
    const have = a.erGate.have === null ? "" : ` and this layout has ${showHave(a.erGate.have)} %`;
    return a.on ? `${who}: on, though it needs ${a.erGate.need} % Energy Regen${have}` : `Counted off: it needs ${a.erGate.need} % Energy Regen${have}`;
  }
  if (!a.on) return `${who}: off`;
  const stacks = a.maxStacks ? `, ${a.stacks ?? 0} of ${a.maxStacks} stacks` : "";
  return `${who}: on for the whole rotation${stacks}`;
}

/** "−10.0 points", "no change" */
export function pointsText(change: number): string {
  if (Math.abs(change) < 0.05) return "no change";
  return `${change > 0 ? "+" : "−"}${Math.abs(change).toFixed(1)} points`;
}

/** "128.4 % to 118.4 %", as the Energy check prints a figure. */
export function erRange(row: { erHave: number | null; erChange: number }): string | null {
  if (row.erHave === null) return null;
  return `${showHave(row.erHave - row.erChange)} % to ${showHave(row.erHave)} %`;
}

/** The build falls under what its saved teams need, on this layout. */
export const erShort = (row: { erHave: number | null }, need: number | null | undefined): boolean => row.erHave !== null && need != null && row.erHave < need - 1e-9;

/** "3 of 5 echoes change Sonata", for a layout you don't wear. */
export function changesText(changes: number): string {
  if (changes === 0) return "No echo changes Sonata";
  return `${changes} of 5 echoes change Sonata`;
}

/** A game text without its markup (and the doubled % a few of the set data's texts carry: "Fusion DMG + 10%%"). */
export function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/%%/g, "%")
    .replace(/\s+/g, " ")
    .trim();
}
