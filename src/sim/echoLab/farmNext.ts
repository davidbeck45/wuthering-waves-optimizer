// Wuthering Tools+ Echo Lab — "Farm next": for every echo slot of every five-echo build, the echo to farm next
// (set, cost, main stat, under the slot rules and the build's set layout), what a fresh one levelled to +25 with
// random substats is expected to add on the character's best rotation over the echo there now, the chance it beats
// that echo, what one try costs (Ryan's levelling table), and — for the most promising slots, or on request — the
// same on the character's strongest fieldable team, exactly as /account scores a team (or no team figure, with why).
//
// The model, per slot:
//   1. Candidates: the slot's cost (the build's cost layout stays); slot 0 only another copy of the main echo; a
//      species no other slot wears; every Sonata with a farmable echo of that cost whose bonus selection keeps every
//      bonus the build has (Sonatas that give the same selection are one candidate); every main stat that cost rolls
//      (Ryan's `statsTable`). The swap rules apply as everywhere in the Echo Lab (Energy Regen, Healing Bonus).
//   2. Each candidate scored as a +25 echo with no substats (one engine run): the main stat and set alone.
//   3. The best one (and the runner-up when it is within half a percent) rolled out: each of the 13 substats at every
//      tier scored exactly on that echo (one engine run per line, with shortcuts that change no number: stats whose
//      top tiers add nothing, alone or five at a time, add nothing at any tier, and a stat whose lowest and highest
//      tiers lie on one straight line with "no line" is read off that line), every two stats that count scored together
//      once, then five distinct lines drawn uniformly at Kuro's tier odds and put together by the line model
//      (lineModel.ts, the re-roll advisor's and the Tuner plan's too), against the slot's echo as it is. One line is
//      enumerated exactly; five are read over seeded samples.
// Main-stat drop odds are not modelled (no released source gives them per cost): every figure is for an echo that
// drops with this main stat. Pure/async, worker-safe.
import { mainEchoesData } from "../../echoes/index";
import type { EchoResources } from "../../echoes/levelingCost";
import { getSetBonusEffects } from "../../echoes/sets";
import { statsTable } from "../../echoes/stats";
import { scoreTeamCandidate, teamCandidatesOf, type TeamRank } from "../myRankings/rankRoster";
import { createTeamScorer, type TeamScorer } from "../account/investPlan";
import { SUBSTAT_KEYS, type SubstatKey } from "../substats/substatWeights";
import {
  builtCharacterIds,
  echoLines,
  makePacer,
  perPointOf,
  prepareCharacter,
  scoreBuild,
  slotChecks,
  swapInto,
  weightedQuantile,
  withInventoryRecord,
  withLines,
  type LabCharacter,
  type LabSession,
  type Pacer,
  type RunControl,
  type SlotBlock,
  type SwapRules,
} from "./core";
import { stableKey } from "./fingerprint";
import { confirmDead, freshSeed, lineModel, lineOutcomes, lineTable, type LineModel, type LineScorer } from "./lineModel";
import { tuneToMaxResources } from "./tunerPlan";
import { FARM_ASSUMPTIONS, sortFarmRows } from "./farmView";

export { FARM_ASSUMPTIONS, sortFarmRows };


/** the best two candidates' main-stat-alone scores closer than this (relative) both get the full roll-out */
const RUNNER_UP = 0.005;
const PROBE_ID = "__echolab_farm_probe__";

export interface FarmTarget {
  cost: number;
  main: string;
  /** the Sonata to farm (the slot's own when it fits) */
  set: string | null;
  /** every Sonata with the same effect on the build (one candidate) */
  sets: string[];
  /** the slot feeds no set bonus: any Sonata in `sets` will do */
  anySet: boolean;
  /** bonuses this Sonata adds to the build (e.g. "Molten Rift 5 Set"), none when it keeps the build's */
  adds: string[];
  /** echoes of `set` at this cost the build does not wear in another slot (slot 0: the main echo) */
  species: string[];
}

export interface FarmAlternative {
  main: string;
  set: string | null;
  anySet: boolean;
  adds: string[];
  /** a fresh +25 echo with this main stat and no substats yet against the echo there now; null when blocked */
  mainOnlyGain: number | null;
  /** the full roll-out, when it was worked out (the best two) */
  expectedGain: number | null;
  pBeat: number | null;
  /** why the swap rules close it */
  blocked: SlotBlock | null;
}

export interface FarmTeam {
  teamId: string;
  teamName: string;
  characterIds: string[];
  /** the team's average damage per rotation as it is */
  base: number;
  /** expected relative gain of the team's damage per try (keeping the new echo when it helps the team) */
  expectedGain: number;
  expectedDamage: number;
  /** chance a try lifts the team's damage */
  pGain: number;
  /** the fresh echo with no substats yet, on the team */
  mainOnlyGain: number;
}

export interface FarmRow {
  /** `${characterId}|${slot}` */
  key: string;
  characterId: string;
  name: string;
  slot: number;
  rotationName: string;
  /** the character's average damage per rotation on the build as it is */
  base: number;
  current: { echoId: string | null; echo: string | null; set: string | null; cost: number; main: string | null; rank: number | null; lines: number };
  target: FarmTarget;
  /** the target has the set effect and main stat of the echo there now */
  sameAsCurrent: boolean;
  /** a fresh +25 echo of the target with no substats yet, against the echo there now */
  mainOnlyGain: number;
  /** expected relative gain per try on the best rotation, keeping the better echo */
  expectedGain: number;
  expectedDamage: number;
  /** expected change if you always took the new echo */
  expectedChange: number;
  /** chance a try beats the echo there now */
  pBeat: number;
  p10: number;
  p50: number;
  p90: number;
  method: Rollout["method"];
  /** one try: a fresh 5★ echo levelled from +0 to +25 */
  resources: EchoResources;
  /** tries per echo that beats yours (1 / pBeat), null when none can */
  triesPerWin: number | null;
  damagePerTuner: number;
  /** the other main stats (and Sonatas) the slot could take, best main-stat-alone first */
  alternatives: FarmAlternative[];
  team: FarmTeam | null;
  /** why there is no team figure (null with one, and while it is pending) */
  teamNote: string | null;
  /** a team figure can be worked out but was not yet (only the most promising slots get one up front) */
  teamPending: boolean;
}

export interface FarmNextResult {
  fingerprint: string;
  rows: FarmRow[];
  /** slots with no candidate the rules allow */
  skipped: Array<{ characterId: string; slot: number; reason: string }>;
  assumptions: readonly string[];
  /** team buffs from the team's real members (the switch the team figures were worked out under) */
  autoTeamBuffs: boolean;
  scorings: number;
  teamScorings: number;
  ms: number;
}

export interface FarmTeamResult {
  key: string;
  team: FarmTeam | null;
  teamNote: string | null;
  teamScorings: number;
}

export interface FarmOptions {
  /** substat lines a fresh echo rolls (default 5) */
  draw?: number;
  /** samples when the outcomes are too many to enumerate (default 20000; no engine call per sample) */
  samples?: number;
  rules?: SwapRules;
  /** slots that get a team figure up front, most promising first (default 8; 0 = none) */
  teamSlots?: number;
  /** team buffs from the team's real members (the app's default; the page passes its switch) */
  autoTeamBuffs?: boolean;
  /** only these characters (default every five-echo build) */
  characterIds?: string[];
}

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

// ── echo data: species by Sonata and cost, main stats by cost ──

const COST_OF_CLASS: Record<string, number> = { Calamity: 4, Overlord: 4, Elite: 3, Common: 1 };

let speciesIndex: Map<string, Map<number, string[]>> | null = null;
/** Every echo of a Sonata at a cost (Ryan's echo list), by name. */
export function speciesOf(set: string, cost: number): string[] {
  if (!speciesIndex) {
    speciesIndex = new Map();
    for (const echo of Object.values(mainEchoesData)) {
      const c = COST_OF_CLASS[echo.class];
      if (!c) continue;
      for (const s of echo.sets ?? []) {
        const byCost = speciesIndex.get(s) ?? new Map<number, string[]>();
        byCost.set(c, [...(byCost.get(c) ?? []), echo.key]);
        speciesIndex.set(s, byCost);
      }
    }
    for (const byCost of speciesIndex.values()) for (const list of byCost.values()) list.sort((a, b) => (mainEchoesData[a]?.name ?? a).localeCompare(mainEchoesData[b]?.name ?? b));
  }
  return speciesIndex.get(set)?.get(cost) ?? [];
}

/** Every Sonata that has an echo of this cost. */
function setsWithCost(cost: number): string[] {
  speciesOf("", cost); // build the index
  return [...(speciesIndex as Map<string, Map<number, string[]>>).entries()].filter(([, byCost]) => byCost.has(cost)).map(([s]) => s).sort();
}

/** The main stats an echo of this cost can roll (Ryan's `statsTable`). */
export const mainStatsOf = (cost: number): string[] => Object.keys(statsTable[cost] ?? {});

const activeBonuses = (sets: Array<string | null>): string[] => {
  const b = getSetBonusEffects(sets);
  return [b.setBonusOnePiece, b.setBonusOne, b.setBonusTwo].filter((x): x is string => Boolean(x));
};
const bonusKey = (sets: Array<string | null>): string => JSON.stringify(activeBonuses(sets).sort());

interface SetGroup {
  key: string;
  set: string | null;
  sets: string[];
  anySet: boolean;
  adds: string[];
  species: string[];
}

/**
 * The Sonata choices for a slot: every Sonata with an echo of the slot's cost the build does not wear elsewhere (slot
 * 0: the main echo's own Sonatas), grouped by the bonus selection it gives the build, keeping only the selections that
 * keep every bonus the build has (unless the rules allow breaking them). A pinned set bonus keeps the slot's Sonata.
 */
export function setGroupsFor(lab: LabCharacter, slot: number, rules: SwapRules = {}): SetGroup[] {
  const own = lab.slots[slot];
  if (!own?.cost) return [];
  const cost = own.cost;
  const sets0 = lab.slots.map((s) => s?.set ?? null);
  const before = activeBonuses(sets0);
  const keepSets = (rules.keepSetBonuses ?? true) && !lab.setPinned;
  const others = new Set(lab.slots.filter((s, j) => s && j !== slot).map((s) => s!.species));
  const nullKey = bonusKey(sets0.map((s, j) => (j === slot ? null : s)));
  const speciesFor = (set: string): string[] => {
    if (slot === 0) return own.species ? [own.species] : [];
    const list = speciesOf(set, cost).filter((sp) => !others.has(sp));
    // the slot's own echo proves its set has one, even when the echo list does not know it
    if (set === own.set && own.species && !others.has(own.species) && !list.includes(own.species)) list.unshift(own.species);
    if (set === own.set && own.species && list.includes(own.species)) return [own.species, ...list.filter((sp) => sp !== own.species)];
    return list;
  };
  let pool: string[];
  if (lab.setPinned) pool = own.set ? [own.set] : [];
  else if (slot === 0) pool = (own.species ? mainEchoesData[own.species]?.sets : null) ?? (own.set ? [own.set] : []);
  else pool = setsWithCost(cost);
  if (own.set && !pool.includes(own.set)) pool = [own.set, ...pool];
  const groups = new Map<string, SetGroup>();
  for (const set of pool) {
    const species = speciesFor(set);
    if (!species.length) continue;
    const next = [...sets0];
    next[slot] = set;
    const after = activeBonuses(next);
    if (keepSets && before.some((b) => !after.includes(b))) continue;
    const key = bonusKey(next);
    const group = groups.get(key) ?? { key, set: null, sets: [], anySet: key === nullKey, adds: after.filter((b) => !before.includes(b)), species: [] };
    group.sets.push(set);
    groups.set(key, group);
  }
  for (const g of groups.values()) {
    g.sets.sort();
    g.set = own.set && g.sets.includes(own.set) ? own.set : g.sets[0];
    g.species = g.set ? speciesFor(g.set) : [];
  }
  return [...groups.values()];
}

// ── the roll-out ──

export interface Rollout {
  expectedGain: number;
  expectedChange: number;
  pBeat: number;
  p10: number;
  p50: number;
  p90: number;
  method: "exact" | "modelled";
}

/**
 * A fresh echo's outcomes against `base`, the score of the build as it is: `draw` distinct lines (types uniform over the
 * thirteen, tiers by Kuro's odds) put together by the line model. One line is the engine's own score ("exact"), several
 * are the model's ("modelled"). Enumerated when there are no more outcomes than `samples`, else sampled with a seeded
 * PRNG (the same seed draws the same outcomes, so the own and team figures read one set of tries).
 */
export function rollout(model: LineModel, base: number, draw: number, samples: number, seed: string): Rollout {
  const k = Math.max(0, Math.min(Math.floor(draw), SUBSTAT_KEYS.length));
  const method = k <= 1 ? "exact" : "modelled";
  if (!(model.ctx > 0) || !(base > 0)) return { expectedGain: 0, expectedChange: 0, pBeat: 0, p10: 0, p50: 0, p90: 0, method };
  const pairs = lineOutcomes(model, base, SUBSTAT_KEYS, k, samples, seed);
  const total = pairs.reduce((s, [, w]) => s + w, 0) || 1;
  return {
    expectedGain: pairs.reduce((s, [g, w]) => s + Math.max(0, g) * w, 0) / total,
    expectedChange: pairs.reduce((s, [g, w]) => s + g * w, 0) / total,
    pBeat: pairs.reduce((s, [g, w]) => s + (g > 1e-12 ? w : 0), 0) / total,
    p10: weightedQuantile(pairs, 0.1),
    p50: weightedQuantile(pairs, 0.5),
    p90: weightedQuantile(pairs, 0.9),
    method,
  };
}

// ── one slot ──

interface Candidate {
  group: SetGroup;
  main: string;
  record: Record<string, any>;
  blocked: SlotBlock | null;
  /** the clone with the probe echo in the slot (set bonus and passives recomputed), and the inventory holding it */
  characters?: Record<string, any>;
  echoes?: any[];
  ctx?: number;
  rollout?: Rollout;
}

interface SlotPlan {
  row: FarmRow | null;
  reason: string | null;
  chosen: Candidate | null;
  seed: string;
}

const planKey = (id: string, slot: number, options: FarmOptions): string =>
  `farm|plan|${id}|${slot}|${stableKey({ draw: options.draw ?? 5, samples: options.samples ?? 20000, rules: options.rules ?? null })}`;

/** The candidates for a slot, each scored with no substats, the best one (or two) rolled out. Memoised per session. */
async function slotPlan(session: LabSession, lab: LabCharacter, slot: number, options: FarmOptions, pace: Pacer): Promise<SlotPlan> {
  const memoKey = planKey(lab.id, slot, options);
  const memo = session.memo.get(memoKey) as SlotPlan | undefined;
  if (memo) return memo;
  const plan = await computeSlotPlan(session, lab, slot, options, pace);
  session.memo.set(memoKey, plan);
  return plan;
}

async function computeSlotPlan(session: LabSession, lab: LabCharacter, slot: number, options: FarmOptions, pace: Pacer): Promise<SlotPlan> {
  const own = lab.slots[slot];
  const seed = freshSeed(lab.id, slot);
  if (!own?.cost) return { row: null, reason: "no echo in the slot", chosen: null, seed };
  const cost = own.cost;
  const rules = options.rules ?? {};
  const draw = Math.max(1, Math.min(5, Math.floor(options.draw ?? 5)));
  const samples = Math.max(1000, Math.floor(options.samples ?? 20000));
  const echoes = session.account.echoes;

  const candidates: Candidate[] = [];
  for (const group of setGroupsFor(lab, slot, rules)) {
    for (const main of mainStatsOf(cost)) {
      const record = withLines({ echoId: PROBE_ID, echo: group.species[0], type: cost, rank: 5, stat: main, echoSet: group.set }, []);
      const check = slotChecks(lab, record, rules).find((c) => c.slot === slot);
      if (!check) continue;
      candidates.push({ group, main, record, blocked: check.blocked });
    }
  }
  const open = candidates.filter((c) => !c.blocked);
  if (!open.length) return { row: null, reason: candidates.length ? "every echo it could take breaks a swap rule" : "no echo of this cost fits the build's sets", chosen: null, seed };

  // substats the build as it is gives nothing for (a per-point price of exactly 0 — the pass's prices, memoised per
  // character) are only *likely* to add nothing on a fresh echo: a threshold the echo there now helps the build over
  // can make one count once that echo is gone (Shorekeeper's Energy Regen on David's export, verify 2026-11-02). So
  // each roll-out confirms them on its own echo (`confirmDead`), and every main stat is scored.
  const likelyDead: SubstatKey[] = [];
  for (const key of SUBSTAT_KEYS) if (Math.abs(await perPointOf(session, lab, key)) <= 1e-15) likelyDead.push(key);
  for (const c of open) {
    c.echoes = withInventoryRecord(echoes, c.record);
    c.characters = swapInto(session, lab, c.echoes, PROBE_ID, slot);
    c.ctx = await scoreBuild(session, lab, c.characters, c.echoes);
    await pace();
  }
  open.sort((a, b) => (b.ctx ?? 0) - (a.ctx ?? 0) || a.main.localeCompare(b.main) || String(a.group.set).localeCompare(String(b.group.set)));
  const worked = open.filter((c, i) => i === 0 || (i === 1 && (c.ctx ?? 0) >= (open[0].ctx ?? 0) * (1 - RUNNER_UP)));
  for (const c of worked) {
    const chars = c.characters as Record<string, any>;
    const scoreLines: LineScorer = async (lines) => {
      const inv = withInventoryRecord(echoes, withLines(c.record, lines));
      const avg = await scoreBuild(session, lab, chars, inv);
      await pace();
      return avg;
    };
    const dead = await confirmDead(c.ctx ?? 0, likelyDead, scoreLines);
    const table = await lineTable(c.ctx ?? 0, (key, value) => scoreLines([{ key, value }]), dead);
    const model = await lineModel(c.ctx ?? 0, table, scoreLines, draw);
    c.rollout = rollout(model, lab.base, draw, samples, seed);
  }
  const chosen = [...worked].sort((a, b) => (b.rollout?.expectedGain ?? 0) - (a.rollout?.expectedGain ?? 0) || (b.ctx ?? 0) - (a.ctx ?? 0))[0];
  const r = chosen.rollout as Rollout;
  const resources = tuneToMaxResources(0);
  const expectedDamage = r.expectedGain * lab.base;
  const currentMain = own.record?.stat ?? null;
  const row: FarmRow = {
    key: `${lab.id}|${slot}`,
    characterId: lab.id,
    name: lab.name,
    slot,
    rotationName: lab.rotationName,
    base: lab.base,
    current: {
      echoId: own.echoId,
      echo: own.species,
      set: own.set,
      cost,
      main: currentMain,
      rank: own.record?.rank != null ? Number(own.record.rank) : null,
      lines: echoLines(own.record).length,
    },
    target: { cost, main: chosen.main, set: chosen.group.set, sets: chosen.group.sets, anySet: chosen.group.anySet, adds: chosen.group.adds, species: chosen.group.species },
    sameAsCurrent: chosen.main === currentMain && (own.set === null || chosen.group.sets.includes(own.set)),
    mainOnlyGain: (chosen.ctx ?? 0) / lab.base - 1,
    expectedGain: r.expectedGain,
    expectedDamage,
    expectedChange: r.expectedChange,
    pBeat: r.pBeat,
    p10: r.p10,
    p50: r.p50,
    p90: r.p90,
    method: r.method,
    resources,
    triesPerWin: r.pBeat > 0 ? 1 / r.pBeat : null,
    damagePerTuner: resources.tuners > 0 ? expectedDamage / resources.tuners : 0,
    alternatives: candidates
      .filter((c) => c !== chosen)
      .map((c) => ({
        main: c.main,
        set: c.group.set,
        anySet: c.group.anySet,
        adds: c.group.adds,
        mainOnlyGain: c.ctx != null ? c.ctx / lab.base - 1 : null,
        expectedGain: c.rollout?.expectedGain ?? null,
        pBeat: c.rollout?.pBeat ?? null,
        blocked: c.blocked,
      }))
      .sort((a, b) => Number(a.blocked !== null) - Number(b.blocked !== null) || (b.mainOnlyGain ?? -Infinity) - (a.mainOnlyGain ?? -Infinity) || a.main.localeCompare(b.main)),
    team: null,
    teamNote: null,
    teamPending: false,
  };
  return { row, reason: null, chosen, seed };
}

// ── teams (the /account rules) ──

export interface TeamSide {
  scorer: TeamScorer;
  auto: boolean;
}

/** Every team the roster can field, scored once per session (the rankings' own scorer), behind /account's team scorer. */
export async function teamSideOf(session: LabSession, auto: boolean, pace: Pacer, counter: { n: number }): Promise<TeamSide> {
  const key = `farm|teams|${auto}`;
  const memo = session.memo.get(key) as TeamSide | undefined;
  if (memo) return memo;
  const { characters, echoes, teams } = session.account;
  const { candidates } = await teamCandidatesOf(characters, teams ?? []);
  const ranks: TeamRank[] = [];
  for (let i = 0; i < candidates.length; i++) {
    try {
      counter.n += 1;
      ranks.push(await scoreTeamCandidate(candidates[i], characters, echoes, { autoTeamBuffs: auto, enemy: session.enemy }));
    } catch {
      /* a team the engine can't run is not a candidate, as in the rankings */
    }
    await pace({ phase: "teams", done: i + 1, total: candidates.length });
  }
  const scorer = await createTeamScorer(characters, echoes, teams ?? [], ranks, { autoTeamBuffs: auto, enemy: session.enemy, errors: [] });
  const side = { scorer, auto };
  session.memo.set(key, side);
  return side;
}

/** Why a character's row can't have a team figure (null: it can), and their share of that team's damage. */
async function teamBlock(side: TeamSide, characterId: string): Promise<{ note: string | null; share: number }> {
  const ctx = await side.scorer.teamFor(characterId);
  if (!ctx) return { note: await side.scorer.noTeamNote(characterId), share: 0 };
  const block = await side.scorer.buildBlock(ctx, characterId);
  if (block) return { note: block, share: 0 };
  if (!(ctx.base > 0)) return { note: "the team scores no damage", share: 0 };
  const at = ctx.rank.characterIds.indexOf(characterId);
  const total = ctx.rank.perSlot.reduce((a, b) => a + b, 0);
  return { note: null, share: at >= 0 && total > 0 ? ctx.rank.perSlot[at] / total : 0 };
}

/** The slot's fresh echo on the character's strongest fieldable team: the same line model, every line a team re-score. */
async function teamFigure(session: LabSession, side: TeamSide, lab: LabCharacter, plan: SlotPlan, options: FarmOptions, pace: Pacer, counter: { n: number }): Promise<{ team: FarmTeam | null; note: string | null }> {
  const ctx = await side.scorer.teamFor(lab.id);
  if (!ctx) return { team: null, note: await side.scorer.noTeamNote(lab.id) };
  const block = await side.scorer.buildBlock(ctx, lab.id);
  if (block) return { team: null, note: block };
  if (!(ctx.base > 0)) return { team: null, note: "the team scores no damage" };
  const chosen = plan.chosen;
  if (!chosen?.characters) return { team: null, note: "nothing to farm in this slot" };
  const chars = chosen.characters;
  const echoes = session.account.echoes;
  const score = async (inv: any[]): Promise<number> => {
    counter.n += 1;
    const scored = await scoreTeamCandidate(ctx.candidate, chars, inv, { autoTeamBuffs: side.auto, enemy: session.enemy });
    await pace();
    return scored.avgDamage;
  };
  try {
    const teamCtx = await score(withInventoryRecord(echoes, chosen.record));
    const scoreLines: LineScorer = (lines) => score(withInventoryRecord(echoes, withLines(chosen.record, lines)));
    const table = await lineTable(teamCtx, (key, value) => scoreLines([{ key, value }]));
    const draw = Math.max(1, Math.min(5, Math.floor(options.draw ?? 5)));
    const samples = Math.max(1000, Math.floor(options.samples ?? 20000));
    const r = rollout(await lineModel(teamCtx, table, scoreLines, draw), ctx.base, draw, samples, plan.seed);
    return {
      team: {
        teamId: ctx.rank.id,
        teamName: ctx.rank.name,
        characterIds: ctx.rank.characterIds,
        base: ctx.base,
        expectedGain: r.expectedGain,
        expectedDamage: r.expectedGain * ctx.base,
        pGain: r.pBeat,
        mainOnlyGain: teamCtx / ctx.base - 1,
      },
      note: null,
    };
  } catch (err) {
    return { team: null, note: `the team could not be scored (${err instanceof Error ? err.message : String(err)})` };
  }
}

async function labsOf(session: LabSession, options: FarmOptions, pace: Pacer): Promise<LabCharacter[]> {
  const ids = options.characterIds ?? builtCharacterIds(session.account);
  const labs: LabCharacter[] = [];
  for (let i = 0; i < ids.length; i++) {
    const lab = await prepareCharacter(session, ids[i], pace);
    if (lab?.complete) labs.push(lab);
    await pace({ phase: "characters", done: i + 1, total: ids.length, label: lab?.name ?? ids[i] });
  }
  return labs;
}

/** Every slot of every five-echo build: what to farm, what it is expected to add, and its odds — best first. */
export async function farmNext(session: LabSession, options: FarmOptions = {}, control: RunControl = {}): Promise<FarmNextResult> {
  const started = now();
  const startScorings = session.scorings;
  const pace = makePacer(control);
  const labs = await labsOf(session, options, pace);
  const total = labs.length * 5;
  const rows: FarmRow[] = [];
  const plans = new Map<string, { lab: LabCharacter; plan: SlotPlan }>();
  const skipped: FarmNextResult["skipped"] = [];
  let done = 0;
  for (const lab of labs) {
    for (let slot = 0; slot < 5; slot++) {
      const plan = await slotPlan(session, lab, slot, options, pace);
      if (plan.row) {
        const row = { ...plan.row };
        rows.push(row);
        plans.set(row.key, { lab, plan });
      } else skipped.push({ characterId: lab.id, slot, reason: plan.reason ?? "nothing to farm" });
      done += 1;
      await pace({ phase: "farm", done, total, label: lab.name });
    }
  }

  // team figures: the most promising slots up front — own expected gain × the character's share of their team's damage,
  // which picked 6 of the true top 8 on David's export (2026-11-02; every team figure there takes ~25× the engine runs
  // of the whole list) — the rest on request
  const counter = { n: 0 };
  const want = Math.max(0, Math.floor(options.teamSlots ?? 8));
  if (rows.length) {
    const side = await teamSideOf(session, options.autoTeamBuffs ?? true, pace, counter);
    const eligible: Array<{ row: FarmRow; proxy: number }> = [];
    const blocks = new Map<string, { note: string | null; share: number }>();
    for (const row of rows) {
      const b = blocks.get(row.characterId) ?? (await teamBlock(side, row.characterId));
      blocks.set(row.characterId, b);
      if (b.note) row.teamNote = b.note;
      else eligible.push({ row, proxy: row.expectedGain * b.share });
    }
    eligible.sort((a, b) => b.proxy - a.proxy || a.row.key.localeCompare(b.row.key));
    const teamTotal = Math.min(want, eligible.length);
    for (let i = 0; i < eligible.length; i++) {
      const { row } = eligible[i];
      if (i >= want) {
        row.teamPending = true;
        continue;
      }
      const { lab, plan } = plans.get(row.key)!;
      await pace({ phase: "team", done: i, total: teamTotal, label: lab.name });
      const { team, note } = await teamFigure(session, side, lab, plan, options, pace, counter);
      row.team = team;
      row.teamNote = note;
    }
  }

  return {
    fingerprint: session.fingerprint,
    rows: sortFarmRows(rows, "team"),
    skipped,
    assumptions: FARM_ASSUMPTIONS,
    autoTeamBuffs: options.autoTeamBuffs ?? true,
    scorings: session.scorings - startScorings,
    teamScorings: counter.n,
    ms: now() - started,
  };
}

/** One slot's team figure, on request (a row the first pass left pending). Reuses the session's slot plan. */
export async function farmTeam(session: LabSession, characterId: string, slot: number, options: FarmOptions = {}, control: RunControl = {}): Promise<FarmTeamResult> {
  const pace = makePacer(control);
  const key = `${characterId}|${slot}`;
  const counter = { n: 0 };
  const lab = await prepareCharacter(session, characterId, pace);
  if (!lab?.complete) return { key, team: null, teamNote: "this build has no five echoes to farm for", teamScorings: 0 };
  const plan = await slotPlan(session, lab, slot, options, pace);
  if (!plan.row) return { key, team: null, teamNote: plan.reason ?? "nothing to farm in this slot", teamScorings: 0 };
  const side = await teamSideOf(session, options.autoTeamBuffs ?? true, pace, counter);
  const { team, note } = await teamFigure(session, side, lab, plan, options, pace, counter);
  return { key, team, teamNote: note, teamScorings: counter.n };
}
