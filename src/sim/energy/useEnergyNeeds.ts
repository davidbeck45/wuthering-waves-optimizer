// Wuthering Tools+ — the energy check in the browser: one shared state for every page that shows it (/energy, the
// /my-rankings chips and substat floor). Measures the player's saved teams with Riley's engine on the existing solver
// worker (`rileyClient()`, the Riley run seam) at their account, keeps every measurement in localStorage
// (`wtplus:energy:v1`, energyCache.ts), and reads the ER each build has from the stores (energyHave.ts). Nothing runs
// until a page activates it; the opt-in scan of every team the account can field runs on a small pool of extra solver
// workers with progress and cancel. Created once, in a detached effect scope, so it outlives the page that started it.
import { computed, effectScope, reactive, ref, watch, type ComputedRef, type EffectScope, type Ref } from "vue";
import { storeToRefs } from "pinia";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { createRileyClient, rileyClient, type RileyClient } from "../engine/rileyClient";
import { WUWA_CALC_COMMIT } from "../engine/engineCommit";
import type { RileyAccount } from "../engine/rileyRun";
import { useRileyAccount } from "../engine/useRileyAccount";
import { autoTeamBuffs } from "../teamContext/autoTeamBuffs";
import { energyCacheKey, keepable, loadEnergyCache, saveEnergyCache, type CachedMeasure } from "./energyCache";
import {
  characterFloors,
  energySummary,
  isFreeCharacter,
  measureComposition,
  measureKeys,
  memberChecks,
  memberIdOf,
  scanCandidates,
  teamHaves,
  type CharacterFloor,
  type EnergyEngine,
  type EnergySummary,
  type MemberCheck,
  type SlotHave,
  type TeamMeasure,
} from "./energyCheck";
import { menuEnergyRegen } from "./energyHave";
import { compositionKey, type TeamEnergy } from "./energyNeed";
import { getCharacterRosterDisplayName } from "../../characters/characters";

const characterName = (id: string): string => getCharacterRosterDisplayName(id);


export type MeasureState = { status: "loading" } | { status: "error"; message: string } | TeamMeasure;

/** One team as the pages render it. */
export interface TeamView {
  /** the composition key (three app keys, sorted) */
  key: string;
  /** a saved team's id, or the composition key */
  id: string;
  name: string;
  /** a team the player saved, or a composition measured on demand / by the scan */
  source: "saved" | "checked";
  characterIds: string[];
  /** null: never asked */
  state: MeasureState | null;
  energy: TeamEnergy | null;
  /** null until both the measurement and the builds' ER are in */
  checks: MemberCheck[] | null;
}

export interface ScanState {
  status: "idle" | "running" | "done" | "cancelled" | "error";
  done: number;
  total: number;
  message: string;
}

/* eslint-disable no-unused-vars -- the parameters of an interface's method types */
export interface EnergyNeeds {
  account: ComputedRef<RileyAccount>;
  commit: string;
  savedTeams: ComputedRef<TeamView[]>;
  /** every other composition measured for this account (on demand, or by the scan), fieldable ones */
  checkedTeams: ComputedRef<TeamView[]>;
  /** per character, the worst need among the saved teams — the ER floor their weights respect */
  floors: ComputedRef<Map<string, CharacterFloor>>;
  summary: ComputedRef<EnergySummary>;
  /** the character screen's ER of each character's active build (%), null when not set up */
  haves: Readonly<Record<string, number | null>>;
  havesReady: Ref<boolean>;
  /** saved teams being measured, or the builds' ER being read */
  busy: ComputedRef<boolean>;
  scan: Readonly<ScanState>;
  /** start measuring (idempotent): every page that shows the check calls it on mount, `release` on unmount */
  activate(): void;
  release(): void;
  measure(characterIds: ReadonlyArray<string | null>, options?: { force?: boolean }): Promise<void>;
  measureSaved(options?: { force?: boolean }): Promise<void>;
  /** the view of any composition (a /my-rankings preset row); `name` for the label */
  viewOf(characterIds: ReadonlyArray<string | null>, name?: string): TeamView;
  floorFor(characterId: string): CharacterFloor | null;
  /** resolves once the saved teams and the builds' ER are in (or after `timeoutMs`) */
  ready(timeoutMs?: number): Promise<void>;
  /** re-run the saved teams, ignoring what is kept */
  recheck(): Promise<void>;
  scanAll(options?: { force?: boolean }): Promise<void>;
  cancelScan(): void;
}
/* eslint-enable no-unused-vars */

let shared: EnergyNeeds | null = null;

/** The app's one energy check (created on first use; pinia must be installed). */
export function useEnergyNeeds(): EnergyNeeds {
  if (!shared) {
    const scope = effectScope(true);
    shared = scope.run(() => createEnergyNeeds(scope))!;
  }
  return shared;
}

const idsOf = (team: { characterIds?: Array<string | null> } | null | undefined): string[] => (team?.characterIds ?? []).filter((id): id is string => Boolean(id));
const yieldToUi = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
/** A yield that only gives the event loop back once `budgetMs` of work has run since the last one: the builds' ER is
 *  one calculator build per character (~3 ms on a desktop, several times that on a phone), and 40 of them in one task
 *  would hold a phone's main thread for half a second. */
const timeSlicer = (budgetMs = 12): (() => Promise<void>) => {
  let since = performance.now();
  return async () => {
    if (performance.now() - since < budgetMs) return;
    await yieldToUi();
    since = performance.now();
  };
};
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value ?? null));

/** The seam's browser client as an `EnergyEngine` for one account. */
export function engineOfClient(client: RileyClient, account: RileyAccount, signal?: AbortSignal): EnergyEngine {
  return {
    commit: client.commit,
    teamKeysFor: (ids) => client.teamKeysFor(ids, signal),
    solveMine: (keys) => client.solveMine(keys, { account, signal }),
    tracedRun: (key, picks) => client.tracedRun(key, picks, { account, signal }),
  };
}

function createEnergyNeeds(scope: EffectScope): EnergyNeeds {
  const characterStore = useCharacterStore();
  const inventoryStore = useInventoryStore();
  const teamStore = useTeamRotationsStore();
  const { characters } = storeToRefs(characterStore) as unknown as { characters: Ref<Record<string, any>> };
  const { teams } = storeToRefs(teamStore) as unknown as { teams: Ref<Array<Record<string, any>>> };
  const account = useRileyAccount();
  const commit = WUWA_CALC_COMMIT;

  const disk: Map<string, CachedMeasure> = loadEnergyCache();
  const measures = reactive<Record<string, MeasureState>>({});
  const inflight = new Map<string, Promise<void>>();
  const keyOf = (ids: ReadonlyArray<string | null | undefined>, acc: RileyAccount = account.value): string => energyCacheKey(commit, acc, ids);
  const prefix = computed(() => keyOf([]));

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleSave = (): void => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveEnergyCache(disk, commit), 400);
  };
  const remember = (key: string, m: TeamMeasure): void => {
    if (!keepable(m)) return;
    disk.set(key, { at: Date.now(), m });
    scheduleSave();
  };
  /** the kept measurements of the current account, into the live state */
  const hydrate = (): void => {
    const p = prefix.value;
    for (const [key, entry] of disk) if (key.startsWith(p) && !measures[key]) measures[key] = entry.m;
  };

  function measure(characterIds: ReadonlyArray<string | null>, options: { force?: boolean } = {}): Promise<void> {
    const ids = characterIds.filter((id): id is string => Boolean(id));
    const acc = account.value;
    const key = keyOf(ids, acc);
    const running = inflight.get(key);
    if (running) return running;
    if (!options.force) {
      const current = measures[key];
      if (current && current.status !== "error") return Promise.resolve();
      const kept = disk.get(key);
      if (kept) {
        kept.at = Date.now();
        measures[key] = kept.m;
        scheduleSave();
        return Promise.resolve();
      }
    }
    measures[key] = { status: "loading" };
    const job = measureComposition(engineOfClient(rileyClient(), acc), ids)
      .then((m) => {
        measures[key] = m;
        remember(key, m);
      })
      .catch((error: unknown) => {
        measures[key] = { status: "error", message: error instanceof Error ? error.message : String(error) };
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, job);
    return job;
  }

  // ---- saved teams
  const saved = computed(() =>
    (teams.value ?? [])
      .filter((t) => idsOf(t).length > 0)
      .map((t) => ({ id: String(t.id), name: String(t.name || "Untitled team"), characterIds: idsOf(t), buildIds: (t.buildIds ?? []) as Array<string | null>, raw: t })),
  );
  const savedKeys = computed(() => new Set(saved.value.map((t) => compositionKey(t.characterIds))));

  function measureSaved(options: { force?: boolean } = {}): Promise<void> {
    return Promise.all(saved.value.map((t) => measure(t.characterIds, options))).then(() => undefined);
  }

  // ---- the builds' ER
  const haves = reactive<Record<string, number | null>>({});
  const slotHaves = reactive<Record<string, SlotHave[]>>({});
  const havesReady = ref(false);
  const havesRunning = ref(false);
  let havesJob: Promise<void> | null = null;
  let generation = 0;
  async function refreshHaves(): Promise<void> {
    const mine = ++generation;
    havesRunning.value = true;
    try {
      const chars = clone(characters.value ?? {}) as Record<string, any>;
      const echoes = clone(inventoryStore.echoes ?? []) as any[];
      const next: Record<string, number | null> = {};
      const slice = timeSlicer();
      for (const id of Object.keys(chars)) {
        next[id] = chars[id]?.weapon ? await menuEnergyRegen(id, chars, echoes).catch(() => null) : null;
        await slice();
        if (mine !== generation) return;
      }
      const nextSlots: Record<string, SlotHave[]> = {};
      for (const t of saved.value) {
        nextSlots[t.id] = await teamHaves({ characterIds: t.characterIds, buildIds: t.buildIds }, chars, echoes, { auto: autoTeamBuffs.value });
        await slice();
        if (mine !== generation) return;
      }
      for (const k of Object.keys(haves)) if (!(k in next)) delete haves[k];
      Object.assign(haves, next);
      for (const k of Object.keys(slotHaves)) if (!(k in nextSlots)) delete slotHaves[k];
      Object.assign(slotHaves, nextSlots);
      havesReady.value = true;
    } finally {
      if (mine === generation) havesRunning.value = false;
    }
  }
  const startHaves = (): Promise<void> => (havesJob = refreshHaves());

  // ---- activation: nothing runs until a page asks, and nothing watches the stores once the last page has gone (the
  // calculator mutates the character store on every edit; a deep watcher left behind would walk it each time)
  let active = 0;
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let stopWatching: (() => void) | null = null;
  const refresh = (): void => {
    hydrate();
    void startHaves();
    void measureSaved();
  };
  const onDataChange = (): void => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(refresh, 500);
  };
  function activate(): void {
    active += 1;
    if (active !== 1) return;
    // the watchers belong to the shared scope, not to the component that happened to activate first
    stopWatching = scope.run(() => {
      const a = watch([characters, () => inventoryStore.echoes, teams, autoTeamBuffs], onDataChange, { deep: true });
      const b = watch(() => `${account.value.key}|${account.value.buildsKey}`, onDataChange);
      return () => (a(), b());
    })!;
    refresh();
  }
  function release(): void {
    active = Math.max(0, active - 1);
    if (active || !stopWatching) return;
    stopWatching();
    stopWatching = null;
    if (debounce) clearTimeout(debounce);
  }

  // ---- views
  function viewFrom(ids: string[], id: string, name: string, source: TeamView["source"], slots: SlotHave[] | null): TeamView {
    const key = compositionKey(ids);
    const state = measures[keyOf(ids)] ?? null;
    const energy = state?.status === "ok" ? state.energy : null;
    const checks = energy && havesReady.value ? memberChecks(energy, slots ?? haves, ids) : null;
    return { key, id, name, source, characterIds: ids, state, energy, checks };
  }
  const savedTeams = computed(() => saved.value.map((t) => viewFrom(t.characterIds, t.id, t.name, "saved", slotHaves[t.id] ?? null)));
  const checkedTeams = computed(() => {
    const p = prefix.value;
    const out: TeamView[] = [];
    for (const [key, state] of Object.entries(measures)) {
      if (!key.startsWith(p) || state.status !== "ok") continue;
      // the key carries the ids it was asked with (a Rover form as the player has it); his slot order for display
      const asked = key.slice(p.length).split("+").filter(Boolean);
      if (savedKeys.value.has(compositionKey(asked)) || !state.energy.members.every((m) => m.owned)) continue;
      const ids = state.energy.members.map((m) => memberIdOf(m, asked));
      out.push(viewFrom(ids, compositionKey(ids), ids.map(characterName).join(" + "), "checked", null));
    }
    return out.sort((a, b) => (b.energy?.total ?? 0) - (a.energy?.total ?? 0));
  });
  const floors = computed(() => characterFloors(savedTeams.value.map((t) => ({ id: t.id, name: t.name, characterIds: t.characterIds, energy: t.energy }))));
  const summary = computed(() => energySummary(savedTeams.value.map((t) => ({ checks: t.checks }))));
  const busy = computed(() => havesRunning.value || savedTeams.value.some((t) => t.state?.status === "loading"));

  function viewOf(characterIds: ReadonlyArray<string | null>, name?: string): TeamView {
    const ids = characterIds.filter((id): id is string => Boolean(id));
    const savedTeam = saved.value.find((t) => compositionKey(t.characterIds) === compositionKey(ids));
    if (savedTeam) return savedTeams.value.find((t) => t.id === savedTeam.id)!;
    return viewFrom(ids, compositionKey(ids), name ?? ids.join(" + "), "checked", null);
  }

  /** the latest builds'-ER job, followed through when a data change superseded the one being awaited */
  async function havesSettled(): Promise<void> {
    for (let i = 0; i < 5 && havesJob; i++) {
      const job = havesJob;
      await job;
      if (job === havesJob) return;
    }
  }

  async function ready(timeoutMs = 20000): Promise<void> {
    // a one-shot read when no page keeps the check active (nothing left watching afterwards)
    if (!active) hydrate();
    const haves = active && havesJob ? havesSettled() : startHaves().then(havesSettled);
    const work = Promise.all([measureSaved(), haves]).then(() => undefined);
    await Promise.race([work, new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))]);
  }

  async function recheck(): Promise<void> {
    rileyClient().clear();
    await Promise.all([measureSaved({ force: true }), startHaves()]);
  }

  // ---- the opt-in scan: every composition the account can field, on a small worker pool
  const scan = reactive<ScanState>({ status: "idle", done: 0, total: 0, message: "" });
  let scanAbort: AbortController | null = null;
  async function scanAll(options: { force?: boolean } = {}): Promise<void> {
    if (scan.status === "running") return;
    const abort = (scanAbort = new AbortController());
    const signal = abort.signal;
    const acc = account.value;
    Object.assign(scan, { status: "running", done: 0, total: 0, message: "" });
    const pool: RileyClient[] = [];
    try {
      const base = rileyClient();
      const [list, blocked] = await Promise.all([base.teams(signal), base.blocked(signal)]);
      const todo = scanCandidates(list, acc, blocked, isFreeCharacter).filter((c) => {
        const key = keyOf(c.characterIds, acc);
        const kept = options.force ? null : disk.get(key);
        if (kept) measures[key] = kept.m;
        return !kept;
      });
      scan.total = todo.length;
      const width = Math.max(1, Math.min(3, Math.floor((globalThis.navigator?.hardwareConcurrency || 4) / 2), todo.length));
      for (let i = 0; i < width; i++) pool.push(createRileyClient({ memo: 0 }));
      let next = 0;
      let failed = 0;
      await Promise.all(
        pool.map(async (client) => {
          while (next < todo.length && !signal.aborted) {
            const c = todo[next++]!;
            const key = keyOf(c.characterIds, acc);
            try {
              const m = await measureKeys(engineOfClient(client, acc, signal), c.teamKeys);
              measures[key] = m;
              remember(key, m);
            } catch (error) {
              if (signal.aborted) break;
              failed += 1;
              measures[key] = { status: "error", message: error instanceof Error ? error.message : String(error) };
            }
            scan.done += 1;
          }
        }),
      );
      scan.status = signal.aborted ? "cancelled" : "done";
      if (failed && !signal.aborted) scan.message = `${failed} of ${todo.length} compositions could not be measured — scan again to retry them`;
    } catch (error) {
      scan.status = signal.aborted ? "cancelled" : "error";
      if (!signal.aborted) scan.message = error instanceof Error ? error.message : String(error);
    } finally {
      for (const client of pool) client.dispose();
      if (scanAbort === abort) scanAbort = null;
      scheduleSave();
    }
  }
  function cancelScan(): void {
    scanAbort?.abort();
  }

  return {
    account,
    commit,
    savedTeams,
    checkedTeams,
    floors,
    summary,
    haves,
    havesReady,
    busy,
    scan,
    activate,
    release,
    measure,
    measureSaved,
    viewOf,
    floorFor: (characterId) => floors.value.get(characterId) ?? null,
    ready,
    recheck,
    scanAll,
    cancelScan,
  };
}
