// Wuthering Tools+ — the /echo-plan page's state: the stores in, the presets loaded for the characters on the plan,
// the grid (plan.ts), the progress against what the player ticked (diff.ts), and the saved state (storage.ts),
// written back on every change. The work is a few milliseconds on a 40-character account, so it stays on the main
// thread; the only wait is the preset chunks, fetched once per character.
import { computed, reactive, ref, shallowRef, watch } from "vue";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { updateEntries } from "../../content/updates";
import { accountCharacterOf } from "../account/accountState";
import { notInApp } from "../rankings/importFromRankings";
import type { ChipId } from "./catalog";
import { currentSetKeys, planProgress, snapshotOf } from "./diff";
import { buildPlan, planText, type Verdict } from "./plan";
import { loadSources, type LoadedSources } from "./sources";
import { cleanCode, loadState, saveState, type EchoPlanState, type ServerId } from "./storage";
import { collectWants } from "./wants";

type Characters = Record<string, Record<string, unknown>>;

/** the app's changelog date: "the app as of" stamp stored with each tick */
export const APP_VERSION = updateEntries[0]?.date ?? null;

export function useEchoPlan() {
  const characterStore = useCharacterStore();
  const inventoryStore = useInventoryStore();

  const state = reactive<EchoPlanState>(loadState());
  // a first visit takes today's Sonatas as the baseline, so only a later patch's sets read as new
  if (!state.sets.length) state.sets = currentSetKeys();
  const storageOk = ref(saveState(state));
  watch(state, () => (storageOk.value = saveState(state)), { deep: true });

  const characters = computed(() => ((characterStore.characters ?? {}) as Characters));
  const inventoryEchoes = computed(() => ((inventoryStore.echoes ?? []) as Array<Record<string, unknown>>));

  /** characters with a weapon (the Account State's "owned"), released in the app */
  const ownedKeys = computed(() => {
    const keys = Object.keys(characters.value).filter((k) => accountCharacterOf(k, characters.value[k]).owned);
    const hidden = new Set(notInApp(keys));
    return keys.filter((k) => !hidden.has(k)).sort();
  });
  /** in the calculator but never armed: offered first in the planned-character picker */
  const unarmedKeys = computed(() => {
    const keys = Object.keys(characters.value).filter((k) => !accountCharacterOf(k, characters.value[k]).owned);
    const hidden = new Set(notInApp(keys));
    return keys.filter((k) => !hidden.has(k)).sort();
  });
  const plannedKeys = computed(() => state.planned.filter((k) => !ownedKeys.value.includes(k) && !notInApp([k]).length));

  // ------------------------------------------------------------------ preset sources
  const sources = shallowRef<LoadedSources>({ curated: {}, engine: {}, kits: {}, failed: [] });
  const loading = ref(false);
  const ready = ref(false);
  const failed = ref<string[]>([]);
  let loadToken = 0;

  async function ensureSources(keys: string[], retry = false): Promise<void> {
    const have = sources.value;
    const missing = keys.filter((k) => retry || !(k in have.curated) || !(k in have.engine));
    if (!missing.length) {
      ready.value = true;
      return;
    }
    const token = ++loadToken;
    loading.value = true;
    try {
      const got = await loadSources(missing);
      const next: LoadedSources = {
        curated: { ...sources.value.curated, ...got.curated },
        engine: { ...sources.value.engine, ...got.engine },
        kits: { ...sources.value.kits, ...got.kits },
        failed: [],
      };
      sources.value = next;
      failed.value = [...new Set([...failed.value.filter((k) => !missing.includes(k)), ...got.failed])].sort();
    } catch {
      failed.value = [...new Set([...failed.value, ...missing])].sort();
    } finally {
      if (token === loadToken) loading.value = false;
      ready.value = true;
    }
  }

  const sourceKeys = computed(() => [...new Set([...ownedKeys.value, ...plannedKeys.value])].sort());
  watch(sourceKeys, (keys) => void ensureSources(keys), { immediate: true });
  const retrySources = () => ensureSources(failed.value.length ? failed.value : sourceKeys.value, true);

  // ------------------------------------------------------------------ the plan
  const wants = computed(() =>
    collectWants({
      characters: characters.value,
      echoes: inventoryEchoes.value,
      curated: sources.value.curated,
      engine: sources.value.engine,
      kits: sources.value.kits,
      // a planned character counts once their presets are in (or failed), so adding one never flashes the kit default
      planned: plannedKeys.value.filter((k) => k in sources.value.curated || failed.value.includes(k)),
      includePlanned: state.options.includePlanned,
      excluded: state.excluded,
      sources: state.options.sources,
    }),
  );
  const plan = computed(() => buildPlan(wants.value.wants, state.options, state.overrides));
  const progress = computed(() => planProgress(plan.value, { sets: state.sets, grid: state.grid, done: state.done }));
  const hasAccount = computed(() => ownedKeys.value.length > 0);
  const hasRoster = computed(() => wants.value.roster.some((r) => !r.excluded));

  // ------------------------------------------------------------------ actions
  function tick(set: string): void {
    const card = plan.value.cards.find((c) => c.set === set);
    if (!card) return;
    state.done[set] = true;
    state.grid[set] = snapshotOf(card);
    state.savedAt = Date.now();
    state.appVersion = APP_VERSION;
    if (!state.sets.includes(set)) state.sets.push(set);
  }

  function untick(set: string): void {
    delete state.done[set];
    delete state.grid[set];
  }

  function toggleDone(set: string): void {
    if (progress.value.cards[set]?.status === "done") untick(set);
    else tick(set);
  }

  /** Ticks every card that needs a tap in game (after the player has set the whole plan). */
  function markAllDone(): void {
    for (const set of progress.value.toUpdate) tick(set);
    acknowledgeNew();
  }

  function clearTicks(): void {
    state.done = {};
    state.grid = {};
    state.savedAt = null;
  }

  /** Stops flagging the current Sonatas as new. */
  function acknowledgeNew(): void {
    state.sets = [...new Set([...state.sets, ...currentSetKeys()])];
  }

  function setOverride(set: string, chip: ChipId, verdict: Verdict | null): void {
    const own = { ...(state.overrides[set] ?? {}) };
    if (verdict) own[chip] = verdict;
    else delete own[chip];
    if (Object.keys(own).length) state.overrides[set] = own;
    else delete state.overrides[set];
  }

  function clearOverrides(set?: string): void {
    if (set) delete state.overrides[set];
    else state.overrides = {};
  }

  function addPlanned(key: string): void {
    if (!key || state.planned.includes(key) || notInApp([key]).length) return;
    state.planned = [...state.planned, key].sort();
  }

  function removePlanned(key: string): void {
    state.planned = state.planned.filter((k) => k !== key);
  }

  function toggleExcluded(key: string): void {
    state.excluded = state.excluded.includes(key) ? state.excluded.filter((k) => k !== key) : [...state.excluded, key].sort();
  }

  function setCode(server: ServerId, code: string): void {
    const clean = cleanCode(code);
    if (clean) state.codes[server] = clean;
    else delete state.codes[server];
  }

  const text = () => planText(plan.value, new Date().toISOString().slice(0, 10));

  return {
    state,
    storageOk,
    plan,
    progress,
    wants,
    ownedKeys,
    unarmedKeys,
    plannedKeys,
    hasAccount,
    hasRoster,
    loading,
    ready,
    failed,
    retrySources,
    toggleDone,
    markAllDone,
    clearTicks,
    acknowledgeNew,
    setOverride,
    clearOverrides,
    addPlanned,
    removePlanned,
    toggleExcluded,
    setCode,
    text,
  };
}

export type EchoPlanModel = ReturnType<typeof useEchoPlan>;
