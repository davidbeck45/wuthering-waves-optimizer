// Wuthering Tools+ Echo Lab — "Set lab": which Sonata layout is best for this character, all else equal. The optimizer
// answers "best from what I own", which depends on the luck of what dropped; this holds the five echoes the character
// wears (main stats, substats, levels, the main echo's buff and hit) and changes only the set labels, so a row is what
// the set does and nothing else. Every number is the app's own engine on the character's best rotation.
//
//   1. The rules come from the app's set data (`oneSetBonuses` … `fiveSetBonuses`): a layout is a choice of Sonatas, each
//      at a piece count one of its bonuses names, in five slots at most (`allLayouts`). `validateLayout` refuses anything
//      else. `placeLayout` then seats it on this build: a Sonata counts one echo per name, so it needs enough different
//      echoes of that set at the build's costs (`speciesOf`), or the layout is refused and counted.
//   2. Each layout is scored through `withSetLabels` (upstream's swap recompute of the set bonus and newly active set
//      passives). Layouts whose bonuses are the same always-on stats (Molten Rift 2 and Flaming Clawprint 2 are both
//      +10 % Fusion) share one engine run; `effectKey` is what they share.
//   3. Your own layout reads your calculator's switches, every other one is on at its most stacks for the whole rotation
//      (the swap badges' rule; this engine has no uptime), except a condition the numbers here settle (`ER_GATES`). Each
//      conditional layout also gets the figure for its condition never holding, and your layout the figure for every
//      condition holding.
//   4. A layout the main echo can't carry (slot 0 must hold another echo) keeps that echo's buff and hit in its figure, so
//      the row stays the set alone, and says so, with the figure for that set's best main echo beside it: buff swapped by
//      upstream's recompute, the rotation's echo hit left as written (a rotation names its echo per action).
//   5. Team figures follow /account's rules (`createTeamScorer`): one exact re-score of the strongest team you can field,
//      or no figure, with why. Up front for the likeliest rows, the rest on request (`setLabTeam`). A teammate's Team Buffs
//      panel the team runs verbatim is squared with the layout first (`layoutImpact`).
// Pure/async, worker-safe.
import { allEchoBuffs } from "../../buffs/index";
import type { CharacterRotationInput } from "../../calculator/characterRotation";
import { mainEchoesData } from "../../echoes/index";
import {
  fiveSetBonuses,
  getEchoSetKeyFromBonusLabel,
  getSetBonusEffects,
  oneSetBonuses,
  setBonusEffectsOne,
  setBonusEffectsOnePiece,
  setBonusEffectsTwo,
  threeSetBonuses,
  twoSetBonuses,
} from "../../echoes/sets";
import { echoSetAttacks, echoSetLabelMap, getEchoSetLabelByType } from "../../echoes/stats";
import type { TeamImpact } from "../account/investPlan";
import { characterDisplayName } from "../display/names";
import { menuEnergyRegen } from "../energy/energyHave";
import { resolveTeamCharacters } from "../teamContext/resolveTeam";
import { labSlots, makePacer, prepareCharacter, relGain, scoreBuild, withSetLabels, type LabCharacter, type LabSession, type LabSlot, type RunControl } from "./core";
import { setLabel } from "./echoLabView";
import { speciesOf, teamSideOf, type TeamSide } from "./farmNext";
import { SET_LAB_ASSUMPTIONS, layoutShape, plainText, type LayoutPart, type SetAssumption } from "./setLabView";

export { SET_LAB_ASSUMPTIONS };
export type { LayoutPart };

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** the most echoes a build wears */
const SLOTS = 5;

// ── the rules, from the app's set data ──

let sizeIndex: Map<string, number[]> | null = null;
/** The piece counts each Sonata has a bonus at (`MoltenRift` → [2, 5], `DreamoftheLost` → [3]). */
function setSizes(): Map<string, number[]> {
  if (sizeIndex) return sizeIndex;
  const out = new Map<string, number[]>();
  const add = (bonuses: readonly string[], pieces: number): void => {
    for (const bonus of bonuses) {
      const key = getEchoSetKeyFromBonusLabel(bonus);
      if (key) out.set(key, [...(out.get(key) ?? []), pieces].sort((a, b) => a - b));
    }
  };
  add(oneSetBonuses, 1);
  add(twoSetBonuses, 2);
  add(threeSetBonuses, 3);
  add(fiveSetBonuses, 5);
  sizeIndex = out;
  return out;
}

/** The piece counts a Sonata has a bonus at, none for a name the app does not know. */
export const bonusSizes = (set: string): readonly number[] => setSizes().get(set) ?? [];

/** One order for a layout's parts: most pieces first, then by key. */
const canonical = (parts: readonly LayoutPart[]): LayoutPart[] => [...parts].sort((a, b) => b.pieces - a.pieces || a.set.localeCompare(b.set));

export const layoutKey = (parts: readonly LayoutPart[]): string => canonical(parts).map((p) => `${p.set}:${p.pieces}`).join("+") || "none";

export function parseLayoutKey(key: string): LayoutPart[] {
  if (key === "none" || !key) return [];
  return key.split("+").map((part) => {
    const [set, pieces] = part.split(":");
    return { set, pieces: Number(pieces) };
  });
}

/** Why a layout is not one the game allows (null when it is): the Sonata, its piece counts, five slots. */
export function validateLayout(parts: readonly LayoutPart[]): string | null {
  const seen = new Set<string>();
  let total = 0;
  for (const { set, pieces } of parts) {
    const sizes = bonusSizes(set);
    if (!sizes.length) return `${set} is not a Sonata this app knows`;
    if (seen.has(set)) return `${getEchoSetLabelByType(set)} is named twice`;
    seen.add(set);
    if (!sizes.includes(pieces)) return `${getEchoSetLabelByType(set)} has no ${pieces}-piece bonus`;
    total += pieces;
  }
  return total > SLOTS ? `${total} echoes do not fit in ${SLOTS} slots` : null;
}

let layoutIndex: LayoutPart[][] | null = null;
/** Every layout the set data allows: each Sonata left out or at one of its piece counts, five slots at most. */
export function allLayouts(): readonly LayoutPart[][] {
  if (layoutIndex) return layoutIndex;
  const keys = Object.keys(echoSetLabelMap).filter((k) => bonusSizes(k).length).sort();
  const out: LayoutPart[][] = [];
  const walk = (i: number, left: number, parts: LayoutPart[]): void => {
    if (i === keys.length) {
      out.push(canonical(parts));
      return;
    }
    walk(i + 1, left, parts);
    for (const pieces of bonusSizes(keys[i])) if (pieces <= left) walk(i + 1, left - pieces, [...parts, { set: keys[i], pieces }]);
  };
  walk(0, SLOTS, []);
  layoutIndex = out;
  return out;
}

/** The bonuses a layout gives by the set data: every one of the Sonata's bonuses its pieces reach. */
export function layoutBonuses(parts: readonly LayoutPart[]): string[] {
  return parts.flatMap((p) => bonusSizes(p.set).filter((n) => n <= p.pieces).map((n) => `${getEchoSetLabelByType(p.set)} ${n} Set`));
}

type Selection = { setBonusOnePiece?: string | null; setBonusOne?: string | null; setBonusTwo?: string | null };

const activeOf = (selection: Selection | null | undefined): string[] =>
  [selection?.setBonusOnePiece, selection?.setBonusOne, selection?.setBonusTwo].filter((b): b is string => Boolean(b));

const sameBonuses = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

/** The layout a stored bonus selection is (what the engine scores): each Sonata at the most pieces it names. */
export function layoutOfSelection(selection: Selection | null | undefined): LayoutPart[] {
  const pieces = new Map<string, number>();
  for (const bonus of activeOf(selection)) {
    const set = getEchoSetKeyFromBonusLabel(bonus);
    const n = Number(/(\d) Set$/.exec(bonus)?.[1]);
    if (set && n) pieces.set(set, Math.max(pieces.get(set) ?? 0, n));
  }
  return canonical([...pieces].map(([set, n]) => ({ set, pieces: n })));
}

// ── seating a layout on a build ──

export interface SlotShape {
  cost: number | null;
  species: string | null;
  set: string | null;
}

export interface Placement {
  parts: LayoutPart[];
  key: string;
  /** slot by slot, the Sonata the layout needs there; null = any Sonata that adds no bonus */
  labels: Array<string | null>;
  /** the main echo in slot 0 can carry the layout */
  mainFits: boolean;
  /** when it can't: the echoes that could sit in slot 0 instead */
  mainOptions: string[];
  /** echoes that must become another Sonata */
  changes: number;
}

const fitsSet = (slot: SlotShape, set: string): boolean => slot.set === set || Boolean(slot.species && mainEchoesData[slot.species]?.sets?.includes(set));

/** The echoes of `set` a slot could hold: the one there first when it is one. */
function speciesFor(set: string, slot: SlotShape): string[] {
  const list = slot.cost ? speciesOf(set, slot.cost) : [];
  if (slot.species && fitsSet(slot, set)) return [slot.species, ...list.filter((s) => s !== slot.species)];
  return list;
}

/** Each labelled slot can hold a different echo of its Sonata (a Sonata counts one echo per name). */
function seatable(labels: ReadonlyArray<string | null>, slots: readonly SlotShape[], mainFits: boolean): boolean {
  const used = new Set<string>();
  if (mainFits && slots[0].species) used.add(slots[0].species);
  const todo = labels.flatMap((l, i) => (l !== null && !(i === 0 && mainFits) ? [i] : []));
  const seat = (t: number): boolean => {
    if (t === todo.length) return true;
    const i = todo[t];
    for (const species of speciesFor(labels[i] as string, slots[i])) {
      if (used.has(species)) continue;
      used.add(species);
      if (seat(t + 1)) return true;
      used.delete(species);
    }
    return false;
  };
  return seat(0);
}

/** Every way to choose `k` of `items`. */
function choices(items: readonly number[], k: number): number[][] {
  if (k === 0) return [[]];
  return items.flatMap((item, i) => choices(items.slice(i + 1), k - 1).map((rest) => [item, ...rest]));
}

/** Every way to spread a layout's pieces over the slots. */
function* spreads(parts: readonly LayoutPart[], labels: ReadonlyArray<string | null>): Generator<Array<string | null>> {
  if (!parts.length) {
    yield [...labels];
    return;
  }
  const [{ set, pieces }, ...rest] = parts;
  const open = labels.flatMap((l, i) => (l === null ? [i] : []));
  for (const picked of choices(open, pieces)) {
    const next = [...labels];
    for (const i of picked) next[i] = set;
    yield* spreads(rest, next);
  }
}

/** The fewest echoes that must change Sonata: every labelled slot that differs, and the "any Sonata" slots that would
 *  otherwise make a bonus the layout doesn't have (three spare echoes of one set still make its 2-piece). */
function changesOf(labels: ReadonlyArray<string | null>, slots: readonly SlotShape[], wanted: readonly string[]): number {
  const fixed = labels.filter((l, i) => l !== null && l !== slots[i].set).length;
  const free = labels.flatMap((l, i) => (l === null ? [i] : []));
  let best = free.length;
  for (let mask = 0; mask < 1 << free.length; mask++) {
    const trial = [...labels];
    let changed = 0;
    free.forEach((slot, bit) => {
      if (mask & (1 << bit)) changed += 1;
      else trial[slot] = slots[slot].set;
    });
    if (changed < best && sameBonuses(activeOf(getSetBonusEffects(trial)), wanted)) best = changed;
  }
  return fixed + best;
}

/** Seats a layout on a build, or says why it can't be made. Keeps the main echo where it can, then as many echoes as it can. */
export function placeLayout(parts: readonly LayoutPart[], slots: readonly SlotShape[]): Placement | { refused: string } {
  const illegal = validateLayout(parts);
  if (illegal) return { refused: illegal };
  const ordered = canonical(parts);
  let best: { labels: Array<string | null>; mainFits: boolean; kept: number } | null = null;
  const mainOptions = new Set<string>();
  for (const labels of spreads(ordered, slots.map(() => null))) {
    const first = labels[0];
    const mainFits = first === null || fitsSet(slots[0], first);
    if (!seatable(labels, slots, mainFits)) continue;
    if (!mainFits) for (const species of speciesFor(first as string, slots[0])) mainOptions.add(species);
    const kept = labels.filter((l, i) => l !== null && l === slots[i].set).length;
    if (!best || Number(mainFits) - Number(best.mainFits) > 0 || (mainFits === best.mainFits && kept > best.kept)) best = { labels, mainFits, kept };
  }
  if (!best) {
    const short = ordered.find((p) => !speciesFit(p, slots));
    return { refused: short ? `${getEchoSetLabelByType(short.set)} has too few different echoes at this build's costs` : "the Sonatas compete for the same echoes at this build's costs" };
  }
  return {
    parts: ordered,
    key: layoutKey(ordered),
    labels: best.labels,
    mainFits: best.mainFits,
    mainOptions: best.mainFits ? [] : [...mainOptions].sort(),
    changes: changesOf(best.labels, slots, layoutBonuses(ordered)),
  };
}

const speciesFit = (part: LayoutPart, slots: readonly SlotShape[]): boolean => {
  for (const labels of spreads([part], slots.map(() => null))) if (seatable(labels, slots, false)) return true;
  return false;
};

// ── what a bonus does ──

type PassiveDef = (typeof setBonusEffectsTwo)[string]["passives"][number];

const bonusDef = (bonus: string): { details?: string; passives?: PassiveDef[] } | undefined => setBonusEffectsOnePiece[bonus] ?? setBonusEffectsOne[bonus] ?? setBonusEffectsTwo[bonus];

const passivesOf = (bonus: string): PassiveDef[] => bonusDef(bonus)?.passives ?? [];

/** A passive the engine reads a switch for: it is not always on, and it has something to add. */
const isConditional = (p: PassiveDef): boolean => !p.alwaysEnabled && p.modifiers.length > 0;

/**
 * What a bonus is to the engine: for one made only of always-on passives, its modifiers (the switches don't touch those,
 * and nothing else names them, so two such bonuses with the same modifiers score the same to the last digit), else its name.
 */
function effectOf(bonus: string): string {
  const passives = passivesOf(bonus);
  return passives.length && passives.every((p) => p.alwaysEnabled && !p.hasStacks) ? JSON.stringify(passives.map((p) => p.modifiers)) : bonus;
}

const effectKey = (active: readonly string[]): string => active.map(effectOf).sort().join("|");

/** A stat the always-on passives of a set of bonuses add (Energy Regen, Healing Bonus), in points. */
const alwaysStat = (active: readonly string[], stat: string): number => {
  let sum = 0;
  for (const bonus of active) {
    for (const p of passivesOf(bonus)) {
      if (!p.alwaysEnabled) continue;
      for (const m of p.modifiers) if (m.modifier === stat && typeof m.modifierValue === "number") sum += m.modifierValue;
    }
  }
  return sum;
};

const fileName = (url: string): string => url.split("/").pop()?.split(".")[0] ?? "";
/** The Sonatas whose 5-piece reaches teammates (the ones `resolveTeam` hands out), with the Team Buffs keys they hand out. */
const TEAM_BUFFS = new Map<string, string[]>();
for (const b of allEchoBuffs as Array<{ key: string; imageUrl?: string }>) {
  if (!b.imageUrl?.includes("/echoes/sets/")) continue;
  const set = fileName(b.imageUrl);
  TEAM_BUFFS.set(set, [...(TEAM_BUFFS.get(set) ?? []), b.key]);
}

const reachesTeam = (parts: readonly LayoutPart[]): boolean => parts.some((p) => p.pieces === 5 && TEAM_BUFFS.has(p.set));

/** The set hits (`echoSetAttacks`) a bonus turns on: Midnight Veil's Outro hit. */
function hitsOf(active: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const bonus of active) {
    for (const p of passivesOf(bonus)) {
      for (const m of p.modifiers) {
        if (m.modifier !== "EnableAttack") continue;
        for (const attack of echoSetAttacks) if (attack.key.startsWith(String(m.modifierValue))) out.add(attack.key);
      }
    }
  }
  return out;
}

/**
 * Passives whose condition is a stat the Set lab already reads: the game's text names an Energy Regen (%) the build has
 * or hasn't. The set data leaves them a plain switch, so "on" would credit Tidebreaking Courage's +30 % on a build at
 * 120 %. Every other condition (a status the kit inflicts, a shield) can't be read from a build, and the row says so.
 */
export const ER_GATES: Readonly<Record<string, number>> = { TidebreakingCourage5SetAllElementAttributeBonus: 250 };

const gatedPassives = (active: readonly string[]): PassiveDef[] => active.flatMap((b) => passivesOf(b).filter((p) => ER_GATES[p.key] !== undefined));

/** The account with the Energy Regen conditions of `active` settled by the build's Energy Regen (%). */
function withErGates(characters: Record<string, any>, id: string, active: readonly string[], er: number | null): Record<string, any> {
  const gated = gatedPassives(active).filter((p) => er === null || er < ER_GATES[p.key]);
  if (!gated.length) return characters;
  const data = characters[id] ?? {};
  const passives = { ...(data.echoSetPassives ?? {}) };
  for (const p of gated) passives[p.key] = { isEnabled: false, stacks: 0 };
  return { ...characters, [id]: { ...data, echoSetPassives: passives } };
}

export interface SetBonusInfo {
  bonus: string;
  /** the game's text */
  text: string;
  /** conditional passives, with their own text */
  passives: Array<{ key: string; text: string }>;
  /** nothing in it reaches the character's own damage on its own: its effect is for teammates */
  teamOnly: boolean;
  /** it adds a hit this rotation does not play, so the own figure leaves that hit out */
  hitNotPlayed: boolean;
}

function bonusInfo(bonus: string, rotation: CharacterRotationInput): SetBonusInfo {
  const passives = passivesOf(bonus);
  const played = new Set((rotation.actions ?? []).filter((a) => a.type === "echoSetAttacks" && !a.isDisabled).map((a) => a.key));
  const hits = [...hitsOf([bonus])];
  return {
    bonus,
    text: plainText(bonusDef(bonus)?.details ?? ""),
    passives: passives.filter(isConditional).map((p) => ({ key: p.key, text: plainText(p.details ?? "") })),
    teamOnly: passives.every((p) => !p.modifiers.length),
    hitNotPlayed: hits.length > 0 && !hits.some((h) => played.has(h)),
  };
}

// ── results ──

export interface SetLabRow {
  /** the layout shown, `layoutKey` */
  key: string;
  parts: LayoutPart[];
  /** slot by slot, the Sonata it needs; null = any Sonata that adds no bonus */
  labels: Array<string | null>;
  /** this is the layout the build scores today */
  current: boolean;
  /** your layout again, with every condition holding at its most stacks: read beside the others on their own terms */
  yoursFull: boolean;
  changes: number;
  /** the bonuses it gives */
  bonuses: string[];
  avg: number;
  /** against the build as it is (0 for your layout), relative */
  gain: number;
  /** the same in damage per rotation */
  damage: number;
  /** if no conditional bonus of the layout ever holds; null when it has none */
  floorGain: number | null;
  /** Energy Regen on this layout, as the Energy check reads it (%), and the change in points */
  erHave: number | null;
  erChange: number;
  /** Healing Bonus the always-on bonuses add or lose, in points (not part of any damage figure) */
  healChange: number;
  mainFits: boolean;
  mainOptions: string[];
  /** when the main echo can't carry it: the best echo that can, its buff swapped in, and the gain then */
  bestMain: { species: string; gain: number } | null;
  assumptions: SetAssumption[];
  /** a 5-piece whose bonus reaches teammates: the own figure can't see all of it */
  teamReach: boolean;
  team: TeamImpact | null;
  teamNote: string | null;
  teamPending: boolean;
  /** every other layout with exactly this result */
  same: string[];
  /** the shapes in this row (`layoutShape`), for the filter */
  shapes: string[];
}

export interface SetLabResult {
  fingerprint: string;
  characterId: string;
  name: string;
  rotationName: string;
  base: number;
  rows: SetLabRow[];
  /** the key of your layout's row (the layout itself can sit in a row of equal ones) */
  currentKey: string;
  /** the player pinned the bonus in the calculator: that selection is "your layout", whatever the echoes say */
  pinned: boolean;
  slots: Array<{ slot: number; cost: number | null; species: string | null; set: string | null }>;
  /** layouts the set data allows, and those scored */
  layouts: number;
  scored: number;
  /** layouts this build can't make (a few of them, with why), and how many */
  refused: Array<{ key: string; reason: string }>;
  refusedCount: number;
  /** what every bonus named in `rows` does */
  bonuses: Record<string, SetBonusInfo>;
  /** echoes in the inventory, by Sonata and cost */
  owned: Record<string, Record<string, number>>;
  erBase: number | null;
  erNeed: number | null;
  /** the strongest team you can field, or why not */
  teamName: string | null;
  teamBase: number | null;
  teamNote: string | null;
  autoTeamBuffs: boolean;
  assumptions: readonly string[];
  scorings: number;
  teamScorings: number;
  ms: number;
}

export interface SetLabOptions {
  /** team buffs from the team's real members (the app's default; the page passes its switch) */
  autoTeamBuffs?: boolean;
  /** rows that get a team figure up front, best own gain first (default 8; rows whose 5-piece reaches teammates always do; 0 = none at all) */
  teamRows?: number;
  /** the Energy Regen the character's saved teams need (%), for the warning */
  erNeed?: number | null;
}

export interface SetLabTeamFigure {
  key: string;
  team: TeamImpact | null;
  teamNote: string | null;
}

export interface SetLabTeamResult {
  figures: SetLabTeamFigure[];
}

/** The key of the row that is your layout with every condition holding. */
const FULL = "#conditions-on";

// ── scoring ──

/** The rotation a layout is scored on: a set hit the build plays today comes out when the layout drops the bonus behind it. */
function rotationFor(lab: LabCharacter, currentHits: ReadonlySet<string>, active: readonly string[]): CharacterRotationInput {
  const actions = lab.rotation.actions ?? [];
  if (!currentHits.size || !actions.some((a) => a.type === "echoSetAttacks")) return lab.rotation;
  const keeps = hitsOf(active);
  return { ...lab.rotation, actions: actions.map((a) => (a.type === "echoSetAttacks" && currentHits.has(a.key) && !keeps.has(a.key) ? { ...a, isDisabled: true } : a)) };
}

/** The account with the conditional passives of `active` switched: all on at their most stacks, or all off. */
function withConditionals(characters: Record<string, any>, id: string, active: readonly string[], on: boolean): Record<string, any> {
  const data = characters[id] ?? {};
  const passives = { ...(data.echoSetPassives ?? {}) };
  for (const bonus of active) for (const p of passivesOf(bonus).filter(isConditional)) passives[p.key] = on ? { isEnabled: true, stacks: p.maxStacks ?? 0 } : { isEnabled: false, stacks: 0 };
  return { ...characters, [id]: { ...data, echoSetPassives: passives } };
}

/** Your layout with every condition holding, the ones the build's Energy Regen settles aside. */
const fullBuild = (characters: Record<string, any>, id: string, active: readonly string[], er: number | null): Record<string, any> => withErGates(withConditionals(characters, id, active, true), id, active, er);

const SELECTION_FIELDS = ["setBonusOnePiece", "setBonusOne", "setBonusTwo"] as const;

/** Each conditional passive of a layout as it was scored: the switches of the clone, and whose they are (the swap
 *  recompute keeps your switches for a bonus that stays in its place and turns on any other). */
function assumptionsOf(selection: Selection, stored: Selection, passiveState: Record<string, { isEnabled?: boolean; stacks?: number }>, er: number | null): SetAssumption[] {
  const out: SetAssumption[] = [];
  for (const field of SELECTION_FIELDS) {
    const bonus = selection[field];
    if (!bonus) continue;
    for (const p of passivesOf(bonus).filter(isConditional)) {
      const state = passiveState?.[p.key];
      const yours = stored[field] === bonus;
      const gate = ER_GATES[p.key];
      const below = gate !== undefined && (er === null || er < gate);
      out.push({
        bonus,
        passive: p.key,
        source: yours ? "yours" : "assumed",
        on: Boolean(state?.isEnabled),
        stacks: p.hasStacks ? state?.stacks ?? 0 : null,
        maxStacks: p.hasStacks ? p.maxStacks ?? null : null,
        // yours and on: the switch is what counts, and the row says the build doesn't reach it
        erGate: below && Boolean(state?.isEnabled) === yours ? { need: gate, have: er } : null,
      });
    }
  }
  return out;
}

interface Scored {
  placement: Placement;
  selection: Selection;
  active: string[];
  effect: string;
  avg: number;
  floor: number | null;
  erHave: number | null;
  erSum: number;
  heal: number;
  current: boolean;
}

/** Layouts that read the same are one row: the same numbers and, for anything with a 3- or 5-piece, the same one of
 *  those. So a 2-piece that adds nothing for this rotation is never a row of its own, while every 5-piece keeps its row
 *  (two that do nothing here can still differ for the team). */
function groupKey(s: Scored, base: number): string {
  const big = s.placement.parts.find((p) => p.pieces >= 3);
  const ratio = (v: number | null): string => (v === null ? "-" : (v / base).toFixed(10));
  return [big ? layoutKey([big]) : "", ratio(s.avg), ratio(s.floor), s.erSum, s.heal].join("|");
}

const piecesOf = (p: Placement): number => p.parts.reduce((sum, part) => sum + part.pieces, 0);

/** The layout a row is named after: yours, else one your main echo can carry, else the plainest. */
const betterRep = (a: Scored, b: Scored): number =>
  Number(b.current) - Number(a.current) ||
  Number(b.placement.mainFits) - Number(a.placement.mainFits) ||
  piecesOf(a.placement) - piecesOf(b.placement) ||
  a.placement.changes - b.placement.changes ||
  a.placement.key.localeCompare(b.placement.key);

function ownedBySet(echoes: readonly any[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const e of echoes) {
    if (!e?.echoSet || !e.type) continue;
    const byCost = (out[e.echoSet] ??= {});
    byCost[e.type] = (byCost[e.type] ?? 0) + 1;
  }
  return out;
}

const shapeOf = (slots: readonly LabSlot[]): SlotShape[] => slots.map((s) => ({ cost: s.cost, species: s.species, set: s.set }));

/** A teammate whose Team Buffs panel the team runs as it stands: `resolveTeam` keeps a panel that names the team verbatim,
 *  ticks and all (every panel, with team buffs off), so nothing a layout does reaches it on its own. */
interface PanelMate {
  id: string;
  /** the buffs ticked on it */
  ticked: Set<string>;
  /** the Sonatas the team's other member wears at five: their buff stays on the panel whatever this character wears */
  otherWears: Set<string>;
}

interface TeamReader {
  side: TeamSide;
  ctx: Awaited<ReturnType<TeamSide["scorer"]["teamFor"]>>;
  block: string | null;
  note: string | null;
  /** the Sonatas this character hands teammates today (five labels, `resolveTeam`'s count) */
  worn: string[];
  panels: PanelMate[];
}

/** The Sonatas a record wears at five, by its echoes' labels. */
function fivesOf(data: Record<string, any> | undefined, echoes: any[]): string[] {
  const counts = new Map<string, number>();
  for (const slot of labSlots(data ?? {}, echoes)) if (slot?.set) counts.set(slot.set, (counts.get(slot.set) ?? 0) + 1);
  return [...counts].filter(([, n]) => n >= SLOTS).map(([set]) => set);
}

async function panelMatesOf(session: LabSession, lab: LabCharacter, ctx: NonNullable<TeamReader["ctx"]>, auto: boolean): Promise<PanelMate[]> {
  const { characters, echoes } = session.account;
  const resolution = await resolveTeamCharacters(ctx.candidate.team, characters, echoes, { auto, enemyConfig: session.enemy });
  const out: PanelMate[] = [];
  for (const slot of resolution.slots) {
    if (slot.characterId === lab.id) continue;
    const panel = resolution.characters[slot.characterId]?.teamBuffs ?? {};
    const namesThem = panel.selectedCharacter1 === lab.id || panel.selectedCharacter2 === lab.id;
    if (!namesThem || (resolution.auto && slot.buffSource !== "panel")) continue;
    const others = resolution.slots.filter((s) => s.characterId !== lab.id && s.characterId !== slot.characterId);
    out.push({
      id: slot.characterId,
      ticked: new Set(Object.entries(panel.buffs ?? {}).filter(([, v]) => (v as { isEnabled?: boolean })?.isEnabled).map(([k]) => k)),
      otherWears: new Set(others.flatMap((s) => fivesOf(resolution.characters[s.characterId], echoes))),
    });
  }
  return out;
}

async function teamReaderOf(session: LabSession, lab: LabCharacter, auto: boolean, pace: ReturnType<typeof makePacer>, counter: { n: number }): Promise<TeamReader> {
  const side = await teamSideOf(session, auto, pace, counter);
  const ctx = await side.scorer.teamFor(lab.id);
  const block = ctx ? await side.scorer.buildBlock(ctx, lab.id) : null;
  const note = !ctx ? "not in a team you can field" : block ?? (ctx.base > 0 ? null : "the team scores no damage");
  const panels = ctx && !note ? await panelMatesOf(session, lab, ctx, auto) : [];
  return { side, ctx, block, note, worn: fivesOf(session.account.characters[lab.id], session.account.echoes).filter((s) => TEAM_BUFFS.has(s)), panels };
}

/** The account with `keys` unticked on a teammate's panel, on the record and on its saved builds (a team can run either). */
function withPanelOff(characters: Record<string, any>, id: string, keys: readonly string[]): Record<string, any> {
  const untick = (panel: any): any => {
    if (!panel?.buffs) return panel;
    const buffs = { ...panel.buffs };
    for (const key of keys) if (buffs[key]) buffs[key] = { ...buffs[key], isEnabled: false };
    return { ...panel, buffs };
  };
  const data = characters[id];
  return { ...characters, [id]: { ...data, teamBuffs: untick(data.teamBuffs), ...(Array.isArray(data.builds) ? { builds: data.builds.map((b: any) => ({ ...b, teamBuffs: untick(b.teamBuffs) })) } : {}) } };
}

/**
 * A layout's team figure, once the teammates' panels agree with it. A 5-piece buff the layout gives up comes off the panels
 * (unless their other member wears that 5-piece too): left ticked, a support reads a gain on a layout that costs the team
 * the buff they were worn for. A 5-piece the layout takes on can't be added the same way, since a panel holds stacks and a
 * chosen receiver, so unless it is ticked already there is no exact figure, and the row says so.
 */
async function layoutImpact(reader: TeamReader, parts: readonly LayoutPart[], build: Record<string, any>, echoes: any[]): Promise<{ team: TeamImpact | null; note: string | null }> {
  const fives = parts.filter((p) => p.pieces === SLOTS).map((p) => p.set);
  const given = reader.worn.filter((set) => !fives.includes(set));
  const taken = fives.filter((set) => TEAM_BUFFS.has(set) && !reader.worn.includes(set));
  let next = build;
  for (const mate of reader.panels) {
    const unticked = taken.find((set) => !(TEAM_BUFFS.get(set) as string[]).some((key) => mate.ticked.has(key)));
    if (unticked) return { team: null, note: `${characterDisplayName(mate.id)}'s Team Buffs panel doesn't tick ${setLabel(unticked)}` };
    const off = given.filter((set) => !mate.otherWears.has(set)).flatMap((set) => TEAM_BUFFS.get(set) as string[]);
    if (off.length) next = withPanelOff(next, mate.id, off);
  }
  return reader.side.scorer.impact(reader.ctx, reader.block, next, echoes);
}

async function labFor(session: LabSession, characterId: string, pace: ReturnType<typeof makePacer>): Promise<LabCharacter> {
  const lab = await prepareCharacter(session, characterId, pace);
  if (!lab) throw new Error(session.skipped.get(characterId) ?? `${characterId} can't be scored`);
  if (!lab.complete) throw new Error("the Set lab needs a build with five echoes");
  return lab;
}

/** The Set lab for one five-echo build: every layout the game allows, best first. */
export async function setLab(session: LabSession, characterId: string, options: SetLabOptions = {}, control: RunControl = {}): Promise<SetLabResult> {
  const started = now();
  const startScorings = session.scorings;
  const pace = makePacer(control);
  const lab = await labFor(session, characterId, pace);
  const { characters, echoes } = session.account;
  const slots = lab.slots as LabSlot[];
  const shape = shapeOf(slots);
  const stored = (characters[lab.id]?.echoSetBonus ?? {}) as Selection;
  const storedActive = activeOf(stored);
  const currentKey = layoutKey(layoutOfSelection(stored));
  const currentHits = hitsOf(storedActive);

  // seat every layout; your own is scored whatever the seating says (it is what you wear)
  const placements: Placement[] = [];
  const refused: SetLabResult["refused"] = [];
  let refusedCount = 0;
  const layouts = allLayouts();
  for (const parts of layouts) {
    const placed = placeLayout(parts, shape);
    if ("refused" in placed) {
      if (layoutKey(parts) === currentKey) continue;
      refusedCount += 1;
      if (refused.length < 6) refused.push({ key: layoutKey(parts), reason: placed.refused });
    } else placements.push(placed);
  }
  if (!placements.some((p) => p.key === currentKey)) {
    const parts = layoutOfSelection(stored);
    placements.push({ parts, key: currentKey, labels: slots.map((s) => s.set), mainFits: true, mainOptions: [], changes: 0 });
  }

  // score each distinct set of bonuses once
  const byEffect = new Map<string, { avg: number; floor: number | null }>();
  const erBySum = new Map<number, number | null>();
  const erBase = await menuEnergyRegen(lab.id, characters, echoes);
  const scored: Scored[] = [];
  for (let i = 0; i < placements.length; i++) {
    const placement = placements[i];
    const current = placement.key === currentKey;
    // your layout is the build as it stands: your stored bonuses (pinned or not) and your switches, nothing re-derived
    const relabelled = current ? characters : withSetLabels(session, lab, placement.labels);
    const selection = (current ? stored : relabelled[lab.id].echoSetBonus ?? {}) as Selection;
    const active = activeOf(selection);
    if (!sameBonuses(active, current ? storedActive : layoutBonuses(placement.parts))) throw new Error(`${placement.key} gave ${active.join(", ") || "no bonus"}`);
    const erSum = alwaysStat(active, "EnergyRegen");
    if (!erBySum.has(erSum)) erBySum.set(erSum, await menuEnergyRegen(lab.id, relabelled, echoes));
    const erHave = current ? erBase : erBySum.get(erSum) ?? null;
    const clone = current ? characters : withErGates(relabelled, lab.id, active, erHave);
    const effect = effectKey(active);
    const memoKey = current ? `yours|${effect}` : effect;
    let result = byEffect.get(memoKey);
    if (!result) {
      const rated = { ...lab, rotation: rotationFor(lab, currentHits, active) };
      const avg = current ? lab.base : await scoreBuild(session, rated, clone, echoes);
      const conditional = active.some((b) => passivesOf(b).some(isConditional));
      const floor = conditional ? await scoreBuild(session, rated, withConditionals(clone, lab.id, active, false), echoes) : null;
      result = { avg, floor };
      byEffect.set(memoKey, result);
    }
    scored.push({
      placement,
      selection,
      active,
      effect,
      avg: result.avg,
      floor: result.floor,
      erHave,
      erSum,
      heal: alwaysStat(active, "HealingBonus"),
      current,
    });
    await pace({ phase: "sets", done: i + 1, total: placements.length });
  }

  // one row per result
  const groups = new Map<string, Scored[]>();
  for (const s of scored) {
    const key = groupKey(s, lab.base);
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const storedHeal = alwaysStat(storedActive, "HealingBonus");
  const rows: SetLabRow[] = [];
  for (const group of groups.values()) {
    const ordered = [...group].sort(betterRep);
    const rep = ordered[0];
    const placement = rep.placement;
    const clone = rep.current ? characters : withErGates(withSetLabels(session, lab, placement.labels), lab.id, rep.active, rep.erHave);
    let bestMain: SetLabRow["bestMain"] = null;
    if (!placement.mainFits) {
      const rated = { ...lab, rotation: rotationFor(lab, currentHits, rep.active) };
      for (const species of placement.mainOptions) {
        const gain = relGain(lab.base, await scoreBuild(session, rated, withErGates(withSetLabels(session, lab, placement.labels, species), lab.id, rep.active, rep.erHave), echoes));
        if (!bestMain || gain > bestMain.gain) bestMain = { species, gain };
        await pace();
      }
    }
    rows.push({
      key: placement.key,
      parts: placement.parts,
      labels: placement.labels,
      current: rep.current,
      yoursFull: false,
      changes: rep.current ? 0 : placement.changes,
      bonuses: rep.active,
      avg: rep.avg,
      gain: relGain(lab.base, rep.avg),
      damage: rep.avg - lab.base,
      floorGain: rep.floor === null ? null : relGain(lab.base, rep.floor),
      erHave: rep.erHave,
      erChange: rep.erHave !== null && erBase !== null ? rep.erHave - erBase : 0,
      healChange: rep.heal - storedHeal,
      mainFits: placement.mainFits,
      mainOptions: placement.mainOptions,
      bestMain,
      assumptions: assumptionsOf(rep.selection, stored, clone[lab.id].echoSetPassives ?? {}, rep.erHave),
      teamReach: reachesTeam(placement.parts),
      team: null,
      teamNote: null,
      teamPending: false,
      same: ordered.slice(1).map((s) => s.placement.key),
      shapes: [...new Set(ordered.map((s) => layoutShape(s.placement.parts)))],
    });
  }
  // your layout with every condition met, when you wear it with less: the row to read the others against, which are all
  // credited with theirs
  if (storedActive.some((b) => passivesOf(b).some(isConditional))) {
    const on = fullBuild(characters, lab.id, storedActive, erBase);
    const full = await scoreBuild(session, lab, on, echoes);
    const yours = rows.find((r) => r.current) as SetLabRow;
    // not when it reads lower: that is a switch on for a condition the build doesn't reach (`ER_GATES`), and your row says so
    if (full > lab.base * (1 + 1e-9)) {
      rows.push({
        ...yours,
        key: `${yours.key}${FULL}`,
        current: false,
        yoursFull: true,
        avg: full,
        gain: relGain(lab.base, full),
        damage: full - lab.base,
        assumptions: assumptionsOf(stored, {}, on[lab.id].echoSetPassives ?? {}, erBase),
        same: [],
      });
    }
  }
  rows.sort((a, b) => b.gain - a.gain || Number(b.current) - Number(a.current) || a.key.localeCompare(b.key));

  // team figures, on /account's rules
  const counter = { n: 0 };
  const want = Math.max(0, Math.floor(options.teamRows ?? 8));
  const auto = options.autoTeamBuffs ?? true;
  let teamName: string | null = null;
  let teamBase: number | null = null;
  let teamNote: string | null = null;
  if (options.teamRows !== 0) {
    const reader = await teamReaderOf(session, lab, auto, pace, counter);
    teamNote = reader.note;
    teamName = reader.ctx?.rank.name ?? null;
    teamBase = reader.ctx?.base ?? null;
    const picks = new Set(rows.filter((r, i) => r.current || r.yoursFull || r.teamReach || i < want));
    let done = 0;
    for (const row of rows) {
      if (reader.note) {
        row.teamNote = reader.note;
        continue;
      }
      if (!picks.has(row)) {
        row.teamPending = true;
        continue;
      }
      await pace({ phase: "set-team", done, total: picks.size });
      done += 1;
      counter.n += 1;
      const { team, note } =
        row.current || row.yoursFull
          ? await reader.side.scorer.impact(reader.ctx, reader.block, row.yoursFull ? fullBuild(characters, lab.id, storedActive, erBase) : characters, echoes)
          : await layoutImpact(reader, row.parts, withErGates(withSetLabels(session, lab, row.labels), lab.id, row.bonuses, row.erHave), echoes);
      row.team = team;
      row.teamNote = note;
    }
  }

  const bonuses: Record<string, SetBonusInfo> = {};
  for (const bonus of new Set(rows.flatMap((r) => r.bonuses))) bonuses[bonus] = bonusInfo(bonus, lab.rotation);

  return {
    fingerprint: session.fingerprint,
    characterId: lab.id,
    name: lab.name,
    rotationName: lab.rotationName,
    base: lab.base,
    rows,
    currentKey: rows.find((r) => r.current)?.key ?? currentKey,
    pinned: lab.setPinned,
    slots: slots.map((s) => ({ slot: s.slot, cost: s.cost, species: s.species, set: s.set })),
    layouts: layouts.length,
    scored: placements.length,
    refused,
    refusedCount,
    bonuses,
    owned: ownedBySet(echoes),
    erBase,
    erNeed: options.erNeed ?? null,
    teamName,
    teamBase,
    teamNote,
    autoTeamBuffs: auto,
    assumptions: SET_LAB_ASSUMPTIONS,
    scorings: session.scorings - startScorings,
    teamScorings: counter.n,
    ms: now() - started,
  };
}

/** Team figures for rows the first pass left pending. Refuses a layout the game does not allow, or this build can't make. */
export async function setLabTeam(session: LabSession, characterId: string, keys: readonly string[], options: SetLabOptions = {}, control: RunControl = {}): Promise<SetLabTeamResult> {
  const pace = makePacer(control);
  const lab = await labFor(session, characterId, pace);
  const { characters, echoes } = session.account;
  const shape = shapeOf(lab.slots as LabSlot[]);
  const storedActive = activeOf(characters[lab.id]?.echoSetBonus);
  const yoursKey = layoutKey(layoutOfSelection(characters[lab.id]?.echoSetBonus));
  const erBase = await menuEnergyRegen(lab.id, characters, echoes);
  const builds: Array<{ key: string; build: Record<string, any>; parts?: LayoutPart[] }> = [];
  for (const key of keys) {
    if (key === `${yoursKey}${FULL}`) builds.push({ key, build: fullBuild(characters, lab.id, storedActive, erBase) });
    else if (key === yoursKey) builds.push({ key, build: characters });
    else {
      const placed = placeLayout(parseLayoutKey(key), shape);
      if ("refused" in placed) throw new Error(placed.refused);
      const relabelled = withSetLabels(session, lab, placed.labels);
      const active = layoutBonuses(placed.parts);
      builds.push({ key, parts: placed.parts, build: gatedPassives(active).length ? withErGates(relabelled, lab.id, active, await menuEnergyRegen(lab.id, relabelled, echoes)) : relabelled });
    }
  }
  const reader = await teamReaderOf(session, lab, options.autoTeamBuffs ?? true, pace, { n: 0 });
  const figures: SetLabTeamFigure[] = [];
  for (let i = 0; i < builds.length; i++) {
    const { key, build, parts } = builds[i];
    await pace({ phase: "set-team", done: i, total: builds.length });
    if (reader.note) figures.push({ key, team: null, teamNote: reader.note });
    else {
      const { team, note } = parts ? await layoutImpact(reader, parts, build, echoes) : await reader.side.scorer.impact(reader.ctx, reader.block, build, echoes);
      figures.push({ key, team, teamNote: note });
    }
  }
  return { figures };
}
