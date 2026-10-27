<template>
  <!-- Wuthering Tools+ /today: one event — name, type, the countdown, its dates on the chosen clock, Kuro's notice -->
  <li class="td-row td-ev" :class="`td-kind--${event.kind}`" :data-test-today-event="event.name">
    <span class="td-dot" aria-hidden="true"></span>
    <span class="td-row__name">
      {{ event.name }}
      <span v-if="event.kind === 'double-drop'" class="td-chip td-ev__x2" title="Double drop">2×</span>
    </span>
    <span class="td-row__when" :class="{ 'td-urgent': urgent }">
      {{ fmtDuration(mode === "upcoming" ? event.startMs - now : event.endMs - now) }}
      <small>{{ mode === "upcoming" ? "to start" : "left" }}</small>
    </span>
    <span class="td-row__sub">
      <span v-if="event.type" class="td-ev__type">{{ event.type }}</span>
      <span class="td-num"><span :class="{ 'td-ev__verb': mode !== 'upcoming' }">{{ `${verb} ` }}</span>{{ dates }}</span>
      <a :href="KURO_NOTICE_URL(event.articleId)" target="_blank" rel="noopener noreferrer" class="td-link td-ev__src" :aria-label="`Kuro's notice for ${event.name}`" :title="event.source === 'manual' ? 'Kuro posted this one as an image; the dates were typed in by hand' : 'Kuro\'s notice'">
        <span class="td-ev__lbl">Kuro{{ event.source === "manual" ? " (image)" : "" }} </span>↗
      </a>
      <button
        v-if="mode !== 'upcoming'"
        type="button"
        class="td-link td-ev__cal"
        :aria-label="`Add the end of ${event.name} to your calendar`"
        :data-test-today-event-ics="event.name"
        @click="$emit('calendar', event)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>
        <span class="td-ev__lbl">.ics</span>
      </button>
    </span>
  </li>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { TimedEvent } from "../durations";
import { fmtDuration, fmtWhen, type TimeMode } from "../format";
import { KURO_NOTICE_URL } from "../rules";

const props = defineProps<{ event: TimedEvent; now: number; mode: "ending" | "live" | "upcoming"; timeMode: TimeMode; offsetHours: number }>();
defineEmits<{ calendar: [event: TimedEvent] }>();

const urgent = computed(() => props.mode === "ending" && props.event.endMs - props.now < 24 * 3_600_000);
/** the event's dates; a UTC+8 web event in server mode keeps its own clock (that's how Kuro states it) */
const dates = computed(() => {
  const e = props.event;
  const ownClock = props.timeMode === "server" && e.tz === "utc+8";
  const mode: TimeMode = props.timeMode;
  const offset = ownClock ? 8 : props.offsetHours;
  const suffix = ownClock ? " (UTC+8)" : "";
  if (props.mode === "upcoming") return `${fmtWhen(e.startMs, props.now, mode, offset)}${e.startApprox ? " (with the update)" : ""}${suffix}`;
  return `${fmtWhen(e.endMs, props.now, mode, offset)}${suffix}`;
});
const verb = computed(() => (props.mode === "upcoming" ? "starts" : "ends"));
</script>

<style scoped>
.td-ev__type {
  font-weight: 600;
  color: oklch(var(--bc) / 0.62);
}
.td-ev__x2 {
  margin-left: 0.25rem;
  vertical-align: 0.1em;
  color: oklch(var(--a));
  background: oklch(var(--a) / 0.14);
}
:root[data-theme-style="light"] .td-ev__x2 {
  color: color-mix(in oklab, oklch(var(--a)) 60%, black);
}
.td-ev__cal {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  min-height: 1.5rem;
}
.td-ev__cal svg {
  width: 0.85rem;
  height: 0.85rem;
}
/* phones: the type on its own line, the date and the two links beside it, icon-only */
@media (max-width: 639px) {
  .td-ev__type {
    flex-basis: 100%;
  }
  .td-ev__lbl,
  .td-ev__verb {
    display: none;
  }
  .td-ev__cal,
  .td-ev__src {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.5rem;
    min-height: 1.5rem;
  }
}
</style>
