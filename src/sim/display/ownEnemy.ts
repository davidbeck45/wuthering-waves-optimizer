// Wuthering Tools+: what a saved team's own enemy has that the rankings' enemy has not. /account, /my-rankings and
// Whole account score every team at one enemy (level 100, 20 % RES, no stacks: numberBasis.ts rule 5, README "One
// enemy, said on the page"); Teams scores a saved team at the enemy saved with it, and a team imported from wuwa_calc
// carries the negative-status stacks his run held. Xuanling · Suisui + Chisa reads 5.56M on /account and 7.66M on Teams
// under what looked like the same label (level 100, 20 % RES both): the difference is 9 Havoc Bane and 13 Glacio
// Chafe stacks, and nothing named them (2026-11-09 hunt 2, item 6). Pure: no Vue, no stores.

/** The enemy every team is scored at on /account, /my-rankings and Whole account, in words. */
export const ONE_ENEMY_TEXT = "enemy level 100, 20 % RES, no stacks on it";

const STACKS: ReadonlyArray<[field: string, name: string]> = [
  ["spectroFrazzleStacks", "Spectro Frazzle"],
  ["aeroErosionStacks", "Aero Erosion"],
  ["havocBaneStacks", "Havoc Bane"],
  ["fusionBurstStacks", "Fusion Burst"],
  ["electroFlareStacks", "Electro Flare"],
  ["electroRageStacks", "Electro Rage"],
  ["glacioChafeStacks", "Glacio Chafe"],
  ["strainStacks", "Tune Strain"],
];

const pct = (fraction: number): string => `${Math.round(fraction * 1000) / 10} %`;

/** What differs between a team's own enemy and the rankings' one, as a short list: "9 Havoc Bane + 13 Glacio Chafe
 *  stacks", "level 90", "10 % RES". Empty when the team's enemy is the rankings' enemy (or it has none of its own). */
export function ownEnemyDifferences(enemyConfig: Record<string, unknown> | null | undefined): string[] {
  if (!enemyConfig || typeof enemyConfig !== "object") return [];
  const out: string[] = [];
  const level = Number(enemyConfig.enemyLevel);
  if (Number.isFinite(level) && enemyConfig.enemyLevel != null && level !== 100) out.push(`level ${level}`);
  const resist = Number(enemyConfig.enemyResist);
  if (Number.isFinite(resist) && enemyConfig.enemyResist != null && Math.abs(resist - 0.2) > 1e-9) out.push(`${pct(resist)} RES`);
  const byElement = enemyConfig.enemyResistByElement;
  if (byElement && typeof byElement === "object" && Object.keys(byElement).length) out.push("its own RES per element");
  const stacks = STACKS.map(([field, name]) => [Number(enemyConfig[field]) || 0, name] as const).filter(([n]) => n > 0);
  if (stacks.length) out.push(`${stacks.map(([n, name]) => `${n} ${name}`).join(" + ")} stack${stacks.length === 1 && stacks[0]![0] === 1 ? "" : "s"}`);
  return out;
}

/** The line beside a saved team's figure on a one-enemy page when Teams scores it at another enemy: what Teams adds, so
 *  the two figures can't be read as the same thing. Null when both pages use the same enemy. */
export function ownEnemyNote(enemyConfig: Record<string, unknown> | null | undefined): string | null {
  const differs = ownEnemyDifferences(enemyConfig);
  return differs.length ? `Teams scores this team at its own enemy (${differs.join(", ")}), so it reads a different figure there` : null;
}
