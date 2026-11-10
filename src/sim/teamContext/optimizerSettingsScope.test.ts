// @vitest-environment node
// Wuthering Tools+ — Optimize team's Edit drawer edits the build the team pins (`optimizerSettingsScope.ts`).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia, storeToRefs } from "pinia";
import { ref } from "vue";
import { drawerScopeLine, optimizerSettingsStore, scopedBuild, scopedSettingsStore, type OptimizerSettingsScope } from "./optimizerSettingsScope";

/* eslint-disable @typescript-eslint/no-explicit-any */

let useCharacterStore: typeof import("../../stores/character").useCharacterStore;

const live = () => ({
  weapon: "Sword",
  characterLevel: 90,
  echoSetPassives: { GlowAtk: { isEnabled: true } },
  optimizer: { echoSets: ["RejuvenatingGlow"], mainEchoes: ["Bell"], minStats: [], echoSetPassives: { GlowAtk: { isEnabled: true } }, mainEchoBuffs: { Bell: { buffs: { Shield: { isEnabled: true } } } } },
  activeBuildId: "default",
  builds: [
    { id: "default", name: "Default build", weapon: "Sword", optimizer: { echoSets: ["RejuvenatingGlow"] } },
    { id: "plan", name: "Account plan", weapon: "Sword", echoSetPassives: { GlowAtk: { isEnabled: false } }, optimizer: { echoSets: ["MoonlitClouds"], echoSetPassives: { GlowAtk: { isEnabled: true }, Other: { isEnabled: true } }, mainEchoBuffs: { Bell: { buffs: { Shield: { isEnabled: true } } }, Old: { isEnabled: true, stacks: 2 } } } },
  ],
});

beforeEach(async () => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  setActivePinia(createPinia());
  ({ useCharacterStore } = await import("../../stores/character"));
  useCharacterStore().$patch({ characters: { Sigrika: live(), Mornye: live() }, activeCharacter: "Sigrika" } as any);
});

const view = (scope: OptimizerSettingsScope | null) => scopedSettingsStore(useCharacterStore(), ref(scope)) as any;
const stored = () => useCharacterStore().characters as any;

describe("scopedSettingsStore", () => {
  it("shows the pinned build as the member's record, as the buff rows read it", () => {
    const store = view({ characterId: "Sigrika", buildId: "plan" });
    const { characters } = storeToRefs(store) as any;
    expect((characters.value as any).Sigrika.optimizer.echoSets).toEqual(["MoonlitClouds"]);
    expect((characters.value as any).Sigrika.echoSetPassives.GlowAtk.isEnabled).toBe(false); // the calculator fallback is the pinned build's too
    expect((characters.value as any).Sigrika.characterLevel).toBe(90); // shared fields stay the character's
    expect((characters.value as any).Mornye.optimizer.echoSets).toEqual(["RejuvenatingGlow"]); // a teammate is untouched
  });

  it("writes a switch into the pinned build and leaves the active build's settings alone", () => {
    const store = view({ characterId: "Sigrika", buildId: "plan" });
    const { characters } = storeToRefs(store) as any;
    store.setCharacterData("Sigrika", { optimizer: { echoSetPassives: { GlowAtk: { isEnabled: false } } } });
    expect(stored().Sigrika.builds[1].optimizer.echoSetPassives).toEqual({ GlowAtk: { isEnabled: false }, Other: { isEnabled: true } });
    expect(stored().Sigrika.optimizer.echoSetPassives.GlowAtk.isEnabled).toBe(true);
    expect(stored().Sigrika.builds[0]).toEqual(live().builds[0]);
    // and the drawer shows what it wrote
    expect((characters.value as any).Sigrika.optimizer.echoSetPassives.GlowAtk.isEnabled).toBe(false);
  });

  it("'Use calculator setting' clears the pinned build's entry, both shapes of a main echo buff", () => {
    const store = view({ characterId: "Sigrika", buildId: "plan" });
    store.clearOptimizerEchoSetPassive("Sigrika", "GlowAtk");
    store.clearOptimizerMainEchoBuff("Sigrika", "Bell", "Shield");
    store.clearOptimizerMainEchoBuff("Sigrika", "Old", "Any");
    const plan = stored().Sigrika.builds[1].optimizer;
    expect(plan.echoSetPassives).toEqual({ Other: { isEnabled: true } });
    expect(plan.mainEchoBuffs).toEqual({ Bell: { buffs: {} }, Old: {} });
    expect(stored().Sigrika.optimizer).toEqual(live().optimizer);
  });

  it("with no pin, a pin on the active build or a build since deleted, it is the live record", () => {
    for (const buildId of [null, "default", "gone"]) {
      useCharacterStore().$patch({ characters: { Sigrika: live() } } as any);
      const scope = { characterId: "Sigrika", buildId };
      expect(scopedBuild(stored(), scope)).toBeNull();
      const store = view(scope);
      expect((storeToRefs(store) as any).characters.value.Sigrika.optimizer.echoSets).toEqual(["RejuvenatingGlow"]);
      store.setCharacterData("Sigrika", { optimizer: { echoSetPassives: { GlowAtk: { isEnabled: false } } } });
      store.clearOptimizerMainEchoBuff("Sigrika", "Bell", "Shield");
      expect(stored().Sigrika.optimizer.echoSetPassives.GlowAtk.isEnabled).toBe(false);
      expect(stored().Sigrika.optimizer.mainEchoBuffs.Bell).toEqual({ buffs: {} });
      expect(stored().Sigrika.builds[1]).toEqual(live().builds[1]);
    }
  });

  it("a write for another character goes to that character", () => {
    const store = view({ characterId: "Sigrika", buildId: "plan" });
    store.setCharacterData("Mornye", { optimizer: { echoSets: ["X"] } });
    expect(stored().Mornye.optimizer.echoSets).toEqual(["X"]);
    expect(stored().Sigrika.builds[1]).toEqual(live().builds[1]);
  });

  it("saves no minimum stats: under a drawer they are the team run's own", () => {
    const store = view({ characterId: "Sigrika", buildId: null });
    store.setCharacterOptimizerMinStats("Sigrika", [{ id: "a", stat: "energyRegen", minValue: 125 }]);
    expect(stored().Sigrika.optimizer.minStats).toEqual([]);
    expect(stored().Sigrika.builds[1]).toEqual(live().builds[1]);
  });

  it("outside a drawer it is the store itself", () => {
    const store = useCharacterStore();
    expect(optimizerSettingsStore(store)).toBe(store);
  });

  it("the drawer's line names the build the switches are kept on", () => {
    expect(drawerScopeLine(stored(), { characterId: "Sigrika", buildId: "plan" }, "Sigrika")).toBe(
      'Sets, main echoes, minimum stats and advanced settings picked here are for this team run only. Echo buff switches are saved on Sigrika\'s build "Account plan", the one this team uses.',
    );
    expect(drawerScopeLine(stored(), { characterId: "Sigrika", buildId: null }, "Sigrika")).toBe(
      'Sets, main echoes, minimum stats and advanced settings picked here are for this team run only. Echo buff switches are saved on Sigrika\'s build "Default build", the one this team uses. The calculator\'s Optimizer reads the same switches.',
    );
  });
});
