// Wuthering Tools+ — /rankings on a phone, and the member strip over Riley's detail page.
// Pure: no Vue, no DOM, no Pinia. The controller (controller.ts `cardsPass`, `mountImportControls`) reads
// Riley's page model (vendor/wuwa_calc/src/page/model.ts: `visibleRows`, `results`) and hands the rows
// and runs to these functions; the plus components (RankingsCards.vue, RankingsMemberStrip.vue) draw
// what comes back.
//
// Below 768 px his comparison grid scrolls sideways inside its own box (Slot 1 and the team's figure end
// up off-screen), so a phone gets one card per row instead: the three portraits with the main DPS first
// (his slots are support-first), the team's figure, its share of the top row and each member's
// investment — and, against the player's own account, whether they could field it that way.
import { appKeyOf } from "./castMapper";
import { shareText, shareWidth, strengthOf, teamFigureOf, type CompareScale, type RunLike, type TeamMode } from "./compareColumn";

/* ---------------------------------------------------------------- the shapes read off his model */

/** His `Tier` is a `const enum` (erased at build): Limited 0, Standard 1, Free 2, FreeS2 3. */
const TIER_LIMITED = 0;
const TIER_FREE = 2;

/** The part of his `Member` (solver.ts) the cards read. */
export interface MemberLike {
  name: string;
  color: string;
  mainDps: boolean;
  loadout?: { resonator?: { tier?: number }; mode?: { name: string } | null };
}

/** The part of his `Combo` (solver.ts): `key` = `weapon.echo.mainstat.sN.rN[.m][.h][.uKEY]`. */
export interface ComboLike {
  key: string;
  sequence: number;
  weapon: { name: string; refinement: number; tier?: number };
  matrix?: unknown;
  highSubs?: boolean;
  mySubs?: boolean;
}

/** The part of his `TeamRun` (teamrun.ts). */
export interface RunRowLike extends RunLike {
  teamKey: string;
  members: MemberLike[];
  combo: ComboLike[];
  sectionSeconds?: number[];
}

/* ------------------------------------------------------------------------------ table order */

export interface OrderedRow<R extends RunRowLike = RunRowLike> {
  key: string;
  run: R;
  /** the team figure the table ranks by (DPR or DPS, his `teamFigure()`) */
  figure: number;
  /** a row the player pinned (his `pinnedRows`): listed first, whatever the filters say */
  pinned?: boolean;
}

/** His table's row order (vendor/wuwa_calc/src/page/table.ts `comparisonTable`), so card #12 is the row the
 *  grid shows twelfth. Rows differing only in what the whole build is invested in nest inside their team,
 *  outside in: the substat spread, the chain level, the weapon, its rank, the sonata — each group standing
 *  where its own best row would, ties falling to the deeper chain, then the higher rank. With no compare
 *  open (one row per team) this is simply best first. Rows the player pinned (his `pinnedRows`, hash
 *  `pin=`) stand above the rest, grouped and ordered among themselves the same way. A row with no run yet
 *  is left out, as his table never lists one. */
export function tableOrder<R extends RunRowLike>(
  rows: Array<{ key: string }>,
  runOf: (key: string) => R | undefined,
  mode: TeamMode,
  isPinned: (key: string) => boolean = () => false,
): Array<OrderedRow<R>> {
  const seq = (run: R): number => run.combo.reduce((n, c) => n + c.sequence, 0);
  const rank = (run: R): number => run.combo.reduce((n, c) => n + c.weapon.refinement, 0);
  const LEVELS: Array<(c: ComboLike, p: string[]) => string> = [
    (c) => (c.mySubs ? "u" : c.highSubs ? "h" : ""),
    (_, p) => p[3] ?? "",
    (_, p) => p[0] ?? "",
    (_, p) => p[4] ?? "",
    (_, p) => p[1] ?? "",
  ];
  const keyed: Array<{ row: OrderedRow<R>; keys: string[] }> = [];
  for (const row of rows) {
    const run = runOf(row.key);
    if (!run) continue;
    const pinned = isPinned(row.key);
    const parts = run.combo.map((c) => c.key.split("."));
    const keys = [`${pinned ? "pin|" : ""}${run.teamKey}`];
    for (const level of LEVELS) keys.push(`${keys[keys.length - 1]}|${run.combo.map((c, i) => level(c, parts[i]!)).join("-")}`);
    keyed.push({ row: { key: row.key, run, figure: teamFigureOf(run, mode), ...(pinned ? { pinned } : {}) }, keys });
  }
  const groupBest = new Map<string, OrderedRow<R>>();
  for (const { row, keys } of keyed) {
    for (const k of keys) {
      const held = groupBest.get(k);
      if (!held || row.figure > held.figure) groupBest.set(k, row);
    }
  }
  keyed.sort((a, b) => {
    if (!!a.row.pinned !== !!b.row.pinned) return a.row.pinned ? -1 : 1;
    for (let i = 0; i < a.keys.length; i++) {
      const [ka, kb] = [a.keys[i]!, b.keys[i]!];
      if (ka === kb) continue;
      const [ra, rb] = [groupBest.get(ka)!, groupBest.get(kb)!];
      return rb.figure - ra.figure || seq(rb.run) - seq(ra.run) || rank(rb.run) - rank(ra.run) || (ka < kb ? -1 : 1);
    }
    return b.row.figure - a.row.figure || seq(b.row.run) - seq(a.row.run) || rank(b.row.run) - rank(a.row.run);
  });
  return keyed.map((k) => k.row);
}

/* ---------------------------------------------------------------------------------- members */

/** One member as a card or the strip draws them. */
export interface CardMember {
  /** his resonator name ("Aero Rover") */
  name: string;
  /** the name plus a Resonance Mode's last word ("Aemeath (Rupture)") — his `loadoutName()` */
  label: string;
  /** this app's character key, for the portrait */
  appKey: string;
  /** his kit colour */
  color: string;
  mainDps: boolean;
  /** his slot heading ("Slot 3" is the first member he lists) */
  slot: number;
  sequence: number;
  refinement: number;
  /** "S6R1" — the sequence always, the rank as his table reads it ("R0" = no signature weapon) */
  token: string;
  /** the weapon without its rank ("Stellar Symphony") */
  weapon: string;
  limitedWeapon: boolean;
  /** a 4★ or a Rover form: everyone has them, at S6 (his `accountOf()` rule) */
  free: boolean;
  matrix: boolean;
  /** the substat spread worn: "" ChemX32, "h" High Invest, "u" the player's own build */
  subs: "" | "h" | "u";
}

/** His rank token (table.ts `rankToken`): a signature, a rank above R1, or any rank while the refines are
 *  compared (or that weapon's ranks are shown at this sequence, his `shownRanks`) read their rank;
 *  everything else runs at R1 off its whole list, where only a signature costs anything — a standard or 4★
 *  weapon there is the "no signature" build and reads R0. `refinesCompared` stands for both his solver
 *  questions; the controller asks them (`rankShown`). */
export function rankToken(refinement: number, limited: boolean, refinesCompared = false): string {
  return refinesCompared || refinement > 1 || limited ? `R${refinement}` : "R0";
}

export const investmentToken = (sequence: number, refinement: number, limited: boolean, refinesCompared = false): string =>
  `S${sequence}${rankToken(refinement, limited, refinesCompared)}`;

/** His `loadoutName()`, display only. */
const labelOf = (m: MemberLike): string => {
  const mode = m.loadout?.mode?.name;
  return mode ? `${m.name} (${mode.split(" ").pop()})` : m.name;
};

const weaponBase = (name: string): string => name.replace(/ R\d$/, "");

/** One member of a run as the plus UI draws them. `refinesCompared` is his `compares(m, filters, "refines",
 *  combo)` (the controller asks his solver); without it a standard weapon at R1 reads R0, as in his table. */
export function cardMemberOf(m: MemberLike, combo: ComboLike, index: number, count: number, refinesCompared = false): CardMember {
  const limited = combo.weapon.tier === TIER_LIMITED;
  const subs = combo.mySubs ? "u" : combo.highSubs ? "h" : "";
  return {
    name: m.name,
    label: labelOf(m),
    appKey: appKeyOf(m.name),
    color: m.color,
    mainDps: m.mainDps,
    slot: count - index,
    sequence: combo.sequence,
    refinement: combo.weapon.refinement,
    token: investmentToken(combo.sequence, combo.weapon.refinement, limited, refinesCompared),
    weapon: weaponBase(combo.weapon.name),
    limitedWeapon: limited,
    free: m.loadout?.resonator?.tier === TIER_FREE,
    matrix: !!combo.matrix,
    subs,
  };
}

/** The main DPS first, then the rest from Slot 1's side: his rows list the supports first (Slot 3, Slot 2,
 *  Slot 1), the plus UI leads with whoever the team is built around. Stable for a dual-DPS team. */
export function mainFirst<T extends { mainDps: boolean; slot: number }>(members: T[]): T[] {
  return [...members].sort((a, b) => Number(b.mainDps) - Number(a.mainDps) || a.slot - b.slot);
}

/* -------------------------------------------------------------------------------- the cards */

export interface TeamCard {
  key: string;
  teamKey: string;
  /** 1-based place in the table */
  rank: number;
  /** pinned by the player (his `pinnedRows`), so it stands above the rest */
  pinned: boolean;
  figure: number;
  /** the last rotation's length in seconds (his DPR column's grey subscript), null in DPS mode */
  loop: number | null;
  /** "97.3%" of the top row (or of the pinned one) */
  share: string;
  /** 0-1 bar width */
  width: number;
  /** 0 neutral (weakest row) → 1 accent (top row), his Compare column's heat (compareColumn.ts) */
  strength: number;
  members: CardMember[];
}

/** Every listed row as a card, in table order. `refinesCompared(memberIndex, run)` asks his solver whether
 *  that member's rank is a compared axis on the row (the rank token), defaulting to no. */
export function teamCards<R extends RunRowLike>(
  ordered: Array<OrderedRow<R>>,
  scale: CompareScale,
  mode: TeamMode,
  refinesCompared: (run: R, index: number) => boolean = () => false,
): TeamCard[] {
  return ordered.map(({ key, run, figure, pinned }, i) => {
    const members = run.members.map((m, j) => cardMemberOf(m, run.combo[j]!, j, run.members.length, refinesCompared(run, j)));
    const lastLoop = run.sectionSeconds?.[run.sectionSeconds.length - 1];
    return {
      key,
      teamKey: run.teamKey,
      rank: i + 1,
      pinned: !!pinned,
      figure,
      loop: mode === "dpr" && typeof lastLoop === "number" ? lastLoop : null,
      share: shareText(figure, scale.ref),
      width: shareWidth(figure, scale.ref),
      strength: strengthOf(figure, scale),
      members: mainFirst(members),
    };
  });
}

/* ------------------------------------------------------------------- against the player's account */

/** What the account says about one resonator (src/sim/account/accountState.ts `AccountCharacter`). */
export interface OwnLike {
  owned: boolean;
  sequence: number;
  refinement: number;
  /** this app's weapon key ("StellarSymphony") or null */
  weapon: string | null;
  /** echo ids / names on the build the calculator runs, null for an empty slot */
  echoes?: Array<string | null>;
}

export type OwnKind = "same" | "above" | "below" | "missing" | "assumed";

export interface OwnStatus {
  kind: OwnKind;
  /** the short line under a card's portrait: "✓", "✓ S6R3", "you S2", "no sig", "not owned", "4★ S6" */
  text: string;
  /** the account's own token ("S2R1"), null when the account does not have them */
  own: string | null;
  /** under one of Riley's tiers, a member the account does not reach on the weapon: "other" = the account
   *  wears another weapon than the row's signature ("no sig"), "rank" = the same one at a lower rank */
  weaponGap?: "other" | "rank";
  title: string;
}

/** Riley's weapon names and this app's keys compared the way his `normWeapon()` does. */
export const normWeapon = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The member against the account. Under My account the row already runs the account's own state, so
 *  only an unowned member (listed with "Teams I can field" off) says anything; under one of Riley's tiers
 *  it says whether the account reaches that member's sequence and, for a limited weapon, that weapon at
 *  that rank ("no sig": the account wears another weapon). A free resonator the account never set up
 *  counts as owned at S6 (his `accountOf()`). */
export function ownStatus(member: Pick<CardMember, "sequence" | "refinement" | "weapon" | "limitedWeapon" | "free" | "name">, own: OwnLike | null | undefined, mine: boolean): OwnStatus {
  if (!own?.owned && member.free) {
    return { kind: "assumed", text: "4★ S6", own: "S6", title: `${member.name}: a 4★ or Rover form — everyone has them, counted at S6 (not set up in the calculator)` };
  }
  if (!own?.owned) {
    return {
      kind: "missing",
      text: "not owned",
      own: null,
      title: mine
        ? `${member.name} is not on your account (no weapon equipped in the calculator): this row runs them at S0R1`
        : `${member.name} is not on your account (equip a weapon in the calculator to count them)`,
    };
  }
  const ownToken = `S${own.sequence}R${own.refinement}`;
  if (mine) return { kind: "same", text: "✓", own: ownToken, title: `${member.name}: your own S${own.sequence}, weapon at R${own.refinement}` };
  const sameWeapon = !!own.weapon && normWeapon(own.weapon) === normWeapon(member.weapon);
  // a limited weapon the row runs is only reached when the account wears it, at that rank or above
  const weaponShort = member.limitedWeapon && (!sameWeapon || own.refinement < member.refinement);
  const seqShort = own.sequence < member.sequence;
  if (seqShort || weaponShort) {
    const weaponText = sameWeapon ? `R${own.refinement}` : "no sig";
    const text = seqShort ? `you S${own.sequence}${weaponShort ? (sameWeapon ? weaponText : " · no sig") : ""}` : sameWeapon ? `you ${weaponText}` : weaponText;
    const why = [
      seqShort ? `S${own.sequence} of S${member.sequence}` : "",
      weaponShort ? (sameWeapon ? `${member.weapon} at R${own.refinement} of R${member.refinement}` : `another weapon than ${member.weapon}`) : "",
    ].filter(Boolean).join(", ");
    return { kind: "below", text, own: ownToken, ...(weaponShort ? { weaponGap: sameWeapon ? "rank" : "other" } : {}), title: `${member.name}: yours is ${why}` };
  }
  const above = own.sequence > member.sequence || (member.limitedWeapon && sameWeapon && own.refinement > member.refinement);
  return {
    kind: above ? "above" : "same",
    text: above ? `✓ ${ownToken}` : "✓",
    own: ownToken,
    title: `${member.name}: yours is S${own.sequence}${own.weapon ? `, weapon at R${own.refinement}` : ""} — reaches this row`,
  };
}

export type BuildKind = "full" | "partial" | "none" | "missing";

/** Whether the account has echoes on that character's build (the build the calculator runs). */
export function buildStatus(own: OwnLike | null | undefined): { kind: BuildKind; text: string; echoes: number } {
  if (!own?.owned) return { kind: "missing", text: "no build", echoes: 0 };
  const echoes = (own.echoes ?? []).filter(Boolean).length;
  if (echoes >= 5) return { kind: "full", text: "build", echoes };
  if (echoes > 0) return { kind: "partial", text: `${echoes}/5 echoes`, echoes };
  return { kind: "none", text: "no build", echoes };
}

/** The account's characters by Riley's name: both Rover genders are his one form, so the owned one wins. */
export function ownByRileyName<T extends OwnLike & { rileyName: string }>(characters: Record<string, T>): Map<string, T> {
  const out = new Map<string, T>();
  for (const c of Object.values(characters)) {
    const was = out.get(c.rileyName);
    if (!was || (!was.owned && c.owned) || (was.owned === c.owned && c.sequence > was.sequence)) out.set(c.rileyName, c);
  }
  return out;
}

/** Initials for a portrait that failed to load ("Aero Rover" → "AR", "Lupa" → "Lu"). */
export function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length > 1) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return name.slice(0, 2);
}
