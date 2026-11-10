// The ToA clear check's pure pieces: season data and its release guard, kill time off a damage curve, crests and
// calibration, the Vigor plan, the effect DSL, and the candidate pick (released content only).
import { describe, expect, it } from "vitest";
import type { MineSolve, RileyAccount, RileyEngine, RileyTeamInfo } from "../engine/rileyRun";
import { clearSecondsUsed, clockText, crestBoundaries, crestsFor, defaultPace, nextCrest, paceOf, parseClock, readClearLog, teamSignature, type ClearLog } from "./crests";
import { engineProfileOf, fidelityOf, hasGear, profileSignature, rampAt, resTable, type FloorEffect } from "./effects";
import { crossing, damageAt, killTime, type CurveLike } from "./killTime";
import {
  countdown,
  floorChips,
  guessRegion,
  hpPending,
  hpSegments,
  loadSeason,
  releasedSeasons,
  resSegments,
  seasonStatus,
  segmentProfiles,
  serverMoment,
  timedFloors,
  toaIndex,
  type ToaIndex,
  type ToaSeason,
} from "./toaData";
import { failedTeams, fieldableKeys, floorFactor, pickCandidates, planInputOf, rankFloor, runToaCheck, seasonProfiles, type ToaCheck, type ToaRunner } from "./toaRun";
import { nearMisses, planAlternatives, planVigor, vigorPool, type PlanInput, type PlanStage } from "./vigorPlan";

const DAY = 86_400_000;
const S41 = (): Promise<ToaSeason> => loadSeason(toaIndex.seasons.find((s) => s.season === 41)!);
const S42 = (): Promise<ToaSeason> => loadSeason(toaIndex.seasons.find((s) => s.season === 42)!);

/* ------------------------------------------------------------------------------------------ season data */

describe("season data and the release guard", () => {
  const index: ToaIndex = {
    v: 1,
    seasons: [
      { season: 40, start: "2026-09-14", end: "2026-10-12", resetHour: 4, file: "s40.json" },
      { season: 41, start: "2026-10-12", end: "2026-11-09", resetHour: 4, file: "s41.json" },
      // an upstream list flagged this one "current" too early: only the date counts
      { season: 42, start: "2026-11-09", end: "2026-12-07", resetHour: 4, file: "s42.json" },
    ],
  };

  it("drops a season that hasn't started on the player's server clock, whatever an upstream flag says", () => {
    const now = Date.UTC(2026, 9, 26, 12);
    expect(releasedSeasons(index, now).map((s) => s.season)).toEqual([40, 41]);
    expect(seasonStatus(index, now).entry?.season).toBe(41);
    // 04:00 server time on 11-09: Asia (UTC+8) has rolled over at 20:00 UTC the day before, America (UTC−5) not yet
    const asiaReset = serverMoment("2026-11-09", 4, 8);
    expect(asiaReset).toBe(Date.UTC(2026, 10, 8, 20));
    expect(seasonStatus(index, asiaReset + 1000, 8).entry?.season).toBe(42);
    expect(seasonStatus(index, asiaReset + 1000, -5).entry?.season).toBe(41);
  });

  it("only ships seasons that have started (the generated index), with S41 parsing", async () => {
    // the index as synced on 2026-11-09, the day Season 42 began: nothing later is in it
    expect(toaIndex.seasons.every((s) => s.start <= "2026-11-09")).toBe(true);
    expect(toaIndex.seasons.map((s) => s.season)).toEqual([41, 42]);
    const s = await S41();
    expect(s.season).toBe(41);
    expect(s.towers.map((t) => t.id)).toEqual(["resonant", "hazard", "echoing"]);
    expect(s.towers.flatMap((t) => t.floors)).toHaveLength(12);
    expect(s.credits.hp).toBe("Floor HP: ChemX32's DPR Calc sheet (data from Sleep)");
    expect(JSON.stringify(s)).not.toMatch(/encore/i);
  });

  it("carries crest goals as seconds left, Vigor and levels per floor", async () => {
    const s = await S41();
    const floor = (id: string) => s.towers.flatMap((t) => t.floors).find((f) => f.id === id)!;
    expect(floor("hazard-1").goals).toEqual([90, 150, 180]);
    expect(floor("hazard-3").goals).toEqual([60, 120, 150]);
    expect(floor("resonant-4").goals).toEqual([0, 120, 180]);
    expect([1, 2, 3, 4].map((n) => floor(`echoing-${n}`).cost)).toEqual([1, 2, 3, 4]);
    expect([1, 2, 3, 4].map((n) => floor(`hazard-${n}`).cost)).toEqual([5, 5, 5, 5]);
    expect(floor("resonant-4").level).toBe(90);
    expect(floor("hazard-2").level).toBe(100);
    expect(floor("hazard-1").hp).toBe(5_510_473);
    expect(floor("hazard-4").hp).toBe(10_017_616);
    expect(timedFloors(s).map((f) => f.id)).toEqual(["resonant-4", "hazard-1", "hazard-2", "hazard-3", "hazard-4", "echoing-4"]);
  });

  it("splits a two-boss floor into HP segments with each boss's own RES plus the floor's", async () => {
    const s = await S41();
    const h4 = s.towers[1]!.floors[3]!;
    const segs = hpSegments(h4);
    expect(segs.map((x) => x.names)).toEqual([["Sentry Construct"], ["Crownless"]]);
    expect(segs.map((x) => x.hp)).toEqual([3_299_723, 6_717_893]);
    // Sentry Construct: Glacio 40 + 15 (the floor's RES wall spares Electro and Spectro)
    expect(segs[0]!.res).toMatchObject({ Glacio: 55, Havoc: 25, Electro: 10, Spectro: 10 });
    expect(segs[1]!.res).toMatchObject({ Havoc: 55, Glacio: 25, Electro: 10 });
    // Hazard 3's adds and boss all resist Havoc: one segment, the sheet's adjusted total
    const h3 = s.towers[1]!.floors[2]!;
    expect(hpSegments(h3)).toHaveLength(1);
    expect(hpSegments(h3)[0]!.hp).toBe(8_894_019);
    // Hazard 1: Lampylumen Myriad 10 / 40 Glacio, the floor −10 Electro & Fusion, +10 Spectro & Glacio
    expect(segmentProfiles(s.towers[1]!.floors[0]!)[0]).toMatchObject({ level: 100, res: { Electro: 0, Fusion: 0, Glacio: 50, Spectro: 20, Havoc: 10 } });
  });

  it("counts down to the reset and guesses a server region from the browser's clock", () => {
    const now = Date.UTC(2026, 9, 26, 6);
    expect(countdown(now + 13 * DAY + 22 * 3600_000 + 5 * 60_000, now)).toBe("13 d 22 h");
    expect(countdown(now + 5 * 3600_000 + 7 * 60_000, now)).toBe("5 h 07 m");
    expect(countdown(now - 1, now)).toBe("0 m");
    expect(guessRegion(-300)).toBe("america");
    expect(guessRegion(60)).toBe("europe");
    expect(guessRegion(480)).toBe("asia");
  });
});

/* ------------------------------------------------------------------- a season before its HP is published */

/** A season as the generator ships it before the HP sheet has its block: no HP on any floor or enemy. The behaviour is
 *  tested on Season 41 stripped this way, so it holds whatever state Season 42's own file is in. */
const withoutHp = (s: ToaSeason, only?: string[]): ToaSeason => ({
  ...s,
  towers: s.towers.map((t) => ({
    ...t,
    floors: t.floors.map((f) => (only && !only.includes(f.id) ? f : { ...f, hp: null, hpRaw: null, hpType: null, enemies: f.enemies.map((e) => ({ ...e, hp: null })) })),
  })),
});

describe("a season synced before the HP sheet has its block (Season 42 on 2026-11-09)", () => {
  const SHEET_FLOORS = ["resonant-4", "hazard-1", "hazard-2", "hazard-3", "hazard-4", "echoing-4"];

  it("is the running season on every server clock from its own reset, for 28 days", () => {
    const now = Date.UTC(2026, 10, 10, 3); // 2026-11-09 21:00 US Central
    for (const offset of [8, -5, 1]) expect(seasonStatus(toaIndex, now, offset)).toMatchObject({ entry: { season: 42, start: "2026-11-09", end: "2026-12-07" }, current: true, next: null });
    expect(countdown(seasonStatus(toaIndex, now, -5).endsAt!, now)).toBe("27 d 6 h");
    // an hour before America's reset Season 41 is still the one running there, while Asia is a day into Season 42
    const early = serverMoment("2026-11-09", 4, -5) - 3600_000;
    expect(seasonStatus(toaIndex, early, -5)).toMatchObject({ entry: { season: 41 }, current: true });
    expect(seasonStatus(toaIndex, early, 8)).toMatchObject({ entry: { season: 42 }, current: true });
  });

  it("Season 42 carries all 12 floors with goals, Vigor and every effect translated", async () => {
    const s = await S42();
    const floors = s.towers.flatMap((t) => t.floors);
    const floor = (id: string) => floors.find((f) => f.id === id)!;
    expect(floors).toHaveLength(12);
    expect([s.start, s.end, s.resetHour]).toEqual(["2026-11-09", "2026-12-07", 4]);
    expect(floors.every((f) => f.enemies.length > 0)).toBe(true);
    // the six floors the HP sheet covers either wait for their HP (as synced on the season's first day) or have it
    expect([...timedFloors(s), ...hpPending(s)].map((f) => f.id).sort()).toEqual([...SHEET_FLOORS].sort());
    expect(floor("hazard-1").goals).toEqual([90, 150, 180]);
    expect(floor("hazard-3").goals).toEqual([60, 120, 150]);
    expect([1, 2, 3, 4].map((n) => floor(`resonant-${n}`).cost)).toEqual([1, 2, 3, 4]);
    expect([1, 2, 3, 4].map((n) => floor(`hazard-${n}`).level)).toEqual([100, 100, 100, 100]);
    // every buff id of the season has its translation: no placeholder chip, and each floor shows its effects
    expect(floors.every((f) => f.effects.length >= 2)).toBe(true);
    const rows = new Map(floors.flatMap((f) => floorChips(f).map((c) => [c.key, c] as const)));
    expect([...rows.values()].some((c) => c.label === "Not modelled yet")).toBe(false);
    const count = (fidelity: string): number => [...rows.values()].filter((c) => c.fidelity === fidelity).length;
    expect([count("exact"), count("approx"), count("none")]).toEqual([9, 4, 2]);
    // an unmodelled row keeps the game's own wording in its note
    expect(floorChips(floor("echoing-4")).find((c) => c.label === "Ignore 25% of enemy DEF")).toMatchObject({ fidelity: "none", note: expect.stringContaining("Resonators ignore 25% of the enemy's DEF when dealing damage.") });
    // the ramp is Season 41's, id and wording unchanged
    expect(floor("hazard-3").effects.find((e) => e.id === 92008205)?.model).toEqual((await S41()).towers[1]!.floors[2]!.effects.find((e) => e.id === 92008205)?.model);
    expect(JSON.stringify(s)).not.toMatch(/encore/i);
  });

  it("lists the floors waiting for their HP: the six the sheet covers, never a low side floor", async () => {
    const s41 = await S41();
    expect(hpPending(s41)).toEqual([]);
    const bare = withoutHp(s41);
    expect(timedFloors(bare)).toEqual([]);
    expect(hpPending(bare).map((f) => f.id)).toEqual(SHEET_FLOORS);
    // a block that came in part: only the floor without its HP waits
    const part = withoutHp(s41, ["hazard-2"]);
    expect(hpPending(part).map((f) => f.id)).toEqual(["hazard-2"]);
    expect(timedFloors(part).map((f) => f.id)).toEqual(SHEET_FLOORS.filter((id) => id !== "hazard-2"));
  });

  it("still shows what a floor's enemies resist (their own RES plus the floor's), with nothing for the engine to fight", async () => {
    const s41 = await S41();
    const h4 = withoutHp(s41).towers[1]!.floors[3]!;
    // the same two tables as with its HP (Sentry Construct, then Crownless), and no HP in them
    expect(resSegments(h4).map((x) => [x.names, x.hp])).toEqual([[["Sentry Construct"], 0], [["Crownless"], 0]]);
    expect(resSegments(h4).map((x) => x.res)).toEqual(hpSegments(s41.towers[1]!.floors[3]!).map((x) => x.res));
    expect(hpSegments(h4)).toEqual([]);
    expect(segmentProfiles(h4)).toEqual([]);
    // a floor with HP lists exactly what the engine fights
    expect(resSegments(s41.towers[1]!.floors[3]!)).toEqual(hpSegments(s41.towers[1]!.floors[3]!));
  });

  it("makes no spare stage of a floor waiting for its HP: nobody is timed there and it earns no crest", async () => {
    const s41 = await S41();
    const input = planInputOf(withoutHp(s41), { results: [], candidates: [] }, { owned: ["A", "B", "C", "D", "E", "F", "G", "H", "I"] });
    const stage = new Map(input.stages.map((x) => [x.id, x]));
    for (const id of SHEET_FLOORS) expect(stage.get(id), id).toMatchObject({ timed: true, options: [] });
    expect(stage.get("resonant-1")).toMatchObject({ timed: false, assumedCrests: 3 });
    const plan = planVigor(input);
    for (const id of SHEET_FLOORS) expect(plan.assignments.find((a) => a.stageId === id)?.crests ?? 0, id).toBe(0);
    // it counted all 12 stages as spare ones assumed to 3-crest: 36 of 36 with not one floor timed
    expect(plan.crests).toBeLessThanOrEqual(18);
    // with its HP the season plans as before: the six sheet floors are timed stages, the six low ones spare
    const whole = planInputOf(s41, { results: [], candidates: [] });
    expect(whole.stages.filter((x) => x.timed).map((x) => x.id)).toEqual(SHEET_FLOORS);
    expect(whole.stages.filter((x) => !x.timed)).toHaveLength(6);
  });
});

/* -------------------------------------------------------------------------------------------- effects */

describe("floor effects", () => {
  it("folds RES rows into the enemy's table and leaves the rest to Gear", () => {
    const fx: FloorEffect[] = [
      { kind: "res", label: "a", res: { Electro: -10, Fusion: -10 } },
      { kind: "res", label: "b", res: { Glacio: 15 } },
      { kind: "dmgBonus", label: "c", value: 30, elements: ["Electro"] },
      { kind: "unmodelled", label: "d" },
    ];
    expect(resTable({ Glacio: 40 }, fx)).toEqual({ Aero: 10, Electro: 0, Fusion: 0, Glacio: 55, Spectro: 10, Havoc: 10, Physical: 10 });
    expect(fx.filter(hasGear).map((e) => e.label)).toEqual(["c"]);
  });

  it("shows an untranslated or unmodelled row as not modelled", async () => {
    expect(fidelityOf({ kind: "unmodelled", label: "x" })).toBe("none");
    expect(fidelityOf({ kind: "ramp", label: "x", start: 60, first: 5, step: 5, every: 5, cap: 60, fidelity: "approx" })).toBe("approx");
    const s = await S41();
    const chips = floorChips(s.towers[0]!.floors[3]!);
    expect(chips.find((c) => c.label === "Crit DMG +36% at 4 stacks")?.fidelity).toBe("none");
    expect(chips.find((c) => c.label === "Havoc RES −10%")?.fidelity).toBe("exact");
  });

  it("ramps DMG taken from 60 s in 5 % steps to its cap", () => {
    const r = { kind: "ramp", label: "r", start: 60, first: 5, step: 5, every: 5, cap: 60 } as const;
    expect([0, 59.9, 60, 64.9, 65, 100, 115, 200].map((t) => rampAt(r, t))).toEqual([0, 0, 5, 5, 10, 45, 60, 60]);
  });

  it("signs a profile by what the engine plays, not by its wording", () => {
    const a = { level: 100, res: resTable({}, []), effects: [{ kind: "dmgBonus", label: "one", value: 30 } as FloorEffect] };
    const b = { ...a, effects: [{ kind: "dmgBonus", label: "two", note: "x", value: 30 } as FloorEffect] };
    expect(profileSignature(a)).toBe(profileSignature(b));
    expect(profileSignature({ ...a, level: 90 })).not.toBe(profileSignature(a));
  });

  it("refuses to build floor Gear when the engine's enums were inlined away (a loud error, never untagged stats)", () => {
    class Stub {
      constructor(public def: unknown) {}
    }
    const E = {
      stats: { Stat: {}, Attribute: {}, Type: {}, Cast: {}, BuffTarget: {} },
      floor: { gear: { Gear: Stub, Buff: Stub, Debuff: Stub }, context: {}, status: {}, unison: {}, profile: {} },
    } as unknown as RileyEngine;
    const spec = { level: 100, res: resTable({}, []), effects: [{ kind: "dmgBonus", label: "x", value: 30, elements: ["Electro"] } as FloorEffect] };
    expect(() => engineProfileOf(E, spec)).toThrow(/missing at runtime/);
  });
});

/* ------------------------------------------------------------------------------------------- kill time */

/** A synthetic fight: `dps` every frame for `seconds`, in four sections. */
function curve(dps: number, seconds = 100, sections = [25, 25, 25, 25]): CurveLike {
  const points: Array<[number, number]> = [];
  for (let f = 1; f <= seconds * 60; f++) points.push([f, Math.round((dps * f) / 60)]);
  return { seconds, sectionSeconds: sections, sectionTotals: sections.map((s) => s * dps), points };
}

describe("kill time", () => {
  it("reads the crossing off the run's own hits", () => {
    const c = curve(100_000);
    expect(damageAt(c, 10)).toBe(1_000_000);
    expect(killTime([{ hp: 3_000_000, curve: c }]).seconds).toBeCloseTo(30, 1);
    expect(killTime([{ hp: 3_000_000, curve: c }]).extrapolated).toBe(false);
  });

  it("extrapolates past the run at the last loop's DPS, and says so", () => {
    const k = killTime([{ hp: 15_000_000, curve: curve(100_000) }]);
    expect(k.seconds).toBeCloseTo(150, 0);
    expect(k.extrapolated).toBe(true);
    expect(killTime([{ hp: 40_000_000, curve: curve(100_000) }]).seconds).toBeNull();
  });

  it("keeps a ramp climbing past the run: the last loop's own factor comes out, the later one goes in", () => {
    const factor = (t: number) => 1 + rampAt({ kind: "ramp", label: "", start: 60, first: 5, step: 5, every: 5, cap: 60 }, t) / 100;
    // a fight whose last loop already ran under the ramp (mean factor over 75–100 s)
    const base = curve(100_000);
    let mean = 0;
    for (let t = 75; t < 100; t += 1 / 60) mean += factor(t) / (25 * 60);
    const ramped: CurveLike = { ...base, sectionTotals: [...base.sectionTotals.slice(0, 3), 25 * 100_000 * mean] };
    const flat = crossing(base, 0, 13_000_000)!.at;
    const up = crossing(ramped, 0, 13_000_000, factor)!.at;
    expect(up).toBeLessThan(flat);
  });

  it("fights two segments in order on one clock, each on its own curve", () => {
    const fast = curve(200_000);
    const slow = curve(100_000);
    const k = killTime([
      { hp: 2_000_000, curve: fast },
      { hp: 1_000_000, curve: slow },
    ]);
    expect(k.splits[0]).toBeCloseTo(10, 1);
    expect(k.seconds).toBeCloseTo(20, 1);
  });

  it("reads a floor's ramps as its time factor", async () => {
    const s = await S41();
    const f = floorFactor(s.towers[1]!.floors[2]!);
    expect(f(30)).toBe(1);
    expect(f(120)).toBeCloseTo(1.6);
    expect(floorFactor(s.towers[1]!.floors[0]!)(120)).toBe(1);
  });
});

/* --------------------------------------------------------------------------------------------- crests */

describe("crests", () => {
  it("counts the goals the time left meets: Hazard 1–2 at 90 / 150 / 180 s, Hazard 3–4 at 60 / 120 / 150 s", () => {
    const h12 = [90, 150, 180];
    expect([100, 120, 121, 150, 151, 210, 211, 300, 301].map((t) => crestsFor(h12, t))).toEqual([3, 3, 2, 2, 1, 1, 0, 0, 0]);
    const h34 = [60, 120, 150];
    expect([150, 151, 180, 181, 240, 241].map((t) => crestsFor(h34, t))).toEqual([3, 2, 2, 1, 1, 0]);
    expect(crestsFor([0, 90, 150], 299)).toBe(1);
    expect(crestsFor(h12, null)).toBe(0);
    expect(crestBoundaries(h12)).toEqual([210, 150, 120]);
    expect(nextCrest(h12, 160)).toEqual({ crest: 2, faster: 10 });
    expect(nextCrest(h12, 130)).toEqual({ crest: 3, faster: 10 });
    expect(nextCrest(h12, 100)).toBeNull();
  });

  it("reads and writes clock times", () => {
    expect([parseClock("1:42"), parseClock("102"), parseClock("1m42s"), parseClock("0:58"), parseClock("5:01"), parseClock("abc"), parseClock("1:75")]).toEqual([102, 102, 102, 58, null, null, null]);
    expect([clockText(102), clockText(58.6), clockText(null)]).toEqual(["1:42", "0:59", "—"]);
    // decimal seconds aren't minutes: "87.5" is 87.5 s, "1.30" still a clock reading
    expect([parseClock("87.5"), parseClock("1.30"), parseClock("300"), parseClock("301")]).toEqual([87.5, 90, 300, null]);
  });

  it("logs a clear as seconds used, whether the player read the time left or the time used", () => {
    expect(clearSecondsUsed("3:30", "left")).toBe(90);
    expect(clearSecondsUsed("1:30", "used")).toBe(90);
    expect(clearSecondsUsed("5:00", "left")).toBeNull();
    expect(clearSecondsUsed("0:01", "left")).toBe(299);
    expect(clearSecondsUsed("soon", "used")).toBeNull();
  });

  it("turns logged clears into a pace, the median standing in for teams without one", () => {
    const log: ClearLog = {
      v: 1,
      clears: {
        a: { season: 41, floorId: "hazard-1", seconds: 90, sim: 60, at: 0 },
        b: { season: 41, floorId: "hazard-2", seconds: 120, sim: 60, at: 0 },
        c: { season: 41, floorId: "hazard-3", seconds: 300, sim: 100, at: 0 },
      },
    };
    expect(paceOf(log.clears.a)).toBe(1.5);
    expect(defaultPace(log)).toBe(2);
    expect(defaultPace({ v: 1, clears: {} })).toBeNull();
    expect(readClearLog({ getItem: () => "not json" })).toEqual({ v: 1, clears: {} });
    expect(teamSignature(["Lynae", "Aemeath", "Mornye"])).toBe("Aemeath+Lynae+Mornye");
  });
});

/* ------------------------------------------------------------------------------------------ the plan */

const opt = (id: string, members: string[], seconds: number, crests: number) => ({ id, members, seconds, crests });
/** 12 stages the S41 way: side 1–3 spare, side 4 and every Hazard floor timed. */
function zone(options: Record<string, ReturnType<typeof opt>[]>): PlanStage[] {
  const out: PlanStage[] = [];
  for (const tower of ["resonant", "hazard", "echoing"]) {
    for (const n of [1, 2, 3, 4]) {
      const id = `${tower}-${n}`;
      const timed = tower === "hazard" || n === 4;
      out.push({ id, cost: tower === "hazard" ? 5 : n, timed, options: timed ? options[id] ?? [] : [], assumedCrests: 3 });
    }
  }
  return out;
}

describe("the Vigor plan", () => {
  const A = ["A1", "A2", "A3"], B = ["B1", "B2", "B3"], C = ["C1", "C2", "C3"], D = ["D1", "D2", "D3"];
  const everywhere = (team: string[], id: string, seconds: number, crests = 3) =>
    Object.fromEntries(["resonant-4", "hazard-1", "hazard-2", "hazard-3", "hazard-4", "echoing-4"].map((s) => [s, [opt(id, team, seconds, crests)]]));
  const merge = (...parts: Array<Record<string, ReturnType<typeof opt>[]>>) => {
    const out: Record<string, ReturnType<typeof opt>[]> = {};
    for (const p of parts) for (const [k, v] of Object.entries(p)) out[k] = [...(out[k] ?? []), ...v];
    return out;
  };
  const roster = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9"];
  const input = (): PlanInput => ({ stages: zone(merge(everywhere(A, "A", 30), everywhere(B, "B", 40), everywhere(C, "C", 50), everywhere(D, "D", 60))), roster });

  it("never spends more than 10 Vigor of anyone across all 12 stages", () => {
    const plan = planVigor(input());
    const spent = new Map<string, number>();
    for (const a of plan.assignments) for (const k of a.members) spent.set(vigorPool(k), (spent.get(vigorPool(k)) ?? 0) + a.cost);
    for (const [k, v] of spent) expect(v, k).toBeLessThanOrEqual(10);
    for (const [k, left] of Object.entries(plan.vigorLeft)) expect(left, k).toBe(10 - (spent.get(k) ?? 0));
    expect(plan.assignments).toHaveLength(12);
  });

  it("maximises crests first, then the summed kill time", () => {
    const plan = planVigor(input());
    expect(plan.crests).toBe(36);
    // four teams, six timed stages, 10 Vigor each: A and B take two Hazard floors apiece (5 + 5), C both side 4s
    // (4 + 4) — D, the slowest, isn't needed
    const hazards = plan.assignments.filter((a) => a.stageId.startsWith("hazard")).map((a) => a.option!.id).sort();
    expect(hazards).toEqual(["A", "A", "B", "B"]);
    expect(plan.seconds).toBe(30 * 2 + 40 * 2 + 50 * 2);
  });

  it("prefers a slower team that earns a crest over a fast one that would starve another stage", () => {
    // only A can 3-crest anything, but A can't do three Hazard floors: the plan spreads
    const stages = zone(merge(everywhere(A, "A", 20), everywhere(B, "B", 200, 1), everywhere(C, "C", 200, 1)));
    const plan = planVigor({ stages, roster });
    expect(plan.assignments.filter((a) => a.option?.id === "A")).toHaveLength(2);
    expect(plan.crests).toBe(3 * 6 + 3 * 2 + 1 * 4);
  });

  it("is deterministic and seats the low floors from spare resonators within their Vigor", () => {
    const a = planVigor(input());
    const b = planVigor(input());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const low = a.assignments.filter((x) => !x.timed);
    expect(low.every((x) => x.members.length === 3 && x.crests === 3)).toBe(true);
  });

  it("treats Rover's forms as one resonator", () => {
    expect(vigorPool("RoverAeroMale")).toBe(vigorPool("Roverelectrofemale"));
    const stages = zone({
      "hazard-1": [opt("R1", ["RoverAeroMale", "X1", "X2"], 30, 3)],
      "hazard-2": [opt("R2", ["Roverelectrofemale", "Y1", "Y2"], 30, 3)],
      "hazard-3": [opt("R3", ["RoverHavocFemale", "Z1", "Z2"], 30, 3)],
    });
    const plan = planVigor({ stages, roster: [] });
    // one Rover: two Hazard floors at most
    expect(plan.assignments.filter((a) => a.members.some((k) => vigorPool(k) === "Rover"))).toHaveLength(2);
  });

  it("reports what a stage gives up without its team, and picked teams close to the next crest", () => {
    const i = input();
    const plan = planVigor(i);
    const alts = planAlternatives(i, plan);
    expect(alts).toHaveLength(6);
    expect(alts.every((a) => a.crestDelta <= 0)).toBe(true);
    const goals = (id: string) => (id.startsWith("hazard") ? [90, 150, 180] : [0, 120, 180]);
    const slow = planVigor({ stages: zone(everywhere(A, "A", 130, 2)), roster });
    expect(nearMisses(slow, goals).map((m) => [m.stageId, m.crest, m.faster])).toContainEqual(["hazard-1", 3, 10]);
  });
});

/* ------------------------------------------------------------------------------ candidates and the check */

const solve = (teamKey: string, appKeys: string[], total: number, extra: Partial<MineSolve> = {}): MineSolve => ({
  teamKey,
  names: appKeys,
  appKeys,
  status: "ok",
  fieldable: true,
  best: {
    rowKey: `${teamKey}-x`,
    picks: [],
    total,
    bySlot: {},
    seconds: 100,
    members: appKeys.map((k, i) => ({ name: k, appKey: k, mainDps: i === 2, sequence: 0, weapon: "W", refinement: 1 }) as never),
  },
  ...extra,
});

describe("candidates", () => {
  const account: RileyAccount = { key: "k", buildsKey: "b", builds: [], entries: { A: { sequence: 0, weapon: null, refine: 1, owned: true }, B: { sequence: 0, weapon: null, refine: 1, owned: true }, C: { sequence: 0, weapon: null, refine: 1, owned: true } } };

  it("offers only teams the account owns all three of (a 4-star / Rover form always counts)", () => {
    const teams: RileyTeamInfo[] = [
      { key: "t1", members: [{ name: "A", appKey: "A", mainDps: false }, { name: "B", appKey: "B", mainDps: false }, { name: "C", appKey: "C", mainDps: true }] },
      { key: "t2", members: [{ name: "A", appKey: "A", mainDps: false }, { name: "Mortefi", appKey: "Mortefi", mainDps: false, free: true }, { name: "C", appKey: "C", mainDps: true }] },
      { key: "t3", members: [{ name: "A", appKey: "A", mainDps: false }, { name: "Lily", appKey: "Lily", mainDps: false }, { name: "C", appKey: "C", mainDps: true }] },
    ];
    expect(fieldableKeys(teams, account)).toEqual(["t1", "t2"]);
    expect(fieldableKeys(teams, null)).toEqual([]);
  });

  it("keeps the best variant per composition, the saved teams always, one per main DPS before the rest, never a skipped team", () => {
    const solves = [
      solve("t1", ["A", "B", "C"], 100),
      solve("t9", ["B", "A", "C"], 120), // same three, better variant
      solve("t2", ["A", "D", "C"], 110),
      solve("t3", ["E", "F", "G"], 50),
      solve("t4", ["H", "I", "J"], 10),
      { ...solve("t5", ["A", "Lily", "C"], 999), status: "skipped", reason: "notInApp", best: null } as MineSolve,
      { ...solve("t6", ["K", "L", "M"], 999), fieldable: false },
    ];
    const saved = new Map([[teamSignature(["H", "I", "J"]), "my weak team"]]);
    const picked = pickCandidates(solves, saved, 3);
    expect(picked.map((c) => c.teamKey)).toEqual(["t9", "t3", "t4"]);
    expect(picked.find((c) => c.teamKey === "t4")?.saved).toBe("my weak team");
    expect(picked.flatMap((c) => c.appKeys)).not.toContain("Lily");
  });

  it("runs end to end on a fake engine and ranks each floor by crests, then time", async () => {
    const season = await S41();
    const { profiles } = seasonProfiles(season);
    const dps: Record<string, number> = { t1: 300_000, t2: 30_000 };
    const runner: ToaRunner = {
      commit: "test",
      teams: async () => [
        { key: "t1", members: ["A", "B", "C"].map((n) => ({ name: n, appKey: n, mainDps: n === "C" })) },
        { key: "t2", members: ["A", "B", "Mortefi"].map((n) => ({ name: n, appKey: n, mainDps: n === "Mortefi", free: n === "Mortefi" })) },
      ],
      solveMine: async (keys) => keys.map((k) => solve(k, k === "t1" ? ["A", "B", "C"] : ["A", "B", "Mortefi"], dps[k]!)),
      curves: async (k, _p, specs) => specs.map(() => ({ teamKey: k, rowKey: k, commit: "test", total: dps[k]!, ...curve(dps[k]!) })),
    };
    const check = await runToaCheck(runner, season, { account, limit: 5, savedTeams: [{ name: "saved", characterIds: ["C", "A", "B"] }] });
    // 7 HP segments, 6 distinct fights: Hazard 3's Impermanence Heron and Hazard 4's Crownless resist alike
    expect(profiles.length).toBe(6);
    expect(check.candidates.map((c) => c.teamKey)).toEqual(["t1", "t2"]);
    expect(check.candidates[0]!.saved).toBe("saved");
    const h1 = rankFloor(check, "hazard-1");
    expect(h1[0]!.team.teamKey).toBe("t1");
    expect(h1[0]!.result.seconds).toBeCloseTo(5_510_473 / 300_000, 0);
    expect(h1[0]!.result.crests).toBe(3);
    // 30k DPS on 10M HP: past the run, and past 3 crests' 150 s
    const h4 = rankFloor(check, "hazard-4").find((r) => r.team.teamKey === "t2")!;
    expect(h4.result.extrapolated).toBe(true);
    expect(h4.result.crests).toBeLessThan(3);
    const plan = planVigor(planInputOf(season, check, { owned: ["A", "B", "C", "D", "E", "F", "G", "H", "I"] }));
    expect(plan.assignments).toHaveLength(12);
    expect(plan.crests).toBeGreaterThan(0);
  });

  it("times the saved teams first when asked, and ends on the same check", async () => {
    const season = await S41();
    const dps: Record<string, number> = { t1: 300_000, t2: 30_000, t3: 200_000 };
    const comp: Record<string, string[]> = { t1: ["A", "B", "C"], t2: ["A", "B", "Mortefi"], t3: ["B", "A", "C"] };
    const solved: string[][] = [];
    const timedKeys: string[] = [];
    const runner: ToaRunner = {
      commit: "test",
      teams: async () => Object.entries(comp).map(([key, names]) => ({ key, members: names.map((n) => ({ name: n, appKey: n, mainDps: n === names[2], free: n === "Mortefi" })) })),
      solveMine: async (keys) => {
        solved.push([...keys]);
        return keys.map((k) => solve(k, comp[k]!, dps[k]!));
      },
      curves: async (k, _p, specs) => {
        timedKeys.push(k);
        return specs.map(() => ({ teamKey: k, rowKey: k, commit: "test", total: dps[k]!, ...curve(dps[k]!) }));
      },
    };
    const savedTeams = [{ name: "saved", characterIds: ["C", "A", "B"] }];
    const plain = await runToaCheck(runner, season, { account, limit: 5, savedTeams, now: () => 1 });
    solved.length = 0;
    timedKeys.length = 0;
    const partials: ToaCheck[] = [];
    const check = await runToaCheck(runner, season, { account, limit: 5, savedTeams, now: () => 1, onPartial: (c) => partials.push(c) });
    // the saved composition's two variants first (t1, t3), then the rest — each team solved once, each timed once
    expect(solved).toEqual([["t1", "t3"], ["t2"]]);
    expect(timedKeys).toEqual(["t1", "t2"]);
    expect(partials).toHaveLength(1);
    expect(partials[0]!.partial).toBe(true);
    expect(partials[0]!.key).not.toBe(check.key);
    expect(partials[0]!.candidates.map((c) => c.teamKey)).toEqual(["t1"]);
    expect(partials[0]!.results.every((r) => r.teamId === partials[0]!.candidates[0]!.id)).toBe(true);
    // the final check is the one a plain run makes
    expect(check).toEqual(plain);
    // nothing saved, or only saved teams to solve: no first pass
    const none: ToaCheck[] = [];
    await runToaCheck(runner, season, { account, limit: 5, savedTeams: [], onPartial: (c) => none.push(c) });
    expect(none).toHaveLength(0);
  });

  describe("a team the engine fails on (2026-11-08 hunt F4)", () => {
    const comp: Record<string, string[]> = { t1: ["A", "B", "C"], t2: ["A", "B", "Mortefi"] };
    const dps: Record<string, number> = { t1: 300_000, t2: 30_000 };
    const savedTeams = [{ name: "saved", characterIds: ["C", "A", "B"] }];
    /** t1's curves throw `fails` times, as a worker that ran out of memory under it does */
    function runner(fails: number): ToaRunner & { tries: () => number } {
      let tries = 0;
      return {
        commit: "test",
        teams: async () => Object.entries(comp).map(([key, names]) => ({ key, members: names.map((n) => ({ name: n, appKey: n, mainDps: n === names[2], free: n === "Mortefi" })) })),
        solveMine: async (keys) => keys.map((k) => solve(k, comp[k]!, dps[k]!)),
        curves: async (k, _p, specs) => {
          if (k === "t1" && tries++ < fails) throw new Error("The rankings engine worker failed: Uncaught Error: renderer ran out of memory");
          return specs.map(() => ({ teamKey: k, rowKey: k, commit: "test", total: dps[k]!, ...curve(dps[k]!) }));
        },
        tries: () => tries,
      };
    }

    it("is tried once more, on the fresh worker the crash leaves", async () => {
      const r = runner(1);
      const check = await runToaCheck(r, await S41(), { account, limit: 5, savedTeams });
      expect(failedTeams(check)).toEqual([]);
      expect(check.results.some((x) => x.error)).toBe(false);
      expect(r.tries()).toBe(2);
    });

    it("left untimed, is named by failedTeams, and the saved teams' first pass hands no failure to the check", async () => {
      const season = await S41();
      const always = await runToaCheck(runner(99), season, { account, limit: 5, savedTeams });
      expect(failedTeams(always)).toEqual([always.candidates.find((c) => c.teamKey === "t1")!.id]);
      // failed in the first pass, timed in the second: the check is whole
      const r = runner(2);
      const partials: ToaCheck[] = [];
      const check = await runToaCheck(r, season, { account, limit: 5, savedTeams, onPartial: (c) => partials.push(c) });
      expect(failedTeams(partials[0]!)).toHaveLength(1);
      expect(failedTeams(check)).toEqual([]);
      expect(r.tries()).toBe(3);
    });
  });
});
