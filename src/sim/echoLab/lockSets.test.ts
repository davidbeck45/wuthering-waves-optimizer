// Wuthering Tools+ Echo Lab — the lock-set reader (lockSets.ts): every way to lock an echo for a Transducer re-roll,
// first on a formula where the truth can be counted outcome by outcome, then on the public test account against the real
// engine, the same tries on both sides so sampling plays no part.
import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/echoLabAccount.json";
import { SUBSTAT_KEYS, type SubstatKey } from "../substats/substatWeights";
import { createLabSession, type LabAccount } from "./core";
import { seededRandom } from "./fingerprint";
import { lineModel, lineTable } from "./lineModel";
import { bitCount, lockSetReader, maskFields, MAX_TRIES, type HeldLine, type LockSetReader } from "./lockSets";
import { echoLockSets, rerollAdvice } from "./rerollAdvice";
import { enumerateOutcomes, sampleOutcome, tierOdds, type NewLine } from "./rolls";

const account = fixture as unknown as LabAccount;
const clone = (): LabAccount => JSON.parse(JSON.stringify(account));
const quiet = { yieldMs: 0 };
const T = 60_000;

const tier = (key: SubstatKey, t: number): number => {
  const { values } = tierOdds(key);
  return values[t < 0 ? values.length + t : t];
};

/** ATK% and flat ATK add inside one part, Crit Rate and Crit DMG make a product (capped at 100 %), a Skill, a Basic and
 *  a Heavy DMG Bonus each lift their share of the hits. Everything else does nothing. */
const damage = (lines: ReadonlyArray<{ key: string; value: number }>): number => {
  const of = (key: SubstatKey): number => lines.find((l) => l.key === key)?.value ?? 0;
  const atk = 1000 * (1 + (40 + of("ATK")) / 100) + of("ATK_FLAT");
  const crit = 1 + (Math.min(100, 55 + of("CritRate")) / 100) * ((70 + of("CritDMG")) / 100);
  const bonus = 0.4 * (1 + (30 + of("ResonanceSkillDMGBonus")) / 100) + 0.3 * (1 + (30 + of("BasicAttackDMGBonus")) / 100) + 0.3 * (1 + (30 + of("HeavyAttackDMGBonus")) / 100);
  return atk * crit * bonus;
};

const LIVE: SubstatKey[] = ["CritRate", "CritDMG", "ATK", "ATK_FLAT", "ResonanceSkillDMGBonus", "BasicAttackDMGBonus", "HeavyAttackDMGBonus"];

async function readerFor(lines: HeldLine[], options: { anchored?: boolean; canRepeat?: boolean; exactLimit?: number; samples?: number } = {}): Promise<LockSetReader> {
  const ctx = damage([]);
  const table = await lineTable(ctx, async (key, value) => damage([{ key, value }]));
  const model = await lineModel(ctx, table, async (ls) => damage(ls), 5);
  const full = (1 << lines.length) - 1;
  const anchors = new Float64Array(full + 1);
  for (let mask = 0; mask <= full; mask++) anchors[mask] = damage(lines.filter((_, i) => mask & (1 << i)));
  return lockSetReader({
    model,
    lines,
    base: damage(lines),
    anchors: options.anchored === false ? undefined : anchors,
    canRepeat: options.canRepeat,
    exactLimit: options.exactLimit,
    samples: options.samples,
    seed: "test",
  });
}

/** an echo with both crit lines, a good ATK % line and two lines that do nothing */
const ECHO: HeldLine[] = [
  { field: 1, key: "CritRate", value: tier("CritRate", 3) },
  { field: 2, key: "CritDMG", value: tier("CritDMG", 2) },
  { field: 3, key: "ATK", value: tier("ATK", 5) },
  { field: 4, key: "DEF_FLAT", value: tier("DEF_FLAT", 1) },
  { field: 5, key: "HP", value: tier("HP", 4) },
];
const maskOf = (lines: readonly HeldLine[], keys: readonly string[]): number => lines.reduce((m, l, i) => (keys.includes(l.key) ? m | (1 << i) : m), 0);

/** the truth for a lock set, counted outcome by outcome through the formula */
function truth(lines: readonly HeldLine[], mask: number, canRepeat = true): { pImprove: number; expectedGain: number; expectedChange: number; max: number } {
  const kept = lines.filter((_, i) => mask & (1 << i));
  const closed = new Set(kept.map((l) => l.key));
  if (!canRepeat) for (const l of lines) closed.add(l.key);
  const pool = SUBSTAT_KEYS.filter((k) => !closed.has(k));
  const base = damage(lines);
  let p = 0;
  let gain = 0;
  let change = 0;
  let max = -Infinity;
  for (const o of enumerateOutcomes(pool, lines.length - kept.length)) {
    const d = damage([...kept, ...o.lines]) / base - 1;
    change += d * o.p;
    if (d > 1e-9) {
      p += o.p;
      gain += d * o.p;
    }
    max = Math.max(max, d);
  }
  return { pImprove: p, expectedGain: gain, expectedChange: change, max };
}

describe("The lock-set reader, on a known formula", () => {
  it("reads 31 lock sets of five lines, and says which fields each keeps", async () => {
    const reader = await readerFor(ECHO);
    expect(reader.masks).toHaveLength(31);
    expect(reader.masks).not.toContain(31);
    expect(maskFields(ECHO, 0b00011)).toEqual({ locked: [1, 2], rerolled: [3, 4, 5] });
    expect(bitCount(0b10110)).toBe(3);
  });

  it("gives one result exactly as the formula does, whatever the new lines are", async () => {
    const reader = await readerFor(ECHO);
    const base = damage(ECHO);
    const rng = seededRandom("one-result");
    for (const mask of [0b00011, 0b00111, 0b01111, 0b00001, 0]) {
      const kept = ECHO.filter((_, i) => mask & (1 << i));
      const pool = SUBSTAT_KEYS.filter((k) => !kept.some((l) => l.key === k));
      for (let i = 0; i < 60; i++) {
        const fresh = sampleOutcome(rng, pool, ECHO.length - kept.length);
        const exact = damage([...kept, ...fresh]) / base - 1;
        // three or more stats inside one part of the formula are the model's only slack: under 0.01 points here
        expect(Math.abs(reader.changeOf(mask, fresh) - exact)).toBeLessThan(1e-4);
      }
    }
    // new lines that do nothing: exactly the kept lines' own score, no model in it
    expect(reader.changeOf(0b00011, [{ key: "DEF", value: tier("DEF", 0) }, { key: "HP_FLAT", value: tier("HP_FLAT", 3) }])).toBe(damage(ECHO.slice(0, 2)) / base - 1);
    expect(() => reader.changeOf(0b00011, [{ key: "ATK", value: 1.23 }])).toThrow(/not a tier/);
  });

  it("counts a lock set's outcomes to the formula's own figures", async () => {
    const reader = await readerFor(ECHO);
    for (const keys of [["CritRate", "CritDMG", "ATK", "DEF_FLAT"], ["CritRate", "CritDMG", "ATK"], ["CritRate", "CritDMG"], ["CritDMG", "ATK"]]) {
      const mask = maskOf(ECHO, keys);
      const got = reader.stats(mask);
      const want = truth(ECHO, mask);
      expect(got.sampled).toBe(false);
      expect(got.locks).toBe(keys.length);
      // three DMG Bonus lines on one echo are the model's only slack here: a result a hair from "no change" can land on
      // the other side of it (under 0.01 points of chance), the gains agree to a few millionths
      expect(Math.abs(got.pImprove - want.pImprove)).toBeLessThan(1e-4);
      expect(Math.abs(got.expectedGain - want.expectedGain)).toBeLessThan(5e-6);
      expect(Math.abs(got.expectedChange - want.expectedChange)).toBeLessThan(5e-6);
      expect(Math.abs(got.max - want.max)).toBeLessThan(1e-4);
    }
  });

  it("re-rolling lines that do nothing can only help; re-rolling good ones mostly hurts", async () => {
    const reader = await readerFor(ECHO);
    const two = reader.stats(maskOf(ECHO, ["CritRate", "CritDMG"]));
    const three = reader.stats(maskOf(ECHO, ["CritRate", "CritDMG", "ATK"]));
    // with the three good lines kept, every result is at least the echo as it is
    expect(three.min).toBeCloseTo(0, 12);
    expect(three.expectedGain).toBeCloseTo(three.expectedChange, 12);
    expect(two.min).toBeLessThan(0);
    expect(two.expectedGain).toBeGreaterThan(two.expectedChange);
    // locking a line that does nothing is never better than leaving it to the re-roll
    const withDead = reader.stats(maskOf(ECHO, ["CritRate", "CritDMG", "DEF_FLAT"]));
    expect(withDead.expectedGain).toBeLessThanOrEqual(two.expectedGain + 1e-12);
    expect(reader.stats(maskOf(ECHO, ["CritRate", "CritDMG", "ATK", "DEF_FLAT"])).expectedGain).toBeLessThanOrEqual(three.expectedGain + 1e-12);
  });

  it("without the engine's score of the kept lines, a result that changes nothing can read as a change", async () => {
    // three DMG Bonus lines sit in one part of the formula: the model's figure for the kept four is a hair off the truth
    const lines: HeldLine[] = [
      { field: 1, key: "ATK", value: tier("ATK", -1) },
      { field: 2, key: "HeavyAttackDMGBonus", value: tier("HeavyAttackDMGBonus", -1) },
      { field: 3, key: "ResonanceSkillDMGBonus", value: tier("ResonanceSkillDMGBonus", -1) },
      { field: 4, key: "BasicAttackDMGBonus", value: tier("BasicAttackDMGBonus", -1) },
      { field: 5, key: "DEF_FLAT", value: tier("DEF_FLAT", 0) },
    ];
    const nothing = [{ key: "HP", value: tier("HP", 0) }];
    const anchored = await readerFor(lines);
    expect(anchored.changeOf(0b01111, nothing)).toBe(0);
    const modelOnly = await readerFor(lines, { anchored: false });
    expect(modelOnly.changeOf(0b01111, nothing)).not.toBe(0);
    expect(Math.abs(modelOnly.changeOf(0b01111, nothing))).toBeLessThan(1e-3);
  });

  it("draws tries when there are too many outcomes to count, the same ones every run, close to the count", async () => {
    const counted = await readerFor(ECHO, { exactLimit: Infinity });
    const drawn = await readerFor(ECHO, { exactLimit: 0, samples: 40_000 });
    for (const mask of [maskOf(ECHO, ["CritRate", "CritDMG"]), maskOf(ECHO, ["CritDMG"]), 0]) {
      const a = counted.stats(mask);
      const b = drawn.stats(mask);
      expect(a.sampled).toBe(false);
      expect(b).toMatchObject({ sampled: true, outcomes: 40_000 });
      expect(Math.abs(a.pImprove - b.pImprove)).toBeLessThan(0.01);
      expect(Math.abs(a.expectedGain - b.expectedGain)).toBeLessThan(0.0006);
      expect(drawn.stats(mask)).toEqual(b);
    }
    // at the shipped limit: seven stats count here, so re-rolling all five lines is too many outcomes and is drawn,
    // while every plan that keeps two lines or more is counted
    const shipped = await readerFor(ECHO);
    expect(shipped.stats(0).sampled).toBe(true);
    expect(shipped.masks.filter((m) => bitCount(m) >= 2).every((m) => !shipped.stats(m).sampled)).toBe(true);
  });

  it("a run of tries with the same locks is the best of that many draws", async () => {
    const reader = await readerFor(ECHO);
    const mask = maskOf(ECHO, ["CritRate", "CritDMG"]);
    const s = reader.stats(mask);
    const d = reader.detail(mask, s);
    expect(d.bestOf).toHaveLength(MAX_TRIES);
    expect(d.bestOf[0]).toBeCloseTo(s.expectedGain, 12);
    for (let i = 1; i < d.bestOf.length; i++) {
      expect(d.bestOf[i]).toBeGreaterThan(d.bestOf[i - 1]);
      // each further try adds less than the one before
      if (i > 1) expect(d.bestOf[i] - d.bestOf[i - 1]).toBeLessThan(d.bestOf[i - 1] - d.bestOf[i - 2] + 1e-12);
      expect(d.bestOf[i]).toBeLessThanOrEqual(d.top.gain + 1e-12);
    }
    // two tries against the formula: E[max(0, a, b)] over every pair of outcomes of one line (four kept, one re-rolled)
    const four = maskOf(ECHO, ["CritRate", "CritDMG", "ATK", "DEF_FLAT"]);
    const kept = ECHO.filter((_, i) => four & (1 << i));
    const pool = SUBSTAT_KEYS.filter((k) => !kept.some((l) => l.key === k));
    const outcomes = [...enumerateOutcomes(pool, 1)].map((o) => ({ d: damage([...kept, ...o.lines]) / damage(ECHO) - 1, p: o.p }));
    let twoTries = 0;
    for (const a of outcomes) for (const b of outcomes) twoTries += Math.max(0, a.d, b.d) * a.p * b.p;
    // 512 bins between "no change" and the best result: a few thousandths of a point
    expect(Math.abs(reader.detail(four).bestOf[1] - twoTries)).toBeLessThan(5e-5);
    expect(d.p10).toBeLessThanOrEqual(d.p50);
    expect(d.p50).toBeLessThanOrEqual(d.p90);
    expect(d.p90).toBeLessThanOrEqual(s.max + 1e-12);
  });

  it("names the best result a lock set can give, and how rare it is", async () => {
    const reader = await readerFor(ECHO);
    const mask = maskOf(ECHO, ["CritRate", "CritDMG"]);
    const s = reader.stats(mask);
    const { top } = reader.detail(mask, s);
    expect(top.gain).toBeCloseTo(s.max, 12);
    expect(top.lines).toHaveLength(3);
    for (const l of top.lines) {
      expect(LIVE).toContain(l.key);
      expect(l.value).toBe(tier(l.key, -1));
      expect(["CritRate", "CritDMG"]).not.toContain(l.key);
    }
    // three given stats out of the eleven left, each at its top tier
    const typeChance = 1 / 165;
    const tierChance = top.lines.reduce((p, l) => p * tierOdds(l.key).probs[tierOdds(l.key).values.length - 1], 1);
    expect(top.chance).toBeCloseTo(typeChance * tierChance, 12);
  });

  it("reads a held line whose value is no tier of the game off the straight line between tiers", async () => {
    const between = (tier("ATK", 2) + tier("ATK", 3)) / 2;
    const lines: HeldLine[] = [{ field: 1, key: "ATK", value: between }, ...ECHO.slice(0, 2).map((l, i) => ({ ...l, field: i + 2 })), { field: 4, key: "DEF_FLAT", value: 40 }, { field: 5, key: "HP", value: 9 }];
    const reader = await readerFor(lines, { anchored: false });
    // keep the ATK % line, re-roll the rest into nothing: the model's figure for it is the formula's (damage is linear in ATK %)
    expect(reader.changeOf(0b00001, [])).toBeCloseTo(damage([lines[0]]) / damage(lines) - 1, 9);
  });

  it("can keep a re-rolled line from coming back as the stat it was", async () => {
    const mask = maskOf(ECHO, ["CritRate", "CritDMG"]);
    const may = (await readerFor(ECHO)).stats(mask);
    const mayNot = (await readerFor(ECHO, { canRepeat: false })).stats(mask);
    const want = truth(ECHO, mask, false);
    expect(Math.abs(mayNot.pImprove - want.pImprove)).toBeLessThan(1e-4);
    expect(Math.abs(mayNot.expectedGain - want.expectedGain)).toBeLessThan(5e-6);
    // the ATK % line can no longer come back, so the echo is harder to beat
    expect(mayNot.pImprove).toBeLessThan(may.pImprove);
    const top = (await readerFor(ECHO, { canRepeat: false })).detail(mask).top;
    expect(top.lines.map((l) => l.key)).not.toContain("ATK");
  });
});

describe("The lock-set reader, against the engine on the public test account", () => {
  it(
    "lands each result within 0.03 points of the echo scored by the engine, the same tries on both sides",
    async () => {
      const session = createLabSession(clone());
      const rng = seededRandom("engine-check");
      let worst = 0;
      let flips = 0;
      let tries = 0;
      for (const slot of [0, 1, 3]) {
        const sets = await echoLockSets(session, "Galbrena", slot, {}, quiet);
        const advice = await rerollAdvice(session, "Galbrena", slot, {}, quiet);
        for (const plan of advice.plans) {
          const mask = sets.lines.reduce((m, l, i) => (plan.lockedFields.includes(l.field) ? m | (1 << i) : m), 0);
          const kept = sets.lines.filter((_, i) => mask & (1 << i));
          const pool = SUBSTAT_KEYS.filter((k) => !kept.some((l) => l.key === k));
          for (let i = 0; i < 12; i++) {
            const fresh: NewLine[] = sampleOutcome(rng, pool, sets.lines.length - kept.length);
            const engine = (await sets.scoreLines([...kept, ...fresh])) / sets.base - 1;
            const model = sets.reader.changeOf(mask, fresh);
            worst = Math.max(worst, Math.abs(model - engine));
            if (engine > 1e-9 !== model > 1e-9) flips += 1;
            tries += 1;
          }
        }
      }
      expect(tries).toBe(180);
      expect(worst).toBeLessThan(3e-4);
      expect(flips).toBeLessThanOrEqual(2);
    },
    T,
  );

  it(
    "picks, for each number of kept lines, the best of every way to keep that many",
    async () => {
      // Galbrena's Nimbus Wraith (slot 2) carries lines her damage does not use: a re-roll pays
      const advice = await rerollAdvice(createLabSession(clone()), "Galbrena", 2, {}, quiet);
      expect(advice.recommended).not.toBeNull();
      expect(advice.allPlans).toHaveLength(31);
      expect(advice.plans.map((p) => p.locks)).toEqual([4, 3, 2, 1, 0]);
      for (const plan of advice.plans) {
        const same = advice.allPlans.filter((p) => p.locks === plan.locks);
        expect(same).toHaveLength([1, 5, 10, 10, 5][plan.locks]);
        expect(plan.expectedGain).toBe(Math.max(...same.map((p) => p.expectedGain)));
        expect(plan.bestOf[0]).toBeCloseTo(plan.expectedGain, 12);
        expect(plan.lockedFields.length + plan.rerolledFields.length).toBe(5);
      }
      // the best per Transducer over all 31 is one of the five: a try's cost depends only on how many lines are kept
      const paying = advice.allPlans.filter((p) => p.expectedGain >= 0.0005);
      expect(advice.recommended?.gainPerTransducer).toBe(Math.max(...paying.map((p) => p.gainPerTransducer)));
      expect(advice.allPlans[0].gainPerTransducer).toBe(advice.recommended?.gainPerTransducer);
    },
    T,
  );
});
