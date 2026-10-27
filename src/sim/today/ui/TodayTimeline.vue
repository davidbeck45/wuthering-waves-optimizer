<template>
  <!-- Wuthering Tools+ /today: the next 14 server days as a strip (768 px and up) — banners, cycles, events -->
  <section class="td-card td-tl" aria-labelledby="td-tl-title" data-test-today-timeline>
    <div class="td-card__head">
      <h2 id="td-tl-title" class="td-eyebrow">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h10M7 12h14M3 18h8" /></svg>
        Next 14 days
      </h2>
      <span class="td-meta td-head-actions">server days, from the 04:00 reset</span>
    </div>
    <div class="td-tl__grid" :style="{ '--td-days': DAYS }">
      <div class="td-tl__corner"></div>
      <div class="td-tl__axis">
        <span v-for="d in days" :key="d.ms" class="td-tl__day" :class="{ 'td-tl__day--mon': d.monday, 'td-tl__day--today': d.today }">
          <b>{{ d.dow }}</b> {{ d.date }}
        </span>
      </div>
      <template v-for="row in rows" :key="row.id">
        <div class="td-tl__label" :class="`td-kind--${row.kind}`" :title="row.title">
          <span class="td-dot" aria-hidden="true"></span>
          <span class="truncate">{{ row.label }}</span>
        </div>
        <div class="td-tl__track">
          <span v-for="d in days" :key="d.ms" class="td-tl__cell" :class="{ 'td-tl__cell--mon': d.monday }"></span>
          <span
            class="td-tl__bar"
            :class="[`td-kind--${row.kind}`, { 'td-tl__bar--open-l': row.openLeft, 'td-tl__bar--open-r': row.openRight }]"
            :style="{ left: `${row.left}%`, width: `${row.width}%`, paddingLeft: row.left < nowPct ? `calc(${nowPct - row.left}% + 0.45rem)` : undefined }"
            :title="row.title">
            <span class="td-tl__bar-text">{{ row.barText }}</span>
          </span>
          <span v-if="row.marker != null" class="td-tl__marker" :style="{ left: `${row.marker}%` }" :title="row.markerTitle"></span>
        </div>
      </template>
      <div class="td-tl__now" :style="{ left: `calc(var(--td-label) + (100% - var(--td-label)) * ${nowPct / 100})` }" aria-hidden="true"></div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, inject } from "vue";
import { fmtDuration, fmtWhen } from "../format";
import { DAY_MS, serverDate } from "../resets";
import { TODAY_KEY, type TodayModel } from "../useToday";

const t = inject(TODAY_KEY) as TodayModel;
const DAYS = 14;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MAX_EVENT_ROWS = 9;

const from = computed(() => t.resets.value.daily.startMs);
const to = computed(() => from.value + DAYS * DAY_MS);
const pctOf = (ms: number) => ((Math.min(Math.max(ms, from.value), to.value) - from.value) / (to.value - from.value)) * 100;
const nowPct = computed(() => pctOf(t.now.value));

const days = computed(() =>
  Array.from({ length: DAYS }, (_, i) => {
    const ms = from.value + i * DAY_MS;
    const d = serverDate(ms, t.offsetHours.value);
    return { ms, dow: WEEKDAYS[d.getUTCDay()]!, date: `${d.getUTCDate()}${d.getUTCDate() === 1 || i === 0 ? ` ${MONTHS[d.getUTCMonth()]}` : ""}`, monday: d.getUTCDay() === 1, today: i === 0 };
  }),
);

interface Row {
  id: string;
  label: string;
  kind: string;
  left: number;
  width: number;
  openLeft: boolean;
  openRight: boolean;
  barText: string;
  title: string;
  marker?: number | null;
  markerTitle?: string;
}

function bar(id: string, label: string, kind: string, start: number, end: number, title: string, barText = ""): Row | null {
  if (end < from.value || start > to.value) return null;
  const left = pctOf(start);
  return { id, label, kind, left, width: Math.max(0.8, pctOf(end) - left), openLeft: start < from.value, openRight: end > to.value, barText, title };
}

const rows = computed<Row[]>(() => {
  const out: (Row | null)[] = [];
  const when = (ms: number) => fmtWhen(ms, t.now.value, t.timeMode.value, t.offsetHours.value);
  const banners = t.liveBanners.value;
  if (banners.length) {
    const end = Math.max(...banners.map((b) => b.endMs));
    const start = Math.min(...banners.map((b) => b.startMs));
    const label = banners[0]!.label ? `Banners · ${banners[0]!.label}` : "Banners";
    out.push(bar("banners", label, "banner", start, end, `Banners end ${when(end)}`, `ends in ${fmtDuration(end - t.now.value)}`));
  }
  for (const c of t.cycles.value) {
    if (!c.window) continue;
    const row = bar(`cycle-${c.rule.id}`, c.rule.name, "cycle", c.window.startMs, c.window.nextMs - 1, `${c.rule.name} resets ${when(c.window.nextMs)}`, `resets in ${fmtDuration(c.window.nextMs - t.now.value)}`);
    out.push(row);
  }
  const m = t.matrix.value;
  if (m.startMs && m.endMs) out.push(bar("matrix", "Endstate Matrix", "cycle", m.startMs, m.endMs, `Endstate Matrix phase ends ≈ ${when(m.endMs)}`, `≈ ${fmtDuration(m.endMs - t.now.value)}`));
  const events = [...t.buckets.value.endingSoon, ...t.buckets.value.live, ...t.buckets.value.upcoming].slice(0, MAX_EVENT_ROWS);
  for (const e of events) {
    const started = e.startMs <= t.now.value;
    const text = started ? (e.endMs <= to.value ? `ends in ${fmtDuration(e.endMs - t.now.value)}` : "") : `starts in ${fmtDuration(e.startMs - t.now.value)}`;
    out.push(bar(e.id, e.name, e.kind, e.startMs, e.endMs, `${e.name}: ${started ? "ends" : "starts"} ${when(started ? e.endMs : e.startMs)}`, text));
  }
  return out.filter((r): r is Row => !!r);
});
</script>

<style scoped>
.td-tl__grid {
  --td-label: 11.5rem;
  position: relative;
  display: grid;
  grid-template-columns: var(--td-label) minmax(0, 1fr);
  row-gap: 0.3rem;
}
.td-tl__axis {
  display: grid;
  grid-template-columns: repeat(var(--td-days), minmax(0, 1fr));
  padding-bottom: 0.25rem;
  font-size: 0.66rem;
  color: oklch(var(--bc) / 0.5);
}
.td-tl__day {
  padding-left: 0.3rem;
  white-space: nowrap;
  overflow: hidden;
}
.td-tl__day b {
  font-weight: 700;
}
.td-tl__day--mon {
  box-shadow: inset 1px 0 0 oklch(var(--bc) / 0.25);
}
.td-tl__day--today {
  color: oklch(var(--p));
}
.td-tl__label {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
  padding-right: 0.6rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: oklch(var(--bc) / 0.8);
}
.td-tl__track {
  position: relative;
  display: grid;
  grid-template-columns: repeat(var(--td-days), minmax(0, 1fr));
  height: 1.35rem;
}
.td-tl__cell {
  box-shadow: inset 1px 0 0 oklch(var(--bc) / 0.05);
}
.td-tl__cell--mon {
  box-shadow: inset 1px 0 0 oklch(var(--bc) / 0.2);
}
.td-tl__bar {
  position: absolute;
  top: 0.15rem;
  bottom: 0.15rem;
  display: flex;
  align-items: center;
  min-width: 0.4rem;
  padding: 0 0.4rem;
  border-radius: 0.4rem;
  overflow: hidden;
  background: color-mix(in oklab, var(--td-kind) 24%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--td-kind) 50%, transparent);
}
.td-tl__bar--open-l {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}
.td-tl__bar--open-r {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}
.td-tl__bar-text {
  font-size: 0.64rem;
  font-weight: 700;
  white-space: nowrap;
  color: oklch(var(--bc) / 0.85);
}
.td-tl__now {
  position: absolute;
  top: 1.2rem;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  border-radius: 1px;
  background: oklch(var(--p));
  box-shadow: 0 0 0 2px oklch(var(--p) / 0.2);
  pointer-events: none;
}
@media (max-width: 1023px) {
  .td-tl__grid {
    --td-label: 9rem;
  }
}
</style>
