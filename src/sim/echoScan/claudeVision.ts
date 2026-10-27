// Wuthering Tools+ — "Read with Claude": Claude reads echo screenshots the OCR can't (PC frames, other phones,
// shots without the Sonata filter), and the app checks every line the way the OCR path does.
//
// Per screenshot:
//   1. one request — the downscaled image + structured outputs (`output_config.format`, a JSON schema whose enums
//      are the app's own vocabulary: echo names from the registry, set names, stat labels). Claude returns every
//      echo whose stat list is visible: name, cost, level, rarity, the set when its name is printed, the main stat,
//      the fixed second row, up to five substats, who wears it, a confidence and notes.
//   2. only when an echo's set isn't printed and the registry allows it more than one: a small second request with
//      the set glyph (cropped from the full-resolution screenshot around the box Claude gave, enlarged) and the
//      candidate sets' icons as labelled URL images (the app's own `echoSetImageMap`), Claude picks the match.
//   3. `mapClaudeEcho` turns the answer into the importer's ScanRecord and runs the SAME checks as the OCR path:
//      a substat value must be a legal roll (`subStatsTable`), the main stat a legal one for the cost and its
//      max-level value (`statsTable`), the second row the fixed flat stat (`flatBonusesByRankByType`), at most five
//      substats and no more than the level's tunes allow, no substat type twice. A failed check is a flag on the
//      row (and the row starts unchecked); nothing is corrected — an illegal value stays exactly as Claude read it.
//
// Pure: no DOM, no Vue. The image (downscale, base64, crop) comes in through `VisionImage.load()` (visionImage.ts
// in the browser, a stub in tests); the client is anything with `beta.messages.create` (the SDK's client fits).
// Requests follow the Claude API rules of the Opus 5.5 era: no `thinking` (Opus 5.5 always thinks; depth is
// `output_config.effort`), no sampling parameters, the server-side refusal fallback on Opus / Sonnet, typed errors.
/* eslint-disable no-unused-vars -- parameter names in function types; vue-tsc (noUnusedParameters) guards real unused code */
import type {
  BetaContentBlockParam,
  BetaMessage,
  BetaRefusalStopDetails,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { mainEchoesData } from "../../echoes/index";
import { LEVELS_PER_TUNE } from "../../echoes/levelingCost";
import { echoSetImageMap, echoSetLabelMap, flatBonusesByRankByType, statsTable, subStatsTable } from "../../echoes/stats";
import { describeError, fallbackFields, refusalMessage, type AnthropicSdk } from "../ai/client";
import type { AiEffort, AiModel } from "../ai/models";
import { addUsage, emptyUsage, sumUsage, type UsageTotals } from "../ai/pricing";
import { VISION_CONCURRENCY } from "./claudeVisionCost";
import { KEY_TO_LABEL, MAIN_STAT_KEYS, SUBSTAT_KEYS, bestEcho, echoEntry, labelKey, norm, type ScanRecord, type StatRow } from "./phoneEchoScan";

// ── limits and sizes ──────────────────────────────────────────────────────────────────────────
// the image size and the estimate live in claudeVisionCost.ts (light: the importer shows the estimate eagerly)
export {
  DEFAULT_SHOT,
  MAX_IMAGE_TOKENS,
  SET_PASS_ALLOWANCE,
  VISION_CONCURRENCY,
  VISION_LONG_EDGE,
  VISION_OUTPUT_TOKENS,
  VISION_MAX_PIXELS,
  VISION_PROMPT_TOKENS,
  estimateVisionCost,
  imageTokens,
  visionSize,
  type VisionEstimate,
} from "./claudeVisionCost";

export const VISION_MAX_TOKENS = 16000;
export const SET_MATCH_MAX_TOKENS = 4000;
/** below this, Claude's confidence becomes a flag on the row */
export const LOW_CONFIDENCE = 0.6;

// ── the app's vocabulary ──────────────────────────────────────────────────────────────────────

interface Vocab {
  echoLabels: string[];
  echoByName: Map<string, string>;
  setLabels: string[];
  setByName: Map<string, string>;
  statLabels: string[];
}

let vocab: Vocab | null = null;

/** Echo names, set names and stat labels as the game prints them, from the registry and the stat tables. */
export function visionVocab(): Vocab {
  if (vocab) return vocab;
  const echoes = Object.values(mainEchoesData).sort((a, b) => a.name.localeCompare(b.name));
  const echoByName = new Map<string, string>();
  for (const echo of echoes) echoByName.set(norm(echo.name), echo.key);
  const setKeys = Object.keys(echoSetLabelMap);
  const setByName = new Map<string, string>();
  for (const key of setKeys) {
    setByName.set(norm(echoSetLabelMap[key]), key);
    setByName.set(norm(key), key);
  }
  const statKeys = [...new Set([...MAIN_STAT_KEYS, ...SUBSTAT_KEYS.map((k) => k.replace(/_FLAT$/, ""))])];
  vocab = {
    echoLabels: echoes.map((e) => e.name),
    echoByName,
    setLabels: setKeys.map((k) => echoSetLabelMap[k]),
    setByName,
    statLabels: statKeys.map((k) => KEY_TO_LABEL[k] ?? k),
  };
  return vocab;
}

const statLabelOf = (key: string): string => KEY_TO_LABEL[key.replace(/_FLAT$/, "")] ?? key;
const setLabelOf = (key: string): string => echoSetLabelMap[key] ?? key;

// ── schemas and prompts ───────────────────────────────────────────────────────────────────────

type Schema = Record<string, unknown>;
const nullable = (schema: Schema): Schema => ({ anyOf: [schema, { type: "null" }] });

function statSchema(labels: string[], what: string): Schema {
  return {
    type: "object",
    additionalProperties: false,
    required: ["type", "value"],
    description: what,
    properties: {
      type: { type: "string", enum: labels, description: "the stat's label as printed" },
      value: { type: "string", description: 'the value exactly as printed, with the % sign when the game shows one: "8.6%", "50", "2,280"' },
    },
  };
}

let readSchema: Schema | null = null;

/** The structured-output schema of the read (built once: byte-identical requests reuse the compiled grammar). Strict
 *  rules: every object closes with `additionalProperties: false` and lists every property as required; no numeric or
 *  array-length constraints (the checks run here instead). */
export function echoReadSchema(): Schema {
  if (readSchema) return readSchema;
  const v = visionVocab();
  readSchema = {
    type: "object",
    additionalProperties: false,
    required: ["screen", "echoes"],
    properties: {
      screen: { type: "string", description: "what the screenshot shows, in a few words" },
      echoes: {
        type: "array",
        description: "every echo whose stat list is visible, top to bottom / left to right; [] when none is",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["printedName", "echo", "cost", "level", "rarity", "set", "setSource", "setGlyphBox", "mainStat", "secondaryStat", "substats", "equippedBy", "confidence", "notes"],
          properties: {
            printedName: { type: "string", description: 'the name exactly as printed ("" when no name is shown)' },
            echo: nullable({ type: "string", enum: v.echoLabels, description: "the echo from the list matching the printed name" }),
            cost: nullable({ type: "integer", enum: [1, 3, 4] }),
            level: nullable({ type: "integer", description: 'the level, "+25" → 25' }),
            rarity: nullable({ type: "integer", enum: [2, 3, 4, 5], description: "5 gold, 4 purple, 3 blue, 2 green" }),
            set: nullable({ type: "string", enum: v.setLabels, description: "only when the set's NAME is printed for this echo" }),
            setSource: { type: "string", enum: ["printed", "glyph_only", "not_visible"] },
            setGlyphBox: nullable({
              type: "object",
              additionalProperties: false,
              required: ["x", "y", "width", "height"],
              description: "the small set glyph next to the level, as fractions (0–1) of the image's width and height from the top-left",
              properties: { x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" } },
            }),
            mainStat: nullable(statSchema(v.statLabels, "the first stat row (the main stat)")),
            secondaryStat: nullable(statSchema(v.statLabels, "the second row: the fixed flat ATK or flat HP")),
            substats: { type: "array", description: "the rows after the second, in order (at most 5)", items: statSchema(v.statLabels, "a substat row") },
            equippedBy: nullable({ type: "string", description: "the resonator's name when the screenshot names who wears it" }),
            confidence: { type: "number", description: "0–1: how sure you are of every value in this echo" },
            notes: { type: "string", description: "anything doubtful (which row, why); \"\" when all is clear" },
          },
        },
      },
    },
  };
  return readSchema;
}

/** Byte-stable (no dates, no data). */
export const VISION_SYSTEM_PROMPT = [
  "You read Wuthering Waves screenshots for a player's echo inventory tool. The app checks every value you report against the game's roll tables, so report exactly what is printed: never compute, round, correct or guess a value.",
  "",
  "Report every echo whose stat list is visible — an Echo inventory detail panel, a comparison panel, a resonator's echo page with each echo's stats. Ignore grid tiles that only show a portrait, cost and level.",
  "",
  "For each echo:",
  '- printedName: the name as printed, including a prefix such as "Phantom:" or "Nightmare:". echo: the entry from the list that is that echo ("Phantom: X" and "X" are different entries), or null when none matches. Identify an unnamed echo by its portrait only when you are sure, and say so in notes.',
  '- cost from "COST n"; level from "+n"; rarity from the colour of the echo\'s frame or level (5 gold, 4 purple, 3 blue, 2 green), null when you can\'t tell.',
  '- set: only when the set\'s name is printed for this echo (for example a Sonata filter chip naming one set while the list is filtered by it, or the set effect\'s title in a detail view); setSource "printed". When only the small set glyph next to the level is visible, set null, setSource "glyph_only" and setGlyphBox around that glyph. Otherwise setSource "not_visible".',
  "- mainStat is the first stat row, secondaryStat the second (a flat ATK or flat HP), substats the rows after it in order. Values exactly as printed with the % sign when shown: \"ATK 7.9%\" and \"ATK 50\" are different stats.",
  "- equippedBy: the resonator's name if the screenshot names who wears it, else null.",
  "- confidence: 0–1 for the whole echo; notes: anything doubtful, which row and why.",
  "",
  'If no echo\'s stats are visible, return "echoes": [].',
].join("\n");

export const SET_MATCH_SYSTEM_PROMPT = [
  "You match Wuthering Waves echo set glyphs. Each echo below comes with its set glyph (a small monochrome icon shown next to its level) and the icons of the sets it can belong to.",
  'Pick the candidate whose icon has the same shape as the glyph; colour, size and background may differ. If none matches, answer "none of these". confidence: 0–1.',
].join("\n");

export const NONE_OF_THESE = "none of these";

/** Pass 2's schema: one closed object per echo, its enum limited to that echo's own candidate sets. */
export function setMatchSchema(candidates: ReadonlyArray<readonly string[]>): Schema {
  const properties: Record<string, Schema> = {};
  candidates.forEach((sets, i) => {
    properties[`echo_${i + 1}`] = {
      type: "object",
      additionalProperties: false,
      required: ["set", "confidence"],
      properties: { set: { type: "string", enum: [...sets.map(setLabelOf), NONE_OF_THESE] }, confidence: { type: "number" } },
    };
  });
  return { type: "object", additionalProperties: false, required: Object.keys(properties), properties };
}

// ── images ────────────────────────────────────────────────────────────────────────────────────

/** A region as fractions (0–1) of the image, origin top-left. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PreparedImage {
  /** base64, no `data:` prefix */
  data: string;
  mediaType: "image/jpeg" | "image/png";
  /** as sent */
  width: number;
  height: number;
  /** the original screenshot */
  sourceWidth: number;
  sourceHeight: number;
  /** a region cut from the full-resolution screenshot and enlarged (the set glyph); null when it can't */
  crop?(box: Box): Promise<PreparedImage | null>;
  /** frees the decoded screenshot */
  dispose?(): void;
}

export interface VisionImage {
  id: string;
  name: string;
  /** decode + downscale + encode, called when the image's turn comes (concurrency 2) */
  load(): Promise<PreparedImage>;
}

// ── requests ──────────────────────────────────────────────────────────────────────────────────

/** What the reader needs from a client (the SDK's Anthropic client fits). */
export interface VisionClientLike {
  beta: { messages: { create(params: MessageCreateParamsNonStreaming, options?: { signal?: AbortSignal }): PromiseLike<BetaMessage> } };
}

export interface VisionRequestOptions {
  model: AiModel;
  effort: AiEffort;
}

const imageBlock = (image: PreparedImage): BetaContentBlockParam => ({ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } });

export function readInstruction(image: PreparedImage): string {
  const scaled = image.width !== image.sourceWidth || image.height !== image.sourceHeight;
  return `This screenshot is ${image.width}×${image.height} px${scaled ? ` (scaled down from ${image.sourceWidth}×${image.sourceHeight})` : ""}. Read every echo whose stat list is visible.`;
}

/** Pass 1: the screenshot (image first) + the instruction, structured output, the vision effort. */
export function buildReadParams(image: PreparedImage, opts: VisionRequestOptions): MessageCreateParamsNonStreaming {
  return {
    model: opts.model,
    max_tokens: VISION_MAX_TOKENS,
    ...fallbackFields(opts.model),
    system: VISION_SYSTEM_PROMPT,
    output_config: { effort: opts.effort, format: { type: "json_schema", schema: echoReadSchema() } },
    messages: [{ role: "user", content: [imageBlock(image), { type: "text", text: readInstruction(image) }] }],
  };
}

export interface SetMatchTarget {
  echoName: string;
  candidates: readonly string[];
  /** the glyph cut from the screenshot; null → Claude looks at the whole screenshot */
  crop: PreparedImage | null;
}

/** Pass 2: per echo its glyph and its candidate sets' icons, by URL from the app's own set-image map. */
export function buildSetMatchParams(targets: readonly SetMatchTarget[], screenshot: PreparedImage, opts: VisionRequestOptions): MessageCreateParamsNonStreaming {
  const content: BetaContentBlockParam[] = [];
  if (targets.some((t) => !t.crop)) {
    content.push({ type: "text", text: "The screenshot:" }, imageBlock(screenshot));
  }
  targets.forEach((target, i) => {
    const k = i + 1;
    if (target.crop) content.push({ type: "text", text: `Echo ${k}: ${target.echoName}. Its set glyph, cut from the screenshot and enlarged:` }, imageBlock(target.crop));
    else content.push({ type: "text", text: `Echo ${k}: ${target.echoName}. Its set glyph is next to its level on the screenshot above.` });
    content.push({ type: "text", text: `Candidate sets for echo ${k}:` });
    for (const set of target.candidates) {
      const url = echoSetImageMap[set];
      content.push({ type: "text", text: `${setLabelOf(set)}${url ? ":" : " (no icon)"}` });
      if (url) content.push({ type: "image", source: { type: "url", url } });
    }
  });
  content.push({ type: "text", text: `For each echo, pick the candidate set whose icon matches its glyph (${targets.map((_, i) => `echo_${i + 1}`).join(", ")}).` });
  return {
    model: opts.model,
    max_tokens: SET_MATCH_MAX_TOKENS,
    ...fallbackFields(opts.model),
    system: SET_MATCH_SYSTEM_PROMPT,
    output_config: { effort: opts.effort, format: { type: "json_schema", schema: setMatchSchema(targets.map((t) => t.candidates)) } },
    messages: [{ role: "user", content }],
  };
}

// ── responses ─────────────────────────────────────────────────────────────────────────────────

export type VisionFailureKind = "refusal" | "truncated" | "no_output" | "unreadable";

export type StructuredResult = { ok: true; value: unknown } | { ok: false; kind: VisionFailureKind; message: string };

/** A structured-output response → its parsed JSON, or why there is none (refusal, cut off, no text, bad JSON). */
export function parseStructured(message: Pick<BetaMessage, "content" | "stop_reason"> & { stop_details?: BetaRefusalStopDetails | null }): StructuredResult {
  if (message.stop_reason === "refusal") {
    // the assistant's wording talks about questions; a screenshot gets its own (no retry: the same image refuses again)
    const details = message.stop_details ?? null;
    return { ok: false, kind: "refusal", message: details?.category === "reasoning_extraction" ? refusalMessage(details) : "Claude declined to read this screenshot. Fix this row by hand, or crop the screenshot to the echo's stat panel and try again." };
  }
  const text = message.content
    .filter((b): b is Extract<(typeof message.content)[number], { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");
  if (message.stop_reason === "max_tokens") return { ok: false, kind: "truncated", message: "Claude's answer was cut off before it finished. Try this screenshot again." };
  if (!text.trim()) return { ok: false, kind: "no_output", message: "Claude returned no answer for this screenshot." };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, kind: "unreadable", message: "Claude's answer wasn't valid JSON. Try this screenshot again." };
  }
}

/** One echo exactly as Claude answered it (every field checked for type, nothing trusted). */
export interface ClaudeEchoRaw {
  printedName: string;
  echo: string | null;
  cost: number | null;
  level: number | null;
  rarity: number | null;
  set: string | null;
  setSource: "printed" | "glyph_only" | "not_visible";
  setGlyphBox: Box | null;
  mainStat: { type: string; value: string } | null;
  secondaryStat: { type: string; value: string } | null;
  substats: Array<{ type: string; value: string }>;
  equippedBy: string | null;
  confidence: number;
  notes: string;
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const int = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);
const stat = (v: unknown): { type: string; value: string } | null => {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const type = str(o.type);
  const value = typeof o.value === "number" ? String(o.value) : str(o.value);
  return type && value !== null ? { type, value } : null;
};
const box = (v: unknown): Box | null => {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const n = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
  const [x, y, w, h] = [n(o.x), n(o.y), n(o.width), n(o.height)];
  if (x === null || y === null || w === null || h === null || w <= 0 || h <= 0) return null;
  // a box in pixels instead of fractions can't be used safely
  if (x > 1 || y > 1 || w > 1 || h > 1) return null;
  return { x, y, width: w, height: h };
};

/** The read payload → its echoes (null when the shape is wrong). Unknown or ill-typed fields become null. */
export function readPayloadOf(value: unknown): { screen: string; echoes: ClaudeEchoRaw[] } | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  if (!Array.isArray(o.echoes)) return null;
  const echoes = o.echoes
    .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === "object")
    .map((e): ClaudeEchoRaw => {
      const source = str(e.setSource);
      const confidence = typeof e.confidence === "number" && Number.isFinite(e.confidence) ? Math.min(1, Math.max(0, e.confidence)) : 0;
      return {
        printedName: (str(e.printedName) ?? "").trim(),
        echo: str(e.echo),
        cost: int(e.cost),
        level: int(e.level),
        rarity: int(e.rarity),
        set: str(e.set),
        setSource: source === "printed" || source === "glyph_only" ? source : "not_visible",
        setGlyphBox: box(e.setGlyphBox),
        mainStat: stat(e.mainStat),
        secondaryStat: stat(e.secondaryStat),
        substats: Array.isArray(e.substats) ? e.substats.map(stat).filter((s): s is { type: string; value: string } => s !== null) : [],
        equippedBy: str(e.equippedBy)?.trim() || null,
        confidence,
        notes: (str(e.notes) ?? "").trim(),
      };
    });
  return { screen: str(o.screen) ?? "", echoes };
}

// ── the checks (the OCR path's rules) ─────────────────────────────────────────────────────────

/** A printed value → number + percent? Strict: "8.6%", "50", "2,280", "10,9%". Anything else → null. */
export function parsePrinted(value: string): { num: number; pct: boolean } | null {
  const v = value.replace(/\s+/g, "");
  if (/^\d{1,3}(,\d{3})+$/.test(v)) return { num: Number(v.replace(/,/g, "")), pct: false };
  const m = /^(\d+)(?:[.,](\d+))?(%?)$/.exec(v);
  if (!m) return null;
  return { num: Number(`${m[1]}${m[2] ? `.${m[2]}` : ""}`), pct: m[3] === "%" };
}

const same = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;
const fmtPct = (n: number): string => `${n.toFixed(1)}%`;
type MainTable = Record<number, Record<string, Record<number, number>>>;
const MAIN = statsTable as MainTable;
const SUBS = subStatsTable as Record<string, number[]>;
const SECONDARY_KEY: Record<number, string> = { 1: "HP_FLAT", 3: "ATK_FLAT", 4: "ATK_FLAT" };

/** The app's substat key for a label + value: "ATK" with a % is ATK, without one ATK_FLAT. */
function substatKeyOf(base: string, pct: boolean): string {
  if (!pct && SUBS[`${base}_FLAT`]) return `${base}_FLAT`;
  return base;
}

export interface ClaudeEchoRead {
  record: ScanRecord;
  /** a value failed a check, the echo is unknown, or OCR disagrees: the row starts unchecked */
  blocking: boolean;
  confidence: number;
  notes: string;
  printedName: string;
  equippedBy: string | null;
  /** the set still has to come from the glyph (pass 2) */
  setPending: { candidates: string[]; box: Box | null } | null;
}

/** Claude's answer for one echo → the importer's record, every line checked. `file` names the row. */
export function mapClaudeEcho(raw: ClaudeEchoRaw, file: string): ClaudeEchoRead {
  const v = visionVocab();
  const flags: string[] = [];
  let blocking = false;
  const block = (flag: string): void => {
    flags.push(flag);
    blocking = true;
  };
  const q = (s: string): string => JSON.stringify(s);

  // the echo: a name from the list, else the printed name fuzzily (flagged), else unknown (blocking)
  let echoKey: string | null = null;
  let echoScore = raw.confidence;
  if (raw.echo !== null) {
    echoKey = v.echoByName.get(norm(raw.echo)) ?? null;
    if (!echoKey) block(`unknown echo name ${q(raw.echo)} — not in the app's echo list`);
  } else if (raw.printedName) {
    const fuzzy = bestEcho(raw.printedName, raw.cost);
    if (fuzzy && fuzzy.score >= 0.85) {
      echoKey = fuzzy.echo.key;
      echoScore = Math.min(echoScore, fuzzy.score);
      flags.push(`Claude didn't match ${q(raw.printedName)} to an echo; the closest name is ${fuzzy.echo.name} (${fuzzy.score.toFixed(2)})`);
    } else block(`echo not identified (printed ${q(raw.printedName)})`);
  } else block("echo not identified (no name printed)");
  const entry = echoKey ? echoEntry(echoKey) : null;

  // cost: the registry's; Claude's read is a cross-check
  const cost = entry?.cost ?? raw.cost;
  if (entry && raw.cost !== null && raw.cost !== entry.cost) flags.push(`COST ${raw.cost} read but the registry says ${entry.cost} for ${entry.name}`);
  if (cost === null) block("COST not read");

  // the main stat (needed before the rarity guess)
  const mainKey = raw.mainStat ? labelKey(raw.mainStat.type) : null;
  const mainValue = raw.mainStat ? parsePrinted(raw.mainStat.value) : null;
  const mainRanks = cost !== null && mainKey ? MAIN[cost]?.[mainKey] : undefined;

  // rarity: read, else the rank whose max-level value the main stat shows, else 5★ (flagged)
  let rank = raw.rarity !== null && [2, 3, 4, 5].includes(raw.rarity) ? raw.rarity : null;
  if (rank === null) {
    const byValue = mainRanks && mainValue?.pct ? [5, 4, 3, 2].find((r) => mainRanks[r] !== undefined && same(mainRanks[r], mainValue.num)) : undefined;
    rank = byValue ?? 5;
    if (byValue === undefined) flags.push("rarity not shown; assumed 5★");
  }

  // level
  const level = raw.level;
  if (level === null) flags.push("level not read");
  else if (level < 0 || level > 25) block(`level +${level} is outside +0…+25`);

  // set: printed and allowed, else the registry's only set, else the glyph (pass 2)
  let set: string | null = null;
  let setPending: ClaudeEchoRead["setPending"] = null;
  if (raw.set !== null) {
    const key = v.setByName.get(norm(raw.set)) ?? null;
    if (!key) flags.push(`unknown set name ${q(raw.set)}`);
    else if (entry && !entry.sets.includes(key)) flags.push(`set ${setLabelOf(key)} isn't one of ${entry.name}'s sets (${entry.sets.map(setLabelOf).join(", ")})`);
    else set = key;
  }
  if (!set && entry?.sets.length === 1) set = entry.sets[0];
  if (!set) {
    if (entry && entry.sets.length > 1 && raw.setSource !== "not_visible") setPending = { candidates: [...entry.sets], box: raw.setGlyphBox };
    else flags.push(`set unknown${entry ? ` (allowed ${entry.sets.map(setLabelOf).join(", ")})` : ""}`);
  }

  // the main stat: a legal one for the cost, at its max-level value for the rarity
  let main: StatRow | null = null;
  if (!raw.mainStat) block("main stat not read");
  else if (!mainKey) block(`main stat ${q(raw.mainStat.type)} isn't a stat the app knows`);
  else if (!mainValue) {
    main = [mainKey, raw.mainStat.value.trim()];
    block(`main ${statLabelOf(mainKey)}: value ${q(raw.mainStat.value)} unreadable`);
  } else if (!mainRanks) {
    main = [mainKey, raw.mainStat.value.trim()];
    block(`${statLabelOf(mainKey)} isn't a legal main stat for a cost-${cost ?? "?"} echo`);
  } else {
    const expect = mainRanks[rank];
    const healing26 = mainKey === "HealingBonus" && rank === 5 && same(mainValue.num, 26.4); // the game prints 26.4 %, the table says 26.0
    main = [mainKey, mainValue.pct && expect !== undefined && (same(mainValue.num, expect) || healing26) ? fmtPct(mainValue.num) : raw.mainStat.value.trim()];
    if (!mainValue.pct) flags.push(`main ${statLabelOf(mainKey)} ${raw.mainStat.value} has no % sign (main stats are percentages)`);
    else if (expect !== undefined && !same(mainValue.num, expect) && !healing26) {
      flags.push(`main ${statLabelOf(mainKey)} ${raw.mainStat.value} isn't the max-level value ${fmtPct(expect)} for a ${rank}★ cost-${cost} echo${level !== null ? ` (read +${level}: under-leveled or misread)` : ""}`);
    }
  }

  // the fixed second row
  if (raw.secondaryStat && cost !== null) {
    const expectKey = SECONDARY_KEY[cost];
    const expectValue = (flatBonusesByRankByType as Record<number, Record<number, number>>)[cost]?.[rank];
    const key = labelKey(raw.secondaryStat.type);
    const value = parsePrinted(raw.secondaryStat.value);
    const readKey = key && value ? substatKeyOf(key, value.pct) : null;
    if (expectKey && expectValue !== undefined && (readKey !== expectKey || !value || !same(value.num, expectValue))) {
      flags.push(`second row ${raw.secondaryStat.type} ${raw.secondaryStat.value} isn't the fixed ${statLabelOf(expectKey)} ${expectValue} of a ${rank}★ cost-${cost} echo at max level`);
    }
  }

  // substats: legal rolls only, at most 5, no type twice, no more than the level's tunes
  const subs: StatRow[] = [];
  const seen = new Set<string>();
  raw.substats.forEach((s, i) => {
    if (i >= 5) return;
    const base = labelKey(s.type);
    if (!base) return block(`substat ${q(s.type)} isn't a stat the app knows; left out`);
    const value = parsePrinted(s.value);
    if (!value) {
      subs.push([substatKeyOf(base, s.value.includes("%")), s.value.trim()]);
      return block(`substat ${statLabelOf(base)}: value ${q(s.value)} unreadable`);
    }
    const key = substatKeyOf(base, value.pct);
    const legal = SUBS[key];
    if (!legal) return block(`${statLabelOf(base)}${value.pct ? "" : " (flat)"} can't be a substat; left out (${s.value})`);
    const pctOk = key.endsWith("_FLAT") ? !value.pct : value.pct;
    if (pctOk && legal.some((x) => same(x, value.num))) subs.push([key, value.pct ? fmtPct(value.num) : String(Math.round(value.num))]);
    else {
      subs.push([key, s.value.trim()]);
      block(`substat ${statLabelOf(key)}${key.endsWith("_FLAT") ? " (flat)" : ""} ${s.value} isn't a legal roll (legal: ${legal.join(" / ")}${key.endsWith("_FLAT") ? "" : " %"})`);
    }
    if (seen.has(key)) block(`substat ${statLabelOf(key)}${key.endsWith("_FLAT") ? " (flat)" : ""} appears twice`);
    seen.add(key);
  });
  if (raw.substats.length > 5) block(`${raw.substats.length} substats listed; an echo has at most 5 (rows after the fifth left out)`);
  if (level !== null && level >= 0 && raw.substats.length <= 5 && raw.substats.length > Math.floor(level / LEVELS_PER_TUNE)) {
    block(`${raw.substats.length} substats on a +${level} echo: one unlocks every ${LEVELS_PER_TUNE} levels`);
  } else if (level === 25 && raw.substats.length < 5) flags.push(`only ${raw.substats.length} substats on a +25 echo (untuned slots, or rows missed)`);

  if (raw.confidence < LOW_CONFIDENCE) flags.push(`Claude's confidence is low (${raw.confidence.toFixed(2)}): check every value`);

  const record: ScanRecord = {
    file,
    echo: entry?.key ?? null,
    echoName: entry?.name ?? null,
    echoScore,
    set,
    cost,
    level,
    rank,
    main,
    subs,
    flags,
    ocr: {
      name: raw.printedName,
      chip: raw.set ?? "",
      panel: [raw.mainStat, raw.secondaryStat, ...raw.substats].filter((s): s is { type: string; value: string } => s !== null).map((s) => `${s.type} ${s.value}`),
    },
    rows: [],
  };
  return { record, blocking, confidence: raw.confidence, notes: raw.notes, printedName: raw.printedName, equippedBy: raw.equippedBy, setPending };
}

/** Pass 2's answer for one echo → its set (or a flag). */
export function applySetMatch(read: ClaudeEchoRead, pick: unknown): void {
  const pending = read.setPending;
  if (!pending) return;
  read.setPending = null;
  const o = pick && typeof pick === "object" ? (pick as Record<string, unknown>) : {};
  const label = str(o.set);
  const confidence = typeof o.confidence === "number" && Number.isFinite(o.confidence) ? o.confidence : 0;
  const allowed = pending.candidates.map(setLabelOf).join(", ");
  const key = label ? visionVocab().setByName.get(norm(label)) : undefined;
  if (!label || label === NONE_OF_THESE || !key) {
    read.record.flags.push(`set glyph didn't match any of ${allowed}`);
    return;
  }
  if (!pending.candidates.includes(key)) {
    read.record.flags.push(`set ${setLabelOf(key)} from the glyph isn't one of ${allowed}`);
    return;
  }
  read.record.set = key;
  if (confidence < LOW_CONFIDENCE) read.record.flags.push(`set ${setLabelOf(key)} matched from the glyph with low confidence (${confidence.toFixed(2)})`);
}

/** Echo names without a "Phantom:" skin prefix (the OCR path drops it). */
const baseEchoName = (name: string | null): string => norm((name ?? "").replace(/^\s*phantom\s*:\s*/i, ""));

/** Where an OCR record and Claude's read of the same screenshot disagree (each line is a flag on the row). */
export function compareWithOcr(claude: ScanRecord, ocr: ScanRecord): string[] {
  const out: string[] = [];
  if (ocr.echo && claude.echo && baseEchoName(ocr.echoName) !== baseEchoName(claude.echoName)) out.push(`OCR read ${ocr.echoName}, Claude read ${claude.echoName}`);
  if (ocr.set && claude.set && ocr.set !== claude.set) out.push(`set: OCR read ${setLabelOf(ocr.set)}, Claude read ${setLabelOf(claude.set)}`);
  if (ocr.main && claude.main && ocr.main[0] !== claude.main[0]) out.push(`main stat: OCR read ${statLabelOf(ocr.main[0])}, Claude read ${statLabelOf(claude.main[0])}`);
  if (ocr.subs.length && claude.subs.length) {
    const line = ([k, val]: StatRow): string => `${statLabelOf(k)} ${val}`;
    const a = ocr.subs.map(line);
    const b = claude.subs.map(line);
    const onlyOcr = a.filter((x) => !b.includes(x));
    const onlyClaude = b.filter((x) => !a.includes(x));
    if (onlyOcr.length || onlyClaude.length) {
      out.push(`substats differ — OCR: ${onlyOcr.join(", ") || "—"}; Claude: ${onlyClaude.join(", ") || "—"}`);
    }
  }
  return out;
}

// ── the reader ────────────────────────────────────────────────────────────────────────────────

export interface VisionFailure {
  kind: VisionFailureKind | "api" | "aborted";
  message: string;
  retryable: boolean;
}

export type VisionImageResult =
  | { ok: true; screen: string; echoes: ClaudeEchoRead[]; usage: UsageTotals }
  | { ok: false; error: VisionFailure; usage: UsageTotals; skipped?: boolean };

export interface ReadEchoesOptions extends VisionRequestOptions {
  client: VisionClientLike;
  /** the SDK module, for typed error mapping */
  sdk?: AnthropicSdk | null;
  signal?: AbortSignal;
  /** screenshots in flight at once (default 2) */
  concurrency?: number;
  onImageStart?(image: VisionImage, index: number): void;
  onImageDone?(image: VisionImage, result: VisionImageResult, index: number): void;
}

const aborted = (signal?: AbortSignal): boolean => Boolean(signal?.aborted);

function failureOf(error: unknown, opts: ReadEchoesOptions): VisionFailure {
  const e = describeError(error, opts.sdk ?? null);
  if (e.kind === "aborted" || aborted(opts.signal)) return { kind: "aborted", message: "Stopped.", retryable: true };
  return { kind: "api", message: e.message, retryable: e.retryable };
}

async function matchSets(reads: ClaudeEchoRead[], screenshot: PreparedImage, opts: ReadEchoesOptions): Promise<UsageTotals> {
  const pending = reads.filter((r) => r.setPending);
  if (!pending.length) return emptyUsage();
  const targets: SetMatchTarget[] = [];
  for (const read of pending) {
    let crop: PreparedImage | null = null;
    const b = read.setPending?.box;
    if (b && screenshot.crop) {
      try {
        crop = await screenshot.crop(b);
      } catch {
        crop = null;
      }
    }
    targets.push({ echoName: read.record.echoName ?? read.printedName, candidates: read.setPending?.candidates ?? [], crop });
  }
  const message = await opts.client.beta.messages.create(buildSetMatchParams(targets, screenshot, opts), opts.signal ? { signal: opts.signal } : undefined);
  const usage = addUsage(emptyUsage(), opts.model, message.usage);
  const parsed = parseStructured(message);
  if (!parsed.ok) {
    for (const read of pending) {
      read.setPending = null;
      read.record.flags.push(`set glyph not matched: ${parsed.message}`);
    }
    return usage;
  }
  const answer = parsed.value && typeof parsed.value === "object" ? (parsed.value as Record<string, unknown>) : {};
  pending.forEach((read, i) => applySetMatch(read, answer[`echo_${i + 1}`]));
  return usage;
}

async function readOne(image: VisionImage, opts: ReadEchoesOptions): Promise<VisionImageResult> {
  let usage = emptyUsage();
  let prepared: PreparedImage | null = null;
  try {
    prepared = await image.load();
    const message = await opts.client.beta.messages.create(buildReadParams(prepared, opts), opts.signal ? { signal: opts.signal } : undefined);
    usage = addUsage(usage, opts.model, message.usage);
    const parsed = parseStructured(message);
    if (!parsed.ok) return { ok: false, error: { kind: parsed.kind, message: parsed.message, retryable: parsed.kind !== "refusal" }, usage };
    const payload = readPayloadOf(parsed.value);
    if (!payload) return { ok: false, error: { kind: "unreadable", message: "Claude's answer didn't have the expected shape. Try this screenshot again.", retryable: true }, usage };
    const reads = payload.echoes.map((raw, k) => mapClaudeEcho(raw, payload.echoes.length > 1 ? `${image.name} · ${k + 1}/${payload.echoes.length}` : image.name));
    if (reads.some((r) => r.setPending)) {
      try {
        usage = sumUsage(usage, await matchSets(reads, prepared, opts));
      } catch (error) {
        if (aborted(opts.signal)) throw error;
        const why = failureOf(error, opts).message;
        for (const read of reads) {
          if (!read.setPending) continue;
          read.setPending = null;
          read.record.flags.push(`set glyph not matched: ${why}`);
        }
      }
    }
    return { ok: true, screen: payload.screen, echoes: reads, usage };
  } catch (error) {
    return { ok: false, error: failureOf(error, opts), usage };
  } finally {
    prepared?.dispose?.();
  }
}

/**
 * Reads the screenshots, `concurrency` at a time (default 2), in order. Each result arrives through `onImageDone`
 * as soon as it's ready and in the returned array (same order as `images`). Abort with `signal`: requests in flight
 * are cancelled, screenshots not started come back `skipped`.
 */
export async function readEchoesWithClaude(images: readonly VisionImage[], opts: ReadEchoesOptions): Promise<VisionImageResult[]> {
  const results: VisionImageResult[] = images.map(() => ({ ok: false, error: { kind: "aborted", message: "Stopped.", retryable: true }, usage: emptyUsage(), skipped: true }));
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < images.length && !aborted(opts.signal)) {
      const index = next++;
      const image = images[index];
      opts.onImageStart?.(image, index);
      const result = await readOne(image, opts);
      results[index] = result;
      opts.onImageDone?.(image, result, index);
    }
  };
  const lanes = Math.max(1, Math.min(opts.concurrency ?? VISION_CONCURRENCY, images.length));
  await Promise.all(Array.from({ length: lanes }, worker));
  return results;
}
