// Wuthering Tools+ — /weapons' data: the roster ranking (the cache entry /my-rankings and /account share when it
// holds this exact data, else a progressive rankRoster run), then the weapon-value run on top of it (its own cache,
// keyed by the same fingerprint). Both stay on the main thread in slices, as on /account; a generation counter drops
// late callbacks, and the weapon run is cancelled on unmount or a new run. Either cache missing in this tab, the result
// this browser saved for the same fingerprint and app build (persist/savedResults.ts) is shown instead of a run.
import { computed, onBeforeUnmount, ref, shallowRef, toRaw, watch } from "vue";
import { storeToRefs } from "pinia";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { isSetUp, rankRoster, type RosterRanking } from "../myRankings/rankRoster";
import { rankingFingerprint, readCachedRanking, readSavedRanking, sharedRanking } from "../myRankings/rankingCache";
import { autoTeamBuffs } from "../teamContext/autoTeamBuffs";
import { WEAPON_VALUE_VERSION, weaponValue, type CharacterWeaponValue, type WeaponValueResult } from "./weaponValue";
import { WEAPON_VALUE_CACHE_KEY, createValueCache } from "./valueCache";

export type RunState = "idle" | "ranking" | "scoring" | "done" | "error";

export interface RunStatus {
  state: RunState;
  done: number;
  total: number;
  label: string;
  /** served from this tab's cache or this browser's saved results */
  restored: boolean;
  /** when the weapon values shown were saved (ms), if they came from this browser's saved results */
  savedAt: number | null;
  computedAt: string | null;
  error: string | null;
}

const idle = (): RunStatus => ({ state: "idle", done: 0, total: 0, label: "", restored: false, savedAt: null, computedAt: null, error: null });
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(toRaw(value) ?? null)) as T;

export const valueCache = createValueCache<WeaponValueResult>(
  WEAPON_VALUE_CACHE_KEY,
  WEAPON_VALUE_VERSION,
  (v) => Array.isArray((v as WeaponValueResult)?.rows) && !(v as WeaponValueResult).cancelled,
  "weaponValue",
);

export function useWeaponValueData() {
  const characterStore = useCharacterStore();
  const inventoryStore = useInventoryStore();
  const teamStore = useTeamRotationsStore();
  const { characters } = storeToRefs(characterStore) as unknown as { characters: { value: Record<string, Record<string, any>> } };
  const { teams } = storeToRefs(teamStore) as unknown as { teams: { value: Array<Record<string, any>> } };

  const setUpCount = computed(() => Object.values(characters.value ?? {}).filter((c) => isSetUp(c)).length);
  const ownedKeys = computed(() => Object.keys(characters.value ?? {}).filter((k) => isSetUp(characters.value[k])));

  // the ranking with the investment estimates on (the /my-rankings default), so the three pages share one entry
  const fingerprint = (): string =>
    rankingFingerprint({
      characters: toRaw(characters.value ?? {}),
      echoes: toRaw(inventoryStore.echoes ?? []),
      teams: toRaw(teams.value ?? []),
      investment: true,
      autoTeamBuffs: autoTeamBuffs.value,
    });

  const ranking = shallowRef<RosterRanking | null>(null);
  const result = shallowRef<WeaponValueResult | null>(null);
  /** rows scored so far while a run is in progress */
  const liveRows = shallowRef<CharacterWeaponValue[] | null>(null);
  const status = ref<RunStatus>(idle());
  const fp = ref("");
  const rows = computed<CharacterWeaponValue[]>(() => liveRows.value ?? result.value?.rows ?? []);
  /** set-up characters still waiting for their row (skeletons) */
  const pending = computed(() => (status.value.state === "ranking" ? setUpCount.value : status.value.state === "scoring" ? Math.max(0, status.value.total - rows.value.length) : 0));

  let generation = 0;
  let signal: { cancelled: boolean } | null = null;
  let leaveRanking: (() => void) | null = null;

  /** Score (or restore) everything for the data as it is now. `force` skips both caches. */
  async function refresh(force = false): Promise<void> {
    if (signal) signal.cancelled = true;
    const gen = ++generation;
    if (!setUpCount.value) {
      ranking.value = null;
      result.value = null;
      status.value = idle();
      return;
    }
    const key = fingerprint();
    fp.value = key;
    const data = { characters: clone(characters.value ?? {}), echoes: clone(inventoryStore.echoes ?? []), teams: clone(teams.value ?? []) };

    // 1. the roster ranking (best rotations, fieldable teams)
    let base = force ? null : readCachedRanking(key);
    if (!base && !force) {
      base = (await readSavedRanking(key))?.ranking ?? null;
      if (gen !== generation) return;
    }
    if (!base) {
      result.value = null;
      liveRows.value = [];
      status.value = { ...idle(), state: "ranking", label: "ranking your roster" };
      // one run per fingerprint in this tab: /account or /my-rankings may have started it (rankingCache.ts)
      const shared = sharedRanking(
        key,
        (onProgress) => rankRoster(data.characters, data.echoes, data.teams, { investment: true, autoTeamBuffs: autoTeamBuffs.value, onProgress }),
        {
          onProgress: ({ done, total, label }) => {
            if (gen === generation) status.value = { ...status.value, done, total, label };
          },
        },
      );
      leaveRanking?.();
      leaveRanking = shared.leave;
      try {
        base = await shared.promise;
      } catch (err) {
        if (gen === generation) {
          status.value = { ...idle(), state: "error", error: err instanceof Error ? err.message : String(err) };
          liveRows.value = null;
        }
        return;
      } finally {
        shared.leave();
      }
      // the run writes the cache itself (a ranking that outlived the page still scored exactly `key`'s data)
      if (gen !== generation) return;
    }
    ranking.value = base;

    // 2. weapon value on top of it
    let cached = force ? null : valueCache.read(key);
    let savedAt: number | null = null;
    if (!cached && !force) {
      const saved = await valueCache.readSaved(key);
      if (gen !== generation) return;
      if (saved) ({ value: cached, savedAt } = saved);
    }
    if (cached) {
      result.value = cached;
      liveRows.value = null;
      status.value = { ...idle(), state: "done", restored: true, savedAt, computedAt: cached.computedAt, done: cached.rows.length, total: cached.rows.length };
      return;
    }
    signal = { cancelled: false };
    const mine = signal;
    result.value = null;
    liveRows.value = [];
    status.value = { ...idle(), state: "scoring", label: "starting" };
    try {
      const out = await weaponValue(data.characters, data.echoes, data.teams, base, {
        autoTeamBuffs: autoTeamBuffs.value,
        signal: mine,
        onProgress: (p, row) => {
          if (gen !== generation) return;
          status.value = { ...status.value, done: p.done, total: p.total, label: p.label };
          if (row) liveRows.value = [...(liveRows.value ?? []), row];
        },
      });
      if (gen !== generation || out.cancelled) return;
      result.value = out;
      valueCache.write(key, out);
      status.value = { ...idle(), state: "done", computedAt: out.computedAt, done: out.rows.length, total: out.rows.length, error: out.errors.length ? `${out.errors.length} scoring errors` : null };
    } catch (err) {
      if (gen === generation) status.value = { ...idle(), state: "error", error: err instanceof Error ? err.message : String(err) };
    } finally {
      if (gen === generation) liveRows.value = null;
    }
  }

  watch(autoTeamBuffs, () => void refresh());
  onBeforeUnmount(() => {
    leaveRanking?.();
    generation += 1;
    if (signal) signal.cancelled = true;
  });

  return {
    characters,
    teams,
    inventoryEchoes: computed(() => (inventoryStore.echoes ?? []) as any[]),
    setUpCount,
    ownedKeys,
    ranking,
    result,
    rows,
    pending,
    status,
    fingerprint: fp,
    refresh,
    setActiveCharacter: (id: string) => characterStore.setActiveCharacter(id),
  };
}
