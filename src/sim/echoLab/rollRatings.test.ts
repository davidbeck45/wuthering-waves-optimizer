// Wuthering Tools+ Echo Lab — the quick roll ratings behind the inventory's chips (rollRatings.ts): one job rates every
// levelled echo where Echo Lab's detail would rate it, close to the exact "How good is this roll" (rollQuality.ts),
// the same answer every run, memoised per session, and never cached whole by the worker host. Public fixture only.
import { beforeAll, describe, expect, it } from "vitest";
import fixture from "./__fixtures__/echoLabAccount.json";
import { SUBSTAT_KEYS, maxRoll } from "../substats/substatWeights";
import { bestOwners, type BestOwnerResult } from "./bestOwner";
import { createLabSession, type LabAccount, type LabSession } from "./core";
import { qualityTarget } from "./echoLabView";
import { rollQuality } from "./rollQuality";
import { rollRatings, type RollRatingItem, type RollRatingsResult } from "./rollRatings";
import { outcomeCount } from "./rolls";
import { createEchoLabHost, type EchoLabResponse } from "./workerHost";

const account = fixture as unknown as LabAccount;
const clone = (): LabAccount => JSON.parse(JSON.stringify(account));
const quiet = { yieldMs: 0 };
const T = 120_000;

// eslint-disable-next-line no-unused-vars -- the parameters of a function type
function withEcho(base: LabAccount, echoId: string, edit: (e: Record<string, any>) => void): LabAccount {
  const next = JSON.parse(JSON.stringify(base)) as LabAccount;
  const echo = next.echoes.find((e) => e.echoId === echoId);
  if (!echo) throw new Error(`no echo ${echoId}`);
  edit(echo);
  return next;
}

/** every levelled echo with a build to rate it on, where the chips rate it (qualityTarget) */
function itemsOf(result: BestOwnerResult): RollRatingItem[] {
  const out: RollRatingItem[] = [];
  for (const row of result.echoes) {
    if (!row.lines) continue;
    const t = qualityTarget(row, result.characters);
    if (t) out.push({ echoId: row.echoId, ...t });
  }
  return out;
}

let session: LabSession;
let result: BestOwnerResult;
let items: RollRatingItem[];
let rated: RollRatingsResult;

beforeAll(async () => {
  session = createLabSession(account);
  result = await bestOwners(session, {}, quiet);
  items = itemsOf(result);
  rated = await rollRatings(session, items, {}, quiet);
}, T);

describe("Quick roll ratings", () => {
  it("rates every levelled echo that has a build, worn ones where they sit", () => {
    expect(items.length).toBeGreaterThan(20);
    expect(rated.errors).toEqual([]);
    expect(rated.ratings.map((r) => r.echoId)).toEqual(items.map((i) => i.echoId));
    // about ten engine scorings an echo, not the exact rating's thousand
    expect(rated.scorings).toBeLessThan(items.length * 16);
    for (const r of rated.ratings) {
      expect(r.percentile).toBeGreaterThanOrEqual(0);
      expect(r.percentile).toBeLessThanOrEqual(1);
      expect(r.level).toBe(r.lines * 5);
    }
    const byId = new Map(rated.ratings.map((r) => [r.echoId, r]));
    expect(byId.get("xtbwqikno2")).toMatchObject({ characterId: "Cartethyia", slot: 0, worn: true, lines: 5 });
    expect(byId.get("labtune0003")).toMatchObject({ characterId: "Galbrena", slot: 2, worn: false, lines: 3, level: 15 });
    // a dead-line echo is a bottom roll for its best owner
    expect(byId.get("labdeadwp01")!.percentile).toBeLessThan(0.05);
  });

  it(
    "sits close to Echo Lab's exact rating on the same slot",
    async () => {
      const byId = new Map(rated.ratings.map((r) => [r.echoId, r]));
      // worn and swapped in, carries and Zani's average rolls, a partial echo, a stale wearer rated on its best owner
      const ids = ["xtbwqikno2", "8l5japds6n", "9uxj6wppka", "mw1oqawxl7", "qy27jq1l5x", "labtune0003", "labstale001"];
      const gaps: number[] = [];
      for (const id of ids) {
        const quick = byId.get(id)!;
        const exact = await rollQuality(session, id, { characterId: quick.characterId, slot: quick.slot }, {}, quiet);
        expect(exact.worn).toBe(quick.worn);
        gaps.push(Math.abs(exact.percentile - quick.percentile));
      }
      expect(Math.max(...gaps)).toBeLessThan(0.06);
      expect(gaps.reduce((a, b) => a + b, 0) / gaps.length).toBeLessThan(0.02);
    },
    T,
  );

  it(
    "gives the same numbers every run, and a second ask on the session costs no engine run",
    async () => {
      const some = items.slice(0, 4);
      const again = await rollRatings(createLabSession(clone()), some, {}, quiet);
      expect(again.ratings).toEqual(rated.ratings.slice(0, 4));
      const memo = await rollRatings(session, some, {}, quiet);
      expect(memo.scorings).toBe(0);
      expect(memo.ratings).toEqual(rated.ratings.slice(0, 4));
    },
    T,
  );

  it(
    "rates better lines higher: dead lines at the bottom, top crit lines at the top",
    async () => {
      const set = (keys: string[]) => (e: Record<string, any>) =>
        keys.forEach((k, i) => {
          e[`echoSubStatsType${i + 1}`] = k;
          e[`echoSubStatsValue${i + 1}`] = maxRoll(k as never);
        });
      const target = [{ echoId: "8xziafu5n3", characterId: "Galbrena", slot: 1 }];
      const low = await rollRatings(createLabSession(withEcho(account, "8xziafu5n3", set(["DEF", "DEF_FLAT", "HP", "HP_FLAT", "EnergyRegen"]))), target, {}, quiet);
      const high = await rollRatings(createLabSession(withEcho(account, "8xziafu5n3", set(["CritRate", "CritDMG", "ATK", "ResonanceSkillDMGBonus", "BasicAttackDMGBonus"]))), target, {}, quiet);
      expect(low.ratings[0].percentile).toBeLessThan(0.1);
      expect(high.ratings[0].percentile).toBeGreaterThan(0.95);
    },
    T,
  );

  it(
    "enumerates a one-line echo exactly",
    async () => {
      const one = withEcho(account, "labtune0003", (e) => {
        for (const n of [2, 3]) {
          e[`echoSubStatsType${n}`] = null;
          e[`echoSubStatsValue${n}`] = null;
        }
      });
      const r = await rollRatings(createLabSession(one), [{ echoId: "labtune0003", characterId: "Galbrena", slot: 2 }], {}, quiet);
      expect(r.ratings[0]).toMatchObject({ lines: 1, level: 5, method: "exact", outcomes: outcomeCount([...SUBSTAT_KEYS], 1) });
    },
    T,
  );

  it(
    "says why it cannot rate an echo instead of failing the batch",
    async () => {
      const bare = withEcho(account, "labtune0003", (e) => {
        for (const n of [1, 2, 3, 4, 5]) {
          e[`echoSubStatsType${n}`] = null;
          e[`echoSubStatsValue${n}`] = null;
        }
      });
      const r = await rollRatings(
        createLabSession(bare),
        [
          { echoId: "nope", characterId: "Galbrena", slot: 2 },
          { echoId: "labtune0003", characterId: "Galbrena", slot: 2 },
          { echoId: "labnoslot01", characterId: "Cartethyia", slot: 1 },
        ],
        {},
        quiet,
      );
      expect(r.ratings).toEqual([]);
      expect(r.errors.map((e) => e.echoId)).toEqual(["nope", "labtune0003", "labnoslot01"]);
      expect(r.errors[0].reason).toMatch(/No echo/);
      expect(r.errors[1].reason).toMatch(/No substat lines/);
      expect(r.errors[2].reason).toMatch(/no slot/);
    },
    T,
  );

  it(
    "runs as a worker job whose batches the host does not cache whole (the session memo answers a re-ask)",
    async () => {
      const messages: EchoLabResponse[] = [];
      const host = createEchoLabHost((m) => messages.push(m), { yieldMs: 0 });
      const job = { kind: "rollRatings" as const, items: items.slice(0, 3) };
      await host.onMessage({ type: "run", id: 1, job, account: clone() });
      await host.onMessage({ type: "run", id: 2, job, account: clone() });
      const results = messages.filter((m): m is Extract<EchoLabResponse, { type: "result" }> => m.type === "result");
      expect(results.map((m) => m.cached)).toEqual([false, false]);
      expect(host.stats.cacheHits).toBe(0);
      const [first, second] = results.map((m) => m.result as RollRatingsResult);
      expect(second.ratings).toEqual(first.ratings);
      expect(second.scorings).toBe(0);
      expect(first.ratings).toEqual(rated.ratings.slice(0, 3));
    },
    T,
  );
});
