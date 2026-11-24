// Wuthering Tools+ share cards — "My roster": what the third card shows, built from what My account already reads
// (accountView.ts rosterCards + fieldableTeams over the roster ranking). Pure: no stores, no DOM, so the tests and the
// sheet read the same model. The card carries no data to load back (it is a picture only).
import type { RosterRanking, TeamRank } from "../myRankings/rankRoster";
import { parsePresetName } from "../presets/presetName";
import { fieldableTeams, sortCards, type RosterCard } from "../account/accountView";
import { characterMeta, weaponDisplayName, weaponMeta } from "../display/names";
import { teamTitle } from "../display/teamName";
import { compact } from "../myRankings/format";

/** The card's design width (px). Its height follows the tile count: the card grows rather than shrinking its type. */
export const ROSTER_CARD_WIDTH = 1080;

export interface RosterTile {
  id: string;
  name: string;
  element: string | null;
  /** 5 or 4 — drawn as a "5★" / "4★" label as well as the ring colour */
  rarity: number;
  sequence: number;
  weapon: { key: string; name: string; rarity: number; rank: number } | null;
  /** the account's character level when it holds one (the calculator's `characterLevel`) */
  level: number | null;
  /** upstream's Build Score, as the roster card on My account prints it */
  score: { grade: string; percent: number; provisional: boolean } | null;
}

export interface RosterTeam {
  name: string;
  characterIds: string[];
  /** average damage per rotation, the figure My account prints for the team */
  avgDamage: number;
  dps: number | null;
}

export interface RosterGrid {
  columns: number;
  /** portrait size in px at that column count */
  portrait: number;
}

export interface RosterOptions {
  showScores: boolean;
  showTeams: boolean;
  includeFourStars: boolean;
  title: string;
}

export const DEFAULT_ROSTER_OPTIONS: RosterOptions = { showScores: true, showTeams: true, includeFourStars: true, title: "" };

export interface RosterCardModel {
  title: string;
  tiles: RosterTile[];
  grid: RosterGrid;
  showScores: boolean;
  /** "teams": the strip is drawn; "none": the account fields no team; "no-ranking": no complete ranking result in
   *  this tab or browser yet (the card says to open My account); "hidden": switched off */
  teamsState: "teams" | "none" | "no-ranking" | "hidden";
  teams: RosterTeam[];
  /** counts for the text alternative */
  counts: { total: number; fiveStars: number; fourStars: number };
}

/**
 * Column steps by tile count. The type size stays fixed (readable on a phone); more tiles mean more columns up to five,
 * then more rows (the card grows taller). 1–4 → 2 columns, 5–12 → 3, 13–24 → 4, 25+ → 5.
 */
export function rosterGrid(count: number): RosterGrid {
  if (count <= 4) return { columns: 2, portrait: 112 };
  if (count <= 12) return { columns: 3, portrait: 96 };
  if (count <= 24) return { columns: 4, portrait: 80 };
  return { columns: 5, portrait: 68 };
}

const levelOf = (data: Record<string, any> | undefined): number | null => {
  const n = Number(data?.characterLevel);
  return Number.isFinite(n) && n >= 1 && n <= 100 ? Math.round(n) : null;
};

/** One tile per set-up character (a weapon equipped), in My account's default order (damage, best first; the
 *  characters with no scored rotation after them, by name). */
export function rosterTiles(cards: RosterCard[], characters: Record<string, Record<string, any>>, includeFourStars = true): RosterTile[] {
  return sortCards(
    cards.filter((c) => c.owned && (includeFourStars || c.rarity >= 5)),
    "damage",
  ).map((c) => {
    const w = c.weapon ? weaponMeta(c.weapon) : null;
    return {
      id: c.id,
      name: c.name,
      element: c.element ?? characterMeta(c.id)?.element ?? null,
      rarity: c.rarity >= 5 ? 5 : 4,
      sequence: c.sequence,
      weapon: c.weapon ? { key: c.weapon, name: weaponDisplayName(c.weapon), rarity: w?.rarity ?? 0, rank: c.refinement } : null,
      level: levelOf(characters[c.id]),
      score: c.score ? { grade: c.score.grade, percent: Math.round(c.score.percent), provisional: c.score.provisional } : null,
    };
  });
}

/** The main DPS a team's name leads with ("Aemeath · Mornye + Lynae" → Aemeath), the way `teamTitle` / `teamLabel`
 *  read it; null for a name that does not say (a team the player named, an old stock team). */
export function teamMainDps(team: Pick<TeamRank, "name" | "characterIds">): string | null {
  const key = parsePresetName(team.name, { owned: team.characterIds }).mainKey;
  return key && team.characterIds.includes(key) ? key : null;
}

/** The best team of each of the account's three strongest main DPS, read from the same ranking result My account reads
 *  (its figures to the digit): one main DPS three times says little about a roster, and those three could never be
 *  fielded together. A team whose name names no main DPS falls back to "no trio twice". A ranking that did not fully
 *  score (`incomplete`) is treated as none: the card never shows a half-scored figure. */
export function rosterTeams(ranking: RosterRanking | null): { state: "teams" | "none" | "no-ranking"; teams: RosterTeam[] } {
  if (!ranking || ranking.incomplete) return { state: "no-ranking", teams: [] };
  const mains = new Set<string>();
  const trios = new Set<string>();
  const teams = fieldableTeams(ranking)
    .filter((t) => {
      const trio = [...t.characterIds].sort().join("+");
      if (trios.has(trio)) return false;
      const main = teamMainDps(t);
      if (main && mains.has(main)) return false;
      trios.add(trio);
      if (main) mains.add(main);
      return true;
    })
    .slice(0, 3)
    .map((t) => ({ name: teamTitle(t.name, t.characterIds) || "Team", characterIds: [...t.characterIds], avgDamage: t.avgDamage, dps: t.dps }));
  return { state: teams.length ? "teams" : "none", teams };
}

export function rosterCardModel(
  input: { cards: RosterCard[]; characters: Record<string, Record<string, any>>; ranking: RosterRanking | null },
  options: RosterOptions = DEFAULT_ROSTER_OPTIONS,
): RosterCardModel {
  const tiles = rosterTiles(input.cards, input.characters, options.includeFourStars);
  const teams = options.showTeams ? rosterTeams(input.ranking) : { state: "hidden" as const, teams: [] };
  return {
    title: options.title.trim().slice(0, 60),
    tiles,
    grid: rosterGrid(tiles.length),
    showScores: options.showScores,
    teamsState: teams.state,
    teams: teams.teams,
    counts: { total: tiles.length, fiveStars: tiles.filter((t) => t.rarity >= 5).length, fourStars: tiles.filter((t) => t.rarity < 5).length },
  };
}

/** The account page's own compact figure (the hero prints the best team with it), so the card reads the same. */
export const compactDamage = (n: number): string => (Number.isFinite(n) ? compact(n) : "—");

/** The sentence the preview gives screen readers in place of the picture. */
export function rosterAltText(model: RosterCardModel, names: (id: string) => string = (id) => id): string {
  const parts: string[] = [];
  const who = model.counts.total === 1 ? "1 resonator" : `${model.counts.total} resonators`;
  parts.push(`Roster card${model.title ? ` “${model.title}”` : ""} with ${who} (${model.counts.fiveStars} five-star, ${model.counts.fourStars} four-star)`);
  if (model.tiles.length) {
    const first = model.tiles.slice(0, 5).map((t) => `${t.name} S${t.sequence}${t.weapon ? ` with ${t.weapon.name} R${t.weapon.rank}` : ""}`);
    parts.push(`${model.tiles.length > 5 ? "starting with" : "namely"} ${first.join(", ")}`);
  }
  if (model.teamsState === "teams") {
    parts.push(`best team of the three strongest main DPS: ${model.teams.map((t) => `${t.characterIds.map(names).join(", ")} at ${compactDamage(t.avgDamage)} damage per rotation`).join("; ")}`);
  }
  return `${parts.join(", ")}.`;
}

/** "my-roster-2026-11-23-wtplus.png" */
export function rosterFilename(date: Date = new Date()): string {
  const d = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return `my-roster-${d}-wtplus.png`;
}
