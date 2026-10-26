// Wuthering Tools+ — Kuro's English item names (news articles, Convene records) → this app's character / weapon keys.
// Reads the app's own registries (plain data modules, no Vue); matching ignores case, spacing and punctuation, so
// "Commando of Conviction" finds `CommandoOfConviction` ("Commando Of Conviction") and "Yangyang: Xuanling" finds
// `YangyangXuanling`. A name the app doesn't carry resolves to null — the caller keeps the name.
import { allCharactersList, characterPickerRoster } from "../../characters/characters";
import { getWeaponsByType } from "../../weapons/weapons";
import type { PoolKind } from "./pools";

export interface ItemRef {
  kind: PoolKind;
  /** the app's key */
  key: string;
  /** the app's display name */
  name: string;
}

export function normalizeItemName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const WEAPON_TYPES = ["Swords", "Broadblades", "Pistols", "Gauntlets", "Rectifiers"];

let tables: { resonator: Map<string, ItemRef>; weapon: Map<string, ItemRef> } | null = null;

function buildTables() {
  const resonator = new Map<string, ItemRef>();
  const addResonator = (key: string, name: string) => {
    // Rover forms never appear on a banner; skip them so "Rover" can't claim one form
    if (/^rover/i.test(key)) return;
    const ref: ItemRef = { kind: "resonator", key, name };
    for (const n of [name, key]) {
      const k = normalizeItemName(n);
      if (k && !resonator.has(k)) resonator.set(k, ref);
    }
  };
  for (const c of [...characterPickerRoster.five ?? [], ...characterPickerRoster.four ?? []]) addResonator(c.key, c.name);
  for (const c of allCharactersList) addResonator(c.key, c.name);

  const weapon = new Map<string, ItemRef>();
  for (const type of WEAPON_TYPES) {
    const list = getWeaponsByType(type) as Record<string, { key: string; name: string }[]>;
    for (const rows of Object.values(list)) {
      for (const w of rows ?? []) {
        const ref: ItemRef = { kind: "weapon", key: w.key, name: w.name };
        for (const n of [w.name, w.key]) {
          const k = normalizeItemName(n);
          if (k && !weapon.has(k)) weapon.set(k, ref);
        }
      }
    }
  }
  return { resonator, weapon };
}

/** the app item a Kuro name stands for (`kind` narrows the search; without it resonators win a tie) */
export function resolveItem(name: string, kind?: PoolKind | null): ItemRef | null {
  tables ??= buildTables();
  const k = normalizeItemName(name);
  if (!k) return null;
  if (kind === "resonator") return tables.resonator.get(k) ?? null;
  if (kind === "weapon") return tables.weapon.get(k) ?? null;
  return tables.resonator.get(k) ?? tables.weapon.get(k) ?? null;
}
