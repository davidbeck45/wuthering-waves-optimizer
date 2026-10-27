<template>
  <!-- Wuthering Tools+ /today: events ending within 3 days -->
  <section class="td-card" aria-labelledby="td-ending-title" data-test-today-ending>
    <div class="td-card__head td-card__head--tight">
      <h2 id="td-ending-title" class="td-eyebrow">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2h12M6 22h12M7 2v4a5 5 0 005 5 5 5 0 005-5V2M7 22v-4a5 5 0 015-5 5 5 0 015 5v4" /></svg>
        Ending soon
        <span v-if="list.length" class="td-count">{{ list.length }}</span>
      </h2>
      <button
        v-if="t.buckets.value.endingSoon.length + t.buckets.value.live.length > 0"
        type="button"
        class="td-head-actions td-btn"
        title="Every running event's end, plus Waveplates full, as one calendar file"
        data-test-today-ics-all
        @click="t.downloadAllIcs()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
        All deadlines
      </button>
    </div>

    <template v-if="!t.hasNews.value && t.newsLoading.value">
      <div class="td-skel"></div>
      <div class="td-skel"></div>
    </template>
    <ul v-else-if="list.length" class="td-list">
      <TodayEventRow v-for="e in list" :key="e.id" :event="e" :now="t.now.value" mode="ending" :time-mode="t.timeMode.value" :offset-hours="t.offsetHours.value" @calendar="t.downloadEventIcs" />
    </ul>
    <p v-else-if="t.hasNews.value" class="td-empty" data-test-today-ending-none>
      Nothing ends in the next 3 days.
      <template v-if="next">Next: <b>{{ next.name }}</b>, {{ fmtIn(next.endMs, t.now.value) }}.</template>
    </p>
    <p v-else class="td-empty">Events appear once Kuro's news has been read.</p>
  </section>
</template>

<script setup lang="ts">
import { computed, inject } from "vue";
import { fmtIn } from "../format";
import { TODAY_KEY, type TodayModel } from "../useToday";
import TodayEventRow from "./TodayEventRow.vue";

const t = inject(TODAY_KEY) as TodayModel;
const list = computed(() => t.buckets.value.endingSoon);
const next = computed(() => t.buckets.value.live[0] ?? null);
</script>
