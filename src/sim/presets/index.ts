// Wuthering Tools+: stock rotation / team presets generated from Riley31415's
// wuwa_calc (S6R5 solves executed by his engine, mapped onto this app's
// attack keys by ~/Projects/wuwa-tools/rotation-port/emit_app_presets.py).
// The JSON under ./data is GENERATED — never edit it by hand; regenerate it
// with the tool after a wuwa_calc bump or an upstream character-data change.
// Consumers: CalculatorRotations.vue (Rotation presets modal),
// TeamRotationTeamEditor.vue (team-slot import dialog), TeamRotations.vue
// (Teams > List Presets). The calculator engine itself never loads these —
// getCharByName stays exactly upstream's.
import type { CharacterRotationPreset } from "../../characters/rotationExportImport";
import type { TeamRotationPreset } from "../../teamRotations/presets";
import { accountKeyOf, appKeyOf, rileyNameOf } from "../rankings/rileyNames";

/** Author tag carried by every preset generated from wuwa_calc. */
export const WUWA_CALC_AUTHOR = "Riley31415 (wuwa_calc)";

/** One JSON chunk per character, loaded only when that character's presets are asked for. */
type RotationModules = Record<string, () => Promise<{ default: CharacterRotationPreset[] }>>;
// Under Vite (the app, vitest) `import.meta.glob(...)` is rewritten at build time — it is never a
// runtime function, so the only reliable runtime tell is `import.meta.env`, which Vite defines and plain
// Node does not. The plus CLI runs this module under tsx (`npm run cli`), where the generated JSON is
// read from disk instead — see nodeRotationLoader.
const underVite = typeof import.meta.env !== "undefined";
const rotationModules: RotationModules = underVite
  ? import.meta.glob<{ default: CharacterRotationPreset[] }>("./data/rotations/*.json")
  : {};

async function nodeRotationLoader(characterKey: string): Promise<CharacterRotationPreset[]> {
  const [{ readFile }, { fileURLToPath }, { dirname, join }] = await Promise.all([
    import(/* @vite-ignore */ "node:fs/promises"),
    import(/* @vite-ignore */ "node:url"),
    import(/* @vite-ignore */ "node:path"),
  ]);
  const file = join(dirname(fileURLToPath(import.meta.url)), "data", "rotations", `${characterKey}.json`);
  try {
    return JSON.parse(await readFile(file, "utf8")) as CharacterRotationPreset[];
  } catch {
    return [];
  }
}

/** The key a character's generated loops are filed under: their own, or for a male Rover the female form's (wuwa_calc
 *  has one Rover per element and the generator writes it under the female key; both genders are one kit). */
const presetFileKeyOf = (characterKey: string): string => appKeyOf(rileyNameOf(characterKey));

export function hasWuwaCalcRotationPresets(characterKey: string): boolean {
  return `./data/rotations/${characterKey}.json` in rotationModules || `./data/rotations/${presetFileKeyOf(characterKey)}.json` in rotationModules;
}

async function loadRotationFile(fileKey: string): Promise<CharacterRotationPreset[]> {
  if (!underVite) return nodeRotationLoader(fileKey);
  const loader = rotationModules[`./data/rotations/${fileKey}.json`];
  if (!loader) {
    return [];
  }
  return (await loader()).default;
}

/** A character's wuwa_calc loops: their own file, else the one their kit is filed under (`presetFileKeyOf`). The
 *  fallback lives here, in the loader, so every reader gets it: the rankings' rotation pick, the calculator's Rotation
 *  presets modal, the team editor's import dialog and the Echo plan (which had its own copy of it). */
export async function loadWuwaCalcRotationPresets(
  characterKey: string,
): Promise<CharacterRotationPreset[]> {
  const own = await loadRotationFile(characterKey);
  if (own.length) return own;
  const fileKey = presetFileKeyOf(characterKey);
  return fileKey !== characterKey ? loadRotationFile(fileKey) : [];
}

let teamPresetsPromise: Promise<TeamRotationPreset[]> | null = null;

/** The generated S6R5 full-team rotations, loaded once on first use. */
export function loadWuwaCalcTeamPresets(): Promise<TeamRotationPreset[]> {
  teamPresetsPromise ??= import("./data/teams.json").then(
    (m) => m.default as unknown as TeamRotationPreset[],
  );
  return teamPresetsPromise;
}

/**
 * A stock team as this account fields it: each member under the key the account plays (`accountKeyOf`: a male Rover for
 * the female key the presets carry), in `characterIds` and in `handoffs` (who hands off to whom, keyed by character).
 * The actions name slots, not characters, so they are untouched. The preset itself when nothing changes; never mutated.
 */
export function teamPresetForAccount<T extends TeamRotationPreset>(preset: T, characters: Record<string, any> | null | undefined): T {
  const ids = (preset.data.characterIds ?? []) as Array<string | null>;
  const mapped = ids.map((id) => (id ? accountKeyOf(id, characters) : id));
  if (mapped.every((id, i) => id === ids[i])) return preset;
  const renamed = new Map<string, string>();
  ids.forEach((id, i) => {
    if (id && mapped[i] && id !== mapped[i]) renamed.set(id, mapped[i] as string);
  });
  const rename = (id: string): string => renamed.get(id) ?? id;
  const data = preset.data as T["data"] & { handoffs?: Record<string, string[]> | null };
  const handoffs = data.handoffs ? Object.fromEntries(Object.entries(data.handoffs).map(([from, to]) => [rename(from), (to ?? []).map(rename)])) : data.handoffs;
  return { ...preset, data: { ...preset.data, characterIds: mapped, ...(data.handoffs !== undefined ? { handoffs } : {}) } };
}

// ---------------------------------------------------------------- sequence breakpoints (Track I phase 2)

/** One wuwa_calc loadout's loop map: the sequence levels at which the declared loop switches, and what each switch
 *  adds and drops in the steady-state loop. */
export interface BreakpointLoadout {
  label: string;
  /** the lowest sequence the loadout declares a loop for (a build below it has no loop in Riley's solver) */
  minSequence: number;
  loopChangesAt: number[];
  /** per switching level: `kind` says what changed — "loop" (the steady-state loop presses different casts:
   *  `added` / `removed`), "order" (the same casts in another order), "chain" (the loop is the same and only another
   *  chain differs, named in `note`: opener, first visit, start of combat) */
  changes: Record<string, { kind: "loop" | "order" | "chain"; added: string[]; removed: string[]; note?: string }>;
  intendedTeams: number;
}

export interface ResonatorBreakpoints {
  appKey: string;
  loadouts: BreakpointLoadout[];
  /** the resonance-chain pieces, S1 first, with Riley's own note on each */
  sequences: Array<{ level: number; name: string; note: string }>;
}

interface BreakpointsFile {
  generated: string;
  wuwaCalcCommit: string | null;
  resonators: Record<string, ResonatorBreakpoints>;
}

let breakpointsPromise: Promise<BreakpointsFile> | null = null;

async function nodeJson<T>(name: string): Promise<T | null> {
  const [{ readFile }, { fileURLToPath }, { dirname, join }] = await Promise.all([
    import(/* @vite-ignore */ "node:fs/promises"),
    import(/* @vite-ignore */ "node:url"),
    import(/* @vite-ignore */ "node:path"),
  ]);
  try {
    return JSON.parse(await readFile(join(dirname(fileURLToPath(import.meta.url)), "data", name), "utf8")) as T;
  } catch {
    return null;
  }
}

/** The GENERATED sequence-breakpoints table (`wuwa-tools/rotation-port/export_breakpoints.mjs`, kept in
 *  `wuwa-tools/knowledge/`): for one character, which sequences change each of Riley's loadouts' loop and what the
 *  sequence pieces do. Keyed by Riley's resonator name, so both Rover forms read the same entry. */
export function loadSequenceBreakpoints(characterKey: string): Promise<ResonatorBreakpoints | null> {
  breakpointsPromise ??= underVite
    ? import("./data/breakpoints.json").then((m) => m.default as unknown as BreakpointsFile)
    : nodeJson<BreakpointsFile>("breakpoints.json").then((d) => d ?? { generated: "", wuwaCalcCommit: null, resonators: {} });
  return breakpointsPromise.then((d) => d.resonators[rileyNameOf(characterKey)] ?? null);
}

/** "S0–S2 run the base loop; S3 switches it (adds …; drops …)" — one line per loadout for the rotation modal. A
 *  level that only changes an opener or start-of-combat chain says so, since the loop the player presses is the same. */
export function describeBreakpoints(l: BreakpointLoadout): string {
  const parts: string[] = [];
  if (l.minSequence > 0) parts.push(`no loop below S${l.minSequence}`);
  if (!l.loopChangesAt.length) return parts.length ? `${parts[0]}; one loop from S${l.minSequence} up` : "one loop at every sequence";
  let from = l.minSequence;
  for (const n of l.loopChangesAt) {
    const c = l.changes[String(n)] ?? { kind: "loop", added: [], removed: [] };
    const what = [c.added.length ? `adds ${c.added.join(", ")}` : "", c.removed.length ? `drops ${c.removed.join(", ")}` : "", c.note ?? ""].filter(Boolean).join("; ");
    const span = `${from === n - 1 ? `S${from}` : `S${from}–S${n - 1}`} run${from === n - 1 ? "s" : ""} the ${from === l.minSequence ? "base" : `S${from}`} loop`;
    const verb = c.kind === "order" ? `S${n} reorders it (same casts)` : c.kind === "chain" ? `S${n} changes only the opener / start of combat, the loop stays` : `S${n} switches it`;
    parts.push(`${span}; ${verb}${what ? ` (${what})` : ""}`);
    from = n;
  }
  return parts.join(". ");
}
