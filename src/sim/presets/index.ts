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

/** Author tag carried by every preset generated from wuwa_calc. */
export const WUWA_CALC_AUTHOR = "Riley31415 (wuwa_calc)";

/** One JSON chunk per character, loaded only when that character's presets are asked for. */
type RotationModules = Record<string, () => Promise<{ default: CharacterRotationPreset[] }>>;
// `import.meta.glob` exists only under Vite (the app, vitest). The plus CLI runs this module under
// plain tsx (`npm run cli`), where the generated JSON is read from disk instead — see nodeRotationLoader.
const rotationModules: RotationModules =
  typeof import.meta.glob === "function"
    ? import.meta.glob<{ default: CharacterRotationPreset[] }>("./data/rotations/*.json")
    : {};
const underVite = typeof import.meta.glob === "function";

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
