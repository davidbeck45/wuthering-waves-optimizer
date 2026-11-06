// Wuthering Tools+: the /account investment plan on a real exported build (the Cartethyia fixture), with three
// armed teammates synthesised around her so a wuwa_calc team preset is fieldable and a weapon of her type is owned.
import { beforeAll, describe, expect, it } from "vitest";
import account from "../myRankings/__fixtures__/cartethyiaAccount.json";
import { rankRoster, type RosterRanking } from "../myRankings/rankRoster";
import { substatWeights, rotationScorer } from "../substats/substatWeights";
import { RANKING_ENEMY } from "../myRankings/rankRoster";
import { extractBuildFields } from "../../characters/buildFields";
import { bestFieldableTeam, investChange, investPlan, ownedWeapons, sortInvestItems, type InvestItem, type InvestPlan, erGainNote, erGapOf } from "./investPlan";
import { clearPlanMemory, planSavedUnder, readCachedPlan, writeCachedPlan } from "./investCache";

const characters: Record<string, any> = {
  ...JSON.parse(JSON.stringify(account.characters)),
  Ciaccona: { weapon: "WoodlandAria" },
  Chisa: { weapon: "Kumokiri" },
  // a sword the account owns, worn by someone else: a swap candidate for Cartethyia
  Aemeath: { weapon: "EverbrightPolestar", weapons: { EverbrightPolestar: { refinement: "5" } } },
};
const echoes = JSON.parse(JSON.stringify(account.echoes));

let ranking: RosterRanking;
let plan: InvestPlan;
const only = (r: RosterRanking): RosterRanking => ({ ...r, characters: r.characters.filter((c) => c.id === "Cartethyia") });

beforeAll(async () => {
  ranking = await rankRoster(characters, echoes, [], { investment: true, yieldToUi: false });
  plan = await investPlan(characters, echoes, [], only(ranking), { yieldToUi: false });
}, 120000);

const byKind = (kind: InvestItem["kind"]): InvestItem[] => plan.items.filter((i) => i.kind === kind);

describe("what a substat row says", () => {
  it("calls the roll it scored an average roll: +9.4 % is the mean of the tiers, not a tier the game can show (hunt 1, numbers L6)", () => {
    expect(investChange({ kind: "substat", label: "Energy Regen +9.4%", from: "an echo line", to: "one more Energy Regen roll" })).toBe("Energy Regen +9.4% on an echo (an average roll)");
  });
});

describe("investment plan", () => {
  it("says why an Energy Regen roll's own gain and team gain differ", () => {
    expect(erGapOf(1)).toBeNull();
    expect(erGapOf(0.956)).toBe(4.4);
    // with the need, read as the chips print it: 110.8 % held against a 115.14 % need is "need 115.2 % · 4.4 short"
    expect(erGapOf(1 - (115.14 - 110.8) / 100, 115.14)).toBe(4.4);
    const er = { kind: "substat" as const, substatKey: "EnergyRegen" as const, erGap: 4.4, team: { gain: 0 } as never };
    expect(erGainNote(er)).toMatch(/4\.4-point Energy Regen gap.*Team damage doesn't count Energy Regen/);
    // a roll at least the gap's size closes all of it, a smaller one part of it
    expect(erGainNote({ ...er, roll: 9.4 })).toMatch(/closes the whole 4\.4-point Energy Regen gap/);
    expect(erGainNote({ ...er, roll: 2.1 })).toMatch(/closes part of the 4\.4-point Energy Regen gap/);
    expect(erGainNote({ ...er, team: null })).not.toMatch(/Team damage/);
    expect(erGainNote({ ...er, erGap: null })).toBeNull();
    expect(erGainNote({ ...er, substatKey: "CritDMG" })).toBeNull();
  });

  it("lists the next sequence and refinements with the gains /my-rankings estimates", () => {
    const cart = ranking.characters.find((c) => c.id === "Cartethyia")!;
    expect(plan.characters).toBe(1);
    expect(plan.errors).toEqual([]);
    expect(plan.items.every((i) => i.characterId === "Cartethyia")).toBe(true);
    const [seq] = byKind("sequence");
    expect(seq.label).toBe("S3");
    expect(seq.from).toBe("S2");
    expect(seq.base).toBeCloseTo(cart.best!.avgDamage, 6);
    if (cart.nextSequence!.gain >= 0.0005) expect(seq.gain).toBeCloseTo(cart.nextSequence!.gain, 10);
    const refines = byKind("refine");
    expect(refines.map((r) => r.label)).toEqual(expect.arrayContaining(["R2", "R5"]));
    const r5 = refines.find((r) => r.label === "R5")!;
    expect(r5.gain).toBeCloseTo(cart.refineFive!.gain, 10);
    expect(r5.to).toBe("Defier's Thorn R5");
    expect(refines.find((r) => r.label === "R2")!.gain).toBeLessThan(r5.gain);
  });

  it("finds the substat roll that pays most, at the gain substatWeights gives it", async () => {
    const [roll] = byKind("substat");
    expect(roll).toBeTruthy();
    const cart = ranking.characters.find((c) => c.id === "Cartethyia")!;
    const weights = await substatWeights("Cartethyia", characters, echoes, rotationScorer("Cartethyia", cart.bestRotation!, RANKING_ENEMY));
    expect(roll.substatKey).toBe(weights.weights[0].key);
    expect(roll.gain).toBeCloseTo(weights.weights[0].gain, 10);
    expect(roll.label).toMatch(/\+\d+(\.\d)?%?$/);
    expect(["CritRate", "CritDMG", "HP"]).toContain(roll.substatKey); // an HP scaler: never ATK
  }, 120000);

  it("offers a weapon only when someone on the account wears it", () => {
    const owned = ownedWeapons(characters);
    expect(owned.get("EverbrightPolestar")).toEqual({ refinement: 5, wornBy: ["Aemeath"] });
    expect(owned.get("DefiersThorn")?.wornBy).toEqual(["Cartethyia"]);
    for (const w of byKind("weapon")) {
      expect(w.weaponKey).toBe("EverbrightPolestar"); // the only other sword
      expect(w.wornBy).toEqual(["Aemeath"]);
      expect(w.label).toBe("Everbright Polestar R5");
    }
    expect(byKind("weapon").length).toBeLessThanOrEqual(1);
  });

  it("re-scores her strongest fieldable team with the upgrade, exactly as the rankings score it", () => {
    const team = bestFieldableTeam(ranking.teams, "Cartethyia")!;
    expect(team).toBeTruthy();
    expect(team.unarmed).toEqual([]);
    for (const item of plan.items) {
      expect(item.team, item.id).not.toBeNull();
      expect(item.team!.teamId).toBe(team.id);
      expect(item.team!.base).toBeCloseTo(team.avgDamage, 6);
      expect(item.team!.gain).toBeCloseTo(item.team!.avgDamage / item.team!.base - 1, 12);
    }
    // her own damage is part of the team's, so a pure self-upgrade lifts the team by less
    const r5 = byKind("refine").find((r) => r.label === "R5")!;
    expect(r5.team!.gain).toBeGreaterThan(0);
    expect(r5.team!.gain).toBeLessThan(r5.gain);
  });

  it("skips the team figure when the team runs another saved build of hers", async () => {
    const cart = characters.Cartethyia;
    const fields = extractBuildFields(cart);
    const twoBuilds = {
      ...characters,
      Cartethyia: { ...cart, activeBuildId: "main", builds: [{ ...fields, id: "main", name: "Main" }, { ...fields, id: "duo", name: "Ciaccona + Chisa" }] },
    };
    const r = await investPlan(twoBuilds, echoes, [], only(ranking), { yieldToUi: false, substatKeys: ["CritRate"] });
    expect(r.items.length).toBeGreaterThan(0);
    for (const item of r.items) {
      expect(item.team).toBeNull();
      expect(item.teamNote).toContain('"Ciaccona + Chisa" build');
    }
  }, 120000);

  it("sorts by own or team gain and stops when cancelled", async () => {
    const own = sortInvestItems(plan.items, "own");
    for (let i = 1; i < own.length; i++) expect(own[i - 1].gain).toBeGreaterThanOrEqual(own[i].gain);
    const team = sortInvestItems(plan.items, "team");
    for (let i = 1; i < team.length; i++) expect(team[i - 1].team!.gain).toBeGreaterThanOrEqual(team[i].team!.gain);
    const stopped = await investPlan(characters, echoes, [], only(ranking), { yieldToUi: false, signal: { cancelled: true } });
    expect(stopped.cancelled).toBe(true);
    expect(stopped.items).toEqual([]);
  });

  it("caches a finished plan by the ranking fingerprint only", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    expect(writeCachedPlan("fp-1", plan, storage)).toBe(true);
    clearPlanMemory();
    expect(readCachedPlan("fp-1", storage)?.items).toHaveLength(plan.items.length);
    expect(readCachedPlan("fp-2", storage)).toBeNull();
    expect(writeCachedPlan("fp-3", { ...plan, cancelled: true }, storage)).toBe(false);
    clearPlanMemory();
    store.set("wtplus:account:invest", "{junk");
    expect(readCachedPlan("fp-1", storage)).toBeNull();
  });

  it("is saved past the tab only when it and its ranking scored whole", () => {
    expect(planSavedUnder("fp", {}, { errors: [] })).toBe("fp");
    expect(planSavedUnder("fp", { incomplete: true }, { errors: [] })).toBeNull(); // the ranking has holes: so does the plan
    expect(planSavedUnder("fp", {}, { errors: ["Chisa: Failed to fetch"] })).toBeNull();
  });
});
