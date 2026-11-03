// Wuthering Tools+ — the optimizer's memo behind `AllocationApi` (buildTeam.ts `memberSearchApi`) must never hand back
// echoes the call has taken. Today's build competes in every solve and may hold echoes outside the member's pool (an
// off-set piece when the plan names fewer than five pieces); a memo keyed on the pool alone returned today's build
// from an earlier call where it was free, and the account's pair re-optimisation (or Build my team's every-order
// greedy) then put one echo in two builds. A fake optimizer over a tiny synthetic inventory, no engine.
import { describe, expect, it } from "vitest";
import { allocateTeam, hasReuse } from "../allocate";
import { memberSearchApi, type ActiveMember } from "../buildTeam";
import { relaxLevels, type BuildOptions, type MemberConstraints } from "../constraints";
import type { OptimizerBackend } from "../headlessOptimizer";
import { acceptMove, solveAccount } from "./solve";

/* eslint-disable @typescript-eslint/no-explicit-any */

const E = (id: string, set: string, cost: number) => ({ echoId: id, echo: `sp_${id}`, echoSet: set, type: cost, stat: "x" });
const echoes = [
  E("a1", "A", 4), E("a2", "A", 3), E("a3", "A", 3), E("a4", "A", 1), E("a5", "A", 1),
  E("b1", "B", 4), E("b2", "B", 3), E("b3", "B", 3), E("b4", "B", 1), E("b5", "B", 1),
  E("e1", "B", 1), E("e2", "B", 1),
];
// H wears 3 A + e1, e2 (set B) today; W wants e1, e2 far more
const worth: Record<string, Record<string, number>> = { H: { e1: 10, e2: 10 }, W: { e1: 50, e2: 50 } };
const w = (c: string, id: string): number => worth[c]?.[id] ?? 1;
const sum = (c: string, l: any[]): number => l.reduce((n, e) => n + w(c, e.echoId), 0);
const backend: OptimizerBackend = {
  async optimize(job: any, req: any) {
    const top = [...req.pool].sort((x, y) => w(job.characterId, y.echoId) - w(job.characterId, x.echoId) || x.echoId.localeCompare(y.echoId)).slice(0, 5);
    return (top.length < 5 ? { results: [], processed: 0 } : { results: [{ loadout: top, targetValue: sum(job.characterId, top), energyRegen: 1 }], processed: 1 }) as any;
  },
  async score(job: any, loadouts: any[][]) {
    return loadouts.map((l) => ({ loadout: l, targetValue: sum(job.characterId, l), energyRegen: 1 })) as any;
  },
};
const member = (id: string, sets: string[], plan: Array<{ key: string; pieces: number }>, today: string[]): ActiveMember => {
  const c: MemberConstraints = { characterId: id, allowedSets: sets, mainEchoKeys: null, layout: null, loadoutFormat: "Any", mainStatsByCost: null, erFloor: null };
  return {
    slot: 0,
    job: { characterId: id, id, erOffset: 0 } as any,
    c,
    levels: relaxLevels(c),
    plan: { characterId: id, sets: plan } as any,
    before: 0,
    objectiveSource: "team",
    resolved: { [id]: { echoes: Object.fromEntries(today.map((e, i) => [i, { echoId: e }])) } },
    enemy: {} as any,
  };
};
const options: BuildOptions = { useSets: true, useMainStats: true, keepMainEcho: false, takeFromOthers: false, tryAllOrders: true };
const apiFor = () =>
  memberSearchApi([member("H", ["A"], [{ key: "A", pieces: 3 }], ["a1", "a2", "a3", "e1", "e2"]), member("W", ["B"], [{ key: "B", pieces: 5 }], ["b1", "b2", "b3", "b4", "b5"])], {
    echoes,
    echoById: new Map(echoes.map((e) => [e.echoId, e])),
    options,
    wornOutside: new Set(),
    keptInTeam: new Set(),
    backend,
    hooks: {},
  }).api;

describe("memberSearchApi's memo and today's build", () => {
  it("a solve never returns an echo it was told is taken", async () => {
    const api = apiFor();
    const first = await api.solve(0, new Set());
    expect(first!.ids).toEqual(["a1", "a2", "a3", "e1", "e2"]); // today's build wins while it is free
    const again = await api.solve(0, new Set(["e1"]));
    expect(again!.ids).not.toContain("e1");
  });

  it("the account's local search hands e1, e2 to W without leaving them on H", async () => {
    const pools = [new Set(["a1", "a2", "a3", "a4", "a5"]), new Set(["b1", "b2", "b3", "b4", "b5", "e1", "e2"])];
    const r = await solveAccount(apiFor(), { members: 2, order: [0, 1], weights: [1, 1], pools });
    expect(hasReuse(r.picks)).toBe(false);
    expect(r.picks[1]!.ids).toEqual(expect.arrayContaining(["e1", "e2"]));
    expect(r.value).toBeGreaterThan(r.greedy.value);
  });

  it("Build my team's every-order greedy keeps one echo in one build", async () => {
    const r = await allocateTeam(apiFor(), { members: 2, order: [0, 1], weights: [1, 1], allOrders: true });
    expect(hasReuse(r.picks)).toBe(false);
  });

  it("acceptMove refuses an allocation with an echo twice, whatever its value", () => {
    const c = (ids: string[], value: number) => ({ ids, value, er: 100, meetsFloor: true });
    expect(acceptMove([c(["x", "y"], 50), c(["y", "z"], 50)], [c(["x", "y"], 1), c(["q", "z"], 1)], [1, 1])).toBe(false);
  });
});
