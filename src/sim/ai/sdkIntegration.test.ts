// Wuthering Tools+ AI: the agent loop on the REAL Anthropic SDK client with its `fetch` replaced by a scripted
// server-sent-event stream — no network, no key. Proves the request the SDK actually sends (headers, body) and
// that the SDK's stream parser, tool-input accumulation and typed errors fit the loop.
import { describe, expect, it } from "vitest";
import * as sdk from "@anthropic-ai/sdk";
import fixture from "./__fixtures__/aiAccount.json";
import { parseExport } from "../cli/exportShape";
import { askInConversation, newConversation } from "./conversation";

const exp = parseExport(fixture, "aiAccount.json");
const KEY = "sk-ant-api03-test-0000000000000000000000000000";

type Sse = Array<Record<string, unknown>>;
const usage = { input_tokens: 50, output_tokens: 10, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 };
const start = (id: string): Record<string, unknown> => ({
  type: "message_start",
  message: { id, type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, stop_details: null, usage },
});
const stop = (reason: string): Sse => [{ type: "message_delta", delta: { stop_reason: reason, stop_sequence: null, stop_details: null }, usage }, { type: "message_stop" }];

function sseResponse(events: Sse): Response {
  const body = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream", "request-id": "req_test" } });
}

function scriptedFetch(responses: Array<Sse | Response>) {
  const requests: Array<{ url: string; headers: Record<string, string>; body: any }> = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    requests.push({ url: String(url), headers, body: JSON.parse(String(init?.body ?? "{}")) });
    const next = responses[requests.length - 1];
    if (!next) throw new Error("no scripted response");
    return next instanceof Response ? next : sseResponse(next);
  };
  return { fetch, requests };
}

// eslint-disable-next-line no-unused-vars -- the parameters of a function type
const client = (fetch: (url: string | URL | Request, init?: RequestInit) => Promise<Response>) =>
  new sdk.default({ apiKey: KEY, fetch: fetch as never, maxRetries: 0, dangerouslyAllowBrowser: true });

describe("agent loop on the real SDK (scripted fetch)", () => {
  it("streams thinking + a tool call, runs the tool, sends the turn back unchanged, streams the answer", async () => {
    const { fetch, requests } = scriptedFetch([
      [
        start("msg_1"),
        { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig_real" } },
        { type: "content_block_stop", index: 0 },
        { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_1", name: "calc_team", input: {} } },
        { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"te' } },
        { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: 'am": "1"}' } },
        { type: "content_block_stop", index: 1 },
        ...stop("tool_use"),
      ],
      [
        start("msg_2"),
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "", citations: null } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Your team " } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "averages 9.47M." } },
        { type: "content_block_stop", index: 0 },
        ...stop("end_turn"),
      ],
    ]);
    let streamed = "";
    const conversation = newConversation({ model: "claude-opus-5-5", exp });
    const { conversation: after, result } = await askInConversation(conversation, "How does my team do?", {
      client: client(fetch),
      sdk,
      effort: "medium",
      exp,
      page: { route: "/teams" },
      callbacks: { onText: (t) => (streamed += t) },
    });
    expect(result.status).toBe("done");
    expect(streamed).toBe("Your team averages 9.47M.");

    const [first, second] = requests;
    // SDK 1.x (API version 2026-10-21): no `?beta=true` on beta routes, the key goes out as a Bearer token
    expect(first.url).toBe("https://api.anthropic.com/v1/messages");
    expect(first.headers["authorization"]).toBe(`Bearer ${KEY}`);
    expect(first.headers["anthropic-version"]).toBe("2026-10-21");
    expect(first.headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(first.headers["anthropic-beta"]).toContain("server-side-fallback-2026-07-01");
    expect(first.body).toMatchObject({ model: "claude-opus-5-5", stream: true, fallbacks: "default", output_config: { effort: "medium" }, cache_control: { type: "ephemeral" }, max_tokens: 32000 });
    expect(first.body).not.toHaveProperty("thinking");
    expect(first.body).not.toHaveProperty("betas");
    expect(first.body.tools[0]).toMatchObject({ name: "get_account_summary", strict: true, eager_input_streaming: true });
    expect(first.body.system[1].text).toMatch(/^# Account snapshot/);
    expect(first.body.messages).toEqual([
      { role: "user", content: "How does my team do?" },
      { role: "system", content: "Page context: The player is on /teams." },
    ]);
    // the assistant turn goes back exactly as streamed: the thinking block with its signature, the parsed tool input
    expect(second.body.messages[2]).toEqual({
      role: "assistant",
      content: [
        { type: "thinking", thinking: "", signature: "sig_real" },
        { type: "tool_use", id: "toolu_1", name: "calc_team", input: { team: "1" } },
      ],
    });
    expect(second.body.messages[3].content[0]).toMatchObject({ type: "tool_result", tool_use_id: "toolu_1" });
    expect(JSON.parse(second.body.messages[3].content[0].content).total.avg).toBeGreaterThan(1_000_000);
    expect(after.messages).toHaveLength(5);
    expect(after.usage.cacheReadTokens).toBe(1800);
  });

  it("a tool input that is not valid JSON never reaches a tool unvalidated", async () => {
    const ran: string[] = [];
    const { fetch, requests } = scriptedFetch([
      [
        start("msg_1"),
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_bad", name: "calc_team", input: {} } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"team": 1x}' } },
        { type: "content_block_stop", index: 0 },
        ...stop("tool_use"),
      ],
      [start("msg_2"), { type: "content_block_start", index: 0, content_block: { type: "text", text: "", citations: null } }, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } }, { type: "content_block_stop", index: 0 }, ...stop("end_turn")],
      [start("msg_3"), { type: "content_block_start", index: 0, content_block: { type: "text", text: "", citations: null } }, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } }, { type: "content_block_stop", index: 0 }, ...stop("end_turn")],
    ]);
    const { result } = await askInConversation(newConversation({ model: "claude-opus-5-5", exp }), "?", {
      client: client(fetch),
      sdk,
      effort: "medium",
      exp,
      callbacks: { onToolStart: (name, input) => ran.push(`${name}:${JSON.stringify(input)}`) },
    });
    expect(result.status).toBe("done");
    if (requests.length === 2 && ran.length) {
      // the tolerant parser salvaged something: the validator answered it with is_error
      const reply = requests[1].body.messages.at(-1).content[0];
      expect(reply.is_error).toBe(true);
      expect(reply.content).toMatch(/Invalid input for calc_team/);
    } else {
      // the parser gave up: the turn was re-issued and no tool ran
      expect(ran).toEqual([]);
      expect(requests[1].body.messages).toEqual(requests[0].body.messages);
    }
  });

  it("maps real HTTP errors through the SDK's typed classes", async () => {
    const err401 = new Response(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }), { status: 401, headers: { "content-type": "application/json", "request-id": "req_401" } });
    const { fetch } = scriptedFetch([err401]);
    const { result, conversation } = await askInConversation(newConversation({ model: "claude-sonnet-5-5", exp }), "?", { client: client(fetch), sdk, effort: "medium", exp });
    expect(result.status).toBe("error");
    expect(result.error).toMatchObject({ kind: "auth", status: 401, requestId: "req_401", retryable: false });
    expect(conversation.messages).toEqual([]);
  });
});
