// Wuthering Tools+ AI — what every tool shares: the tool type, the context it runs in, display names
// (Claude and the player read "Everbright Polestar", not "EverbrightPolestar"), rounding, loose name
// resolution and the result-size budget. Pure: runs in the browser and under Node (the CLI's `ask`).
import { characterPickerRoster, getCharacterRosterDisplayName } from "../../../characters/characters";
import { getWeaponsByType } from "../../../weapons/weapons";
import { mainEchoesData } from "../../../echoes/index";
import { echoSetLabelMap, subStatLabelMap } from "../../../echoes/stats";
import { resolveCharacterKey } from "../../cli/engine";
import type { ExportFile } from "../../cli/exportShape";
import type { ObjectSchema } from "../schema";

export interface ToolContext {
  /** the account: the live stores (src/sim/live/liveExport.ts) or a parsed export file (CLI) */
  exp: ExportFile;
  now: Date;
  /** teams: builds by name + team buffs from the real members (src/sim/teamContext); default true */
  autoBuffs?: boolean;
}

export interface AiTool<I = Record<string, unknown>> {
  name: string;
  /** what the tool returns, what the numbers mean and where they stop being right */
  description: string;
  input_schema: ObjectSchema;
  /** a short source label the UI shows beside numbers from this tool */
  provenance: string;
  /** returns compact JSON text (≈2K tokens at most); throws with a helpful message on bad input */
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  run(input: I, ctx: ToolContext): Promise<string>;
}

/** Loose typing at the registry boundary: each tool narrows its own input after validation. */
export type AnyAiTool = AiTool<any>;

export const defineTool = <I>(tool: AiTool<I>): AiTool<I> => tool;

// ── display names ─────────────────────────────────────────────────────────────────────────────

export const characterName = (key: string | null | undefined): string => (key ? getCharacterRosterDisplayName(key) : "—");

const WEAPON_TYPES = ["Swords", "Broadblades", "Rectifiers", "Pistols", "Gauntlets"] as const;
let weaponNames: Map<string, string> | null = null;
export function weaponName(key: string | null | undefined): string | null {
  if (!key) return null;
  if (!weaponNames) {
    weaponNames = new Map();
    for (const type of WEAPON_TYPES) {
      const list = getWeaponsByType(type) as unknown as Record<string, Array<{ key: string; name: string }>>;
      for (const bucket of Object.values(list ?? {})) for (const w of bucket ?? []) weaponNames.set(w.key, w.name);
    }
  }
  return weaponNames.get(key) ?? key;
}

export const echoName = (key: string | null | undefined): string | null => (key ? (mainEchoesData[key]?.name ?? key) : null);
export const setName = (key: string | null | undefined): string | null => (key ? (echoSetLabelMap[key] ?? key) : null);
export const statLabel = (key: string | null | undefined): string | null => (key ? (subStatLabelMap[key] ?? key) : null);

/** "S6 · Everbright Polestar R5" */
export function investmentLabel(sequence: number, weapon: string | null, refinement: number): string {
  return `S${sequence} · ${weapon ? `${weaponName(weapon)} R${refinement}` : "no weapon"}`;
}

// ── numbers ───────────────────────────────────────────────────────────────────────────────────

export const int = (n: number | null | undefined): number | null => (n == null || !Number.isFinite(n) ? null : Math.round(n));
export const round = (n: number | null | undefined, digits = 1): number | null => {
  if (n == null || !Number.isFinite(n)) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};
/** a relative gain (0.0213) as a percent number (2.13) */
export const pct = (gain: number | null | undefined, digits = 2): number | null => round(gain == null ? null : gain * 100, digits);
/** part of a whole as a percent number, 1 decimal */
export const share = (part: number, whole: number): number | null => (whole > 0 ? round((part / whole) * 100, 1) : null);

// ── names ─────────────────────────────────────────────────────────────────────────────────────

const squash = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** A character set up in this account, by loose name ("xuanling", "Yangyang: Xuanling"). Throws with the candidates. */
export function resolveOwnCharacter(input: string, exp: ExportFile): string {
  return resolveCharacterKey(input, exp.characters);
}

function ownKeyOrNull(input: string, exp: ExportFile): string | null {
  try {
    return resolveCharacterKey(input, exp.characters);
  } catch {
    return null; // not in this account (or ambiguous there): the caller tries the whole roster
  }
}

/** Any character the app knows (for kit / breakpoint questions about characters the player may not have). */
export function resolveAnyCharacter(input: string, exp: ExportFile): string {
  const own = ownKeyOrNull(input, exp);
  if (own) return own;
  const needle = squash(input);
  const roster = [...characterPickerRoster.five, ...characterPickerRoster.four];
  const exact = roster.filter((c) => squash(c.key) === needle || squash(c.name) === needle);
  if (exact.length === 1) return exact[0].key;
  const partial = roster.filter((c) => squash(c.key).includes(needle) || squash(c.name).includes(needle));
  if (partial.length === 1) return partial[0].key;
  if (partial.length > 1) throw new Error(`Ambiguous character "${input}": ${partial.map((c) => c.name).sort().join(", ")}`);
  throw new Error(`No character "${input}" in the app's roster`);
}

// ── result size ───────────────────────────────────────────────────────────────────────────────

/** ≈2K tokens of JSON. */
export const MAX_RESULT_CHARS = 8000;

function longestArray(value: unknown, path: Array<string | number> = [], best: { path: Array<string | number>; len: number } | null = null): { path: Array<string | number>; len: number } | null {
  if (Array.isArray(value)) {
    if (value.length > 1 && (!best || value.length > best.len)) best = { path, len: value.length };
    value.forEach((v, i) => (best = longestArray(v, [...path, i], best)));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) best = longestArray(v, [...path, k], best);
  }
  return best;
}

/** JSON text under `max` characters: the longest array is halved until it fits, and the result says so. */
export function compactJson(value: unknown, max = MAX_RESULT_CHARS): string {
  let text = JSON.stringify(value);
  if (text.length <= max) return text;
  const copy = JSON.parse(text) as Record<string, unknown>;
  const cut: string[] = [];
  for (let guard = 0; guard < 40 && text.length > max; guard++) {
    const hit = longestArray(copy);
    if (!hit) break;
    let parent: any = copy;
    for (const p of hit.path.slice(0, -1)) parent = parent[p];
    const last = hit.path[hit.path.length - 1];
    const arr: unknown[] = hit.path.length ? parent[last] : (copy as unknown as unknown[]);
    const keep = Math.max(1, Math.floor(arr.length / 2));
    arr.splice(keep);
    cut.push(hit.path.join(".") || "(root)");
    if (copy && typeof copy === "object" && !Array.isArray(copy)) (copy as Record<string, unknown>)._truncated = `lists shortened to fit: ${[...new Set(cut)].join(", ")}`;
    text = JSON.stringify(copy);
  }
  return text.length <= max ? text : text.slice(0, max - 1) + "…";
}

/** First `n` items plus how many were left out. */
export function topN<T>(items: T[], n: number): { items: T[]; omitted: number } {
  return { items: items.slice(0, n), omitted: Math.max(0, items.length - n) };
}

/** Clamp an optional integer input into [min, max] (strict schemas can't carry numeric bounds). */
export const clampInt = (v: number | undefined, min: number, max: number, fallback: number): number =>
  v == null || !Number.isFinite(v) ? fallback : Math.min(max, Math.max(min, Math.round(v)));

/** djb2 over a string → short base-36 key (memo keys for the slow tools). */
export function hashText(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** A fingerprint of everything the engine reads from an account. */
export const accountFingerprint = (exp: ExportFile): string => hashText(JSON.stringify([exp.characters, exp.inventory.echoes, exp.inventory.equipped, exp.teams]));
