// Wuthering Tools+ — pity, 50/50 and luck analytics over an imported Convene history, and the hand-off of that state
// to upstream's odds simulator (src/convene/simulateConvene.ts, which ConveneView.vue drives).
//
// Rules (Kuro's "Convene Details" notice, article 758, and the banner notices):
//   - 5★ pity = pulls since the last 5★ on the same pool type; a 5★ is guaranteed on pull 80 (50 on the Beginner
//     Convene). The pity counter is therefore 0–79.
//   - 4★ pity = pulls since the last 4★ OR 5★ ("at least one 4-star or higher every 10 attempts"); 0–9.
//   - Featured resonator pools (1 — Anniversary banners share it — and the New Voyage / Collab / Reverb resonator
//     pools): a 5★ is the featured one or, on a lost 50/50, a standard 5★ (Lingyang, Encore, Calcharo, Jianxin,
//     Verina); after a loss the next 5★ is guaranteed featured. Weapon banners give the featured weapon every time.
//   - The odds simulator uses an empirical curve that already reaches 100 % on pull 79, so its `startingPity` stops
//     at 78 (MAX_PULLS_SINCE_LAST_FIVE); a counter of 79 is clamped and flagged.
// Pure: records in, numbers out.
import {
  ASTRITE_PER_WISH,
  MAX_PULLS_SINCE_LAST_FIVE,
  fiveStarChance,
  type ConveneMode,
} from "../../convene/simulateConvene";
import type { ConveneRecord, PlayerHistory } from "./gachaImport";
import { CONVENE_POOLS, isStandardFiveStarResonator, poolOf, type ConvenePool } from "./pools";

/** won / lost / guaranteed: a 50/50 pool; unknown: the first 5★ of a cut-off history; featured / standard: no 50/50 */
export type FiveStarOutcome = "won" | "lost" | "guaranteed" | "unknown" | "featured" | "standard";

export interface FiveStarPull {
  /** index into the pool's oldest-first records */
  index: number;
  time: string;
  name: string;
  resourceId: number;
  /** the pull count this 5★ landed on (1 = first pull after the previous 5★) */
  pity: number;
  /** the history may start mid-count (the API keeps six months), so the real pity was at least this */
  lowerBound: boolean;
  outcome: FiveStarOutcome;
}

export interface FiftyFiftyStats {
  won: number;
  lost: number;
  /** featured 5★s that came on a guarantee (not a coin flip) */
  guaranteed: number;
  /** a featured 5★ whose coin-flip state is unknown (first 5★ of a cut-off history) */
  unknown: number;
  /** won ÷ (won + lost); null before any coin flip */
  winRate: number | null;
  /** luckier than this share of players with the same number of coin flips (mid-rank), null before any */
  luckPercentile: number | null;
}

export interface LuckStats {
  /** complete 5★ intervals used (lower bounds excluded) */
  samples: number;
  /** mean pulls per 5★ on those intervals */
  average: number | null;
  /** the simulator model's mean pulls per 5★ (≈ 54.1) */
  modelAverage: number;
  /** luckier than this share of players with the same number of 5★s (mid-rank, 0–1), null with no samples */
  percentile: number | null;
}

export interface PoolPity {
  poolType: number;
  pool: ConvenePool;
  pulls: number;
  /** Astrite value of those pulls (one Tide = 160 Astrite) */
  astrite: number;
  fiveStars: FiveStarPull[];
  fourStars: number;
  pity5: number;
  pity4: number;
  /** a cut-off history with no 5★ in it yet: the real 5★ pity is at least `pity5` (pulls before the window count too) */
  pity5LowerBound: boolean;
  /** the same for the 4★ counter (no 4★ or 5★ in a cut-off history) */
  pity4LowerBound: boolean;
  /** pulls left until the guaranteed 5★ (counting the guaranteed pull) */
  toHardPity5: number;
  toHardPity4: number;
  /** null on a pool without a 50/50 */
  guaranteed: boolean | null;
  /** false when the history starts mid-count and no 5★ settled the guarantee yet */
  guaranteeKnown: boolean;
  fiftyFifty: FiftyFiftyStats | null;
  /** mean pity over complete 5★ intervals (lower bounds left out); null with none */
  avgPity5: number | null;
  /** mean pulls between 4★-or-better drops, complete intervals only */
  avgPity4: number | null;
  /** the history likely starts after the account's first pull on this pool */
  truncated: boolean;
  /** null on pools the model doesn't describe (Beginner: 50-pull pity) */
  luck: LuckStats | null;
}

const DAY_MS = 86_400_000;
/** a history whose oldest pull is older than this before the first API import probably began mid-count */
export const TRUNCATION_MARGIN_DAYS = 150;
const RECORD_OFFSET_MS = 8 * 3600_000;

/** a record's CST wall clock → epoch ms */
export function recordTimeMs(time: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(time);
  if (!m) return Number.NaN;
  return Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!) - RECORD_OFFSET_MS;
}

/**
 * Kuro keeps six months of records. If the oldest stored pull is more than ~5 months older than the first import
 * from the API, the stored history most likely starts after the account's first pull on that pool, so the first
 * 5★'s pity (and the 50/50 state before it) are unknown. A history known only from files is treated as cut off.
 */
export function isLikelyTruncated(records: readonly ConveneRecord[], firstApiImportAt: number | null): boolean {
  if (!records.length) return false;
  if (firstApiImportAt == null) return true;
  const oldest = recordTimeMs(records[0]!.time);
  return Number.isFinite(oldest) && oldest < firstApiImportAt - TRUNCATION_MARGIN_DAYS * DAY_MS;
}

/**
 * The time of the player's first API import that brought pulls (null when the history came only from files). An
 * import that added nothing (a bogus or expired token answers `code: 0, data: []`) says nothing about the window.
 */
export function firstApiImportAt(player: Pick<PlayerHistory, "imports">): number | null {
  let first: number | null = null;
  for (const e of player.imports) if (e.source === "api" && e.added > 0 && (first == null || e.at < first)) first = e.at;
  return first;
}

// ── the simulator's pity model ─────────────────────────────────────────────────────────────────────────────────

let model: { pmf: number[]; mean: number; variance: number } | null = null;

/** P(the next 5★ lands on pull n), n = 1…79, from upstream's empirical curve */
function pityModel() {
  if (model) return model;
  const pmf = [0];
  let survive = 1;
  for (let n = 1; survive > 0 && n <= 200; n++) {
    const p = fiveStarChance(n - 1);
    pmf.push(survive * p);
    survive *= 1 - p;
  }
  let mean = 0;
  let second = 0;
  pmf.forEach((p, n) => {
    mean += n * p;
    second += n * n * p;
  });
  model = { pmf, mean, variance: second - mean * mean };
  return model;
}

/** the model's mean pulls per 5★ (upstream quotes ~54.1) */
export function modelAveragePity(): number {
  return pityModel().mean;
}

/** how lucky one 5★ at pull `n` was: luckier than this share of 5★ drops (mid-rank) */
export function pityPercentile(n: number): number {
  const { pmf } = pityModel();
  let later = 0;
  for (let k = n + 1; k < pmf.length; k++) later += pmf[k]!;
  return later + 0.5 * (pmf[n] ?? 0);
}

function normalCdf(z: number): number {
  // Abramowitz–Stegun 7.1.26 on erf
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

/**
 * Luckier than what share of players who got the same number of 5★s? Exact convolution of the model's per-5★
 * distribution up to 60 intervals, a normal approximation beyond. Mid-rank: ties count half.
 */
export function luckPercentile(pities: readonly number[]): number | null {
  const k = pities.length;
  if (!k) return null;
  const total = pities.reduce((a, b) => a + b, 0);
  const { pmf, mean, variance } = pityModel();
  if (k > 60) {
    const z = (total - k * mean) / Math.sqrt(k * variance);
    return 1 - normalCdf(z);
  }
  let dist = [1];
  for (let i = 0; i < k; i++) {
    const next = new Array<number>(dist.length + pmf.length - 1).fill(0);
    for (let s = 0; s < dist.length; s++) {
      const ps = dist[s]!;
      if (!ps) continue;
      for (let n = 1; n < pmf.length; n++) next[s + n]! += ps * pmf[n]!;
    }
    dist = next;
  }
  let above = 0;
  for (let s = total + 1; s < dist.length; s++) above += dist[s]!;
  return Math.min(1, above + 0.5 * (dist[total] ?? 0));
}

/** luckier than this share of players with the same number of coin flips (mid-rank) */
export function coinFlipPercentile(won: number, flips: number): number | null {
  if (flips <= 0) return null;
  let below = 0;
  let c = 1; // C(flips, 0)
  const half = Math.pow(0.5, flips);
  let at = 0;
  for (let i = 0; i <= flips; i++) {
    if (i < won) below += c * half;
    if (i === won) at = c * half;
    c = (c * (flips - i)) / (i + 1);
  }
  return below + 0.5 * at;
}

// ── per pool ───────────────────────────────────────────────────────────────────────────────────────────────────

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

const FALLBACK_POOL = (type: number): ConvenePool => ({
  type,
  name: `Convene ${type}`,
  short: `Convene ${type}`,
  kind: "resonator",
  family: "standard",
  hardPity5: 80,
  hardPity4: 10,
  fiftyFifty: false,
  alwaysFeatured: false,
});

/** pity, guarantee and luck for one pool's oldest-first records */
export function poolPity(poolType: number, records: readonly ConveneRecord[], opts: { truncated?: boolean } = {}): PoolPity {
  const pool = poolOf(poolType) ?? FALLBACK_POOL(poolType);
  const truncated = opts.truncated ?? false;
  const fiveStars: FiveStarPull[] = [];
  const fourGaps: number[] = [];
  let since5 = 0;
  let since4 = 0;
  let fourStars = 0;
  let seenFour = false;
  // the 50/50 state before the next 5★: false = coin flip, true = guaranteed, null = unknown (cut-off history)
  let prevLost: boolean | null = truncated ? null : false;
  for (let index = 0; index < records.length; index++) {
    const r = records[index]!;
    since5++;
    since4++;
    if (r.qualityLevel >= 5) {
      const lowerBound = truncated && fiveStars.length === 0;
      let outcome: FiveStarOutcome;
      if (pool.fiftyFifty) {
        const standard = isStandardFiveStarResonator(r.resourceId, r.name);
        if (standard) outcome = "lost";
        else outcome = prevLost === true ? "guaranteed" : prevLost === null ? "unknown" : "won";
        prevLost = standard;
      } else {
        outcome = pool.alwaysFeatured ? "featured" : "standard";
      }
      fiveStars.push({ index, time: r.time, name: r.name, resourceId: r.resourceId, pity: since5, lowerBound, outcome });
      if (seenFour || !truncated) fourGaps.push(since4);
      seenFour = true;
      since5 = 0;
      since4 = 0;
    } else if (r.qualityLevel === 4) {
      fourStars++;
      if (seenFour || !truncated) fourGaps.push(since4);
      seenFour = true;
      since4 = 0;
    }
  }

  const complete = fiveStars.filter((f) => !f.lowerBound).map((f) => f.pity);
  let fiftyFifty: FiftyFiftyStats | null = null;
  if (pool.fiftyFifty) {
    const count = (o: FiveStarOutcome) => fiveStars.filter((f) => f.outcome === o).length;
    const won = count("won");
    const lost = count("lost");
    fiftyFifty = {
      won,
      lost,
      guaranteed: count("guaranteed"),
      unknown: count("unknown"),
      winRate: won + lost ? won / (won + lost) : null,
      luckPercentile: coinFlipPercentile(won, won + lost),
    };
  }
  const modelled = pool.hardPity5 === 80;
  return {
    poolType,
    pool,
    pulls: records.length,
    astrite: records.length * ASTRITE_PER_WISH,
    fiveStars,
    fourStars,
    pity5: since5,
    pity4: since4,
    pity5LowerBound: truncated && fiveStars.length === 0,
    pity4LowerBound: truncated && !seenFour,
    toHardPity5: Math.max(0, pool.hardPity5 - since5),
    toHardPity4: Math.max(0, pool.hardPity4 - since4),
    guaranteed: pool.fiftyFifty ? prevLost === true : null,
    guaranteeKnown: pool.fiftyFifty ? prevLost !== null : true,
    fiftyFifty,
    avgPity5: mean(complete),
    avgPity4: mean(fourGaps),
    truncated,
    luck: modelled
      ? { samples: complete.length, average: mean(complete), modelAverage: modelAveragePity(), percentile: luckPercentile(complete) }
      : null,
  };
}

export interface HistoryPity {
  pools: PoolPity[];
  pulls: number;
  astrite: number;
  fiveStars: number;
  /** every 5★ across pools, oldest first, with its pool */
  timeline: (FiveStarPull & { poolType: number })[];
}

/** every pool that has records, in pool order */
export function historyPity(player: Pick<PlayerHistory, "pools" | "imports">): HistoryPity {
  const firstImport = firstApiImportAt(player);
  const pools: PoolPity[] = [];
  for (const def of CONVENE_POOLS) {
    const records = player.pools[String(def.type)];
    if (!records?.length) continue;
    pools.push(poolPity(def.type, records, { truncated: isLikelyTruncated(records, firstImport) }));
  }
  const timeline = pools
    .flatMap((p) => p.fiveStars.map((f) => ({ ...f, poolType: p.poolType })))
    .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : a.index - b.index));
  return {
    pools,
    pulls: pools.reduce((n, p) => n + p.pulls, 0),
    astrite: pools.reduce((n, p) => n + p.astrite, 0),
    fiveStars: timeline.length,
    timeline,
  };
}

// ── hand-off to the odds simulator ─────────────────────────────────────────────────────────────────────────────

export interface SimulatorPrefill {
  mode: ConveneMode;
  /** → SimulateParams.startingPity (0–78) */
  startingPity: number;
  /** → SimulateParams.guaranteedNextFeatured (always false for weapons) */
  guaranteedNextFeatured: boolean;
  /** the real counter was 79 — past the empirical curve's 100 % pull — and was capped to 78 */
  clamped: boolean;
  /** the pool the numbers came from */
  poolType: number;
  /** false when the guarantee couldn't be read (cut-off history with no 5★ yet) */
  certain: boolean;
  /** the history starts mid-count with no 5★ yet: the real pity is at least `startingPity` */
  pityLowerBound: boolean;
}

/** which pool feeds each simulator mode: the Featured pools (Anniversary banners included) */
export const SIM_POOL_FOR_MODE: Record<ConveneMode, number> = { character: 1, weapon: 2 };

/**
 * The simulator inputs ConveneView.vue's Advanced panel takes (`startingPity`, `guaranteedNextFeatured`) from the
 * imported state; null when that pool has no history.
 */
export function simulatorPrefill(pools: readonly PoolPity[], mode: ConveneMode, poolType: number = SIM_POOL_FOR_MODE[mode]): SimulatorPrefill | null {
  const p = pools.find((x) => x.poolType === poolType);
  if (!p) return null;
  const startingPity = Math.min(MAX_PULLS_SINCE_LAST_FIVE, Math.max(0, p.pity5));
  return {
    mode,
    startingPity,
    guaranteedNextFeatured: mode === "character" && p.guaranteed === true,
    clamped: startingPity !== p.pity5,
    poolType,
    certain: p.guaranteeKnown,
    pityLowerBound: p.pity5LowerBound,
  };
}
