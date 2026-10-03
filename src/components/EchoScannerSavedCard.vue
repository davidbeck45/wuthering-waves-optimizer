<template>
  <div
    class="flex flex-col gap-1 rounded-box p-2 border border-success/40"
    :class="{ 'lg:col-span-2': expanded }"
    :data-test-scan-saved="echoId">
    <div class="flex flex-wrap items-center gap-1">
      <span
        class="badge badge-sm badge-ghost font-mono"
        v-tooltip="'Capture order: the order you clicked through echoes in this scan'">
        #{{ captureIndex }}
      </span>
      <span class="badge badge-sm badge-success badge-outline">Saved to inventory</span>
      <div class="ml-auto flex gap-1">
        <button
          v-if="panelPreviewUrl && !expanded"
          type="button"
          class="btn btn-xs btn-ghost"
          :aria-expanded="showCapture"
          @click="showCapture = !showCapture">
          {{ showCapture ? "Hide" : "Show" }} in-game capture
        </button>
      </div>
    </div>

    <!--
      Inline editor — expands this card in place (spanning both grid
      columns) instead of opening InventoryEchoEditPanel.vue's fixed side
      panel, which can never render above the scanner's own <dialog>: a
      showModal() dialog sits in the browser's top layer, which no z-index
      reaches. Same pieces as that panel (EchoEditHeader + EchoEditFields,
      both writing straight through to inventoryStore.patchEcho), with the
      in-game capture right beside them to compare against.
    -->
    <div v-if="expanded" class="flex flex-col md:flex-row gap-3 items-start" data-test-scan-inline-editor>
      <div class="flex-1 min-w-0 w-full rounded-box border border-base-300 bg-base-100">
        <EchoEditHeader :target="target" close-label="Done editing" @close="emit('toggle-edit')" />
        <EchoEditFields :target="target" :scrollable="false" />
        <div class="flex justify-end px-4 pb-3">
          <button type="button" class="btn btn-sm btn-primary" data-test-scan-inline-done @click="emit('toggle-edit')">
            Done
          </button>
        </div>
      </div>
      <button
        v-if="panelPreviewUrl"
        type="button"
        class="shrink-0 cursor-zoom-in md:sticky md:top-0"
        v-tooltip="'Open full size'"
        @click="emit('open-capture')">
        <img
          :src="panelPreviewUrl"
          class="max-h-[420px] w-auto object-contain rounded border border-base-300"
          :alt="`In-game capture #${captureIndex}`" />
      </button>
    </div>

    <div v-else-if="tileProps" class="flex gap-2 items-start">
      <div class="flex-1 min-w-0">
        <InventoryEchoTile
          v-bind="tileProps"
          :locked="isLocked"
          hide-inventory-actions
          @edit="emit('toggle-edit')"
          @delete="emit('delete')" />
      </div>
      <button
        v-if="showCapture && panelPreviewUrl"
        type="button"
        class="shrink-0 cursor-zoom-in"
        v-tooltip="'Open full size'"
        @click="emit('open-capture')">
        <img
          :src="panelPreviewUrl"
          class="max-h-[280px] w-auto object-contain rounded border border-base-300"
          :alt="`In-game capture #${captureIndex}`" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * A scanned echo that's already been saved to the inventory because the
 * user clicked Edit on it (useEchoScanner's saveCandidateNow) — it stays in
 * EchoScannerCapture.vue's results grid, at its capture position, instead
 * of disappearing. Expanded, it's the inline editor; collapsed, the normal
 * InventoryEchoTile for the now-saved echo.
 */
import { computed, ref } from "vue";
import InventoryEchoTile from "./InventoryEchoTile.vue";
import EchoEditHeader from "./EchoEditHeader.vue";
import EchoEditFields from "./EchoEditFields.vue";
import { useInventoryStore } from "../stores/inventory";
import { useEchoInventory } from "../composables/useEchoInventory";
import type { EchoEditTarget } from "../composables/useEchoEditFields";

const props = defineProps<{
  echoId: string;
  captureIndex: number;
  panelPreviewUrl?: string;
  expanded: boolean;
}>();

const emit = defineEmits<{
  "toggle-edit": [];
  delete: [];
  "open-capture": [];
}>();

const showCapture = ref(false);

const target = computed<EchoEditTarget>(() => ({ context: "inventory", echoId: props.echoId }));

const inventoryStore = useInventoryStore();
const { getEchoFlags } = useEchoInventory();
const isLocked = computed(() => getEchoFlags(props.echoId).locked);

// Same shape as InventoryEchoesBrowser.vue's echoCardBinder, read live from
// the inventory store so the collapsed tile reflects the inline edits.
const tileProps = computed(() => {
  const e = inventoryStore.getEchoById(props.echoId) as Record<string, unknown> | undefined;
  if (!e) return null;
  const str = (v: unknown) => (v == null ? "" : String(v));
  const numish = (v: unknown): number | string => (v == null ? 0 : (v as number | string));
  return {
    rank: (e.rank as number | string | undefined) ?? 5,
    type: str(e.type),
    echoId: props.echoId,
    echoSet: str(e.echoSet),
    stat: str(e.stat),
    echo: str(e.echo),
    echoSubStatsType1: str(e.echoSubStatsType1),
    echoSubStatsValue1: numish(e.echoSubStatsValue1),
    echoSubStatsType2: str(e.echoSubStatsType2),
    echoSubStatsValue2: numish(e.echoSubStatsValue2),
    echoSubStatsType3: str(e.echoSubStatsType3),
    echoSubStatsValue3: numish(e.echoSubStatsValue3),
    echoSubStatsType4: str(e.echoSubStatsType4),
    echoSubStatsValue4: numish(e.echoSubStatsValue4),
    echoSubStatsType5: str(e.echoSubStatsType5),
    echoSubStatsValue5: numish(e.echoSubStatsValue5),
  };
});
</script>
