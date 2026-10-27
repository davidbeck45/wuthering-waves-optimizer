// Wuthering Tools+ — "Build it for me": the page's state. Plain copies of the stores go into the engine (buildTeam.ts);
// Riley's plan comes through the app's one solver worker (rileyClient), the search through upstream's optimizer
// workers (workerBackend.ts); nothing is written until the player confirms (apply.ts).
import { computed, reactive, ref, shallowRef, toRaw } from "vue";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { useSettingsStore } from "../../stores/settings";
import { resolveOptimizerWorkerCount } from "../../utils/optimizerPreferences";
import { applyBuildFields } from "../../characters/buildFields";
import { autoTeamBuffs } from "../teamContext/autoTeamBuffs";
import { rileyClient } from "../engine/rileyClient";
import { rileyAccountOf } from "../engine/rileyAccount";
import { characterDisplayName } from "../display/names";
import { buildMyTeam, currentEchoesOf, wornByMap, type BuildTeamResult, type TeamSpec } from "./buildTeam";
import { DEFAULT_OPTIONS, type BuildOptions } from "./constraints";
import { plansForTeam, type RileySource, type TeamPlans } from "./plans";
import { priorityOrder } from "./rileyPlan";
import { workerBackend } from "./workerBackend";
import { applyBuildTeam, readUndo, undoBuildTeam, undoIsLive, type ApplyOutcome, type BuildTeamStores, type UndoOutcome, type UndoRecord } from "./apply";
import { defaultSaveSlots, shareConflicts } from "./buildTeamView";
import { notInApp } from "../rankings/importFromRankings";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Phase = "pick" | "loading" | "plan" | "running" | "result" | "error";

export interface MemberProgress {
  phase: "waiting" | "prepare" | "search" | "swap" | "verify" | "done";
  processed: number;
  generated: number;
}

/** What the page was opened on: a saved team, or three characters (a preset row, a /rankings detail). */
export interface TeamRequest {
  teamId?: string | null;
  members?: string[];
  /** a wuwa_calc team key the player came from */
  key?: string | null;
}

export const OPTIONS_KEY = "wtplus:buildTeam:options:v1";

const plain = <T>(v: T): T => JSON.parse(JSON.stringify(toRaw(v) ?? null));

function readOptions(): BuildOptions {
  try {
    const raw = localStorage.getItem(OPTIONS_KEY);
    if (raw) {
      // only the known switches, only booleans: a hand-edited or older value never reaches the run
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

export function useBuildTeam() {
  const characterStore = useCharacterStore();
  const inventoryStore = useInventoryStore();
  const teamStore = useTeamRotationsStore();
  const settingsStore = useSettingsStore();

  const phase = ref<Phase>("pick");
  const error = ref<string | null>(null);
  const team = shallowRef<TeamSpec | null>(null);
  const plans = shallowRef<TeamPlans | null>(null);
  const order = ref<number[]>([]);
  const erFloors = ref<Array<number | null>>([]);
  const options = reactive<BuildOptions>(readOptions());
  const progress = ref<MemberProgress[]>([]);
  const result = shallowRef<BuildTeamResult | null>(null);
  const rileyAfter = ref<number | null>(null);
  const rileyAfterBusy = ref(false);
  const saveSlots = ref<boolean[]>([]);
  const applied = shallowRef<ApplyOutcome | null>(null);
  const undoRecord = shallowRef<UndoRecord | null>(readUndo());
  const startedAt = ref(0);
  let controller: AbortController | null = null;

  const stores = (): BuildTeamStores => ({ character: characterStore as any, team: teamStore as any, inventory: inventoryStore as any });
  const undoLive = computed(() => undoIsLive(stores(), undoRecord.value));

  /** Echoes worn by characters outside the team (left out unless the option is on). */
  const wornOutsideCount = computed(() => {
    const ids = new Set(team.value?.characterIds.filter(Boolean) as string[]);
    let n = 0;
    for (const who of wornByMap(inventoryStore.equipped as any).values()) if (who.some((c) => !ids.has(c))) n += 1;
    return n;
  });

  function saveOptions(): void {
    try {
      localStorage.setItem(OPTIONS_KEY, JSON.stringify({ ...options }));
    } catch {
      // storage unavailable — the options still apply to this visit
    }
  }

  function specOf(request: TeamRequest): TeamSpec | null {
    if (request.teamId) {
      const t = (teamStore.teams as any[]).find((x) => x.id === request.teamId);
      if (!t) return null;
      return { id: t.id, name: t.name, characterIds: [...(t.characterIds ?? [])], buildIds: [...(t.buildIds ?? [null, null, null])], actions: plain(t.actions ?? []), duration: t.duration ?? null, enemyConfig: plain(t.enemyConfig ?? null), handoffs: plain(t.handoffs ?? null) };
    }
    const ids = (request.members ?? []).filter(Boolean).slice(0, 3);
    if (!ids.length) return null;
    // a composition that is also a saved team: use the saved one (its rotation and pins)
    const saved = (teamStore.teams as any[]).find((t) => (t.actions ?? []).length && (t.characterIds ?? []).length === ids.length && ids.every((id) => t.characterIds.includes(id)));
    if (saved) return specOf({ teamId: saved.id });
    return { id: null, name: ids.map((id) => characterDisplayName(id)).join(" + "), characterIds: [...ids, null, null].slice(0, 3) };
  }

  const account = () => rileyAccountOf(plain(characterStore.characters), { echoes: plain(inventoryStore.echoes), equipped: plain(inventoryStore.equipped) }, plain(teamStore.teams));

  function rileySource(signal: AbortSignal): RileySource {
    const client = rileyClient();
    const acc = account();
    return {
      teamKeysFor: (ids) => client.teamKeysFor(ids, signal),
      solveMine: (keys, subs) => client.solveMine(keys, { account: acc, subs: subs ?? "mine", signal }),
      tracedRun: (key, picks) => client.tracedRun(key, picks, { account: acc, signal }),
    };
  }

  async function load(request: TeamRequest): Promise<void> {
    controller?.abort();
    result.value = null;
    applied.value = null;
    rileyAfter.value = null;
    error.value = null;
    // released content only: a composition with a kit the app does not list yet (a wuwa_calc team with Lily) never
    // reaches the page
    const hidden = notInApp((request.members ?? []).filter(Boolean));
    if (hidden.length) {
      team.value = null;
      phase.value = "pick";
      error.value = `${hidden.join(" and ")} ${hidden.length > 1 ? "are" : "is"} not in this app yet: pick a team of released characters.`;
      return;
    }
    const spec = specOf(request);
    if (!spec) {
      team.value = null;
      phase.value = "pick";
      if (request.teamId || request.members?.length) error.value = "That team is not in this browser's data any more.";
      return;
    }
    team.value = spec;
    phase.value = "loading";
    const ctrl = new AbortController();
    controller = ctrl;
    try {
      const chars = plain(characterStore.characters);
      const inv = plain(inventoryStore.echoes);
      const out = await plansForTeam(spec.characterIds, rileySource(ctrl.signal), { pinnedKey: request.key ?? null, currentEchoes: (id) => currentEchoesOf(id, chars, inv) });
      if (ctrl.signal.aborted) return;
      plans.value = out;
      order.value = priorityOrder(spec.characterIds.map((_, i) => out.plans[i] ?? { share: null, mainDps: false })).filter((i) => !!spec.characterIds[i]);
      // the need rounds up to one decimal, as the game prints ER (113.04 % asks for 113.1 %)
      erFloors.value = spec.characterIds.map((_, i) => {
        const need = out.plans[i]?.erNeed;
        return need == null ? null : Math.ceil(need * 10 - 1e-6) / 10;
      });
      phase.value = "plan";
    } catch (e) {
      if (ctrl.signal.aborted) return;
      error.value = e instanceof Error ? e.message : String(e);
      phase.value = "error";
    }
  }

  function move(slot: number, delta: number): void {
    const list = [...order.value];
    const i = list.indexOf(slot);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    order.value = list;
  }

  async function run(): Promise<void> {
    if (!team.value || !plans.value) return;
    saveOptions();
    controller?.abort();
    const ctrl = new AbortController();
    controller = ctrl;
    phase.value = "running";
    error.value = null;
    result.value = null;
    applied.value = null;
    rileyAfter.value = null;
    startedAt.value = Date.now();
    progress.value = team.value.characterIds.map(() => ({ phase: "waiting", processed: 0, generated: 0 }));
    const backend = workerBackend({ workerCount: resolveOptimizerWorkerCount((settingsStore.config as { optimizerWorkerCount?: unknown })?.optimizerWorkerCount) });
    try {
      const out = await buildMyTeam(
        {
          characters: plain(characterStore.characters),
          inventory: { echoes: plain(inventoryStore.echoes), equipped: plain(inventoryStore.equipped) },
          team: team.value,
          plans: plans.value.plans,
          order: order.value,
          options: { ...options },
          erFloors: erFloors.value.map((v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v))),
          autoTeamBuffs: autoTeamBuffs.value,
        },
        backend,
        {
          signal: ctrl.signal,
          onProgress: (p) => {
            const list = [...progress.value];
            list[p.slot] = { phase: p.phase, processed: p.processed, generated: Math.max(p.generated, list[p.slot]?.generated ?? 0) };
            progress.value = list;
          },
        },
      );
      if (ctrl.signal.aborted) return;
      progress.value = progress.value.map((p) => ({ ...p, phase: "done" }));
      result.value = out;
      // ticked by default: new echoes that score at least as much (or less only to meet an ER floor today's build
      // misses), the same echoes only when the run's buff settings score more — plus any teammate a ticked build
      // takes echoes from, so the saved team never wears one echo twice (buildTeamView.ts `defaultSaveSlots`)
      saveSlots.value = defaultSaveSlots(out.members);
      phase.value = "result";
      void computeRileyAfter(out);
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") {
        phase.value = "plan";
        return;
      }
      error.value = e instanceof Error ? e.message : String(e);
      phase.value = "error";
    } finally {
      backend.dispose?.();
    }
  }

  function cancel(): void {
    controller?.abort();
    phase.value = plans.value ? "plan" : "pick";
  }

  /** Riley's DPS for the team at the account with the new builds worn (his "My build" spread reads the echoes). */
  async function computeRileyAfter(out: BuildTeamResult): Promise<void> {
    const key = plans.value?.riley?.teamKey;
    if (!key || !out.members.some((m) => m.draft)) return;
    rileyAfterBusy.value = true;
    try {
      const chars = plain(characterStore.characters);
      for (const m of out.members) if (m.draft) chars[m.characterId] = applyBuildFields(chars[m.characterId] ?? {}, m.draft);
      const acc = rileyAccountOf(chars, { echoes: plain(inventoryStore.echoes), equipped: plain(inventoryStore.equipped) }, plain(teamStore.teams));
      const [solve] = await rileyClient().solveMine([key], { account: acc, subs: "mine" });
      rileyAfter.value = solve?.best?.total ?? null;
    } catch {
      rileyAfter.value = null;
    } finally {
      rileyAfterBusy.value = false;
    }
  }

  /** The members a save would write (ticked, with a build). */
  const toSave = computed(() => (result.value?.members ?? []).filter((m, i) => saveSlots.value[i] && m.draft));
  /** Echoes a build being saved takes from a teammate whose build here is not being replaced (the team would wear
   *  them twice): said in the save bar and the confirm dialog. */
  const conflicts = computed(() => shareConflicts(result.value?.members ?? [], new Set(toSave.value.map((m) => m.characterId))));

  function save(makeActive: boolean): ApplyOutcome | null {
    if (!team.value || !result.value || !toSave.value.length) return null;
    const out = applyBuildTeam(stores(), {
      team: { id: team.value.id, name: team.value.name, characterIds: team.value.characterIds },
      members: toSave.value.map((m) => ({ slot: m.slot, characterId: m.characterId, draft: m.draft! })),
      makeActive,
    });
    applied.value = out;
    undoRecord.value = out.undo;
    return out;
  }

  function undo(): UndoOutcome | null {
    const rec = undoRecord.value ?? readUndo();
    if (!rec) return null;
    const out = undoBuildTeam(stores(), rec);
    undoRecord.value = null;
    applied.value = null;
    return out;
  }

  const elapsed = computed(() => (result.value ? result.value.ms : Date.now() - startedAt.value));

  return {
    phase,
    error,
    team,
    plans,
    order,
    erFloors,
    options,
    progress,
    result,
    rileyAfter,
    rileyAfterBusy,
    saveSlots,
    applied,
    undoRecord,
    undoLive,
    wornOutsideCount,
    toSave,
    conflicts,
    elapsed,
    load,
    move,
    run,
    cancel,
    save,
    undo,
    saveOptions,
  };
}
