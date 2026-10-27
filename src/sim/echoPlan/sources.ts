// Wuthering Tools+ — loads what wants.ts reads besides the stores: Ryan's curated echo presets (one lazy chunk per
// character's `presets.ts`, only its `echoes` export) and the generated wuwa_calc rotation presets (one lazy JSON
// chunk per character, through src/sim/presets). Only the characters on the plan are fetched. A character with neither
// gets a kit default, so their own character module is read for its role (`kitFactsOf`) — upstream's getCharByName,
// the same per-character chunk the calculator loads, so no new chunk is split off.
import { getCharByName } from "../../characters/characters";
import { loadWuwaCalcRotationPresets } from "../presets";
import { appKeyOf, rileyNameOf } from "../rankings/castMapper";
import { kitFactsOf, type CuratedPreset, type EnginePreset, type KitFacts } from "./wants";

// Under Vite (the app, vitest) `import.meta.glob` is rewritten at build time — it is never a runtime function, so the
// runtime tell is `import.meta.env` (see src/sim/presets/index.ts). Under plain Node nothing is loaded.
const underVite = typeof import.meta.env !== "undefined";
const curatedModules: Record<string, () => Promise<unknown>> = underVite
  ? import.meta.glob("../../characters/*/presets.ts", { import: "echoes" })
  : {};

export async function loadCuratedPresets(key: string): Promise<CuratedPreset[]> {
  const loader = curatedModules[`../../characters/${key}/presets.ts`];
  if (!loader) return [];
  const echoes = await loader();
  return Array.isArray(echoes) ? (echoes as CuratedPreset[]) : [];
}

/** A character's wuwa_calc presets: their own file, else their wuwa_calc twin's (both Rover genders are one kit). */
export async function loadEnginePresets(key: string): Promise<EnginePreset[]> {
  const own = (await loadWuwaCalcRotationPresets(key)) as EnginePreset[];
  if (own.length) return own;
  const twin = appKeyOf(rileyNameOf(key));
  return twin !== key ? ((await loadWuwaCalcRotationPresets(twin)) as EnginePreset[]) : [];
}

/** A kit default's role facts from the character's own data; null when it can't be read. */
export async function loadKitFacts(key: string): Promise<KitFacts | null> {
  return kitFactsOf(await getCharByName(key));
}

export interface LoadedSources {
  curated: Record<string, CuratedPreset[]>;
  engine: Record<string, EnginePreset[]>;
  /** role facts for the characters with no preset and no loadout (the kit-default ones) */
  kits: Record<string, KitFacts>;
  /** characters whose presets failed to load (a chunk fetch failed — offline, a stale deploy) */
  failed: string[];
}

/** Loads both sources for these characters, in parallel; a failure for one character never sinks the rest. */
export async function loadSources(keys: string[]): Promise<LoadedSources> {
  const out: LoadedSources = { curated: {}, engine: {}, kits: {}, failed: [] };
  await Promise.all(
    [...new Set(keys)].map(async (key) => {
      const [curated, engine] = await Promise.allSettled([loadCuratedPresets(key), loadEnginePresets(key)]);
      if (curated.status === "fulfilled") out.curated[key] = curated.value;
      if (engine.status === "fulfilled") out.engine[key] = engine.value.map((p) => ({ name: p.name, description: p.description }));
      if (curated.status === "rejected" || engine.status === "rejected") out.failed.push(key);
      else if (!out.curated[key]!.length && !out.engine[key]!.length) {
        // nothing to read a build from: the kit default needs the role (a missing role only means the plain default)
        const kit = await loadKitFacts(key).catch(() => null);
        if (kit) out.kits[key] = kit;
      }
    }),
  );
  out.failed.sort();
  return out;
}
