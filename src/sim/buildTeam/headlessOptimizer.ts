// Wuthering Tools+ — "Build it for me": upstream's echo optimizer without the Calculator page.
//
// `prepareMemberJob` builds one character's optimizer input from stored data alone: the context comes from
// `buildCharacterCalculationContext` (src/calculator/buildCharacterContext.ts — base stats, weapon, talents, buffs,
// team buffs, final stats, the pipeline Calculator.vue runs reactively), laid out field for field the way
// Calculator.vue's `handleOptimize` lays out its `optimizerContext`; the rotation through upstream's
// `buildOptimizerRotationData`; the set-bonus and main-echo buffs through the calculator's own resolvers
// (`resolveSetBonusStats`, `applyMainEchoBuffEffects` + `mergeMainEchoBuffStats`) from the exact settings the saved
// build will carry — which is what makes the optimizer's score and the calculator's number for the produced build the
// same (`buildTeam.test.ts` "parity").
//
// Backends run the search: `inlineBackend()` here (Node, tests: perf's `optimizerLoadoutStream` + upstream's
// exported scorers, one thread) and `workerBackend()` (workerBackend.ts: upstream's generator / processor workers,
// driven from the main thread like Calculator.vue's `optimizeWithWorkers`). No Vue, no stores.
import {
  buildCharacterCalculationContext,
  resolveEnemyResistForElement,
  type CharacterCalculationContext,
  type TeamEnemyConfig,
} from "../../calculator/buildCharacterContext";
import type { CharacterRotationInput } from "../../calculator/characterRotation";
import { KIT_CONSTANT_ER } from "../energy/energyHave";
import {
  computeLoadoutFinalStats,
  computeOverrideBuffVariants,
  normalizeLoadoutFormat,
  type OptimizerContext,
  type OptimizerLoadoutFormat,
} from "../../calculator/optimizer";
import { buildOptimizerRotationData, type OptimizerRotationData } from "../../calculator/rotationData";
import { computeResonanceChainsBuffs, computeSelfBuffs } from "../../calculator/stats";
import { meetsMinStatThreshold } from "../../calculator/meetsMinStatThreshold";
import { resolveActiveStance } from "../../calculator/stances";
import { getCalculatorMainEchoBuffEntry, getMainEchoBuffEntry, type OptimizerBuffEntry } from "../../calculator/optimizerBuffStatus";
import { applyMainEchoBuffEffects } from "../../echoes/applyMainEchoBuffEffects";
import { resolveSetBonusStats } from "../../echoes/echoSetPassives";
import { mainEchoesData } from "../../echoes/index";
import { getMainEchoBuffStacks, getMainEchoBuffs, isMainEchoBuffEnabled, mergeMainEchoBuffStats, type MainEchoState } from "../../echoes/mainEchoBuffs";
import { getSetBonusEffectsFromListOfSetKeys, getSetLabelByKey, setBonusEffectsTwo } from "../../echoes/sets";
import { normalizeOptimizerLoadoutCached, optimizerLoadoutStream, planOptimizerGeneration, pruneSetupOf } from "../optimizer/optimizerPool";
import { createLoadoutPruner } from "../optimizer/loadoutBound";
import { scoreOptimizerRotationDeduped } from "../optimizer/rotationScore";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** What a member is scored on: a team's slot actions (the team's own rotation) or the character's best rotation. */
export interface Objective {
  rotation: CharacterRotationInput;
  /** "Team rotation", or the rotation's name */
  label: string;
  source: "team" | "yours" | "curated" | "wuwa_calc";
}

/** Settings for the set-bonus passives and main-echo buffs the run assumed — written into the saved build so the
 *  calculator reads the same. Unset ones are switched on at their max stacks (what Riley's run plays). */
export interface BuffConfig {
  echoSetPassives: Record<string, OptimizerBuffEntry>;
  /** per candidate main echo: its buffs' settings */
  mainEchoBuffs: Record<string, Record<string, OptimizerBuffEntry>>;
  /** passives / buffs nobody had set, switched on here (for the page's note) */
  defaulted: string[];
}

export interface MemberJob {
  characterId: string;
  /** a stable id for the job (backends cache workers / precomputed buffs per job) */
  id: string;
  /** serialisable: no functions (the inline backend adds `getRotationById`) */
  context: Omit<OptimizerContext, "getRotationById" | "onProgress">;
  rotation: CharacterRotationInput;
  rotationData: OptimizerRotationData;
  /** "Rotation:<id>" */
  target: string;
  damageType: "Average";
  /** per set-bonus label ("Moonlit Clouds 5 Set"), every bonus of every set the pool may hold */
  echoSetPassiveBuffs: Record<string, Record<string, unknown>>;
  /** per main-echo key, the merged stats of its enabled buffs */
  mainEchoStats: Record<string, Record<string, unknown>>;
  buffConfig: BuffConfig;
  /** the build's ER with every buff the run counts minus its character-screen ER (decimal): a floor on the screen ER
   *  is a floor of `floor + erOffset` on the optimizer's `energyRegen` (checked exactly after the run) */
  erOffset: number;
  /** the current build's character-screen ER (%) */
  currentMenuEr: number | null;
}

/** One loadout the optimizer kept, or one the scorer scored. Echoes are the pool's objects (slot 0 = main echo). */
export interface ScoredLoadout {
  loadout: any[];
  targetValue: number;
  /** `finalStats.energyRegen` as the optimizer read it (decimal) */
  energyRegen: number;
}

export interface OptimizeRequest {
  pool: any[];
  mainEchoKeys: string[];
  loadoutFormat: OptimizerLoadoutFormat;
  /** `{ stat: "energyRegen", minValue: % }` rows, upstream's shape */
  minStats: Array<{ stat: string; minValue: number }>;
  topN: number;
}

export interface OptimizeProgress {
  processed: number;
  generated: number;
}

export interface OptimizeOutcome {
  results: ScoredLoadout[];
  /** loadouts dealt with: scored, or ruled out by the bound (the inline backend), as before the bound existed */
  processed: number;
  generated: number;
  /** inline backend: loadouts actually scored, those the bound ruled out, and the bounds computed */
  scored?: number;
  pruned?: number;
  bounds?: number;
}

export interface OptimizerBackend {
  optimize(job: MemberJob, request: OptimizeRequest, opts?: { signal?: AbortSignal; onProgress?: (p: OptimizeProgress) => void }): Promise<OptimizeOutcome>;
  /** scores explicit loadouts on the job (the swap pass); null where a loadout cannot be scored */
  score(job: MemberJob, loadouts: any[][], opts?: { signal?: AbortSignal }): Promise<Array<ScoredLoadout | null>>;
  dispose?(): void;
}

/** Scores this close (relative) are one score reached by a different sum, not two. */
const SAME_SCORE = 1e-9;
/** How far `bestLoadoutOf` follows a tie: 5, 40, then this. */
export const MAX_TIE_SEARCH = 320;

/** The order ties break in: the main echo's id, then the other ids sorted, each a plain string compare (no locale). */
function loadoutIdKey(l: ScoredLoadout): string {
  const ids = l.loadout.map((e) => String(e?.echoId));
  return `${ids[0]}|${ids.slice(1).sort().join(",")}`;
}

/** Which of two loadouts tied on score to keep: the fuller one (a slot left empty gains nothing), then the lower ids. */
const winsTie = (a: ScoredLoadout, b: ScoredLoadout): boolean => (a.loadout.length !== b.loadout.length ? a.loadout.length > b.loadout.length : loadoutIdKey(a) < loadoutIdKey(b));

/**
 * The best loadout of a search, the same one on every backend. Upstream's top N keeps the first of equal scores, and what
 * comes first differs: the inline loop walks the stream in order, each processor worker keeps its own heap of the
 * batches it happened to get, and the main thread merges them as they answer. So a tie at the top can't be left to
 * `results[0]`, and a top N full of ties may be missing some of them. The request is widened until the results reach
 * past the tied group (a group smaller than the top N is complete on every backend: nothing in it can be pushed out),
 * and the lowest echo ids win. Past `MAX_TIE_SEARCH` ties (every loadout scoring 0, say) the pick is the lowest ids
 * among what came back.
 */
export async function bestLoadoutOf(backend: OptimizerBackend, job: MemberJob, request: OptimizeRequest, opts: NonNullable<Parameters<OptimizerBackend["optimize"]>[2]> = {}): Promise<{ best: ScoredLoadout | null; processed: number }> {
  let processed = 0;
  for (let topN = request.topN; ; topN = Math.min(topN * 8, MAX_TIE_SEARCH)) {
    const before = processed;
    const run = await backend.optimize(job, { ...request, topN }, { signal: opts.signal, onProgress: (p) => opts.onProgress?.({ processed: before + p.processed, generated: p.generated }) });
    processed += run.processed;
    if (!run.results.length) return { best: null, processed };
    const top = run.results.reduce((n, r) => Math.max(n, r.targetValue), -Infinity);
    const tied = run.results.filter((r) => r.targetValue >= top - Math.abs(top) * SAME_SCORE);
    const complete = run.results.length < topN || tied.length < run.results.length;
    if (complete || topN >= MAX_TIE_SEARCH) return { best: tied.reduce((a, b) => (winsTie(b, a) ? b : a)), processed };
  }
}

let jobCounter = 0;

/** Every set-bonus label of these sets (1 / 2 / 3 / 5 pieces), with its definition. */
export function setBonusDefsOf(setKeys: readonly string[]): Array<{ label: string; def: any }> {
  const out: Array<{ label: string; def: any }> = [];
  for (const def of getSetBonusEffectsFromListOfSetKeys([...new Set(setKeys)])) {
    const label = Object.keys(setBonusEffectsTwo).find((l) => (setBonusEffectsTwo as Record<string, any>)[l] === def) ?? getSetLabelByKey(def.key);
    if (label) out.push({ label, def });
  }
  return out;
}

/** The settings the run uses for the pool's set passives and the candidate main echoes' buffs: the optimizer's own
 *  saved setting, else the calculator's, else on at max stacks (upstream's resolution order, `optimizerBuffStatus.ts`,
 *  with "unset" read as Riley's run plays it instead of off). */
export function buffConfigOf(characterData: Record<string, any>, setKeys: readonly string[], mainEchoKeys: readonly string[]): BuffConfig {
  const defaulted: string[] = [];
  const echoSetPassives: Record<string, OptimizerBuffEntry> = {};
  for (const { def } of setBonusDefsOf(setKeys)) {
    for (const passive of (def.passives ?? []) as any[]) {
      const key = String(passive.key);
      if (key in echoSetPassives) continue;
      const own = characterData.optimizer?.echoSetPassives?.[key] ?? characterData.echoSetPassives?.[key];
      if (own) echoSetPassives[key] = { ...own };
      else if (passive.alwaysEnabled) echoSetPassives[key] = { isEnabled: true };
      else {
        echoSetPassives[key] = passive.hasStacks ? { isEnabled: true, stacks: Number(passive.maxStacks ?? 0) } : { isEnabled: true };
        defaulted.push(key);
      }
    }
  }
  const mainEchoBuffs: Record<string, Record<string, OptimizerBuffEntry>> = {};
  for (const echoKey of new Set(mainEchoKeys)) {
    const echo = (mainEchoesData as Record<string, any>)[echoKey];
    if (!echo) continue;
    const buffs: Record<string, OptimizerBuffEntry> = {};
    for (const buff of getMainEchoBuffs(echo)) {
      const own =
        getMainEchoBuffEntry(characterData.optimizer?.mainEchoBuffs?.[echoKey], buff.key) ??
        getCalculatorMainEchoBuffEntry(characterData.mainEcho as MainEchoState | undefined, echoKey, buff.key);
      if (own) buffs[buff.key] = { ...own };
      else {
        buffs[buff.key] = buff.hasStacks ? { isEnabled: true, stacks: buff.maxStacks } : { isEnabled: true };
        if (!buff.alwaysEnabled) defaulted.push(`${echoKey}:${buff.key}`);
      }
    }
    mainEchoBuffs[echoKey] = buffs;
  }
  return { echoSetPassives, mainEchoBuffs, defaulted };
}

/** The `mainEcho` record a saved build carries for main echo `echoKey` at `rank` with these buff settings — the
 *  shape `buildCharacterCalculationContext` reads (a per-buff map). */
export function mainEchoRecordOf(echoKey: string, rank: number, buffs: Record<string, OptimizerBuffEntry> = {}): MainEchoState {
  return { echo: echoKey, rank, buffs: Object.fromEntries(Object.entries(buffs).map(([k, v]) => [k, { ...v }])) };
}

/** A main echo's buff stats under these settings, merged the way `buildCharacterCalculationContext` merges them. */
export function mainEchoStatsOf(characterId: string, echoKey: string, buffs: Record<string, OptimizerBuffEntry>, talentData: Record<string, any>): Record<string, unknown> {
  const echo = (mainEchoesData as Record<string, any>)[echoKey];
  const state = mainEchoRecordOf(echoKey, 5, buffs);
  const byKey: Record<string, Record<string, unknown>> = {};
  for (const buff of getMainEchoBuffs(echo)) {
    if (!isMainEchoBuffEnabled(state, buff.key)) continue;
    byKey[buff.key] = applyMainEchoBuffEffects({ effects: buff.effects, character: characterId, hasStacks: buff.hasStacks, stacks: getMainEchoBuffStacks(state, buff.key), talentData });
  }
  return mergeMainEchoBuffStats(byKey, {});
}

/** Calculator.vue `handleOptimize`'s `optimizerContext`, from a headless character context. */
export function optimizerContextOf(characterId: string, characterData: Record<string, any>, built: CharacterCalculationContext, characters: Record<string, any>, enemy: TeamEnemyConfig, echoSetPassivesConfig: Record<string, OptimizerBuffEntry>): MemberJob["context"] {
  const chosen = built.chosenChar;
  const weapon = characterData.weapon ?? null;
  const fs = built.finalStats ?? {};
  return {
    chosenChar: chosen,
    character: characterId,
    characterLevel: built.characterLevel,
    talentData: { ...built.talentData },
    baseHp: built.baseHp,
    baseAtk: built.baseAtk,
    baseDef: built.baseDef,
    weaponData: {
      attack: built.weaponData.attack ?? 0,
      modifier: built.weaponData.modifier ?? null,
      modifierValue: built.weaponData.modifierValue ?? 0,
      weaponPassiveStats: built.weaponData.weaponPassiveStats ?? {},
      weaponPassiveDefs: built.definitions.weaponPassives ?? [],
      refinement: String((weapon && characterData.weapons?.[weapon]?.refinement) ?? "1"),
    },
    charBuffsData: built.charBuffsData,
    charResonanceChainsData: built.charResonanceChainsData,
    teamBuffsData: built.teamBuffsData,
    customBuffs: built.customBuffs,
    echoSetPassivesConfig,
    echoStats: built.echoStats,
    enemyLevel: enemy.enemyLevel,
    enemyResist: resolveEnemyResistForElement(enemy, chosen?.basic?.element),
    enemyType: enemy.enemyType,
    isSpectroFrazzleEnabled: Boolean(chosen?.basic?.spectroFrazzle),
    spectroFrazzleStacks: enemy.spectroFrazzleStacks ?? 0,
    isAeroErosionEnabled: Boolean(chosen?.basic?.aeroErosion),
    aeroErosionStacks: enemy.aeroErosionStacks ?? 0,
    havocBaneStacks: enemy.havocBaneStacks ?? 0,
    isFusionBurstEnabled: Boolean(chosen?.basic?.fusionBurst),
    fusionBurstStacks: enemy.fusionBurstStacks ?? 0,
    isElectroFlareEnabled: Boolean(chosen?.basic?.electroFlare),
    electroFlareStacks: enemy.electroFlareStacks ?? 0,
    electroRageStacks: enemy.electroRageStacks ?? 0,
    isGlacioChafeEnabled: Boolean(chosen?.basic?.glacioChafe),
    glacioChafeStacks: enemy.glacioChafeStacks ?? 0,
    strainStacks: enemy.strainStacks ?? 0,
    mainEcho: built.mainEcho,
    mainEchoRank: built.mainEchoRank,
    rotationsList: [],
    Glacio: fs.glacio ?? 0,
    Fusion: fs.fusion ?? 0,
    Electro: fs.electro ?? 0,
    Aero: fs.aero ?? 0,
    Spectro: fs.spectro ?? 0,
    Havoc: fs.havoc ?? 0,
    characters,
    activeCharacterBuffs: characterData.buffs ?? {},
    activeCharacterResonanceChains: characterData.resonanceChains ?? {},
    activeStance: characterData.activeStance ?? resolveActiveStance(chosen?.basic?.stances, undefined, characterData.buffs),
  };
}

export interface PrepareJobInput {
  characterId: string;
  /** the records the slot runs on: its build resolved, team buffs from the team (resolveTeamCharacters) */
  characters: Record<string, any>;
  inventoryEchoes: any[];
  enemy: TeamEnemyConfig;
  objective: Objective;
  /** sets the pool may hold (their set-bonus buffs are precomputed) */
  setKeys: string[];
  /** species slot 0 may be (their main-echo buffs are precomputed) */
  mainEchoKeys: string[];
}

export async function prepareMemberJob(input: PrepareJobInput): Promise<MemberJob> {
  const { characterId, characters, inventoryEchoes, enemy, objective } = input;
  const characterData = characters[characterId] ?? {};
  const built = await buildCharacterCalculationContext(characterId, characters, enemy, inventoryEchoes);
  const menu = await buildCharacterCalculationContext(characterId, characters, enemy, inventoryEchoes, { alwaysEnabledOnly: true });
  const buffConfig = buffConfigOf(characterData, input.setKeys, input.mainEchoKeys);
  const echoSetPassivesConfig = { ...(characterData.echoSetPassives ?? {}), ...buffConfig.echoSetPassives };
  const talentData = built.talentData as Record<string, any>;
  const echoSetPassiveBuffs: Record<string, Record<string, unknown>> = {};
  for (const { label, def } of setBonusDefsOf(input.setKeys)) echoSetPassiveBuffs[label] = resolveSetBonusStats(def, echoSetPassivesConfig, talentData);
  const mainEchoStats: Record<string, Record<string, unknown>> = {};
  for (const [echoKey, buffs] of Object.entries(buffConfig.mainEchoBuffs)) mainEchoStats[echoKey] = mainEchoStatsOf(characterId, echoKey, buffs, talentData);
  const rotation = { ...objective.rotation, id: objective.rotation.id || `bt-${characterId}` };
  const rotationData = buildOptimizerRotationData({ ...rotation, actions: rotation.actions as any[] }, built.chosenChar, built.characterLevel);
  const fullEr = Number(built.finalStats?.energyRegen);
  // the Energy check's "have" (energyHave.ts): the build card's ER plus a kit's constant ER that the app keeps as a
  // toggle (Mornye's +10 % inherent), so the floor — wuwa_calc's need — is held on the basis /energy shows
  const menuEr = Number(menu.finalStats?.energyRegen) + (KIT_CONSTANT_ER[characterId] ?? 0) / 100;
  return {
    characterId,
    id: `bt${++jobCounter}-${characterId}`,
    context: optimizerContextOf(characterId, characterData, built, characters, enemy, echoSetPassivesConfig),
    rotation,
    rotationData,
    target: `Rotation:${rotation.id}`,
    damageType: "Average",
    echoSetPassiveBuffs,
    mainEchoStats,
    buffConfig,
    erOffset: Number.isFinite(fullEr) && Number.isFinite(menuEr) ? fullEr - menuEr : 0,
    currentMenuEr: Number.isFinite(menuEr) && characterData.weapon ? Math.round(menuEr * 1e6) / 1e4 : null,
  };
}

/** The min-stat row for an ER floor (%, the Energy check's basis), on the optimizer's `energyRegen` (upstream's display units). */
export function erMinStat(job: Pick<MemberJob, "erOffset">, floor: number | null): Array<{ stat: string; minValue: number }> {
  if (floor == null || !(floor > 0)) return [];
  return [{ stat: "energyRegen", minValue: Math.round((floor + job.erOffset * 100) * 1e6) / 1e6 }];
}

/** The optimizer's `energyRegen` (decimal) as the Energy check reads it (%, `menuEnergyRegen`), by the job's offset. */
export const menuErOf = (job: Pick<MemberJob, "erOffset">, energyRegen: number): number => Math.round((energyRegen - job.erOffset) * 1e6) / 1e4;

/* --------------------------------------------------------------------------------------- inline backend */

interface JobPrecompute {
  context: OptimizerContext;
  selfBuffsData: any;
  resonanceChainsBuffsData: any;
  overrideBuffVariants: ReturnType<typeof computeOverrideBuffVariants>;
}

/** The processor worker's per-run precompute (processor.worker.ts `init`), once per job. */
function precomputeOf(job: MemberJob, cache: Map<string, JobPrecompute>): JobPrecompute {
  let pre = cache.get(job.id);
  if (pre) return pre;
  const context = { ...job.context, getRotationById: () => job.rotation } as OptimizerContext;
  pre = {
    context,
    resonanceChainsBuffsData: computeResonanceChainsBuffs(context.activeCharacterResonanceChains ?? {}, context.chosenChar?.resonanceChains ?? [], context.talentData ?? {}, context.activeStance ?? null),
    selfBuffsData: computeSelfBuffs(
      context.activeCharacterBuffs ?? {},
      context.chosenChar?.buffs ?? [],
      context.activeCharacterResonanceChains ?? {},
      context.talentData ?? {},
      context.character ?? null,
      context.activeStance ?? null,
      { havocBaneStacks: context.havocBaneStacks ?? 0 },
    ),
    overrideBuffVariants: job.rotationData.overrideActions.length ? computeOverrideBuffVariants(job.rotationData.overrideActions, context) : new Map(),
  };
  cache.set(job.id, pre);
  return pre;
}

/** One loadout's score with its stats — the processor worker's `processLoadout` for a `Rotation:` / `Stat:` target,
 *  through the same exported functions (`computeLoadoutFinalStats`, and upstream's `scoreOptimizerRotation` with each
 *  distinct action scored once, `rotationScore.ts`). `floor`: when the energy-regen rows fail, null before the score. */
function scoreWithFloor(job: MemberJob, loadout: any[], pre: JobPrecompute, minStats: OptimizeRequest["minStats"] | null): ScoredLoadout | null {
  // upstream's slot sort with each echo's signature memoised (same order, optimizerPool.test.ts)
  const normalized = normalizeOptimizerLoadoutCached(loadout);
  const stats = computeLoadoutFinalStats(normalized, pre.context, pre.selfBuffsData, pre.resonanceChainsBuffsData, job.echoSetPassiveBuffs, job.mainEchoStats);
  const energyRegen = Number(stats.finalStats?.energyRegen ?? 0);
  if (minStats?.length) {
    // the rows read the optimizer's energyRegen only (what build-team sends); any other row fails, as it always did
    const er = { energyRegen } as Record<string, number>;
    if (!minStats.every((m) => meetsMinStatThreshold(er[m.stat], m.minValue, m.stat))) return null;
  }
  const [targetType, targetObject] = job.target.split(":");
  if (targetType === "Stat") return { loadout: normalized, targetValue: Number(stats.finalStats?.[targetObject!] ?? 0) || 0, energyRegen };
  const { damageAggregation } = scoreOptimizerRotationDeduped(job.rotationData, normalized, stats, pre.context, pre.overrideBuffVariants, { attacks: false });
  return { loadout: normalized, targetValue: Number(damageAggregation.avgDamage ?? 0) || 0, energyRegen };
}

/** One loadout's rotation score — the processor worker's `processLoadout` for a `Rotation:` target, through the same
 *  exported functions (`computeLoadoutFinalStats`, `scoreOptimizerRotation`). */
export function scoreLoadoutInline(job: MemberJob, loadout: any[], cache: Map<string, JobPrecompute> = new Map()): ScoredLoadout {
  return scoreWithFloor(job, loadout, precomputeOf(job, cache), null)!;
}

const abortError = (): Error => Object.assign(new Error("The optimizer run was cancelled"), { name: "AbortError" });

/** Upstream's optimizer in one thread: perf's deduped stream (`planOptimizerGeneration` + `optimizerLoadoutStream`,
 *  the cost format honoured — upstream's inline `optimize()` ignores it) and the processor's scoring, with the exact
 *  speedups of track "optimizer-speed" (README "Performance: exact optimizer speedups"): the energy-regen floor checked
 *  before the rotation is scored, each distinct rotation action scored once, and the bound skip (`loadoutBound.ts`) —
 *  loadouts whose subtree cannot beat the current 5th score are not scored. The results are the ones
 *  `referenceOptimize` (the loop as it was) returns, loadout for loadout and bit for bit (`optimizerEquivalence.test.ts`). */
export function inlineBackend(options: { bound?: boolean; minSubtree?: number } = {}): OptimizerBackend {
  const cache = new Map<string, JobPrecompute>();
  return {
    async optimize(job, request, opts = {}) {
      const plan = planOptimizerGeneration({
        echoes: request.pool,
        mainEchoKeys: request.mainEchoKeys,
        loadoutFormat: request.loadoutFormat,
        topN: request.topN,
        target: job.target,
        echoSetPassiveBuffs: job.echoSetPassiveBuffs,
        mainEchoStats: job.mainEchoStats,
        context: job.context,
        rotationData: job.rotationData,
      });
      const pre = precomputeOf(job, cache);
      const pruner =
        options.bound === false
          ? null
          : createLoadoutPruner(
              pruneSetupOf(plan, request.mainEchoKeys, request.loadoutFormat),
              {
                context: pre.context,
                selfBuffsData: pre.selfBuffsData,
                resonanceChainsBuffsData: pre.resonanceChainsBuffsData,
                echoSetPassiveBuffs: job.echoSetPassiveBuffs,
                mainEchoStats: job.mainEchoStats,
                target: job.target,
                damageType: "Average",
                rotationData: job.rotationData,
                minStats: request.minStats,
              },
              { minSubtree: options.minSubtree },
            );
      const heap: ScoredLoadout[] = [];
      let generated = 0;
      let processed = 0;
      let scored = 0;
      const format = normalizeLoadoutFormat(request.loadoutFormat);
      for (const loadout of optimizerLoadoutStream(plan.echoes, request.mainEchoKeys, format, 0, 1, { uniquePool: plan.uniquePool, skipDominatedPartials: plan.skipDominatedPartials })) {
        if (opts.signal?.aborted) throw abortError();
        generated += 1;
        processed += 1;
        // the score a loadout must beat to enter the top N (heap sorted best first; kept only when strictly above)
        const bar = heap.length >= request.topN && heap.length > 0 ? heap[heap.length - 1]!.targetValue : null;
        const skip = pruner !== null && pruner.skip(loadout, bar);
        const result = skip ? null : scoreWithFloor(job, loadout, pre, request.minStats);
        if (!skip) scored += 1;
        if (processed % 2000 === 0) opts.onProgress?.({ processed, generated });
        if (!result) continue;
        if (heap.length < request.topN) heap.push(result);
        else if (result.targetValue > heap[heap.length - 1]!.targetValue) heap[heap.length - 1] = result;
        else continue;
        heap.sort((a, b) => b.targetValue - a.targetValue);
      }
      opts.onProgress?.({ processed, generated });
      return { results: heap, processed, generated, scored, pruned: pruner?.stats.skipped ?? 0, bounds: pruner?.stats.bounds ?? 0 };
    },
    async score(job, loadouts, opts = {}) {
      return loadouts.map((l) => {
        if (opts.signal?.aborted) throw abortError();
        try {
          return scoreLoadoutInline(job, l, cache);
        } catch {
          return null;
        }
      });
    },
    dispose: () => cache.clear(),
  };
}
