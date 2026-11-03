// Wuthering Tools+ — /account "With what you own": the page's state. "Check my echoes" runs the echo check
// (echoCheck.ts) on demand, through the workers Build my team already uses (upstream's optimizer workers, the wuwa_calc
// solver worker; no new worker entry), with progress and Cancel, kept for this tab (echoCheckCache.ts); it also asks
// the Echo Lab worker for the Tuner plan when Tuners are entered. The Tuner budget is read from Echo Lab's own storage,
// the Energy Regen shortfalls from the app's shared energy check. Nothing here writes a build. The check, the optimizer
// backend and Echo Lab's state are imported when first needed, so /account itself loads none of their code.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, toRaw, watch } from "vue";
import { useInventoryStore } from "../../stores/inventory";
import { useSettingsStore } from "../../stores/settings";
import { resolveOptimizerWorkerCount } from "../../utils/optimizerPreferences";
import { autoTeamBuffs } from "../teamContext/autoTeamBuffs";
import { rileyClient } from "../engine/rileyClient";
import { rileyAccountOf } from "../engine/rileyAccount";
import { WUWA_CALC_COMMIT } from "../engine/engineCommit";
import { readBuildOptions } from "../buildTeam/options";
import type { RileySource } from "../buildTeam/plans";
import type { useEchoLab } from "../echoLab/useEchoLab";
import { EMPTY_BUDGET, TUNER_BUDGET_KEY, readTunerBudget, type TunerBudget } from "../echoLab/tunerBudget";
import { useEnergyNeeds } from "../energy/useEnergyNeeds";
import type { EchoCheck, EchoUpgrade } from "./echoCheck";
import { echoCheckKey, inventoryFingerprint, readCachedEchoCheck, writeCachedEchoCheck } from "./echoCheckCache";
import { ownUpgradeRows, type OwnRow } from "./ownUpgrades";
import type { useAccountData } from "./useAccountData";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface EchoCheckStatus {
  state: "idle" | "running" | "done" | "error";
  done: number;
  total: number;
  /** the character being checked */
  label: string;
  /** served from this tab's cache */
  restored: boolean;
  /** the last run was stopped (its rows so far are shown, never cached) */
  cancelled: boolean;
  computedAt: string | null;
  error: string | null;
}

const idle = (): EchoCheckStatus => ({ state: "idle", done: 0, total: 0, label: "", restored: false, cancelled: false, computedAt: null, error: null });
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(toRaw(v) ?? null));

function readBudget(): TunerBudget {
  try {
    return readTunerBudget(typeof localStorage !== "undefined" ? localStorage.getItem(TUNER_BUDGET_KEY) : null);
  } catch {
    return { ...EMPTY_BUDGET };
  }
}

export function useOwnUpgrades(data: ReturnType<typeof useAccountData>) {
  const inventoryStore = useInventoryStore();
  const settingsStore = useSettingsStore();
  const energy = useEnergyNeeds();
  // Echo Lab's module state (its Tuner plan), loaded after the page: /account itself carries no Echo Lab code
  const lab = shallowRef<ReturnType<typeof useEchoLab> | null>(null);
  const loadLab = async (): Promise<ReturnType<typeof useEchoLab>> => {
    if (!lab.value) lab.value = (await import("../echoLab/useEchoLab")).useEchoLab();
    return lab.value;
  };

  const check = shallowRef<EchoCheck | null>(null);
  const liveItems = shallowRef<EchoUpgrade[] | null>(null);
  const status = ref<EchoCheckStatus>(idle());
  const budget = ref<TunerBudget>(readBudget());
  let controller: AbortController | null = null;

  /** the cache key for the data as it is now; null until the ranking is in */
  function keyNow(): string | null {
    const fp = data.rankingFingerprint();
    if (!fp || !data.ranking.value) return null;
    const inv = inventoryFingerprint(toRaw(inventoryStore.echoes ?? []), toRaw(inventoryStore.equipped ?? {}));
    return echoCheckKey(fp, inv, { options: readBuildOptions(), engine: WUWA_CALC_COMMIT, auto: autoTeamBuffs.value });
  }

  /** The check for this exact data, when this tab ran it; else nothing (never another state's rows). */
  function restore(): void {
    if (status.value.state === "running") return;
    const key = keyNow();
    const cached = key ? readCachedEchoCheck(key) : null;
    check.value = cached;
    status.value = cached ? { ...idle(), state: "done", restored: true, done: cached.done, total: cached.total, computedAt: cached.computedAt } : idle();
  }

  function rileySource(signal: AbortSignal): RileySource {
    const client = rileyClient();
    const account = rileyAccountOf(plain(data.characters.value ?? {}), { echoes: plain(inventoryStore.echoes ?? []), equipped: plain(inventoryStore.equipped ?? {}) }, plain(useTeams()));
    return {
      teamKeysFor: (ids) => client.teamKeysFor(ids, signal),
      solveMine: (keys, subs) => client.solveMine(keys, { account, subs: subs ?? "mine", signal }),
      tracedRun: (key, picks) => client.tracedRun(key, picks, { account, signal }),
    };
  }
  const useTeams = (): any[] => data.teams.value ?? [];

  /** "Check my echoes": every set-up character re-geared alone from the inventory (and the Tuner plan, when Tuners
   *  are entered). Rows appear as each character finishes. */
  async function checkEchoes(): Promise<void> {
    const ranking = data.ranking.value;
    const key = keyNow();
    if (!ranking || !key) return;
    controller?.abort();
    const ctrl = new AbortController();
    controller = ctrl;
    check.value = null;
    liveItems.value = [];
    // no label until the first character starts: the bar says the check is getting ready
    status.value = { ...idle(), state: "running" };
    budget.value = readBudget();
    const tuner = budget.value.tuners !== null ? loadLab().then((l) => l.runTunerPlan()).catch(() => undefined) : Promise.resolve();
    let backend: { dispose?: () => void } | null = null;
    try {
      const [{ checkOwnEchoes }, { workerBackend }] = await Promise.all([import("./echoCheck"), import("../buildTeam/workerBackend")]);
      if (controller !== ctrl) return;
      const workers = workerBackend({ workerCount: resolveOptimizerWorkerCount((settingsStore.config as { optimizerWorkerCount?: unknown })?.optimizerWorkerCount) });
      backend = workers;
      const out = await checkOwnEchoes(
        {
          characters: plain(data.characters.value ?? {}),
          inventory: { echoes: plain(inventoryStore.echoes ?? []), equipped: plain(inventoryStore.equipped ?? {}) },
          teams: plain(useTeams()),
          ranking,
          autoTeamBuffs: autoTeamBuffs.value,
          options: readBuildOptions(),
        },
        { backend: workers, riley: rileySource(ctrl.signal) },
        {
          signal: ctrl.signal,
          onProgress: (p, items) => {
            if (controller !== ctrl) return;
            status.value = { ...status.value, done: p.done, total: p.total, label: p.label };
            liveItems.value = items;
          },
        },
      );
      if (controller !== ctrl) return;
      check.value = out;
      if (!out.cancelled) writeCachedEchoCheck(key, out);
      status.value = {
        ...idle(),
        state: "done",
        cancelled: out.cancelled,
        done: out.done,
        total: out.total,
        computedAt: out.computedAt,
        error: out.errors.length ? `${out.errors.length} could not be checked` : null,
      };
    } catch (err) {
      if (controller === ctrl) status.value = { ...idle(), state: "error", error: err instanceof Error ? err.message : String(err) };
    } finally {
      backend?.dispose?.();
      if (controller === ctrl) {
        liveItems.value = null;
        controller = null;
      }
    }
    await tuner;
  }

  function cancel(): void {
    controller?.abort();
  }

  const echoItems = computed<EchoUpgrade[] | null>(() => liveItems.value ?? check.value?.items ?? null);
  const energyViews = computed(() => [...energy.savedTeams.value, ...energy.checkedTeams.value]);
  const rows = computed<OwnRow[]>(() =>
    ownUpgradeRows({
      echoes: echoItems.value,
      tuner: { budget: budget.value, result: lab.value?.tunerPlan.value ?? null },
      energy: energyViews.value,
      characters: data.characters.value ?? {},
    }),
  );
  /** the energy check is still measuring the saved teams (its rows may still come) */
  const energyBusy = computed(() => energy.busy.value);
  const tunerRunning = computed(() => !!lab.value?.tunerStatus.running);

  watch(() => data.ranking.value, restore);
  onMounted(() => {
    energy.activate();
    budget.value = readBudget();
    // only when Tuners are entered: without them the row asks for them and needs no plan
    if (budget.value.tuners !== null) void loadLab().then((l) => l.hydrate()).catch(() => undefined);
    restore();
  });
  onBeforeUnmount(() => {
    controller?.abort();
    energy.release();
  });

  return { rows, check, status, echoItems, budget, energyBusy, tunerRunning, checkEchoes, cancel };
}
