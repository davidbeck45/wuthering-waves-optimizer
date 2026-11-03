// Wuthering Tools+ Echo Lab page — the page's state: the account snapshot handed to the worker, the jobs it runs
// (the whole-account pass, every character's benchmark, a character's re-roll advice), their progress, cancel, and
// the results — kept at module level so switching tabs or pages never recomputes, and in sessionStorage per
// account fingerprint so a reload of the same account is instant — and, since 2026-11-02, saved in this browser
// (persist/savedResults.ts, IndexedDB) under the same fingerprint + the app build, so a new tab or another day paints
// the last pass, benchmarks and Tuner plan at once instead of running them again. All numbers come from the worker
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
import type { FarmNextResult, FarmTeamResult } from "./farmNext";
// Wuthering Tools+ team buffs from the team's real members (the app's switch, off under Cypress)
import { autoTeamBuffs } from "../teamContext/autoTeamBuffs";
import { erNeedsOf } from "../energy/energySubstats";
import { useEnergyNeeds } from "../energy/useEnergyNeeds";
import { onSavedResultsCleared, savedSlot } from "../persist/savedResults";

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
/** "Farm next": every slot's farm target (the first pass gives the most promising slots a team figure) */
const farm = shallowRef<FarmNextResult | null>(null);
const farmStatus = reactive<JobStatus>(idle());
/** team figures worked out on request, by `${fingerprint}|${characterId}|${slot}` */
const farmTeams = reactive(new Map<string, FarmTeamResult | { error: string } | "running">());
let farmAbort: AbortController | null = null;
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
  /** added with "Farm next" (likewise), with the team figures worked out on request */
  farm?: FarmNextResult | null;
  farmTeams?: FarmTeamResult[];
}

const isStoredCache = (v: unknown): boolean => {
  const s = v as StoredCache | null;
  return !!s && s.v === CACHE_VERSION && typeof s.fingerprint === "string" && (s.pass === null || (Array.isArray(s.pass?.bestOwner?.echoes) && Array.isArray(s.pass?.bestOwner?.characters)));
};
/** the browser-wide copy (IndexedDB): survives the tab */
const savedLab = savedSlot<StoredCache>("echoLab", CACHE_VERSION, isStoredCache);
/** when the pass shown was saved (ms), if it came from this browser's saved results rather than this visit or tab */
const passSavedAt = ref<number | null>(null);
let restoring: { fingerprint: string; done: Promise<void> } | null = null;
/** what the saved copy holds as far as this tab knows (fingerprint, pass, benchmarks, Tuner plan): what it last wrote,
 *  or what it just read back */
let lastSaved: readonly unknown[] = [];

/** Fill in what this browser saved for this account state (pass, benchmarks, Tuner plan), never over a result this
 *  tab already has. Once per fingerprint per page load; every job awaits it before deciding to run. */
function restoreSaved(fingerprint: string): Promise<void> {
  if (restoring?.fingerprint === fingerprint) return restoring.done;
  const done = savedLab.read(fingerprint).then((hit) => {
    if (!hit || hit.value.fingerprint !== fingerprint || resultFingerprint.value !== fingerprint) return;
    const stored = hit.value;
    if (!pass.value && stored.pass) {
      pass.value = stored.pass;
      passStatus.cached = true;
      passSavedAt.value = hit.savedAt;
    }
    if (!benchmarks.value && stored.benchmarks) benchmarks.value = stored.benchmarks;
    if (!tunerPlan.value && stored.tunerPlan) tunerPlan.value = stored.tunerPlan;
    // the tab now shows exactly what was saved: a roll-chip or Farm next write next must not re-save it as "just now"
    const parts = [fingerprint, pass.value, benchmarks.value, tunerPlan.value];
    if (parts[1] === (stored.pass ?? null) && parts[2] === (stored.benchmarks ?? null) && parts[3] === (stored.tunerPlan ?? null)) lastSaved = parts;
  });
  restoring = { fingerprint, done };
  return done;
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

/** The browser-wide copy keeps what `restoreSaved` paints: the pass, the benchmarks and the Tuner plan. It is not
 *  written when none of them is here (a roll-chip or Farm next write from another page must never blank a saved
 *  pass), nor when they are the ones it already got (a roll-chip batch or a Farm next team figure alone). */
function writeSaved(value: StoredCache): void {
  if (!value.pass && !value.benchmarks && !value.tunerPlan) return;
  const parts = [value.fingerprint, value.pass, value.benchmarks, value.tunerPlan ?? null];
  if (parts.every((p, i) => p === lastSaved[i])) return;
  lastSaved = parts;
  void savedLab.write(value.fingerprint, { v: value.v, fingerprint: value.fingerprint, pass: value.pass, benchmarks: value.benchmarks, tunerPlan: value.tunerPlan ?? null });
}

function writeCache(): void {
  if (!resultFingerprint.value) return;
  try {
    const rated = [...ratings.values()].filter((r): r is RollRating => r !== null);
    const asked = [...farmTeams.values()].filter((t): t is FarmTeamResult => typeof t === "object" && "key" in t);
    const value: StoredCache = {
      v: CACHE_VERSION,
      fingerprint: resultFingerprint.value,
      pass: pass.value,
      benchmarks: benchmarks.value,
      tunerPlan: tunerPlan.value,
      ratings: rated,
      farm: farm.value,
      farmTeams: asked,
    };
    writeSaved(value);
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
  farm.value = null;
  farmTeams.clear();
  rerolls.clear();
  qualities.clear();
  ratings.clear();
  passSavedAt.value = null;
  Object.assign(passStatus, idle());
  Object.assign(benchStatus, idle());
  Object.assign(tunerStatus, idle());
  Object.assign(farmStatus, idle());
}

// Settings › Clear saved results: this tab's copies go too, so the next visit runs again
onSavedResultsCleared(() => {
  for (const c of [passAbort, benchAbort, tunerAbort, farmAbort]) c?.abort();
  resultFingerprint.value = null;
  adopt("");
  resultFingerprint.value = null;
  restoring = null;
  lastSaved = [];
  try {
    sessionStorage.removeItem(ECHO_LAB_CACHE_KEY);
  } catch {
    /* nothing to do */
  }
});

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

  /** This tab's cached results for the account as it is now, once per page load (no engine run). */
  function hydrateFrom(fingerprint: string): void {
    if (hydrated) return;
    hydrated = true;
    const stored = readCache();
    if (stored && stored.fingerprint === fingerprint && !pass.value) {
      resultFingerprint.value = fingerprint;
      pass.value = stored.pass;
      benchmarks.value = stored.benchmarks;
      tunerPlan.value = stored.tunerPlan ?? null;
      for (const r of stored.ratings ?? []) ratings.set(ratingKey(r), r);
      farm.value = stored.farm ?? null;
      for (const t of stored.farmTeams ?? []) farmTeams.set(`${fingerprint}|${t.key}`, t);
      passStatus.cached = true;
    }
  }

  /** Results for the account as it is now, without running anything: this tab's cache, and results of another
   *  account state dropped (/account reads the Tuner plan this way). */
  function hydrate(): void {
    const { fingerprint } = snapshot();
    hydrateFrom(fingerprint);
    adopt(fingerprint);
  }

  /** Brings the page up to date: cached results for this account, or a fresh pass. */
  async function refresh(options: { force?: boolean } = {}): Promise<void> {
    const { account, fingerprint } = snapshot();
    hydrateFrom(fingerprint);
    adopt(fingerprint);
    if (!account.echoes.length || !builtCount.value) return;
    if (pass.value && !options.force) return;
    if (passStatus.running) return;
    if (!options.force) {
      await restoreSaved(fingerprint);
      if (resultFingerprint.value !== fingerprint || pass.value || passStatus.running) return;
    }
    passAbort?.abort();
    const controller = new AbortController();
    passAbort = controller;
    const result = await run({ kind: "pass" }, passStatus, controller.signal, account);
    if (passAbort === controller) passAbort = null;
    if (result && resultFingerprint.value === fingerprint) {
      pass.value = result;
      passSavedAt.value = null;
      writeCache();
    }
  }

  async function runBenchmarks(options: { force?: boolean } = {}): Promise<void> {
    const { account, fingerprint } = snapshot();
    adopt(fingerprint);
    if ((benchmarks.value && !options.force) || benchStatus.running || !builtCount.value) return;
    if (!options.force) {
      await restoreSaved(fingerprint);
      if (resultFingerprint.value !== fingerprint || benchmarks.value || benchStatus.running) return;
    }
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
    hydrateFrom(fingerprint);
    adopt(fingerprint);
    if ((tunerPlan.value && !options.force) || tunerStatus.running || !builtCount.value) return;
    if (!options.force) {
      await restoreSaved(fingerprint);
      if (resultFingerprint.value !== fingerprint || tunerPlan.value || tunerStatus.running) return;
    }
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

  /** "Farm next": what to farm for every slot of every five-echo build, and what a fresh echo there is expected to add. */
  async function runFarm(options: { force?: boolean } = {}): Promise<void> {
    const { account, fingerprint } = snapshot();
    adopt(fingerprint);
    // a list worked out under the other team-buff switch has team figures /account would not show: work it out again
    const stale = Boolean(farm.value) && farm.value?.autoTeamBuffs !== autoTeamBuffs.value;
    if ((farm.value && !options.force && !stale) || farmStatus.running || !builtCount.value) return;
    farmAbort?.abort();
    const controller = new AbortController();
    farmAbort = controller;
    if (options.force || stale) farmTeams.clear();
    const result = await run({ kind: "farmNext", options: { autoTeamBuffs: autoTeamBuffs.value } }, farmStatus, controller.signal, account);
    if (farmAbort === controller) farmAbort = null;
    if (result && resultFingerprint.value === fingerprint) {
      farm.value = result;
      writeCache();
    }
  }

  const farmTeamKey = (characterId: string, slot: number): string => `${resultFingerprint.value}|${characterId}|${slot}`;

  /** One slot's team figure, worked out on request (the same options as the list, so the worker reuses its slot plan). */
  async function runFarmTeam(characterId: string, slot: number): Promise<void> {
    const { account, fingerprint } = snapshot();
    adopt(fingerprint);
    // the list is from the other team-buff switch: work the list out again rather than mix the two
    if (farm.value && farm.value.autoTeamBuffs !== autoTeamBuffs.value) return runFarm();
    const key = farmTeamKey(characterId, slot);
    const asked = farmTeams.get(key);
    // one already worked out (or on its way) stands; one that failed may be tried again
    if (asked && !(typeof asked === "object" && "error" in asked)) return;
    farmTeams.set(key, "running");
    try {
      const result = await getEchoLabClient().run({ kind: "farmTeam", characterId, slot, options: { autoTeamBuffs: autoTeamBuffs.value } }, account);
      if (resultFingerprint.value === fingerprint) {
        farmTeams.set(key, result);
        writeCache();
      }
    } catch (err) {
      if (resultFingerprint.value !== fingerprint) return;
      if (isCancel(err)) farmTeams.delete(key);
      else farmTeams.set(key, { error: errorText(err) });
    }
  }

  const farmTeamOf = (characterId: string, slot: number): FarmTeamResult | { error: string } | "running" | null => farmTeams.get(farmTeamKey(characterId, slot)) ?? null;

  function cancel(): void {
    passAbort?.abort();
    benchAbort?.abort();
    tunerAbort?.abort();
    farmAbort?.abort();
  }

  return {
    pass,
    passStatus,
    passSavedAt,
    benchmarks,
    benchStatus,
    echoCount,
    builtCount,
    refresh,
    hydrate,
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
    farm,
    farmStatus,
    runFarm,
    runFarmTeam,
    farmTeamOf,
    cancel,
    snapshot,
  };
}
