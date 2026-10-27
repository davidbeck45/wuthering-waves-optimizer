<template>
  <!-- Wuthering Tools+: /today at a glance on /account — resets, Waveplates, what ends soon. Reads what this browser
       already holds (no network); the full page lives at /today. -->
  <RouterLink to="/today" class="td-strip" data-test-today-card>
    <span class="td-strip__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9 2h6" /></svg>
    </span>
    <span class="td-strip__item">
      <span class="td-strip__label">Daily reset</span>
      <span class="td-strip__value td-num" data-test-today-card-daily>{{ fmtDuration(t.resets.value.daily.nextMs - t.now.value) }}</span>
    </span>
    <span class="td-strip__item">
      <span class="td-strip__label">Weekly</span>
      <span class="td-strip__value td-num">{{ fmtDuration(t.resets.value.weekly.nextMs - t.now.value) }}</span>
    </span>
    <span class="td-strip__item">
      <span class="td-strip__label">Waveplates</span>
      <span v-if="wp && wp.fullAt && !wp.full" class="td-strip__value td-num">full {{ fmtClock(wp.fullAt, t.timeMode.value, t.offsetHours.value) }}</span>
      <span v-else-if="wp" class="td-strip__value td-strip__value--warn">full now</span>
      <span v-else class="td-strip__value td-strip__value--muted">set them</span>
    </span>
    <span class="td-strip__item td-strip__item--wide">
      <span class="td-strip__label">Ending soon</span>
      <span v-if="soon" class="td-strip__value">
        <span class="truncate">{{ soon.name }}</span>
        <span class="td-num td-strip__in">{{ fmtDuration(soon.endMs - t.now.value) }}</span>
        <span v-if="moreSoon" class="td-strip__more">+{{ moreSoon }}</span>
      </span>
      <span v-else class="td-strip__value td-strip__value--muted">{{ t.hasNews.value ? "nothing in 3 days" : "open Today" }}</span>
    </span>
    <span v-if="t.liveDoubleDrops.value.length" class="td-strip__x2" title="A double-drop event is on">2× {{ t.liveDoubleDrops.value[0]!.event.name }}</span>
    <span class="td-strip__go">Today ›</span>
  </RouterLink>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { fmtClock, fmtDuration } from "./format";
import { useToday } from "./useToday";
import "./today.css";

const t = useToday({ network: false });
const wp = computed(() => t.waveplates.value);
const soon = computed(() => t.buckets.value.endingSoon[0] ?? null);
const moreSoon = computed(() => Math.max(0, t.buckets.value.endingSoon.length - 1));
</script>

<style scoped>
.td-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1.25rem;
  padding: 0.6rem 0.9rem;
  border-radius: 0.9rem;
  color: oklch(var(--bc));
  text-decoration: none;
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.07);
  transition: box-shadow 0.15s;
}
.td-strip:hover {
  box-shadow: inset 0 0 0 1px oklch(var(--p) / 0.55);
}
.td-strip:focus-visible {
  outline: 2px solid oklch(var(--p));
  outline-offset: 2px;
}
.td-strip__icon {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 0.6rem;
  color: oklch(var(--p));
  background: oklch(var(--p) / 0.14);
}
.td-strip__icon svg {
  width: 1.2rem;
  height: 1.2rem;
}
.td-strip__item {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.td-strip__item--wide {
  flex: 1 1 10rem;
}
.td-strip__label {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: oklch(var(--bc) / 0.5);
}
.td-strip__value {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  min-width: 0;
  font-size: 0.88rem;
  font-weight: 700;
  white-space: nowrap;
}
.td-strip__value--muted {
  font-weight: 600;
  color: oklch(var(--bc) / 0.5);
}
.td-strip__value--warn {
  color: oklch(var(--wa));
}
:root[data-theme-style="light"] .td-strip__value--warn {
  color: color-mix(in oklab, oklch(var(--wa)) 60%, black);
}
.td-strip__in {
  color: oklch(var(--bc) / 0.6);
  font-weight: 650;
}
.td-strip__more {
  font-size: 0.7rem;
  color: oklch(var(--bc) / 0.5);
}
.td-strip__x2 {
  padding: 0.1rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.72rem;
  font-weight: 750;
  color: oklch(var(--ac));
  background: oklch(var(--a));
}
.td-strip__go {
  margin-left: auto;
  font-size: 0.8rem;
  font-weight: 700;
  color: oklch(var(--p));
}
@media (max-width: 639px) {
  .td-strip {
    display: grid;
    grid-template-columns: auto repeat(3, minmax(0, 1fr));
    gap: 0.5rem 0.6rem;
  }
  .td-strip__item--wide {
    grid-column: 2 / 4;
  }
  .td-strip__go {
    grid-column: 4;
    grid-row: 2;
    align-self: end;
    margin-left: 0;
    text-align: right;
  }
  .td-strip__icon {
    grid-row: span 2;
  }
  .td-strip__x2 {
    grid-column: 2 / -1;
    justify-self: start;
  }
  .td-strip__value {
    font-size: 0.82rem;
  }
}
</style>
