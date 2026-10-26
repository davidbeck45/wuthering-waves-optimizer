// Wuthering Tools+ — what the /account dashboard shows, kept out of the components so it is testable: one card per
// character in the calculator (Account State + the roster ranking + upstream's Build Score + the investment plan),
// the roster filters and sorts, and the hero's KPIs. Pure.
import type { AccountState } from "./accountState";
import type { RosterRanking } from "../myRankings/rankRoster";
import { dedupeTeams, type TeamRow } from "../myRankings/rows";
import { MIN_GAIN, type InvestItem } from "./investPlan";
import { buildScoreOf, equippedEchoCount, type BuildScore } from "./buildScore";
import { characterDisplayName, characterMeta } from "../display/names";

export type BuildStatus = "built" | "partial" | "no-echoes" | "no-weapon";

export const BUILD_STATUS_LABELS: Record<BuildStatus, string> = {
  built: "Built",
  partial: "Echoes missing",
  "no-echoes": "No echoes",
  "no-weapon": "No weapon",
};

export interface RosterCard {
  id: string;
  name: string;
  element: string | null;
  rarity: number;
  /** the roster's weapon type: Sword, Broadblade, Pistol, Gauntlet, Rectifier */
  weaponType: string | null;
  /** set up = a weapon equipped (the Account State's `owned`, the bar the rankings set) */
  owned: boolean;
  sequence: number;
  refinement: number;
  weapon: string | null;
  /** echo slots filled, 0–5 */
  echoes: number;
  status: BuildStatus;
  /** upstream's Build Score (average Substat Score of the equipped echoes) */
  score: BuildScore | null;
  /** the best rotation's average damage per rotation (null until ranked, or when nothing could be scored) */
  damage: number | null;
  dps: number | null;
  rotation: string | null;
  /** 1 = the highest best-rotation damage on the account */
  damageRank: number | null;
  /** the headline investment (headlineUpgrade): by team gain when the character can field a team, else own gain */
  upgrade: InvestItem | null;
  /** investments the plan found for this character (an upgrade can be null while this is not: none lifts the team) */
  investments: number;
  /** teams the character can field (every member armed), deduplicated, strongest first */
  teams: TeamRow[];
  favorite: boolean;
}

export function buildStatusOf(owned: boolean, echoes: number): BuildStatus {
  if (!owned) return "no-weapon";
  if (echoes >= 5) return "built";
  return echoes > 0 ? "partial" : "no-echoes";
}

/** A character's headline investment: the one that lifts their strongest fieldable team most when any item carries a
 *  team figure (a support's own damage says little — a healer's weapon swap read +58 % own and +0.3 % team on David's
 *  account), else the one that lifts their own best rotation most. */
export function headlineUpgrade(items: InvestItem[]): InvestItem | null {
  const withTeam = items.filter((i) => i.team);
  const pool = withTeam.length ? withTeam : items;
  const key = (i: InvestItem): number => (withTeam.length ? i.team!.gain : i.gain);
  let best: InvestItem | null = null;
  for (const i of pool) if (!best || key(i) > key(best) || (key(i) === key(best) && i.gain > best.gain)) best = i;
  // a team figure exists but no single step lifts that team: say nothing rather than headline "+0.0 %"
  return best && key(best) >= MIN_GAIN ? best : null;
}

/** Fieldable ranked teams (every member armed), identical rows folded together, strongest first. */
export function fieldableTeams(ranking: Pick<RosterRanking, "teams"> | null | undefined): TeamRow[] {
  if (!ranking) return [];
  return dedupeTeams(ranking.teams.filter((t) => !t.unarmed.length)).sort((a, b) => b.avgDamage - a.avgDamage);
}

export interface RosterInputs {
  state: AccountState;
  characters: Record<string, Record<string, any>>;
  inventoryEchoes: any[];
  ranking: RosterRanking | null;
  plan: InvestItem[] | null;
  favorites?: string[];
}

/** One card per character the calculator knows (keys the app does not list are left out). */
export function rosterCards({ state, characters, inventoryEchoes, ranking, plan, favorites = [] }: RosterInputs): RosterCard[] {
  const ranks = new Map((ranking?.characters ?? []).map((c) => [c.id, c]));
  const order = [...(ranking?.characters ?? [])].filter((c) => c.best).sort((a, b) => (b.best?.avgDamage ?? 0) - (a.best?.avgDamage ?? 0));
  const damageRank = new Map(order.map((c, i) => [c.id, i + 1]));
  const teams = fieldableTeams(ranking);
  const byCharacter = new Map<string, InvestItem[]>();
  for (const item of plan ?? []) byCharacter.set(item.characterId, [...(byCharacter.get(item.characterId) ?? []), item]);
  const out: RosterCard[] = [];
  for (const c of Object.values(state.characters)) {
    const meta = characterMeta(c.key);
    if (!meta) continue;
    const data = characters[c.key];
    const echoes = equippedEchoCount(data);
    const rank = ranks.get(c.key);
    out.push({
      id: c.key,
      name: characterDisplayName(c.key) || c.key,
      element: meta.element,
      rarity: meta.rarity,
      weaponType: meta.weapon,
      owned: c.owned,
      sequence: c.sequence,
      refinement: c.refinement,
      weapon: c.weapon,
      echoes,
      status: buildStatusOf(c.owned, echoes),
      score: buildScoreOf(c.key, data, inventoryEchoes),
      damage: rank?.best?.avgDamage ?? null,
      dps: rank?.best?.dps ?? null,
      rotation: rank?.best?.name ?? null,
      damageRank: damageRank.get(c.key) ?? null,
      upgrade: headlineUpgrade(byCharacter.get(c.key) ?? []),
      investments: byCharacter.get(c.key)?.length ?? 0,
      teams: teams.filter((t) => t.characterIds.includes(c.key)),
      favorite: favorites.includes(c.key),
    });
  }
  return out;
}

export type BuildFilter = "all" | "built" | "unbuilt";
export type OwnedFilter = "owned" | "all";
export interface RosterFilter {
  /** elements to show; empty = every element */
  elements: string[];
  build: BuildFilter;
  owned: OwnedFilter;
}
export const DEFAULT_FILTER: RosterFilter = { elements: [], build: "all", owned: "owned" };

export function filterCards(cards: RosterCard[], f: RosterFilter): RosterCard[] {
  return cards.filter(
    (c) =>
      (f.owned === "all" || c.owned) &&
      (!f.elements.length || (c.element !== null && f.elements.includes(c.element))) &&
      (f.build === "all" || (f.build === "built" ? c.status === "built" : c.status !== "built")),
  );
}

export type RosterSortKey = "damage" | "sequence" | "score" | "name";
export const ROSTER_SORTS: Array<{ key: RosterSortKey; label: string }> = [
  { key: "damage", label: "Damage" },
  { key: "sequence", label: "Sequence" },
  { key: "score", label: "Build Score" },
  { key: "name", label: "Name" },
];

const damageKey = (c: RosterCard): number => c.damage ?? -1;

/** A sorted copy: damage, sequence (then refinement) and Build Score best first, names A–Z; ties fall back to
 *  damage, then the name, so the grid never jitters. Characters that are not set up sort after the set-up ones. */
export function sortCards(cards: RosterCard[], key: RosterSortKey): RosterCard[] {
  const primary = (a: RosterCard, b: RosterCard): number => {
    if (key === "name") return a.name.localeCompare(b.name);
    if (key === "sequence") return b.sequence - a.sequence || b.refinement - a.refinement;
    if (key === "score") return (b.score?.percent ?? -1) - (a.score?.percent ?? -1);
    return damageKey(b) - damageKey(a);
  };
  return [...cards].sort((a, b) => Number(b.owned) - Number(a.owned) || primary(a, b) || damageKey(b) - damageKey(a) || a.name.localeCompare(b.name));
}

export interface AccountKpis {
  /** characters the calculator holds data for, and how many are set up (armed) */
  characters: number;
  owned: number;
  built: number;
  s6: number;
  r5: number;
  echoes: { total: number; equipped: number };
  /** your own saved teams, and how many of them are fieldable */
  teams: number;
  teamsFieldable: number;
  /** every team the roster can field — yours and the presets, identical rows folded (null before ranking) */
  fieldable: number | null;
  bestTeam: TeamRow | null;
  strongest: RosterCard | null;
  /** the average Build Score over the characters wearing echoes */
  averageScore: number | null;
}

export function accountKpis(state: AccountState, cards: RosterCard[], ranking: Pick<RosterRanking, "teams"> | null): AccountKpis {
  const owned = cards.filter((c) => c.owned);
  const teams = ranking ? fieldableTeams(ranking) : null;
  const scored = owned.filter((c) => c.score);
  const strongest = [...owned].filter((c) => c.damage !== null).sort((a, b) => damageKey(b) - damageKey(a))[0] ?? null;
  return {
    characters: cards.length,
    owned: owned.length,
    built: owned.filter((c) => c.status === "built").length,
    s6: owned.filter((c) => c.sequence >= 6).length,
    r5: owned.filter((c) => c.refinement >= 5).length,
    echoes: state.echoes,
    teams: state.summary.teams,
    teamsFieldable: state.summary.teamsFieldable,
    fieldable: teams ? teams.length : null,
    bestTeam: teams?.[0] ?? null,
    strongest,
    averageScore: scored.length ? scored.reduce((n, c) => n + c.score!.percent, 0) / scored.length : null,
  };
}

export interface AccountPrefs {
  filter: RosterFilter;
  sort: RosterSortKey;
  /** the investment list's order: own damage or the team's */
  investBy: "own" | "team";
}
export const DEFAULT_PREFS: AccountPrefs = { filter: DEFAULT_FILTER, sort: "damage", investBy: "team" };
export const PREFS_KEY = "wtplus:account:prefs";

/** Preferences from storage, every field validated (junk falls back to the default). */
export function readAccountPrefs(raw: string | null): AccountPrefs {
  try {
    const p = JSON.parse(raw ?? "null") as Partial<AccountPrefs> | null;
    const f = (p?.filter ?? {}) as Partial<RosterFilter>;
    const elements = Array.isArray(f.elements) ? f.elements.filter((e): e is string => typeof e === "string") : [];
    return {
      filter: {
        elements,
        build: f.build === "built" || f.build === "unbuilt" ? f.build : "all",
        owned: f.owned === "all" ? "all" : "owned",
      },
      sort: ROSTER_SORTS.some((s) => s.key === p?.sort) ? (p!.sort as RosterSortKey) : DEFAULT_PREFS.sort,
      investBy: p?.investBy === "own" ? "own" : "team",
    };
  } catch {
    return DEFAULT_PREFS;
  }
}
