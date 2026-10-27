<template>
  <dialog ref="dialog" class="modal en-sheet" closedby="any" :aria-labelledby="titleId" data-test-energy-sheet @close="done">
    <div class="modal-box en-sheet__box">
      <header class="en-sheet__head">
        <div class="min-w-0">
          <h2 :id="titleId" class="en-sheet__title">{{ title }}</h2>
          <p class="en-sheet__sub">{{ view.name }}</p>
        </div>
        <form method="dialog">
          <button class="btn btn-sm btn-circle btn-ghost" aria-label="Close" data-test-energy-sheet-close autofocus @click="done">✕</button>
        </form>
      </header>
      <EnergyBreakdown :view="view" :character-id="characterId" />
      <div class="en-sheet__actions">
        <RouterLink to="/energy" class="btn btn-sm btn-ghost" data-test-energy-sheet-page>Energy check for all teams ▸</RouterLink>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button tabindex="-1" aria-hidden="true" @click="done">close</button></form>
  </dialog>
</template>

<script setup lang="ts">
// Wuthering Tools+ — the breakdown as a sheet: a native modal <dialog> (focus, Esc and the back gesture come from the
// browser), centred on a desktop and a full-width bottom sheet below 768 px (phone.css § 6). Light-dismiss through
// `closedby="any"` and DaisyUI's backdrop form where `closedby` is missing. Opens on mount; the parent unmounts it on
// `close` (once, whichever way it closed).
import { computed, onMounted, ref } from "vue";
import EnergyBreakdown from "./EnergyBreakdown.vue";
import { nameOf } from "./energyFormat";
import type { TeamView } from "./useEnergyNeeds";

const props = defineProps<{ view: TeamView; characterId: string }>();
const emit = defineEmits<{ close: [] }>();

const dialog = ref<HTMLDialogElement | null>(null);
const titleId = `en-sheet-${Math.random().toString(36).slice(2, 9)}`;
const title = computed(() => `${nameOf(props.characterId)} — Energy Regen`);
onMounted(() => {
  const d = dialog.value;
  if (d && !d.open) d.showModal();
});
// the buttons close through their `method="dialog"` form and say so themselves: some engines (Electron 37 under
// Cypress) never deliver the dialog's `close` event after such a submit; Esc and light-dismiss still arrive as `close`
let closed = false;
function done(): void {
  if (closed) return;
  closed = true;
  emit("close");
}
</script>

<style scoped>
.en-sheet:modal {
  overscroll-behavior: contain;
}
.en-sheet::backdrop {
  overflow: hidden;
  overscroll-behavior: contain;
}
.en-sheet__box {
  max-width: 34rem;
  display: grid;
  gap: 1rem;
}
.en-sheet__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}
.en-sheet__title {
  font-size: 1.1rem;
  font-weight: 700;
}
.en-sheet__sub {
  font-size: 0.78rem;
  opacity: 0.65;
  overflow-wrap: anywhere;
}
.en-sheet__actions {
  display: flex;
  justify-content: flex-end;
}
</style>
