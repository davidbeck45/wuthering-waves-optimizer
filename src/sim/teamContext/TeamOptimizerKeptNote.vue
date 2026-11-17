<template>
  <p v-if="note" class="tok-note" :class="{ 'tok-note--stopped': note.kind === 'stopped' }" role="status" :data-test-team-optimizer-kept-note="note.kind">{{ keptNoteText(note) }}</p>
</template>

<script setup lang="ts">
// Wuthering Tools+ — the line Optimize team shows when it has something to say about the last search here: its result
// kept from before the page was left, or that leaving stopped it (teamOptimizerKept.ts).
import { keptNoteText, type OptimizerKeptNote } from "./teamOptimizerKept";

defineProps<{ note: OptimizerKeptNote | null }>();
</script>

<style scoped>
.tok-note {
  margin: 0;
  padding: 0.6rem 0.8rem;
  border-radius: 0.7rem;
  font-size: 0.85rem;
  line-height: 1.45;
  text-align: left;
  color: oklch(var(--bc));
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.12);
  overflow-wrap: anywhere;
}
.tok-note--stopped {
  background: color-mix(in oklab, oklch(var(--wa)) 10%, oklch(var(--b1)));
  box-shadow:
    inset 0 0 0 1px oklch(var(--wa) / 0.45),
    inset 4px 0 0 0 oklch(var(--wa));
}
</style>
