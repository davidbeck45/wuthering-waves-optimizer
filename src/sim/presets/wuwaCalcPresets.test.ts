// Wuthering Tools+: gates the GENERATED wuwa_calc presets under ./data —
// every action must resolve on its character with this app's own resolver,
// exactly as the calculator would when the preset is imported.
import { describe, expect, it, vi } from "vitest";
import manifest from "./data/manifest.json";
import {
  WUWA_CALC_AUTHOR,
  hasWuwaCalcRotationPresets,
  loadWuwaCalcRotationPresets,
  loadWuwaCalcTeamPresets,
} from "./index";
import { allCharactersList, getCharByName } from "../../characters/characters";
import { resolveRotationActionToAttackData } from "../../calculator/resolveRotationAction";
import { teamRotationPresets } from "../../teamRotations/presets";
// Riley's tables grew (Sept 2026): this replay takes more than vitest's 5 s default under a full-suite run
vi.setConfig({ testTimeout: 60_000 });

type Action = Record<string, unknown>;
const characterKeys = new Set(allCharactersList.map((c) => c.key));

describe("wuwa_calc stock presets (generated data)", () => {
  it("manifest names real characters that all have a generated chunk", () => {
    expect(manifest.characters.length).toBeGreaterThan(40);
    for (const key of manifest.characters) {
      expect(characterKeys.has(key), key).toBe(true);
      expect(hasWuwaCalcRotationPresets(key), key).toBe(true);
    }
    expect(hasWuwaCalcRotationPresets("NotACharacter")).toBe(false);
  });

  it("every generated rotation action resolves on its character", async () => {
    let presetCount = 0;
    let actionCount = 0;
    for (const key of manifest.characters) {
      const chosenChar = (await getCharByName(key)) as Record<string, unknown>;
      const presets = await loadWuwaCalcRotationPresets(key);
      expect(presets.length, key).toBeGreaterThan(0);
      const names = new Set<string>();
      for (const preset of presets) {
        expect(preset.author).toBe(WUWA_CALC_AUTHOR);
        expect(names.has(preset.name), `${key}: duplicate ${preset.name}`).toBe(false);
        names.add(preset.name);
        expect(preset.data.name).toBe(preset.name);
        const actions = preset.data.actions as Action[];
        expect(actions.length, preset.name).toBeGreaterThan(0);
        for (const action of actions) {
          const resolved = resolveRotationActionToAttackData(action, chosenChar, 90);
          expect(resolved, `${preset.name}: ${String(action.type)}/${String(action.key)}`).not.toBeNull();
          actionCount += 1;
        }
        presetCount += 1;
      }
    }
    expect(presetCount).toBe(manifest.rotationPresets);
    expect(actionCount).toBeGreaterThan(1000);
  });

  it("every generated team preset is a complete 3-slot team whose actions resolve on their slot", async () => {
    const teams = await loadWuwaCalcTeamPresets();
    expect(teams).toHaveLength(manifest.teamPresets);
    const curatedNames = new Set(teamRotationPresets.map((p) => p.name));
    const names = new Set<string>();
    const chosen = new Map<string, Record<string, unknown>>();
    for (const preset of teams) {
      expect(preset.author).toBe(WUWA_CALC_AUTHOR);
      expect(curatedNames.has(preset.name), preset.name).toBe(false);
      expect(names.has(preset.name), `duplicate ${preset.name}`).toBe(false);
      names.add(preset.name);
      expect(preset.data.name).toBe(preset.name);
      const ids = preset.data.characterIds;
      expect(ids).toHaveLength(3);
      for (const id of ids) {
        expect(Boolean(id) && characterKeys.has(id as string), `${preset.name}: ${id}`).toBe(true);
      }
      expect(preset.data.enemyConfig).toMatchObject({ enemyLevel: 100, enemyResist: 0.2, enemyType: "Calamity" });
      const actions = preset.data.actions as Action[];
      expect(actions.length, preset.name).toBeGreaterThan(3);
      const slotsSeen = new Set<number>();
      let lastOrder = 0;
      for (const action of actions) {
        const slot = action.slot as number;
        expect([0, 1, 2], `${preset.name}: slot ${slot}`).toContain(slot);
        slotsSeen.add(slot);
        expect(action.order as number, `${preset.name}: order`).toBeGreaterThan(lastOrder);
        lastOrder = action.order as number;
        const id = ids[slot] as string;
        if (!chosen.has(id)) {
          chosen.set(id, (await getCharByName(id)) as Record<string, unknown>);
        }
        const resolved = resolveRotationActionToAttackData(action, chosen.get(id), 90);
        expect(resolved, `${preset.name}: slot ${slot} ${String(action.type)}/${String(action.key)}`).not.toBeNull();
      }
      expect(slotsSeen.size, `${preset.name}: every slot acts`).toBe(3);
    }
  });
});
