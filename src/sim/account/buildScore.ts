// Wuthering Tools+ — upstream's Build Score for any character, without the stores.
//
// Upstream computes it in `composables/useTeamSubstatScoreRollup.ts` (the grade on the calculator's echo panel,
// the build card and the v3 character rows): the average Substat Score (`echoes/rating.ts` getSubstatScoreGrade)
// over the character's equipped echo slots, against that character's weight profile (the curated
// `characters/substatPriorities.ts` defaults under the user's own overrides, as the character store's
// `getCharacterSubstatWeights` resolves them). That composable reads Pinia, so the account page would need one
// instance per card; this is the same arithmetic over plain data — the same grade a card shows here and in the
// calculator. Pure: no Vue, no stores.
import {
  DEFAULT_SUBSTAT_WEIGHTS,
  ZERO_SUBSTAT_WEIGHTS,
  getGradeForSubstatScorePercent,
  getSubstatScoreGrade,
  resolveSubstatWeights,
  type RatingColor,
} from "../../echoes/rating";
import { getCuratedSubstatWeights } from "../../characters/substatPriorities";

export interface BuildScore {
  /** 0–100, the average Substat Score of the equipped echoes */
  percent: number;
  grade: string;
  color: RatingColor;
  /** fewer than 5 echoes equipped, or an equipped echo with fewer than 5 revealed substats (upstream's "*") */
  provisional: boolean;
  /** equipped slots scored */
  echoes: number;
}

/** The character store's `getCharacterSubstatWeights`, over a plain record: curated defaults (stats they omit count 0)
 *  under the user's overrides; the neutral profile for a character with no curated one. */
export function characterSubstatWeights(characterId: string, characterData: Record<string, any> | undefined): Record<string, number> {
  const curated = getCuratedSubstatWeights(characterId);
  const baseline = curated ? ZERO_SUBSTAT_WEIGHTS : DEFAULT_SUBSTAT_WEIGHTS;
  return resolveSubstatWeights(baseline, curated, characterData?.substatWeights);
}

/** A slot holds an echo when it has an inventory id or an inline echo (upstream's rule, CalculatorEchoImporter). */
export const slotHasEcho = (slot: Record<string, any> | null | undefined): boolean => Boolean(slot?.echoId || slot?.echo);

/** How many of the five slots hold an echo (`echoes` is an object keyed "0"–"4" or, in older records, an array). */
export function equippedEchoCount(characterData: Record<string, any> | undefined): number {
  const slots = characterData?.echoes ?? {};
  let n = 0;
  for (let i = 0; i < 5; i++) if (slotHasEcho(slots[i] ?? slots[String(i)])) n += 1;
  return n;
}

/** upstream's Build Score for one character; null when no slot holds an echo. `inventoryEchoes` is the inventory
 *  store's `echoes` (the freshest copy of an equipped echo; the slot's own data when it has none). */
export function buildScoreOf(characterId: string, characterData: Record<string, any> | undefined, inventoryEchoes: any[]): BuildScore | null {
  const slots = characterData?.echoes ?? {};
  const weights = characterSubstatWeights(characterId, characterData);
  const byId = new Map<string, any>();
  for (const e of inventoryEchoes ?? []) if (e?.echoId) byId.set(e.echoId, e);
  const scores: Array<{ percent: number; provisional: boolean }> = [];
  for (let i = 0; i < 5; i++) {
    const slot = slots[i] ?? slots[String(i)];
    if (!slotHasEcho(slot)) continue;
    const echo = (slot.echoId && byId.get(slot.echoId)) || slot;
    const score = getSubstatScoreGrade(echo, weights);
    scores.push({ percent: score.percent, provisional: score.provisional });
  }
  if (!scores.length) return null;
  const percent = scores.reduce((sum, s) => sum + s.percent, 0) / scores.length;
  const { grade, color } = getGradeForSubstatScorePercent(percent);
  return { percent, grade, color, provisional: scores.length < 5 || scores.some((s) => s.provisional), echoes: scores.length };
}
