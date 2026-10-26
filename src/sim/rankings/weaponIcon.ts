// Wuthering Tools+ — a weapon icon for one of Riley's weapon names ("Stellar Symphony R1"), for the
// /rankings member strip. His names are matched to this app's weapon registry (src/weapons/weapons.ts)
// the way his `normWeapon()` compares them; the icon URL is the weapon module's own `info.image`
// (a few are .webp), loaded lazily and cached. A weapon the registry lacks gets the asset host's usual
// `<Key>.png` guess, and the component hides an icon that fails to load.
import { getWeaponByName, getWeaponsByType } from "../../weapons/weapons";
import { normWeapon } from "./phoneCards";

const FOLDERS = ["Swords", "Broadblades", "Rectifiers", "Pistols", "Gauntlets"] as const;
const ASSETS = "https://ryanbenson.github.io/wuthering-waves-assets/images/weapons/";

export interface WeaponRef {
  key: string;
  folder: (typeof FOLDERS)[number];
  name: string;
}

let index: Map<string, WeaponRef> | null = null;
function weaponIndex(): Map<string, WeaponRef> {
  if (index) return index;
  index = new Map();
  for (const folder of FOLDERS) {
    const lists = getWeaponsByType(folder) as Record<string, Array<{ key: string; name: string }>>;
    for (const list of Object.values(lists)) {
      for (const w of list ?? []) {
        const ref = { key: w.key, folder, name: w.name };
        index.set(normWeapon(w.name), ref);
        if (!index.has(normWeapon(w.key))) index.set(normWeapon(w.key), ref);
      }
    }
  }
  return index;
}

/** "Stellar Symphony R1" → { key: "StellarSymphony", folder: "Rectifiers" }; null when the app lacks it. */
export function weaponRefOf(name: string): WeaponRef | null {
  return weaponIndex().get(normWeapon(name.replace(/ R\d$/, ""))) ?? null;
}

/** The asset host's URL for a weapon the registry lacks: its name in PascalCase, `.png`. */
export function guessedWeaponIcon(name: string): string {
  const key = name.replace(/ R\d$/, "").replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1)).join("");
  return `${ASSETS}${key}.png`;
}

const cache = new Map<string, Promise<string>>();
/** The icon URL for one of his weapon names (cached per name). */
export function loadWeaponIcon(name: string): Promise<string> {
  const base = name.replace(/ R\d$/, "");
  let hit = cache.get(base);
  if (!hit) {
    const ref = weaponRefOf(base);
    hit = ref
      ? Promise.resolve(getWeaponByName(ref.folder, ref.key))
        .then((w: { info?: { image?: string } } | undefined) => w?.info?.image ?? `${ASSETS}${ref.key}.png`)
        .catch(() => `${ASSETS}${ref.key}.png`)
      : Promise.resolve(guessedWeaponIcon(base));
    cache.set(base, hit);
  }
  return hit;
}
