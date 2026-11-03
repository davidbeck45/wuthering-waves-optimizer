// Wuthering Tools+: /account "With what you own" view model (ownUpgrades.ts) on small synthetic data: the echo,
// Tuner plan and Energy Regen rows, the "enter your Tuners" row (no fake numbers), and the order (team gain first,
// the rows without one under a divider).
import { describe, expect, it } from "vitest";
import { checkOf, erRoll, showHave, showNeed } from "../energy/energyNeed";
import type { MemberCheck } from "../energy/energyCheck";
import type { TeamView } from "../energy/useEnergyNeeds";
import type { TunerCandidate, TunerCandidatesResult } from "../echoLab/tunerPlan";
import { EMPTY_BUDGET } from "../echoLab/tunerBudget";
import type { EchoUpgrade } from "./echoCheck";
import { echoRows, energyRows, ownUpgradeRows, sortOwnRows, tunerRows, TUNER_STEPS, type OwnRow } from "./ownUpgrades";

/* eslint-disable @typescript-eslint/no-explicit-any */

const armed = { weapon: "StaticMistW" };
const characters: Record<string, any> = { Carlotta: armed, Zhezhi: armed, Shorekeeper: armed, Verina: armed };

function upgrade(over: Partial<EchoUpgrade> = {}): EchoUpgrade {
  return {
    id: "Carlotta:echoes",
    characterId: "Carlotta",
    request: { teamId: "t1" },
    teamName: "Carlotta + Zhezhi + Shorekeeper",
    objective: "Team rotation",
    before: 2_590_000,
    after: 3_330_000,
    gain: 3_330_000 / 2_590_000 - 1,
    team: { teamId: "t1", teamName: "Carlotta + Zhezhi + Shorekeeper", characterIds: ["Carlotta", "Zhezhi", "Shorekeeper"], base: 5_000_000, avgDamage: 5_600_000, gain: 0.12 },
    teamNote: null,
    changed: 3,
    unworn: 3,
    sets: "Frosty Resolve 5pc",
    er: null,
    buffsOn: [],
    plan: "riley",
    relaxed: null,
    ...over,
  };
}

function candidate(echoId: string, tuners: number, expectedDamage: number, over: Partial<TunerCandidate> = {}): TunerCandidate {
  return {
    kind: "worn",
    echoId,
    echo: "Impermanence Heron",
    set: "MoonlitClouds",
    echoCost: 4,
    main: "Crit. DMG",
    rank: 5,
    subs: [],
    lines: 2,
    level: 10,
    characterId: "Verina",
    name: "Verina",
    slot: 0,
    replacedEchoId: null,
    replacedEcho: null,
    base: 1_000_000,
    resources: { tuners, exp: 20_000, shellCredits: 0 },
    expectedGain: expectedDamage / 1_000_000,
    expectedDamage,
    pKeep: null,
    p10: 0,
    p50: 0,
    p90: 0,
    method: "exact",
    damagePerTuner: expectedDamage / tuners,
    ...over,
  };
}

const tunerResult = (candidates: TunerCandidate[]): TunerCandidatesResult => ({ fingerprint: "fp", candidates, fresh: [], leftOut: [], assumptions: [], scorings: 0, ms: 0 });

function check(characterId: string, need: number | null, have: number | null, over: Partial<MemberCheck> = {}): MemberCheck {
  return { ...checkOf(need, have), characterId, member: { setBy: "loop" } as any, buildName: null, ...over };
}

function view(id: string, characterIds: string[], checks: MemberCheck[] | null, source: TeamView["source"] = "saved"): TeamView {
  return { key: [...characterIds].sort().join(","), id, name: `Team ${id}`, source, characterIds, state: null, energy: null, checks };
}

describe("echo rows", () => {
  it("say what to swap, measure the own figure in words, keep the exact team figure and open /build-team on that team, only them", () => {
    const [row] = echoRows([upgrade()]);
    expect(row!.kind).toBe("echoes");
    expect(row!.title).toBe("Better echoes from your inventory");
    expect(row!.todo).toBe("For Carlotta + Zhezhi + Shorekeeper: swap 3 of Carlotta's 5 echoes for ones nobody wears (Frosty Resolve 5pc).");
    expect(row!.own).toBeCloseTo(0.2857, 4);
    expect(row!.ownDetail).toBe("2.59M → 3.33M avg damage per rotation on their part of the team's rotation");
    expect(row!.team!.gain).toBe(0.12);
    expect(row!.link).toEqual({ label: "Open Build my team", to: { path: "/build-team", query: { team: "t1", only: "Carlotta" } } });
  });

  it("name echoes worn outside the team, the ER floor a re-gear meets, buffs switched on, a loosened plan; and the reason without a team figure", () => {
    const [row] = echoRows([
      upgrade({
        changed: 2,
        unworn: 1,
        request: { members: ["Carlotta", "Zhezhi", "Shorekeeper"] },
        objective: "Carlotta's best",
        team: null,
        teamNote: "not in a team you can field",
        er: { floor: 120.04, before: 110.26, after: 121.3, met: true, buys: true },
        buffsOn: ["Frosty Resolve 5pc"],
        relaxed: "mainStats",
      }),
    ]);
    expect(row!.todo).toContain("swap 2 of Carlotta's 5 echoes: 1 nobody wears, 1 worn by someone outside the team (they keep wearing it)");
    expect(row!.ownDetail).toContain("on their best rotation, with this team's buffs");
    expect(row!.note).toContain(`Meets the ${showNeed(120.04).toFixed(1)} % Energy Regen the team's loop needs (today ${showHave(110.26).toFixed(1)} %).`);
    expect(row!.note).toContain("Counts Frosty Resolve 5pc switched on (nobody had set it).");
    expect(row!.note).toContain("can't fill the plan's main stats");
    expect(row!.team).toBeNull();
    expect(row!.teamNote).toBe("not in a team you can field");
    expect(row!.link.to).toEqual({ path: "/build-team", query: { members: "Carlotta,Zhezhi,Shorekeeper", only: "Carlotta" } });
  });
});

describe("Tuner plan rows", () => {
  it("ask for the Tuners when none are entered: one row, no figure", () => {
    const rows = tunerRows({ budget: { ...EMPTY_BUDGET }, result: tunerResult([candidate("e1", 20, 30_000)]) });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("Enter your Tuners in Echo Lab › Tuner plan");
    expect(rows[0]!.own).toBeNull();
    expect(rows[0]!.figure).toBeNull();
    expect(rows[0]!.characterId).toBeNull();
    expect(rows[0]!.link.to).toEqual({ path: "/echo-lab", query: { tab: "plan" } });
  });

  it("say the plan is not worked out yet when Tuners are entered but no result is in", () => {
    const rows = tunerRows({ budget: { ...EMPTY_BUDGET, tuners: 100 }, result: null });
    expect(rows.map((r) => r.id)).toEqual(["tuner:pending"]);
    expect(rows[0]!.title).toBe("What your 100 Tuners buy");
    expect(rows[0]!.own).toBeNull();
  });

  it(`list the plan's first steps the Tuners cover today (at most ${TUNER_STEPS}), an expected own gain, never a team figure`, () => {
    const cands = [candidate("e1", 20, 40_000), candidate("e2", 20, 30_000), candidate("e3", 20, 20_000), candidate("e4", 20, 10_000), candidate("e5", 200, 900_000)];
    const rows = tunerRows({ budget: { ...EMPTY_BUDGET, tuners: 100 }, result: tunerResult(cands) });
    // e5 pays 4,500 per Tuner and is step 1 but costs 200: it waits; e1–e4 (80 Tuners) fit, three are shown
    expect(rows.map((r) => r.id)).toEqual(["tuner:e1", "tuner:e2", "tuner:e3"]);
    expect(rows[0]!.ownLabel).toBe("expected own");
    expect(rows[0]!.own).toBeCloseTo(0.04, 6);
    expect(rows[0]!.team).toBeNull();
    expect(rows[0]!.teamNote).toMatch(/expectation/);
    expect(rows[0]!.todo).toBe("Level Verina's Impermanence Heron (Main echo) from +10 to +25 where it sits: 20 Tuners, 20K Echo EXP.");
    expect(rows[0]!.note).toBe("Step 2 of the Tuner plan.");
  });

  it("say what the budget is short of when the next step does not fit", () => {
    const short = tunerRows({ budget: { ...EMPTY_BUDGET, tuners: 5 }, result: tunerResult([candidate("e1", 20, 40_000)]) });
    expect(short.map((r) => r.id)).toEqual(["tuner:short:e1"]);
    expect(short[0]!.figure).toEqual({ text: "15", caption: "Tuners short" });
    expect(short[0]!.own).toBeNull();
    const expShort = tunerRows({ budget: { ...EMPTY_BUDGET, tuners: 50, exp: 5_000 }, result: tunerResult([candidate("e1", 20, 40_000)]) });
    expect(expShort[0]!.figure).toEqual({ text: "15K", caption: "Echo EXP short" });
  });

  it("say so when no unfinished echo is worth a Tuner", () => {
    const rows = tunerRows({ budget: { ...EMPTY_BUDGET, tuners: 100 }, result: tunerResult([candidate("e1", 20, 0.1)]) });
    expect(rows.map((r) => r.id)).toEqual(["tuner:none"]);
  });
});

describe("Energy Regen rows", () => {
  const short = check("Zhezhi", 120.04, 110.26);
  const ok = check("Carlotta", 100, 130);

  it("one per member short in a team the account can field, with /energy's own numbers and hint", () => {
    const rows = energyRows([view("t1", ["Carlotta", "Zhezhi", "Shorekeeper"], [ok, short])], characters);
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r.title).toBe(`Needs ${short.short.toFixed(1)} % more Energy Regen in Team t1`);
    expect(r.todo).toBe(
      `Zhezhi has ${showHave(110.26).toFixed(1)} %; the team's wuwa_calc loop needs ${showNeed(120.04).toFixed(1)} %: about ${short.rolls} Energy Regen roll${short.rolls === 1 ? "" : "s"} (${erRoll().toFixed(1)} % each) closes it.`,
    );
    expect(r.figure).toEqual({ text: `${short.short.toFixed(1)} %`, caption: "ER short" });
    expect(r.team).toBeNull();
    expect(r.teamNote).toBe("team damage doesn't count Energy Regen");
    expect(r.link.to).toEqual({ path: "/energy", query: { team: "t1" } });
  });

  it("skip teams with a member not set up, unmeasured teams, and a composition already listed; a checked team links to /energy", () => {
    const rows = energyRows(
      [
        view("t1", ["Carlotta", "Zhezhi", "Shorekeeper"], [short]),
        view("dup", ["Shorekeeper", "Zhezhi", "Carlotta"], [short], "checked"),
        view("t2", ["Zhezhi", "Nobody", "Verina"], [short]),
        view("t3", ["Zhezhi", "Verina", "Shorekeeper"], null),
        view("c1", ["Zhezhi", "Verina", "Carlotta"], [short], "checked"),
      ],
      characters,
    );
    expect(rows.map((r) => r.id)).toEqual(["energy:t1:Zhezhi", "energy:c1:Zhezhi"]);
    expect(rows[1]!.link.to).toEqual({ path: "/energy" });
  });

  it("title a synced wuwa_calc team the way the other lists do", () => {
    const synced = { ...view("t9", ["Carlotta", "Zhezhi", "Shorekeeper"], [short]), name: "wuwa_calc Carlotta S6R5 DPS · S1R1/S6R1 team · Zhezhi + Shorekeeper" };
    expect(energyRows([synced], characters)[0]!.title).toBe(`Needs ${short.short.toFixed(1)} % more Energy Regen in Carlotta · Zhezhi + Shorekeeper`);
  });

  it("name the build the team runs and the kit floor, and point at the echoes row when its re-gear covers the need", () => {
    const kit = check("Shorekeeper", 140, 120, { buildName: "Healer", member: { setBy: "kit" } as any });
    const rows = energyRows([view("t1", ["Carlotta", "Zhezhi", "Shorekeeper"], [kit])], characters, [upgrade({ characterId: "Shorekeeper", er: { floor: 140, before: 120, after: 141.2, met: true, buys: true } })]);
    expect(rows[0]!.todo).toMatch(/^Shorekeeper's "Healer" build has 120\.0 %; the team's wuwa_calc loop keeps a kit floor of 140\.0 %/);
    expect(rows[0]!.note).toBe("The better echoes from your inventory (the Echoes row) bring Shorekeeper to 141.2 %.");
  });
});

describe("the group's order", () => {
  const rows = (): OwnRow[] =>
    ownUpgradeRows({
      echoes: [
        upgrade(),
        upgrade({ id: "Zhezhi:echoes", characterId: "Zhezhi", gain: 0.3, team: { ...upgrade().team!, gain: 0.02 } }),
        upgrade({ id: "Verina:echoes", characterId: "Verina", gain: 0.01, team: null, teamNote: "not in a team you can field" }),
      ],
      tuner: { budget: { ...EMPTY_BUDGET, tuners: 100 }, result: tunerResult([candidate("e1", 20, 50_000)]) },
      energy: [view("t1", ["Carlotta", "Zhezhi", "Shorekeeper"], [check("Zhezhi", 120, 110), check("Shorekeeper", 140, 139)])],
      characters,
    });

  it("by team gain first; the rows without one under a divider, by own gain, then the largest ER shortfall", () => {
    const out = sortOwnRows(rows(), "team");
    expect(out.map((v) => v.row.id)).toEqual(["Carlotta:echoes", "Zhezhi:echoes", "tuner:e1", "Verina:echoes", "energy:t1:Zhezhi", "energy:t1:Shorekeeper"]);
    expect(out.map((v) => v.divider)).toEqual([false, false, true, false, false, false]);
    expect(out.map((v) => v.scope)).toEqual(["team", "team", "own", "own", null, null]);
    expect(out[0]!.value).toBe(0.12);
    // below the divider the own figure is drawn, labelled own
    expect(out[2]!.value).toBeCloseTo(0.05, 6);
  });

  it("by own gain in Own DMG mode", () => {
    const out = sortOwnRows(rows(), "own");
    expect(out.map((v) => v.row.id).slice(0, 4)).toEqual(["Zhezhi:echoes", "Carlotta:echoes", "tuner:e1", "Verina:echoes"]);
    expect(out.find((v) => v.divider)!.row.id).toBe("energy:t1:Zhezhi");
  });

  it("no divider when no row has the figure the list is ranked by", () => {
    const out = sortOwnRows(tunerRows({ budget: { ...EMPTY_BUDGET }, result: null }), "team");
    expect(out.map((v) => v.divider)).toEqual([false]);
  });
});

describe("echo row headlines", () => {
  it("say the trade when there is one", () => {
    const t = (gain: number) => ({ ...upgrade().team!, gain });
    expect(echoRows([upgrade()])[0]!.title).toBe("Better echoes from your inventory");
    expect(echoRows([upgrade({ team: t(-0.12) })])[0]!.title).toBe("More own damage from echoes you own, less team damage");
    expect(echoRows([upgrade({ gain: -0.015, team: t(-0.012), er: { floor: 115.2, before: 110.8, after: 116, met: true, buys: true } })])[0]!.title).toBe("Meet the Energy Regen need with echoes you own");
    expect(echoRows([upgrade({ gain: -0.01, team: t(0.02) })])[0]!.title).toBe("More team damage from echoes you own");
  });

  it("leave the team out for a character re-geared on their own", () => {
    const row = echoRows([upgrade({ request: { members: ["Carlotta"] }, teamName: "Carlotta", team: null, teamNote: "not in a team you can field" })])[0]!;
    expect(row.todo).toMatch(/^Swap 3 of Carlotta's 5 echoes/);
    expect(row.link.to).toEqual({ path: "/build-team", query: { members: "Carlotta", only: "Carlotta" } });
  });

  it("name the team the figure is measured on (a synced wuwa_calc team by its title)", () => {
    const row = echoRows([upgrade({ teamName: "Carlotta + Shorekeeper + Zhezhi", team: { ...upgrade().team!, teamName: "wuwa_calc Carlotta S6R5 DPS · S0R1 team · Shorekeeper + Zhezhi" } })])[0]!;
    expect(row.todo).toMatch(/^For Carlotta · Shorekeeper \+ Zhezhi: /);
  });
});
