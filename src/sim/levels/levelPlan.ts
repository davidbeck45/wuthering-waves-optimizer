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
import { characterDisplayName, characterShortName } from "../display/names";
import { savedProgressOf, type MaterialsData } from "../materials/costToMax";
import { RANKING_ENEMY, scoreTeamCandidate, teamCandidatesOf, type CharacterRank, type TeamRank } from "../myRankings/rankRoster";
import { forteGateMaterial, joinSteps, levelsToday, nextStep, stateFrom, stateText, stepsLeft, sumCosts, topState, trackToTop, TRACKS, withLevels, type LevelCost, type LevelState, type LevelStepDef, type TrackKey } from "./levelSteps";
import { basisOf, compareWorth, type Figure, type LevelPlan, type LevelRow, type Score, type StepWorth } from "./levelWorth";

export * from "./levelWorth";

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
    gate: null,
    errors,
  };
  if (!materials.characters[id]) return plan;
  plan.gate = forteGateMaterial(materials, id);

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
          let step = nextStep(materials, id, today, state, key);
          if (!step) continue;
          try {
            let w = await worth(step, cur, curTeam);
            // A level that moves nothing by itself is not the end of its track: the calculator's tables hold a few
            // levels equal to the one before (Galbrena's Resonance Skill 9 reads like 8), and the levels after it
            // still count. Such a level is taken together with the next one that moves something, as one step with
            // both costs; only a track with nothing left that moves is dropped.
            while (w.worth.inert && !cancelled()) {
              const more = nextStep(materials, id, today, step.next, key);
              if (!more) break;
              step = joinSteps(materials, step, more);
              w = await worth(step, cur, curTeam);
            }
            if (cancelled()) continue;
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
