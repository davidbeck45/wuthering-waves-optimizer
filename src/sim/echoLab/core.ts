// Wuthering Tools+ Echo Lab — the shared core of the engine-backed echo decisions (best owner, Tune or
// Feed, Transducer re-roll advice, benchmark score). Every number comes from the app's own damage engine:
// a character is scored on their best rotation exactly as /my-rankings picks it (`rotationCandidates` +
// `scoreRotation`, Riley's level-100 / 20 % RES target), and every hypothetical build is a *clone* of the
// account data scored through `calcCharacterRotationDamage` — a swap goes through upstream's own
// `resolveCandidateEchoPointersConfig` (echoImpact.ts), so set bonuses that break or complete, newly active
// set passives and the main-echo buff are recomputed the way the v3 swap badges do it.
// Pure/async, worker-safe: no Vue, no stores, no DOM. Plain objects and functions.
import { resolveCharacterEchoes, type TeamEnemyConfig } from "../../calculator/buildCharacterContext";
import { calcCharacterRotationDamage, type CharacterRotationInput } from "../../calculator/characterRotation";
import { getCharByName } from "../../characters/characters";
import { resolveCandidateEchoPointersConfig } from "../../echoes/echoImpact";
import { getSetBonusEffects } from "../../echoes/sets";
import { getEchoStats, type EchoObject } from "../../echoes/stats";
import { RANKING_ENEMY, isSetUp, rotationCandidates, scoreRotation, type RotationSource } from "../myRankings/rankRoster";
import { SUBSTAT_KEYS, expectedRoll, withSubstat, type SubstatKey } from "../substats/substatWeights";
import { accountFingerprint } from "./fingerprint";

/** What the lab reads: the stores' plain data (or an export file's). Never mutated. */
export interface LabAccount {
  characters: Record<string, any>;
  /** the inventory echoes */
  echoes: any[];
  /** the inventory's `equipped` map: echoId → { characterId: slot } */
  equipped?: Record<string, Record<string, number>>;
  teams?: any[];
}

export const SUB_FIELDS = [1, 2, 3, 4, 5] as const;
export const typeField = (n: number): string => `echoSubStatsType${n}`;
export const valueField = (n: number): string => `echoSubStatsValue${n}`;

/** One substat line of an echo: the field it sits in (1-5), its kind and its value. */
export interface EchoLine {
  field: number;
  key: string;
  value: number;
}

/** The substat lines an echo carries (a type and a non-zero value — what `getEchoStats` counts). */
export function echoLines(echo: Record<string, any> | null | undefined): EchoLine[] {
  const out: EchoLine[] = [];
  for (const n of SUB_FIELDS) {
    const key = echo?.[typeField(n)];
    const value = Number(echo?.[valueField(n)]);
    if (key && value) out.push({ field: n, key: String(key), value });
  }
  return out;
}

export const echoCost = (echo: Record<string, any> | null | undefined): number | null => {
  const n = Number(echo?.type);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const hasEcho = (echo: Record<string, any> | null | undefined): boolean =>
  Boolean(echo && (echo.echoId || echo.echo || echo.type || echoLines(echo).length));

/** A copy of an echo record with its substat lines replaced by `lines` (fields 1.. in order, the rest blank). */
export function withLines(echo: Record<string, any>, lines: Array<{ key: string; value: number }>): Record<string, any> {
  const next: Record<string, any> = { ...echo };
  SUB_FIELDS.forEach((n, i) => {
    next[typeField(n)] = lines[i]?.key ?? null;
    next[valueField(n)] = lines[i]?.value ?? null;
  });
  return next;
}

/** Stat totals of one echo (main stat at max level, the fixed flat secondary, substats). */
export const statsOf = (echo: Record<string, any>): Record<string, number> => getEchoStats(echo as EchoObject);

/** One of a character's five echo slots as the engine reads it. */
export interface LabSlot {
  slot: number;
  echoId: string | null;
  /** the slot points at an inventory echo (else it carries its own inline echo data) */
  fromInventory: boolean;
  record: Record<string, any>;
  species: string | null;
  cost: number | null;
  set: string | null;
}

/** A built character as the lab scores them: their best rotation, its damage, their slots, caches. */
export interface LabCharacter {
  id: string;
  name: string;
  rotation: CharacterRotationInput;
  rotationName: string;
  rotationSource: RotationSource;
  /** average damage of the best rotation on the build as it is */
  base: number;
  slots: Array<LabSlot | null>;
  /** five echoes, each with a cost */
  complete: boolean;
  totalCost: number;
  /** the player pinned the set bonus (`setOverride`): swaps never change it */
  setPinned: boolean;
  /** relative gain per point of a stat (finite difference on the build), by stat key — filled lazily */
  perPoint: Map<string, number>;
  /** relative gain of a set-bonus change at a slot, by `slot|outcome` — filled lazily */
  setDelta: Map<string, number>;
}

export interface LabSession {
  account: LabAccount;
  enemy: TeamEnemyConfig;
  fingerprint: string;
  echoById: Map<string, any>;
  /** prepared characters (null = skipped, reason in `skipped`) */
  prepared: Map<string, LabCharacter | null>;
  skipped: Map<string, string>;
  /** engine scorings run so far (the cost unit of every lab job) */
  scorings: number;
  /** finished per-echo analyses another job can reuse on the same account (re-roll advice by character, slot, options) */
  memo: Map<string, unknown>;
}

export interface LabSessionOptions {
  enemy?: TeamEnemyConfig;
  /** echoes to consider that are not in the inventory yet (fresh scans): appended to it for scoring */
  extraEchoes?: any[];
  /** a precomputed fingerprint (the worker host already has one) */
  fingerprint?: string;
}

export function createLabSession(account: LabAccount, options: LabSessionOptions = {}): LabSession {
  const extra = (options.extraEchoes ?? []).filter((e) => e?.echoId && !account.echoes.some((x) => x?.echoId === e.echoId));
  const merged: LabAccount = extra.length ? { ...account, echoes: [...account.echoes, ...extra] } : account;
  return {
    account: merged,
    enemy: options.enemy ?? RANKING_ENEMY,
    fingerprint: options.fingerprint ?? accountFingerprint(merged),
    echoById: new Map(merged.echoes.filter((e) => e?.echoId).map((e) => [String(e.echoId), e])),
    prepared: new Map(),
    skipped: new Map(),
    scorings: 0,
    memo: new Map(),
  };
}

/** Characters the lab can score: a weapon equipped (the /my-rankings bar), sorted by key. */
export const builtCharacterIds = (account: LabAccount): string[] =>
  Object.keys(account.characters ?? {}).filter((id) => isSetUp(account.characters[id])).sort();

/** The character's slots as the engine resolves them (inventory pointer first, inline data else). */
export function labSlots(characterData: Record<string, any>, echoes: any[]): Array<LabSlot | null> {
  const stored = (characterData?.echoes ?? {}) as Record<string, any>;
  const resolved = resolveCharacterEchoes(stored, echoes);
  const ids = new Set(echoes.map((e) => e?.echoId));
  return resolved.map((record, slot) => {
    if (!hasEcho(record)) return null;
    const pointer = stored?.[slot]?.echoId ?? null;
    const fromInventory = Boolean(pointer) && record?.echoId === pointer && ids.has(pointer);
    return {
      slot,
      echoId: record?.echoId ?? null,
      fromInventory,
      record,
      species: record?.echo ?? null,
      cost: echoCost(record),
      set: record?.echoSet ?? null,
    };
  });
}

/** Scores the character's best rotation on a (cloned) build: average damage. */
export async function scoreBuild(session: LabSession, lab: LabCharacter, characters: Record<string, any>, echoes: any[]): Promise<number> {
  session.scorings += 1;
  const result = await calcCharacterRotationDamage(lab.rotation, null, lab.id, characters, session.enemy, echoes);
  return result.damageAggregation.avgDamage ?? 0;
}

export const relGain = (base: number, value: number): number => (base > 0 ? value / base - 1 : 0);

/**
 * Prepares one character: their best rotation (every saved, curated and wuwa_calc rotation scored on the
 * build, the highest average wins — /my-rankings' pick) and their slots. Null when the character can't be
 * scored (no weapon, unknown to the app, no rotation resolves); the reason lands in `session.skipped`.
 */
export async function prepareCharacter(session: LabSession, id: string, pace?: Pacer): Promise<LabCharacter | null> {
  if (session.prepared.has(id)) return session.prepared.get(id) ?? null;
  const skip = (reason: string): null => {
    session.prepared.set(id, null);
    session.skipped.set(id, reason);
    return null;
  };
  const { characters, echoes } = session.account;
  const data = characters?.[id];
  if (!isSetUp(data)) return skip("no weapon equipped");
  let name: string;
  try {
    name = ((await getCharByName(id)) as any)?.basic?.name ?? id;
  } catch {
    return skip("not a character this app knows");
  }
  let best: { rotation: CharacterRotationInput; name: string; source: RotationSource; avg: number } | null = null;
  for (const candidate of await rotationCandidates(id, data)) {
    try {
      session.scorings += 1;
      const score = await scoreRotation(candidate.rotation, id, characters, session.enemy, echoes);
      if (!best || score.avgDamage > best.avg) best = { rotation: candidate.rotation, name: candidate.name, source: candidate.source, avg: score.avgDamage };
    } catch {
      /* a rotation that does not resolve on this build is skipped, as /my-rankings does */
    }
    await pace?.();
  }
  if (!best || !(best.avg > 0)) return skip("no rotation scores on this build");
  const slots = labSlots(data, echoes);
  const lab: LabCharacter = {
    id,
    name,
    rotation: best.rotation,
    rotationName: best.name,
    rotationSource: best.source,
    base: best.avg,
    slots,
    complete: slots.every((s) => s && s.cost),
    totalCost: slots.reduce((sum, s) => sum + (s?.cost ?? 0), 0),
    setPinned: Boolean(data.setOverride),
    perPoint: new Map(),
    setDelta: new Map(),
  };
  session.prepared.set(id, lab);
  return lab;
}

/**
 * A clone of the account's characters with inventory echo `echoId` equipped in `slot` of the lab character —
 * upstream's swap recompute (set bonus, newly active set passives, main echo for slot 0). `echoes` must
 * contain `echoId` (a hypothetical record may stand in under the real id).
 */
export function swapInto(session: LabSession, lab: LabCharacter, echoes: any[], echoId: string, slot: number, characters = session.account.characters): Record<string, any> {
  const data = characters?.[lab.id] ?? {};
  const pointers = { ...(data.echoes ?? {}), [slot]: { echoId } };
  return resolveCandidateEchoPointersConfig(lab.id, characters, pointers, slot === 0, echoes).syntheticCharacters;
}

/** A copy of the inventory with one echo's record replaced (same id), or appended when it is not there. */
export function withInventoryRecord(echoes: any[], record: Record<string, any>): any[] {
  let found = false;
  const next = echoes.map((e) => {
    if (e?.echoId === record.echoId) {
      found = true;
      return record;
    }
    return e;
  });
  return found ? next : [...next, record];
}

/**
 * A clone with the record in one of the lab character's slots replaced by `record` (the same echo with other
 * lines — no set or species change): the inventory echo for a pointer slot, the inline data otherwise.
 */
export function withSlotRecord(session: LabSession, lab: LabCharacter, slot: number, record: Record<string, any>): { characters: Record<string, any>; echoes: any[] } {
  const { characters, echoes } = session.account;
  const s = lab.slots[slot];
  if (s?.fromInventory) return { characters, echoes: withInventoryRecord(echoes, { ...record, echoId: s.echoId }) };
  const data = characters?.[lab.id] ?? {};
  const stored = data.echoes ?? {};
  const nextSlots: Record<string, any> = Array.isArray(stored) ? [...stored] : { ...stored };
  nextSlots[slot] = { ...record, echoId: null };
  return { characters: { ...characters, [lab.id]: { ...data, echoes: nextSlots } }, echoes };
}

/**
 * What a swap may not do to a build, beyond the game's own rules. The engine is static and scores a
 * character's own damage, so three things a build is made of read as worthless to it: Energy Regen (no
 * energy model), set bonuses that buff the *team* (a support's Moonlit Clouds or Rejuvenating Glow
 * 5-piece) and Healing Bonus (healing is not damage). Left alone, every support would "gain" by trading
 * their ER main stat and team set for ATK, and every healer by trading their Healing Bonus main echo for
 * a Crit DMG copy of it (Verina, Shorekeeper on David's export).
 */
export interface SwapRules {
  /** a swap must keep every set bonus the build has active (it may add one); default true */
  keepSetBonuses?: boolean;
  /** Energy Regen the swap may cost the build, in points; default 12.4 (one best ER substat roll); null = no floor */
  erTolerance?: number | null;
  /** a swap may not lower the build's Healing Bonus (a healer's Healing Bonus main stat); default true */
  keepHealingBonus?: boolean;
}

export const DEFAULT_ER_TOLERANCE = 12.4;

/** why the swap rules close a slot: an active set bonus would break, too much Energy Regen lost, Healing Bonus lost */
export type SlotBlock = "set" | "er" | "heal";

export interface SlotCheck {
  slot: number;
  blocked: SlotBlock | null;
  /** Energy Regen the swap adds (negative: costs) */
  erChange: number;
}

const activeBonuses = (sets: Array<string | null>): string[] => {
  const b = getSetBonusEffects(sets);
  return [b.setBonusOnePiece, b.setBonusOne, b.setBonusTwo].filter((x): x is string => Boolean(x));
};

const erOf = (record: Record<string, any> | null | undefined): number => (record ? statsOf(record).EnergyRegen ?? 0 : 0);
const healOf = (record: Record<string, any> | null | undefined): number => (record ? statsOf(record).HealingBonus ?? 0 : 0);

/**
 * The slots of a character an echo could go into, and whether `rules` block them. The game's rules first:
 * same cost; the main-echo slot (0) only takes another copy of the same echo (a different main echo is a
 * different build — the optimizer's territory); a species at most once per build (the optimizer's rule; the
 * game counts a duplicate only once toward its Sonata). None when the character already wears the echo.
 */
export function slotChecks(lab: LabCharacter, echo: Record<string, any>, rules: SwapRules = {}): SlotCheck[] {
  const cost = echoCost(echo);
  if (!cost) return [];
  if (lab.slots.some((s) => s?.echoId && s.echoId === echo.echoId)) return [];
  const keepSets = (rules.keepSetBonuses ?? true) && !lab.setPinned;
  const tolerance = rules.erTolerance === undefined ? DEFAULT_ER_TOLERANCE : rules.erTolerance;
  const keepHeal = rules.keepHealingBonus ?? true;
  const sets = lab.slots.map((s) => s?.set ?? null);
  const before = keepSets ? activeBonuses(sets) : [];
  const out: SlotCheck[] = [];
  for (let i = 0; i < 5; i++) {
    const s = lab.slots[i];
    if (!s || s.cost !== cost) continue;
    if (i === 0 && s.species !== (echo.echo ?? null)) continue;
    if (echo.echo && lab.slots.some((o, j) => j !== i && o?.species === echo.echo)) continue;
    const erChange = erOf(echo) - erOf(s.record);
    let blocked: SlotBlock | null = null;
    if (keepSets && before.length) {
      const next = [...sets];
      next[i] = echo.echoSet ?? null;
      const after = new Set(activeBonuses(next));
      if (before.some((b) => !after.has(b))) blocked = "set";
    }
    if (!blocked && tolerance !== null && erChange < -tolerance - 1e-9) blocked = "er";
    if (!blocked && keepHeal && healOf(echo) < healOf(s.record) - 1e-9) blocked = "heal";
    out.push({ slot: i, blocked, erChange });
  }
  return out;
}

/** The slots an echo may go into under `rules` (see `slotChecks`). */
export const legalSlots = (lab: LabCharacter, echo: Record<string, any>, rules: SwapRules = {}): number[] =>
  slotChecks(lab, echo, rules)
    .filter((c) => !c.blocked)
    .map((c) => c.slot);

const SUBSTAT_SET = new Set<string>(SUBSTAT_KEYS);

/**
 * What one point of a stat is worth on the character's build: the best rotation scored with an expected roll
 * of it (10 points for a stat that is not a substat — an element or Healing Bonus main stat) on an equipped
 * echo, as a relative gain per point. Memoised per character.
 */
export async function perPointOf(session: LabSession, lab: LabCharacter, key: string): Promise<number> {
  const memo = lab.perPoint.get(key);
  if (memo !== undefined) return memo;
  const value = SUBSTAT_SET.has(key) ? expectedRoll(key as SubstatKey) : 10;
  let per: number;
  try {
    const clone = withSubstat(lab.id, session.account.characters, session.account.echoes, key as SubstatKey, value);
    const avg = await scoreBuild(session, lab, clone.characters, clone.inventoryEchoes);
    per = relGain(lab.base, avg) / value;
  } catch {
    per = 0;
  }
  lab.perPoint.set(key, per);
  return per;
}

/** A linear estimate of a stat change on the build: Σ perPoint × Δ (relative). */
export async function linearGain(session: LabSession, lab: LabCharacter, delta: Record<string, number>): Promise<number> {
  let sum = 0;
  for (const [key, d] of Object.entries(delta)) {
    if (!d) continue;
    sum += (await perPointOf(session, lab, key)) * d;
  }
  return sum;
}

export function statDelta(next: Record<string, number>, prev: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of new Set([...Object.keys(next), ...Object.keys(prev)])) {
    const d = (next[key] ?? 0) - (prev[key] ?? 0);
    if (Math.abs(d) > 1e-9) out[key] = d;
  }
  return out;
}

const setKey = (bonus: Record<string, any>): string =>
  JSON.stringify([bonus.setBonusOnePiece ?? null, bonus.setBonusOne ?? null, bonus.setBonusTwo ?? null]);

/**
 * The exact relative gain of the set-bonus change an echo of `set` makes at `slot` — scored once per distinct
 * outcome (the slot's own echo relabelled to that set, so only the bonus moves). 0 when the bonus selection
 * does not change, or the character pins their bonus (`setOverride`, which the swap recompute respects).
 */
export async function setDeltaOf(session: LabSession, lab: LabCharacter, slot: number, set: string | null): Promise<number> {
  const data = session.account.characters?.[lab.id] ?? {};
  if (data.setOverride) return 0;
  const sets = lab.slots.map((s) => s?.set ?? null);
  const before = setKey(getSetBonusEffects(sets));
  const nextSets = [...sets];
  nextSets[slot] = set;
  const after = setKey(getSetBonusEffects(nextSets));
  if (before === after) return 0;
  const memoKey = `${slot}|${after}`;
  const memo = lab.setDelta.get(memoKey);
  if (memo !== undefined) return memo;
  const own = lab.slots[slot];
  let delta = 0;
  if (own) {
    const probe = { ...own.record, echoId: "__echolab_set_probe__", echoSet: set };
    const echoes = withInventoryRecord(session.account.echoes, probe);
    try {
      const characters = swapInto(session, lab, echoes, probe.echoId, slot);
      delta = relGain(lab.base, await scoreBuild(session, lab, characters, echoes));
    } catch {
      delta = 0;
    }
  }
  lab.setDelta.set(memoKey, delta);
  return delta;
}

/** Who wears an echo: the inventory's `equipped` map and the characters' slot pointers (stale map entries flagged). */
export interface WornBy {
  characterId: string;
  slot: number;
  /** the inventory map says so, but the character's slot points at another echo */
  stale: boolean;
}

export function wornByIndex(account: LabAccount): Map<string, WornBy[]> {
  const index = new Map<string, WornBy[]>();
  const add = (echoId: string, entry: WornBy): void => {
    const list = index.get(echoId) ?? [];
    const same = list.find((w) => w.characterId === entry.characterId && w.slot === entry.slot);
    if (same) same.stale = same.stale && entry.stale;
    else list.push(entry);
    index.set(echoId, list);
  };
  for (const [id, data] of Object.entries(account.characters ?? {})) {
    const stored = (data?.echoes ?? {}) as Record<string, any>;
    for (let slot = 0; slot < 5; slot++) {
      const echoId = stored?.[slot]?.echoId;
      if (echoId) add(String(echoId), { characterId: id, slot, stale: false });
    }
  }
  for (const [echoId, map] of Object.entries(account.equipped ?? {})) {
    for (const [characterId, slot] of Object.entries(map ?? {})) {
      const pointer = (account.characters?.[characterId]?.echoes as Record<string, any> | undefined)?.[slot]?.echoId;
      add(echoId, { characterId, slot: Number(slot), stale: pointer !== echoId });
    }
  }
  return index;
}

// ── pacing: progress, cancel, yielding to the event loop (a worker must yield for its cancel message) ──

export interface LabProgress {
  phase: string;
  done: number;
  total: number;
  label?: string;
}

export interface RunControl {
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  onProgress?: (progress: LabProgress) => void;
  shouldCancel?: () => boolean;
  /** yield to the event loop at least this often, in ms (default 25; 0 = never) */
  yieldMs?: number;
}

export const CANCELLED = "EchoLabCancelled";

export function cancelledError(): Error {
  const err = new Error("Echo Lab job cancelled");
  err.name = CANCELLED;
  return err;
}

export const isCancelled = (err: unknown): boolean => err instanceof Error && err.name === CANCELLED;

// eslint-disable-next-line no-unused-vars -- the parameters of a function type
export type Pacer = (progress?: LabProgress) => Promise<void>;

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** A pacer: call it after each unit of work. Throws the cancel error, yields now and then, throttles progress. */
export function makePacer(control: RunControl = {}): Pacer {
  const yieldMs = control.yieldMs ?? 25;
  let lastYield = now();
  let lastProgress = -Infinity;
  let lastPhase = "";
  return async (progress) => {
    if (control.shouldCancel?.()) throw cancelledError();
    const t = now();
    if (yieldMs > 0 && t - lastYield >= yieldMs) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      lastYield = now();
      if (control.shouldCancel?.()) throw cancelledError();
    }
    if (progress && control.onProgress && (progress.phase !== lastPhase || progress.done >= progress.total || t - lastProgress >= 50)) {
      lastProgress = t;
      lastPhase = progress.phase;
      control.onProgress(progress);
    }
  };
}

/** Weighted quantile of (value, weight) pairs (weights need not sum to 1). */
export function weightedQuantile(pairs: Array<[number, number]>, q: number): number {
  if (!pairs.length) return 0;
  const sorted = [...pairs].sort((a, b) => a[0] - b[0]);
  const total = sorted.reduce((s, [, w]) => s + w, 0);
  const target = q * total;
  let seen = 0;
  for (const [value, weight] of sorted) {
    seen += weight;
    if (seen >= target - 1e-12) return value;
  }
  return sorted[sorted.length - 1][0];
}
