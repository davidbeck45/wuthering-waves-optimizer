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
const savedCopy = (benchErKey?: string | null) => ({ v: 3, pass: PASS, benchmarks: OLD, tunerPlan: null, ...(benchErKey === undefined ? {} : { benchErKey }) });
const benchmarkJobs = () => h.run.mock.calls.filter(([job]) => job.kind === "benchmark");
const lastWrite = () => h.write.mock.calls.at(-1)![1];

beforeEach(() => {
  sessionStorage.clear();
  h.floors.clear();
  h.floors.set("Cartethyia", { need: 130 });
  h.busy = false;
  h.teams = [];
  h.echoes = [{ echoId: "e1" }];
  h.stored = null;
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
    expect(lastWrite()).toMatchObject({ benchmarks: FRESH, benchErKey: "Cartethyia:130" });
  });

  it("scores a copy saved before the key existed once, and the copy that replaces it stands", async () => {
    h.stored = savedCopy();
    const first = await visit();
    await first.lab.refresh();
    await first.lab.runBenchmarks();
    expect(benchmarkJobs()).toHaveLength(1);

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
    expect(h.write.mock.calls.map(([, value]) => value.benchmarks)).toEqual([null]); // the pass alone went past the tab
    expect(lastWrite()).toMatchObject({ pass: PASS, benchmarks: null, benchErKey: null });

    h.stored = lastWrite();
    h.busy = false;
    h.floors.set("Cartethyia", { need: 130 });
    h.run.mockClear();
    const second = await visit();
    await second.lab.refresh();
    await second.lab.runBenchmarks();
    expect(benchmarkJobs()).toHaveLength(1);
    expect(benchmarkJobs()[0]![0].options.erNeeds).toEqual({ Cartethyia: 130 });
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
    expect(lastWrite()).toMatchObject({ benchmarks: null, benchErKey: null });
  });

  it("a team the energy check cannot measure is an answer, not a failure: the benchmarks are saved", async () => {
    h.teams = [{ state: { status: "ok" } }, { state: { status: "notMeasured" } }];
    const { lab } = await visit();
    await lab.refresh();
    await lab.runBenchmarks();
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
    h.write.mockClear();

    h.echoes = [{ echoId: "e2" }]; // an edit, and that state has a whole copy saved
    h.stored = savedCopy("Cartethyia:130");
    await lab.refresh();
    expect(lab.benchmarks.value).toEqual(OLD);
    const done = await lab.runRollRatings([{ echoId: "e2", characterId: "Cartethyia", slot: 0 }] as never, new AbortController().signal);
    expect(done).toBe(true);
    expect(h.write).not.toHaveBeenCalled(); // a roll-chip write must not blank those benchmarks
  });

  it("a pass that lost a roster character's kit is not saved; a skip that repeats on every run is", async () => {
    const skipped = (id: string, reason: string) => ({ bestOwner: { ...PASS.bestOwner, skipped: [{ id, reason }] } });
    const passOf = (result: unknown) => h.run.mockImplementation(async () => result);

    passOf(skipped("Cartethyia", NOT_IN_APP));
    const lost = await visit();
    await lost.lab.refresh();
    expect(lost.lab.pass.value).toMatchObject({ bestOwner: { skipped: [{ id: "Cartethyia" }] } }); // this tab shows it
    expect(h.write).not.toHaveBeenCalled();

    passOf(skipped("NotAnAppCharacter", NOT_IN_APP)); // an id the app lacks fails every time, so it says nothing
    sessionStorage.clear();
    const unknown = await visit();
    await unknown.lab.refresh();
    expect(h.write).toHaveBeenCalledTimes(1);

    passOf(skipped("Cartethyia", "needs five echoes"));
    sessionStorage.clear();
    const real = await visit();
    await real.lab.refresh();
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
    expect(h.write).not.toHaveBeenCalled();
  });

  it("this tab's own copy answers too: a reload after a lookup that timed out scores again", async () => {
    const seeded = await visit();
    const value = { ...savedCopy(""), fingerprint: seeded.lab.snapshot().fingerprint };
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
    expect(lastWrite()).toMatchObject({ benchErKey: "Cartethyia:140" });
  });
});
