// Wuthering Tools+ AI — the CLI twin of the in-app assistant: `npm run cli -- ask "<question>"` runs the same
// conversation, agent loop and tools on an export file in Node. Credentials come from the SDK's default
// resolution (ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, an `ant auth login` profile). It calls the paid API;
// tests inject a fake client.
import type { ExportFile } from "../cli/exportShape";
import type { AgentTurnResult, ClientLike } from "./agentLoop";
import { createAnthropicClient, type AnthropicSdk } from "./client";
import { askInConversation, newConversation, type Conversation } from "./conversation";
import { DEFAULT_EFFORT, DEFAULT_BUDGET_USD } from "./aiSettings";
import { AI_EFFORTS, AI_MODEL_IDS, DEFAULT_AI_MODEL, isAiEffort, isAiModel, type AiEffort, type AiModel } from "./models";
import { cacheHitRate, formatUsd } from "./pricing";

export interface AskCliOptions {
  model?: string;
  effort?: string;
  maxRounds?: number;
  budgetUsd?: number;
  autoBuffs?: boolean;
  /** stream the answer to `out` and the tool timeline to `err` (default true) */
  stream?: boolean;
  client?: ClientLike;
  sdk?: AnthropicSdk | null;
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  out?: (text: string) => void;
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  err?: (text: string) => void;
}

export interface AskCliTool {
  name: string;
  input: unknown;
  ok: boolean;
  preview: string;
  ms: number;
}

export interface AskCliResult {
  conversation: Conversation;
  result: AgentTurnResult;
  model: AiModel;
  effort: AiEffort;
  tools: AskCliTool[];
}

export function parseAskOptions(options: AskCliOptions): { model: AiModel; effort: AiEffort; maxRounds: number; budgetUsd: number } {
  const model = options.model ?? DEFAULT_AI_MODEL;
  if (!isAiModel(model)) throw new Error(`--model must be one of ${AI_MODEL_IDS.join(", ")}`);
  const effort = options.effort ?? DEFAULT_EFFORT.chat;
  if (!isAiEffort(effort)) throw new Error(`--effort must be one of ${AI_EFFORTS.join(", ")}`);
  const maxRounds = options.maxRounds ?? 6;
  if (!Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > 20) throw new Error("--max-rounds must be an integer from 1 to 20");
  const budgetUsd = options.budgetUsd ?? DEFAULT_BUDGET_USD;
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new Error("--budget must be a positive number of USD");
  return { model, effort, maxRounds, budgetUsd };
}

export async function runAsk(question: string, exp: ExportFile, options: AskCliOptions = {}): Promise<AskCliResult> {
  const { model, effort, maxRounds, budgetUsd } = parseAskOptions(options);
  if (!question.trim()) throw new Error("Ask a question");
  const out = options.out ?? (() => undefined);
  const err = options.err ?? (() => undefined);
  const streaming = options.stream ?? true;
  let client = options.client;
  let sdk = options.sdk;
  if (!client) {
    const created = await createAnthropicClient({ browser: false });
    client = created.client;
    sdk = created.sdk;
  }
  const tools: AskCliTool[] = [];
  const conversation = newConversation({ model, exp, budgetUsd });
  const started = new Map<string, unknown>();
  const { conversation: next, result } = await askInConversation(conversation, question, {
    client,
    sdk,
    effort,
    exp,
    autoBuffs: options.autoBuffs,
    maxToolRounds: maxRounds,
    confirm: async () => false, // a CLI run never goes past its budget or tool rounds unasked
    callbacks: {
      onText: (delta) => streaming && out(delta),
      onThinkingStart: () => streaming && err("(thinking…)\n"),
      onToolStart: (name, input, id) => {
        started.set(id, input);
        if (streaming) err(`→ ${name} ${JSON.stringify(input)}\n`);
      },
      onToolEnd: (name, ok, preview, id, r) => {
        tools.push({ name, input: started.get(id) ?? null, ok, preview, ms: r.ms });
        if (streaming) err(`  ${ok ? "ok" : "error"} (${r.ms} ms) ${preview}\n`);
      },
      onRetry: (reason) => streaming && err(`(retrying: ${reason})\n`),
    },
  });
  if (streaming) {
    out("\n");
    const u = result.usage;
    const note =
      result.status === "refusal"
        ? `\n${result.refusal?.message ?? "Refused."}`
        : result.status === "error"
          ? `\nError: ${result.error?.message ?? "unknown"}`
          : result.status === "budget"
            ? `\nStopped at the ${formatUsd(budgetUsd)} budget (--budget raises it).`
            : result.status === "tool_limit"
              ? `\nAnswered after the ${maxRounds}-round tool limit (--max-rounds raises it).`
              : "";
    err(
      `${note}\n[${result.status}] ${model} · effort ${effort} · ${result.rounds} tool round${result.rounds === 1 ? "" : "s"} · ${u.requests} request${u.requests === 1 ? "" : "s"} · ` +
        `${u.inputTokens + u.cacheReadTokens + u.cacheWriteTokens} in (${Math.round(cacheHitRate(u) * 100)} % cached) / ${u.outputTokens} out · ${formatUsd(u.costUsd)}\n`,
    );
  }
  return { conversation: next, result, model, effort, tools };
}
