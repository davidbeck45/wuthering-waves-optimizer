// Wuthering Tools+ numbers log — the reactive side of "What moved in your numbers" for its two views: the stored log
// (followed across tabs), the state to show, whether a ranking is running in this tab, and whether the log is behind
// the account or the app as they are now. Reads only: recordRanking.ts is the one writer.
import { computed, getCurrentInstance, onBeforeUnmount, onMounted, ref, toRaw, type ComputedRef, type Ref } from "vue";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { characterDisplayName, weaponDisplayName } from "../display/names";
import { rankingFingerprint, rankingsInFlight } from "../myRankings/rankingCache";
import { appBuildId } from "../persist/savedResults";
import { isNewVisitor } from "../shell/welcome";
import { autoTeamBuffs } from "../teamContext/autoTeamBuffs";
import type { Namer } from "./compare";
import { logVersion, readLog, watchLog } from "./logStore";
import { numbersState, staleness, type NumbersState, type Stale } from "./view";

export const NAMES: Namer = {
  character: (id) => characterDisplayName(id) || id,
  weapon: (key) => (key ? weaponDisplayName(key) || key : "no weapon"),
};

export interface NumbersLogView {
  state: ComputedRef<NumbersState>;
  /** the older record the newest is read against (its `at`); null = the one just before it */
  baseAt: Ref<number | null>;
  /** a ranking is running in this tab: a new record may be seconds away */
  running: Ref<boolean>;
  stale: Ref<Stale>;
  /** ticks once a minute, so "taken 4 min ago" stays true */
  now: Ref<number>;
}

/** `stale: false` for a view that does not say whether the log is behind (/account's card: the page itself scores
 *  whenever the account changed), so the account is not hashed for nothing. */
export function useNumbersLog(options: { stale?: boolean } = {}): NumbersLogView {
  watchLog();
  const characterStore = useCharacterStore();
  const inventoryStore = useInventoryStore();
  const teamStore = useTeamRotationsStore();
  const hasAccount = computed(() => !isNewVisitor(characterStore.characters as Record<string, { weapon?: unknown }>, inventoryStore.echoes as unknown[]));
  const log = computed(() => {
    void logVersion.value; // re-read when this tab or another one wrote
    return readLog();
  });
  const baseAt = ref<number | null>(null);
  const state = computed(() => numbersState(log.value, hasAccount.value, baseAt.value));

  const running = ref(rankingsInFlight() > 0);
  const stale = ref<Stale>(null);
  const now = ref(Date.now());

  /** the fingerprint hashes the whole account, so it is worked out off the first paint and again when the log moves */
  function checkStale(): void {
    if (options.stale === false) return;
    const seen = log.value.seen;
    const newest = log.value.entries[log.value.entries.length - 1] ?? null;
    if (!seen) {
      stale.value = staleness(null, { fp: "", build: appBuildId() }, newest?.build ?? null);
      return;
    }
    try {
      const fp = rankingFingerprint({
        characters: toRaw(characterStore.characters ?? {}),
        echoes: toRaw(inventoryStore.echoes ?? []),
        teams: toRaw(teamStore.teams ?? []),
        investment: true,
        autoTeamBuffs: autoTeamBuffs.value,
      });
      stale.value = staleness(seen, { fp, build: appBuildId() });
    } catch {
      stale.value = null;
    }
  }

  let timer: ReturnType<typeof setInterval> | null = null;
  let seenVersion = -1;
  let ticks = 0;
  function tick(): void {
    running.value = rankingsInFlight() > 0;
    if (seenVersion !== logVersion.value) {
      seenVersion = logVersion.value;
      checkStale();
    }
    ticks += 1;
    if (ticks % 30 === 0) now.value = Date.now();
  }
  if (getCurrentInstance()) {
    onMounted(() => {
      // after the first paint, then every two seconds: a run in flight ends, the recorder writes in idle time
      setTimeout(tick, 0);
      timer = setInterval(tick, 2000);
    });
    onBeforeUnmount(() => {
      if (timer) clearInterval(timer);
    });
  }
  return { state, baseAt, running, stale, now };
}
