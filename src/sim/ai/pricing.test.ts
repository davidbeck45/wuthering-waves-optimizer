import { describe, expect, it } from "vitest";
import { addUsage, cacheHitRate, costOfTokens, emptyUsage, formatUsd, MODEL_PRICES, priceFor, requestCost, sumUsage } from "./pricing";

describe("pricing", () => {
  it("prices Opus 5.5, Sonnet 5.5 and Haiku 5.5 per million tokens", () => {
    // 1M in + 1M out
    expect(requestCost("claude-opus-5-5", { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBeCloseTo(24, 6);
    expect(requestCost("claude-sonnet-5-5", { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBeCloseTo(12, 6);
    expect(requestCost("claude-haiku-5-5", { input_tokens: 50_000, output_tokens: 10_000 })).toBeCloseTo(0.005 + 0.005, 6);
  });

  it("bills cache reads at the read price and cache writes at 1.25 × input", () => {
    const usage = { input_tokens: 1000, cache_read_input_tokens: 10_000, cache_creation_input_tokens: 4000, output_tokens: 500 };
    // Opus: 1000×4 + 10000×0.2 + 4000×5 + 500×20 = 4000 + 2000 + 20000 + 10000 = 36000 per M
    expect(requestCost("claude-opus-5-5", usage)).toBeCloseTo(0.036, 9);
    expect(MODEL_PRICES["claude-opus-5-5"].cacheWrite).toBe(MODEL_PRICES["claude-opus-5-5"].input * 1.25);
    expect(MODEL_PRICES["claude-sonnet-5-5"].cacheWrite).toBe(MODEL_PRICES["claude-sonnet-5-5"].input * 1.25);
  });

  it("bills a Haiku request whose prompt passes 100K tokens at the long-context rates", () => {
    const short = costOfTokens(priceFor("claude-haiku-5-5"), { input: 100_000, output: 1000, cacheRead: 0, cacheWrite: 0 });
    const long = costOfTokens(priceFor("claude-haiku-5-5"), { input: 60_000, output: 1000, cacheRead: 50_000, cacheWrite: 0 });
    expect(short).toBeCloseTo((100_000 * 0.1 + 1000 * 0.5) / 1e6, 9);
    expect(long).toBeCloseTo((60_000 * 0.5 + 50_000 * 0.05 + 1000 * 2.5) / 1e6, 9);
  });

  it("prices a refusal-fallback response per iteration at each model's own rate", () => {
    const usage = {
      input_tokens: 2000,
      output_tokens: 300,
      iterations: [
        { type: "message", model: "claude-opus-5-5", input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        { type: "fallback_message", model: "claude-opus-4-8", input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      ],
    };
    expect(requestCost("claude-opus-5-5", usage)).toBeCloseTo((1000 * 4 + 100 * 20 + 1000 * 5 + 200 * 25) / 1e6, 9);
  });

  it("treats missing or unknown usage as free rather than throwing", () => {
    expect(requestCost("claude-opus-5-5", null)).toBe(0);
    expect(requestCost("some-future-model", { input_tokens: 10, output_tokens: 10 })).toBe(0);
    expect(requestCost("claude-opus-5-5", { input_tokens: -5, output_tokens: Number.NaN, cache_read_input_tokens: null })).toBe(0);
  });

  it("keeps running totals without mutating them", () => {
    const zero = emptyUsage();
    const one = addUsage(zero, "claude-opus-5-5", { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 });
    expect(zero.requests).toBe(0);
    expect(one).toMatchObject({ requests: 1, inputTokens: 100, outputTokens: 50, cacheReadTokens: 900, cacheWriteTokens: 0 });
    expect(cacheHitRate(one)).toBeCloseTo(0.9, 9);
    const two = sumUsage(one, one);
    expect(two.requests).toBe(2);
    expect(two.costUsd).toBeCloseTo(one.costUsd * 2, 12);
    expect(cacheHitRate(zero)).toBe(0);
  });

  it("formats costs so a cheap answer never reads $0.00", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(0.00042)).toBe("$0.0004");
    expect(formatUsd(0.0042)).toBe("$0.0042");
    expect(formatUsd(0.123)).toBe("$0.12");
    expect(formatUsd(3.4)).toBe("$3.40");
    expect(formatUsd(Number.NaN)).toBe("$0.00");
  });
});
