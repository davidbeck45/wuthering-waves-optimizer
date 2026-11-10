// Wuthering Tools+: /energy measures a saved team at the builds it pins. It asked wuwa_calc at the active builds while
// the ER column beside the DPS read the pinned ones, so a plan saved without "Also make active" showed 367,567 DPS next
// to "has 116.0 %" — two builds on one card (2026-11-09 hunt 2, item 2). The page's shared state over a fake client.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed } from "vue";
import { createPinia, setActivePinia } from "pinia";
import runFixture from "../engine/__fixtures__/runLite.json";
import type { MineSolve, RileyAccount, RunLite } from "../engine/rileyRun";
import { useTeamRotationsStore } from "../../stores/teamRotations";

const engine = vi.hoisted(() => ({ pin: "", asked: [] as Array<[string, string]> }));
const IDS = ["Shorekeeper", "Lynae", "Iuno"];
const base: RileyAccount = { key: "k", buildsKey: "active", builds: [], entries: {} };
const totalAt = (a: RileyAccount | null | undefined): number => (a?.buildsKey === "active" ? 367_567 : 362_854);

vi.mock("../engine/rileyClient", () => {
  const client = {
    commit: "test",
    teamKeysFor: async () => ["t404"],
    solveMine: async (keys: string[], o: { account?: RileyAccount | null } = {}) => {
      engine.asked.push(["solve", o.account?.buildsKey ?? "-"]);
      return keys.map((teamKey) => ({ teamKey, names: IDS, appKeys: IDS, status: "ok", fieldable: true, best: { rowKey: `${teamKey}-x`, picks: [], total: totalAt(o.account), bySlot: {}, seconds: 25, members: [] } }) as unknown as MineSolve);
    },
    tracedRun: async (_k: string, _p: unknown, o: { account?: RileyAccount | null } = {}) => {
      engine.asked.push(["trace", o.account?.buildsKey ?? "-"]);
      return { ...(runFixture as unknown as RunLite), total: totalAt(o.account) };
    },
    clear: () => undefined,
  };
  return { rileyClient: () => client, createRileyClient: () => client };
});
vi.mock("../engine/useRileyAccount", () => ({
  useRileyTeamAccounts: () => {
    const b = computed(() => base);
    // the saved team's own account: the base one unless the test pins it (`engine.pin` = its builds key)
    const own = (): RileyAccount => (engine.pin ? { ...base, buildsKey: engine.pin } : base);
    return { base: b, ofTeam: own, ofComposition: own, key: computed(() => engine.pin) };
  },
}));

/** a fresh /energy state per test (the module keeps one for the app) */
async function needsOf() {
  vi.resetModules();
  const { useEnergyNeeds } = await import("./useEnergyNeeds");
  return useEnergyNeeds();
}

describe("/energy on a saved team", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    engine.pin = "";
    engine.asked.length = 0;
    useTeamRotationsStore().teams = [{ id: "mine", name: "saved", characterIds: IDS, buildIds: ["plan", null, null] }] as never;
  });

  it("measures it at the builds the team pins, and shows that measurement on its card", async () => {
    engine.pin = "plan";
    const needs = await needsOf();
    await needs.ready();
    expect(engine.asked).toEqual([["solve", "plan"], ["trace", "plan"]]);
    const card = needs.savedTeams.value[0]!;
    expect(card.state?.status).toBe("ok");
    expect(card.energy?.total).toBe(362_854);
    // the chip of the same three elsewhere (a /my-rankings row) is the saved team's, not a second run at the active builds
    expect(needs.viewOf(["Iuno", "Shorekeeper", "Lynae"]).energy?.total).toBe(362_854);
    await needs.measure(["Iuno", "Shorekeeper", "Lynae"]);
    expect(engine.asked).toHaveLength(2);
    expect(needs.checkedTeams.value).toEqual([]);
  });

  it("a team that pins nothing is measured at the active builds, as before", async () => {
    const needs = await needsOf();
    await needs.ready();
    expect(engine.asked).toEqual([["solve", "active"], ["trace", "active"]]);
    expect(needs.savedTeams.value[0]!.energy?.total).toBe(367_567);
  });

  it("keeps the two apart across visits: a measurement of the active builds is not read back for the pinned ones", async () => {
    const before = await needsOf();
    await before.ready();
    await new Promise((r) => setTimeout(r, 450)); // the cache is written on a short timer
    engine.asked.length = 0;
    engine.pin = "plan";
    const after = await needsOf();
    await after.ready();
    expect(engine.asked).toEqual([["solve", "plan"], ["trace", "plan"]]);
    expect(after.savedTeams.value[0]!.energy?.total).toBe(362_854);
  });
});
