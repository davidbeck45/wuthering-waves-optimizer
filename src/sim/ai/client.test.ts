// Wuthering Tools+ AI: the client wrapper — lazy SDK, browser key rule, fallbacks, typed error mapping. No network.
import { describe, expect, it } from "vitest";
import * as sdk from "@anthropic-ai/sdk";
import { aiError, createAnthropicClient, describeError, fallbackFields, loadAnthropicSdk, refusalMessage } from "./client";

const KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789-WXYZ";
const headers = new Headers({ "request-id": "req_123" });
const apiError = (status: number, type: string) => sdk.APIError.generate(status, { type: "error", error: { type, message: `x ${KEY}` } }, undefined, headers);

describe("client", () => {
  it("loads the SDK lazily, once", async () => {
    const a = await loadAnthropicSdk();
    const b = await loadAnthropicSdk();
    expect(a).toBe(b);
    expect(typeof a.default).toBe("function");
  });

  it("needs the player's key in a browser; builds a browser client with it", async () => {
    await expect(createAnthropicClient({ browser: true })).rejects.toMatchObject({ aiKind: "no_key" });
    const { client } = await createAnthropicClient({ apiKey: KEY, browser: true });
    expect(client.apiKey).toBe(KEY);
    expect(typeof client.beta.messages.stream).toBe("function");
  });

  it("opts Opus 5.5 and Sonnet 5.5 into the server-side refusal fallback, not Haiku 5.5", () => {
    expect(fallbackFields("claude-opus-5-5")).toEqual({ betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
    expect(fallbackFields("claude-sonnet-5-5")).toEqual({ betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
    expect(fallbackFields("claude-haiku-5-5")).toEqual({});
  });

  it("maps the SDK's typed errors to friendly ones, most specific first", () => {
    const cases: Array<[unknown, string, boolean]> = [
      [new sdk.APIUserAbortError(), "aborted", false],
      [new sdk.APIConnectionTimeoutError({}), "timeout", true],
      [new sdk.APIConnectionError({ message: "fetch failed" }), "connection", true],
      [apiError(401, "authentication_error"), "auth", false],
      [apiError(403, "permission_error"), "permission", false],
      [apiError(404, "not_found_error"), "not_found", false],
      [apiError(429, "rate_limit_error"), "rate_limit", true],
      [apiError(529, "overloaded_error"), "overloaded", true],
      [apiError(500, "api_error"), "server", true],
      [apiError(402, "billing_error"), "billing", false],
      [apiError(413, "request_too_large"), "too_large", false],
      [apiError(400, "invalid_request_error"), "bad_request", false],
      [aiError("no_key", "Add your key"), "no_key", false],
      [Object.assign(new Error("aborted"), { name: "AbortError" }), "aborted", false],
      [new Error("boom"), "unknown", false],
    ];
    for (const [error, kind, retryable] of cases) {
      const d = describeError(error, sdk);
      expect(d.kind, String(error)).toBe(kind);
      expect(d.retryable, kind).toBe(retryable);
      expect(d.message.length).toBeGreaterThan(3);
    }
  });

  it("never surfaces the key, keeps the request id", () => {
    const d = describeError(apiError(401, "authentication_error"), sdk);
    expect(d.status).toBe(401);
    expect(d.requestId).toBe("req_123");
    expect(d.detail).not.toContain(KEY);
    expect(d.detail).toContain("sk-ant-…WXYZ");
    expect(d.message).not.toContain("sk-ant");
  });

  it("still describes errors when the SDK never loaded", () => {
    expect(describeError(new Error("x"), null).kind).toBe("unknown");
  });

  it("has a polite line for a refusal", () => {
    expect(refusalMessage({ category: "reasoning_extraction", explanation: null })).toMatch(/reasoning/);
    expect(refusalMessage(null)).toMatch(/declined/);
  });
});
