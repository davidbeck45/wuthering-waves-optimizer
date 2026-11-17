// Wuthering Tools+ — "What each level is worth": what every level-up a character has left adds to damage, and what
// it costs. Two views of the same steps:
//   rows   each track on its own, taken from today's levels to its top ("Resonance Liberation 6 → 10")
//   path   "level in this order": the best next step is taken, the build is scored again at the new levels, and so
//          on to the top. Level-ups multiply each other, so a step's worth depends on what was levelled before it;
//          the path carries the running gain and the running cost.
// Gains come from the engine path the roster ranking uses: the character's best rotation (the ranking's pick) run
// through `calcCharacterRotationDamage` at the ranking enemy, as `scoreRotation` does, on a copy of the record with
// the three level fields changed (levelSteps.ts `withLevels`); and the strongest team the character can field, re-run
// through the invest plan's team scorer (`createTeamScorer` → `scoreTeamCandidate`), which keeps its rule "team
// figures are exact or absent". Level and Forte levels are shared by every build of a character, so their team
// figure holds when the team runs another build; a weapon level belongs to a build, so the weapon step has no team
// figure then. Healing and shields ride along where the rotation has any: they are not damage, and a healer's rows
// would otherwise read as if their levels did nothing.
//
// Pure/async (no Vue, no stores); time-sliced like the invest plan (`slicer`), and cancellable.
import { calcCharacterRotationDamage, type CharacterRotationInput } from "../../calculator/characterRotation";
import { createTeamScorer, slicer, type TeamContext, type TeamImpact } from "../account/investPlan";
import { characterDisplayName, characterShortName, weaponDisplayName } from "../display/names";
import { savedProgressOf, type MaterialsData } from "../materials/costToMax";
import { RANKING_ENEMY, scoreTeamCandidate, teamCandidatesOf, type CharacterRank, type RotationSource, type TeamRank } from "../myRankings/rankRoster";
import { isForteTrack, levelsToday, nextStep, stateFrom, stateText, stepsLeft, sumCosts, topState, trackLabel, trackToTop, TRACKS, withLevels, type LevelCost, type LevelState, type LevelStepDef, type LevelsToday, type TrackKey } from "./levelSteps";

/** one run of the rotation: average damage, and the healing and shield it gives */
export interface Score {
  damage: number;
  healing: number;
  shield: number;
}

export interface Figure {
  base: number;
  after: number;
  /** relative: 0.031 = +3.1 % */
  gain: number;
}

export interface StepWorth {
  /** the character's own average damage per rotation on their best rotation; null when nothing could be scored */
  own: Figure | null;
  /** the rotation's healing / shield, when it has any */
  healing: Figure | null;
  shield: Figure | null;
  team: TeamImpact | null;
  /** why this step has no team figure (null with one) */
  teamNote: string | null;
  /** nothing the engine scores moves with this step on this rotation: no damage, healing or shield, no team change */
  inert: boolean;
}

export interface LevelRow extends LevelStepDef, StepWorth {}

export interface PathStep extends LevelRow {
  /** 1 = the first step to take */
  index: number;
  /** from the starting levels through this step */
  running: { gain: number | null; teamGain: number | null; healingGain: number | null; shieldGain: number | null; cost: LevelCost };
}

export type PathState = "complete" | "capped" | "cancelled" | "none";

export interface LevelPlan {
  characterId: string;
  name: string;
  /** where the steps start: the calculator's saved levels, level 1 across the board, or levels the caller gave */
  from: "saved" | "scratch" | "custom";
  table: { gameVersion: string; fetched: string };
  /** null when the cost table has no entry for the character (a kit newer than the table): nothing else is filled */
  today: LevelsToday | null;
  /** "Level 80+ · weapon level 90 · Forte skills 6 / 10 / 10 / 8 / 1" */
  startText: string;
  /** every track is at its top */
  done: boolean;
  rotation: { name: string; source: RotationSource } | null;
  /** why no gain could be scored (the rows then carry costs only): no weapon, no rotation, a rotation with no damage */
  noGain: string | null;
  /** the rotation at the starting levels */
  base: Score | null;
  team: { id: string; name: string; characterIds: string[]; base: number } | null;
  /** why there is no team figure at all */
  teamNote: string | null;
  /** the team runs another saved build of the character: what that means for these figures */
  buildNote: string | null;
  /** what the rows and the path are ordered by */
  basis: Basis;
  /** one row per track with something left, the biggest gain on `basis` first; inert rows last */
  rows: LevelRow[];
  /** how each path step was picked: the most gain per Shell Credit ("value"), or the biggest gain */
  pathOrder: "value" | "gain";
  path: PathStep[];
  pathState: PathState;
  /** steps the path leaves out because they move nothing on this rotation, as whole tracks */
  inert: LevelRow[];
  /** every step taken: all that is left */
  everything: { cost: LevelCost; own: Figure | null; healing: Figure | null; shield: Figure | null; team: TeamImpact | null } | null;
  errors: string[];
}

export interface LevelPlanInput {
  characterId: string;
  characters: Record<string, any>;
  inventoryEchoes: any[];
  teams: any[];
  /** the roster ranking's row for the character (its best rotation), and the ranking's teams */
  rank: Pick<CharacterRank, "best" | "bestRotation"> | null;
  rankingTeams: TeamRank[];
  materials: MaterialsData;
}

export interface LevelPlanOptions {
  /** "saved" (default), "scratch" = level 1 across the board, or the levels to start from by track ("what if I stood here") */
  from?: "saved" | "scratch" | Partial<Record<TrackKey, string | number>>;
  /** the ranking id of the team to measure on, instead of the strongest one the character can field */
  teamId?: string;
  autoTeamBuffs?: boolean;
  /** work out the path too (default true) */
  path?: boolean;
  /** how the path picks its next step: "value" (default) = the most gain per Shell Credit, "gain" = the biggest gain */
  pathOrder?: "value" | "gain";
  /** stop the path after this many steps (default: no cap in practice, 80) */
  maxPathSteps?: number;
  /** give the browser a frame every ~12 ms of engine work; default true */
  yieldToUi?: boolean;
  signal?: { cancelled: boolean };
  /** called with the plan so far: once the rows are in, then after each path step */
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  onProgress?: (plan: LevelPlan, progress: { done: number; total: number }) => void;
}

/** a change this small is the engine's rounding, not a level */
const SAME = 1e-12;

const figure = (base: number, after: number): Figure => ({ base, after, gain: base > 0 ? after / base - 1 : 0 });
const moved = (f: Figure | null): boolean => !!f && Math.abs(f.after - f.base) > SAME * Math.max(1, Math.abs(f.base));

/** What the steps are ordered by: the team's damage where the character has a team figure (a support's own damage
 *  says little), their own damage without one, and healing or shields for a character whose rotation heals or shields
 *  more than it hits (their levels buy healing; the team's damage hardly moves). */
export type Basis = "team" | "own" | "healing" | "shield";

export const BASIS_WORDS: Record<Basis, string> = {
  team: "team damage",
  own: "own damage",
  healing: "healing",
  shield: "shield strength",
};

/** The basis for a rotation and whether a team could be scored. */
export function basisOf(base: Score | null, hasTeam: boolean): Basis {
  if (base && base.healing + base.shield > base.damage) return base.shield > base.healing ? "shield" : "healing";
  return hasTeam ? "team" : "own";
}

/** A row's gain on the basis, null when it has no figure there (a weapon step the team's build does not carry). */
export function basisGain(row: Pick<LevelRow, "own" | "healing" | "shield" | "team">, basis: Basis): number | null {
  if (basis === "team") return row.team ? row.team.gain : null;
  if (basis === "healing") return row.healing ? row.healing.gain : 0;
  if (basis === "shield") return row.shield ? row.shield.gain : 0;
  return row.own ? row.own.gain : null;
}

/**
 * Best first on `basis`: rows with a figure there before rows without, then the other figures (team, own, healing),
 * then the tracks' own order, so the order never jitters. Inert rows last. `perCredit` ranks by the gain each Shell
 * Credit buys (the path: a ten-level weapon step and one cheap Forte level are only comparable per cost).
 */
// eslint-disable-next-line no-unused-vars -- the parameters of a function type
export function compareWorth(basis: Basis, perCredit = false): (a: LevelRow, b: LevelRow) => number {
  const per = (gain: number, row: LevelRow): number => (perCredit ? (row.cost.credits > 0 ? gain / row.cost.credits : gain > 0 ? Infinity : 0) : gain);
  const others: Basis[] = (["team", "own", "healing", "shield"] as Basis[]).filter((b) => b !== basis);
  return (a, b) => {
    if (a.inert !== b.inert) return a.inert ? 1 : -1;
    const ga = basisGain(a, basis);
    const gb = basisGain(b, basis);
    if (ga != null && gb == null) return -1;
    if (ga == null && gb != null) return 1;
    if (ga != null && gb != null) {
      const d = per(gb, b) - per(ga, a);
      if (d) return d;
    }
    for (const other of others) {
      const d = per(basisGain(b, other) ?? 0, b) - per(basisGain(a, other) ?? 0, a);
      if (d) return d;
    }
    return TRACKS.findIndex((t) => t.key === a.track) - TRACKS.findIndex((t) => t.key === b.track);
  };
}

/** "not used in this rotation" for a Forte skill, "changes nothing on this rotation" for a level. */
export function inertText(row: Pick<LevelRow, "track">, rotation: string | null): string {
  const where = rotation ? ` (${rotation})` : "";
  return isForteTrack(row.track) ? `not used in this rotation${where}` : `changes nothing on this rotation${where}`;
}

/**
 * The plan for one character. `rank` and `rankingTeams` must come from the same `characters` / `inventoryEchoes` /
 * `teams` (the ranking fingerprint ties them on /account).
 */
export async function levelPlan(input: LevelPlanInput, options: LevelPlanOptions = {}): Promise<LevelPlan> {
  const { characterId: id, characters, inventoryEchoes, teams, materials } = input;
  const data: Record<string, any> = characters?.[id] ?? {};
  const name = characterDisplayName(id) || id;
  const short = characterShortName(id) || name;
  const mode: LevelPlan["from"] = options.from === "scratch" ? "scratch" : options.from && typeof options.from === "object" ? "custom" : "saved";
  const errors: string[] = [];
  const plan: LevelPlan = {
    characterId: id,
    name,
    from: mode,
    table: { gameVersion: materials.gameVersion, fetched: materials.fetched },
    today: null,
    startText: "",
    done: false,
    rotation: null,
    noGain: null,
    base: null,
    team: null,
    teamNote: null,
    buildNote: null,
    basis: "own",
    rows: [],
    pathOrder: options.pathOrder ?? "value",
    path: [],
    pathState: "none",
    inert: [],
    everything: null,
    errors,
  };
  if (!materials.characters[id]) return plan;

  const today = levelsToday(materials, savedProgressOf(data), mode === "scratch" ? "scratch" : "saved");
  const start: LevelState = mode === "custom" ? stateFrom(today, options.from as Partial<Record<TrackKey, string | number>>) : today.state;
  plan.today = { ...today, state: start };
  plan.startText = stateText(today, start);
  const total = stepsLeft(today, start);
  plan.done = total === 0;
  if (input.rank?.bestRotation && input.rank.best) plan.rotation = { name: input.rank.best.name, source: input.rank.best.source };
  if (plan.done) return plan;

  const pause = slicer(options.yieldToUi !== false);
  const cancelled = (): boolean => Boolean(options.signal?.cancelled);
  const report = (done: number): void => options.onProgress?.({ ...plan, rows: [...plan.rows], path: [...plan.path], inert: [...plan.inert] }, { done, total });
  const at = (state: LevelState): Record<string, any> => ({ ...characters, [id]: withLevels(data, state, today.weaponTop) });

  // ---- what can be scored
  const rotation: CharacterRotationInput | null = input.rank?.bestRotation ?? null;
  if (!data.weapon) plan.noGain = `${short} has no weapon equipped, so nothing can be scored yet`;
  else if (!rotation) plan.noGain = `there is no rotation to score ${short} on (save one in the calculator, or import one from Team rankings)`;

  const score = async (state: LevelState): Promise<Score> => {
    const result = await calcCharacterRotationDamage(rotation!, null, id, at(state), RANKING_ENEMY, inventoryEchoes);
    const agg = result.damageAggregation;
    return { damage: agg.avgDamage ?? 0, healing: agg.healing ?? 0, shield: agg.shield ?? 0 };
  };

  let base: Score | null = null;
  if (!plan.noGain) {
    try {
      base = await score(start);
      if (!(base.damage > 0) && !(base.healing > 0) && !(base.shield > 0)) {
        plan.noGain = `${short}'s best rotation scores no damage on this build`;
        base = null;
      }
    } catch (err) {
      plan.noGain = `${short}'s rotation could not be scored (${err instanceof Error ? err.message : String(err)})`;
    }
  }
  plan.base = base;

  // ---- the team half
  let ctx: TeamContext | null = null;
  let weaponBlock: string | null = null;
  if (base) {
    const auto = options.autoTeamBuffs ?? true;
    const scorer = await createTeamScorer(characters, inventoryEchoes, teams, input.rankingTeams, { autoTeamBuffs: auto, enemy: RANKING_ENEMY, errors });
    try {
      if (options.teamId) {
        const candidate = (await teamCandidatesOf(characters, teams)).candidates.find((c) => c.id === options.teamId);
        if (!candidate || !candidate.team.characterIds.includes(id)) throw new Error(`${short} is not in that team`);
        const scored = await scoreTeamCandidate(candidate, characters, inventoryEchoes, { autoTeamBuffs: auto, enemy: RANKING_ENEMY });
        if (scored.unarmed.length) throw new Error(`${scored.unarmed.map((k) => characterShortName(k) || k).join(" and ")} ha${scored.unarmed.length === 1 ? "s" : "ve"} no weapon equipped`);
        ctx = { candidate, rank: scored, base: scored.avgDamage, blocked: null };
      } else {
        ctx = await scorer.teamFor(id);
      }
    } catch (err) {
      plan.teamNote = err instanceof Error ? err.message : String(err);
    }
    if (!ctx && !plan.teamNote) plan.teamNote = await scorer.noTeamNote(id);
    if (ctx) {
      weaponBlock = await scorer.buildBlock(ctx, id);
      // the team at the starting levels (today's figure when they are the saved ones)
      const started = await scorer.impact(ctx, null, at(start), inventoryEchoes);
      if (started.team && started.team.avgDamage > 0) {
        ctx = { ...ctx, base: started.team.avgDamage };
        plan.team = { id: ctx.rank.id, name: ctx.rank.name, characterIds: ctx.rank.characterIds, base: ctx.base };
        if (weaponBlock) plan.buildNote = `${weaponBlock}. Level and Forte levels are shared by every build, so their team figures hold; a weapon level belongs to one build, so the weapon step has none.`;
      } else {
        plan.teamNote = started.note ?? "the team scores no damage";
        ctx = null;
      }
    }
    const teamOf = async (step: LevelStepDef, teamBase: number): Promise<{ team: TeamImpact | null; note: string | null }> => {
      if (!ctx) return { team: null, note: plan.teamNote };
      if (step.track === "weapon" && weaponBlock) return { team: null, note: weaponBlock };
      const r = await scorer.impact({ ...ctx, base: teamBase }, null, at(step.next), inventoryEchoes);
      return { team: r.team, note: r.note };
    };

    const worth = async (step: LevelStepDef, from: Score, teamBase: number): Promise<{ worth: StepWorth; after: Score }> => {
      const after = await score(step.next);
      await pause();
      const { team, note } = await teamOf(step, teamBase);
      await pause();
      const own = figure(from.damage, after.damage);
      const healing = from.healing > 0 || after.healing > 0 ? figure(from.healing, after.healing) : null;
      const shield = from.shield > 0 || after.shield > 0 ? figure(from.shield, after.shield) : null;
      const teamMoved = !!team && Math.abs(team.avgDamage - team.base) > SAME * Math.max(1, team.base);
      return { worth: { own, healing, shield, team, teamNote: team ? null : note, inert: !moved(own) && !moved(healing) && !moved(shield) && !teamMoved }, after };
    };

    // ---- each track on its own, to its top
    const teamBase = ctx?.base ?? 0;
    for (const { key } of TRACKS) {
      if (cancelled()) break;
      const step = trackToTop(materials, id, today, start, key);
      if (!step) continue;
      try {
        plan.rows.push({ ...step, ...(await worth(step, base, teamBase)).worth });
      } catch (err) {
        errors.push(`${step.label}: ${err instanceof Error ? err.message : String(err)}`);
        plan.rows.push({ ...step, own: null, healing: null, shield: null, team: null, teamNote: null, inert: false });
      }
    }
    plan.basis = basisOf(base, !!ctx);
    plan.rows.sort(compareWorth(plan.basis));
    plan.inert = plan.rows.filter((r) => r.inert);

    // ---- every step taken
    if (!cancelled() && total > 0) {
      const top = topState(today, start);
      try {
        const after = await score(top);
        const blocked = weaponBlock && today.weaponTop != null && start.weapon && start.weapon.level < today.weaponTop;
        // with the weapon step out of the team's reach, "everything" for the team is every level and Forte step
        const teamTop: LevelState = blocked ? { ...top, weapon: start.weapon } : top;
        const team = ctx ? (await scorer.impact(ctx, null, at(teamTop), inventoryEchoes)).team : null;
        plan.everything = {
          cost: sumCosts(materials, plan.rows.map((r) => r.cost)),
          own: figure(base.damage, after.damage),
          healing: base.healing > 0 || after.healing > 0 ? figure(base.healing, after.healing) : null,
          shield: base.shield > 0 || after.shield > 0 ? figure(base.shield, after.shield) : null,
          team,
        };
      } catch (err) {
        errors.push(`all steps: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    report(0);

    // ---- the path: best next step, apply, score again
    if (options.path !== false && total > 0 && !cancelled()) {
      const cap = options.maxPathSteps ?? 80;
      const pick = compareWorth(plan.basis, plan.pathOrder === "value");
      const dead = new Set<TrackKey>(plan.inert.map((r) => r.track));
      let state = start;
      let cur = base;
      let curTeam = teamBase;
      const costs: LevelCost[] = [];
      plan.pathState = "complete";
      for (;;) {
        if (cancelled()) { plan.pathState = "cancelled"; break; }
        const candidates: Array<{ row: LevelRow; after: Score }> = [];
        for (const { key } of TRACKS) {
          if (dead.has(key) || cancelled()) continue;
          const step = nextStep(materials, id, today, state, key);
          if (!step) continue;
          try {
            const w = await worth(step, cur, curTeam);
            if (w.worth.inert) dead.add(key);
            else candidates.push({ row: { ...step, ...w.worth }, after: w.after });
          } catch (err) {
            errors.push(`${step.label}: ${err instanceof Error ? err.message : String(err)}`);
            dead.add(key);
          }
        }
        if (cancelled()) { plan.pathState = "cancelled"; break; }
        if (!candidates.length) break;
        if (plan.path.length >= cap) { plan.pathState = "capped"; break; }
        candidates.sort((a, b) => pick(a.row, b.row));
        const { row: best, after } = candidates[0]!;
        costs.push(best.cost);
        state = best.next;
        cur = after;
        if (best.team) curTeam = best.team.avgDamage;
        plan.path.push({
          ...best,
          index: plan.path.length + 1,
          running: {
            gain: base.damage > 0 ? after.damage / base.damage - 1 : null,
            teamGain: ctx && teamBase > 0 ? curTeam / teamBase - 1 : null,
            healingGain: base.healing > 0 ? after.healing / base.healing - 1 : null,
            shieldGain: base.shield > 0 ? after.shield / base.shield - 1 : null,
            cost: sumCosts(materials, costs),
          },
        });
        report(plan.path.length);
        await pause();
      }
    }
  } else {
    // nothing to score: the steps and what they cost, in the tracks' own order
    for (const { key } of TRACKS) {
      const step = trackToTop(materials, id, today, start, key);
      if (step) plan.rows.push({ ...step, own: null, healing: null, shield: null, team: null, teamNote: null, inert: false });
    }
    if (total > 0) plan.everything = { cost: sumCosts(materials, plan.rows.map((r) => r.cost)), own: null, healing: null, shield: null, team: null };
  }
  if (cancelled() && plan.pathState === "none" && options.path !== false && total > 0 && base) plan.pathState = "cancelled";
  return plan;
}

/* --------------------------------------------------------------------------------------------- words */

/** Which values the calculator has not saved, for the note under the head: "level, weapon level or Forte levels". */
export function assumedWords(today: LevelsToday): string {
  const words: string[] = [];
  if (today.assumed.includes("level")) words.push("level");
  if (today.assumed.includes("weapon")) words.push("weapon level");
  const forte = today.assumed.filter(isForteTrack);
  if (forte.length === 5) words.push("Forte levels");
  else if (forte.length) words.push(forte.map((k) => trackLabel(k)).join(", "));
  return words.length > 1 ? `${words.slice(0, -1).join(", ")} or ${words.at(-1)}` : (words[0] ?? "");
}

/** What the equipped weapon is called, with its last level, for the intro line. */
export function weaponWords(today: LevelsToday): string {
  return today.weaponKey && today.weaponTop != null ? `${weaponDisplayName(today.weaponKey)} to level ${today.weaponTop}` : "";
}

/** The path's headline: "The first 3 steps give +9.1 % team damage for 1,300,000 Shell Credits". Null without a scored path. */
export function pathHeadline(plan: Pick<LevelPlan, "path" | "basis">, steps = 3): { steps: number; gain: number; basis: Basis; credits: number } | null {
  const upTo = plan.path[Math.min(steps, plan.path.length) - 1];
  if (!upTo) return null;
  const r = upTo.running;
  const gain = plan.basis === "team" ? r.teamGain : plan.basis === "healing" ? r.healingGain : plan.basis === "shield" ? r.shieldGain : r.gain;
  if (gain == null) return null;
  return { steps: upTo.index, gain, basis: plan.basis, credits: r.cost.credits };
}
