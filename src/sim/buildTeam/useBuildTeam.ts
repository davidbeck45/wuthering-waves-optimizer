// Wuthering Tools+ — "Build it for me": the page's state. Plain copies of the stores go into the engine (buildTeam.ts);
// Riley's plan comes through the app's one solver worker (rileyClient), the search through upstream's optimizer
// workers (workerBackend.ts); nothing is written until the player confirms (apply.ts).
import { computed, nextTick, reactive, ref, shallowRef, toRaw, watch, type Ref, type ShallowRef } from "vue";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { useSettingsStore } from "../../stores/settings";
import { resolveOptimizerWorkerCount } from "../../utils/optimizerPreferences";
import { applyBuildFields } from "../../characters/buildFields";
import { autoTeamBuffs } from "../teamContext/autoTeamBuffs";
import { rileyClient } from "../engine/rileyClient";
import { rileyAccountOf } from "../engine/rileyAccount";
import { buildMyTeam, currentEchoesOf, teamFigureOf, teamSpecOf, wornByMap, type BuildTeamResult, type TeamFigure, type TeamRequest, type TeamSpec } from "./buildTeam";
import { OPTIONS_KEY, readBuildOptions, type BuildOptions } from "./options";
import { plansForTeam, type RileySource, type TeamPlans } from "./plans";
import { priorityOrder, type MemberPlan } from "./rileyPlan";
import { workerBackend } from "./workerBackend";
import { accountFingerprint, applyBuildTeam, clearUndo, newestUndo, readStoredUndo, readUndo, SaveRefused, saveUndo, undoBuildTeam, UndoRefused, undoFates, undoIsLive, type ApplyOutcome, type BuildTeamStores, type UndoFate, type UndoOutcome, type UndoRecord } from "./apply";
import { accountStoresRefused } from "../storage/persistGuard";
import { onSavedResultsCleared } from "../persist/savedResults";
import type { TeamImpact } from "../account/investPlan";
import { snapshotCharacters } from "../buildHistory/history";
import { bestSaveTicks, defaultSaveSlots, membersAsTicked, shareConflicts, type SaveWhy } from "./buildTeamView";
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

/** The last review, for this tab: its steps are no history entries, so Back left it behind and Forward found step 1
 *  (2026-11-05 hunt). It stands for the request and the account it was planned on and no other. The refs are the page's
 *  own, so what is ticked after the run and the figures that land after it come along. */
interface KeptReview {
  request: string;
  on: string;
  /** the team-buff switch the run was scored under: the account fingerprint does not hold it, and Back restored a
   *  switch-on review with the switch off (2026-11-08 hunt F2: Mornye 132K where the page now gives 87.3K) */
  auto: boolean;
  /** the options it ran with: they come back with it, so Change plan shows what the review was searched with */
  options: BuildOptions;
  team: TeamSpec;
  only: string | null;
  plans: TeamPlans;
  order: number[];
  erFloors: Array<number | null>;
  result: BuildTeamResult;
  saveSlots: Ref<boolean[]>;
  /** why the ticks opened as they did (`bestSaveTicks`); null without a team total */
  saveWhy: SaveWhy | null;
  teamFigure: ShallowRef<TeamFigure | null>;
  rileyAfter: Ref<number | null>;
  rankedFigure: ShallowRef<TeamImpact | null>;
}
let keptReview: KeptReview | null = null;
export function clearKeptReview(): void {
  keptReview = null;
}
onSavedResultsCleared(clearKeptReview);

const ticksKey = (ticks: readonly boolean[]): string => ticks.map((t) => (t ? "1" : "0")).join("");

/** Said over the plan when a review (or a run) was put down because the team-buff switch moved after it was worked out. */
export const SWITCH_CHANGED_TEXT = "Team-aware buffs were switched since this review was worked out, so its figures no longer apply. Build again for figures under the switch as it is now.";

/** Said over the plan when the team was read again because the account changed under it. */
export const TEAM_CHANGED_TEXT = "Your builds or teams changed after this team was read (in another tab, perhaps), so it was read again. Check the plan, then build.";

const requestKey = (r: TeamRequest & { only?: string | null }): string => JSON.stringify([r.teamId ?? null, r.members ?? [], r.key ?? null, r.only ?? null, r.rankedTeam ?? null]);

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
  /** why the review opened on these ticks: "none" when no set of the new builds beats the team as it is */
  const saveWhy = ref<SaveWhy | null>(null);
  /** the team with the ticked builds worn, what the Save gets: the review's headline, and it moves with the ticks */
  const teamFigure = shallowRef<TeamFigure | null>(null);
  const teamFigureBusy = ref(false);
  const applied = shallowRef<ApplyOutcome | null>(null);
  const undoRecord = shallowRef<UndoRecord | null>(readUndo());
  const startedAt = ref(0);
  /** re-gear only this member (`?only=`, /account's "Check my echoes" row): the others get no plan, so they keep the
   *  echoes they wear and those stay out of the search — the exact run the row's figure came from */
  const only = ref<string | null>(null);
  /** the rankings' team the page was opened on (`?rankedTeam=`), and the figure /account printed for it, worked out for
   *  this run: a preset has no team total of its own here, and that row's +8.8 % team was nowhere on the page it opened */
  let rankedTeam: string | null = null;
  const rankedFigure = shallowRef<TeamImpact | null>(null);
  let requested = "";
  let lastRequest: (TeamRequest & { only?: string | null }) | null = null;
  let controller: AbortController | null = null;
  /** the account the review on screen was planned on: it stands for that account and no other */
  let plannedOn: string | null = null;
  /** the team-buff switch the review on screen (or the run in flight) is scored under; null with neither */
  let plannedAuto: boolean | null = null;
  /** the account the team (members, pins) and its plans were read from: a run on a team another tab changed saved one
   *  member's build into another's slot (2026-11-08 hunt H1). This page's own save carries it forward. */
  let loadedOn: string | null = null;
  let saving = false;
  /** the ticks the figures on screen stand for, and the newest ask for each: an answer to an older one is dropped */
  let figuredTicks: string | null = null;
  let teamFigureAsk = 0;
  let rileyAsk = 0;

  const stores = (): BuildTeamStores => ({ character: characterStore as any, team: teamStore as any, inventory: inventoryStore as any });
  const undoLive = computed(() => undoIsLive(stores(), undoRecord.value));
  const reviewIsCurrent = (): boolean => plannedOn === accountFingerprint(stores());
  /** Is the team on screen still what the account holds? */
  const planIsCurrent = (): boolean => loadedOn === accountFingerprint(stores());

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

  function restoreReview(kept: KeptReview): void {
    team.value = kept.team;
    only.value = kept.only;
    plans.value = kept.plans;
    order.value = kept.order;
    erFloors.value = kept.erFloors;
    result.value = kept.result;
    saveSlots.value = [...kept.saveSlots.value];
    saveWhy.value = kept.saveWhy;
    teamFigure.value = kept.teamFigure.value;
    rileyAfter.value = kept.rileyAfter.value;
    rankedFigure.value = kept.rankedFigure.value;
    applied.value = null;
    error.value = null;
    plannedOn = kept.on;
    plannedAuto = kept.auto;
    Object.assign(options, kept.options);
    loadedOn = kept.on;
    figuredTicks = ticksKey(saveSlots.value);
    keptReview = { ...kept, saveSlots, teamFigure, rileyAfter, rankedFigure };
    phase.value = "result";
    // a figure still on its way when the page was left lands on the old page's refs
    if (!teamFigure.value) void computeTeamFigure(kept.result);
    if (rileyAfter.value == null) void computeRileyAfter(kept.result);
    if (!rankedFigure.value) void computeRankedFigure(kept.result);
  }

  async function load(request: TeamRequest & { only?: string | null }): Promise<void> {
    controller?.abort();
    requested = requestKey(request);
    lastRequest = request;
    rankedTeam = request.only ? request.rankedTeam ?? null : null;
    if (keptReview?.request === requested && keptReview.on === accountFingerprint(stores())) {
      if (keptReview.auto === autoTeamBuffs.value) {
        restoreReview(keptReview);
        return;
      }
      // planned under the other team-buff switch: its figures are not this page's any more
      keptReview = null;
      await load(request);
      if (phase.value === "plan") error.value = SWITCH_CHANGED_TEXT;
      return;
    }
    result.value = null;
    applied.value = null;
    teamFigure.value = null;
    rileyAfter.value = null;
    rankedFigure.value = null;
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
    loadedOn = accountFingerprint(stores());
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
    if (!planIsCurrent()) {
      // the view reads the team again itself (BuildTeamView `build`), with what it shows beside it
      if (lastRequest) await load(lastRequest);
      if (phase.value === "plan") error.value = TEAM_CHANGED_TEXT;
      return;
    }
    saveOptions();
    controller?.abort();
    const ctrl = new AbortController();
    controller = ctrl;
    phase.value = "running";
    error.value = null;
    result.value = null;
    applied.value = null;
    teamFigure.value = null;
    rileyAfter.value = null;
    rankedFigure.value = null;
    keptReview = null;
    startedAt.value = Date.now();
    progress.value = team.value.characterIds.map(() => ({ phase: "waiting", processed: 0, generated: 0 }));
    const backend = workerBackend({ workerCount: resolveOptimizerWorkerCount((settingsStore.config as { optimizerWorkerCount?: unknown })?.optimizerWorkerCount) });
    // one member only: the others get no plan (they keep their echoes, which stay out of the search)
    const onlySlot = only.value ? team.value.characterIds.indexOf(only.value) : -1;
    const runPlans: MemberPlan[] = onlySlot >= 0 ? [] : plans.value.plans;
    if (onlySlot >= 0) runPlans[onlySlot] = plans.value.plans[onlySlot]!;
    const fingerprint = accountFingerprint(stores());
    const auto = autoTeamBuffs.value;
    plannedAuto = auto;
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
      saveWhy.value = null;
      // with a team total the ticks are judged on it: the set of builds that reads the highest, never a set that reads
      // lower than today (but for an Energy Regen need), and nothing when no set beats today (`bestSaveTicks`). Each
      // member judged alone opened a Save its own headline put at −15.2 % (hunt round 2, M1)
      if (out.team) {
        const spec = team.value;
        const chars = plain(characterStore.characters);
        const inv = plain(inventoryStore.echoes);
        const pick = await bestSaveTicks(out.members, out.team.before, async (ticks) => {
          try {
            return (await teamFigureOf(out, spec, chars, inv, ticks))?.after ?? null;
          } catch {
            return null; // this set stays out of the choice
          }
        });
        if (ctrl.signal.aborted) {
          if (result.value === out) result.value = null;
          return;
        }
        if (pick) {
          saveSlots.value = pick.ticks;
          saveWhy.value = pick.why;
        }
      }
      // the headline before the page shows: read with every new build, its sign could be the opposite of the Save's
      await computeTeamFigure(out);
      if (ctrl.signal.aborted) {
        if (result.value === out) result.value = null;
        return;
      }
      keptReview = { request: requested, on: fingerprint, auto, options: { ...options }, team: team.value, only: only.value, plans: plans.value, order: [...order.value], erFloors: [...erFloors.value], result: out, saveSlots, saveWhy: saveWhy.value, teamFigure, rileyAfter, rankedFigure };
      phase.value = "result";
      void computeRileyAfter(out);
      void computeRankedFigure(out);
    } catch (e) {
      // a run that ended after another took over (Cancel then Build, a team opened): the page is that one's now
      if (controller !== ctrl) return;
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

  /** The headline for the ticks as they are, from the calculator. A figure that can't be worked out is left blank rather
   *  than kept: the old one would stand for other builds. */
  async function computeTeamFigure(out: BuildTeamResult): Promise<void> {
    figuredTicks = ticksKey(saveSlots.value);
    const ask = ++teamFigureAsk;
    if (!out.team || !team.value) return;
    teamFigureBusy.value = true;
    let figure: TeamFigure | null = null;
    try {
      figure = await teamFigureOf(out, team.value, plain(characterStore.characters), plain(inventoryStore.echoes), saveSlots.value);
    } catch {
      // blank, as said above
    }
    if (ask !== teamFigureAsk) return;
    teamFigureBusy.value = false;
    if (result.value === out) teamFigure.value = figure;
  }

  /** Riley's DPS for the team at the account with the ticked builds worn (his "My build" spread reads the echoes). */
  async function computeRileyAfter(out: BuildTeamResult): Promise<void> {
    const key = plans.value?.riley?.teamKey;
    if (!key) return;
    const ask = ++rileyAsk;
    const saving = out.members.filter((m) => m.draft && saveSlots.value[m.slot]);
    if (!saving.length) {
      rileyAfter.value = plans.value?.dpsMine ?? null; // nothing would change
      rileyAfterBusy.value = false;
      return;
    }
    rileyAfter.value = null;
    rileyAfterBusy.value = true;
    let total: number | null = null;
    try {
      const chars = plain(characterStore.characters);
      for (const m of saving) chars[m.characterId] = applyBuildFields(chars[m.characterId] ?? {}, m.draft!);
      const acc = rileyAccountOf(chars, { echoes: plain(inventoryStore.echoes), equipped: plain(inventoryStore.equipped) }, plain(teamStore.teams));
      const [solve] = await rileyClient().solveMine([key], { account: acc, subs: "mine" });
      total = solve?.best?.total ?? null;
    } catch {
      // no figure: the tile says so
    }
    if (ask !== rileyAsk) return;
    rileyAfter.value = total;
    rileyAfterBusy.value = false;
  }

  // a tick moves what the Save writes, so what the review says it gets moves with it. Not on an account that changed
  // since the run, a save included: the figures would read that account, and Save refuses that review anyway
  watch(
    saveSlots,
    () => {
      const out = result.value;
      if (!out || phase.value !== "result" || ticksKey(saveSlots.value) === figuredTicks || !reviewIsCurrent()) return;
      void computeTeamFigure(out);
      void computeRileyAfter(out);
    },
    { deep: true },
  );

  /** The team figure of the /account row that opened this run, by the row's own rule: its scorer, the new build worn, and
   *  only when the run re-gears the build that row's figure reads (the active one). */
  async function computeRankedFigure(out: BuildTeamResult): Promise<void> {
    const m = out.members.find((x) => x?.characterId === only.value);
    if (!rankedTeam || !m?.draft) return;
    const chars = plain(characterStore.characters);
    const activeId = chars[m.characterId]?.activeBuildId ?? null;
    if (m.fromBuild.source !== "active" && (m.fromBuild.id == null || m.fromBuild.id !== activeId)) return;
    try {
      const { rankedTeamImpact } = await import("../account/investPlan");
      const hypo = { ...chars, [m.characterId]: applyBuildFields(chars[m.characterId] ?? {}, m.draft) };
      const figure = await rankedTeamImpact(rankedTeam, chars, plain(inventoryStore.echoes), plain(teamStore.teams), hypo, { autoTeamBuffs: autoTeamBuffs.value });
      if (result.value === out) rankedFigure.value = figure;
    } catch {
      // the row's figure stays on /account: the review keeps the run's own numbers
    }
  }

  /** The members a save would write (ticked, with a build). */
  const toSave = computed(() => (result.value?.members ?? []).filter((m, i) => saveSlots.value[i] && m.draft));
  /** The members as the review reads them under the ticks: the cards add up to the headline. */
  const reviewMembers = computed(() => membersAsTicked(result.value?.members ?? [], saveSlots.value, teamFigure.value?.perSlot ?? null));
  /** Echoes a build being saved takes from a teammate whose build here is not being replaced (the team would wear
   *  them twice): said in the save bar and the confirm dialog. */
  const conflicts = computed(() => shareConflicts(result.value?.members ?? [], new Set(toSave.value.map((m) => m.characterId))));

  /** The review no longer says what the account is: `result` goes, and the page reads the team again (`load`). */
  function dropReview(): void {
    result.value = null;
    applied.value = null;
    teamFigure.value = null;
    rileyAfter.value = null;
    rankedFigure.value = null;
    plannedOn = null;
    plannedAuto = null;
    keptReview = null;
  }

  // The team-buff switch moved (the palette, Settings, another page's toggle): a review, or a run in flight, scored under
  // the other one would go on showing figures this page no longer gives (F2). It is put down, and the plan says why.
  watch(autoTeamBuffs, () => {
    if (plannedAuto === null || plannedAuto === autoTeamBuffs.value) return;
    if (phase.value === "running") {
      controller?.abort();
      controller = null;
      plannedAuto = null;
      phase.value = plans.value ? "plan" : "pick";
      error.value = SWITCH_CHANGED_TEXT;
    } else if (phase.value === "result" && result.value) {
      dropReview();
      phase.value = plans.value ? "plan" : "pick";
      error.value = SWITCH_CHANGED_TEXT;
    }
  });

  /** "Change plan": the review is put down, so it is not there when the page is opened again. */
  function backToPlan(): void {
    keptReview = null;
    phase.value = "plan";
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
      keptReview = null;
      loadedOn = accountFingerprint(stores()); // this page's own write: the team on screen is still the team
      return out;
    } finally {
      saving = false;
    }
  }

  /** The Undo this page acts on: the last save's, even when another tab made it (apply.ts `newestUndo`). */
  function currentUndo(): UndoRecord | null {
    const rec = newestUndo(undoRecord.value, readStoredUndo()) ?? readUndo();
    if (rec?.at !== undoRecord.value?.at) undoRecord.value = rec;
    return rec;
  }

  /** What Undo would do with each build, for the confirm; `undoRecord` is then the record it describes. */
  function undoPreview(): UndoFate[] {
    const rec = currentUndo();
    return rec ? undoFates(stores(), rec) : [];
  }

  /** `described`: the record the confirm spoke for; a newer save since refuses with `UndoRefused`, nothing written. */
  function undo(described?: Pick<UndoRecord, "at"> | null): UndoOutcome | null {
    const rec = currentUndo();
    if (!rec) return null;
    if (described && described.at !== rec.at) throw new UndoRefused();
    const wasCurrent = planIsCurrent();
    snapshotCharacters(rec.created.map((c) => c.characterId), "before-build-team-undo", { characters: characterStore.characters, echoes: inventoryStore.echoes as any[] });
    const out = undoBuildTeam(stores(), rec);
    if (wasCurrent) loadedOn = accountFingerprint(stores());
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
    reviewMembers,
    teamFigure,
    teamFigureBusy,
    rileyAfter,
    rileyAfterBusy,
    rankedFigure,
    saveSlots,
    saveWhy,
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
    backToPlan,
    save,
    undo,
    undoPreview,
    saveOptions,
    planIsCurrent,
  };
}
