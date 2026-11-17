// Wuthering Tools+ numbers log — a small synthetic account and ranking for the tests (no real export in a commit).
import type { CharacterRank, RosterRanking, TeamRank } from "../myRankings/rankRoster";
import type { RankedAccount } from "./log";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const T0 = Date.UTC(2026, 10, 9, 18, 20, 0); // 9 Nov 2026 18:20 UTC
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

/** Three armed characters, the echoes they wear and one saved team. A fresh copy each call. */
export function account(): RankedAccount & { characters: Record<string, any>; echoes: any[]; teams: any[] } {
  return {
    characters: {
      Aaa: {
        weapon: "SwordOne",
        weapons: { SwordOne: { refinement: "1", weaponLevel: "90" }, SwordTwo: { refinement: "1" } },
        weaponPassives: { SwordOnePassive: { isEnabled: true } },
        resonanceChains: { SequenceNode1First: { isEnabled: true }, SequenceNode2Second: { isEnabled: true, stacks: 1 }, SequenceNode3Third: { isEnabled: false } },
        characterLevel: "90",
        talents: { basic: 10, skill: 10 },
        echoes: { 0: { echoId: "e1" }, 1: { echoId: "e2" } },
        mainEcho: { echo: "BigEcho", rank: 5 },
        buffs: { OwnBuff: { isEnabled: true } },
        rotations: [],
        builds: [
          { id: "b1", name: "Default build", createdAt: 1, updatedAt: 1, echoes: { 0: { echoId: "e1" } } },
          { id: "b2", name: "Other build", createdAt: 2, updatedAt: 2, echoes: { 0: { echoId: "e3" } } },
        ],
        activeBuildId: "b1",
        buildStatus: "complete",
        notes: "",
      },
      Bbb: { weapon: "GunOne", weapons: { GunOne: { refinement: "5" } }, echoes: { 0: { echoId: "e4" } }, buffs: {} },
      Ccc: { weapon: "RectOne", echoes: {}, buffs: {} },
    },
    echoes: [
      { echoId: "e1", echo: "BigEcho", echoSet: "SetA", stat: "CritRate", echoSubStatsType1: "CritDMG", echoSubStatsValue1: 17.4 },
      { echoId: "e2", echo: "SmallEcho", echoSet: "SetA", stat: "ATK", echoSubStatsType1: "CritRate", echoSubStatsValue1: 8.7 },
      { echoId: "e3", echo: "SpareEcho", echoSet: "SetB", stat: "HP", echoSubStatsType1: "HP", echoSubStatsValue1: 9.4 },
      { echoId: "e4", echo: "GunEcho", echoSet: "SetB", stat: "CritDMG", echoSubStatsType1: "ATK", echoSubStatsValue1: 10.1 },
      { echoId: "e9", echo: "BagEcho", echoSet: "SetC", stat: "DEF" },
    ],
    teams: [{ id: "t-mine", name: "My trio", characterIds: ["Aaa", "Bbb", "Ccc"], buildIds: [null, null, null], actions: [{ id: "a1", characterId: "Aaa" }], duration: 20, enemyConfig: { enemyLevel: 90 } }],
  };
}

export const charRank = (id: string, damage: number, rotation: string | null = `${id} loop`): CharacterRank => ({
  id,
  name: id,
  sequence: 0,
  refinement: 1,
  weapon: "W",
  rotationsEvaluated: rotation ? 1 : 0,
  best: rotation ? { name: rotation, source: "curated", avgDamage: damage, normalDamage: damage, critDamage: damage, dps: null } : null,
  bestRotation: null,
  rotations: [],
  nextSequence: null,
  refineFive: null,
  errors: [],
});

export const teamRank = (id: string, damage: number, members: string[] = ["Aaa", "Bbb", "Ccc"], extra: Partial<TeamRank> = {}): TeamRank => ({
  id,
  name: id === "t-mine" ? "My trio" : id.replace(/^wuwa_calc:/, ""),
  source: id.startsWith("wuwa_calc:") ? "wuwa_calc" : "yours",
  characterIds: members,
  avgDamage: damage,
  perSlot: [],
  dps: null,
  unarmed: [],
  ...extra,
});

/** A whole ranking of the synthetic account: Aaa 1,000,000 · Bbb 400,000 · Ccc 120,000, his team and one stock team. */
export function ranking(over: { Aaa?: number; Bbb?: number; Ccc?: number; mine?: number; stock?: number; at?: number } = {}, extra: Partial<RosterRanking> = {}): RosterRanking {
  return {
    enemy: {} as never,
    characters: [charRank("Aaa", over.Aaa ?? 1_000_000), charRank("Bbb", over.Bbb ?? 400_000), charRank("Ccc", over.Ccc ?? 120_000)],
    teams: [teamRank("t-mine", over.mine ?? 2_000_000), teamRank("wuwa_calc:Aaa hypercarry", over.stock ?? 2_400_000)],
    teamsSkipped: 0,
    computedAt: new Date(over.at ?? T0).toISOString(),
    ...extra,
  };
}
