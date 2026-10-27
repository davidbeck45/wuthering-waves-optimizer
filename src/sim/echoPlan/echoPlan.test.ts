// Wuthering Tools+: the echo plan (src/sim/echoPlan) — wants from a real exported account (the Cartethyia fixture),
// every curated preset and every generated wuwa_calc loadout, the grid rules, the progress diff and the saved state.
import { describe, expect, it } from "vitest";
import { getCharByName } from "../../characters/characters";
import account from "../myRankings/__fixtures__/cartethyiaAccount.json";
import { COST_MAINS, IN_GAME_SET_NAME, chipId, normaliseMain, sonataByKey, sonatas, type ChipId } from "./catalog";
import {
  accountWantsOf,
  collectWants,
  defaultWantsOf,
  engineWantsOf,
  kitFactsOf,
  parseEngineLoadout,
  presetWantsOf,
  type CuratedPreset,
  type EnginePreset,
  type Want,
} from "./wants";
import { buildPlan, cardText, planText, type SonataCard } from "./plan";
import { loadSources } from "./sources";
import { cardProgress, planProgress, snapshotOf } from "./diff";
import { STORAGE_KEY, cleanCode, defaultState, looksLikePlanCode, parseState, saveState, loadState } from "./storage";

const curatedModules = import.meta.glob("../../characters/*/presets.ts", { eager: true, import: "echoes" }) as Record<string, CuratedPreset[]>;
const curated: Record<string, CuratedPreset[]> = Object.fromEntries(
  Object.entries(curatedModules).map(([path, echoes]) => [path.split("/").slice(-2)[0]!, echoes ?? []]),
);
const engineModules = import.meta.glob("../presets/data/rotations/*.json", { eager: true, import: "default" }) as Record<string, EnginePreset[]>;
const engine: Record<string, EnginePreset[]> = Object.fromEntries(
  Object.entries(engineModules).map(([path, presets]) => [path.split("/").slice(-1)[0]!.replace(/\.json$/, ""), presets]),
);

const characters = account.characters as unknown as Record<string, Record<string, unknown>>;
const echoes = account.echoes as unknown as Array<Record<string, unknown>>;
const OPTIONS = { keepAll4: false, throwUnused: false };

const card = (cards: SonataCard[], set: string): SonataCard => cards.find((c) => c.set === set)!;
const verdict = (c: SonataCard, id: ChipId) => c.rows.flatMap((r) => r.chips).find((ch) => ch.id === id)?.verdict;
const has = (wants: Want[], set: string, id: ChipId) => wants.some((w) => w.set === set && chipId(w.cost, w.main) === id);

describe("catalog", () => {
  it("lists the app's Sonatas in its own order, with the in-game names and only the cost rows each Sonata has", () => {
    const list = sonatas();
    expect(list[0]!.key).toBe("FreezingFrost");
    expect(list.length).toBeGreaterThanOrEqual(37);
    const eclipse = sonataByKey("HavocEclipse")!;
    expect(eclipse.name).toBe(IN_GAME_SET_NAME.HavocEclipse);
    expect(eclipse.appName).toBe("Havoc Eclipse");
    expect(sonataByKey("ShadowofShatteredDreams")!.costs).toEqual([4]);
    expect(sonataByKey("MoonlitClouds")!.costs).toEqual([4, 3, 1]);
  });

  it("reads a main stat in every spelling the app and its sources use", () => {
    expect(normaliseMain("CritRate")).toBe("CritRate");
    expect(normaliseMain("Crit. DMG")).toBe("CritDMG");
    expect(normaliseMain("AeroDMGBonus")).toBe("Aero");
    expect(normaliseMain("Havoc DMG Bonus")).toBe("Havoc");
    expect(normaliseMain("ER")).toBe("EnergyRegen");
    expect(normaliseMain("atk")).toBe("ATK");
    expect(normaliseMain("ATK_FLAT")).toBeNull();
    expect(normaliseMain(undefined)).toBeNull();
  });
});

describe("wants", () => {
  it("turns the account's equipped echoes into wants (the Cartethyia fixture)", () => {
    const inventory = new Map(echoes.map((e) => [e.echoId, e]));
    const { wants, skipped } = accountWantsOf("Cartethyia", characters.Cartethyia!, inventory);
    expect(skipped).toEqual([]);
    expect(wants.length).toBe(5);
    expect(wants.every((w) => w.source === "equipped")).toBe(true);
    // her slots: Windward Pilgrimage 4-cost Crit Rate, 1-cost HP; the older export's "AeroDMGBonus" never mis-reads
    expect(has(wants, "WindwardPilgrimage", "4:CritRate")).toBe(true);
    expect(has(wants, "WindwardPilgrimage", "1:HP")).toBe(true);

    const plan = buildPlan(collectWants({ characters, echoes, sources: { builds: true, presets: false, engine: false } }).wants, OPTIONS);
    const windward = card(plan.cards, "WindwardPilgrimage");
    expect(windward.state).toBe("planned");
    for (const w of wants) expect(verdict(card(plan.cards, w.set), chipId(w.cost, w.main))).toBe("keep");
    expect(verdict(windward, "4:HP")).toBe("discard");
    expect(windward.rows.flatMap((r) => r.chips).find((c) => c.id === "4:CritRate")!.wantedBy[0]).toMatchObject({
      character: "Cartethyia",
      sources: [{ source: "equipped" }],
    });
  });

  it("reads every curated preset: legal main stats only, a 4-cost and 1-costs in every full build", () => {
    const withPresets = Object.entries(curated).filter(([, p]) => p.length);
    expect(withPresets.length).toBeGreaterThan(20);
    for (const [key, presets] of withPresets) {
      const { wants, skipped } = presetWantsOf(key, presets);
      for (const w of wants) expect(COST_MAINS[w.cost], `${key} ${w.detail}`).toContain(w.main);
      for (const p of presets) {
        const own = wants.filter((w) => w.detail === String(p.name ?? "preset"));
        expect(own.some((w) => w.cost === 4), `${key} "${p.name}" 4-cost`).toBe(true);
        expect(own.some((w) => w.cost === 1), `${key} "${p.name}" 1-cost`).toBe(true);
      }
      // a slot the game can't have (a 3-cost Crit Rate) is reported, never kept
      for (const s of skipped) expect(s.reason).toMatch(/cannot roll|no main stat|no cost|no Sonata|not in the app/);
    }
    // Suoming's SubDPS presets carry swapped slot types; the echo's own class decides the cost
    const suoming = presetWantsOf("Suoming", curated.Suoming ?? []);
    expect(has(suoming.wants, "HeartofSwornVigil", "3:Electro")).toBe(true);
    expect(has(suoming.wants, "HeartofSwornVigil", "4:CritRate")).toBe(true);
    expect(suoming.wants.some((w) => w.cost === 3 && w.main === "CritRate")).toBe(false);
  });

  it("parses every generated wuwa_calc loadout", () => {
    const files = Object.entries(engine);
    expect(files.length).toBeGreaterThan(40);
    for (const [key, presets] of files) {
      for (const p of presets) expect(parseEngineLoadout(String(p.description)), `${key}: ${p.name}`).not.toBeNull();
      const { wants } = engineWantsOf(key, presets);
      expect(wants.length, key).toBeGreaterThan(0);
      for (const w of wants) expect(sonataByKey(w.set)!.costs, `${key} ${w.set}`).toContain(w.cost);
    }
    const split = parseEngineLoadout(
      "S6, Kumokiri R5, Thread of Severed Fate 3pc + Havoc Eclipse 2pc + Reminiscence: Threnodian - Leviathan, main stats 44111 CD CD atk atk atk. Team: x",
    )!;
    expect(split.sets).toEqual([
      { set: "ThreadofSeveredFate", pieces: 3 },
      { set: "HavocEclipse", pieces: 2 },
    ]);
    expect(split.slots.map((s) => chipId(s.cost, s.main))).toEqual(["4:CritDMG", "4:CritDMG", "1:ATK", "1:ATK", "1:ATK"]);
    // a split build is wanted in each of its sets (the plan errs towards keeping)
    const { wants } = engineWantsOf("Chisa", [{ description: "S6, Kumokiri R5, Thread of Severed Fate 3pc + Havoc Eclipse 2pc, main stats 43311 CR Havoc Havoc atk atk." }]);
    expect(has(wants, "ThreadofSeveredFate", "3:Havoc") && has(wants, "HavocEclipse", "3:Havoc")).toBe(true);
  });

  it("falls back to the kit default for a character with no build and no recommendation", () => {
    const { wants } = defaultWantsOf("Aalto");
    expect(new Set(wants.map((w) => w.set))).toEqual(new Set(["SierraGale"]));
    expect(wants.map((w) => chipId(w.cost, w.main)).sort()).toEqual(["1:ATK", "3:ATK", "3:Aero", "4:CritDMG", "4:CritRate"]);
    const result = collectWants({ characters: { Aalto: { weapon: "Cosmic Ripples" } }, echoes: [], curated, engine });
    expect(result.roster[0]).toMatchObject({ key: "Aalto", usesDefault: true });
  });

  it("reads the kit's role from the app's own data, and the kit default follows it", async () => {
    const kit = async (key: string) => kitFactsOf(await getCharByName(key));
    expect(await kit("Baizhi")).toEqual({ scaling: "HP", healer: true }); // heals on HP (attack attributes)
    expect(await kit("Shorekeeper")).toEqual({ scaling: "HP", healer: true }); // the live result bar says HP
    expect(await kit("Youhu")).toEqual({ scaling: "ATK", healer: true });
    expect(await kit("Taoqi")).toEqual({ scaling: "DEF", healer: false }); // one heal and shields: not a healer
    expect(await kit("Yuanwu")).toEqual({ scaling: "DEF", healer: false }); // attributes say DEF, the bar says ATK
    expect(await kit("Brant")).toEqual({ scaling: "ATK", healer: false }); // three self-heals: still a damage dealer
    expect(await kit("Aalto")).toEqual({ scaling: "ATK", healer: false });
    expect(kitFactsOf(null)).toBeNull();

    const chips = (key: string, k: Parameters<typeof defaultWantsOf>[2]) =>
      defaultWantsOf(key, undefined, k).wants.map((w) => `${w.set} ${chipId(w.cost, w.main)}`).sort();
    expect(chips("Baizhi", { scaling: "HP", healer: true })).toEqual([
      "RejuvenatingGlow 1:HP",
      "RejuvenatingGlow 3:EnergyRegen",
      "RejuvenatingGlow 3:HP",
      "RejuvenatingGlow 4:HP",
      "RejuvenatingGlow 4:HealingBonus",
    ]);
    expect(chips("Taoqi", { scaling: "DEF", healer: false })).toEqual([
      "HavocEclipse 1:DEF",
      "HavocEclipse 3:DEF",
      "HavocEclipse 3:Havoc",
      "HavocEclipse 4:CritDMG",
      "HavocEclipse 4:CritRate",
      "HavocEclipse 4:DEF",
    ]);
    const result = collectWants({ characters: { Baizhi: { weapon: "x" } }, echoes: [], curated, engine, kits: { Baizhi: { scaling: "HP", healer: true } } });
    expect(result.roster[0]).toMatchObject({ key: "Baizhi", usesDefault: true, sets: ["RejuvenatingGlow"] });
    expect(result.wants[0]!.detail).toBe("healer · heals on HP");
  });

  it("loads the role only for characters with no preset and no loadout", async () => {
    const got = await loadSources(["Baizhi", "Chisa"]);
    expect(got.failed).toEqual([]);
    expect(got.curated.Chisa!.length).toBeGreaterThan(0);
    expect(got.kits).toEqual({ Baizhi: { scaling: "HP", healer: true } });
  });

  it("gives a Rover form without its own loadouts its wuwa_calc twin's", () => {
    const result = collectWants({ characters: { RoverAeroMale: { weapon: "x" } }, echoes: [], curated: {}, engine });
    expect(result.roster[0]!.usesDefault).toBe(false);
    expect(result.roster[0]!.counts.engine).toBeGreaterThan(0);
  });

  it("ignores characters the app doesn't list (unreleased kits) and characters without a weapon", () => {
    const echo = { type: 4, echo: "ReminiscenceFleurdelys", echoSet: "FreezingFrost", stat: "HP" };
    const result = collectWants({
      characters: { Lily: { weapon: "SomeWeapon", echoes: { 0: echo } }, Changli: { echoes: { 0: echo } } },
      echoes: [],
      planned: ["Lily"],
    });
    expect(result.roster).toEqual([]);
    expect(result.wants).toEqual([]);
  });

  it("counts planned characters only while the switch is on, and never an excluded one", () => {
    const base = { characters, echoes, curated, engine, planned: ["Chisa"] };
    expect(collectWants(base).roster.map((r) => r.key)).toEqual(["Cartethyia", "Chisa"]);
    expect(collectWants({ ...base, includePlanned: false }).roster.map((r) => r.key)).toEqual(["Cartethyia"]);
    const excluded = collectWants({ ...base, excluded: ["Chisa"] });
    expect(excluded.roster.find((r) => r.key === "Chisa")!.excluded).toBe(true);
    expect(excluded.wants.some((w) => w.character === "Chisa")).toBe(false);
  });
});

describe("plan", () => {
  const wants = collectWants({ characters, echoes, curated, engine }).wants;

  it("leaves a Sonata nobody wants off, or throws it whole", () => {
    expect(wants.some((w) => w.set === "FreezingFrost")).toBe(false);
    const off = card(buildPlan(wants, OPTIONS).cards, "FreezingFrost");
    expect(off.state).toBe("off");
    expect(off.rows.flatMap((r) => r.chips).every((c) => c.verdict === null)).toBe(true);
    const thrown = card(buildPlan(wants, { keepAll4: true, throwUnused: true }).cards, "FreezingFrost");
    expect(thrown.state).toBe("thrown");
    expect(thrown.rows.flatMap((r) => r.chips).every((c) => c.verdict === "discard")).toBe(true);
    // a wanted Sonata is untouched by the switch
    expect(card(buildPlan(wants, { keepAll4: false, throwUnused: true }).cards, "WindwardPilgrimage").state).toBe("planned");
  });

  it("keeps every 4-cost of a planned Sonata when asked", () => {
    const plain = card(buildPlan(wants, OPTIONS).cards, "WindwardPilgrimage");
    expect(verdict(plain, "4:DEF")).toBe("discard");
    const all4 = card(buildPlan(wants, { keepAll4: true, throwUnused: false }).cards, "WindwardPilgrimage");
    for (const main of COST_MAINS[4]) expect(verdict(all4, chipId(4, main))).toBe("keep");
    expect(all4.rows.flatMap((r) => r.chips).find((c) => c.id === "4:DEF")!.reason).toBe("keepAll4");
    expect(verdict(all4, "3:DEF")).toBe("discard");
  });

  it("pairs the crit 4-costs unless switched off: a wanted Crit. Rate keeps Crit. DMG, and the other way round", () => {
    const want = (main: "CritRate" | "CritDMG" | "HP"): Want => ({ character: "Carlotta", set: "FrostyResolve", cost: 4, main, source: "equipped", detail: "x" });
    const paired = card(buildPlan([want("CritRate")], OPTIONS).cards, "FrostyResolve");
    expect(verdict(paired, "4:CritDMG")).toBe("keep");
    expect(paired.rows[0]!.chips.find((c) => c.id === "4:CritDMG")).toMatchObject({ reason: "critPair", wantedBy: [] });
    expect(verdict(paired, "4:HP")).toBe("discard");
    expect(paired.keepCount).toBe(2);
    expect(verdict(card(buildPlan([want("CritDMG")], OPTIONS).cards, "FrostyResolve"), "4:CritRate")).toBe("keep");
    // a non-crit 4-cost pairs with nothing; the switch off keeps only the exact main stat; an override still wins
    expect(verdict(card(buildPlan([want("HP")], OPTIONS).cards, "FrostyResolve"), "4:CritDMG")).toBe("discard");
    expect(verdict(card(buildPlan([want("CritRate")], { ...OPTIONS, pairCrit: false }).cards, "FrostyResolve"), "4:CritDMG")).toBe("discard");
    const pinned = buildPlan([want("CritRate")], OPTIONS, { FrostyResolve: { "4:CritDMG": "discard" } });
    expect(verdict(card(pinned.cards, "FrostyResolve"), "4:CritDMG")).toBe("discard");
  });

  it("lets the player's override beat the rules, and plan an unused Sonata", () => {
    const plan = buildPlan(wants, { keepAll4: true, throwUnused: true }, {
      WindwardPilgrimage: { "4:CritRate": "discard", "1:DEF": "keep" },
      FreezingFrost: { "4:CritDMG": "keep" },
    });
    const w = card(plan.cards, "WindwardPilgrimage");
    expect(verdict(w, "4:CritRate")).toBe("discard");
    expect(verdict(w, "1:DEF")).toBe("keep");
    expect(w.overridden).toBe(2);
    const ff = card(plan.cards, "FreezingFrost");
    expect(ff.state).toBe("planned");
    expect(verdict(ff, "4:CritDMG")).toBe("keep");
    expect(verdict(ff, "4:HP")).toBe("keep"); // keep-all-4 reaches a planned card
    expect(verdict(ff, "3:ATK")).toBe("discard");
  });

  it("is deterministic and independent of input order", () => {
    const a = buildPlan(wants, OPTIONS);
    const b = buildPlan([...wants].reverse(), OPTIONS);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    const again = collectWants({ characters, echoes, curated, engine }).wants;
    expect(JSON.stringify(buildPlan(again, OPTIONS))).toBe(JSON.stringify(a));
  });

  it("writes the plan as a lock list per Sonata", () => {
    const plan = buildPlan(wants, OPTIONS);
    const text = planText(plan, "2026-10-26");
    expect(text).toContain("Windward Pilgrimage — COST 4: ");
    expect(text).toContain("Freezing Frost — no plan (leave it off)");
    expect(cardText(card(plan.cards, "WindwardPilgrimage"))).toMatch(/COST 4: .*Crit\. Rate/);
  });
});

describe("progress diff", () => {
  const wants = collectWants({ characters, echoes, curated, engine }).wants;
  const plan = buildPlan(wants, OPTIONS);

  it("flags a Sonata the saved plan has never seen as new, but nothing on a first visit", () => {
    const all = plan.cards.map((c) => c.set);
    expect(planProgress(plan, { sets: [], grid: {}, done: {} }).newSets).toEqual([]);
    const before = all.filter((s) => s !== "FlowerofTingedYearning");
    expect(planProgress(plan, { sets: before, grid: {}, done: {} }).newSets).toEqual(["FlowerofTingedYearning"]);
  });

  it("marks a ticked card done until its verdicts move, then lists the chips that flipped", () => {
    const windward = card(plan.cards, "WindwardPilgrimage");
    const saved = { sets: [], grid: { WindwardPilgrimage: snapshotOf(windward) }, done: { WindwardPilgrimage: true } };
    expect(cardProgress(windward, saved).status).toBe("done");
    const moved = card(buildPlan(wants, { keepAll4: true, throwUnused: false }).cards, "WindwardPilgrimage");
    const p = cardProgress(moved, saved);
    expect(p.status).toBe("changed");
    expect(p.nowKept).toEqual(expect.arrayContaining(["4:DEF", "4:HP"]));
    expect(p.nowDiscarded).toEqual([]);
    const progress = planProgress(plan, saved);
    expect(progress.done).toEqual(["WindwardPilgrimage"]);
    expect(progress.toUpdate).not.toContain("WindwardPilgrimage");
    expect(progress.toUpdate.length).toBe(plan.summary.planned - 1);
    expect(progress.cards.FreezingFrost!.status).toBe("idle");
  });
});

describe("saved state", () => {
  it("survives garbage and keeps only well-formed fields", () => {
    expect(parseState(null)).toEqual(defaultState());
    expect(parseState("{not json")).toEqual(defaultState());
    expect(parseState(JSON.stringify({ v: 2, planned: ["Chisa"] }))).toEqual(defaultState());
    const s = parseState(
      JSON.stringify({
        v: 1,
        savedAt: 5,
        sets: ["A", 3, "A"],
        grid: { A: { state: "planned", keep: ["4:CritDMG", "9:HP", "4:CritDMG"] }, B: { state: "nope" } },
        done: { A: true, B: "yes" },
        codes: { america: " hgB5KC7W25 WAAcIsH2kv ", mars: "x" },
        server: "europe",
        planned: ["Chisa", "", 4],
        overrides: { A: { "4:CritRate": "keep", "4:Glacio": "keep", "1:HP": "maybe" } },
        options: { keepAll4: true, sources: { engine: false } },
      }),
    );
    expect(s.sets).toEqual(["A"]);
    expect(s.grid).toEqual({ A: { state: "planned", keep: ["4:CritDMG"] } });
    expect(s.done).toEqual({ A: true });
    expect(s.codes).toEqual({ america: "hgB5KC7W25WAAcIsH2kv" });
    expect(s.server).toBe("europe");
    expect(s.planned).toEqual(["Chisa"]);
    expect(s.overrides).toEqual({ A: { "4:CritRate": "keep" } });
    expect(s.options).toEqual({ pairCrit: true, keepAll4: true, throwUnused: false, includePlanned: true, sources: { builds: true, presets: true, engine: false } });
    expect(parseState(JSON.stringify({ v: 1, options: { pairCrit: false } })).options.pairCrit).toBe(false);
  });

  it("round-trips through storage under the wtplus: key", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const s = defaultState();
    s.codes.asia = "hgB5KC7W25WAAcIsH2kv";
    s.done.MoonlitClouds = true;
    expect(saveState(s, storage)).toBe(true);
    expect([...store.keys()]).toEqual([STORAGE_KEY]);
    expect(STORAGE_KEY.startsWith("wtplus:")).toBe(true);
    expect(loadState(storage)).toEqual(s);
    expect(looksLikePlanCode(cleanCode(" hgB5KC7W25WAAcIsH2kv "))).toBe(true);
    expect(looksLikePlanCode("short")).toBe(false);
  });
});
