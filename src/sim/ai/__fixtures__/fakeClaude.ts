// Wuthering Tools+ AI test helper: a scripted stand-in for the Anthropic client's `beta.messages.stream`, so the
// agent loop, the conversation store and the CLI twin are tested without the network. Each scripted response
// becomes the event sequence a real stream produces (message_start → content blocks → message_delta → stop)
// and `finalMessage()` resolves with it. Optional prompt-cache simulation: a request whose tools + system +
// leading messages match the previous request byte for byte reports those tokens as cache reads.
import { APIUserAbortError } from "@anthropic-ai/sdk";
import type { BetaMessage, BetaMessageStreamParams, BetaRawMessageStreamEvent } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { ClientLike, StreamLike } from "../agentLoop";

export interface FakeResponse {
  content: Array<Record<string, unknown>>;
  stop_reason: string;
  stop_details?: Record<string, unknown> | null;
  usage?: Record<string, unknown>;
  /** iteration throws this before any event (an API error, a JSON parse error) */
  throwError?: unknown;
  /** iteration blocks until the request's AbortSignal fires, then throws the SDK's abort error */
  waitForAbort?: boolean;
  /** like waitForAbort, after `message_start` and the first `message_delta` usage update (a billed, half-streamed response) */
  waitForAbortAfterStart?: { output_tokens: number };
  /** called once the stream's first event has been consumed */
  onStart?: () => void;
}

// eslint-disable-next-line no-unused-vars -- the parameters of a function type
export type ScriptStep = FakeResponse | ((params: BetaMessageStreamParams, call: number) => FakeResponse);

export interface FakeCall {
  params: BetaMessageStreamParams;
  /** the params serialised at call time (later mutation of shared arrays can't leak into assertions) */
  json: string;
  signal?: AbortSignal;
}

export const text = (t: string): Record<string, unknown> => ({ type: "text", text: t, citations: null });
export const thinking = (): Record<string, unknown> => ({ type: "thinking", thinking: "", signature: "sig_abc" });
let toolIds = 0;
export const toolUse = (name: string, input: unknown, id = `toolu_${++toolIds}`): Record<string, unknown> => ({ type: "tool_use", id, name, input });

const tokensOf = (s: string): number => Math.ceil(s.length / 4);

function messageOf(r: FakeResponse, model: string, call: number, usage: Record<string, unknown>): BetaMessage {
  return {
    id: `msg_${call}`,
    type: "message",
    role: "assistant",
    model,
    content: r.content,
    stop_reason: r.stop_reason,
    stop_sequence: null,
    stop_details: r.stop_details ?? null,
    usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...usage, ...(r.usage ?? {}) },
  } as unknown as BetaMessage;
}

function eventsOf(m: BetaMessage): BetaRawMessageStreamEvent[] {
  const events: Array<Record<string, unknown>> = [{ type: "message_start", message: { ...m, content: [] } }];
  (m.content as unknown as Array<Record<string, any>>).forEach((block, index) => {
    if (block.type === "text") {
      events.push({ type: "content_block_start", index, content_block: { ...block, text: "" } });
      events.push({ type: "content_block_delta", index, delta: { type: "text_delta", text: block.text } });
    } else if (block.type === "tool_use") {
      events.push({ type: "content_block_start", index, content_block: { ...block, input: {} } });
      events.push({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } });
    } else {
      events.push({ type: "content_block_start", index, content_block: block });
    }
    events.push({ type: "content_block_stop", index });
  });
  events.push({ type: "message_delta", delta: { stop_reason: m.stop_reason, stop_sequence: null }, usage: m.usage });
  events.push({ type: "message_stop" });
  return events as unknown as BetaRawMessageStreamEvent[];
}

export function fakeClient(script: ScriptStep[], options: { cache?: boolean } = {}): { client: ClientLike; calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  let previous: { head: string; messages: string[] } | null = null;

  const cacheUsage = (params: BetaMessageStreamParams): Record<string, unknown> => {
    const head = JSON.stringify([params.tools ?? null, params.system ?? null, params.model]);
    const messages = (params.messages ?? []).map((m) => JSON.stringify(m));
    let read = 0;
    if (previous && previous.head === head) {
      read = tokensOf(head);
      for (let i = 0; i < Math.min(messages.length, previous.messages.length) - 0; i++) {
        if (messages[i] !== previous.messages[i]) break;
        read += tokensOf(messages[i]);
      }
    }
    const total = tokensOf(head) + messages.reduce((n, m) => n + tokensOf(m), 0);
    previous = { head, messages };
    return { cache_read_input_tokens: read, cache_creation_input_tokens: total - read, input_tokens: 0 };
  };

  const client: ClientLike = {
    beta: {
      messages: {
        stream(params: BetaMessageStreamParams, requestOptions?: { signal?: AbortSignal }): StreamLike {
          const call = calls.length;
          calls.push({ params, json: JSON.stringify(params), signal: requestOptions?.signal });
          const step = script[call];
          if (!step) throw new Error(`fake client: no scripted response for request ${call + 1}`);
          const r = typeof step === "function" ? step(params, call) : step;
          const message = messageOf(r, String(params.model), call, options.cache ? cacheUsage(params) : {});
          const signal = requestOptions?.signal;
          let failure: unknown = null;
          return {
            async *[Symbol.asyncIterator]() {
              if (r.throwError) {
                failure = r.throwError;
                throw r.throwError;
              }
              if (r.waitForAbortAfterStart) {
                yield { type: "message_start", message: { ...message, content: [] } } as unknown as BetaRawMessageStreamEvent;
                yield { type: "message_delta", delta: { stop_reason: null, stop_sequence: null }, usage: { output_tokens: r.waitForAbortAfterStart.output_tokens } } as unknown as BetaRawMessageStreamEvent;
              }
              if (r.waitForAbort || r.waitForAbortAfterStart) {
                await new Promise<void>((resolve) => {
                  if (signal?.aborted) return resolve();
                  signal?.addEventListener("abort", () => resolve(), { once: true });
                });
                failure = new APIUserAbortError();
                throw failure;
              }
              let first = true;
              for (const event of eventsOf(message)) {
                if (signal?.aborted) {
                  failure = new APIUserAbortError();
                  throw failure;
                }
                yield event;
                if (first) {
                  first = false;
                  r.onStart?.();
                }
              }
            },
            async finalMessage() {
              if (failure) throw failure;
              return message;
            },
            abort() {
              failure = new APIUserAbortError();
            },
          };
        },
      },
    },
  };
  return { client, calls };
}
