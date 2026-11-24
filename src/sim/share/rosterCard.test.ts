// Wuthering Tools+: the "My roster" share card's model — tiles from the account page's roster cards, the sort, the
// column steps, the hidden fields, the teams strip with and without a ranking result.
import { describe, expect, it } from "vitest";
import type { RosterCard } from "../account/accountView";
import type { RosterRanking, TeamRank } from "../myRankings/rankRoster";
import { DEFAULT_ROSTER_OPTIONS, rosterAltText, rosterCardModel, rosterFilename, rosterGrid, rosterTeams } from "./rosterCard";

function card(id: string, over: Partial<RosterCard> = {}): RosterCard {
  return {
    id,
    name: id,
    element: "Spectro",
    rarity: 5,
    weaponType: "Sword",
    owned: true,
    sequence: 0,
    refinement: 1,
    weapon: "EmeraldOfGenesis",
    echoes: 5,
    status: "built",
    score: { percent: 71.6, grade: "A", color: "green" as any, provisional: false, echoes: 5 },
    damage: null,
    dps: null,
    range: null,
    rotation: null,
    damageRank: null,
    upgrade: null,
    investments: 0,
    teams: [],
    favorite: false,
    ...over,
  };
}

const team = (ids: string[], avgDamage: number, over: Partial<TeamRank> = {}): TeamRank => ({
  id: ids.join("+"),
  name: "",
  source: "yours",
  characterIds: ids,
  avgDamage,
  perSlot: [avgDamage / 2, avgDamage / 4, avgDamage / 4],
  dps: avgDamage / 20,
  unarmed: [],
  ...over,
});

const ranking = (teams: TeamRank[], over: Partial<RosterRanking> = {}): RosterRanking =>
  ({ enemy: {} as any, characters: [], teams, teamsSkipped: 0, computedAt: "2026-11-23T12:00:00Z", ...over }) as RosterRanking;

const many = (n: number): RosterCard[] => Array.from({ length: n }, (_, i) => card(`C${String(i + 1).padStart(2, "0")}`, { rarity: i % 3 ? 5 : 4 }));

describe("roster card model", () => {
  it("draws one tile per set-up character, in My account's default order (damage, best first; unscored by name)", () => {
    const cards = [
      card("Bravo", { damage: 200 }),
      card("Alpha"),
      card("Charlie", { damage: 900 }),
      card("Unarmed", { owned: false, weapon: null, damage: null }),
      card("Delta", { sequence: 6 }),
    ];
    const m = rosterCardModel({ cards, characters: { Charlie: { characterLevel: "90" } }, ranking: null });
    expect(m.tiles.map((t) => t.id)).toEqual(["Charlie", "Bravo", "Alpha", "Delta"]);
    expect(m.tiles[0].level).toBe(90);
    expect(m.tiles[1].level).toBeNull(); // the account holds no level
    expect(m.tiles[0].weapon).toEqual({ key: "EmeraldOfGenesis", name: expect.any(String), rarity: expect.any(Number), rank: 1 });
    expect(m.tiles[0].score).toEqual({ grade: "A", percent: 72, provisional: false });
    expect(m.tiles[3].sequence).toBe(6);
  });

  it("steps the columns by count and never shrinks below 68 px portraits", () => {
    expect(rosterGrid(1)).toEqual({ columns: 2, portrait: 112 });
    expect(rosterGrid(4).columns).toBe(2);
    expect(rosterGrid(8)).toEqual({ columns: 3, portrait: 96 });
    expect(rosterGrid(12).columns).toBe(3);
    expect(rosterGrid(13).columns).toBe(4);
    expect(rosterGrid(24)).toEqual({ columns: 4, portrait: 80 });
    expect(rosterGrid(40)).toEqual({ columns: 5, portrait: 68 });
    expect(rosterCardModel({ cards: many(40), characters: {}, ranking: null }).grid.columns).toBe(5);
    expect(rosterCardModel({ cards: many(1), characters: {}, ranking: null }).tiles).toHaveLength(1);
  });

  it("hides Build Scores, the teams strip and 4-stars when asked", () => {
    const r = ranking([team(["C01", "C02", "C03"], 1e6)]);
    const m = rosterCardModel({ cards: many(9), characters: {}, ranking: r }, { showScores: false, showTeams: false, includeFourStars: false, title: "  Main  " });
    expect(m.showScores).toBe(false);
    expect(m.teamsState).toBe("hidden");
    expect(m.teams).toEqual([]);
    expect(m.tiles.every((t) => t.rarity === 5)).toBe(true);
    expect(m.counts).toEqual({ total: 6, fiveStars: 6, fourStars: 0 });
    expect(m.title).toBe("Main");
  });

  it("takes the top three fieldable teams from the ranking, strongest first, one row per trio", () => {
    const r = ranking([
      team(["A", "B", "C"], 1_000_000),
      team(["A", "B", "D"], 3_000_000),
      team(["A", "C", "B"], 1_000_000, { source: "curated" }), // the same row as a stock preset: folded
      team(["E", "F", "G"], 9_000_000, { unarmed: ["G"] }), // not fieldable
      team(["B", "C", "D"], 2_000_000),
      team(["C", "D", "E"], 500_000),
      team(["D", "B", "A"], 2_500_000, { name: "another rotation" }), // the same trio as the strongest: left out
    ]);
    const { state, teams } = rosterTeams(r);
    expect(state).toBe("teams");
    expect(teams.map((t) => t.avgDamage)).toEqual([3_000_000, 2_000_000, 1_000_000]);
    expect(teams[0].characterIds).toEqual(["A", "B", "D"]);
    expect(teams[0].name.length).toBeGreaterThan(0);
  });

  it("shows no team figure without a complete ranking result", () => {
    expect(rosterTeams(null)).toEqual({ state: "no-ranking", teams: [] });
    expect(rosterTeams(ranking([team(["A", "B", "C"], 1e6)], { incomplete: true }))).toEqual({ state: "no-ranking", teams: [] });
    expect(rosterTeams(ranking([]))).toEqual({ state: "none", teams: [] });
    expect(rosterCardModel({ cards: many(3), characters: {}, ranking: null }, DEFAULT_ROSTER_OPTIONS).teamsState).toBe("no-ranking");
  });

  it("says what is on the card in one sentence, and names the file by date", () => {
    const m = rosterCardModel({ cards: many(8), characters: {}, ranking: ranking([team(["C01", "C02", "C03"], 1_234_567)]) });
    const alt = rosterAltText(m);
    expect(alt).toMatch(/^Roster card with 8 resonators \(5 five-star, 3 four-star\)/);
    expect(alt).toContain("1.23M damage per rotation");
    expect(rosterFilename(new Date(2026, 10, 3, 12))).toBe("my-roster-2026-11-03-wtplus.png");
  });
});
