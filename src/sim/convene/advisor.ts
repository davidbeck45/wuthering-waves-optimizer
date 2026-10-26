// Wuthering Tools+ — the pull advisor's arithmetic: what the next copy of a featured item costs from the player's
// current pity, and how much damage it buys per 1,000 Astrite. Pure (no Vue, no engine): the damage side comes from
// advisorEngine.ts (the app's own engine via src/sim/myRankings/rankRoster.ts), the cost side from upstream's odds
// simulator (src/convene/simulateConvene.ts) — the same empirical 5★ curve, the same 50/50 with a carried guarantee,
// the same 160 Astrite per pull. Where the simulator samples, this module convolves the curve exactly, so the numbers
// are reproducible; advisor.test.ts checks them against `runMonteCarlo`.
import { ASTRITE_PER_WISH, MAX_PULLS_SINCE_LAST_FIVE, fiveStarChance } from "../../convene/simulateConvene";
import { isLive, type ConveneBanner } from "./banners";
import { poolOf } from "./pools";

// ── cost of featured copies ────────────────────────────────────────────────────────────────────────────────────

export interface CostQuery {
  /** every 5★ on the pool is the featured item (weapon banners); false = a 50/50 with a carried guarantee */
  alwaysFeatured: boolean;
  /** pulls since the last 5★ on that pool (clamped to the simulator's 0–78) */
  pity: number;
  /** the next 5★ is guaranteed featured (lost the last 50/50); ignored when alwaysFeatured */
  guaranteed: boolean;
  /** featured copies wanted (≥ 1) */
  copies: number;
}

export interface CostEstimate {
  copies: number;
  /** expected pulls to the last of those copies */
  meanPulls: number;
  meanAstrite: number;
  /** half of all players get there within this many pulls */
  p50Pulls: number;
  /** nine in ten get there within this many pulls */
  p90Pulls: number;
  /** the most it can take under the model (every 50/50 lost, every 5★ on its last pull) */
  maxPulls: number;
  /** P(done on exactly n pulls), index = n */
  pmf: number[];
}

const pmfCache = new Map<number, number[]>();

/** P(the next 5★ lands on pull n | pity), n = 1…(79 − pity), from upstream's curve */
export function pullsToFiveStar(pity: number): number[] {
  const p = Math.min(MAX_PULLS_SINCE_LAST_FIVE, Math.max(0, Math.floor(pity) || 0));
  const hit = pmfCache.get(p);
  if (hit) return hit;
  const pmf = [0];
  let survive = 1;
  for (let n = 1; survive > 1e-15 && n <= 200; n++) {
    const q = fiveStarChance(p + n - 1);
    pmf.push(survive * q);
    survive *= 1 - q;
  }
  pmfCache.set(p, pmf);
  return pmf;
}

export function convolve(a: readonly number[], b: readonly number[]): number[] {
  const out = new Array<number>(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    if (!ai) continue;
    for (let j = 0; j < b.length; j++) out[i + j]! += ai * b[j]!;
  }
  return out;
}

/** w·a + (1 − w)·b */
function mix(a: readonly number[], b: readonly number[], w: number): number[] {
  const out = new Array<number>(Math.max(a.length, b.length)).fill(0);
  a.forEach((x, i) => (out[i]! += w * x));
  b.forEach((x, i) => (out[i]! += (1 - w) * x));
  return out;
}

/** pulls to one featured 5★ from a fresh pity with no guarantee: a 5★, and on a lost 50/50 one more */
function featuredFromFresh(alwaysFeatured: boolean): number[] {
  const fresh = pullsToFiveStar(0);
  return alwaysFeatured ? fresh : mix(fresh, convolve(fresh, fresh), 0.5);
}

function quantile(pmf: readonly number[], q: number): number {
  let cdf = 0;
  for (let n = 0; n < pmf.length; n++) {
    cdf += pmf[n]!;
    if (cdf >= q - 1e-12) return n;
  }
  return pmf.length - 1;
}

/**
 * The pull count to `copies` featured 5★s, exactly, under the simulator's model: the first copy from the current pity
 * (and guarantee), every further copy from a fresh pity with a 50/50 (resonators) or straight (weapons).
 */
export function featuredCost(query: CostQuery): CostEstimate {
  const copies = Math.max(1, Math.floor(query.copies) || 1);
  const first = pullsToFiveStar(query.pity);
  let pmf = query.alwaysFeatured || query.guaranteed ? first : mix(first, convolve(first, pullsToFiveStar(0)), 0.5);
  const next = featuredFromFresh(query.alwaysFeatured);
  for (let k = 1; k < copies; k++) pmf = convolve(pmf, next);
  let mean = 0;
  pmf.forEach((p, n) => (mean += n * p));
  let max = pmf.length - 1;
  while (max > 0 && pmf[max]! < 1e-12) max--;
  return {
    copies,
    meanPulls: mean,
    meanAstrite: mean * ASTRITE_PER_WISH,
    p50Pulls: quantile(pmf, 0.5),
    p90Pulls: quantile(pmf, 0.9),
    maxPulls: max,
    pmf,
  };
}

/** P(all the copies within `pulls` pulls) */
export function chanceWithin(estimate: Pick<CostEstimate, "pmf">, pulls: number): number {
  let cdf = 0;
  const n = Math.floor(pulls);
  for (let i = 0; i <= n && i < estimate.pmf.length; i++) cdf += estimate.pmf[i]!;
  return Math.min(1, cdf);
}

export function pullsForAstrite(astrite: number): number {
  return Math.max(0, Math.floor((Number(astrite) || 0) / ASTRITE_PER_WISH));
}

// ── advice rows ────────────────────────────────────────────────────────────────────────────────────────────────

/** one featured item on a banner that is running now */
export interface AdviceTarget {
  /** `<bannerId>|<item name>` */
  id: string;
  bannerId: string;
  bannerLabel: string | null;
  bannerTitle: string | null;
  endMs: number;
  /** the record API pool the banner pulls from (shares pity with the other banners of that pool) */
  poolType: number;
  kind: "resonator" | "weapon";
  /** every 5★ on that pool is the featured one (weapon banners) */
  alwaysFeatured: boolean;
  item: { name: string; key: string | null };
}

/** every featured 5★ on the banners running at `now` (a selectable Reverb banner lists each of its choices) */
export function advisorTargets(banners: readonly ConveneBanner[], now: number): AdviceTarget[] {
  const out: AdviceTarget[] = [];
  const seen = new Set<string>();
  for (const b of banners) {
    if (!isLive(b, now)) continue;
    const poolType = b.poolTypes[0] ?? (b.type === "weapon" ? 2 : 1);
    const pool = poolOf(poolType);
    for (const item of b.fiveStars) {
      const id = `${b.id}|${item.name}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        bannerId: b.id,
        bannerLabel: b.label,
        bannerTitle: b.title,
        endMs: b.endMs,
        poolType,
        kind: b.type,
        alwaysFeatured: pool ? pool.alwaysFeatured : b.type === "weapon",
        item: { name: item.name, key: item.key },
      });
    }
  }
  return out;
}

export type AdviceStatus =
  /** scored */
  | "ok"
  /** the account doesn't have the resonator (or the weapon's signature owner) */
  | "not-owned"
  /** in the calculator but without a weapon — the engine has no build to score */
  | "not-set-up"
  /** S6 / R5 already: another copy adds no damage */
  | "maxed"
  /** a weapon no resonator in the app names as its signature */
  | "no-owner"
  /** the app doesn't carry this item */
  | "not-in-app"
  | "error";

export interface DamageStep {
  /** "S3", "R2", "Kumokiri R1" */
  label: string;
  /** featured copies of this item needed to get there from now */
  copies: number;
  avgDamage: number;
  /** relative to the build as it is, e.g. 0.12 = +12 % */
  gain: number;
  /** a weapon swap's floor: the new weapon's stats alone, every passive off (the headline has them at full stacks) */
  low?: { avgDamage: number; gain: number };
}

export interface AdviceDamage {
  targetId: string;
  status: AdviceStatus;
  /** the resonator whose damage moves (the item itself, or the weapon's signature owner) */
  characterKey: string | null;
  characterName: string | null;
  /** where the account is now: "S2", "R1", "Lux & Umbra R5" */
  current: string | null;
  /** the build as it is, on `rotation` */
  baseDamage: number | null;
  rotation: string | null;
  /** next copy first, then each further one up to S6 / R5 */
  steps: DamageStep[];
  note: string | null;
}

export interface AdviceStep extends DamageStep {
  cost: CostEstimate;
  /** percentage points of damage per 1,000 Astrite (cumulative from now) */
  perThousand: number;
  /** this step alone: extra gain per extra 1,000 Astrite over the step before */
  marginalPerThousand: number;
  /** P(reaching this step with the budget), null without a budget */
  chance: number | null;
}

export interface AdviceRow extends Omit<AdviceDamage, "steps"> {
  target: AdviceTarget;
  steps: AdviceStep[];
  /** 1-based rank among the scored rows, null for the rest */
  rank: number | null;
}

/** the pity state the cost side reads, per pool type */
export interface PoolPityInput {
  pity: number;
  guaranteed: boolean;
}

export interface CostOptions {
  /** pity per pool type; a missing pool counts as pity 0, no guarantee */
  pity: Record<number, PoolPityInput | undefined>;
  /** Astrite (plus Lunite) the player can spend; null = no budget column */
  budgetAstrite?: number | null;
}

/** attach costs to scored damage steps and rank the rows by % damage per 1,000 Astrite (next copy) */
export function priceAdvice(targets: readonly AdviceTarget[], damage: readonly AdviceDamage[], opts: CostOptions): AdviceRow[] {
  const byId = new Map(damage.map((d) => [d.targetId, d]));
  const budgetPulls = opts.budgetAstrite != null && opts.budgetAstrite > 0 ? pullsForAstrite(opts.budgetAstrite) : null;
  const rows: AdviceRow[] = targets.map((target) => {
    const d = byId.get(target.id) ?? {
      targetId: target.id,
      status: "error" as const,
      characterKey: null,
      characterName: null,
      current: null,
      baseDamage: null,
      rotation: null,
      steps: [],
      note: "not scored",
    };
    const state = opts.pity[target.poolType] ?? { pity: 0, guaranteed: false };
    let prevGain = 0;
    let prevAstrite = 0;
    const steps: AdviceStep[] = d.steps.map((s) => {
      const cost = featuredCost({ alwaysFeatured: target.alwaysFeatured, pity: state.pity, guaranteed: state.guaranteed, copies: s.copies });
      const perThousand = cost.meanAstrite > 0 ? (s.gain * 100) / (cost.meanAstrite / 1000) : 0;
      const extra = cost.meanAstrite - prevAstrite;
      const marginalPerThousand = extra > 0 ? ((s.gain - prevGain) * 100) / (extra / 1000) : 0;
      prevGain = s.gain;
      prevAstrite = cost.meanAstrite;
      return { ...s, cost, perThousand, marginalPerThousand, chance: budgetPulls == null ? null : chanceWithin(cost, budgetPulls) };
    });
    const { steps: _ignored, ...rest } = d;
    void _ignored;
    return { ...rest, target, steps, rank: null };
  });
  const scored = rows.filter((r) => r.status === "ok" && r.steps.length).sort((a, b) => b.steps[0]!.perThousand - a.steps[0]!.perThousand);
  scored.forEach((r, i) => (r.rank = i + 1));
  const order = (r: AdviceRow): number => (r.rank != null ? r.rank : 1000 + STATUS_ORDER.indexOf(r.status));
  return rows.sort((a, b) => order(a) - order(b) || a.target.item.name.localeCompare(b.target.item.name));
}

const STATUS_ORDER: AdviceStatus[] = ["ok", "maxed", "not-set-up", "not-owned", "no-owner", "not-in-app", "error"];

const pctText = (g: number): string => `${g >= 0 ? "+" : ""}${(g * 100).toFixed(1)}%`;
const kText = (astrite: number): string =>
  astrite >= 10_000 ? `${(astrite / 1000).toFixed(0)}k` : astrite >= 1000 ? `${(astrite / 1000).toFixed(1)}k` : `${Math.round(astrite)}`;

/** "Chisa S1", "Kumokiri R2 on Chisa" (a refinement step's label is just "R2"; a swap's already names the weapon) */
export function stepTitle(row: Pick<AdviceRow, "target" | "characterName">, step: Pick<DamageStep, "label">): string {
  if (row.target.kind !== "weapon") return `${row.characterName ?? row.target.item.name} ${step.label}`;
  const label = /^R\d$/.test(step.label) ? `${row.target.item.name} ${step.label}` : step.label;
  return `${label} on ${row.characterName ?? "its owner"}`;
}

/** one plain sentence over the ranked rows — engine and simulator numbers only, no opinion */
export function adviceSummary(rows: readonly AdviceRow[]): string {
  const best = rows.find((r) => r.rank === 1);
  if (!best) {
    if (rows.some((r) => r.status === "maxed")) return "Nothing on the current banners adds damage to your builds: what you own of them is already maxed.";
    if (rows.length) return "None of the featured items on the current banners can be scored on your account (not owned or not set up).";
    return "No banner is running right now.";
  }
  const s = best.steps[0]!;
  const who = stepTitle(best, s);
  const runnerUp = rows.find((r) => r.rank === 2);
  const tail = runnerUp ? ` Next: ${stepTitle(runnerUp, runnerUp.steps[0]!)} at ${runnerUp.steps[0]!.perThousand.toFixed(2)}% per 1k.` : "";
  return `Most damage per Astrite right now: ${who} — ${pctText(s.gain)} on ${best.rotation ?? "the best rotation"} for about ${kText(s.cost.meanAstrite)} Astrite expected (${s.perThousand.toFixed(2)}% per 1k).${tail}`;
}
