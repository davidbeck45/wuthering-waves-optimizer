<template>
  <div class="rv-tl-row mt-3" data-test-rotation-cumulative>
    <div class="rv-tl-gutter text-xs self-start pt-1">
      <div class="text-[11px] uppercase tracking-wider opacity-60">Damage dealt</div>
      <div class="text-lg font-bold tabular-nums">{{ compact(inRange) }}</div>
      <div class="opacity-60">in {{ ((scale.to - scale.from) / scale.fps).toFixed(1) }} s · {{ compact(inRange / Math.max(0.001, (scale.to - scale.from) / scale.fps)) }} DPS</div>
    </div>
    <svg :width="scale.width" :height="H" class="block overflow-visible text-base-content" aria-hidden="true">
      <rect x="0" y="0" :width="scale.width" :height="H" fill="currentColor" fill-opacity="0.025" rx="3" />
      <g v-for="l in lines" :key="l.hp">
        <line x1="0" :x2="scale.width" :y1="l.y" :y2="l.y" stroke="currentColor" stroke-opacity="0.3" stroke-dasharray="4 4" />
        <text v-if="l.label" :x="scale.width - 4" :y="l.y - 3" font-size="10" text-anchor="end" fill="currentColor" fill-opacity="0.65">{{ hpText(l.hp) }}</text>
      </g>
      <path :d="area" class="text-primary" fill="currentColor" fill-opacity="0.15" />
      <path :d="line" class="text-primary" fill="none" stroke="currentColor" stroke-width="1.75" />
      <g v-for="k in killMarks" :key="k.hp" class="text-primary">
        <line :x1="k.x" :x2="k.x" :y1="k.y" :y2="H" stroke="currentColor" stroke-opacity="0.6" stroke-dasharray="2 2" />
        <circle :cx="k.x" :cy="k.y" r="3.5" fill="currentColor" />
      </g>
    </svg>
  </div>
  <div class="rv-tl-row">
    <div class="rv-tl-gutter"></div>
    <div class="flex flex-wrap items-center gap-1.5 pt-2" data-test-rotation-kills>
      <span v-for="k in kills" :key="k.hp" class="badge gap-1 tabular-nums" :class="k.extrapolated ? 'badge-ghost' : 'badge-primary badge-outline'" data-test-rotation-kill>
        kills {{ hpText(k.hp) }} at {{ k.seconds.toFixed(1) }} s
        <span v-if="k.extrapolated" class="text-[10px] uppercase opacity-70" title="Past the fight wuwa_calc ran (opener + 3 loops): carried on at the last loop's DPS">extrapolated</span>
      </span>
      <slot name="hp" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { KillTime, RotationModel } from "./extract";
import { curvePoints, damageAt, hpText, xOf, type Scale } from "./timelineScale";

const props = defineProps<{ model: RotationModel; scale: Scale; hp: number[] }>();

const H = 120;
const compact = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n)));

const kills = computed<KillTime[]>(() => props.hp.map((hp) => props.model.killAt(hp)).filter((k): k is KillTime => !!k));
const start = computed(() => damageAt(props.model, props.scale.from));
const end = computed(() => damageAt(props.model, props.scale.to));
const inRange = computed(() => end.value - start.value);
/** y: absolute damage on the fight, from the range's own start to its end (and up to an HP line it kills) */
const yMax = computed(() => {
  const inView = props.hp.filter((hp) => hp > start.value && hp <= end.value);
  return Math.max(end.value, ...inView) * 1.06 || 1;
});
const yMin = computed(() => start.value);
const yOf = (d: number): number => H - ((d - yMin.value) / Math.max(1, yMax.value - yMin.value)) * (H - 6);
const points = computed(() => curvePoints(props.model, props.scale, 2));
const line = computed(() => points.value.map(([x, d], i) => `${i ? "L" : "M"}${x.toFixed(1)},${yOf(d).toFixed(1)}`).join(""));
const area = computed(() => `${line.value}L${props.scale.width},${H}L0,${H}Z`);
/** the HP lines in view; a label only where it clears the one below it (1.5M / 3M / 4M crowd on a 10M fight) */
const lines = computed(() => {
  let lastY = Infinity;
  return props.hp
    .filter((hp) => hp > yMin.value && hp < yMax.value)
    .map((hp) => ({ hp, y: yOf(hp) }))
    .map((l) => {
      const label = lastY - l.y >= 12;
      if (label) lastY = l.y;
      return { ...l, label };
    });
});
const killMarks = computed(() =>
  kills.value
    .filter((k) => !k.extrapolated && k.seconds * props.scale.fps >= props.scale.from && k.seconds * props.scale.fps <= props.scale.to)
    .map((k) => ({ hp: k.hp, x: xOf(props.scale, k.seconds * props.scale.fps), y: yOf(k.hp) })),
);
</script>
