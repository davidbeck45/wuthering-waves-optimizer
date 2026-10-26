// Wuthering Tools+: the /account view model — cards, filters, sorts, KPIs, preferences — and upstream's Build
// Score computed off the stores.
import { describe, expect, it } from "vitest";
import account from "../myRankings/__fixtures__/cartethyiaAccount.json";
import { accountStateOf } from "./accountState";
import { buildScoreOf, characterSubstatWeights, equippedEchoCount } from "./buildScore";
import { accountKpis, buildStatusOf, filterCards, headlineUpgrade, readAccountPrefs, rosterCards, sortCards, DEFAULT_PREFS, type RosterCard } from "./accountView";
import { getGradeForSubstatScorePercent, getSubstatScoreGrade } from "../../echoes/rating";
import type { RosterRanking, TeamRank } from "../myRankings/rankRoster";
import type { InvestItem } from "./investPlan";

const cart = JSON.parse(JSON.stringify(account.characters.Cartethyia));
const echoes = JSON.parse(JSON.stringify(account.echoes));

describe("build score", () => {
  it("is upstream's rollup: the average Substat Score of the equipped echoes on the character's weights", () => {
    const score = buildScoreOf("Cartethyia", cart, echoes)!;
    const weights = characterSubstatWeights("Cartethyia", cart);
    const percents = [0, 1, 2, 3, 4].map((i) => {
      const slot = cart.echoes[i];
      const echo = echoes.find((e: any) => e.echoId === slot.echoId) ?? slot;
      return getSubstatScoreGrade(echo, weights).percent;
    });
    const avg = percents.reduce((a, b) => a + b, 0) / 5;
    expect(score.percent).toBeCloseTo(avg, 10);
    expect(score.grade).toBe(getGradeForSubstatScorePercent(avg).grade);
    expect(score.echoes).toBe(5);
  });

  it("layers the user's overrides on the curated profile (stats it omits count 0)", () => {
    const curated = characterSubstatWeights("Cartethyia", {});
    expect(curated.ATK).toBe(0); // an HP scaler
    expect(characterSubstatWeights("Cartethyia", { substatWeights: { ATK: 2 } }).ATK).toBe(2);
    expect(characterSubstatWeights("NoSuchCharacter", {}).ATK).toBe(1); // no profile: neutral
  });

  it("reads object and array slots alike, and is provisional below five echoes", () => {
    const slots = [0, 1, 2, 3, 4].map((i) => cart.echoes[i]);
    expect(buildScoreOf("Cartethyia", { ...cart, echoes: slots }, echoes)!.percent).toBeCloseTo(buildScoreOf("Cartethyia", cart, echoes)!.percent, 10);
    expect(equippedEchoCount({ echoes: slots })).toBe(5);
    const three = { ...cart, echoes: { 0: cart.echoes[0], 1: cart.echoes[1], 2: cart.echoes[2] } };
    expect(buildScoreOf("Cartethyia", three, echoes)).toMatchObject({ echoes: 3, provisional: true });
    expect(buildScoreOf("Cartethyia", { echoes: {} }, echoes)).toBeNull();
    expect(equippedEchoCount(undefined)).toBe(0);
  });
});

const team = (id: string, ids: string[], avgDamage: number, unarmed: string[] = []): TeamRank => ({
  id,
  name: id,
  source: "wuwa_calc",
  characterIds: ids,
  avgDamage,
  perSlot: [avgDamage / 2, avgDamage / 4, avgDamage / 4],
  dps: null,
  unarmed,
});

const characters: Record<string, any> = {
  Cartethyia: cart,
  Ciaccona: { weapon: "WoodlandAria", resonanceChains: { SequenceNode1A: { isEnabled: true }, SequenceNode2B: { isEnabled: true } } },
  Chisa: { weapon: "Kumokiri", weapons: { Kumokiri: { refinement: "5" } } },
  Shorekeeper: {},
  NotAKey: { weapon: "X" },
};
const ranking = {
  characters: [
    { id: "Cartethyia", best: { name: "rot", avgDamage: 500000, dps: 20000 } },
    { id: "Ciaccona", best: { name: "rot2", avgDamage: 90000, dps: null } },
    { id: "Chisa", best: null },
  ],
  teams: [team("t1", ["Cartethyia", "Ciaccona", "Chisa"], 800000), team("t2", ["Cartethyia", "Ciaccona", "Shorekeeper"], 900000, ["Shorekeeper"]), team("t3", ["Chisa", "Ciaccona", "Cartethyia"], 800000)],
} as unknown as RosterRanking;
const item = (characterId: string, gain: number, teamGain: number | null): InvestItem =>
  ({ id: `${characterId}:${gain}`, characterId, kind: "sequence", label: "S1", from: "S0", to: "S1", rotation: "r", base: 1, avgDamage: 1 + gain, gain, team: teamGain === null ? null : { teamId: "t1", teamName: "t1", characterIds: [], base: 1, avgDamage: 1 + teamGain, gain: teamGain }, teamNote: null }) as InvestItem;

describe("roster cards", () => {
  const state = accountStateOf(characters, { echoes, equipped: { a: 1, b: 2 } }, []);
  const plan = [item("Ciaccona", 0.02, 0.09), item("Ciaccona", 0.05, 0.01), item("Cartethyia", 0.3, 0.12)];
  const cards = rosterCards({ state, characters, inventoryEchoes: echoes, ranking, plan, favorites: ["Chisa"] });
  const card = (id: string): RosterCard => cards.find((c) => c.id === id)!;

  it("makes one card per known character with its status, ranks and teams", () => {
    expect(cards.map((c) => c.id).sort()).toEqual(["Cartethyia", "Chisa", "Ciaccona", "Shorekeeper"]); // NotAKey left out
    expect(card("Cartethyia")).toMatchObject({ owned: true, status: "built", sequence: 2, damage: 500000, damageRank: 1, element: "Aero", weaponType: "Sword" });
    expect(card("Cartethyia").score?.echoes).toBe(5);
    expect(card("Ciaccona")).toMatchObject({ status: "no-echoes", sequence: 2, damageRank: 2, score: null });
    expect(card("Chisa")).toMatchObject({ refinement: 5, damage: null, damageRank: null, favorite: true });
    expect(card("Shorekeeper")).toMatchObject({ owned: false, status: "no-weapon" });
    // fieldable only (t2 has an unarmed member), identical rows folded (t1 = t3)
    expect(card("Cartethyia").teams.map((t) => t.id)).toEqual(["t1"]);
    expect(card("Cartethyia").teams[0].duplicates).toHaveLength(1);
    expect(card("Shorekeeper").teams).toEqual([]);
  });

  it("headlines the investment that lifts the team most, else the character's own damage", () => {
    expect(card("Ciaccona").upgrade?.gain).toBe(0.02); // its team +9 % beats the other's team +1 % (own +5 %)
    expect(card("Cartethyia").upgrade?.gain).toBe(0.3);
    expect(card("Chisa").upgrade).toBeNull();
    expect(headlineUpgrade([item("X", 0.04, null), item("X", 0.09, null)])?.gain).toBe(0.09); // no team: own gain
    expect(headlineUpgrade([item("X", 0.5, null), item("X", 0.01, 0.002)])?.gain).toBe(0.01); // a team figure wins
    expect(headlineUpgrade([item("X", 0.09, -0.097), item("X", 0.02, 0.0001)])).toBeNull(); // nothing lifts the team
    expect(card("Ciaccona").investments).toBe(2);
  });

  it("filters by ownership, element and build, and sorts set-up characters first", () => {
    expect(filterCards(cards, DEFAULT_PREFS.filter).map((c) => c.id).sort()).toEqual(["Cartethyia", "Chisa", "Ciaccona"]);
    expect(filterCards(cards, { elements: [], build: "all", owned: "all" })).toHaveLength(4);
    expect(filterCards(cards, { elements: ["Aero"], build: "all", owned: "owned" }).map((c) => c.id).sort()).toEqual(["Cartethyia", "Ciaccona"]);
    expect(filterCards(cards, { elements: ["Glacio"], build: "all", owned: "all" }).map((c) => c.id)).toEqual([]);
    expect(filterCards(cards, { elements: [], build: "built", owned: "owned" }).map((c) => c.id)).toEqual(["Cartethyia"]);
    expect(filterCards(cards, { elements: [], build: "unbuilt", owned: "all" }).map((c) => c.id).sort()).toEqual(["Chisa", "Ciaccona", "Shorekeeper"]);
    expect(sortCards(cards, "damage").map((c) => c.id)).toEqual(["Cartethyia", "Ciaccona", "Chisa", "Shorekeeper"]);
    expect(sortCards(cards, "name")[3].id).toBe("Shorekeeper"); // not set up: last whatever the sort
    expect(sortCards(cards, "sequence")[0].id).toBe("Cartethyia"); // S2 ties Ciaccona's S2; damage breaks it
    expect(sortCards(cards, "score")[0].id).toBe("Cartethyia");
    expect(buildStatusOf(true, 3)).toBe("partial");
  });

  it("sums the account into KPIs", () => {
    const k = accountKpis(state, cards, ranking);
    expect(k).toMatchObject({ characters: 4, owned: 3, built: 1, r5: 1, fieldable: 1, echoes: { total: echoes.length, equipped: 2 } });
    expect(k.bestTeam?.id).toBe("t1");
    expect(k.strongest?.id).toBe("Cartethyia");
    expect(k.averageScore).toBeCloseTo(card("Cartethyia").score!.percent, 10);
    expect(accountKpis(state, cards, null).fieldable).toBeNull();
  });

  it("reads preferences defensively", () => {
    expect(readAccountPrefs(null)).toEqual(DEFAULT_PREFS);
    expect(readAccountPrefs("{junk")).toEqual(DEFAULT_PREFS);
    expect(readAccountPrefs(JSON.stringify({ filter: { elements: ["Aero", 3], build: "built", owned: "all" }, sort: "name", investBy: "own" }))).toEqual({
      filter: { elements: ["Aero"], build: "built", owned: "all" },
      sort: "name",
      investBy: "own",
    });
    expect(readAccountPrefs(JSON.stringify({ sort: "nope", filter: { build: "x" } }))).toEqual(DEFAULT_PREFS);
  });
});
