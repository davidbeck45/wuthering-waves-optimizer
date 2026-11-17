// Wuthering Tools+ — the resonator briefs' model (/kit and /kit/<name>): what the GENERATED tables hold
// (data/kits.json and data/kitIndex.json, written by wuwa-tools/rotation-port/export_kits.mjs from Riley31415's
// wuwa_calc and his precomputed solves) and every reading of them the two pages make. Pure: no Vue, no stores, and
// neither table is imported here (load.ts does that), so the tests hand in a file of their own.
//
// Rules:
//   - Every figure in the tables is wuwa_calc's: team DPS at his standard builds (`_meta.basis`), never the account's.
//   - Who the app shows is decided here, at run time, from the app's own character list (`InApp`): a resonator or a
//     team member it lacks is left out. No name is written into the code, so a kit shows up by itself on the day the
//     app gets its character.
//   - Text is built from the tables by the templates below. Nothing is copied from a guide.
import { RILEY_TIERS } from "../rankings/filterChips";
import { appKeyOf, rileyNameOf } from "../rankings/rileyNames";

// ---------------------------------------------------------------------------------------------- the tables

export interface KitIndexEntry {
  /** Riley's resonator name ("Luuk Herssen", "Aero Rover") */
  name: string;
  /** this app's character key ("LuukHerssen", "RoverAeroFemale": a Rover is filed under the female form) */
  appKey: string;
  element: string;
  /** weapon type, singular ("Sword") */
  weapon: string;
  /** his rarity tier: Limited, Standard, Free (4★ and Rover forms, always S6 on his table), FreeS2 */
  tier: string;
  /** teams that field them as a main DPS / as a support */
  main: number;
  support: number;
  /** one of his interchangeable sustain supports */
  sustain?: boolean;
}

export interface KitsMeta {
  generatedBy: string;
  generated: string;
  wuwaCalcCommit: string | null;
  appCommit: string | null;
}

export interface KitIndexFile {
  _meta: KitsMeta;
  kits: KitIndexEntry[];
}

/** One member as fielded: [loadout label, resonator, sequence, weapon, rank]. */
export type KitBuild = [label: string, name: string, sequence: number, weapon: string, rank: number];
/** A main-stat slot: [echo cost, stat]. */
export type MainstatSlot = [cost: number, stat: string];
export type LoopChangeKind = "loop" | "order" | "chain";

/** One solved team: members as indexes into `builds`, the slots that are main DPS, team DPS and the subject's part. */
export interface KitTeamFact {
  m: number[];
  mains: number[];
  dps: number;
  share: number;
  /** on his table by default (the rest open with their support group) */
  shown?: boolean;
  /** the loop's length */
  seconds?: number;
  /** the slot his other sustain supports can take, and each of them: [build, team DPS, the subject's part] */
  flex?: number;
  alts?: Array<[build: number, dps: number, share: number]>;
}

export interface KitLoadout {
  /** the export's name in his source ("AEMEATH_BURST") */
  id: string;
  /** "Aemeath (Burst)" */
  label: string;
  /** "Resonance Mode - Fusion Burst", or null */
  mode: string | null;
  teams: number;
  shown: number;
  main: number;
  support: number;
  weapons: Array<{ name: string; kind: string; ranks: [number, number] }>;
  echoes: Array<{ main: string; sets: string[] }>;
  /** how many main-stat layouts his solver searches */
  layouts: number;
  /** his ChemX32 substat order (six) and the High Invest one */
  substats: string[];
  substatsHigh: string[];
  /** the ER rolls the spread can carry, lowest first; empty when the Liberation costs no energy */
  erRolls: number[];
  minEr?: number;
  minCritRate?: number;
  /** the lowest sequence this build has a loop for */
  minSequence: number;
  /** the steady-state loop from each level that presses other casts ("Basic - Aemeath 3 ×2") */
  loops: Record<string, string[]>;
  changes: Array<{ level: number; kind: LoopChangeKind; added: string[]; removed: string[]; note?: string }>;
  /** the solver's own build in the best team that fields this loadout at `cost` */
  pick: null | { cost: string; team: KitTeamFact; weapon: string; rank: number; mainEcho: string; sets: string[]; mainstat: MainstatSlot[]; erRolls?: number; erNeed?: number };
}

export interface KitSequence {
  level: number;
  /** the piece's name; empty where his kit has none (not modelled yet) */
  name: string;
  /** the strongest change any loadout makes to the loop at this level */
  kind: LoopChangeKind | null;
  /** his own note on what the piece does in the engine */
  note: string;
}

export interface KitLadder {
  cost: string;
  team: KitTeamFact;
  held: { sequence: number; weapon: string; rank: number; echo: string; mainstat: MainstatSlot[] };
  seq: Array<{ level: number; dps: number; own: number; erRolls?: number; erNeed?: number; short?: boolean }>;
  ranks: Array<{ rank: number; dps: number; own: number }>;
  weapons: Array<{ weapon: string; kind: string; rank: number; dps: number }>;
}

export interface Kit extends Omit<KitIndexEntry, "main" | "support"> {
  /** Resonance Energy (the Liberation's cost); 0 = none */
  energy: number;
  teams: { main: number; support: number; mainShown: number; supportShown: number };
  /** his notes on the team lists that are about this resonator */
  notes: string[];
  /** where their own damage comes from in the best team at `cost`, in whole percent */
  mix: null | { cost: string; team: KitTeamFact; types: Array<[string, number]>; scaling: Array<[string, number]>; share: number };
  loadouts: KitLoadout[];
  sequences: KitSequence[];
  /** per Team Cost, the best teams, best first */
  best: Record<string, KitTeamFact[]>;
  ladder: KitLadder | null;
}

export interface KitsFile {
  _meta: KitsMeta & {
    /** the enemy and the builds every figure is run on */
    basis: string;
    unit: string;
    /** his Team Costs in menu order, with what each means */
    costs: Array<{ key: string; means: string }>;
    /** his interchangeable sustain supports */
    sustain: string[];
    /** one ER substat roll at the median, in percent */
    erRoll: number;
  };
  builds: KitBuild[];
  kits: Record<string, Kit>;
}

// ------------------------------------------------------------------------------------ who the app shows

/** Whether the app has a character for this key (its own list: `display/names.ts` `isRosterCharacter`). */
// eslint-disable-next-line no-unused-vars -- the parameter of a function type
export type InApp = (appKey: string) => boolean;

/** The briefs this app shows: one whose resonator the app has no character for is left out. */
export const kitsInApp = <T extends { appKey: string }>(kits: readonly T[], inApp: InApp): T[] => kits.filter((k) => inApp(k.appKey));

/** "Luuk Herssen" → "luuk-herssen": a brief's address, /kit/luuk-herssen. */
export const kitSlug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const kitPath = (name: string): string => `/kit/${kitSlug(name)}`;

/** The brief an address names: its slug, Riley's name, or an app key (either Rover gender: both are his one form). */
export function findKit<T extends { name: string; appKey: string }>(kits: readonly T[], wanted: string | null | undefined): T | null {
  const text = String(wanted ?? "").trim();
  if (!text) return null;
  const slug = kitSlug(text);
  const viaKey = kitSlug(rileyNameOf(text));
  return kits.find((k) => kitSlug(k.name) === slug || k.appKey === text || kitSlug(k.name) === viaKey) ?? null;
}

/** The brief of an app character, or null when there is none (the /account drawer's and the palette's link). */
export const kitPathOfCharacter = (appKey: string, index: readonly KitIndexEntry[], inApp: InApp): string | null => {
  const kit = findKit(kitsInApp(index, inApp), appKey);
  return kit ? kitPath(kit.name) : null;
};

export type KitRole = "main" | "support" | "sustain";
export const ROLE_LABEL: Record<KitRole, string> = { main: "Main DPS", support: "Support", sustain: "Sustain" };

/** The roles a resonator is fielded in on his table: a main DPS, a support, and (of the supports) his sustain group. */
export function rolesOf(kit: { main: number; support: number; sustain?: boolean }): KitRole[] {
  return [...(kit.main > 0 ? (["main"] as const) : []), ...(kit.support > 0 ? (["support"] as const) : []), ...(kit.sustain ? (["sustain"] as const) : [])];
}

/** "5★ limited", "5★ standard", "4★ or Rover": his rarity tier in the game's words. */
export function tierLabel(tier: string): string {
  if (tier === "Limited") return "5★ limited";
  if (tier === "Standard" || tier === "FreeS2") return "5★ standard";
  if (tier === "Free") return "4★ or Rover";
  return tier;
}

export interface KitFilter {
  element?: string | null;
  role?: KitRole | null;
  query?: string | null;
}

/** The list page's filter: element, role and a search over the name the app shows, Riley's name and the weapon type. */
export function filterKits<T extends KitIndexEntry>(kits: readonly T[], filter: KitFilter, displayName: (kit: T) => string = (k) => k.name): T[] {
  const words = String(filter.query ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return kits.filter((k) => {
    if (filter.element && k.element !== filter.element) return false;
    if (filter.role && !rolesOf(k).includes(filter.role)) return false;
    if (!words.length) return true;
    const text = `${displayName(k)} ${k.name} ${k.element} ${k.weapon}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

// ---------------------------------------------------------------------------------------------- teams

export interface KitMember {
  /** "Denia (Burst)": the loadout's label on his table */
  label: string;
  /** Riley's resonator name */
  name: string;
  /** the app key his name maps to (a Rover: the female form; the page swaps in the form the account holds) */
  appKey: string;
  sequence: number;
  weapon: string;
  rank: number;
  main: boolean;
}

export interface KitTeam {
  members: KitMember[];
  /** team DPS on his standard builds */
  dps: number;
  /** the subject's part of it; null where the row comes from another resonator's brief (`teamsWith`) */
  share: number | null;
  seconds: number | null;
  /** the slot his sustain supports share, or null */
  flex: number | null;
  /** the sustain supports that can take the flex slot instead, with the team's DPS then */
  alts: Array<{ member: KitMember; dps: number }>;
  /** his first pick for the flex slot, when the app has no character for them and the row shows the next one */
  insteadOf: string | null;
}

const memberOf = (file: Pick<KitsFile, "builds">, index: number, main: boolean): KitMember | null => {
  const b = file.builds[index];
  return b ? { label: b[0], name: b[1], appKey: appKeyOf(b[1]), sequence: b[2], weapon: b[3], rank: b[4], main } : null;
};

/** A solved team as the page reads it; null when the table does not hold one of its members. */
export function teamOf(file: Pick<KitsFile, "builds">, fact: KitTeamFact): KitTeam | null {
  const members = fact.m.map((i, slot) => memberOf(file, i, fact.mains.includes(slot)));
  if (members.some((m) => !m)) return null;
  const alts = (fact.alts ?? []).flatMap(([build, dps]) => {
    const member = memberOf(file, build, false);
    return member ? [{ member, dps }] : [];
  });
  return { members: members as KitMember[], dps: fact.dps, share: fact.share, seconds: fact.seconds ?? null, flex: alts.length ? (fact.flex ?? null) : null, alts, insteadOf: null };
}

/**
 * One Team Cost's rows as this app can field them, best first. A row whose every member the app has stands as it is
 * (its alternates the app lacks dropped). A row whose flex slot goes to a resonator the app lacks falls to the best
 * alternate it has, with that team's own DPS. A row with any other missing member is left out.
 */
export function fieldableTeams(file: Pick<KitsFile, "builds">, rows: readonly KitTeamFact[] | undefined, inApp: InApp): KitTeam[] {
  const out: KitTeam[] = [];
  for (const fact of rows ?? []) {
    const team = teamOf(file, fact);
    if (!team) continue;
    const has = (m: KitMember): boolean => inApp(m.appKey);
    const alts = team.alts.filter((a) => has(a.member));
    if (team.members.every(has)) {
      out.push({ ...team, alts, flex: alts.length ? team.flex : null });
      continue;
    }
    const flex = fact.flex ?? -1;
    const others = team.members.filter((_, slot) => slot !== flex);
    if (flex < 0 || !team.members[flex] || !others.every(has) || !alts.length) continue;
    const pick = [...(fact.alts ?? [])].map(([build, dps, share]) => ({ member: memberOf(file, build, false), dps, share })).filter((a) => a.member && has(a.member))[0];
    if (!pick?.member) continue;
    out.push({
      members: team.members.map((m, slot) => (slot === flex ? { ...pick.member!, main: m.main } : m)),
      dps: pick.dps,
      share: pick.share,
      seconds: null, // the loop length is the first pick's team's, not this one's
      flex,
      alts: alts.filter((a) => a.member.name !== pick.member!.name),
      insteadOf: team.members[flex]!.name,
    });
  }
  return out.sort((a, b) => b.dps - a.dps);
}

/**
 * Every team the table holds at one Team Cost that fields `subject` and that the app can field, best first. Their own
 * rows hold three (five when they play both roles), which for a support in a hundred teams are rarely the ones an
 * account has; so the rows of every other resonator's brief count too, and each row's alternates as teams of their own.
 * `share` is the subject's part where the row is theirs, null where it is another resonator's.
 */
export function teamsWith(file: Pick<KitsFile, "builds" | "kits">, cost: string, subject: string, inApp: InApp): KitTeam[] {
  const seen = new Set<string>();
  const out: KitTeam[] = [];
  const push = (team: KitTeam): void => {
    if (!team.members.some((m) => m.name === subject) || !team.members.every((m) => inApp(m.appKey))) return;
    const id = team.members
      .map((m) => m.label)
      .sort()
      .join("+");
    if (seen.has(id)) return;
    seen.add(id);
    out.push(team);
  };
  // their own rows first, so a team listed under two briefs keeps the row that knows their part of it
  const kits = [...(file.kits[subject] ? [file.kits[subject]!] : []), ...Object.values(file.kits).filter((k) => k.name !== subject)];
  for (const kit of kits) {
    const own = kit.name === subject;
    for (const fact of kit.best[cost] ?? []) {
      const team = teamOf(file, fact);
      if (!team) continue;
      const flex = fact.flex ?? -1;
      push({ ...team, share: own ? team.share : null, alts: own ? team.alts.filter((a) => inApp(a.member.appKey)) : [], flex: own ? team.flex : null });
      // each alternate is the same team with another sustain support in the flex slot, at its own DPS
      for (const [build, dps, share] of fact.alts ?? []) {
        const member = memberOf(file, build, false);
        if (!member || flex < 0 || !team.members[flex]) continue;
        push({ members: team.members.map((m, slot) => (slot === flex ? { ...member, main: m.main } : m)), dps, share: own ? share : null, seconds: null, flex: null, alts: [], insteadOf: null });
      }
    }
  }
  return out.sort((a, b) => b.dps - a.dps);
}

/** Every Team Cost of the table with the teams the app can field, in his menu order. */
export function teamsByCost(file: KitsFile, kit: Kit, inApp: InApp): Array<{ cost: string; label: string; means: string; teams: KitTeam[] }> {
  return file._meta.costs.map((c) => ({ cost: c.key, label: costLabel(c.key), means: c.means, teams: fieldableTeams(file, kit.best[c.key], inApp) }));
}

/**
 * The Team Cost of his table nearest to an account's own state. For a resonator he fields as a main DPS: the tier that
 * runs one main DPS at S6 (on an R5 signature when the account's weapon is R5), S3 or S2; otherwise, and below S2,
 * S0R1, his default view. The figure is still his standard builds': the tier only puts the sequence nearer.
 */
export function nearestCost(kit: Pick<Kit, "teams" | "best">, sequence: number, refinement: number): string {
  const want = !kit.teams.main ? "s0r1" : sequence >= 6 ? (refinement >= 5 ? "s6r5mdps" : "s6r1mdps") : sequence >= 3 ? "s3r1mdps" : sequence >= 2 ? "s2r1mdps" : "s0r1";
  return kit.best[want]?.length ? want : "s0r1";
}

/** The main DPS of a team for its label: the subject when they are one, else his last main-DPS slot. */
export function mainOf(team: KitTeam, subject?: string): KitMember | null {
  const mains = team.members.filter((m) => m.main);
  return mains.find((m) => m.name === subject) ?? mains.at(-1) ?? null;
}

// --------------------------------------------------------------------------------- Team Costs and links

/** His Team Cost → the `/rankings` hash code (vendor/wuwa_calc page/model.ts `COST_CODE`); "" is his default view. */
export const COST_CODE: Record<string, string> = {
  s0r0: "r0",
  s0r1mdps: "r1m",
  s0r1: "",
  s2r1mdps: "s2m",
  s3r1mdps: "s3m",
  s6r1mdps: "s6m",
  s6r1mdps_s2r1: "s6ms2",
  s6r5mdps: "s6r5m",
  s6r5: "s6r5",
};

/** "S0R1 all", "S6R1 DPS · R1 supports": the chip the /rankings bar shows for a Team Cost. */
export function costLabel(cost: string): string {
  const code = COST_CODE[cost];
  return (code === undefined ? null : RILEY_TIERS.find((t) => t.code === code)?.label) ?? cost;
}

/** `/rankings` at one of his Team Costs, on the teams that field all of these resonators (his names). */
export function rankingsPath(cost: string, rileyNames: readonly string[]): string {
  const code = COST_CODE[cost];
  const parts = [...(code ? [`tc=${code}`] : []), ...(rileyNames.length ? [`r=${rileyNames.map((n) => encodeURIComponent(n.replace(/ /g, ""))).join(",")}`] : [])];
  return `/rankings${parts.length ? `#${parts.join("&")}` : ""}`;
}

// ------------------------------------------------------------------------------------------- templates

const list = (items: readonly string[], last = "and"): string =>
  items.length <= 1 ? (items[0] ?? "") : items.length === 2 ? `${items[0]} ${last} ${items[1]}` : `${items.slice(0, -1).join(", ")} ${last} ${items.at(-1)}`;
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** What they do in a team, from how his table fields them. */
export function roleText(kit: Pick<Kit, "teams" | "sustain">, name: string, sustain: readonly string[] = []): string[] {
  const { main, support } = kit.teams;
  const out: string[] = [];
  if (main && !support) out.push(`${name} is a main DPS: the damage dealer in all ${plural(main, "team")} Riley's table fields them in.`);
  else if (support && !main) out.push(`${name} is a support in all ${plural(support, "team")} Riley's table fields them in, never the main DPS.`);
  else if (main && support) out.push(`${name} plays both ways on Riley's table: the main DPS in ${plural(main, "team")} and a support in ${support}.`);
  if (kit.sustain && sustain.length > 1) out.push(`One of his ${sustain.length} sustain supports (${list(sustain)}): any of them can take that slot, and each team below lists the others' figures.`);
  return out;
}

const SCALING_WORDS: Record<string, string> = { ATK: "ATK", HP: "HP", DEF: "DEF", DOT: "negative-status ticks", FIXED: "fixed damage", TUNE: "Tune Break damage" };
const shares = (rows: ReadonlyArray<[string, number]>, words: Record<string, string> = {}): string => rows.map(([label, pct]) => `${words[label] ?? label} ${pct}%`).join(" · ");

/** Where their damage comes from: the damage types, what it scales on, and their part of the team's damage. */
export function mixText(kit: Pick<Kit, "mix">, name: string): string[] {
  const mix = kit.mix;
  if (!mix) return [];
  return [
    ...(mix.types.length ? [`Where ${name}'s own damage comes from, in their best ${costLabel(mix.cost)} team: ${shares(mix.types)}.`] : []),
    ...(mix.scaling.length ? [`It scales on: ${shares(mix.scaling, SCALING_WORDS)}.`] : []),
    `${name} deals ${mix.share}% of that team's damage.`,
  ];
}

/** "4-cost Crit DMG · 3-cost ATK% + Fusion DMG · 1-cost ATK% ×2" */
export function mainstatText(slots: readonly MainstatSlot[]): string {
  const byCost = new Map<number, string[]>();
  for (const [cost, stat] of slots) byCost.set(cost, [...(byCost.get(cost) ?? []), stat]);
  return [...byCost.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([cost, stats]) => {
      const counts = new Map<string, number>();
      for (const s of stats) counts.set(s, (counts.get(s) ?? 0) + 1);
      return `${cost}-cost ${[...counts].map(([s, n]) => (n > 1 ? `${s} ×${n}` : s)).join(" + ")}`;
    })
    .join(" · ");
}

const WEAPON_KIND: Record<string, string> = { Limited: "signature", Standard: "standard 5★", Free: "4★" };
export const weaponKindLabel = (kind: string): string => WEAPON_KIND[kind] ?? kind;

/** "Sigillum in the main slot, Trailblazing Star 5pc" */
export const echoText = (echo: { main: string; sets: readonly string[] }): string => `${echo.main} in the main slot, ${echo.sets.join(" + ")}`;

/** The Energy Regen line of a loadout's pick: what the run asked for and how the standard spread meets it. */
export function energyText(loadout: Pick<KitLoadout, "pick" | "erRolls" | "minEr">, erRoll: number): string {
  const pick = loadout.pick;
  if (!loadout.erRolls.length) return "The Liberation costs no energy, so no Energy Regen is needed.";
  const floor = loadout.minEr ? ` The kit itself wants at least ${loadout.minEr}% on the character screen.` : "";
  if (pick?.erNeed == null) return `Riley's spread carries ${loadout.erRolls.join(" to ")} Energy Regen substat rolls as the loop needs.${floor}`;
  return `About ${pick.erNeed}% Energy Regen in that team (100% is the base), met with ${plural(pick.erRolls ?? 0, "ER substat roll")} of ${erRoll}% each.${floor}`;
}

/** The loop a build presses at a sequence: the highest level at or below it that the table holds a loop for. */
export function loopAt(loadout: Pick<KitLoadout, "loops" | "minSequence">, sequence: number): { level: number; casts: string[] } | null {
  const levels = Object.keys(loadout.loops)
    .map(Number)
    .sort((a, b) => a - b);
  if (!levels.length) return null;
  const at = levels.filter((n) => n <= Math.max(sequence, loadout.minSequence)).at(-1) ?? levels[0]!;
  return { level: at, casts: loadout.loops[String(at)] ?? [] };
}

/** "Basic - Aemeath 3 ×2, then Liberation - Overdrive, …": the loop as one sentence (a cast pressed once loses its ×1). */
export const loopSentence = (casts: readonly string[]): string => casts.map((c) => c.replace(/ ×1$/, "")).join(", then ");

export const CHANGE_WORDS: Record<LoopChangeKind, { short: string; long: string }> = {
  loop: { short: "new loop", long: "switches the loop: other buttons from here on" },
  order: { short: "new order", long: "reorders the loop: the same casts in another order" },
  chain: { short: "new opener", long: "changes only the opener or the first visit: the loop itself stays the same" },
};

/**
 * A name for each loadout of a kit that tells it from the others. His labels name the Resonance Mode where there is
 * one ("Aemeath (Burst)"); builds that share a label are told apart by the role they are fielded in, then by their
 * echo set, then numbered, the build with the most teams first (the order the table lists them in).
 */
export function loadoutTitles(loadouts: ReadonlyArray<Pick<KitLoadout, "label" | "main" | "support" | "echoes">>): string[] {
  const role = (l: Pick<KitLoadout, "main" | "support">): string => (l.main && !l.support ? "main DPS build" : l.support && !l.main ? "support build" : "either role");
  const sets = (l: Pick<KitLoadout, "echoes">): string => l.echoes[0]?.sets.join(" + ") ?? "";
  const titles = loadouts.map((l) => l.label);
  const split = (qualify: (l: (typeof loadouts)[number]) => string): void => {
    const groups = new Map<string, number[]>();
    titles.forEach((t, i) => groups.set(t, [...(groups.get(t) ?? []), i]));
    for (const members of groups.values()) {
      if (members.length < 2 || new Set(members.map((i) => qualify(loadouts[i]!))).size < 2) continue;
      for (const i of members) titles[i] = `${titles[i]}, ${qualify(loadouts[i]!)}`;
    }
  };
  split(role);
  split(sets);
  const groups = new Map<string, number[]>();
  titles.forEach((t, i) => groups.set(t, [...(groups.get(t) ?? []), i]));
  for (const members of groups.values()) if (members.length > 1) members.forEach((i, n) => (titles[i] = `${titles[i]}, rotation ${n + 1}`));
  return titles;
}

export interface LoopChange {
  level: number;
  kind: LoopChangeKind;
  /** "S6 switches the loop: other buttons from here on" */
  text: string;
  /** what it adds and drops as his table lists it, per loadout; `loadouts` is empty where every loadout changes alike */
  details: Array<{ loadouts: string[]; detail: string }>;
}

/** Every level at which a sequence changes how they are played, lowest first: one entry per level and kind of change. */
export function loopChanges(kit: Pick<Kit, "loadouts">): LoopChange[] {
  const titles = loadoutTitles(kit.loadouts);
  const out: LoopChange[] = [];
  kit.loadouts.forEach((l, n) => {
    for (const c of l.changes) {
      const detail = [c.added.length ? `adds ${c.added.join(", ")}` : "", c.removed.length ? `drops ${c.removed.join(", ")}` : "", c.note ?? ""].filter(Boolean).join("; ");
      let entry = out.find((o) => o.level === c.level && o.kind === c.kind);
      if (!entry) out.push((entry = { level: c.level, kind: c.kind, text: `S${c.level} ${CHANGE_WORDS[c.kind].long}`, details: [] }));
      const same = entry.details.find((d) => d.detail === detail);
      if (same) same.loadouts.push(titles[n]!);
      else entry.details.push({ loadouts: [titles[n]!], detail });
    }
  });
  for (const o of out) for (const d of o.details) if (d.loadouts.length === kit.loadouts.length) d.loadouts = [];
  return out.sort((x, y) => x.level - y.level);
}

/** The loadouts a change is for, or "" when every loadout has it. */
export function changeScope(change: LoopChange): string {
  return change.details.some((d) => !d.loadouts.length) ? "" : [...new Set(change.details.flatMap((d) => d.loadouts))].join("; ");
}

/** Loadouts with no loop below a sequence ("Roccia's main-DPS build needs S6"). */
export function lateLoadouts(kit: Pick<Kit, "loadouts">): Array<{ title: string; minSequence: number }> {
  const titles = loadoutTitles(kit.loadouts);
  return kit.loadouts.flatMap((l, n) => (l.minSequence > 0 ? [{ title: titles[n]!, minSequence: l.minSequence }] : []));
}

export interface LadderStep {
  level: number;
  dps: number;
  /** over the level below, as a fraction; null on the first row */
  step: number | null;
  /** over the first row */
  total: number | null;
  erNeed: number | null;
  short: boolean;
}

/** The sequence ladder with what each level adds over the one below and over the first. */
export function ladderSteps(ladder: Pick<KitLadder, "seq"> | null): LadderStep[] {
  const seq = ladder?.seq ?? [];
  const base = seq[0]?.dps ?? 0;
  return seq.map((s, i) => ({
    level: s.level,
    dps: s.dps,
    step: i && seq[i - 1]!.dps ? (s.dps - seq[i - 1]!.dps) / seq[i - 1]!.dps : null,
    total: i && base ? (s.dps - base) / base : null,
    erNeed: s.erNeed ?? null,
    short: Boolean(s.short),
  }));
}

export interface WeaponStep {
  weapon: string;
  kind: string;
  rank: number;
  dps: number;
  /** against the best weapon of the list, as a fraction (0 for the best) */
  vsBest: number;
}

/** The listed weapons at their lowest modelled rank, best first. */
export function weaponSteps(ladder: Pick<KitLadder, "weapons"> | null): WeaponStep[] {
  const rows = [...(ladder?.weapons ?? [])].sort((a, b) => b.dps - a.dps);
  const top = rows[0]?.dps ?? 0;
  return rows.map((w) => ({ weapon: w.weapon, kind: w.kind, rank: w.rank, dps: w.dps, vsBest: top ? (w.dps - top) / top : 0 }));
}

/** What the held weapon's ranks add over its first, as fractions. */
export function rankSteps(ladder: Pick<KitLadder, "ranks"> | null): Array<{ rank: number; dps: number; total: number | null }> {
  const rows = ladder?.ranks ?? [];
  const base = rows[0]?.dps ?? 0;
  return rows.map((r, i) => ({ rank: r.rank, dps: r.dps, total: i && base ? (r.dps - base) / base : null }));
}

/** "+5.1%", "-11.9%", "no change": a change in team DPS, signed (the app's own style, myRankings/format.ts `pct`). */
export function signedPercent(fraction: number | null): string {
  if (fraction == null) return "";
  const pct = fraction * 100;
  if (Math.abs(pct) < 0.05) return "no change";
  return `${pct > 0 ? "+" : "-"}${Math.abs(pct).toFixed(1)}%`;
}

/** "89,277" team DPS as a short figure: "89.3K", "100K", "1.20M". */
export function dpsText(dps: number): string {
  const a = Math.abs(dps);
  if (a >= 999_500) return `${(dps / 1e6).toFixed(2)}M`;
  if (a >= 99_950) return `${Math.round(dps / 1e3)}K`;
  if (a >= 1e4) return `${(dps / 1e3).toFixed(1)}K`;
  return Math.round(dps).toLocaleString("en-US");
}

/** The line under every table of figures: whose they are, on what, and in which unit. */
export function basisText(meta: KitsFile["_meta"]): string {
  return `Every figure here is wuwa_calc's (Riley31415's engine), in DPS: team damage per second over four rotations, on his standard builds (${meta.basis}). They are not your account's numbers.`;
}
