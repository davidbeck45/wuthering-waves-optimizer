<template>
  <Nav cur-page="today" :disable-mobile-nav="true"></Nav>
  <div class="today" data-test-today>
    <header class="td-head">
      <div class="td-head__title">
        <span class="td-head__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="13" r="8" />
            <path d="M12 9v4l2.5 2.5M9 2h6" />
          </svg>
        </span>
        <div class="min-w-0">
          <h1 class="td-h1">Today</h1>
          <p class="td-head__sub">What to do before the reset — from Kuro's own notices, on your server's clock.</p>
        </div>
      </div>
      <div class="td-head__tools">
        <div class="td-seg" role="group" aria-label="Show times in">
          <button
            v-for="m in TIME_MODES"
            :key="m.id"
            type="button"
            class="td-seg__btn"
            :class="{ 'td-seg__btn--on': today.timeMode.value === m.id }"
            :aria-pressed="today.timeMode.value === m.id"
            :data-test-today-time-mode="m.id"
            @click="today.timeMode.value = m.id">
            {{ m.label }}
          </button>
        </div>
        <span class="td-feed" :data-state="feedState" data-test-today-feed>
          <span class="td-feed__dot" aria-hidden="true"></span>
          <template v-if="today.newsLoading.value">Checking Kuro's news…</template>
          <template v-else-if="today.fetchedAt.value">Kuro's news · {{ fmtAgo(today.fetchedAt.value, today.now.value) }}</template>
          <template v-else>No news read yet</template>
        </span>
        <button
          type="button"
          class="td-icon-btn"
          :disabled="today.newsLoading.value"
          title="Check Kuro's news now"
          aria-label="Check Kuro's news now"
          data-test-today-refresh
          @click="today.refresh(true)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :class="{ 'td-spin': today.newsLoading.value }">
            <path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" />
          </svg>
        </button>
      </div>
    </header>

    <!-- the region, when it was only guessed -->
    <div v-if="today.regionGuessed.value" class="td-alert td-alert--info" role="status" data-test-today-region-guess>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
      </svg>
      <p class="min-w-0 flex-1">
        Using the <b>{{ guessedLabel }}</b> server clock, guessed from this device's time zone. Resets and event times depend on it.
      </p>
      <div class="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <select
          class="select select-bordered select-sm min-w-[10rem] flex-[1_1_10rem] sm:flex-none"
          aria-label="Your server"
          :value="today.serverId.value"
          data-test-today-region-pick
          @change="today.setRegion(($event.target as HTMLSelectElement).value as ServerRegionId)">
          <option v-for="r in SERVER_REGIONS" :key="r.id" :value="r.id">{{ r.label }} ({{ utcLabel(r.offsetHours) }})</option>
        </select>
        <button type="button" class="td-btn td-btn--on" data-test-today-region-confirm @click="today.setRegion(today.serverId.value)">That's right</button>
      </div>
    </div>

    <!-- the feed couldn't be read -->
    <div v-if="today.newsError.value" class="td-alert td-alert--warn" role="status" data-test-today-feed-error>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
      </svg>
      <p class="min-w-0 flex-1">
        {{ today.newsError.value }}
        <template v-if="today.hasNews.value && today.fetchedAt.value">Showing the events saved {{ fmtWhen(today.fetchedAt.value, today.now.value, today.timeMode.value, today.offsetHours.value) }}.</template>
        <template v-else>Resets, Waveplates and the checklist still work; events show once the feed answers.</template>
      </p>
      <button type="button" class="td-btn" @click="today.refresh(true)">Try again</button>
    </div>

    <TodayDoubleDrop />

    <div class="td-grid" :data-columns="layout">
      <div v-for="(col, i) in columns" :key="i" class="td-col">
        <component :is="CARDS[id]" v-for="id in col" :key="id" />
      </div>
    </div>

    <TodayTimeline v-if="layout >= 2" class="mt-4" />

    <footer class="td-foot">
      <p>
        Event dates are read from
        <a :href="NEWS_URL" target="_blank" rel="noopener noreferrer" class="td-link">Kuro's official news</a>
        (the version's patch notes and event notices) and refreshed once a day; when a source disagrees, Kuro's text wins.
        Rows marked <span class="td-chip td-chip--warn">check in game</span> come from the community's schedule, not an official date.
        Reset rules checked {{ RULES.checked }}.
      </p>
    </footer>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ — /today: the daily page. The server clock and resets, a Waveplate "full at" clock, events
// ending soon / live / starting soon from Kuro's own notices, the endgame cycles, the live Convene banners and a
// caps checklist that resets itself. Phone first: one column of cards; two columns from 768 px (with a 14-day
// timeline), three from 1280 px. State and data: useToday.ts; the cards read it through provide/inject.
import { computed, onBeforeUnmount, onMounted, provide, ref, type Component } from "vue";
import Nav from "../../components/navigation/Nav.vue";
import { useDocumentTitle } from "../../composables/useDocumentTitle";
import { SERVER_REGIONS } from "../convene/banners";
import type { ServerRegionId } from "../convene/prefs";
import { fmtAgo } from "../convene/ui/format";
import { fmtWhen } from "./format";
import { utcLabel } from "./resets";
import { RULES } from "./rules";
import { TODAY_KEY, useToday, useWaveplateReminder } from "./useToday";
import TodayNowCard from "./ui/TodayNowCard.vue";
import TodayWaveplatesCard from "./ui/TodayWaveplatesCard.vue";
import TodayEndingCard from "./ui/TodayEndingCard.vue";
import TodayLiveCard from "./ui/TodayLiveCard.vue";
import TodayEndgameCard from "./ui/TodayEndgameCard.vue";
import TodayBannersCard from "./ui/TodayBannersCard.vue";
import TodayChecklistCard from "./ui/TodayChecklistCard.vue";
import TodayDoubleDrop from "./ui/TodayDoubleDrop.vue";
import TodayTimeline from "./ui/TodayTimeline.vue";
import "./today.css";

useDocumentTitle(
  "Today — Wuthering Waves Calculator & Optimizer",
  "Wuthering Waves daily and weekly resets on your server's clock, when your Waveplates are full, events ending soon from Kuro's patch notes, endgame cycles and a weekly caps checklist.",
);

const NEWS_URL = "https://wutheringwaves.kurogames.com/en/main/news/";
const TIME_MODES = [
  { id: "local", label: "Your time" },
  { id: "server", label: "Server time" },
] as const;

const today = useToday({ network: true });
provide(TODAY_KEY, today);
useWaveplateReminder(today);

const guessedLabel = computed(() => {
  const r = SERVER_REGIONS.find((x) => x.id === today.serverId.value);
  return r ? `${r.label} (${utcLabel(r.offsetHours)})` : "";
});
const feedState = computed(() => (today.newsLoading.value ? "loading" : today.newsError.value ? "error" : today.fetchedAt.value ? "ok" : "idle"));

// ── layout: one column on a phone, two from 768 px, three from 1280 px ──
type CardId = "now" | "waveplates" | "ending" | "live" | "endgame" | "banners" | "checklist";
const CARDS: Record<CardId, Component> = {
  now: TodayNowCard,
  waveplates: TodayWaveplatesCard,
  ending: TodayEndingCard,
  live: TodayLiveCard,
  endgame: TodayEndgameCard,
  banners: TodayBannersCard,
  checklist: TodayChecklistCard,
};
const LAYOUTS: Record<1 | 2 | 3, CardId[][]> = {
  1: [["now", "waveplates", "ending", "live", "endgame", "banners", "checklist"]],
  2: [
    ["now", "waveplates", "endgame", "banners"],
    ["ending", "live", "checklist"],
  ],
  3: [
    ["now", "waveplates", "banners"],
    ["ending", "live"],
    ["endgame", "checklist"],
  ],
};
const layout = ref<1 | 2 | 3>(1);
let queries: MediaQueryList[] = [];
function readLayout(): void {
  layout.value = queries[1]?.matches ? 3 : queries[0]?.matches ? 2 : 1;
}
onMounted(() => {
  if (typeof window === "undefined" || !window.matchMedia) return;
  queries = [window.matchMedia("(min-width: 768px)"), window.matchMedia("(min-width: 1280px)")];
  for (const q of queries) q.addEventListener("change", readLayout);
  readLayout();
});
onBeforeUnmount(() => {
  for (const q of queries) q.removeEventListener("change", readLayout);
});
const columns = computed(() => LAYOUTS[layout.value]);
</script>

<style scoped>
.td-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1rem;
  margin-bottom: 1rem;
}
.td-head__title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
  flex: 1 1 18rem;
}
.td-head__icon {
  display: grid;
  place-items: center;
  width: 2.6rem;
  height: 2.6rem;
  flex-shrink: 0;
  border-radius: 0.8rem;
  color: oklch(var(--p));
  background: oklch(var(--p) / 0.14);
}
.td-head__icon svg {
  width: 1.5rem;
  height: 1.5rem;
}
.td-h1 {
  font-size: 1.5rem;
  font-weight: 750;
  letter-spacing: -0.01em;
  line-height: 1.15;
}
.td-head__sub {
  font-size: 0.8rem;
  color: oklch(var(--bc) / 0.55);
}
.td-head__tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.td-feed {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.2rem 0.65rem 0.2rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
  color: oklch(var(--bc) / 0.7);
  background: oklch(var(--bc) / 0.06);
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.08);
}
.td-feed__dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  background: oklch(var(--bc) / 0.35);
}
.td-feed[data-state="ok"] .td-feed__dot {
  background: oklch(var(--su));
  box-shadow: 0 0 0 3px oklch(var(--su) / 0.2);
}
.td-feed[data-state="loading"] .td-feed__dot {
  background: oklch(var(--in));
  animation: td-pulse 1s ease-in-out infinite;
}
.td-feed[data-state="error"] .td-feed__dot {
  background: oklch(var(--wa));
}
@keyframes td-pulse {
  50% {
    box-shadow: 0 0 0 5px oklch(var(--in) / 0.15);
  }
}
.td-spin {
  animation: td-spin 1s linear infinite;
}
@keyframes td-spin {
  to {
    transform: rotate(360deg);
  }
}
.td-alert {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem 0.75rem;
  margin-bottom: 1rem;
  padding: 0.7rem 0.9rem;
  border-radius: 0.85rem;
  font-size: 0.82rem;
}
.td-alert > svg {
  width: 1.2rem;
  height: 1.2rem;
  flex-shrink: 0;
}
.td-alert--info {
  background: oklch(var(--in) / 0.1);
  box-shadow: inset 0 0 0 1px oklch(var(--in) / 0.3);
}
.td-alert--info > svg {
  color: oklch(var(--in));
}
.td-alert--warn {
  background: oklch(var(--wa) / 0.1);
  box-shadow: inset 0 0 0 1px oklch(var(--wa) / 0.35);
}
.td-alert--warn > svg {
  color: oklch(var(--wa));
}
.td-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
}
.td-grid[data-columns="2"] {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.td-grid[data-columns="3"] {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr) minmax(0, 1fr);
}
.td-col {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 0;
}
.td-foot {
  margin-top: 1.5rem;
  max-width: 60rem;
  font-size: 0.72rem;
  line-height: 1.6;
  color: oklch(var(--bc) / 0.5);
}
@media (max-width: 767px) {
  .td-head {
    gap: 0.6rem;
    margin-bottom: 0.8rem;
  }
  .td-head__icon {
    width: 2.2rem;
    height: 2.2rem;
  }
  .td-h1 {
    font-size: 1.3rem;
  }
  .td-head__sub {
    display: none;
  }
  .td-head__tools {
    width: 100%;
  }
  .td-feed {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .td-grid,
  .td-col {
    gap: 0.8rem;
  }
}
</style>
