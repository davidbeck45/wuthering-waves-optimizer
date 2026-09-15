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
import { rileyNameOf } from "../rankings/castMapper";

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

export function hasWuwaCalcRotationPresets(characterKey: string): boolean {
  return `./data/rotations/${characterKey}.json` in rotationModules;
}

export async function loadWuwaCalcRotationPresets(
  characterKey: string,
): Promise<CharacterRotationPreset[]> {
  if (!underVite) return nodeRotationLoader(characterKey);
  const loader = rotationModules[`./data/rotations/${characterKey}.json`];
  if (!loader) {
    return [];
  }
  return (await loader()).default;
}

let teamPresetsPromise: Promise<TeamRotationPreset[]> | null = null;

/** The generated S6R5 full-team rotations, loaded once on first use. */
export function loadWuwaCalcTeamPresets(): Promise<TeamRotationPreset[]> {
  teamPresetsPromise ??= import("./data/teams.json").then(
    (m) => m.default as unknown as TeamRotationPreset[],
  );
  return teamPresetsPromise;
}

// ---------------------------------------------------------------- sequence breakpoints (Track I phase 2)

/** One wuwa_calc loadout's loop map: the sequence levels at which the declared loop switches, and what each switch
 *  adds and drops in the steady-state loop. */
export interface BreakpointLoadout {
  label: string;
  /** the lowest sequence the loadout declares a loop for (a build below it has no loop in Riley's solver) */
  minSequence: number;
  loopChangesAt: number[];
  /** per switching level: what the steady-state loop adds and drops; `note` names another chain that differs
   *  ("first visit: adds Forte Basic - Iai ×1") or says the casts merely changed order */
  changes: Record<string, { added: string[]; removed: string[]; note?: string }>;
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

/** "S0–S2 run the base loop; S3 switches it (adds …; drops …)" — one line per loadout for the rotation modal. */
export function describeBreakpoints(l: BreakpointLoadout): string {
  const parts: string[] = [];
  if (l.minSequence > 0) parts.push(`no loop below S${l.minSequence}`);
  if (!l.loopChangesAt.length) return parts.length ? `${parts[0]}; one loop from S${l.minSequence} up` : "one loop at every sequence";
  let from = l.minSequence;
  for (const n of l.loopChangesAt) {
    const c = l.changes[String(n)] ?? { added: [], removed: [] };
    const what = [c.added.length ? `adds ${c.added.join(", ")}` : "", c.removed.length ? `drops ${c.removed.join(", ")}` : "", c.note ?? ""].filter(Boolean).join("; ");
    parts.push(`${from === n - 1 ? `S${from}` : `S${from}–S${n - 1}`} run${from === n - 1 ? "s" : ""} the ${from === l.minSequence ? "base" : `S${from}`} loop; S${n} switches it${what ? ` (${what})` : ""}`);
    from = n;
  }
  return parts.join(". ");
}
