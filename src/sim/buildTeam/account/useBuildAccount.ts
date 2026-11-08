// Wuthering Tools+ — "Whole account" on /build-team: the page's state. The teams come from the same candidates /account
// ranks (its cached ranking when it holds this exact data), Riley's plan per team through the app's one solver worker
// (rileyClient), the search through upstream's optimizer workers (workerBackend.ts, the backend Build my team uses —
// no new worker); nothing is written until the player confirms (accountApply.ts).
import { computed, nextTick, reactive, ref, shallowRef, toRaw, watch } from "vue";
import { useCharacterStore } from "../../../stores/character";
import { useInventoryStore } from "../../../stores/inventory";
import { useTeamRotationsStore } from "../../../stores/teamRotations";
import { useSettingsStore } from "../../../stores/settings";
import { resolveOptimizerWorkerCount } from "../../../utils/optimizerPreferences";
import { autoTeamBuffs } from "../../teamContext/autoTeamBuffs";
import { rileyClient } from "../../engine/rileyClient";
import { rileyAccountOf } from "../../engine/rileyAccount";
import { rankingFingerprint, readCachedRanking } from "../../myRankings/rankingCache";
import { currentEchoesOf } from "../buildTeam";
import { DEFAULT_OPTIONS, type BuildOptions } from "../constraints";
import { plansForTeam, type RileySource } from "../plans";
import { priorityOrder } from "../rileyPlan";
import { workerBackend } from "../workerBackend";
import { OPTIONS_KEY, SWITCH_CHANGED_TEXT } from "../useBuildTeam";
import { accountFingerprint, newestUndo, SaveRefused, UndoRefused, undoFates, type BuildTeamStores, type UndoFate } from "../apply";
import { accountStoresRefused } from "../../storage/persistGuard";
import { onSavedResultsCleared } from "../../persist/savedResults";
import { accountTeamChoices, defaultSelection, defaultWeight, type AccountTeamChoice } from "./accountTeams";
import { buildAccount, type AccountPhase, type BuildAccountResult } from "./buildAccount";
import { accountApplyRequest, accountUndoIsLive, clearAccountUndo, readAccountUndo, readStoredAccountUndo, saveAccountPlan, saveAccountUndo, undoAccountPlan, undoAccountPlanSaved, type AccountApplyOutcome, type AccountUndoOutcome, type AccountUndoRecord } from "./accountApply";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type AccountPagePhase = "loading" | "choose" | "planning" | "running" | "result" | "error";
export type AccountStage = "plans" | "prepare" | "greedy" | "improve" | "verify";

export interface AccountMemberProgress {
  phase: AccountPhase | "waiting" | "done";
  processed: number;
  generated: number;
}

/** At most this many teams in one run (each adds three optimizer searches and a share of the local search). */
export const MAX_TEAMS = 8;
/** The local search's time budget on the page. */
export const BUDGET_MS = 60_000;

const plain = <T>(v: T): T => JSON.parse(JSON.stringify(toRaw(v) ?? null));

/** Said over the Teams step when the rows were read again because the account changed under them. */
export const ROWS_CHANGED_TEXT = "Your builds or teams changed after these teams were read (in another tab, perhaps), so they were read again. Check them, then plan.";

/** The teams picked for the run, their order and weights: they outlive a reload (eight teams chosen read four again). */
export const ACCOUNT_CHOICE_KEY = "wtplus:buildAccount:choice:v1";

interface StoredChoice {
  selected: string[];
  weights: Record<string, number>;
  /** the player set a weight: `weightsTouched` */
  touched: boolean;
}

function readChoice(): StoredChoice | null {
  try {
    const raw = JSON.parse(localStorage.getItem(ACCOUNT_CHOICE_KEY) ?? "null") as Partial<StoredChoice> | null;
    if (!Array.isArray(raw?.selected)) return null;
    const weights = Object.entries(raw.weights ?? {}).filter(([, w]) => typeof w === "number" && Number.isFinite(w) && w >= 0);
    return { selected: raw.selected.filter((id) => typeof id === "string"), weights: Object.fromEntries(weights), touched: raw.touched === true };
  } catch {
    return null; // unreadable: the default teams
  }
}

/** The last review, for this tab: its steps are no history entries, so Back left it behind and Forward found step 1
 *  (2026-11-05 hunt). It stands for the account it was planned on and no other. */
interface KeptPlan {
  on: string;
  /** the team-buff switch it was scored under, rows included: the account fingerprint does not hold it, and Back
   *  restored a switch-on plan with the switch off (2026-11-08 hunt F2: −0.7 % where the page now gives −0.1 %) */
  auto: boolean;
  /** the options it ran with: they come back with it */
  options: BuildOptions;
  choices: AccountTeamChoice[];
  selected: string[];
  weights: Record<string, number>;
  touched: boolean;
  result: BuildAccountResult;
}
let keptPlan: KeptPlan | null = null;
export function clearKeptPlan(): void {
  keptPlan = null;
}
onSavedResultsCleared(clearKeptPlan);

function readOptions(): BuildOptions {
  try {
    const raw = localStorage.getItem(OPTIONS_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Record<string, unknown>;
      const out = { ...DEFAULT_OPTIONS };
      for (const k of Object.keys(DEFAULT_OPTIONS) as Array<keyof BuildOptions>) if (typeof saved?.[k] === "boolean") out[k] = saved[k] as boolean;
      return out;
    }
  } catch {
    // unreadable: defaults
  }
  return { ...DEFAULT_OPTIONS };
}

export function useBuildAccount() {
  const characterStore = useCharacterStore();
  const inventoryStore = useInventoryStore();
  const teamStore = useTeamRotationsStore();
  const settingsStore = useSettingsStore();

  const phase = ref<AccountPagePhase>("loading");
  const error = ref<string | null>(null);
  const choices = shallowRef<AccountTeamChoice[]>([]);
  const scored = ref({ done: 0, total: 0 });
  /** ticked teams, priority order */
  const selected = ref<string[]>([]);
  const weights = reactive<Record<string, number>>({});
  /** the player changed a weight: reordering no longer resets them to 1, 0.8, … */
  const weightsTouched = ref(false);
  const options = reactive<BuildOptions>(readOptions());
  const stage = ref<AccountStage>("plans");
  const stageInfo = ref({ done: 0, total: 0, accepted: 0, round: 0 });
  const progress = ref<Record<string, AccountMemberProgress>>({});
  const result = shallowRef<BuildAccountResult | null>(null);
  const applied = shallowRef<AccountApplyOutcome | null>(null);
  const undoRecord = shallowRef<AccountUndoRecord | null>(readAccountUndo());
  /** "Also make active" on the review step: it decides who the save writes, so the confirm reads it from here */
  const makeActive = ref(false);
  const startedAt = ref(0);
  const now = ref(Date.now());
  let ticker: ReturnType<typeof setInterval> | null = null;
  let controller: AbortController | null = null;
  let stopFlag = false;
  /** a save or an undo moved the saved teams' pins and their damage: the rows and their specs are out of date */
  let rowsStale = false;
  /** the account the review on screen was planned on: it stands for that account and no other */
  let plannedOn: string | null = null;
  /** the account the rows (each team's members and pins) were read from: a Plan on rows read from another account
   *  scored one team and pinned into another (2026-11-08 hunt H1) */
  let rowsOn: string | null = null;
  /** the team-buff switch the rows' team damage, and the run or review on screen, were scored under */
  let scoredAuto: boolean | null = null;
  let saving = false;

  const stores = (): BuildTeamStores => ({ character: characterStore as any, team: teamStore as any, inventory: inventoryStore as any });
  const undoLive = computed(() => accountUndoIsLive(stores(), undoRecord.value));
  const reviewIsCurrent = (): boolean => plannedOn === accountFingerprint(stores());
  const rowsAreCurrent = (): boolean => rowsOn === accountFingerprint(stores());
  const byId = computed(() => new Map(choices.value.map((c) => [c.id, c])));
  const chosen = computed(() => selected.value.map((id) => byId.value.get(id)).filter((c): c is AccountTeamChoice => !!c));
  /** characters in two or more ticked teams: one build, scored in the first */
  const shared = computed(() => {
    const first = new Map<string, number>();
    const out: Array<{ characterId: string; teams: number[] }> = [];
    chosen.value.forEach((c, i) => {
      for (const id of c.characterIds) {
        if (!first.has(id)) first.set(id, i);
        else {
          const row = out.find((r) => r.characterId === id);
          if (row) row.teams.push(i);
          else out.push({ characterId: id, teams: [first.get(id)!, i] });
        }
      }
    });
    return out;
  });
  const elapsed = computed(() => (result.value ? result.value.ms : now.value - startedAt.value));

  function resetWeights(): void {
    selected.value.forEach((id, i) => (weights[id] = defaultWeight(i)));
  }

  function setWeights(to: Record<string, number>, touched: boolean): void {
    for (const k of Object.keys(weights)) delete weights[k];
    Object.assign(weights, to);
    weightsTouched.value = touched;
  }

  function saveChoice(): void {
    try {
      localStorage.setItem(ACCOUNT_CHOICE_KEY, JSON.stringify({ selected: selected.value, weights, touched: weightsTouched.value }));
    } catch {
      // storage unavailable — the choice still holds for this visit
    }
  }

  /** `keepChoice`: read the rows again after a save or an undo, the player's teams, order and weights staying. */
  async function load(keepChoice = false): Promise<void> {
    controller?.abort();
    if (!keepChoice && keptPlan?.on === accountFingerprint(stores()) && keptPlan.auto !== autoTeamBuffs.value) {
      // planned under the other team-buff switch: its figures, and its rows' team damage, are not this page's any more
      keptPlan = null;
      await load(false);
      if (phase.value === "choose") error.value = SWITCH_CHANGED_TEXT;
      return;
    }
    if (!keepChoice && keptPlan?.on === accountFingerprint(stores())) {
      Object.assign(options, keptPlan.options);
      scoredAuto = keptPlan.auto;
      choices.value = keptPlan.choices;
      selected.value = [...keptPlan.selected];
      setWeights(keptPlan.weights, keptPlan.touched);
      result.value = keptPlan.result;
      plannedOn = keptPlan.on;
      rowsOn = keptPlan.on;
      phase.value = "result";
      return;
    }
    const ctrl = new AbortController();
    controller = ctrl;
    phase.value = "loading";
    error.value = null;
    try {
      const chars = plain(characterStore.characters);
      const echoes = plain(inventoryStore.echoes);
      const teams = plain(teamStore.teams);
      const readOn = accountFingerprint(stores());
      const auto = autoTeamBuffs.value;
      // /account's ranking for this exact data, when this tab has it: its team damage is reused
      const fp = rankingFingerprint({ characters: toRaw(characterStore.characters ?? {}), echoes: toRaw(inventoryStore.echoes ?? []), teams: toRaw(teamStore.teams ?? []), investment: true, autoTeamBuffs: autoTeamBuffs.value });
      const cached = readCachedRanking(fp);
      const ranking = cached?.incomplete ? null : cached; // a figure that scored short is not reused
      const rows = await accountTeamChoices(chars, echoes, teams, { ranking, autoTeamBuffs: auto, signal: ctrl.signal, onProgress: (done, total) => (scored.value = { done, total }) });
      if (ctrl.signal.aborted) return;
      choices.value = rows;
      rowsOn = readOn;
      scoredAuto = auto;
      rowsStale = false;
      const stored = keepChoice ? null : readChoice();
      const kept = (keepChoice ? selected.value : stored?.selected ?? []).filter((id) => rows.some((r) => r.id === id)).slice(0, MAX_TEAMS);
      selected.value = kept.length ? kept : defaultSelection(rows);
      if (!kept.length) setWeights({}, false);
      else if (stored) setWeights(stored.weights, stored.touched);
      if (!weightsTouched.value) resetWeights();
      else selected.value.forEach((id, i) => (weights[id] ??= defaultWeight(i)));
      phase.value = "choose";
    } catch (e) {
      if (ctrl.signal.aborted) return;
      error.value = e instanceof Error ? e.message : String(e);
      phase.value = "error";
    }
  }

  function toggle(id: string, on: boolean): void {
    const list = selected.value.filter((x) => x !== id);
    if (on && list.length < MAX_TEAMS) list.push(id);
    selected.value = list;
    if (!weightsTouched.value) resetWeights();
    else if (on && weights[id] == null) weights[id] = defaultWeight(list.length - 1);
    saveChoice();
  }

  function move(id: string, delta: number): void {
    const list = [...selected.value];
    const i = list.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    selected.value = list;
    if (!weightsTouched.value) resetWeights();
    saveChoice();
  }

  function setWeight(id: string, w: number): void {
    if (!Number.isFinite(w) || w < 0) return;
    weights[id] = w;
    weightsTouched.value = true;
    saveChoice();
  }

  function saveOptions(): void {
    try {
      const prev = JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? "{}") as Record<string, unknown>;
      localStorage.setItem(OPTIONS_KEY, JSON.stringify({ ...prev, useSets: options.useSets, useMainStats: options.useMainStats, keepMainEcho: options.keepMainEcho }));
    } catch {
      // storage unavailable — the options still apply to this visit
    }
  }

  function rileySource(signal: AbortSignal): RileySource {
    const client = rileyClient();
    const acc = rileyAccountOf(plain(characterStore.characters), { echoes: plain(inventoryStore.echoes), equipped: plain(inventoryStore.equipped) }, plain(teamStore.teams));
    return {
      teamKeysFor: (ids) => client.teamKeysFor(ids, signal),
      solveMine: (keys, subs) => client.solveMine(keys, { account: acc, subs: subs ?? "mine", signal }),
      tracedRun: (key, picks) => client.tracedRun(key, picks, { account: acc, signal }),
    };
  }

  function startTicker(): void {
    stopTicker();
    ticker = setInterval(() => (now.value = Date.now()), 500);
  }
  function stopTicker(): void {
    if (ticker) clearInterval(ticker);
    ticker = null;
  }

  /** The rows were read from an account that changed since (another tab's write): read them again, and say so. */
  async function rereadRows(): Promise<void> {
    await load(true);
    if (phase.value === "choose") error.value = ROWS_CHANGED_TEXT;
  }

  /** Another tab's write was adopted (crossTabSync.ts `onAccountAdopted`): rows on the Teams step follow it. */
  async function followAccount(): Promise<void> {
    if (phase.value === "choose" && !rowsAreCurrent()) await rereadRows();
  }

  async function run(): Promise<void> {
    if (!chosen.value.length) return;
    if (!rowsAreCurrent()) return rereadRows();
    const teams = chosen.value;
    saveOptions();
    controller?.abort();
    const ctrl = new AbortController();
    controller = ctrl;
    stopFlag = false;
    error.value = null;
    result.value = null;
    applied.value = null;
    keptPlan = null;
    startedAt.value = Date.now();
    now.value = startedAt.value;
    startTicker();
    phase.value = "planning";
    stage.value = "plans";
    stageInfo.value = { done: 0, total: teams.length, accepted: 0, round: 0 };
    const members = [...new Set(teams.flatMap((t) => t.characterIds))];
    progress.value = Object.fromEntries(members.map((id) => [id, { phase: "waiting", processed: 0, generated: 0 }]));
    const backend = workerBackend({ workerCount: resolveOptimizerWorkerCount((settingsStore.config as { optimizerWorkerCount?: unknown })?.optimizerWorkerCount) });
    const fingerprint = accountFingerprint(stores());
    const auto = autoTeamBuffs.value;
    scoredAuto = auto;
    try {
      const chars = plain(characterStore.characters);
      const echoes = plain(inventoryStore.echoes);
      const source = rileySource(ctrl.signal);
      const inputs = [];
      for (let i = 0; i < teams.length; i++) {
        const t = teams[i]!;
        const plans = await plansForTeam(t.spec.characterIds, source, { currentEchoes: (id) => currentEchoesOf(id, chars, echoes) });
        if (ctrl.signal.aborted) return;
        inputs.push({ spec: t.spec, weight: weights[t.id] ?? defaultWeight(i), plans: plans.plans, memberOrder: priorityOrder(plans.plans.map((p) => p ?? { share: null, mainDps: false })), choiceId: t.id });
        stageInfo.value = { ...stageInfo.value, done: i + 1 };
      }
      phase.value = "running";
      const out = await buildAccount(
        { characters: chars, inventory: { echoes, equipped: plain(inventoryStore.equipped) }, teams: inputs, options: { ...options }, autoTeamBuffs: auto, budgetMs: BUDGET_MS },
        backend,
        {
          signal: ctrl.signal,
          shouldStop: () => stopFlag,
          onStage: (s) => {
            stage.value = s.stage;
            if (s.stage === "improve") stageInfo.value = { ...stageInfo.value, accepted: s.accepted ?? 0, round: s.round ?? 0 };
          },
          onProgress: (p) => {
            const prev = progress.value[p.characterId];
            progress.value = { ...progress.value, [p.characterId]: { phase: p.phase, processed: Math.max(p.processed, prev?.processed ?? 0), generated: Math.max(p.generated, prev?.generated ?? 0) } };
          },
        },
      );
      if (ctrl.signal.aborted) return;
      progress.value = Object.fromEntries(Object.entries(progress.value).map(([k, v]) => [k, { ...v, phase: "done" }]));
      plannedOn = fingerprint;
      result.value = out;
      keptPlan = { on: fingerprint, auto, options: { ...options }, choices: choices.value, selected: [...selected.value], weights: { ...weights }, touched: weightsTouched.value, result: out };
      phase.value = "result";
    } catch (e) {
      // a run cancelled and replaced by a newer one (Cancel, then Plan again) leaves the page to that run
      if (controller !== ctrl) return;
      if ((e as { name?: string })?.name === "AbortError") {
        phase.value = "choose";
        return;
      }
      error.value = e instanceof Error ? e.message : String(e);
      phase.value = "error";
    } finally {
      // the newer run owns the seconds ticker; this run's workers are its own
      if (controller === ctrl) stopTicker();
      backend.dispose?.();
    }
  }

  /** Ends the improvement pass at the next move and keeps the best split so far. */
  function stopImproving(): void {
    stopFlag = true;
  }

  function cancel(): void {
    controller?.abort();
    stopTicker();
    phase.value = choices.value.length ? "choose" : "loading";
  }

  /** What a save would write: every member with a new build (accountApply.ts `accountApplyRequest`). */
  const activeBuildOf = (id: string): string | null => characterStore.characters?.[id]?.activeBuildId ?? null;
  const toSave = computed(() => (result.value ? accountApplyRequest(result.value, makeActive.value, activeBuildOf).members : []));

  /** The review no longer says what the account is: back to Teams, the rows read again. */
  function dropReview(): void {
    result.value = null;
    applied.value = null;
    plannedOn = null;
    keptPlan = null;
    rowsStale = true;
    void load(true);
  }

  /** The confirmed save, all or nothing: a store write that throws is put back in `applyAccountPlan`, a write the
   *  browser refused here (only the next tick shows it), and the undo record of the save before stays. Throws
   *  `SaveRefused` or the store's error. */
  async function save(): Promise<AccountApplyOutcome | null> {
    if (!result.value || !toSave.value.length || saving) return null;
    if (!reviewIsCurrent()) {
      dropReview();
      throw new SaveRefused("stale");
    }
    saving = true;
    try {
      const previous = readAccountUndo();
      const out = saveAccountPlan(stores(), accountApplyRequest(result.value, makeActive.value, activeBuildOf), { echoes: inventoryStore.echoes as any[] });
      await nextTick();
      if (accountStoresRefused()) {
        undoAccountPlan(stores(), out.undo);
        if (previous) saveAccountUndo(previous);
        else clearAccountUndo();
        await nextTick();
        throw new SaveRefused("storage");
      }
      applied.value = out;
      undoRecord.value = out.undo;
      rowsStale = true;
      keptPlan = null;
      return out;
    } finally {
      saving = false;
    }
  }

  /** The Undo this page acts on: the last save's, even when another tab made it (apply.ts `newestUndo`). */
  function currentUndo(): AccountUndoRecord | null {
    const rec = newestUndo(undoRecord.value, readStoredAccountUndo()) ?? readAccountUndo();
    if (rec?.at !== undoRecord.value?.at) undoRecord.value = rec;
    return rec;
  }

  /** What Undo would do with each build, for the confirm; `undoRecord` is then the record it describes. */
  function undoPreview(): UndoFate[] {
    const rec = currentUndo();
    return rec ? undoFates(stores(), rec) : [];
  }

  /** `described`: the record the confirm spoke for. A newer save since (another tab's) refuses with `UndoRefused`,
   *  nothing written: the player was asked about the other one. */
  function undo(described?: Pick<AccountUndoRecord, "at"> | null): AccountUndoOutcome | null {
    const rec = currentUndo();
    if (!rec) return null;
    if (described && described.at !== rec.at) throw new UndoRefused();
    const out = undoAccountPlanSaved(stores(), rec, { echoes: inventoryStore.echoes as any[] });
    undoRecord.value = null;
    applied.value = null;
    rowsStale = true;
    if (phase.value === "choose") void load(true);
    // a review planned after the undone save (or one this undo could only partly take back) was read from what just
    // changed: its "keeps today's echoes" and "already wears it" are no longer true, and a Save would write less than
    // it shows, or one echo on two characters
    else if (result.value && !reviewIsCurrent()) dropReview();
    return out;
  }

  function backToTeams(): void {
    keptPlan = null;
    if (rowsStale) void load(true);
    else phase.value = "choose";
  }

  // The team-buff switch moved (the palette, Settings): the rows' team damage, a run in flight and a review were all
  // scored under the other one (F2). The rows are read again, keeping the player's teams; a run or a review is put down
  // and the Teams step says why.
  watch(autoTeamBuffs, async () => {
    const p = phase.value;
    // rows being read under the old switch: read them under this one instead
    if (p === "loading") return void load(choices.value.length > 0);
    if (scoredAuto === null || scoredAuto === autoTeamBuffs.value) return;
    if (p === "planning" || p === "running") {
      controller?.abort();
      controller = null;
      stopTicker();
    }
    const said = p === "planning" || p === "running" || (p === "result" && !!result.value);
    result.value = null;
    applied.value = null;
    plannedOn = null;
    scoredAuto = null;
    // the plan kept for Back stays: `load` restores it only under the switch it was planned on
    await load(choices.value.length > 0);
    if (said && phase.value === "choose") error.value = SWITCH_CHANGED_TEXT;
  });

  return {
    phase,
    error,
    choices,
    scored,
    selected,
    chosen,
    weights,
    options,
    shared,
    stage,
    stageInfo,
    progress,
    result,
    applied,
    undoRecord,
    undoLive,
    makeActive,
    toSave,
    elapsed,
    load,
    toggle,
    move,
    setWeight,
    run,
    stopImproving,
    cancel,
    save,
    undo,
    undoPreview,
    backToTeams,
    followAccount,
  };
}
