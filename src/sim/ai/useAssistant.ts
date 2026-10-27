// Wuthering Tools+ AI — the assistant's state and public API. Light on purpose: PlusShell (main bundle) and any
// feature's "Explain" button import this; everything heavy (the conversation + agent loop + tool registry + the
// engine, the SDK) loads behind one dynamic import of `assistantRuntime.ts` the first time a question is asked.
//
// Public API — `useAssistant()`:
//   open() / close() / toggle()                      the panel
//   ask(question, { context?, title? })              send a question (with optional data attached as JSON)
//   explain({ title, data, question? })              "Explain these numbers": the data as a fenced JSON
//                                                    attachment, at the Explain effort (low by default)
// Without a key, ask/explain open the panel's onboarding and keep the question (and its data) in the composer.
//
// State is module-level (one assistant per tab, like the conversation in sessionStorage); the panel renders it.
/* eslint-disable no-unused-vars -- parameter names in function types; vue-tsc (noUnusedParameters) guards real unused code */
import { computed, reactive, shallowRef } from "vue";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { AgentStatus, AgentTurnResult, ConfirmRequest } from "./agentLoop";
import type { AiError } from "./client";
import type { PageContext } from "./prompt";
import { attachmentJson, attachmentText, cleanTitle, type AttachmentInfo } from "./attachments";
import { useAiSettings, type AiFeature } from "./aiSettings";
import { AI_CHAT_STORAGE, canContinue, clearConversation, loadConversation, saveConversation, type Conversation } from "./conversationStore";
import { sumUsage, type UsageTotals } from "./pricing";
import type { ToolStatus } from "./ui/toolSummary";

type Runtime = typeof import("./assistantRuntime");

let runtimeLoader: () => Promise<Runtime> = () => import("./assistantRuntime");

/** Test hook: replace the heavy runtime (a fake client, in-memory storage). */
export function setAssistantRuntimeLoader(loader: (() => Promise<Runtime>) | null): void {
  runtimeLoader = loader ?? (() => import("./assistantRuntime"));
}

// ── state ─────────────────────────────────────────────────────────────────────────────────────

export interface LiveTool {
  id: string;
  name: string;
  input: unknown;
  status: ToolStatus;
  /** the tool_result content once it arrived */
  result: string | null;
  ms: number | null;
}

/** The answer being written right now (before the loop commits it to the conversation). */
export interface LiveAnswer {
  text: string;
  tools: LiveTool[];
  thinking: boolean;
  retrying: "invalid_json" | "max_tokens" | null;
  startedAt: number;
}

export interface PendingQuestion {
  text: string;
  attachments: AttachmentInfo[];
}

export interface DraftAttachment {
  title: string;
  json: string;
}

export type AssistantNotice =
  | { kind: "error"; error: AiError; canContinue: boolean }
  | { kind: "refusal"; message: string }
  | { kind: "stopped"; canContinue: boolean }
  | { kind: "budget"; canContinue: boolean }
  | { kind: "max_tokens" }
  | { kind: "context_full" }
  | { kind: "tool_limit" };

export interface PendingConfirm {
  request: ConfirmRequest;
  resolve(ok: boolean): void;
}

/** What the panel needs to know about the page (PlusShell registers the provider). */
export interface PageInfo {
  path: string;
  title?: string | null;
  activeCharacterKey?: string | null;
  activeCharacterName?: string | null;
  openTeam?: string | null;
}

interface QueuedAsk {
  content: string | BetaContentBlockParam[];
  display: PendingQuestion;
  feature: AiFeature;
}

const state = reactive({
  open: false,
  /** desktop: the panel shrunk to a tab on the right edge */
  collapsed: false,
  settingsOpen: false,
  paletteOpen: false,
  busy: false,
  pending: null as PendingQuestion | null,
  live: null as LiveAnswer | null,
  /** this turn's running usage (added to the conversation's when it commits) */
  turnUsage: null as UsageTotals | null,
  notice: null as AssistantNotice | null,
  confirm: null as PendingConfirm | null,
  draft: "",
  draftAttachment: null as DraftAttachment | null,
  draftFeature: "chat" as AiFeature,
  /** bumped to ask the composer to take focus */
  focusTick: 0,
});
/** the conversation: big and append-only, so not deeply reactive */
const conversation = shallowRef<Conversation | null>(null);
let conversationLoaded = false;
/** tool timings by tool_use id (not persisted; the transcript shows them when known) */
const toolMs = new Map<string, number>();
let controller: AbortController | null = null;
let lastAsk: QueuedAsk | null = null;
/** bumped by "new chat": an answer still finishing after it belongs to the old chat and must not bring it back */
let chatGeneration = 0;
let pageProvider: () => PageInfo = () => ({ path: typeof location === "undefined" ? "/" : location.pathname });

function storedChatExists(): boolean {
  try {
    return Boolean(sessionStorage.getItem(AI_CHAT_STORAGE));
  } catch {
    return false;
  }
}

function ensureConversationLoaded(): void {
  if (conversationLoaded) return;
  conversationLoaded = true;
  conversation.value = loadConversation();
}

/** PlusShell tells the assistant where the player is (route, active character, open team). */
export function setAssistantPageProvider(provider: () => PageInfo): void {
  pageProvider = provider;
}

export function currentPage(): PageInfo {
  return pageProvider();
}

const totalCost = computed(() => {
  const conv = conversation.value?.usage ?? null;
  const turn = state.busy ? state.turnUsage : null;
  if (conv && turn) return sumUsage(conv, turn);
  return conv ?? turn ?? null;
});

// ── asking ────────────────────────────────────────────────────────────────────────────────────

function userContent(question: string, attachment: DraftAttachment | null): string | BetaContentBlockParam[] {
  if (!attachment) return question;
  return [
    { type: "text", text: question },
    { type: "text", text: attachmentText(attachment.title, attachment.json) },
  ];
}

const display = (question: string, attachment: DraftAttachment | null): PendingQuestion => ({
  text: question,
  attachments: attachment ? [{ title: cleanTitle(attachment.title), chars: attachment.json.length }] : [],
});

function pageContextOf(page: PageInfo): PageContext {
  const route = page.path.split("?")[0] || "/";
  return {
    route,
    title: page.title ?? null,
    activeCharacter: page.activeCharacterKey ?? null,
    openTeam: page.openTeam ?? null,
  };
}

function noticeOf(status: AgentStatus, result: AgentTurnResult, conv: Conversation): AssistantNotice | null {
  const more = canContinue(conv);
  switch (status) {
    case "done":
      return null;
    case "aborted":
      return { kind: "stopped", canContinue: more };
    case "refusal":
      return { kind: "refusal", message: result.refusal?.message ?? "Claude declined to answer that one." };
    case "budget":
      return { kind: "budget", canContinue: more };
    case "max_tokens":
      return { kind: "max_tokens" };
    case "context_full":
      return { kind: "context_full" };
    case "tool_limit":
      return { kind: "tool_limit" };
    case "error":
      return result.error ? { kind: "error", error: result.error, canContinue: more } : null;
  }
}

/** Runs one question (or a continuation when `job` is null) through the runtime, streaming into `state.live`. */
async function run(job: QueuedAsk | null): Promise<void> {
  const settings = useAiSettings();
  const apiKey = settings.getApiKey();
  if (!apiKey) {
    if (job) parkInDraft(job);
    state.open = true;
    return;
  }
  ensureConversationLoaded();
  state.busy = true;
  state.notice = null;
  state.pending = job ? job.display : null;
  state.turnUsage = null;
  const live: LiveAnswer = reactive({ text: "", tools: [], thinking: false, retrying: null, startedAt: Date.now() });
  state.live = live;
  controller = new AbortController();
  const signal = controller.signal;
  let responseStart = 0;
  let breakBeforeText = false;
  const started = new Map<string, number>();
  const generation = chatGeneration;
  let loading = true; // the runtime and the SDK chunk are still loading (a failure there is the connection's)

  try {
    const rt = await runtimeLoader();
    const page = currentPage();
    const exp = rt.exportFromStores();
    const conv = conversation.value ?? rt.newConversation({ model: settings.settings.value.model, exp, budgetUsd: settings.settings.value.budgetUsd });
    const { client, sdk } = await rt.createAnthropicClient({ apiKey });
    if (signal.aborted) throw Object.assign(new Error("Stopped."), { name: "AbortError" });
    const options = {
      client,
      sdk,
      effort: settings.effortFor(job?.feature ?? "chat"),
      exp: () => rt.exportFromStores(),
      page: pageContextOf(page),
      signal,
      runTool: rt.toolRunner(),
      confirm: (request: ConfirmRequest) =>
        new Promise<boolean>((resolve) => {
          state.confirm = {
            request,
            resolve: (ok) => {
              state.confirm = null;
              resolve(ok);
            },
          };
        }),
      callbacks: {
        onText(delta: string) {
          live.thinking = false;
          live.retrying = null;
          if (breakBeforeText && live.text) live.text += "\n\n";
          breakBeforeText = false;
          live.text += delta;
        },
        onThinkingStart() {
          if (!live.text) live.thinking = true;
        },
        onToolCall(name: string, id: string) {
          live.thinking = false;
          if (!live.tools.some((t) => t.id === id)) live.tools.push({ id, name, input: null, status: "preparing", result: null, ms: null });
        },
        onToolStart(name: string, input: unknown, id: string) {
          started.set(id, Date.now());
          const tool = live.tools.find((t) => t.id === id);
          if (tool) Object.assign(tool, { input, status: "running" as const });
          else live.tools.push({ id, name, input, status: "running", result: null, ms: null });
        },
        onToolEnd(_name: string, ok: boolean, _preview: string, id: string, result: { content: string; ms: number }) {
          const tool = live.tools.find((t) => t.id === id);
          const ms = result.ms || Date.now() - (started.get(id) ?? Date.now());
          toolMs.set(id, ms);
          if (tool) Object.assign(tool, { status: ok ? ("ok" as const) : ("error" as const), result: result.content, ms });
          if (live.tools.every((t) => t.status === "ok" || t.status === "error")) {
            responseStart = live.text.length;
            breakBeforeText = true;
            live.thinking = true; // the next request is on its way
          }
        },
        onUsage(turn: UsageTotals) {
          state.turnUsage = turn;
        },
        onRetry(reason: "invalid_json" | "max_tokens") {
          // the response is discarded and re-sent: drop what it streamed
          live.text = live.text.slice(0, responseStart);
          live.tools = live.tools.filter((t) => t.status !== "preparing");
          live.retrying = reason;
        },
      },
    };
    loading = false;
    const out = job ? await rt.askInConversation(conv, job.content, options) : await rt.continueConversation(conv, options);
    if (generation !== chatGeneration) return; // "new chat" while this answer ran: it belongs to the chat that was cleared
    conversation.value = out.conversation;
    rt.saveConversation(out.conversation);
    state.notice = noticeOf(out.result.status, out.result, out.conversation);
    if (job && !out.result.messages.length && job.feature === "chat" && typeof job.content === "string" && !state.draft.trim()) {
      // nothing was kept (stopped / refused / failed before Claude answered): the question goes back in the box
      state.draft = job.display.text;
      state.focusTick += 1;
    }
  } catch (error) {
    if (generation !== chatGeneration) return;
    const rt = await runtimeLoader().catch(() => null);
    const loadFailed: AiError = { kind: "connection", message: "Couldn't load the assistant. Check your connection and try again.", retryable: true, status: null, requestId: null, detail: null };
    let described: AiError = rt ? rt.describeError(error, null) : loadFailed;
    if (loading && described.kind === "unknown") described = { ...loadFailed, detail: described.detail }; // a chunk that didn't load
    state.notice = described.kind === "aborted" ? { kind: "stopped", canContinue: false } : { kind: "error", error: described, canContinue: false };
    if (job && described.kind === "aborted" && typeof job.content === "string" && !state.draft.trim()) state.draft = job.display.text;
  } finally {
    state.busy = false;
    state.live = null;
    state.pending = null;
    state.turnUsage = null;
    if (state.confirm) state.confirm.resolve(false);
    controller = null;
  }
}

function parkInDraft(job: QueuedAsk): void {
  state.draft = job.display.text;
  state.draftFeature = job.feature;
  if (Array.isArray(job.content) && job.content[1]?.type === "text") {
    const att = job.display.attachments[0];
    const m = /```json\n([\s\S]*)\n```$/.exec(job.content[1].text);
    state.draftAttachment = att && m ? { title: att.title, json: m[1] } : null;
  }
  state.focusTick += 1;
}

function send(job: QueuedAsk): void {
  if (state.busy) {
    // one answer at a time: keep the new question (and its data) in the composer
    parkInDraft(job);
    state.open = true;
    return;
  }
  lastAsk = job;
  state.open = true;
  state.collapsed = false;
  void run(job);
}

// ── public API ───────────────────────────────────────────────────────────────────────────────

export interface AskOptions {
  /** data to attach (sent as a fenced JSON block in the same user turn) */
  context?: unknown;
  /** what the data is ("Team damage breakdown"), shown as a chip */
  title?: string;
}

export interface ExplainOptions {
  title: string;
  data: unknown;
  question?: string;
}

function open(): void {
  ensureConversationLoaded();
  state.open = true;
  state.collapsed = false;
  state.focusTick += 1;
}

function close(): void {
  state.open = false;
}

function toggle(): void {
  if (state.open && !state.collapsed) close();
  else open();
}

function ask(question: string, options: AskOptions = {}): void {
  const q = question.trim();
  if (!q) return open();
  const attachment = options.context === undefined ? null : { title: cleanTitle(options.title ?? "Data"), json: attachmentJson(options.context) };
  send({ content: userContent(q, attachment), display: display(q, attachment), feature: "chat" });
}

function explain(options: ExplainOptions): void {
  const title = cleanTitle(options.title);
  const question = options.question?.trim() || `Explain "${title}": what drives these numbers, and what would raise them?`;
  const attachment = { title, json: attachmentJson(options.data) };
  send({ content: userContent(question, attachment), display: display(question, attachment), feature: "explain" });
}

/** The composer's Send. */
function submitDraft(): void {
  const q = state.draft.trim();
  if (!q || state.busy) return;
  const attachment = state.draftAttachment;
  const feature = state.draftFeature;
  if (!useAiSettings().getApiKey()) {
    state.open = true;
    return;
  }
  state.draft = "";
  state.draftAttachment = null;
  state.draftFeature = "chat";
  send({ content: userContent(q, attachment), display: display(q, attachment), feature });
}

function stop(): void {
  if (state.confirm) state.confirm.resolve(false);
  controller?.abort();
}

/** Re-send the last question (an error before anything was kept), or continue an answer that was left open. */
function retry(): void {
  if (state.busy) return;
  const conv = conversation.value;
  if (conv && canContinue(conv)) {
    void run(null);
    return;
  }
  if (lastAsk) {
    if (state.draft.trim() === lastAsk.display.text) state.draft = "";
    send(lastAsk);
  }
}

function continueAnswer(): void {
  if (state.busy || !conversation.value || !canContinue(conversation.value)) return;
  void run(null);
}

function newChat(): void {
  chatGeneration += 1;
  if (state.busy) stop();
  clearConversation();
  conversation.value = null;
  conversationLoaded = true;
  state.notice = null;
  lastAsk = null;
  toolMs.clear();
  state.focusTick += 1;
}

/** "Edit" a question: the conversation goes back to before it (append-only history) and its text returns to the box. */
async function editQuestion(messageIndex: number, text: string): Promise<void> {
  const conv = conversation.value;
  if (state.busy || !conv) return;
  const rt = await runtimeLoader();
  const next = rt.truncateBefore(conv, messageIndex);
  conversation.value = next;
  saveConversation(next);
  state.notice = null;
  state.draft = text;
  state.focusTick += 1;
}

function answerConfirm(ok: boolean): void {
  state.confirm?.resolve(ok);
}

function openSettings(): void {
  state.settingsOpen = true;
}

function closeSettings(): void {
  state.settingsOpen = false;
}

function setPaletteOpen(open: boolean): void {
  state.paletteOpen = open;
}

function clearDraftAttachment(): void {
  state.draftAttachment = null;
  state.draftFeature = "chat";
}

export function useAssistant() {
  return {
    state,
    conversation,
    totalCost,
    toolMs,
    open,
    close,
    toggle,
    ask,
    explain,
    submitDraft,
    stop,
    retry,
    continueAnswer,
    newChat,
    editQuestion,
    answerConfirm,
    openSettings,
    closeSettings,
    setPaletteOpen,
    clearDraftAttachment,
    currentPage,
    /** a conversation with at least one question exists (before the chat is loaded: one is stored for this tab) */
    hasChat: computed(() => (conversationLoaded || conversation.value ? Boolean(conversation.value?.messages.length) : storedChatExists())),
  };
}

/** Test hook: back to a fresh assistant. */
export function resetAssistantState(): void {
  controller?.abort();
  Object.assign(state, {
    open: false,
    collapsed: false,
    settingsOpen: false,
    paletteOpen: false,
    busy: false,
    pending: null,
    live: null,
    turnUsage: null,
    notice: null,
    confirm: null,
    draft: "",
    draftAttachment: null,
    draftFeature: "chat",
    focusTick: 0,
  });
  conversation.value = null;
  conversationLoaded = false;
  lastAsk = null;
  chatGeneration += 1;
  toolMs.clear();
}
