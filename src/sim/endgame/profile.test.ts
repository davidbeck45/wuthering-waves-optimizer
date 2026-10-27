// @vitest-environment node
// The fork's enemy profile (vendor/wuwa_calc/src/shared/profile.ts) on the real engine, and the ToA floors run
// through the seam's worker protocol — on the synthetic account of engine/__fixtures__/syntheticAccount.ts.
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { SYNTHETIC_ACCOUNT, SYNTHETIC_TEAM } from "../engine/__fixtures__/syntheticAccount";
import { WUWA_CALC_COMMIT } from "../engine/engineCommit";
import { createRileyClient, type WorkerLike } from "../engine/rileyClient";
import { rileyHeadless, type HeadlessRiley } from "../engine/rileyNode";
import { fightCurve, type RileyEngine, type RileyPick, type RunError } from "../engine/rileyRun";
import { createRileyHandler } from "../engine/rileyWorker";
import { ELEMENTS, withFloorProfile, type Element, type FloorProfileSpec } from "./effects";
import { loadSeason, toaIndex } from "./toaData";
import { runToaCheck, seasonProfiles } from "./toaRun";

/* eslint-disable @typescript-eslint/no-explicit-any */
const LOAD = 60_000;

/** Totals the UNPATCHED engine (wuwa_calc e1181a9, before the profile hooks) gave these picks on the synthetic
 *  account — captured from a pristine `git archive` of the submodule. The profile must leave them untouched. */
const PINNED: Array<{ teamKey: string; names: string[]; picks: RileyPick[]; total: number; sectionTotals: number[] }> = [
  {
    teamKey: "t404",
    names: ["Shorekeeper", "Lynae", "Iuno"],
    picks: [
      { weapon: 1, echo: 0, mainstat: 0, sequence: 2, refine: 4, matrix: false, highSubs: false, mySubs: false },
      { weapon: 0, echo: 1, mainstat: 11, sequence: 0, refine: 0, matrix: false, highSubs: false, mySubs: false },
      { weapon: 0, echo: 0, mainstat: 5, sequence: 0, refine: 0, matrix: false, highSubs: false, mySubs: true },
    ],
    total: 86783.45,
    sectionTotals: [2289445, 2376002, 2376002, 2376002],
  },
  {
    // Suoming's Electro team
    teamKey: "t0",
    names: ["Shorekeeper", "Jinhsi", "Suoming"],
    picks: [
      { weapon: 1, echo: 2, mainstat: 0, sequence: 2, refine: 4, matrix: false, highSubs: false, mySubs: false },
      { weapon: 0, echo: 0, mainstat: 5, sequence: 0, refine: 0, matrix: false, highSubs: false, mySubs: false },
      { weapon: 0, echo: 0, mainstat: 4, sequence: 0, refine: 0, matrix: false, highSubs: false, mySubs: false },
    ],
    total: 67687.29,
    sectionTotals: [1729278, 1685828, 1824604, 1685828],
  },
  {
    // Xuanling's Havoc team
    teamKey: "t157",
    names: ["Suisui", "Mortefi", "Xuanling"],
    picks: [
      { weapon: 0, echo: 0, mainstat: 0, sequence: 0, refine: 0, matrix: false, highSubs: false, mySubs: false },
      { weapon: 0, echo: 0, mainstat: 2, sequence: 6, refine: 0, matrix: false, highSubs: false, mySubs: false },
      { weapon: 0, echo: 0, mainstat: 5, sequence: 0, refine: 0, matrix: false, highSubs: false, mySubs: false },
    ],
    total: 80532.31,
    sectionTotals: [2054443, 2081974, 2096822, 2097828],
  },
];

let h: HeadlessRiley;
let E: RileyEngine;
const at = (res: Partial<Record<Element, number>> = {}, level = 100, effects: FloorProfileSpec["effects"] = []): FloorProfileSpec => ({
  level,
  res: Object.fromEntries(ELEMENTS.map((el) => [el, res[el] ?? 20])) as Record<Element, number>,
  effects,
});
const run = (i: number, spec: FloorProfileSpec | null) =>
  withFloorProfile(E, spec, () => fightCurve(E, PINNED[i]!.teamKey, PINNED[i]!.picks, { account: SYNTHETIC_ACCOUNT, blocked: h.blocked }));

beforeAll(async () => {
  h = await rileyHeadless(SYNTHETIC_ACCOUNT);
  E = h.engine;
}, LOAD);

describe("the fork's enemy profile", () => {
  it("is a no-op unset: the three pinned teams total exactly what the unpatched engine gave", () => {
    expect(E.commit).toBe(WUWA_CALC_COMMIT);
    for (let i = 0; i < PINNED.length; i++) {
      const c = run(i, null);
      expect(c.total, PINNED[i]!.teamKey).toBe(PINNED[i]!.total);
      expect(c.sectionTotals, PINNED[i]!.teamKey).toEqual(PINNED[i]!.sectionTotals);
    }
  });

  it("set to the engine's own enemy (level 100, 20 % everywhere, no gear) changes nothing either", () => {
    for (let i = 0; i < PINNED.length; i++) expect(run(i, at()).total).toBe(PINNED[i]!.total);
  });

  it("puts the engine's own enemy back after every run — a traced run still matches the Wave 0 fixture byte for byte", () => {
    run(0, at({ Electro: 0 }, 90, [{ kind: "ramp", label: "ramp", start: 60, first: 5, step: 5, every: 5, cap: 60 }]));
    const fixture = readFileSync(new URL("../engine/__fixtures__/runLite.json", import.meta.url), "utf8");
    const best = h.bestFor(SYNTHETIC_TEAM)!;
    expect(JSON.stringify(h.tracedRun(best.teamKey, best.best!.picks))).toBe(JSON.stringify(JSON.parse(fixture)));
    expect(run(0, null).total).toBe(PINNED[0]!.total);
  });

  it("lowers Electro RES for an Electro team, not for a Havoc one", () => {
    const electro = run(1, at({ Electro: 10 }));
    const havoc = run(2, at({ Electro: 10 }));
    expect(electro.total).toBeGreaterThan(PINNED[1]!.total * 1.03);
    expect(havoc.total).toBe(PINNED[2]!.total);
  });

  it("fights a level-90 enemy for more damage than a level-100 one (less DEF)", () => {
    const l90 = run(0, at({}, 90));
    expect(l90.total).toBeGreaterThan(PINNED[0]!.total);
    expect(l90.total / PINNED[0]!.total).toBeLessThan(1.05);
  });

  it("plays a DMG-taken ramp on the fight clock: nothing before 60 s, more in every later loop", () => {
    const c = run(0, at({}, 100, [{ kind: "ramp", label: "ramp", start: 60, first: 5, step: 5, every: 5, cap: 60 }]));
    expect(c.sectionTotals[0]).toBe(PINNED[0]!.sectionTotals[0]);
    expect(c.sectionTotals[2]!).toBeGreaterThan(PINNED[0]!.sectionTotals[2]!);
    expect(c.sectionTotals[3]! / PINNED[0]!.sectionTotals[3]!).toBeGreaterThan(c.sectionTotals[2]! / PINNED[0]!.sectionTotals[2]!);
  });

  it("grants a team buff on every Intro", () => {
    const c = run(0, at({}, 100, [{ kind: "buff", label: "intro", on: "intro", stats: [{ stat: "totalDmg", value: 15 }], seconds: 20, target: "team" }]));
    expect(c.total).toBeGreaterThan(PINNED[0]!.total * 1.05);
  });
});

describe("the floors through the worker protocol", () => {
  function inProcessWorker(engine: RileyEngine): WorkerLike {
    const w: WorkerLike = {
      onmessage: null,
      onerror: null,
      postMessage(message) {
        handle(structuredClone(message));
      },
      terminate() {},
    };
    const handle = createRileyHandler(engine, (msg) => setTimeout(() => w.onmessage?.({ data: structuredClone(msg) }), 0));
    return w;
  }

  it("answers `curves` per profile, memoised, and refuses a team with a member the app hasn't released", async () => {
    const client = createRileyClient({ createWorker: () => inProcessWorker(E) });
    const specs = [null, at({ Electro: 10 })];
    const [plain, low] = await client.curves(PINNED[1]!.teamKey, PINNED[1]!.picks, specs, { account: SYNTHETIC_ACCOUNT });
    expect(plain!.total).toBe(PINNED[1]!.total);
    expect(low!.total).toBeGreaterThan(plain!.total);
    expect(plain!.points[plain!.points.length - 1]![1]).toBe(plain!.sectionTotals.reduce((a, b) => a + b, 0));
    const again = await client.curves(PINNED[1]!.teamKey, PINNED[1]!.picks, specs, { account: SYNTHETIC_ACCOUNT });
    expect(again[1]).toBe(low);
    const lily = h.teams.find((t) => t.members.some((m) => m.appKey === "Lily"))!;
    await expect(client.curves(lily.key, PINNED[0]!.picks, [null], { account: SYNTHETIC_ACCOUNT })).rejects.toMatchObject({ reason: "notInApp" } satisfies Partial<RunError>);
    client.dispose();
  });

  it("runs the whole check on the season's floors: every candidate timed on every timed floor, Lily never among them", async () => {
    const season = await loadSeason(toaIndex.seasons[0]!);
    const client = createRileyClient({ createWorker: () => inProcessWorker(E) });
    const check = await runToaCheck(client, season, { account: SYNTHETIC_ACCOUNT, savedTeams: [{ name: "mine", characterIds: SYNTHETIC_TEAM }], limit: 4 });
    expect(check.candidates.length).toBeGreaterThan(0);
    expect(check.candidates.find((c) => c.saved === "mine")).toBeTruthy();
    expect(check.candidates.flatMap((c) => c.appKeys)).not.toContain("Lily");
    const floors = seasonProfiles(season).byFloor;
    expect(check.results).toHaveLength(check.candidates.length * floors.size);
    for (const r of check.results) {
      expect(r.error).toBeUndefined();
      expect(r.seconds === null || (r.seconds > 0 && r.seconds <= 300)).toBe(true);
    }
    client.dispose();
  }, LOAD);
});
