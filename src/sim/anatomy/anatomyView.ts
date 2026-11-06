// Wuthering Tools+ "Why this number": the sheet's words and small sums. Pure.
import type { TeamEnemyConfig } from "../../calculator/buildCharacterContext";
import { compact, fmt } from "../myRankings/format";
import { parsePresetName } from "../presets/presetName";
import type { CritFactor, HitChoice, RotationAnatomy } from "./anatomy";
import type { MoveRow } from "./anatomyRun";

/** A rotation's name in a select: its title, and the chips that tell two of the same title apart. */
export function rotationTitle(name: string, owned: readonly string[] = []): string {
  const parts = parsePresetName(name, { owned: [...owned] });
  const tiers = parts.chips.filter((c) => c.kind === "own" || c.kind === "tier" || c.kind === "dps" || c.kind === "team").map((c) => c.label);
  return [parts.title || name, ...tiers].join(" · ");
}

export const enemyLine = (enemy: Pick<TeamEnemyConfig, "enemyLevel" | "enemyResist">): string => `enemy level ${enemy.enemyLevel}, ${Math.round(enemy.enemyResist * 100)} % RES`;

export const shareText = (share: number): string => `${(share * 100).toFixed(1)} %`;

/** "+8.48 %": two decimals under 10 %, where a roll's gains sit. */
export function gainText(gain: number): string {
  const size = Math.abs(gain);
  const sign = gain >= 0 ? "+" : "−";
  // never a false zero: a real gain under the last digit says so
  if (size > 0 && size < 0.00005) return `${sign}under 0.01 %`;
  return `${sign}${(size * 100).toFixed(size < 0.1 ? 2 : 1)} %`;
}

/** An option of the hit picker: which hit, what one press deals, how often. */
export function hitOption(hit: HitChoice, biggest: boolean): string {
  const times = hit.times > 1 ? ` × ${hit.times}` : "";
  return `${compact(hit.perPress)}${times} · ${hit.label}${biggest ? " (biggest)" : ""}`;
}

/** "Resonance Liberation · lands once · 42.2 % of the rotation". */
export function hitMeta(hit: HitChoice): string {
  const times = hit.times === 1 ? "lands once" : `lands ${fmt(hit.times)} times`;
  return `${hit.typeLabel} · ${times} · ${shareText(hit.share)} of the rotation`;
}

/** The crit step in words. */
export function critWords(crit: CritFactor, critHit: number): string {
  const rate = `${(crit.rate * 100).toFixed(1)} % Crit Rate`;
  const dmg = `${(crit.damage * 100).toFixed(1)} % Crit DMG`;
  const cap = crit.overCap ? " Anything past 100 % Crit Rate adds nothing." : "";
  return `${rate}, ${dmg}: a crit lands for ${fmt(critHit)}, and this is the average of crits and non-crits.${cap}`;
}

/** Why some lines are not in the tables, or null when none is missing. */
export function leftOutLine(leftOut: RotationAnatomy["leftOut"]): string | null {
  const lines = (n: number): string => `${n} line${n === 1 ? "" : "s"}`;
  const bits: string[] = [];
  if (leftOut.healing + leftOut.shield) bits.push(`${lines(leftOut.healing + leftOut.shield)} of healing or shields (not damage)`);
  if (leftOut.locked) bits.push(`${lines(leftOut.locked)} this build hasn't unlocked`);
  if (leftOut.zero) bits.push(`${lines(leftOut.zero)} that deal${leftOut.zero === 1 ? "s" : ""} nothing here`);
  return bits.length ? `Left out: ${bits.join(", ")}.` : null;
}

export type MoveSort = "hit" | "rotation";

/** The steps, most first by what the player is looking at. */
export function sortMoves(rows: readonly MoveRow[], by: MoveSort): MoveRow[] {
  const gain = (r: MoveRow): number => (by === "hit" ? r.hitGain : r.rotationGain);
  return [...rows].sort((a, b) => gain(b) - gain(a));
}
