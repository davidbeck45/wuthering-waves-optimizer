<template>
  <!-- Wuthering Tools+ "Over time": a small line of one figure across the log's records, scaled to its own range (the row
       says so and gives the change in words). Decorative for a screen reader: the row's text carries the values. -->
  <svg class="tsp" :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`" aria-hidden="true" focusable="false" data-test-trend-spark>
    <polyline v-for="(run, k) in paths" :key="k" :points="run" class="tsp__line" />
    <circle v-for="(d, k) in dots" :key="`d${k}`" :cx="d.x" :cy="d.y" r="1.8" class="tsp__dot" />
    <circle v-if="end" :cx="end.x" :cy="end.y" r="2.6" class="tsp__end" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { lineRuns, type TrendPoint } from "./trends";

const props = withDefaults(defineProps<{ points: TrendPoint[]; width?: number; height?: number }>(), { width: 96, height: 28 });

const PAD = 3;
const geo = computed(() => {
  const values = props.points.map((p) => p.value).filter((v): v is number => v !== null);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const n = props.points.length;
  const x = (i: number): number => (n <= 1 ? props.width / 2 : PAD + (i * (props.width - 2 * PAD)) / (n - 1));
  // a flat line sits in the middle
  const y = (v: number): number => (max === min ? props.height / 2 : props.height - PAD - ((v - min) * (props.height - 2 * PAD)) / (max - min));
  return { x, y };
});
const runs = computed(() => lineRuns(props.points));
const at = (i: number): { x: number; y: number } => ({ x: geo.value.x(i), y: geo.value.y(props.points[i]!.value!) });
const paths = computed(() => runs.value.filter((r) => r.length > 1).map((r) => r.map((i) => `${at(i).x.toFixed(1)},${at(i).y.toFixed(1)}`).join(" ")));
/** a point with no neighbour in its stretch would not show as a line */
const dots = computed(() => runs.value.filter((r) => r.length === 1).map((r) => at(r[0]!)));
const end = computed(() => {
  const last = runs.value[runs.value.length - 1];
  return last ? at(last[last.length - 1]!) : null;
});
</script>

<style scoped>
.tsp {
  display: block;
  flex-shrink: 0;
  overflow: visible;
}
.tsp__line {
  fill: none;
  stroke: oklch(var(--p));
  stroke-width: 1.6;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.tsp__dot,
.tsp__end {
  fill: oklch(var(--p));
}
.tsp__end {
  stroke: oklch(var(--b1));
  stroke-width: 1;
}
</style>
