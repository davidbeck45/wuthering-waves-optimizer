<template>
  <div class="flex flex-col gap-3" data-test-rotation-timeline>
    <!-- range + HP lines -->
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div class="join max-sm:w-full overflow-x-auto" role="group" aria-label="Range" data-test-rotation-range>
        <button
          v-for="r in visibleRanges"
          :key="r.key"
          type="button"
          class="btn btn-sm join-item max-sm:flex-1 max-sm:px-2"
          :class="rangeKey === r.key ? 'btn-primary' : ''"
          :data-test-rotation-range-option="r.key"
          @click="pickRange(r.key)"
        >
          <template v-if="r.key === 'fight'"><span class="max-sm:hidden">Whole fight</span><span class="sm:hidden">Fight</span></template>
          <template v-else>{{ r.label }}</template>
        </button>
      </div>
      <button v-if="rangeKey === 'zoom'" type="button" class="btn btn-sm btn-ghost" data-test-rotation-zoom-reset @click="pickRange(lastPicked)">Reset zoom</button>
      <span v-if="!phone" class="text-xs opacity-60">Drag across the lanes to zoom.</span>
      <label class="flex items-center gap-2 text-sm ml-auto max-sm:ml-0">
        <span class="opacity-70">Boss HP</span>
        <input
          :value="hpInput"
          type="text"
          inputmode="decimal"
          class="input input-bordered input-sm w-28"
          placeholder="e.g. 6M"
          aria-label="Your own boss HP line"
          data-test-rotation-hp
          @change="setHp(($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>

    <TimelinePhone v-if="phone" :model="model" :plan="plan" :hues="hues" :range="range" :hp="hp" />

    <div v-else ref="root" class="rv-tl select-none" :style="{ '--rv-gutter': `${GUTTER}px` }" @pointermove="onMove" @pointerleave="onLeave" @pointerdown="onDown" @pointerup="onUp" @pointercancel="onLeave">
      <div class="rv-tl-row h-0" aria-hidden="true">
        <div></div>
        <div ref="probe" class="h-0"></div>
      </div>
      <template v-if="width > 0">
        <GanttSvg :model="model" :scale="scale" :hues="hues" />
        <CumulativeStrip :model="model" :scale="scale" :hp="hp" />
        <BuffUptimeTable :model="model" :scale="scale" :hues="hues" />
      </template>
      <!-- zoom selection -->
      <div v-if="drag && Math.abs(drag.x1 - drag.x0) > 2" class="absolute top-0 bottom-0 bg-primary/15 border-x border-primary/60 pointer-events-none" :style="{ left: `${plotLeft + Math.min(drag.x0, drag.x1)}px`, width: `${Math.abs(drag.x1 - drag.x0)}px` }"></div>
      <!-- cursor -->
      <template v-if="hover && !drag">
        <div class="absolute top-0 bottom-0 w-px bg-base-content/40 pointer-events-none" :style="{ left: `${plotLeft + hover.x}px` }"></div>
        <div
          class="absolute z-10 pointer-events-none rounded-box border border-base-300 bg-base-200/95 shadow-lg px-3 py-2 text-xs w-60"
          :style="{ top: '34px', left: hover.x > width - 250 ? `${plotLeft + hover.x - 252}px` : `${plotLeft + hover.x + 12}px` }"
          data-test-rotation-tooltip
        >
          <div class="font-semibold tabular-nums">{{ clockOf(hover.frame) }}</div>
          <div v-if="hover.on" class="mt-1">
            <span class="rv-hue-text font-semibold" :style="{ '--hue': hueOf(hover.on.visit.member) }">{{ memberName(hover.on.visit.member) }}</span>
            on field<span v-if="hover.on.chip >= 0">: <span class="font-mono font-semibold">{{ tokenText(hover.on.visit.chips[hover.on.chip]!) }}</span></span>
            <div v-if="hover.on.chip >= 0" class="opacity-60 truncate">{{ hover.on.visit.chips[hover.on.chip]!.name }}</div>
          </div>
          <table class="mt-1.5 w-full tabular-nums">
            <thead>
              <tr class="opacity-50 text-[10px] uppercase tracking-wider">
                <th class="font-normal text-left"></th>
                <th class="font-normal text-right pr-2">Energy</th>
                <th class="font-normal text-right">Concerto</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="g in hover.gauges" :key="g.name">
                <td class="pr-2 truncate max-w-[6rem]"><span class="rv-hue-text" :style="{ '--hue': hueOf(g.member) }">{{ g.name }}</span></td>
                <td class="text-right pr-2" :class="g.energyFull ? 'text-warning font-semibold' : ''" title="Resonance Energy">{{ g.energy }}</td>
                <td class="text-right opacity-70" title="Concerto">{{ g.concerto }}</td>
              </tr>
            </tbody>
          </table>
          <div class="mt-1 opacity-70">Damage so far {{ compact(hover.damage) }}</div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import BuffUptimeTable from "./BuffUptimeTable.vue";
import type { CuePlan } from "./cueModel";
import CumulativeStrip from "./CumulativeStrip.vue";
import { clockOf, type RotationModel } from "./extract";
import GanttSvg from "./GanttSvg.vue";
import type { RotationPrefs } from "./prefs";
import { damageAt, frameAt, hpLines, hpText, onFieldAt, parseHp, rangesOf, valueAt, type Scale } from "./timelineScale";
import TimelinePhone from "./TimelinePhone.vue";
import { tokenText } from "./tokens";

const props = defineProps<{ model: RotationModel; plan: CuePlan; hues: Map<string, string>; prefs: RotationPrefs }>();

const GUTTER = 280;

/* phone or desktop (one renders, not both) */
const mq = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(max-width: 767px)") : null;
const phone = ref(!!mq?.matches);
const onMq = (e: MediaQueryListEvent): void => {
  phone.value = e.matches;
};

/* the range shown */
const ranges = computed(() => rangesOf(props.model, props.plan));
// identical loops: one "Loop" button is enough (the first pass); differing loops keep a button each
const visibleRanges = computed(() => {
  const r = ranges.value;
  const folded = props.plan.blocks.filter((b) => b.key !== "opener").length === 1;
  return folded ? r.filter((x) => !x.key.startsWith("loop") || x.key === "loop1").map((x) => (x.key === "loop1" ? { ...x, label: "Loop" } : x)) : r;
});
const rangeKey = ref<string>(phone.value ? "loop1" : "fight");
const lastPicked = ref<string>(rangeKey.value);
const zoom = ref<{ from: number; to: number } | null>(null);
const range = computed(() => {
  if (rangeKey.value === "zoom" && zoom.value) return zoom.value;
  const r = ranges.value.find((x) => x.key === rangeKey.value) ?? ranges.value[0]!;
  return { from: r.from, to: r.to };
});
function pickRange(key: string): void {
  rangeKey.value = key;
  lastPicked.value = key;
  zoom.value = null;
}
watch(
  () => props.model,
  () => pickRange(phone.value ? "loop1" : "fight"),
);

/* HP lines */
const hp = computed(() => hpLines(props.prefs.hp));
const hpInput = computed(() => (props.prefs.hp > 0 ? hpText(props.prefs.hp) : ""));
function setHp(text: string): void {
  // eslint-disable-next-line vue/no-mutating-props -- the page's reactive preferences object
  props.prefs.hp = text.trim() ? parseHp(text) ?? props.prefs.hp : 0;
}

/* layout */
const root = ref<HTMLElement | null>(null);
const probe = ref<HTMLElement | null>(null);
const width = ref(0);
const plotLeft = GUTTER + 12; // gutter + the grid's column gap (0.75rem)
let ro: ResizeObserver | null = null;
const measure = (): void => {
  width.value = Math.floor(probe.value?.getBoundingClientRect().width ?? 0);
};
watch(probe, (el) => {
  ro?.disconnect();
  if (el && typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(measure);
    ro.observe(el);
  }
  measure();
});
onMounted(() => {
  mq?.addEventListener("change", onMq);
  measure();
});
onBeforeUnmount(() => {
  mq?.removeEventListener("change", onMq);
  ro?.disconnect();
});

const scale = computed<Scale>(() => ({ from: range.value.from, to: range.value.to, width: width.value, fps: props.model.fps }));

/* hover + drag to zoom */
const hover = ref<{ x: number; frame: number; on: ReturnType<typeof onFieldAt>; gauges: Array<{ member: number; name: string; energy: string; concerto: string; energyFull: boolean }>; damage: number } | null>(null);
const drag = ref<{ x0: number; x1: number } | null>(null);
const plotX = (e: PointerEvent): number | null => {
  const box = root.value?.getBoundingClientRect();
  if (!box) return null;
  const x = e.clientX - box.left - plotLeft;
  return x >= 0 && x <= width.value ? x : null;
};
function onMove(e: PointerEvent): void {
  const x = plotX(e);
  if (drag.value) {
    drag.value = { ...drag.value, x1: Math.max(0, Math.min(width.value, e.clientX - (root.value?.getBoundingClientRect().left ?? 0) - plotLeft)) };
    return;
  }
  if (x == null) {
    hover.value = null;
    return;
  }
  const frame = frameAt(scale.value, x);
  const run = props.model.run;
  hover.value = {
    x,
    frame,
    on: onFieldAt(props.model, frame),
    gauges: props.model.gauges.map((g) => {
      const e = valueAt(g.energy, frame);
      const c = valueAt(g.concerto, frame);
      return {
        member: g.member,
        name: run.members[g.member]!.name,
        energy: e == null || !g.maxEnergy ? "—" : `${Math.round((e / g.maxEnergy) * 100)} %`,
        concerto: c == null ? "—" : `${Math.round((c / g.maxConcerto) * 100)} %`,
        energyFull: e != null && g.maxEnergy > 0 && e >= g.maxEnergy,
      };
    }),
    damage: damageAt(props.model, frame),
  };
}
const onLeave = (): void => {
  hover.value = null;
  drag.value = null;
};
function onDown(e: PointerEvent): void {
  if (e.button !== 0) return;
  const x = plotX(e);
  if (x == null) return;
  drag.value = { x0: x, x1: x };
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
}
function onUp(): void {
  const d = drag.value;
  drag.value = null;
  if (!d || Math.abs(d.x1 - d.x0) < 8) return;
  const a = frameAt(scale.value, Math.min(d.x0, d.x1));
  const b = frameAt(scale.value, Math.max(d.x0, d.x1));
  if (b - a < props.model.fps * 0.5) return;
  zoom.value = { from: Math.round(a), to: Math.round(b) };
  rangeKey.value = "zoom";
}

const hueOf = (i: number): string => props.hues.get(props.model.run.members[i]?.name ?? "") ?? "";
const memberName = (i: number): string => props.model.run.members[i]?.name ?? "";
const compact = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n)));
</script>
