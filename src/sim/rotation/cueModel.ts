// Wuthering Tools+ — the cue card: a traced run's visits (extract.ts) as an opener block and loop blocks, one line per
// swap, with the loop target and the play-mode sequence. Pure.
//
// Riley's loops open across a section boundary — the opener's last line is the first member's Intro, the loop goes
// on with their presses — so a loop block starts with that swap-in (extract.ts files a visit under the section that
// holds most of it) and the fight's very last swap-in, cut off by the end of the fight, is dropped (`wrap`).
// Identical loops fold into one block ("Loop ×3"); loops that differ get a block each.
import type { RotationModel, Visit } from "./extract";
import { tokenOf, tokenText } from "./tokens";

export interface CueBlock {
  key: string;
  /** "Opener", "Loop", "Loop 1", "Loops 2–3" */
  title: string;
  /** the sections it stands for (0 the opener) */
  sections: number[];
  /** how many times it repeats back to back (a folded loop) */
  repeat: number;
  /** the visits shown: the block's last section (the steadiest pass) */
  visits: Visit[];
  /** one pass, seconds (Σ visits) and damage */
  seconds: number;
  damage: number;
  /** the folded passes press the same buttons but differ in a cancel or a wait */
  varies: boolean;
}

export interface PlayStep {
  visit: Visit;
  /** the section it plays in (0 the opener, 1–3 the loops) and its position there */
  section: number;
  index: number;
  of: number;
  /** "Opener", "Loop 2 of 3" */
  label: string;
}

export interface CuePlan {
  blocks: CueBlock[];
  /** the loop the stopwatch races: the last block's pass, seconds */
  loopTarget: number;
  /** each section's seconds as the visits play it (a loop opens on its first swap-in) */
  passSeconds: number[];
  /** Riley's own figures: opener, each loop, the fight */
  sectionSeconds: number[];
  fightSeconds: number;
  /** the fight as Riley ran it (opener + every loop), visit by visit; play wraps to `loopStart` after the last */
  steps: PlayStep[];
  loopStart: number;
  /** the swap-in the fight ends on (not played), for the footnote */
  wrap: Visit | null;
}

/** A visit as the buttons it presses (cancels and wait lengths left out): what folds loops into one block. */
export const visitPresses = (model: Pick<RotationModel, "run">, v: Visit): string =>
  `${v.member}:${v.rows.map((i) => {
    const t = tokenOf(model.run.rows[i]!);
    return t.kind === "wait" ? "W" : tokenText(t);
  }).join(",")}`;
/** ...and as its chips read, cancels and waits included. */
export const visitSignature = (v: Visit): string => `${v.member}:${v.chips.map((c) => `${tokenText(c)}${c.cancel ? `~${c.cancel}` : ""}`).join(",")}`;

export function cuePlan(model: RotationModel): CuePlan {
  const played = model.visits.filter((v) => !v.wrap);
  const bySection = new Map<number, Visit[]>();
  for (const v of played) {
    const list = bySection.get(v.section);
    if (list) list.push(v);
    else bySection.set(v.section, [v]);
  }
  const sectionsPlayed = [...bySection.keys()].sort((a, b) => a - b);
  const passSeconds = model.sections.map((s) => (bySection.get(s.index) ?? []).reduce((n, v) => n + (v.end - v.start), 0) / model.fps);
  const make = (key: string, title: string, sections: number[], varies: boolean): CueBlock => {
    const shown = sections[sections.length - 1]!;
    const visits = bySection.get(shown) ?? [];
    return {
      key,
      title,
      sections,
      repeat: sections.length,
      visits,
      seconds: passSeconds[shown] ?? 0,
      damage: visits.reduce((n, v) => n + v.damage, 0),
      varies,
    };
  };

  const blocks: CueBlock[] = [];
  if (bySection.has(0)) blocks.push(make("opener", "Opener", [0], false));
  // the loops: back-to-back passes pressing the same buttons fold into one block
  const loops = sectionsPlayed.filter((s) => s > 0);
  const presses = (s: number): string => (bySection.get(s) ?? []).map((v) => visitPresses(model, v)).join("|");
  const exact = (s: number): string => (bySection.get(s) ?? []).map(visitSignature).join("|");
  const groups: number[][] = [];
  for (const s of loops) {
    const last = groups[groups.length - 1];
    if (last && presses(last[0]!) === presses(s)) last.push(s);
    else groups.push([s]);
  }
  for (const group of groups) {
    const first = group[0]!;
    const lastS = group[group.length - 1]!;
    const title = groups.length === 1 ? "Loop" : group.length === 1 ? `Loop ${first}` : `Loops ${first}–${lastS}`;
    blocks.push(make(`loop${first}`, title, group, new Set(group.map(exact)).size > 1));
  }

  const steps: PlayStep[] = [];
  let loopStart = 0;
  for (const s of sectionsPlayed) {
    if (s === loops[0]) loopStart = steps.length;
    const visits = bySection.get(s)!;
    const label = s === 0 ? "Opener" : loops.length > 1 ? `Loop ${s} of ${loops.length}` : "Loop";
    visits.forEach((visit, index) => steps.push({ visit, section: s, index, of: visits.length, label }));
  }
  const loopBlock = blocks[blocks.length - 1];
  return {
    blocks,
    loopTarget: loopBlock && loopBlock.key !== "opener" ? loopBlock.seconds : model.run.sectionSeconds[1] ?? model.run.seconds,
    passSeconds,
    sectionSeconds: model.run.sectionSeconds,
    fightSeconds: model.run.seconds,
    steps,
    loopStart,
    wrap: model.visits.find((v) => v.wrap) ?? null,
  };
}

/** The step after `i` in play order: the loop wraps back to its first swap. */
export const nextStep = (plan: Pick<CuePlan, "steps" | "loopStart">, i: number): number => (i + 1 < plan.steps.length ? i + 1 : plan.loopStart);
/** The step before `i` (never before the first). */
export const prevStep = (_plan: Pick<CuePlan, "steps" | "loopStart">, i: number): number => (i > 0 ? i - 1 : 0);

/** "1:48.5" / "26.6 s" */
export function durationText(seconds: number): string {
  // round to the tenth first, so 59.96 reads "1:00.0" (not "60.0 s") and 119.97 "2:00.0" (not "1:60.0")
  const tenths = Math.round(seconds * 10);
  if (tenths < 600) return `${(tenths / 10).toFixed(1)} s`;
  const m = Math.floor(tenths / 600);
  return `${m}:${((tenths - m * 600) / 10).toFixed(1).padStart(4, "0")}`;
}

/** Loops of `loop` seconds that fit after `opener` in `budget` seconds (a 2:00 practice timer, say). */
export const loopsIn = (budget: number, opener: number, loop: number): number => (loop > 0 ? Math.max(0, Math.floor((budget - opener) / loop)) : 0);
