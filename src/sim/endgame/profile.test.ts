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
import { ELEMENTS, floorCurves, hasGear, resTable, touchesCrit, withFloorProfile, type Element, type FloorProfileSpec } from "./effects";
import { damageAt } from "./killTime";
import { chanceBy, killOdds } from "../critLuck/killOdds";
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

  it("plays Season 42's effects: every modelled row builds its Gear on the real engine and only ever adds damage", async () => {
    const season = await loadSeason(toaIndex.seasons.find((s) => s.season === 42)!);
    const floors = season.towers.flatMap((t) => t.floors);
    // one floor per effect set: the Resonant Tower, Hazard 1–2, Hazard 3–4, the Echoing Tower
    for (const id of ["resonant-4", "hazard-1", "hazard-3", "echoing-4"]) {
      const f = floors.find((x) => x.id === id)!;
      const effects = f.effects.flatMap((e) => e.model);
      const geared = effects.filter(hasGear);
      // the floor's RES changes on the engine's own 20 % enemy, at the floor's level: with and without the floor's Gear
      const bare = at(resTable({}, effects, 20), f.level);
      for (let i = 0; i < PINNED.length; i++) {
        const without = run(i, bare).total;
        const withGear = run(i, { ...bare, effects: geared }).total;
        if (!geared.length) expect(withGear, `${id} ${PINNED[i]!.teamKey}`).toBe(without);
        else expect(withGear, `${id} ${PINNED[i]!.teamKey}`).toBeGreaterThan(without);
      }
    }
    expect(floors.find((x) => x.id === "echoing-4")!.effects.flatMap((e) => e.model).filter(hasGear)).toEqual([]);
    // the two always-on lines, played from the team's first Intro Skill on (approximations): each adds on its own
    const row = (id: string, label: string) => floors.find((x) => x.id === id)!.effects.flatMap((e) => e.model).filter((m) => m.label === label);
    const critDmg = row("hazard-1", "Crit DMG +25%");
    const echoSkill = row("hazard-3", "+50% Echo Skill DMG");
    expect([critDmg.length, echoSkill.length]).toEqual([1, 1]);
    expect(touchesCrit(at({}, 100, critDmg))).toBe(true);
    for (let i = 0; i < PINNED.length; i++) {
      expect(run(i, at({}, 100, critDmg)).total, `Crit DMG ${PINNED[i]!.teamKey}`).toBeGreaterThan(PINNED[i]!.total * 1.02);
      expect(run(i, at({}, 100, echoSkill)).total, `Echo Skill ${PINNED[i]!.teamKey}`).toBeGreaterThanOrEqual(PINNED[i]!.total);
    }
    expect(PINNED.some((_, i) => run(i, at({}, 100, echoSkill)).total > PINNED[i]!.total)).toBe(true);
  }, LOAD);
});

describe("each hit's crit on a floor (the clear odds)", () => {
  const opts = () => ({ account: SYNTHETIC_ACCOUNT, blocked: h.blocked });
  const curve = (i: number, spec: FloorProfileSpec | null, spread: Parameters<typeof fightCurve>[4]) =>
    withFloorProfile(E, spec, () => fightCurve(E, PINNED[i]!.teamKey, PINNED[i]!.picks, opts(), spread));
  const critDmgBuff: FloorProfileSpec["effects"] = [{ kind: "buff", label: "crit", on: "intro", stats: [{ stat: "critDmg", value: 36 }], seconds: 20, target: "team" }];

  it("a traced curve is the untraced one plus every hit's crit, its damage summing to the curve", () => {
    for (let i = 0; i < PINNED.length; i++) {
      const plain = run(i, null);
      const traced = curve(i, null, "trace");
      expect(traced.points).toEqual(plain.points);
      const hits = traced.critHits!;
      expect(hits.length).toBeGreaterThan(100);
      expect(hits.reduce((s, x) => s + x[2], 0)).toBe(plain.points[plain.points.length - 1]![1]);
      for (const [, , avg, cr, cd] of hits) {
        expect(avg).toBeGreaterThan(0);
        expect(cr).toBeGreaterThanOrEqual(0);
        expect(cd).toBeGreaterThanOrEqual(100);
      }
    }
  }, 60_000);

  it("borrowed crits equal a profile's own wherever the floor leaves crit alone (RES, level, DMG Bonus, ATK)", () => {
    // (a DMG-taken ramp is borrowed too, but not compared here: a split press's hit log reads the ramp at another frame
    // than the hit itself, so a ramped trace's own crit figures are the blurred ones — t404 has 6 such hits of 600)
    const leaves: FloorProfileSpec[] = [
      at({ Electro: 0, Havoc: 50 }, 90),
      at({}, 100, [{ kind: "dmgBonus", label: "b", value: 30 }]),
      at({}, 100, [{ kind: "buff", label: "atk", on: "intro", stats: [{ stat: "atk", value: 20 }, { stat: "totalDmg", value: 10 }], seconds: 15, target: "team" }]),
    ];
    for (let i = 0; i < PINNED.length; i++) {
      const ref = curve(i, null, "trace");
      for (const spec of leaves) {
        expect(touchesCrit(spec)).toBe(false);
        const own = curve(i, spec, "trace");
        const borrowed = curve(i, spec, ref);
        expect(borrowed.points).toEqual(own.points);
        expect(borrowed.critHits!.map((x) => x.slice(0, 3))).toEqual(own.critHits!.map((x) => x.slice(0, 3)));
        // the same crit, to the floors' blur on a split press's logged figures (a few hundredths of a point)
        borrowed.critHits!.forEach((x, k) => {
          expect(Math.abs(x[3] - own.critHits![k]![3])).toBeLessThan(0.2);
          expect(Math.abs(x[4] - own.critHits![k]![4])).toBeLessThan(0.5);
        });
      }
    }
  }, 60_000);

  it("a floor buff on Crit DMG changes the crits, so such a profile is traced on its own", () => {
    const spec = at({}, 100, critDmgBuff);
    expect(touchesCrit(spec)).toBe(true);
    const ref = curve(0, null, "trace");
    const own = curve(0, spec, "trace");
    const sum = (c: typeof own) => c.critHits!.reduce((s, x) => s + x[4], 0);
    expect(sum(own)).toBeGreaterThan(sum(ref));
    // floorCurves traces it and borrows for the rest: the same as tracing each
    const specs = [at({ Electro: 10 }, 90), spec, at({}, 100, [{ kind: "dmgBonus", label: "b", value: 30 }])];
    const batch = floorCurves(E, PINNED[0]!.teamKey, PINNED[0]!.picks, specs, opts(), true);
    const traced = specs.map((sp) => curve(0, sp, "trace"));
    expect(batch[0]).toEqual(traced[0]);
    expect(batch[1]).toEqual(traced[1]);
    expect(batch[2]!.points).toEqual(traced[2]!.points);
    expect(batch[2]!.critHits).toEqual(curve(0, specs[2]!, batch[0]!).critHits);
  }, 60_000);

  it("odds on the real engine agree with a seeded Monte Carlo of the same hits", () => {
    // the fixture team's spread is a few big hits (Lynae at 87 % Crit Rate: most runs crit them), so a floor whose HP the
    // average deals by t is down by t in well over half the runs — the bell curve alone would say ~60 %
    const c = curve(0, null, "trace");
    for (const t of [20, 30, 60]) {
      const hp = damageAt(c, t);
      const odds = killOdds([{ hp, curve: c }])!;
      expect(odds.method).toBe("mixture");
      const mc = killOdds([{ hp, curve: c }], undefined, { method: "monteCarlo", samples: 4000, seed: 2 })!;
      for (const x of [t - 1, t, t + 1]) expect(Math.abs(chanceBy(mc, x)! - chanceBy(odds, x)!), `${t} s, read at ${x} s`).toBeLessThan(0.04);
    }
  }, 60_000);
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
      // crit luck rides along: the median kill sits on the average one
      expect(r.odds?.q).toHaveLength(49);
      if (r.seconds !== null && r.seconds < 290) expect(chanceBy(r.odds, r.seconds + 3)!).toBeGreaterThan(0.5);
    }
    client.dispose();
  }, LOAD);
});
