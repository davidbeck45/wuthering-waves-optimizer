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
// Pure.
import { hashText, scoredCharacters } from "../echoLab/fingerprint";
import { stableStringify } from "../myRankings/rankingCache";
import { refinementOf, sequenceOf } from "../myRankings/rankRoster";

/* eslint-disable @typescript-eslint/no-explicit-any */

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

const WEAPON_FIELDS = ["weapon", "weapons", "weaponPassives"];
const CHAIN_FIELDS = ["resonanceChains"];
const LEVEL_FIELDS = ["characterLevel", "talents"];
const ECHO_FIELDS = ["echoes", "mainEcho", "echoSetBonus", "echoSetPassives", "echoPresetId"];
/** the build list is read through a team's pins only (`rec`); the rest is bookkeeping */
const OTHER_SKIPS = new Set([...WEAPON_FIELDS, ...CHAIN_FIELDS, ...LEVEL_FIELDS, ...ECHO_FIELDS, "builds", "activeBuildId"]);
/** never read by a score, wherever they sit */
const BOOKKEEPING = new Set(["createdAt", "updatedAt", "notes", "buildStatus", "buildComplete"]);

/** 8 base-36 characters of cyrb53 over the key-sorted JSON: enough to tell two states of one build apart */
const short = (value: unknown): string => hashText(stableStringify(value)).padStart(8, "0").slice(-8);

function withoutBookkeeping(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutBookkeeping);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (!BOOKKEEPING.has(k)) out[k] = withoutBookkeeping(v);
  return out;
}

/** The inventory's echoes by id, without the id itself: the same echo under a new id (a re-import) is the same echo. */
export function echoIndex(echoes: readonly any[] | null | undefined): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const e of echoes ?? []) if (e?.echoId) out.set(String(e.echoId), withoutId(e));
  return out;
}

const withoutId = (echo: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(echo).filter(([k]) => k !== "echoId"));

/** The five slots as scored: the inventory's echo where a slot points at one, else what the slot itself holds. */
function wornEchoes(slots: Record<string, any> | null | undefined, index: ReadonlyMap<string, unknown>): unknown[] {
  return Object.keys(slots ?? {})
    .sort()
    .map((slot) => {
      const worn = slots?.[slot];
      const id = worn?.echoId;
      if (id && index.has(String(id))) return index.get(String(id));
      return worn && typeof worn === "object" ? withoutId(worn) : null;
    });
}

const pick = (record: Record<string, any>, fields: readonly string[]): Record<string, unknown> => Object.fromEntries(fields.filter((f) => f in record).map((f) => [f, record[f]]));

/** The signature of one character as a ranking scored them. `index` is `echoIndex(inventory echoes)`. */
export function buildSignature(characterData: Record<string, any> | null | undefined, index: ReadonlyMap<string, unknown>): BuildSig {
  const scored = (scoredCharacters({ c: characterData ?? {} }) as { c: Record<string, any> }).c ?? {};
  const record = withoutBookkeeping(scored) as Record<string, any>;
  const weapon: string | null = record.weapon ? String(record.weapon) : null;
  const rest = Object.fromEntries(Object.entries(record).filter(([k]) => !OTHER_SKIPS.has(k)));
  const builds = Array.isArray(record.builds) ? (record.builds as Array<Record<string, any>>) : [];
  return {
    weapon,
    refinement: refinementOf(record),
    sequence: sequenceOf(record),
    // only the equipped weapon's own settings: the levels of weapons left in the bag move nothing
    hw: short({ weapon, settings: weapon ? (record.weapons?.[weapon] ?? null) : null, passives: record.weaponPassives ?? null }),
    hs: short(pick(record, CHAIN_FIELDS)),
    hl: short(pick(record, LEVEL_FIELDS)),
    he: short({ ...pick(record, ECHO_FIELDS), echoes: wornEchoes(record.echoes, index) }),
    ho: short(rest),
    rec: short({ record, worn: wornEchoes(record.echoes, index), builds: builds.map((b) => wornEchoes(b?.echoes, index)) }),
  };
}

/** A saved team as the ranking reads it: who, which builds are pinned, the rotation and its timing. Its name, notes and
 *  its own enemy are not read (the ranking scores every team at one enemy). */
export function teamDefinitionHash(team: Record<string, any> | null | undefined): string {
  if (!team) return "";
  return short(withoutBookkeeping({ characterIds: team.characterIds ?? [], buildIds: team.buildIds ?? [], actions: team.actions ?? [], duration: team.duration ?? null, handoffs: team.handoffs ?? null }));
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
