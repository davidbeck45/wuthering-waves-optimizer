// Wuthering Tools+ — the in-game Echo Management grid as data: the Sonata Effects the app ships (release order),
// the COST 4 / 3 / 1 main stats each plan row offers, and the in-game wording for both. Pure (no Vue, no stores).
//
// The game (3.2, Kuro's notes article 4447): "plans can now be edited based on Sonata Effect, and when a new Echo is
// obtained, it will automatically be locked or marked for discard according to the Mainstats of the COST4/COST3/COST1
// Echoes under each Sonata Effect." A cost row exists only where the Sonata has echoes of that cost — Shadow of
// Shattered Dreams is one 4-cost echo — so the rows are read off the app's echo list, never assumed.
import { echoCostClassMap, mainEchoesData } from "../../echoes/index";
import { echoSetImageMap, echoSetLabelMap } from "../../echoes/stats";

export type Cost = 4 | 3 | 1;
export const COSTS: readonly Cost[] = [4, 3, 1];

export type MainKey =
  | "HP"
  | "ATK"
  | "DEF"
  | "CritRate"
  | "CritDMG"
  | "HealingBonus"
  | "EnergyRegen"
  | "Glacio"
  | "Fusion"
  | "Electro"
  | "Aero"
  | "Spectro"
  | "Havoc";

export const ELEMENTS = ["Glacio", "Fusion", "Electro", "Aero", "Spectro", "Havoc"] as const;
export type Element = (typeof ELEMENTS)[number];

/** The main stats an echo of each cost can roll (src/echoes/stats.ts `statsTable`), in the grid's order. */
export const COST_MAINS: Record<Cost, readonly MainKey[]> = {
  4: ["HP", "ATK", "DEF", "CritRate", "CritDMG", "HealingBonus"],
  3: ["HP", "ATK", "DEF", "EnergyRegen", ...ELEMENTS],
  1: ["HP", "ATK", "DEF"],
};

/** In-game wording (the echo detail panel; the app's OCR aliases in `verboseStatLabelMap` read the same strings). */
export const MAIN_LABEL: Record<MainKey, string> = {
  HP: "HP",
  ATK: "ATK",
  DEF: "DEF",
  CritRate: "Crit. Rate",
  CritDMG: "Crit. DMG",
  HealingBonus: "Healing Bonus",
  EnergyRegen: "Energy Regen",
  Glacio: "Glacio DMG Bonus",
  Fusion: "Fusion DMG Bonus",
  Electro: "Electro DMG Bonus",
  Aero: "Aero DMG Bonus",
  Spectro: "Spectro DMG Bonus",
  Havoc: "Havoc DMG Bonus",
};

/** What a chip shows: the element alone for a 3-cost element bonus (unambiguous on that row). */
export const MAIN_SHORT: Record<MainKey, string> = {
  ...MAIN_LABEL,
  Glacio: "Glacio",
  Fusion: "Fusion",
  Electro: "Electro",
  Aero: "Aero",
  Spectro: "Spectro",
  Havoc: "Havoc",
};

/** One chip of the grid: `"4:CritDMG"`. */
export type ChipId = `${Cost}:${MainKey}`;
export const chipId = (cost: Cost, main: MainKey): ChipId => `${cost}:${main}` as ChipId;
export function parseChipId(id: string): { cost: Cost; main: MainKey } | null {
  const [c, m] = id.split(":");
  const cost = Number(c) as Cost;
  if (!COSTS.includes(cost) || !(COST_MAINS[cost] as readonly string[]).includes(m)) return null;
  return { cost, main: m as MainKey };
}

export const isLegalMain = (cost: Cost, main: MainKey): boolean => COST_MAINS[cost].includes(main);

const ALIASES: Record<string, MainKey> = {
  hp: "HP",
  "hp%": "HP",
  atk: "ATK",
  "atk%": "ATK",
  def: "DEF",
  "def%": "DEF",
  critrate: "CritRate",
  "crit.rate": "CritRate",
  cr: "CritRate",
  critdmg: "CritDMG",
  "crit.dmg": "CritDMG",
  critdamage: "CritDMG",
  cd: "CritDMG",
  healingbonus: "HealingBonus",
  healing: "HealingBonus",
  energyregen: "EnergyRegen",
  er: "EnergyRegen",
};

/**
 * A main stat as any part of the app writes it — the store's `"CritRate"` / `"Aero"`, older exports'
 * `"AeroDMGBonus"`, the in-game `"Crit. Rate"` / `"Aero DMG Bonus"`, wuwa_calc's `"CR"` / `"ER"` / `"atk"` — to the
 * grid's key; null for anything else (a flat stat, a typo, nothing).
 */
export function normaliseMain(raw: unknown): MainKey | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const compact = raw.replace(/\s+/g, "").toLowerCase();
  if (ALIASES[compact]) return ALIASES[compact];
  const element = ELEMENTS.find((e) => compact === e.toLowerCase() || compact === `${e.toLowerCase()}dmgbonus` || compact === `${e.toLowerCase()}dmg`);
  return element ?? null;
}

/** The cost an echo's own class gives (Calamity / Overlord 4, Elite 3, Common 1); null for an unknown echo. */
export function costOfEcho(echoKey: unknown): Cost | null {
  if (typeof echoKey !== "string") return null;
  const cls = mainEchoesData[echoKey]?.class;
  const cost = cls ? echoCostClassMap[cls] : undefined;
  return cost === 4 || cost === 3 || cost === 1 ? cost : null;
}

export const asCost = (raw: unknown): Cost | null => {
  const n = Number(raw);
  return n === 4 || n === 3 || n === 1 ? n : null;
};

/**
 * Names the game uses where the calculator's set list differs. The app keeps Havoc's 1.0 set as "Havoc Eclipse"
 * (its old `SunSinkingEclipse` duplicate was removed on 2026-07-18; the icon file is still SunSinkingEclipse.webp);
 * the in-game Sonata Effect is "Sun-sinking Eclipse", and the plan has to be found by that name in game.
 */
export const IN_GAME_SET_NAME: Record<string, string> = {
  HavocEclipse: "Sun-sinking Eclipse",
};

export interface Sonata {
  /** the app's set key (`echoSetLabelMap`) */
  key: string;
  /** the name to look for in game */
  name: string;
  /** the calculator's label, when it differs from `name` */
  appName: string | null;
  icon: string | null;
  /** the cost rows this Sonata has, 4 → 1 */
  costs: Cost[];
}

const ELEMENT_SET: Record<Element, string> = {
  Glacio: "FreezingFrost",
  Fusion: "MoltenRift",
  Electro: "VoidThunder",
  Aero: "SierraGale",
  Spectro: "CelestialLight",
  Havoc: "HavocEclipse",
};
/** The 1.0 elemental 5-piece set for an element — the kit default for a character nobody has a build for. */
export const elementSet = (element: unknown): string | null =>
  typeof element === "string" && element in ELEMENT_SET ? ELEMENT_SET[element as Element] : null;

function costsBySet(): Map<string, Set<Cost>> {
  const out = new Map<string, Set<Cost>>();
  for (const echo of Object.values(mainEchoesData)) {
    const cost = asCost(echoCostClassMap[echo.class]);
    if (!cost) continue;
    for (const set of echo.sets ?? []) {
      if (!out.has(set)) out.set(set, new Set());
      out.get(set)!.add(cost);
    }
  }
  return out;
}

let cached: Sonata[] | null = null;

/**
 * Every Sonata Effect the app ships, in its own list order (release order: the 1.0 elemental sets, then each
 * patch's). Released content only — the list follows the app's `echoSetLabelMap`, nothing else.
 */
export function sonatas(): Sonata[] {
  if (cached) return cached;
  const costs = costsBySet();
  cached = Object.entries(echoSetLabelMap).map(([key, label]) => {
    const own = costs.get(key);
    const name = IN_GAME_SET_NAME[key] ?? label;
    return {
      key,
      name,
      appName: name !== label ? label : null,
      icon: echoSetImageMap[key] ?? null,
      costs: own && own.size ? COSTS.filter((c) => own.has(c)) : [...COSTS],
    };
  });
  return cached;
}

export const sonataByKey = (key: string): Sonata | undefined => sonatas().find((s) => s.key === key);

/** "Thread of Severed Fate" / "Havoc Eclipse" / "Sun-sinking Eclipse" → the set key; null when the app has no such set. */
export function setKeyOfName(name: string): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const want = norm(name);
  for (const [key, label] of Object.entries(echoSetLabelMap)) if (norm(label) === want || norm(key) === want) return key;
  for (const [key, label] of Object.entries(IN_GAME_SET_NAME)) if (norm(label) === want) return key;
  return null;
}
