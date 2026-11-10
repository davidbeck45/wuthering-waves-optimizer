// @vitest-environment node
// Wuthering Tools+ — Ryan's Optimize team (ADR 0052) on plus. Cypress forces auto team buffs off, so his spec only ever
// sees upstream's numbers; this is the path everyone else is on. `useTeamOptimizer` itself, real stores, real worker
// modules: its figures must be the Team page's, before the run, on every row, and after Save.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import { installFakeWorkers } from "../optimizer/fakeWorkers";
import { allowStatRounding } from "./teamOptimizerPage";

/* eslint-disable @typescript-eslint/no-explicit-any */

const MAIN = "FallacyOfNoReturn";
const SETS = ["RejuvenatingGlow", "MoonlitClouds"];
const enemyConfig = { enemyLevel: 90, enemyResist: 0.1, enemyType: "Calamity" };

// all loaded after the fake workers: they reset the module registry, and the composable must share these instances
let useTeamOptimizer: typeof import("../../composables/useTeamOptimizer").useTeamOptimizer;
let autoTeamBuffs: typeof import("./autoTeamBuffs").autoTeamBuffs;
let resolveTeamCharacters: typeof import("./resolveTeam").resolveTeamCharacters;
let calcTeamRotationDamage: typeof import("../../calculator/teamRotation").calcTeamRotationDamage;
let scalingPool: typeof import("../optimizer/testFixture").scalingPool;
let statScaledKit: typeof import("../optimizer/testFixture").statScaledKit;
let useCharacterStore: typeof import("../../stores/character").useCharacterStore;
let useInventoryStore: typeof import("../../stores/inventory").useInventoryStore;
let useTeamRotationsStore: typeof import("../../stores/teamRotations").useTeamRotationsStore;

beforeAll(async () => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal("window", {});
  await installFakeWorkers(2);
  ({ autoTeamBuffs } = await import("./autoTeamBuffs"));
  ({ resolveTeamCharacters } = await import("./resolveTeam"));
  ({ calcTeamRotationDamage } = await import("../../calculator/teamRotation"));
  ({ scalingPool, statScaledKit } = await import("../optimizer/testFixture"));
  ({ useTeamOptimizer } = await import("../../composables/useTeamOptimizer"));
  ({ useCharacterStore } = await import("../../stores/character"));
  ({ useInventoryStore } = await import("../../stores/inventory"));
  ({ useTeamRotationsStore } = await import("../../stores/teamRotations"));
}, 60_000);

afterAll(() => {
  vi.unstubAllGlobals();
});

const wearing = (loadout: any[]) => Object.fromEntries([0, 1, 2, 3, 4].map((i) => [i, { echoId: loadout[i]?.echoId ?? null }]));

/** Shorekeeper gives the team crit on her Energy Regen; both characters' stored panels are empty, so only auto sees it. */
async function seedAccount(): Promise<void> {
  setActivePinia(createPinia());
  const pool = scalingPool(3, MAIN, SETS, { main: 3, four: 2, three: 4, one: 5, energyRegen: 6 }); // under the cap of her buff
  const support = await statScaledKit("Shorekeeper");
  const dps = await statScaledKit("Galbrena");
  const worn = pool.filter((e) => e.echoId.endsWith("-main-0") || e.echoId.endsWith("-3-0") || e.echoId.endsWith("-3-1") || e.echoId.endsWith("-1-0") || e.echoId.endsWith("-1-1"));
  const record = (kit: { data: any }, loadout: any[]) => ({
    ...kit.data,
    echoes: wearing(loadout),
    mainEcho: { echo: MAIN, rank: 5, buffs: {} },
    optimizer: { echoSets: SETS, mainEchoes: [MAIN] },
  });
  useInventoryStore().$patch({ echoes: pool, equipped: {} } as any);
  useCharacterStore().$patch({ characters: { Shorekeeper: record(support, worn), Galbrena: record(dps, []) }, activeCharacter: "Galbrena" } as any);
  const actions = [...support.actions.map((a, i) => ({ ...a, id: `s${i}`, slot: 0 })), ...dps.actions.map((a, i) => ({ ...a, id: `g${i}`, slot: 1, order: 100 + i }))];
  const team = { id: "team-plus", name: "On plus", characterIds: ["Shorekeeper", "Galbrena", null], buildIds: [null, null, null], actions, duration: 25, mode: "basic", enemyConfig };
  useTeamRotationsStore().$patch({ teams: [team] } as any);
}

/** What the Team page reads for this team now (`TeamRotations.vue` `computeStatsForTeam`). */
async function teamPageTotal(): Promise<number> {
  const team = useTeamRotationsStore().getTeamById("team-plus") as any;
  const echoes = useInventoryStore().echoes as any[];
  const characters = useCharacterStore().characters as any;
  const resolved = await resolveTeamCharacters(team, characters, echoes, { auto: autoTeamBuffs.value });
  const result = await calcTeamRotationDamage({ name: team.name, characterIds: team.characterIds, buildIds: team.buildIds, actions: team.actions, duration: team.duration }, resolved.characters, team.enemyConfig, echoes);
  return result.total.avgDamage ?? 0;
}

async function storedPanelTotal(): Promise<number> {
  const team = useTeamRotationsStore().getTeamById("team-plus") as any;
  const result = await calcTeamRotationDamage({ name: team.name, characterIds: team.characterIds, buildIds: team.buildIds, actions: team.actions, duration: team.duration }, useCharacterStore().characters as any, team.enemyConfig, useInventoryStore().echoes as any[]);
  return result.total.avgDamage ?? 0;
}

describe("Optimize team on plus", () => {
  beforeEach(async () => {
    await seedAccount();
    vi.spyOn(console, "warn").mockImplementation(() => {}); // onBeforeUnmount outside a component
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads the Team page's total, not the stored panels", async () => {
    autoTeamBuffs.value = true;
    const optimizer = useTeamOptimizer(ref("team-plus"));
    await optimizer.initialize();
    const page = await teamPageTotal();
    expect(await storedPanelTotal()).not.toBeCloseTo(page, 0);
    expect(optimizer.readCurrentTotal()).toBeCloseTo(page, 6);
  }, 60_000);

  it("every row is the Team page's figure with those builds worn, and after Save the page reads it", async () => {
    autoTeamBuffs.value = true;
    const optimizer = useTeamOptimizer(ref("team-plus"));
    await optimizer.initialize();
    optimizer.setGoal(0, "damage");
    optimizer.setGoal(1, "damage");
    await optimizer.run();
    expect(optimizer.errorMessage.value).toBeNull();
    expect(optimizer.phase.value).toBe("results");
    const rows = optimizer.results.value;
    expect(rows.length).toBeGreaterThan(0);
    // the search agrees with what it scored, so no row raises the mismatch alert
    expect(rows.every((row) => row.matchesTeamPage)).toBe(true);
    // a member's echoes move a teammate's buffs here, which the search can't see: never "No better combination exists"
    expect(optimizer.isProven.value).toBe(false);
    // Shorekeeper's Energy Regen moved her team's crit: the row reads what the page will, not the search's sum
    expect(rows.some((row) => Math.abs(row.total / row.combinerTotal - 1) > 1e-6)).toBe(true);
    // his buff plans (#689) ran: more than one plan, and a row says who provides what
    expect(optimizer.planCount.value).toBeGreaterThan(1);
    expect(rows[0]!.provisions.length).toBeGreaterThan(0);
    const { total, matches } = await optimizer.saveAsBuilds(rows[0]!);
    expect(matches).toBe(true);
    expect(total).toBeCloseTo(rows[0]!.total, 3);
    expect(await teamPageTotal()).toBeCloseTo(rows[0]!.total, 3);
    // a plan's panel is not saved over one plus derives: after Save the team buffs still follow the builds
    const team = useTeamRotationsStore().getTeamById("team-plus") as any;
    const after = await resolveTeamCharacters(team, useCharacterStore().characters as any, useInventoryStore().echoes as any[], { auto: true });
    expect(after.slots.map((slot) => slot.buffSource)).toEqual(["derived", "derived"]);
  }, 120_000);

  it("with auto team buffs off it is upstream's: the stored panels, and a proof when there is one", async () => {
    autoTeamBuffs.value = false;
    const optimizer = useTeamOptimizer(ref("team-plus"));
    await optimizer.initialize();
    expect(optimizer.readCurrentTotal()).toBeCloseTo(await storedPanelTotal(), 6);
    optimizer.setGoal(0, "damage");
    optimizer.setGoal(1, "damage");
    // One plan, nobody asked to provide a team buff. Since #689 his defaults tick Moonlit Clouds and the main echo for both,
    // and on a 14-echo pool his shortlist keeps only plans whose two best builds share echoes ("No combination works").
    for (const slot of optimizer.slots.value) for (const offer of slot.offers) optimizer.setOfferTicked(slot.slot, offer.defKey, false);
    await optimizer.run();
    expect(optimizer.errorMessage.value).toBeNull();
    expect(optimizer.phase.value).toBe("results");
    expect(optimizer.results.value.every((row) => row.matchesTeamPage && Math.abs(row.total / row.combinerTotal - 1) <= 1e-6)).toBe(true);
    expect(optimizer.isProven.value).toBe(true); // every loadout fits the 2,000-row lists: nothing is cut off
  }, 120_000);

  it("saves on the build the page read: one named for the team, when nothing is pinned", async () => {
    autoTeamBuffs.value = true;
    const store = useCharacterStore() as any;
    // a build named for the team, with her chains and buffs on, and a plain one without them that stays active
    store.createBuild("Galbrena", "Team with Shorekeeper");
    store.createBuild("Galbrena", "Plain");
    store.characters.Galbrena.resonanceChains = {};
    store.characters.Galbrena.buffs = {};
    expect(await teamPageTotal()).toBeGreaterThan(await storedPanelTotal()); // the page reads the named one
    const optimizer = useTeamOptimizer(ref("team-plus"));
    await optimizer.initialize();
    optimizer.setGoal(0, "keep");
    optimizer.setGoal(1, "damage");
    await optimizer.run();
    const row = optimizer.results.value[0]!;
    const { matches } = await optimizer.saveAsBuilds(row);
    expect(matches).toBe(true);
    expect(await teamPageTotal()).toBeCloseTo(row.total, 3);
  }, 120_000);
});

describe("Optimize team's Save", () => {
  beforeEach(async () => {
    await seedAccount();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  const buildCounts = () => ["Shorekeeper", "Galbrena"].map((id) => ((useCharacterStore().characters as any)[id].builds ?? []).length);

  it("saves a result once: saved again it adds no build, and the page offers no Save for it", async () => {
    autoTeamBuffs.value = true;
    const optimizer = useTeamOptimizer(ref("team-plus"));
    await optimizer.initialize();
    optimizer.setGoal(0, "damage");
    optimizer.setGoal(1, "damage");
    await optimizer.run();
    const row = optimizer.results.value[0]!;
    await vi.waitFor(() => expect(optimizer.changedCharacters(row).length).toBeGreaterThan(0));
    const first = await optimizer.saveAsBuilds(row);
    expect(first.matches).toBe(true);
    const after = buildCounts();
    // the row is now what the team wears: nothing to save, so the page shows no Save for it
    await vi.waitFor(() => expect(optimizer.changedCharacters(row)).toEqual([]));
    const second = await optimizer.saveAsBuilds(row);
    expect(buildCounts()).toEqual(after);
    expect(second.total).toBeCloseTo(first.total, 6);
    expect(second.matches).toBe(true);
    expect(await teamPageTotal()).toBeCloseTo(row.total, 3);
  }, 120_000);

  it("a member whose pick is what they wear today gets no new build beside a teammate who does", async () => {
    autoTeamBuffs.value = true;
    const optimizer = useTeamOptimizer(ref("team-plus"));
    await optimizer.initialize();
    optimizer.setGoal(0, "damage");
    optimizer.setGoal(1, "damage");
    await optimizer.run();
    const row = optimizer.results.value[0]!;
    await optimizer.saveAsBuilds(row);
    // run again from the saved builds: the best row is the builds of today, or changes only who changed
    optimizer.editSetup();
    await optimizer.run();
    const again = optimizer.results.value.find((r) => Math.abs(r.total / row.total - 1) < 1e-9);
    if (!again) return; // the second search found better: nothing to check here
    const before = buildCounts();
    await vi.waitFor(() => expect(optimizer.changedCharacters(again)).toEqual([]));
    await optimizer.saveAsBuilds(again);
    expect(buildCounts()).toEqual(before);
  }, 120_000);
});

describe("Optimize team's drawer on a pinned build", () => {
  beforeEach(async () => {
    await seedAccount();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("an echo buff switched in the drawer reaches the run, on the build the team pins and no other", async () => {
    autoTeamBuffs.value = true;
    const { scopedSettingsStore } = await import("./optimizerSettingsScope");
    const store = useCharacterStore();
    // Whole account's default: the member is pinned to "Account plan", the active build stays "Default build"
    const fields = (): any => JSON.parse(JSON.stringify((store.characters as any).Galbrena));
    const builds = [{ id: "default", name: "Default build", ...fields() }, { id: "plan", name: "Account plan", ...fields() }];
    store.$patch((state: any) => {
      state.characters.Galbrena.activeBuildId = "default";
      state.characters.Galbrena.builds = builds;
    });
    (useTeamRotationsStore().getTeamById("team-plus") as any).buildIds = [null, "plan", null];

    const optimizer = useTeamOptimizer(ref("team-plus"));
    await optimizer.initialize();
    optimizer.setGoal(0, "keep");
    optimizer.setGoal(1, "damage");
    await optimizer.run();
    expect(optimizer.errorMessage.value).toBeNull();
    const before = optimizer.results.value[0]!.echoBuffsBySlot[1]!.echoSetPassives;
    const key = "RejuvenatingGlow5SetATK"; // a passive with a switch: off until the player turns it on
    expect(before[key]!.isEnabled).toBe(false);

    // what the drawer's buff row does, under the scope the drawer provides
    const drawer = scopedSettingsStore(store, ref({ characterId: "Galbrena", buildId: optimizer.team.value.buildIds[1] })) as any;
    drawer.setCharacterData("Galbrena", { optimizer: { echoSetPassives: { [key]: { isEnabled: true } } } });
    const stored = (store.characters as any).Galbrena;
    expect(stored.builds[1].optimizer.echoSetPassives[key].isEnabled).toBe(true);
    expect(stored.optimizer.echoSetPassives?.[key]).toBeUndefined(); // the active build's settings, the calculator's, are as they were
    expect(stored.builds[0].optimizer.echoSetPassives?.[key]).toBeUndefined();

    optimizer.editSetup();
    await optimizer.run();
    expect(optimizer.errorMessage.value).toBeNull();
    expect(optimizer.results.value[0]!.echoBuffsBySlot[1]!.echoSetPassives[key]!.isEnabled).toBe(true);
  }, 120_000);
});

describe("allowStatRounding", () => {
  it("lets a build meet the one-decimal figure read from it, and keeps a real gap", () => {
    const [guard] = allowStatRounding([{ floors: [{ stat: "energyRegen", minValue: 125, label: "Energy Regen" }], drifts: [{ label: "Energy Regen", teammateId: "A", expected: 125, actual: 124.96 }, { label: "Energy Regen", teammateId: "B", expected: 125, actual: 120 }] }]);
    expect(guard!.floors[0].minValue).toBeCloseTo(124.95, 9);
    expect(guard!.drifts.map((d) => d.teammateId)).toEqual(["B"]);
    expect(allowStatRounding([null])).toEqual([null]);
  });
});
