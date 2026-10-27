// Wuthering Tools+ — "Build it for me": constraints, parity with upstream's optimizer and calculator, apply / undo.
//
// Parity is the gate that catches glue drift: the headless job (buildCharacterCalculationContext → the optimizer
// context Calculator.vue's handleOptimize lays out) must rank exactly as upstream's own `optimize()` does on the same
// pool, and the build it produces must read in the calculator exactly the score the optimizer gave it.
import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import account from "../myRankings/__fixtures__/cartethyiaAccount.json";
import { optimize, type OptimizerContext } from "../../calculator/optimizer";
import { calcCharacterRotationDamage } from "../../calculator/characterRotation";
import { resolveCharactersForBuild } from "../../calculator/buildOverride";
import { RANKING_ENEMY } from "../myRankings/rankRoster";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { getCharByName } from "../../characters/characters";
import { echoSetLabelMap } from "../../echoes/stats";
import { constraintsOf, DEFAULT_OPTIONS, filterPool, legalInSlot, mainEchoCandidates, meetsSetPieces, relaxLevels, shortfallOf } from "./constraints";
import { emptyPlan, echoKeysOf, erNeedOf, parseMainStats, planFromPreset, priorityOrder, setKeyOf, type MemberPlan } from "./rileyPlan";
import { inlineBackend, menuErOf, prepareMemberJob, type Objective } from "./headlessOptimizer";
import { buildMyTeam, draftBuildFields } from "./buildTeam";
import { applyBuildTeam, buildNameFor, readUndo, undoBuildTeam, undoIsLive, UNDO_KEY, type BuildTeamStores } from "./apply";
import { serializeOptimizerEchoes } from "./workerBackend";
import { buildEchoLoadoutFromIds } from "../../echoes/echoLoadout";

/* eslint-disable @typescript-eslint/no-explicit-any */

const characters: Record<string, any> = JSON.parse(JSON.stringify(account.characters));
const echoes: any[] = JSON.parse(JSON.stringify(account.echoes));
const cart = characters.Cartethyia;
const rotation = { ...cart.rotations[0], actions: cart.rotations[0].actions };
const objective: Objective = { rotation, label: rotation.name, source: "yours" };

/** Riley's pick for Cartethyia in his Mornye + Chisa team (wuwa_calc 653fee7): Windward Pilgrimage 5pc, Reminiscence:
 *  Fleurdelys, 44111 CR CD hp hp hp. */
const cartPlan = (): MemberPlan => ({
  characterId: "Cartethyia",
  source: "riley",
  mainDps: true,
  share: 0.87,
  dps: 160000,
  sets: [{ key: "WindwardPilgrimage", pieces: 5 }],
  setsLabel: "Windward Pilgrimage 5pc",
  mainEcho: { name: "Reminiscence: Fleurdelys", keys: echoKeysOf("Reminiscence: Fleurdelys") },
  mainStats: parseMainStats("44111 CR CD hp hp hp"),
  erNeed: null,
  erSetBy: null,
  note: "My build",
  unmapped: [],
});

describe("Riley's pick as app keys", () => {
  it("maps set names, piece counts, main echoes (Phantom skins included) and layouts", () => {
    expect(setKeyOf("Moonlit Clouds 5pc")).toBe("MoonlitClouds");
    expect(setKeyOf("Flamewing's Shadow 3pc")).toBe("FlamewingsShadow");
    expect(setKeyOf("Heart of Evil's Purge 5pc")).toBe("HeartofEvilsPurge");
    expect(echoKeysOf("Impermanence Heron")).toEqual(["ImpermanenceHeron", "PhantomImpermanenceHeron"]);
    expect(echoKeysOf("False Sovereign")).toEqual(["TheFalseSovereign", "PhantomTheFalseSovereign"]);
    expect(echoKeysOf("Nightmare: Crownless")[0]).toBe("NightmareCrownless");
    expect(parseMainStats("43311 CD ATK Fusion atk atk")).toMatchObject({ layout: "43311", slots: ["CritDMG", "ATK", "Fusion", "ATK", "ATK"], byCost: { 4: ["CritDMG"], 3: ["ATK", "Fusion"], 1: ["ATK"] } });
    expect(parseMainStats("43311 HP ER ER hp hp")!.byCost[3]).toEqual(["EnergyRegen"]);
    expect(parseMainStats("41111 CR atk hp hp hp")).toMatchObject({ layout: "41111", byCost: { 4: ["CritRate"], 1: ["ATK", "HP"] } });
    expect(parseMainStats("33311 x")).toBeNull();
  });

  it("reads the ER need as max(loop bar, kit floor), the energy check's rule", () => {
    expect(erNeedOf({ bar: 187.46, minEr: 0 })).toEqual({ need: 187.46, setBy: "loop" });
    expect(erNeedOf({ bar: 188, minEr: 240 })).toEqual({ need: 240, setBy: "kit" });
    expect(erNeedOf({ bar: null, minEr: 0 })).toEqual({ need: null, setBy: null });
  });

  it("falls back to every curated echo preset with no set it cannot name", async () => {
    const keys = ["Aemeath", "Cartethyia", "Chisa", "Shorekeeper", "Lynae", "Mornye", "Iuno", "Galbrena"];
    for (const key of keys) {
      const chosen = (await getCharByName(key)) as any;
      const preset = chosen?.echoes?.find((p: any) => p?.data?.echoes);
      if (!preset) continue;
      const plan = planFromPreset(key, preset);
      expect(plan.source, key).toBe("preset");
      expect(plan.sets.length, key).toBeGreaterThan(0);
      for (const s of plan.sets) expect(echoSetLabelMap[s.key], `${key} ${s.key}`).toBeTruthy();
      expect(plan.mainEcho?.keys.length ?? 0, key).toBeGreaterThan(0);
    }
  });

  it("orders members by Riley's share, the main DPS first without one", () => {
    expect(priorityOrder([{ share: 0.01, mainDps: false }, { share: 0.1, mainDps: false }, { share: 0.87, mainDps: true }])).toEqual([2, 1, 0]);
    expect(priorityOrder([{ share: null, mainDps: false }, { share: null, mainDps: true }, { share: null, mainDps: false }])).toEqual([1, 0, 2]);
  });
});

describe("constraints", () => {
  it("43311 / 44111 go to the optimizer as themselves; 41111 runs as Any with only the main echo as a 4-cost", () => {
    const plan = cartPlan();
    expect(constraintsOf(plan, DEFAULT_OPTIONS).loadoutFormat).toBe("44111");
    const p41 = { ...plan, mainStats: parseMainStats("41111 CR hp hp hp hp") };
    const c41 = constraintsOf(p41, DEFAULT_OPTIONS);
    expect(c41.loadoutFormat).toBe("Any");
    const { pool, dropped } = filterPool(echoes, c41);
    expect(pool.filter((e) => e.type === 4).every((e) => c41.mainEchoKeys!.includes(e.echo))).toBe(true);
    expect(pool.some((e) => e.type === 3)).toBe(false);
    expect(dropped.cost + dropped.fourCost + dropped.mainStat + dropped.set).toBeGreaterThan(0);
  });

  it("filters main stats per cost, keeps the main echo's copies whatever their main stat, and keeps the sets", () => {
    const c = constraintsOf(cartPlan(), DEFAULT_OPTIONS);
    const { pool } = filterPool(echoes, c);
    expect(pool.length).toBeGreaterThan(0);
    for (const e of pool) {
      expect(e.echoSet).toBe("WindwardPilgrimage");
      if (e.echo !== "ReminiscenceFleurdelys") expect(c.mainStatsByCost![e.type]).toContain(e.stat);
    }
    expect(mainEchoCandidates(pool, c)).toEqual({ keys: ["ReminiscenceFleurdelys"], fallback: false });
    // a pool with no copy of the main echo: the layout's 4-costs stand in
    const noMain = pool.filter((e) => e.echo !== "ReminiscenceFleurdelys");
    expect(mainEchoCandidates(noMain, c).fallback).toBe(true);
  });

  it("names the slots a pool cannot fill, and relaxes main stats, then the layout, never the sets", () => {
    const c = constraintsOf({ ...cartPlan(), mainStats: parseMainStats("43311 CD Aero Aero hp hp") }, DEFAULT_OPTIONS);
    const { pool } = filterPool(echoes, c);
    expect(shortfallOf(pool, c)).toEqual([{ cost: 3, stats: ["Aero"], need: 2, have: 0 }]);
    const levels = relaxLevels(c);
    expect(levels.map((l) => l.level)).toEqual(["plan", "mainStats", "layout"]);
    expect(levels.every((l) => l.c.allowedSets?.join() === "WindwardPilgrimage")).toBe(true);
    expect(levels[2]!.c.loadoutFormat).toBe("Any");
  });

  it("leaves out echoes other characters wear unless allowed, and echoes a teammate took", () => {
    const c = constraintsOf(cartPlan(), DEFAULT_OPTIONS);
    const id = echoes.find((e) => e.echoSet === "WindwardPilgrimage" && e.type === 1).echoId;
    expect(filterPool(echoes, c, { wornOutside: new Set([id]) }).dropped.worn).toBe(1);
    expect(filterPool(echoes, c, { taken: new Set([id]) }).dropped.taken).toBe(1);
  });

  it("allows a swap only for the same cost, a legal stat and no species twice", () => {
    const c = constraintsOf(cartPlan(), DEFAULT_OPTIONS);
    const pool = filterPool(echoes, c).pool;
    const fours = pool.filter((e) => e.type === 4 && e.echo !== "ReminiscenceFleurdelys");
    const ones = pool.filter((e) => e.type === 1);
    const main = pool.find((e) => e.echo === "ReminiscenceFleurdelys");
    const loadout = [main, fours[0], ones[0], ones[1], ones[2]];
    expect(legalInSlot(ones[3], 2, loadout, c)).toBe(ones[3].echo !== ones[1].echo && ones[3].echo !== ones[2].echo);
    expect(legalInSlot(ones[3], 1, loadout, c)).toBe(false); // a 1-cost in a 4-cost slot
    expect(legalInSlot(fours[0], 0, loadout, c)).toBe(false); // slot 0 is the main echo's
  });
});

describe("parity with upstream's optimizer and calculator", () => {
  it("ranks exactly as upstream's optimize() on the same pool (Any), and the headless top build reads the same in the calculator", async () => {
    const c = constraintsOf(cartPlan(), { ...DEFAULT_OPTIONS, useMainStats: false });
    const close = (a: number[], b: number[]): void => {
      expect(a).toHaveLength(b.length);
      a.forEach((x, i) => expect(x).toBeCloseTo(b[i]!, 6)); // the processor sums in its own slot order: last-ulp only
    };
    const { pool } = filterPool(echoes, { ...c, layout: null, loadoutFormat: "Any" });
    const mainKeys = mainEchoCandidates(pool, c).keys;
    const job = await prepareMemberJob({ characterId: "Cartethyia", characters, inventoryEchoes: echoes, enemy: RANKING_ENEMY, objective, setKeys: ["WindwardPilgrimage"], mainEchoKeys: mainKeys });
    const ours = await inlineBackend().optimize(job, { pool: serializeOptimizerEchoes(pool), mainEchoKeys: mainKeys, loadoutFormat: "Any", minStats: [], topN: 5 });
    const ctx = { ...job.context, getRotationById: () => job.rotation } as OptimizerContext;
    const theirs = optimize(serializeOptimizerEchoes(pool), ctx, [], 5, mainKeys, [], job.echoSetPassiveBuffs, job.mainEchoStats, job.target, "Average") as any[];
    close(ours.results.map((r) => r.targetValue), theirs.map((r) => r.targetValue));
    expect(ours.results[0]!.loadout.map((e) => e.echoId).sort()).toEqual(theirs[0].loadout.map((e: any) => e.echoId).sort());

    // the produced build, saved and read by the calculator: the optimizer's own score, to the unit
    const top = ours.results[0]!;
    const loadout = top.loadout.map((e) => echoes.find((x) => x.echoId === e.echoId));
    const draft = draftBuildFields(characters.Cartethyia, loadout, job.buffConfig);
    const withBuild = { ...characters, Cartethyia: { ...characters.Cartethyia, builds: [{ id: "bt", name: "t", ...draft }] } };
    const calc = await calcCharacterRotationDamage(rotation, null, "Cartethyia", withBuild, RANKING_ENEMY, echoes, "bt");
    expect(calc.damageAggregation.avgDamage).toBeCloseTo(top.targetValue, 6);
  }, 120000);

  it("her own build competes: the result is never worse than what she wears", async () => {
    const team = { id: null, name: "Cartethyia", characterIds: ["Cartethyia", null, null] };
    const result = await buildMyTeam({ characters, inventory: { echoes, equipped: {} }, team, plans: [cartPlan()], order: [0], options: DEFAULT_OPTIONS }, inlineBackend());
    const m = result.members[0]!;
    expect(m.status).toBe("ok");
    expect(m.after!.value).toBeCloseTo(m.after!.optimizerValue, 6);
    // today's echoes with the run's buff settings are a candidate, so the result scores at least as much
    if (m.before!.withRunBuffs != null) expect(m.after!.value).toBeGreaterThanOrEqual(m.before!.withRunBuffs * (1 - 1e-9));
    if (m.keptCurrent) expect(m.sameEchoes).toBe(true);
  }, 120000);

  it("buildMyTeam's 44111 result: optimizer score = calculator number, sets and layout as planned", async () => {
    const team = { id: null, name: "Cartethyia", characterIds: ["Cartethyia", null, null] };
    // no echoes equipped: nothing of hers competes, so the plan's build must come out
    const bare = { ...characters, Cartethyia: { ...characters.Cartethyia, echoes: {} } };
    const result = await buildMyTeam({ characters: bare, inventory: { echoes, equipped: {} }, team, plans: [cartPlan()], order: [0], options: DEFAULT_OPTIONS }, inlineBackend());
    const m = result.members[0]!;
    expect(m.status).toBe("ok");
    expect(m.after!.value).toBeCloseTo(m.after!.optimizerValue, 6);
    expect(m.meetsPlanSets).toBe(true);
    const costs = m.after!.picks.map((p) => Number(p.echo.type)).sort((a, b) => b - a).join("");
    expect(costs).toBe("44111");
    expect(m.after!.picks[0]!.echo.echo).toBe("ReminiscenceFleurdelys");
    expect(m.relaxed).toBe("plan");
    expect(m.keptCurrent).toBe(false);
    // the draft is a full build: pointers, main echo, the set bonus labels the echoes give
    expect(Object.keys(m.draft!.echoes)).toHaveLength(5);
    expect(m.draft!.mainEcho.echo).toBe("ReminiscenceFleurdelys");
    expect(m.draft!.echoSetBonus.setBonusTwo).toBe("Windward Pilgrimage 5 Set");
  }, 120000);

  it("an ER floor out of reach keeps the loadout with the most ER and says so", async () => {
    const team = { id: null, name: "Cartethyia", characterIds: ["Cartethyia", null, null] };
    const plan = { ...cartPlan(), erNeed: 400 };
    const result = await buildMyTeam({ characters, inventory: { echoes, equipped: {} }, team, plans: [plan], order: [0], options: DEFAULT_OPTIONS }, inlineBackend());
    const m = result.members[0]!;
    expect(m.status).toBe("ok");
    expect(m.erMet).toBe(false);
    // the most ER a complete plan build can have: the result has that much
    const job = await prepareMemberJob({ characterId: "Cartethyia", characters, inventoryEchoes: echoes, enemy: RANKING_ENEMY, objective, setKeys: ["WindwardPilgrimage"], mainEchoKeys: ["ReminiscenceFleurdelys"] });
    const best = await inlineBackend().optimize(
      { ...job, id: `${job.id}:er`, target: "Stat:energyRegen" },
      { pool: filterPool(echoes, constraintsOf(plan, DEFAULT_OPTIONS)).pool, mainEchoKeys: ["ReminiscenceFleurdelys"], loadoutFormat: "44111", minStats: [], topN: 1 },
    );
    expect(m.after!.menuEr!).toBeGreaterThanOrEqual(menuErOf(job, best.results[0]!.energyRegen) - 1e-6);
    expect(m.erUnreachable).toBe(true);
  }, 120000);

  it("a teammate who gets no new build keeps their echoes: nobody else's build takes them", async () => {
    const solo = await buildMyTeam(
      { characters, inventory: { echoes, equipped: {} }, team: { id: null, name: "Cartethyia", characterIds: ["Cartethyia", null, null] }, plans: [cartPlan()], order: [0], options: DEFAULT_OPTIONS },
      inlineBackend(),
    );
    const wanted = solo.members[0]!.after!.picks.slice(1, 3).map((p) => String(p.echo.echoId));
    // Chisa wears two of the echoes Cartethyia's build would take, and has nothing to build from (no Moonlit Clouds)
    const withChisa = { ...characters, Chisa: { weapon: "Kumokiri", echoes: buildEchoLoadoutFromIds(wanted, { fillSlots: 5 }) } };
    const chisaPlan: MemberPlan = { ...emptyPlan("Chisa"), source: "riley", sets: [{ key: "MoonlitClouds", pieces: 5 }], setsLabel: "Moonlit Clouds 5pc" };
    const result = await buildMyTeam(
      { characters: withChisa, inventory: { echoes, equipped: {} }, team: { id: null, name: "Duo", characterIds: ["Cartethyia", "Chisa", null] }, plans: [cartPlan(), chisaPlan], order: [0, 1], options: DEFAULT_OPTIONS },
      inlineBackend(),
    );
    const cart = result.members[0]!;
    expect(result.members[1]!.status).not.toBe("ok");
    expect(cart.status).toBe("ok");
    const ids = cart.after!.picks.map((p) => String(p.echo.echoId));
    for (const id of wanted) expect(ids).not.toContain(id);
    expect(cart.after!.picks.every((p) => p.sharedWith.length === 0)).toBe(true);
  }, 120000);

  it("names what is missing when no build is possible", async () => {
    const team = { id: null, name: "Cartethyia", characterIds: ["Cartethyia", null, null] };
    const plan: MemberPlan = { ...emptyPlan("Cartethyia", true), source: "riley", sets: [{ key: "MoonlitClouds", pieces: 5 }], setsLabel: "Moonlit Clouds 5pc", mainStats: parseMainStats("43311 CD ATK Aero atk atk") };
    const result = await buildMyTeam({ characters, inventory: { echoes, equipped: {} }, team, plans: [plan], order: [0], options: DEFAULT_OPTIONS }, inlineBackend());
    expect(result.members[0]!.status).toBe("noEchoes");
    expect(result.members[0]!.message).toMatch(/Moonlit Clouds/);
  }, 120000);
});

describe("apply and undo", () => {
  let stores: BuildTeamStores;
  const snapshot = (): string => JSON.stringify({ c: stores.character.characters, t: stores.team.teams, e: stores.inventory.equipped, p: stores.inventory.equippedPresets });

  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.removeItem(UNDO_KEY);
    const character = useCharacterStore();
    const inventory = useInventoryStore();
    const team = useTeamRotationsStore();
    character.characters = JSON.parse(JSON.stringify({ ...characters, Chisa: { weapon: "Kumokiri" } }));
    character.ensureCharacterBuilds("Cartethyia");
    inventory.echoes = JSON.parse(JSON.stringify(echoes));
    inventory.equipped = Object.fromEntries(Object.values(characters.Cartethyia.echoes).map((s: any, i) => [s.echoId, { Cartethyia: i }]));
    team.teams = [{ id: "t1", name: "Test team", characterIds: ["Cartethyia", "Chisa", null], buildIds: [null, null, null], actions: [], duration: null, enemyConfig: {} }];
    stores = { character, team, inventory } as unknown as BuildTeamStores;
  });

  const draftFor = (ids: string[]): Record<string, any> => {
    const loadout = ids.map((id) => echoes.find((e) => e.echoId === id));
    return draftBuildFields(stores.character.characters.Cartethyia, loadout, { echoSetPassives: { WindwardPilgrimage5SetCritRate: { isEnabled: true } }, mainEchoBuffs: {}, defaulted: [] });
  };
  const someIds = (): string[] => [echoes[1].echoId, ...echoes.filter((e) => e.type === 4 && e.echo !== "ReminiscenceFleurdelys").slice(0, 1).map((e) => e.echoId), ...echoes.filter((e) => e.type === 1).slice(0, 3).map((e) => e.echoId)];

  it("names the build for the team and never reuses a name", () => {
    expect(buildNameFor("Cartethyia", ["Cartethyia", "Chisa", "Ciaccona"], [])).toBe("Built for Chisa + Ciaccona");
    expect(buildNameFor("Cartethyia", ["Cartethyia", "Chisa", "Ciaccona"], ["Built for Chisa + Ciaccona"])).toBe("Built for Chisa + Ciaccona (2)");
  });

  it("creates a new build, pins it in the team and leaves the active build alone", () => {
    const before = stores.character.characters.Cartethyia.activeBuildId;
    const live = JSON.stringify(stores.character.characters.Cartethyia.echoes);
    const out = applyBuildTeam(stores, { team: { id: "t1", name: "Test team", characterIds: ["Cartethyia", "Chisa", null] }, members: [{ slot: 0, characterId: "Cartethyia", draft: draftFor(someIds()) }] });
    const c = stores.character.characters.Cartethyia;
    expect(out.created).toHaveLength(1);
    expect(c.builds).toHaveLength(2);
    expect(c.builds[1].name).toBe("Built for Chisa");
    expect(c.activeBuildId).toBe(before);
    expect(JSON.stringify(c.echoes)).toBe(live);
    expect(stores.team.teams[0].buildIds).toEqual([out.created[0]!.buildId, null, null]);
    // the team reads the pinned build
    const resolved = resolveCharactersForBuild(stores.character.characters, "Cartethyia", out.created[0]!.buildId);
    expect(Object.values(resolved.Cartethyia.echoes).map((s: any) => s.echoId)).toEqual(someIds());
    expect(readUndo()?.created[0]!.buildId).toBe(out.created[0]!.buildId);
    expect(undoIsLive(stores, readUndo())).toBe(true);
  });

  it("undo restores the previous state exactly", () => {
    const pristine = snapshot();
    const out = applyBuildTeam(stores, { team: { id: "t1", name: "Test team", characterIds: ["Cartethyia", "Chisa", null] }, members: [{ slot: 0, characterId: "Cartethyia", draft: draftFor(someIds()) }] });
    expect(snapshot()).not.toBe(pristine);
    const undone = undoBuildTeam(stores, out.undo);
    expect(undone.kind).toBe("exact");
    expect(snapshot()).toBe(pristine);
    expect(readUndo()).toBeNull();
  });

  it("also make active: switches the build and the equipped map, and undo brings both back exactly", () => {
    const pristine = snapshot();
    const out = applyBuildTeam(stores, { team: { id: "t1", name: "Test team", characterIds: ["Cartethyia", "Chisa", null] }, members: [{ slot: 0, characterId: "Cartethyia", draft: draftFor(someIds()) }], makeActive: true });
    const c = stores.character.characters.Cartethyia;
    expect(c.activeBuildId).toBe(out.created[0]!.buildId);
    expect(Object.values(c.echoes).map((s: any) => s.echoId)).toEqual(someIds());
    for (const [i, id] of someIds().entries()) expect(stores.inventory.equipped[id]?.Cartethyia).toBe(i);
    undoBuildTeam(stores, out.undo);
    expect(JSON.parse(snapshot())).toEqual(JSON.parse(pristine));
    expect(snapshot()).toBe(pristine);
  });

  it("a character with no builds list gets one, and undo takes it away again", () => {
    const pristine = snapshot();
    const out = applyBuildTeam(stores, { team: { id: "t1", name: "Test team", characterIds: ["Cartethyia", "Chisa", null] }, members: [{ slot: 1, characterId: "Chisa", draft: { weapon: "Kumokiri", echoes: {} } }] });
    expect(stores.character.characters.Chisa.builds).toHaveLength(2);
    expect(out.undo.synthesized).toEqual(["Chisa"]);
    undoBuildTeam(stores, out.undo);
    expect(snapshot()).toBe(pristine);
  });

  it("after a later edit, undo only removes what is still unused and never overwrites a record", () => {
    const out = applyBuildTeam(stores, { team: { id: "t1", name: "Test team", characterIds: ["Cartethyia", "Chisa", null] }, members: [{ slot: 0, characterId: "Cartethyia", draft: draftFor(someIds()) }] });
    stores.character.characters.Cartethyia.weapon = "SomethingElse"; // an edit after the apply
    const undone = undoBuildTeam(stores, out.undo);
    expect(undone.kind).toBe("partial");
    expect(stores.character.characters.Cartethyia.weapon).toBe("SomethingElse");
    expect(stores.character.characters.Cartethyia.builds.some((b: any) => b.id === out.created[0]!.buildId)).toBe(false);
    expect(stores.team.teams[0].buildIds[0]).toBeNull();
  });

  it("keeps the set bonus labels and buff settings the run used in the saved build", () => {
    const out = applyBuildTeam(stores, { team: { id: "t1", name: "Test team", characterIds: ["Cartethyia", "Chisa", null] }, members: [{ slot: 0, characterId: "Cartethyia", draft: draftFor(someIds()) }] });
    const build = stores.character.characters.Cartethyia.builds.find((b: any) => b.id === out.created[0]!.buildId);
    expect(build.echoSetPassives.WindwardPilgrimage5SetCritRate).toEqual({ isEnabled: true });
    expect(build.mainEcho.echo).toBe("ReminiscenceFleurdelys");
    expect(build.setOverride).toBe(false);
    expect(meetsSetPieces(someIds().map((id) => echoes.find((e) => e.echoId === id)), { sets: [] })).toBe(true);
  });
});
