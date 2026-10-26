// Wuthering Tools+ — display names and art for registry keys, so plus pages never print "EverbrightPolestar"
// or "RoverAeroFemale". Pure lookups over the app's own registries (characters.ts, weapons.ts); no Vue.
import { allCharactersList, characterPickerRoster, characterPortraitUrl, getCharacterRosterDisplayName } from "../../characters/characters";
import { getWeaponsByType } from "../../weapons/weapons";

export { characterPortraitUrl };

/** the asset host every upstream weapon picker uses (`WEAPON_IMAGE_BASE` in CalculatorWeapons.vue / WorkspaceWeaponPanel.vue) */
const WEAPON_IMAGE_BASE = "https://ryanbenson.github.io/wuthering-waves-assets/images/weapons";

/** "RoverElectroFemale" (the roster's own label for the Electro forms) → "Rover Electro (Female)", like the other forms */
const prettyRover = (name: string): string => {
  const m = /^Rover\s*(Aero|Electro|Havoc|Spectro|Fusion|Glacio)\s*(Female|Male)$/i.exec(name);
  if (!m) return name;
  const cap = (s: string): string => s[0].toUpperCase() + s.slice(1).toLowerCase();
  return `Rover ${cap(m[1])} (${cap(m[2])})`;
};

/** The roster name for a character key (`getCharacterRosterDisplayName`), Rover forms written alike. */
export function characterDisplayName(key: string | null | undefined): string {
  if (!key) return "";
  return prettyRover(getCharacterRosterDisplayName(key));
}

/** A shorter label for tight spots: "Rover Aero (Female)" → "Rover Aero", "Yangyang: Xuanling" → "Xuanling". */
export function characterShortName(key: string | null | undefined): string {
  const full = characterDisplayName(key);
  return full.replace(/\s*\((?:Female|Male)\)$/, "").replace(/^Yangyang: /, "");
}

export interface CharacterMeta {
  key: string;
  element: string | null;
  rarity: number;
  weapon: string | null;
}

/** Element, rarity and weapon type from `allCharactersList`; null for a key the app does not list. */
export function characterMeta(key: string | null | undefined): CharacterMeta | null {
  if (!key) return null;
  const meta = allCharactersList.find((c) => c.key === key);
  return meta ? { key, element: meta.element ?? null, rarity: Number(meta.rarity) || 0, weapon: meta.weapon ?? null } : null;
}

const ROSTER_KEYS = new Set([...characterPickerRoster.five, ...characterPickerRoster.four].map((c) => c.key));
/** A character the pickers offer — portraits are drawn only for these (a shipped preset can name a kit the roster still hides). */
export const isRosterCharacter = (key: string | null | undefined): boolean => Boolean(key && ROSTER_KEYS.has(key));

/** The in-game element colours the app's text classes use (style.css `.Fire`, `.Ice`, …), by element name. */
export const ELEMENT_COLORS: Record<string, string> = {
  Fusion: "#f0744e",
  Glacio: "#41aefb",
  Aero: "#2fd99a",
  Electro: "#b46bff",
  Spectro: "#e9cf3f",
  Havoc: "#e649a6",
};
export const elementColor = (element: string | null | undefined): string => (element && ELEMENT_COLORS[element]) || "oklch(var(--bc) / 0.4)";

export interface WeaponMeta {
  key: string;
  name: string;
  rarity: number;
  mainStat: string | null;
  /** the registry bucket: Swords, Broadblades, Rectifiers, Pistols, Gauntlets */
  type: string;
}

let weaponIndex: Map<string, WeaponMeta> | null = null;
const WEAPON_TYPES = ["Swords", "Broadblades", "Rectifiers", "Pistols", "Gauntlets"] as const;
const RARITY_BUCKETS = [["five", 5], ["four", 4], ["three", 3], ["two", 2], ["one", 1]] as const;

function weapons(): Map<string, WeaponMeta> {
  if (weaponIndex) return weaponIndex;
  const index = new Map<string, WeaponMeta>();
  for (const type of WEAPON_TYPES) {
    const list = getWeaponsByType(type) as unknown as Record<string, Array<{ key: string; name: string; mainStat?: string }> | undefined>;
    for (const [bucket, rarity] of RARITY_BUCKETS) {
      for (const w of list?.[bucket] ?? []) if (!index.has(w.key)) index.set(w.key, { key: w.key, name: w.name, rarity, mainStat: w.mainStat ?? null, type });
    }
  }
  weaponIndex = index;
  return index;
}

export const weaponMeta = (key: string | null | undefined): WeaponMeta | null => (key ? weapons().get(key) ?? null : null);

/** "EverbrightPolestar" → "Everbright Polestar"; an unknown key is split at its capitals rather than printed raw. */
export function weaponDisplayName(key: string | null | undefined): string {
  if (!key) return "";
  return weaponMeta(key)?.name ?? key.replace(/([a-z])([A-Z0-9])/g, "$1 $2");
}

export const weaponIconUrl = (key: string): string => `${WEAPON_IMAGE_BASE}/${key}.png`;

/** A rarity ring colour for weapon / character art (5★ gold, 4★ violet, 3★ blue). */
export function rarityColor(rarity: number): string {
  if (rarity >= 5) return "#e8b44c";
  if (rarity === 4) return "#a46bea";
  if (rarity === 3) return "#4c9be8";
  return "oklch(var(--bc) / 0.3)";
}
