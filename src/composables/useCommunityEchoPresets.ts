import { ref, watch, type Ref } from "vue";
import { getCharByName } from "../characters/characters";

/** Tabs of the echo presets modal (CalculatorEchoesPresets.vue). */
export type EchoPresetsTab = "mine" | "community";
export type EchoPresetsOpenOptions = {
  tab?: EchoPresetsTab;
  /** Where the modal was opened from; reported with `echo-preset-applied`. */
  source?: string;
};

/**
 * The baseline theorycrafter echo builds a character ships with
 * (`characters/<Name>/presets.ts` → `echoes`). Loaded lazily because
 * character modules are dynamic imports.
 */
export function useCommunityEchoPresets(character: () => string): Ref<any[]> {
  const presets = ref<any[]>([]);
  let requestToken = 0;

  watch(
    character,
    async (name) => {
      const token = ++requestToken;
      const data = name ? await getCharByName(name) : null;
      if (token !== requestToken) return;
      presets.value = data?.echoes ?? [];
    },
    { immediate: true },
  );

  return presets;
}
