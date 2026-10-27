// Wuthering Tools+: the live account adapter — the Pinia stores as an ExportFile, plain and detached.
import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { reactive } from "vue";
import fixture from "../ai/__fixtures__/aiAccount.json";
import { exportFromState, exportFromStores } from "./liveExport";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { parseExport } from "../cli/exportShape";
import { parseExport as parseFromCli } from "../cli/exportFile";

const data = fixture.data as any;

describe("exportFromState", () => {
  it("copies reactive state into plain, detached objects", () => {
    const state = reactive({
      character: { characters: JSON.parse(JSON.stringify(data.character.characters)), activeCharacter: "Aemeath" },
      inventory: { echoes: [...data.inventory.echoes], equipped: { ...data.inventory.equipped } },
      teamRotations: { teams: [...data.teamRotations.teams] },
    });
    const exp = exportFromState(state, { version: "9" });
    expect(exp.path).toBe("<live>");
    expect(exp.version).toBe("9");
    expect(exp.activeCharacter).toBe("Aemeath");
    expect(Object.keys(exp.characters).sort()).toEqual(["Aemeath", "Augusta", "Lynae", "Mornye"]);
    expect(exp.inventory.echoes).toHaveLength(20);
    expect(exp.inventory.echoPresets).toEqual([]);
    // structuredClone works on the result (proxies are gone) and edits never reach the stores
    expect(() => structuredClone(exp)).not.toThrow();
    exp.characters.Aemeath.weapon = "Changed";
    exp.inventory.echoes.pop();
    expect(state.character.characters.Aemeath.weapon).toBe("EverbrightPolestar");
    expect(state.inventory.echoes).toHaveLength(20);
  });

  it("matches what parsing a downloaded export of the same data gives", () => {
    const fromFile = parseExport(fixture, "<live>");
    const live = exportFromState({ character: data.character, inventory: data.inventory, teamRotations: data.teamRotations }, { version: fromFile.version });
    expect(live).toEqual({ ...fromFile, source: "WutheringTools" });
    expect(parseFromCli).toBe(parseExport); // the CLI re-exports the pure parser
  });

  it("fills empty stores with empty collections", () => {
    const exp = exportFromState({ character: {}, inventory: { echoes: null }, teamRotations: {} });
    expect(exp).toMatchObject({ characters: {}, activeCharacter: null, teams: [], inventory: { echoes: [], equipped: {}, echoPresets: [], equippedPresets: {} } });
  });
});

describe("exportFromStores", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("reads the three persisted stores", () => {
    const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));
    useCharacterStore().$patch((s: any) => {
      s.characters = copy(data.character.characters);
      s.activeCharacter = "Lynae";
    });
    useInventoryStore().$patch((s: any) => {
      s.echoes = copy(data.inventory.echoes);
      s.equipped = copy(data.inventory.equipped);
    });
    useTeamRotationsStore().$patch((s: any) => {
      s.teams = copy(data.teamRotations.teams);
    });
    const exp = exportFromStores();
    expect(exp.activeCharacter).toBe("Lynae");
    expect(exp.characters.Aemeath.weapon).toBe("EverbrightPolestar");
    expect(exp.inventory.echoes).toHaveLength(20);
    expect(exp.teams).toHaveLength(1);
    expect(exp.version).toMatch(/^\d+$/);
    exp.teams.pop();
    expect((useTeamRotationsStore() as any).teams).toHaveLength(1);
  });
});
