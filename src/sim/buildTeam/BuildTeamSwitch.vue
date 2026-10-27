<template>
  <div class="bt-switch" role="tablist" aria-label="Member">
    <button
      v-for="slot in slots"
      :key="slot"
      type="button"
      role="tab"
      class="bt-switch__btn"
      :class="{ 'bt-switch__btn--on': modelValue === slot }"
      :aria-selected="modelValue === slot"
      :data-test-build-team-switch="ids[slot]"
      @click="$emit('update:modelValue', slot)">
      <CharacterAvatar :id="ids[slot]!" :size="26" />
      <span class="truncate">{{ label(ids[slot]!) }}</span>
      <span v-if="deltas" class="bt-switch__d" :class="`bt-delta--${deltas[slot]?.tone ?? 'flat'}`">{{ deltas[slot]?.text ?? "" }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ "Build it for me" — on a phone, one member card at a time: the members in priority order.
import CharacterAvatar from "../display/CharacterAvatar.vue";
import { characterDisplayName, characterShortName } from "../display/names";

defineProps<{ slots: number[]; ids: Array<string | null>; modelValue: number; deltas?: Array<{ text: string; tone: string } | undefined> }>();
defineEmits<{ "update:modelValue": [slot: number] }>();
const label = (id: string): string => characterShortName(id) || characterDisplayName(id);
</script>
