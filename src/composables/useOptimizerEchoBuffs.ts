/**
 * Every echo buff the v3 optimizer setup lists (set-bonus passives of the
 * eligible sets, buffs of the chosen main echoes), resolved through
 * optimizerBuffStatus.ts so the buffs section, its "not set" count and the
 * run bar agree with the buff rows. Also backs "Enable all" / "Max all".
 */
import { computed, type Ref } from "vue";
import { storeToRefs } from "pinia";
import { useCharacterStore } from "../stores/character";
import { getSetBonusEffectsFromListOfSetKeys } from "../echoes/sets";
import { getEchoData } from "../echoes/index";
import { getMainEchoBuffs, type MainEchoState } from "../echoes/mainEchoBuffs";
import {
  buildOptimizerBuffBulkUpdate,
  getCalculatorMainEchoBuffEntry,
  getMainEchoBuffEntry,
  needsAttention,
  resolveOptimizerBuff,
  type OptimizerBuffEntry,
  type OptimizerBuffItem,
} from "../calculator/optimizerBuffStatus";

type PassiveDef = {
  key: string;
  hasStacks?: boolean;
  maxStacks?: number;
  alwaysEnabled?: boolean;
};

type CharacterData = {
  echoSetPassives?: Record<string, OptimizerBuffEntry>;
  mainEcho?: MainEchoState;
  optimizer?: {
    echoSetPassives?: Record<string, OptimizerBuffEntry>;
    mainEchoBuffs?: Record<string, MainEchoState>;
  };
};

export function useOptimizerEchoBuffs(
  character: Ref<string>,
  setFilters: Ref<string[]>,
  mainEchoes: Ref<string[]>,
) {
  const characterStore = useCharacterStore();
  const { characters } = storeToRefs(characterStore);

  const characterData = computed(
    () => (characters.value[character.value] ?? {}) as CharacterData,
  );

  const items = computed<OptimizerBuffItem[]>(() => {
    const data = characterData.value;
    const result: OptimizerBuffItem[] = [];
    const seen = new Set<string>();

    for (const setBonus of getSetBonusEffectsFromListOfSetKeys(setFilters.value)) {
      for (const passive of (setBonus.passives ?? []) as PassiveDef[]) {
        if (seen.has(`set:${passive.key}`)) continue;
        seen.add(`set:${passive.key}`);
        const hasStacks = passive.hasStacks ?? false;
        const alwaysEnabled = passive.alwaysEnabled ?? false;
        result.push({
          kind: "setPassive",
          key: passive.key,
          hasStacks,
          maxStacks: passive.maxStacks ?? 0,
          alwaysEnabled,
          resolved: resolveOptimizerBuff({
            optimizerEntry: data.optimizer?.echoSetPassives?.[passive.key],
            calculatorEntry: data.echoSetPassives?.[passive.key],
            hasStacks,
            alwaysEnabled,
            calculatorFallback: true,
          }),
        });
      }
    }

    for (const echoKey of mainEchoes.value) {
      const echo = getEchoData(echoKey);
      if (!echo) continue;
      for (const buff of getMainEchoBuffs(echo)) {
        if (seen.has(`echo:${echoKey}:${buff.key}`)) continue;
        seen.add(`echo:${echoKey}:${buff.key}`);
        result.push({
          kind: "mainEcho",
          key: buff.key,
          echoKey,
          hasStacks: buff.hasStacks,
          maxStacks: buff.maxStacks,
          alwaysEnabled: buff.alwaysEnabled,
          resolved: resolveOptimizerBuff({
            optimizerEntry: getMainEchoBuffEntry(
              data.optimizer?.mainEchoBuffs?.[echoKey],
              buff.key,
            ),
            calculatorEntry: getCalculatorMainEchoBuffEntry(data.mainEcho, echoKey, buff.key),
            hasStacks: buff.hasStacks,
            alwaysEnabled: buff.alwaysEnabled,
            calculatorFallback: true,
          }),
        });
      }
    }
    return result;
  });

  const attentionCount = computed(
    () => items.value.filter((item) => needsAttention(item.resolved.status)).length,
  );

  const hasOptionalBuffs = computed(() => items.value.some((item) => !item.alwaysEnabled));

  function applyBulk(mode: "enable" | "max") {
    characterStore.setCharacterData(character.value, {
      optimizer: buildOptimizerBuffBulkUpdate(items.value, mode),
    });
  }

  return {
    items,
    attentionCount,
    hasOptionalBuffs,
    enableAll: () => applyBulk("enable"),
    maxAll: () => applyBulk("max"),
  };
}
