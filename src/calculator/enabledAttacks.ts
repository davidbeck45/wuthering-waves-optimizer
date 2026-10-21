import { computeResonanceChainsBuffs, computeSelfBuffs } from "./stats.ts";
import { resolveActiveStance } from "./stances.ts";

/**
 * An attack's `requiresResonanceChain` is an attack-unlock key, granted by an
 * `EnableAttack` modifier on a resonance chain or self buff (or a hard-coded
 * push in computeSelfBuffs). It is NOT necessarily that chain's own key —
 * e.g. Jianxin's S6 chain `SequenceNode6TruthfromWithin` enables
 * `SequenceNode6TruthfromWithinSpecialChiCounter` (#622). Every place that
 * decides whether a chain-locked attack is available goes through here so the
 * damage panel, damage chart and rotation editor can't disagree.
 */

type EnableAttackData = { EnableAttack?: string[] } | null | undefined;

/** Merges the `EnableAttack` lists from computed chain + self buff data. */
export function getEnabledAttackKeys(
  resonanceChainsData: EnableAttackData,
  selfBuffsData: EnableAttackData,
): Set<string> {
  return new Set([
    ...(resonanceChainsData?.EnableAttack ?? []),
    ...(selfBuffsData?.EnableAttack ?? []),
  ]);
}

/** Whether an attack is available given the unlocked attack keys. */
export function isAttackUnlocked(
  attack: { requiresResonanceChain?: string | false | null } | null | undefined,
  enabledAttackKeys: Set<string>,
): boolean {
  const requiredKey = attack?.requiresResonanceChain;
  if (!requiredKey) return true;
  return enabledAttackKeys.has(requiredKey);
}

type BuffConfig = Record<string, { isEnabled?: boolean; stacks?: number }>;

/**
 * Computes the unlocked attack keys straight from a character's definitions
 * and saved state, for callers (the rotation editor) that don't have the
 * active character's computed buff data — a team rotation action can belong
 * to any slot. Runs the same computeResonanceChainsBuffs/computeSelfBuffs the
 * damage pipeline does, so stack thresholds, stances and the stats.ts special
 * cases all match.
 */
export function getEnabledAttackKeysForCharacter(
  character: string,
  characterDefs:
    | {
        basic?: { stances?: string[] };
        resonanceChains?: unknown[];
        buffs?: unknown[];
      }
    | null
    | undefined,
  characterState:
    | {
        activeStance?: string;
        resonanceChains?: BuffConfig;
        buffs?: BuffConfig;
      }
    | null
    | undefined,
): Set<string> {
  const resonanceChainsConfig = characterState?.resonanceChains ?? {};
  const buffsConfig = characterState?.buffs ?? {};
  const activeStance = resolveActiveStance(
    characterDefs?.basic?.stances,
    characterState?.activeStance,
    buffsConfig,
  );
  const resonanceChainsData = computeResonanceChainsBuffs(
    resonanceChainsConfig,
    characterDefs?.resonanceChains ?? [],
    {},
    activeStance,
  );
  const selfBuffsData = computeSelfBuffs(
    buffsConfig,
    characterDefs?.buffs ?? [],
    resonanceChainsConfig,
    {},
    character,
    activeStance,
  );
  return getEnabledAttackKeys(resonanceChainsData, selfBuffsData);
}
