// Wuthering Tools+ AI: the assistant's state and public API (useAssistant) over the real conversation store, agent
// loop and tools, with the runtime's client swapped for a scripted fake — no network.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as sdk from "@anthropic-ai/sdk";
import fixture from "./__fixtures__/aiAccount.json";
import { fakeClient, text, toolUse, type ScriptStep } from "./__fixtures__/fakeClaude";
import { parseExport } from "../cli/exportShape";
import * as conversationModule from "./conversation";
import { describeError } from "./client";
import { resetAiSettingsState, useAiSettings } from "./aiSettings";
import { runTool } from "./tools/index";
import { AI_CHAT_STORAGE } from "./conversationStore";
import { resetAssistantState, setAssistantPageProvider, setAssistantRuntimeLoader, useAssistant } from "./useAssistant";

const KEY = "sk-ant-api03-test-0000000000000000000000";
const exp = parseExport(fixture, "aiAccount.json");

function install(script: ScriptStep[]) {
  const fake = fakeClient(script);
  const runtime = {
    ...conversationModule,
    exportFromStores: () => exp,
    createAnthropicClient: async () => ({ client: fake.client, sdk }),
    toolRunner: () => runTool,
    describeError,
  };
  setAssistantRuntimeLoader(async () => runtime as unknown as typeof import("./assistantRuntime"));
  return fake;
}

/** Resolves once the assistant is idle again (the loop runs on microtasks and the fake stream). */
async function settle(): Promise<void> {
  const { state } = useAssistant();
  for (let i = 0; i < 400 && (state.busy || i < 2); i++) await new Promise((r) => setTimeout(r, 5));
}

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 400 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  resetAiSettingsState();
  resetAssistantState();
  setAssistantPageProvider(() => ({ path: "/teams", title: "Team rotations", openTeam: null }));
});
afterEach(() => setAssistantRuntimeLoader(null));

describe("useAssistant", () => {
  it("asks: streams the answer, commits the turn to the conversation and saves it for the tab", async () => {
    useAiSettings().setApiKey(KEY);
    const fake = install([
      { content: [text("Checking."), toolUse("get_account_summary", {}, "toolu_1")], stop_reason: "tool_use" },
      { content: [text("You have **3** characters set up.")], stop_reason: "end_turn" },
    ]);
    const a = useAssistant();
    a.ask("How many characters are set up?");
    expect(a.state.open).toBe(true);
    expect(a.state.busy).toBe(true);
    expect(a.state.pending?.text).toBe("How many characters are set up?");
    await settle();

    expect(a.state.live).toBeNull();
    expect(a.state.notice).toBeNull();
    const conv = a.conversation.value!;
    expect(conv.messages.map((m) => m.role)).toEqual(["user", "system", "assistant", "user", "assistant"]);
    expect(conv.messages[1].content).toContain("/teams");
    expect(a.totalCost.value?.requests).toBe(2);
    expect(JSON.parse(sessionStorage.getItem(AI_CHAT_STORAGE)!).id).toBe(conv.id);
    expect(fake.calls[0].params.output_config).toEqual({ effort: "medium" });
    expect(a.toolMs.has("toolu_1")).toBe(true);
    expect(a.hasChat.value).toBe(true);
  });

  it("explains: the data travels as a fenced JSON attachment at the Explain effort", async () => {
    useAiSettings().setApiKey(KEY);
    const fake = install([{ content: [text("Mostly Aemeath.")], stop_reason: "end_turn" }]);
    const a = useAssistant();
    a.explain({ title: "Team damage breakdown", data: { total: 9466750, slots: [{ character: "Aemeath", share: 84.2 }] } });
    await settle();
    const first = fake.calls[0].params;
    expect(first.output_config).toEqual({ effort: "low" });
    const content = first.messages[0].content as Array<{ type: string; text: string }>;
    expect(content[0].text).toBe('Explain "Team damage breakdown": what drives these numbers, and what would raise them?');
    expect(content[1].text).toMatch(/^\[Attached data: Team damage breakdown\]\n```json\n\{"total":9466750/);
    const entries = conversationModule.transcriptOf(a.conversation.value!.messages);
    expect(entries[0]).toMatchObject({ kind: "user", attachments: [{ title: "Team damage breakdown" }] });
  });

  it("without a key: opens the onboarding and keeps the question (and its data) in the composer", async () => {
    const fake = install([]);
    const a = useAssistant();
    a.explain({ title: "Echo", data: { cv: 210 }, question: "Is this echo worth keeping?" });
    await settle();
    expect(fake.calls).toHaveLength(0);
    expect(a.state.open).toBe(true);
    expect(a.state.draft).toBe("Is this echo worth keeping?");
    expect(a.state.draftAttachment).toEqual({ title: "Echo", json: '{"cv":210}' });
    expect(a.state.draftFeature).toBe("explain");

    // the key arrives; Send asks with the attachment
    useAiSettings().setApiKey(KEY);
    install([{ content: [text("Yes.")], stop_reason: "end_turn" }]);
    a.submitDraft();
    await settle();
    expect(a.state.draft).toBe("");
    expect(a.state.draftAttachment).toBeNull();
    expect(conversationModule.transcriptOf(a.conversation.value!.messages)[0]).toMatchObject({ text: "Is this echo worth keeping?", attachments: [{ title: "Echo" }] });
  });

  it("stop: aborts the stream, keeps nothing and gives the question back", async () => {
    useAiSettings().setApiKey(KEY);
    install([{ content: [], stop_reason: "end_turn", waitForAbort: true }]);
    const a = useAssistant();
    a.ask("What should I invest in next?");
    await until(() => !!a.state.live);
    await new Promise((r) => setTimeout(r, 20));
    a.stop();
    await settle();
    expect(a.state.notice).toEqual({ kind: "stopped", canContinue: false });
    expect(a.state.draft).toBe("What should I invest in next?");
    expect(a.conversation.value?.messages ?? []).toHaveLength(0);
  });

  it("asks before going past the budget, and stops there when the player says no", async () => {
    useAiSettings().setApiKey(KEY);
    useAiSettings().update({ budgetUsd: 0.05 });
    install([
      { content: [toolUse("get_account_summary", {}, "toolu_b1")], stop_reason: "tool_use", usage: { input_tokens: 20000, output_tokens: 2000 } },
      { content: [text("never sent")], stop_reason: "end_turn" },
    ]);
    const a = useAssistant();
    a.ask("Review my whole account");
    await until(() => !!a.state.confirm);
    expect(a.state.confirm?.request).toMatchObject({ kind: "budget", limitUsd: 0.05 });
    a.answerConfirm(false);
    await settle();
    expect(a.state.confirm).toBeNull();
    expect(a.state.notice).toEqual({ kind: "budget", canContinue: true });
    // the tool round was kept; Continue picks the question up again
    install([{ content: [text("Here's the review.")], stop_reason: "end_turn" }]);
    a.continueAnswer();
    await until(() => !!a.state.confirm);
    a.answerConfirm(true);
    await settle();
    expect(a.state.notice).toBeNull();
    expect(conversationModule.transcriptOf(a.conversation.value!.messages).slice(-1)[0]).toMatchObject({ kind: "assistant", text: "Here's the review." });
  });

  it("keeps a second question in the composer while an answer is running; new chat clears the tab's chat", async () => {
    useAiSettings().setApiKey(KEY);
    install([{ content: [text("First.")], stop_reason: "end_turn" }]);
    const a = useAssistant();
    a.ask("First question");
    a.ask("Second question");
    expect(a.state.draft).toBe("Second question");
    await settle();
    expect(conversationModule.transcriptOf(a.conversation.value!.messages).filter((e) => e.kind === "user")).toHaveLength(1);
    a.newChat();
    expect(a.conversation.value).toBeNull();
    expect(sessionStorage.getItem(AI_CHAT_STORAGE)).toBeNull();
  });

  it("new chat while an answer runs: the stopped answer doesn't bring the old chat back", async () => {
    useAiSettings().setApiKey(KEY);
    install([
      { content: [text("A1")], stop_reason: "end_turn" },
      { content: [], stop_reason: "end_turn", waitForAbort: true },
    ]);
    const a = useAssistant();
    a.ask("Q1");
    await settle();
    a.ask("Q2");
    await until(() => !!a.state.live);
    await new Promise((r) => setTimeout(r, 20));
    a.newChat();
    await settle();
    expect(a.state.busy).toBe(false);
    expect(a.conversation.value).toBeNull();
    expect(sessionStorage.getItem(AI_CHAT_STORAGE)).toBeNull();
    expect(a.state.notice).toBeNull();
    expect(a.state.draft).toBe("");
    expect(a.hasChat.value).toBe(false);
  });

  it("a runtime chunk that fails to load reads as a connection problem, not an Anthropic error", async () => {
    useAiSettings().setApiKey(KEY);
    const runtime = {
      ...conversationModule,
      exportFromStores: () => exp,
      createAnthropicClient: async () => {
        throw new TypeError("Failed to fetch dynamically imported module: /assets/sdk-abc.js");
      },
      toolRunner: () => runTool,
      describeError,
    };
    setAssistantRuntimeLoader(async () => runtime as unknown as typeof import("./assistantRuntime"));
    const a = useAssistant();
    a.ask("Anything");
    await settle();
    expect(a.state.notice).toMatchObject({ kind: "error", error: { kind: "connection", retryable: true } });
  });

  it("an API error leaves a retryable notice; retry re-asks the same question", async () => {
    useAiSettings().setApiKey(KEY);
    const overloaded = new sdk.InternalServerError(529, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, "Overloaded", new Headers());
    install([{ content: [], stop_reason: "end_turn", throwError: overloaded }]);
    const a = useAssistant();
    a.ask("Who should I pull for?");
    await settle();
    expect(a.state.notice).toMatchObject({ kind: "error", error: { kind: "overloaded", retryable: true } });
    expect(a.state.draft).toBe("Who should I pull for?");
    install([{ content: [text("Pull for a support.")], stop_reason: "end_turn" }]);
    a.retry();
    await settle();
    expect(a.state.notice).toBeNull();
    expect(a.state.draft).toBe("");
    expect(conversationModule.transcriptOf(a.conversation.value!.messages).map((e) => e.text)).toEqual(["Who should I pull for?", "Pull for a support."]);
  });

  it("edit: rewinds the chat to before a question and puts its text back", async () => {
    useAiSettings().setApiKey(KEY);
    install([
      { content: [text("A1")], stop_reason: "end_turn" },
      { content: [text("A2")], stop_reason: "end_turn" },
    ]);
    const a = useAssistant();
    a.ask("Q1");
    await settle();
    a.ask("Q2");
    await settle();
    const q2 = conversationModule.transcriptOf(a.conversation.value!.messages).find((e) => e.kind === "user" && e.text === "Q2")!;
    await a.editQuestion(q2.index, "Q2");
    expect(conversationModule.transcriptOf(a.conversation.value!.messages).map((e) => e.text)).toEqual(["Q1", "A1"]);
    expect(a.state.draft).toBe("Q2");
  });
});
