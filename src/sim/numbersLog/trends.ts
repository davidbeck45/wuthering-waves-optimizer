// Wuthering Tools+ numbers log — "Over time": the log's records read as one line per figure (a character's best
// rotation, a team's damage), for the small lines under "What moved in your numbers" and the larger chart a row opens.
// Pure, and free of the engine like compare.ts and view.ts (the pages load it).
//
// - A point per record, oldest first. A figure missing from a record (a team that could not be fielded then) is a gap,
//   never a zero.
// - A team's figure taken with the team-aware buffs switch the other way is another measurement: the line breaks there
//   (`seg`) and is never joined across it; the row's change is read inside the newest stretch only. A character's own
//   figure is scored solo, so the switch does not break it (compare.ts reads it the same way).
// - x is record order, not time: records come in bursts (three in one evening, then nothing for a week), and a time
//   axis would draw a burst as one dot. The dates are on every point.
// - The steps between two records with something known in between (the app build, an import or restore, a Sync, the
//   team's definition, a build) are `marks`, and their words come from compare.ts (`figureCause`, `causeText`): the
//   line and the comparison never name two causes for one change.
import { causeText, changeText, figureCause, type Namer } from "./compare";
import type { CharacterFigure, LogEntry, NumbersLog, TeamFigure } from "./log";
import { changedParts } from "./signature";
import { IMPORT_CARD_TEXT } from "./view";

export type TrendGroup = "saved" | "character" | "stock";

export interface TrendPoint {
  at: number;
  /** null: the figure is not in this record (a gap in the line) */
  value: number | null;
  /** the team-aware buffs switch in this record */
  autoTeamBuffs: boolean;
  /** stretch of the line: it moves on where the switch was flipped (teams only), so the line is not joined across it */
  seg: number;
}

export interface Trend {
  /** "c:<id>" or "t:<id>" */
  key: string;
  kind: "character" | "team";
  group: TrendGroup;
  id: string;
  /** a team's members (newest record's), a character: just them */
  members: string[];
  /** a team's own name (a character: null) */
  name: string | null;
  /** one per record of the log, oldest first */
  points: TrendPoint[];
  /** the first point of the newest stretch, and the newest point */
  first: { at: number; value: number; index: number };
  last: { at: number; value: number; index: number };
  /** (last − first) / first; null when first is 0 */
  change: number | null;
  delta: number;
  /** some two of its values differ */
  moved: boolean;
  /** the buffs switch was flipped somewhere along it (a team) */
  switched: boolean;
  /** in the newest record */
  current: boolean;
}

const groupOf = (t: TeamFigure): TrendGroup => (t.source === "yours" ? "saved" : "stock");

/** Every figure of the log as a line. A team is followed by its id (a stock team's id is its rotation's name). */
export function buildTrends(log: NumbersLog): Trend[] {
  const entries = log.entries;
  const n = entries.length;
  if (!n) return [];
  const chars = new Map<string, Array<CharacterFigure | undefined>>();
  const teams = new Map<string, Array<TeamFigure | undefined>>();
  entries.forEach((e, i) => {
    for (const c of e.characters) {
      let row = chars.get(c.id);
      if (!row) chars.set(c.id, (row = new Array(n)));
      row[i] = c;
    }
    for (const t of e.teams) {
      let row = teams.get(t.id);
      if (!row) teams.set(t.id, (row = new Array(n)));
      row[i] = t;
    }
  });
  const out: Trend[] = [];
  const make = (key: string, kind: Trend["kind"], id: string, row: Array<{ damage: number } | undefined>, meta: { group: TrendGroup; members: string[]; name: string | null }): void => {
    const points: TrendPoint[] = [];
    let seg = 0;
    let lastSwitch: boolean | null = null;
    let switched = false;
    for (let i = 0; i < n; i++) {
      const fig = row[i];
      const on = entries[i]!.autoTeamBuffs;
      if (fig && kind === "team") {
        if (lastSwitch !== null && lastSwitch !== on) {
          seg += 1;
          switched = true;
        }
        lastSwitch = on;
      }
      points.push({ at: entries[i]!.at, value: fig ? fig.damage : null, autoTeamBuffs: on, seg });
    }
    const present = points.map((p, index) => ({ ...p, index })).filter((p) => p.value !== null);
    if (!present.length) return;
    const lastP = present[present.length - 1]!;
    const firstP = present.find((p) => p.seg === lastP.seg)!;
    const first = { at: firstP.at, value: firstP.value!, index: firstP.index };
    const last = { at: lastP.at, value: lastP.value!, index: lastP.index };
    const moved = present.some((p) => p.value !== present[0]!.value);
    out.push({ key, kind, group: meta.group, id, members: meta.members, name: meta.name, points, first, last, change: first.value > 0 ? (last.value - first.value) / first.value : null, delta: last.value - first.value, moved, switched, current: !!row[n - 1] });
  };
  for (const [id, row] of chars) make(`c:${id}`, "character", id, row, { group: "character", members: [id], name: null });
  for (const [id, row] of teams) {
    const newest = [...row].reverse().find(Boolean)!;
    make(`t:${id}`, "team", id, row, { group: groupOf(newest), members: [...newest.members], name: newest.name });
  }
  return out;
}

/** biggest change first (a figure from nothing counts as the biggest), then the bigger absolute change */
export function byChange(a: Trend, b: Trend): number {
  const size = (t: Trend): number => (t.change === null ? (t.delta ? Number.POSITIVE_INFINITY : 0) : Math.abs(t.change));
  return size(b) - size(a) || Math.abs(b.delta) - Math.abs(a.delta) || a.key.localeCompare(b.key);
}

export interface TrendList {
  /** lines that moved, in the three groups, biggest change first */
  saved: Trend[];
  characters: Trend[];
  stock: Trend[];
  /** figures recorded at least twice with every value the same, per group (they fold into one line) */
  unmoved: { saved: number; characters: number; stock: number };
  /** figures in one record only so far (a character or team new in the log): no line yet, never "did not move" */
  single: { saved: number; characters: number; stock: number };
}

const recorded = (t: Trend): number => t.points.filter((p) => p.value !== null).length;

export function trendList(trends: readonly Trend[]): TrendList {
  const of = (g: TrendGroup): Trend[] => trends.filter((t) => t.group === g);
  const moved = (list: Trend[]): Trend[] => list.filter((t) => t.moved).sort(byChange);
  const still = (list: Trend[]): number => list.filter((t) => !t.moved && recorded(t) > 1).length;
  const once = (list: Trend[]): number => list.filter((t) => recorded(t) === 1).length;
  const saved = of("saved");
  const characters = of("character");
  const stock = of("stock");
  return { saved: moved(saved), characters: moved(characters), stock: moved(stock), unmoved: { saved: still(saved), characters: still(characters), stock: still(stock) }, single: { saved: once(saved), characters: once(characters), stock: once(stock) } };
}

/** The runs of a line to draw joined: consecutive points with a value and the same stretch. Indexes into `points`. */
export function lineRuns(points: readonly TrendPoint[]): number[][] {
  const runs: number[][] = [];
  let run: number[] = [];
  points.forEach((p, i) => {
    const prev = run.length ? points[run[run.length - 1]!]! : null;
    if (p.value === null || (prev && (prev.seg !== p.seg || run[run.length - 1] !== i - 1))) {
      if (run.length) runs.push(run);
      run = [];
    }
    if (p.value !== null) run.push(i);
  });
  if (run.length) runs.push(run);
  return runs;
}

// ---- the steps between two records, and their marks

export type MarkKind = "update" | "import" | "synced" | "team" | "build" | "switch";

/** a letter on the chart beside each mark (never colour alone), and its words in the legend */
export const MARK_LETTER: Record<MarkKind, string> = { update: "U", import: "I", synced: "S", team: "T", build: "B", switch: "X" };
export const MARK_LABEL: Record<MarkKind, string> = {
  update: "app update",
  import: "import or restore",
  synced: "Sync my teams",
  team: "team changed",
  build: "build changed",
  switch: "team-aware buffs switch flipped",
};

export interface TrendStep {
  /** the two points' indexes in `points` (a gap may sit between them) */
  from: number;
  to: number;
  at: number;
  before: number;
  after: number;
  change: string | null;
  marks: MarkKind[];
  /** what the records say happened, in compare.ts's words */
  text: string;
}

export const NO_CAUSE_TEXT = "No recorded cause.";
export const DID_NOT_MOVE_TEXT = "This figure did not move.";

/** Each step between two records that hold the figure, where it moved or something known happened. */
export function trendSteps(log: NumbersLog, trend: Trend, names: Namer): TrendStep[] {
  const entries = log.entries;
  const steps: TrendStep[] = [];
  const idx = trend.points.map((p, i) => (p.value === null ? -1 : i)).filter((i) => i >= 0);
  const figure = (e: LogEntry): CharacterFigure | TeamFigure | undefined => (trend.kind === "character" ? e.characters.find((c) => c.id === trend.id) : e.teams.find((t) => t.id === trend.id));
  for (let k = 1; k < idx.length; k++) {
    const i = idx[k - 1]!;
    const j = idx[k]!;
    const from = entries[i]!;
    const to = entries[j]!;
    const a = figure(from)!;
    const b = figure(to)!;
    const cause = figureCause(trend.kind === "character" ? { kind: "character", before: a as CharacterFigure, after: b as CharacterFigure } : { kind: "team", before: a as TeamFigure, after: b as TeamFigure }, from, to);
    const marks: MarkKind[] = [];
    if (from.build !== to.build) marks.push("update");
    const imported = entries.slice(i + 1, j + 1).some((e) => e.importedAt);
    if (imported) marks.push("import");
    if (trend.kind === "character") {
      if (changedParts((a as CharacterFigure).sig, (b as CharacterFigure).sig).length) marks.push("build");
    } else {
      const ta = a as TeamFigure;
      const tb = b as TeamFigure;
      if (ta.def !== tb.def && tb.synced && tb.synced !== ta.synced) marks.push("synced");
      else if (ta.def !== tb.def || ta.members.join("+") !== tb.members.join("+")) marks.push("team");
      // a member's build by compare.ts's own rule (teamCause): not a member swapped in, not the loop time a Sync wrote
      // into the members' saved loops — the mark and the words name one cause
      if (cause.kind === "members") marks.push("build");
      if (from.autoTeamBuffs !== to.autoTeamBuffs) marks.push("switch");
    }
    const moved = a.damage !== b.damage;
    if (!moved && !marks.length) continue;
    const words = [imported ? IMPORT_CARD_TEXT : "", cause.kind === "unknown" ? NO_CAUSE_TEXT : causeText(cause, names, imported, trend.kind), moved ? "" : DID_NOT_MOVE_TEXT].filter(Boolean);
    steps.push({ from: i, to: j, at: to.at, before: a.damage, after: b.damage, change: a.damage > 0 ? changeText((b.damage - a.damage) / a.damage) : null, marks, text: words.join(" ") });
  }
  return steps;
}

/** The account's best saved team now (the newest record's highest saved-team figure): /account's card draws its line. */
export function bestSavedTeam(trends: readonly Trend[]): Trend | null {
  return trends.filter((t) => t.group === "saved" && t.current).reduce<Trend | null>((best, t) => (!best || t.last.value > best.last.value ? t : best), null);
}

/** "up 12.4 % (+240,000) since 9 Nov" — the change in words, as a share of the first figure and as damage. */
/* eslint-disable-next-line no-unused-vars -- the parameters of function types */
export function trendChangeText(t: Trend, fmt: (n: number) => string, day: (at: number) => string): string {
  if (t.switched && t.first.index === t.last.index) return "nothing to compare with since the team-aware buffs switch was flipped";
  // one recorded value: nothing to compare it with yet, which is not "no change"
  if (t.first.index === t.last.index) return `first recorded ${day(t.first.at)}, nothing to compare with yet`;
  if (!t.delta) return `no change since ${day(t.first.at)}`;
  const p = t.change === null ? null : Math.abs(t.change * 100);
  const pct = p === null ? "" : `${p < 0.05 ? "under 0.1" : p.toFixed(1)} % of the first figure, `;
  const abs = `${t.delta > 0 ? "+" : "−"}${fmt(Math.abs(t.delta))} damage`;
  return `${t.delta > 0 ? "up" : "down"} ${pct}${abs} since ${day(t.first.at)}`;
}

/** how many of the log's records hold the figure (a gap is a record without it) */
export const recordedCount = (t: Trend): number => t.points.filter((p) => p.value !== null).length;

/** What a row says under its change, when the line is not one plain stretch. */
export function trendNote(t: Trend): string | null {
  const parts: string[] = [];
  if (t.switched)
    parts.push(
      t.first.index === t.last.index
        ? "The newest record was taken with the team-aware buffs switch the other way: another measurement, so it is not compared with the ones before."
        : "The team-aware buffs switch was flipped along the way: the line breaks there, and the change is read from the switch on.",
    );
  if (!t.current) parts.push("Not in the newest record.");
  return parts.length ? parts.join(" ") : null;
}
