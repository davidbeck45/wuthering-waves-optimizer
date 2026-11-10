// Wuthering Tools+ Echo Lab — saved benchmarks answer to the ER needs they were scored on. The figures use the energy
// check's needs as floors, which the account fingerprint doesn't carry, so a lookup that timed out would otherwise be
// repeated from the saved copy in every new tab. Each `visit()` is a fresh page load: module state starts empty.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NOT_IN_APP } from "./core";

const h = vi.hoisted(() => ({
  /** this visit's floors, as the energy check reports them */
  floors: new Map<string, { need: number }>(),
  /** still measuring when the lookup returned: its 20 s ran out */
  busy: false,
  /** the saved teams as the energy check reports them */
  teams: [] as Array<{ state: { status: string } | null }>,
  ready: vi.fn(async () => undefined),
  /** the browser's saved copy */
  stored: null as Record<string, unknown> | null,
  /** `tabCopyStamp`: another build's tab copy reads as another stamp */
  stamp: "build-a|",
  /** the inventory: another list is another account state */
  echoes: [{ echoId: "e1" }],
  write: vi.fn(async (_fingerprint: string, _value: Record<string, unknown>) => true),
  run: vi.fn(),
}));

vi.mock("../../stores/character", () => ({ useCharacterStore: () => ({ characters: { Cartethyia: { weapon: { id: "w" } } } }) }));
vi.mock("../../stores/inventory", () => ({
  useInventoryStore: () => ({
    get echoes() {
      return h.echoes;
    },
    equipped: {},
  }),
}));
vi.mock("../../stores/teamRotations", () => ({ useTeamRotationsStore: () => ({ teams: [] }) }));
vi.mock("./echoLabClient", () => ({ getEchoLabClient: () => ({ run: h.run }), labAccountOf: (source: unknown) => source }));
vi.mock("../energy/useEnergyNeeds", () => ({
  useEnergyNeeds: () => ({ ready: h.ready, floors: { value: h.floors }, busy: { value: h.busy }, savedTeams: { value: h.teams } }),
}));
vi.mock("../persist/savedResults", () => ({
  onSavedResultsCleared: () => () => undefined,
  tabCopyStamp: () => h.stamp,
  savedSlot: () => ({
    read: async (fingerprint: string) => (h.stored ? { value: { ...h.stored, fingerprint }, savedAt: 1 } : null),
    write: h.write,
  }),
}));

const PASS = { bestOwner: { echoes: [], characters: [{ id: "Cartethyia" }], skipped: [] } };
const OLD = { results: [{ characterId: "Cartethyia", score: 0.9 }] };
const FRESH = { results: [{ characterId: "Cartethyia", score: 0.7 }] };

async function visit() {
  vi.resetModules();
  const { useEchoLab, ECHO_LAB_CACHE_KEY } = await import("./useEchoLab");
  return { lab: useEchoLab(), ECHO_LAB_CACHE_KEY };
}
const savedCopy = (benchErKey?: string | null) => ({ v: 4, pass: PASS, benchmarks: OLD, tunerPlan: null, ...(benchErKey === undefined ? {} : { benchErKey }) });
const benchmarkJobs = () => h.run.mock.calls.filter(([job]) => job.kind === "benchmark");
const lastWrite = () => h.write.mock.calls.at(-1)![1];
/** a save reads the record first, so it lands a moment after its job */
const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve));

beforeEach(() => {
  sessionStorage.clear();
  h.floors.clear();
  h.floors.set("Cartethyia", { need: 130 });
  h.busy = false;
  h.teams = [];
  h.echoes = [{ echoId: "e1" }];
  h.stored = null;
  h.stamp = "build-a|";
  h.ready.mockClear();
  h.write.mockClear();
  h.run.mockReset();
  h.run.mockImplementation(async (job: { kind: string; items?: Array<{ echoId: string; characterId: string; slot: number }> }) => {
    if (job.kind === "benchmark") return FRESH;
    if (job.kind === "rollRatings") return { ratings: job.items!.map((item) => ({ ...item, score: 1 })), errors: [] };
    return PASS;
  });
});

// a budget for the whole file: the first test pays for importing useEchoLab's tree (0.9 s on two pinned cores, the range
// where a test here has gone past vitest's 5 s default on CI's 2-core runner)
describe("Echo Lab's saved benchmarks and the ER needs they were scored on", { timeout: 60_000 }, () => {
  it("restoring the record never starts the energy check: /inventory reads the same record for its verdicts alone", async () => {
    h.stored = savedCopy("Cartethyia:100");
    const { lab } = await visit();
    await lab.refresh();
    expect(lab.benchmarks.value).toEqual(OLD);
    expect(h.ready).not.toHaveBeenCalled();
    expect(h.run).not.toHaveBeenCalled();
  });

  it("keeps a copy scored on this visit's needs, and scores nothing", async () => {
    h.stored = savedCopy("Cartethyia:130");
    const { lab } = await visit();
    await lab.refresh();
    await lab.runBenchmarks();
    expect(lab.benchmarks.value).toEqual(OLD);
    expect(h.run).not.toHaveBeenCalled();
  });

  it("drops a copy scored on other needs and scores again on this visit's", async () => {
    h.stored = savedCopy("Cartethyia:100");
    const { lab } = await visit();
    await lab.refresh();
    await lab.runBenchmarks();
    expect(benchmarkJobs()).toHaveLength(1);
    expect(benchmarkJobs()[0]![0].options.erNeeds).toEqual({ Cartethyia: 130 });
    expect(lab.benchmarks.value).toEqual(FRESH);
    await settled();
    expect(lastWrite()).toMatchObject({ benchmarks: FRESH, benchErKey: "Cartethyia:130" });
  });

  it("scores a copy saved before the key existed once, and the copy that replaces it stands", async () => {
    h.stored = savedCopy();
    const first = await visit();
    await first.lab.refresh();
    await first.lab.runBenchmarks();
    expect(benchmarkJobs()).toHaveLength(1);

    await settled();
    h.stored = lastWrite();
    const second = await visit();
    await second.lab.refresh();
    await second.lab.runBenchmarks();
    expect(benchmarkJobs()).toHaveLength(1);
    expect(second.lab.benchmarks.value).toEqual(FRESH);
  });

  it("a lookup that timed out does not leave its figures for the next tab, whose lookup answers", async () => {
    h.floors.clear(); // the 20 s ran out with nothing measured: no floors at all
    h.busy = true;
    const first = await visit();
    await first.lab.refresh();
    await first.lab.runBenchmarks();
    expect(benchmarkJobs()[0]![0].options.erNeeds).toEqual({});
    expect(first.lab.benchmarks.value).toEqual(FRESH); // this tab shows what it scored
    await settled();
    expect(h.write.mock.calls.map(([, value]) => value.benchmarks)).toEqual([null]); // the pass alone went past the tab
    await settled();
    expect(lastWrite()).toMatchObject({ pass: PASS, benchmarks: null, benchErKey: null });

    await settled();
    h.stored = lastWrite();
    h.busy = false;
    h.floors.set("Cartethyia", { need: 130 });
    h.run.mockClear();
    const second = await visit();
    await second.lab.refresh();
    await second.lab.runBenchmarks();
    expect(benchmarkJobs()).toHaveLength(1);
    expect(benchmarkJobs()[0]![0].options.erNeeds).toEqual({ Cartethyia: 130 });
    await settled();
    expect(lastWrite()).toMatchObject({ benchmarks: FRESH, benchErKey: "Cartethyia:130" });
  });

  it("a copy a timed-out lookup did save (before that stopped, or after a reload) still answers to the next tab's key", async () => {
    h.stored = savedCopy("");
    const { lab } = await visit();
    await lab.refresh();
    await lab.runBenchmarks();
    expect(benchmarkJobs()).toHaveLength(1);
    expect(benchmarkJobs()[0]![0].options.erNeeds).toEqual({ Cartethyia: 130 });
  });

  it("a team that failed leaves the benchmarks out of the saved copy, whatever floors the others gave", async () => {
    h.teams = [{ state: { status: "ok" } }, { state: { status: "error" } }];
    const { lab } = await visit();
    await lab.refresh();
    await lab.runBenchmarks();
    expect(lab.benchmarks.value).toEqual(FRESH);
    await settled();
    expect(lastWrite()).toMatchObject({ benchmarks: null, benchErKey: null });
  });

  it("a team the energy check cannot measure is an answer, not a failure: the benchmarks are saved", async () => {
    h.teams = [{ state: { status: "ok" } }, { state: { status: "notMeasured" } }];
    const { lab } = await visit();
    await lab.refresh();
    await lab.runBenchmarks();
    await settled();
    expect(lastWrite()).toMatchObject({ benchmarks: FRESH, benchErKey: "Cartethyia:130" });
  });

  it("a good saved copy outlives a visit whose own lookup timed out: nothing short replaces it, on screen or saved", async () => {
    h.stored = savedCopy("Cartethyia:130");
    h.floors.clear();
    h.busy = true;
    const { lab } = await visit();
    await lab.refresh();
    await lab.runBenchmarks();
    expect(lab.benchmarks.value).toEqual(OLD); // scoring on a lookup that never finished would show floors too low
    expect(benchmarkJobs()).toHaveLength(0);
    await settled();
    expect(h.write).not.toHaveBeenCalled();
  });

  it("a short lookup has no say over a copy with no real key: that one still scores", async () => {
    h.stored = savedCopy("");
    h.floors.clear();
    h.busy = true;
    const { lab } = await visit();
    await lab.refresh();
    await lab.runBenchmarks();
    expect(benchmarkJobs()).toHaveLength(0); // "" is what a lookup with no floors reads: the keys agree
    expect(lab.benchmarks.value).toEqual(OLD);
  });

  it("a second press while the needs are looked up leaves one run, not a cancelled status beside it", async () => {
    let release = (): void => undefined;
    h.ready.mockImplementationOnce(() => new Promise<undefined>((resolve) => (release = () => resolve(undefined))));
    const { lab } = await visit();
    await lab.refresh();
    const presses = [lab.runBenchmarks({ force: true }), lab.runBenchmarks({ force: true })];
    release();
    await Promise.all(presses);
    expect(benchmarkJobs()).toHaveLength(1);
    expect(lab.benchmarks.value).toEqual(FRESH);
    expect(lab.benchStatus.cancelled ?? false).toBe(false);
  });

  it("short ER needs answer for their own account state: the next state's saved copy is left as it was", async () => {
    h.floors.clear();
    h.busy = true;
    const { lab } = await visit();
    await lab.refresh();
    await lab.runBenchmarks(); // short: this tab only
    await settled();
    h.write.mockClear();

    h.echoes = [{ echoId: "e2" }]; // an edit, and that state has a whole copy saved
    h.stored = savedCopy("Cartethyia:130");
    await lab.refresh();
    expect(lab.benchmarks.value).toEqual(OLD);
    const done = await lab.runRollRatings([{ echoId: "e2", characterId: "Cartethyia", slot: 0 }] as never, new AbortController().signal);
    expect(done).toBe(true);
    await settled();
    expect(h.write).not.toHaveBeenCalled(); // a roll-chip write must not blank those benchmarks
  });

  it("a pass that lost a roster character's kit is not saved; a skip that repeats on every run is", async () => {
    const skipped = (id: string, reason: string) => ({ bestOwner: { ...PASS.bestOwner, skipped: [{ id, reason }] } });
    const passOf = (result: unknown) => h.run.mockImplementation(async () => result);

    passOf(skipped("Cartethyia", NOT_IN_APP));
    const lost = await visit();
    await lost.lab.refresh();
    expect(lost.lab.pass.value).toMatchObject({ bestOwner: { skipped: [{ id: "Cartethyia" }] } }); // this tab shows it
    await settled();
    expect(h.write).not.toHaveBeenCalled();

    passOf(skipped("NotAnAppCharacter", NOT_IN_APP)); // an id the app lacks fails every time, so it says nothing
    sessionStorage.clear();
    const unknown = await visit();
    await unknown.lab.refresh();
    await settled();
    expect(h.write).toHaveBeenCalledTimes(1);

    passOf(skipped("Cartethyia", "needs five echoes"));
    sessionStorage.clear();
    const real = await visit();
    await real.lab.refresh();
    await settled();
    expect(h.write).toHaveBeenCalledTimes(2);
  });

  it("an account nothing gates keeps its copy: the empty key is a key", async () => {
    h.floors.clear();
    h.stored = savedCopy("");
    const { lab } = await visit();
    await lab.refresh();
    await lab.runBenchmarks();
    expect(h.run).not.toHaveBeenCalled();
    expect(lab.benchmarks.value).toEqual(OLD);
  });

  it("the re-roll tab's check drops a copy on other needs without scoring anything", async () => {
    h.stored = savedCopy("Cartethyia:100");
    const { lab } = await visit();
    await lab.refresh();
    await lab.checkBenchmarks();
    expect(lab.benchmarks.value).toBeNull();
    expect(h.run).not.toHaveBeenCalled();
  });

  it("the re-roll tab's check keeps a copy on this visit's needs, and the Benchmark tab then asks nothing again", async () => {
    h.stored = savedCopy("Cartethyia:130");
    const { lab } = await visit();
    await lab.refresh();
    await lab.checkBenchmarks();
    h.ready.mockClear();
    await lab.runBenchmarks();
    expect(lab.benchmarks.value).toEqual(OLD);
    expect(h.ready).not.toHaveBeenCalled();
    expect(h.run).not.toHaveBeenCalled();
  });

  it("a dropped copy is no reason to rewrite the record: a roll-chip write must not make an old pass read 'just now'", async () => {
    h.stored = savedCopy("Cartethyia:100");
    const { lab } = await visit();
    await lab.refresh();
    await lab.checkBenchmarks();
    const done = await lab.runRollRatings([{ echoId: "e1", characterId: "Cartethyia", slot: 0 }] as never, new AbortController().signal);
    expect(done).toBe(true);
    await settled();
    expect(h.write).not.toHaveBeenCalled();
  });

  it("this tab's own copy answers too: a reload after a lookup that timed out scores again", async () => {
    const seeded = await visit();
    const value = { ...savedCopy(""), stamp: h.stamp, fingerprint: seeded.lab.snapshot().fingerprint };
    sessionStorage.setItem(seeded.ECHO_LAB_CACHE_KEY, JSON.stringify(value));
    const { lab } = await visit();
    await lab.refresh();
    expect(lab.benchmarks.value).toEqual(OLD);
    await lab.runBenchmarks();
    expect(benchmarkJobs()).toHaveLength(1);
    expect(lab.benchmarks.value).toEqual(FRESH);
  });

  it("a forced run keeps the key of the needs it ran on", async () => {
    h.stored = savedCopy("Cartethyia:130");
    const { lab } = await visit();
    await lab.refresh();
    h.floors.set("Cartethyia", { need: 140 });
    await lab.runBenchmarks({ force: true });
    expect(benchmarkJobs()).toHaveLength(1);
    await settled();
    expect(lastWrite()).toMatchObject({ benchErKey: "Cartethyia:140" });
  });

  it("a tab copy from another build or from before a Clear is not read: a plain reload scores on this build", async () => {
    const first = await visit();
    await first.lab.refresh();
    expect(sessionStorage.getItem(first.ECHO_LAB_CACHE_KEY)).not.toBeNull();
    h.run.mockClear();
    h.stamp = "build-b|";
    const second = await visit();
    await second.lab.refresh();
    expect(h.run.mock.calls.map(([job]) => job.kind)).toEqual(["pass"]);
  });

  describe("a lookup that was not whole", () => {
    const shortLookup = (): void => {
      h.floors.clear();
      h.teams = [{ state: { status: "error" } }];
    };
    const wholeLookup = (): void => {
      h.floors.set("Cartethyia", { need: 130 });
      h.teams = [{ state: { status: "ok" } }];
    };

    it("is not kept: Re-run asks again and scores on the real floors", async () => {
      shortLookup();
      const { lab } = await visit();
      await lab.refresh();
      await lab.runBenchmarks();
      expect(benchmarkJobs().at(-1)![0].options.erNeeds).toEqual({});
      expect(lab.benchmarksShort.value).toBe(true);
      wholeLookup();
      await lab.runBenchmarks({ force: true });
      expect(benchmarkJobs().at(-1)![0].options.erNeeds).toEqual({ Cartethyia: 130 });
      expect(lab.benchmarksShort.value).toBe(false);
      await settled();
      expect(lastWrite()).toMatchObject({ benchmarks: FRESH, benchErKey: "Cartethyia:130" });
    });

    it("is asked about again when the tab opens again, with no press", async () => {
      shortLookup();
      const { lab } = await visit();
      await lab.refresh();
      await lab.runBenchmarks();
      wholeLookup();
      await lab.runBenchmarks();
      expect(benchmarkJobs()).toHaveLength(2);
      expect(benchmarkJobs().at(-1)![0].options.erNeeds).toEqual({ Cartethyia: 130 });
    });

    it("that comes back short again leaves the figures on the page and starts nothing", async () => {
      shortLookup();
      const { lab } = await visit();
      await lab.refresh();
      await lab.runBenchmarks();
      await lab.runBenchmarks();
      expect(benchmarkJobs()).toHaveLength(1);
      expect(lab.benchmarksShort.value).toBe(true);
      expect(lab.benchmarks.value).toEqual(FRESH);
    });

    it("leaves its figures out of the tab copy too: a reload never reads them", async () => {
      shortLookup();
      const { lab, ECHO_LAB_CACHE_KEY } = await visit();
      await lab.refresh();
      await lab.runBenchmarks();
      expect(JSON.parse(sessionStorage.getItem(ECHO_LAB_CACHE_KEY)!).benchmarks).toBeNull();
    });

    it("does not hold the Set lab: the next time it is asked for it runs on the real need, and says so until then", async () => {
      h.run.mockImplementation(async (job: { kind: string }) => (job.kind === "setLab" ? { rows: [] } : PASS));
      shortLookup();
      const { lab } = await visit();
      await lab.refresh();
      await lab.runSetLab("Cartethyia");
      const setLabJobs = () => h.run.mock.calls.filter(([job]) => job.kind === "setLab");
      expect(setLabJobs().at(-1)![0].options.erNeed).toBeNull();
      expect(lab.needsShort.value).toBe(true);
      wholeLookup();
      await lab.runSetLab("Cartethyia");
      expect(setLabJobs()).toHaveLength(2);
      expect(setLabJobs().at(-1)![0].options.erNeed).toBe(130);
      expect(lab.needsShort.value).toBe(false);
      await lab.runSetLab("Cartethyia");
      expect(setLabJobs()).toHaveLength(2); // a whole answer stands
    });

    it("does not hold the re-roll advice either", async () => {
      h.run.mockImplementation(async (job: { kind: string }) => (job.kind === "reroll" ? { lines: [] } : PASS));
      shortLookup();
      const { lab } = await visit();
      await lab.refresh();
      const signal = new AbortController().signal;
      await lab.runReroll("Cartethyia", 0, signal);
      wholeLookup();
      await lab.runReroll("Cartethyia", 0, signal);
      await lab.runReroll("Cartethyia", 0, signal);
      expect(h.run.mock.calls.filter(([job]) => job.kind === "reroll")).toHaveLength(2);
    });
  });

  describe("a tab reloaded onto its tab copy", () => {
    /** a tab that ran the pass, reloaded after another tab added the benchmarks and the Tuner plan to the record */
    async function reloaded() {
      const first = await visit();
      await first.lab.refresh();
      await settled();
      h.write.mockClear();
      h.stored = { v: 4, pass: PASS, benchmarks: OLD, benchErKey: "Cartethyia:130", tunerPlan: { items: [] } };
      const { lab } = await visit();
      await lab.refresh();
      return lab;
    }
    const rate = (lab: Awaited<ReturnType<typeof reloaded>>) => lab.runRollRatings([{ echoId: "e1", characterId: "Cartethyia", slot: 0 }] as never, new AbortController().signal);

    it("rates its chips without writing over what other tabs added", async () => {
      const lab = await reloaded();
      expect(await rate(lab)).toBe(true);
      await settled();
      expect(h.write).not.toHaveBeenCalled();
    });

    it("keeps what it never had when a new result does write the record", async () => {
      h.run.mockImplementation(async (job: { kind: string }) => (job.kind === "farmNext" ? { rows: [] } : job.kind === "pass" ? { ...PASS } : PASS));
      const lab = await reloaded();
      await lab.refresh({ force: true });
      await settled();
      expect(lastWrite()).toMatchObject({ benchmarks: OLD, benchErKey: "Cartethyia:130", tunerPlan: { items: [] } });
    });

    it("and after a read of the record, a chip still does not restamp it", async () => {
      const lab = await reloaded();
      await lab.runBenchmarks();
      await rate(lab);
      await settled();
      expect(h.write).not.toHaveBeenCalled();
    });
  });

  it("a pressed Re-run asks the worker to score again, and a first run does not", async () => {
    const { lab } = await visit();
    await lab.refresh();
    expect(h.run.mock.calls.at(-1)![2]).toMatchObject({ fresh: false });
    await lab.refresh({ force: true });
    expect(h.run.mock.calls.at(-1)![2]).toMatchObject({ fresh: true });
  });
});

describe("Farm next's team figures and the team-buff switch (2026-11-08 hunt F6)", { timeout: 60_000 }, () => {
  /** Verina slot 4 on the export: +697 team damage with the switch on, +491 with it off */
  const figure = (auto: boolean) => ({ key: "Cartethyia|3", team: { teamId: "t", teamName: "t", base: 1, avgDamage: 1, gain: auto ? 0.0002 : 0.0001, damage: auto ? 697 : 491 }, teamNote: null, teamScorings: 1 });
  let finish: () => void = () => undefined;
  beforeEach(() => {
    localStorage.setItem("wtplus:teamBuffs:auto", "1");
    h.run.mockImplementation((job: { kind: string; options?: { autoTeamBuffs?: boolean } }) => {
      if (job.kind === "farmNext") return Promise.resolve({ rows: [], autoTeamBuffs: job.options?.autoTeamBuffs });
      // held until told: the player flips the switch while it is worked out
      if (job.kind === "farmTeam") return new Promise((resolve) => (finish = () => resolve(figure(job.options!.autoTeamBuffs!))));
      return Promise.resolve(PASS);
    });
  });

  it("one that lands after the switch moved is never shown under the other switch, nor brought back by the tab copy", async () => {
    const { lab } = await visit();
    const { autoTeamBuffs } = await import("../teamContext/autoTeamBuffs");
    await lab.runFarm();
    const asked = lab.runFarmTeam("Cartethyia", 3); // "Work it out", switch on
    autoTeamBuffs.value = false; // the palette, at once
    await lab.runFarm(); // the list works itself out again for the switch off
    finish(); // the switch-on figure lands
    await asked;
    expect(lab.farmTeamOf("Cartethyia", 3)).toBeNull(); // it read +697, the switch-on figure, as the switch-off one
    autoTeamBuffs.value = true;
    expect(lab.farmTeamOf("Cartethyia", 3)).toMatchObject({ team: { damage: 697 } }); // it is the switch-on figure

    // a reload, the switch off: the tab copy brings back nothing for the switch off
    await settled(); // (the switch stores itself a moment after it moves)
    localStorage.setItem("wtplus:teamBuffs:auto", "0");
    const reloaded = await visit();
    const again = await import("../teamContext/autoTeamBuffs");
    expect(again.autoTeamBuffs.value).toBe(false);
    reloaded.lab.hydrate();
    expect(reloaded.lab.farmTeamOf("Cartethyia", 3)).toBeNull();
    again.autoTeamBuffs.value = true;
    expect(reloaded.lab.farmTeamOf("Cartethyia", 3)).toMatchObject({ team: { damage: 697 } });
  });

  it("one worked out and shown under the same switch stands, and comes back after a reload", async () => {
    localStorage.setItem("wtplus:teamBuffs:auto", "0");
    const { lab } = await visit();
    await lab.runFarm();
    const asked = lab.runFarmTeam("Cartethyia", 3);
    finish();
    await asked;
    expect(lab.farmTeamOf("Cartethyia", 3)).toMatchObject({ team: { damage: 491 } });
    const reloaded = await visit();
    reloaded.lab.hydrate();
    expect(reloaded.lab.farmTeamOf("Cartethyia", 3)).toMatchObject({ team: { damage: 491 } });
  });
});
