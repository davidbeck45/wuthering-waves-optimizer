// Wuthering Tools+ build history — what changed between two versions of one character's build, in plain words.
// Gear (weapon, refinement, sequence, the five echoes slot by slot, other settings) is pure and sync; the stats and
// the damage go through the app's own engine (async): character-screen stats from buildCharacterCalculationContext
// (equipment and always-on bonuses, like upstream's build card), damage from /my-rankings' scorer (`scoreRotation`
// at RANKING_ENEMY), both versions on the SAME rotation so the two numbers compare.
import { mainEchoesData } from "../../echoes/index";
import { getEchoSetLabelByType, statsTable } from "../../echoes/stats";
import { buildCharacterCalculationContext } from "../../calculator/buildCharacterContext";
import { displayInt, displayPercentage } from "../../utils/numbers";
import { RANKING_ENEMY, scoreRotation } from "../myRankings/rankRoster";
import { buildHeadline } from "../share/headline";
import { buildFieldsFromMember, inlineEchoSlotsOf, weaponName, type ShareEcho, type ShareMember, type ShareRotation } from "../share/buildCodec";
import { echoFingerprint } from "../share/mergePreview";
import { cyrb53, stableStringify } from "../myRankings/rankingCache";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Full stat names: a diff is read line by line, so "ER" or a bare "ATK" would be ambiguous. */
export const STAT_NAME: Record<string, string> = {
  HP_FLAT: "HP",
  ATK_FLAT: "ATK",
  DEF_FLAT: "DEF",
  // the percentage stats: the value's own "%" tells them from the flat ones ("ATK 50" / "ATK 10.1%")
  HP: "HP",
  ATK: "ATK",
  DEF: "DEF",
  EnergyRegen: "Energy Regen",
  CritRate: "Crit Rate",
  CritDMG: "Crit DMG",
  BasicAttackDMGBonus: "Basic Attack DMG Bonus",
  HeavyAttackDMGBonus: "Heavy Attack DMG Bonus",
  ResonanceSkillDMGBonus: "Resonance Skill DMG Bonus",
  ResonanceLiberationDMGBonus: "Resonance Liberation DMG Bonus",
  Glacio: "Glacio DMG Bonus",
  Fusion: "Fusion DMG Bonus",
  Electro: "Electro DMG Bonus",
  Aero: "Aero DMG Bonus",
  Spectro: "Spectro DMG Bonus",
  Havoc: "Havoc DMG Bonus",
  HealingBonus: "Healing Bonus",
};

/** Build fields as words, for the "other settings" line. */
const SETTING_NAME: Record<string, string> = {
  buffs: "buff toggles",
  customBuffs: "custom buffs",
  teamBuffs: "the Team Buffs panel",
  weaponPassives: "weapon passive settings",
  echoSetPassives: "set passive settings",
  resonanceChains: "sequence nodes",
  rotations: "saved rotations",
  optimizer: "optimizer settings",
  enemyLevel: "enemy level",
  enemyResist: "enemy resistance",
  activeStance: "stance",
  aeroErosionStacks: "Aero Erosion stacks",
  havocBaneStacks: "Havoc Bane stacks",
  strainStacks: "stacks",
};
/** Derived from the echoes (shown with them), not a setting of their own. */
const DERIVED = new Set(["echoSetBonus", "mainEcho"]);

const statText = (key: string, value: number): string => (key.endsWith("_FLAT") ? displayInt(value) : `${displayPercentage(value)}`);
/** a stat's number as `statText` shows it ("1,262" → 1262, "24.0%" → 24) */
const shownValue = (text: string): number => Number(text.replace(/[,%]/g, ""));
const same = (a: unknown, b: unknown): boolean => stableStringify(a ?? null) === stableStringify(b ?? null);

export const echoName = (key: string | null | undefined): string => (key ? ((mainEchoesData as Record<string, any>)[key]?.name ?? key) : "");
export const setName = (key: string | null | undefined): string => (key ? (getEchoSetLabelByType(key) ?? key) : "no set");

function mainValue(e: ShareEcho): number | null {
  if (!e.main) return null;
  return (statsTable as Record<number, Record<string, Record<number, number>>>)[e.cost]?.[e.main]?.[e.rarity] ?? null;
}

/** "Crit DMG 44 %" — the main stat as the echo shows it. */
export function mainText(e: ShareEcho): string {
  if (!e.main) return "no main stat";
  const v = mainValue(e);
  return `${STAT_NAME[e.main] ?? e.main}${v !== null ? ` ${statText(e.main, v)}` : ""}`;
}

export const subText = ([k, v]: [string, number]): string => `${STAT_NAME[k] ?? k} ${statText(k, v)}`;

export type SlotStatus = "same" | "changed" | "moved" | "added" | "removed" | "empty";

export interface SlotDiff {
  slot: number;
  status: SlotStatus;
  from: ShareEcho | null;
  to: ShareEcho | null;
  /** "moved from slot 3" when the same echo sat in another slot before */
  movedFrom?: number;
  /** what changed, one plain sentence each */
  lines: string[];
}

function echoLines(a: ShareEcho, b: ShareEcho): string[] {
  const lines: string[] = [];
  if (a.key !== b.key) lines.push(`Echo: ${echoName(a.key)} → ${echoName(b.key)}`);
  if ((a.set ?? null) !== (b.set ?? null)) lines.push(`Set: ${setName(a.set)} → ${setName(b.set)}`);
  if (a.main !== b.main || a.rarity !== b.rarity || a.cost !== b.cost) lines.push(`Main stat: ${mainText(a)} → ${mainText(b)}`);
  const before = new Map(a.subs.map(([k, v]) => [k, v]));
  const after = new Map(b.subs.map(([k, v]) => [k, v]));
  for (const [k, v] of b.subs) {
    const old = before.get(k);
    if (old === undefined) lines.push(`New substat: ${subText([k, v])}`);
    else if (Math.abs(old - v) > 1e-6) lines.push(`${STAT_NAME[k] ?? k}: ${statText(k, old)} → ${statText(k, v)}`);
  }
  for (const [k, v] of a.subs) if (!after.has(k)) lines.push(`Substat gone: ${subText([k, v])}`);
  return lines;
}

/** The five slots side by side: the same echo, another one (and what differs on it), one moved, one added or taken off. */
export function slotDiffs(a: ShareMember, b: ShareMember): SlotDiff[] {
  const fpA = a.echoes.map((e) => (e ? echoFingerprint(e) : null));
  const fpB = b.echoes.map((e) => (e ? echoFingerprint(e) : null));
  const out: SlotDiff[] = [];
  for (let slot = 0; slot < 5; slot++) {
    const from = a.echoes[slot] ?? null;
    const to = b.echoes[slot] ?? null;
    if (!from && !to) {
      out.push({ slot, status: "empty", from, to, lines: [] });
      continue;
    }
    if (!from && to) {
      out.push({ slot, status: "added", from, to, lines: [`Added: ${echoName(to.key)} (${setName(to.set)}, ${mainText(to)})`] });
      continue;
    }
    if (from && !to) {
      out.push({ slot, status: "removed", from, to, lines: [`Taken off: ${echoName(from.key)} (${setName(from.set)}, ${mainText(from)})`] });
      continue;
    }
    if (fpA[slot] === fpB[slot]) {
      out.push({ slot, status: "same", from, to, lines: [] });
      continue;
    }
    const was = fpB[slot] ? fpA.indexOf(fpB[slot]) : -1;
    if (was >= 0) {
      out.push({ slot, status: "moved", from, to, movedFrom: was, lines: [`${echoName(to!.key)} moved here from slot ${was + 1}`] });
      continue;
    }
    out.push({ slot, status: "changed", from, to, lines: echoLines(from!, to!) });
  }
  return out;
}

export interface GearDiff {
  /** true when nothing a restore writes differs */
  identical: boolean;
  weapon: { from: string | null; to: string | null; fromRank: number | null; toRank: number | null; changed: boolean; text: string | null };
  sequence: { from: number; to: number; text: string | null };
  slots: SlotDiff[];
  /** build fields (as words) that differ and are not shown above */
  settings: string[];
  /** level / talents differ: they belong to the character, so a restore keeps today's */
  characterNotes: string[];
  /** every change, one line each */
  lines: string[];
  /** the same, one line per slot (the restore confirm lists these) */
  summary: string[];
}

/** One line for a slot: "Kronaclaw → Tambourinist (set Havoc Eclipse, main stat Havoc DMG Bonus 30.0%, 5 substats differ)". */
export function slotSummary(s: SlotDiff): string | null {
  if (s.status === "same" || s.status === "empty") return null;
  if (s.status !== "changed" || !s.from || !s.to) return s.lines[0] ?? null;
  const a = s.from;
  const b = s.to;
  const what = a.key !== b.key ? `${echoName(a.key)} → ${echoName(b.key)}` : `${echoName(b.key)} with other stats`;
  const extras: string[] = [];
  if ((a.set ?? null) !== (b.set ?? null)) extras.push(`set ${setName(b.set)}`);
  if (a.main !== b.main || a.rarity !== b.rarity || a.cost !== b.cost) extras.push(`main stat ${mainText(b)}`);
  const subsA = new Map(a.subs);
  const subsB = new Map(b.subs);
  const keys = new Set([...subsA.keys(), ...subsB.keys()]);
  const differ = [...keys].filter((k) => !subsA.has(k) || !subsB.has(k) || Math.abs(subsA.get(k)! - subsB.get(k)!) > 1e-6).length;
  if (differ) extras.push(`${differ} substat${differ === 1 ? "" : "s"} differ${differ === 1 ? "s" : ""}`);
  return `${what}${extras.length ? ` (${extras.join(", ")})` : ""}`;
}

const weaponText = (charId: string, w: ShareMember["weapon"]): string => (w ? `${weaponName(w.id, charId)} R${w.rank}` : "no weapon");
const talentLine = (t: Record<string, unknown> | null): string => ["basic", "skill", "forte", "liberation", "intro"].map((k) => String(t?.[k] ?? 10)).join("/");

/** Everything that differs from version `a` (before) to version `b` (after). */
export function gearDiff(charId: string, a: ShareMember, b: ShareMember): GearDiff {
  const wa = a.weapon;
  const wb = b.weapon;
  const weaponChanged = (wa?.id ?? null) !== (wb?.id ?? null) || (wa?.rank ?? null) !== (wb?.rank ?? null) || (wa?.level ?? null) !== (wb?.level ?? null);
  const weapon = {
    from: wa?.id ?? null,
    to: wb?.id ?? null,
    fromRank: wa?.rank ?? null,
    toRank: wb?.rank ?? null,
    changed: weaponChanged,
    text: weaponChanged ? `Weapon: ${weaponText(charId, wa)}${wa?.level && wa.level !== wb?.level ? ` (Lv ${wa.level})` : ""} → ${weaponText(charId, wb)}${wb?.level && wa?.level !== wb.level ? ` (Lv ${wb.level})` : ""}` : null,
  };
  const sequence = { from: a.sequence, to: b.sequence, text: a.sequence !== b.sequence ? `Sequence: S${a.sequence} → S${b.sequence}` : null };
  const slots = slotDiffs(a, b);
  const ca = a.config ?? {};
  const cb = b.config ?? {};
  const settings: string[] = [];
  for (const key of [...new Set([...Object.keys(ca), ...Object.keys(cb)])].sort()) {
    if (DERIVED.has(key) || same(ca[key], cb[key])) continue;
    // the sequence line already says it when the node count moved
    if (key === "resonanceChains" && sequence.text) continue;
    settings.push(SETTING_NAME[key] ?? key);
  }
  // a main echo buff toggled without the echo changing
  const mainEchoSame = (ca.mainEcho as any)?.echo === (cb.mainEcho as any)?.echo;
  if (mainEchoSame && !same(ca.mainEcho, cb.mainEcho)) settings.push("main echo buff settings");
  const characterNotes: string[] = [];
  if (a.level !== null && b.level !== null && a.level !== b.level) characterNotes.push(`Level ${a.level} → ${b.level}`);
  if (a.talents && b.talents && talentLine(a.talents) !== talentLine(b.talents)) characterNotes.push(`Talents ${talentLine(a.talents)} → ${talentLine(b.talents)}`);

  const lines: string[] = [];
  if (weapon.text) lines.push(weapon.text);
  if (sequence.text) lines.push(sequence.text);
  for (const s of slots) for (const l of s.lines) lines.push(`Slot ${s.slot + 1}: ${l}`);
  if (settings.length) lines.push(`Also different: ${settings.join(", ")}`);
  const summary: string[] = [];
  if (weapon.text) summary.push(weapon.text);
  if (sequence.text) summary.push(sequence.text);
  for (const s of slots) {
    const line = slotSummary(s);
    if (line) summary.push(`Slot ${s.slot + 1}: ${line}`);
  }
  if (settings.length) summary.push(`Also different: ${settings.join(", ")}`);
  const identical = !weapon.changed && !sequence.text && slots.every((s) => s.status === "same" || s.status === "empty") && !settings.length && same(ca.mainEcho, cb.mainEcho) && same(ca.echoSetBonus, cb.echoSetBonus);
  return { identical, weapon, sequence, slots, settings, characterNotes, lines, summary };
}

// ---------------------------------------------------------------------------------------------------------
// Through the engine

/** A version as the engine reads a character record: every build field, the five echoes inline (no inventory). */
export function memberRecord(member: ShareMember): Record<string, any> {
  return {
    ...buildFieldsFromMember(member, inlineEchoSlotsOf(member)),
    characterLevel: member.level !== null ? String(member.level) : undefined,
    talents: member.talents ?? undefined,
  };
}

export interface StatRow {
  key: string;
  label: string;
  from: number;
  to: number;
  fromText: string;
  toText: string;
  /** "+4.9 pts" (percentage points) / "−120" (a flat stat); "" when equal */
  deltaText: string;
  changed: boolean;
}

const ELEMENT_STAT: Record<string, string> = { Glacio: "glacio", Fusion: "fusion", Electro: "electro", Aero: "aero", Spectro: "spectro", Havoc: "havoc" };
const CHAR_SCREEN_ENEMY = { enemyLevel: 90, enemyResist: 0.1, enemyType: "Calamity" };

/** Character-screen stats of one version: gear and always-on bonuses (upstream's build card semantics). */
export async function characterScreenStats(charId: string, member: ShareMember): Promise<Record<string, number>> {
  const ctx = await buildCharacterCalculationContext(charId, { [charId]: memberRecord(member) }, CHAR_SCREEN_ENEMY as any, [], { alwaysEnabledOnly: true });
  const fs = ctx.finalStats as Record<string, number>;
  const out: Record<string, number> = {
    HP_FLAT: fs.totalHp ?? 0,
    ATK_FLAT: fs.totalAtk ?? 0,
    DEF_FLAT: fs.totalDef ?? 0,
    CritRate: fs.critRate ?? 0,
    CritDMG: fs.critDMG ?? 0,
    EnergyRegen: (fs.energyRegen ?? 1) * 100,
    BasicAttackDMGBonus: fs.basicAttackDMGBonus ?? 0,
    HeavyAttackDMGBonus: fs.heavyAttackDMGBonus ?? 0,
    ResonanceSkillDMGBonus: fs.resonanceSkillDMGBonus ?? 0,
    ResonanceLiberationDMGBonus: fs.resonanceLiberationDMGBonus ?? 0,
    HealingBonus: (fs.healingBonus ?? 0) * 100,
  };
  for (const [element, key] of Object.entries(ELEMENT_STAT)) out[element] = fs[key] ?? 0;
  return out;
}

const ORDER = ["HP_FLAT", "ATK_FLAT", "DEF_FLAT", "CritRate", "CritDMG", "EnergyRegen", "Glacio", "Fusion", "Electro", "Aero", "Spectro", "Havoc", "BasicAttackDMGBonus", "HeavyAttackDMGBonus", "ResonanceSkillDMGBonus", "ResonanceLiberationDMGBonus", "HealingBonus"];

const ELEMENTS = new Set(Object.keys(ELEMENT_STAT));

/**
 * The stat table, in the game's order; a bonus that is 0 on both sides is left out, and of the six element bonuses
 * only the character's own and any that changed (an all-element bonus would print six equal rows).
 */
export function statRows(a: Record<string, number>, b: Record<string, number>, element: string | null = null): StatRow[] {
  const rows: StatRow[] = [];
  for (const key of ORDER) {
    const from = a[key] ?? 0;
    const to = b[key] ?? 0;
    const always = key === "HP_FLAT" || key === "ATK_FLAT" || key === "DEF_FLAT" || key === "CritRate" || key === "CritDMG" || key === "EnergyRegen";
    if (!always && Math.abs(from) < 1e-9 && Math.abs(to) < 1e-9) continue;
    if (ELEMENTS.has(key) && element && key !== element && statText(key, from) === statText(key, to)) continue;
    const flat = key.endsWith("_FLAT");
    const fromText = statText(key, from);
    const toText = statText(key, to);
    // equal as the game shows them (floored flat stats, one-decimal percentages) is equal
    const changed = fromText !== toText;
    // the change between the two numbers as shown ("1,262 → 1,240" is −22; from the raw values it read −21)
    const d = shownValue(toText) - shownValue(fromText);
    // a percentage stat moves by percentage points: "24.0% → 21.0%" is "−3.0 pts", not a bare "−3.0"
    const deltaText = !changed ? "" : `${d >= 0 ? "+" : "−"}${flat ? displayInt(Math.abs(d)) : `${Math.abs(d).toFixed(1)}\u00a0pts`}`;
    rows.push({ key, label: STAT_NAME[key] ?? key, from, to, fromText, toText, deltaText, changed });
  }
  return rows;
}

export interface RotationRef {
  name: string;
  source?: string;
  duration: number | string | null;
  actions: any[];
  /** fingerprint of the actions (a cache key) */
  key: string;
}

export interface DamageReading {
  avgDamage: number;
  /** only when the rotation carries a duration */
  dps: number | null;
}

let rotSeq = 0;
function rotationInput(rotation: RotationRef): any {
  return {
    id: `history-${rotSeq++}`,
    name: rotation.name,
    duration: rotation.duration ?? null,
    actions: rotation.actions.map((a: any, i: number) => ({ ...a, id: a?.id ?? `hist-${i}`, buffs: a?.buffs ?? [] })),
  };
}

export function rotationRefOf(r: ShareRotation, source?: string): RotationRef {
  return { name: r.name, source, duration: r.duration ?? null, actions: r.actions as any[], key: cyrb53(stableStringify([r.name, r.duration ?? null, r.actions])) };
}

/**
 * The character's best rotation — the /my-rankings pick (`buildHeadline`: their own rotations, the curated presets and
 * wuwa_calc's loops on the build) — on the live build, else on the newest version that scores. Null when nothing
 * scores (no weapon anywhere).
 */
export async function bestRotationOf(charId: string, characters: Record<string, any>, echoes: any[], fallbacks: ShareMember[] = []): Promise<RotationRef | null> {
  const live = await buildHeadline(charId, characters, echoes).catch(() => null);
  if (live) return rotationRefOf(live.rotation, live.headline.source);
  for (const m of fallbacks) {
    const h = await buildHeadline(charId, { ...characters, [charId]: memberRecord(m) }, echoes).catch(() => null);
    if (h) return rotationRefOf(h.rotation, h.headline.source);
  }
  return null;
}

/** One version's damage on a rotation, at /my-rankings' enemy (level 100, 20 % RES); teammates from today's account. */
export async function damageOf(charId: string, member: ShareMember, rotation: RotationRef, characters: Record<string, any>, echoes: any[]): Promise<DamageReading | null> {
  if (!member.weapon) return null;
  try {
    const score = await scoreRotation(rotationInput(rotation), charId, { ...characters, [charId]: memberRecord(member) }, RANKING_ENEMY, echoes);
    return { avgDamage: score.avgDamage, dps: score.dps };
  } catch {
    return null;
  }
}

/** "+5.4 %" / "−2.0 %" / "same", from a to b. */
export function changeText(from: number | null | undefined, to: number | null | undefined): string {
  if (!from || !to || !Number.isFinite(from) || !Number.isFinite(to)) return "";
  const d = (to / from - 1) * 100;
  if (Math.abs(d) < 0.05) return "same";
  return `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} %`;
}
