<template>
  <!-- ruler -->
  <div class="rv-tl-row" data-test-rotation-ruler>
    <div class="rv-tl-gutter text-[11px] uppercase tracking-wider opacity-60 flex items-end pb-1">Fight clock</div>
    <svg :width="scale.width" :height="RULER" class="block overflow-visible text-base-content" aria-hidden="true">
      <g v-for="s in sectionMarks" :key="`s${s.index}`">
        <line :x1="s.x" :x2="s.x" y1="0" :y2="RULER" stroke="currentColor" stroke-opacity="0.35" stroke-dasharray="2 3" />
        <text :x="s.x + 4" y="10" font-size="10" fill="currentColor" fill-opacity="0.7" font-weight="600">{{ s.label }}</text>
      </g>
      <g v-for="t in ticks" :key="`t${t.f}`">
        <line :x1="t.x" :x2="t.x" :y1="RULER - 6" :y2="RULER" stroke="currentColor" stroke-opacity="0.45" />
        <text :x="t.x" :y="RULER - 9" font-size="10" text-anchor="middle" fill="currentColor" fill-opacity="0.6">{{ t.label }}</text>
      </g>
      <g v-for="(tb, i) in tuneMarks" :key="`tb${i}`" class="text-accent">
        <rect :x="tb - 3.5" :y="RULER - 7.5" width="7" height="7" :transform="`rotate(45 ${tb} ${RULER - 4})`" fill="currentColor"><title>Tune Break</title></rect>
      </g>
    </svg>
  </div>

  <!-- lanes: on-field bars, presses, gauges -->
  <div v-for="lane in lanes" :key="lane.member" class="rv-tl-row" :data-test-rotation-lane="members[lane.member]!.name">
    <div class="rv-tl-gutter flex items-center gap-2 min-w-0">
      <MemberAvatar :app-key="members[lane.member]!.appKey" :name="members[lane.member]!.name" :hue="hueOf(lane.member)" :size="26" />
      <div class="min-w-0">
        <div class="text-sm font-semibold truncate rv-hue-text" :style="{ '--hue': hueOf(lane.member) }">{{ members[lane.member]!.name }}</div>
        <div class="text-[11px] opacity-60 tabular-nums" :title="'Share of the shown range they are the one on field'">on field {{ Math.round(lane.inRange * 100) }} %</div>
      </div>
    </div>
    <svg :width="scale.width" :height="LANE" class="block overflow-hidden text-base-content" :style="{ '--hue': hueOf(lane.member) }" aria-hidden="true">
      <rect x="0" y="0" :width="scale.width" :height="LANE" fill="currentColor" fill-opacity="0.025" />
      <!-- on field -->
      <rect v-for="(w, i) in lane.bars" :key="`b${i}`" class="rv-svg-bar" :x="w.x" y="5" :width="w.w" height="24" rx="3" />
      <!-- presses -->
      <g v-for="(c, i) in lane.chips" :key="`c${i}`">
        <line :x1="c.x" :x2="c.x" y1="5" y2="29" stroke="currentColor" stroke-opacity="0.55" />
        <text v-if="c.label" :x="c.x + 3" y="21" font-size="10.5" font-family="ui-monospace, monospace" font-weight="600" fill="currentColor" fill-opacity="0.9">{{ c.label }}</text>
      </g>
      <!-- follow-ups and off-field hits -->
      <line v-for="(x, i) in lane.minor" :key="`m${i}`" :x1="x" :x2="x" y1="30" y2="34" stroke="currentColor" stroke-opacity="0.35" />
      <!-- gauges -->
      <line x1="0" :x2="scale.width" :y1="G_TOP" :y2="G_TOP" stroke="currentColor" stroke-opacity="0.15" stroke-dasharray="3 3" />
      <path v-if="lane.energy" :d="lane.energy" fill="none" class="rv-hue-stroke" stroke-width="1.5" />
      <path :d="lane.concerto" fill="none" stroke="currentColor" stroke-opacity="0.45" stroke-width="1.25" stroke-dasharray="4 2" />
      <g v-for="(cp, i) in lane.checkpoints" :key="`cp${i}`" :class="cp.kind === 'energy' ? 'text-warning' : 'text-secondary'">
        <rect :x="cp.x - 3" :y="G_TOP - 3" width="6" height="6" :transform="`rotate(45 ${cp.x} ${G_TOP})`" fill="currentColor" />
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { RunMember } from "../engine/rileyRun";
import { covered, type RotationModel } from "./extract";
import MemberAvatar from "./MemberAvatar.vue";
import { rulerStep, xOf, type Scale } from "./timelineScale";
import { tokenText } from "./tokens";

const props = defineProps<{ model: RotationModel; scale: Scale; hues: Map<string, string> }>();

const RULER = 30;
const LANE = 62;
const G_TOP = 38;
const G_BOTTOM = 58;

const members = computed<RunMember[]>(() => props.model.run.members);
const hueOf = (i: number): string => props.hues.get(members.value[i]?.name ?? "") ?? "";
const inView = (f: number): boolean => f >= props.scale.from && f <= props.scale.to;

const ticks = computed(() => {
  const s = props.scale;
  const fps = s.fps;
  const step = rulerStep((s.to - s.from) / fps, s.width) * fps;
  const out: Array<{ f: number; x: number; label: string }> = [];
  for (let f = Math.ceil(s.from / step) * step; f <= s.to; f += step) {
    const sec = f / fps;
    out.push({ f, x: xOf(s, f), label: `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}${step < fps ? `.${Math.round((sec % 1) * 10)}` : ""}` });
  }
  return out;
});

const sectionMarks = computed(() =>
  props.model.sections.filter((s) => inView(s.start)).map((s) => ({ index: s.index, x: xOf(props.scale, s.start), label: s.index === 0 ? "Opener" : `Loop ${s.index}` })),
);
const tuneMarks = computed(() =>
  props.model.visits.flatMap((v) => v.checkpoints.filter((c) => c.kind === "tune" && inView(c.frame)).map((c) => xOf(props.scale, c.frame))),
);

/** A step line through [frame, value ×100] points, value / max clamped to [0, 1], drawn in the gauge band. */
function stepPath(series: Array<[number, number]>, max: number): string {
  if (!series.length || !(max > 0)) return "";
  const s = props.scale;
  const y = (v: number): number => G_BOTTOM - Math.min(1, Math.max(0, v / max)) * (G_BOTTOM - G_TOP);
  let d = "";
  let prev: number | null = null;
  for (const [f, v] of series) {
    if (f > s.to) break;
    const x = Math.max(0, xOf(s, Math.max(f, s.from)));
    if (prev == null) d += `M${x.toFixed(1)},${y(v).toFixed(1)}`;
    else d += `H${x.toFixed(1)}V${y(v).toFixed(1)}`;
    prev = v;
  }
  return d + `H${s.width}`;
}

const lanes = computed(() =>
  props.model.lanes.map((lane) => {
    const s = props.scale;
    const bars = lane.windows
      .filter(([a, b]) => b > s.from && a < s.to)
      .map(([a, b]) => {
        const x = xOf(s, Math.max(a, s.from));
        return { x, w: Math.max(1, xOf(s, Math.min(b, s.to)) - x) };
      });
    // a press label wherever it fits before the next press
    const visits = props.model.visits.filter((v) => v.member === lane.member && v.end > s.from && v.start < s.to);
    const chips: Array<{ x: number; label: string }> = [];
    for (const v of visits) {
      v.chips.forEach((c, k) => {
        if (!inView(c.frame)) return;
        const x = xOf(s, c.frame);
        const nextFrame = v.chips[k + 1]?.frame ?? v.end;
        const room = xOf(s, Math.min(nextFrame, s.to)) - x;
        const text = tokenText(c);
        chips.push({ x, label: room >= text.length * 6.6 + 6 ? text : "" });
      });
    }
    const minor = lane.ticks.filter((t) => !t.pressed && inView(t.frame)).map((t) => xOf(s, t.frame));
    const g = props.model.gauges[lane.member]!;
    const checkpoints = visits.flatMap((v) => v.checkpoints.filter((c) => c.kind !== "tune" && inView(c.frame)).map((c) => ({ kind: c.kind, x: xOf(s, c.frame) })));
    return {
      member: lane.member,
      bars,
      chips,
      minor,
      checkpoints,
      energy: stepPath(g.energy, g.maxEnergy),
      concerto: stepPath(g.concerto, g.maxConcerto),
      inRange: covered(lane.windows, s.from, s.to) / Math.max(1, s.to - s.from),
    };
  }),
);
</script>
