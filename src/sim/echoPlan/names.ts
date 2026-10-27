// Wuthering Tools+ — display names for the echo plan. Mirrors batch 1's `src/sim/display/names.ts`
// (`characterDisplayName`); switch to it once that module is on `plus`.
import { allCharactersList, characterPortraitUrl, getCharacterRosterDisplayName } from "../../characters/characters";

export { characterPortraitUrl };

/** "RoverElectroFemale" (the roster's own label for the Electro forms) → "Rover Electro (Female)", like the other forms. */
const prettyRover = (name: string): string => {
  const m = /^Rover\s*(Aero|Electro|Havoc|Spectro|Fusion|Glacio)\s*\(?(Female|Male)\)?$/i.exec(name);
  if (!m) return name;
  const cap = (s: string): string => s[0]!.toUpperCase() + s.slice(1).toLowerCase();
  return `Rover ${cap(m[1]!)} (${cap(m[2]!)})`;
};

export const characterName = (key: string): string => prettyRover(getCharacterRosterDisplayName(key));

/** A short label for chips and lists: "Rover Aero (Female)" → "Rover Aero", "Yangyang: Xuanling" → "Xuanling". */
export const characterShortName = (key: string): string =>
  characterName(key).replace(/\s*\((?:Female|Male)\)$/, "").replace(/^Yangyang: /, "");

export const characterElement = (key: string): string | null =>
  (allCharactersList.find((c) => c.key === key)?.element as string | undefined) ?? null;

/** Released characters the app lists, sorted by display name (the planned-character picker). */
export function releasedCharacters(): Array<{ key: string; name: string; element: string | null; rarity: number }> {
  return allCharactersList
    .map((c) => ({ key: c.key, name: characterName(c.key), element: (c.element as string) ?? null, rarity: Number(c.rarity) || 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
