// Wuthering Tools+ AI — the Claude models the app offers and what each one supports. Pure; read by the
// settings, the client, the pricing meter and the CLI. Exact model ids, never date-suffixed.

export const AI_MODEL_IDS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"] as const;
export type AiModel = (typeof AI_MODEL_IDS)[number];

export const DEFAULT_AI_MODEL: AiModel = "claude-opus-5-5";

export const AI_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type AiEffort = (typeof AI_EFFORTS)[number];

export interface AiModelInfo {
  id: AiModel;
  label: string;
  /** one line for the settings picker */
  blurb: string;
  /** server-side refusal fallback (`fallbacks: "default"`, beta server-side-fallback-2026-07-01) */
  serverFallback: boolean;
}

export const AI_MODELS: readonly AiModelInfo[] = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", blurb: "Most capable; the default", serverFallback: true },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", blurb: "Fast and capable, about half the price", serverFallback: true },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", blurb: "Fastest and cheapest; lighter reasoning", serverFallback: false },
];

export const isAiModel = (value: unknown): value is AiModel => typeof value === "string" && (AI_MODEL_IDS as readonly string[]).includes(value);
export const isAiEffort = (value: unknown): value is AiEffort => typeof value === "string" && (AI_EFFORTS as readonly string[]).includes(value);

export function modelInfo(model: AiModel): AiModelInfo {
  return AI_MODELS.find((m) => m.id === model) ?? AI_MODELS[0];
}

/** The beta header that turns on `fallbacks: "default"` (Claude API only; not Haiku 5.5). */
export const SERVER_FALLBACK_BETA = "server-side-fallback-2026-07-01";
