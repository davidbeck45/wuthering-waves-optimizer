// Wuthering Tools+ AI: the CLI twin (`npm run cli -- ask`) on a scripted client — no network, no key.
import { describe, expect, it } from "vitest";
import * as sdk from "@anthropic-ai/sdk";
import fixture from "./__fixtures__/aiAccount.json";
import { fakeClient, text, toolUse } from "./__fixtures__/fakeClaude";
import { parseExport } from "../cli/exportShape";
import { parseAskOptions, runAsk } from "./cliAsk";

const exp = parseExport(fixture, "aiAccount.json");

describe("ask (CLI)", () => {
  it("streams the answer to stdout and the tool timeline + cost to stderr", async () => {
    const { client, calls } = fakeClient([
      { content: [toolUse("rank_roster", { top: 2 }, "t1")], stop_reason: "tool_use" },
      { content: [text("Your best team is the Aemeath team.")], stop_reason: "end_turn" },
    ]);
    let out = "";
    let err = "";
    const r = await runAsk("best team I can field?", exp, { client, sdk, out: (t) => (out += t), err: (t) => (err += t) });
    expect(r.result.status).toBe("done");
    expect(out).toBe("Your best team is the Aemeath team.\n");
    expect(err).toContain('→ rank_roster {"top":2}');
    expect(err).toMatch(/ ok \(\d+ ms\) enemy: Lv 100/);
    expect(err).toMatch(/\[done\] claude-opus-5-5 · effort medium · 1 tool round · 2 requests · .* · \$0\.\d+/);
    expect(r.tools).toEqual([expect.objectContaining({ name: "rank_roster", input: { top: 2 }, ok: true })]);
    expect((calls[0].params as any).output_config).toEqual({ effort: "medium" });
  });

  it("passes model and effort through and validates them", async () => {
    const { client, calls } = fakeClient([{ content: [text("hi")], stop_reason: "end_turn" }]);
    const r = await runAsk("hi", exp, { client, sdk, model: "claude-haiku-5-5", effort: "low", stream: false });
    expect(r.model).toBe("claude-haiku-5-5");
    expect((calls[0].params as any).model).toBe("claude-haiku-5-5");
    expect(() => parseAskOptions({ model: "gpt-5" })).toThrow(/--model/);
    expect(() => parseAskOptions({ effort: "turbo" })).toThrow(/--effort/);
    expect(() => parseAskOptions({ maxRounds: 0 })).toThrow(/--max-rounds/);
    expect(() => parseAskOptions({ budgetUsd: -1 })).toThrow(/--budget/);
    await expect(runAsk("  ", exp, { client, sdk })).rejects.toThrow(/Ask a question/);
  });

  it("reports a refusal politely", async () => {
    const { client } = fakeClient([{ content: [], stop_reason: "refusal", stop_details: { type: "refusal", category: null, explanation: null } }]);
    let err = "";
    const r = await runAsk("?", exp, { client, sdk, err: (t) => (err += t) });
    expect(r.result.status).toBe("refusal");
    expect(err).toMatch(/declined/);
  });
});
