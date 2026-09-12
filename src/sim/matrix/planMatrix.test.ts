// Wuthering Tools+: the Endstate Matrix planner's decisions, on engine scores recorded from Riley's
// engine for real compositions (wuwa-tools/matrix-plan; the Python twin produced David's plan).
import { describe, expect, it } from "vitest";
import scores from "./__fixtures__/engineScores.json";
import {
  PHASE,
  bestPlan,
  circuitFor,
  compositionsFor,
  elementOf,
  finishCandidate,
  rileyNameOf,
  rosterFrom,
  roundLabels,
  statesFor,
  vigorLeft,
  vigorOf,
  type Candidate,
  type EngineScore,
  type RosterEntry,
  type SolveState,
} from "./planMatrix";

const SCORES = scores as unknown as EngineScore[];
const roster: RosterEntry[] = [
  { name: "Aemeath", sequence: 6, refinement: 5, weapon: "EverbrightPolestar", fromData: true },
  { name: "Camellya", sequence: 6, refinement: 2, weapon: "RedSpring", fromData: true },
  { name: "Carlotta", sequence: 6, refinement: 1, weapon: "TheLastDance", fromData: true },
  { name: "Cartethyia", sequence: 6, refinement: 5, weapon: "DefiersThorn", fromData: true },
  { name: "Galbrena", sequence: 6, refinement: 5, weapon: "LuxUmbra", fromData: true },
  { name: "Phrolova", sequence: 6, refinement: 1, weapon: "LetheanElegy", fromData: true },
  { name: "Sigrika", sequence: 6, refinement: 1, weapon: "SolswornCiphers", fromData: true },
  { name: "Xuanling", sequence: 6, refinement: 3, weapon: "AzureOath", fromData: true },
  ...["Mornye", "Qiuyuan", "Cantarella", "Iuno", "Augusta", "Aero Rover", "Sanhua", "Mortefi"].map((name) => ({ name, sequence: 0, refinement: 1, weapon: null, fromData: false })),
];
const byComp = (dps: string, a: string, b: string): Partial<Record<SolveState, EngineScore>> => {
  const out: Partial<Record<SolveState, EngineScore>> = {};
  for (const s of SCORES) if (s.dps === dps && new Set(s.mates).has(a) && new Set(s.mates).has(b)) out[s.state] = s;
  return out;
};

describe("endstate matrix: phase data and names", () => {
  it("carries the 3.6 phase with five bosses, four circuits and the healers' two Vigor", () => {
    expect(PHASE.version).toBe("3.6");
    expect(PHASE.bosses.map((b) => b.resists)).toEqual(["Spectro", "Fusion", "Glacio", "Electro", null]);
    expect(PHASE.circuits.map((c) => c.id)).toEqual(["general", "negstatus", "echo", "tunebreak"]);
    expect(vigorOf("Mornye")).toBe(2);
    expect(vigorOf("Aemeath")).toBe(1);
    expect(vigorOf("Denia")).toBe(2); // this phase's emergency agent: 1 + 1
  });

  it("maps app keys to Riley's names and knows elements", () => {
    expect(rileyNameOf("YangyangXuanling")).toBe("Xuanling");
    expect(rileyNameOf("RoverAeroFemale")).toBe("Aero Rover");
    expect(rileyNameOf("RoverAeroMale")).toBe("Aero Rover");
    expect(rileyNameOf("Aemeath")).toBe("Aemeath");
    expect(elementOf("Xuanling")).toBe("Havoc");
    expect(elementOf("Aero Rover")).toBe("Aero");
    expect(elementOf("Nobody")).toBeNull();
  });

  it("reads the roster off the character store and adds ticked extras", () => {
    const r = rosterFrom(
      {
        YangyangXuanling: { weapon: "AzureOath", weapons: { AzureOath: { refinement: "3" } }, resonanceChains: { SequenceNode6X: { isEnabled: true }, SequenceNode2Y: { isEnabled: true } } },
        Mornye: { weapon: null, resonanceChains: {} },
      },
      ["Aero Rover", "Mornye"],
    );
    expect(r).toEqual([
      { name: "Aero Rover", sequence: 0, refinement: 1, weapon: null, fromData: false },
      { name: "Mornye", sequence: 0, refinement: 0, weapon: null, fromData: true },
      { name: "Xuanling", sequence: 6, refinement: 3, weapon: "AzureOath", fromData: true },
    ]);
  });
});

describe("endstate matrix: compositions and states", () => {
  it("pairs each qualifying DPS with two others: one Rover form, at most one DPS as a support", () => {
    const comps = compositionsFor(roster, 6);
    expect(comps.every((c) => c.dps !== c.mates[0] && c.dps !== c.mates[1])).toBe(true);
    const dpsNames = new Set(roster.filter((r) => r.sequence >= 6).map((r) => r.name));
    expect(comps.some((c) => dpsNames.has(c.mates[0]) && dpsNames.has(c.mates[1]))).toBe(false);
    expect(comps.some((c) => c.dps === "Aemeath" && c.mates.includes("Sigrika"))).toBe(true);
    expect(new Set(comps.map((c) => c.dps)).size).toBe(8);
    expect(compositionsFor(roster, 7)).toEqual([]);
  });

  it("runs R1, R5 or both depending on the weapon rank", () => {
    expect(statesFor(1)).toEqual(["s6r1mdps"]);
    expect(statesFor(5)).toEqual(["s6r5mdps"]);
    expect(statesFor(3)).toEqual(["s6r1mdps", "s6r5mdps"]);
    expect(statesFor(5, 2)).toEqual(["s2r1mdps"]);
    expect(statesFor(1, 5)).toEqual(["s3r1mdps"]);
  });
});

describe("endstate matrix: scoring", () => {
  it("interpolates between R1 and R5 for a weapon in between and applies the circuit and Matrix buff", () => {
    const x = finishCandidate(byComp("Xuanling", "Mornye", "Iuno"), roster)!;
    const r1 = byComp("Xuanling", "Mornye", "Iuno").s6r1mdps!.total, r5 = byComp("Xuanling", "Mornye", "Iuno").s6r5mdps!.total;
    expect(x.base).toBe(Math.round(r1 + (r5 - r1) * 0.5));
    expect(x.state).toBe("s6r5mdps");
    expect(x.matrix).toBe(1); // no Matrix kit
    expect(Math.abs(x.score - x.base * x.circuitMult)).toBeLessThan(2000); // rounding of the parts
    const camellya = finishCandidate(byComp("Camellya", "Mornye", "Sanhua"), roster)!;
    expect(camellya.matrix).toBeGreaterThan(1); // Camellya carries a Matrix
    expect(camellya.refinement).toBe(2);
    const carlotta = finishCandidate(byComp("Carlotta", "Qiuyuan", "Sigrika"), roster)!;
    expect(carlotta.avoid).toEqual(["Sentry Construct"]); // Glacio DPS vs the Glacio-resistant boss
    expect(carlotta.order[2]).toBe("Carlotta"); // the engine's play order, DPS last
  });

  it("picks the circuit from the damage mix: statuses count, heavy-attack teams take General, echo kits take Echo Skill", () => {
    const cart = finishCandidate(byComp("Cartethyia", "Aero Rover", "Augusta"), roster)!;
    expect(cart.circuits.negstatus).toBeGreaterThan(1); // her team keeps Aero Erosion up
    const argmax = (all: Record<string, number>): string => Object.keys(all).reduce((b, k) => (all[k] > all[b] ? k : b));
    expect(cart.circuit).toBe(argmax(cart.circuits));
    const phrolova = finishCandidate(byComp("Phrolova", "Galbrena", "Cantarella"), roster)!;
    expect(phrolova.circuit).toBe("echo"); // her hits are Echo Skill DMG
    const xuanling = finishCandidate(byComp("Xuanling", "Mornye", "Iuno"), roster)!;
    expect(xuanling.circuit).toBe("general"); // heavy-attack kit: the unconditional +20 % (+20 % heavy) wins
    const est = circuitFor([{ member: "X", name: "Echo - Something", avg: 100, cast: "Echo", type: "Echo", element: "Havoc" }], ["X"]);
    expect(est.id).toBe("echo");
    expect(est.all.echo).toBeCloseTo(1.5, 5);
  });

  it("fields the largest set of teams under Vigor, then the highest total, weakest first", () => {
    const cands = [
      byComp("Aemeath", "Mornye", "Lynae"), byComp("Sigrika", "Mornye", "Qiuyuan"), byComp("Cartethyia", "Aero Rover", "Augusta"),
      byComp("Phrolova", "Galbrena", "Cantarella"), byComp("Carlotta", "Qiuyuan", "Sigrika"), byComp("Xuanling", "Mornye", "Iuno"),
      byComp("Camellya", "Mornye", "Sanhua"), byComp("Galbrena", "Mornye", "Qiuyuan"), byComp("Xuanling", "Mornye", "Mortefi"),
    ].map((s) => finishCandidate(s, roster)).filter((c): c is Candidate => c !== null);
    const plan = bestPlan(cands, 1_000_000);
    expect(plan.count).toBeGreaterThanOrEqual(4);
    // no Resonator beyond their Vigor, Rover once
    const left = vigorLeft(plan.teams, roster);
    expect([...left.values()].every((v) => v >= 0)).toBe(true);
    expect(plan.teams.map((t) => t.score)).toEqual([...plan.teams.map((t) => t.score)].sort((a, b) => a - b));
    expect(plan.total).toBe(plan.teams.reduce((s, t) => s + t.score, 0));
    // Mornye can fight twice, nobody else can
    const uses = new Map<string, number>();
    for (const t of plan.teams) for (const m of t.team) uses.set(m, (uses.get(m) ?? 0) + 1);
    for (const [name, n] of uses) expect(n, name).toBeLessThanOrEqual(vigorOf(name));
    expect(roundLabels(5)).toEqual(["Round 1", "Round 1", "Round 2", "Round 2", "Round 3+"]);
    // a pinned team stays and the rest is filled around it
    const camellya = cands.find((c) => c.dps === "Camellya")!;
    const pinnedPlan = bestPlan(cands, 1_000_000, PHASE, [camellya]);
    expect(pinnedPlan.teams.some((t) => t.dps === "Camellya")).toBe(true);
    expect(pinnedPlan.count).toBe(pinnedPlan.teams.length);
  });
});
