// @vitest-environment node
// The energy check (src/sim/energy/): the pure reading of a run (need, band, rolls, breakdown, overcap), the deficit-
// aware scorer inside substat weights, the cache, and — on the fork's real engine, loaded the way the CLI loads it —
// the needs of stock teams with nobody registered (everyone S0 R1) and of the synthetic account's t404.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import account from "../myRankings/__fixtures__/cartethyiaAccount.json";
import runFixture from "../engine/__fixtures__/runLite.json";
import { SYNTHETIC_ACCOUNT } from "../engine/__fixtures__/syntheticAccount";
import { rileyHeadless, type HeadlessRiley } from "../engine/rileyNode";
import type { RileyTeamInfo, RunLite } from "../engine/rileyRun";
import { appKeyOf } from "../rankings/castMapper";
import { RANKING_ENEMY, rotationCandidates } from "../myRankings/rankRoster";
import { medianRoll, rotationScorer, substatWeights, type BuildScorer } from "../substats/substatWeights";
import { ENERGY_CACHE_KEY, energyCacheKey, keepable, loadEnergyCache, saveEnergyCache, type CachedMeasure } from "./energyCache";
import { characterFloors, energySummary, measureComposition, memberChecks, memberIdOf, scanCandidates, type EnergyEngine, type TeamMeasure } from "./energyCheck";
import { engineOfHeadless } from "./energyCli";
import { needLabel } from "./energyFormat";
import { erSignature, KIT_CONSTANT_ER, memoMenuEr, menuEnergyRegen } from "./energyHave";
import {
  bandOf,
  breakdownOf,
  checkOf,
  compositionKey,
  deficitFactor,
  erPercent,
  erWeight,
  needOf,
  overcapOf,
  overcapWeight,
  rollsShort,
  shortBy,
  teamEnergyOf,
  type TeamEnergy,
} from "./energyNeed";
import { CHEMX32_SHAPE, erAdjustedGain, erAwareScorer, erBenchmarkNote, erFactorFor, erReferenceCounts, erRollsToFloor } from "./erAwareScorer";

const LOAD = 60_000;
const run = runFixture as unknown as RunLite;

describe("reading a need", () => {
  it("is max(bar, kit floor), null where nothing asks", () => {
    expect(needOf({ bar: 113.1, minEr: 0 })).toEqual({ need: 113.1, bar: 113.1, minEr: 0, setBy: "loop" });
    expect(needOf({ bar: 187.5, minEr: 240 })).toEqual({ need: 240, bar: 187.5, minEr: 240, setBy: "kit" });
    expect(needOf({ bar: null, minEr: 260 })).toMatchObject({ need: 260, setBy: "kit" });
    expect(needOf({ bar: null, minEr: 0 })).toEqual({ need: null, bar: null, minEr: 0, setBy: null });
    expect(needOf(null).need).toBeNull();
  });

  it("converts the app's ER decimal to a percentage", () => {
    expect(erPercent(1.184)).toBe(118.4);
    expect(erPercent(2.5)).toBe(250);
    expect(erPercent(1)).toBe(100);
  });

  it("bands, rolls short and the deficit factor", () => {
    expect(bandOf(113.1, 105.3)).toBe("short");
    expect(bandOf(113.1, 113.1)).toBe("tight");
    expect(bandOf(113.04, 113.0)).toBe("short"); // the need rounds up as printed: 113.1
    expect(bandOf(113.1, 118.0)).toBe("tight");
    expect(bandOf(113.1, 118.1)).toBe("ok");
    expect(bandOf(null, 120)).toBe("noGate");
    expect(bandOf(120, null)).toBe("unknown");
    expect(shortBy(113.1, 105.3)).toBe(7.8);
    expect(rollsShort(113.1, 105.3)).toBe(1); // one 9.2 % roll covers 7.8
    expect(rollsShort(130, 110)).toBe(3); // 20 / 9.2 → 3
    expect(rollsShort(110, 130)).toBe(0);
    expect(medianRoll("EnergyRegen")).toBe(9.2);
    expect(deficitFactor(120, 110)).toBeCloseTo(0.9, 10);
    expect(deficitFactor(120, 130)).toBe(1);
    expect(deficitFactor(null, 100)).toBe(1);
    expect(deficitFactor(400, 100)).toBe(0);
  });

  it("weighs an ER roll by the share of the deficit it closes", () => {
    // 10 short: a 9.2 roll closes 9.2 of it → (1 − 0.8 %)/(1 − 10 %) − 1
    expect(erWeight(120, 110, 9.2)).toBeCloseTo(0.992 / 0.9 - 1, 10);
    // 4 short: the roll closes all of it
    expect(erWeight(120, 116, 9.2)).toBeCloseTo(1 / 0.96 - 1, 10);
    expect(erWeight(120, 125, 9.2)).toBe(0);
    expect(erWeight(null, 110)).toBe(0);
    expect(erRollsToFloor(120, 101.6)).toBe(2);
    expect(erRollsToFloor(120, 130)).toBe(0);
    expect(erRollsToFloor(300, 100)).toBe(5);
  });

  it("checkOf rounds like the game prints", () => {
    expect(checkOf(115.2341, 110.8)).toMatchObject({ status: "short", short: 4.5, rolls: 1, margin: -4.5 });
    expect(checkOf(121.08, 130.8)).toMatchObject({ status: "ok", short: 0, rolls: 0, margin: 9.7 });
  });
});

describe("the synthetic run (engine fixture)", () => {
  const energy = teamEnergyOf(run);
  const byName = Object.fromEntries(energy.members.map((m) => [m.name, m]));

  it("reads Shorekeeper's kit floor over her loop, Lynae's and Iuno's loops", () => {
    expect(byName.Shorekeeper).toMatchObject({ need: 240, minEr: 240, setBy: "kit", cost: 175 });
    expect(byName.Shorekeeper.bar).toBeCloseTo(187.47, 1);
    expect(byName.Lynae).toMatchObject({ setBy: "loop", minEr: 0, cost: 125 });
    expect(byName.Lynae.need).toBeCloseTo(113.85, 1);
    expect(byName.Iuno.need).toBeCloseTo(99.1, 1);
    expect(byName.Lynae.worn).toBe(118.4);
  });

  it("keeps the breakdown identity: own + shared at the bar + flat (+ ER buffs on own hits) = the spend", () => {
    for (const m of energy.members) {
      const b = breakdownOf({ bar: m.bar, gen: m.gen }, m.name)!;
      expect(b, m.name).not.toBeNull();
      const total = b.parts.reduce((s, p) => s + p.paid, 0);
      // the remainder under 0.5 % of the spend is his units' rounding, not shown as a part
      expect(Math.abs(total - b.spend) / b.spend, `${m.name} parts add up to the spend`).toBeLessThan(0.005);
      expect(b.parts.filter((p) => p.kind === "ally").map((p) => p.who).sort()).toEqual(energy.members.filter((o) => o.name !== m.name).map((o) => o.name).sort());
      // without ER buffs on their own hits Riley's identity holds to 1 %; Shorekeeper's Stellarealm ER is the remainder
      if (!b.parts.some((p) => p.kind === "buffs")) expect(Math.abs(b.remainder)).toBeLessThan(0.01);
      else expect(b.remainder).toBeGreaterThan(0);
    }
    const lynae = breakdownOf({ bar: byName.Lynae.bar, gen: byName.Lynae.gen }, "Lynae")!;
    expect(Math.abs(lynae.remainder)).toBeLessThan(0.006);
  });

  it("reads the crit overcap share in [0, 1] and names where it comes from", () => {
    run.members.forEach((m, i) => {
      const o = overcapOf(run, i);
      expect(o, m.name).not.toBeNull();
      expect(o!.share).toBeGreaterThanOrEqual(0);
      expect(o!.share).toBeLessThanOrEqual(1);
    });
    const iuno = overcapOf(run, run.members.findIndex((m) => m.name === "Iuno"))!;
    expect(iuno.share).toBeGreaterThan(0); // her crit-heavy My build passes 100 %
    expect(iuno.top.length).toBeGreaterThan(0);
    expect(iuno.top[0]!.critRate).toBeGreaterThanOrEqual(100);
    expect(overcapWeight(byName.Iuno)).toBeCloseTo(byName.Iuno.overcap!.share * byName.Iuno.share, 10);
    expect(overcapOf({ rows: [] }, 0)).toBeNull();
  });

  it("is small and JSON-safe (what the cache keeps)", () => {
    const json = JSON.stringify(energy);
    expect(JSON.parse(json)).toEqual(energy);
    expect(json.length).toBeLessThan(2500);
  });

  it("joins the builds' ER per member, in the team's slot order, a Rover form as the player has it", () => {
    const checks = memberChecks(energy, { Lynae: 105.3, Iuno: 130, Shorekeeper: 243 }, ["Iuno", "Lynae", "Shorekeeper"]);
    expect(checks.map((c) => c.characterId)).toEqual(["Iuno", "Lynae", "Shorekeeper"]);
    expect(checks.find((c) => c.characterId === "Lynae")).toMatchObject({ status: "short", rolls: 1 });
    expect(checks.find((c) => c.characterId === "Shorekeeper")).toMatchObject({ status: "tight" });
    const rover = { ...energy.members[0]!, name: "Aero Rover", appKey: appKeyOf("Aero Rover") };
    expect(memberIdOf(rover, ["RoverAeroMale", "Lynae"])).toBe("RoverAeroMale");
    expect(memberIdOf(rover, [])).toBe(appKeyOf("Aero Rover"));
    const unknown = memberChecks(energy, {}, []);
    expect(unknown.every((c) => c.status === "unknown")).toBe(true);
  });

  it("finds each character's worst need across teams, and sums up the account", () => {
    const other: TeamEnergy = { ...energy, members: energy.members.map((m) => (m.name === "Lynae" ? { ...m, need: 131.5, bar: 131.5 } : m)) };
    const floors = characterFloors([
      { id: "a", name: "Team A", characterIds: ["Shorekeeper", "Lynae", "Iuno"], energy },
      { id: "b", name: "Team B", characterIds: ["Shorekeeper", "Lynae", "Iuno"], energy: other },
      { id: "c", name: "Not measured", characterIds: ["Lynae"], energy: null },
    ]);
    expect(floors.get("Lynae")).toMatchObject({ need: 131.5, team: { id: "b" } });
    expect(floors.get("Lynae")!.all.map((a) => a.id)).toEqual(["b", "a"]);
    expect(floors.get("Shorekeeper")).toMatchObject({ need: 240, setBy: "kit" });
    const s = energySummary([{ checks: memberChecks(energy, { Lynae: 105, Iuno: 99.5, Shorekeeper: 243 }) }, { checks: null }]);
    expect(s).toMatchObject({ teams: 2, measured: 1, members: 3, short: 1, tight: 2, shortCharacters: ["Lynae"] });
    expect(s.overcapCharacters).toEqual(overcapWeight(energy.members.find((m) => m.name === "Iuno")!) >= 0.02 ? ["Iuno"] : []);
  });
});

describe("the cache", () => {
  const ok: TeamMeasure = { status: "ok", energy: teamEnergyOf(run) };
  const memory = (): Storage => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) } as unknown as Storage;
  };

  it("keys on the engine commit, the account, its builds and the composition (any order)", () => {
    const a = energyCacheKey("e1181a9", SYNTHETIC_ACCOUNT, ["Shorekeeper", "Lynae", "Iuno"]);
    expect(energyCacheKey("e1181a9", SYNTHETIC_ACCOUNT, ["Iuno", "Shorekeeper", "Lynae"])).toBe(a);
    expect(energyCacheKey("f00ba47", SYNTHETIC_ACCOUNT, ["Shorekeeper", "Lynae", "Iuno"])).not.toBe(a);
    expect(energyCacheKey("e1181a9", { ...SYNTHETIC_ACCOUNT, key: "other" }, ["Shorekeeper", "Lynae", "Iuno"])).not.toBe(a);
    expect(energyCacheKey("e1181a9", { ...SYNTHETIC_ACCOUNT, buildsKey: "other" }, ["Shorekeeper", "Lynae", "Iuno"])).not.toBe(a);
    expect(compositionKey(["Lynae", null, "Iuno", "Shorekeeper"])).toBe("Iuno+Lynae+Shorekeeper");
  });

  it("round-trips, drops other commits and failures, keeps the most recent", () => {
    const storage = memory();
    const entries = new Map<string, CachedMeasure>([
      [energyCacheKey("e1181a9", SYNTHETIC_ACCOUNT, ["A", "B", "C"]), { at: 3, m: ok }],
      [energyCacheKey("e1181a9", SYNTHETIC_ACCOUNT, ["D", "E", "F"]), { at: 2, m: { status: "notMeasured", reason: "notRiley", message: "x" } }],
      [energyCacheKey("e1181a9", SYNTHETIC_ACCOUNT, ["G", "H", "I"]), { at: 1, m: { status: "notMeasured", reason: "error", message: "boom" } }],
      [energyCacheKey("0ld0ld0", SYNTHETIC_ACCOUNT, ["A", "B", "C"]), { at: 4, m: ok }],
    ]);
    saveEnergyCache(entries, "e1181a9", storage, 1);
    const back = loadEnergyCache(storage);
    expect([...back.keys()]).toEqual([energyCacheKey("e1181a9", SYNTHETIC_ACCOUNT, ["A", "B", "C"])]);
    expect(back.values().next().value!.m).toEqual(ok);
    saveEnergyCache(entries, "e1181a9", storage);
    expect(loadEnergyCache(storage).size).toBe(2);
    expect(keepable({ status: "notMeasured", reason: "error", message: "" })).toBe(false);
    storage.setItem(ENERGY_CACHE_KEY, "{not json");
    expect(loadEnergyCache(storage).size).toBe(0);
  });

  it("drops an entry another build wrote in another shape, never half-reads it", () => {
    const storage = memory();
    const good = energyCacheKey("e1181a9", SYNTHETIC_ACCOUNT, ["A", "B", "C"]);
    const old = energyCacheKey("e1181a9", SYNTHETIC_ACCOUNT, ["D", "E", "F"]);
    const odd = energyCacheKey("e1181a9", SYNTHETIC_ACCOUNT, ["G", "H", "I"]);
    const stale = { status: "ok", energy: { ...teamEnergyOf(run), v: 0 } };
    storage.setItem(ENERGY_CACHE_KEY, JSON.stringify({ v: 1, entries: { [good]: { at: 1, m: ok }, [old]: { at: 2, m: stale }, [odd]: { at: 3, m: { status: "notMeasured" } } } }));
    expect([...loadEnergyCache(storage).keys()]).toEqual([good]);
  });
});

describe("words", () => {
  it("calls a kit's own minimum a kit floor, a loop's requirement a need", () => {
    expect(needLabel({ setBy: "kit" })).toBe("kit floor");
    expect(needLabel({ setBy: "loop" })).toBe("need");
    expect(needLabel(null)).toBe("need");
  });
});

describe("the have side and ER as a floor in substat weights (Cartethyia fixture)", () => {
  const ID = "Cartethyia";
  const characters = account.characters as Record<string, any>;
  const echoes = account.echoes as any[];

  it("reads the character screen's ER and only re-builds when an ER line moves", async () => {
    const have = await menuEnergyRegen(ID, characters, echoes);
    expect(have).toBeGreaterThanOrEqual(100);
    expect(await menuEnergyRegen("NoSuchCharacter", characters, echoes)).toBeNull();
    const sig = erSignature(ID, characters, echoes);
    const slots = characters[ID].echoes;
    const withCrit = { ...characters, [ID]: { ...characters[ID], echoes: { ...slots, 0: { ...slots[0], echoSubStatsType1: "CritRate", echoSubStatsValue1: 10.5 } } } };
    expect(erSignature(ID, withCrit, echoes)).toBe(sig);
  });

  it("scales the damage by the deficit and leaves it alone at or above the need", async () => {
    const flat: BuildScorer = async () => ({ avg: 1000 });
    const short = erAwareScorer(flat, ID, 120, { haveOf: async () => 110 });
    expect((await short(characters, echoes)).avg).toBeCloseTo(900, 9);
    expect((await short(characters, echoes)).extra).toMatchObject({ raw: 1000, er: 110 });
    const met = erAwareScorer(flat, ID, { need: 120, team: "t" }, { haveOf: async () => 125 });
    expect((await met(characters, echoes)).avg).toBe(1000);
    const unknown = erAwareScorer(flat, ID, 120, { haveOf: async () => null });
    expect((await unknown(characters, echoes)).avg).toBe(1000);
  });

  it(
    "weighs Energy Regen above zero one roll short, at zero 20 % over — other stats unchanged",
    async () => {
      const candidates = await rotationCandidates(ID, characters[ID]);
      const base = rotationScorer(ID, candidates.find((c) => c.source === "yours")!.rotation, RANKING_ENEMY);
      const have = (await menuEnergyRegen(ID, characters, echoes))!;
      const keys = ["EnergyRegen", "CritRate"] as const;
      const plain = await substatWeights(ID, characters, echoes, base, { keys });
      const shortW = await substatWeights(ID, characters, echoes, erAwareScorer(base, ID, have + 5, { haveOf: memoMenuEr(ID) }), { keys });
      const overW = await substatWeights(ID, characters, echoes, erAwareScorer(base, ID, have - 20, { haveOf: memoMenuEr(ID) }), { keys });
      const er = (r: typeof plain) => r.weights.find((w) => w.key === "EnergyRegen")!;
      const cr = (r: typeof plain) => r.weights.find((w) => w.key === "CritRate")!;
      expect(Math.abs(er(plain).gain)).toBeLessThan(0.0005); // the static engine: ER feeds nothing on her rotation
      expect(er(shortW).gain).toBeGreaterThan(0.04); // 5 short: a 9.4 % roll closes it → 1/0.95 − 1
      expect(er(shortW).gain).toBeCloseTo(1 / 0.95 - 1, 3);
      expect(Math.abs(er(overW).gain)).toBeLessThan(0.0005);
      expect(cr(shortW).gain).toBeCloseTo(cr(plain).gain, 9);
      expect(shortW.baselineExtra.raw).toBeCloseTo(plain.baseline, 6);
    },
    LOAD,
  );
});

describe("hooks for the invest plan and the Echo Lab benchmark", () => {
  const sum = (m: Map<string, number>): number => [...m.values()].reduce((a, b) => a + b, 0);

  it("erFactorFor: the deficit factor of a clone, none without a floor", async () => {
    expect(erFactorFor("Cartethyia", null)).toBeNull();
    expect(erFactorFor("Cartethyia", Number.NaN)).toBeNull();
    const f = erFactorFor("Cartethyia", 120, { haveOf: async () => 110 })!;
    expect(await f({}, [])).toBeCloseTo(0.9, 10);
    const met = erFactorFor("Cartethyia", 120, { haveOf: async () => 121 })!;
    expect(await met({}, [])).toBe(1);
  });

  it("erAdjustedGain: a +0.0 % ER roll gains the deficit it closes; other stats keep their gain", () => {
    expect(erAdjustedGain(0, 0.9, 0.992)).toBeCloseTo(0.992 / 0.9 - 1, 10);
    expect(erAdjustedGain(0.034, 0.9, 0.9)).toBeCloseTo(0.034, 10);
    expect(erAdjustedGain(0.05, 1, 1)).toBeCloseTo(0.05, 10);
    expect(erAdjustedGain(0.05, 0, 0.5)).toBe(0.05);
  });

  it("erReferenceCounts: ChemX32 24 rolls, ER promoted to third the way wuwa_calc does, capped at three", () => {
    const priority = ["CritRate", "CritDMG", "EnergyRegen", "ATK", "ResonanceLiberationDMGBonus", "BasicAttackDMGBonus", "HeavyAttackDMGBonus"] as any[];
    const one = erReferenceCounts(priority, 1);
    expect(one.named).toEqual(["CritRate", "CritDMG", "ATK", "ResonanceLiberationDMGBonus", "BasicAttackDMGBonus"]);
    expect(one.named.map((k) => one.counts.get(k))).toEqual([...CHEMX32_SHAPE]);
    expect(one.counts.get("EnergyRegen")).toBe(1);
    expect(sum(one.counts)).toBe(24);
    const two = erReferenceCounts(priority, 2);
    expect(two.named).toEqual(["CritRate", "CritDMG", "EnergyRegen", "ATK", "ResonanceLiberationDMGBonus"]);
    expect(two.named.map((k) => two.counts.get(k))).toEqual([5, 5, 2, 2, 2]);
    expect(two.counts.get("BasicAttackDMGBonus")).toBe(1);
    expect(sum(two.counts)).toBe(24);
    const three = erReferenceCounts(priority, 7);
    expect(three.erRolls).toBe(3);
    expect(three.named.map((k) => three.counts.get(k))).toEqual([5, 4, 3, 2, 2]);
    expect(sum(three.counts)).toBe(24);
    expect(erReferenceCounts(priority, 0).erRolls).toBe(1);
    expect(erBenchmarkNote(null)).toMatch(/worth nothing/);
    expect(erBenchmarkNote(115.21, 2, "t269")).toMatch(/115\.3% .*t269.*2 of its rolls/);
  });
});

describe("kit-constant ER (the one gap between the engines' 'constant')", () => {
  it("matches wuwa_calc: menuStats over the resonator, talents and inherents, beyond the base 100 %", async () => {
    const V = new URL("../../../vendor/wuwa_calc/src/", import.meta.url).href;
    const ctx = await import(/* @vite-ignore */ V + "engine/context.ts");
    const St = await import(/* @vite-ignore */ V + "engine/stats.ts");
    const model = await import(/* @vite-ignore */ V + "page/model.ts");
    const er = (gear: any[]): number => ctx.menuStats(gear).reduce((n: number, e: any) => n + (e.stat === St.Stat.ER ? e.value : 0), 0);
    const found: Record<string, number> = {};
    for (const members of Object.values(model.TEAMS) as any[][]) {
      for (const m of members) {
        const r = m.loadout.resonator;
        const extra = Math.round((er([r, r.talent, r.inherent1, r.inherent2].filter(Boolean)) - 100) * 100) / 100;
        if (extra) found[appKeyOf(m.name)] = extra;
      }
    }
    expect(found).toEqual(KIT_CONSTANT_ER);
  }, LOAD);
});

describe("on the engine", () => {
  let none: HeadlessRiley;
  let synth: HeadlessRiley;
  beforeAll(async () => {
    none = await rileyHeadless(null);
    synth = await rileyHeadless(SYNTHETIC_ACCOUNT);
  }, LOAD);

  it("t0 at S0 R1: Shorekeeper reads her 240 % kit floor over a ~212 % loop", async () => {
    const m = await measureComposition(engineOfHeadless(none), ["Shorekeeper", "Jinhsi", "Suoming"]);
    expect(m.status).toBe("ok");
    const e = (m as Extract<TeamMeasure, { status: "ok" }>).energy;
    const sk = e.members.find((x) => x.name === "Shorekeeper")!;
    expect(sk.need).toBe(240);
    expect(sk.setBy).toBe("kit");
    expect(sk.bar).toBeGreaterThan(200);
    expect(sk.bar).toBeLessThan(225);
    expect(e.members.every((x) => !x.owned && x.sequence === 0 && x.refinement === 1)).toBe(true);
  }, LOAD);

  it("is deterministic, and equals the committed seam fixture on the synthetic account", async () => {
    const engine = engineOfHeadless(synth);
    const a = await measureComposition(engine, ["Shorekeeper", "Lynae", "Iuno"]);
    const b = await measureComposition(engine, ["Iuno", "Shorekeeper", "Lynae"]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    if (run.engine.commit === synth.engine.commit) expect((a as Extract<TeamMeasure, { status: "ok" }>).energy).toEqual(teamEnergyOf(run, (a as Extract<TeamMeasure, { status: "ok" }>).energy.variants));
  }, LOAD);

  it("gives no need to a kit whose Liberation costs no energy", async () => {
    const key = none.teams.find((t) => t.members.some((m) => m.name === "Phrolova"))!;
    const m = await measureComposition(engineOfHeadless(none), key.members.map((x) => x.appKey));
    const e = (m as Extract<TeamMeasure, { status: "ok" }>).energy;
    const phrolova = e.members.find((x) => x.name === "Phrolova")!;
    expect(phrolova.cost).toBe(0);
    expect(phrolova.need).toBeNull();
    expect(bandOf(phrolova.need, 120)).toBe("noGate");
  }, LOAD);

  it("reports why a team is not measured, never throws", async () => {
    const engine = engineOfHeadless(none);
    expect(await measureComposition(engine, ["Shorekeeper", "Lynae"])).toMatchObject({ status: "notMeasured", reason: "incomplete" });
    expect(await measureComposition(engine, ["Rover", "Nobody", "Ghost"])).toMatchObject({ status: "notMeasured", reason: "notRiley" });
    const lily = none.teams.find((t) => t.members.some((m) => m.appKey === "Lily"))!;
    expect(await measureComposition(engine, lily.members.map((m) => m.appKey))).toMatchObject({ status: "notMeasured", reason: "notInApp" });
    const failing: EnergyEngine = { ...engine, solveMine: async (keys) => keys.map((teamKey) => ({ teamKey, names: [], appKeys: [], status: "skipped", reason: "noBuild", fieldable: true, best: null })) };
    expect(await measureComposition(failing, ["Shorekeeper", "Lynae", "Iuno"])).toMatchObject({ status: "notMeasured", reason: "noBuild" });
  }, LOAD);

  it("lists the compositions an account can field for the scan, unreleased ones left out", () => {
    const teams: RileyTeamInfo[] = [
      { key: "t1", members: [{ name: "Shorekeeper", appKey: "Shorekeeper", mainDps: false }, { name: "Lynae", appKey: "Lynae", mainDps: false }, { name: "Iuno", appKey: "Iuno", mainDps: true }] },
      { key: "t2", members: [{ name: "Shorekeeper", appKey: "Shorekeeper", mainDps: false }, { name: "Lynae", appKey: "Lynae", mainDps: false }, { name: "Iuno", appKey: "Iuno", mainDps: true }] },
      { key: "t3", members: [{ name: "Shorekeeper", appKey: "Shorekeeper", mainDps: false }, { name: "Sanhua", appKey: "Sanhua", mainDps: false }, { name: "Jinhsi", appKey: "Jinhsi", mainDps: true }] },
      { key: "t4", members: [{ name: "Shorekeeper", appKey: "Shorekeeper", mainDps: false }, { name: "Lynae", appKey: "Lynae", mainDps: false }, { name: "Lily", appKey: "Lily", mainDps: true }] },
    ];
    const free = (k: string): boolean => k === "Sanhua";
    const c = scanCandidates(teams, SYNTHETIC_ACCOUNT, ["Lily"], free);
    expect(c).toEqual([{ key: "Iuno+Lynae+Shorekeeper", characterIds: ["Shorekeeper", "Lynae", "Iuno"], teamKeys: ["t1", "t2"] }]);
  });
});

// Soft report against other sites' published ER figures (Prydwen / wudamage, numbers + URLs + date). The file is
// git-ignored (`*.local.json`): those figures are their editorial work and the repo is public. Never asserts.
const ORACLE = fileURLToPath(new URL("./__fixtures__/erOracle.local.json", import.meta.url));
describe.skipIf(!existsSync(ORACLE))("oracle soft report (local only)", () => {
  it("prints wuwa_calc's needs beside the community figures", async () => {
    const oracle = JSON.parse(readFileSync(ORACLE, "utf8")) as { date: string; characters: Array<{ key: string; prydwen?: string; wudamage?: string }> };
    const h = await rileyHeadless(null);
    const engine = engineOfHeadless(h);
    const lines: string[] = [];
    for (const c of oracle.characters) {
      const teams = h.teams.filter((t) => t.members.some((m) => m.appKey === c.key) && !t.members.some((m) => h.blocked.includes(m.appKey))).slice(0, 2);
      const needs: number[] = [];
      for (const t of teams) {
        const m = await measureComposition(engine, t.members.map((x) => x.appKey));
        const need = m.status === "ok" ? m.energy.members.find((x) => x.appKey === c.key)?.need : null;
        if (need != null) needs.push(need);
      }
      const ours = needs.length ? `${Math.min(...needs).toFixed(1)}–${Math.max(...needs).toFixed(1)} % (${needs.length} teams, S0 R1)` : "no gate / not measured";
      lines.push(`${c.key.padEnd(12)} wuwa_calc ${ours.padEnd(32)} prydwen ${(c.prydwen ?? "-").padEnd(12)} wudamage ${c.wudamage ?? "-"}`);
    }
    console.info(`ER needs vs community figures (${oracle.date}):\n${lines.join("\n")}`);
    expect(lines.length).toBe(oracle.characters.length);
  }, 120_000);
});
