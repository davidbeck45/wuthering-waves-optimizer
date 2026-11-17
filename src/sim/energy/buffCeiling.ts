// Wuthering Tools+ — the Energy Regen at which a member's own team buffs stop growing (version 3.8, 2026-11-16).
//
// The energy check's need is what a Liberation costs in the team's wuwa_calc loop, or the floor his loadout keeps for
// a kit (Mornye 260 %, Shorekeeper 240 %). Four kits also turn their Energy Regen into team buffs, up to a ceiling the
// game's text gives: Lily (Dream Aroma and Silvered Dream: 0.1 % ATK per 1 % above 190 %, up to 7 %, so 260 %), Suisui
// (Rippling Waters, 260 %), Mornye (Interfered Marker, 260 %) and Shorekeeper (the two Stellarealms, 250 %). His
// loadouts keep a floor for two of the four. For the other two the page read "ok · +67 %" on a Lily at 240 % with a
// need of 173 %, while each stack of her Dream Aroma paid 5 % ATK where 7 % is on offer.
//
// The ceiling is said beside the need and never folded into it: the need stays what the loop measures, and the bands,
// the scores and the substat weights that read it are unchanged. Source: the app's own team buff definitions
// (src/buffs/index.ts), which carry the game's text as numbers. A sequence node's buff is left out: who owns the node
// is not known here, and no kit's ceiling rests on one alone. Pure.
import { buffsByCharacter } from "../../buffs/index";
import { haveText, pctText } from "./energyFormat";
import { showHave, showNeed } from "./energyNeed";

interface ScaledModifier {
  modifierValue?: unknown;
  modifierStep?: number;
  minStatValue?: number;
  maximumValue?: number;
  perStackMaximumValue?: number;
}
interface ScaledBuff {
  key: string;
  name?: string;
  inputBase?: boolean;
  modifierBasedOn?: string | null;
  modifiers?: ScaledModifier[];
}

export interface ErBuffCeiling {
  /** Energy Regen in %, as the character screen prints it */
  at: number;
  /** the buffs that grow up to it, by the name the calculator's Team Buffs panel gives them */
  buffs: string[];
}

const SEQUENCE_NODE = /^(?:Sequence Node|S)\s?\d+:/;
/** "Silvered Dream - ATK" and "Silvered Dream - Echo Skill Crit" are one buff to a player; "Outro Skill: Rippling
 *  Waters - 400 Floral Epistle" is Rippling Waters. */
const family = (name: string): string => name.replace(/^(?:Outro|Intro|Inherent) Skill:\s*/, "").split(" - ")[0].trim();

/** Where one modifier tops out: the stat it starts at plus the steps its cap holds. A stacked buff caps per stack
 *  ("up to 7 %" of Dream Aroma's 28 % over four), which is the figure the stat has to reach. */
function topOf(m: ScaledModifier): number | null {
  const value = typeof m.modifierValue === "number" ? m.modifierValue : 0;
  const cap = m.perStackMaximumValue ?? m.maximumValue;
  if (typeof m.modifierStep !== "number" || !(value > 0) || typeof cap !== "number") return null;
  return Math.round(((m.minStatValue ?? 0) + (cap / value) * m.modifierStep * 100) * 1e6) / 1e6;
}

/** The ceiling of a character's own Energy-Regen-scaled team buffs, null for a kit with none. */
export function erBuffCeiling(appKey: string): ErBuffCeiling | null {
  let at = 0;
  const buffs: string[] = [];
  for (const def of ((buffsByCharacter as Record<string, ScaledBuff[]>)[appKey] ?? []) as ScaledBuff[]) {
    if (!def.inputBase || def.modifierBasedOn !== "Energy Regen" || SEQUENCE_NODE.test(def.name ?? "")) continue;
    const tops = (def.modifiers ?? []).map(topOf).filter((t): t is number => t != null && t > 0);
    if (!tops.length) continue;
    at = Math.max(at, ...tops);
    const name = family(def.name ?? def.key);
    if (!buffs.includes(name)) buffs.push(name);
  }
  return at > 0 ? { at, buffs } : null;
}

export interface BuffCeilingNote {
  /** the build is under the ceiling: the row says so without being opened */
  below: boolean;
  text: string;
}

/** What to say beside a member's need. Null where the kit has no such buff, or where the need already asks for the
 *  ceiling (a kit floor at or above it: Mornye). `need` and `have` in %, as the energy check holds them. */
export function buffCeilingNote(who: string, ceiling: ErBuffCeiling | null, need: number | null, have: number | null): BuffCeilingNote | null {
  if (!ceiling) return null;
  if (need != null && showNeed(need) >= ceiling.at) return null;
  const lead = `${who}'s team buffs (${ceiling.buffs.join(", ")}) grow with ${who}'s Energy Regen up to ${pctText(ceiling.at, Number.isInteger(ceiling.at) ? 0 : 1)}.`;
  if (have == null) return { below: false, text: lead };
  const has = showHave(have);
  if (has >= ceiling.at) return { below: false, text: `${lead} This build has ${haveText(have)}, so they are full.` };
  return { below: true, text: `${lead} This build has ${haveText(have)}: ${(ceiling.at - has).toFixed(1)} points more would raise them.` };
}
