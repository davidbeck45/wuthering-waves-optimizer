// Wuthering Tools+ phase E: rank YOUR roster — every character and team you
// have set up, scored with this app's own damage engine on your real builds
// (weapon, echoes, chains, buffs), the way Riley's comparison table ranks
// his solved picks. Pure/async; the page (MyRankingsView.vue) only renders.
import { getCharByName } from "../../characters/characters";
import { getWeaponsByType } from "../../weapons/weapons";
import { calcCharacterRotationDamage, type CharacterRotationInput } from "../../calculator/characterRotation";
import { calcTeamRotationDamage, type TeamRotationAction } from "../../calculator/teamRotation";
import { resolveTeamEnemyConfig, type TeamEnemyConfig } from "../../calculator/buildCharacterContext";
import { teamRotationPresets } from "../../teamRotations/presets";
import { loadWuwaCalcRotationPresets, loadWuwaCalcTeamPresets } from "../presets";
import { resolveTeamCharacters } from "../teamContext/resolveTeam";

export type RotationSource = "yours" | "curated" | "wuwa_calc";

export interface RotationScore {
  name: string;
  source: RotationSource;
  avgDamage: number;
  normalDamage: number;
  critDamage: number;
  /** average damage per second when the rotation carries a duration */
  dps: number | null;
}

export interface InvestmentDelta {
  label: string;
  avgDamage: number;
  /** relative gain over the current best, e.g. 0.12 for +12 % */
  gain: number;
}

export interface CharacterRank {
  id: string;
  name: string;
  sequence: number;
  refinement: number;
  weapon: string | null;
  rotationsEvaluated: number;
  best: RotationScore | null;
  /** the rotation behind `best`, for what-if builds */
  bestRotation: CharacterRotationInput | null;
  rotations: RotationScore[];
  nextSequence: InvestmentDelta | null;
  refineFive: InvestmentDelta | null;
  errors: string[];
}

export interface TeamRank {
  id: string;
  name: string;
  source: RotationSource;
  characterIds: string[];
  avgDamage: number;
  perSlot: number[];
  dps: number | null;
  /** members ranked without a weapon (their slot understates) */
  unarmed: string[];
}

export interface RosterRanking {
  enemy: TeamEnemyConfig;
  characters: CharacterRank[];
  teams: TeamRank[];
  teamsSkipped: number;
  computedAt: string;
}

export interface RankOptions {
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  onProgress?: (done: number, total: number, label: string) => void;
  /** also estimate the next sequence node and R5 for each character's best rotation (slower) */
  investment?: boolean;
  /** keep the UI responsive between calculations */
  yieldToUi?: boolean;
  /** teams: builds by name + team buffs from the real members (src/sim/teamContext); default true */
  autoTeamBuffs?: boolean;
}

/** Riley's target, so numbers sit beside the /rankings page: a level-100 enemy with 20 % resistance, no stacks. */
export const RANKING_ENEMY: TeamEnemyConfig = resolveTeamEnemyConfig({ enemyLevel: 100, enemyResist: 0.2, enemyType: "Calamity" });

const yieldNow = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** The sequence node a chain entry belongs to: keys read "SequenceNode3…", "Sequence3…" or "S3…" (0 when none). */
export function nodeOf(key: string): number {
  const m = /^(?:SequenceNode|Sequence|S)([1-6])(?![0-9])/.exec(key);
  return m ? Number(m[1]) : 0;
}

/** The highest sequence node with an enabled chain entry (0 when none). */
export function sequenceOf(characterData: Record<string, any> | undefined): number {
  let best = 0;
  for (const [key, value] of Object.entries((characterData?.resonanceChains ?? {}) as Record<string, any>)) {
    const node = nodeOf(key);
    if (node && value?.isEnabled) best = Math.max(best, node);
  }
  return best;
}

export function refinementOf(characterData: Record<string, any> | undefined): number {
  const weapon = characterData?.weapon;
  const r = weapon ? characterData?.weapons?.[weapon]?.refinement : null;
  const n = Number(r ?? 1);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** A character counts as set up when it has a weapon equipped — the same bar Riley's loadouts set. */
export const isSetUp = (characterData: Record<string, any> | undefined): boolean => Boolean(characterData?.weapon);

let rotationId = 0;
const withIds = (actions: any[]): any[] => actions.map((a) => ({ ...a, id: a.id ?? `rr-${rotationId++}`, buffs: a.buffs ?? [] }));

async function rotationCandidates(id: string, characterData: Record<string, any>): Promise<Array<{ name: string; source: RotationSource; rotation: CharacterRotationInput }>> {
  const out: Array<{ name: string; source: RotationSource; rotation: CharacterRotationInput }> = [];
  for (const r of (characterData.rotations ?? []) as any[]) {
    if (!r?.actions?.length) continue;
    out.push({ name: r.name, source: "yours", rotation: { id: r.id ?? `yours-${out.length}`, name: r.name, description: r.description, duration: r.duration ?? null, actions: withIds(r.actions) } });
  }
  const chosen = (await getCharByName(id)) as Record<string, any> | null;
  for (const p of (chosen?.rotations ?? []) as any[]) {
    const actions = p?.data?.actions;
    if (!actions?.length) continue;
    out.push({ name: p.name, source: "curated", rotation: { id: `curated-${out.length}`, name: p.name, description: p.description, duration: p.data?.duration ?? null, actions: withIds(actions) } });
  }
  for (const p of await loadWuwaCalcRotationPresets(id)) {
    const actions = (p.data as any)?.actions;
    if (!actions?.length) continue;
    out.push({ name: p.name, source: "wuwa_calc", rotation: { id: `wuwa-${out.length}`, name: p.name, description: p.description, duration: null, actions: withIds(actions) } });
  }
  return out;
}

async function scoreRotation(rotation: CharacterRotationInput, id: string, characters: Record<string, any>, enemy: TeamEnemyConfig, echoes: any[]): Promise<Omit<RotationScore, "name" | "source">> {
  const result = await calcCharacterRotationDamage(rotation, null, id, characters, enemy, echoes);
  const agg = result.damageAggregation;
  const seconds = Number(rotation.duration);
  return {
    avgDamage: agg.avgDamage ?? 0,
    normalDamage: agg.normalDamage ?? 0,
    critDamage: agg.critDamage ?? 0,
    dps: Number.isFinite(seconds) && seconds > 0 ? (agg.avgDamage ?? 0) / seconds : null,
  };
}

/** A copy of the character with the next sequence node's chains enabled (first entry of a node when it has variants). */
async function withNextSequence(id: string, characterData: Record<string, any>, sequence: number): Promise<Record<string, any> | null> {
  if (sequence >= 6) return null;
  const chosen = (await getCharByName(id)) as Record<string, any> | null;
  const defs: any[] = chosen?.resonanceChains ?? [];
  const next = sequence + 1;
  const seen = new Set<number>();
  const chains: Record<string, any> = { ...(characterData.resonanceChains ?? {}) };
  let changed = false;
  for (const def of defs) {
    const node = nodeOf(String(def?.key ?? ""));
    if (node !== next) continue;
    if (seen.has(node)) continue; // variants of the same node: only the base entry
    seen.add(node);
    chains[def.key] = { ...(chains[def.key] ?? {}), isEnabled: true, ...(def.hasStacks ? { stacks: def.maxStacks ?? chains[def.key]?.stacks ?? 1 } : {}) };
    changed = true;
  }
  return changed ? { ...characterData, resonanceChains: chains } : null;
}

/** A copy of the character AT sequence `target`: nodes up to it enabled (the base entry of a node with variants, entries already on kept), nodes above it off. */
export async function withSequence(id: string, characterData: Record<string, any>, target: number): Promise<Record<string, any>> {
  const chosen = (await getCharByName(id)) as Record<string, any> | null;
  const defs: any[] = chosen?.resonanceChains ?? [];
  const chains: Record<string, any> = { ...(characterData.resonanceChains ?? {}) };
  const enabledNodes = new Set<number>();
  for (const [key, value] of Object.entries(chains)) if (value?.isEnabled && nodeOf(key) && nodeOf(key) <= target) enabledNodes.add(nodeOf(key));
  const seen = new Set<number>();
  for (const def of defs) {
    const node = nodeOf(String(def?.key ?? ""));
    if (!node) continue;
    if (node > target) {
      if (chains[def.key]?.isEnabled) chains[def.key] = { ...chains[def.key], isEnabled: false };
      continue;
    }
    if (enabledNodes.has(node) || seen.has(node)) continue;
    seen.add(node);
    chains[def.key] = { ...(chains[def.key] ?? {}), isEnabled: true, ...(def.hasStacks ? { stacks: def.maxStacks ?? chains[def.key]?.stacks ?? 1 } : {}) };
  }
  return { ...characterData, resonanceChains: chains };
}

/** A copy of the character wielding `weaponKey` (default: the equipped one) at `refinement` (default: as stored, else R1). */
export function withWeapon(characterData: Record<string, any>, weaponKey: string | null, refinement?: number): Record<string, any> {
  const key = weaponKey ?? characterData.weapon;
  if (!key) return characterData;
  const prev = characterData.weapons?.[key] ?? {};
  return { ...characterData, weapon: key, weapons: { ...(characterData.weapons ?? {}), [key]: { ...prev, refinement: String(refinement ?? prev.refinement ?? 1) } } };
}

export interface WeaponOption {
  key: string;
  name: string;
  rarity: number;
}

/** Every weapon of the character's type, five-stars first. */
export async function weaponOptionsFor(id: string): Promise<WeaponOption[]> {
  const chosen = (await getCharByName(id)) as Record<string, any> | null;
  const type: string = chosen?.basic?.weapon ?? "Swords";
  const list = getWeaponsByType(type) as unknown as Record<string, Array<{ key: string; name: string }>>;
  const out: WeaponOption[] = [];
  for (const [bucket, rarity] of [["five", 5], ["four", 4], ["three", 3], ["two", 2], ["one", 1]] as const) {
    for (const w of list?.[bucket] ?? []) out.push({ key: w.key, name: w.name, rarity });
  }
  return out;
}

export interface WhatIfOptions {
  sequence?: number;
  /** a weapon key; undefined keeps the equipped weapon */
  weapon?: string;
  refinement?: number;
}

export interface WhatIfResult {
  label: string;
  avgDamage: number;
  /** the same rotation on the build as it is */
  base: number;
  gain: number;
  rotation: string;
}

/** One hypothetical build — sequence, weapon, refinement — scored on the same rotation as the character's real build. */
export async function whatIf(id: string, characters: Record<string, any>, inventoryEchoes: any[], rotation: CharacterRotationInput, options: WhatIfOptions): Promise<WhatIfResult> {
  const data = characters[id] ?? {};
  const base = await scoreRotation(rotation, id, characters, RANKING_ENEMY, inventoryEchoes);
  let hypo = data;
  if (options.sequence !== undefined && options.sequence !== sequenceOf(data)) hypo = await withSequence(id, hypo, options.sequence);
  if (options.weapon !== undefined || options.refinement !== undefined) hypo = withWeapon(hypo, options.weapon ?? null, options.refinement);
  const scored = await scoreRotation(rotation, id, { ...characters, [id]: hypo }, RANKING_ENEMY, inventoryEchoes);
  const label = `S${options.sequence ?? sequenceOf(data)} · ${hypo.weapon ?? "no weapon"} R${refinementOf(hypo)}`;
  return { label, avgDamage: scored.avgDamage, base: base.avgDamage, gain: base.avgDamage > 0 ? scored.avgDamage / base.avgDamage - 1 : 0, rotation: rotation.name };
}

function withRefineFive(characterData: Record<string, any>): Record<string, any> | null {
  const weapon = characterData.weapon;
  if (!weapon || refinementOf(characterData) >= 5) return null;
  return { ...characterData, weapons: { ...(characterData.weapons ?? {}), [weapon]: { ...(characterData.weapons?.[weapon] ?? {}), refinement: "5" } } };
}

export async function rankRoster(
  characters: Record<string, any>,
  inventoryEchoes: any[],
  teams: any[],
  options: RankOptions = {},
): Promise<RosterRanking> {
  const enemy = RANKING_ENEMY;
  const ids = Object.keys(characters ?? {}).filter((id) => isSetUp(characters[id])).sort();
  const wuwaTeams = await loadWuwaCalcTeamPresets();
  const teamCandidates: Array<{ id: string; name: string; source: RotationSource; team: { name: string; characterIds: string[]; actions: TeamRotationAction[]; duration: number | string | null } }> = [];
  let teamsSkipped = 0;
  // a team ranks when its three members exist in your data; members without a weapon are flagged, not excluded
  const owned = (cids: Array<string | null>): cids is string[] => cids.length === 3 && cids.every((c) => !!c && !!characters[c]);
  for (const t of teams ?? []) {
    if (!t?.actions?.length || !owned(t.characterIds ?? [])) { teamsSkipped += 1; continue; }
    teamCandidates.push({ id: t.id, name: t.name, source: "yours", team: { name: t.name, characterIds: t.characterIds, actions: t.actions, duration: t.duration ?? null } });
  }
  for (const [source, list] of [["curated", teamRotationPresets], ["wuwa_calc", wuwaTeams]] as const) {
    for (const p of list) {
      const actions = (p.data.actions ?? []) as TeamRotationAction[];
      if (!actions.length || !owned(p.data.characterIds)) continue;
      teamCandidates.push({ id: `${source}:${p.name}`, name: p.name, source, team: { name: p.name, characterIds: p.data.characterIds as string[], actions, duration: p.data.duration ?? null } });
    }
  }
  const total = ids.length + teamCandidates.length;
  let done = 0;
  const progress = (label: string): void => options.onProgress?.(done, total, label);

  const characterRanks: CharacterRank[] = [];
  for (const id of ids) {
    const data = characters[id] ?? {};
    let name: string;
    try {
      name = ((await getCharByName(id)) as any)?.basic?.name ?? id;
    } catch {
      done += 1;
      continue; // not a character this app knows
    }
    progress(name);
    const rank: CharacterRank = {
      id,
      name,
      sequence: sequenceOf(data),
      refinement: refinementOf(data),
      weapon: data.weapon ?? null,
      rotationsEvaluated: 0,
      best: null,
      bestRotation: null,
      rotations: [],
      nextSequence: null,
      refineFive: null,
      errors: [],
    };
    let bestCandidate: { name: string; source: RotationSource; rotation: CharacterRotationInput } | null = null;
    try {
      const candidates = await rotationCandidates(id, data);
      for (const c of candidates) {
        try {
          const score = await scoreRotation(c.rotation, id, characters, enemy, inventoryEchoes);
          const entry: RotationScore = { name: c.name, source: c.source, ...score };
          rank.rotations.push(entry);
          rank.rotationsEvaluated += 1;
          if (!rank.best || entry.avgDamage > rank.best.avgDamage) { rank.best = entry; rank.bestRotation = c.rotation; bestCandidate = c; }
        } catch (err) {
          rank.errors.push(`${c.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      rank.rotations.sort((a, b) => b.avgDamage - a.avgDamage);
      if (options.investment && rank.best && bestCandidate) {
        const base = rank.best.avgDamage;
        const nextData = await withNextSequence(id, data, rank.sequence);
        if (nextData && base > 0) {
          try {
            const s = await scoreRotation(bestCandidate.rotation, id, { ...characters, [id]: nextData }, enemy, inventoryEchoes);
            rank.nextSequence = { label: `S${rank.sequence + 1}`, avgDamage: s.avgDamage, gain: s.avgDamage / base - 1 };
          } catch { /* estimate only */ }
        }
        const r5Data = withRefineFive(data);
        if (r5Data && base > 0) {
          try {
            const s = await scoreRotation(bestCandidate.rotation, id, { ...characters, [id]: r5Data }, enemy, inventoryEchoes);
            rank.refineFive = { label: "R5", avgDamage: s.avgDamage, gain: s.avgDamage / base - 1 };
          } catch { /* estimate only */ }
        }
      }
    } catch (err) {
      rank.errors.push(err instanceof Error ? err.message : String(err));
    }
    characterRanks.push(rank);
    done += 1;
    if (options.yieldToUi !== false) await yieldNow();
  }
  characterRanks.sort((a, b) => (b.best?.avgDamage ?? -1) - (a.best?.avgDamage ?? -1));

  const teamRanks: TeamRank[] = [];
  for (const c of teamCandidates) {
    progress(c.name);
    try {
      const resolution = await resolveTeamCharacters(c.team, characters, inventoryEchoes, { auto: options.autoTeamBuffs ?? true, enemyConfig: enemy });
      const result = await calcTeamRotationDamage(
        { ...c.team, buildIds: resolution.auto ? resolution.buildIds : undefined },
        resolution.characters,
        enemy,
        inventoryEchoes,
      );
      const seconds = Number(c.team.duration);
      teamRanks.push({
        id: c.id,
        name: c.name,
        source: c.source,
        characterIds: c.team.characterIds,
        avgDamage: result.total.avgDamage ?? 0,
        perSlot: c.team.characterIds.map((cid) => result.perCharacter[cid]?.damageAggregation?.avgDamage ?? 0),
        dps: Number.isFinite(seconds) && seconds > 0 ? result.dps?.avg ?? null : null,
        unarmed: c.team.characterIds.filter((cid) => !isSetUp(characters[cid])),
      });
    } catch {
      teamsSkipped += 1;
    }
    done += 1;
    if (options.yieldToUi !== false) await yieldNow();
  }
  teamRanks.sort((a, b) => b.avgDamage - a.avgDamage);
  progress("done");
  return { enemy, characters: characterRanks, teams: teamRanks, teamsSkipped, computedAt: new Date().toISOString() };
}
