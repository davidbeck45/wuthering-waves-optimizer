// Wuthering Tools+ AI — the agent loop: one answer = stream a response, run the tools it asks for (in parallel),
// send every result back in one user message, repeat until Claude answers. A manual loop (not the SDK's tool
// runner) because the app needs what the runner doesn't give: a tool-round cap that asks the player, a soft
// budget, refusal / max_tokens / pause_turn handling, abort, and append-only history.
//
// Rules (Claude API, Opus 5.5 era):
//   * history is append-only — every assistant turn goes back unchanged (thinking blocks included); an edit
//     means truncating before the question and asking anew (conversation.ts). Nothing here rewrites history.
//   * `thinking` is omitted (Opus 5.5 always thinks); depth is `output_config.effort`.
//   * tools carry `strict: true` + `eager_input_streaming: true`; every parsed input is validated before it
//     runs (tools/index.ts runTool) — a failure is an is_error tool_result, never a crash.
//   * stop_reason: tool_use → run tools; end_turn → done; pause_turn → append and continue; max_tokens → never
//     run a truncated tool input (retry once with more room); refusal → stop, show a polite line.
//   * the result's `messages` are exactly what to append to the conversation: [] when nothing was committed
//     (aborted / refused / failed before Claude's first complete turn), so the caller can restore the question.
/* eslint-disable no-unused-vars -- parameter names in the callback / client function types; vue-tsc (noUnusedLocals, noUnusedParameters) guards real unused code */
import type {
  BetaContentBlock,
  BetaMessage,
  BetaMessageContentParam,
  BetaMessageParam,
  BetaMessageStreamParams,
  BetaRawMessageStreamEvent,
  BetaTextBlockParam,
  BetaTool,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { describeError, fallbackFields, loadAnthropicSdk, refusalMessage, type AiError, type AnthropicSdk } from "./client";
import type { AiEffort, AiModel } from "./models";
import { addUsage, emptyUsage, type UsageLike, type UsageTotals } from "./pricing";
import { runTool as runToolInThread, toolDefinitions, type ToolRunResult } from "./tools/index";
import type { ToolContext } from "./tools/shared";

/** What the loop needs from a stream (the SDK's BetaMessageStream fits; tests pass a fake). */
export interface StreamLike extends AsyncIterable<BetaRawMessageStreamEvent> {
  finalMessage(): Promise<BetaMessage>;
  abort(): void;
}

/** What the loop needs from a client (the SDK's Anthropic client fits). */
export interface ClientLike {
  beta: { messages: { stream(params: BetaMessageStreamParams, options?: { signal?: AbortSignal }): StreamLike } };
}

export type ToolRunner = (name: string, input: unknown, ctx: ToolContext) => Promise<ToolRunResult>;

export type ConfirmRequest = { kind: "budget"; spentUsd: number; limitUsd: number } | { kind: "tool_limit"; rounds: number };

export interface AgentCallbacks {
  onText?(delta: string): void;
  /** the model started thinking in this request (Opus 5.5 thinking text is empty by default: show "thinking…") */
  onThinkingStart?(): void;
  /** a tool_use block started streaming (input not complete yet) */
  onToolCall?(name: string, id: string): void;
  onToolStart?(name: string, input: unknown, id: string): void;
  onToolEnd?(name: string, ok: boolean, preview: string, id: string, result: ToolRunResult): void;
  /** after every response: this turn's running totals and the response's own usage */
  onUsage?(turn: UsageTotals, last: UsageLike): void;
  /** a request is being re-sent (unparseable tool JSON, truncated tool input) */
  onRetry?(reason: "invalid_json" | "max_tokens"): void;
  onDone?(result: AgentTurnResult): void;
  onError?(error: AiError): void;
}

export interface AgentTurnOptions {
  client: ClientLike;
  /** the SDK module, for typed error mapping (loaded lazily when omitted) */
  sdk?: AnthropicSdk | null;
  model: AiModel;
  effort: AiEffort;
  system: BetaTextBlockParam[];
  /** the conversation so far; never mutated */
  history: readonly BetaMessageParam[];
  /** appended before the first request (the user's question, then the per-turn system message) */
  newMessages?: readonly BetaMessageParam[];
  /** the tools' context; a function is called before each tool round (fresh live data) */
  ctx: ToolContext | (() => ToolContext);
  /** default: run in this thread (tools/index.ts); a Web Worker runner can be injected */
  runTool?: ToolRunner;
  /** default: the full registry, strict + eager */
  tools?: BetaTool[];
  /** tool rounds per answer before the player is asked (default 6) */
  maxToolRounds?: number;
  /** default 32000; one retry doubles it (cap 64000) when a tool input was cut off */
  maxTokens?: number;
  signal?: AbortSignal;
  /** the conversation's soft budget: past `limitUsd` the player is asked before the next request */
  budget?: { limitUsd: number; spentUsd: number; stepUsd?: number };
  confirm?: (request: ConfirmRequest) => Promise<boolean>;
  callbacks?: AgentCallbacks;
}

export type AgentStatus = "done" | "aborted" | "refusal" | "max_tokens" | "tool_limit" | "budget" | "context_full" | "error";

export interface AgentTurnResult {
  status: AgentStatus;
  /** what to append to the conversation, in order ([] when nothing was committed) */
  messages: BetaMessageParam[];
  /** the text Claude wrote this turn (every committed text block, in order) */
  text: string;
  /** this turn's usage and cost (discarded responses included — they were billed) */
  usage: UsageTotals;
  /** the soft limit after this turn (raised when the player agreed to go over) */
  budgetLimitUsd: number | null;
  /** tool rounds run */
  rounds: number;
  refusal?: { category: string | null; message: string };
  error?: AiError;
}

export const DEFAULT_MAX_TOOL_ROUNDS = 6;
export const DEFAULT_MAX_TOKENS = 32000;
const MAX_TOKENS_CAP = 64000;
const MAX_JSON_RETRIES = 2;

/** A plain deep copy: drops the SDK's non-enumerable stream buffers and getters, keeps every field the API sent. */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const textOf = (content: readonly BetaContentBlock[]): string =>
  content
    .filter((b): b is Extract<BetaContentBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");

/** The SDK raises a bare AnthropicError (not an APIError) when a streamed tool input is not parseable JSON. */
function isStreamParseError(error: unknown, sdk: AnthropicSdk | null): boolean {
  if (!sdk) return false;
  return error instanceof sdk.AnthropicError && !(error instanceof sdk.APIError);
}

export const TOOL_LIMIT_MESSAGE = (rounds: number): string =>
  `Not run: this answer has used its ${rounds} tool rounds and the player chose to stop here. Answer from the results you already have, ` +
  "say what is still unknown, and mention they can ask you to continue.";

export async function runAgentTurn(options: AgentTurnOptions): Promise<AgentTurnResult> {
  const { client, model, effort, system, signal, callbacks: cb = {} } = options;
  const sdk = options.sdk !== undefined ? options.sdk : await loadAnthropicSdk().catch(() => null);
  const tools = options.tools ?? toolDefinitions({ eager: true });
  const run = options.runTool ?? runToolInThread;
  const maxRounds = options.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;
  const ctxNow = (): ToolContext => (typeof options.ctx === "function" ? options.ctx() : options.ctx);

  const working: BetaMessageParam[] = [...options.history, ...(options.newMessages ?? [])];
  const committed: BetaMessageParam[] = [...(options.newMessages ?? [])];
  let assistantCommitted = false;
  const texts: string[] = [];
  let usage = emptyUsage();
  let limit = options.budget ? options.budget.limitUsd : null;
  let rounds = 0;
  let jsonRetries = 0;
  let maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  let truncatedRetried = false;
  let toolsOff = false; // after the player declined more tool rounds: one last answer without tools
  let limited = false;

  const commit = (message: BetaMessageParam): void => {
    working.push(message);
    committed.push(message);
  };
  const commitAssistant = (message: BetaMessage): void => {
    commit({ role: "assistant", content: plain(message.content) as BetaMessageContentParam });
    assistantCommitted = true;
    const t = textOf(message.content);
    if (t) texts.push(t);
  };
  const finish = (status: AgentStatus, extra: Partial<AgentTurnResult> = {}): AgentTurnResult => {
    const result: AgentTurnResult = {
      status,
      messages: assistantCommitted ? committed : [],
      text: texts.join("\n\n"),
      usage,
      budgetLimitUsd: limit,
      rounds,
      ...extra,
    };
    if (result.error) cb.onError?.(result.error);
    cb.onDone?.(result);
    return result;
  };

  const last = working[working.length - 1];
  if (!last || last.role === "assistant") {
    return finish("error", { error: { kind: "bad_request", message: "Nothing to answer: the conversation doesn't end with a question.", retryable: false, status: null, requestId: null, detail: null } });
  }

  for (;;) {
    if (signal?.aborted) return finish("aborted");

    // the soft budget: ask before spending more
    if (options.budget && limit != null) {
      const spent = options.budget.spentUsd + usage.costUsd;
      if (spent >= limit) {
        const ok = options.confirm ? await options.confirm({ kind: "budget", spentUsd: spent, limitUsd: limit }) : false;
        if (!ok) return finish("budget");
        limit = spent + (options.budget.stepUsd ?? options.budget.limitUsd);
      }
      if (signal?.aborted) return finish("aborted");
    }

    const params: BetaMessageStreamParams = {
      model,
      max_tokens: maxTokens,
      system,
      tools,
      ...(toolsOff ? { tool_choice: { type: "none" as const } } : {}),
      messages: [...working], // a snapshot: `working` keeps growing after this request
      output_config: { effort },
      cache_control: { type: "ephemeral" },
      ...fallbackFields(model),
    };

    let message: BetaMessage;
    // what the stream has reported so far: a response cut short (Stop, a broken tool input) was still billed
    let partial: UsageLike | null = null;
    try {
      const stream = client.beta.messages.stream(params, signal ? { signal } : undefined);
      let thinkingSeen = false;
      for await (const event of stream) {
        if (event.type === "message_start") {
          partial = { ...event.message.usage };
        } else if (event.type === "message_delta" && event.usage) {
          const u = event.usage;
          partial = {
            ...(partial ?? {}),
            output_tokens: u.output_tokens,
            ...(u.input_tokens != null ? { input_tokens: u.input_tokens } : {}),
            ...(u.cache_read_input_tokens != null ? { cache_read_input_tokens: u.cache_read_input_tokens } : {}),
            ...(u.cache_creation_input_tokens != null ? { cache_creation_input_tokens: u.cache_creation_input_tokens } : {}),
          };
        } else if (event.type === "content_block_start") {
          const block = event.content_block;
          if ((block.type === "thinking" || block.type === "redacted_thinking") && !thinkingSeen) {
            thinkingSeen = true;
            cb.onThinkingStart?.();
          } else if (block.type === "tool_use") {
            cb.onToolCall?.(block.name, block.id);
          }
        } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          cb.onText?.(event.delta.text);
        }
      }
      message = await stream.finalMessage();
    } catch (error) {
      if (partial) {
        usage = addUsage(usage, model, partial);
        cb.onUsage?.(usage, partial);
      }
      if (signal?.aborted) return finish("aborted");
      if (isStreamParseError(error, sdk) && jsonRetries < MAX_JSON_RETRIES) {
        jsonRetries += 1;
        cb.onRetry?.("invalid_json");
        continue; // the broken turn was never appended; re-issue it
      }
      const described = describeError(error, sdk);
      if (described.kind === "aborted") return finish("aborted");
      return finish("error", { error: described });
    }
    jsonRetries = 0;
    usage = addUsage(usage, model, message.usage);
    cb.onUsage?.(usage, message.usage);

    const toolUses = message.content.filter((b): b is BetaToolUseBlock => b.type === "tool_use");
    const stop = message.stop_reason;

    if (stop === "refusal") {
      // a refusal can cut a tool_use off mid-input: never run that turn's tools, never keep the partial turn
      const details = message.stop_details;
      return finish("refusal", { refusal: { category: details?.category ?? null, message: refusalMessage(details) } });
    }
    if (stop === "max_tokens") {
      if (toolUses.length) {
        // a truncated tool input often still parses; never run it
        if (!truncatedRetried && maxTokens < MAX_TOKENS_CAP) {
          truncatedRetried = true;
          maxTokens = Math.min(MAX_TOKENS_CAP, maxTokens * 2);
          cb.onRetry?.("max_tokens");
          continue;
        }
        return finish("max_tokens");
      }
      commitAssistant(message); // a text answer cut off: keep what was written
      return finish("max_tokens");
    }
    if (stop === "pause_turn") {
      commitAssistant(message);
      continue;
    }
    if (stop === "model_context_window_exceeded") {
      if (!toolUses.length) commitAssistant(message);
      return finish("context_full");
    }
    if (stop !== "tool_use" || !toolUses.length) {
      commitAssistant(message);
      return finish(limited ? "tool_limit" : "done");
    }

    // tool_use: the round cap asks the player first
    if (rounds >= maxRounds) {
      const ok = options.confirm ? await options.confirm({ kind: "tool_limit", rounds }) : false;
      if (signal?.aborted) return finish("aborted");
      if (ok) {
        rounds = 0;
      } else {
        commitAssistant(message);
        commit({
          role: "user",
          content: toolUses.map((b): BetaToolResultBlockParam => ({ type: "tool_result", tool_use_id: b.id, is_error: true, content: TOOL_LIMIT_MESSAGE(rounds) })),
        });
        toolsOff = true;
        limited = true;
        continue;
      }
    }

    rounds += 1;
    const ctx = ctxNow();
    const results = await Promise.all(
      toolUses.map(async (block) => {
        cb.onToolStart?.(block.name, block.input, block.id);
        let result: ToolRunResult;
        try {
          result = await run(block.name, block.input, ctx);
        } catch (error) {
          // a runner that throws (a crashed worker) still answers the tool_use
          const content = JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
          result = { ok: false, content, preview: content.slice(0, 160), provenance: null, ms: 0 };
        }
        cb.onToolEnd?.(block.name, result.ok, result.preview, block.id, result);
        return { block, result };
      }),
    );
    if (signal?.aborted) return finish("aborted"); // the tool_use turn is not committed without its results
    commitAssistant(message);
    commit({
      role: "user",
      content: results.map(({ block, result }): BetaToolResultBlockParam => ({
        type: "tool_result",
        tool_use_id: block.id,
        content: result.content,
        ...(result.ok ? {} : { is_error: true }),
      })),
    });
  }
}
