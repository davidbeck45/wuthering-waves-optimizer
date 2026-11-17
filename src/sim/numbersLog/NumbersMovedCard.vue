<template>
  <!-- Wuthering Tools+ "What moved in your numbers" on /account: the three biggest moves since the record before, and
       the way to the full list. Nothing for a browser with no account (the page has its own empty state). -->
  <section v-if="state.kind !== 'no-account'" class="nmc" aria-labelledby="nmc-title" data-test-numbers-card :data-state="state.kind">
    <div class="nmc__head">
      <h2 id="nmc-title" class="nmc__title">What moved in your numbers</h2>
      <RouterLink :to="{ path: '/whats-new', query: { tab: 'numbers' } }" class="nmc__all" data-test-numbers-card-all>See all ›</RouterLink>
    </div>

    <p v-if="scoring" class="nmc__line" role="status" data-test-numbers-card-scoring>
      <span class="loading loading-spinner loading-xs" aria-hidden="true"></span>
      Scoring your roster. A record is taken when it finishes, and this updates on its own.
    </p>

    <p v-if="state.kind === 'empty' && !scoring" class="nmc__line" data-test-numbers-card-empty>
      No record of your figures yet. One is taken each time your roster is scored: Recompute, at the top of this page, does it now.
    </p>
    <p v-else-if="state.kind === 'first'" class="nmc__line" data-test-numbers-card-first>{{ firstRecordText(state.entry, now) }}</p>
    <template v-else-if="state.kind === 'compared'">
      <p class="nmc__since" data-test-numbers-card-since>
        {{ summaryText(state.comparison) }}
        <span class="nmc__muted">Record of {{ whenText(state.comparison.after.at, now) }} against the one of {{ whenText(state.comparison.before.at, now) }}.</span>
      </p>
      <p v-if="state.comparison.importedAt" class="nmc__fact" data-test-numbers-card-import>A Settings import replaced your account between the two.</p>
      <p v-else-if="state.comparison.appUpdated" class="nmc__fact" data-test-numbers-card-app-update>The app was updated between the two.</p>
      <ul v-if="top.length" class="nmc__rows">
        <NumbersMoveRow v-for="m in top" :key="`${m.kind}:${m.id}`" :move="m" :imported="!!state.comparison.importedAt" compact />
      </ul>
      <p v-if="more > 0" class="nmc__muted nmc__more">and {{ more }} more on the full list.</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { biggestMoves, whenText } from "./compare";
import NumbersMoveRow from "./NumbersMoveRow.vue";
import { useNumbersLog } from "./useNumbersLog";
import { firstRecordText, summaryText } from "./view";

/** `scoring`: the page's own ranking is running (useAccountData's status) */
withDefaults(defineProps<{ scoring?: boolean }>(), { scoring: false });

const { state, now } = useNumbersLog({ stale: false });
const top = computed(() => (state.value.kind === "compared" ? biggestMoves(state.value.comparison.moves, 3) : []));
const more = computed(() => (state.value.kind === "compared" ? state.value.comparison.moves.length - top.value.length : 0));
</script>

<style scoped>
.nmc {
  padding: 0.8rem 0.9rem;
  border-radius: 0.9rem;
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.07);
}
.nmc__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.nmc__title {
  font-size: 1.05rem;
  font-weight: 700;
}
.nmc__all {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  min-height: 2.5rem;
  padding: 0 0.25rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: oklch(var(--p));
}
.nmc__line {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.25rem;
  font-size: 0.85rem;
  line-height: 1.45;
}
.nmc__since {
  margin-top: 0.15rem;
  font-size: 0.88rem;
  font-weight: 650;
  line-height: 1.45;
}
.nmc__muted {
  display: block;
  font-size: 0.74rem;
  font-weight: 500;
  color: oklch(var(--bc) / 0.6);
}
.nmc__fact {
  margin-top: 0.35rem;
  font-size: 0.8rem;
}
.nmc__rows {
  display: grid;
  gap: 0.4rem;
  margin-top: 0.6rem;
}
.nmc__more {
  margin-top: 0.4rem;
}
@media (min-width: 1024px) {
  .nmc__rows {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
