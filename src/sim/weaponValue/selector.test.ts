// @vitest-environment node
// Wuthering Tools+: /weapons' resonator selector — the ranking logic over a stubbed wuwa_calc (deterministic DPS, every
// solve recorded), then the one rule that needs his real engine: an unowned candidate runs a standard weapon under
// `mine`, never the signature `accountWeapon` would hand a resonator with no weapon. No player's data: the synthetic
// account of src/sim/engine/__fixtures__/syntheticAccount.ts.
import { beforeAll, describe, expect, it } from "vitest";
import { rileyAccountOf } from "../engine/rileyAccount";
import { rileyHeadless, type HeadlessRiley } from "../engine/rileyNode";
import { solveMine, type MineSolve, type RileyAccount, type RileyTeamInfo } from "../engine/rileyRun";
import { SYNTHETIC_ACCOUNT } from "../engine/__fixtures__/syntheticAccount";
import { rileyNameOf } from "../rankings/rileyNames";
import { STANDARD_PICK, candidateAccount, rankResonatorPool, type SelectorRiley } from "./selector";

const member = (appKey: string, mainDps = false) => ({ name: rileyNameOf(appKey), appKey, mainDps });
const TEAMS: RileyTeamInfo[] = [
  { key: "tA", members: [member("Zani", true), member("Phoebe"), member("Shorekeeper")] }, // needs Phoebe
  { key: "tB", members: [member("Zani", true), member("Shorekeeper"), member("Mortefi")] }, // fieldable today (Mortefi: a 4★)
  { key: "tC", members: [member("Phoebe", true), member("Lily"), member("Shorekeeper")] }, // Lily: not released here
  { key: "tD", members: [member("Jinhsi", true), member("Shorekeeper"), member("Verina")] }, // Jinhsi not owned
  { key: "tE", members: [member("Phoebe", true), member("Mortefi"), member("Shorekeeper")] }, // a new main DPS
];
const DPS: Record<string, number> = { tA: 120_000, tB: 100_000, tC: 999_999, tD: 90_000, tE: 80_000 };

const characters: Record<string, any> = {
  Zani: { weapon: "BlazingJustice", resonanceChains: { SequenceNode1Wildfire: { isEnabled: true } } },
  Shorekeeper: { weapon: "Variation", weapons: { Variation: { refinement: "5" } }, resonanceChains: {} },
  Verina: { weapon: "Variation", resonanceChains: Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`SequenceNode${n}X`, { isEnabled: true }])) },
};

function stub(account: RileyAccount): { riley: SelectorRiley; calls: Array<{ keys: string[]; account: RileyAccount }> } {
  const calls: Array<{ keys: string[]; account: RileyAccount }> = [];
  const owns = (m: { name: string; appKey: string }, acc: RileyAccount): boolean => !!acc.entries[m.name]?.owned || m.appKey === "Mortefi";
  return {
    calls,
    riley: {
      commit: "stub",
      account,
      teams: TEAMS,
      blocked: ["Lily"],
      async solve(keys, acc) {
        calls.push({ keys, account: acc });
        return keys.map((teamKey): MineSolve => {
          const t = TEAMS.find((x) => x.key === teamKey)!;
          const bonus = (acc.entries[rileyNameOf("Shorekeeper")]?.sequence ?? 0) * 1_000;
          return {
            teamKey,
            names: t.members.map((m) => m.name),
            appKeys: t.members.map((m) => m.appKey),
            status: "ok",
            fieldable: t.members.every((m) => owns(m, acc)),
            best: {
              rowKey: teamKey,
              picks: [],
              total: DPS[teamKey]! + bonus,
              bySlot: {},
              seconds: 100,
              members: t.members.map((m) => ({ ...m, owned: owns(m, acc), sequence: acc.entries[m.name]?.sequence ?? 0, weapon: "Cosmic Ripples", refinement: 1, weaponApproximated: true }) as any),
            },
          };
        });
      },
    },
  };
}

describe("resonator selector (stubbed engine)", () => {
  const base = rileyAccountOf(characters, {}, []);

  it("registers an unowned pick at S0 on the standard stand-in and an owned one a sequence up", () => {
    const fresh = candidateAccount(base, "Phoebe")!;
    expect(fresh.kind).toBe("new");
    expect(fresh.account.entries[rileyNameOf("Phoebe")]).toEqual({ owned: true, sequence: 0, weapon: STANDARD_PICK, refine: 1 });
    expect(fresh.account.key).not.toBe(base.key);
    const dupe = candidateAccount(base, "Shorekeeper")!;
    expect(dupe.kind).toBe("dupe");
    expect(dupe.account.entries[rileyNameOf("Shorekeeper")]).toMatchObject({ owned: true, sequence: 1, weapon: "Variation", refine: 5 });
    expect(candidateAccount(base, "Verina")).toBeNull(); // S6
    expect(candidateAccount(base, "Mortefi")).toBeNull(); // a 4★: wuwa_calc runs everyone's at S6
  });

  it("ranks by the best team uplift, then new teams, and never solves an unreleased member", async () => {
    const { riley, calls } = stub(base);
    const rows = await rankResonatorPool({ items: ["Lily", "Encore", "Shorekeeper", "Phoebe", "Verina"], characters, echoes: [], teams: [], ranking: null }, riley, { yieldToUi: false });
    expect(rows.map((r) => `${r.key}:${r.status}`)).toEqual(["Phoebe:new", "Shorekeeper:owned", "Encore:no-teams", "Lily:not-in-app", "Verina:maxed"]);
    // Lily: never registered, never in a solved team
    for (const c of calls) {
      expect(c.keys).not.toContain("tC");
      expect(Object.keys(c.account.entries)).not.toContain(rileyNameOf("Lily"));
    }
    const phoebe = rows[0]!;
    // Zani's best team today is tB (100k); with Phoebe tA reaches 120k → +20 %
    expect(phoebe.uplift).toMatchObject({ mainDps: "Zani", with: { teamKey: "tA", dps: 120_000 }, base: { teamKey: "tB", dps: 100_000 } });
    expect(phoebe.uplift!.gain).toBeCloseTo(0.2, 10);
    expect(phoebe.newTeams).toMatchObject({ count: 2, best: { teamKey: "tA" } }); // tA and tE (Phoebe as main DPS)
    expect(phoebe.ran).toEqual({ weapon: "Cosmic Ripples", refinement: 1, sequence: 0, approximated: true });
    // the base batch ran once, at the account as it is; Phoebe's at her own hypothetical account
    expect(calls[0]!.account.key).toBe(base.key);
    expect(calls.filter((c) => c.account.key === base.key)).toHaveLength(1);
    const phoebeCall = calls.find((c) => c.account.entries[rileyNameOf("Phoebe")]?.owned)!;
    expect(phoebeCall.keys.sort()).toEqual(["tA", "tE"]);
    // Shorekeeper at S1 lifts tB by 1k (+1 %), the owned candidate's teams only (tD's Jinhsi is not owned)
    const sk = rows[1]!;
    expect(sk.uplift!.gain).toBeCloseTo(0.01, 10);
    expect(sk.newTeams).toBeNull();
    expect(calls.find((c) => c.account.entries[rileyNameOf("Shorekeeper")]?.sequence === 1)!.keys).toEqual(["tB"]);
  });

  it("orders the same pool the same way whatever order it is given in", async () => {
    const a = await rankResonatorPool({ items: ["Phoebe", "Shorekeeper", "Encore"], characters, echoes: [], teams: [], ranking: null }, stub(base).riley, { yieldToUi: false });
    const b = await rankResonatorPool({ items: ["Encore", "Shorekeeper", "Phoebe"], characters, echoes: [], teams: [], ranking: null }, stub(base).riley, { yieldToUi: false });
    expect(a.map((r) => r.key)).toEqual(b.map((r) => r.key));
  });

  it("stops between candidates when cancelled", async () => {
    const { riley, calls } = stub(base);
    const rows = await rankResonatorPool({ items: ["Phoebe", "Shorekeeper"], characters, echoes: [], teams: [], ranking: null }, riley, { yieldToUi: false, signal: { cancelled: true } });
    expect(calls).toEqual([]);
    expect(rows.every((r) => !r.uplift && !r.newTeams)).toBe(true);
  });
});

describe("resonator selector (wuwa_calc's engine)", () => {
  let h: HeadlessRiley;
  beforeAll(async () => {
    h = await rileyHeadless(SYNTHETIC_ACCOUNT);
  }, 60_000);

  it("runs an unowned pick on a standard weapon, not the signature `mine` would hand them", () => {
    const name = rileyNameOf("Phoebe");
    expect(SYNTHETIC_ACCOUNT.entries[name]).toBeUndefined();
    const key = h.teams.find((t) => t.members.some((m) => m.name === name) && !t.members.some((m) => h.blocked.includes(m.appKey)))!.key;
    const plan = candidateAccount(SYNTHETIC_ACCOUNT, "Phoebe")!;
    const [run] = solveMine(h.engine, [key], { account: plan.account, blocked: h.blocked });
    expect(run!.status).toBe("ok");
    const me = run!.best!.members.find((m) => m.name === name)!;
    expect(me.owned).toBe(true);
    expect(me.sequence).toBe(0);
    expect(me.pick.weapon).not.toBe(0); // index 0 is the loadout's signature (Riley lists it first)
    expect(me.weaponApproximated).toBe(true);
    expect(me.weapon).not.toMatch(/Luminous Hymn/);
    // the same team without the registration: `mine` hands a resonator the account lacks the signature at R1
    const [plain] = solveMine(h.engine, [key], { account: SYNTHETIC_ACCOUNT, blocked: h.blocked });
    const was = plain!.best!.members.find((m) => m.name === name)!;
    expect(was.pick.weapon).toBe(0);
    expect(was.owned).toBe(false);
  }, 60_000);
});
