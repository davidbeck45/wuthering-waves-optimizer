// Wuthering Tools+ — the /account page's data: the Account State from the stores, the roster ranking (the
// /my-rankings cache when it holds this exact data, else a progressive rankRoster run), then the investment plan
// on top of it (its own cache, keyed by the same fingerprint). Both runs stay on the main thread, in slices: the
// ranking yields between characters and teams, the plan every ~12 ms of engine work, so the page never freezes.
import { erNeedsKey, erNeedsOf } from "../energy/energySubstats";
import { useEnergyNeeds } from "../energy/useEnergyNeeds";
import { computed, onBeforeUnmount, ref, shallowRef, toRaw, watch } from "vue";
import { storeToRefs } from "pinia";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { isSetUp, rankRoster, type CharacterRank, type RosterRanking, type TeamRank } from "../myRankings/rankRoster";
import { rankingFingerprint, readCachedRanking, writeCachedRanking } from "../myRankings/rankingCache";
import { autoTeamBuffs } from "../teamContext/autoTeamBuffs";
import { accountStateOf } from "./accountState";
import { investPlan, type InvestItem, type InvestPlan, type InvestProgress } from "./investPlan";
import { readCachedPlan, writeCachedPlan } from "./investCache";

export type RunState = "idle" | "running" | "done" | "error";

export interface RunStatus {
  state: RunState;
  done: number;
  total: number;
  label: string;
  /** served from this tab's cache instead of scored on this visit */
  restored: boolean;
  computedAt: string | null;
  error: string | null;
}

const idle = (): RunStatus => ({ state: "idle", done: 0, total: 0, label: "", restored: false, computedAt: null, error: null });
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(toRaw(value) ?? null)) as T;

export function useAccountData() {
  const characterStore = useCharacterStore();
  const inventoryStore = useInventoryStore();
  const teamStore = useTeamRotationsStore();
  const { characters, favoriteCharacters } = storeToRefs(characterStore) as unknown as {
    characters: { value: Record<string, Record<string, any>> };
    favoriteCharacters: { value: string[] };
  };
  const { teams } = storeToRefs(teamStore) as unknown as { teams: { value: Array<Record<string, any>> } };

  const account = computed(() =>
    accountStateOf(characters.value ?? {}, { echoes: inventoryStore.echoes ?? [], equipped: inventoryStore.equipped ?? {} }, teams.value ?? []),
  );
  const setUpCount = computed(() => Object.values(characters.value ?? {}).filter((c) => isSetUp(c)).length);
  const ownedKeys = computed(() => Object.keys(characters.value ?? {}).filter((k) => isSetUp(characters.value[k])));

  // the ranking runs with the investment estimates on (the /my-rankings default), so the two pages share one cache entry
  const fingerprint = (): string =>
    rankingFingerprint({
      characters: toRaw(characters.value ?? {}),
      echoes: toRaw(inventoryStore.echoes ?? []),
      teams: toRaw(teams.value ?? []),
      investment: true,
      autoTeamBuffs: autoTeamBuffs.value,
    });

  // ---- the roster ranking
  const ranking = shallowRef<RosterRanking | null>(null);
  const liveRanking = shallowRef<{ characters: CharacterRank[]; teams: TeamRank[] } | null>(null);
  const rankingStatus = ref<RunStatus>(idle());
  /** what the cards show while a run is in progress: the rows scored so far */
  const shownRanking = computed<RosterRanking | null>(() =>
    liveRanking.value ? ({ enemy: null, teamsSkipped: 0, computedAt: "", ...liveRanking.value } as unknown as RosterRanking) : ranking.value,
  );

  // ---- the investment plan
  const plan = shallowRef<InvestPlan | null>(null);
  const liveItems = shallowRef<InvestItem[] | null>(null);
  const planStatus = ref<RunStatus>(idle());
  const shownItems = computed<InvestItem[] | null>(() => liveItems.value ?? plan.value?.items ?? null);

  let generation = 0;
  let planSignal: { cancelled: boolean } | null = null;
  let rankingFp = "";
  let unmounted = false;

  async function runPlan(fp: string, gen: number, data: { characters: any; echoes: any[]; teams: any[] }, base: RosterRanking, force: boolean): Promise<void> {
    // Wuthering Tools+ energy check: ER counts as a floor in the gains, so the cache keys on the needs too
    const erNeeds = await erNeedsOf(useEnergyNeeds()).catch(() => ({}));
    if (gen !== generation) return;
    fp = `${fp}|er:${erNeedsKey(erNeeds)}`;
    const cached = force ? null : readCachedPlan(fp);
    if (cached) {
      plan.value = cached;
      planStatus.value = { ...idle(), state: "done", restored: true, computedAt: cached.computedAt };
      return;
    }
    planSignal = { cancelled: false };
    const signal = planSignal;
    plan.value = null;
    liveItems.value = [];
    planStatus.value = { ...idle(), state: "running", total: base.characters.length, label: "starting" };
    try {
      const result = await investPlan(data.characters, data.echoes, data.teams, base, {
        autoTeamBuffs: autoTeamBuffs.value,
        erNeeds,
        signal,
        onProgress: (p: InvestProgress, items) => {
          if (gen !== generation) return;
          planStatus.value = { ...planStatus.value, done: p.done, total: p.total, label: p.label };
          liveItems.value = items;
        },
      });
      if (gen !== generation || result.cancelled) return;
      plan.value = result;
      writeCachedPlan(fp, result);
      planStatus.value = { ...idle(), state: "done", computedAt: result.computedAt, done: result.characters, total: result.characters, error: result.errors.length ? `${result.errors.length} scoring errors` : null };
    } catch (err) {
      if (gen === generation) planStatus.value = { ...idle(), state: "error", error: err instanceof Error ? err.message : String(err) };
    } finally {
      if (gen === generation) liveItems.value = null;
    }
  }

  /** Score (or restore) everything for the data as it is now. `force` skips both caches. */
  async function refresh(force = false): Promise<void> {
    if (!setUpCount.value) {
      ranking.value = null;
      plan.value = null;
      return;
    }
    const gen = ++generation;
    if (planSignal) planSignal.cancelled = true;
    const fp = fingerprint();
    rankingFp = fp;
    const data = { characters: clone(characters.value ?? {}), echoes: clone(inventoryStore.echoes ?? []), teams: clone(teams.value ?? []) };
    let base = force ? null : readCachedRanking(fp);
    if (base) {
      ranking.value = base;
      rankingStatus.value = { ...idle(), state: "done", restored: true, computedAt: base.computedAt };
    } else {
      ranking.value = null;
      plan.value = null;
      liveRanking.value = { characters: [], teams: [] };
      rankingStatus.value = { ...idle(), state: "running", label: "starting" };
      try {
        base = await rankRoster(data.characters, data.echoes, data.teams, {
          investment: true,
          autoTeamBuffs: autoTeamBuffs.value,
          onProgress: (done, total, label, finished) => {
            if (gen !== generation) return;
            rankingStatus.value = { ...rankingStatus.value, done, total, label };
            const run = liveRanking.value;
            if (!run || !finished) return;
            liveRanking.value = finished.kind === "character" ? { ...run, characters: [...run.characters, finished.rank] } : { ...run, teams: [...run.teams, finished.rank] };
          },
        });
      } catch (err) {
        if (gen === generation) {
          rankingStatus.value = { ...idle(), state: "error", error: err instanceof Error ? err.message : String(err) };
          liveRanking.value = null;
        }
        return;
      }
      if (gen !== generation) {
        // rankRoster cannot be stopped: a run that outlived the page still scored exactly `fp`'s data, so keep it
        // for the next visit or /my-rankings (a superseded run on a live page is dropped: the newer one owns the cache)
        if (unmounted) writeCachedRanking(fp, base);
        return;
      }
      ranking.value = base;
      liveRanking.value = null;
      writeCachedRanking(fp, base);
      rankingStatus.value = { ...idle(), state: "done", computedAt: base.computedAt, done: rankingStatus.value.total, total: rankingStatus.value.total };
    }
    // a forced refresh re-plans too (the plan cache is keyed by the same fingerprint)
    await runPlan(fp, gen, data, base, force);
  }

  watch(autoTeamBuffs, () => void refresh());
  onBeforeUnmount(() => {
    unmounted = true;
    generation += 1; // late callbacks of a run in flight are ignored
    if (planSignal) planSignal.cancelled = true;
  });

  return {
    characters,
    favorites: favoriteCharacters,
    inventoryEchoes: computed(() => (inventoryStore.echoes ?? []) as any[]),
    account,
    setUpCount,
    ownedKeys,
    ranking,
    shownRanking,
    rankingStatus,
    plan,
    shownItems,
    planStatus,
    refresh,
    /** the fingerprint the shown ranking was computed for (for tests and the footer) */
    rankingFingerprint: () => rankingFp,
    setActiveCharacter: (id: string) => characterStore.setActiveCharacter(id),
  };
}
