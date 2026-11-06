// Wuthering Tools+ Echo Lab — the line model (lineModel.ts): first against a formula with the three ways lines meet in
// the damage engine, then against whole echoes scored by the real engine on the public test account (echoLabAccount.json).
// The whole-echo tests draw the very outcomes the shipped code reads (same seed, same order), so each try is compared one
// to one and sampling error plays no part.
import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/echoLabAccount.json";
import { scoreTeamCandidate, teamCandidatesOf } from "../myRankings/rankRoster";
import { SUBSTAT_KEYS, type SubstatKey } from "../substats/substatWeights";
import { createLabSession, echoLines, prepareCharacter, scoreBuild, swapInto, withInventoryRecord, withLines, withSlotRecord, type LabAccount, type LabCharacter, type LabSession } from "./core";
import { farmNext, rollout, type FarmRow } from "./farmNext";
import { seededRandom } from "./fingerprint";
import { freshSeed, MIN_PAIR_WORTH, lineFactor, lineModel, lineOutcomes, lineTable, type LineModel, type LineScorer } from "./lineModel";
import { linesPlan } from "./rerollAdvice";
import { outcomeCount, sampleOutcome, tierOdds, type NewLine } from "./rolls";

const account = fixture as unknown as LabAccount;
const clone = (): LabAccount => JSON.parse(JSON.stringify(account));
const quiet = { yieldMs: 0 };
const T = 60_000;
const PROBE = "__line_model_probe__";

const line = (key: SubstatKey, tier: number): NewLine => {
  const { values } = tierOdds(key);
  return { key, value: values[tier < 0 ? values.length + tier : tier] };
};

/** The three ways lines meet: ATK% and flat ATK add inside one part, Crit Rate and Crit DMG make a product, a DMG Bonus
 *  multiplies the rest. Flat DEF does nothing. */
const damage = (lines: readonly NewLine[]): number => {
  const of = (key: SubstatKey): number => lines.find((l) => l.key === key)?.value ?? 0;
  const atk = 1000 * (1 + (40 + of("ATK")) / 100) + of("ATK_FLAT");
  const crit = 1 + ((55 + of("CritRate")) / 100) * ((70 + of("CritDMG")) / 100);
  return atk * crit * (1 + (30 + of("ResonanceSkillDMGBonus")) / 100);
};

async function formulaModel(draw = 5): Promise<{ model: LineModel; table: Map<SubstatKey, number[]>; runs: NewLine[][] }> {
  const runs: NewLine[][] = [];
  const ctx = damage([]);
  const table = await lineTable(ctx, async (key, value) => damage([{ key, value }]));
  const model = await lineModel(ctx, table, async (lines) => (runs.push(lines), damage(lines)), draw);
  return { model, table, runs };
}

describe("The line model, on a known formula", () => {
  it("scores two stats together only when both count, and not at all for one line", async () => {
    const { model, runs } = await formulaModel();
    // five stats count here (ATK, flat ATK, Crit Rate, Crit DMG, the DMG Bonus): ten pairs, each at both top tiers
    expect(runs).toHaveLength(10);
    expect(model.pairRuns).toBe(10);
    for (const lines of runs) {
      expect(lines).toHaveLength(2);
      for (const l of lines) expect(l.value).toBe(line(l.key, -1).value);
      expect(lines.map((l) => l.key)).not.toContain("DEF_FLAT");
    }
    expect((await formulaModel(1)).runs).toEqual([]);
  });

  it("leaves out two stats too small to move a figure", async () => {
    const ctx = 1000;
    const table = new Map(SUBSTAT_KEYS.map((k) => [k, tierOdds(k).values.map(() => ctx)] as [SubstatKey, number[]]));
    const tiny = Math.sqrt(MIN_PAIR_WORTH) / 2;
    table.set("ATK", tierOdds("ATK").values.map(() => ctx * (1 + tiny)));
    table.set("HP", tierOdds("HP").values.map(() => ctx * (1 + tiny)));
    expect((await lineModel(ctx, table, async () => ctx)).pairRuns).toBe(0);
  });

  it("reads each kind of pair right: none across parts, below 0 inside one part, above 0 for the crit product", async () => {
    const { model } = await formulaModel();
    const at = (a: SubstatKey, b: SubstatKey): number => model.pair[SUBSTAT_KEYS.indexOf(a) * SUBSTAT_KEYS.length + SUBSTAT_KEYS.indexOf(b)];
    expect(at("ATK", "ResonanceSkillDMGBonus")).toBeCloseTo(0, 12);
    expect(at("CritRate", "ATK")).toBeCloseTo(0, 12);
    expect(at("ATK", "ATK_FLAT")).toBeLessThan(0);
    expect(at("CritRate", "CritDMG")).toBeGreaterThan(0);
    expect(at("CritDMG", "CritRate")).toBe(at("CritRate", "CritDMG"));
    expect(at("DEF_FLAT", "ATK")).toBe(0);
  });

  it("is the score itself for no line, one line and a pair at both top tiers", async () => {
    const { model } = await formulaModel();
    expect(lineFactor(model, [])).toBe(1);
    for (const key of SUBSTAT_KEYS) for (const tier of [0, -1]) expect(lineFactor(model, [line(key, tier)]) * model.ctx).toBeCloseTo(damage([line(key, tier)]), 6);
    const both = [line("CritRate", -1), line("CritDMG", -1)];
    expect(lineFactor(model, both) * model.ctx).toBeCloseTo(damage(both), 6);
    // the order of the lines does not matter
    const five = [line("ATK", 3), line("CritDMG", 2), line("ATK_FLAT", 1), line("CritRate", 5), line("DEF", 0)];
    expect(lineFactor(model, [...five].reverse())).toBeCloseTo(lineFactor(model, five), 12);
  });

  it("stays within 0.01 % of the formula on five-line echoes, where a sum and a plain product do not", async () => {
    const { model, table } = await formulaModel();
    const plain = { ...model, pair: new Float64Array(model.pair.length) };
    const added = (lines: readonly NewLine[]): number =>
      1 + lines.reduce((s, l) => s + (table.get(l.key)![tierOdds(l.key).values.indexOf(l.value)] / model.ctx - 1), 0);
    const rng = seededRandom("formula");
    let worst = 0;
    let worstPlain = 0;
    let worstAdded = 0;
    for (let i = 0; i < 3000; i++) {
      const lines = sampleOutcome(rng, SUBSTAT_KEYS, 5);
      const truth = damage(lines) / model.ctx;
      worst = Math.max(worst, Math.abs(lineFactor(model, lines) / truth - 1));
      worstPlain = Math.max(worstPlain, Math.abs(lineFactor(plain, lines) / truth - 1));
      worstAdded = Math.max(worstAdded, Math.abs(added(lines) / truth - 1));
    }
    expect(worst).toBeLessThan(1e-4);
    expect(worstPlain).toBeGreaterThan(20 * worst);
    expect(worstAdded).toBeGreaterThan(worstPlain);
  });

  it("reads outcomes against the base it is given, every one when there are few, else seeded tries", async () => {
    const { model } = await formulaModel();
    const one = lineOutcomes(model, model.ctx * 2, SUBSTAT_KEYS, 1, 20000, "seed");
    expect(one).toHaveLength(outcomeCount(SUBSTAT_KEYS, 1));
    expect(one.reduce((s, [, w]) => s + w, 0)).toBeCloseTo(1, 10);
    // at twice the base a dead line reads as half
    expect(one.some(([g]) => Math.abs(g + 0.5) < 1e-12)).toBe(true);
    const five = lineOutcomes(model, model.ctx, SUBSTAT_KEYS, 5, 300, "seed");
    expect(five).toHaveLength(300);
    expect(lineOutcomes(model, model.ctx, SUBSTAT_KEYS, 5, 300, "seed")).toEqual(five);
    expect(lineOutcomes(model, model.ctx, SUBSTAT_KEYS, 5, 300, "other")).not.toEqual(five);
  });
});

// ── against the engine ──

interface Paired {
  worst: number;
  /** E[max(0, change)] and the chance of a gain, by the shipped model and by the engine */
  gain: number;
  gainEngine: number;
  gainSum: number;
  chance: number;
  chanceEngine: number;
}

/** Model figures against whole outcomes through `score`, try by try. `pairs` are the shipped code's own, in draw order. */
// eslint-disable-next-line no-unused-vars -- the parameters of a function type
async function paired(pairs: Array<[number, number]>, draws: NewLine[][], base: number, score: LineScorer, sum: (lines: NewLine[]) => number): Promise<Paired> {
  expect(pairs).toHaveLength(draws.length);
  const out: Paired = { worst: 0, gain: 0, gainEngine: 0, gainSum: 0, chance: 0, chanceEngine: 0 };
  for (let i = 0; i < draws.length; i++) {
    const engine = (await score(draws[i])) / base - 1;
    const model = pairs[i][0];
    out.worst = Math.max(out.worst, Math.abs(model - engine));
    out.gain += Math.max(0, model);
    out.gainEngine += Math.max(0, engine);
    out.gainSum += Math.max(0, sum(draws[i]));
    out.chance += model > 1e-12 ? 1 : 0;
    out.chanceEngine += engine > 1e-12 ? 1 : 0;
  }
  for (const k of ["gain", "gainEngine", "gainSum", "chance", "chanceEngine"] as const) out[k] /= draws.length;
  return out;
}

const drawsOf = (pool: readonly SubstatKey[], k: number, n: number, seed: string): NewLine[][] => {
  const rng = seededRandom(seed);
  return Array.from({ length: n }, () => sampleOutcome(rng, pool, k));
};

/** What a whole-echo check must show: the model within 0.03 points on every try, its means on the engine's, and closer
 *  than adding the lines by a long way. Figures in the README; on this fixture the worst try is about 0.01 points. */
function expectMatch(p: Paired, label: string): void {
  expect(p.worst, `${label}: worst try`).toBeLessThan(3e-4);
  expect(Math.abs(p.gain - p.gainEngine), `${label}: expected gain`).toBeLessThan(1e-4);
  expect(Math.abs(p.chance - p.chanceEngine), `${label}: chance`).toBeLessThan(0.015);
  if (p.gainEngine > 1e-3) expect(Math.abs(p.gainSum - p.gainEngine), `${label}: a sum is further off`).toBeGreaterThan(5 * Math.abs(p.gain - p.gainEngine));
}

/** The row's fresh echo, as Farm next scores it: its clone and a scorer of its lines. */
async function freshEcho(session: LabSession, row: FarmRow): Promise<{ lab: LabCharacter; record: Record<string, any>; characters: Record<string, any>; blank: any[] }> {
  const lab = (await prepareCharacter(session, row.characterId))!;
  const record = withLines({ echoId: PROBE, echo: row.target.species[0], type: row.target.cost, rank: 5, stat: row.target.main, echoSet: row.target.set }, []);
  const blank = withInventoryRecord(session.account.echoes, record);
  return { lab, record, characters: swapInto(session, lab, blank, PROBE, row.slot), blank };
}

// eslint-disable-next-line no-unused-vars -- the parameters of a function type
async function modelOf(ctx: number, keys: readonly SubstatKey[], score: LineScorer, draw = 5): Promise<{ model: LineModel; sum: (lines: NewLine[]) => number }> {
  const table = await lineTable(ctx, (key, value) => score([{ key, value }]), new Set(), keys);
  const model = await lineModel(ctx, table, score, draw);
  const sum = (lines: NewLine[]): number => lines.reduce((s, l) => s + (table.get(l.key)![tierOdds(l.key).values.indexOf(l.value)] / ctx - 1), 0);
  return { model, sum };
}

describe("The line model against whole echoes through the engine", () => {
  const TRIES = 120;

  it(
    "Farm next: the shown figures come from this model, and each try lands on the engine's score of that whole echo",
    async () => {
      const session = createLabSession(clone());
      const { rows } = await farmNext(session, { teamSlots: 0 }, quiet);
      expect(rows.length).toBe(15);
      expect(rows[0].method).toBe("modelled");
      // the best, a middling and a weak slot, on different characters where the fixture allows
      for (const row of [rows[0], rows[6], rows[12]]) {
        const { lab, record, characters, blank } = await freshEcho(session, row);
        const score: LineScorer = (lines) => scoreBuild(session, lab, characters, withInventoryRecord(session.account.echoes, withLines(record, lines)));
        const ctx = await scoreBuild(session, lab, characters, blank);
        const { model, sum } = await modelOf(ctx, SUBSTAT_KEYS, score);
        // the row's own figures, read again from this model and the row's seed
        const seed = freshSeed(lab.id, row.slot);
        const again = rollout(model, lab.base, 5, 20000, seed);
        expect(again.expectedGain, row.key).toBeCloseTo(row.expectedGain, 10);
        expect(again.pBeat, row.key).toBeCloseTo(row.pBeat, 10);
        const draws = drawsOf(SUBSTAT_KEYS, 5, TRIES, `whole|${row.key}`);
        const pairs = lineOutcomes(model, lab.base, SUBSTAT_KEYS, 5, TRIES, `whole|${row.key}`);
        const ratio = ctx / lab.base;
        expectMatch(await paired(pairs, draws, lab.base, score, (lines) => ratio * (1 + sum(lines)) - 1), row.key);
      }
    },
    T,
  );

  it(
    "the re-roll advisor and the Tuner plan's fresh echoes: each plan's tries land on the engine's score of the lines",
    async () => {
      const session = createLabSession(clone());
      for (const [id, slot] of [["Zani", 0], ["Galbrena", 2]] as const) {
        const lab = (await prepareCharacter(session, id))!;
        const own = lab.slots[slot]!;
        const lines = echoLines(own.record);
        expect(lines).toHaveLength(5);
        const scoreLines = async (list: Array<{ key: string; value: number }>): Promise<number> => {
          const next = withSlotRecord(session, lab, slot, withLines(own.record, list));
          return scoreBuild(session, lab, next.characters, next.echoes);
        };
        // lock two and re-roll three, lock nothing and re-roll five, and a fresh echo's five against a whole slot
        for (const locks of [2, 0]) {
          const locked = lines.slice(0, locks);
          const rerolled = lines.slice(locks);
          const seed = `plan|${id}|${slot}|${locks}`;
          const pool = SUBSTAT_KEYS.filter((k) => !locked.some((l) => l.key === k));
          expect(outcomeCount(pool, rerolled.length)).toBeGreaterThan(TRIES);
          const pairs = await linesPlan(locked, rerolled, { scoreLines, base: lab.base, canRepeat: true, samples: TRIES, seed });
          const lockedLines = locked.map((l) => ({ key: l.key, value: l.value }));
          const score: LineScorer = (extra) => scoreLines([...lockedLines, ...extra]);
          const ctx = await scoreLines(lockedLines);
          const { sum } = await modelOf(ctx, pool, score, 1);
          const ratio = ctx / lab.base;
          expectMatch(await paired(pairs, drawsOf(pool, rerolled.length, TRIES, seed), lab.base, score, (extra) => ratio * (1 + sum(extra)) - 1), `${id} slot ${slot}, ${locks} locks`);
        }
      }
    },
    T,
  );

  it(
    "Farm next's team figure: each try lands on the team engine's score of that whole echo",
    async () => {
      // Cartethyia's wuwa_calc team, the two others armed so it can be fielded
      const next = clone();
      next.characters = { ...next.characters, Ciaccona: { weapon: "WoodlandAria" }, Chisa: { weapon: "Kumokiri" } };
      const session = createLabSession(next);
      const { rows } = await farmNext(session, { characterIds: ["Cartethyia"], teamSlots: 1 }, quiet);
      const row = rows[0];
      expect(row.team).not.toBeNull();
      const { record, characters, blank } = await freshEcho(session, row);
      const { candidates } = await teamCandidatesOf(session.account.characters, []);
      const candidate = candidates.find((c) => c.id === row.team!.teamId)!;
      const scoreInv = async (inv: any[]): Promise<number> => (await scoreTeamCandidate(candidate, characters, inv, { autoTeamBuffs: true, enemy: session.enemy })).avgDamage;
      const score: LineScorer = (lines) => scoreInv(withInventoryRecord(session.account.echoes, withLines(record, lines)));
      const ctx = await scoreInv(blank);
      const { model, sum } = await modelOf(ctx, SUBSTAT_KEYS, score);
      const base = row.team!.base;
      const seed = freshSeed(row.characterId, row.slot);
      expect(rollout(model, base, 5, 20000, seed).expectedGain).toBeCloseTo(row.team!.expectedGain, 10);
      const n = 40;
      const pairs = lineOutcomes(model, base, SUBSTAT_KEYS, 5, n, "whole|team");
      const ratio = ctx / base;
      expectMatch(await paired(pairs, drawsOf(SUBSTAT_KEYS, 5, n, "whole|team"), base, score, (lines) => ratio * (1 + sum(lines)) - 1), "team");
    },
    T,
  );
});
