/**
 * Shared post-parse pipeline for both echo import entry points
 * (CalculatorEchoImporter.vue's Discord-bot-image flow and
 * EchoScannerModal.vue's screen-scan flow): map parsed rows, detect exact
 * inventory duplicates, and — when there's anything to review — hold that
 * review state until the caller confirms. Extracted so a fix to duplicate
 * detection or the save/apply logic can't drift between the two entry
 * points by only getting made in one of them.
 *
 * Vue-only glue around mapParsedEchoes/getEchoIdentityKey (pure) and the
 * character/inventory stores — no scanner- or parser-specific logic here,
 * both callers feed it the same ParsedEcho[] shape.
 */
import { computed, ref } from "vue";
import { mapParsedEchoes, type MappedEcho, type ParsedEcho } from "../echoes/parsedEchoMapping";
import { useCharacterStore } from "../stores/character";
import { useInventoryStore } from "../stores/inventory";
import { getEchoIdentityKey } from "../utils/echoIdentity";

export type DuplicateReviewItem = {
  index: number;
  echo: MappedEcho;
  isDuplicate: boolean;
  selected: boolean;
};

export function useEchoDuplicateReview(options: {
  /** Re-read on every call rather than captured once, since callers pass these as prop-backed getters. */
  inventoryOnly: () => boolean;
  character: () => string;
  /** Called once an import/scan has been fully applied — the caller closes its own modal in response. */
  onFinalized: () => void;
}) {
  const characterStore = useCharacterStore();
  const inventoryStore = useInventoryStore();

  const isReviewingDuplicates = ref(false);
  const duplicateReviewItems = ref<DuplicateReviewItem[]>([]);
  const hasSelectedEchoes = computed(() =>
    duplicateReviewItems.value.some((item) => item.selected),
  );

  function resetDuplicateReview() {
    isReviewingDuplicates.value = false;
    duplicateReviewItems.value = [];
  }

  function isExactInventoryMatch(echo: MappedEcho) {
    if (!echo.echo) {
      return false;
    }
    const identityKey = getEchoIdentityKey(echo);
    return inventoryStore.echoes.some(
      (inventoryEcho: MappedEcho) => getEchoIdentityKey(inventoryEcho) === identityKey,
    );
  }

  async function saveSelectedToInventory(
    echoes: MappedEcho[],
    inventoryEchoIndexes: Set<number>,
  ) {
    for (const index of inventoryEchoIndexes) {
      const echo = echoes[index];
      if (!echo?.echoId) {
        continue;
      }
      await inventoryStore.saveEcho(echo);
    }
  }

  async function finalizeImport(
    echoes: MappedEcho[],
    inventoryEchoIndexes: Set<number> | null,
  ) {
    if (options.inventoryOnly()) {
      if (inventoryEchoIndexes) {
        await saveSelectedToInventory(echoes, inventoryEchoIndexes);
      }
      options.onFinalized();
      return;
    }

    const character = options.character();
    const characterEchoes = echoes.map((echo, index) => {
      if (inventoryEchoIndexes && !inventoryEchoIndexes.has(index)) {
        return { ...echo, echoId: null };
      }
      return echo;
    });

    await characterStore.setCharacterEchoes(character, {});
    await characterStore.setCharacterEchoes(character, characterEchoes);
    await characterStore.setCharacterData(character, { echoPresetId: null });
    await inventoryStore.deleteEquippedPreset(character);
    await inventoryStore.removeCharacterFromAllEquipped(character);

    if (inventoryEchoIndexes) {
      for (const index of inventoryEchoIndexes) {
        const echo = characterEchoes[index];
        if (!echo?.echoId) {
          continue;
        }
        await inventoryStore.saveEcho(echo);
        const equippedData: Record<string, number> = {};
        equippedData[character] = index;
        await inventoryStore.setEquippedData(echo.echoId, equippedData);
      }
    }

    options.onFinalized();
  }

  async function handleApplyToCharacterOnly() {
    const echoes = duplicateReviewItems.value.map((item) => item.echo);
    await finalizeImport(echoes, new Set());
  }

  async function handleConfirmDuplicateReview() {
    if (!hasSelectedEchoes.value) {
      return;
    }
    const echoes = duplicateReviewItems.value.map((item) => item.echo);
    const inventoryEchoIndexes = new Set(
      duplicateReviewItems.value
        .filter((item) => item.selected)
        .map((item) => item.index),
    );
    await finalizeImport(echoes, inventoryEchoIndexes);
  }

  async function handleEchoesParsed(
    echoData: ParsedEcho[],
    isSavingToInventory: boolean,
  ) {
    const saveToInventory = options.inventoryOnly() || isSavingToInventory;
    const echoes = mapParsedEchoes(echoData, saveToInventory);

    if (!saveToInventory) {
      await finalizeImport(echoes, null);
      return;
    }

    const reviewItems: DuplicateReviewItem[] = echoes.map((echo, index) => {
      const isDuplicate = isExactInventoryMatch(echo);
      return {
        index,
        echo,
        isDuplicate,
        selected: !isDuplicate,
      };
    });

    const hasDuplicates = reviewItems.some((item) => item.isDuplicate);
    if (!hasDuplicates) {
      await finalizeImport(echoes, new Set(echoes.map((_, index) => index)));
      return;
    }

    duplicateReviewItems.value = reviewItems;
    isReviewingDuplicates.value = true;
  }

  return {
    isReviewingDuplicates,
    duplicateReviewItems,
    hasSelectedEchoes,
    resetDuplicateReview,
    handleEchoesParsed,
    handleConfirmDuplicateReview,
    handleApplyToCharacterOnly,
  };
}
