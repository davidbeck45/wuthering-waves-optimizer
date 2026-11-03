<template>
  <!-- the rest of the roster is still being solved: the cards above it are the teams solved so far (controller.ts paintSoFar) -->
  <div v-if="solving" class="wt-cards-solving" role="status" data-test-rankings-cards-solving>
    <p class="text-xs leading-snug">
      {{ solving.mine ? "Solving teams at your account" : "Solving teams" }} ·
      <span class="tabular-nums font-semibold">{{ solving.done }} of {{ solving.total }}</span> done · the list shows those so far
    </p>
    <progress class="progress progress-primary h-1.5 w-full" :value="solving.done" :max="solving.total || 1" aria-label="Teams solved so far"></progress>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+: the phone card list's "Solving teams at your account · 37 of 104 done" line. Its own component, so
// a team landing re-renders this line alone: in RankingsCards.vue every landing re-ran the whole list's render (50
// cards), on the main thread the solver workers wait on for their next team.
import { rankingsSolving } from "./controller";

const solving = rankingsSolving;
</script>

<style scoped>
.wt-cards-solving {
  margin-top: 0.35rem;
  display: grid;
  gap: 0.25rem;
}
</style>
