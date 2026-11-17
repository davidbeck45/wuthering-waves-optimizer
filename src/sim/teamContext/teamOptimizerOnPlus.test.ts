// @vitest-environment node
// Wuthering Tools+ — Ryan's Optimize team (ADR 0052) on plus. Cypress forces auto team buffs off, so his spec only ever
// sees upstream's numbers; this is the path everyone else is on. `useTeamOptimizer` itself, real stores, real worker
// modules: its figures must be the Team page's, before the run, on every row, and after Save.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { effectScope, ref } from "vue";
import { installFakeWorkers } from "../optimizer/fakeWorkers";
import { allowStatRounding } from "./teamOptimizerPage";

/* eslint-disable @typescript-eslint/no-explicit-any */

const MAIN = "FallacyOfNoReturn";
const SETS = ["RejuvenatingGlow", "MoonlitClouds"];
const enemyConfig = { enemyLevel: 90, enemyResist: 0.1, enemyType: "Calamity" };

// all loaded after the fake workers: they reset the module registry, and the composable must share these instances
let made: import("../optimizer/fakeWorkers").FakeWorker[] = [];
let useTeamOptimizer: typeof import("../../composables/useTeamOptimizer").useTeamOptimizer;
let autoTeamBuffs: typeof import("./autoTeamBuffs").autoTeamBuffs;
let resolveTeamCharacters: typeof import("./resolveTeam").resolveTeamCharacters;
let calcTeamRotationDamage: typeof import("../../calculator/teamRotation").calcTeamRotationDamage;
let scalingPool: typeof import("../optimizer/testFixture").scalingPool;
let statScaledKit: typeof import("../optimizer/testFixture").statScaledKit;
let useCharacterStore: typeof import("../../stores/character").useCharacterStore;
let useInventoryStore: typeof import("../../stores/inventory").useInventoryStore;
let useTeamRotationsStore: typeof import("../../stores/teamRotations").useTeamRotationsStore;
let clearKeptOptimizer: typeof import("./teamOptimizerKept").clearKeptOptimizer;
let keptNoteText: typeof import("./teamOptimizerKept").keptNoteText;

beforeAll(async () => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal("window", { addEventListener() {} }); // persist/savedResults.ts listens for a lost chunk when it loads
  made = await installFakeWorkers(2);
  ({ autoTeamBuffs } = await import("./autoTeamBuffs"));
  ({ resolveTeamCharacters } = await import("./resolveTeam"));
  ({ calcTeamRotationDamage } = await import("../../calculator/teamRotation"));
  ({ scalingPool, statScaledKit } = await import("../optimizer/testFixture"));
  ({ useTeamOptimizer } = await import("../../composables/useTeamOptimizer"));
  ({ useCharacterStore } = await import("../../stores/character"));
  ({ useInventoryStore } = await import("../../stores/inventory"));
  ({ useTeamRotationsStore } = await import("../../stores/teamRotations"));
  ({ clearKeptOptimizer, keptNoteText } = await import("./teamOptimizerKept"));
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

// Hunt 2, phone flows L2: Optimize team is a view inside /teams with no history entry. Back, a tap on another page or
// "Back to team" unmounted it, and the result (or the search in flight) was gone with no word. `page()` is one visit:
// leaving stops its scope, as unmounting the component does.
describe("Optimize team when the page is left", () => {
  beforeEach(async () => {
    await seedAccount();
    clearKeptOptimizer();
    autoTeamBuffs.value = true;
    vi.spyOn(console, "warn").mockImplementation(() => {}); // onBeforeUnmount outside a component
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function page(teamId = "team-plus") {
    const scope = effectScope();
    const optimizer = scope.run(() => useTeamOptimizer(ref(teamId)))!;
    return { optimizer, leave: () => scope.stop() };
  }
  async function searched() {
    const visit = page();
    await visit.optimizer.initialize();
    visit.optimizer.setGoal(0, "damage");
    visit.optimizer.setGoal(1, "keep");
    await visit.optimizer.run();
    expect(visit.optimizer.phase.value).toBe("results");
    return visit;
  }

  it("shows the result again on the way back, with a line that says it is the last search's", async () => {
    const first = await searched();
    const rows = first.optimizer.results.value;
    const counters = [first.optimizer.totalEvaluated.value, first.optimizer.elapsedMs.value, first.optimizer.plansCompared.value, first.optimizer.plansSearched.value, first.optimizer.isProven.value];
    expect(first.optimizer.keptNote.value).toBeNull(); // nothing to say about a search made on this visit
    first.leave();

    const back = page();
    await back.optimizer.initialize();
    expect(back.optimizer.phase.value).toBe("results");
    expect(back.optimizer.results.value).toBe(rows);
    expect([back.optimizer.totalEvaluated.value, back.optimizer.elapsedMs.value, back.optimizer.plansCompared.value, back.optimizer.plansSearched.value, back.optimizer.isProven.value]).toEqual(counters);
    // the setup it ran with, not the defaults a fresh visit opens on: "Edit & run again" starts from it
    expect(back.optimizer.slots.value.map((slot) => slot.choice.goal)).toEqual(["damage", "keep"]);
    expect(back.optimizer.keptNote.value?.kind).toBe("kept");
    expect(keptNoteText(back.optimizer.keptNote.value!)).toMatch(/^This is the result of your last search here, from a moment ago\. Nothing it read has changed since/);
    // the row still saves, and reads the Team page's figure
    expect(back.optimizer.readCurrentTotal()).toBeCloseTo(await teamPageTotal(), 6);

    // "Edit & run again" puts it down: the line goes, and leaving from the setup screen keeps nothing
    back.optimizer.editSetup();
    expect(back.optimizer.keptNote.value).toBeNull();
    back.leave();
    const third = page();
    await third.optimizer.initialize();
    expect(third.optimizer.phase.value).toBe("setup");
    expect(third.optimizer.keptNote.value).toBeNull();
  }, 120_000);

  it("saves a kept result as it would have saved before the page was left", async () => {
    const first = await searched();
    first.leave();
    const back = page();
    await back.optimizer.initialize();
    const row = back.optimizer.results.value[0]!;
    const { matches } = await back.optimizer.saveAsBuilds(row);
    expect(matches).toBe(true);
    expect(await teamPageTotal()).toBeCloseTo(row.total, 3);
  }, 120_000);

  it("shows nothing kept once anything the result read has changed: an echo, the team-buff switch, a Save", async () => {
    // an echo edited elsewhere (the inventory, another tab)
    (await searched()).leave();
    (useInventoryStore().echoes as any[])[0].echoSubStatsValue1 = 99;
    let back = page();
    await back.optimizer.initialize();
    expect([back.optimizer.phase.value, back.optimizer.keptNote.value]).toEqual(["setup", null]);
    back.leave();

    // the switch moved while away: the rows were scored under the other one
    (await searched()).leave();
    autoTeamBuffs.value = false;
    back = page();
    await back.optimizer.initialize();
    expect([back.optimizer.phase.value, back.optimizer.keptNote.value]).toEqual(["setup", null]);
    back.leave();
    autoTeamBuffs.value = true;

    // saved from the results: the account is no longer the one the rows were found on
    const saved = await searched();
    await saved.optimizer.saveAsBuilds(saved.optimizer.results.value[0]!);
    saved.leave();
    back = page();
    await back.optimizer.initialize();
    expect([back.optimizer.phase.value, back.optimizer.keptNote.value]).toEqual(["setup", null]);
  }, 180_000);

  it("keeps a result for its own team only", async () => {
    (await searched()).leave();
    const teams = useTeamRotationsStore() as any;
    // a second team added while away would change the account's fingerprint: the other team is there from the start
    clearKeptOptimizer();
    teams.$patch({ teams: [...teams.teams, { ...JSON.parse(JSON.stringify(teams.getTeamById("team-plus"))), id: "team-two", name: "Two" }] });
    (await searched()).leave();
    const other = page("team-two");
    await other.optimizer.initialize();
    expect([other.optimizer.phase.value, other.optimizer.keptNote.value]).toEqual(["setup", null]);
    other.leave();
    const own = page();
    await own.optimizer.initialize();
    expect(own.optimizer.phase.value).toBe("results");
  }, 180_000);

  it("says once that leaving stopped a search, and a new search takes the line away", async () => {
    const first = page();
    await first.optimizer.initialize();
    first.optimizer.setGoal(0, "damage");
    first.optimizer.setGoal(1, "keep");
    void first.optimizer.run(); // never settles once cancelled: his run waits on workers that are gone
    for (let i = 0; i < 400 && first.optimizer.phase.value !== "running"; i += 1) await new Promise((r) => setTimeout(r, 5));
    expect(first.optimizer.phase.value).toBe("running");
    first.leave();
    first.optimizer.cancel(); // what his own unmount hook does to the workers

    const back = page();
    await back.optimizer.initialize();
    expect(back.optimizer.phase.value).toBe("setup");
    expect(back.optimizer.results.value).toEqual([]);
    expect(back.optimizer.keptNote.value?.kind).toBe("stopped");
    expect(keptNoteText(back.optimizer.keptNote.value!)).toBe("Your last search here stopped when you left this page: it runs only while this page is open. Run it again for its result.");
    // a new search: the line has been read
    await back.optimizer.run();
    expect(back.optimizer.phase.value).toBe("results");
    expect(back.optimizer.keptNote.value).toBeNull();
    back.leave();
    // and it is said once: the next visit shows the finished result, not the old line
    const third = page();
    await third.optimizer.initialize();
    expect(third.optimizer.keptNote.value?.kind).toBe("kept");
  }, 180_000);

  it("words the kept line by how long ago the search ended", () => {
    const at = new Date(2026, 10, 16, 21, 5).getTime();
    expect(keptNoteText({ kind: "kept", at }, at + 20_000)).toContain("from a moment ago");
    expect(keptNoteText({ kind: "kept", at }, at + 60_000)).toContain("from 1 minute ago");
    expect(keptNoteText({ kind: "kept", at }, at + 12 * 60_000)).toContain("from 12 minutes ago");
    expect(keptNoteText({ kind: "kept", at }, at + 3 * 3_600_000)).toMatch(/from at \d{1,2}:05/);
  });
});

// Hunt 2, solver L1: an action that switches a weapon effect for that action alone (the Team page's per-action buffs) is
// not read by his search for an effect an attack reads itself, here Solsworn Ciphers' Echo Skill DMG Amplification. The
// rows are the Team page's figures either way; his page then asked the player to report the team in the Discord.
describe("Optimize team on a team with a per-action weapon switch", () => {
  const SWITCH = { weaponPassives: { SolswornCiphersDmgDeepen: { isEnabled: false } } };
  let weaponOverrideMembers: typeof import("./teamOptimizerOverrides").weaponOverrideMembers;
  let withoutWeaponOverrides: typeof import("./teamOptimizerOverrides").withoutWeaponOverrides;

  /** Sigrika (searched) with the amplification on in her build, and Shorekeeper kept. `advancedConfig` goes on every
   *  action of Sigrika's. */
  async function seedSigrika(advancedConfig: Record<string, unknown> | null): Promise<void> {
    setActivePinia(createPinia());
    const pool = scalingPool(5, MAIN, SETS, { main: 2, four: 2, three: 4, one: 4 });
    const dps = await statScaledKit("Sigrika");
    const support = await statScaledKit("Shorekeeper");
    const record = (kit: { data: any }, extra: Record<string, unknown> = {}) => ({ ...kit.data, mainEcho: { echo: MAIN, rank: 5, buffs: {} }, optimizer: { echoSets: SETS, mainEchoes: [MAIN] }, ...extra });
    useInventoryStore().$patch({ echoes: pool, equipped: {} } as any);
    useCharacterStore().$patch({ characters: { Sigrika: record(dps, { weaponPassives: { SolswornCiphersDmgDeepen: { isEnabled: true } } }), Shorekeeper: record(support) }, activeCharacter: "Sigrika" } as any);
    const actions = [
      ...dps.actions.map((a, i) => ({ ...a, id: `d${i}`, slot: 0, ...(advancedConfig ? { advancedConfig } : {}) })),
      ...support.actions.map((a, i) => ({ ...a, id: `s${i}`, slot: 1, order: 100 + i })),
    ];
    useTeamRotationsStore().$patch({ teams: [{ id: "team-plus", name: "On plus", characterIds: ["Sigrika", "Shorekeeper", null], buildIds: [null, null, null], actions, duration: 25, mode: "basic", enemyConfig }] } as any);
  }
  async function searchSigrika() {
    const optimizer = useTeamOptimizer(ref("team-plus"));
    await optimizer.initialize();
    optimizer.setGoal(0, "damage");
    optimizer.setGoal(1, "keep");
    for (const slot of optimizer.slots.value) for (const offer of slot.offers) optimizer.setOfferTicked(slot.slot, offer.defKey, false);
    await optimizer.run();
    expect(optimizer.errorMessage.value).toBeNull();
    expect(optimizer.phase.value).toBe("results");
    return optimizer.results.value;
  }

  beforeAll(async () => {
    ({ weaponOverrideMembers, withoutWeaponOverrides } = await import("./teamOptimizerOverrides"));
  });
  beforeEach(() => {
    clearKeptOptimizer();
    autoTeamBuffs.value = false; // his own path: the stored panels, so the search and the page read the same records
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("names the gap when the switch is all of it, where his alert asked for a report", async () => {
    await seedSigrika(SWITCH);
    const rows = await searchSigrika();
    // the search does not read the switch: it scores the amplification on every action, the Team page on none
    expect(rows[0]!.matchesTeamPage).toBe(false);
    expect(rows[0]!.combinerTotal).toBeGreaterThan(rows[0]!.total);
    expect(rows.every((row) => row.matchesTeamPage || row.overrideGap)).toBe(true);
    expect(rows[0]!.overrideGap).toEqual({ characterIds: ["Sigrika"] });
  }, 120_000);

  it("has nothing to name on the same team without the switch, or with a per-action switch the search does read", async () => {
    await seedSigrika(null);
    let rows = await searchSigrika();
    expect(rows.every((row) => row.matchesTeamPage && !row.overrideGap)).toBe(true);
    // a character buff switched for one action: the search reads it, so no mismatch and no note
    await seedSigrika({ buffs: { InnateGift: { isEnabled: false } } });
    rows = await searchSigrika();
    expect(rows.every((row) => row.matchesTeamPage && !row.overrideGap)).toBe(true);
  }, 180_000);

  it("finds the members with such an action and takes only that switch out", () => {
    const team = {
      characterIds: ["Sigrika", "Shorekeeper", null],
      actions: [
        { id: "a", slot: 0, advancedConfig: { weaponPassives: { X: { isEnabled: false } }, buffs: { Y: { isEnabled: true } } } },
        { id: "b", slot: 0, advancedConfig: { buffs: { Y: { isEnabled: true } } } },
        { id: "c", slot: 1, advancedConfig: { weaponPassives: {} } }, // opened, nothing switched
        { id: "d", slot: 1, isDisabled: true, advancedConfig: { weaponPassives: { Z: { isEnabled: true } } } },
        { id: "e", slot: 1 },
      ],
    };
    expect(weaponOverrideMembers(team)).toEqual(["Sigrika"]);
    const before = JSON.stringify(team);
    const without = withoutWeaponOverrides(team);
    expect(without.actions.map((a: any) => a.advancedConfig)).toEqual([{ buffs: { Y: { isEnabled: true } } }, { buffs: { Y: { isEnabled: true } } }, { weaponPassives: {} }, { weaponPassives: { Z: { isEnabled: true } } }, undefined]);
    expect(JSON.stringify(team)).toBe(before);
    expect(weaponOverrideMembers(without)).toEqual([]);
    expect(weaponOverrideMembers({ characterIds: ["Sigrika", null, null] })).toEqual([]);
  });
});

describe("Optimize team in a tab older than the site", () => {
  const STALE = "This tab is older than the site, so the optimizer cannot start here. Reload the page, then run it again.";
  let reloads = 0;
  beforeEach(async () => {
    await seedAccount();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    reloads = 0;
    const stored: Record<string, string> = {};
    vi.stubGlobal("window", {
      sessionStorage: { getItem: (key: string) => stored[key] ?? null, setItem: (key: string, value: string) => void (stored[key] = value) },
      navigator: { onLine: true },
      location: { reload: () => void reloads++, assign: () => void reloads++, pathname: "/teams", search: "" },
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("window", {});
  });
  /** What a worker whose script is a 404 fires: a bare `error` event, no message. */
  const cannotLoad = { type: "error", preventDefault() {} };

  it("Run reloads the page once and says why, where it said only 'Could not start the search.'", async () => {
    autoTeamBuffs.value = true;
    const optimizer = useTeamOptimizer(ref("team-plus"));
    await optimizer.initialize();
    optimizer.setGoal(0, "keep");
    optimizer.setGoal(1, "damage");
    // the first generator of the run is a 404: its `error` lands before anything it was sent
    const Fake = (globalThis as any).Worker;
    let failed = false;
    vi.stubGlobal("Worker", class extends Fake {
      constructor(url: URL, options: unknown) {
        super(url, options);
        if (failed || !String(url).includes("generator")) return;
        failed = true;
        setTimeout(() => (this as any).onerror?.(cannotLoad), 0);
      }
    });
    try {
      await optimizer.run();
    } finally {
      vi.stubGlobal("Worker", Fake);
    }
    expect(failed).toBe(true);
    expect(optimizer.errorMessage.value).toBe(STALE);
    expect(optimizer.phase.value).toBe("setup");
    expect(reloads).toBe(1);
  }, 60_000);

  it("the loadout count does the same, where it spun for good", async () => {
    autoTeamBuffs.value = true;
    const optimizer = useTeamOptimizer(ref("team-plus"));
    made.length = 0;
    await optimizer.initialize();
    optimizer.setGoal(1, "damage");
    // its count starts a quarter of a second after the setup settles; an earlier test's optimizer may be counting too,
    // so every count worker alive gets the failure
    await new Promise((resolve) => setTimeout(resolve, 400));
    const counters = made.filter((w) => !w.terminated && w.posted.some((m) => m?.limit !== undefined));
    expect(counters.length).toBeGreaterThan(0);
    expect(optimizer.errorMessage.value).toBeNull();
    for (const worker of counters) worker.onerror!(cannotLoad);
    expect(optimizer.errorMessage.value).toBe(STALE);
    expect(reloads).toBe(1);
  }, 60_000);
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
