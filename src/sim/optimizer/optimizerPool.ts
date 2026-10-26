// Wuthering Tools+ — exact speedups for the echo optimizer (perf track, 2026-10-12).
//
// Pure module (no Vue, no stores, no DOM): `Calculator.vue` calls `planOptimizerGeneration` once per run on the main
// thread, and `generator.worker.ts` walks `optimizerLoadoutStream` instead of looping over `generateLoadouts` itself.
// Both changes keep the ranked results identical to upstream's pipeline — the proofs are in the comments below and in
// src/sim/README.md ("Optimizer speedups"); the equivalence harness lives outside the repo (see the README).
import {
  generateLoadouts,
  getOptimizerLoadoutHash,
  getOptimizerLoadoutKey,
  normalizeLoadoutFormat,
  normalizeOptimizerLoadout,
  type OptimizerLoadoutFormat,
} from "../../calculator/optimizer";

/** The generator's cost budget (`generateLoadouts`: total cost ≤ 12, at most five echoes). */
const COST_CAP = 12;
const MAX_ECHOES = 5;

/** Same coercion as `optimizer.ts`'s private `echoCost`. */
function echoCost(echo: { type?: unknown } | null | undefined): number {
  const n = Number(echo?.type);
  return Number.isFinite(n) ? n : 0;
}

/** `Set.prototype.has` semantics (SameValueZero), which `generateLoadouts` uses for its species / id checks. */
function sameValueZero(a: unknown, b: unknown): boolean {
  return a === b || (a !== a && b !== b);
}

/** Upstream's per-echo optimizer signature: the loadout key of a one-echo loadout is exactly that echo's signature. */
function echoSignature(echo: unknown): string {
  return getOptimizerLoadoutKey([echo]);
}

const signatureCache = new WeakMap<object, string>();

/** `echoSignature`, memoised per echo object (echo objects are never mutated inside the optimizer workers). */
function cachedSignature(echo: unknown): string {
  if (!echo || typeof echo !== "object") return echoSignature(echo);
  let signature = signatureCache.get(echo);
  if (signature === undefined) {
    signature = echoSignature(echo);
    signatureCache.set(echo, signature);
  }
  return signature;
}

/**
 * Upstream's `normalizeOptimizerLoadout` (slot 0 kept, slots 1-4 sorted by signature with `localeCompare`) with each
 * echo's signature built once instead of twice per comparison — same comparator results, so the same order. The
 * processor calls it for every loadout; within one batch every echo is one structured-cloned object shared by all the
 * loadouts that use it, so the cache hits from the second loadout on.
 */
export function normalizeOptimizerLoadoutCached(loadout: any[]): any[] {
  if (!Array.isArray(loadout) || loadout.length <= 1) {
    return loadout;
  }
  const [mainEcho, ...otherEchoes] = loadout;
  return [
    mainEcho,
    ...otherEchoes
      .slice()
      .sort((a, b) => cachedSignature(a).localeCompare(cachedSignature(b))),
  ];
}

export interface OptimizerEchoPool {
  /** The pool the generator should walk: one echo per signature when `unique`, else the input unchanged. */
  echoes: any[];
  /**
   * True when every generated loadout is guaranteed to have a distinct signature key, so the generator can skip
   * upstream's per-loadout normalise + hash dedup (and the main thread its cross-shard dedup).
   */
  unique: boolean;
  /** Stat-identical copies dropped (0 when `unique` is false). */
  dropped: number;
}

/**
 * Dedupes the optimizer's echo pool once, by upstream's optimizer signature, keeping the first copy of each.
 *
 * Why this is exact: two echoes with the same signature are the same species (the species is the signature's first
 * field), and `generateLoadouts` never puts one species in a loadout twice, so a loadout can hold at most one copy of
 * any signature. Replacing every echo of a loadout by the first copy of its signature therefore gives another valid
 * loadout with the same key, generated earlier (its sorted index tuple is element-wise smaller). Upstream's hash
 * dedup keeps exactly that first loadout of each key, so walking the deduped pool yields the same loadouts, the same
 * echo objects (all owned echoes) and the same order — without hashing a single loadout.
 *
 * `unique` is false (and the input is returned untouched, so upstream's dedup still runs) whenever that argument
 * does not hold: no main echo (slot 0 is then the lowest-index echo, which the replacement can change), a species
 * that is not a plain string or contains the signature's ":" separator, a signature containing the loadout key's "|"
 * separator (keys would stop being injective), or two kept echoes sharing an `echoId` (`generateLoadouts` also refuses
 * to combine those).
 */
export function prepareOptimizerEchoPool(
  echoes: unknown,
  mainEchoKeys: unknown,
): OptimizerEchoPool {
  const input = Array.isArray(echoes) ? echoes : [];
  const fallback: OptimizerEchoPool = { echoes: input, unique: false, dropped: 0 };
  if (!Array.isArray(mainEchoKeys) || mainEchoKeys.length === 0) {
    return fallback;
  }
  const seen = new Set<string>();
  const ids = new Set<unknown>();
  const kept: any[] = [];
  for (const echo of input) {
    if (!echo || typeof echo !== "object") return fallback;
    const species = (echo as { echo?: unknown }).echo;
    if (typeof species !== "string" || species.includes(":")) return fallback;
    const signature = echoSignature(echo);
    if (signature.includes("|")) return fallback;
    if (seen.has(signature)) continue;
    seen.add(signature);
    kept.push(echo);
    ids.add((echo as { echoId?: unknown }).echoId);
  }
  if (ids.size !== kept.length) return fallback;
  return { echoes: kept, unique: true, dropped: input.length - kept.length };
}

/**
 * True when at least `need` single echoes from `pool` could still be added to `loadout` — the same rules
 * `generateLoadouts` applies under the "Any" format: total cost ≤ 12, at most five echoes, no species and no echoId
 * twice. Each such loadout + echo is itself generated (as some index-increasing combination).
 */
export function hasLoadoutExtensions(
  loadout: any[],
  pool: any[],
  poolCosts: number[],
  need: number,
): boolean {
  if (need <= 0) return true;
  if (loadout.length >= MAX_ECHOES) return false;
  let cost = 0;
  for (let j = 0; j < loadout.length; j++) cost += echoCost(loadout[j]);
  // generateLoadouts stops exploring once the cost reaches the cap (even a 0-cost echo is not added then)
  if (cost >= COST_CAP) return false;
  let found = 0;
  for (let i = 0; i < pool.length; i++) {
    if (!(cost + poolCosts[i] <= COST_CAP)) continue;
    const candidate = pool[i];
    let clash = false;
    for (let j = 0; j < loadout.length; j++) {
      const member = loadout[j];
      if (
        sameValueZero(member?.echo, candidate?.echo) ||
        sameValueZero(member?.echoId, candidate?.echoId)
      ) {
        clash = true;
        break;
      }
    }
    if (clash) continue;
    found += 1;
    if (found >= need) return true;
  }
  return false;
}

export interface OptimizerStreamOptions {
  /** The pool came from `prepareOptimizerEchoPool` with `unique: true`. */
  uniquePool?: boolean;
  /**
   * Under "Any" with a deduped pool: drop a partial loadout (fewer than five echoes) that still has at least this many
   * single-echo extensions — the run's topN. 0 turns it off. Only `planOptimizerGeneration` should set it.
   */
  skipDominatedPartials?: number;
}

/**
 * The loadouts one generator shard sends to the processors, as fresh arrays.
 *
 * - Default (`uniquePool` false): upstream's loop verbatim — normalise, hash, drop repeats, send the normalised copy.
 * - `uniquePool`: no normalising and no hashing (see `prepareOptimizerEchoPool`); the processor normalises each
 *   loadout before scoring, so its stats, score and the reported slot order are unchanged.
 * - `skipDominatedPartials` = N > 0: partial loadouts with ≥ N extensions are never scored. Adding an echo never lowers
 *   a final stat or a score (monotonicity — see README), so each skipped loadout P is matched or beaten by N distinct
 *   scored loadouts that contain it, and the top-N score list is unchanged; P could only have appeared there tied with
 *   one of them, a tie upstream breaks by worker timing anyway.
 */
export function* optimizerLoadoutStream(
  echoes: any[],
  mainEchoKeys: string[],
  loadoutFormat: OptimizerLoadoutFormat | string | undefined,
  shardIndex = 0,
  shardCount = 1,
  options: OptimizerStreamOptions = {},
): Generator<any[], void, undefined> {
  const format = normalizeLoadoutFormat(loadoutFormat);
  const unique = options.uniquePool === true;
  const need =
    unique && format === "Any" && Array.isArray(mainEchoKeys) && mainEchoKeys.length > 0
      ? Math.max(0, Math.floor(Number(options.skipDominatedPartials) || 0))
      : 0;
  const poolCosts = need > 0 ? echoes.map(echoCost) : [];
  // Track seen combinations as compact 53-bit signature hashes (same uniqueness as full keys, far less RAM)
  const seenCombinations = unique ? null : new Set<number>();

  for (const loadout of generateLoadouts(
    echoes,
    mainEchoKeys,
    0,
    [],
    0,
    new Set(),
    new Set(),
    format,
    undefined,
    shardIndex,
    shardCount,
  ) as Iterable<any[]>) {
    if (seenCombinations) {
      const normalizedLoadout = normalizeOptimizerLoadout(loadout);
      const hash = getOptimizerLoadoutHash(normalizedLoadout);
      if (seenCombinations.has(hash)) continue;
      seenCombinations.add(hash);
      // generateLoadouts mutates its combo array (push/pop); always hand out a copy
      yield normalizedLoadout.slice();
      continue;
    }
    if (need > 0 && loadout.length < MAX_ECHOES && hasLoadoutExtensions(loadout, echoes, poolCosts, need)) {
      continue;
    }
    yield loadout.slice();
  }
}

/** A user-typed or computed number that the engine sums as `Number(value) || 0` is negative. */
function hasNegativeNumber(record: unknown, depth = 0): boolean {
  if (record == null) return false;
  if (typeof record === "number" || typeof record === "string") {
    const n = Number(record);
    return Number.isFinite(n) && n < 0;
  }
  if (typeof record !== "object" || depth > 4) return false;
  for (const value of Object.values(record as Record<string, unknown>)) {
    if (hasNegativeNumber(value, depth + 1)) return true;
  }
  return false;
}

const ECHO_VALUE_FIELDS = [
  "echoSubStatsValue1",
  "echoSubStatsValue2",
  "echoSubStatsValue3",
  "echoSubStatsValue4",
  "echoSubStatsValue5",
] as const;

export interface OptimizerGenerationInput {
  /** The serialized, filtered echoes the generator would receive. */
  echoes: any[];
  mainEchoKeys: string[];
  loadoutFormat: unknown;
  topN: number;
  /** `Stat:…`, `Attack:…` or `Rotation:…`. */
  target: string;
  /** Per set-bonus label stats, as the optimizer panel emits them. */
  echoSetPassiveBuffs?: Record<string, unknown>;
  /** The optimizer context (only `customBuffs` and `enemyResist` are read). */
  context?: { customBuffs?: unknown; enemyResist?: unknown } | null;
  /** The pre-built rotation data for a `Rotation:` target (per-action buffs are read). */
  rotationData?: { plainAttacks?: any[]; overrideActions?: any[] } | null;
}

export interface OptimizerGenerationPlan {
  echoes: any[];
  uniquePool: boolean;
  skipDominatedPartials: number;
  droppedDuplicates: number;
}

/**
 * The preconditions under which the stat pipeline and every score are monotone non-decreasing in added echoes (see
 * README): every echo-side number is ≥ 0 (substat values, set-passive stats), the user-typed numbers that could flip a
 * factor's sign are ≥ 0 (custom buffs, per-action rotation buffs and hit counts), and the enemy's resistance leaves the resistance
 * multiplier ≥ 0. Game data (talents, buff and set-bonus modifiers) is pinned non-negative by
 * `optimizerPool.test.ts`.
 */
export function canSkipDominatedPartials(input: OptimizerGenerationInput, uniquePool: boolean): boolean {
  if (!uniquePool) return false;
  if (normalizeLoadoutFormat(input.loadoutFormat) !== "Any") return false;
  if (!Array.isArray(input.mainEchoKeys) || input.mainEchoKeys.length === 0) return false;
  if (!Number.isInteger(input.topN) || input.topN < 1) return false;
  const targetType = String(input.target ?? "").split(":")[0];
  if (targetType !== "Stat" && targetType !== "Attack" && targetType !== "Rotation") return false;
  for (const echo of input.echoes ?? []) {
    for (const field of ECHO_VALUE_FIELDS) {
      if (hasNegativeNumber(echo?.[field])) return false;
    }
  }
  if (hasNegativeNumber(input.echoSetPassiveBuffs)) return false;
  if (hasNegativeNumber(input.context?.customBuffs)) return false;
  const enemyResist = Number(input.context?.enemyResist ?? 0);
  if (!Number.isFinite(enemyResist) || enemyResist > 1) return false;
  const actions = [
    ...(input.rotationData?.plainAttacks ?? []),
    ...(input.rotationData?.overrideActions ?? []).map((action: any) => action?.attack),
  ];
  for (const attack of actions) {
    // a negative hit count (the editor clamps it to ≥ 1, an imported rotation might not) would subtract that action
    if (hasNegativeNumber(attack?.buffs) || hasNegativeNumber(attack?.count)) return false;
  }
  return true;
}

/** One call per optimizer run, on the main thread: the pool to send and the two fast-path switches. */
export function planOptimizerGeneration(input: OptimizerGenerationInput): OptimizerGenerationPlan {
  const pool = prepareOptimizerEchoPool(input.echoes, input.mainEchoKeys);
  const skip = canSkipDominatedPartials({ ...input, echoes: pool.echoes }, pool.unique);
  return {
    echoes: pool.echoes,
    uniquePool: pool.unique,
    skipDominatedPartials: skip ? input.topN : 0,
    droppedDuplicates: pool.dropped,
  };
}
