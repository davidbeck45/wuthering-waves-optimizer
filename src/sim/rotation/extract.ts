// Wuthering Tools+ — the rotation view's extractor: a traced Riley run (Wave 0's RunLite) as what the cue card and
// the fight timeline draw. Pure, and the ONLY module of src/sim/rotation/ that reads RunLite's row / hit / held-buff
// fields — a layout change in the seam lands here and in its fixture test, nowhere else.
//
//   visits      each stretch one member is on field, split where the pressing member changes (one cue line per swap);
//               start / end in frames, the presses as chips, the checkpoints (R ready, Outro ready, Tune Break)
//   sections    Riley's opener + 3 loops (frames, damage)
//   lanes       per member: on-field windows and cast ticks
//   buffs       every held buff as windows on the fight clock ("sampled at presses"), by Team / Self / Enemy
//   gauges      per member: energy and concerto after each of their lines (his Energy column, ×100)
//   cumulative  the fight's damage curve off his hits; `killAt(hp)` reads it (extrapolated past the fight)
//
// Timing (why not Σ frames): a folded chain line ("Basic - Moonbow 123") carries the frame and frames of the press
// it shows — its LAST stage — so summing `frames` loses every earlier stage. A line's start is therefore its own
// `frame`, except a folded line starts where the press before it ended; a visit runs from its first line's start to
// the next visit's start, and the visits of a section add up to its seconds exactly.
import type { RunLite, RunRow } from "../engine/rileyRun";
import { sameToken, tokenOf, type CueToken } from "./tokens";

export interface CueChip extends CueToken {
  /** indices into `run.rows` this chip stands for */
  rows: number[];
  /** where its first press started, frames */
  frame: number;
}

export type CheckpointKind = "energy" | "concerto" | "tune";

export interface Checkpoint {
  kind: CheckpointKind;
  member: number;
  frame: number;
  /** the row that showed it (index into `run.rows`) */
  row: number;
  /** chip index of its visit it fired after; -1 = already there on entry */
  after: number;
}

export interface Visit {
  index: number;
  member: number;
  /** frames on the fight clock: [start, end) */
  start: number;
  end: number;
  seconds: number;
  /** the section (0 opener, 1–3 loops) holding most of it */
  section: number;
  /** how they came on field / left it */
  entry: "start" | "intro" | "swap";
  exit: "outro" | "swap" | "end";
  chips: CueChip[];
  checkpoints: Checkpoint[];
  /** the presses (indices into `run.rows`) */
  rows: number[];
  /** damage that landed while they were on field (every member's hits) */
  damage: number;
  /** the fight's last visit when it is only the next loop's first swap-in, cut by the fight's end */
  wrap?: true;
}

export interface SectionSpan {
  index: number;
  start: number;
  end: number;
  seconds: number;
  total: number;
}

export interface LaneTick {
  frame: number;
  row: number;
  /** a press (else a follow-up, an off-field hit, a status tick) */
  pressed: boolean;
}

export interface Lane {
  member: number;
  windows: Array<[number, number]>;
  ticks: LaneTick[];
  fieldFrames: number;
  /** of the fight's frames */
  share: number;
}

export type BuffGroup = "team" | "self" | "enemy";

export interface BuffTrack {
  key: string;
  group: BuffGroup;
  /** the member whose own buff it is (Self), -1 for Team / Enemy */
  owner: number;
  /** the name without its "xN" stack count */
  name: string;
  /** whose kit it came from, and their member index (-1: not one of the three) */
  source: string;
  sourceMember: number;
  /** union of [from, to) frame windows */
  windows: Array<[number, number]>;
  /** never timed and never missing from a sample once it appeared: shows as "always" */
  permanent: boolean;
  /** highest stack count seen ("x3"), 0 where it never stacked */
  maxStacks: number;
}

export interface GaugeSeries {
  member: number;
  /** [frame, value ×100] after each of their lines, in time order */
  energy: Array<[number, number]>;
  concerto: Array<[number, number]>;
  /** Liberation cost ×100 (0: no gate) and the concerto bar ×100 */
  maxEnergy: number;
  maxConcerto: number;
}

export interface KillTime {
  hp: number;
  seconds: number;
  /** past the fight's last hit: run on at the last loop's DPS */
  extrapolated: boolean;
}

export interface RotationModel {
  run: RunLite;
  fps: number;
  /** the fight's length, frames */
  frames: number;
  sections: SectionSpan[];
  visits: Visit[];
  lanes: Lane[];
  buffs: BuffTrack[];
  gauges: GaugeSeries[];
  /** hit frames and the running damage after each (same length) */
  cumulative: { frames: number[]; damage: number[] };
  /** Σ hits = DPS × seconds */
  fightTotal: number;
  /** the last loop's DPS (what a kill time past the fight runs on) */
  loopDps: number;
  killAt(hp: number): KillTime | null;
}

/** A line the player presses — the Outro too (the swap that plays it is a press). */
export const isPress = (row: RunRow): boolean => !row.triggered || row.cast === "Outro";

const STACKS_RE = / x(\d+)$/;

/** The sections as frame spans, off `sectionSeconds` (rounded to whole frames, the last one ending the fight). */
function sectionsOf(run: RunLite, frames: number): SectionSpan[] {
  const fps = run.units.fps || 60;
  const out: SectionSpan[] = [];
  let seconds = 0;
  let start = 0;
  run.sectionSeconds.forEach((s, i) => {
    seconds += s;
    const end = i === run.sectionSeconds.length - 1 ? frames : Math.round(seconds * fps);
    out.push({ index: i, start, end, seconds: s, total: run.sectionTotals[i] ?? 0 });
    start = end;
  });
  return out;
}

/** Merge [from, to) windows (sorted copy). */
export function union(windows: Array<[number, number]>): Array<[number, number]> {
  const sorted = windows.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: Array<[number, number]> = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** Frames of `windows` inside [from, to). */
export function covered(windows: Array<[number, number]>, from: number, to: number): number {
  let n = 0;
  for (const [a, b] of windows) n += Math.max(0, Math.min(b, to) - Math.max(a, from));
  return n;
}

/** Share of [from, to) a buff covers, in [0, 1]. */
export function uptime(track: Pick<BuffTrack, "windows">, from: number, to: number): number {
  return to > from ? Math.min(1, covered(track.windows, from, to) / (to - from)) : 0;
}

const inWindows = (windows: Array<[number, number]>, f: number): boolean => {
  let lo = 0, hi = windows.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [a, b] = windows[mid]!;
    if (f < a) hi = mid - 1;
    else if (f >= b) lo = mid + 1;
    else return true;
  }
  return false;
};

/** Share of the damage landing in [from, to) dealt while the buff was held — its owner's hits for a Self buff,
 *  everyone's for a Team or Enemy one. Null where nothing landed. */
export function damageCovered(model: Pick<RotationModel, "run">, track: Pick<BuffTrack, "windows" | "group" | "owner">, from = 0, to = Infinity): number | null {
  let all = 0, held = 0;
  for (const [at, , member, avg] of model.run.hits) {
    if (at < from || at >= to) continue;
    if (track.group === "self" && member !== track.owner) continue;
    all += avg;
    if (inWindows(track.windows, at)) held += avg;
  }
  return all > 0 ? held / all : null;
}

/** Back-to-back chips that read the same become one "×N" chip. */
function mergeChips(chips: CueChip[]): CueChip[] {
  const out: CueChip[] = [];
  for (const c of chips) {
    const last = out[out.length - 1];
    if (last && sameToken(last, c) && !last.suffix) {
      // the first merge turns "E" into "E×2"; the chip keeps a count, the suffix follows it
      last.count += c.count;
      last.rows.push(...c.rows);
      last.name = last.name === c.name ? last.name : `${last.name} · ${c.name}`;
      (last as CueChip & { merged?: number }).merged = ((last as CueChip & { merged?: number }).merged ?? 1) + 1;
      continue;
    }
    out.push({ ...c, rows: [...c.rows] });
  }
  for (const c of out as Array<CueChip & { merged?: number }>) {
    if (c.merged) {
      c.suffix = `×${c.merged}`;
      delete c.merged;
    }
  }
  return out;
}

export function extractRotation(run: RunLite): RotationModel {
  const fps = run.units.fps || 60;
  const frames = Math.round(run.seconds * fps);
  const rows = run.rows;
  const sections = sectionsOf(run, frames);

  /* ---- visits: the presses, split where the pressing member changes */
  const starts = new Map<number, number>();
  const visits: Visit[] = [];
  let prevEnd = 0;
  let open: (Omit<Visit, "end" | "seconds" | "section" | "exit" | "damage" | "chips" | "checkpoints"> & { raw: CueChip[] }) | null = null;
  const close = (end: number, exit: Visit["exit"]): void => {
    if (!open) return;
    const { raw, ...v } = open;
    visits.push({ ...v, end, seconds: (end - v.start) / fps, section: 0, exit, chips: mergeChips(raw), checkpoints: [], damage: 0 });
    open = null;
  };
  rows.forEach((row, i) => {
    if (!isPress(row) || row.member < 0) return;
    // a folded line starts where the press before it ended; anything else at its own frame
    const start = row.label ? Math.min(prevEnd, row.frame) : row.frame;
    starts.set(i, start);
    prevEnd = Math.max(prevEnd, row.frame + row.frames);
    const chip: CueChip = { ...tokenOf(row), rows: [i], frame: start };
    if (open && open.member === row.member) {
      open.rows.push(i);
      open.raw.push(chip);
      return;
    }
    const last = open?.raw[open.raw.length - 1];
    close(start, last?.kind === "outro" ? "outro" : "swap");
    open = { index: visits.length, member: row.member, start: visits.length ? start : 0, entry: !visits.length ? "start" : row.cast === "Intro" ? "intro" : "swap", rows: [i], raw: [chip] };
  });
  close(frames, "end");

  // the section each visit belongs to: the one holding most of it (a loop's first swap-in, played at the end of
  // the section before, goes with the loop it opens)
  for (const v of visits) {
    let best = 0, bestFrames = -1;
    for (const s of sections) {
      const n = Math.max(0, Math.min(v.end, s.end) - Math.max(v.start, s.start));
      if (n >= bestFrames) {
        best = s.index;
        bestFrames = n;
      }
    }
    v.section = best;
  }
  // the fight's last visit is only the next loop's swap-in when the loops open across a section boundary
  const lastSection = sections[sections.length - 1];
  const last = visits[visits.length - 1];
  if (last && lastSection && visits.length > 1 && last.start >= lastSection.start) {
    const head = visits.find((v) => v.section === lastSection.index);
    if (head && head !== last && head.start < lastSection.start && head.member === last.member) last.wrap = true;
  }

  /* ---- damage per visit, the cumulative curve */
  const cumFrames: number[] = [];
  const cumDamage: number[] = [];
  let running = 0;
  const hits = [...run.hits].sort((a, b) => a[0] - b[0]);
  let vi = 0;
  for (const [at, , , avg] of hits) {
    running += avg;
    cumFrames.push(at);
    cumDamage.push(running);
    while (vi < visits.length - 1 && at >= visits[vi]!.end) vi++;
    if (visits[vi]) visits[vi]!.damage += avg;
  }
  const fightTotal = running;

  /* ---- checkpoints: a member's energy / concerto reaching their bar, Tune Breaks */
  const maxEnergy = run.members.map((m) => m.maxEnergy);
  const maxConcerto = 100 * (run.units.concerto || 100);
  const energyFull: boolean[] = run.members.map(() => false);
  const concertoFull: boolean[] = run.members.map(() => false);
  const seen: boolean[] = run.members.map(() => false);
  const visitAt = (member: number, f: number): Visit | undefined =>
    visits.find((v) => v.member === member && f >= v.start && f < v.end) ?? visits.find((v) => v.member === member && v.start >= f);
  const place = (kind: CheckpointKind, member: number, i: number, f: number, onEntry: boolean): void => {
    const v = visitAt(member, f);
    if (!v) return;
    let after = -1;
    if (!onEntry && f >= v.start) {
      const own = v.chips.findIndex((c) => c.rows.includes(i));
      if (own >= 0) after = own;
      else for (let k = 0; k < v.chips.length; k++) if (v.chips[k]!.frame <= f) after = k;
    }
    v.checkpoints.push({ kind, member, frame: f, row: i, after });
  };
  rows.forEach((row, i) => {
    const m = row.member;
    if (row.cast === "Tune Break" && row.slot != null && run.slots[row.slot] === "Tune Break") {
      const onField = visits.find((v) => row.frame >= v.start && row.frame < v.end);
      if (onField) place("tune", onField.member, i, row.frame, false);
      return;
    }
    if (m < 0 || m >= run.members.length) return;
    const first = !seen[m];
    seen[m] = true;
    const f = starts.get(i) ?? row.frame;
    const onField = visits.some((v) => v.member === m && f >= v.start && f < v.end);
    if (maxEnergy[m]! > 0) {
      const full = row.energy >= maxEnergy[m]!;
      if (full && !energyFull[m]) place("energy", m, i, f, first || !onField);
      energyFull[m] = full;
    }
    const cFull = row.concerto >= maxConcerto;
    if (cFull && !concertoFull[m]) place("concerto", m, i, f, first || !onField);
    concertoFull[m] = cFull;
  });
  for (const v of visits) v.checkpoints.sort((a, b) => a.after - b.after || a.frame - b.frame);

  /* ---- lanes */
  const lanes: Lane[] = run.members.map((_, m) => {
    const windows = union(visits.filter((v) => v.member === m).map((v) => [v.start, v.end] as [number, number]));
    const ticks: LaneTick[] = [];
    rows.forEach((row, i) => {
      if (row.member !== m) return;
      ticks.push({ frame: starts.get(i) ?? row.frame, row: i, pressed: starts.has(i) });
    });
    const fieldFrames = covered(windows, 0, frames);
    return { member: m, windows, ticks, fieldFrames, share: frames ? fieldFrames / frames : 0 };
  });

  /* ---- buffs, sampled at presses: a timed buff covers [frame, frame + left), an untimed one carries forward to
   *      the next sample of its kind (every line for Team / Enemy, the owner's lines for Self) */
  const order = rows.map((_, i) => i).sort((a, b) => rows[a]!.frame - rows[b]!.frame || a - b);
  const memberOrder = run.members.map((_, m) => order.filter((i) => rows[i]!.member === m));
  const names = run.members.map((m) => m.name);
  interface Acc { group: BuffGroup; owner: number; name: string; source: string; windows: Array<[number, number]>; timed: boolean; maxStacks: number; first: number; missing: boolean }
  const acc = new Map<string, Acc>();
  const sampleSet = (group: BuffGroup, owner: number): number[] => (group === "self" ? memberOrder[owner] ?? [] : order);
  const groups: Array<[BuffGroup, keyof RunRow["held"]]> = [["team", "global"], ["self", "local"], ["enemy", "enemy"]];
  for (const [group, field] of groups) {
    // per key: its observations in sample order
    const obs = new Map<string, Map<number, number>>();
    for (const i of order) {
      const row = rows[i]!;
      if (group === "self" && row.member < 0) continue;
      for (const [b, left] of row.held[field]) {
        const [rawName, source] = run.buffs[b]!;
        const stacks = STACKS_RE.exec(rawName);
        const name = stacks ? rawName.slice(0, stacks.index) : rawName;
        const owner = group === "self" ? row.member : -1;
        const key = `${group}|${owner}|${name}|${source}`;
        let a = acc.get(key);
        if (!a) acc.set(key, (a = { group, owner, name, source, windows: [], timed: false, maxStacks: 0, first: row.frame, missing: false }));
        if (stacks) a.maxStacks = Math.max(a.maxStacks, Number(stacks[1]));
        if (left > 0) a.timed = true;
        let o = obs.get(key);
        if (!o) obs.set(key, (o = new Map()));
        o.set(i, Math.max(o.get(i) ?? 0, left));
      }
    }
    for (const [key, o] of obs) {
      const a = acc.get(key)!;
      const set = sampleSet(a.group, a.owner);
      let started = false;
      set.forEach((i, k) => {
        const left = o.get(i);
        const f = rows[i]!.frame;
        if (left === undefined) {
          if (started) a.missing = true;
          return;
        }
        started = true;
        const next = k + 1 < set.length ? rows[set[k + 1]!]!.frame : frames;
        a.windows.push([f, Math.min(frames, left > 0 ? f + left : Math.max(next, f + 1))]);
      });
    }
  }
  const buffs: BuffTrack[] = [...acc.entries()].map(([key, a]) => ({
    key,
    group: a.group,
    owner: a.owner,
    name: a.name,
    source: a.source,
    sourceMember: names.indexOf(a.source),
    windows: union(a.windows),
    permanent: !a.timed && !a.missing,
    maxStacks: a.maxStacks,
  }));

  /* ---- gauges */
  const gauges: GaugeSeries[] = run.members.map((_, m) => {
    const energy: Array<[number, number]> = [];
    const concerto: Array<[number, number]> = [];
    for (const i of memberOrder[m] ?? []) {
      const row = rows[i]!;
      const f = starts.get(i) ?? row.frame;
      energy.push([f, row.energy]);
      concerto.push([f, row.concerto]);
    }
    return { member: m, energy, concerto, maxEnergy: maxEnergy[m] ?? 0, maxConcerto };
  });

  const lastSpan = sections[sections.length - 1];
  const loopDps = lastSpan && lastSpan.seconds > 0 ? lastSpan.total / lastSpan.seconds : run.total;
  const killAt = (hp: number): KillTime | null => {
    if (!(hp > 0)) return null;
    if (hp <= fightTotal) {
      let lo = 0, hi = cumDamage.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cumDamage[mid]! >= hp) hi = mid;
        else lo = mid + 1;
      }
      return { hp, seconds: cumFrames[lo]! / fps, extrapolated: false };
    }
    if (!(loopDps > 0)) return null;
    return { hp, seconds: frames / fps + (hp - fightTotal) / loopDps, extrapolated: true };
  };

  return { run, fps, frames, sections, visits, lanes, buffs, gauges, cumulative: { frames: cumFrames, damage: cumDamage }, fightTotal, loopDps, killAt };
}

/** m:ss.cc of a frame count (truncated, as his Time column reads it). */
export function clockOf(frames: number, fps = 60): string {
  const cs = Math.floor((frames * 100) / fps);
  return `${Math.floor(cs / 6000)}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}

/** "26.6 s" style seconds. */
export const secondsText = (s: number, digits = 1): string => `${s.toFixed(digits)} s`;
