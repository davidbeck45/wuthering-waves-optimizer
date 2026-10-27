// Wuthering Tools+ energy check × batch 1: Energy Regen as a floor inside the Echo Lab benchmark and the /account invest
// plan (the hooks in src/sim/echoLab/benchmarkScore.ts and src/sim/account/investPlan.ts). Public fixtures only.
import { beforeAll, describe, expect, it } from "vitest";
import labFixture from "../echoLab/__fixtures__/echoLabAccount.json";
import account from "../myRankings/__fixtures__/cartethyiaAccount.json";
import { createLabSession, type LabAccount } from "../echoLab/core";
import { benchmarkScore, type BenchmarkResult } from "../echoLab/benchmarkScore";
import { rankRoster, type RosterRanking } from "../myRankings/rankRoster";
import { investPlan } from "../account/investPlan";
import { menuEnergyRegen } from "./energyHave";

const T = 120_000;
const lab = labFixture as unknown as LabAccount;

describe("the Echo Lab benchmark with an ER floor", () => {
  let plain: BenchmarkResult;
  let short: BenchmarkResult;
  let met: BenchmarkResult;
  let have: number;
  beforeAll(async () => {
    have = (await menuEnergyRegen("Galbrena", lab.characters, lab.echoes))!;
    plain = await benchmarkScore(createLabSession(lab), "Galbrena", {}, { yieldMs: 0 });
    short = await benchmarkScore(createLabSession(lab), "Galbrena", { erNeeds: { Galbrena: have + 12 } }, { yieldMs: 0 });
    met = await benchmarkScore(createLabSession(lab), "Galbrena", { erNeeds: { Galbrena: 100 } }, { yieldMs: 0 });
  }, T);

  it("without a need nothing changes", () => {
    expect(plain.erNeed).toBeNull();
    expect(plain.erHave).toBeNull();
    expect(plain.notes[plain.notes.length - 1]).toMatch(/worth nothing/);
  });

  it("a need the build is short of discounts your build and spends reference rolls on ER", () => {
    expect(short.erNeed).toBeCloseTo(have + 12, 6);
    expect(short.erHave).toBeCloseTo(have, 6);
    expect(short.D).toBeCloseTo(plain.D * (1 - 0.12), 0); // 12 points short → × 0.88
    expect(short.reference.find((l) => l.key === "EnergyRegen")!.rolls).toBeGreaterThanOrEqual(2);
    expect(short.named[2]).toBe("EnergyRegen");
    expect(short.notes[short.notes.length - 1]).toMatch(/Energy Regen is a floor/);
    expect(short.perfect.some((l) => l.key === "EnergyRegen")).toBe(true);
  });

  it("a need already met scores as before", () => {
    expect(met.D).toBeCloseTo(plain.D, 6);
    expect(met.B).toBeLessThanOrEqual(plain.B + 1e-6);
    expect(met.reference.find((l) => l.key === "EnergyRegen")!.rolls).toBe(1);
  });
});

describe("the invest plan with an ER floor", () => {
  const characters: Record<string, any> = JSON.parse(JSON.stringify(account.characters));
  const echoes = JSON.parse(JSON.stringify(account.echoes));
  let ranking: RosterRanking;
  beforeAll(async () => {
    ranking = await rankRoster(characters, echoes, [], { investment: true, yieldToUi: false });
  }, T);
  const only = (r: RosterRanking): RosterRanking => ({ ...r, characters: r.characters.filter((c) => c.id === "Cartethyia") });

  it(
    "a character short on ER gets an Energy Regen roll as the substat to invest in; met, the plan is unchanged",
    async () => {
      const have = (await menuEnergyRegen("Cartethyia", characters, echoes))!;
      const base = await investPlan(characters, echoes, [], only(ranking), { yieldToUi: false });
      const short = await investPlan(characters, echoes, [], only(ranking), { yieldToUi: false, erNeeds: { Cartethyia: have + 8 } });
      const met = await investPlan(characters, echoes, [], only(ranking), { yieldToUi: false, erNeeds: { Cartethyia: have - 20 } });
      const sub = (p: typeof base) => p.items.find((i) => i.kind === "substat");
      expect(sub(base)?.substatKey).not.toBe("EnergyRegen");
      expect(sub(short)?.substatKey).toBe("EnergyRegen");
      expect(sub(short)!.gain).toBeCloseTo(1 / 0.92 - 1, 3); // one 9.4 % roll closes all 8 points
      expect(met.items.map((i) => [i.id, Math.round(i.gain * 1e6)])).toEqual(base.items.map((i) => [i.id, Math.round(i.gain * 1e6)]));
    },
    T,
  );
});
