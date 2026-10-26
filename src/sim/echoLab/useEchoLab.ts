// Wuthering Tools+ Echo Lab page — the page's state: the account snapshot handed to the worker, the jobs it runs
// (the whole-account pass, every character's benchmark, a character's re-roll advice), their progress, cancel, and
// the results — kept at module level so switching tabs or pages never recomputes, and in sessionStorage per
// account fingerprint so a reload of the same account is instant. All numbers come from the worker
// (echoLabClient.ts); this file only moves them. Vue, not engine: keep the engine pure.
import { computed, reactive, ref, shallowRef } from "vue";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { isSetUp } from "../myRankings/rankRoster";
import { CANCELLED, type LabAccount, type LabProgress } from "./core";
import { getEchoLabClient, labAccountOf } from "./echoLabClient";
import { accountFingerprint } from "./fingerprint";
import type { BenchmarkBatchResult, EchoLabJob, EchoLabPassResult, EchoLabResult } from "./pass";
import type { RerollAdviceResult } from "./rerollAdvice";

/** sessionStorage: the last pass and benchmarks of one account fingerprint (derived data, safe to drop) */
export const ECHO_LAB_CACHE_KEY = "wtplus:echoLab:cache";
/** bump when the cached result shapes change: an older tab's cache is then ignored, never rendered */
const CACHE_VERSION = 2;

export interface JobStatus {
  running: boolean;
  /** the last run was cancelled */
  cancelled: boolean;
  progress: LabProgress | null;
  error: string | null;
  /** the last finished run: how long it took and whether the worker answered from its cache */
  ms: number | null;
  cached: boolean;
}

const idle = (): JobStatus => ({ running: false, cancelled: false, progress: null, error: null, ms: null, cached: false });

// ── module state (one Echo Lab per app) ──
const pass = shallowRef<EchoLabPassResult | null>(null);
const passStatus = reactive<JobStatus>(idle());
const benchmarks = shallowRef<BenchmarkBatchResult | null>(null);
const benchStatus = reactive<JobStatus>(idle());
/** re-roll advice by `${fingerprint}|${characterId}|${slot}` */
const rerolls = reactive(new Map<string, RerollAdviceResult | { error: string }>());
const resultFingerprint = ref<string | null>(null);
let passAbort: AbortController | null = null;
let benchAbort: AbortController | null = null;
let hydrated = false;

interface StoredCache {
  v: number;
  fingerprint: string;
  pass: EchoLabPassResult | null;
  benchmarks: BenchmarkBatchResult | null;
}

function readCache(): StoredCache | null {
  try {
    const text = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(ECHO_LAB_CACHE_KEY) : null;
    const stored = text ? (JSON.parse(text) as StoredCache) : null;
    return stored?.v === CACHE_VERSION && typeof stored.fingerprint === "string" ? stored : null;
  } catch {
    return null;
  }
}

function writeCache(): void {
  if (!resultFingerprint.value) return;
  try {
    const value: StoredCache = { v: CACHE_VERSION, fingerprint: resultFingerprint.value, pass: pass.value, benchmarks: benchmarks.value };
    sessionStorage.setItem(ECHO_LAB_CACHE_KEY, JSON.stringify(value));
  } catch {
    // quota or no storage: the module cache still holds it for this page load
  }
}

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));
const isCancel = (err: unknown): boolean => err instanceof Error && err.name === CANCELLED;

/** Results that belong to another account state are dropped (never shown against the wrong data). */
function adopt(fingerprint: string): void {
  if (resultFingerprint.value === fingerprint) return;
  resultFingerprint.value = fingerprint;
  pass.value = null;
  benchmarks.value = null;
  rerolls.clear();
  Object.assign(passStatus, idle());
  Object.assign(benchStatus, idle());
}

export function useEchoLab() {
  const characterStore = useCharacterStore() as unknown as { characters: Record<string, any> };
  const inventoryStore = useInventoryStore() as unknown as { echoes: any[]; equipped: Record<string, Record<string, number>> };
  const teamStore = useTeamRotationsStore() as unknown as { teams: any[] };

  const echoCount = computed(() => (inventoryStore.echoes ?? []).length);
  const builtCount = computed(() => Object.values(characterStore.characters ?? {}).filter((c) => isSetUp(c)).length);

  function snapshot(): { account: LabAccount; fingerprint: string } {
    const account = labAccountOf({
      characters: characterStore.characters,
      echoes: inventoryStore.echoes,
      equipped: inventoryStore.equipped,
      teams: teamStore.teams,
    });
    return { account, fingerprint: accountFingerprint(account) };
  }

  async function run<J extends EchoLabJob>(job: J, status: JobStatus, signal: AbortSignal, account: LabAccount): Promise<EchoLabResult<J> | null> {
    Object.assign(status, { running: true, cancelled: false, progress: null, error: null });
    try {
      const result = await getEchoLabClient().run(job, account, {
        signal,
        // Tune or Feed runs inside the echo phase with its own counts: keep the echo count on the bar
        onProgress: (p) => {
          if (p.phase === "potential" && status.progress?.phase === "echoes") return;
          status.progress = p;
        },
        onInfo: (info) => Object.assign(status, { ms: info.ms, cached: info.cached }),
      });
      return result;
    } catch (err) {
      status.cancelled = isCancel(err);
      status.error = status.cancelled ? null : errorText(err);
      return null;
    } finally {
      status.running = false;
      status.progress = null;
    }
  }

  /** Brings the page up to date: cached results for this account, or a fresh pass. */
  async function refresh(options: { force?: boolean } = {}): Promise<void> {
    const { account, fingerprint } = snapshot();
    if (!hydrated) {
      hydrated = true;
      const stored = readCache();
      if (stored && stored.fingerprint === fingerprint && !pass.value) {
        resultFingerprint.value = fingerprint;
        pass.value = stored.pass;
        benchmarks.value = stored.benchmarks;
        passStatus.cached = true;
      }
    }
    adopt(fingerprint);
    if (!account.echoes.length || !builtCount.value) return;
    if (pass.value && !options.force) return;
    if (passStatus.running) return;
    passAbort?.abort();
    const controller = new AbortController();
    passAbort = controller;
    const result = await run({ kind: "pass" }, passStatus, controller.signal, account);
    if (passAbort === controller) passAbort = null;
    if (result && resultFingerprint.value === fingerprint) {
      pass.value = result;
      writeCache();
    }
  }

  async function runBenchmarks(options: { force?: boolean } = {}): Promise<void> {
    const { account, fingerprint } = snapshot();
    adopt(fingerprint);
    if ((benchmarks.value && !options.force) || benchStatus.running || !builtCount.value) return;
    benchAbort?.abort();
    const controller = new AbortController();
    benchAbort = controller;
    const result = await run({ kind: "benchmark" }, benchStatus, controller.signal, account);
    if (benchAbort === controller) benchAbort = null;
    if (result && resultFingerprint.value === fingerprint) {
      benchmarks.value = result;
      writeCache();
    }
  }

  const rerollKey = (characterId: string, slot: number): string => `${resultFingerprint.value}|${characterId}|${slot}`;

  /** Re-roll advice for one equipped echo (cached per account state). */
  async function runReroll(characterId: string, slot: number, signal: AbortSignal): Promise<void> {
    const { account, fingerprint } = snapshot();
    adopt(fingerprint);
    const key = rerollKey(characterId, slot);
    if (rerolls.has(key)) return;
    try {
      const result = await getEchoLabClient().run({ kind: "reroll", characterId, slot }, account, { signal });
      if (resultFingerprint.value === fingerprint) rerolls.set(key, result);
    } catch (err) {
      if (!isCancel(err) && resultFingerprint.value === fingerprint) rerolls.set(key, { error: errorText(err) });
    }
  }

  const rerollOf = (characterId: string, slot: number): RerollAdviceResult | { error: string } | null => rerolls.get(rerollKey(characterId, slot)) ?? null;

  function cancel(): void {
    passAbort?.abort();
    benchAbort?.abort();
  }

  return {
    pass,
    passStatus,
    benchmarks,
    benchStatus,
    echoCount,
    builtCount,
    refresh,
    runBenchmarks,
    runReroll,
    rerollOf,
    cancel,
    snapshot,
  };
}
