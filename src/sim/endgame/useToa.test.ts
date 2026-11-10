// Wuthering Tools+ — /endgame keeps a check only when it timed every team (2026-11-08 hunt F4): a worker that ran out
// of memory mid-team left David's first saved team out of every visit's floors and plan, stored as a whole check. The
// real season data and check; the engine is a fake runner.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import type { MineSolve, RileyAccount } from "../engine/rileyRun";
import type { CurveLike } from "./killTime";
import type { ToaRunner } from "./toaRun";
import { CHECK_KEY, useToa } from "./useToa";

const engine = vi.hoisted(() => ({ fails: 0, tries: 0, solves: 0, account: "k0", noHp: false }));
// `noHp`: the season file as the generator ships it before the HP sheet has its block (no HP on any floor or enemy)
vi.mock("./toaData", async (original) => {
  const real = await original<typeof import("./toaData")>();
  const bare = (s: Awaited<ReturnType<typeof real.loadSeason>>): typeof s => ({
    ...s,
    towers: s.towers.map((t) => ({ ...t, floors: t.floors.map((f) => ({ ...f, hp: null, hpRaw: null, hpType: null, enemies: f.enemies.map((e) => ({ ...e, hp: null })) })) })),
  });
  return { ...real, loadSeason: async (entry: Parameters<typeof real.loadSeason>[0]) => (engine.noHp ? bare(await real.loadSeason(entry)) : real.loadSeason(entry)) };
});
const comp: Record<string, string[]> = { t1: ["A", "B", "C"], t2: ["A", "B", "Mortefi"] };
const dps: Record<string, number> = { t1: 300_000, t2: 30_000 };

function curve(perSecond: number, seconds = 100): CurveLike {
  const points: Array<[number, number]> = [];
  for (let f = 1; f <= seconds * 60; f += 30) points.push([f, Math.round((perSecond * f) / 60)]);
  return { seconds, sectionSeconds: [25, 25, 25, 25], sectionTotals: [25, 25, 25, 25].map((s) => s * perSecond), points };
}
const solve = (teamKey: string): MineSolve => ({
  teamKey,
  names: comp[teamKey]!,
  appKeys: comp[teamKey]!,
  status: "ok",
  fieldable: true,
  best: { rowKey: `${teamKey}-x`, picks: [], total: dps[teamKey]!, bySlot: {}, seconds: 100, members: comp[teamKey]!.map((k, i) => ({ name: k, appKey: k, mainDps: i === 2, sequence: 0, weapon: "W", refinement: 1 }) as never) },
});
const runner: ToaRunner = {
  commit: "test",
  teams: async () => Object.entries(comp).map(([key, names]) => ({ key, members: names.map((n) => ({ name: n, appKey: n, mainDps: n === names[2], free: n === "Mortefi" })) })),
  solveMine: async (keys) => (engine.solves++, keys.map(solve)),
  curves: async (k, _p, specs) => {
    // t1 is the team the worker runs out of memory under
    if (k === "t1" && engine.tries++ < engine.fails) throw new Error("The rankings engine worker failed: Uncaught Error: renderer ran out of memory");
    return specs.map(() => ({ teamKey: k, rowKey: k, commit: "test", total: dps[k]!, ...curve(dps[k]!) }));
  },
};
vi.mock("../engine/rileyClient", () => ({ rileyClient: () => runner }));
const account: RileyAccount = { key: "k", buildsKey: "b", builds: [], entries: { A: { sequence: 0, weapon: null, refine: 1, owned: true }, B: { sequence: 0, weapon: null, refine: 1, owned: true }, C: { sequence: 0, weapon: null, refine: 1, owned: true } } };
// an account of its own per test: this tab's module memory keeps the last check it kept
vi.mock("../engine/useRileyAccount", () => ({ useRileyAccount: () => computed(() => ({ ...account, key: engine.account })) }));

/** /endgame opened: the check it shows once it settles */
async function visit() {
  let toa!: ReturnType<typeof useToa>;
  const wrapper = mount(defineComponent({ setup: () => ((toa = useToa()), () => h("div")) }));
  await vi.waitFor(() => expect(toa.check.value && !toa.check.value.partial && !toa.running.value).toBe(true), { timeout: 20_000 });
  return { toa, wrapper };
}
const stored = () => JSON.parse(localStorage.getItem(CHECK_KEY) ?? "null");
let visits = 0;

describe("the ToA check across visits", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-01T12:00:00Z") }); // Season 41 runs
    setActivePinia(createPinia());
    localStorage.clear();
    engine.tries = 0;
    engine.noHp = false;
    engine.account = `k${++visits}`;
  });
  afterEach(() => vi.useRealTimers());

  it("is kept when every team was timed, and the next visit reads it without a run", async () => {
    engine.fails = 0;
    const first = await visit();
    expect(first.toa.failedCount.value).toBe(0);
    expect(stored()?.check?.results?.length).toBeGreaterThan(0);
    first.wrapper.unmount();
    const tries = engine.tries;
    const again = await visit();
    expect(again.toa.check.value?.key).toBe(first.toa.check.value?.key);
    expect(engine.tries).toBe(tries);
  }, 60_000);

  it("with a team the engine failed on is shown with the count, kept nowhere, and the next visit times it again", async () => {
    engine.fails = 99;
    const first = await visit();
    expect(first.toa.failedCount.value).toBe(1);
    expect(stored()).toBeNull(); // it read "30 teams timed", stored, and repeated on every visit
    first.wrapper.unmount();
    engine.fails = 0; // the phone has its memory back
    engine.tries = 0;
    const again = await visit(); // a reload, or a new tab: nothing kept to repeat
    expect(engine.tries).toBeGreaterThan(0);
    expect(again.toa.failedCount.value).toBe(0);
    expect(stored()?.check?.results?.some((r: { error?: string }) => r.error)).toBe(false);
  }, 60_000);
});

describe("a season in the build before its floor HP is published (as Season 42 was on its first day)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-01T12:00:00Z") }); // Season 41 runs, here without its HP
    setActivePinia(createPinia());
    localStorage.clear();
    engine.tries = 0;
    engine.solves = 0;
    engine.noHp = true;
    engine.account = `k${++visits}`;
  });
  afterEach(() => {
    engine.noHp = false;
    vi.useRealTimers();
  });

  it("shows the season, times nobody and plans nothing, and brings back no check kept from before", async () => {
    // what an earlier visit kept
    localStorage.setItem(CHECK_KEY, JSON.stringify({ v: 1, check: { key: "kept", season: 40, computedAt: 1, scanned: 1, skipped: {}, candidates: [], results: [{ floorId: "hazard-1", teamId: "t1", seconds: 30, crests: 3 }] } }));
    let toa!: ReturnType<typeof useToa>;
    const wrapper = mount(defineComponent({ setup: () => ((toa = useToa()), () => h("div")) }));
    await vi.waitFor(() => expect(toa.season.value?.season).toBe(41), { timeout: 20_000 });
    expect(toa.status.value).toMatchObject({ current: true, entry: { season: 41 } });
    expect(toa.hasAccount.value).toBe(true);
    expect(toa.pending.value.map((f) => f.id)).toEqual(["resonant-4", "hazard-1", "hazard-2", "hazard-3", "hazard-4", "echoing-4"]);
    expect(toa.canTime.value).toBe(false);
    await toa.compute(); // "Check my teams", were it pressed
    await toa.compute({ force: true });
    expect(toa.running.value).toBe(false);
    expect(engine.solves).toBe(0); // the solve is most of the work, and here it would time nothing
    expect(toa.check.value).toBeNull();
    expect(toa.plan.value).toBeNull();
    expect(toa.ranked.value.size).toBe(0);
    wrapper.unmount();
  }, 60_000);

  it("with its HP the same visit runs the check and plans (the switch is the HP, nothing else)", async () => {
    engine.noHp = false;
    const { toa, wrapper } = await visit();
    expect(toa.pending.value).toEqual([]);
    expect(toa.canTime.value).toBe(true);
    expect(engine.solves).toBeGreaterThan(0);
    expect(toa.plan.value).not.toBeNull();
    wrapper.unmount();
  }, 60_000);
});
