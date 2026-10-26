// Wuthering Tools+ — the weapon panel's "Recommended for <character>" rail scores each weapon as a swap
// candidate (src/weapons/weaponImpact.ts). A bare `{ weaponKey }` candidate is scored at R1 and max level, so a
// weapon the character already holds at R5 read as a big loss against itself (David's R5 Everbright Polestar:
// −23.4 %). A weapon this character has saved settings for is scored at the level and refinement saved there.
import type { WeaponSwapCandidate } from "../../weapons/weaponImpact";

interface SavedWeaponSettings {
  weaponLevel?: unknown;
  refinement?: unknown;
}

/** `characters[id].weapons[key]` → the candidate the impact estimate should score; unknown weapons stay R1 / max level. */
export function ownedWeaponCandidate(
  characterData: { weapons?: Record<string, SavedWeaponSettings | null | undefined> } | null | undefined,
  weaponKey: string,
): WeaponSwapCandidate {
  const saved = characterData?.weapons?.[weaponKey];
  const candidate: WeaponSwapCandidate = { weaponKey };
  if (saved?.weaponLevel != null && saved.weaponLevel !== "") candidate.weaponLevel = String(saved.weaponLevel);
  if (saved?.refinement != null && saved.refinement !== "") candidate.refinement = String(saved.refinement);
  return candidate;
}
