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
      <p v-if="state.comparison.importedAt" class="nmc__fact" data-test-numbers-card-import>{{ IMPORT_CARD_TEXT }}</p>
      <p v-else-if="state.comparison.appUpdated" class="nmc__fact" data-test-numbers-card-app-update>The app was updated between the two.</p>
      <ul v-if="top.length" class="nmc__rows">
        <NumbersMoveRow v-for="m in top" :key="`${m.kind}:${m.id}`" :move="m" :imported="!!state.comparison.importedAt" compact />
      </ul>
      <p v-if="more > 0" class="nmc__muted nmc__more">and {{ more }} more on the full list.</p>
      <RouterLink
        v-if="best"
        :to="{ path: '/whats-new', query: { tab: 'numbers', trend: best.key } }"
        class="nmc__trend"
        data-test-numbers-card-trend
        :aria-label="`Your best team over time, ${bestName}: ${bestChange}. Open the full chart.`">
        <span class="nmc__trendhead">
          <span class="nmc__trendlabel">Your best team over time</span>
          <span class="nmc__trendname">{{ bestName }}</span>
        </span>
        <TrendSpark :points="best.points" :width="88" :height="26" />
        <span class="nmc__trendchange" data-test-numbers-card-trend-change>{{ compactNumber(best.last.value) }} team damage per rotation, {{ bestChange }} (in {{ recordedCount(best) }} of {{ best.points.length }} records; the small line is scaled to its own range) ›</span>
      </RouterLink>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { characterShortName } from "../display/names";
import { compact as compactNumber, fmt } from "../myRankings/format";
import { biggestMoves, dayText, whenText } from "./compare";
import { bestSavedTeam, buildTrends, recordedCount, trendChangeText } from "./trends";
import TrendSpark from "./TrendSpark.vue";
import NumbersMoveRow from "./NumbersMoveRow.vue";
import { useNumbersLog } from "./useNumbersLog";
import { IMPORT_CARD_TEXT, firstRecordText, summaryText } from "./view";

/** `scoring`: the page's own ranking is running (useAccountData's status) */
withDefaults(defineProps<{ scoring?: boolean }>(), { scoring: false });

const { log, state, now } = useNumbersLog({ stale: false });
// the account's best saved team now, as a line across the log (only once there are two records to draw)
const best = computed(() => (state.value.kind === "compared" ? bestSavedTeam(buildTrends(log.value)) : null));
const bestName = computed(() => (best.value ? best.value.members.map((id) => characterShortName(id) || id).join(" · ") : ""));
const bestChange = computed(() => (best.value ? trendChangeText(best.value, fmt, (at) => dayText(at, now.value)) : ""));
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
.nmc__trend {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.25rem 0.7rem;
  margin-top: 0.6rem;
  min-height: 44px;
  padding: 0.5rem 0.7rem;
  border-radius: 0.7rem;
  background: oklch(var(--b1));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.07);
}
.nmc__trend:focus-visible {
  outline: 2px solid oklch(var(--p));
  outline-offset: 2px;
}
.nmc__trendhead {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.nmc__trendlabel {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: oklch(var(--bc) / 0.6);
}
.nmc__trendname {
  font-size: 0.86rem;
  font-weight: 650;
  overflow-wrap: anywhere;
}
.nmc__trendchange {
  grid-column: 1 / -1;
  font-size: 0.78rem;
  line-height: 1.4;
  color: oklch(var(--bc) / 0.75);
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
