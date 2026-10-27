// Wuthering Tools+ AI — the tool registry. Read-only tools over the app's own engine; each returns compact
// JSON and never writes to the player's data or navigates. The order below is FIXED: tools render first in
// the prompt-cache prefix, so reordering, renaming or editing a description invalidates every cached prefix.
import type { BetaTool } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { validateInput } from "../schema";
import { getAccountSummary, rankingsLink } from "./account";
import { calcCharacterTool, listRotationsTool, whatIfTool } from "./character";
import { searchInventoryTool } from "./inventory";
import { getKitTool, sequenceBreakpointsTool } from "./kit";
import { rankRosterTool } from "./rank";
import { substatWeightsTool } from "./substats";
import { calcTeamTool, listTeamPresetsTool } from "./team";
import type { AnyAiTool, ToolContext } from "./shared";

export type { AiTool, AnyAiTool, ToolContext } from "./shared";
export { clearToolMemo } from "./memo";

export const AI_TOOLS: readonly AnyAiTool[] = [
  getAccountSummary,
  calcCharacterTool,
  calcTeamTool,
  rankRosterTool,
  substatWeightsTool,
  whatIfTool,
  listRotationsTool,
  listTeamPresetsTool,
  sequenceBreakpointsTool,
  getKitTool,
  searchInventoryTool,
  rankingsLink,
];

export const findTool = (name: string): AnyAiTool | undefined => AI_TOOLS.find((t) => t.name === name);

/** The `tools` array for a request: strict schemas; `eager` streams tool input as it is generated (streaming requests only). */
export function toolDefinitions(options: { eager?: boolean } = {}): BetaTool[] {
  return AI_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    // ObjectSchema is a closed interface; the SDK's InputSchema carries an index signature
    input_schema: t.input_schema as unknown as BetaTool.InputSchema,
    strict: true,
    ...(options.eager ? { eager_input_streaming: true } : {}),
  }));
}

export interface ToolRunResult {
  ok: boolean;
  /** the tool_result content: compact JSON (an `error` object when ok is false) */
  content: string;
  /** one short line for the UI's tool timeline */
  preview: string;
  provenance: string | null;
  ms: number;
}

const clip = (text: string, max: number): string => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);

/** A short human line for the tool timeline: the first few scalar fields of the result. */
export function previewOf(content: string): string {
  try {
    const value = JSON.parse(content) as Record<string, unknown>;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (typeof value.error === "string") return clip(value.error, 160);
      const parts: string[] = [];
      for (const [k, v] of Object.entries(value)) {
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") parts.push(`${k}: ${v}`);
        else if (Array.isArray(v)) parts.push(`${k}: ${v.length}`);
        if (parts.length >= 4) break;
      }
      if (parts.length) return clip(parts.join(" · "), 160);
    }
  } catch {
    /* not JSON: fall through */
  }
  return clip(content, 160);
}

/** Validate, run, catch: every outcome becomes a tool_result the model can read (is_error when ok is false). */
export async function runTool(name: string, input: unknown, ctx: ToolContext): Promise<ToolRunResult> {
  const started = Date.now();
  const tool = findTool(name);
  const done = (ok: boolean, content: string): ToolRunResult => ({ ok, content, preview: previewOf(content), provenance: tool?.provenance ?? null, ms: Date.now() - started });
  if (!tool) return done(false, JSON.stringify({ error: `Unknown tool "${name}". Available: ${AI_TOOLS.map((t) => t.name).join(", ")}` }));
  const checked = validateInput(tool.input_schema, input);
  if (!checked.ok) {
    let raw: string;
    try {
      raw = JSON.stringify(input) ?? String(input);
    } catch {
      raw = String(input);
    }
    return done(false, JSON.stringify({ error: `Invalid input for ${name}: ${checked.errors.join("; ")}`, INVALID_JSON: clip(raw, 1500) }));
  }
  try {
    return done(true, await tool.run(checked.value, ctx));
  } catch (error) {
    return done(false, JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  }
}
