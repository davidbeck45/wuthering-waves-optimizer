// Wuthering Tools+ Echo Lab on a small public test account (Cartethyia from the my-rankings fixture, Galbrena and
// Zani from upstream's Cypress golden fixtures, plus synthesised echoes whose ids start with "lab").
import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/echoLabAccount.json";
import { estimateEchoSwapImpact } from "../../echoes/echoImpact";
import { SUBSTAT_KEYS, maxRoll, type SubstatKey } from "../substats/substatWeights";
import {
  CANCELLED,
  createLabSession,
  legalSlots,
  prepareCharacter,
  relGain,
  scoreBuild,
  slotChecks,
  swapInto,
  type LabAccount,
} from "./core";
import { bestOwners, type BestOwnerResult } from "./bestOwner";
import { benchmarkScore, benchmarkScoreOf, placeSpread, withEchoLines } from "./benchmarkScore";
import { echoPotential } from "./echoPotential";
import { rerollAdvice } from "./rerollAdvice";
import { accountFingerprint, seededRandom, stableKey } from "./fingerprint";
import { choose, enumerateOutcomes, outcomeCount, remainingTypes, subsets, tierOdds } from "./rolls";
import { createEchoLabHost, type EchoLabResponse } from "./workerHost";
import { createEchoLabClient } from "./echoLabClient";

const account = fixture as unknown as LabAccount;
const clone = (): LabAccount => JSON.parse(JSON.stringify(account));
const quiet = { yieldMs: 0 };
const T = 60_000;

/** A copy of the account with one echo's record edited. */
// eslint-disable-next-line no-unused-vars -- the parameters of a function type
function withEcho(base: LabAccount, echoId: string, edit: (e: Record<string, any>) => void): LabAccount {
  const next = JSON.parse(JSON.stringify(base)) as LabAccount;
  const echo = next.echoes.find((e) => e.echoId === echoId);
  if (!echo) throw new Error(`no echo ${echoId}`);
  edit(echo);
  return next;
}

/** Results without the timing fields, for determinism checks. */
const timeless = (r: BestOwnerResult): unknown => JSON.parse(JSON.stringify({ ...r, ms: 0 }));

describe("the roll model", () => {
  it("carries Kuro's published tier odds", () => {
    expect(tierOdds("CritRate").probs.map((p) => Math.round(p * 300))).toEqual([70, 70, 70, 24, 24, 24, 9, 9]);
    expect(tierOdds("ATK").probs.map((p) => Math.round(p * 103))).toEqual([7, 8, 21, 25, 18, 15, 6, 3]);
    expect(tierOdds("ATK_FLAT").probs.map((p) => Math.round(p * 103))).toEqual([7, 54, 39, 3]);
    expect(tierOdds("DEF_FLAT").probs.map((p) => Math.round(p * 103))).toEqual([15, 46, 33, 9]);
    for (const key of SUBSTAT_KEYS) expect(tierOdds(key).probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it("enumerates every outcome of the lines still to roll, with probabilities summing to one", () => {
    const pool = remainingTypes(["CritRate", "CritDMG", "ATK", "ATK_FLAT"]);
    expect(pool).toHaveLength(9);
    expect(outcomeCount(pool, 1)).toBe(8 * 8 + 4); // eight 8-tier stats + flat DEF's four tiers
    const all = [...enumerateOutcomes(pool, 2)];
    expect(all).toHaveLength(outcomeCount(pool, 2));
    expect(all.reduce((s, o) => s + o.p, 0)).toBeCloseTo(1, 12);
    expect([...subsets([1, 2, 3, 4, 5], 3)]).toHaveLength(choose(5, 3));
  });

  it("fingerprints an account and seeds its samples deterministically", () => {
    expect(accountFingerprint(account)).toBe(accountFingerprint(clone()));
    expect(accountFingerprint(withEcho(account, "tmm72b568p", (e) => (e.echoSubStatsValue1 = 9.9)))).not.toBe(accountFingerprint(account));
    expect(stableKey({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(stableKey({ a: [2, { c: 4, d: 3 }], b: 1 }));
    const a = seededRandom("x");
    const b = seededRandom("x");
    expect(Array.from({ length: 5 }, a)).toEqual(Array.from({ length: 5 }, b));
  });
});

describe("swaps and the slot rules", () => {
  it("scores a swap exactly as upstream's swap-impact estimator does on the same rotation", async () => {
    const session = createLabSession(account);
    const lab = (await prepareCharacter(session, "Galbrena"))!;
    expect(lab.complete).toBe(true);
    // identity: the slot's own echo back in its slot changes nothing
    for (const s of lab.slots) {
      const avg = await scoreBuild(session, lab, swapInto(session, lab, account.echoes, s!.echoId!, s!.slot), account.echoes);
      expect(avg).toBeCloseTo(lab.base, 6);
    }
    const ours = relGain(lab.base, await scoreBuild(session, lab, swapInto(session, lab, account.echoes, "tmm72b568p", 2), account.echoes));
    const characters = { ...account.characters, Galbrena: { ...account.characters.Galbrena, rotations: [lab.rotation] } };
    const upstream = await estimateEchoSwapImpact("Galbrena", characters, { echoId: "tmm72b568p", slotIndex: 2 }, session.enemy, account.echoes, { target: `Rotation:${lab.rotation.id}` });
    expect(upstream?.pct).toBeCloseTo(ours, 9);
  }, T);

  it("keeps the main-echo slot to its species, a species once per build, set bonuses whole and Energy Regen above the floor", async () => {
    const session = createLabSession(account);
    const galbrena = (await prepareCharacter(session, "Galbrena"))!;
    const cartethyia = (await prepareCharacter(session, "Cartethyia"))!;
    const echo = (id: string) => session.echoById.get(id);
    expect(legalSlots(galbrena, echo("qag163ys2f"))).toEqual([0]); // a better Corrosaurus: the main slot it already fills
    expect(legalSlots(galbrena, echo("tmm72b568p"))).toEqual([2]); // a second Nimbus Wraith beside slot 2's is no slot
    // the Molten Rift 1-cost slot would break her Molten Rift 2-piece
    expect(slotChecks(galbrena, echo("28241qom1b")).map((c) => [c.slot, c.blocked])).toEqual([[2, null], [4, "set"]]);
    expect(legalSlots(galbrena, echo("9819cdpsri"))).toEqual([]); // she wears it
    expect(legalSlots(cartethyia, echo("labnoslot01"))).toEqual([]); // breaks her Windward Pilgrimage 5-piece
    expect(legalSlots(cartethyia, echo("labnoslot01"), { keepSetBonuses: false }).length).toBeGreaterThan(0);
    // her slot-2 echo carries 9.2 Energy Regen: losing it is within one ER roll, not within 5 points
    expect(slotChecks(galbrena, echo("tmm72b568p"))[0]).toMatchObject({ slot: 2, blocked: null, erChange: -9.2 });
    expect(slotChecks(galbrena, echo("tmm72b568p"), { erTolerance: 5 })[0].blocked).toBe("er");
    expect(slotChecks(galbrena, echo("tmm72b568p"), { erTolerance: null })[0].blocked).toBeNull();
  }, T);

  it("never trades a healer's Healing Bonus main echo for a damage copy of it (the engine reads healing as 0)", async () => {
    // Cartethyia's main echo relabelled Healing Bonus, and a Crit DMG copy of it with the same lines in the inventory
    const healer = withEcho(account, "xtbwqikno2", (e) => (e.stat = "HealingBonus"));
    const own = healer.echoes.find((e) => e.echoId === "xtbwqikno2")!;
    healer.echoes.push({ ...own, echoId: "labcdcopy01", stat: "CritDMG" });
    const session = createLabSession(healer);
    const cartethyia = (await prepareCharacter(session, "Cartethyia"))!;
    const copy = session.echoById.get("labcdcopy01");
    expect(slotChecks(cartethyia, copy).map((c) => [c.slot, c.blocked])).toEqual([[0, "heal"]]);
    expect(legalSlots(cartethyia, copy, { keepHealingBonus: false })).toEqual([0]);
    // the other way round (a Healing Bonus copy over a damage main stat) stays open: it only scores lower
    const session2 = createLabSession(withEcho(clone(), "xtbwqikno2", () => undefined));
    const plain = (await prepareCharacter(session2, "Cartethyia"))!;
    expect(slotChecks(plain, { ...copy, stat: "HealingBonus" }).map((c) => [c.slot, c.blocked])).toEqual([[0, null]]);

    const result = await bestOwners(session, { echoIds: ["labcdcopy01"], characterIds: ["Cartethyia"] }, quiet);
    const row = result.echoes[0];
    expect(row).toMatchObject({ legalOwners: 0, blocked: { set: 0, er: 0, heal: 1 } });
    expect(row.upgradeFor).toEqual([]);
  }, T);
});

describe("best owner", () => {
  it("judges every inventory echo: upgrades kept, worn kept, the rest spare or feed", async () => {
    const result = await bestOwners(createLabSession(account), {}, quiet);
    expect(result.echoes).toHaveLength(account.echoes.length);
    expect(result.characters.map((c) => c.id)).toEqual(["Cartethyia", "Galbrena", "Zani"]); // Augusta: no weapon
    const row = (id: string) => result.echoes.find((r) => r.echoId === id)!;

    const nimbus = row("tmm72b568p"); // a perfect Nimbus Wraith for Galbrena's 1-cost Flamewing's Shadow slot
    expect(nimbus).toMatchObject({ verdict: "keep", reason: "upgrade", upgradeFor: ["Galbrena"] });
    expect(nimbus.best).toMatchObject({ characterId: "Galbrena", slot: 2, replacedEchoId: "5vtv4cky74" });
    expect(nimbus.best!.gain).toBeGreaterThan(0.03);
    expect(nimbus.best!.damageGain).toBeCloseTo(nimbus.best!.avgDamage - nimbus.best!.base, 6);

    expect(row("labdeadwp01")).toMatchObject({ verdict: "feed", reason: "no-gain" });
    expect(row("labdeadwp01").best!.gain).toBeLessThan(-0.05);
    expect(row("labnoslot01")).toMatchObject({ verdict: "feed", reason: "no-slot", legalOwners: 0 });
    expect(row("labnoslot01").blocked.set).toBe(3);
    expect(row("labstale001")).toMatchObject({ verdict: "keep", reason: "worn", wornBy: [{ characterId: "Augusta", slot: 3, stale: true }] });

    for (const r of result.echoes) {
      if (r.wornBy.length) expect(r.verdict, `${r.echoId} is worn`).not.toBe("feed");
      expect(r.upgradeFor).toEqual(r.owners.filter((o) => o.gain > 0).map((o) => o.characterId));
      for (let i = 1; i < r.owners.length; i++) expect(r.owners[i - 1].gain).toBeGreaterThanOrEqual(r.owners[i].gain);
    }
    expect(result.counts.keep + result.counts.spare + result.counts.feed).toBe(account.echoes.length);
    // the four-line echo matches the perfect Nimbus on her: its missing fifth line would be HP, dead on an ATK scaler
    const galbrena = result.characters.find((c) => c.id === "Galbrena")!;
    expect(galbrena.bestUpgrade?.gain).toBeCloseTo(nimbus.best!.gain, 9);
    expect(row("labtune0004").best!.gain).toBeCloseTo(nimbus.best!.gain, 9);
  }, T);

  it("is deterministic, and a strictly better substat never lowers an echo's gain", async () => {
    const options = { echoIds: ["28241qom1b", "qy27jq1l5x", "labtune0003"] };
    const first = await bestOwners(createLabSession(account), options, quiet);
    const again = await bestOwners(createLabSession(clone()), options, quiet);
    expect(timeless(again)).toEqual(timeless(first));

    const gainOf = (r: BestOwnerResult, id: string) => r.echoes.find((e) => e.echoId === id)!.best!.gain;
    const better = withEcho(account, "28241qom1b", (e) => (e.echoSubStatsValue1 = 10.5)); // Crit Rate 6.3 → 10.5
    const worse = withEcho(account, "28241qom1b", (e) => (e.echoSubStatsValue4 = 0)); // flat ATK line gone
    const up = await bestOwners(createLabSession(better), { echoIds: ["28241qom1b"] }, quiet);
    const down = await bestOwners(createLabSession(worse), { echoIds: ["28241qom1b"] }, quiet);
    expect(gainOf(up, "28241qom1b")).toBeGreaterThan(gainOf(first, "28241qom1b"));
    expect(gainOf(down, "28241qom1b")).toBeLessThan(gainOf(first, "28241qom1b"));
  }, T);
});

describe("Tune or Feed (echo potential)", () => {
  it("an echo with all five lines is worth exactly what it is worth now", async () => {
    const p = await echoPotential(createLabSession(account), "tmm72b568p", { characterId: "Galbrena" });
    expect(p).toMatchObject({ method: "complete", remaining: 0, verdict: "done", outcomes: 1, slot: 2 });
    expect(p.expectedGain).toBe(p.current);
    expect([p.p10, p.p50, p.p90, p.best, p.worst]).toEqual([p.current, p.current, p.current, p.current, p.current]);
    expect(p.pBeat).toBe(p.current > 0 ? 1 : 0);
  }, T);

  it("enumerates a four-line echo exactly and samples a three-line one with a seed", async () => {
    const session = createLabSession(account);
    const exact = await echoPotential(session, "labtune0004", { characterId: "Galbrena", slot: 2 });
    expect(exact).toMatchObject({ method: "exact", remaining: 1, outcomes: 68, seed: null });
    expect(exact.worst).toBeLessThanOrEqual(exact.p10);
    expect(exact.p10).toBeLessThanOrEqual(exact.p50);
    expect(exact.p50).toBeLessThanOrEqual(exact.p90);
    expect(exact.p90).toBeLessThanOrEqual(exact.best);
    expect(exact.expectedGain).toBeGreaterThanOrEqual(exact.current); // a fifth line never costs damage
    expect(exact.cost).toMatchObject({ tuners: 10, approx: true });
    expect(exact.assumptions.join(" ")).toMatch(/uniformly/);

    const mc = await echoPotential(session, "labtune0003", { characterId: "Galbrena" }, { samples: 1000 });
    expect(mc).toMatchObject({ method: "monte-carlo", remaining: 2, outcomes: 1000 });
    expect(mc.seed).toBeTruthy();
    const again = await echoPotential(createLabSession(clone()), "labtune0003", { characterId: "Galbrena" }, { samples: 1000 });
    expect(again).toEqual(mc);
    await expect(echoPotential(session, "labnoslot01", { characterId: "Cartethyia" })).rejects.toThrow(/no slot/);
  }, T);
});

describe("re-roll advice", () => {
  it("ranks a dead line (flat DEF on an ATK scaler) first and prices every lock plan", async () => {
    // Galbrena's main Corrosaurus with its flat ATK line turned into flat DEF
    const dead = withEcho(account, "9819cdpsri", (e) => {
      const n = [1, 2, 3, 4, 5].find((i) => e[`echoSubStatsType${i}`] === "ATK_FLAT")!;
      e[`echoSubStatsType${n}`] = "DEF_FLAT";
      e[`echoSubStatsValue${n}`] = 70;
    });
    const advice = await rerollAdvice(createLabSession(dead), "Galbrena", 0, {}, quiet);
    expect(advice.lines).toHaveLength(5);
    expect(advice.lines[0]).toMatchObject({ key: "DEF_FLAT", rank: 1, advice: "reroll" });
    expect(advice.lines[0].worth).toBeCloseTo(0, 6);
    expect(advice.lines.find((l) => l.key === "CritRate")?.advice).toBe("lock");
    expect(advice.plans.map((p) => [p.locks, p.cost])).toEqual([[4, 3], [3, 2], [2, 1], [1, 1], [0, 1]]);
    expect(advice.plans[0]).toMatchObject({ method: "exact", rerolledFields: [advice.lines[0].field] });
    for (const p of advice.plans) {
      expect(p.pImprove).toBeGreaterThanOrEqual(0);
      expect(p.pImprove).toBeLessThanOrEqual(1);
      expect(p.expectedGain).toBeGreaterThanOrEqual(Math.max(0, p.expectedChange) - 1e-12); // keeping the better lines never hurts
    }
    expect(advice.recommended).not.toBeNull();
    expect(advice.recommended!.gainPerTransducer).toBe(Math.max(...advice.plans.map((p) => p.gainPerTransducer)));
    expect(advice.lockCostNote).toBe("verify in game");
  }, T);
});

describe("benchmark score", () => {
  it("scores from the four damage numbers", () => {
    expect(benchmarkScoreOf(100, 100, 200, 300).score).toBe(0);
    expect(benchmarkScoreOf(150, 100, 200, 300).score).toBe(0.5);
    expect(benchmarkScoreOf(200, 100, 200, 300).score).toBe(1);
    expect(benchmarkScoreOf(300, 100, 200, 300).score).toBe(2);
    expect(benchmarkScoreOf(400, 100, 200, 300)).toEqual({ score: 2, rawScore: 3 });
    expect(benchmarkScoreOf(50, 100, 100, 300).score).toBeNull();
  });

  it("puts the perfect spread at 200 % and the substat-free build at 0 %", async () => {
    const session = createLabSession(account);
    const bench = await benchmarkScore(session, "Galbrena", {}, quiet);
    expect(bench.B).toBeLessThan(bench.R);
    expect(bench.R).toBeLessThan(bench.P);
    expect(bench.score).toBeGreaterThan(0);
    expect(bench.score).toBeLessThan(2);
    expect(bench.named.slice(0, 2).sort()).toEqual(["CritDMG", "CritRate"]);
    expect(bench.reference.reduce((s, l) => s + l.rolls, 0)).toBe(24); // ChemX32: one of 25 rolls unspent
    expect(bench.reference.map((l) => l.rolls).sort((a, b) => b - a)).toEqual([5, 5, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(bench.perfect.every((l) => l.rolls <= 5 && l.value === maxRoll(l.key))).toBe(true);

    // wear the perfect spread for real → 200 %; wear no substats → 0 %
    const lab = (await prepareCharacter(session, "Galbrena"))!;
    const perfectCounts = new Map(bench.perfect.map((l) => [l.key as SubstatKey, l.rolls]));
    const asAccount = (perEcho: Array<Array<{ key: string; value: number }>>): LabAccount => ({ ...account, ...withEchoLines(session, lab, perEcho) });
    const atP = await benchmarkScore(createLabSession(asAccount(placeSpread(perfectCounts, maxRoll))), "Galbrena", {}, quiet);
    expect(atP.rotationName).toBe(bench.rotationName);
    expect(atP.D).toBeCloseTo(bench.P, 4);
    expect(atP.score).toBeCloseTo(2, 9);
    const atB = await benchmarkScore(createLabSession(asAccount([[], [], [], [], []])), "Galbrena", {}, quiet);
    expect(atB.score).toBe(0);
    expect(atB.yours).toEqual([]);
  }, T);
});

describe("worker host and client", () => {
  it("runs jobs, answers an unchanged account from cache and honours cancel", async () => {
    const messages: EchoLabResponse[] = [];
    const host = createEchoLabHost((m) => messages.push(m), { yieldMs: 1 });
    const job = { kind: "bestOwner" as const, options: { echoIds: ["tmm72b568p"] } };
    await host.onMessage({ type: "run", id: 1, job, account });
    await host.onMessage({ type: "run", id: 2, job, account: clone() });
    const results = messages.filter((m) => m.type === "result") as Array<Extract<EchoLabResponse, { type: "result" }>>;
    expect(results.map((r) => [r.id, r.cached])).toEqual([[1, false], [2, true]]);
    expect(messages.some((m) => m.type === "progress" && m.id === 1)).toBe(true);
    expect((results[1].result as BestOwnerResult).echoes[0].verdict).toBe("keep");

    const running = host.onMessage({ type: "run", id: 3, job: { kind: "benchmark", characterIds: ["Galbrena"] }, account });
    await host.onMessage({ type: "cancel", id: 3 });
    await running;
    expect(messages.find((m) => m.id === 3 && m.type !== "progress")).toMatchObject({ type: "error", cancelled: true });
    expect(host.stats).toEqual({ runs: 1, cacheHits: 1 });
  }, T);

  it("falls back to this thread without Worker support, and rejects an aborted job", async () => {
    const client = createEchoLabClient({ worker: () => null });
    expect(client.mode).toBe("inline");
    const info: unknown[] = [];
    const p = await client.run({ kind: "potential", echoId: "labtune0004", target: { characterId: "Galbrena", slot: 2 } }, account, { onInfo: (i) => info.push(i) });
    expect(p.method).toBe("exact");
    expect(info).toEqual([expect.objectContaining({ cached: false, fingerprint: accountFingerprint(account) })]);
    const controller = new AbortController();
    const pending = client.run({ kind: "benchmark", characterIds: ["Cartethyia"] }, account, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: CANCELLED });
    client.dispose();
  }, T);

  it("rejects the jobs of a worker that fails, terminates it and reports it fatal", async () => {
    let terminated = false;
    const fake = { postMessage: () => undefined, terminate: () => void (terminated = true), onmessage: null, onerror: null } as unknown as Worker;
    let fatal = 0;
    const client = createEchoLabClient({ worker: () => fake, onFatal: () => (fatal += 1) });
    expect(client.mode).toBe("worker");
    const job = client.run({ kind: "pass" }, account);
    fake.onerror?.({ message: "chunk failed to load" } as ErrorEvent);
    await expect(job).rejects.toThrow("Echo Lab worker failed: chunk failed to load");
    expect(terminated).toBe(true);
    expect(fatal).toBe(1);
  });
});
