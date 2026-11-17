// Wuthering Tools+ numbers log — a signature of the build a ranking scored, so a later record can say what changed.
//
// A character's own figure is scored on the record as the calculator shows it (the active build). The signature hashes
// that record in five parts, each a group of fields the engine reads, and keeps the three facts worth saying in words
// (the weapon, its refinement, the sequence):
//   hw  weapon      the weapon, its level and refinement, the weapon passive switches
//   hs  chain       the Resonance Chain: which nodes are on, and their stacks
//   hl  levels      the character level and the Forte skill levels
//   he  echoes      the five echoes as the inventory holds them, the main echo, the Sonata bonuses
//   ho  the rest    buffs, saved rotations, stacks and stances: everything else a score reads
// `rec` is the whole record with every saved build and the echoes those wear, because a team can pin any of them: it is
// what a team figure asks about ("did a member change at all?"). Bookkeeping a score never reads (when a build was
// saved, its notes, the optimizer's search panel) is left out of all of it, so a change there is never named as a cause.
//
// This file is the signature's shape and how two are read against each other: it imports nothing, because the pages
// that show the log load it. Making a signature reads the engine's own helpers and lives in entry.ts, which only the
// recorder loads (signature.test.ts holds this file and the other page-side modules to that).

export interface BuildSig {
  /** the equipped weapon's key */
  weapon: string | null;
  refinement: number;
  sequence: number;
  hw: string;
  hs: string;
  hl: string;
  he: string;
  ho: string;
  rec: string;
}

export type SigPart = "weapon" | "refinement" | "weapon-settings" | "sequence" | "chain" | "levels" | "echoes" | "other";

/** Which parts of a build differ between two signatures, in the order a player would name them. */
export function changedParts(before: BuildSig, after: BuildSig): SigPart[] {
  const out: SigPart[] = [];
  if (before.hw !== after.hw) out.push(before.weapon !== after.weapon ? "weapon" : before.refinement !== after.refinement ? "refinement" : "weapon-settings");
  if (before.hs !== after.hs) out.push(before.sequence !== after.sequence ? "sequence" : "chain");
  if (before.he !== after.he) out.push("echoes");
  if (before.hl !== after.hl) out.push("levels");
  if (before.ho !== after.ho) out.push("other");
  return out;
}

/** True when the active build did not change but something else on the record did: a saved build that is not worn. */
export const onlyASavedBuildChanged = (before: BuildSig, after: BuildSig): boolean => before.rec !== after.rec && !changedParts(before, after).length;
