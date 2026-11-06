// @vitest-environment node
// Wuthering Tools+ — a row of the optimizer reads what the calculator reads once it is equipped (hunt round 1). The scorer
// runs on each loadout's own stats, but buffs that scale on a stat through the AdditionalBase modifiers also land in the
// self-buff data the attacks read: Mornye's Critical Protocol (Crit Rate and Crit DMG per ER on one attack), her
// Interfered Marker (DMG per ER), Jingran's Fire of Life (a multiplier per HP on two attacks). Those were read from
// today's build, so every loadout was scored at today's ER or HP, the top five came back wrongly ordered and a row could
// promise 22.8 % more than Equip gave. Fixture data only: blank records, seeded synthetic echoes of real species.
import { describe, expect, it } from "vitest";
import { calcCharacterRotationDamage } from "../../calculator/characterRotation";
import { applyBuildFields } from "../../characters/buildFields";
import { draftBuildFields } from "../buildTeam/buildTeam";
import { inlineBackend, prepareMemberJob, type MemberJob } from "../buildTeam/headlessOptimizer";
import { RANKING_ENEMY } from "../myRankings/rankRoster";
import { objectiveOf, type BenchSource } from "./optimizerBench";
import { referenceOptimize } from "./referenceOptimizer";
import { syntheticPool } from "./testFixture";

/* eslint-disable @typescript-eslint/no-explicit-any */

const blank = { echoes: { 0: {}, 1: {}, 2: {}, 3: {}, 4: {} }, mainEcho: { echo: null, rank: 5 } };

interface Case {
  characterId: string;
  weapon: string;
  buffs: Record<string, { isEnabled: boolean; stacks?: number }>;
  mainEcho: string;
  sets: string[];
  seed: number;
  /** an edit of the rotation's actions */
  actions?: (actions: any[]) => any[];
}

async function prepare(c: Case): Promise<{ source: BenchSource; job: MemberJob; pool: any[] }> {
  const pool = syntheticPool(c.seed, 20, c.mainEcho, c.sets);
  const source: BenchSource = { characters: { [c.characterId]: { ...blank, weapon: c.weapon, buffs: c.buffs } }, echoes: pool };
  const found = (await objectiveOf(c.characterId, source, true))!;
  expect(found, c.characterId).not.toBeNull();
  const objective = c.actions ? { ...found, rotation: { ...found.rotation, actions: c.actions(found.rotation.actions as any[]) } } : found;
  const job = await prepareMemberJob({ characterId: c.characterId, characters: source.characters, inventoryEchoes: source.echoes, enemy: RANKING_ENEMY, objective, setKeys: c.sets, mainEchoKeys: [c.mainEcho] });
  return { source, job, pool };
}

/** What the calculator's rotation reads after Equip: the row's echoes and set bonuses on the character's record. */
async function calculatorReads(source: BenchSource, job: MemberJob, characterId: string, loadout: any[]): Promise<number> {
  const record = source.characters[characterId];
  const draft = draftBuildFields(record, loadout, job.buffConfig);
  const equipped = applyBuildFields(record, { ...draft, teamBuffs: record.teamBuffs });
  const calc = await calcCharacterRotationDamage(job.rotation, null, characterId, { ...source.characters, [characterId]: equipped }, RANKING_ENEMY, source.echoes);
  return Number(calc.damageAggregation.avgDamage ?? 0);
}

async function rowsAgainstCalculator(c: Case): Promise<Array<{ row: number; calc: number; er: number }>> {
  const { source, job, pool } = await prepare(c);
  const run = await inlineBackend().optimize(job, { pool, mainEchoKeys: [c.mainEcho], loadoutFormat: "Any", minStats: [], topN: 5 });
  expect(run.results.length).toBe(5);
  const rows: Array<{ row: number; calc: number; er: number }> = [];
  for (const r of run.results) rows.push({ row: r.targetValue, calc: await calculatorReads(source, job, c.characterId, r.loadout), er: r.energyRegen });
  return rows;
}

const mornye: Case = {
  characterId: "Mornye",
  weapon: "LustrousRazor",
  buffs: { CriticalProtocol: { isEnabled: true }, InterferedMarker: { isEnabled: true } },
  mainEcho: "ReactorHusk",
  sets: ["HaloofStarryRadiance", "MoonlitClouds"],
  seed: 61,
};

const expectParity = (rows: Array<{ row: number; calc: number }>): void => {
  for (const { row, calc } of rows) expect(Math.abs(row / calc - 1), `row ${row} against ${calc}`).toBeLessThan(1e-9);
  // the rows read as ranked: what Equip gives comes back in the same order
  const calcs = rows.map((r) => r.calc);
  expect(calcs).toEqual([...calcs].sort((a, b) => b - a));
};

describe("a top-five row reads what the calculator reads after Equip", () => {
  it("Mornye: Critical Protocol and Interfered Marker follow each loadout's ER", async () => {
    const rows = await rowsAgainstCalculator(mornye);
    // the rows differ in ER, or the check proves nothing
    expect(new Set(rows.map((r) => r.er.toFixed(3))).size).toBeGreaterThan(1);
    expectParity(rows);
  }, 60_000);

  it("Mornye, one buff at a time: the Crit Rate and Crit DMG of Critical Protocol, then the DMG of Interfered Marker", async () => {
    expectParity(await rowsAgainstCalculator({ ...mornye, buffs: { CriticalProtocol: { isEnabled: true } } }));
    expectParity(await rowsAgainstCalculator({ ...mornye, buffs: { InterferedMarker: { isEnabled: true } } }));
  }, 60_000);

  it("Jingran: Fire of Life follows each loadout's HP", async () => {
    expectParity(
      await rowsAgainstCalculator({ characterId: "Jingran", weapon: "LustrousRazor", buffs: { FireOfLife: { isEnabled: true } }, mainEcho: "ReactorHusk", sets: ["HaloofStarryRadiance", "MoonlitClouds"], seed: 67 }),
    );
  }, 60_000);

  it("Phrolova on Song of Feathered Trace: the set's ATK adds to Maestro's own on her Hecate hits", async () => {
    expectParity(await rowsAgainstCalculator({ characterId: "Phrolova", weapon: "Variation", buffs: { Maestro: { isEnabled: true }, StatBonusATK1: { isEnabled: true }, StatBonusATK2: { isEnabled: true } }, mainEcho: "ThousandPuppetPavilion", sets: ["SongofFeatheredTrace"], seed: 71 }));
  }, 60_000);

  it("an action with its own buffs reads them on the loadout's ER too (it read no Critical Protocol at all)", async () => {
    const withOverride = (actions: any[]): any[] => actions.map((a) => (a.key === "CriticalProtocolDMG" ? { ...a, advancedConfig: { buffs: { InterferedMarker: { isEnabled: false } } } } : a));
    const rows = await rowsAgainstCalculator({ ...mornye, actions: withOverride });
    expect(new Set(rows.map((r) => r.er.toFixed(3))).size).toBeGreaterThan(1);
    expectParity(rows);
  }, 60_000);

  it("the bound still keeps the reference loop's top five with the scorer on each loadout's own buffs", async () => {
    const { job, pool } = await prepare(mornye);
    const request = { pool, mainEchoKeys: [mornye.mainEcho], loadoutFormat: "Any" as const, minStats: [], topN: 5 };
    const before = referenceOptimize(job, request);
    const after = await inlineBackend().optimize(job, request);
    expect(after.results.map((r) => [r.targetValue, r.loadout.map((e) => e.echoId)])).toEqual(before.results.map((r) => [r.targetValue, r.loadout.map((e) => e.echoId)]));
    expect(after.pruned ?? 0).toBeGreaterThan(0);
  }, 120_000);
});
