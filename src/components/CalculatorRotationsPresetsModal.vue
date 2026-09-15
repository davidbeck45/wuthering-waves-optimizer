<template>
  <dialog
    ref="dialogEl"
    class="modal"
    data-test-rotations-presets-modal
    @close="isOpen = false">
    <div class="modal-box max-w-lg" data-test-rotations-presets>
      <h3 class="text-lg font-bold">Rotation presets</h3>

      <div class="flex flex-col gap-2 mt-2 max-h-[60vh] overflow-y-auto">
        <!-- Wuthering Tools+: which sequences change this kit's loop in wuwa_calc (generated table, src/sim/presets) -->
        <div
          v-if="breakpoints"
          class="rounded-box border border-base-300 bg-base-200/60 p-3 text-sm"
          data-test-rotations-breakpoints>
          <div class="font-semibold">
            Sequence breakpoints
            <span class="font-normal opacity-70">(wuwa_calc)</span>
          </div>
          <p v-for="(l, i) in breakpoints.loadouts" :key="i" class="mt-1">
            <span class="opacity-70">{{ l.label }}:</span>
            {{ describeBreakpoints(l) }}
          </p>
          <details v-if="breakpoints.sequences.length" class="mt-1">
            <summary class="cursor-pointer opacity-80">What each sequence does</summary>
            <ul class="mt-1 pl-4 list-disc">
              <li v-for="s in breakpoints.sequences" :key="s.level" class="mt-1">
                <span class="font-medium">S{{ s.level }}</span> {{ s.name }}
                <span v-if="s.note" class="opacity-70">— {{ s.note }}</span>
              </li>
            </ul>
          </details>
        </div>
        <div v-if="!presets.length" class="text-sm opacity-70">
          No presets are available for {{ characterName }} yet.
        </div>
        <div
          v-for="preset in presets"
          :key="preset.name"
          class="card card-bordered card-compact bg-base-100">
          <div class="card-body">
            <h4 class="card-title text-base">{{ preset.name }}</h4>
            <p class="text-sm">{{ preset.description }}</p>
            <p class="italic text-sm opacity-80">Author: {{ preset.author }}</p>
            <button
              type="button"
              class="btn btn-primary btn-sm w-fit"
              @click="emit('import', preset)">
              Import
            </button>
          </div>
        </div>
      </div>

      <div class="modal-action">
        <button
          type="button"
          class="btn btn-sm"
          data-test-rotations-presets-cancel
          @click="isOpen = false">
          Close
        </button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop" @submit.prevent="isOpen = false">
      <button type="submit">close</button>
    </form>
  </dialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import type { CharacterRotationPreset } from "../characters/rotationExportImport";
import { describeBreakpoints, type ResonatorBreakpoints } from "../sim/presets"; // Wuthering Tools+

defineProps<{
  presets: CharacterRotationPreset[];
  characterName: string;
  /** Wuthering Tools+: the wuwa_calc sequence-breakpoints entry for this character, when one exists */
  breakpoints?: ResonatorBreakpoints | null;
}>();

const emit = defineEmits<{
  import: [preset: CharacterRotationPreset];
}>();

const isOpen = defineModel<boolean>("open", { default: false });
const dialogEl = ref<HTMLDialogElement | null>(null);

watch(isOpen, (open) => {
  const el = dialogEl.value;
  if (!el) return;
  if (open) {
    if (!el.open) el.showModal();
  } else if (el.open) {
    el.close();
  }
});
</script>
