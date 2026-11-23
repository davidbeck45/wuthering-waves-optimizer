// Wuthering Tools+ — the calculator's Team Buffs panel from the player's own builds of the two teammates
// (batch 5, lane real-panel).
//
// Ryan's calculator reads one character's Team Buffs panel: two teammates picked by hand and a switch for each buff
// they could give. Plus's team resolver (resolveTeam.ts) already derives that panel for saved teams from what each
// teammate's build really provides. This asks it the same question for a trio of the character and the two teammates,
// and puts every decision into words a player reads: what is on and why, what is off and why. It copies none of the
// resolver's rules: it runs it, then explains its result.
//
// A trio has no rotation, so the resolver's rule for a team with no actions applies: a buff worded for "the incoming
// Resonator" reaches both teammates. That is said once, where such a buff is on.
//
// Pure/async; no Vue.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { allEchoBuffs, allWeaponTeamBuffs, buffsByCharacter } from "../../buffs/index";
import { getExclusiveTeamBuffKeys } from "../../buffs/teamBuffs";
import { resolveCharacterEchoes, resolveTeamEnemyConfig, type TeamEnemyConfig } from "../../calculator/buildCharacterContext";
import { allCharactersList, getCharacterRosterDisplayName } from "../../characters/characters";
import { isHandoff, resolveTeamCharacters, type TeamBuffEntry } from "./resolveTeam";

interface Def {
  key: string;
  name?: string;
  details?: string;
  imageUrl?: string;
  hasStacks?: boolean;
  inputBase?: boolean;
  modifierBasedOn?: string | null;
}

export interface PanelLine {
  key: string;
  /** the buff's name as the panel shows it */
  name: string;
  /** the teammate it comes from */
  from: string;
  /** one sentence: why it is on, or why it is off */
  reason: string;
}

export interface RealPanel {
  characterId: string;
  teammates: [string, string];
  /** the buffs the builds give, as the panel stores them */
  buffs: Record<string, TeamBuffEntry>;
  on: PanelLine[];
  off: PanelLine[];
  /** lines about the trio as a whole (a teammate with no build, the incoming-Resonator rule) */
  notes: string[];
}

const plainName = (s: string | undefined): string => (s ?? "").replace(/<[^>]+>/g, "").trim();
const nameOf = (id: string): string => getCharacterRosterDisplayName(id) || id;
/** "SpectrumBlaster" → "Spectrum Blaster" */
const spaced = (key: string): string => key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");
const basename = (url: string | undefined): string => (url ?? "").split("/").pop()?.replace(/\.[a-z0-9]+$/i, "") ?? "";
const compact = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const SEQUENCE_RE = /^(?:Sequence Node|S)\s?(\d+):/;
const fmt = (n: number): string => (Math.round(n * 10) / 10).toLocaleString("en-US", { maximumFractionDigits: 1 });

function rarityOf(id: string): number | null {
  return (allCharactersList as Array<{ key: string; rarity?: number }>).find((c) => c.key === id)?.rarity ?? null;
}

/** The sequence a build is at, as the app's other pages say it: the highest node with an enabled chain entry
 *  ("SequenceNode3…", "S3…"), else the count of enabled entries, never past 6. */
function sequenceOf(record: Record<string, any> | undefined): number {
  const on = Object.entries((record?.resonanceChains ?? {}) as Record<string, { isEnabled?: boolean }>).filter(([, n]) => n?.isEnabled);
  const nodes = on.map(([key]) => Number(/^(?:SequenceNode|Sequence|S)([1-6])(?![0-9])/.exec(key)?.[1] ?? 0));
  return Math.min(6, Math.max(0, ...nodes) || on.length);
}

type Source =
  | { kind: "kit"; from: string; def: Def }
  | { kind: "weapon"; def: Def; weapon: string }
  | { kind: "set"; def: Def; set: string }
  | { kind: "main"; def: Def; echo: string };

/** True when `key` is a buff of some Resonator's kit (whoever's). */
function isOtherKit(key: string): boolean {
  return Object.values(buffsByCharacter as Record<string, Def[]>).some((defs) => defs.some((d) => d.key === key));
}

/** Where a stored key comes from: one of the two teammates' kits, or a weapon / set / main echo one of them wears. */
function sourceOf(key: string, teammates: string[]): Source | null {
  for (const from of teammates) {
    const def = ((buffsByCharacter as Record<string, Def[]>)[from] ?? []).find((d) => d.key === key);
    if (def) return { kind: "kit", from, def };
  }
  const weaponDef = (allWeaponTeamBuffs as Def[]).find((d) => d.key === key);
  if (weaponDef) return { kind: "weapon", def: weaponDef, weapon: basename(weaponDef.imageUrl) || weaponDef.name || key };
  const echoDef = (allEchoBuffs as Def[]).find((d) => d.key === key);
  if (echoDef) {
    const name = basename(echoDef.imageUrl);
    return (echoDef.imageUrl ?? "").includes("/echoes/sets/") ? { kind: "set", def: echoDef, set: name } : { kind: "main", def: echoDef, echo: name };
  }
  return null;
}

/** The teammate whose build carries a weapon / set / main echo buff (the resolver adds only what someone wears). */
function wearerOf(src: Source, teammates: string[], characters: Record<string, any>, inventoryEchoes: any[]): string {
  if (src.kind === "kit") return src.from;
  for (const id of teammates) {
    const r = characters[id] ?? {};
    if (src.kind === "weapon" && r.weapon && compact(r.weapon) === compact(src.weapon)) return id;
    if (src.kind === "main" && r.mainEcho?.echo && compact(r.mainEcho.echo) === compact(src.echo)) return id;
  }
  // a set: whoever wears five pieces of it, as the resolver counts them
  const wears = (id: string): boolean =>
    src.kind === "set" && resolveCharacterEchoes(characters[id]?.echoes, inventoryEchoes).filter((e: any) => e?.echoSet === src.set).length >= 5;
  return teammates.find(wears) ?? teammates[0];
}

const STAT_WORDS: Record<string, string> = { "Energy Regen": "Energy Regen", "Crit Rate": "Crit Rate", "Crit DMG": "Crit DMG" };

function onReason(src: Source, entry: TeamBuffEntry, who: string, characters: Record<string, any>): string {
  const name = nameOf(who);
  const bits: string[] = [];
  const has = Boolean(characters[who]);
  if (src.kind === "kit") {
    const seq = SEQUENCE_RE.exec(src.def.name ?? "");
    if (seq) bits.push(has ? `your ${name} is S${sequenceOf(characters[who])}, and it needs S${seq[1]}` : `${name} is counted as S${rarityOf(who) === 4 ? 6 : 0}`);
    else bits.push(`from ${name}'s kit`);
  } else if (src.kind === "weapon") {
    bits.push(`${name} holds ${spaced(src.weapon)}${entry.refinement != null ? ` at Rank ${entry.refinement}` : ""}`);
  } else if (src.kind === "set") {
    bits.push(`${name} wears 5 pieces of ${plainName(src.def.name) || spaced(src.set)}`);
  } else {
    bits.push(`${name}'s main echo is ${plainName(src.def.name) || spaced(src.echo)}`);
  }
  if (entry.stacks != null) bits.push(`${entry.stacks} stack${entry.stacks === 1 ? "" : "s"}`);
  if (entry.baseAttrValue != null && src.def.inputBase) {
    const stat = STAT_WORDS[src.def.modifierBasedOn ?? ""] ?? src.def.modifierBasedOn ?? "stat";
    bits.push(has ? `reads ${name}'s real ${fmt(entry.baseAttrValue)} % ${stat}` : `reads a typical ${fmt(entry.baseAttrValue)} % ${stat}`);
  }
  return `On: ${bits.join(", ")}.`;
}

function offReason(raw: string, from: string, receiver: string, characters: Record<string, any>): string {
  const name = nameOf(from);
  const needs = /^needs S(\d+)(, not set up \(assumed S(\d+)\))?/.exec(raw);
  if (needs) {
    return needs[2]
      ? `Off: you have no build of ${name}, so ${name} is counted as S${needs[3]}; it needs S${needs[1]}.`
      : `Off: your ${name} is S${sequenceOf(characters[from])}; it needs S${needs[1]}.`;
  }
  const mode = /^(.+) mode; .+ is in (.+)$/.exec(raw);
  if (mode) return `Off: it belongs to ${name}'s ${mode[1]} mode, and your ${name} is in ${mode[2]}.`;
  // the Unison and add-on-tier reasons already name the receiver in plain words
  return `Off: ${raw.replace(new RegExp(`\\b${receiver}\\b`, "g"), nameOf(receiver))}.`;
}

/**
 * What the resolver derives for `characterId`'s panel beside `teammates`, from the account's own builds, with a reason
 * for every buff it turns on and every one it leaves off.
 */
export async function deriveRealPanel(
  characterId: string,
  teammates: [string, string],
  characters: Record<string, any>,
  inventoryEchoes: any[],
  enemyConfig?: TeamEnemyConfig,
): Promise<RealPanel> {
  const own = characters[characterId] ?? {};
  // ask for a derivation: a panel that already names these two would be kept as the player's (resolveTeam.ts)
  const asked = {
    ...characters,
    [characterId]: { ...own, teamBuffs: { ...(own.teamBuffs ?? {}), selectedCharacter1: null, selectedCharacter2: null, buffs: {} } },
  };
  const resolution = await resolveTeamCharacters(
    { characterIds: [characterId, ...teammates], enemyConfig: {} },
    asked,
    inventoryEchoes,
    { enemyConfig: enemyConfig ?? resolveTeamEnemyConfig({}) },
  );
  const slot = resolution.slots.find((s) => s.characterId === characterId);
  const buffs: Record<string, TeamBuffEntry> = { ...(resolution.characters[characterId]?.teamBuffs?.buffs ?? {}) };
  const built = resolution.characters;

  const on: PanelLine[] = [];
  const handoffs: string[] = [];
  for (const [key, entry] of Object.entries(buffs)) {
    const src = sourceOf(key, teammates);
    if (!src) continue;
    const who = wearerOf(src, teammates, built, inventoryEchoes);
    const name = plainName(src.def.name) || key;
    if (isHandoff(src.def.details)) handoffs.push(name);
    on.push({ key, name, from: who, reason: onReason(src, entry, who, built) });
  }
  const seenOff = new Set<string>();
  const off: PanelLine[] = (slot?.skipped ?? []).filter((s) => !seenOff.has(s.key) && Boolean(seenOff.add(s.key))).map((s) => {
    const src = sourceOf(s.key, teammates);
    return { key: s.key, name: plainName(src?.def.name) || s.key, from: s.from, reason: offReason(s.reason, s.from, characterId, built) };
  });

  const notes: string[] = [];
  for (const id of teammates) {
    if (characters[id]) continue;
    const seq = rarityOf(id) === 4 ? 6 : 0;
    notes.push(`You have no build of ${nameOf(id)}: counted as S${seq} (${rarityOf(id) === 4 ? "a 4-star" : "a 5-star"}), with the buffs of their kit and nothing from a weapon or echoes.`);
  }
  if (handoffs.length) {
    notes.push(
      `${handoffs.join(", ")} ${handoffs.length === 1 ? "is" : "are"} worded for "the incoming Resonator": teammates picked here have no rotation that says who comes in after an Outro, so ${nameOf(characterId)} gets ${handoffs.length === 1 ? "it" : "them"}, as in a saved team with no rotation.`,
    );
  }

  return { characterId, teammates, buffs, on, off, notes };
}

/** The write that makes the panel read exactly `real`: the two teammates, every derived buff, and every other buff that
 *  is on now turned off (setCharacterData merges, so a key left out would stay on). */
export function realPanelWrite(real: RealPanel, current: Record<string, any> | null | undefined): Record<string, any> {
  const buffs: Record<string, TeamBuffEntry> = {};
  for (const [key, entry] of Object.entries((current?.buffs ?? {}) as Record<string, TeamBuffEntry>)) {
    if (entry?.isEnabled && !(key in real.buffs)) buffs[key] = { isEnabled: false };
  }
  for (const [key, entry] of Object.entries(real.buffs)) {
    buffs[key] = { ...entry };
    for (const other of getExclusiveTeamBuffKeys(key)) if (!(other in real.buffs)) buffs[other] = { isEnabled: false };
  }
  return { selectedCharacter1: real.teammates[0], selectedCharacter2: real.teammates[1], buffs };
}

export interface PanelDifference {
  key: string;
  name: string;
  /** what the panel says against what the builds give */
  says: string;
}

/** How the panel reads an entry; a weapon's missing Rank reads 1, as the calculator's own row does (refinementFor). */
const describeEntry = (e: TeamBuffEntry | undefined, weapon: boolean): string => {
  if (!e?.isEnabled) return "off";
  const bits = ["on"];
  if (e.stacks != null) bits.push(`${e.stacks} stack${e.stacks === 1 ? "" : "s"}`);
  if (weapon) bits.push(`Rank ${e.refinement ?? 1}`);
  if (e.baseAttrValue != null) bits.push(`reads ${fmt(Number(e.baseAttrValue))} %`);
  return bits.join(", ");
};

/** Where a stored panel differs from what the builds give: a buff on that they don't give, one off that they do, or the
 *  same buff at other stacks, rank or stat. Empty when the panel is exactly the builds' (teammates in either order). */
export function panelDifferences(real: RealPanel, panel: Record<string, any> | null | undefined): PanelDifference[] {
  const stored = (panel?.buffs ?? {}) as Record<string, TeamBuffEntry>;
  // a kit buff of someone not picked stays stored but counts for nothing: the panel reads only the two teammates' kits
  // and every weapon and echo buff (CalculatorTeamBuffsWorkspace's allRelevantDefs)
  const counted = (key: string): boolean => key in real.buffs || sourceOf(key, real.teammates) !== null || !isOtherKit(key);
  const keys = new Set([...Object.keys(real.buffs), ...Object.entries(stored).filter(([k, e]) => e?.isEnabled && counted(k)).map(([k]) => k)]);
  const out: PanelDifference[] = [];
  for (const key of keys) {
    const src = sourceOf(key, real.teammates);
    const a = describeEntry(stored[key], src?.kind === "weapon");
    const b = describeEntry(real.buffs[key], src?.kind === "weapon");
    if (a === b) continue;
    out.push({ key, name: plainName(src?.def.name) || key, says: `here: ${a} · your builds: ${b}` });
  }
  return out;
}

/** True when the panel names exactly these two teammates, in either order. */
export function panelNames(panel: Record<string, any> | null | undefined, teammates: [string, string]): boolean {
  const picks = [panel?.selectedCharacter1, panel?.selectedCharacter2].filter(Boolean).sort();
  return picks.length === 2 && picks[0] === [...teammates].sort()[0] && picks[1] === [...teammates].sort()[1];
}
