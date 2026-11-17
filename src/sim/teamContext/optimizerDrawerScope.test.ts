// @vitest-environment node
// Wuthering Tools+ — which build Optimize team's Edit drawer addresses for a slot (`optimizerDrawerScope.ts`). The
// drawer's host read the team's pin and nothing else, so a build the Team page finds by its NAME (no pin, team buffs on:
// "For Mornye + Lucilla") was left out: the drawer said 'saved on Sigrika's build "Default build", the one this team
// uses', wrote the calculator's settings, and the run read 7,332,626 with Sound of True Name on and off alike
// (2026-11-16, second check of ad5aa25b).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import { drawerScopeOf } from "./optimizerDrawerScope";
import { drawerScopeLine, scopedBuild, scopedSettingsStore } from "./optimizerSettingsScope";

/* eslint-disable @typescript-eslint/no-explicit-any */

let useCharacterStore: typeof import("../../stores/character").useCharacterStore;

const TEAM = { characterIds: ["Sigrika", "Mornye", "Lucilla"], buildIds: [null, null, null] as Array<string | null> };
const SLOT = { slot: 0, characterId: "Sigrika" };

/** Sigrika wears "Default build"; a second build is named for this team's other two members. */
const sigrika = (teamBuild = "For Mornye + Lucilla") => ({
  weapon: "Gauntlets",
  optimizer: { echoSets: ["SoundofTrueName"], echoSetPassives: { TrueName: { isEnabled: true } } },
  activeBuildId: "default",
  builds: [
    { id: "default", name: "Default build", weapon: "Gauntlets", optimizer: { echoSets: ["SoundofTrueName"], echoSetPassives: { TrueName: { isEnabled: true } } } },
    { id: "team", name: teamBuild, weapon: "Gauntlets", optimizer: { echoSets: ["SoundofTrueName"], echoSetPassives: { TrueName: { isEnabled: true } } } },
  ],
});
const support = () => ({ weapon: "Rectifier", activeBuildId: "only", builds: [{ id: "only", name: "Default build", weapon: "Rectifier" }] });
const account = (teamBuild?: string): Record<string, any> => ({ Sigrika: sigrika(teamBuild), Mornye: support(), Lucilla: support() });

beforeEach(async () => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  setActivePinia(createPinia());
  ({ useCharacterStore } = await import("../../stores/character"));
});

describe("the build a slot's drawer addresses (drawerScopeOf)", () => {
  it("is the team's pin when there is one", () => {
    expect(drawerScopeOf({ ...TEAM, buildIds: ["team", null, null] }, account("Account plan"), SLOT, true)).toEqual({ characterId: "Sigrika", buildId: "team" });
    // team buffs off: a pin still counts, as on Teams
    expect(drawerScopeOf({ ...TEAM, buildIds: ["team", null, null] }, account("Account plan"), SLOT, false)).toEqual({ characterId: "Sigrika", buildId: "team" });
  });

  it("is the build named after both teammates when nothing is pinned: the one the Team page and the search read", () => {
    expect(drawerScopeOf(TEAM, account(), SLOT, true)).toEqual({ characterId: "Sigrika", buildId: "team" });
    // the pin alone read null here: the active build, which this team does not run
  });

  it("is the active build when no build is pinned or named for the team, and with team buffs off", () => {
    expect(drawerScopeOf(TEAM, account("Account plan"), SLOT, true)).toEqual({ characterId: "Sigrika", buildId: null });
    expect(drawerScopeOf(TEAM, account(), SLOT, false)).toEqual({ characterId: "Sigrika", buildId: null }); // the by-name rule goes with the switch
    expect(drawerScopeOf(TEAM, account(), { slot: 1, characterId: "Mornye" }, true)).toEqual({ characterId: "Mornye", buildId: null });
  });

  it("follows the page past a pin on a build that was deleted", () => {
    expect(drawerScopeOf({ ...TEAM, buildIds: ["gone", null, null] }, account(), SLOT, true)).toEqual({ characterId: "Sigrika", buildId: "team" });
    expect(drawerScopeOf({ ...TEAM, buildIds: ["gone", null, null] }, account("Account plan"), SLOT, true)).toEqual({ characterId: "Sigrika", buildId: null });
  });

  it("is safe with no team, or a slot nobody is in", () => {
    expect(drawerScopeOf(null, account(), SLOT, true)).toEqual({ characterId: "Sigrika", buildId: null });
    expect(drawerScopeOf(TEAM, {}, SLOT, true)).toEqual({ characterId: "Sigrika", buildId: null });
  });
});

describe("a drawer opened on a build the team reads by name", () => {
  it("says which build it saves on, and a switch lands there, not in the calculator's settings", () => {
    useCharacterStore().$patch({ characters: account(), activeCharacter: "Sigrika" } as any);
    const stored = () => useCharacterStore().characters as any;
    const scope = drawerScopeOf(TEAM, stored(), SLOT, true);
    expect(scopedBuild(stored(), scope)?.name).toBe("For Mornye + Lucilla");
    expect(drawerScopeLine(stored(), scope, "Sigrika")).toContain('saved on Sigrika\'s build "For Mornye + Lucilla", the one this team uses.');
    expect(drawerScopeLine(stored(), scope, "Sigrika")).not.toContain("The calculator's Optimizer reads the same switches");

    const view = scopedSettingsStore(useCharacterStore(), ref(scope)) as any;
    view.setCharacterData("Sigrika", { optimizer: { echoSetPassives: { TrueName: { isEnabled: false } } } });
    expect(stored().Sigrika.builds[1].optimizer.echoSetPassives.TrueName.isEnabled).toBe(false); // the build the run reads
    expect(stored().Sigrika.optimizer.echoSetPassives.TrueName.isEnabled).toBe(true); // the active build's is left alone
    expect(stored().Sigrika.builds[0]).toEqual(sigrika().builds[0]);
  });
});
