<template>
  <!-- Wuthering Tools+ "Over time": one figure opened. A point per record (tap, hover, or the arrow keys), marks where
       something known happened between two records, and the same as text under it. -->
  <div class="tch" data-test-trend-chart>
    <p class="tch__lead">
      {{ trend.kind === "team" ? "Team damage per rotation" : "Best rotation, damage per rotation" }}, in each record. The scale starts at zero; one step to the right is one record, however
      long it was between them.
    </p>
    <div
      class="tch__plot"
      tabindex="0"
      role="group"
      :aria-label="`Chart of ${points.length} records. Left and right arrow keys move between them.`"
      data-test-trend-plot
      @keydown="onKey">
      <svg :viewBox="`0 0 ${W} ${H}`" class="tch__svg" aria-hidden="true" focusable="false">
        <line :x1="L" :x2="W - R" :y1="y(0)" :y2="y(0)" class="tch__axis" />
        <line :x1="L" :x2="W - R" :y1="y(top)" :y2="y(top)" class="tch__grid" />
        <text :x="L - 4" :y="y(0) + 3" class="tch__tick" text-anchor="end">0</text>
        <text :x="L - 4" :y="y(top) + 3" class="tch__tick" text-anchor="end">{{ compact(top) }}</text>
        <g v-for="(m, k) in marks" :key="`m${k}`" data-test-trend-mark>
          <line :x1="m.x" :x2="m.x" :y1="T - 2" :y2="y(0)" class="tch__mark" />
          <text :x="m.x" :y="T - 5" class="tch__letter" text-anchor="middle">{{ m.letters }}</text>
        </g>
        <polyline v-for="(run, k) in paths" :key="`r${k}`" :points="run" class="tch__line" />
        <g v-for="(p, i) in points" :key="p.at">
          <template v-if="p.value !== null">
            <circle :cx="x(i)" :cy="y(p.value)" :r="i === sel ? 5 : 3.2" class="tch__pt" :class="{ 'tch__pt--on': i === sel }" />
            <circle :cx="x(i)" :cy="y(p.value)" r="11" class="tch__hit" @click="sel = i" @mouseenter="sel = i" />
          </template>
          <text v-else :x="x(i)" :y="y(0) - 4" class="tch__gap" text-anchor="middle">–</text>
        </g>
        <text :x="x(0)" :y="H - 4" class="tch__tick" :text-anchor="points.length > 1 ? 'start' : 'middle'">{{ dayText(points[0]!.at, now) }}</text>
        <text v-if="points.length > 1" :x="x(points.length - 1)" :y="H - 4" class="tch__tick" text-anchor="end">{{ dayText(points[points.length - 1]!.at, now) }}</text>
      </svg>
    </div>
    <p class="tch__readout" aria-live="polite" data-test-trend-readout>
      Record {{ sel + 1 }} of {{ points.length }}, {{ whenText(points[sel]!.at, now) }}:
      <b>{{ pointText(points[sel]!) }}</b>
    </p>

    <template v-if="steps.length">
      <h4 class="tch__h">What happened between records</h4>
      <p v-if="marks.length" class="tch__legend">
        Marks on the chart:
        <span v-for="k in usedKinds" :key="k" class="tch__key"><b>{{ MARK_LETTER[k] }}</b> {{ MARK_LABEL[k] }}</span>
      </p>
      <ol class="tch__steps" data-test-trend-steps>
        <li v-for="s in [...steps].reverse()" :key="s.at" class="tch__step" data-test-trend-step>
          <span class="tch__stephead">
            <span v-if="s.marks.length" class="tch__badge">{{ s.marks.map((k) => MARK_LETTER[k]).join(" ") }}</span>
            <b>{{ whenText(points[s.from]!.at, now) }} → {{ whenText(s.at, now) }}</b>
          </span>
          <span class="tch__nums">{{ fmt(s.before) }} → {{ fmt(s.after) }}<template v-if="s.change && s.before !== s.after"> ({{ s.change }} of the figure before)</template></span>
          <span class="tch__text" data-test-trend-step-text>{{ s.text }}</span>
        </li>
      </ol>
    </template>

    <details class="tch__all">
      <summary>Every record as a list ({{ points.length }})</summary>
      <ol class="tch__points" data-test-trend-points>
        <li v-for="(p, i) in points" :key="p.at" :class="{ 'tch__points--on': i === sel }">
          <span>{{ whenText(p.at, now) }}</span>
          <b>{{ pointText(p) }}</b>
        </li>
      </ol>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { compact, fmt } from "../myRankings/format";
import { dayText, whenText } from "./compare";
import { lineRuns, MARK_LABEL, MARK_LETTER, type MarkKind, type Trend, type TrendPoint, type TrendStep } from "./trends";

const props = defineProps<{ trend: Trend; steps: TrendStep[]; now: number }>();

const W = 320;
const H = 170;
const L = 46;
const R = 10;
const T = 24;
const B = 24;
const points = computed(() => props.trend.points);
const top = computed(() => Math.max(1, ...points.value.map((p) => p.value ?? 0)));
const x = (i: number): number => (points.value.length <= 1 ? (L + W - R) / 2 : L + 6 + (i * (W - R - L - 12)) / (points.value.length - 1));
const y = (v: number): number => H - B - (v * (H - B - T)) / top.value;
const paths = computed(() =>
  lineRuns(points.value)
    .filter((r) => r.length > 1)
    .map((r) => r.map((i) => `${x(i).toFixed(1)},${y(points.value[i]!.value!).toFixed(1)}`).join(" ")),
);
const marks = computed(() => props.steps.filter((s) => s.marks.length).map((s) => ({ x: (x(s.from) + x(s.to)) / 2, letters: s.marks.map((k) => MARK_LETTER[k]).join("") })));
const usedKinds = computed(() => (Object.keys(MARK_LETTER) as MarkKind[]).filter((k) => props.steps.some((s) => s.marks.includes(k))));

const sel = ref(props.trend.last.index);
watch(
  () => props.trend.key,
  () => (sel.value = props.trend.last.index),
);
function onKey(e: KeyboardEvent): void {
  const n = points.value.length;
  if (e.key === "ArrowLeft") sel.value = Math.max(0, sel.value - 1);
  else if (e.key === "ArrowRight") sel.value = Math.min(n - 1, sel.value + 1);
  else if (e.key === "Home") sel.value = 0;
  else if (e.key === "End") sel.value = n - 1;
  else return;
  e.preventDefault();
}

const pointText = (p: TrendPoint): string =>
  p.value === null
    ? props.trend.kind === "team"
      ? "not in this record (the team could not be fielded then)"
      : "not in this record"
    : `${fmt(p.value)} damage per rotation${props.trend.kind === "team" ? `, team-aware buffs ${p.autoTeamBuffs ? "on" : "off"}` : ""}`;
</script>

<style scoped>
.tch {
  margin-top: 0.6rem;
  font-size: 0.82rem;
  line-height: 1.45;
}
.tch__lead {
  color: oklch(var(--bc) / 0.7);
}
.tch__plot {
  margin-top: 0.4rem;
  border-radius: 0.6rem;
  background: oklch(var(--b1));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.08);
}
.tch__plot:focus-visible {
  outline: 2px solid oklch(var(--p));
  outline-offset: 2px;
}
.tch__svg {
  display: block;
  width: 100%;
  height: auto;
  max-height: 16rem;
}
.tch__axis {
  stroke: oklch(var(--bc) / 0.5);
  stroke-width: 1;
}
.tch__grid {
  stroke: oklch(var(--bc) / 0.15);
  stroke-dasharray: 2 3;
}
.tch__tick,
.tch__gap {
  font-size: 11px;
  fill: oklch(var(--bc) / 0.75);
}
.tch__mark {
  stroke: oklch(var(--bc) / 0.55);
  stroke-width: 1;
  stroke-dasharray: 3 2;
}
.tch__letter {
  font-size: 11px;
  font-weight: 700;
  fill: oklch(var(--bc));
}
.tch__line {
  fill: none;
  stroke: oklch(var(--p));
  stroke-width: 2;
  stroke-linejoin: round;
}
.tch__pt {
  fill: oklch(var(--p));
  stroke: oklch(var(--b1));
  stroke-width: 1;
}
.tch__pt--on {
  fill: oklch(var(--b1));
  stroke: oklch(var(--p));
  stroke-width: 2.5;
}
.tch__hit {
  fill: transparent;
  cursor: pointer;
}
.tch__readout {
  margin-top: 0.35rem;
}
.tch__h {
  margin-top: 0.75rem;
  font-weight: 700;
}
.tch__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.15rem 0.7rem;
  margin-top: 0.2rem;
  color: oklch(var(--bc) / 0.7);
}
.tch__key b {
  color: oklch(var(--bc));
}
.tch__steps,
.tch__points {
  display: grid;
  gap: 0.35rem;
  margin-top: 0.35rem;
}
.tch__step {
  display: grid;
  gap: 0.1rem;
  padding: 0.4rem 0.55rem;
  border-radius: 0.5rem;
  background: oklch(var(--b1));
}
.tch__stephead {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}
.tch__badge {
  padding: 0 0.35rem;
  border-radius: 0.3rem;
  font-weight: 700;
  font-size: 0.72rem;
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.5);
}
.tch__nums {
  font-variant-numeric: tabular-nums;
}
.tch__text {
  color: oklch(var(--bc) / 0.75);
}
.tch__all {
  margin-top: 0.6rem;
}
.tch__all summary {
  display: flex;
  align-items: center;
  min-height: 44px;
  cursor: pointer;
  font-weight: 650;
  color: oklch(var(--p));
}
.tch__points li {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0 0.75rem;
  font-variant-numeric: tabular-nums;
}
.tch__points--on b {
  text-decoration: underline;
}
</style>
