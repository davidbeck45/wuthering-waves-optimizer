// Wuthering Tools+ Echo Lab — "Farm next" (farmNext.ts) on the Echo Lab's public test account (echoLabAccount.json:
// Cartethyia, Galbrena and Zani) and small edits of it: the slot rules, a one-line fresh echo against an exact
// enumeration through the engine, the ranking order, team figures on a fieldable team, the worker job.
import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/echoLabAccount.json";
import { statsTable } from "../../echoes/stats";
import { mainEchoesData } from "../../echoes/index";
import { scoreTeamCandidate } from "../myRankings/rankRoster";
import { SUBSTAT_KEYS } from "../substats/substatWeights";
import { createLabSession, prepareCharacter, scoreBuild, swapInto, withInventoryRecord, withLines, type LabAccount } from "./core";
import { FARM_ASSUMPTIONS, farmNext, farmTeam, mainStatsOf, rollout, sortFarmRows, speciesOf, type FarmRow } from "./farmNext";
import { confirmDead, lineModel, lineTable } from "./lineModel";
import { tierOdds } from "./rolls";
import { tunerCandidates, tuneToMaxResources } from "./tunerPlan";
import { createEchoLabHost, type EchoLabResponse } from "./workerHost";

const account = fixture as unknown as LabAccount;
const clone = (): LabAccount => JSON.parse(JSON.stringify(account));
const quiet = { yieldMs: 0 };
const T = 60_000;
const PROBE = "__farm_test_probe__";

/** Every one-line outcome of a fresh echo of the row's target, scored straight through the engine. */
async function enumerateOneLine(session: ReturnType<typeof createLabSession>, row: FarmRow): Promise<{ expected: number; pBeat: number; mainOnly: number }> {
  const lab = (await prepareCharacter(session, row.characterId))!;
  const record = withLines({ echoId: PROBE, echo: row.target.species[0], type: row.target.cost, rank: 5, stat: row.target.main, echoSet: row.target.set }, []);
  const blankEchoes = withInventoryRecord(session.account.echoes, record);
  const characters = swapInto(session, lab, blankEchoes, PROBE, row.slot);
  const mainOnly = (await scoreBuild(session, lab, characters, blankEchoes)) / lab.base - 1;
  let expected = 0;
  let pBeat = 0;
  for (const key of SUBSTAT_KEYS) {
    const odds = tierOdds(key);
    for (let i = 0; i < odds.values.length; i++) {
      const echoes = withInventoryRecord(session.account.echoes, withLines(record, [{ key, value: odds.values[i] }]));
      const gain = (await scoreBuild(session, lab, characters, echoes)) / lab.base - 1;
      const p = odds.probs[i] / SUBSTAT_KEYS.length;
      expected += p * Math.max(0, gain);
      if (gain > 1e-12) pBeat += p;
    }
  }
  return { expected, pBeat, mainOnly };
}

describe("Farm next: echo data", () => {
  it("offers the main stats each cost rolls and the echoes of a Sonata at a cost", () => {
    expect(mainStatsOf(4).sort()).toEqual(Object.keys(statsTable[4]).sort());
    expect(mainStatsOf(4)).toEqual(expect.arrayContaining(["CritRate", "CritDMG", "ATK", "HealingBonus"]));
    expect(mainStatsOf(3)).toEqual(expect.arrayContaining(["EnergyRegen", "Spectro", "ATK"]));
    expect(mainStatsOf(3)).not.toContain("CritRate");
    expect(mainStatsOf(1).sort()).toEqual(["ATK", "DEF", "HP"]);
    const radiance3 = speciesOf("EternalRadiance", 3);
    expect(radiance3).toContain("DiurnusKnight");
    for (const sp of radiance3) expect(mainEchoesData[sp].sets).toContain("EternalRadiance");
    expect(speciesOf("EternalRadiance", 4).every((sp) => ["Calamity", "Overlord"].includes(mainEchoesData[sp].class))).toBe(true);
  });
});

describe("Farm next: the slot rules", () => {
  it(
    "keeps the slot's cost, the main echo and every set bonus, and names echoes no other slot wears",
    async () => {
      const session = createLabSession(clone());
      const result = await farmNext(session, { characterIds: ["Zani", "Galbrena"], teamSlots: 0, draw: 1 }, quiet);
      expect(result.rows).toHaveLength(10);
      expect(result.skipped).toEqual([]);
      expect(result.assumptions).toBe(FARM_ASSUMPTIONS);
      expect(result.autoTeamBuffs).toBe(true);
      for (const row of result.rows) {
        const lab = (await prepareCharacter(session, row.characterId))!;
        expect(row.target.cost, row.key).toBe(row.current.cost);
        expect(mainStatsOf(row.target.cost)).toContain(row.target.main);
        for (const alt of row.alternatives) expect(mainStatsOf(row.target.cost)).toContain(alt.main);
        // the main echo slot farms another copy of the main echo
        if (row.slot === 0) expect(row.target.species).toEqual([row.current.echo]);
        // no species another slot wears
        const others = lab.slots.filter((s, j) => s && j !== row.slot).map((s) => s!.species);
        for (const sp of row.target.species) expect(others, `${row.key} ${sp}`).not.toContain(sp);
        for (const sp of row.target.species) expect(mainEchoesData[sp].sets).toContain(row.target.set);
        // a full five-piece (Zani) or a three + two (Galbrena): every slot feeds a bonus, so only its own Sonata keeps them
        expect(row.target.sets, row.key).toEqual([row.current.set]);
        expect(row.target.anySet).toBe(false);
        expect(row.target.adds).toEqual([]);
        // one try: a fresh 5★ echo from +0 to +25
        expect(row.resources).toEqual(tuneToMaxResources(0));
        expect(row.resources.tuners).toBe(50);
        expect(row.expectedDamage).toBeCloseTo(row.expectedGain * row.base, 6);
        expect(row.damagePerTuner).toBeCloseTo(row.expectedDamage / 50, 9);
        if (row.pBeat > 0) expect(row.triesPerWin).toBeCloseTo(1 / row.pBeat, 9);
        // no team figure without a fieldable team (the fixture has none)
        expect(row.team).toBeNull();
      }
    },
    T,
  );

  it(
    "never trades away an Energy Regen main stat the build can't lose",
    async () => {
      const next = clone();
      const echo = next.echoes.find((e) => e.echoId === "l1c12jyv60")!; // Zani's slot 3: Diurnus Knight, 3-cost
      echo.stat = "EnergyRegen";
      const session = createLabSession(next);
      const result = await farmNext(session, { characterIds: ["Zani"], teamSlots: 0, draw: 1, autoTeamBuffs: false }, quiet);
      // the switch the list was worked out under rides along (the page re-runs the list when it flips)
      expect(result.autoTeamBuffs).toBe(false);
      const row = result.rows.find((r) => r.key === "Zani|2")!;
      expect(row.current.main).toBe("EnergyRegen");
      expect(row.target.main).toBe("EnergyRegen");
      expect(row.sameAsCurrent).toBe(true);
      const others = row.alternatives.filter((a) => a.main !== "EnergyRegen");
      expect(others.length).toBe(mainStatsOf(3).length - 1);
      for (const a of others) {
        expect(a.blocked, a.main).toBe("er");
        expect(a.mainOnlyGain).toBeNull();
      }
    },
    T,
  );

  it(
    "in a four-plus-one layout, farms the Sonata that completes the five-piece for the odd slot",
    async () => {
      const next = clone();
      const echo = next.echoes.find((e) => e.echoId === "mw1oqawxl7")!; // Zani's slot 5: Chop Chop: Headless, 1-cost
      echo.echoSet = "MoltenRift";
      next.characters.Zani.echoSetBonus = { setBonusOne: "Eternal Radiance 2 Set", setBonusTwo: null };
      next.characters.Zani.echoSetPassives = { EternalRadiance2SetHP: { isEnabled: true } };
      const session = createLabSession(next);
      const result = await farmNext(session, { characterIds: ["Zani"], teamSlots: 0, draw: 1 }, quiet);
      const odd = result.rows.find((r) => r.key === "Zani|4")!;
      expect(odd.current.set).toBe("MoltenRift");
      expect(odd.target.set).toBe("EternalRadiance");
      expect(odd.target.adds).toEqual(["Eternal Radiance 5 Set"]);
      expect(odd.sameAsCurrent).toBe(false);
      // any other Sonata (the odd slot feeds no bonus) is the same echo to the engine: listed as one alternative
      const any = odd.alternatives.find((a) => a.anySet && a.main === odd.target.main)!;
      expect(any).toBeTruthy();
      expect(odd.mainOnlyGain).toBeGreaterThan(any.mainOnlyGain!);
      // an Eternal Radiance slot: four of five pieces still give the two-piece, so it feeds no bonus either
      const inSet = result.rows.find((r) => r.key === "Zani|3")!;
      expect(inSet.target.anySet).toBe(true);
      expect(inSet.target.set).toBe("EternalRadiance"); // its own Sonata, when it fits
      expect(inSet.target.sets.length).toBeGreaterThan(5);
    },
    T,
  );
});

describe("Farm next: the numbers", () => {
  it(
    "a one-line fresh echo equals the exact enumeration of its 96 outcomes through the engine",
    async () => {
      const session = createLabSession(clone());
      const result = await farmNext(session, { characterIds: ["Zani"], teamSlots: 0, draw: 1 }, quiet);
      for (const key of ["Zani|1", "Zani|3"]) {
        const row = result.rows.find((r) => r.key === key)!;
        expect(row.method).toBe("exact");
        const exact = await enumerateOneLine(session, row);
        expect(row.mainOnlyGain).toBeCloseTo(exact.mainOnly, 12);
        expect(row.expectedGain, key).toBeCloseTo(exact.expected, 10);
        expect(row.pBeat, key).toBeCloseTo(exact.pBeat, 10);
      }
    },
    T,
  );

  it("reads a linear stat's middle tiers off its line, and scores a bent one tier by tier", async () => {
    const values = tierOdds("CritRate").values;
    const calls: number[] = [];
    // linear in everything but Crit Rate, which caps at 8 points above the context
    const table = await lineTable(100, async (key, v) => {
      calls.push(v);
      if (key === "CritRate") return 100 + Math.min(v, 8);
      if (key === "ATK") return 100 + 2 * v;
      return 100;
    });
    const close = (got: number[] | undefined, want: number[]): void => {
      expect(got).toHaveLength(want.length);
      want.forEach((w, i) => expect(got![i]).toBeCloseTo(w, 9));
    };
    close(table.get("ATK"), tierOdds("ATK").values.map((v) => 100 + 2 * v));
    expect(table.get("CritRate")).toEqual(values.map((v) => 100 + Math.min(v, 8)));
    expect(table.get("HP_FLAT")).toEqual(tierOdds("HP_FLAT").values.map(() => 100));
    // 11 dead stats: one call each; ATK: two; Crit Rate: all eight
    expect(calls.length).toBe(11 + 2 + values.length);
    // a stat named dead is not scored at all
    const none: number[] = [];
    await lineTable(100, async (_k, v) => (none.push(v), 100), new Set(SUBSTAT_KEYS));
    expect(none).toEqual([]);
  });

  it("confirms a stat priced at 0 on the build adds nothing on the new echo before skipping it, five at a time", async () => {
    // Energy Regen priced at 0 on the build (past a threshold the old echo helped it over) but worth +0.25 % on a fresh
    // echo at every tier (a step): its group of five is not confirmed, the other group is, in one engine run each
    const calls: string[][] = [];
    const score = async (lines: Array<{ key: string; value: number }>): Promise<number> => {
      calls.push(lines.map((l) => l.key));
      return lines.some((l) => l.key === "EnergyRegen") ? 100.25 : 100;
    };
    const keys = ["HP", "HP_FLAT", "DEF", "DEF_FLAT", "BasicAttackDMGBonus", "EnergyRegen", "HeavyAttackDMGBonus"] as const;
    const dead = await confirmDead(100, keys, score);
    expect([...dead].sort()).toEqual(["BasicAttackDMGBonus", "DEF", "DEF_FLAT", "HP", "HP_FLAT"]);
    expect(calls).toHaveLength(2);
    for (const call of calls) expect(call.length).toBeLessThanOrEqual(5);
    // lineTable then scores Energy Regen tier by tier (a step is neither dead nor a line through "no line")
    const table = await lineTable(100, async (key) => (key === "EnergyRegen" ? 100.25 : 100), dead);
    expect(table.get("EnergyRegen")).toEqual(tierOdds("EnergyRegen").values.map(() => 100.25));
  });

  it("keeps the better echo: a roll-out that can only lose expects nothing, and the same seed draws the same tries", async () => {
    // no pairs: a table on its own (`draw` 1), so the roll-out's own rules are what this reads
    const modelOf = (table: Map<(typeof SUBSTAT_KEYS)[number], number[]>) => lineModel(100, table, async () => 100, 1);
    const flat = await modelOf(new Map(SUBSTAT_KEYS.map((k) => [k, tierOdds(k).values.map(() => 100)] as const)));
    const lose = rollout(flat, 110, 5, 2000, "seed");
    expect(lose.expectedGain).toBe(0);
    expect(lose.pBeat).toBe(0);
    expect(lose.expectedChange).toBeCloseTo(100 / 110 - 1, 12);
    const live = await modelOf(new Map(SUBSTAT_KEYS.map((k) => [k, tierOdds(k).values.map((_v, i) => 100 + i)] as const)));
    const a = rollout(live, 103, 5, 2000, "seed");
    expect(rollout(live, 103, 5, 2000, "seed")).toEqual(a);
    expect(a.method).toBe("modelled");
    expect(a.pBeat).toBeGreaterThan(0);
    expect(a.pBeat).toBeLessThan(1);
    expect(a.expectedGain).toBeGreaterThanOrEqual(Math.max(0, a.expectedChange));
  });

  it(
    "ranks the account's slots best first, by team gain where there is one and own gain after",
    async () => {
      const session = createLabSession(clone());
      const result = await farmNext(session, { teamSlots: 0, draw: 1 }, quiet);
      expect(result.rows).toHaveLength(15);
      for (let i = 1; i < result.rows.length; i++) expect(result.rows[i - 1].expectedGain).toBeGreaterThanOrEqual(result.rows[i].expectedGain);
      // deterministic: the same account answers the same
      const again = await farmNext(createLabSession(clone()), { teamSlots: 0, draw: 1 }, quiet);
      expect(again.rows.map((r) => [r.key, r.expectedGain])).toEqual(result.rows.map((r) => [r.key, r.expectedGain]));

      const rows = [
        { key: "a|1", expectedGain: 0.05, team: null },
        { key: "b|1", expectedGain: 0.01, team: { expectedGain: 0.004 } },
        { key: "c|1", expectedGain: 0.02, team: { expectedGain: 0.009 } },
        { key: "d|1", expectedGain: 0.05, team: null },
      ] as unknown as FarmRow[];
      expect(sortFarmRows(rows, "team").map((r) => r.key)).toEqual(["c|1", "b|1", "a|1", "d|1"]);
      expect(sortFarmRows(rows, "own").map((r) => r.key)).toEqual(["a|1", "d|1", "c|1", "b|1"]);
    },
    T,
  );
});

describe("Farm next and the Tuner plan's Then farm", () => {
  it(
    "read one figure for the same target: a slot draws the same tries on both lists",
    async () => {
      const session = createLabSession(clone());
      const farm = await farmNext(session, { teamSlots: 0 }, quiet);
      const { fresh } = await tunerCandidates(session, { freshSlots: 15 }, quiet);
      const same = fresh.flatMap((f) => {
        const row = farm.rows.find((r) => r.characterId === f.characterId && r.slot === f.slot && r.sameAsCurrent);
        return row ? [{ f, row }] : [];
      });
      expect(same.length).toBeGreaterThan(0);
      for (const { f, row } of same) {
        expect(f.expectedGain, row.key).toBeCloseTo(row.expectedGain, 9);
        expect(f.pKeep, row.key).toBeCloseTo(row.pBeat, 9);
      }
    },
    T,
  );
});

describe("Farm next: team figures", () => {
  /** Cartethyia with her wuwa_calc team's two others armed (no echoes), so that team is fieldable, and her last echo
   *  stripped to one flat DEF line, so a fresh one-line echo there beats it often. */
  const withTeam = (): LabAccount => {
    const next = clone();
    next.characters = { ...next.characters, Ciaccona: { weapon: "WoodlandAria" }, Chisa: { weapon: "Kumokiri" } };
    const weak = next.echoes.find((e) => e.echoId === "bk6b3jp0d4")!;
    Object.assign(weak, withLines(weak, [{ key: "DEF_FLAT", value: 40 }]));
    return next;
  };

  it(
    "re-scores the strongest fieldable team exactly, and works out a pending slot on request",
    async () => {
      const session = createLabSession(withTeam());
      const result = await farmNext(session, { characterIds: ["Cartethyia"], teamSlots: 1, draw: 1, autoTeamBuffs: true }, quiet);
      expect(result.rows).toHaveLength(5);
      const withFigure = result.rows.filter((r) => r.team);
      expect(withFigure).toHaveLength(1);
      expect(result.rows.filter((r) => r.teamPending)).toHaveLength(4);
      const row = withFigure[0];
      expect(row.key).toBe("Cartethyia|4"); // the stripped echo: the most promising slot by far
      expect(result.rows[0]).toBe(row); // a team figure ranks first
      const team = row.team!;
      expect(team.characterIds).toContain("Cartethyia");
      expect(team.expectedDamage).toBeCloseTo(team.expectedGain * team.base, 6);
      expect(team.pGain).toBeGreaterThanOrEqual(0);
      expect(team.pGain).toBeLessThanOrEqual(1);
      // her own damage is part of the team's: a fresh echo of hers lifts the team by less than it lifts her
      expect(team.expectedGain).toBeLessThan(row.expectedGain);
      expect(team.expectedGain).toBeGreaterThan(0);

      // the team figure with no substats is one exact team re-score
      const lab = (await prepareCharacter(session, "Cartethyia"))!;
      const record = withLines({ echoId: PROBE, echo: row.target.species[0], type: row.target.cost, rank: 5, stat: row.target.main, echoSet: row.target.set }, []);
      const echoes = withInventoryRecord(session.account.echoes, record);
      const characters = swapInto(session, lab, echoes, PROBE, row.slot);
      const { candidates } = await import("../myRankings/rankRoster").then((m) => m.teamCandidatesOf(session.account.characters, []));
      const candidate = candidates.find((c) => c.id === team.teamId)!;
      const blank = await scoreTeamCandidate(candidate, characters, echoes, { autoTeamBuffs: true, enemy: session.enemy });
      expect(team.mainOnlyGain).toBeCloseTo(blank.avgDamage / team.base - 1, 12);

      // a pending row, on request: the same model, and the first row's figure again from the job
      const pending = result.rows.find((r) => r.teamPending)!;
      const asked = await farmTeam(session, pending.characterId, pending.slot, { draw: 1, autoTeamBuffs: true }, quiet);
      expect(asked.key).toBe(pending.key);
      expect(asked.team?.teamId).toBe(team.teamId);
      expect(asked.teamScorings).toBeGreaterThan(0);
      const again = await farmTeam(session, row.characterId, row.slot, { draw: 1, autoTeamBuffs: true }, quiet);
      expect(again.team).toEqual(team);
    },
    T,
  );
});

describe("Farm next: the worker job", () => {
  it(
    "runs as an Echo Lab job and answers a second ask from the cache",
    async () => {
      const posted: EchoLabResponse[] = [];
      const host = createEchoLabHost((m) => posted.push(m), { yieldMs: 0 });
      const job = { kind: "farmNext" as const, options: { characterIds: ["Zani"], teamSlots: 0, draw: 1 } };
      await host.onMessage({ type: "run", id: 1, job, account: clone() });
      await host.onMessage({ type: "run", id: 2, job, account: clone() });
      const results = posted.filter((m) => m.type === "result") as Array<Extract<EchoLabResponse, { type: "result" }>>;
      expect(results.map((r) => r.cached)).toEqual([false, true]);
      expect((results[0].result as { rows: FarmRow[] }).rows).toHaveLength(5);
      expect(posted.some((m) => m.type === "progress" && m.progress.phase === "farm")).toBe(true);
      expect(host.stats).toEqual({ runs: 1, cacheHits: 1 });
    },
    T,
  );
});
