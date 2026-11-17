// Wuthering Tools+ — builds that have two buffs on which the game does not allow together.
//
// Ryan marks such pairs in his data with `mutuallyExclusiveWith` (src/characters/mutuallyExclusiveBuffs.ts, his ADR
// 0031) and enforces it where a switch is flipped. Nothing re-reads a build that was saved before he marked a pair, so
// such a build keeps both on and every figure counts both. This module finds them: for every character, the build in
// the calculator and each other saved build, the pairs that are both on. It reads his field and names no buff itself,
// so a pair he marks later is found with no change here. It changes nothing: `withOnly` hands back a copy.
import { getCharByName } from "../../characters/characters";
import { getWeaponByName } from "../../weapons/weapons";
import { applyBuildFields, omitBuildMetadata } from "../../characters/buildFields";
import { buildBuffToggleUpdate, type BuffCategory, type CategoryToggleUpdates, type MutuallyExclusiveRef } from "../../characters/mutuallyExclusiveBuffs";

/** What the check reads of one of his definitions (a character buff, a resonance chain entry, a weapon passive). */
export interface ConflictDef {
  key: string;
  name?: string;
  details?: string;
  hasStacks?: boolean;
  appliesOnEveryStep?: number;
  alwaysEnabled?: boolean;
  mutuallyExclusiveWith?: MutuallyExclusiveRef[];
}

/** His definitions for one build: the character's own, and the passives of the weapon that build holds. */
export type ConflictDefs = Record<BuffCategory, ConflictDef[]>;

export interface ConflictSide {
  category: BuffCategory;
  key: string;
  /** his name for it; a weapon passive has none of its own and takes the weapon's */
  name: string;
  /** his description, as plain text */
  detail: string;
  /** stacks as saved, when it has stacks */
  stacks: number | null;
}

export interface BuffConflict {
  characterId: string;
  /** the build it sits on: null for a record with no builds list */
  buildId: string | null;
  buildName: string;
  /** the build the calculator and every page run, as opposed to another saved build */
  active: boolean;
  sides: [ConflictSide, ConflictSide];
}

const CATEGORIES: BuffCategory[] = ["buffs", "resonanceChains", "weaponPassives"];

/** His reference rule (his `resolveRef`, not exported): a plain key means the category of the definition naming it. */
function refOf(own: BuffCategory, ref: MutuallyExclusiveRef): { category: BuffCategory; key: string } {
  return typeof ref === "string" ? { category: own, key: ref } : { category: ref.category, key: ref.key };
}

const plainText = (html: string | undefined): string =>
  String(html ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** On, as the engine counts it: its switch is on (a weapon passive that is always on needs none), and one that stacks
 *  has at least one step of stacks. A switch left on at 0 stacks adds nothing, so it is no double count. */
export function isOn(category: BuffCategory, def: ConflictDef, config: Record<string, any> | null | undefined): boolean {
  const entry = config?.[def.key];
  const enabled = category === "weaponPassives" && def.alwaysEnabled ? true : Boolean(entry?.isEnabled);
  if (!enabled) return false;
  if (!def.hasStacks) return true;
  const stacks = Number(entry?.stacks ?? 0);
  const steps = def.appliesOnEveryStep ? Math.floor(stacks / def.appliesOnEveryStep) : stacks;
  return steps > 0;
}

function sideOf(category: BuffCategory, def: ConflictDef, config: Record<string, any> | null | undefined): ConflictSide {
  const stacks = def.hasStacks ? Number(config?.[def.key]?.stacks ?? 0) : null;
  return { category, key: def.key, name: String(def.name ?? def.key), detail: plainText(def.details), stacks };
}

/** The pairs that are both on in one build record and that his definitions mark exclusive, in his definitions' order.
 *  A pair only one side declares counts too: his data says they cannot be on together either way. */
export function conflictsIn(defs: ConflictDefs, record: Record<string, any> | null | undefined): Array<[ConflictSide, ConflictSide]> {
  const out: Array<[ConflictSide, ConflictSide]> = [];
  const seen = new Set<string>();
  const order = (category: BuffCategory, key: string): number => CATEGORIES.indexOf(category) * 10_000 + (defs[category] ?? []).findIndex((d) => d.key === key);
  for (const category of CATEGORIES) {
    for (const def of defs[category] ?? []) {
      if (!def.mutuallyExclusiveWith?.length || !isOn(category, def, record?.[category])) continue;
      for (const ref of def.mutuallyExclusiveWith) {
        const other = refOf(category, ref);
        const otherDef = (defs[other.category] ?? []).find((d) => d.key === other.key);
        if (!otherDef || (other.category === category && other.key === def.key)) continue;
        if (!isOn(other.category, otherDef, record?.[other.category])) continue;
        const pair: [ConflictSide, ConflictSide] = [sideOf(category, def, record?.[category]), sideOf(other.category, otherDef, record?.[other.category])];
        if (order(pair[0].category, pair[0].key) > order(pair[1].category, pair[1].key)) pair.reverse();
        const id = `${pair[0].category}:${pair[0].key}|${pair[1].category}:${pair[1].key}`;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(pair);
      }
    }
  }
  return out.sort((a, b) => order(a[0].category, a[0].key) - order(b[0].category, b[0].key) || order(a[1].category, a[1].key) - order(b[1].category, b[1].key));
}

export interface BuildRecord {
  buildId: string | null;
  buildName: string;
  active: boolean;
  /** the character record as that build runs: the live record for the active build, the saved fields laid over it for
   *  another one (a copy: `applyBuildFields` clones) */
  record: Record<string, any>;
}

/** Every build of a character as the engine would run it. The live record is the active build (its own `builds[]` entry
 *  is only refreshed when the store switches away from it, so the entry is not read); each other entry is a saved build. */
export function buildRecordsOf(data: Record<string, any> | null | undefined): BuildRecord[] {
  if (!data || typeof data !== "object") return [];
  const builds = (Array.isArray(data.builds) ? data.builds : []) as Array<Record<string, any>>;
  // with no activeBuildId the first entry stands in for the live record (accountState.ts reads it the same way)
  const activeId: string | null = data.activeBuildId ?? builds[0]?.id ?? null;
  const activeName = String(builds.find((b) => b?.id === activeId)?.name ?? "");
  const out: BuildRecord[] = [{ buildId: activeId, buildName: activeName, active: true, record: data }];
  for (const b of builds) {
    if (!b || b.id === activeId) continue;
    out.push({ buildId: b.id ?? null, buildName: String(b.name ?? ""), active: false, record: applyBuildFields(data, omitBuildMetadata(b)) });
  }
  return out;
}

/** Loads his definitions for a build record. The app's own loader is `appDefs`; a test hands in a made-up kit. */
// eslint-disable-next-line no-unused-vars -- the parameters of a function type
export type DefsLoader = (characterId: string, record: Record<string, any>) => Promise<ConflictDefs | null>;

/** His kit for the character and the passives of the weapon this build holds (they carry no name: the weapon's stands in). */
export const appDefs: DefsLoader = async (characterId, record) => {
  let kit: Record<string, any> | null;
  try {
    kit = (await getCharByName(characterId)) as Record<string, any> | null;
  } catch {
    return null; // not a character this app knows
  }
  if (!kit) return null;
  let weaponPassives: ConflictDef[] = [];
  const weaponKey = record?.weapon ? String(record.weapon) : null;
  if (weaponKey) {
    const weapon = (await getWeaponByName(kit.basic?.weapon ?? "Swords", weaponKey)) as Record<string, any> | undefined;
    weaponPassives = ((weapon?.info?.passiveData ?? []) as ConflictDef[]).map((p) => ({ ...p, name: String(weapon?.info?.name ?? weaponKey) }));
  }
  return { buffs: (kit.buffs ?? []) as ConflictDef[], resonanceChains: (kit.resonanceChains ?? []) as ConflictDef[], weaponPassives };
};

/** The conflicts on one character: the build in use first, then the other saved builds in their order. */
export async function conflictsOfCharacter(characterId: string, data: Record<string, any> | null | undefined, loader: DefsLoader = appDefs): Promise<BuffConflict[]> {
  const out: BuffConflict[] = [];
  for (const build of buildRecordsOf(data)) {
    const defs = await loader(characterId, build.record);
    if (!defs) continue;
    for (const sides of conflictsIn(defs, build.record)) out.push({ characterId, buildId: build.buildId, buildName: build.buildName, active: build.active, sides });
  }
  return out;
}

/** Every conflict on the account, characters in key order. Reads only: `characters` is not touched. */
export async function findBuffConflicts(characters: Record<string, Record<string, any>> | null | undefined, loader: DefsLoader = appDefs): Promise<BuffConflict[]> {
  const out: BuffConflict[] = [];
  for (const id of Object.keys(characters ?? {}).sort()) out.push(...(await conflictsOfCharacter(id, characters![id], loader)));
  return out;
}

export const conflictId = (c: BuffConflict): string => `${c.characterId}|${c.buildId ?? ""}|${c.sides[0].category}:${c.sides[0].key}|${c.sides[1].category}:${c.sides[1].key}`;

/** The record of the build a conflict sits on (the live record, or the saved build laid over it), or null when the
 *  build is gone. */
export function recordOf(conflict: BuffConflict, data: Record<string, any> | null | undefined): Record<string, any> | null {
  const builds = buildRecordsOf(data);
  return (conflict.active ? builds.find((b) => b.active) : builds.find((b) => !b.active && b.buildId === conflict.buildId))?.record ?? null;
}

/** A copy of `record` with only `keep` (0 or 1) of the pair left on: the other side's switch off, nothing else moved.
 *  For working out a figure. The record handed in is not changed. */
export function withOnly(record: Record<string, any>, conflict: BuffConflict, keep: 0 | 1): Record<string, any> {
  const off = conflict.sides[keep === 0 ? 1 : 0];
  return { ...record, [off.category]: { ...(record[off.category] ?? {}), [off.key]: { ...(record[off.category]?.[off.key] ?? {}), isEnabled: false } } };
}

/** The store update that keeps one side of the pair: his own toggle update for switching the kept side on (it switches
 *  off what that side declares exclusive), plus the other side off for a pair only the other side declares. Hand it to
 *  `characterStore.setCharacterData`, as his switches do. */
export function keepOnlyUpdate(conflict: BuffConflict, keep: 0 | 1, defs: ConflictDefs): CategoryToggleUpdates {
  const kept = conflict.sides[keep];
  const off = conflict.sides[keep === 0 ? 1 : 0];
  const def = (defs[kept.category] ?? []).find((d) => d.key === kept.key);
  const update = buildBuffToggleUpdate(kept.category, kept.key, true, def?.mutuallyExclusiveWith);
  update[off.category] = { ...(update[off.category] ?? {}), [off.key]: { isEnabled: false } };
  return update;
}

/** "Schemata of Runes" — or, when his two names are the same (Jiyan's two Forte Circuit entries, a weapon's two
 *  passives), the name with the start of his description so the two read apart. */
export function sideLabels(conflict: BuffConflict): [string, string] {
  const [a, b] = conflict.sides;
  if (a.name !== b.name) return [a.name, b.name];
  const clip = (s: ConflictSide): string => (s.detail ? `${s.name} ("${s.detail.length > 70 ? `${s.detail.slice(0, 67).trimEnd()}…` : s.detail}")` : `${s.name} (${s.key})`);
  return [clip(a), clip(b)];
}

/** The calculator section that holds the pair's switches: the weapon's for two weapon passives, else the character's. */
export const conflictScreen = (c: BuffConflict): "character" | "weapon" => (c.sides.every((s) => s.category === "weaponPassives") ? "weapon" : "character");
