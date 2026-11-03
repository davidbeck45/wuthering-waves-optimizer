// Wuthering Tools+ Echo Lab page — the page's state: the account snapshot handed to the worker, the jobs it runs
// (the whole-account pass, every character's benchmark, a character's re-roll advice), their progress, cancel, and
// the results — kept at module level so switching tabs or pages never recomputes, and in sessionStorage per
// account fingerprint so a reload of the same account is instant. All numbers come from the worker
// (echoLabClient.ts); this file only moves them. Vue, not engine: keep the engine pure.
import { computed, reactive, ref, shallowRef } from "vue";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { isSetUp } from "../myRankings/rankRoster";
import { CANCELLED, type LabAccount, type LabProgress } from "./core";
import { getEchoLabClient, labAccountOf } from "./echoLabClient";
import { accountFingerprint } from "./fingerprint";
import type { BenchmarkBatchResult, EchoLabJob, EchoLabPassResult, EchoLabResult } from "./pass";
import type { RerollAdviceResult } from "./rerollAdvice";
import { rerollOptionsFor } from "./rerollPick";
import type { RollQualityResult, RollQualityTarget } from "./rollQuality";
import type { RollRating, RollRatingItem } from "./rollRatings";
import type { TunerCandidatesResult } from "./tunerPlan";
import { erNeedsOf } from "../energy/energySubstats";
import { useEnergyNeeds } from "../energy/useEnergyNeeds";

/** sessionStorage: the last pass and benchmarks of one account fingerprint (derived data, safe to drop) */
export const ECHO_LAB_CACHE_KEY = "wtplus:echoLab:cache";
/** bump when the cached result shapes change: an older tab's cache is then ignored, never rendered */
const CACHE_VERSION = 2;

export interface JobStatus {
  running: boolean;
  /** the last run was cancelled */
  cancelled: boolean;
  progress: LabProgress | null;
  error: string | null;
  /** the last finished run: how long it took and whether the worker answered from its cache */
  ms: number | null;
  cached: boolean;
}

const idle = (): JobStatus => ({ running: false, cancelled: false, progress: null, error: null, ms: null, cached: false });

// ── module state (one Echo Lab per app) ──
const pass = shallowRef<EchoLabPassResult | null>(null);
const passStatus = reactive<JobStatus>(idle());
const benchmarks = shallowRef<BenchmarkBatchResult | null>(null);
const benchStatus = reactive<JobStatus>(idle());
/** re-roll advice by `${fingerprint}|${characterId}|${slot}` */
const rerolls = reactive(new Map<string, RerollAdviceResult | { error: string }>());
/** the Tuner plan's candidates (the budget is applied on the page, tunerBudget.ts) */
const tunerPlan = shallowRef<TunerCandidatesResult | null>(null);
const tunerStatus = reactive<JobStatus>(idle());
/** "How good is this roll" by `${fingerprint}|${echoId}|${characterId}|${slot}` */
const qualities = reactive(new Map<string, RollQualityResult | { error: string }>());
/** the inventory's quick roll ratings (rollRatings.ts) by `${echoId}|${characterId}|${slot}`, for `resultFingerprint`;
 *  `null` = tried, could not be rated */
const ratings = reactive(new Map<string, RollRating | null>());
let tunerAbort: AbortController | null = null;
const resultFingerprint = ref<string | null>(null);
let passAbort: AbortController | null = null;
let benchAbort: AbortController | null = null;
let hydrated = false;
/** the ER needs of the saved teams, resolved once per account state (the benchmark and re-roll jobs share them) */
let needsMemo: { fingerprint: string; needs: Promise<Record<string, number>> } | null = null;

/** Every character's ER need (%) in their saved teams — the floor the benchmark and the re-roll advice respect.
 *  Empty when the energy check fails; one lookup per account state. */
export function echoLabErNeeds(fingerprint: string): Promise<Record<string, number>> {
  if (needsMemo?.fingerprint !== fingerprint) needsMemo = { fingerprint, needs: erNeedsOf(useEnergyNeeds()).catch(() => ({})) };
  return needsMemo.needs;
}

interface StoredCache {
  v: number;
  fingerprint: string;
  pass: EchoLabPassResult | null;
  benchmarks: BenchmarkBatchResult | null;
  /** added with the Tuner plan (an older cache of the same version simply has none) */
  tunerPlan?: TunerCandidatesResult | null;
  /** added with the inventory's roll chips (2026-11-02; same rule: older caches have none) */
  ratings?: RollRating[];
}

function readCache(): StoredCache | null {
  try {
    const text = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(ECHO_LAB_CACHE_KEY) : null;
    const stored = text ? (JSON.parse(text) as StoredCache) : null;
    return stored?.v === CACHE_VERSION && typeof stored.fingerprint === "string" ? stored : null;
  } catch {
    return null;
  }
}

function writeCache(): void {
  if (!resultFingerprint.value) return;
  try {
    const rated = [...ratings.values()].filter((r): r is RollRating => r !== null);
    const value: StoredCache = { v: CACHE_VERSION, fingerprint: resultFingerprint.value, pass: pass.value, benchmarks: benchmarks.value, tunerPlan: tunerPlan.value, ratings: rated };
    sessionStorage.setItem(ECHO_LAB_CACHE_KEY, JSON.stringify(value));
  } catch {
    // quota or no storage: the module cache still holds it for this page load
  }
}

const ratingKey = (t: { echoId: string; characterId: string; slot: number }): string => `${t.echoId}|${t.characterId}|${t.slot}`;

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));
const isCancel = (err: unknown): boolean => err instanceof Error && err.name === CANCELLED;

/** Results that belong to another account state are dropped (never shown against the wrong data). */
function adopt(fingerprint: string): void {
  if (resultFingerprint.value === fingerprint) return;
  resultFingerprint.value = fingerprint;
  pass.value = null;
  benchmarks.value = null;
  tunerPlan.value = null;
  rerolls.clear();
  qualities.clear();
  ratings.clear();
  Object.assign(passStatus, idle());
  Object.assign(benchStatus, idle());
  Object.assign(tunerStatus, idle());
}

export function useEchoLab() {
  const characterStore = useCharacterStore() as unknown as { characters: Record<string, any> };
  const inventoryStore = useInventoryStore() as unknown as { echoes: any[]; equipped: Record<string, Record<string, number>> };
  const teamStore = useTeamRotationsStore() as unknown as { teams: any[] };

  const echoCount = computed(() => (inventoryStore.echoes ?? []).length);
  const builtCount = computed(() => Object.values(characterStore.characters ?? {}).filter((c) => isSetUp(c)).length);

  function snapshot(): { account: LabAccount; fingerprint: string } {
    const account = labAccountOf({
      characters: characterStore.characters,
      echoes: inventoryStore.echoes,
      equipped: inventoryStore.equipped,
      teams: teamStore.teams,
    });
    return { account, fingerprint: accountFingerprint(account) };
  }

  async function run<J extends EchoLabJob>(job: J, status: JobStatus, signal: AbortSignal, account: LabAccount): Promise<EchoLabResult<J> | null> {
    Object.assign(status, { running: true, cancelled: false, progress: null, error: null });
    try {
      const result = await getEchoLabClient().run(job, account, {
        signal,
        // Tune or Feed runs inside the echo phase with its own counts: keep the echo count on the bar
        onProgress: (p) => {
          if (p.phase === "potential" && status.progress?.phase === "echoes") return;
          status.progress = p;
        },
        onInfo: (info) => Object.assign(status, { ms: info.ms, cached: info.cached }),
      });
      return result;
    } catch (err) {
      status.cancelled = isCancel(err);
      status.error = status.cancelled ? null : errorText(err);
      return null;
    } finally {
      status.running = false;
      status.progress = null;
    }
  }

  /** Brings the page up to date: cached results for this account, or a fresh pass. */
  async function refresh(options: { force?: boolean } = {}): Promise<void> {
    const { account, fingerprint } = snapshot();
    if (!hydrated) {
      hydrated = true;
      const stored = readCache();
      if (stored && stored.fingerprint === fingerprint && !pass.value) {
        resultFingerprint.value = fingerprint;
        pass.value = stored.pass;
        benchmarks.value = stored.benchmarks;
        tunerPlan.value = stored.tunerPlan ?? null;
        for (const r of stored.ratings ?? []) ratings.set(ratingKey(r), r);
        passStatus.cached = true;
      }
    }
    adopt(fingerprint);
    if (!account.echoes.length || !builtCount.value) return;
    if (pass.value && !options.force) return;
    if (passStatus.running) return;
    passAbort?.abort();
    const controller = new AbortController();
    passAbort = controller;
    const result = await run({ kind: "pass" }, passStatus, controller.signal, account);
    if (passAbort === controller) passAbort = null;
    if (result && resultFingerprint.value === fingerprint) {
      pass.value = result;
      writeCache();
    }
  }

  async function runBenchmarks(options: { force?: boolean } = {}): Promise<void> {
    const { account, fingerprint } = snapshot();
    adopt(fingerprint);
    if ((benchmarks.value && !options.force) || benchStatus.running || !builtCount.value) return;
    benchAbort?.abort();
    const controller = new AbortController();
    benchAbort = controller;
    // Wuthering Tools+ energy check: ER counts as a floor up to each character's need in their saved teams
    const erNeeds = await echoLabErNeeds(fingerprint);
    // only the characters the pass could score (a weapon and five echoes): the progress counts what gets a row
    const characterIds = pass.value && resultFingerprint.value === fingerprint ? pass.value.bestOwner.characters.map((c) => c.id) : undefined;
    const result = await run({ kind: "benchmark", characterIds, options: { erNeeds } }, benchStatus, controller.signal, account);
    if (benchAbort === controller) benchAbort = null;
    if (result && resultFingerprint.value === fingerprint) {
      benchmarks.value = result;
      writeCache();
    }
  }

  const rerollKey = (characterId: string, slot: number): string => `${resultFingerprint.value}|${characterId}|${slot}`;

  /** Re-roll advice for one equipped echo (cached per account state). */
  async function runReroll(characterId: string, slot: number, signal: AbortSignal): Promise<void> {
    const { account, fingerprint } = snapshot();
    adopt(fingerprint);
    const key = rerollKey(characterId, slot);
    if (rerolls.has(key)) return;
    try {
      // Wuthering Tools+ energy check: an ER line the build needs is locked, and ER counts as a floor
      const options = rerollOptionsFor(await echoLabErNeeds(fingerprint), characterId);
      if (signal.aborted) return;
      const result = await getEchoLabClient().run({ kind: "reroll", characterId, slot, options }, account, { signal });
      if (resultFingerprint.value === fingerprint) rerolls.set(key, result);
    } catch (err) {
      if (!isCancel(err) && resultFingerprint.value === fingerprint) rerolls.set(key, { error: errorText(err) });
    }
  }

  const rerollOf = (characterId: string, slot: number): RerollAdviceResult | { error: string } | null => rerolls.get(rerollKey(characterId, slot)) ?? null;

  /** The Tuner plan's candidates: every unfinished echo worth a Tuner, and where a fresh echo pays most. */
  async function runTunerPlan(options: { force?: boolean } = {}): Promise<void> {
    const { account, fingerprint } = snapshot();
    adopt(fingerprint);
    if ((tunerPlan.value && !options.force) || tunerStatus.running || !builtCount.value) return;
    tunerAbort?.abort();
    const controller = new AbortController();
    tunerAbort = controller;
    const result = await run({ kind: "tunerPlan" }, tunerStatus, controller.signal, account);
    if (tunerAbort === controller) tunerAbort = null;
    if (result && resultFingerprint.value === fingerprint) {
      tunerPlan.value = result;
      writeCache();
    }
  }

  const qualityKey = (echoId: string, target: RollQualityTarget | null): string => `${resultFingerprint.value}|${echoId}|${target?.characterId ?? ""}|${target?.slot ?? ""}`;

  /** "How good is this roll" for one echo, rated where it sits (target null) or in the given owner's slot. */
  async function runRollQuality(echoId: string, target: RollQualityTarget | null, signal: AbortSignal): Promise<void> {
    const { account, fingerprint } = snapshot();
    adopt(fingerprint);
    const key = qualityKey(echoId, target);
    if (qualities.has(key)) return;
    try {
      const result = await getEchoLabClient().run({ kind: "rollQuality", echoId, target }, account, { signal });
      if (resultFingerprint.value === fingerprint) qualities.set(key, result);
    } catch (err) {
      if (!isCancel(err) && resultFingerprint.value === fingerprint) qualities.set(key, { error: errorText(err) });
    }
  }

  const qualityOf = (echoId: string, target: RollQualityTarget | null): RollQualityResult | { error: string } | null => qualities.get(qualityKey(echoId, target)) ?? null;

  /** Quick roll ratings for a batch of echoes (the inventory's chips, rollRatings.ts): one worker job, merged into the
   *  module map. `given` lets a caller send one snapshot for several batches; `persist: false` skips the
   *  sessionStorage write (a caller's middle batches: the last one saves them all). Resolves false when cancelled, when
   *  the worker failed or when the account changed meanwhile. */
  async function runRollRatings(items: RollRatingItem[], signal: AbortSignal, given?: { account: LabAccount; fingerprint: string }, persist = true): Promise<boolean> {
    const { account, fingerprint } = given ?? snapshot();
    // a caller's older snapshot never adopts: an edit since then has already moved the page on to the new state
    if (given) {
      if (resultFingerprint.value !== fingerprint) return false;
    } else adopt(fingerprint);
    const todo = items.filter((item) => !ratings.has(ratingKey(item)));
    if (!todo.length) return true;
    try {
      const result = await getEchoLabClient().run({ kind: "rollRatings", items: todo }, account, { signal });
      if (resultFingerprint.value !== fingerprint) return false;
      for (const r of result.ratings) ratings.set(ratingKey(r), r);
      for (const e of result.errors) {
        const item = todo.find((t) => t.echoId === e.echoId);
        if (item) ratings.set(ratingKey(item), null);
      }
      if (persist) writeCache();
      return true;
    } catch {
      return false;
    }
  }

  /** the quick rating of an echo rated on this target: undefined = not asked yet, null = could not be rated */
  const ratingOf = (echoId: string, target: RollQualityTarget): RollRating | null | undefined => ratings.get(ratingKey({ echoId, ...target }));

  function cancel(): void {
    passAbort?.abort();
    benchAbort?.abort();
    tunerAbort?.abort();
  }

  return {
    pass,
    passStatus,
    benchmarks,
    benchStatus,
    echoCount,
    builtCount,
    refresh,
    runBenchmarks,
    runReroll,
    rerollOf,
    tunerPlan,
    tunerStatus,
    runTunerPlan,
    runRollQuality,
    qualityOf,
    runRollRatings,
    ratingOf,
    cancel,
    snapshot,
  };
}
