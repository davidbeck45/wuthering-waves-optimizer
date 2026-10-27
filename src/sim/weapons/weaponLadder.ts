// Wuthering Tools+ — one implementation of "what does a copy of this weapon do on this rotation", shared by the pull
// advisor (src/sim/convene/advisorEngine.ts: a featured weapon's R1 → R5 ladder) and /weapons
// (src/sim/weaponValue/weaponValue.ts: every character's signature, standard 5★ and 4★ options). Moved out of
// advisorEngine.ts on 2026-10-26 so the weapon maths exists once.
//
// The rules (the advisor's, unchanged):
//   - a refinement of the weapon the character already holds is ONE number: the player's own passive toggles apply
//     to both sides (`scoreRotation` on `withWeapon(data, key, r)`);
//   - a weapon the character does not hold is BRACKETED the way upstream's weapon-impact preview does it
//     (src/weapons/weaponImpact.ts): the headline has every passive at full stacks (`weaponPassiveMode: "all-max"`),
//     `low` the weapon's stats alone (`"all-off"`).
// `withWeaponAtFullStacks` is the stored-toggle twin of "all-max" (every passive of that weapon written into the
// character's own `weaponPassives` at its max stacks), for the team scorer, which has no passive-mode option: the
// carrier then runs exactly the headline's weapon inside a team (weaponLadder.test.ts pins the equality).
//
// Pure / async, no Vue, no stores; numbers come from this app's engine only (enemy = RANKING_ENEMY unless given).
import { getCharByName } from "../../characters/characters";
import { getWeaponByName, getWeaponsByType } from "../../weapons/weapons";
import { calcCharacterRotationDamage, type CharacterRotationInput } from "../../calculator/characterRotation";
import type { TeamEnemyConfig } from "../../calculator/buildCharacterContext";
import { RANKING_ENEMY, refinementOf, scoreRotation, withWeapon } from "../myRankings/rankRoster";

export type Pause = () => Promise<void>;
const noPause: Pause = () => Promise.resolve();

/** One weapon copy scored against the character's damage as it is. */
export interface WeaponCopyScore {
  avgDamage: number;
  /** relative to `base`, e.g. 0.12 = +12 % */
  gain: number;
  /** a weapon the character does not hold: its stats alone, every passive off (the headline has them at full stacks) */
  low?: { avgDamage: number; gain: number };
}

/** One step of a ladder (the advisor's `DamageStep` shape). */
export interface WeaponStep extends WeaponCopyScore {
  /** "R2" for the held weapon, "Kumokiri R1" for another */
  label: string;
  /** copies of the weapon needed to get there from now */
  copies: number;
  refinement: number;
}

const weaponNames = new Map<string, string>();
/** the app's display name for a weapon key (the key itself when the registry does not list it) */
export function weaponName(key: string): string {
  if (!weaponNames.size) {
    for (const type of ["Swords", "Broadblades", "Pistols", "Gauntlets", "Rectifiers"]) {
      const list = getWeaponsByType(type) as unknown as Record<string, Array<{ key: string; name: string }>>;
      for (const rows of Object.values(list ?? {})) for (const w of rows ?? []) weaponNames.set(w.key, w.name);
    }
  }
  return weaponNames.get(key) ?? key;
}

const signatureOf = new Map<string, string | null>();

/** a resonator's signature weapon key (its `basic.signatureWeapon`), null when it names none or the kit won't load */
export async function signatureWeaponOf(characterKey: string): Promise<string | null> {
  if (signatureOf.has(characterKey)) return signatureOf.get(characterKey)!;
  let sig: string | null;
  try {
    const data = (await getCharByName(characterKey)) as { basic?: { signatureWeapon?: string } } | null;
    sig = data?.basic?.signatureWeapon ?? null;
  } catch {
    sig = null;
  }
  signatureOf.set(characterKey, sig);
  return sig;
}

/** The rotation on `characters` with the character's weapon passives forced (upstream's `weaponPassiveMode`). */
async function passiveRun(
  rotation: CharacterRotationInput,
  id: string,
  characters: Record<string, any>,
  echoes: any[],
  mode: "all-max" | "all-off",
  enemy: TeamEnemyConfig,
): Promise<number> {
  return (await calcCharacterRotationDamage(rotation, null, id, characters, enemy, echoes, null, { weaponPassiveMode: mode })).damageAggregation.avgDamage ?? 0;
}

/**
 * `weaponKey` at `refinement` on `id`'s rotation, against `base` (the character's damage as it is on that rotation).
 * The held weapon → one number on the player's own toggles; another weapon → the headline at full stacks with the
 * stats-only `low` (in that order, as the advisor always ran them).
 */
export async function scoreWeaponCopy(
  rotation: CharacterRotationInput,
  id: string,
  characters: Record<string, any>,
  echoes: any[],
  weaponKey: string,
  refinement: number,
  base: number,
  enemy: TeamEnemyConfig = RANKING_ENEMY,
): Promise<WeaponCopyScore> {
  const data = characters[id] ?? {};
  const hypo = { ...characters, [id]: withWeapon(data, weaponKey, refinement) };
  const gainOf = (x: number): number => (base > 0 ? x / base - 1 : 0);
  if (data.weapon === weaponKey) {
    const scored = await scoreRotation(rotation, id, hypo, enemy, echoes);
    return { avgDamage: scored.avgDamage, gain: gainOf(scored.avgDamage) };
  }
  const high = await passiveRun(rotation, id, hypo, echoes, "all-max", enemy);
  const low = await passiveRun(rotation, id, hypo, echoes, "all-off", enemy);
  return { avgDamage: high, gain: gainOf(high), low: { avgDamage: low, gain: gainOf(low) } };
}

/**
 * Every copy from where the character is to R5: R(n+1)…R5 of the held weapon, or R1…R5 of another one (bracketed).
 * Empty at R5. `pause` runs before each step (the callers' time-slicing).
 */
export async function weaponLadder(
  rotation: CharacterRotationInput,
  id: string,
  characters: Record<string, any>,
  echoes: any[],
  weaponKey: string,
  base: number,
  pause: Pause = noPause,
  enemy: TeamEnemyConfig = RANKING_ENEMY,
): Promise<WeaponStep[]> {
  const data = characters[id] ?? {};
  const wielding = data.weapon === weaponKey;
  const from = wielding ? refinementOf(data) : 0;
  const steps: WeaponStep[] = [];
  for (let r = from + 1; r <= 5; r++) {
    await pause();
    const scored = await scoreWeaponCopy(rotation, id, characters, echoes, weaponKey, r, base, enemy);
    steps.push({ label: wielding ? `R${r}` : `${weaponName(weaponKey)} R${r}`, copies: r - from, refinement: r, ...scored });
  }
  return steps;
}

/** The weapon's passive definitions (its `info.passiveData`), [] when the weapon or its type won't load. */
export async function weaponPassiveDefs(id: string, weaponKey: string): Promise<Array<{ key: string; maxStacks?: number }>> {
  try {
    const chosen = (await getCharByName(id)) as { basic?: { weapon?: string } } | null;
    const weapon = (await getWeaponByName(chosen?.basic?.weapon ?? "Swords", weaponKey)) as { info?: { passiveData?: Array<{ key: string; maxStacks?: number }> } } | null;
    return weapon?.info?.passiveData ?? [];
  } catch {
    return [];
  }
}

/**
 * A copy of the character wielding `weaponKey` at `refinement` with every passive of that weapon on at its max
 * stacks in their own `weaponPassives` — what `weaponPassiveMode: "all-max"` computes, as stored data, so a team run
 * (which reads stored toggles only) sees the headline's weapon. The held weapon keeps the player's own toggles.
 */
export async function withWeaponAtFullStacks(id: string, characterData: Record<string, any>, weaponKey: string, refinement: number): Promise<Record<string, any>> {
  const armed = withWeapon(characterData, weaponKey, refinement);
  if (characterData.weapon === weaponKey) return armed;
  const defs = await weaponPassiveDefs(id, weaponKey);
  if (!defs.length) return armed;
  const passives: Record<string, any> = { ...(armed.weaponPassives ?? {}) };
  for (const p of defs) passives[p.key] = { isEnabled: true, stacks: p.maxStacks ?? 0 };
  return { ...armed, weaponPassives: passives };
}
