// Wuthering Tools+ — "Why this number": the app calculator's damage opened up. Ryan's breakdown says where a STAT comes
// from; this says where the DAMAGE comes from: a rotation by attack and by skill type, and one hit as the factors of
// the formula, each in plain words.
//
// Pure, and it never computes damage. The engine (packages/formulas) already hands every figure's parts back in
// `damage.totalDamageContext`, and this module only reads them. Each formula path gets its own list of factors; the
// factors must multiply back to the engine's own figure to float precision (`RECONCILE_TOLERANCE`), or they are not
// shown at all: a hit that cannot be reconciled shows the engine's figures and says so. No factor is ever made up.

/** How far (relative) a product may sit from the engine's figure and still count as the same number. A chain of about
 *  ten doubles rounds to ~1e-15, so this is float noise and nothing else. */
export const RECONCILE_TOLERANCE = 1e-12;

export type FactorId =
  | "stat"
  | "multiplier"
  | "dmgBonus"
  | "amplify"
  | "special"
  | "totalDamage"
  | "endgame"
  | "def"
  | "res"
  | "levelBase"
  | "motion"
  | "motionBonus"
  | "tuneBoost"
  | "tuneBonus"
  | "enemyType"
  | "fixed";

export interface Factor {
  id: FactorId;
  /** the name a player reads: "ATK", "Enemy DEF" */
  label: string;
  /** one plain sentence: what this factor is */
  what: string;
  /** the number that goes into the product */
  times: number;
  /** that number as it reads on the receipt: "2,381", "× 1.850" */
  value: string;
  /** what it is made of, from the engine's own context ("Element 30.0 % + attack type 45.0 %") */
  detail?: string;
}

export type HitKind = "attack" | "fixed" | "negativeStatus" | "glacioBite" | "tuneBreak" | "opaque";

/** The chance and size of a crit, the one factor that sits between the non-crit figure and the average. */
export interface CritFactor {
  rate: number;
  damage: number;
  /** average ÷ non-crit: 1 + min(Crit Rate, 100 %) × (Crit DMG − 1) */
  times: number;
  /** Crit Rate past 100 % adds nothing */
  overCap: boolean;
}

/** One line of the rotation that does damage. */
export interface DamageLine {
  id: string;
  key: string;
  label: string;
  /** the engine's attack type, after any override: "Basic", "TuneBreak", "ElementalEffect" */
  type: string;
  typeLabel: string;
  /** how many times the line presses the attack: the engine multiplies its figures by this */
  presses: number;
  /** the line's figures, every press of it, exactly as the engine returned them */
  average: number;
  nonCrit: number;
  crit: number;
  /** the stat the attack scales on, as the kit writes it ("attack", "hp", "defense", "EnergyRegen") */
  attribute: string;
  row: any;
}

/** One hit a player can pick: rotation lines that press the same attack for the same damage, read as one. */
export interface HitChoice {
  /** the first line's id */
  id: string;
  lineIds: string[];
  key: string;
  label: string;
  typeLabel: string;
  /** one press, on average */
  perPress: number;
  /** presses in the whole rotation */
  times: number;
  /** all of them, on average */
  total: number;
  /** of the rotation's average */
  share: number;
  line: DamageLine;
}

/** A row of the "where the damage comes from" tables. */
export interface ShareRow {
  key: string;
  label: string;
  average: number;
  share: number;
  /** presses in the rotation (the by-attack table) */
  times: number;
  /** the biggest hit in this row, the one a tap opens */
  hitId: string;
}

export interface RotationAnatomy {
  /** the rotation's figures as the engine summed them */
  average: number;
  nonCrit: number;
  crit: number;
  lines: DamageLine[];
  /** biggest single press first */
  hits: HitChoice[];
  byAttack: ShareRow[];
  byType: ShareRow[];
  /** lines that do no damage here */
  leftOut: { healing: number; shield: number; locked: number; zero: number };
  /** Σ lines = the engine's rotation figure, to float precision */
  reconciled: boolean;
}

export interface HitAnatomy {
  kind: HitKind;
  key: string;
  label: string;
  typeLabel: string;
  /** one press, as the engine's figures for the line ÷ its presses */
  nonCrit: number;
  crit: number;
  average: number;
  /** the chain from the first factor to the non-crit figure: empty when it can't be reconciled */
  factors: Factor[];
  /** factors that sit at exactly × 1 on this hit: true, and not worth a row each */
  neutral: Factor[];
  /** null when the hit can't crit, or when the crit stage can't be reconciled */
  critFactor: CritFactor | null;
  /** the factors multiply back to the engine's non-crit figure */
  baseReconciled: boolean;
  /** non-crit → average and crit figures follow from Crit Rate and Crit DMG */
  critReconciled: boolean;
  /** what could not be opened up, in plain words (null when everything could) */
  note: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  Basic: "Basic Attack",
  Heavy: "Heavy Attack",
  Skill: "Resonance Skill",
  Liberation: "Resonance Liberation",
  Intro: "Intro Skill",
  Outro: "Outro Skill",
  Echo: "Echo Skill",
  ElementalEffect: "Negative Status",
  TuneBreak: "Tune Break",
  Utility: "Utility",
};
export const typeLabelOf = (type: string): string => TYPE_LABELS[type] ?? type;

/** The stat an attack scales on, by the kit's `attribute`. */
const STAT_LABELS: Record<string, string> = { attack: "ATK", hp: "Max HP", defense: "DEF", EnergyRegen: "Energy Regen" };
export const statLabelOf = (attribute: string | null | undefined): string => STAT_LABELS[attribute ?? "attack"] ?? "ATK";

const num = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const close = (a: number, b: number): boolean => Math.abs(a - b) <= RECONCILE_TOLERANCE * Math.max(Math.abs(a), Math.abs(b), 1);

const grouped = (n: number): string => Math.round(n).toLocaleString();
/** 3.48 → "348.00 %" */
export const percentText = (fraction: number, digits = 2): string => `${(fraction * 100).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;
const pct1 = (fraction: number): string => percentText(fraction, 1);
const timesText = (x: number): string => `× ${x.toFixed(3)}`;

/** Only the parts that are there: "Element 30.0 % + this skill 5.0 %". */
const parts = (list: Array<[string, number]>, join = " + "): string => list.filter(([, v]) => v !== 0).map(([name, v]) => `${name} ${pct1(v)}`).join(join);

function defFactor(ctx: any, ignored: boolean): Factor {
  const bits = [`Your level ${String(ctx.charLevel).replace("+", "")} against enemy level ${num(ctx.enemyLevel)}`];
  if (ignored && num(ctx.defIgnore)) bits.push(`${pct1(num(ctx.defIgnore))} of it ignored`);
  if (num(ctx.defReduction)) bits.push(`${pct1(num(ctx.defReduction))} of it reduced`);
  const times = num(ctx.defenseModifier);
  return { id: "def", label: "Enemy DEF", what: "The share of the hit that gets past the enemy's DEF.", times, value: timesText(times), detail: bits.join(", ") };
}

function resFactor(times: number, ctx: any): Factor {
  const bits = [`Enemy RES ${pct1(num(ctx.enemyResist))}`];
  if (num(ctx.resistanceReduction)) bits.push(`lowered by ${pct1(num(ctx.resistanceReduction))}`);
  if (num(ctx.resistanceIgnore)) bits.push(`${pct1(num(ctx.resistanceIgnore))} ignored`);
  return { id: "res", label: "Enemy RES", what: "The share of the hit that gets past the enemy's resistance.", times, value: timesText(times), detail: bits.join(", ") };
}

const amplifyFactor = (ctx: any, what: string): Factor => {
  const times = 1 + num(ctx.totalDeepenEffect);
  return { id: "amplify", label: "Amplify", what, times, value: timesText(times), detail: `${pct1(num(ctx.totalDeepenEffect))} in all` };
};

const specialFactor = (ctx: any): Factor => {
  const times = 1 + num(ctx.specialMultiplier);
  return { id: "special", label: "Vulnerability", what: "The special multiplier: a bucket of its own, multiplied with everything else.", times, value: timesText(times), detail: `${pct1(num(ctx.specialMultiplier))} in all` };
};

const totalDamageFactor = (value: number): Factor => {
  const times = 1 + value;
  return { id: "totalDamage", label: "Total DMG", what: "A multiplier on the whole hit, such as Tune Strain.", times, value: timesText(times), detail: `${pct1(value)} in all` };
};

const motionBonusFactor = (ctx: any): Factor => {
  const times = 1 + num(ctx.talentModifierMultiply);
  return { id: "motionBonus", label: "Multiplier bonus", what: "Buffs that raise this hit's multiplier itself.", times, value: timesText(times), detail: `${pct1(num(ctx.talentModifierMultiply))} in all` };
};

/** An attack's own hits as the engine ran them, where it has several: "16.64%+13.87%*6". The row's `talent` text won't do: a
 *  chain can replace the kit's table, and that text stays the kit's. */
function hitsText(entries: Array<{ percentage: string }> | undefined): string | null {
  if (!entries || entries.length < 2) return null;
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.percentage, (counts.get(entry.percentage) ?? 0) + 1);
  return [...counts].map(([percentage, n]) => (n > 1 ? `${percentage}*${n}` : percentage)).join("+");
}

function attackFactors(ctx: any, line: DamageLine): Factor[] {
  const statLabel = statLabelOf(line.attribute);
  const stat = num(ctx.attack);
  const talent = num(ctx.totalTalentValue);
  const raw = num(ctx.rawTotalTalent);
  const dmgBonus = num(ctx.totalDmgBonus);
  const endgame = num(ctx.totalDamageEndgame);
  const hits = hitsText(line.row?.damage?.instanceDamageEntries);
  const mvBits = [`Base ${percentText(raw)}${hits ? ` (${hits})` : ""}`];
  if (num(ctx.talentModifierAdd)) mvBits.push(`${percentText(num(ctx.talentModifierAdd))} added`);
  const raised = (1 + num(ctx.talentModifierMultiply)) * (1 + num(ctx.totalTalentModifierSpecialMultiply));
  if (raised !== 1) mvBits.push(`× ${raised.toFixed(3)} from buffs`);
  return [
    { id: "stat", label: statLabel, what: `The stat this attack scales on, after every buff that reaches this hit.`, times: stat, value: grouped(stat) },
    { id: "multiplier", label: "Skill multiplier", what: "The attack's percentage at your skill level, all its parts added up.", times: talent, value: `× ${percentText(talent)}`, detail: mvBits.join(", ") },
    {
      id: "dmgBonus",
      label: "DMG Bonus",
      what: "Element, attack type and this skill's bonuses, added together.",
      times: 1 + dmgBonus,
      value: timesText(1 + dmgBonus),
      detail: parts([["Element", num(ctx.bonusElementDmg)], ["attack type", num(ctx.bonusTotalSkillDmg)], ["this skill", num(ctx.bonusSpecificSkillDmg)]]) || undefined,
    },
    amplifyFactor(ctx, "DMG Amplify from buffs, multiplied with everything else."),
    specialFactor(ctx),
    totalDamageFactor(num(ctx.totalDamage)),
    { id: "endgame", label: "Endgame Total DMG", what: "A Total DMG multiplier of its own, from an endgame mode.", times: 1 + endgame, value: timesText(1 + endgame), detail: `${pct1(endgame)} in all` },
    defFactor(ctx, true),
    resFactor(num(ctx.resistValue), ctx),
  ];
}

const STATUS_NAMES: Record<string, string> = { spectroFrazzle: "Spectro Frazzle", aeroErosion: "Aero Erosion", fusionBurst: "Fusion Burst", glacioChafe: "Glacio Chafe", electroFlare: "Electro Flare" };

function statusFactors(ctx: any): Factor[] {
  const status = STATUS_NAMES[String(ctx.type)] ?? "this status";
  const motion = (num(ctx.motionValue) + num(ctx.motionValueRage)) / 10000;
  const stacks = num(ctx.stacks);
  const rage = num(ctx.motionValueRage);
  return [
    { id: "levelBase", label: "Status base", what: "A fixed figure set by your level. No ATK, HP or DEF goes into it.", times: num(ctx.levelConstant), value: grouped(num(ctx.levelConstant)), detail: `Character level ${String(ctx.charLevel).replace("+", "")}` },
    { id: "motion", label: "Stacks on the enemy", what: `${status}'s multiplier: the more stacks on the enemy, the bigger the tick.`, times: motion, value: `× ${percentText(motion)}`, detail: `${stacks} stack${stacks === 1 ? "" : "s"}${rage ? ", Electro Rage added" : ""}` },
    motionBonusFactor(ctx),
    amplifyFactor(ctx, `DMG Amplify for ${status}. The amplify on your other attacks does not reach it.`),
    defFactor(ctx, false),
    resFactor(num(ctx.resistModifier), ctx),
  ];
}

function glacioBiteFactors(ctx: any): Factor[] {
  const motion = num(ctx.motionValue) / 10000;
  return [
    { id: "levelBase", label: "Status base", what: "A fixed figure set by your level. No ATK, HP or DEF goes into it.", times: num(ctx.levelConstant), value: grouped(num(ctx.levelConstant)), detail: `Character level ${String(ctx.charLevel).replace("+", "")}` },
    { id: "motion", label: "Forte multiplier", what: "The Forte's percentage at your skill level, in place of a stack count.", times: motion, value: `× ${percentText(motion)}` },
    motionBonusFactor(ctx),
    amplifyFactor(ctx, "DMG Amplify for Glacio Chafe. The amplify on your other attacks does not reach it."),
    specialFactor(ctx),
    totalDamageFactor(num(ctx.totalDamage)),
    defFactor(ctx, false),
    resFactor(num(ctx.resistModifier), ctx),
  ];
}

function tuneBreakFactors(ctx: any): Factor[] {
  const talent = num(ctx.totalTalent);
  const bonus = num(ctx.bonusDmg);
  const boost = num(ctx.tuneBreakBoost);
  const enemy = num(ctx.enemyTypeMultiplier);
  return [
    { id: "levelBase", label: "Tune Break base", what: "A fixed figure set by your level. No ATK, HP or DEF goes into it.", times: num(ctx.levelModifier), value: num(ctx.levelModifier).toLocaleString(), detail: `Character level ${String(ctx.charLevel).replace("+", "")}` },
    { id: "multiplier", label: "Tune Break multiplier", what: "This attack's percentage, every part of it added up.", times: talent, value: `× ${percentText(talent)}`, detail: /[+*]/.test(String(ctx.talent ?? "")) ? String(ctx.talent) : undefined },
    motionBonusFactor(ctx),
    specialFactor(ctx),
    { id: "tuneBonus", label: "Tune Break DMG Bonus", what: "DMG Bonus for Tune Break only. The bonuses on your other attacks do not reach it.", times: 1 + bonus, value: timesText(1 + bonus), detail: `${pct1(bonus)} in all` },
    { id: "enemyType", label: "Enemy type", what: "Tune Break hits tougher enemies harder.", times: enemy, value: timesText(enemy), detail: ctx.enemyType ? `${ctx.enemyType} enemy` : undefined },
    { id: "tuneBoost", label: "Tune Break Boost", what: "Your Tune Break Boost, from the character and their gear.", times: 1 + boost, value: timesText(1 + boost), detail: `${pct1(boost)} in all` },
    defFactor(ctx, true),
    resFactor(num(ctx.resistModifier), ctx),
  ];
}

function factorsOf(line: DamageLine): { kind: HitKind; factors: Factor[] } {
  const d = line.row?.damage;
  const ctx = d?.totalDamageContext;
  if (!ctx) return { kind: "opaque", factors: [] };
  switch (ctx.type) {
    case "attack": {
      if (ctx.isFixed) {
        const amount = num(d?.instanceDamage?.talent);
        return { kind: "fixed", factors: [{ id: "fixed", label: "Fixed damage", what: "A set amount: buffs, crit and the enemy don't change it.", times: amount, value: grouped(amount) }] };
      }
      return { kind: "attack", factors: attackFactors(ctx, line) };
    }
    case "spectroFrazzle":
    case "aeroErosion":
    case "fusionBurst":
    case "glacioChafe":
    case "electroFlare":
      return { kind: "negativeStatus", factors: statusFactors(ctx) };
    case "glacioBiteForte":
      return { kind: "glacioBite", factors: glacioBiteFactors(ctx) };
    case "tuneBreak":
      return { kind: "tuneBreak", factors: tuneBreakFactors(ctx) };
    default:
      return { kind: "opaque", factors: [] };
  }
}

const safePresses = (line: DamageLine): number => (line.presses > 0 ? line.presses : 1);

/** One hit opened up: the factors of one press of `line`, reconciled against the engine's own figures for the line. */
export function hitAnatomy(line: DamageLine): HitAnatomy {
  const presses = safePresses(line);
  const { kind, factors } = factorsOf(line);
  const ctx = line.row?.damage?.totalDamageContext;
  const product = factors.reduce((p, f) => p * f.times, 1);
  const baseReconciled = factors.length > 0 && close(product * presses, line.nonCrit);

  const rate = num(ctx?.critRate);
  const critDmg = num(ctx?.critDamage, 1);
  const critTimes = 1 + Math.min(rate, 1) * (critDmg - 1);
  // a fixed hit and an opaque one carry no Crit Rate of their own: their three figures are simply equal
  const hasCritParts = ctx !== undefined && ctx?.critDamage !== undefined;
  const critReconciled = hasCritParts ? close(line.nonCrit * critTimes, line.average) && close(line.nonCrit * critDmg, line.crit) : close(line.nonCrit, line.average) && close(line.nonCrit, line.crit);
  const critFactor: CritFactor | null = hasCritParts && critReconciled && rate > 0 && critDmg !== 1 ? { rate, damage: critDmg, times: critTimes, overCap: rate > 1 } : null;

  let note: string | null = null;
  if (kind === "opaque") note = "The calculator gives this hit as one figure, with no parts to open up.";
  else if (!baseReconciled) note = "The parts the calculator reports for this hit don't multiply back to its figure, so they aren't shown. Part of this hit is worked out where it can't be read.";
  else if (!critReconciled) note = "Crit Rate and Crit DMG don't lead from the non-crit figure to the average on this hit, so the crit step isn't shown.";

  const shown = baseReconciled ? factors : [];
  return {
    kind,
    key: line.key,
    label: line.label,
    typeLabel: line.typeLabel,
    nonCrit: line.nonCrit / presses,
    crit: line.crit / presses,
    average: line.average / presses,
    factors: shown.filter((f) => f.times !== 1),
    neutral: shown.filter((f) => f.times === 1),
    critFactor,
    baseReconciled,
    critReconciled,
    note,
  };
}

/** The damage figures of a rotation attack, or null when it deals none. */
function figuresOf(row: any): { average: number; nonCrit: number; crit: number } | null {
  const d = row?.damage;
  if (!d) return null;
  // a legacy Negative Status figure: damage.damage only, never crits (as aggregateRotationDamage reads it)
  if (row.type === "ElementalEffect" && d.damage !== undefined && d.totalDamage === undefined) {
    const v = num(d.damage);
    return { average: v, nonCrit: v, crit: v };
  }
  if (d.avgDamage === undefined) return null;
  return { average: num(d.avgDamage), nonCrit: num(d.totalDamage), crit: num(d.critDamage) };
}

export interface AnatomyOptions {
  /** the stat an action's attack scales on (the attack data lives in the kit, not on the engine's rows) */
  // eslint-disable-next-line no-unused-vars -- the parameter of a function type
  attributeOf?: (lineId: string) => string | null | undefined;
}

/** A rotation's damage by line, by hit, by attack and by skill type: the engine's own rows, sorted and summed. */
export function rotationAnatomy(result: { attacks: any[]; damageAggregation: { avgDamage: number | null; normalDamage: number | null; critDamage: number | null } }, options: AnatomyOptions = {}): RotationAnatomy {
  const leftOut = { healing: 0, shield: 0, locked: 0, zero: 0 };
  const lines: DamageLine[] = [];
  for (const row of result.attacks ?? []) {
    if (row?.originalIsEnabled === false) {
      leftOut.locked += 1;
      continue;
    }
    if (row?.type === "Healing") {
      leftOut.healing += 1;
      continue;
    }
    if (row?.type === "Shield") {
      leftOut.shield += 1;
      continue;
    }
    const figures = figuresOf(row);
    if (!figures || figures.average <= 0) {
      leftOut.zero += 1;
      continue;
    }
    const type = String(row.type ?? "");
    lines.push({
      id: String(row.id),
      key: String(row.key),
      label: String(row.label ?? row.key),
      type,
      typeLabel: typeLabelOf(type),
      presses: num(row.count ?? 1, 1),
      ...figures,
      attribute: options.attributeOf?.(String(row.id)) ?? "attack",
      row,
    });
  }
  const average = num(result.damageAggregation?.avgDamage);
  const share = (v: number): number => (average > 0 ? v / average : 0);

  const choices = new Map<string, HitChoice>();
  for (const line of lines) {
    const presses = safePresses(line);
    const perPress = line.average / presses;
    const groupKey = `${line.key}|${perPress.toPrecision(12)}`;
    const found = choices.get(groupKey);
    if (found) {
      found.lineIds.push(line.id);
      found.times += presses;
      found.total += line.average;
      found.share = share(found.total);
      continue;
    }
    choices.set(groupKey, { id: line.id, lineIds: [line.id], key: line.key, label: line.label, typeLabel: line.typeLabel, perPress, times: presses, total: line.average, share: share(line.average), line });
  }
  const hits = [...choices.values()].sort((a, b) => b.perPress - a.perPress);

  // eslint-disable-next-line no-unused-vars -- the parameters of function types
  const table = (keyOf: (hit: HitChoice) => string, labelOf: (hit: HitChoice) => string): ShareRow[] => {
    const rows = new Map<string, ShareRow>();
    for (const hit of hits) {
      const key = keyOf(hit);
      const row = rows.get(key);
      if (row) {
        row.average += hit.total;
        row.share = share(row.average);
        row.times += hit.times;
      } else {
        rows.set(key, { key, label: labelOf(hit), average: hit.total, share: share(hit.total), times: hit.times, hitId: hit.id });
      }
    }
    return [...rows.values()].sort((a, b) => b.average - a.average);
  };

  const summed = lines.reduce((s, l) => s + l.average, 0);
  return {
    average,
    nonCrit: num(result.damageAggregation?.normalDamage),
    crit: num(result.damageAggregation?.critDamage),
    lines,
    hits,
    byAttack: table((h) => h.key, (h) => h.label),
    byType: table((h) => h.typeLabel, (h) => h.typeLabel),
    leftOut,
    reconciled: close(summed, average),
  };
}
