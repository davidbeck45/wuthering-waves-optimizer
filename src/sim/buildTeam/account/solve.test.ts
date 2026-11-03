// Wuthering Tools+ — "Whole account": the account solver on synthetic inventories with an exact fake optimizer, so
// the greedy's mistakes are known by construction: an earlier member takes the one echo a later member needs far
// more, and the local search must hand it over — only when the weighted value says so, never with an echo twice,
// never at the cost of an ER floor that held.
import { describe, expect, it } from "vitest";
import { hasReuse, teamValueOf, type AllocationApi, type Candidate } from "../allocate";
import { acceptMove, conflictPairs, solveAccount } from "./solve";

interface FakeEcho {
  id: string;
  cost: number;
  /** value per member (default 1) */
  worth: Record<number, number>;
  er: number;
}

const LAYOUT = [4, 3, 3, 1, 1];

/** An exact optimizer over the free echoes: best 4-3-3-1-1 loadout by Σ worth, floor first (like searchLevels). */
function fakeApi(echoes: FakeEcho[], floors: Array<number | null>, log: string[] = []): AllocationApi {
  const byId = new Map(echoes.map((e) => [e.id, e]));
  const worth = (m: number, id: string): number => byId.get(id)!.worth[m] ?? 1;
  const cand = (m: number, ids: string[]): Candidate => {
    const er = 100 + ids.reduce((n, id) => n + byId.get(id)!.er, 0);
    return { ids, value: ids.reduce((n, id) => n + worth(m, id), 0), er, meetsFloor: floors[m] == null || er >= floors[m]! };
  };
  const best = (m: number, taken: ReadonlySet<string>, withFloor: boolean): Candidate | null => {
    const free = echoes.filter((e) => !taken.has(e.id));
    const byCost = (c: number) => free.filter((e) => e.cost === c);
    let top: Candidate | null = null;
    for (const a of byCost(4))
      for (const [i, b] of byCost(3).entries())
        for (const c of byCost(3).slice(i + 1))
          for (const [j, d] of byCost(1).entries())
            for (const e of byCost(1).slice(j + 1)) {
              const x = cand(m, [a.id, b.id, c.id, d.id, e.id]);
              if (withFloor && !x.meetsFloor) continue;
              if (!top || x.value > top.value || (x.value === top.value && x.ids.join() < top.ids.join())) top = x;
            }
    return top;
  };
  return {
    async solve(m, taken) {
      log.push(`solve:${m}`);
      return best(m, taken, true) ?? best(m, taken, false);
    },
    async score(m, list) {
      return list.map((ids) => cand(m, ids));
    },
    legal(_m, slot, id, pick) {
      const e = byId.get(id);
      return !!e && e.cost === LAYOUT[slot] && !pick.ids.some((x, i) => i !== slot && x === id);
    },
    free(m, slot, _pick, used) {
      return echoes.filter((e) => !used.has(e.id) && e.cost === LAYOUT[slot]).sort((a, b) => worth(m, b.id) - worth(m, a.id) || a.id.localeCompare(b.id)).map((e) => e.id);
    },
  };
}

/** Exactly enough echoes for `members` loadouts: per member one 4-cost, two 3-costs, two 1-costs, worth 1 to all. */
function inventory(members: number, extra: Partial<Record<string, Partial<FakeEcho>>> = {}): FakeEcho[] {
  const out: FakeEcho[] = [];
  const add = (prefix: string, cost: number, count: number): void => {
    for (let i = 0; i < count; i++) {
      const id = `${prefix}${String.fromCharCode(97 + i)}`;
      out.push({ id, cost, worth: {}, er: 0, ...(extra[id] ?? {}) } as FakeEcho);
    }
  };
  add("f", 4, members);
  add("t", 3, members * 2);
  add("o", 1, members * 2);
  return out;
}

const poolsOf = (echoes: FakeEcho[], n: number): Array<Set<string>> => Array.from({ length: n }, () => new Set(echoes.map((e) => e.id)));

/** Two teams of two: members 0, 1 (team A, weight 1) and 2, 3 (team B, weight `wB`). */
const weightsFor = (wB: number): number[] => [1, 1, wB, wB];

describe("solveAccount", () => {
  // fa: worth 10 to member 0 (served first) and 100 to member 3 (served last); fb: 9 to member 0, 1 to member 3.
  const contested = (): FakeEcho[] => inventory(4, { fa: { worth: { 0: 10, 3: 100 } }, fb: { worth: { 0: 9, 3: 1 } } });

  it("fixes the greedy's priority mistake: the echo a later member needs far more changes hands", async () => {
    const echoes = contested();
    const weights = weightsFor(0.6);
    const r = await solveAccount(fakeApi(echoes, [null, null, null, null]), { members: 4, order: [0, 1, 2, 3], weights, pools: poolsOf(echoes, 4) });
    // the greedy gives fa to member 0 (it is their best 4-cost) and member 3 ends on a worth-1 4-cost
    expect(r.greedy.picks[0]!.ids).toContain("fa");
    expect(r.greedy.picks[3]!.ids).not.toContain("fa");
    // the local search hands fa to member 3 and member 0 falls back to fb: +0.6 × 99 − 1 × 1 over the greedy
    expect(r.picks[3]!.ids).toContain("fa");
    expect(r.picks[0]!.ids).toContain("fb");
    expect(r.value).toBeGreaterThan(r.greedy.value);
    expect(r.value - r.greedy.value).toBeCloseTo(0.6 * 99 - 1 * 1, 6);
    expect(r.moves.length).toBeGreaterThan(0);
    expect(r.stoppedBy).toBe("converged");
    expect(hasReuse(r.picks)).toBe(false);
  });

  it("listens to the weights: a team that matters little does not get the echo", async () => {
    // member 0's fallback is poor (every other 4-cost is worth 1 to them): handing fa over costs team A 9 and gains
    // team B weight × 99
    const poor = inventory(4, { fa: { worth: { 0: 10, 3: 100 } } });
    const weights = weightsFor(0.05);
    const r = await solveAccount(fakeApi(poor, [null, null, null, null]), { members: 4, order: [0, 1, 2, 3], weights, pools: poolsOf(poor, 4) });
    expect(r.picks[0]!.ids).toContain("fa");
    expect(r.value).toBeCloseTo(r.greedy.value, 9);
    // with weight 0.6 the same inventory hands it over (0.6 × 99 > 9)
    const r2 = await solveAccount(fakeApi(poor, [null, null, null, null]), { members: 4, order: [0, 1, 2, 3], weights: weightsFor(0.6), pools: poolsOf(poor, 4) });
    expect(r2.picks[3]!.ids).toContain("fa");
  });

  it("never lowers the weighted value, never uses an echo twice (seeded random inventories)", async () => {
    let seed = 7;
    const rnd = (): number => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let trial = 0; trial < 12; trial++) {
      const n = 3 + (trial % 2);
      const echoes = inventory(n + 1).map((e) => ({ ...e, worth: Object.fromEntries(Array.from({ length: n }, (_, m) => [m, Math.round(rnd() * 20)])), er: Math.round(rnd() * 8) }));
      const weights = Array.from({ length: n }, () => 0.2 + Math.round(rnd() * 8) / 10);
      const r = await solveAccount(fakeApi(echoes, Array.from({ length: n }, () => null)), { members: n, order: Array.from({ length: n }, (_, i) => i), weights, pools: poolsOf(echoes, n) });
      expect(r.value, `trial ${trial}`).toBeGreaterThanOrEqual(r.greedy.value - 1e-9);
      expect(hasReuse(r.picks), `trial ${trial}`).toBe(false);
      expect(r.picks.every((p) => p && p.ids.length === 5)).toBe(true);
      expect(teamValueOf(r.picks, weights)).toBeCloseTo(r.value, 9);
    }
  });

  it("keeps every ER floor that held: a move that costs a member their floor is refused", async () => {
    // fa carries the ER member 0 needs (floor 110: only fa's +10 gets them there); member 3 wants fa for damage
    const echoes = inventory(4, { fa: { worth: { 0: 10, 3: 100 }, er: 10 } });
    const floors = [110, null, null, null];
    const r = await solveAccount(fakeApi(echoes, floors), { members: 4, order: [0, 1, 2, 3], weights: weightsFor(1), pools: poolsOf(echoes, 4) });
    expect(r.greedy.picks[0]!.meetsFloor).toBe(true);
    expect(r.picks[0]!.ids).toContain("fa");
    expect(r.picks[0]!.meetsFloor).toBe(true);
    expect(r.floorsMet).toBe(r.greedy.floorsMet);
  });

  it("only looks at members that compete: disjoint pools mean no local-search solve at all", async () => {
    const echoes = inventory(2);
    const pools = [new Set(["fa", "ta", "tb", "oa", "ob"]), new Set(["fb", "tc", "td", "oc", "od"])];
    const log: string[] = [];
    const r = await solveAccount(fakeApi(echoes.filter((e) => [...pools[0]!, ...pools[1]!].includes(e.id)), [null, null], log), { members: 2, order: [0, 1], weights: [1, 1], pools });
    expect(conflictPairs(r.greedy.picks, pools)).toEqual([]);
    expect(r.conflicts).toBe(0);
    expect(log).toEqual(["solve:0", "solve:1"]);
    expect(r.moves).toEqual([]);
  });

  it("stops at the time budget and keeps a valid allocation", async () => {
    const echoes = contested();
    let clock = 0;
    const r = await solveAccount(fakeApi(echoes, [null, null, null, null]), {
      members: 4,
      order: [0, 1, 2, 3],
      weights: weightsFor(0.6),
      pools: poolsOf(echoes, 4),
      budgetMs: 5,
      now: () => (clock += 10),
    });
    expect(r.stoppedBy).toBe("budget");
    expect(r.value).toBeGreaterThanOrEqual(r.greedy.value);
    expect(hasReuse(r.picks)).toBe(false);
  });

  it("'stop improving' keeps the greedy; cancel throws an AbortError", async () => {
    const echoes = contested();
    const stopped = await solveAccount(fakeApi(echoes, [null, null, null, null]), { members: 4, order: [0, 1, 2, 3], weights: weightsFor(0.6), pools: poolsOf(echoes, 4), shouldStop: () => true });
    expect(stopped.stoppedBy).toBe("stopped");
    expect(stopped.picks).toEqual(stopped.greedy.picks);
    let calls = 0;
    await expect(
      solveAccount(fakeApi(echoes, [null, null, null, null]), { members: 4, order: [0, 1, 2, 3], weights: weightsFor(0.6), pools: poolsOf(echoes, 4), isCancelled: () => ++calls > 2 }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("acceptMove: weighted gain only, no lost build, no lost floor", () => {
    // a fresh echo id per candidate: acceptMove also refuses an echo in two builds
    let n = 0;
    const c = (value: number, meetsFloor = true): Candidate => ({ ids: [`e${n++}`], value, er: 100, meetsFloor });
    expect(acceptMove([c(5), c(5)], [c(4), c(5)], [1, 1])).toBe(true);
    expect(acceptMove([c(4), c(5)], [c(4), c(5)], [1, 1])).toBe(false);
    expect(acceptMove([c(50), null], [c(4), c(5)], [1, 1])).toBe(false);
    expect(acceptMove([c(50), c(5, false)], [c(4), c(5)], [1, 1])).toBe(false);
    // a floor gained at a weighted loss is still refused (the account rule is weighted gain)
    expect(acceptMove([c(3), c(5, true)], [c(4), c(5, false)], [1, 1])).toBe(false);
  });
});
