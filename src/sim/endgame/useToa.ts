// Wuthering Tools+ — the /endgame page's state (the ToA clear check): the season shipped with this build and its
// reset countdown on the player's server clock, the check over Riley's engine (rileyClient, one worker for the app),
// the Vigor plan, and the player's logged clears. Everything heavy runs in the worker; the plan is a few ms here.
//
// localStorage: `wtplus:endgame:prefs` (server region, plan with my pace, time left / used on Calibrate), `wtplus:endgame:check` (the last check,
// reused while its key — engine commit, account, builds, season data — still matches), `wtplus:endgame:clears`.
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from "vue";
import { storeToRefs } from "pinia";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { rileyClient } from "../engine/rileyClient";
import { useRileyAccount } from "../engine/useRileyAccount";
import { appKeyOf } from "../rankings/castMapper";
import { defaultPace, paceOf, readClearLog, teamSignature, writeClearLog, type ClearLog, type ClockReading, type LoggedClear } from "./crests";
import {
  guessRegion,
  loadSeason,
  offsetOf,
  seasonStatus,
  SERVER_REGIONS,
  toaIndex,
  type ServerRegionId,
  type ToaSeason,
} from "./toaData";
import { checkKey, planInputOf, rankFloor, runToaCheck, type CandidateTeam, type FloorResult, type Progress, type ToaCheck } from "./toaRun";
import { nearMisses, planAlternatives, planVigor, type Plan, type PlanAlternative } from "./vigorPlan";

export const PREFS_KEY = "wtplus:endgame:prefs";
export const CHECK_KEY = "wtplus:endgame:check";
/** teams timed on every floor: the saved ones always, then by DPS */
export const CANDIDATES = 30;

interface Prefs {
  v: 1;
  region: ServerRegionId;
  usePace: boolean;
  /** what the player types on the Calibrate tab: the time left (the game's countdown) or the time used */
  reading: ClockReading;
}

function readPrefs(): Prefs {
  const fallback: Prefs = { v: 1, region: guessRegion(-new Date().getTimezoneOffset()), usePace: false, reading: "left" };
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null");
    if (p?.v === 1 && SERVER_REGIONS.some((r) => r.id === p.region)) return { v: 1, region: p.region, usePace: !!p.usePace, reading: p.reading === "used" ? "used" : "left" };
  } catch {
    /* defaults */
  }
  return fallback;
}

function readStoredCheck(): ToaCheck | null {
  try {
    const p = JSON.parse(localStorage.getItem(CHECK_KEY) ?? "null");
    return p?.v === 1 && p.check?.key && Array.isArray(p.check.results) ? (p.check as ToaCheck) : null;
  } catch {
    return null;
  }
}

function storeCheck(check: ToaCheck): void {
  try {
    localStorage.setItem(CHECK_KEY, JSON.stringify({ v: 1, check }));
  } catch {
    /* over quota: the check lives for this visit only */
  }
}

/** Kept across visits within the session, so coming back to the page doesn't re-solve. */
let sessionCheck: ToaCheck | null = null;

export function useToa() {
  const account = useRileyAccount();
  const teamStore = useTeamRotationsStore();
  const { teams } = storeToRefs(teamStore) as unknown as { teams: { value: Array<{ name?: string; characterIds?: Array<string | null> }> } };
  const riley = rileyClient();

  const prefs = reactive(readPrefs());
  watch(prefs, () => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* not kept */
    }
  });

  const now = ref(Date.now());
  let tick: ReturnType<typeof setInterval> | null = null;
  const status = computed(() => seasonStatus(toaIndex, now.value, offsetOf(prefs.region)));

  const season = shallowRef<ToaSeason | null>(null);
  const seasonError = ref<string | null>(null);
  watch(
    () => status.value.entry?.file,
    async () => {
      const entry = status.value.entry;
      if (!entry) return;
      try {
        season.value = await loadSeason(entry);
        seasonError.value = null;
      } catch (e) {
        seasonError.value = e instanceof Error ? e.message : String(e);
      }
    },
    { immediate: true },
  );

  const savedTeams = computed(() =>
    (teams.value ?? []).map((t) => ({ name: String(t.name ?? ""), characterIds: (t.characterIds ?? []).map((x) => (x ? String(x) : null)) })),
  );
  const owned = computed(() => Object.entries(account.value.entries).filter(([, e]) => e.owned).map(([name]) => appKeyOf(name)));
  const hasAccount = computed(() => owned.value.length > 0);
  const savedSignatures = computed(() =>
    savedTeams.value.map((t) => t.characterIds.filter((x): x is string => !!x)).filter((ids) => ids.length === 3).map(teamSignature),
  );
  const wantKey = computed(() => (season.value ? checkKey(riley.commit, account.value, season.value, [...new Set(savedSignatures.value)], CANDIDATES) : ""));

  const check = shallowRef<ToaCheck | null>(null);
  const running = ref(false);
  const progress = ref<Progress | null>(null);
  const error = ref<string | null>(null);
  let controller: AbortController | null = null;
  /** the key the run in flight was started for — a second request for the same one joins it */
  let runningKey = "";

  /** the stored check where it still fits this account and season, else a new one */
  function adopt(): boolean {
    const want = wantKey.value;
    if (!want) return false;
    for (const c of [check.value, sessionCheck, readStoredCheck()]) {
      if (c?.key === want) {
        check.value = c;
        sessionCheck = c;
        return true;
      }
    }
    return false;
  }

  async function compute(opts: { force?: boolean } = {}): Promise<void> {
    if (!season.value || !hasAccount.value) return;
    if (!opts.force && controller && runningKey === wantKey.value) return;
    controller?.abort();
    const ctrl = new AbortController();
    controller = ctrl;
    runningKey = wantKey.value;
    running.value = true;
    error.value = null;
    progress.value = { phase: "teams", done: 0, total: 1, label: "Starting the engine" };
    try {
      const result = await runToaCheck(riley, season.value, {
        account: account.value,
        savedTeams: savedTeams.value,
        limit: CANDIDATES,
        signal: ctrl.signal,
        onProgress: (p) => {
          if (controller === ctrl) progress.value = p;
        },
      });
      if (controller !== ctrl) return;
      check.value = result;
      sessionCheck = result;
      storeCheck(result);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      if (controller === ctrl) {
        running.value = false;
        progress.value = null;
        controller = null;
      }
    }
  }

  function cancel(): void {
    controller?.abort();
    controller = null;
    running.value = false;
    progress.value = null;
  }

  // a fresh check whenever the account, its builds or the season data move (and none fits yet) — a check still
  // running for the old key is cancelled and started again (`compute` aborts it), so it never lands stale
  watch(wantKey, (key) => {
    if (!key || !hasAccount.value || !status.value.current) return;
    if (!adopt()) void compute();
  });

  /* ----------------------------------------------------------------------------- calibration and plan */

  const clears = ref<ClearLog>(readClearLog());
  /** the team's own pace (its logged clear), null where it has none */
  const ownPace = (teamId: string): number | null => paceOf(clears.value.clears[teamId]);
  /** the pace the plan uses: the team's own, else the median of the logged ones */
  const paceFor = (teamId: string): number | null => ownPace(teamId) ?? defaultPace(clears.value);
  const hasClears = computed(() => Object.keys(clears.value.clears).length > 0);

  function logClear(team: CandidateTeam, floorId: string, seconds: number, sim: number): void {
    const next: ClearLog = { v: 1, clears: { ...clears.value.clears, [team.id]: { season: season.value?.season ?? 0, floorId, seconds, sim, at: Date.now() } satisfies LoggedClear } };
    clears.value = next;
    writeClearLog(next);
  }
  function forgetClear(teamId: string): void {
    const rest = { ...clears.value.clears };
    delete rest[teamId];
    clears.value = { v: 1, clears: rest };
    writeClearLog(clears.value);
  }

  const ranked = computed(() => {
    const out = new Map<string, Array<{ result: FloorResult; team: CandidateTeam }>>();
    if (!check.value || !season.value) return out;
    for (const t of season.value.towers) for (const f of t.floors) if (f.hp) out.set(f.id, rankFloor(check.value, f.id));
    return out;
  });

  const planInput = computed(() =>
    check.value && season.value ? planInputOf(season.value, check.value, { owned: owned.value, paceOf: prefs.usePace ? paceFor : undefined }) : null,
  );
  const plan = computed<Plan | null>(() => (planInput.value ? planVigor(planInput.value) : null));
  const alternatives = computed<PlanAlternative[]>(() => (planInput.value && plan.value ? planAlternatives(planInput.value, plan.value) : []));
  const misses = computed(() => {
    if (!plan.value || !season.value) return [];
    const goals = new Map(season.value.towers.flatMap((t) => t.floors.map((f) => [f.id, f.goals] as const)));
    return nearMisses(plan.value, (id) => goals.get(id) ?? []);
  });

  onMounted(() => {
    tick = setInterval(() => (now.value = Date.now()), 30_000);
    if (!adopt() && wantKey.value && hasAccount.value && status.value.current) void compute();
  });
  onBeforeUnmount(() => {
    if (tick) clearInterval(tick);
    controller?.abort();
  });

  return {
    prefs,
    now,
    status,
    season,
    seasonError,
    hasAccount,
    owned,
    check,
    running,
    progress,
    error,
    compute,
    cancel,
    ranked,
    plan,
    alternatives,
    misses,
    clears,
    hasClears,
    ownPace,
    paceFor,
    logClear,
    forgetClear,
  };
}
