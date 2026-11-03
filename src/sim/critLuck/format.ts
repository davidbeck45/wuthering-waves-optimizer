// Wuthering Tools+ — crit luck in plain words: a run's range ("8 runs in 10 land between 7.60M and 8.60M") and a chance
// ("62 %", "> 99 %"). Pure.
import { hasSpread, type DamageRange } from "./spread";

/** "8 runs in 10 land between 7.60M and 8.60M" — `fmt` formats each figure, `unit` follows the second ("DPS");
 *  null when the run has no spread worth a line (no crit in doubt). */
export function rangeSentence(range: Pick<DamageRange, "mean" | "p10" | "p90">, fmt: (n: number) => string, unit = ""): string | null {
  if (!hasSpread(range)) return null;
  return `8 runs in 10 land between ${fmt(range.p10)} and ${fmt(range.p90)}${unit ? ` ${unit}` : ""}`;
}

/** A chance as a whole percent, never a false 0 % or 100 %: "< 1 %", "> 99 %", "62 %". */
export function chanceText(p: number | null | undefined): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return "—";
  if (p < 0.005) return "< 1 %";
  if (p > 0.995) return "> 99 %";
  return `${Math.round(p * 100)} %`;
}

/** "in 62 % of runs", "in more than 99 runs in 100", "in fewer than 1 run in 100" — for a sentence. */
export function chancePhrase(p: number | null | undefined): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return "—";
  if (p < 0.005) return "in fewer than 1 run in 100";
  if (p > 0.995) return "in more than 99 runs in 100";
  return `in ${Math.round(p * 100)} % of runs`;
}
