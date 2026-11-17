// Wuthering Tools+ — "What each level is worth": the level-ups a character has left, as steps the calculator can hold
// and the damage engine reads, with what each one costs.
//
// Pure: the upgrade-cost table (materials/data/materials.json) and one character's store record in, plain data out.
// The gains are levelPlan.ts.
//
// Seven tracks, the ones the calculator saves a level for and the engine reads (buildCharacterContext.ts):
//   level       `characterLevel`: "1", "20", "20+", … "90" ("+" = ascended at that cap); base HP / ATK / DEF and the
//               level term of every hit's defence factor
//   weapon      `weapons[<weapon>].weaponLevel`, the same strings; the weapon's ATK and its second stat
//   basic / skill / forte / liberation / intro   `talents.<key>`, 1–10: each attack's multiplier is read at the level
//               of the skill the attack belongs to
// A level or weapon step runs to the next cap and carries the ascension it needs ("70 → 80" pays the ascension at 70,
// then ten levels of EXP), so every step ends on a value the calculator's own picker writes. A Forte step is one level.
// The inherent skills and the eight stat bonuses are switches in the calculator (Buffs), not levels: they are not
// steps here; Cost to max prices them.
//
// Costs are never tabled here: a step costs what Cost to max has left before it minus what it has left after it
// (`costToMax` twice), so the steps of a track add up to Cost to max's figure for that part to the credit.
import { costToMax, FORTE_SKILLS, parseLevel, type CostToMax, type ForteKey, type LevelStep, type MaterialLine, type MaterialsData, type SavedProgress } from "../materials/costToMax";

/** every value the calculator's level pickers write, in order */
export const LEVEL_OPTIONS = ["1", "20", "20+", "40", "40+", "50", "50+", "60", "60+", "70", "70+", "80", "80+", "90"] as const;
/** the levels a resonator or weapon stops at until it ascends */
export const LEVEL_CAPS: readonly number[] = [20, 40, 50, 60, 70, 80, 90];
export const TOP_LEVEL = 90;
export const TOP_FORTE = 10;

export type TrackKey = "level" | "weapon" | ForteKey;

export const FORTE_KEYS: readonly ForteKey[] = FORTE_SKILLS.map((s) => s.key);

/** The tracks in the order the drawer lists what is saved: level, weapon, then the five Forte skills as the game orders them. */
export const TRACKS: ReadonlyArray<{ key: TrackKey; label: string }> = [{ key: "level", label: "Level" }, { key: "weapon", label: "Weapon level" }, ...FORTE_SKILLS.map((s) => ({ key: s.key as TrackKey, label: s.label }))];

export const trackLabel = (key: TrackKey): string => TRACKS.find((t) => t.key === key)?.label ?? key;
export const isForteTrack = (key: TrackKey): key is ForteKey => key !== "level" && key !== "weapon";

/** What the engine would run: one value per track. */
export interface LevelState {
  level: LevelStep;
  /** null: no weapon equipped, or the cost table has no entry for the one equipped (its level is then left alone) */
  weapon: LevelStep | null;
  talents: Record<ForteKey, number>;
}

export interface LevelsToday {
  state: LevelState;
  /** tracks whose value the calculator has not saved, so its own default (the top) stands in */
  assumed: TrackKey[];
  weaponKey: string | null;
  /** the equipped weapon's last level (90, or 70 for a 1★ / 2★ weapon); null without a weapon the table knows */
  weaponTop: number | null;
  /** a weapon is equipped and the cost table has no entry for it */
  weaponMissing: boolean;
}

/** "70+" for level 70 ascended; the top never carries a plus. */
export function stepText(step: LevelStep, top = TOP_LEVEL): string {
  return `${step.level}${step.ascended && step.level < top ? "+" : ""}`;
}

const isOption = (text: string): boolean => (LEVEL_OPTIONS as readonly string[]).includes(text);

/** A saved level, when it is one the engine has stats for: the pickers only write `LEVEL_OPTIONS`, and any other
 *  string reads as no base stats at all. Anything else counts as not saved. */
function savedStep(value: string | null, top: number): LevelStep | null {
  if (!value || !isOption(value)) return null;
  const step = parseLevel(value);
  if (!step || step.level > top) return null;
  return { level: step.level, ascended: step.ascended && step.level < top };
}

/**
 * Where the character stands: what the calculator saved (`savedProgressOf`), each gap filled the way the calculator
 * fills it (level 90, Forte 10, the weapon's last level) and flagged in `assumed`; or level 1 across the board
 * (`from: "scratch"`, a new pull with a new weapon).
 */
export function levelsToday(data: MaterialsData, saved: SavedProgress, from: "saved" | "scratch" = "saved"): LevelsToday {
  const entry = saved.weapon ? data.weapons[saved.weapon] : undefined;
  const weaponTop = entry ? entry.max : null;
  const scratch = from === "scratch";
  const assumed: TrackKey[] = [];
  const one: LevelStep = { level: 1, ascended: false };

  const level = scratch ? null : savedStep(saved.level, TOP_LEVEL);
  if (!scratch && !level) assumed.push("level");

  let weapon: LevelStep | null = null;
  if (weaponTop != null) {
    const w = scratch ? null : savedStep(saved.weaponLevel, weaponTop);
    if (!scratch && !w) assumed.push("weapon");
    weapon = scratch ? one : (w ?? { level: weaponTop, ascended: false });
  }

  const talents = {} as Record<ForteKey, number>;
  for (const key of FORTE_KEYS) {
    const v = saved.talents[key];
    if (!scratch && v == null) assumed.push(key);
    talents[key] = scratch ? 1 : (v ?? TOP_FORTE);
  }

  return {
    state: { level: scratch ? one : (level ?? { level: TOP_LEVEL, ascended: false }), weapon, talents },
    assumed,
    weaponKey: saved.weapon,
    weaponTop,
    weaponMissing: Boolean(saved.weapon) && weaponTop == null,
  };
}

/** A state from loose input ("80", "70+", 6): the CLI's and the assistant's "what if I stood here". Unknown values throw. */
export function stateFrom(today: LevelsToday, levels: Partial<Record<TrackKey, string | number>>): LevelState {
  const next: LevelState = { level: today.state.level, weapon: today.state.weapon, talents: { ...today.state.talents } };
  for (const [key, raw] of Object.entries(levels) as Array<[TrackKey, string | number]>) {
    if (raw == null) continue;
    const text = String(raw).trim();
    if (key === "level" || key === "weapon") {
      const top = key === "level" ? TOP_LEVEL : today.weaponTop;
      if (top == null) throw new Error("No weapon level to set: no weapon equipped, or the cost table has no entry for it");
      const step = savedStep(text, top);
      if (!step) throw new Error(`${trackLabel(key)} must be one of ${LEVEL_OPTIONS.filter((o) => (parseLevel(o)?.level ?? 99) <= top).join(", ")} (got "${text}")`);
      next[key] = step;
    } else if (FORTE_KEYS.includes(key)) {
      const v = Number(text);
      if (!Number.isInteger(v) || v < 1 || v > TOP_FORTE) throw new Error(`${trackLabel(key)} must be 1 to ${TOP_FORTE} (got "${text}")`);
      next.talents[key] = v;
    } else {
      throw new Error(`Unknown level "${key}": use ${TRACKS.map((t) => t.key).join(", ")}`);
    }
  }
  return next;
}

/** The values a level picker offers up to `top`: every `LEVEL_OPTIONS` entry below it, then the top itself (which
 *  cannot be ascended further, so "70+" is not offered for a weapon that stops at 70). */
export function levelOptions(top: number = TOP_LEVEL): string[] {
  return LEVEL_OPTIONS.filter((o) => {
    const step = parseLevel(o)!;
    return step.level < top || (step.level === top && !step.ascended);
  });
}

/** A state as the strings the pickers hold, by track (the weapon left out when there is none). */
export function stateLevels(today: Pick<LevelsToday, "weaponTop">, state: LevelState): Partial<Record<TrackKey, string>> {
  const out: Partial<Record<TrackKey, string>> = { level: stepText(state.level) };
  if (state.weapon) out.weapon = stepText(state.weapon, today.weaponTop ?? TOP_LEVEL);
  for (const key of FORTE_KEYS) out[key] = String(state.talents[key]);
  return out;
}

/** "level=80,weapon=70+,basic=6" → levels by track, for `stateFrom` (the CLI's --at, the assistant's `levels`). Throws
 *  on a track it does not know; `what` names the input in the message. */
export function parseLevels(text: string, what = "levels"): Partial<Record<TrackKey, string>> {
  const out: Partial<Record<TrackKey, string>> = {};
  for (const part of text.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [key, value] = part.split("=").map((s) => s.trim());
    if (!key || !value || !TRACKS.some((t) => t.key === key)) throw new Error(`${what} takes ${TRACKS.map((t) => `${t.key}=…`).join(",")} (got "${part}")`);
    out[key as TrackKey] = value;
  }
  if (!Object.keys(out).length) throw new Error(`${what} needs at least one level, e.g. level=80,liberation=6`);
  return out;
}

/** The character's record as the engine would read it at `state`: the three fields the calculator's pickers write. */
export function withLevels(characterData: Record<string, any>, state: LevelState, weaponTop: number | null = TOP_LEVEL): Record<string, any> {
  const next: Record<string, any> = {
    ...characterData,
    characterLevel: stepText(state.level),
    talents: { ...(characterData?.talents ?? {}), ...state.talents },
  };
  const weapon: string | null = characterData?.weapon ?? null;
  if (weapon && state.weapon) {
    next.weapons = { ...(characterData.weapons ?? {}), [weapon]: { ...(characterData.weapons?.[weapon] ?? {}), weaponLevel: stepText(state.weapon, weaponTop ?? TOP_LEVEL) } };
  }
  return next;
}

/* ---------------------------------------------------------------------------------------------- costs */

export interface LevelCost {
  /** every Shell Credit of the step: the materials' own and what feeding the EXP costs */
  credits: number;
  /** EXP to feed, by whose it is */
  resonatorExp: number;
  weaponExp: number;
  /** that EXP as whole top-tier items (Premium Resonance Potions / Premium Energy Cores), rounded up */
  expItems: MaterialLine[];
  /** ascensions in the step */
  ascensions: number;
  materials: MaterialLine[];
}

export const NO_COST: LevelCost = { credits: 0, resonatorExp: 0, weaponExp: 0, expItems: [], ascensions: 0, materials: [] };

const savedOf = (today: Pick<LevelsToday, "weaponKey" | "weaponTop">, s: LevelState): SavedProgress => ({
  level: stepText(s.level),
  talents: { ...s.talents },
  weapon: s.weapon ? today.weaponKey : null,
  weaponLevel: s.weapon ? stepText(s.weapon, today.weaponTop ?? TOP_LEVEL) : null,
});

const itemLine = (data: MaterialsData, id: number, count: number): MaterialLine => {
  const [name, rarity] = data.items[String(id)] ?? [`Item ${id}`, 1];
  return { id, name, rarity, count };
};

function expItemsOf(data: MaterialsData, resonatorExp: number, weaponExp: number): MaterialLine[] {
  const out: MaterialLine[] = [];
  if (resonatorExp > 0) out.push(itemLine(data, data.resonatorExp.item, Math.ceil(resonatorExp / data.resonatorExp.itemExp)));
  if (weaponExp > 0) out.push(itemLine(data, data.weaponExp.item, Math.ceil(weaponExp / data.weaponExp.itemExp)));
  return out;
}

const partOf = (cost: CostToMax, kind: "level" | "forte" | "weapon") => cost.parts.find((p) => p.kind === kind) ?? null;

/** What it costs to go from `a` to `b` on one part of the cost table: Cost to max from `a` minus Cost to max from `b`. */
function costBetween(data: MaterialsData, key: string, today: Pick<LevelsToday, "weaponKey" | "weaponTop">, a: LevelState, b: LevelState, kind: "level" | "forte" | "weapon"): LevelCost {
  const before = costToMax(data, key, savedOf(today, a), { from: "saved" });
  const after = costToMax(data, key, savedOf(today, b), { from: "saved" });
  const pa = before ? partOf(before, kind) : null;
  const pb = after ? partOf(after, kind) : null;
  if (!pa) return NO_COST;
  const counts = new Map<number, number>(pa.materials.map((m) => [m.id, m.count]));
  for (const m of pb?.materials ?? []) counts.set(m.id, (counts.get(m.id) ?? 0) - m.count);
  const exp = pa.exp - (pb?.exp ?? 0);
  const resonatorExp = kind === "level" ? exp : 0;
  const weaponExp = kind === "weapon" ? exp : 0;
  return {
    credits: pa.credits - (pb?.credits ?? 0),
    resonatorExp,
    weaponExp,
    expItems: expItemsOf(data, resonatorExp, weaponExp),
    ascensions: pa.ascensions - (pb?.ascensions ?? 0),
    materials: [...counts]
      .filter(([, n]) => n > 0)
      .sort((x, y) => x[0] - y[0])
      .map(([id, n]) => itemLine(data, id, n)),
  };
}

/** Several steps' costs as one: materials by item, EXP items rounded up once over the summed EXP. */
export function sumCosts(data: MaterialsData, costs: readonly LevelCost[]): LevelCost {
  const counts = new Map<number, number>();
  let credits = 0;
  let resonatorExp = 0;
  let weaponExp = 0;
  let ascensions = 0;
  for (const c of costs) {
    credits += c.credits;
    resonatorExp += c.resonatorExp;
    weaponExp += c.weaponExp;
    ascensions += c.ascensions;
    for (const m of c.materials) counts.set(m.id, (counts.get(m.id) ?? 0) + m.count);
  }
  return {
    credits,
    resonatorExp,
    weaponExp,
    expItems: expItemsOf(data, resonatorExp, weaponExp),
    ascensions,
    materials: [...counts].sort((x, y) => x[0] - y[0]).map(([id, n]) => itemLine(data, id, n)),
  };
}

/* ---------------------------------------------------------------------------------------------- steps */

export interface LevelStepDef {
  track: TrackKey;
  /** "70+", "6" */
  from: string;
  /** "80", "7" */
  to: string;
  /** "Level 70+ → 80", "Resonance Liberation 6 → 7", "Weapon level 80 → 90" */
  label: string;
  /** every track's value once the step is taken */
  next: LevelState;
  cost: LevelCost;
}

const nextCap = (level: number, top: number): number | null => LEVEL_CAPS.find((cap) => cap > level && cap <= top) ?? null;

function stepOf(data: MaterialsData, key: string, today: Pick<LevelsToday, "weaponKey" | "weaponTop">, state: LevelState, track: TrackKey, whole: boolean): LevelStepDef | null {
  if (track === "level" || track === "weapon") {
    const at = state[track];
    const top = track === "level" ? TOP_LEVEL : today.weaponTop;
    if (!at || top == null || at.level >= top) return null;
    const target = whole ? top : nextCap(at.level, top);
    if (target == null) return null;
    const next: LevelState = { ...state, talents: { ...state.talents }, [track]: { level: target, ascended: false } };
    const from = stepText(at, top);
    const to = String(target);
    return { track, from, to, label: `${trackLabel(track)} ${from} → ${to}`, next, cost: costBetween(data, key, today, state, next, track) };
  }
  const at = state.talents[track];
  if (at >= TOP_FORTE) return null;
  const target = whole ? TOP_FORTE : at + 1;
  const next: LevelState = { ...state, talents: { ...state.talents, [track]: target } };
  return { track, from: String(at), to: String(target), label: `${trackLabel(track)} ${at} → ${target}`, next, cost: costBetween(data, key, today, state, next, "forte") };
}

/** The next step of a track from `state`: a level or weapon to its next cap, a Forte skill one level up. Null at the top. */
export const nextStep = (data: MaterialsData, key: string, today: Pick<LevelsToday, "weaponKey" | "weaponTop">, state: LevelState, track: TrackKey): LevelStepDef | null =>
  stepOf(data, key, today, state, track, false);

/** A track taken from `state` to its top in one go ("Resonance Liberation 6 → 10"). Null at the top. */
export const trackToTop = (data: MaterialsData, key: string, today: Pick<LevelsToday, "weaponKey" | "weaponTop">, state: LevelState, track: TrackKey): LevelStepDef | null =>
  stepOf(data, key, today, state, track, true);

/** Every track at its top (the weapon at its own last level). */
export function topState(today: Pick<LevelsToday, "weaponTop">, state: LevelState): LevelState {
  const talents = {} as Record<ForteKey, number>;
  for (const key of FORTE_KEYS) talents[key] = TOP_FORTE;
  return { level: { level: TOP_LEVEL, ascended: false }, weapon: state.weapon && today.weaponTop != null ? { level: today.weaponTop, ascended: false } : null, talents };
}

/** How many granular steps are left from `state` to the top. */
export function stepsLeft(today: Pick<LevelsToday, "weaponTop">, state: LevelState): number {
  const caps = (at: LevelStep | null, top: number | null): number => (at && top != null ? LEVEL_CAPS.filter((cap) => cap > at.level && cap <= top).length : 0);
  return caps(state.level, TOP_LEVEL) + caps(state.weapon, today.weaponTop) + FORTE_KEYS.reduce((n, key) => n + (TOP_FORTE - state.talents[key]), 0);
}

/** "Level 80+ · Weapon level 90 · Forte 6 / 10 / 10 / 8 / 1" — what the figures were measured from. */
export function stateText(today: Pick<LevelsToday, "weaponTop">, state: LevelState): string {
  const forte = FORTE_KEYS.map((key) => state.talents[key]);
  const parts = [`Level ${stepText(state.level)}`];
  if (state.weapon) parts.push(`weapon level ${stepText(state.weapon, today.weaponTop ?? TOP_LEVEL)}`);
  parts.push(forte.every((v) => v === forte[0]) ? `all five Forte skills at ${forte[0]}` : `Forte skills ${forte.join(" / ")}`);
  return parts.join(" · ");
}
