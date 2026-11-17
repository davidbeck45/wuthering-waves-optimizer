// Wuthering Tools+ — the words for a build with two exclusive buffs on, one wording for the notice on /account and
// /my-rankings, the CLI's warning and the assistant's note. Plain data in, strings out.
//
// Two buffs marked exclusive and both on is not always a double count: for some pairs the engine already takes only the
// stronger one (Lupa's Sequence 3 over her inherent skill, Brant's two Moments). So what the pair does to the figures is
// read off the figures themselves (`overcountOf`), never assumed.
import { characterDisplayName } from "../display/names";
import { sideLabels, type BuffConflict } from "./buffConflicts";
import type { ConflictFigures } from "./conflictFigures";

const whole = (n: number): string => Math.round(n).toLocaleString("en-US");
/** "5.7 % lower" / "1.2 % higher" / "the same": one figure against the figure as saved */
export function againstSaved(value: number, saved: number): string {
  if (!(saved > 0)) return "";
  const change = (value / saved - 1) * 100;
  if (Math.abs(change) < 0.05) return "the same";
  return `${Math.abs(change).toFixed(1)} % ${change < 0 ? "lower" : "higher"}`;
}

const nameOf = (c: BuffConflict): string => characterDisplayName(c.characterId) || c.characterId;
/** two weapon passives are "weapon effects" in the app's own words; anything else is a buff */
const kindOf = (c: BuffConflict): string => (c.sides.every((s) => s.category === "weaponPassives") ? "two weapon effects" : "two buffs");

/** "Sigrika has two buffs on that cannot be active together in the game: Schemata of Runes and Soliskin Vitality." */
export function conflictHeadline(c: BuffConflict): string {
  const [a, b] = sideLabels(c);
  const who = c.active ? nameOf(c) : `${nameOf(c)}'s saved build "${c.buildName || "unnamed"}"`;
  return `${who} has ${kindOf(c)} on that cannot be active together in the game: ${a} and ${b}.`;
}

/** What the pair does to the figures:
 *  `twice` — the figure as saved is above both single figures: the engine counts both, and the figure is too high
 *            whichever one is right;
 *  `stronger` — the figure as saved is the figure with only `stronger` on: the engine already takes that one alone;
 *  `neither` — no figure moves either way (the pair does not touch this rotation or team);
 *  `unknown` — there was nothing to score. */
export interface Overcount {
  kind: "twice" | "stronger" | "neither" | "unknown";
  stronger: 0 | 1 | null;
}

/** Figures closer than this (0.05 %) are the same figure: what the notice prints as "the same". */
const SAME = 0.0005;

export function overcountOf(f: ConflictFigures | null | undefined): Overcount {
  const sets: Array<{ both: number; only: [number, number] }> = [];
  if (f?.rotation) sets.push({ both: f.rotation.both.avgDamage, only: [f.rotation.only[0].avgDamage, f.rotation.only[1].avgDamage] });
  if (f?.team) sets.push({ both: f.team.both, only: f.team.only });
  const scored = sets.filter((s) => s.both > 0);
  if (!scored.length) return { kind: "unknown", stronger: null };
  if (scored.some((s) => (s.both - Math.max(...s.only)) / s.both >= SAME)) return { kind: "twice", stronger: null };
  // not counted twice: which single one the saved figure equals (the first set that tells them apart)
  for (const s of scored) {
    if (Math.abs(s.only[0] - s.only[1]) / s.both >= SAME) return { kind: "stronger", stronger: s.only[0] > s.only[1] ? 0 : 1 };
  }
  return { kind: "neither", stronger: null };
}

/** What it does to the figures, in one sentence. Without figures it claims nothing it has not measured. */
export function conflictConsequence(c: BuffConflict, f?: ConflictFigures | null): string {
  const over = overcountOf(f);
  const unused = c.active ? "" : "It is not the build in use, so today's figures do not run it. ";
  const figures = c.active ? `${nameOf(c)}'s figures` : "A figure for that build";
  if (over.kind === "twice") return `${unused}${figures} count${c.active ? "" : "s"} both, so ${c.active ? "they read" : "it reads"} too high.`;
  if (over.kind === "stronger") return `${unused}The engine already counts only ${sideLabels(c)[over.stronger!]} when both are on, so no figure reads too high.`;
  if (over.kind === "neither") return `${unused}Neither one changes a figure on the best rotation or the team, so nothing reads too high.`;
  return `${unused}If the engine counts both, ${c.active ? `${nameOf(c)}'s figures read` : "its figure reads"} too high.`;
}

/** The CLI's warning and the assistant's note: the headline and what it does, as one line. */
export const conflictWarning = (c: BuffConflict, f?: ConflictFigures | null): string => `${conflictHeadline(c)} ${conflictConsequence(c, f)}`;

export interface FigureRow {
  /** "Both on, as saved" · "Only Schemata of Runes" · "Only Soliskin Vitality" */
  label: string;
  value: number;
  text: string;
  /** against the figure as saved; empty for the saved row */
  change: string;
}

function rows(c: BuffConflict, both: number, only: [number, number]): FigureRow[] {
  const [a, b] = sideLabels(c);
  return [
    { label: "Both on, as saved", value: both, text: whole(both), change: "" },
    { label: `Only ${a}`, value: only[0], text: whole(only[0]), change: againstSaved(only[0], both) },
    { label: `Only ${b}`, value: only[1], text: whole(only[1]), change: againstSaved(only[1], both) },
  ];
}

/** The three figures for the best rotation and for the team, as rows to print. */
export function figureRows(c: BuffConflict, f: ConflictFigures): { rotation: FigureRow[] | null; team: FigureRow[] | null } {
  return {
    rotation: f.rotation ? rows(c, f.rotation.both.avgDamage, [f.rotation.only[0].avgDamage, f.rotation.only[1].avgDamage]) : null,
    team: f.team ? rows(c, f.team.both, f.team.only) : null,
  };
}

/** What every figure in the notice is: said once, under the rows. */
export const FIGURE_BASIS = "Average damage per rotation, this app's engine, enemy level 100 at 20 % RES, no stacks on it.";
