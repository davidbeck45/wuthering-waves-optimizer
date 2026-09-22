<template>
  <dialog :id="modalId" class="modal">
    <form method="dialog" class="modal-backdrop" @click="handleClose">
      <button>close</button>
    </form>
    <div v-if="isOpen" class="modal-box max-w-5xl">
      <form method="dialog" @click="handleClose">
        <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">
          ✕
        </button>
      </form>
      <div class="py-4">
        <EchoScannerCapture
          v-if="!isReviewingDuplicates"
          inventory-only
          @echoes-parsed="handleEchoesParsed"
          @edit-candidate="emit('edit-candidate', $event)"></EchoScannerCapture>
        <EchoDuplicateReviewList
          v-else
          :items="duplicateReviewItems"
          inventory-only
          :has-selected-echoes="hasSelectedEchoes"
          @cancel="handleCancelDuplicateReview"
          @confirm="handleConfirmDuplicateReview"></EchoDuplicateReviewList>
      </div>
    </div>
  </dialog>
</template>

<script setup lang="ts">
/**
 * Standalone "Scan echoes" entry point — its own button, its own modal,
 * deliberately separate from CalculatorEchoImporter.vue's "Import echoes"
 * (Discord-bot-image) flow. They used to be two tabs inside one modal;
 * split apart on request, since most people looking for this kind of
 * feature look for something literally called a "scanner," not a tab
 * buried inside an unrelated import flow. Inventory-only by design (no
 * character prop, unlike CalculatorEchoImporter) — scanning your game
 * screen is naturally a "build up my inventory" action, not a
 * "assign echoes to this one character" action.
 *
 * Shares its actual duplicate-review/save logic with
 * CalculatorEchoImporter.vue via useEchoDuplicateReview +
 * EchoDuplicateReviewList — only the capture UI and entry point differ.
 */
import { nextTick, ref } from "vue";
import EchoScannerCapture from "./EchoScannerCapture.vue";
import EchoDuplicateReviewList from "./EchoDuplicateReviewList.vue";
import { useEchoDuplicateReview } from "../composables/useEchoDuplicateReview";

const emit = defineEmits<{
  /** Pass-through from EchoScannerCapture.vue — see its own doc comment on the same event. */
  "edit-candidate": [echoId: string];
}>();

const modalId = "modal-echo-scanner-inventory";

const isOpen = ref(false);

async function triggerOpenModal() {
  isOpen.value = true;
  await nextTick();
  const modalEl = document.getElementById(modalId);
  (modalEl as HTMLDialogElement | null)?.showModal();
}

function triggerCloseModal() {
  const modalEl = document.getElementById(modalId);
  (modalEl as HTMLDialogElement | null)?.close();
  isOpen.value = false;
  resetDuplicateReview();
}

function handleClose() {
  triggerCloseModal();
}

const {
  isReviewingDuplicates,
  duplicateReviewItems,
  hasSelectedEchoes,
  resetDuplicateReview,
  handleEchoesParsed,
  handleConfirmDuplicateReview,
} = useEchoDuplicateReview({
  inventoryOnly: () => true,
  character: () => "",
  onFinalized: triggerCloseModal,
});

function handleCancelDuplicateReview() {
  triggerCloseModal();
}

defineExpose({ triggerOpenModal, triggerCloseModal });
</script>
