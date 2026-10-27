// Wuthering Tools+ share cards — what a card shows, built from a payload alone (no stores), so the card a player
// shares and the preview someone else gets when they drop it render the same thing from the same data. Async:
// it loads the character and weapon modules and runs the stats pipeline on the card's inline echoes.
import { getCharByName, getCharacterRosterDisplayName, characterPortraitUrl } from "../../characters/characters";
import { getWeaponByName } from "../../weapons/weapons";
import { mainEchoesData } from "../../echoes/index";
import { getEchoSetIconByType, getEchoSetLabelByType, getSubStatIconByType, getSubstatRollValue, statsTable } from "../../echoes/stats";
import { getSetBonusThreshold } from "../../echoes/sets";
import { buildCharacterCalculationContext } from "../../calculator/buildCharacterContext";
import { displayInt, displayPercentage } from "../../utils/numbers";
import { buildFieldsFromMember, inlineEchoSlotsOf, weaponTypeOf, type ShareMember, type SharePayload } from "./buildCodec";

/** Short labels — a card's tiles are narrow. */
export const SHORT_STAT: Record<string, string> = {
  HP_FLAT: "HP",
  ATK_FLAT: "ATK",
  DEF_FLAT: "DEF",
  HP: "HP%",
  ATK: "ATK%",
  DEF: "DEF%",
  EnergyRegen: "ER",
  CritRate: "Crit Rate",
  CritDMG: "Crit DMG",
  BasicAttackDMGBonus: "Basic ATK",
  HeavyAttackDMGBonus: "Heavy ATK",
  ResonanceSkillDMGBonus: "Skill DMG",
  ResonanceLiberationDMGBonus: "Liberation",
  Glacio: "Glacio DMG",
  Fusion: "Fusion DMG",
  Electro: "Electro DMG",
  Aero: "Aero DMG",
  Spectro: "Spectro DMG",
  Havoc: "Havoc DMG",
  HealingBonus: "Healing",
};

export interface EchoSubView {
  key: string;
  label: string;
  display: string;
  icon: string | null;
  /** roll quality 1–4 (low · mid-low · mid-high · high) — upstream's echo-card buckets (useEchoCardStats.ts), coloured
   *  by the card's own theme rather than the app's `dark:` variant */
  tone: number;
}

export interface EchoView {
  key: string;
  name: string;
  image: string | null;
  cost: number;
  rarity: number;
  set: string | null;
  setLabel: string | null;
  setIcon: string | null;
  main: string | null;
  mainLabel: string;
  mainDisplay: string;
  mainIcon: string | null;
  subs: EchoSubView[];
  /** crit value: 2 × Crit Rate + Crit DMG from the substats */
  cv: number;
}

export interface StatView {
  key: string;
  label: string;
  display: string;
  icon: string | null;
}

export interface MemberView {
  charId: string;
  name: string;
  rarity: number;
  element: string | null;
  /** the tall character art (upstream's build card uses it too) */
  art: string | null;
  /** the 256 px head portrait (fallback) */
  headshot: string;
  sequence: number;
  level: number;
  buildName: string;
  weapon: { name: string; image: string | null; rarity: number; rank: number; level: number } | null;
  echoes: Array<EchoView | null>;
  sets: Array<{ key: string; label: string; icon: string | null; count: number }>;
  stats: StatView[];
  talents: number[];
}

export interface CardView {
  kind: SharePayload["kind"];
  members: MemberView[];
  teamName: string | null;
}

// upstream's build-card formatting (src/utils/numbers.ts): flat stats floored like the game, percentages to 0.1
const pct = (v: number): string => displayPercentage(v);
const flat = (v: number): string => displayInt(v);

/** Same buckets as upstream's getSubstatRollQualityClasses: ≤ 40 / ≤ 60 / ≤ 80 / above, on its 30–100 roll score. */
export function rollTone(key: string, value: number): number {
  const score = getSubstatRollValue(key, String(Number(value)));
  if (!Number.isFinite(score) || score <= 40) return 1;
  if (score <= 60) return 2;
  if (score <= 80) return 3;
  return 4;
}

export function formatStat(key: string, value: number): string {
  return key.endsWith("_FLAT") ? flat(value) : pct(value);
}

export function echoView(e: ShareMember["echoes"][number]): EchoView | null {
  if (!e) return null;
  const data = (mainEchoesData as Record<string, any>)[e.key];
  const mainValue = e.main ? ((statsTable as Record<number, Record<string, Record<number, number>>>)[e.cost]?.[e.main]?.[e.rarity] ?? null) : null;
  let cv = 0;
  const subs = e.subs.map(([k, v]) => {
    if (k === "CritRate") cv += 2 * v;
    if (k === "CritDMG") cv += v;
    return { key: k, label: SHORT_STAT[k] ?? k, display: formatStat(k, v), icon: getSubStatIconByType(k) ?? null, tone: rollTone(k, v) };
  });
  return {
    key: e.key,
    name: data?.name ?? e.key,
    image: data?.image ?? null,
    cost: e.cost,
    rarity: e.rarity,
    set: e.set,
    setLabel: e.set ? (getEchoSetLabelByType(e.set) ?? e.set) : null,
    setIcon: e.set ? (getEchoSetIconByType(e.set) ?? null) : null,
    main: e.main,
    mainLabel: e.main ? (SHORT_STAT[e.main] ?? e.main) : "",
    mainDisplay: mainValue !== null ? pct(mainValue) : "",
    mainIcon: e.main ? (getSubStatIconByType(e.main) ?? null) : null,
    subs,
    cv: Math.round(cv * 10) / 10,
  };
}

const ELEMENT_KEY: Record<string, string> = { Glacio: "glacio", Fusion: "fusion", Electro: "electro", Aero: "aero", Spectro: "spectro", Havoc: "havoc" };

/** The card's stat list: equipment + permanent bonuses only, like upstream's build card (issue #383). */
function statsOf(finalStats: Record<string, any>, element: string | null): StatView[] {
  const out: StatView[] = [
    { key: "HP_FLAT", label: "HP", display: flat(finalStats.totalHp ?? 0), icon: getSubStatIconByType("HP") ?? null },
    { key: "ATK_FLAT", label: "ATK", display: flat(finalStats.totalAtk ?? 0), icon: getSubStatIconByType("ATK") ?? null },
    { key: "DEF_FLAT", label: "DEF", display: flat(finalStats.totalDef ?? 0), icon: getSubStatIconByType("DEF") ?? null },
    { key: "CritRate", label: "Crit Rate", display: pct(finalStats.critRate ?? 0), icon: getSubStatIconByType("CritRate") ?? null },
    { key: "CritDMG", label: "Crit DMG", display: pct(finalStats.critDMG ?? 0), icon: getSubStatIconByType("CritDMG") ?? null },
    { key: "EnergyRegen", label: "Energy Regen", display: pct((finalStats.energyRegen ?? 1) * 100), icon: getSubStatIconByType("EnergyRegen") ?? null },
  ];
  if (element && ELEMENT_KEY[element]) {
    out.push({ key: element, label: `${element} DMG`, display: pct(finalStats[ELEMENT_KEY[element]] ?? 0), icon: getSubStatIconByType(element) ?? null });
  }
  const skills: Array<[string, string, string]> = [
    ["BasicAttackDMGBonus", "basicAttackDMGBonus", "Basic ATK DMG"],
    ["HeavyAttackDMGBonus", "heavyAttackDMGBonus", "Heavy ATK DMG"],
    ["ResonanceSkillDMGBonus", "resonanceSkillDMGBonus", "Skill DMG"],
    ["ResonanceLiberationDMGBonus", "resonanceLiberationDMGBonus", "Liberation DMG"],
  ];
  const top = skills.map(([k, f, l]) => ({ k, l, v: Number(finalStats[f] ?? 0) })).sort((a, b) => b.v - a.v)[0];
  if (top && top.v > 0) out.push({ key: top.k, label: top.l, display: pct(top.v), icon: getSubStatIconByType(top.k) ?? null });
  return out;
}

export async function memberView(member: ShareMember): Promise<MemberView> {
  const chosen = (await getCharByName(member.charId).catch(() => null)) as Record<string, any> | null;
  const basic = chosen?.basic ?? {};
  let weapon: MemberView["weapon"] = null;
  if (member.weapon) {
    const type = weaponTypeOf(member.charId) ?? basic.weapon;
    const mod = type ? ((await getWeaponByName(type, member.weapon.id)) as Record<string, any> | undefined) : undefined;
    weapon = {
      name: mod?.info?.name ?? member.weapon.id,
      image: mod?.info?.image ?? null,
      rarity: Number(mod?.info?.rarity ?? 5),
      rank: member.weapon.rank,
      level: member.weapon.level ?? Number(mod?.info?.maxLevel ?? 90),
    };
  }
  const echoes = member.echoes.map((e) => echoView(e));
  const counts: Record<string, number> = {};
  for (const e of member.echoes) if (e?.set) counts[e.set] = (counts[e.set] ?? 0) + 1;
  const sets = Object.entries(counts)
    .filter(([k, n]) => n >= getSetBonusThreshold(k))
    .sort(([, a], [, b]) => b - a)
    .map(([key, count]) => ({ key, count, label: getEchoSetLabelByType(key) ?? key, icon: getEchoSetIconByType(key) ?? null }));
  let stats: StatView[] = [];
  if (chosen) {
    try {
      const record = { ...buildFieldsFromMember(member, inlineEchoSlotsOf(member)), characterLevel: member.level !== null ? String(member.level) : undefined, talents: member.talents ?? undefined };
      const ctx = await buildCharacterCalculationContext(member.charId, { [member.charId]: record }, { enemyLevel: 90, enemyResist: 0.1, enemyType: "Calamity" }, [], { alwaysEnabledOnly: true });
      stats = statsOf(ctx.finalStats, basic.element ?? null);
    } catch {
      stats = [];
    }
  }
  const t = member.talents ?? {};
  return {
    charId: member.charId,
    name: basic.name ? getCharacterRosterDisplayName(member.charId) : member.charId,
    rarity: Number(basic.rarity ?? 5),
    element: basic.element ?? null,
    art: typeof basic.image === "string" ? basic.image : null,
    headshot: characterPortraitUrl(member.charId),
    sequence: member.sequence,
    level: member.level ?? 90,
    buildName: member.buildName,
    weapon,
    echoes,
    sets,
    stats,
    talents: ["basic", "skill", "forte", "liberation", "intro"].map((k) => Number((t as Record<string, unknown>)[k] ?? 10)),
  };
}

export async function cardView(payload: SharePayload): Promise<CardView> {
  const members = await Promise.all(payload.members.map((m) => memberView(m)));
  // a team card keeps slot order
  if (payload.kind === "team" && payload.team) {
    const order = payload.team.characterIds.filter((id): id is string => !!id);
    members.sort((a, b) => order.indexOf(a.charId) - order.indexOf(b.charId));
  }
  return { kind: payload.kind, members, teamName: payload.team?.name ?? null };
}

/** Element accent colours for the cards (fixed, so an exported card looks the same in every app theme). */
export const ELEMENT_COLOR: Record<string, string> = {
  Glacio: "#5bc0eb",
  Fusion: "#f0643c",
  Electro: "#b37cf5",
  Aero: "#43d6a5",
  Spectro: "#f2c94c",
  Havoc: "#d9467b",
};
