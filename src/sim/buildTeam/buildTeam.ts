// Wuthering Tools+ — "Build it for me" (batch 2, Roadmap Phase 4): re-gear a team from the player's echo inventory.
//
//   plans (rileyPlan.ts) ──► constraints (constraints.ts) ──► one optimizer job per member (headlessOptimizer.ts)
//        ──► allocateTeam (allocate.ts: priority order, no echo twice, swap pass) ──► draft builds + exact numbers
//
// Store-free: the page passes plain copies of the stores, the CLI an export. Every number shown is the app's own
// calculator on the produced build (`calcCharacterRotationDamage`, `calcTeamRotationDamage` through the team's
// build and team-buff resolution, `resolveTeamCharacters`), never an estimate; the optimizer only ranks. Nothing here
// writes anything — apply.ts does, after the player confirms.
import { buildCharacterCalculationContext, resolveCharacterEchoes, resolveTeamEnemyConfig, type TeamEnemyConfig } from "../../calculator/buildCharacterContext";
import { resolveCharactersForBuild } from "../../calculator/buildOverride";
import { calcCharacterRotationDamage, type CharacterRotationInput } from "../../calculator/characterRotation";
import { calcTeamRotationDamage } from "../../calculator/teamRotation";
import { applyBuildFields, extractBuildFields } from "../../characters/buildFields";
import { buildEchoLoadoutFromIds } from "../../echoes/echoLoadout";
import { getSetBonusEffects, getSetsFromEchoes } from "../../echoes/sets";
import { echoSetLabelMap } from "../../echoes/stats";
import { RANKING_ENEMY, rotationCandidates, scoreRotation } from "../myRankings/rankRoster";
import { resolveTeamCharacters } from "../teamContext/resolveTeam";
import { allocateTeam, type AllocationApi, type Candidate, type SwapMove } from "./allocate";
import { constraintsOf, costOf, filterPool, legalInSlot, mainEchoCandidates, meetsSetPieces, relaxLevels, setCounts, shortfallOf, type BuildOptions, type MemberConstraints, type RelaxLevel, type Shortfall } from "./constraints";
import { erMinStat, mainEchoRecordOf, menuErOf, prepareMemberJob, type BuffConfig, type MemberJob, type Objective, type OptimizerBackend, type OptimizeProgress } from "./headlessOptimizer";
import type { MemberPlan } from "./rileyPlan";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TeamSpec {
  /** a saved team's id (Team Rotations), null for a composition that is not saved */
  id: string | null;
  name: string;
  characterIds: Array<string | null>;
  buildIds?: Array<string | null>;
  actions?: any[];
  duration?: number | string | null;
  enemyConfig?: Record<string, any> | null;
  handoffs?: Record<string, string[]> | null;
}

export interface BuildTeamInput {
  characters: Record<string, any>;
  inventory: { echoes: any[]; equipped?: Record<string, Record<string, number>> };
  team: TeamSpec;
  /** one per slot of `team.characterIds` */
  plans: MemberPlan[];
  /** priority: slot indices, first served first */
  order: number[];
  options: BuildOptions;
  /** the player's ER floors (%) per slot; undefined = the plan's need, null = no floor */
  erFloors?: Array<number | null | undefined>;
  /** team buffs from the team's real members (the Team Rotations switch, `autoTeamBuffs.ts`); default true */
  autoTeamBuffs?: boolean;
}

export type EchoSource = "own" | "teammate" | "free" | "other";

export interface EchoPick {
  echo: any;
  /** where it comes from: this member's current build, a teammate's, nobody's, or a character outside the team */
  source: EchoSource;
  /** characters who wear it now (their active build), teammates included */
  wornBy: string[];
  /** teammates whose build in this team (pin, build named for the team, or active) wears it today: unless their new
   *  build is saved too, the team would wear it twice */
  sharedWith: string[];
}

export interface MemberOutcome {
  slot: number;
  characterId: string;
  status: "ok" | "skipped" | "noEchoes" | "noLoadout";
  /** why a member got nothing, in words */
  message?: string;
  shortfall?: Shortfall[];
  objective: { label: string; source: Objective["source"]; actions: number } | null;
  constraints: MemberConstraints | null;
  /** the calculator's average damage on the objective, ER on the character screen (%) */
  before: {
    value: number;
    menuEr: number | null;
    /** today's echoes with the run's set / main-echo buff settings (null when they can't be scored that way): the
     *  part of the gain that is a buff switched on, not an echo */
    withRunBuffs: number | null;
  } | null;
  after: { value: number; optimizerValue: number; menuEr: number | null; picks: EchoPick[] } | null;
  erFloor: number | null;
  erMet: boolean | null;
  /** the floor could not be met with this inventory: the loadout kept is the one with the most ER */
  erUnreachable: boolean;
  /** the plan's main echo was not in the pool: slot 0 is the optimizer's pick among the layout's cost */
  mainEchoFallback: boolean;
  /** how far the plan was relaxed to fill the build (`shortfall` says what the plan lacked); null when the member
   *  keeps their own build */
  relaxed: RelaxLevel | null;
  /** the member's current echoes scored best: nothing new to wear (the saved build would only change buff settings) */
  keptCurrent: boolean;
  /** the result wears exactly the echoes the slot's build wears today */
  sameEchoes: boolean;
  /** pieces worn per set, and whether that is the plan's split */
  setsWorn: Record<string, number>;
  meetsPlanSets: boolean;
  /** set passives / main-echo buffs nobody had set, switched on at max for the run and the saved build */
  buffDefaults: string[];
  /** loadouts the optimizer scored for this member (every order and the fallback included) */
  combos: number;
  /** the build the slot runs today (pin, build named for the team, or the active one) */
  fromBuild: { id: string | null; name: string | null; source: "pinned" | "named" | "active" };
  /** what apply.ts saves: the slot's build with the new echoes, main echo and buff settings */
  draft: Record<string, any> | null;
}

export interface BuildTeamResult {
  members: MemberOutcome[];
  order: number[];
  ordersTried: number;
  swaps: SwapMove[];
  /** the members' objective: the team's own rotation (one unit: team damage) or each member's best rotation */
  objectiveKind: "team" | "solo";
  /** team rotation totals, average damage per rotation (and per second when it has a duration); team objective only */
  team: { before: number; after: number; dpsBefore: number | null; dpsAfter: number | null } | null;
  enemy: TeamEnemyConfig;
  /** echoes worn by characters outside the team that the result uses (only with `takeFromOthers`) */
  fromOthers: string[];
  ms: number;
}

export interface BuildTeamHooks {
  signal?: AbortSignal;
  /** per member: loadouts scored so far (`processed`) out of generated, and the phase */
  onProgress?: (p: { slot: number; characterId: string; phase: "prepare" | "search" | "swap" | "verify"; processed: number; generated: number }) => void;
}

const abortError = (): Error => Object.assign(new Error("The build was cancelled"), { name: "AbortError" });

/** Echo ids worn (per upstream's `equipped` map, i.e. active builds) by characters outside `teamIds`, with who. */
export function wornByMap(equipped: Record<string, Record<string, number>> = {}): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [echoId, map] of Object.entries(equipped ?? {})) {
    const who = Object.keys(map ?? {}).filter((c) => (map as Record<string, number>)[c] != null && (map as Record<string, number>)[c] >= 0);
    if (who.length) out.set(echoId, who.sort());
  }
  return out;
}

/** The team's own rotation actions for one slot, as a character rotation; null when the slot has none. */
export function teamSlotRotation(team: TeamSpec, slot: number): CharacterRotationInput | null {
  const actions = (team.actions ?? []).filter((a) => a?.slot === slot && !a.isDisabled).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (!actions.length) return null;
  return { id: `team-${team.id ?? "adhoc"}-s${slot}`, name: team.name || "Team rotation", duration: team.duration ?? null, actions };
}

/** The character's best rotation the way /my-rankings picks it (their own, curated, wuwa_calc — scored on the build). */
export async function bestRotationOf(characterId: string, characters: Record<string, any>, echoes: any[], enemy: TeamEnemyConfig): Promise<Objective | null> {
  const candidates = await rotationCandidates(characterId, characters[characterId] ?? {});
  let best: { c: (typeof candidates)[number]; avg: number } | null = null;
  for (const c of candidates) {
    try {
      const s = await scoreRotation(c.rotation, characterId, characters, enemy, echoes);
      if (!best || s.avgDamage > best.avg) best = { c, avg: s.avgDamage };
    } catch {
      // a preset this build cannot run is skipped, as /my-rankings does
    }
  }
  return best ? { rotation: best.c.rotation, label: best.c.name, source: best.c.source } : null;
}

/** The team's total the way Team Rotations computes it: builds and team buffs resolved, then `calcTeamRotationDamage`. */
export async function teamTotalOf(team: TeamSpec, characters: Record<string, any>, echoes: any[], enemy: TeamEnemyConfig, auto: boolean): Promise<{ avg: number; dps: number | null; perSlot: number[] }> {
  const resolution = await resolveTeamCharacters({ characterIds: team.characterIds, buildIds: team.buildIds, enemyConfig: team.enemyConfig, actions: team.actions ?? [], handoffs: team.handoffs ?? null }, characters, echoes, { auto, enemyConfig: enemy });
  const res = await calcTeamRotationDamage(
    { name: team.name, characterIds: team.characterIds, buildIds: resolution.auto ? resolution.buildIds : team.buildIds, actions: team.actions ?? [], duration: team.duration ?? null },
    resolution.characters,
    enemy,
    echoes,
  );
  const seconds = Number(team.duration);
  return {
    avg: res.total.avgDamage ?? 0,
    dps: Number.isFinite(seconds) && seconds > 0 ? res.dps.avg : null,
    perSlot: team.characterIds.map((id) => (id ? res.perCharacter[id]?.damageAggregation?.avgDamage ?? 0 : 0)),
  };
}

/** The fields of the build apply.ts saves: the slot's build with these echoes (inventory pointers, upstream's
 *  `buildEchoLoadoutFromIds`), slot 0 as the main echo with the run's buff settings, the set bonuses those echoes give
 *  (`getSetBonusEffects`, what the echoes panel writes) and the run's set-passive settings. */
export function draftBuildFields(slotRecord: Record<string, any>, loadout: any[], buffConfig: BuffConfig): Record<string, any> {
  const fields = extractBuildFields(slotRecord);
  const main = loadout[0];
  fields.echoes = buildEchoLoadoutFromIds(loadout.map((e) => e.echoId), { fillSlots: 5 });
  fields.mainEcho = mainEchoRecordOf(main.echo, Number(main.rank ?? 5) || 5, buffConfig.mainEchoBuffs[main.echo] ?? {});
  const bonus = getSetBonusEffects(getSetsFromEchoes(loadout));
  fields.echoSetBonus = { setBonusOnePiece: bonus.setBonusOnePiece, setBonusOne: bonus.setBonusOne, setBonusTwo: bonus.setBonusTwo };
  fields.echoSetPassives = { ...(slotRecord.echoSetPassives ?? {}), ...buffConfig.echoSetPassives };
  fields.setOverride = false;
  fields.echoPresetId = null;
  fields.echoPresetSource = null;
  return fields;
}

const MENU_ENEMY: TeamEnemyConfig = { enemyLevel: 90, enemyResist: 0.1, enemyType: "Calamity" };

/** A record's character-screen ER (%): the build card's view (`alwaysEnabledOnly`), as the energy check reads it. */
export async function menuErPercent(characterId: string, characters: Record<string, any>, echoes: any[]): Promise<number | null> {
  if (!characters[characterId]?.weapon) return null;
  const built = await buildCharacterCalculationContext(characterId, characters, MENU_ENEMY, echoes, { alwaysEnabledOnly: true });
  const er = Number(built.finalStats?.energyRegen);
  return Number.isFinite(er) ? Math.round(er * 1e6) / 1e4 : null;
}

const idsOf = (loadout: any[]): string[] => loadout.map((e) => String(e.echoId));

/** A character's five slots (active build) resolved to inventory echoes — the "current build" plan's input. */
export function currentEchoesOf(characterId: string, characters: Record<string, any>, echoes: any[]): any[] {
  return resolveCharacterEchoes(characters[characterId]?.echoes ?? {}, echoes ?? []).map((e) => (e?.echo ? e : null));
}

export async function buildMyTeam(input: BuildTeamInput, backend: OptimizerBackend, hooks: BuildTeamHooks = {}): Promise<BuildTeamResult> {
  const t0 = Date.now();
  const { characters, team, plans, options } = input;
  const echoes = input.inventory.echoes ?? [];
  const echoById = new Map(echoes.map((e) => [String(e.echoId), e]));
  const auto = input.autoTeamBuffs ?? true;
  const check = (): void => {
    if (hooks.signal?.aborted) throw abortError();
  };
  const ids = team.characterIds;
  const hasActions = (team.actions ?? []).some((a) => !a?.isDisabled);
  const enemy = hasActions ? resolveTeamEnemyConfig(team.enemyConfig ?? {}) : RANKING_ENEMY;
  const resolution = await resolveTeamCharacters({ characterIds: ids, buildIds: team.buildIds, enemyConfig: team.enemyConfig, actions: team.actions ?? [], handoffs: team.handoffs ?? null }, characters, echoes, { auto, enemyConfig: enemy });
  const resolved = resolution.characters;
  const teamSet = new Set(ids.filter((x): x is string => !!x));
  const worn = wornByMap(input.inventory.equipped ?? {});
  // echoes out of every member's search: worn outside the team (unless allowed), and — added once step 1 knows who
  // gets no new build — the echoes those members keep wearing in this team
  const wornOutside = new Set<string>();
  if (!options.takeFromOthers) for (const [id, who] of worn) if (who.some((c) => !teamSet.has(c))) wornOutside.add(id);
  // the echoes each member's build in this team wears today (pins and builds named for the team resolved)
  const slotEchoes = new Map<string, Set<string>>();
  for (const id of teamSet) slotEchoes.set(id, new Set(Object.values(resolved[id]?.echoes ?? {}).map((s: any) => s?.echoId).filter(Boolean).map(String)));

  // 1. per slot: objective, constraints, job
  const outcomes: MemberOutcome[] = [];
  const active: Array<{ slot: number; job: MemberJob; c: MemberConstraints; levels: ReturnType<typeof relaxLevels>; plan: MemberPlan; before: number; objectiveSource: Objective["source"] }> = [];
  for (let slot = 0; slot < ids.length; slot++) {
    check();
    const characterId = ids[slot];
    const plan = plans[slot];
    const slotRes = resolution.slots.find((s) => s.slot === slot);
    const fromBuild = { id: slotRes?.buildId ?? null, name: slotRes?.buildName ?? null, source: (slotRes?.buildSource ?? "active") as MemberOutcome["fromBuild"]["source"] };
    const base: MemberOutcome = {
      slot,
      characterId: characterId ?? "",
      status: "skipped",
      objective: null,
      constraints: null,
      before: null,
      after: null,
      erFloor: null,
      erMet: null,
      erUnreachable: false,
      mainEchoFallback: false,
      relaxed: null,
      keptCurrent: false,
      sameEchoes: false,
      setsWorn: {},
      meetsPlanSets: false,
      buffDefaults: [],
      combos: 0,
      fromBuild,
      draft: null,
    };
    outcomes.push(base);
    if (!characterId || !plan) continue;
    if (!characters[characterId]?.weapon) {
      base.message = "Not set up in the calculator yet (no weapon), so there is no build to start from.";
      continue;
    }
    if (plan.source === "none" && options.useSets) {
      // no pick, no preset, no build: an unbounded search over every echo is the optimizer page's job
      base.message = "Nothing to build from: no wuwa_calc pick, no curated preset and no build to keep the sets of. Pick sets on the optimizer page.";
      continue;
    }
    hooks.onProgress?.({ slot, characterId, phase: "prepare", processed: 0, generated: 0 });
    const teamRotation = teamSlotRotation(team, slot);
    const objective: Objective | null = teamRotation
      ? { rotation: teamRotation, label: "Team rotation", source: "team" }
      : await bestRotationOf(characterId, resolved, echoes, enemy);
    if (!objective) {
      base.message = "No rotation to score this character on: save one in the calculator or import the team.";
      continue;
    }
    base.objective = { label: objective.label, source: objective.source, actions: objective.rotation.actions.length };
    const floorOverride = input.erFloors?.[slot];
    const c = constraintsOf(plan, options, { mainEcho: resolved[characterId]?.mainEcho?.echo ?? null, ...(floorOverride !== undefined ? { erFloor: floorOverride } : {}) });
    base.constraints = c;
    base.erFloor = c.erFloor;
    const levels = relaxLevels(c);
    const loosest = levels[levels.length - 1]!.c;
    const { pool } = filterPool(echoes, loosest, { wornOutside });
    const candidateKeys = new Set(c.mainEchoKeys ?? []);
    for (const l of levels) for (const k of mainEchoCandidates(filterPool(echoes, l.c, { wornOutside }).pool, l.c).keys) candidateKeys.add(k);
    const setKeys = c.allowedSets ?? [...new Set(pool.map((e) => e.echoSet).filter(Boolean))];
    const job = await prepareMemberJob({ characterId, characters: resolved, inventoryEchoes: echoes, enemy, objective, setKeys, mainEchoKeys: [...candidateKeys] });
    base.buffDefaults = job.buffConfig.defaulted;
    const beforeRun = await calcCharacterRotationDamage(objective.rotation, null, characterId, resolved, enemy, echoes);
    base.before = { value: beforeRun.damageAggregation.avgDamage ?? 0, menuEr: job.currentMenuEr, withRunBuffs: null };
    if (!pool.length) {
      base.status = "noEchoes";
      base.shortfall = shortfallOf(filterPool(echoes, c, { wornOutside }).pool, c);
      base.message = noEchoesMessage(plan, c, options);
      continue;
    }
    active.push({ slot, job, c, levels, plan, before: base.before.value, objectiveSource: objective.source });
  }
  // a member who gets no new build keeps the one they wear here: its echoes stay out of the others' search, so the
  // team never wears one echo twice
  const building = new Set(active.map((a) => a.job.characterId));
  const keptInTeam = new Set<string>();
  for (const [id, ids] of slotEchoes) if (!building.has(id)) for (const echoId of ids) keptInTeam.add(echoId);
  for (const echoId of keptInTeam) wornOutside.add(echoId);

  // 2. allocation over the active members (indices into `active`)
  const combos = new Map<number, number>();
  const solveMemo = new Map<string, Promise<Candidate | null>>();
  const toCandidate = (m: number, loadout: any[], value: number, energyRegen: number, meta: PickMeta): Candidate => {
    const { job, c } = active[m]!;
    const er = menuErOf(job, energyRegen);
    return { ids: idsOf(loadout), value, er, meetsFloor: c.erFloor == null || er + 1e-6 >= c.erFloor, meta: { ...meta } };
  };
  const progress = (m: number, p: OptimizeProgress, phase: "search" | "swap" = "search"): void => {
    const { slot, job } = active[m]!;
    hooks.onProgress?.({ slot, characterId: job.characterId, phase, processed: (combos.get(m) ?? 0) + p.processed, generated: p.generated });
  };
  const levelOf = (m: number, pick: Candidate | null | undefined): MemberConstraints => {
    const level = (pick?.meta as PickMeta | undefined)?.level ?? "plan";
    const levels = active[m]!.levels;
    // a member keeping their own build swaps under the loosest rules (their build may sit outside the plan's layout)
    return level === "current" ? levels[levels.length - 1]!.c : levels.find((l) => l.level === level)?.c ?? active[m]!.c;
  };
  const currentLoadoutOf = (m: number): any[] | null => {
    const { job, plan } = active[m]!;
    const slots = Object.values(resolved[job.characterId]?.echoes ?? {}) as any[];
    const loadout = [0, 1, 2, 3, 4].map((i) => echoById.get(String((resolved[job.characterId]?.echoes ?? {})[i]?.echoId ?? "")));
    if (slots.length < 5 || loadout.some((e) => !e)) return null;
    if (options.useSets && plan.sets.length && !meetsSetPieces(loadout, plan)) return null;
    // a build sharing an echo with a teammate who keeps theirs is no answer here (one echo twice in the team); one
    // sharing with a character outside the team is what they wear today and may stand
    if (loadout.some((e) => keptInTeam.has(String(e!.echoId)))) return null;
    return loadout as any[];
  };
  const searchLevels = async (m: number, pools: any[][]): Promise<Candidate | null> => {
    const { job, levels } = active[m]!;
    // pass 1: the strictest level that fills its layout and meets the ER floor
    let firstFillable = -1;
    for (let i = 0; i < levels.length; i++) {
      check();
      const { level, c } = levels[i]!;
      const pool = pools[i]!;
      const { keys, fallback } = mainEchoCandidates(pool, c);
      if (!pool.length || !keys.length || shortfallOf(pool, c).length) continue;
      if (firstFillable < 0) firstFillable = i;
      const request = { pool, mainEchoKeys: keys, loadoutFormat: c.loadoutFormat, minStats: erMinStat(job, c.erFloor), topN: 5 };
      const run = await backend.optimize(job, request, { signal: hooks.signal, onProgress: (p) => progress(m, p) });
      combos.set(m, (combos.get(m) ?? 0) + run.processed);
      const best = run.results[0];
      if (best) return toCandidate(m, best.loadout, best.targetValue, best.energyRegen, { level, fallback, unreachable: false });
    }
    // pass 2: no level meets the floor — the loadout with the most ER at the strictest level that fills, scored on
    // the objective
    if (firstFillable < 0 || active[m]!.c.erFloor == null) return null;
    const { level, c } = levels[firstFillable]!;
    const pool = pools[firstFillable]!;
    const { keys, fallback } = mainEchoCandidates(pool, c);
    const erJob: MemberJob = { ...job, id: `${job.id}:er`, target: "Stat:energyRegen" };
    const erRun = await backend.optimize(erJob, { pool, mainEchoKeys: keys, loadoutFormat: c.loadoutFormat, minStats: [], topN: 5 }, { signal: hooks.signal, onProgress: (p) => progress(m, p) });
    combos.set(m, (combos.get(m) ?? 0) + erRun.processed);
    const best = erRun.results[0];
    if (!best) return null;
    const [scored] = await backend.score(job, [best.loadout], { signal: hooks.signal });
    return scored ? toCandidate(m, scored.loadout, scored.targetValue, scored.energyRegen, { level, fallback, unreachable: true }) : null;
  };
  const api: AllocationApi = {
    solve(m, taken) {
      const { job, levels } = active[m]!;
      const pools = levels.map((l) => filterPool(echoes, l.c, { taken, wornOutside }).pool);
      const key = `${m}|${pools[pools.length - 1]!.map((e) => e.echoId).sort().join(",")}`;
      let hit = solveMemo.get(key);
      if (hit) return hit;
      hit = (async (): Promise<Candidate | null> => {
        const found = await searchLevels(m, pools);
        // the build the member wears today competes too (when it keeps the plan's sets and nobody before took its
        // echoes): the result is never worse than what they have for no reason
        const current = currentLoadoutOf(m);
        if (!current || current.some((e) => taken.has(String(e.echoId)))) return found;
        const [scored] = await backend.score(job, [current], { signal: hooks.signal });
        if (!scored) return found;
        const mine = toCandidate(m, scored.loadout, scored.targetValue, scored.energyRegen, { level: "current", fallback: false, unreachable: false });
        if (!found) return mine;
        // a met floor first; with neither meeting it, the one closer to it (more ER); then damage
        const better =
          mine.meetsFloor !== found.meetsFloor
            ? mine.meetsFloor
            : !mine.meetsFloor && (mine.er ?? 0) !== (found.er ?? 0)
              ? (mine.er ?? 0) > (found.er ?? 0)
              : mine.value > found.value * (1 + 1e-9);
        return better ? mine : found;
      })();
      solveMemo.set(key, hit);
      hit.catch(() => solveMemo.delete(key));
      return hit;
    },
    async score(m, list) {
      const { job } = active[m]!;
      const loadouts = list.map((ids) => ids.map((id) => echoById.get(id)));
      if (loadouts.some((l) => l.some((e) => !e))) return list.map(() => null);
      const res = await backend.score(job, loadouts as any[][], { signal: hooks.signal });
      combos.set(m, (combos.get(m) ?? 0) + list.length);
      return res.map((r, i) => (r ? { ...toCandidate(m, r.loadout, r.targetValue, r.energyRegen, { level: "plan", fallback: false, unreachable: false }), ids: list[i]! } : null));
    },
    legal(m, slot, id, pick) {
      const echo = echoById.get(id);
      return !!echo && legalInSlot(echo, slot, pick.ids.map((x) => echoById.get(x)), levelOf(m, pick), wornOutside);
    },
    free(m, slot, pick, used) {
      const cost = costOf(echoById.get(pick.ids[slot]!));
      const c = levelOf(m, pick);
      const loadout = pick.ids.map((x) => echoById.get(x));
      const out: Array<{ id: string; w: number }> = [];
      for (const e of echoes) {
        const id = String(e.echoId);
        if (used.has(id) || costOf(e) !== cost) continue;
        if (!legalInSlot(e, slot, loadout, c, wornOutside)) continue;
        out.push({ id, w: roughWorth(e) });
      }
      return out.sort((a, b) => b.w - a.w || a.id.localeCompare(b.id)).slice(0, 16).map((x) => x.id);
    },
  };
  // the team value: the team rotation's slots add up to the team's damage; solo rotations are weighted by Riley's
  // share of the team's DPS over the member's own damage today (so +10 % on the carry outweighs +10 % on a healer)
  const objectiveKind: BuildTeamResult["objectiveKind"] = active.length && active.every((a) => a.objectiveSource === "team") ? "team" : "solo";
  const weights = active.map((a) => (objectiveKind === "team" ? 1 : (a.plan.share ?? (a.plan.mainDps ? 0.6 : 0.2)) / Math.max(1, a.before)));
  const order = input.order.map((slot) => active.findIndex((a) => a.slot === slot)).filter((i) => i >= 0);
  for (let i = 0; i < active.length; i++) if (!order.includes(i)) order.push(i);
  // the order matters only when two members can want the same echo
  const pools = active.map((a) => new Set(filterPool(echoes, a.levels[a.levels.length - 1]!.c, { wornOutside }).pool.map((e) => e.echoId)));
  const overlap = pools.some((p, i) => pools.some((q, j) => j > i && [...p].some((id) => q.has(id))));
  const allocation = await allocateTeam(api, {
    members: active.length,
    order,
    weights,
    allOrders: options.tryAllOrders && overlap,
    isCancelled: () => !!hooks.signal?.aborted,
    onStep: (s) => {
      if (s.phase === "swap") for (const m of s.pair) progress(m, { processed: 0, generated: 0 }, "swap");
    },
  });

  // 3. drafts and the calculator's numbers for them
  const draftedBuilds: Record<string, Record<string, any>> = {};
  for (let m = 0; m < active.length; m++) {
    check();
    const { slot, job, c, plan } = active[m]!;
    const out = outcomes[slot]!;
    const pick = allocation.picks[m];
    out.combos = combos.get(m) ?? 0;
    if (!pick) {
      out.status = "noLoadout";
      const taken = new Set(allocation.picks.flatMap((p, i) => (i !== m ? p?.ids ?? [] : [])));
      out.shortfall = shortfallOf(filterPool(echoes, c, { wornOutside, taken }).pool, c);
      out.message = noLoadoutMessage(plan, c, out.shortfall, taken.size > 0, options);
      continue;
    }
    const meta = (pick.meta ?? {}) as Partial<PickMeta>;
    out.keptCurrent = meta.level === "current";
    out.relaxed = meta.level === "current" ? null : meta.level ?? "plan";
    if (out.relaxed && out.relaxed !== "plan") out.shortfall = shortfallOf(filterPool(echoes, c, { wornOutside, taken: new Set(allocation.picks.flatMap((p, i) => (i !== m ? p?.ids ?? [] : []))) }).pool, c);
    hooks.onProgress?.({ slot, characterId: job.characterId, phase: "verify", processed: out.combos, generated: out.combos });
    const loadout = pick.ids.map((id) => echoById.get(id)!);
    const slotRecord = resolveCharactersForBuild(characters, job.characterId, out.fromBuild.id)[job.characterId] ?? {};
    const draft = draftBuildFields(slotRecord, loadout, job.buffConfig);
    out.draft = draft;
    draftedBuilds[job.characterId] = draft;
    // the produced build in the run's own context (its team buffs as resolved for this team)
    const afterRecord = applyBuildFields(resolved[job.characterId], { ...draft, teamBuffs: resolved[job.characterId]?.teamBuffs });
    const afterChars = { ...resolved, [job.characterId]: afterRecord };
    const afterRun = await calcCharacterRotationDamage(job.rotation, null, job.characterId, afterChars, enemy, echoes);
    const menuEr = await menuErPercent(job.characterId, afterChars, echoes);
    const owner = new Map<string, number>();
    allocation.picks.forEach((p, i) => p?.ids.forEach((id) => owner.set(id, active[i]!.slot)));
    const currentIds = new Set(Object.values(resolved[job.characterId]?.echoes ?? {}).map((s: any) => s?.echoId).filter(Boolean));
    out.status = "ok";
    out.after = {
      value: afterRun.damageAggregation.avgDamage ?? 0,
      optimizerValue: pick.value,
      menuEr,
      picks: loadout.map((echo) => {
        const id = String(echo.echoId);
        const who = worn.get(id) ?? [];
        const sharedWith = [...teamSet].filter((w) => w !== job.characterId && !!slotEchoes.get(w)?.has(id));
        const own = currentIds.has(echo.echoId) || who.includes(job.characterId);
        const source: EchoSource = own ? "own" : sharedWith.length || who.some((w) => teamSet.has(w) && w !== job.characterId) ? "teammate" : who.length ? "other" : "free";
        return { echo, source, wornBy: who, sharedWith };
      }),
    };
    out.erMet = c.erFloor == null ? null : menuEr != null && menuEr + 1e-6 >= c.erFloor;
    out.sameEchoes = currentIds.size === 5 && pick.ids.every((id) => currentIds.has(id));
    // today's echoes under the run's buff settings: scored by the same job when every set and the main echo they
    // wear has its buffs precomputed there (else the split is unknown)
    const today = [0, 1, 2, 3, 4].map((i) => echoById.get(String((resolved[job.characterId]?.echoes ?? {})[i]?.echoId ?? "")));
    if (out.before && today.every(Boolean)) {
      const labels = Object.values(getSetBonusEffects(getSetsFromEchoes(today as any[]))).filter(Boolean) as string[];
      if (labels.every((l) => l in job.echoSetPassiveBuffs) && today[0]!.echo in job.mainEchoStats) {
        const [scored] = await backend.score(job, [today as any[]], { signal: hooks.signal });
        out.before.withRunBuffs = scored ? scored.targetValue : null;
      }
    }
    // pass 1 tried every level with the floor; a floor still unmet means no build of the plan's sets reaches it
    out.erUnreachable = out.erMet === false;
    out.mainEchoFallback = !!meta.fallback;
    out.setsWorn = setCounts(loadout);
    out.meetsPlanSets = meetsSetPieces(loadout, plan);
  }

  // 4. the team's own total, before and with every new build pinned
  let teamTotals: BuildTeamResult["team"] = null;
  if (objectiveKind === "team" && hasActions) {
    const before = await teamTotalOf(team, characters, echoes, enemy, auto);
    const withDrafts: Record<string, any> = { ...characters };
    const pins = [...(team.buildIds ?? ids.map(() => null))];
    for (const out of outcomes) {
      if (!out.draft) continue;
      const id = out.characterId;
      const draftId = `__buildTeam_${out.slot}`;
      withDrafts[id] = { ...withDrafts[id], builds: [...(withDrafts[id]?.builds ?? []), { id: draftId, name: "draft", ...out.draft }] };
      pins[out.slot] = draftId;
    }
    const after = await teamTotalOf({ ...team, buildIds: pins }, withDrafts, echoes, enemy, auto);
    teamTotals = { before: before.avg, after: after.avg, dpsBefore: before.dps, dpsAfter: after.dps };
  }

  const fromOthers = options.takeFromOthers
    ? outcomes.flatMap((o) => o.after?.picks.filter((p) => p.source === "other").map((p) => String(p.echo.echoId)) ?? [])
    : [];
  return {
    members: outcomes,
    order: allocation.order.map((i) => active[i]!.slot),
    ordersTried: allocation.ordersTried,
    swaps: allocation.swaps.map((s) => ({ ...s, taker: active[s.taker]!.slot, giver: active[s.giver]!.slot })),
    objectiveKind,
    team: teamTotals,
    enemy,
    fromOthers,
    ms: Date.now() - t0,
  };
}

/** A quick guess at what an echo is worth for the backfill list's order (crit first, then ER): only the order of the
 *  candidates the swap pass scores exactly. */
function roughWorth(e: any): number {
  let w = 0;
  for (let i = 1; i <= 5; i++) {
    const k = e[`echoSubStatsType${i}`];
    const v = Number(e[`echoSubStatsValue${i}`]) || 0;
    if (k === "CritRate") w += v * 2;
    else if (k === "CritDMG") w += v;
    else if (k === "EnergyRegen") w += v * 0.8;
    else if (k === "ATK" || k === "HP" || k === "DEF") w += v * 0.6;
    else if (typeof k === "string" && k.endsWith("DMGBonus")) w += v * 0.5;
  }
  return w;
}

/** What a candidate carries for this module: the constraint level that found it and how. */
interface PickMeta {
  /** "current": the member's own build won */
  level: RelaxLevel | "current";
  fallback: boolean;
  unreachable: boolean;
}

const COST_WORD: Record<number, string> = { 4: "4-cost", 3: "3-cost", 1: "1-cost" };
const STAT_WORD: Record<string, string> = { CritRate: "Crit Rate", CritDMG: "Crit DMG", ATK: "ATK%", HP: "HP%", DEF: "DEF%", EnergyRegen: "Energy Regen", HealingBonus: "Healing Bonus" };
const statWord = (k: string): string => STAT_WORD[k] ?? `${k} DMG`;

/** "3-cost Glacio DMG" / "4-cost HP% or DEF%" — a shortfall slot in words. */
export function shortfallText(s: Shortfall): string {
  const stats = s.stats.length ? ` ${s.stats.map(statWord).join(" or ")}` : "";
  return `${COST_WORD[s.cost] ?? `${s.cost}-cost`}${stats}`;
}

function setsText(plan: MemberPlan, c: MemberConstraints): string {
  return c.allowedSets ? plan.sets.map((x) => echoSetLabelMap[x.key] ?? x.key).join(" / ") : "any set";
}

function noEchoesMessage(plan: MemberPlan, c: MemberConstraints, options: BuildOptions): string {
  const where = options.takeFromOthers ? "in your inventory" : "that nobody outside the team wears";
  return `No ${setsText(plan, c)} echoes ${where}.`;
}

function noLoadoutMessage(plan: MemberPlan, c: MemberConstraints, shortfall: Shortfall[], teammatesTook: boolean, options: BuildOptions): string {
  const sets = setsText(plan, c);
  if (shortfall.length) {
    const parts = shortfall.map((s) => `${s.need - s.have} more ${shortfallText(s)} ${sets} echo${s.need - s.have > 1 ? "es" : ""}`);
    const tail = teammatesTook ? " after the members before them took theirs" : options.takeFromOthers ? "" : " (echoes other characters wear are left out)";
    return `Not enough echoes: needs ${parts.join(" and ")}${tail}.`;
  }
  return `No complete build of ${sets} echoes is left${teammatesTook ? " after the members before them took theirs" : ""}.`;
}
