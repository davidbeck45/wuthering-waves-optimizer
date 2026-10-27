// Wuthering Tools+ AI — the Anthropic client. The SDK is imported lazily (a dynamic import, so it never
// lands in the main bundle and only loads when the player opens the assistant). In the browser the
// player's own key is passed in (aiSettings.ts) and `dangerouslyAllowBrowser` is set: the SDK then sends
// `anthropic-dangerous-direct-browser-access`, the request goes straight from the player's browser to
// api.anthropic.com. Under Node (the CLI's `ask`) the SDK resolves credentials itself
// (ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, an `ant auth login` profile).
//
// Errors are mapped with the SDK's typed classes, most specific first — never by matching message text.
import type Anthropic from "@anthropic-ai/sdk";
import type { BetaRefusalStopDetails } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { redactKeys } from "./aiSettings";
import { modelInfo, SERVER_FALLBACK_BETA, type AiModel } from "./models";

export type AnthropicSdk = typeof import("@anthropic-ai/sdk");
export type AnthropicClient = Anthropic;

let sdkPromise: Promise<AnthropicSdk> | null = null;

/** The SDK module, imported once on first use. */
export function loadAnthropicSdk(): Promise<AnthropicSdk> {
  sdkPromise ??= import("@anthropic-ai/sdk").catch((error: unknown) => {
    sdkPromise = null; // a failed chunk load can be retried
    throw error;
  });
  return sdkPromise;
}

const inBrowser = (): boolean => typeof window !== "undefined" && typeof document !== "undefined";

export type AiErrorKind =
  | "no_key"
  | "auth"
  | "permission"
  | "billing"
  | "not_found"
  | "rate_limit"
  | "overloaded"
  | "too_large"
  | "bad_request"
  | "server"
  | "timeout"
  | "connection"
  | "aborted"
  | "unknown";

export interface AiError {
  kind: AiErrorKind;
  /** one friendly sentence for the player */
  message: string;
  /** trying again later may work (rate limits, overload, network) */
  retryable: boolean;
  status: number | null;
  requestId: string | null;
  /** the SDK's own text, keys redacted, for a "details" disclosure */
  detail: string | null;
}

/** An error the app raises itself (before the SDK is involved); `describeError` recognises it. */
export function aiError(kind: AiErrorKind, message: string): Error & { aiKind: AiErrorKind } {
  return Object.assign(new Error(message), { aiKind: kind });
}

export interface CreateClientOptions {
  /** the player's key (browser); omit under Node to let the SDK resolve credentials */
  apiKey?: string | null;
  /** default: true in a browser */
  browser?: boolean;
  maxRetries?: number;
}

export async function createAnthropicClient(options: CreateClientOptions = {}): Promise<{ client: AnthropicClient; sdk: AnthropicSdk }> {
  const browser = options.browser ?? inBrowser();
  if (browser && !options.apiKey) throw aiError("no_key", "Add your Anthropic API key in AI settings to use the assistant.");
  const sdk = await loadAnthropicSdk();
  const client = new sdk.default({
    ...(options.apiKey ? { apiKey: options.apiKey } : {}),
    dangerouslyAllowBrowser: browser,
    maxRetries: options.maxRetries ?? 2,
  });
  return { client, sdk };
}

/** Request fields for the model: Opus 5.5 / Sonnet 5.5 opt into the server-side refusal fallback ("default" picks
 *  Anthropic's recommended fallback by refusal category); Haiku 5.5 has none. */
export function fallbackFields(model: AiModel): { betas?: string[]; fallbacks?: "default" } {
  return modelInfo(model).serverFallback ? { betas: [SERVER_FALLBACK_BETA], fallbacks: "default" } : {};
}

const detailOf = (error: unknown): string | null => {
  const text = error instanceof Error ? error.message : typeof error === "string" ? error : null;
  return text ? redactKeys(text).slice(0, 400) : null;
};

/** Any thrown value → a friendly, typed description. `sdk` may be null when the SDK never loaded. */
export function describeError(error: unknown, sdk: AnthropicSdk | null): AiError {
  const base = { status: null, requestId: null, detail: detailOf(error) };
  const own = (error as { aiKind?: AiErrorKind } | null)?.aiKind;
  if (own) return { ...base, kind: own, message: (error as Error).message, retryable: false };
  if (sdk) {
    if (error instanceof sdk.APIUserAbortError) return { ...base, kind: "aborted", message: "Stopped.", retryable: false };
    if (error instanceof sdk.APIConnectionTimeoutError) return { ...base, kind: "timeout", message: "The request to Anthropic timed out. Try again.", retryable: true };
    if (error instanceof sdk.APIConnectionError) {
      return { ...base, kind: "connection", message: "Couldn't reach Anthropic. Check your connection (or an ad blocker on api.anthropic.com) and try again.", retryable: true };
    }
    if (error instanceof sdk.APIError) {
      const status = typeof error.status === "number" ? error.status : null;
      const withMeta = { ...base, status, requestId: error.requestID ?? null };
      if (error instanceof sdk.AuthenticationError) return { ...withMeta, kind: "auth", message: "Anthropic rejected the API key. Check it in AI settings.", retryable: false };
      if (error instanceof sdk.PermissionDeniedError) {
        return { ...withMeta, kind: "permission", message: "This API key isn't allowed to use that model or feature. Try another model in AI settings.", retryable: false };
      }
      if (error instanceof sdk.NotFoundError) return { ...withMeta, kind: "not_found", message: "That model isn't available for this API key. Pick another model in AI settings.", retryable: false };
      if (error instanceof sdk.RateLimitError) return { ...withMeta, kind: "rate_limit", message: "Rate limited by Anthropic. Wait a moment and try again.", retryable: true };
      if (error instanceof sdk.InternalServerError) {
        return error.type === "overloaded_error" || status === 529
          ? { ...withMeta, kind: "overloaded", message: "Anthropic is overloaded right now. Try again in a minute.", retryable: true }
          : { ...withMeta, kind: "server", message: "Anthropic had a server error. Try again.", retryable: true };
      }
      if (error.type === "billing_error" || status === 402) {
        return { ...withMeta, kind: "billing", message: "Your Anthropic account is out of credit or over its spend limit.", retryable: false };
      }
      if (status === 413) return { ...withMeta, kind: "too_large", message: "This conversation is too large to send. Start a new chat.", retryable: false };
      if (error instanceof sdk.BadRequestError || error instanceof sdk.UnprocessableEntityError) {
        return { ...withMeta, kind: "bad_request", message: "Anthropic couldn't process this request. Start a new chat; if it keeps happening, it's a bug in the app.", retryable: false };
      }
      return { ...withMeta, kind: "unknown", message: `Anthropic returned an error${status ? ` (${status})` : ""}.`, retryable: status != null && status >= 500 };
    }
  }
  if (error instanceof Error && error.name === "AbortError") return { ...base, kind: "aborted", message: "Stopped.", retryable: false };
  return { ...base, kind: "unknown", message: "Something went wrong talking to Anthropic.", retryable: false };
}

/** A polite line for a refused turn (`stop_reason: "refusal"`, after any server-side fallback also declined). */
export function refusalMessage(details: Pick<BetaRefusalStopDetails, "category" | "explanation"> | null | undefined): string {
  if (details?.category === "reasoning_extraction") {
    return "Claude can't write out its internal reasoning. Ask for the conclusion and the numbers behind it instead.";
  }
  return "Claude declined to answer that one. Try asking about your account, your builds or the game's numbers in other words.";
}

export type KeyTestResult = { ok: true; model: string } | { ok: false; error: AiError };

/** "Test key" (AI settings, only when the player clicks it): GET /v1/models/{model} — a tiny free request that proves
 *  the key works and the model is available to it. */
export async function testApiKey(apiKey: string, model: AiModel): Promise<KeyTestResult> {
  let sdk = null;
  try {
    sdk = await loadAnthropicSdk();
    const { client } = await createAnthropicClient({ apiKey, maxRetries: 0 });
    const info = await client.models.retrieve(model);
    return { ok: true, model: info.display_name || modelInfo(model).label };
  } catch (error) {
    return { ok: false, error: describeError(error, sdk) };
  }
}
