<template>
  <!-- Wuthering Tools+ /today: the other running events and the ones starting within 14 days (collapsible) -->
  <section class="td-card" aria-labelledby="td-live-title" data-test-today-live>
    <div class="td-card__head td-card__head--tight">
      <h2 id="td-live-title" class="td-eyebrow">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>
        Live &amp; starting soon
        <span v-if="total" class="td-count">{{ total }}</span>
      </h2>
      <button
        type="button"
        class="td-head-actions td-icon-btn"
        :aria-expanded="open"
        aria-controls="td-live-body"
        :aria-label="open ? 'Collapse' : 'Expand'"
        data-test-today-live-toggle
        @click="open = !open">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :style="{ transform: open ? 'rotate(180deg)' : 'none' }" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
    </div>

    <div v-show="open" id="td-live-body">
      <template v-if="!t.hasNews.value && t.newsLoading.value">
        <div class="td-skel"></div>
        <div class="td-skel"></div>
        <div class="td-skel"></div>
      </template>
      <template v-else-if="total">
        <h3 v-if="live.length" class="td-sub">Running <span class="td-meta">— {{ live.length }}</span></h3>
        <ul v-if="live.length" class="td-list" data-test-today-live-list>
          <TodayEventRow v-for="e in live" :key="e.id" :event="e" :now="t.now.value" mode="live" :time-mode="t.timeMode.value" :offset-hours="t.offsetHours.value" @calendar="t.downloadEventIcs" />
        </ul>
        <h3 v-if="upcoming.length" class="td-sub" :class="{ 'mt-3': live.length }">Starting within 14 days <span class="td-meta">— {{ upcoming.length }}</span></h3>
        <ul v-if="upcoming.length" class="td-list" data-test-today-upcoming-list>
          <TodayEventRow v-for="e in upcoming" :key="e.id" :event="e" :now="t.now.value" mode="upcoming" :time-mode="t.timeMode.value" :offset-hours="t.offsetHours.value" />
        </ul>
      </template>
      <p v-else-if="t.hasNews.value" class="td-empty">No other event is running or announced for the next two weeks.</p>
      <p v-else class="td-empty">Events appear once Kuro's news has been read.</p>
    </div>
    <p v-if="!open && total" class="td-meta">{{ live.length }} running · {{ upcoming.length }} starting soon</p>
  </section>
</template>

<script setup lang="ts">
import { computed, inject } from "vue";
import { TODAY_KEY, type TodayModel } from "../useToday";
import TodayEventRow from "./TodayEventRow.vue";

const t = inject(TODAY_KEY) as TodayModel;
const live = computed(() => t.buckets.value.live);
const upcoming = computed(() => t.buckets.value.upcoming);
const total = computed(() => live.value.length + upcoming.value.length);
const open = computed({ get: () => t.showLive.value, set: (v: boolean) => (t.showLive.value = v) });
</script>

<style scoped>
.td-sub {
  margin: 0.1rem 0 0.1rem;
  font-size: 0.72rem;
  font-weight: 700;
  color: oklch(var(--bc) / 0.7);
}
</style>
