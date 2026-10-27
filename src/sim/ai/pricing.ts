// Wuthering Tools+ AI — what a request costs, from its `usage`. Pure. The drawer's cost meter and the
// per-conversation soft budget read `UsageTotals`; nothing here talks to the network.
//
// Prices are USD per million tokens (Claude API list prices, 2026-10). Cache writes are the 5-minute
// TTL (1.25 × input); cache reads ≈ 0.1 × input. Haiku 5.5 bills a request whose prompt (input + cache
// reads + cache writes) passes 100K tokens at its long-context rates, the whole request.
import type { AiModel } from "./models";

export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** a prompt above this many tokens bills the whole request at `long` */
  longThreshold?: number;
  long?: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

export const MODEL_PRICES: Record<AiModel, ModelPrice> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": {
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    cacheWrite: 0.125,
    longThreshold: 100_000,
    long: { input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite: 0.625 },
  },
};

/** Models a server-side refusal fallback can hand a turn to; their usage arrives as `fallback_message` iterations. */
const FALLBACK_PRICES: Record<string, ModelPrice> = {
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
};

export function priceFor(model: string | null | undefined): ModelPrice | null {
  if (!model) return null;
  return (MODEL_PRICES as Record<string, ModelPrice>)[model] ?? FALLBACK_PRICES[model] ?? null;
}

/** The `usage` fields the meter reads (the SDK's BetaUsage fits). */
export interface UsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  iterations?: ReadonlyArray<{
    type: string;
    model?: string | null;
    input_tokens?: number | null;
    output_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  }> | null;
}

export interface TokenCounts {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

const n = (v: number | null | undefined): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** USD for token counts at one model's price (null price → 0, the meter then under-reads rather than throws). */
export function costOfTokens(price: ModelPrice | null, t: TokenCounts): number {
  if (!price) return 0;
  const prompt = t.input + t.cacheRead + t.cacheWrite;
  const rate = price.long && price.longThreshold != null && prompt > price.longThreshold ? price.long : price;
  return (t.input * rate.input + t.output * rate.output + t.cacheRead * rate.cacheRead + t.cacheWrite * rate.cacheWrite) / 1_000_000;
}

function countsOf(u: UsageLike | NonNullable<UsageLike["iterations"]>[number]): TokenCounts {
  return { input: n(u.input_tokens), output: n(u.output_tokens), cacheRead: n(u.cache_read_input_tokens), cacheWrite: n(u.cache_creation_input_tokens) };
}

/** USD for one response. When a refusal fallback served part of it, each iteration bills at its own model's price. */
export function requestCost(model: string, usage: UsageLike | null | undefined): number {
  if (!usage) return 0;
  const iterations = usage.iterations ?? [];
  if (iterations.some((it) => it.type === "fallback_message")) {
    let total = 0;
    for (const it of iterations) {
      if (it.type !== "message" && it.type !== "fallback_message") continue;
      total += costOfTokens(priceFor(it.model ?? model) ?? priceFor(model), countsOf(it));
    }
    return total;
  }
  return costOfTokens(priceFor(model), countsOf(usage));
}

export interface UsageTotals {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
}

export const emptyUsage = (): UsageTotals => ({ requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 });

/** A new running total with one response added (never mutates `totals`). */
export function addUsage(totals: UsageTotals, model: string, usage: UsageLike | null | undefined): UsageTotals {
  const c = usage ? countsOf(usage) : { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  return {
    requests: totals.requests + 1,
    inputTokens: totals.inputTokens + c.input,
    outputTokens: totals.outputTokens + c.output,
    cacheReadTokens: totals.cacheReadTokens + c.cacheRead,
    cacheWriteTokens: totals.cacheWriteTokens + c.cacheWrite,
    costUsd: totals.costUsd + requestCost(model, usage),
  };
}

export function sumUsage(a: UsageTotals, b: UsageTotals): UsageTotals {
  return {
    requests: a.requests + b.requests,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    costUsd: a.costUsd + b.costUsd,
  };
}

/** Share of the prompt served from cache (0–1), the number that says caching works. */
export function cacheHitRate(t: UsageTotals): number {
  const prompt = t.inputTokens + t.cacheReadTokens + t.cacheWriteTokens;
  return prompt > 0 ? t.cacheReadTokens / prompt : 0;
}

/** "$0.0042", "$0.12", "$3.40" — four decimals under a cent so a cheap answer never reads $0.00. */
export function formatUsd(usd: number): string {
  const v = Number.isFinite(usd) && usd > 0 ? usd : 0;
  if (v === 0) return "$0.00";
  if (v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}

/** Rough cost of one typical chat question at a model's list price, for the onboarding and settings (guidance, not a
 *  quote). low = a warm cache and one tool round (two requests); high = the first question of a chat (the ≈7.5K-token
 *  prefix written to the cache), two tool rounds and longer thinking (three requests). */
export function typicalQuestionCost(model: AiModel): { low: number; high: number } {
  const price = MODEL_PRICES[model];
  const PREFIX = 7_500; // tools ≈3.1K + static system ≈1.5K + account snapshot ≈2.5K
  const req = (t: Partial<TokenCounts>): number => costOfTokens(price, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, ...t });
  const low = req({ cacheRead: PREFIX, input: 300, output: 400 }) + req({ cacheRead: PREFIX, input: 1_500, output: 500 });
  const high =
    req({ cacheWrite: PREFIX, input: 300, output: 1_200 }) +
    req({ cacheRead: PREFIX, cacheWrite: 1_500, input: 300, output: 1_200 }) +
    req({ cacheRead: PREFIX + 1_500, input: 2_000, output: 1_500 });
  return { low, high };
}

/** "$0.03–0.14" / "$0.001–0.004": two significant figures, the same decimals on both ends. */
export function formatUsdRange(range: { low: number; high: number }): string {
  const digits = range.high < 0.01 ? 3 : 2;
  const f = (v: number): string => v.toFixed(digits);
  return `$${f(Math.max(range.low, 10 ** -digits))}–${f(range.high)}`;
}
