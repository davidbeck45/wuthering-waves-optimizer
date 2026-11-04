// Wuthering Tools+ — "Cost to max": the Shell Credits, EXP and materials that take a character to level 90, all five
// Forte skills to 10 (plus the two inherent skills and eight stat bonuses) and their weapon to its last level, from
// what the calculator has saved, or from level 1.
//
// Pure: the generated table (data/materials.json, written by wuwa-tools/materials/materials_sync.mjs from the game's
// own upgrade tables) and one character's store record in, plain numbers out. No Vue, no stores.
//
// What the calculator saves (Ryan's character store): `characterLevel` ("1", "20", "20+", … "90"; "+" = ascended at that
// cap; unset = "90", the calculator's own default), `talents` (basic / skill / forte / liberation / intro, 1–10; unset =
// 10), `weapons[<weapon>].weaponLevel` (same steps; unset = the weapon's last level). It does not save the inherent
// skills or the stat bonuses: from saved levels they are listed apart ("if none are unlocked"), never added in.

export type Pair = [id: number, count: number];

export interface MaterialsData {
  gameVersion: string;
  fetched: string;
  credit: number;
  /** id → [name, rarity] */
  items: Record<string, [string, number]>;
  resonatorExp: { perLevel: number[]; creditPerExp: number; item: number; itemExp: number };
  weaponExp: { perLevel: Record<string, number[]>; creditPerExp: number; item: number; itemExp: number };
  characters: Record<string, { id: number; rarity: number; asc: Array<[number, Pair[]]>; forte: Pair[][]; inherent: Pair[][]; nodes: Pair[][] }>;
  weapons: Record<string, { id: number; rarity: number; curve: number; max: number; asc: Array<[number, Pair[]]> }>;
}

export const FORTE_SKILLS = [
  { key: "basic", label: "Normal Attack" },
  { key: "skill", label: "Resonance Skill" },
  { key: "forte", label: "Forte Circuit" },
  { key: "liberation", label: "Resonance Liberation" },
  { key: "intro", label: "Intro Skill" },
] as const;
export type ForteKey = (typeof FORTE_SKILLS)[number]["key"];

/** A level as the calculator writes it: "50+" = level 50, ascended (cap 60). */
export interface LevelStep {
  level: number;
  ascended: boolean;
}

export interface MaterialLine {
  id: number;
  name: string;
  rarity: number;
  count: number;
}

export interface CostPart {
  kind: "level" | "forte" | "extras" | "weapon";
  /** "Level 50+ → 90", "Forte 6 / 10 / 10 / 8 / 1 → 10", "Weapon 1 → 90", "Inherent skills and stat bonuses" */
  title: string;
  /** the saved value was missing and the calculator's default was used */
  assumed: boolean;
  credits: number;
  /** Shell Credits the EXP alone costs (level / weapon parts) */
  expCredits: number;
  /** EXP to feed (level / weapon parts) */
  exp: number;
  /** the top EXP item that covers it: Premium Resonance Potions / Premium Energy Cores, rounded up */
  expItem: MaterialLine | null;
  /** ascension steps still to pay (level / weapon parts) */
  ascensions: number;
  materials: MaterialLine[];
  /** counted in the total (the inherent / stat part is not, from saved levels) */
  counted: boolean;
}

export interface CostToMax {
  from: "saved" | "scratch";
  parts: CostPart[];
  total: { credits: number; materials: MaterialLine[]; expItems: MaterialLine[] };
  /** nothing at all left to pay in the counted parts */
  done: boolean;
  /** a part's saved value was missing */
  anyAssumed: boolean;
}

export interface SavedProgress {
  level: string | null;
  talents: Partial<Record<ForteKey, number>>;
  weapon: string | null;
  weaponLevel: string | null;
}

/* --------------------------------------------------------------------------------------------- input */

/** "50+" → { 50, ascended }; "1" / 1 → { 1, false }; junk → null. */
export function parseLevel(value: unknown): LevelStep | null {
  const m = /^\s*(\d{1,2})\s*(\+)?\s*$/.exec(String(value ?? ""));
  if (!m) return null;
  const level = Number(m[1]);
  return level >= 1 && level <= 90 ? { level, ascended: Boolean(m[2]) } : null;
}

/** What one character's store record says (nothing guessed here — `costToMax` applies the defaults). */
export function savedProgressOf(data: Record<string, any> | null | undefined): SavedProgress {
  const talents: Partial<Record<ForteKey, number>> = {};
  for (const { key } of FORTE_SKILLS) {
    const v = Number(data?.talents?.[key]);
    if (Number.isInteger(v) && v >= 1 && v <= 10) talents[key] = v;
  }
  const weapon = data?.weapon ? String(data.weapon) : null;
  const wl = weapon ? data?.weapons?.[weapon]?.weaponLevel : null;
  return {
    level: data?.characterLevel != null && parseLevel(data.characterLevel) ? String(data.characterLevel).trim() : null,
    talents,
    weapon,
    weaponLevel: wl != null && parseLevel(wl) ? String(wl).trim() : null,
  };
}

/** Anything at all saved below the top — the drawer opens on "From saved levels" then, else on "From level 1". */
export function hasSavedProgress(p: SavedProgress): boolean {
  const lv = p.level ? parseLevel(p.level) : null;
  const wl = p.weaponLevel ? parseLevel(p.weaponLevel) : null;
  return Boolean((lv && lv.level < 90) || Object.values(p.talents).some((v) => (v ?? 10) < 10) || (wl && wl.level < 90));
}

/** What the saved view takes on trust, for its note: only the values the store really lacks ("level or weapon level"),
 *  "" when it lacks none. All five Forte skills saved at 10 are saved, even though nothing sits below the top; a
 *  character with no weapon has no weapon level to miss. */
export function unsavedWords(cost: CostToMax, saved: SavedProgress): string {
  const words = cost.parts
    .filter((p) => p.assumed)
    .map((p) => (p.kind === "level" ? "level" : p.kind === "weapon" ? "weapon level" : Object.keys(saved.talents).length ? "other Forte levels" : "Forte levels"));
  return words.length > 1 ? `${words.slice(0, -1).join(", ")} or ${words.at(-1)}` : (words[0] ?? "");
}

/* ------------------------------------------------------------------------------------------- the sums */

class Bag {
  private counts = new Map<number, number>();
  credits = 0;
  constructor(private readonly creditId: number) {}
  add(pairs: Pair[], times = 1): void {
    for (const [id, n] of pairs) {
      if (id === this.creditId) this.credits += n * times;
      else this.counts.set(id, (this.counts.get(id) ?? 0) + n * times);
    }
  }
  lines(data: MaterialsData): MaterialLine[] {
    return [...this.counts]
      .filter(([, n]) => n > 0)
      .sort((a, b) => a[0] - b[0])
      .map(([id, count]) => lineOf(data, id, count));
  }
}

const lineOf = (data: MaterialsData, id: number, count: number): MaterialLine => {
  const [name, rarity] = data.items[String(id)] ?? [`Item ${id}`, 1];
  return { id, name, rarity, count };
};

/** The ascensions left from a step: a cap's ascension is paid once you stand at it, so "40" still owes the one at 40,
 *  "40+" does not. Nothing is paid at the top itself (1★ / 2★ weapons stop at 70; an older table still priced a fifth
 *  ascension there). */
const ascensionsLeft = (asc: Array<[number, Pair[]]>, from: LevelStep, top: number): Array<[number, Pair[]]> =>
  asc.filter(([at]) => at < top && (at > from.level || (at === from.level && !from.ascended)));

/** EXP from `from` to the top of a curve (perLevel[i] = EXP from level i + 1 to i + 2). */
const expLeft = (perLevel: number[], from: LevelStep): number => perLevel.slice(from.level - 1).reduce((s, v) => s + v, 0);

function levelPart(
  data: MaterialsData,
  kind: "level" | "weapon",
  label: string,
  from: LevelStep,
  top: number,
  assumed: boolean,
  asc: Array<[number, Pair[]]>,
  perLevel: number[],
  exp: { creditPerExp: number; item: number; itemExp: number },
): CostPart {
  const bag = new Bag(data.credit);
  const left = ascensionsLeft(asc, from, top);
  for (const [, p] of left) bag.add(p);
  const xp = expLeft(perLevel, from);
  const expCredits = Math.round(xp * exp.creditPerExp);
  const step = `${from.level}${from.ascended && from.level < top ? "+" : ""}`;
  return {
    kind,
    title: `${label} ${step} → ${top}`,
    assumed,
    credits: bag.credits + expCredits,
    expCredits,
    exp: xp,
    expItem: xp > 0 ? lineOf(data, exp.item, Math.ceil(xp / exp.itemExp)) : null,
    ascensions: left.length,
    materials: bag.lines(data),
    counted: true,
  };
}

export interface CostOptions {
  from: "saved" | "scratch";
}

/**
 * The cost for one character (`key` = app character key) from its saved progress or from level 1. Null when the table
 * has no entry for the character (a kit newer than the table).
 */
export function costToMax(data: MaterialsData, key: string, saved: SavedProgress, { from }: CostOptions): CostToMax | null {
  const ch = data.characters[key];
  if (!ch) return null;
  const scratch = from === "scratch";
  const parts: CostPart[] = [];

  // level
  const savedLevel = saved.level ? parseLevel(saved.level) : null;
  const level = scratch ? { level: 1, ascended: false } : savedLevel ?? { level: 90, ascended: true };
  parts.push(levelPart(data, "level", "Level", level, 90, !scratch && !savedLevel, ch.asc, data.resonatorExp.perLevel, data.resonatorExp));

  // Forte: five skills
  const forteBag = new Bag(data.credit);
  const levels = FORTE_SKILLS.map(({ key: k }) => (scratch ? 1 : saved.talents[k] ?? 10));
  for (const lv of levels) for (const step of ch.forte.slice(lv - 1)) forteBag.add(step);
  const forteAssumed = !scratch && FORTE_SKILLS.some(({ key: k }) => saved.talents[k] == null);
  parts.push({
    kind: "forte",
    title: levels.every((v) => v === levels[0]) ? `Forte ${levels[0]} → 10` : `Forte ${levels.join(" / ")} → 10`,
    assumed: forteAssumed,
    credits: forteBag.credits,
    expCredits: 0,
    exp: 0,
    expItem: null,
    ascensions: 0,
    materials: forteBag.lines(data),
    counted: true,
  });

  // inherent skills + stat bonuses: not saved anywhere, so from saved levels they are shown apart and not added in
  const extras = new Bag(data.credit);
  for (const p of ch.inherent) extras.add(p);
  for (const p of ch.nodes) extras.add(p, 4);
  parts.push({
    kind: "extras",
    title: "Inherent skills and stat bonuses",
    assumed: false,
    credits: extras.credits,
    expCredits: 0,
    exp: 0,
    expItem: null,
    ascensions: 0,
    materials: extras.lines(data),
    counted: scratch,
  });

  // weapon
  const w = saved.weapon ? data.weapons[saved.weapon] : undefined;
  if (w) {
    const savedW = saved.weaponLevel ? parseLevel(saved.weaponLevel) : null;
    const wl = scratch ? { level: 1, ascended: false } : savedW ? { level: Math.min(savedW.level, w.max), ascended: savedW.ascended } : { level: w.max, ascended: true };
    const perLevel = data.weaponExp.perLevel[String(w.curve)] ?? [];
    parts.push(levelPart(data, "weapon", "Weapon", wl, w.max, !scratch && !savedW, w.asc, perLevel, data.weaponExp));
  }

  const totalBag = new Bag(data.credit);
  const expItems = new Map<number, number>();
  let credits = 0;
  for (const p of parts.filter((x) => x.counted)) {
    credits += p.credits;
    totalBag.add(p.materials.map((m) => [m.id, m.count] as Pair));
    if (p.expItem) expItems.set(p.expItem.id, (expItems.get(p.expItem.id) ?? 0) + p.expItem.count);
  }
  const materials = totalBag.lines(data);
  return {
    from,
    parts,
    total: { credits, materials, expItems: [...expItems].map(([id, n]) => lineOf(data, id, n)) },
    done: credits === 0 && materials.length === 0 && expItems.size === 0,
    anyAssumed: parts.some((p) => p.assumed),
  };
}

/** "1,023,300" */
export const count = (n: number): string => Math.round(n).toLocaleString("en-US");
