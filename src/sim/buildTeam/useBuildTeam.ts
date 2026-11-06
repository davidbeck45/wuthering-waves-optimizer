// Wuthering Tools+ — "Build it for me": the page's state. Plain copies of the stores go into the engine (buildTeam.ts);
// Riley's plan comes through the app's one solver worker (rileyClient), the search through upstream's optimizer
// workers (workerBackend.ts); nothing is written until the player confirms (apply.ts).
import { computed, nextTick, reactive, ref, shallowRef, toRaw } from "vue";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { useSettingsStore } from "../../stores/settings";
import { resolveOptimizerWorkerCount } from "../../utils/optimizerPreferences";
import { applyBuildFields } from "../../characters/buildFields";
import { autoTeamBuffs } from "../teamContext/autoTeamBuffs";
import { rileyClient } from "../engine/rileyClient";
import { rileyAccountOf } from "../engine/rileyAccount";
import { buildMyTeam, currentEchoesOf, teamSpecOf, wornByMap, type BuildTeamResult, type TeamRequest, type TeamSpec } from "./buildTeam";
import { OPTIONS_KEY, readBuildOptions, type BuildOptions } from "./options";
import { plansForTeam, type RileySource, type TeamPlans } from "./plans";
import { priorityOrder, type MemberPlan } from "./rileyPlan";
import { workerBackend } from "./workerBackend";
import { accountFingerprint, applyBuildTeam, clearUndo, readUndo, SaveRefused, saveUndo, undoBuildTeam, undoFates, undoIsLive, type ApplyOutcome, type BuildTeamStores, type UndoFate, type UndoOutcome, type UndoRecord } from "./apply";
import { accountStoresRefused } from "../storage/persistGuard";
import { snapshotCharacters } from "../buildHistory/history";
import { defaultSaveSlots, shareConflicts } from "./buildTeamView";
import { notInApp } from "../rankings/importFromRankings";
import { showNeed } from "../energy/energyNeed";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Phase = "pick" | "loading" | "plan" | "running" | "result" | "error";

export interface MemberProgress {
  phase: "waiting" | "prepare" | "search" | "swap" | "verify" | "done";
  processed: number;
  generated: number;
}

export type { TeamRequest } from "./buildTeam";
export { OPTIONS_KEY } from "./options";

const plain = <T>(v: T): T => JSON.parse(JSON.stringify(toRaw(v) ?? null));

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
  const options = reactive<BuildOptions>(readBuildOptions());
  const progress = ref<MemberProgress[]>([]);
  const result = shallowRef<BuildTeamResult | null>(null);
  const rileyAfter = ref<number | null>(null);
  const rileyAfterBusy = ref(false);
  const saveSlots = ref<boolean[]>([]);
  const applied = shallowRef<ApplyOutcome | null>(null);
  const undoRecord = shallowRef<UndoRecord | null>(readUndo());
  const startedAt = ref(0);
  /** re-gear only this member (`?only=`, /account's "Check my echoes" row): the others get no plan, so they keep the
   *  echoes they wear and those stay out of the search — the exact run the row's figure came from */
  const only = ref<string | null>(null);
  let controller: AbortController | null = null;
  /** the account the review on screen was planned on: it stands for that account and no other */
  let plannedOn: string | null = null;
  let saving = false;

  const stores = (): BuildTeamStores => ({ character: characterStore as any, team: teamStore as any, inventory: inventoryStore as any });
  const undoLive = computed(() => undoIsLive(stores(), undoRecord.value));
  const reviewIsCurrent = (): boolean => plannedOn === accountFingerprint(stores());

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

  const specOf = (request: TeamRequest): TeamSpec | null => teamSpecOf(request, plain(teamStore.teams as any[]));

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

  async function load(request: TeamRequest & { only?: string | null }): Promise<void> {
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
    only.value = request.only && spec.characterIds.includes(request.only) ? request.only : null;
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
        return need == null ? null : showNeed(need); // one rounding rule with the CLI (buildTeamCli.ts)
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
    // one member only: the others get no plan (they keep their echoes, which stay out of the search)
    const onlySlot = only.value ? team.value.characterIds.indexOf(only.value) : -1;
    const runPlans: MemberPlan[] = onlySlot >= 0 ? [] : plans.value.plans;
    if (onlySlot >= 0) runPlans[onlySlot] = plans.value.plans[onlySlot]!;
    const fingerprint = accountFingerprint(stores());
    try {
      const out = await buildMyTeam(
        {
          characters: plain(characterStore.characters),
          inventory: { echoes: plain(inventoryStore.echoes), equipped: plain(inventoryStore.equipped) },
          team: team.value,
          plans: runPlans,
          order: onlySlot >= 0 ? [onlySlot] : order.value,
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
      plannedOn = fingerprint;
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

  /** The review no longer says what the account is: `result` goes, and the page reads the team again (`load`). */
  function dropReview(): void {
    result.value = null;
    applied.value = null;
    rileyAfter.value = null;
    plannedOn = null;
  }

  /** The confirmed save, all or nothing: a store write that throws is put back in `applyBuildTeam`, a write the browser
   *  refused here (only the next tick shows it), and the undo record of the save before stays. Throws `SaveRefused` or
   *  the store's error. */
  async function save(makeActive: boolean): Promise<ApplyOutcome | null> {
    if (!team.value || !result.value || !toSave.value.length || saving) return null;
    if (!reviewIsCurrent()) {
      dropReview();
      throw new SaveRefused("stale");
    }
    saving = true;
    try {
      const previous = readUndo();
      // build history: each member's build as it is now, before the save (deduped against their newest version)
      snapshotCharacters(toSave.value.map((m) => m.characterId), "before-build-team", { characters: characterStore.characters, echoes: inventoryStore.echoes as any[] });
      const out = applyBuildTeam(stores(), {
        team: { id: team.value.id, name: team.value.name, characterIds: team.value.characterIds },
        members: toSave.value.map((m) => ({ slot: m.slot, characterId: m.characterId, draft: m.draft! })),
        makeActive,
      });
      await nextTick();
      if (accountStoresRefused()) {
        undoBuildTeam(stores(), out.undo);
        if (previous) saveUndo(previous);
        else clearUndo();
        await nextTick();
        throw new SaveRefused("storage");
      }
      applied.value = out;
      undoRecord.value = out.undo;
      return out;
    } finally {
      saving = false;
    }
  }

  /** What Undo would do with each build, for the confirm. */
  function undoPreview(): UndoFate[] {
    const rec = undoRecord.value ?? readUndo();
    return rec ? undoFates(stores(), rec) : [];
  }

  function undo(): UndoOutcome | null {
    const rec = undoRecord.value ?? readUndo();
    if (!rec) return null;
    snapshotCharacters(rec.created.map((c) => c.characterId), "before-build-team-undo", { characters: characterStore.characters, echoes: inventoryStore.echoes as any[] });
    const out = undoBuildTeam(stores(), rec);
    undoRecord.value = null;
    applied.value = null;
    // a review planned after the undone save (or one this undo could only partly take back) was read from what just
    // changed: it still shows the builds that are gone
    if (result.value && !reviewIsCurrent()) dropReview();
    return out;
  }

  const elapsed = computed(() => (result.value ? result.value.ms : Date.now() - startedAt.value));

  return {
    phase,
    error,
    team,
    only,
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
    undoPreview,
    saveOptions,
  };
}
