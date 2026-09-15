// Wuthering Tools+: the Account State on a real exported account (the Cartethyia fixture) and on
// hand-made stores — the rules every account-first feature relies on.
import { describe, expect, it } from "vitest";
import account from "../myRankings/__fixtures__/cartethyiaAccount.json";
import { accountCharacterOf, accountKeyOf, accountStateOf, rankingsMineHash, rileyAccountEntries, rileyCompactName } from "./accountState";

describe("account state", () => {
  it("reads a set-up character off the store", () => {
    const c = accountCharacterOf("Cartethyia", account.characters.Cartethyia as Record<string, unknown>);
    expect(c.owned).toBe(true);
    expect(c.sequence).toBe(2);
    expect(c.weapon).toBe("DefiersThorn");
    expect(c.refinement).toBe(1);
    expect(c.rileyName).toBe("Cartethyia");
    expect(c.rotations).toBe(1);
  });

  it("counts a sequence by its highest node, never by enabled toggles", () => {
    // Aemeath's export: nodes 1-6 on, plus S2 and S6 sub-toggles — ten toggles, S6
    const chains = Object.fromEntries(
      [
        "SequenceNode1GildedGlimmeroftheFirstDawn", "SequenceNode2DownyNotesofSnowfluff", "SequenceNode2DownyNotesofSnowfluffTuneRupture",
        "SequenceNode2DownyNotesofSnowfluffFusionBurst", "SequenceNode3FervorSightlyBurnsBrightasNew", "SequenceNode4EtherealWaltzonBinaryTides",
        "SequenceNode5VoyagetotheAstralShore", "SequenceNode6AZephyrKissedJourneytoYou", "SequenceNode6AZephyrKissedJourneytoYouTuneRupture",
        "SequenceNode6AZephyrKissedJourneytoYouFusionBurst",
      ].map((k) => [k, { isEnabled: true }]),
    );
    const c = accountCharacterOf("Aemeath", { weapon: "EverbrightPolestar", weapons: { EverbrightPolestar: { refinement: "5" } }, resonanceChains: chains });
    expect(c.sequence).toBe(6);
    expect(c.refinement).toBe(5);
    expect(c.owned).toBe(true);
    // the picked build: activeBuildId, else the first; slots read the echo id or the inline name
    const built = accountCharacterOf("Lynae", {
      weapon: "SpectrumBlaster",
      activeBuildId: "b2",
      builds: [
        { id: "b1", name: "Old", echoes: { 0: { echoId: "aaa" } } },
        { id: "b2", name: "Team build", echoes: { 0: { echoId: "bbb" }, 1: { echo: "Hecate" }, 2: {} } },
      ],
    });
    expect(built.build?.name).toBe("Team build");
    expect(built.build?.echoes).toEqual(["bbb", "Hecate", null, null, null]);
    expect(built.builds).toHaveLength(2);
  });

  it("treats a character without a weapon as not owned, and derives teams and totals", () => {
    const state = accountStateOf(
      {
        Cartethyia: account.characters.Cartethyia as Record<string, unknown>,
        Mornye: { resonanceChains: { SequenceNode1X: { isEnabled: true } }, builds: [{ id: "d", name: "Default build", echoes: {} }] },
        RoverAeroMale: { weapon: "BloodpactsPledge" },
      },
      { echoes: account.echoes, equipped: { e1: { Cartethyia: 0 }, e2: { Cartethyia: 1 } } },
      [
        { id: "t1", name: "Cartethyia + Mornye + Aero Rover", characterIds: ["Cartethyia", "Mornye", "RoverAeroMale"], actions: [{}, {}] },
        { id: "t2", name: "Cartethyia + Aero Rover", characterIds: ["Cartethyia", "RoverAeroMale"], actions: [] },
        { id: "t3", name: "armed", characterIds: ["Cartethyia", "RoverAeroMale", "Cartethyia"], actions: [{}] },
      ],
    );
    expect(state.characters.Mornye.owned).toBe(false);
    expect(state.characters.Mornye.sequence).toBe(1);
    expect(state.characters.RoverAeroMale.rileyName).toBe("Aero Rover");
    expect(state.summary).toEqual({ characters: 3, owned: 2, s6: 0, teams: 3, teamsFieldable: 1, rotations: 1 });
    expect(state.echoes).toEqual({ total: 17, equipped: 2 });
    expect(state.teams.map((t) => t.fieldable)).toEqual([false, false, true]);
    expect(state.teams[1].characterIds).toEqual(["Cartethyia", "RoverAeroMale", null]);

    const entries = rileyAccountEntries(state);
    expect(entries.Cartethyia).toEqual({ sequence: 2, weapon: "DefiersThorn", refine: 1, owned: true });
    expect(entries.Mornye).toEqual({ sequence: 1, weapon: null, refine: 1, owned: false });
    expect(entries["Aero Rover"].owned).toBe(true);
    // the key follows the entries, not their order
    const key = accountKeyOf(entries);
    expect(key).toMatch(/^[0-9a-z]+$/);
    expect(accountKeyOf({ ...entries })).toBe(key);
    expect(accountKeyOf({ ...entries, Cartethyia: { ...entries.Cartethyia, refine: 5 } })).not.toBe(key);
  });

  it("writes the /rankings hash for the account's own state", () => {
    expect(rankingsMineHash()).toBe("#tc=mine");
    expect(rankingsMineHash(["Cartethyia", "RoverAeroMale"])).toBe("#tc=mine&r=Cartethyia,AeroRover");
    expect(rileyCompactName("Havoc Rover")).toBe("HavocRover");
  });
});
