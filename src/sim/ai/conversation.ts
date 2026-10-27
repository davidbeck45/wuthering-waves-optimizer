// Wuthering Tools+ AI — the conversation: its messages (append-only), the account snapshot frozen into its
// system prompt, the model it started on, its running cost and soft budget. The shape, persistence (sessionStorage
// `wtplus:ai:chat`) and the transcript live in the light `conversationStore.ts`, re-exported here.
//
// `askInConversation` is the one call the drawer (and the CLI's `ask`) makes per question: it builds the
// per-turn system message (page context, a note when the account changed since the snapshot), runs the agent
// loop and appends what the loop committed.
import type { BetaContentBlockParam, BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { ExportFile } from "../cli/exportShape";
import { runAgentTurn, type AgentCallbacks, type AgentTurnResult, type ClientLike, type ConfirmRequest, type ToolRunner } from "./agentLoop";
import { DEFAULT_BUDGET_USD } from "./aiSettings";
import type { AnthropicSdk } from "./client";
import type { AiEffort, AiModel } from "./models";
import { emptyUsage, sumUsage } from "./pricing";
import { accountChangedText, accountSnapshot, pageContextText, snapshotKey, systemBlocks, systemMessage, type PageContext } from "./prompt";
import type { ToolContext } from "./tools/shared";

import { blocksOf, CONVERSATION_VERSION, type Conversation } from "./conversationStore";

export * from "./conversationStore";

const randomId = (): string => Math.random().toString(36).slice(2, 10);

export function newConversation(options: { model: AiModel; exp: ExportFile; budgetUsd?: number; now?: Date; id?: string }): Conversation {
  const snapshot = accountSnapshot(options.exp);
  return {
    version: CONVERSATION_VERSION,
    id: options.id ?? randomId(),
    model: options.model,
    startedAt: (options.now ?? new Date()).toISOString(),
    snapshot,
    accountKey: snapshotKey(snapshot),
    pageContext: null,
    messages: [],
    usage: emptyUsage(),
    budgetUsd: options.budgetUsd ?? DEFAULT_BUDGET_USD,
    budgetStepUsd: options.budgetUsd ?? DEFAULT_BUDGET_USD,
  };
}

/** The system message(s) for this turn: the page the player is on (when it changed) and a note when the account no
 *  longer matches what Claude was last told. Placed right after the question. */
export function turnContext(conversation: Conversation, exp: ExportFile | null, page: PageContext | null): { message: BetaMessageParam | null; pageContext: string | null; accountKey: string } {
  const parts: string[] = [];
  let pageContext = conversation.pageContext;
  let accountKey = conversation.accountKey;
  if (page) {
    const text = pageContextText(page);
    if (text !== conversation.pageContext) {
      parts.push(text);
      pageContext = text;
    }
  }
  if (exp) {
    const current = accountSnapshot(exp);
    const key = snapshotKey(current);
    if (key !== conversation.accountKey) {
      parts.push(accountChangedText(current));
      accountKey = key;
    }
  }
  return { message: parts.length ? systemMessage(parts.join("\n\n")) : null, pageContext, accountKey };
}

export interface AskOptions {
  client: ClientLike;
  sdk?: AnthropicSdk | null;
  effort: AiEffort;
  /** the account the tools read (live stores in the app, the export file on the CLI) */
  exp: ExportFile | (() => ExportFile);
  page?: PageContext | null;
  autoBuffs?: boolean;
  signal?: AbortSignal;
  runTool?: ToolRunner;
  maxToolRounds?: number;
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  confirm?: (request: ConfirmRequest) => Promise<boolean>;
  callbacks?: AgentCallbacks;
  now?: () => Date;
}

function toolContext(options: AskOptions): () => ToolContext {
  return () => ({ exp: typeof options.exp === "function" ? options.exp() : options.exp, now: options.now?.() ?? new Date(), autoBuffs: options.autoBuffs });
}

function applyResult(conversation: Conversation, result: AgentTurnResult, committedContext: { pageContext: string | null; accountKey: string } | null): Conversation {
  const committed = result.messages.length > 0;
  return {
    ...conversation,
    messages: committed ? [...conversation.messages, ...result.messages] : conversation.messages,
    pageContext: committed && committedContext ? committedContext.pageContext : conversation.pageContext,
    accountKey: committed && committedContext ? committedContext.accountKey : conversation.accountKey,
    usage: sumUsage(conversation.usage, result.usage),
    budgetUsd: result.budgetLimitUsd ?? conversation.budgetUsd,
  };
}

/** Ask one question. Returns the updated conversation (a new object) and the loop's result. When nothing was
 *  committed (`result.messages` empty: aborted, refused, failed), the conversation keeps its messages — put the
 *  question back in the input box. */
export async function askInConversation(conversation: Conversation, question: string | BetaContentBlockParam[], options: AskOptions): Promise<{ conversation: Conversation; result: AgentTurnResult }> {
  const exp = typeof options.exp === "function" ? options.exp() : options.exp;
  const context = turnContext(conversation, exp, options.page ?? null);
  const newMessages: BetaMessageParam[] = [{ role: "user", content: question }];
  if (context.message) newMessages.push(context.message);
  const result = await runAgentTurn({
    client: options.client,
    sdk: options.sdk,
    model: conversation.model,
    effort: options.effort,
    system: systemBlocks(conversation.snapshot),
    history: conversation.messages,
    newMessages,
    ctx: toolContext(options),
    runTool: options.runTool,
    maxToolRounds: options.maxToolRounds,
    signal: options.signal,
    budget: { limitUsd: conversation.budgetUsd, spentUsd: conversation.usage.costUsd, stepUsd: conversation.budgetStepUsd },
    confirm: options.confirm,
    callbacks: options.callbacks,
  });
  return { conversation: applyResult(conversation, result, context), result };
}

/** Resume after a stop that left a question unanswered (the budget prompt declined, then accepted later; a tool
 *  round limit). Valid only when the conversation ends with a user turn. */
export async function continueConversation(conversation: Conversation, options: AskOptions): Promise<{ conversation: Conversation; result: AgentTurnResult }> {
  const result = await runAgentTurn({
    client: options.client,
    sdk: options.sdk,
    model: conversation.model,
    effort: options.effort,
    system: systemBlocks(conversation.snapshot),
    history: conversation.messages,
    ctx: toolContext(options),
    runTool: options.runTool,
    maxToolRounds: options.maxToolRounds,
    signal: options.signal,
    budget: { limitUsd: conversation.budgetUsd, spentUsd: conversation.usage.costUsd, stepUsd: conversation.budgetStepUsd },
    confirm: options.confirm,
    callbacks: options.callbacks,
  });
  return { conversation: applyResult(conversation, result, null), result };
}

/** "Edit" a question: keep everything before the user message at `messageIndex` (append-only history means the
 *  old question and everything after it go; the edited text is then asked anew). */
export function truncateBefore(conversation: Conversation, messageIndex: number): Conversation {
  const target = conversation.messages[messageIndex];
  const isQuestion = !!target && target.role === "user" && blocksOf(target.content).some((b) => b.type === "text" || b.type === "image");
  if (!isQuestion) throw new Error("Can only rewind to a question");
  // the page / account notes sent with the dropped turns go too: both are re-sent with the next question
  return { ...conversation, messages: conversation.messages.slice(0, messageIndex), pageContext: null, accountKey: snapshotKey(conversation.snapshot) };
}
