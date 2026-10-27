// Wuthering Tools+ AI: the agent loop against a scripted client (no network) — tool rounds, parallel tools,
// invalid input, pause_turn, max_tokens, refusal, abort, the round cap, the soft budget, request shape.
import { describe, expect, it, vi } from "vitest";
import * as sdk from "@anthropic-ai/sdk";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import fixture from "./__fixtures__/aiAccount.json";
import { fakeClient, text, thinking, toolUse, type ScriptStep } from "./__fixtures__/fakeClaude";
import { runAgentTurn, TOOL_LIMIT_MESSAGE, type AgentTurnOptions, type ToolRunner } from "./agentLoop";
import { parseExport } from "../cli/exportShape";
import { systemBlocks } from "./prompt";
import { runTool, toolDefinitions } from "./tools/index";

const exp = parseExport(fixture, "aiAccount.json");
const ctx = { exp, now: new Date("2026-10-12T12:00:00Z") };
const question: BetaMessageParam = { role: "user", content: "How does my Aemeath team do?" };
const pageNote: BetaMessageParam = { role: "system", content: "Page context: The player is on /teams." };

function turn(script: ScriptStep[], extra: Partial<AgentTurnOptions> = {}) {
  const fake = fakeClient(script);
  const options: AgentTurnOptions = {
    client: fake.client,
    sdk,
    model: "claude-opus-5-5",
    effort: "medium",
    system: systemBlocks("# Account snapshot\n(test)"),
    history: [],
    newMessages: [question, pageNote],
    ctx,
    ...extra,
  };
  return { fake, run: () => runAgentTurn(options) };
}

const okRunner = (content = '{"ok":true}'): ToolRunner => vi.fn(async () => ({ ok: true, content, preview: "ok", provenance: null, ms: 1 }));

describe("agent loop", () => {
  it("tool_use → tool_result → end_turn, with the real tools on the fixture", async () => {
    const events: string[] = [];
    const { fake, run } = turn(
      [
        { content: [thinking(), toolUse("calc_team", { team: "1" }, "toolu_team")], stop_reason: "tool_use" },
        { content: [text("Your Aemeath team averages 9.47M.")], stop_reason: "end_turn" },
      ],
      {
        callbacks: {
          onThinkingStart: () => events.push("thinking"),
          onToolCall: (name) => events.push(`call:${name}`),
          onToolStart: (name, input) => events.push(`start:${name}:${JSON.stringify(input)}`),
          onToolEnd: (name, ok) => events.push(`end:${name}:${ok}`),
          onText: (t) => events.push(`text:${t}`),
          onUsage: (u) => events.push(`usage:${u.requests}`),
          onDone: (r) => events.push(`done:${r.status}`),
        },
      },
    );
    const r = await run();
    expect(r.status).toBe("done");
    expect(r.rounds).toBe(1);
    expect(r.text).toBe("Your Aemeath team averages 9.47M.");
    expect(events).toEqual([
      "thinking",
      "call:calc_team",
      "usage:1",
      'start:calc_team:{"team":"1"}',
      "end:calc_team:true",
      "text:Your Aemeath team averages 9.47M.",
      "usage:2",
      "done:done",
    ]);
    // append-only: question, page note, Claude's tool turn (thinking block kept), the results, the answer
    expect(r.messages.map((m) => m.role)).toEqual(["user", "system", "assistant", "user", "assistant"]);
    expect((r.messages[2].content as any[])[0]).toEqual({ type: "thinking", thinking: "", signature: "sig_abc" });
    const results = r.messages[3].content as any[];
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ type: "tool_result", tool_use_id: "toolu_team" });
    expect(results[0].is_error).toBeUndefined();
    expect(JSON.parse(results[0].content).total.avg).toBeGreaterThan(1_000_000);
    // the second request carries everything so far, unchanged
    expect(fake.calls[1].params.messages).toEqual(r.messages.slice(0, 4));
    expect(r.usage.requests).toBe(2);
    expect(r.usage.costUsd).toBeGreaterThan(0);
  });

  it("sends the cached prefix the same way every request: tools, system blocks, effort, fallbacks, no thinking param", async () => {
    const { fake, run } = turn([
      { content: [toolUse("get_account_summary", {})], stop_reason: "tool_use" },
      { content: [text("ok")], stop_reason: "end_turn" },
    ]);
    await run();
    const [a, b] = fake.calls.map((c) => c.params as any);
    expect(a.model).toBe("claude-opus-5-5");
    expect(a.max_tokens).toBe(32000);
    expect(a.output_config).toEqual({ effort: "medium" });
    expect(a).not.toHaveProperty("thinking");
    expect(a).not.toHaveProperty("tool_choice");
    expect(a.cache_control).toEqual({ type: "ephemeral" });
    expect(a.system).toHaveLength(2);
    expect(a.system.every((s: any) => s.cache_control?.type === "ephemeral")).toBe(true);
    expect(a.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(a.fallbacks).toBe("default");
    expect(a.tools.map((t: any) => t.name)).toEqual(toolDefinitions().map((t) => t.name));
    expect(a.tools.every((t: any) => t.strict === true && t.eager_input_streaming === true)).toBe(true);
    expect(JSON.stringify([a.tools, a.system])).toBe(JSON.stringify([b.tools, b.system]));
  });

  it("Haiku 5.5 gets no server-side fallback", async () => {
    const { fake, run } = turn([{ content: [text("hi")], stop_reason: "end_turn" }], { model: "claude-haiku-5-5", effort: "low" });
    await run();
    const p = fake.calls[0].params as any;
    expect(p).not.toHaveProperty("fallbacks");
    expect(p).not.toHaveProperty("betas");
    expect(p.output_config).toEqual({ effort: "low" });
  });

  it("runs every tool of a turn in parallel and returns all results in one user message, invalid input as is_error", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const gated: ToolRunner = async (name, input, c) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return runTool(name, input, c);
    };
    const { run } = turn(
      [
        {
          content: [
            toolUse("get_kit", { character: "Mornye", sequence: 2 }, "t1"),
            toolUse("calc_character", { character: 5 }, "t2"),
            toolUse("rankings_link", { characters: ["Aemeath"] }, "t3"),
          ],
          stop_reason: "tool_use",
        },
        { content: [text("done")], stop_reason: "end_turn" },
      ],
      { runTool: gated },
    );
    const r = await run();
    expect(maxInFlight).toBe(3);
    const results = r.messages[3].content as any[];
    expect(results.map((x) => x.tool_use_id)).toEqual(["t1", "t2", "t3"]);
    expect(results[0].is_error).toBeUndefined();
    expect(results[1].is_error).toBe(true);
    expect(JSON.parse(results[1].content).error).toMatch(/character must be a string/);
    expect(results[2].is_error).toBeUndefined();
    expect(r.messages.filter((m) => m.role === "user")).toHaveLength(2); // the question + ONE results message
  });

  it("a runner that throws still answers its tool_use with is_error", async () => {
    const { run } = turn(
      [
        { content: [toolUse("calc_team", { team: "1" }, "t1")], stop_reason: "tool_use" },
        { content: [text("sorry")], stop_reason: "end_turn" },
      ],
      { runTool: async () => Promise.reject(new Error("worker crashed")) },
    );
    const r = await run();
    const [result] = r.messages[3].content as any[];
    expect(result).toMatchObject({ tool_use_id: "t1", is_error: true });
    expect(JSON.parse(result.content).error).toBe("worker crashed");
    expect(r.status).toBe("done");
  });

  it("pause_turn: appends the paused turn and continues without a new user message", async () => {
    const { fake, run } = turn([
      { content: [text("Working on it…")], stop_reason: "pause_turn" },
      { content: [text("Done.")], stop_reason: "end_turn" },
    ]);
    const r = await run();
    expect(r.status).toBe("done");
    expect(r.messages.map((m) => m.role)).toEqual(["user", "system", "assistant", "assistant"]);
    const second = fake.calls[1].params.messages;
    expect(second[second.length - 1]).toEqual({ role: "assistant", content: [text("Working on it…")] });
    expect(r.text).toBe("Working on it…\n\nDone.");
  });

  it("max_tokens with a tool_use: never runs the truncated input, retries once with more room", async () => {
    const runner = okRunner();
    const retries: string[] = [];
    const { fake, run } = turn(
      [
        { content: [toolUse("calc_team", { team: "1" })], stop_reason: "max_tokens" },
        { content: [text("Answer.")], stop_reason: "end_turn" },
      ],
      { runTool: runner, callbacks: { onRetry: (why) => retries.push(why) } },
    );
    const r = await run();
    expect(runner).not.toHaveBeenCalled();
    expect(retries).toEqual(["max_tokens"]);
    expect((fake.calls[1].params as any).max_tokens).toBe(64000);
    expect(fake.calls[1].params.messages).toEqual([question, pageNote]);
    expect(r.status).toBe("done");
    expect(r.messages.map((m) => m.role)).toEqual(["user", "system", "assistant"]);
    expect(r.usage.requests).toBe(2); // the discarded response was still billed
  });

  it("max_tokens with a tool_use twice: stops, commits nothing, runs nothing", async () => {
    const runner = okRunner();
    const { run } = turn(
      [
        { content: [toolUse("calc_team", { team: "1" })], stop_reason: "max_tokens" },
        { content: [toolUse("calc_team", { team: "1" })], stop_reason: "max_tokens" },
      ],
      { runTool: runner },
    );
    const r = await run();
    expect(r.status).toBe("max_tokens");
    expect(r.messages).toEqual([]);
    expect(runner).not.toHaveBeenCalled();
  });

  it("max_tokens on a text answer keeps what was written", async () => {
    const { run } = turn([{ content: [text("A long answer that got cut")], stop_reason: "max_tokens" }]);
    const r = await run();
    expect(r.status).toBe("max_tokens");
    expect(r.text).toBe("A long answer that got cut");
    expect(r.messages).toHaveLength(3);
  });

  it("refusal: no tools run, nothing committed, a polite message", async () => {
    const runner = okRunner();
    const { run } = turn(
      [{ content: [toolUse("calc_team", { team: "1" })], stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: null } }],
      { runTool: runner },
    );
    const r = await run();
    expect(r.status).toBe("refusal");
    expect(r.refusal).toEqual({ category: "cyber", message: expect.stringMatching(/declined/) });
    expect(r.messages).toEqual([]);
    expect(runner).not.toHaveBeenCalled();
  });

  it("refusal after a completed tool round keeps the completed round", async () => {
    const { run } = turn(
      [
        { content: [toolUse("calc_team", { team: "1" })], stop_reason: "tool_use" },
        { content: [], stop_reason: "refusal", stop_details: { type: "refusal", category: null, explanation: null } },
      ],
      { runTool: okRunner() },
    );
    const r = await run();
    expect(r.status).toBe("refusal");
    expect(r.messages.map((m) => m.role)).toEqual(["user", "system", "assistant", "user"]);
  });

  it("abort while streaming: stops at once, commits nothing", async () => {
    const controller = new AbortController();
    const { run } = turn([{ content: [], stop_reason: "end_turn", waitForAbort: true }], { signal: controller.signal });
    const p = run();
    setTimeout(() => controller.abort(), 5);
    const r = await p;
    expect(r.status).toBe("aborted");
    expect(r.messages).toEqual([]);
  });

  it("abort after the stream started: what it reported so far still counts toward the cost (it was billed)", async () => {
    const controller = new AbortController();
    const onUsage = vi.fn();
    const { run } = turn(
      [{ content: [], stop_reason: "end_turn", usage: { input_tokens: 5000, output_tokens: 0 }, waitForAbortAfterStart: { output_tokens: 800 } }],
      { signal: controller.signal, callbacks: { onUsage } },
    );
    const p = run();
    setTimeout(() => controller.abort(), 5);
    const r = await p;
    expect(r.status).toBe("aborted");
    expect(r.messages).toEqual([]);
    expect(r.usage).toMatchObject({ requests: 1, inputTokens: 5000, outputTokens: 800 });
    // Opus 5.5: 5000 × $4 + 800 × $20 per MTok
    expect(r.usage.costUsd).toBeCloseTo(0.036, 6);
    expect(onUsage).toHaveBeenCalledTimes(1);
  });

  it("abort during a tool round: the tool turn is not committed without its results", async () => {
    const controller = new AbortController();
    const runner: ToolRunner = async () => {
      controller.abort();
      return { ok: true, content: "{}", preview: "", provenance: null, ms: 0 };
    };
    const { fake, run } = turn(
      [
        { content: [toolUse("calc_team", { team: "1" })], stop_reason: "tool_use" },
        { content: [text("never")], stop_reason: "end_turn" },
      ],
      { signal: controller.signal, runTool: runner },
    );
    const r = await run();
    expect(r.status).toBe("aborted");
    expect(r.messages).toEqual([]);
    expect(fake.calls).toHaveLength(1);
  });

  it("an already-aborted signal makes no request", async () => {
    const controller = new AbortController();
    controller.abort();
    const { fake, run } = turn([{ content: [text("x")], stop_reason: "end_turn" }], { signal: controller.signal });
    expect((await run()).status).toBe("aborted");
    expect(fake.calls).toHaveLength(0);
  });

  it("re-issues a turn whose streamed tool JSON could not be parsed (twice at most), never an API error", async () => {
    const parseError = new sdk.AnthropicError("Unable to parse tool parameter JSON from model.");
    const retries: string[] = [];
    const ok = turn(
      [
        { content: [], stop_reason: "end_turn", throwError: parseError },
        { content: [text("fine")], stop_reason: "end_turn" },
      ],
      { callbacks: { onRetry: (w) => retries.push(w) } },
    );
    const r = await ok.run();
    expect(r.status).toBe("done");
    expect(retries).toEqual(["invalid_json"]);
    const failing = turn([0, 1, 2].map(() => ({ content: [], stop_reason: "end_turn", throwError: parseError })));
    const f = await failing.run();
    expect(f.status).toBe("error");
    expect(failing.fake.calls).toHaveLength(3);
    const rate = turn([{ content: [], stop_reason: "end_turn", throwError: sdk.APIError.generate(429, { type: "error", error: { type: "rate_limit_error", message: "slow down" } }, undefined, new Headers()) }]);
    const e = await rate.run();
    expect(e.status).toBe("error");
    expect(e.error?.kind).toBe("rate_limit");
    expect(rate.fake.calls).toHaveLength(1);
    expect(e.messages).toEqual([]);
  });

  it("after the tool-round cap: asks; on no, answers the pending calls with errors and gets a final answer without tools", async () => {
    const runner = okRunner();
    const confirm = vi.fn(async () => false);
    const { fake, run } = turn(
      [
        { content: [toolUse("calc_team", { team: "1" }, "a")], stop_reason: "tool_use" },
        { content: [toolUse("rank_roster", {}, "b")], stop_reason: "tool_use" },
        { content: [text("From what I have: 9.47M.")], stop_reason: "end_turn" },
      ],
      { runTool: runner, maxToolRounds: 1, confirm },
    );
    const r = await run();
    expect(confirm).toHaveBeenCalledWith({ kind: "tool_limit", rounds: 1 });
    expect(runner).toHaveBeenCalledTimes(1);
    expect(r.status).toBe("tool_limit");
    const limited = r.messages[5].content as any[];
    expect(limited).toEqual([{ type: "tool_result", tool_use_id: "b", is_error: true, content: TOOL_LIMIT_MESSAGE(1) }]);
    expect((fake.calls[2].params as any).tool_choice).toEqual({ type: "none" });
    expect(r.text).toBe("From what I have: 9.47M.");
  });

  it("after the tool-round cap: on yes, keeps going", async () => {
    const runner = okRunner();
    const { fake, run } = turn(
      [
        { content: [toolUse("calc_team", { team: "1" })], stop_reason: "tool_use" },
        { content: [toolUse("rank_roster", {})], stop_reason: "tool_use" },
        { content: [text("ok")], stop_reason: "end_turn" },
      ],
      { runTool: runner, maxToolRounds: 1, confirm: async () => true },
    );
    const r = await run();
    expect(runner).toHaveBeenCalledTimes(2);
    expect(r.status).toBe("done");
    expect((fake.calls[2].params as any).tool_choice).toBeUndefined();
  });

  it("past the soft budget: asks before the next request; no stops with what was committed", async () => {
    // each scripted response: 100 in + 20 out on Opus = $0.0008
    const confirm = vi.fn(async () => false);
    const { fake, run } = turn(
      [
        { content: [toolUse("calc_team", { team: "1" })], stop_reason: "tool_use" },
        { content: [text("never")], stop_reason: "end_turn" },
      ],
      { runTool: okRunner(), budget: { limitUsd: 0.0005, spentUsd: 0 }, confirm },
    );
    const r = await run();
    expect(confirm).toHaveBeenCalledWith({ kind: "budget", spentUsd: expect.closeTo(0.0008, 9), limitUsd: 0.0005 });
    expect(r.status).toBe("budget");
    expect(fake.calls).toHaveLength(1);
    expect(r.messages.map((m) => m.role)).toEqual(["user", "system", "assistant", "user"]);
    expect(r.budgetLimitUsd).toBe(0.0005);
  });

  it("past the soft budget: yes raises the limit by one step and continues", async () => {
    const { fake, run } = turn(
      [
        { content: [toolUse("calc_team", { team: "1" })], stop_reason: "tool_use" },
        { content: [text("ok")], stop_reason: "end_turn" },
      ],
      { runTool: okRunner(), budget: { limitUsd: 0.0005, spentUsd: 0 }, confirm: async () => true },
    );
    const r = await run();
    expect(fake.calls).toHaveLength(2);
    expect(r.status).toBe("done");
    expect(r.budgetLimitUsd).toBeCloseTo(0.0008 + 0.0005, 9);
  });

  it("a conversation already over budget asks before the first request", async () => {
    const { fake, run } = turn([{ content: [text("x")], stop_reason: "end_turn" }], { budget: { limitUsd: 0.5, spentUsd: 0.6 } });
    const r = await run();
    expect(r.status).toBe("budget");
    expect(fake.calls).toHaveLength(0);
    expect(r.messages).toEqual([]);
  });

  it("never mutates the history it was given, and refuses to answer an assistant turn", async () => {
    const history = Object.freeze([Object.freeze({ role: "user", content: "hi" }), Object.freeze({ role: "assistant", content: [text("hello")] })]) as unknown as BetaMessageParam[];
    const { run } = turn([{ content: [text("again")], stop_reason: "end_turn" }], { history });
    const r = await run();
    expect(r.status).toBe("done");
    expect(history).toHaveLength(2);
    const nothing = turn([], { history, newMessages: [] });
    const n = await nothing.run();
    expect(n.status).toBe("error");
    expect(n.error?.message).toMatch(/Nothing to answer/);
  });
});
