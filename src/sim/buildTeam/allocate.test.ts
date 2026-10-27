// Wuthering Tools+ — "Build it for me": the allocator on a fake inventory (20 echoes, three members) with a fake
// scorer, so every rule can be checked exactly: no echo twice, priority respected, ER floors held, the swap pass
// never lowering the team value, determinism.
import { describe, expect, it } from "vitest";
import { allocateTeam, hasReuse, permutations, teamValueOf, type AllocationApi, type Candidate } from "./allocate";

interface FakeEcho {
  id: string;
  /** value per member */
  worth: number[];
  er: number;
  cost: number;
}

/** 20 echoes: five slots of costs 4,3,3,1,1; every member values each echo differently. */
function inventory(): FakeEcho[] {
  const out: FakeEcho[] = [];
  const costs = [4, 4, 4, 4, 3, 3, 3, 3, 3, 3, 3, 3, 1, 1, 1, 1, 1, 1, 1, 1];
  for (let i = 0; i < 20; i++) {
    // deterministic pseudo-random worths
    const w = (k: number): number => ((i * 37 + k * 101) % 23) + 1;
    out.push({ id: `e${String(i).padStart(2, "0")}`, worth: [w(1) * 3, w(2) * 2, w(3)], er: (i * 7) % 11, cost: costs[i]! });
  }
  return out;
}

const LAYOUT = [4, 3, 3, 1, 1];

/** A fake optimizer: the exact best 4-3-3-1-1 loadout for a member among the free echoes, under an ER floor. */
function fakeApi(echoes: FakeEcho[], floors: Array<number | null>, calls: string[] = []): AllocationApi {
  const byId = new Map(echoes.map((e) => [e.id, e]));
  const valueOf = (m: number, ids: string[]): number => ids.reduce((n, id) => n + byId.get(id)!.worth[m]!, 0);
  const erOf = (ids: string[]): number => 100 + ids.reduce((n, id) => n + byId.get(id)!.er, 0);
  const cand = (m: number, ids: string[]): Candidate => {
    const er = erOf(ids);
    return { ids, value: valueOf(m, ids), er, meetsFloor: floors[m] == null || er >= floors[m]! };
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
      calls.push(`solve:${m}:${[...taken].sort().join(",")}`);
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
      return echoes.filter((e) => !used.has(e.id) && e.cost === LAYOUT[slot]).sort((a, b) => b.worth[m]! - a.worth[m]!).map((e) => e.id);
    },
  };
}

describe("allocateTeam", () => {
  it("never assigns an echo twice, in any order", async () => {
    const echoes = inventory();
    for (const order of permutations([0, 1, 2])) {
      const r = await allocateTeam(fakeApi(echoes, [null, null, null]), { members: 3, order, weights: [1, 1, 1] });
      expect(hasReuse(r.picks)).toBe(false);
      expect(r.picks.every((p) => p && p.ids.length === 5)).toBe(true);
    }
  });

  it("serves the priority order first: the first member gets their unconstrained best", async () => {
    const echoes = inventory();
    const api = fakeApi(echoes, [null, null, null]);
    const solo = await api.solve(2, new Set());
    const r = await allocateTeam(api, { members: 3, order: [2, 0, 1], weights: [1, 1, 1], maxSwapRounds: 0 });
    expect(r.order).toEqual([2, 0, 1]);
    expect(r.picks[2]!.ids).toEqual(solo!.ids);
  });

  it("holds every ER floor it can, and prefers an allocation that meets more floors over more value", async () => {
    const echoes = inventory();
    const floors = [null, 118, null];
    const r = await allocateTeam(fakeApi(echoes, floors), { members: 3, order: [0, 1, 2], weights: [1, 1, 1], allOrders: true });
    expect(r.picks[1]!.meetsFloor).toBe(true);
    expect(r.picks[1]!.er!).toBeGreaterThanOrEqual(118);
    expect(r.floorsMet).toBe(3);
  });

  it("the swap pass never lowers the team value and keeps the floors met", async () => {
    const echoes = inventory();
    const floors = [null, 112, null];
    const base = await allocateTeam(fakeApi(echoes, floors), { members: 3, order: [0, 1, 2], weights: [1, 1, 1], maxSwapRounds: 0 });
    const swapped = await allocateTeam(fakeApi(echoes, floors), { members: 3, order: [0, 1, 2], weights: [1, 1, 1], maxSwapRounds: 5 });
    expect(swapped.teamValue).toBeGreaterThanOrEqual(base.teamValue);
    expect(swapped.floorsMet).toBeGreaterThanOrEqual(base.floorsMet);
    expect(hasReuse(swapped.picks)).toBe(false);
    for (const s of swapped.swaps) expect(s.gain).toBeGreaterThan(0);
    expect(teamValueOf(swapped.picks, [1, 1, 1])).toBeCloseTo(swapped.teamValue, 9);
  });

  it("finds a swap greedy misses: the first member takes an echo the second needed far more", async () => {
    // member 0 values e1 only a little more than e2; member 1 values e1 hugely and e2 not at all
    const echoes: FakeEcho[] = [
      { id: "e1", worth: [10, 100], er: 0, cost: 4 },
      { id: "e2", worth: [9, 0], er: 0, cost: 4 },
      ...["a", "b", "c", "d", "f", "g", "h", "i"].map((x, i) => ({ id: x, worth: [1, 1], er: 0, cost: i < 4 ? 3 : 1 })),
    ];
    const r = await allocateTeam(fakeApi(echoes, [null, null]), { members: 2, order: [0, 1], weights: [1, 1], allOrders: false });
    expect(r.picks[1]!.ids).toContain("e1");
    expect(r.picks[0]!.ids).toContain("e2");
    expect(r.swaps.length).toBeGreaterThanOrEqual(1);
    expect(hasReuse(r.picks)).toBe(false);
  });

  it("tries every order when asked and keeps the best team", async () => {
    const echoes = inventory();
    const all = await allocateTeam(fakeApi(echoes, [null, null, null]), { members: 3, order: [0, 1, 2], weights: [1, 1, 1], allOrders: true, maxSwapRounds: 0 });
    expect(all.ordersTried).toBe(6);
    for (const order of permutations([0, 1, 2])) {
      const one = await allocateTeam(fakeApi(echoes, [null, null, null]), { members: 3, order, weights: [1, 1, 1], maxSwapRounds: 0 });
      expect(all.teamValue).toBeGreaterThanOrEqual(one.teamValue);
    }
  });

  it("is deterministic", async () => {
    const echoes = inventory();
    const a = await allocateTeam(fakeApi(echoes, [null, 110, null]), { members: 3, order: [1, 0, 2], weights: [1, 2, 0.5], allOrders: true });
    const b = await allocateTeam(fakeApi(echoes, [null, 110, null]), { members: 3, order: [1, 0, 2], weights: [1, 2, 0.5], allOrders: true });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("stops when cancelled", async () => {
    let n = 0;
    await expect(allocateTeam(fakeApi(inventory(), [null, null, null]), { members: 3, order: [0, 1, 2], weights: [1, 1, 1], isCancelled: () => ++n > 2 })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("leaves a member without a loadout empty and still serves the others", async () => {
    const echoes = inventory().filter((e) => e.cost !== 4 || e.id === "e00");
    const r = await allocateTeam(fakeApi(echoes, [null, null, null]), { members: 3, order: [0, 1, 2], weights: [1, 1, 1] });
    expect(r.picks.filter(Boolean)).toHaveLength(1);
    expect(r.picks[0]!.ids).toContain("e00");
  });
});
