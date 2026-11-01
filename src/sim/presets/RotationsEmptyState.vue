<template>
  <div class="card bg-base-200 rounded-lg p-4 gap-3 mb-4" data-test-rotations-empty>
    <h3 class="font-semibold">No rotation for {{ name }} yet</h3>
    <p class="text-sm opacity-80 leading-snug">
      A rotation is the list of attacks you use in one fight, in order. The calculator adds up what they deal, so builds
      and teams compare by a whole fight rather than by one hit.
    </p>
    <p class="text-sm leading-snug" data-test-rotations-empty-hint>
      <template v-if="presetCount > 0">
        Start from one of the {{ presetCount }} preset{{ presetCount === 1 ? "" : "s" }} for {{ name }}, paste one in, or
        build your own.
      </template>
      <template v-else>Paste one in, or build your own.</template>
    </p>
    <div class="flex flex-wrap gap-2">
      <button v-if="presetCount > 0" type="button" class="btn btn-primary btn-sm" data-test-rotations-empty-presets @click="emit('presets')">
        List presets
      </button>
      <button type="button" class="btn btn-sm" data-test-rotations-empty-import @click="emit('import')">Import</button>
      <button type="button" class="btn btn-ghost btn-sm" data-test-rotations-empty-create @click="emit('create')">Create an empty one</button>
    </div>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ — the v3 calculator's Rotations panel with no rotation: upstream showed only the "Rotations ·
// Create · ⋯" bar and an empty screen, with presets and import hidden in the ⋯ menu. One line in
// CalculatorRotations.vue mounts this; it says what a rotation is and puts the three ways in on screen.
import { computed } from "vue";
import { getCharacterRosterDisplayName } from "../../characters/characters";

const props = defineProps<{ character: string; presetCount: number }>();
const emit = defineEmits<{ presets: []; import: []; create: [] }>();

const name = computed(() => getCharacterRosterDisplayName(props.character) || props.character);
</script>
