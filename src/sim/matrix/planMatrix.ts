// Wuthering Tools+: Endstate Matrix planner — pure logic. The page (MatrixPlannerView.vue) collects the
// roster, has matrix.worker.ts score compositions with Riley's engine, and renders; everything that
// decides sits here so it can be unit-tested. Twin of wuwa-tools/matrix-plan/plan_matrix.py.
//
// The mode (see data/phase.json and the vault note): teams of three + a Power Circuit fight the phase's
// bosses in succession, score = damage dealt, later rounds multiply it; every Resonator has 1 Vigor
// (one fight), the designated healers 2; each boss resists its own element. So the plan is the largest
// set of teams the roster can field under Vigor, then the highest total, sent weakest → strongest.
import { allCharactersList } from "../../characters/characters";
import { ALIAS } from "../rankings/castMapper";
import phaseData from "./data/phase.json";

export interface Boss {
  stage: number;
  name: string;
  resists: string | null;
  mechanics: string[];
  round2: string | null;
}
export interface Circuit {
  id: CircuitId;
  name: string;
  short: string;
  effect: string;
}
export type CircuitId = "general" | "negstatus" | "echo" | "tunebreak";
export interface Phase {
  version: string;
  season: string;
  from: string;
  to: string;
  rounds: number[];
  teamBonusThreshold: number;
  scoreThresholds: number[];
  vigor: { default: number; two: string[]; emergency: Record<string, number> };
  matrixKits: string[];
  bosses: Boss[];
  circuits: Circuit[];
  sources: string[];
}
export const PHASE = phaseData as Phase;

/** One Resonator as the planner sees it (Riley's names: "Xuanling", "Aero Rover"). */
export interface RosterEntry {
  name: string;
  sequence: number;
  refinement: number;
  weapon: string | null;
  /** from the app's data (built in the calculator) rather than ticked as "owned" by hand */
  fromData: boolean;
}

export const ROVER_FORMS = ["Aero Rover", "Spectro Rover", "Havoc Rover", "Electro Rover"];
/** wuwa_calc's shipped solve states with the main DPS invested and the supports at S0R1 */
export const SOLVE_STATES = ["s0r1mdps", "s1r1mdps", "s2r1mdps", "s3r1mdps", "s6r1mdps", "s6r5mdps"] as const;
export type SolveState = (typeof SOLVE_STATES)[number];

/** app character key -> Riley's resonator name (castMapper's ALIAS inverted; the rest drop nothing) */
const RILEY_NAME: Record<string, string> = Object.fromEntries(Object.entries(ALIAS).map(([riley, app]) => [app, riley]));
for (const [riley, app] of Object.entries(ALIAS)) if (app.endsWith("female")) RILEY_NAME[app.replace(/female$/i, "male")] = riley;
RILEY_NAME.RoverAeroMale = "Aero Rover";
RILEY_NAME.RoverSpectroMale = "Spectro Rover";
RILEY_NAME.RoverHavocMale = "Havoc Rover";
RILEY_NAME.Roverelectromale = "Electro Rover";
export const rileyNameOf = (appKey: string): string => RILEY_NAME[appKey] ?? appKey;
export const appKeyOfRiley = (name: string): string => ALIAS[name] ?? name.replace(/ /g, "");

const ELEMENT_BY_APP_KEY = new Map((allCharactersList as Array<{ key: string; element: string }>).map((c) => [c.key, c.element]));
export const elementOf = (rileyName: string): string | null => ELEMENT_BY_APP_KEY.get(appKeyOfRiley(rileyName)) ?? null;

export function vigorOf(name: string, phase: Phase = PHASE): number {
  return (phase.vigor.two.includes(name) ? 2 : phase.vigor.default) + (phase.vigor.emergency[name] ?? 0);
}

/** The sequence node a chain entry belongs to (keys read "SequenceNode3…", "Sequence3…" or "S3…"). */
const nodeOf = (key: string): number => {
  const m = /^(?:SequenceNode|Sequence|S)([1-6])(?![0-9])/.exec(key);
  return m ? Number(m[1]) : 0;
};

/** The roster from the app's character store (keys → Riley names) plus names ticked by hand. */
export function rosterFrom(characters: Record<string, Record<string, unknown>>, extras: string[]): RosterEntry[] {
  const out = new Map<string, RosterEntry>();
  for (const [key, c] of Object.entries(characters ?? {})) {
    const name = rileyNameOf(key);
    let sequence = 0;
    for (const [k, v] of Object.entries((c.resonanceChains ?? {}) as Record<string, { isEnabled?: boolean }>)) if (v?.isEnabled) sequence = Math.max(sequence, nodeOf(k));
    const weapon = (c.weapon as string | undefined) ?? null;
    const refinement = weapon ? Number(((c.weapons as Record<string, { refinement?: string | number }> | undefined)?.[weapon]?.refinement) ?? 1) || 1 : 0;
    const prev = out.get(name);
    if (!prev || sequence > prev.sequence) out.set(name, { name, sequence, refinement, weapon, fromData: true });
  }
  for (const name of extras) if (!out.has(name)) out.set(name, { name, sequence: 0, refinement: 1, weapon: null, fromData: false });
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export interface Composition {
  dps: string;
  mates: [string, string];
}

/** Every team worth scoring: a DPS at or above the floor with two other owned Resonators — one Rover form at
 *  most, and at most one other DPS in a support slot (their kits are built to lead, not to buff). */
export function compositionsFor(roster: RosterEntry[], dpsFloor: number, options: { dpsNames?: string[]; supportNames?: string[] } = {}): Composition[] {
  const names = roster.map((r) => r.name);
  const dpsSet = new Set(options.dpsNames ?? names);
  const supportSet = new Set(options.supportNames ?? names);
  const dpsList = roster.filter((r) => r.sequence >= dpsFloor && dpsSet.has(r.name)).map((r) => r.name);
  const out: Composition[] = [];
  for (const dps of dpsList) {
    const pool = names.filter((n) => n !== dps && (supportSet.has(n) || dpsSet.has(n)));
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const a = pool[i], b = pool[j];
        if (ROVER_FORMS.includes(a) && ROVER_FORMS.includes(b)) continue;
        const aDps = dpsList.includes(a), bDps = dpsList.includes(b);
        if (aDps && bDps) continue;
        out.push({ dps, mates: [a, b] });
      }
    }
  }
  return out;
}

/** The solve states worth running for a DPS: below S6 the nearest sequence state (S4/S5 read as S3, the
 *  last one Riley ships); at S6 the weapon rank decides (R1 / R5), in between both for interpolation. */
export function statesFor(refinement: number, sequence = 6): SolveState[] {
  if (sequence < 6) return [`s${Math.min(Math.max(sequence, 0), 3)}r1mdps` as SolveState];
  if (refinement >= 5) return ["s6r5mdps"];
  if (refinement <= 1) return ["s6r1mdps"];
  return ["s6r1mdps", "s6r5mdps"];
}

/** What matrix.worker.ts returns for one composition and state. */
export interface EngineScore {
  dps: string;
  mates: [string, string];
  state: SolveState;
  order: string[];
  total: number;
  bySlot: Array<[string, number]>;
  casts: CastRow[];
  picks: Array<{ name: string; sequence: number; weapon: string; echo: string; mainstat: string }>;
}
export interface CastRow {
  member: string;
  name: string;
  avg: number;
  /** the button pressed (Basic / Heavy / Skill / Liberation / Echo / Intro / Outro) */
  cast: string | null;
  /** the damage type the circuits key on (wuwa_calc's Type1: Basic, Heavy, Skill, Liberation, Echo, Status, Break, Rupture, …) */
  type?: string | null;
  element?: string | null;
}

export const MATRIX_MULT = 1.25 / 1.2;
/** kits that inflict Tune Strain - Shifting (the Tune Break circuit's +30 % goes to them) */
export const STRAIN_KITS = new Set(["Lynae", "Mornye", "Denia", "Qingxiao", "Aemeath"]);
const STATUS_RE = /(Glacio Chafe|Glacio Bite|Fusion Burst|Electro Flare|Electro Rage|Aero Erosion|Spectro Frazzle|Havoc Bane)/i;

export interface CircuitEstimate {
  id: CircuitId;
  mult: number;
  all: Record<CircuitId, number>;
}

/** Which Power Circuit multiplies the team most, from the loop's cast mix. An estimate: the conditional circuits
 *  need their trigger up (statuses ~90 % of a fight, a Tune Break's 30 s window ~70 %, the Strain inflictor's
 *  15 s ~50 %); General is unconditional. */
export function circuitFor(casts: CastRow[], members: string[]): CircuitEstimate {
  const total = casts.reduce((s, c) => s + c.avg, 0) || 1;
  // eslint-disable-next-line no-unused-vars -- the parameter of a function type
  const share = (pred: (c: CastRow) => boolean): number => casts.filter(pred).reduce((s, c) => s + c.avg, 0) / total;
  // the damage TYPE is what the circuits key on; without it, fall back to the button pressed
  const kind = (c: CastRow, t: string): boolean => (c.type ? c.type === t : c.cast === t || c.name.startsWith(t));
  const heavy = share((c) => kind(c, "Heavy") || (!c.type && c.name.startsWith("Forte Heavy")));
  const echo = share((c) => kind(c, "Echo") || (!c.type && c.name.startsWith("Echo - ")));
  const skill = share((c) => kind(c, "Skill") || (!c.type && c.name.startsWith("Forte Skill")));
  const havoc = share((c) => (c.element ?? elementOf(c.member)) === "Havoc");
  const strainers = share((c) => STRAIN_KITS.has(c.member));
  const status = casts.some((c) => STATUS_RE.test(c.name));
  const breaks = casts.some((c) => c.name.startsWith("Tune Break")) || members.some((m) => STRAIN_KITS.has(m));
  const all: Record<CircuitId, number> = {
    general: 1.2 * (1 + 0.2 * heavy),
    negstatus: status ? 1 + 0.25 * 0.9 : 1,
    echo: 1 + 0.3 * echo + 0.2 * havoc + 0.2 * skill,
    tunebreak: (breaks ? 1 + 0.25 * 0.7 : 1) * (1 + 0.3 * 0.5 * strainers),
  };
  const id = (Object.keys(all) as CircuitId[]).reduce((best, k) => (all[k] > all[best] ? k : best), "general" as CircuitId);
  return { id, mult: all[id], all };
}

export interface Candidate {
  team: string[];
  dps: string;
  element: string | null;
  refinement: number;
  state: SolveState;
  /** the engine's team total at the chosen state (interpolated between R1 and R5 when the weapon is in between) */
  base: number;
  matrix: number;
  circuit: CircuitId;
  circuitMult: number;
  circuits: Record<CircuitId, number>;
  score: number;
  order: string[];
  avoid: string[];
  picks: EngineScore["picks"];
}

/** A scored composition → a candidate with the Matrix buff, its circuit and the bosses to avoid. */
export function finishCandidate(scores: Partial<Record<SolveState, EngineScore>>, roster: RosterEntry[], phase: Phase = PHASE): Candidate | null {
  const r1 = scores.s6r1mdps, r5 = scores.s6r5mdps;
  const any = r5 ?? r1 ?? scores.s3r1mdps ?? scores.s2r1mdps ?? scores.s1r1mdps ?? scores.s0r1mdps;
  if (!any) return null;
  const entry = roster.find((r) => r.name === any.dps);
  const refinement = Math.min(5, Math.max(1, entry?.refinement || 1));
  const t = (refinement - 1) / 4;
  const base = r1 && r5 ? r1.total + (r5.total - r1.total) * t : any.total;
  const chosen = r5 && (t >= 0.5 || !r1) ? r5 : (r1 ?? any);
  const dpsShare = (chosen.bySlot.find(([n]) => n === chosen.dps)?.[1] ?? 0) / Math.max(chosen.total, 1);
  const matrix = phase.matrixKits.includes(chosen.dps) ? 1 + (MATRIX_MULT - 1) * dpsShare : 1;
  const members = [chosen.dps, ...chosen.mates];
  const circuit = circuitFor(chosen.casts, members);
  const element = elementOf(chosen.dps);
  return {
    team: members,
    dps: chosen.dps,
    element,
    refinement,
    state: chosen.state,
    base: Math.round(base),
    matrix: Math.round(matrix * 1000) / 1000,
    circuit: circuit.id,
    circuitMult: Math.round(circuit.mult * 1000) / 1000,
    circuits: circuit.all,
    score: Math.round(base * matrix * circuit.mult),
    order: chosen.order,
    avoid: phase.bosses.filter((b) => b.resists && b.resists === element).map((b) => b.name),
    picks: chosen.picks,
  };
}

export interface Plan {
  count: number;
  total: number;
  /** weakest first — the order to send them in */
  teams: Candidate[];
}

/** The largest set of disjoint teams above `minScore` under the Vigor rule, then the highest total. `pinned`
 *  teams are kept whatever the numbers say (the user's picks) and the rest is filled in around them. */
export function bestPlan(cands: Candidate[], minScore: number, phase: Phase = PHASE, pinned: Candidate[] = []): Plan {
  const pinnedKeys = new Set(pinned.map((c) => c.team.join("|")));
  const good = cands.filter((c) => c.score >= minScore && !pinnedKeys.has(c.team.join("|"))).sort((a, b) => b.score - a.score);
  const names = [...new Set([...good, ...pinned].flatMap((c) => c.team))].sort();
  const idx = new Map(names.map((n, i) => [n, i]));
  const cap = names.map((n) => vigorOf(n, phase));
  const rover = names.map((n, i) => (ROVER_FORMS.includes(n) ? i : -1)).filter((i) => i >= 0);
  const start = names.map(() => 0);
  for (const c of pinned) for (const m of c.team) start[idx.get(m)!] += 1;
  const memo = new Map<string, [number, number, number[]]>();
  const solve = (i: number, used: number[]): [number, number, number[]] => {
    if (i === good.length) return [0, 0, []];
    const key = `${i}|${used.join(",")}`;
    const hit = memo.get(key);
    if (hit) return hit;
    let best = solve(i + 1, used);
    const c = good[i];
    const u = [...used];
    let ok = true;
    for (const m of c.team) {
      const j = idx.get(m)!;
      if (ROVER_FORMS.includes(m) && rover.some((k) => u[k] > 0)) { ok = false; break; }
      if (u[j] >= cap[j]) { ok = false; break; }
      u[j] += 1;
    }
    if (ok) {
      const [n, s, picks] = solve(i + 1, u);
      if (n + 1 > best[0] || (n + 1 === best[0] && s + c.score > best[1])) best = [n + 1, s + c.score, [...picks, i]];
    }
    memo.set(key, best);
    return best;
  };
  const [count, total, picks] = solve(0, start);
  const teams = [...pinned, ...picks.map((i) => good[i])].sort((a, b) => a.score - b.score);
  return { count: count + pinned.length, total: total + pinned.reduce((s, c) => s + c.score, 0), teams };
}

/** Vigor left per Resonator after a plan. */
export function vigorLeft(teams: Candidate[], roster: RosterEntry[], phase: Phase = PHASE): Map<string, number> {
  const left = new Map(roster.map((r) => [r.name, vigorOf(r.name, phase)]));
  for (const t of teams) for (const m of t.team) left.set(m, (left.get(m) ?? vigorOf(m, phase)) - 1);
  return left;
}

/** "Round 1 / Round 2 / Round 3+" labels for an ordered plan: the strongest third fights the multiplied rounds. */
export function roundLabels(count: number, phase: Phase = PHASE): string[] {
  const labels: string[] = [];
  for (let i = 0; i < count; i++) {
    const third = Math.floor((i * phase.rounds.length) / Math.max(count, 1));
    labels.push(third === 0 ? "Round 1" : third === 1 ? "Round 2" : "Round 3+");
  }
  return labels;
}
