// Wuthering Tools+ AI: the conversation store — persistence, per-turn context, append-only history and the
// prompt-cache prefix (verified with a fake client that reports cache reads only for byte-identical prefixes).
import { describe, expect, it } from "vitest";
import * as sdk from "@anthropic-ai/sdk";
import fixture from "./__fixtures__/aiAccount.json";
import { fakeClient, text, toolUse } from "./__fixtures__/fakeClaude";
import { parseExport, type ExportFile } from "../cli/exportShape";
import type { StorageLike } from "./aiSettings";
import {
  AI_CHAT_STORAGE,
  askInConversation,
  canContinue,
  clearConversation,
  continueConversation,
  loadConversation,
  newConversation,
  saveConversation,
  transcriptOf,
  truncateBefore,
  turnContext,
} from "./conversation";

const exp = parseExport(fixture, "aiAccount.json");
const page = { route: "/teams", title: "Teams", openTeam: "wuwa_calc Aemeath S6R5 DPS" };

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

const withMornyeAt = (sequence: number): ExportFile => {
  const copy: ExportFile = JSON.parse(JSON.stringify(exp));
  const chains = copy.characters.Mornye.resonanceChains as Record<string, { isEnabled: boolean }>;
  for (const key of Object.keys(chains)) {
    const node = Number(/^(?:SequenceNode|Sequence|S)([1-6])/.exec(key)?.[1] ?? 0);
    if (node) chains[key] = { ...chains[key], isEnabled: node <= sequence };
  }
  if (!Object.keys(chains).some((k) => k.startsWith("SequenceNode2"))) chains.SequenceNode2Test = { isEnabled: sequence >= 2 };
  return copy;
};

describe("conversation store", () => {
  it("starts with the account snapshot frozen in, and round-trips through sessionStorage", () => {
    const c = newConversation({ model: "claude-opus-5-5", exp, now: new Date("2026-10-12T12:00:00Z"), id: "c1" });
    expect(c.snapshot).toContain("- Aemeath: S6 · Everbright Polestar R5");
    expect(c.snapshot).toContain("Not set up: Augusta.");
    expect(c.budgetUsd).toBe(0.5);
    const storage = memoryStorage();
    expect(saveConversation(c, storage)).toBe(true);
    expect(loadConversation(storage)).toEqual(c);
    clearConversation(storage);
    expect(storage.data.has(AI_CHAT_STORAGE)).toBe(false);
    expect(loadConversation(storage)).toBeNull();
  });

  it("ignores garbage or another version in storage; reports a full storage", () => {
    const storage = memoryStorage();
    storage.data.set(AI_CHAT_STORAGE, "{nope");
    expect(loadConversation(storage)).toBeNull();
    storage.data.set(AI_CHAT_STORAGE, JSON.stringify({ version: 2, id: "x" }));
    expect(loadConversation(storage)).toBeNull();
    const full: StorageLike = { getItem: () => null, removeItem: () => undefined, setItem: () => { throw new Error("QuotaExceededError"); } };
    expect(saveConversation(newConversation({ model: "claude-opus-5-5", exp }), full)).toBe(false);
    expect(saveConversation(newConversation({ model: "claude-opus-5-5", exp }), null)).toBe(false);
  });

  it("adds page context only when it changed, and a note when the account no longer matches the snapshot", () => {
    const c = newConversation({ model: "claude-opus-5-5", exp });
    const first = turnContext(c, exp, page);
    expect(first.message?.role).toBe("system");
    expect(first.message?.content).toMatch(/^Page context: The player is on \/teams \(Teams\)\. Open team: "wuwa_calc Aemeath S6R5 DPS"\.$/);
    const same = turnContext({ ...c, pageContext: first.pageContext }, exp, page);
    expect(same.message).toBeNull();
    const edited = turnContext({ ...c, pageContext: first.pageContext }, withMornyeAt(2), page);
    expect(edited.message?.content).toMatch(/The player's data changed since the account snapshot/);
    expect(edited.message?.content).toContain("Mornye: S2");
    expect(edited.accountKey).not.toBe(c.accountKey);
  });
});

describe("askInConversation", () => {
  it("appends the question, the page note and Claude's turns; keeps the cached prefix byte-identical across turns", async () => {
    const { client, calls } = fakeClient(
      [
        { content: [toolUse("calc_team", { team: "1" }, "t1")], stop_reason: "tool_use" },
        { content: [text("Your team averages 9.47M.")], stop_reason: "end_turn" },
        { content: [text("Mornye adds little damage herself.")], stop_reason: "end_turn" },
      ],
      { cache: true },
    );
    let c = newConversation({ model: "claude-opus-5-5", exp });
    const one = await askInConversation(c, "How does my Aemeath team do?", { client, sdk, effort: "medium", exp, page });
    c = one.conversation;
    expect(one.result.status).toBe("done");
    expect(c.messages.map((m) => m.role)).toEqual(["user", "system", "assistant", "user", "assistant"]);
    expect(c.pageContext).toMatch(/^Page context/);
    expect(c.usage.requests).toBe(2);

    const two = await askInConversation(c, "And Mornye?", { client, sdk, effort: "medium", exp, page });
    c = two.conversation;
    // same page, same account: no new system message this turn
    expect(c.messages.slice(5).map((m) => m.role)).toEqual(["user", "assistant"]);
    const turn2 = JSON.parse(calls[2].json);
    // the first turn's messages go back unchanged, so the prefix is a cache hit
    expect(turn2.messages.slice(0, 5)).toEqual(JSON.parse(JSON.stringify(one.conversation.messages)));
    const u = calls.map((call) => call.params);
    expect(JSON.stringify([u[0].tools, u[0].system])).toBe(JSON.stringify([u[2].tools, u[2].system]));
    expect(two.result.usage.cacheReadTokens).toBeGreaterThan(0);
    expect(one.result.usage.cacheReadTokens).toBeGreaterThan(0); // the tool round re-read turn one's prefix
    expect(c.usage.requests).toBe(3);
  });

  it("when nothing is committed (refusal) the history stays as it was, the cost still counts", async () => {
    const { client } = fakeClient([{ content: [], stop_reason: "refusal", stop_details: { type: "refusal", category: null, explanation: null } }]);
    const c = newConversation({ model: "claude-opus-5-5", exp });
    const { conversation, result } = await askInConversation(c, "?", { client, sdk, effort: "medium", exp, page });
    expect(result.status).toBe("refusal");
    expect(conversation.messages).toEqual([]);
    expect(conversation.pageContext).toBeNull(); // the note was never delivered: send it again next time
    expect(conversation.usage.requests).toBe(1);
  });

  it("stops at the budget and continues later from the pending tool results", async () => {
    const { client, calls } = fakeClient([
      { content: [toolUse("rankings_link", {}, "t1")], stop_reason: "tool_use" },
      { content: [text("Here is the link.")], stop_reason: "end_turn" },
    ]);
    let c = { ...newConversation({ model: "claude-opus-5-5", exp }), budgetUsd: 0.0005 };
    const first = await askInConversation(c, "Link me the rankings", { client, sdk, effort: "medium", exp, confirm: async () => false });
    c = first.conversation;
    expect(first.result.status).toBe("budget");
    expect(canContinue(c)).toBe(true);
    const next = await continueConversation(c, { client, sdk, effort: "medium", exp, confirm: async () => true });
    expect(next.result.status).toBe("done");
    // one step past the limit = the budget setting the chat started with ($0.50), not the raised limit
    expect(next.conversation.budgetUsd).toBeCloseTo(c.usage.costUsd + 0.5, 9);
    expect(canContinue(next.conversation)).toBe(false);
    expect(calls).toHaveLength(2);
    expect(JSON.parse(calls[1].json).messages.at(-1).content[0]).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
  });
});

describe("transcript and edits", () => {
  const messages = [
    { role: "user", content: "How does my team do?" },
    { role: "system", content: "Page context: …" },
    { role: "assistant", content: [{ type: "thinking", thinking: "", signature: "s" }, toolUse("calc_team", { team: "1" }, "a"), toolUse("get_kit", { character: "Mornye" }, "b")] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "a", content: '{"total":1}' }, { type: "tool_result", tool_use_id: "b", content: '{"error":"x"}', is_error: true }] },
    { role: "assistant", content: [text("It does 9.47M.")] },
    { role: "user", content: [{ type: "text", text: "Show me this echo" }, { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } }] },
    { role: "assistant", content: [text("That's a Sigillum.")] },
  ] as any[];

  it("renders one entry per question and per answer, tools with their results", () => {
    const t = transcriptOf(messages);
    expect(t.map((e) => e.kind)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(t[0]).toEqual({ kind: "user", index: 0, text: "How does my team do?", images: 0, attachments: [] });
    const answer = t[1] as Extract<(typeof t)[number], { kind: "assistant" }>;
    expect(answer.text).toBe("It does 9.47M.");
    expect(answer.tools).toEqual([
      { id: "a", name: "calc_team", input: { team: "1" }, ok: true, result: '{"total":1}' },
      { id: "b", name: "get_kit", input: { character: "Mornye" }, ok: false, result: '{"error":"x"}' },
    ]);
    expect(t[2]).toMatchObject({ kind: "user", index: 5, images: 1 });
  });

  it("rewinds to a question (append-only: the edited text is asked anew)", () => {
    const c = { ...newConversation({ model: "claude-opus-5-5", exp }), messages, pageContext: "Page context: …" };
    const cut = truncateBefore(c, 5);
    expect(cut.messages).toEqual(messages.slice(0, 5));
    expect(cut.pageContext).toBeNull();
    expect(() => truncateBefore(c, 3)).toThrow(/question/); // a tool_result message
    expect(() => truncateBefore(c, 4)).toThrow(/question/); // an assistant turn
    expect(c.messages).toHaveLength(7);
  });
});
