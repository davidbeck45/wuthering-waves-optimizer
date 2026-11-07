// Wuthering Tools+ — a build the plan's sets could not fill (fewer than five owned, or a teammate holds the rest): the
// search keeps sets at every level, so Lupa's new build came back with four echoes and nothing said why. `memberSearchApi`
// fills such a slot from the other sets. A fake optimizer over a tiny synthetic inventory, no engine.
import { describe, expect, it } from "vitest";
import { hasReuse } from "./allocate";
import { memberSearchApi, type ActiveMember } from "./buildTeam";
import { relaxLevels, type BuildOptions, type MemberConstraints } from "./constraints";
import type { OptimizerBackend } from "./headlessOptimizer";

/* eslint-disable @typescript-eslint/no-explicit-any */

const E = (id: string, set: string, cost: number, value = 1, over: Record<string, unknown> = {}) => ({ echoId: id, echo: `sp_${id}`, echoSet: set, type: cost, stat: "x", value, ...over });
const worth = (l: any[]): number => l.reduce((n, e) => n + e.value, 0);
/** the search's answer: every echo of the pool, up to the cost limit, the way the optimizer returns a part build */
const backend: OptimizerBackend = {
  async optimize(_job: any, req: any) {
    const loadout: any[] = [];
    for (const e of [...req.pool].sort((a, b) => b.type - a.type || b.value - a.value)) {
      if (loadout.length < 5 && loadout.reduce((n, x) => n + x.type, 0) + e.type <= 12) loadout.push(e);
    }
    return { results: loadout.length ? [{ loadout, targetValue: worth(loadout), energyRegen: 1 }] : [], processed: 1 } as any;
  },
  async score(_job: any, loadouts: any[][]) {
    return loadouts.map((l) => ({ loadout: l, targetValue: worth(l), energyRegen: 1 })) as any;
  },
};
const member = (id: string, sets: string[] | null, today: string[] = []): ActiveMember => {
  const c: MemberConstraints = { characterId: id, allowedSets: sets, mainEchoKeys: null, layout: null, loadoutFormat: "Any", mainStatsByCost: null, erFloor: null };
  return {
    slot: 0,
    job: { characterId: id, id, erOffset: 0 } as any,
    c,
    levels: relaxLevels(c),
    plan: { characterId: id, sets: (sets ?? []).map((key) => ({ key, pieces: 5 })) } as any,
    before: 0,
    objectiveSource: "team",
    resolved: { [id]: { echoes: Object.fromEntries(today.map((e, i) => [i, { echoId: e }])) } },
    enemy: {} as any,
  };
};
const options: BuildOptions = { useSets: true, useMainStats: true, keepMainEcho: false, takeFromOthers: false, tryAllOrders: true };
const apiOn = (list: any[], members: ActiveMember[], wornOutside: string[] = []) =>
  memberSearchApi(members, { echoes: list, echoById: new Map(list.map((e) => [e.echoId, e])), options, wornOutside: new Set(wornOutside), keptInTeam: new Set(), backend, hooks: {} }).api;

const fourOfSet = [E("a1", "A", 4), E("a2", "A", 3), E("a3", "A", 1), E("a4", "A", 1)];

describe("a build the plan's sets cannot fill", () => {
  it("the empty slot takes the best echo of another set: Lupa's build came back with four", async () => {
    const list = [...fourOfSet, E("x1", "X", 1, 2), E("x2", "X", 1, 9), E("x3", "X", 3, 5)];
    const pick = await apiOn(list, [member("L", ["A"])]).solve(0, new Set());
    expect(pick!.ids).toEqual(["a1", "a2", "a3", "a4", "x2"]);
    expect(pick!.value).toBe(13);
  });

  it("every set piece stays, and two empty slots leave each other room", async () => {
    const list = [E("a1", "A", 4), E("a2", "A", 3), E("a3", "A", 3), E("x4", "X", 3, 50), E("y1", "Y", 1, 1), E("y2", "Y", 1, 1)];
    const pick = await apiOn(list, [member("L", ["A"])]).solve(0, new Set());
    expect(pick!.ids.slice(0, 3)).toEqual(["a1", "a2", "a3"]);
    expect(pick!.ids).toHaveLength(5); // 10 cost so far: a 3-cost would have left the last slot empty
    expect(pick!.ids).not.toContain("x4");
  });

  it("at the cost limit nothing fits, and the build keeps its four", async () => {
    const list = [E("a1", "A", 4), E("a2", "A", 4), E("a3", "A", 3), E("a4", "A", 1), E("x1", "X", 1, 9)];
    const pick = await apiOn(list, [member("L", ["A"])]).solve(0, new Set());
    expect(pick!.ids).toEqual(["a1", "a2", "a3", "a4"]);
  });

  it("never a species the build holds, an echo taken or worn outside the team, or one hidden from the optimizer", async () => {
    const list = [
      ...fourOfSet,
      { ...E("twin", "X", 1, 9), echo: "sp_a3" },
      E("taken", "X", 1, 9),
      E("outside", "X", 1, 9),
      E("hidden", "X", 1, 9, { ignoreFromOptimizer: true }),
      E("ok", "X", 1, 1),
    ];
    const pick = await apiOn(list, [member("L", ["A"])], ["outside"]).solve(0, new Set(["taken"]));
    expect(pick!.ids).toEqual(["a1", "a2", "a3", "a4", "ok"]);
  });

  it("leaves a teammate's plan and a teammate's echoes alone: a filler must not cost them a piece", async () => {
    const list = [...fourOfSet, E("b1", "B", 1, 50), E("t1", "X", 1, 40), E("ok", "X", 1, 1)];
    const pick = await apiOn(list, [member("L", ["A"]), member("G", ["B"], ["t1"])]).solve(0, new Set());
    expect(pick!.ids).toEqual(["a1", "a2", "a3", "a4", "ok"]);
  });

  it("the fill stands for the free echoes of this call: a later solve never gets back one taken since", async () => {
    const api = apiOn([...fourOfSet, E("x1", "X", 1, 9), E("x2", "X", 1, 2)], [member("L", ["A"])]);
    expect((await api.solve(0, new Set()))!.ids).toContain("x1");
    const again = await api.solve(0, new Set(["x1"]));
    expect(again!.ids).toEqual(["a1", "a2", "a3", "a4", "x2"]);
    expect(hasReuse([again, { ids: ["x1"], value: 1, er: 1, meetsFloor: true }])).toBe(false);
  });

  it("today's build is weighed against the filled build, not the four echoes", async () => {
    const list = [...fourOfSet, E("x1", "X", 1, 9), E("y1", "Y", 1, 1.5), E("y2", "Y", 1, 0)];
    // today's five score 4.5: above the four alone (4), below them with x1 (13)
    const wearer = member("L", ["A"], ["a1", "a2", "a3", "y1", "y2"]);
    wearer.plan = { ...wearer.plan, sets: [{ key: "A", pieces: 3 }] };
    const pick = await apiOn(list, [wearer]).solve(0, new Set());
    expect(pick!.ids).toContain("x1");
  });

  it("a full build is left as it is", async () => {
    const list = [E("a1", "A", 4), E("a2", "A", 3), E("a3", "A", 3), E("a4", "A", 1), E("a5", "A", 1), E("x1", "X", 1, 90)];
    const pick = await apiOn(list, [member("L", ["A"])]).solve(0, new Set());
    expect(pick!.ids).toEqual(["a1", "a2", "a3", "a4", "a5"]);
  });
});
