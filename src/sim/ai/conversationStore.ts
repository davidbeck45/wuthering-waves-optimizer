// Wuthering Tools+ AI — the light half of the conversation: its shape, sessionStorage persistence
// (`wtplus:ai:chat`, one conversation per tab) and the transcript the panel renders. No engine, no SDK, no
// prompt: the eager assistant state (useAssistant.ts) and the panel import this; `conversation.ts` (the heavy
// half — new conversations with their account snapshot, asking, continuing) re-exports all of it.
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { parseAttachment, type AttachmentInfo } from "./attachments";
import { browserStorage, type StorageLike } from "./aiSettings";
import { isAiModel, type AiModel } from "./models";
import type { UsageTotals } from "./pricing";

export const AI_CHAT_STORAGE = "wtplus:ai:chat";
export const CONVERSATION_VERSION = 1;

export interface Conversation {
  version: 1;
  id: string;
  /** the model the chat started on (thinking blocks and the cache are tied to it) */
  model: AiModel;
  startedAt: string;
  /** the account snapshot in the system prompt — frozen for the chat's lifetime (a cache prefix) */
  snapshot: string;
  /** the account as last told to Claude (snapshot key), to notice edits mid-chat */
  accountKey: string;
  /** the last page-context line sent, to skip repeating it */
  pageContext: string | null;
  messages: BetaMessageParam[];
  usage: UsageTotals;
  /** the soft limit in USD; raised by `budgetStepUsd` each time the player agrees to go over */
  budgetUsd: number;
  /** the player's budget setting when the chat started: the size of each step past the limit */
  budgetStepUsd: number;
}


export function isConversation(value: unknown): value is Conversation {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return (
    c.version === CONVERSATION_VERSION &&
    typeof c.id === "string" &&
    isAiModel(c.model) &&
    typeof c.snapshot === "string" &&
    typeof c.accountKey === "string" &&
    Array.isArray(c.messages) &&
    !!c.usage &&
    typeof c.usage === "object" &&
    typeof c.budgetUsd === "number" &&
    typeof c.budgetStepUsd === "number"
  );
}

export function loadConversation(storage: StorageLike | null = browserStorage("sessionStorage")): Conversation | null {
  try {
    const text = storage?.getItem(AI_CHAT_STORAGE);
    if (!text) return null;
    const parsed = JSON.parse(text) as unknown;
    return isConversation(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** false when storage is unavailable or full (the chat still works for this page load). */
export function saveConversation(conversation: Conversation, storage: StorageLike | null = browserStorage("sessionStorage")): boolean {
  if (!storage) return false;
  try {
    storage.setItem(AI_CHAT_STORAGE, JSON.stringify(conversation));
    return true;
  } catch {
    return false;
  }
}

/** "New chat". */
export function clearConversation(storage: StorageLike | null = browserStorage("sessionStorage")): void {
  try {
    storage?.removeItem(AI_CHAT_STORAGE);
  } catch {
    /* nothing to clear */
  }
}

/** The conversation ends with a user turn (tool results or a question) that a `continueConversation` can answer. */
export function canContinue(conversation: Conversation): boolean {
  const last = conversation.messages[conversation.messages.length - 1];
  return !!last && last.role === "user";
}

// ── transcript: what the drawer renders ───────────────────────────────────────────────────────

export interface TranscriptTool {
  id: string;
  name: string;
  input: unknown;
  ok: boolean | null;
  /** the tool_result content (compact JSON) once it arrived */
  result: string | null;
}

export type TranscriptEntry =
  | { kind: "user"; index: number; text: string; images: number; attachments: AttachmentInfo[] }
  | { kind: "assistant"; index: number; text: string; tools: TranscriptTool[] };

export const blocksOf = (content: BetaMessageParam["content"]): Array<Record<string, any>> =>
  typeof content === "string" ? [{ type: "text", text: content }] : (content as unknown as Array<Record<string, any>>);

/** Messages → display entries: one per question, one per answer (an answer spans its tool rounds); system
 *  messages and thinking blocks are not shown. `index` is the message index (for truncateBefore). */
export function transcriptOf(messages: readonly BetaMessageParam[]): TranscriptEntry[] {
  const out: TranscriptEntry[] = [];
  let answer: Extract<TranscriptEntry, { kind: "assistant" }> | null = null;
  messages.forEach((m, index) => {
    if (m.role === "system") return;
    const blocks = blocksOf(m.content);
    if (m.role === "user") {
      const results = blocks.filter((b) => b.type === "tool_result");
      if (results.length && answer) {
        for (const r of results) {
          const tool = answer.tools.find((t) => t.id === r.tool_use_id);
          if (!tool) continue;
          tool.ok = r.is_error !== true;
          tool.result = typeof r.content === "string" ? r.content : JSON.stringify(r.content ?? null);
        }
      }
      const texts: string[] = [];
      const attachments: AttachmentInfo[] = [];
      for (const b of blocks) {
        if (b.type !== "text") continue;
        const t = String(b.text ?? "");
        const attachment = parseAttachment(t); // an Explain button's data: shown as a chip, not as JSON
        if (attachment) attachments.push(attachment);
        else texts.push(t);
      }
      const text = texts.join("\n");
      const images = blocks.filter((b) => b.type === "image").length;
      if (text || images || attachments.length) {
        answer = null;
        out.push({ kind: "user", index, text, images, attachments });
      }
      return;
    }
    if (!answer) {
      answer = { kind: "assistant", index, text: "", tools: [] };
      out.push(answer);
    }
    for (const b of blocks) {
      if (b.type === "text" && b.text) answer.text = answer.text ? `${answer.text}\n\n${b.text}` : String(b.text);
      else if (b.type === "tool_use") answer.tools.push({ id: String(b.id), name: String(b.name), input: b.input, ok: null, result: null });
    }
  });
  return out;
}
