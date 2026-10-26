// Wuthering Tools+: the write half of "Sync my teams" — what decides the actions, enemy settings, name and rotation time
// that land in a saved team. `runSync` with the engine stubbed (solveBest / importInto), and `prepareTeamImport` on a
// traced run rebuilt from the fixture's recorded loops (the castMapper replay test checks the same loops cast by cast).
import { describe, expect, it, vi } from "vitest";
import loops from "./__fixtures__/wuwaCalcLoops.json";
import { ENEMY, prepareTeamImport, reslotActions, type EngineMods, type ImportResult } from "./importFromRankings";
import { runSync, type SolvedBest, type SyncDeps, type TeamLike } from "./syncTeams";
import { enemyConfigOf, type Cast } from "./castMapper";

vi.setConfig({ testTimeout: 30_000 });

/* ------------------------------------------------------------------------------------------------ runSync */

const team = (id: string, name: string, characterIds: Array<string | null>, extra: Partial<TeamLike> = {}): TeamLike => ({
  id,
  name,
  characterIds,
  actions: [],
  enemyConfig: { ...ENEMY },
  duration: null,
  ...extra,
});

const result = (partial: Partial<ImportResult>): ImportResult => ({
  teamId: "x",
  teamName: "x",
  actions: 0,
  actionList: [],
  replaced: true,
  members: [],
  memberDetails: [],
  enemyConfig: { ...ENEMY },
  enemySeen: {},
  characterRotationsSaved: [],
  characterRotationsSkipped: [],
  notPorted: [],
  statuses: [],
  duration: null,
  ...partial,
});

const rileyTeams = {
  t1: [{ name: "Aemeath" }, { name: "Mornye" }, { name: "Lynae" }],
  t2: [{ name: "Lynae" }, { name: "Aemeath" }, { name: "Mornye" }], // another loadout variant of the same three
  t3: [{ name: "Chisa" }, { name: "Denia" }, { name: "Aemeath" }],
  t4: [{ name: "Cartethyia" }, { name: "Ciaccona" }, { name: "Chisa" }],
  t5: [{ name: "Shorekeeper" }, { name: "Iuno" }, { name: "Augusta" }],
};

describe("runSync", () => {
  it("re-imports each wuwa_calc team from its best variant and reports exactly what moved", async () => {
    const updated = team("a", "wuwa_calc Aemeath S6R5 · Mornye + Lynae", ["Aemeath", "Mornye", "Lynae"], {
      actions: [
        { slot: 0, key: "Finale", count: 2 },
        { slot: 1, key: "Particle", count: 1 },
      ],
      duration: 25,
    });
    const sameThree = team("g", "Lynae + Aemeath + Mornye · S6R5 (wuwa_calc t2)", ["Lynae", "Aemeath", "Mornye"], {
      actions: [{ slot: 1, key: "Finale", count: 3 }],
      duration: "24.5",
    });
    const mine = team("b", "My Aemeath team", ["Aemeath", "Mornye", "Lynae"]);
    const unknown = team("d", "wuwa_calc Zani S6R1 · Phoebe + Shorekeeper", ["Zani", "Phoebe", "Shorekeeper"]);
    const noBuild = team("e", "wuwa_calc Cartethyia S0R1 · Ciaccona + Chisa", ["Cartethyia", "Ciaccona", "Chisa"]);
    const broken = team("f", "Shorekeeper + Iuno + Augusta · S6R5 (wuwa_calc t413)", ["Shorekeeper", "Iuno", "Augusta"]);

    const solveBest = vi.fn(async (keys: string[]) => {
      const out = new Map<string, SolvedBest | null>([
        ["t1", { total: 100, ref: "row-t1" }],
        ["t2", { total: 120, ref: "row-t2" }],
        ["t3", { total: 90, ref: "row-t3" }],
        ["t4", null],
        ["t5", { total: 80, ref: "row-t5" }],
      ]);
      return new Map(keys.map((k) => [k, out.get(k) ?? null]));
    });
    const importInto = vi.fn<SyncDeps["importInto"]>(async (t) => {
      if (t.id === "f") throw new Error("Iuno is not set up");
      if (t.id === "g") {
        // nothing moved: same actions (merged differently), same enemy, same rotation time
        return result({ teamName: "Lynae + Aemeath + Mornye · S6R5 (wuwa_calc t2)", actionList: [{ slot: 1, key: "Finale", count: 3 }], duration: 24.5 });
      }
      return result({
        teamName: "wuwa_calc Aemeath S6R1 · Mornye + Lynae",
        actionList: [
          { slot: 0, key: "Finale", count: 3 },
          { slot: 2, key: "Spectral", count: 1 },
        ],
        enemyConfig: { ...ENEMY, havocBaneStacks: 6 },
        enemySeen: { havocBaneStacks: 6 },
        duration: 24.75,
        memberDetails: [
          { name: "Mornye", key: "Mornye", slot: 1, sequence: 0, refinement: 1, weapon: "W", loopChangesAt: [], nextLoopChange: null },
          { name: "Aemeath", key: "Aemeath", slot: 0, sequence: 1, refinement: 1, weapon: "W", loopChangesAt: [2], nextLoopChange: 2 },
          { name: "Lynae", key: "Lynae", slot: 2, sequence: 6, refinement: 1, weapon: "W", loopChangesAt: [], nextLoopChange: null },
        ],
      });
    });

    const report = await runSync({ teams: [updated, mine, sameThree, unknown, noBuild, broken], rileyTeams, solveBest, importInto } as SyncDeps);

    // one solve for every composition, each key once
    expect(solveBest).toHaveBeenCalledTimes(1);
    expect(solveBest.mock.calls[0][0].slice().sort()).toEqual(["t1", "t2", "t4", "t5"]);
    // the best variant (t2, 120 > 100) is what gets imported, its ref passed through untouched
    expect(importInto.mock.calls[0][0]).toBe(updated);
    expect(importInto.mock.calls[0][1]).toMatchObject({ key: "t2", total: 120, ref: "row-t2" });
    expect(importInto).toHaveBeenCalledTimes(3); // a, g, f — never a skipped or unsolvable team

    const byId = Object.fromEntries(report.teams.map((t) => [t.id, t]));
    expect(byId.a).toMatchObject({
      status: "updated",
      rileyKey: "t2",
      total: 120,
      newName: "wuwa_calc Aemeath S6R1 · Mornye + Lynae",
      enemy: { havocBaneStacks: 6 },
      durationDelta: { from: 25, to: 24.75 },
    });
    expect(byId.a.deltas).toEqual([
      { slot: 0, characterId: "Aemeath", key: "Finale", mainEcho: null, stacks: null, from: 2, to: 3 },
      { slot: 1, characterId: "Mornye", key: "Particle", mainEcho: null, stacks: null, from: 1, to: 0 },
      { slot: 2, characterId: "Lynae", key: "Spectral", mainEcho: null, stacks: null, from: 0, to: 1 },
    ]);
    expect(byId.a.enemyDeltas).toEqual([{ key: "havocBaneStacks", label: "Havoc Bane", from: 0, to: 6 }]);
    expect(byId.a.members).toEqual([
      { name: "Aemeath", sequence: 1, nextLoopChange: 2 },
      { name: "Mornye", sequence: 0, nextLoopChange: null },
      { name: "Lynae", sequence: 6, nextLoopChange: null },
    ]);

    expect(byId.g).toMatchObject({ status: "unchanged", rileyKey: "t2", deltas: [], enemyDeltas: [], durationDelta: null, newName: null });
    expect(byId.b).toMatchObject({ status: "skipped", reason: "your own team — only wuwa_calc imports and presets are synced" });
    expect(byId.d).toMatchObject({ status: "skipped", reason: "wuwa_calc has no team with these three" });
    expect(byId.e).toMatchObject({ status: "failed", reason: "no build at your state (a member's rotation needs a higher sequence)", rileyKey: null });
    expect(byId.f).toMatchObject({ status: "failed", reason: "Iuno is not set up", rileyKey: "t5", total: 80 });
    expect(report).toMatchObject({ cost: "mine", updated: 1, unchanged: 1, skipped: 2, failed: 2 });
    expect(report.teams).toHaveLength(6);
  });

  it("solves nothing when no saved team came from wuwa_calc", async () => {
    const solveBest = vi.fn();
    const importInto = vi.fn();
    const report = await runSync({ teams: [team("b", "Mine", ["Aemeath", "Mornye", "Lynae"])], rileyTeams, solveBest, importInto });
    expect(solveBest).not.toHaveBeenCalled();
    expect(importInto).not.toHaveBeenCalled();
    expect(report).toMatchObject({ updated: 0, unchanged: 0, skipped: 1, failed: 0 });
  });
});

/* ------------------------------------------------------------------------------------- prepareTeamImport */

type Loop = (typeof loops)[number];
const loopOf = (resonator: string, nth = 0): Loop => loops.filter((l) => l.resonator === resonator)[nth];

/** The engine's enum tables, rebuilt from the names the fixture recorded. */
const names = [...new Set(loops.flatMap((l) => l.casts.flatMap((c: any) => [c.cast, c.node])).filter(Boolean))] as string[];
const NAME_ID = Object.fromEntries(names.map((n, i) => [n, i]));
const ID_NAME = Object.fromEntries(names.map((n, i) => [i, n]));
const MV_UNIT = 100;
const HELD_NAME: Record<string, string> = { havocBane: "Havoc Bane", strain: "Tune Strain - Interfered", aeroErosion: "Aero Erosion", electroFlare: "Electro Flare", glacioChafe: "Glacio Chafe", spectroFrazzle: "Spectro Frazzle", fusionBurst: "Fusion Burst", electroRage: "Electro Rage" };

/** A recorded loop as the traced hits Riley's engine returns: one hit per tick (a recorded count unfolds), the cast and
 *  node as enum numbers, motion values in hundredths of a percent, the enemy debuffs as his held roster names. */
function hitsFor(member: string, loop: Loop, slot = member): any[] {
  return loop.casts.flatMap((c: any) =>
    Array.from({ length: c.count || 1 }, () => ({
      member,
      slot,
      action: { name: c.name, mv: Math.round((c.mv ?? 0) * MV_UNIT), cast: c.cast ? NAME_ID[c.cast] : undefined, node: c.node ? NAME_ID[c.node] : undefined, cancelOf: null },
      mv: Math.round((c.mv ?? 0) * MV_UNIT),
      queued: Boolean(c.queued),
      triggered: false,
      source: c.by ? { name: c.by } : null,
      heldEnemy: Object.entries(c.held ?? {}).map(([k, v]) => ({ name: `${HELD_NAME[k]} x${v}`, source: "", left: 0 })),
    })),
  );
}

const mods: EngineMods = {
  teamrun: { hitsOf: (line: any) => [line] },
  solver: { echoLabel: () => "5pc" },
  stats: { CAST_NAME: ID_NAME, NODE_NAME: ID_NAME, MV_UNIT },
};

/** loops at the given sequence change at the given levels (Riley's `rotationAt`) */
const loadout = (changesAt: number[]) => {
  const at = (n: number) => ({ intro: { body: [{ name: `loop${changesAt.filter((c) => n >= c).length}` }] } });
  const cache = new Map<number, unknown>();
  return { rotationAt: (n: number) => (cache.has(n) ? cache.get(n) : cache.set(n, at(n)).get(n)) };
};

/** Cartethyia (main DPS) + Chisa + Shorekeeper: a warm-up section, then the loop, each member's block in turn */
function traced(final: { carte: Loop; chisa: Loop; sk: Loop }, extraHits: any[] = []) {
  const warmup = [...hitsFor("Cartethyia", loopOf("Cartethyia", 1)), ...hitsFor("Chisa", loopOf("Chisa", 1)), ...hitsFor("Shorekeeper", loopOf("Shorekeeper", 1))];
  const loop = [...hitsFor("Cartethyia", final.carte), ...hitsFor("Chisa", final.chisa), ...extraHits, ...hitsFor("Shorekeeper", final.sk)];
  return {
    // Riley's member order is not the slot order: the main DPS goes to slot 0
    members: [
      { name: "Chisa", mainDps: false, loadout: loadout([2]) },
      { name: "Cartethyia", mainDps: true, loadout: loadout([]) },
      { name: "Shorekeeper", mainDps: false, loadout: loadout([]) },
    ],
    combo: [
      { sequence: 0, weapon: { refinement: 1, name: "Kumokiri" }, echo: {}, mainstat: { name: "CD CD" } },
      { sequence: 6, weapon: { refinement: 1, name: "Defier's Thorn" }, echo: {}, mainstat: { name: "CR HP" } },
      { sequence: 0, weapon: { refinement: 1, name: "Stellar Symphony" }, echo: {}, mainstat: { name: "HB ER" } },
    ],
    rotationLines: [warmup, loop],
    sectionSeconds: [26.4, 25.083333],
    total: 1_234_567,
  };
}

const tuple = (a: any) => [a.key, a.type, a.count, a.mainEcho ?? null, a.negativeStatusStacks ?? null];
/** per (slot, key, type, main echo, stacks) how many casts — the merge order aside, what a team rotation presses */
const tally = (actions: any[]) => {
  const out: Record<string, number> = {};
  for (const a of actions) {
    const k = JSON.stringify([a.slot ?? 0, a.key, a.type, a.mainEcho ?? null, a.negativeStatusStacks ?? null]);
    out[k] = (out[k] ?? 0) + a.count;
  }
  return out;
};

describe("prepareTeamImport on a traced run", () => {
  const final = { carte: loopOf("Cartethyia"), chisa: loopOf("Chisa"), sk: loopOf("Shorekeeper") };

  it("maps the last section into slot-ordered team actions that match the per-member mapping", async () => {
    const prepared = await prepareTeamImport(mods, traced(final));
    expect(prepared.keys).toEqual(["Cartethyia", "Chisa", "Shorekeeper"]);
    expect(prepared.actions.map((a) => a.order)).toEqual(prepared.actions.map((_, i) => i + 1));
    // the slots interleave as the engine ran them: Cartethyia's block, then Chisa's, then Shorekeeper's
    const firstOf = (slot: number) => prepared.actions.findIndex((a) => a.slot === slot);
    expect(firstOf(0)).toBe(0);
    expect(firstOf(0) < firstOf(1) && firstOf(1) < firstOf(2)).toBe(true);
    // no two neighbouring rows are the same action: those merge into one with the counts summed
    for (let i = 1; i < prepared.actions.length; i++) {
      const [a, b] = [prepared.actions[i - 1], prepared.actions[i]];
      expect(a.slot === b.slot && a.key === b.key && (a.negativeStatusStacks ?? null) === (b.negativeStatusStacks ?? null) && (a.mainEcho ?? null) === (b.mainEcho ?? null)).toBe(false);
    }
    // every member's rows add up to what the cast mapper makes of that loop (fixture `expected`, Python-verified)
    const expected = [final.carte, final.chisa, final.sk].flatMap((loop, slot) => loop.expected.map((e: any[]) => ({ slot, key: e[0], type: e[1], count: e[2], mainEcho: e[3], negativeStatusStacks: e[4] })));
    expect(tally(prepared.actions)).toEqual(tally(expected));
    // and each member's own loop, saved as a character rotation, is that mapping row for row
    expect(prepared.rotations.map((r) => r.key)).toEqual(["Chisa", "Cartethyia", "Shorekeeper"]);
    expect(prepared.rotations[1].actions.map(tuple)).toEqual(final.carte.expected.map((e: any[]) => e.slice(0, 5)));
    expect(prepared.rotations[0].actions.map(tuple)).toEqual(final.chisa.expected.map((e: any[]) => e.slice(0, 5)));
    expect(prepared.rotations[2].actions.map(tuple)).toEqual(final.sk.expected.map((e: any[]) => e.slice(0, 5)));
    expect(prepared.notPorted).toEqual([]);
    // the loop's status ticks, each name once in the order they ran (only Cartethyia lays one here: Aero Erosion,
    // mostly at 9 stacks) — read off the fixture, which is regenerated whenever Riley's engine moves
    const ticks = [final.carte, final.chisa, final.sk].flatMap((loop) => (loop.casts as any[]).filter((c) => c.type === "Status").map((c) => c.name));
    expect(prepared.statuses).toEqual([...new Set(ticks)]);
    expect(prepared.statuses).toContain("Aero Erosion - 9 Stacks");
  });

  it("reads the enemy settings, the Outro handoffs and the rotation time off the loop", async () => {
    const prepared = await prepareTeamImport(mods, traced(final));
    const casts = (loop: Loop) => loop.casts as unknown as Cast[];
    expect(prepared.enemyConfig).toEqual({ ...ENEMY, ...enemyConfigOf([...casts(final.carte), ...casts(final.chisa), ...casts(final.sk)]) });
    // Cartethyia's Aero Erosion ticks at 9 stacks; Havoc Bane 6 is held on most of the loop's damage casts
    expect(prepared.enemySeen).toEqual({ aeroErosionStacks: 9, havocBaneStacks: 6 });
    expect(prepared.enemyConfig).toMatchObject({ enemyLevel: 100, enemyResist: 0.2 });
    // each Outro hands off to the next member who acts on their own (queued/triggered hits don't count), cyclically
    expect(prepared.handoffs).toEqual({ Cartethyia: ["Chisa"], Chisa: ["Shorekeeper"], Shorekeeper: ["Cartethyia"] });
    expect(prepared.duration).toBe(25.08);
    expect(prepared.rotations.every((r) => r.duration === 25.08)).toBe(true);
  });

  it("names the team by investment and records each member's next loop change", async () => {
    const prepared = await prepareTeamImport(mods, traced(final));
    expect(prepared.teamName).toBe("wuwa_calc Cartethyia S6R1 DPS · S0R1 team · Chisa + Shorekeeper");
    expect(prepared.total).toBe(1_234_567);
    // Riley's team total is DPS since his 7bcbb24 (it was "adjusted DPR", DPS × 26)
    expect(prepared.description).toContain("1,234,567 team DPS");
    const chisa = prepared.members.find((m) => m.key === "Chisa")!;
    expect(chisa).toMatchObject({ slot: 1, sequence: 0, refinement: 1, weapon: "Kumokiri", loopChangesAt: [2], nextLoopChange: 2 });
    expect(prepared.members.find((m) => m.key === "Cartethyia")).toMatchObject({ slot: 0, sequence: 6, loopChangesAt: [], nextLoopChange: null });
  });

  it("leaves out hits calculated on another member's slot", async () => {
    const plain = await prepareTeamImport(mods, traced(final));
    // a Shorekeeper hit evaluated as Chisa's (slot ≠ member): not one of Shorekeeper's presses
    const stray = hitsFor("Shorekeeper", { ...final.sk, casts: final.sk.casts.slice(0, 1) } as Loop, "Chisa");
    const withStray = await prepareTeamImport(mods, traced(final, stray));
    expect(withStray.actions).toEqual(plain.actions);
    expect(withStray.handoffs).toEqual(plain.handoffs);
  });

  it("refuses a team with a character the app has not released", async () => {
    // a name no registry will ever list, so this keeps testing the guard after Ryan releases whoever is hidden today
    const run = traced(final);
    run.members[2] = { name: "Hidden Resonator", mainDps: false, loadout: loadout([]) };
    await expect(prepareTeamImport(mods, run)).rejects.toThrow("Hidden Resonator is not released in this app yet");
  });

  it("re-points the actions at the slots an existing team holds the three in, and refuses other characters", async () => {
    const prepared = await prepareTeamImport(mods, traced(final));
    const reslotted = reslotActions(prepared, ["Shorekeeper", "Cartethyia", "Chisa"])!;
    expect(reslotted).toHaveLength(prepared.actions.length);
    const map = [1, 2, 0]; // prepared slot → existing slot
    reslotted.forEach((a, i) => expect(a).toEqual({ ...prepared.actions[i], slot: map[prepared.actions[i].slot] }));
    expect(reslotActions(prepared, ["Shorekeeper", "Cartethyia", "Ciaccona"])).toBeNull();
  });
});
