// Wuthering Tools+ — the energy check (batch 2, 2026-10-26): how much Energy Regen each member of a team needs, read
// off Riley31415's wuwa_calc run of that team at the player's own account (the Riley run seam, src/sim/engine/), and
// how that compares with the ER their build has in this app. Pure: plain data in, plain data out — no engine, no
// Vue, no stores. The browser (useEnergyNeeds.ts), the CLI (`npm run cli -- er`) and the tests share it.
//
//   need   = max(bar, kit floor) — `bar` is the constant ER at which every Liberation of his loop is paid on time
//            (`detailFor(run).needs`, page/model.ts), the kit floor is the loadout's own `minEr` (Shorekeeper 240 %).
//            Conditional ER buffs during the fight are already inside the bar: compare it with constant ER only.
//   have   = the character screen's ER of the build (equipment + permanent bonuses, energyHave.ts), in %.
//   band   = short (have < need) · tight (within TIGHT_MARGIN above) · ok · noGate (nothing asks for ER).
//   rolls  = how many median ER substat rolls (9.2 %) close the gap.
//   factor = 1 − deficit/100: the deficit-aware score multiplier (wuwa.build's "damage − ER deficit %", made
//            multiplicative) — what erAwareScorer.ts applies to a build's damage.
import type { EnergyNeedLite, RunLite, RunMember, SubsMode } from "../engine/rileyRun";
import { medianRoll } from "../substats/substatWeights";

/** ER above the need that still reads "tight" (percentage points): one bad loop and the Liberation is late. */
export const TIGHT_MARGIN = 5;

export type EnergyBand = "short" | "tight" | "ok" | "noGate";
/** `unknown`: the need is measured, but the app has no build to compare (the character is not set up). */
export type EnergyStatus = EnergyBand | "unknown";

/** What one ER substat roll is worth when counting rolls short: the median tier (9.2 %, Riley's `ER_ROLL` too). */
export const erRoll = (): number => medianRoll("EnergyRegen");

/** The app's ER (`finalStats.energyRegen`, a decimal: 1.184) as a percentage (118.4). */
export const erPercent = (decimal: number): number => Math.round(Number(decimal) * 1e6) / 1e4;

/** An ER figure the way the game prints it: one decimal. The need rounds up (113.04 % asks for 113.1 %). */
export const showHave = (have: number): number => Math.round(have * 10 + 1e-9) / 10;
export const showNeed = (need: number): number => Math.ceil(need * 10 - 1e-6) / 10;

export interface NeedOf {
  /** max(bar, kit floor) in %; null when nothing asks for Energy Regen (no energy gate) */
  need: number | null;
  bar: number | null;
  minEr: number;
  /** which of the two sets the need */
  setBy: "loop" | "kit" | null;
}

/** One member's need from his `EnergyNeed`: `max(bar ?? 0, minEr)`, null where neither asks for any. */
export function needOf(n: Pick<EnergyNeedLite, "bar" | "minEr"> | null | undefined): NeedOf {
  const bar = n?.bar ?? null;
  const minEr = Number(n?.minEr ?? 0);
  const need = Math.max(bar ?? 0, minEr);
  if (!(need > 0)) return { need: null, bar, minEr, setBy: null };
  return { need, bar, minEr, setBy: minEr > (bar ?? 0) ? "kit" : "loop" };
}

/** The band of a build's ER against a need (both in %, compared as the game prints them). */
export function bandOf(need: number | null, have: number | null): EnergyStatus {
  if (need == null) return "noGate";
  if (have == null) return "unknown";
  const n = showNeed(need);
  const h = showHave(have);
  if (h < n) return "short";
  if (h < n + TIGHT_MARGIN) return "tight";
  return "ok";
}

/** ER points missing (0 at or above the need), one decimal as printed. */
export function shortBy(need: number | null, have: number | null): number {
  if (need == null || have == null) return 0;
  return Math.max(0, Math.round((showNeed(need) - showHave(have)) * 10) / 10);
}

/** Median ER rolls that close the gap: `ceil((need − have) / medianRoll("EnergyRegen"))`, 0 when not short. */
export function rollsShort(need: number | null, have: number | null, roll = erRoll()): number {
  const gap = shortBy(need, have);
  return gap > 0 && roll > 0 ? Math.ceil(gap / roll - 1e-9) : 0;
}

/** The deficit-aware score multiplier: 1 − max(0, need − have)/100, never below 0; 1 where either is unknown. */
export function deficitFactor(need: number | null | undefined, have: number | null | undefined): number {
  if (need == null || have == null || !Number.isFinite(need) || !Number.isFinite(have)) return 1;
  return Math.max(0, 1 - Math.max(0, need - have) / 100);
}

/** What one ER roll of `roll` % is worth on the deficit-aware score: the share of the deficit it closes — 0 at or
 *  above the need. Relative, like a substat weight's gain (0.1 = +10 %). */
export function erWeight(need: number | null | undefined, have: number | null | undefined, roll = erRoll()): number {
  if (need == null || have == null) return 0;
  const before = deficitFactor(need, have);
  return before > 0 ? deficitFactor(need, have + roll) / before - 1 : 0;
}

export interface EnergyCheck {
  status: EnergyStatus;
  need: number | null;
  have: number | null;
  /** ER points missing, one decimal (0 when not short) */
  short: number;
  /** median ER rolls that close it */
  rolls: number;
  /** have − need in points (null where either is unknown); negative when short */
  margin: number | null;
  /** the deficit-aware score multiplier */
  factor: number;
}

export function checkOf(need: number | null, have: number | null): EnergyCheck {
  return {
    status: bandOf(need, have),
    need,
    have,
    short: shortBy(need, have),
    rolls: rollsShort(need, have),
    margin: need == null || have == null ? null : Math.round((showHave(have) - showNeed(need)) * 10) / 10,
    factor: deficitFactor(need, have),
  };
}

/* ------------------------------------------------------------------------------------------- breakdown */

export interface BreakdownPart {
  kind: "own" | "ally" | "flat" | "buffs";
  /** the member (own), the ally whose hits shared energy (ally), or a label */
  who: string;
  /** energy banked before any ER (flat gains and ER buffs: as gained) */
  raw: number;
  /** what it paid toward the spend at the bar's ER (`raw × bar / 100`; flat and buffs as is) */
  paid: number;
}

export interface EnergyBreakdown {
  /** the Liberation cost (energy), the ER that pays it exactly (%) */
  spend: number;
  bar: number;
  /** own hits, each ally's half share, flat gains, then what ER buffs on their own hits added (the remainder) */
  parts: BreakdownPart[];
  /** Σ paid of the measured parts (the remainder not included) */
  measured: number;
  /** (spend − measured) / spend: Riley's identity `(hit + Σ shared) × bar/100 + flat = spend` holds up to what ER
   *  buffs on the member's own hits added — which is this remainder */
  remainder: number;
}

/** Where the energy for the spend that asked the most came from (`gen`, his units ÷ `unit`): own hits and each ally's
 *  half share before ER, scaled to the bar; flat gains; and the remainder (ER buffs on their own hits) so the parts
 *  add up to the spend. Null where nothing was measured (no gate, or only the kit floor asks). */
export function breakdownOf(n: Pick<EnergyNeedLite, "bar" | "gen"> | null | undefined, member: string, unit = 100): EnergyBreakdown | null {
  const gen = n?.gen;
  const bar = n?.bar;
  if (!gen || bar == null || !(gen.spend > 0)) return null;
  const k = bar / 100;
  const parts: BreakdownPart[] = [{ kind: "own", who: member, raw: gen.hit / unit, paid: (gen.hit / unit) * k }];
  for (const [who, v] of gen.shared) parts.push({ kind: "ally", who, raw: v / unit, paid: (v / unit) * k });
  if (gen.flat) parts.push({ kind: "flat", who: "flat gains", raw: gen.flat / unit, paid: gen.flat / unit });
  const spend = gen.spend / unit;
  const measured = parts.reduce((s, p) => s + p.paid, 0);
  const rest = spend - measured;
  // a remainder under 0.5 % of the spend is rounding in his units, not a buff
  if (rest > spend * 0.005) parts.push({ kind: "buffs", who: "ER buffs on own hits", raw: rest, paid: rest });
  return { spend, bar, parts, measured, remainder: spend > 0 ? rest / spend : 0 };
}

/* ------------------------------------------------------------------------------------------ crit overcap */

export interface CritOvercap {
  /** share of the member's damage dealt at a Crit Rate of 100 % or more, 0–1 — where more Crit Rate does nothing */
  share: number;
  /** that damage, and the member's whole damage over the run */
  over: number;
  damage: number;
  /** the casts most of it came from, biggest first: often a kit's own guaranteed crit (a node reading +100 %) */
  top: Array<{ action: string; critRate: number; over: number }>;
  /** the Crit Rate the rest of their critable damage read (damage-weighted %), null when none is left */
  rest: number | null;
}

/** The crit overcap of report slot `slot` (a member's index) in a traced run: what share of their damage landed at
 *  ≥ 100 % Crit Rate, read off `RunRow.critOver` (the seam sums it per folded cast, so the share is exact). */
export function overcapOf(run: Pick<RunLite, "rows">, slot: number): CritOvercap | null {
  let damage = 0, over = 0, restW = 0, restCr = 0;
  const byAction = new Map<string, { action: string; critRate: number; over: number }>();
  for (const row of run.rows) {
    if ((row.slot ?? row.member) !== slot || !(row.avg > 0)) continue;
    damage += row.avg;
    const o = Math.min(row.avg, Math.max(0, row.critOver ?? 0));
    if (o > 0) {
      over += o;
      const held = byAction.get(row.action);
      if (held) (held.over += o, (held.critRate = Math.max(held.critRate, row.critRate ?? 100)));
      else byAction.set(row.action, { action: row.action, critRate: row.critRate ?? 100, over: o });
    }
    if (row.critRate != null && row.avg - o > 0) {
      // the line's under-cap part (a mixed line counts at its average Crit Rate, capped below 100)
      restW += row.avg - o;
      restCr += Math.min(row.critRate, 99.99) * (row.avg - o);
    }
  }
  if (!(damage > 0)) return null;
  const top = [...byAction.values()].sort((a, b) => b.over - a.over).slice(0, 3).map((t) => ({ ...t, critRate: Math.round(t.critRate * 10) / 10, over: Math.round(t.over) }));
  return { share: Math.min(1, over / damage), over: Math.round(over), damage: Math.round(damage), top, rest: restW > 0 ? Math.round((restCr / restW) * 10) / 10 : null };
}

/** Overcap that matters to the team: at least this share of the TEAM's damage lands past 100 % on one member (a
 *  support's own few hits overcapping is not worth a flag). */
export const OVERCAP_FLAG = 0.02;
/** The team-level weight of a member's overcap: their overcapped share × their share of the team's damage. */
export const overcapWeight = (m: Pick<MemberEnergy, "overcap" | "share">): number => (m.overcap?.share ?? 0) * (m.share ?? 0);

/* --------------------------------------------------------------------------------------- one team's energy */

/** One member as the energy check reads them — small enough to keep hundreds in localStorage. */
export interface MemberEnergy {
  /** Riley's resonator name, and this app's key */
  name: string;
  appKey: string;
  mainDps: boolean;
  owned: boolean;
  sequence: number;
  weapon: string;
  refinement: number;
  weaponApproximated: boolean;
  /** the substat spread his run wore ("My build", "ChemX32 - …") */
  spread: string;
  subs: SubsMode;
  /** DPS in his run, and its share of the team's */
  dps: number;
  share: number;
  /** Liberation cost (energy, not ×100); 0 = the Liberation costs no energy */
  cost: number;
  need: number | null;
  bar: number | null;
  minEr: number;
  setBy: NeedOf["setBy"];
  /** the constant ER his run's gear wore (%) — his main stats and sets, your substats */
  worn: number;
  /** his energy breakdown of the spend that asked most (his units ×100), verbatim */
  gen: EnergyNeedLite["gen"];
  overcap: CritOvercap | null;
}

export const TEAM_ENERGY_VERSION = 1;

export interface TeamEnergy {
  v: typeof TEAM_ENERGY_VERSION;
  /** the variant that scored best at the account, his row key */
  teamKey: string;
  rowKey: string;
  /** how many of his loadout variants of this composition were solved */
  variants: number;
  /** team DPS (damage per second — compare with the app's DPS only) and the fight's length */
  total: number;
  seconds: number;
  engine: RunLite["engine"];
  members: MemberEnergy[];
}

const r4 = (x: number | null): number | null => (x == null ? null : Math.round(x * 1e4) / 1e4);

function memberEnergy(run: RunLite, m: RunMember, i: number): MemberEnergy {
  const n = run.needs[m.name];
  const read = needOf(n ? { bar: m.maxEnergy ? n.bar : null, minEr: n.minEr } : { bar: null, minEr: m.minEr });
  const { minEr, setBy } = read;
  const need = r4(read.need);
  const bar = r4(read.bar);
  return {
    name: m.name,
    appKey: m.appKey,
    mainDps: m.mainDps,
    owned: m.owned,
    sequence: m.sequence,
    weapon: m.weapon,
    refinement: m.refinement,
    weaponApproximated: m.weaponApproximated,
    spread: m.spread,
    subs: m.subs,
    dps: m.dps,
    share: m.share,
    cost: m.maxEnergy / (run.units?.energy || 100),
    need,
    bar,
    minEr,
    setBy,
    worn: Math.round(Number(n?.constant ?? 0) * 100) / 100,
    gen: n?.gen ?? null,
    overcap: overcapOf(run, i),
  };
}

/** A traced run (the best `mine` row of a composition) reduced to what the energy check shows and caches. */
export function teamEnergyOf(run: RunLite, variants = 1): TeamEnergy {
  return {
    v: TEAM_ENERGY_VERSION,
    teamKey: run.teamKey,
    rowKey: run.rowKey,
    variants,
    total: run.total,
    seconds: run.seconds,
    engine: run.engine,
    members: run.members.map((m, i) => memberEnergy(run, m, i)),
  };
}

/** A member's breakdown from the cached data (his units ÷ 100). */
export const memberBreakdown = (m: Pick<MemberEnergy, "bar" | "gen" | "name">): EnergyBreakdown | null => breakdownOf({ bar: m.bar, gen: m.gen }, m.name);

/** A composition's key: its three app keys, sorted — a saved team and his variants of it share one. */
export const compositionKey = (characterIds: ReadonlyArray<string | null | undefined>): string =>
  characterIds.filter((id): id is string => Boolean(id)).slice().sort().join("+");
