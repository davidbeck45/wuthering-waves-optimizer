<template>
  <div class="flex flex-col gap-4" data-test-rotation-timeline-phone>
    <!-- time flows down: a sticky row of members, a ruler, one column each -->
    <div class="rounded-box border border-base-300 bg-base-100">
      <div class="sticky top-[80px] z-10 grid gap-1 bg-base-100/95 backdrop-blur px-1 py-1.5 border-b border-base-300 rounded-t-box" :style="{ gridTemplateColumns: COLS }">
        <div></div>
        <div v-for="(m, i) in members" :key="m.name" class="flex items-center gap-1 min-w-0" :data-test-rotation-phone-lane="m.name">
          <MemberAvatar :app-key="m.appKey" :name="m.name" :hue="hueOf(i)" :size="20" />
          <div class="min-w-0">
            <div class="text-xs font-semibold truncate rv-hue-text leading-tight" :style="{ '--hue': hueOf(i) }">{{ m.name }}</div>
            <div class="text-[10px] opacity-60 tabular-nums leading-tight">{{ Math.round(fieldShare(i) * 100) }} % field</div>
          </div>
        </div>
      </div>
      <div class="relative grid gap-1 px-1" :style="{ gridTemplateColumns: COLS, height: `${height}px` }">
        <!-- ruler -->
        <div class="relative">
          <div v-for="t in ticks" :key="t.y" class="absolute right-1 -translate-y-1/2 text-[10px] tabular-nums opacity-60" :style="{ top: `${t.y}px` }">{{ t.label }}</div>
        </div>
        <!-- columns -->
        <div v-for="(_, i) in members" :key="i" class="relative border-l border-base-300/50" :style="{ '--hue': hueOf(i) }">
          <div
            v-for="v in visitsOf(i)"
            :key="v.index"
            class="absolute left-0.5 right-0.5 rounded-md rv-hue-soft"
            :style="{ top: `${v.top}px`, height: `${Math.max(2, v.height)}px` }"
          ></div>
          <div v-for="(l, k) in labelsOf(i)" :key="`l${k}`" class="absolute left-1 right-1 flex items-center gap-1 leading-none" :style="{ top: `${l.y}px` }">
            <span class="w-1.5 h-px bg-base-content/60 shrink-0"></span>
            <span :class="['rv-chip text-[11px] !px-1 !py-0 !opacity-100', `rv-chip--${l.kind}`, { 'rv-chip--forte': l.forte }]">{{ l.text }}</span>
          </div>
          <span
            v-for="(c, k) in checkpointsOf(i)"
            :key="`c${k}`"
            :class="['absolute right-1 size-2.5 rotate-45 rounded-[2px] ring-2 ring-base-100 rv-cp-dot', `rv-cp--${c.kind}`]"
            :style="{ top: `${c.y - 5}px` }"
            :title="c.label"
            data-test-rotation-phone-checkpoint
          ></span>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5 border-t border-base-300 text-[11px] opacity-80" data-test-rotation-phone-legend>
        <span v-for="k in CP_KINDS" :key="k" class="inline-flex items-center gap-1.5">
          <span :class="['inline-block size-2 rotate-45 rounded-[1px] rv-cp-dot', `rv-cp--${k}`]"></span>{{ CP_LABEL[k] }}
        </span>
      </div>
    </div>

    <!-- damage -->
    <div class="rounded-box border border-base-300 bg-base-100 px-3 py-2" data-test-rotation-cumulative>
      <div class="flex flex-wrap items-baseline justify-between gap-x-2">
        <span class="text-xs uppercase tracking-wider opacity-60 whitespace-nowrap">Damage dealt</span>
        <span class="text-sm font-bold tabular-nums whitespace-nowrap">{{ compact(fightTotal) }} <span class="font-normal opacity-60">in {{ durationText(model.frames / model.fps) }}</span></span>
      </div>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" class="mt-1 block w-full h-16 text-primary" aria-hidden="true">
        <path :d="spark.area" fill="currentColor" fill-opacity="0.15" />
        <path :d="spark.line" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke" />
        <line v-for="l in spark.hp" :key="l.hp" x1="0" x2="100" :y1="l.y" :y2="l.y" class="text-base-content" stroke="currentColor" stroke-opacity="0.3" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />
      </svg>
      <div class="mt-2 flex flex-wrap gap-1.5" data-test-rotation-kills>
        <span v-for="k in kills" :key="k.hp" class="badge badge-sm gap-1 tabular-nums" :class="k.extrapolated ? 'badge-ghost' : 'badge-primary badge-outline'" data-test-rotation-kill>
          {{ hpText(k.hp) }} at {{ k.seconds.toFixed(1) }} s<span v-if="k.extrapolated" class="text-[9px] uppercase opacity-70">extrap.</span>
        </span>
      </div>
    </div>

    <!-- buffs, by uptime -->
    <div class="rounded-box border border-base-300 bg-base-100 px-3 py-2">
      <div class="flex items-center justify-between gap-2 mb-2">
        <span class="text-xs uppercase tracking-wider opacity-60">Buffs · uptime</span>
        <div class="join">
          <button v-for="g in GROUPS" :key="g.value" type="button" class="btn btn-xs join-item" :class="group === g.value ? 'btn-primary' : ''" :data-test-rotation-phone-buff-group="g.value" @click="group = g.value">{{ g.label }}</button>
        </div>
      </div>
      <ul class="flex flex-col gap-2">
        <li v-for="row in shownBuffs" :key="row.track.key" class="min-w-0" :data-test-rotation-buff="row.track.name">
          <div class="flex items-baseline gap-2 text-xs min-w-0">
            <span class="size-2 rounded-full shrink-0 rv-hue-dot self-center" :style="{ '--hue': hueOfName(row.track.source) }"></span>
            <span class="truncate flex-1" :title="row.track.name">{{ row.track.source && row.track.name.startsWith(`${row.track.source}: `) ? row.track.name.slice(row.track.source.length + 2) : row.track.name }}</span>
            <span class="tabular-nums shrink-0" :class="row.always ? 'italic opacity-60' : 'font-semibold'">{{ row.always ? "always" : `${Math.round(row.up * 100)} %` }}</span>
          </div>
          <div class="relative mt-0.5 h-1.5 rounded-full bg-base-300 overflow-hidden">
            <span v-for="(w, k) in row.bars" :key="k" class="absolute inset-y-0 rv-hue-dot" :style="{ left: `${w.l}%`, width: `${w.w}%`, '--hue': hueOfName(row.track.source) }"></span>
          </div>
          <div v-if="row.owner" class="text-[10px] opacity-50">on {{ row.owner }}</div>
        </li>
      </ul>
      <button v-if="buffRows.length > shownBuffs.length" type="button" class="btn btn-xs btn-ghost mt-2" data-test-rotation-phone-buffs-all @click="allBuffs = true">Show all {{ buffRows.length }}</button>
      <p class="mt-2 text-[10px] opacity-60">Sampled at presses, over the range shown.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { RunMember } from "../engine/rileyRun";
import { durationText, type CuePlan } from "./cueModel";
import { covered, uptime, type BuffGroup, type CheckpointKind, type KillTime, type RotationModel } from "./extract";
import MemberAvatar from "./MemberAvatar.vue";
import { curvePoints, damageAt, hpText } from "./timelineScale";
import { tokenText, type TokenKind } from "./tokens";

const props = defineProps<{ model: RotationModel; plan: CuePlan; hues: Map<string, string>; range: { from: number; to: number }; hp: number[] }>();

const COLS = "30px repeat(3, minmax(0, 1fr))";
const LABEL_H = 19;
const members = computed<RunMember[]>(() => props.model.run.members);
const hueOf = (i: number): string => props.hues.get(members.value[i]?.name ?? "") ?? "";
const hueOfName = (n: string): string => props.hues.get(n) ?? "";
const fps = computed(() => props.model.fps);
const compact = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n)));
const fightTotal = computed(() => props.model.fightTotal);

const visitsIn = computed(() => props.model.visits.filter((v) => !v.wrap && v.end > props.range.from && v.start < props.range.to));
/** px per second: enough that the busiest visit's presses read one under the other */
const pps = computed(() => {
  let need = 20;
  for (const v of visitsIn.value) {
    const s = (Math.min(v.end, props.range.to) - Math.max(v.start, props.range.from)) / fps.value;
    if (s > 0.3) need = Math.max(need, (v.chips.length * LABEL_H) / s);
  }
  return Math.min(64, need);
});
const yOf = (f: number): number => ((f - props.range.from) / fps.value) * pps.value;
const height = computed(() => Math.ceil(yOf(props.range.to)) + 12);

const ticks = computed(() => {
  const step = pps.value * 2 >= 30 ? 2 : 5;
  const out: Array<{ y: number; label: string }> = [];
  const first = Math.ceil(props.range.from / fps.value / step) * step;
  for (let s = first; s * fps.value <= props.range.to; s += step) {
    out.push({ y: yOf(s * fps.value), label: `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` });
  }
  return out;
});

const fieldShare = (i: number): number => covered(props.model.lanes[i]!.windows, props.range.from, props.range.to) / Math.max(1, props.range.to - props.range.from);
const visitsOf = (i: number) =>
  visitsIn.value
    .filter((v) => v.member === i)
    .map((v) => ({ index: v.index, top: yOf(Math.max(v.start, props.range.from)), height: yOf(Math.min(v.end, props.range.to)) - yOf(Math.max(v.start, props.range.from)) }));
const labelsOf = (i: number): Array<{ y: number; text: string; kind: TokenKind; forte?: boolean }> => {
  const out: Array<{ y: number; text: string; kind: TokenKind; forte?: boolean }> = [];
  for (const v of visitsIn.value.filter((x) => x.member === i)) {
    // at its press, pushed down past the label above; then back up where that runs past the visit's end
    const own: Array<{ y: number; text: string; kind: TokenKind; forte?: boolean }> = [];
    let free = -Infinity;
    for (const c of v.chips) {
      if (c.frame < props.range.from || c.frame > props.range.to) continue;
      const y = Math.max(yOf(c.frame) + 2, free);
      own.push({ y, text: tokenText(c), kind: c.kind, forte: c.forte });
      free = y + LABEL_H;
    }
    const top = yOf(Math.max(v.start, props.range.from)) + 2;
    let limit = yOf(Math.min(v.end, props.range.to)) - LABEL_H;
    for (let k = own.length - 1; k >= 0; k--) {
      own[k]!.y = Math.max(top, Math.min(own[k]!.y, limit));
      limit = own[k]!.y - LABEL_H;
    }
    out.push(...own);
  }
  return out;
};
const CP_LABEL: Record<CheckpointKind, string> = { energy: "R ready", concerto: "Outro ready", tune: "Tune Break" };
const CP_KINDS: CheckpointKind[] = ["energy", "concerto", "tune"];
const checkpointsOf = (i: number) =>
  visitsIn.value
    .filter((v) => v.member === i)
    .flatMap((v) => {
      // inside the visit's own box (an Outro-ready read on the swap's frame would sit on its edge)
      const bottom = yOf(Math.min(v.end, props.range.to)) - 6;
      return v.checkpoints
        .filter((c) => c.frame >= props.range.from && c.frame <= props.range.to)
        .map((c) => ({ kind: c.kind, label: CP_LABEL[c.kind], y: Math.max(yOf(Math.max(v.start, props.range.from)) + 6, Math.min(yOf(c.frame), bottom)) }));
    });

/* damage */
const kills = computed<KillTime[]>(() => props.hp.map((hp) => props.model.killAt(hp)).filter((k): k is KillTime => !!k));
const spark = computed(() => {
  const s = { from: 0, to: props.model.frames, width: 100, fps: fps.value };
  const pts = curvePoints(props.model, s, 0.5);
  const max = Math.max(damageAt(props.model, props.model.frames), 1) * 1.05;
  const y = (d: number): number => 40 - (d / max) * 38;
  const line = pts.map(([x, d], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y(d).toFixed(2)}`).join("");
  return { line, area: `${line}L100,40L0,40Z`, hp: props.hp.filter((hp) => hp < max).map((hp) => ({ hp, y: y(hp) })) };
});

/* buffs */
const GROUPS: Array<{ value: BuffGroup; label: string }> = [
  { value: "team", label: "Team" },
  { value: "self", label: "Self" },
  { value: "enemy", label: "Enemy" },
];
const group = ref<BuffGroup>("team");
const allBuffs = ref(false);
const buffRows = computed(() => {
  const { from, to } = props.range;
  return props.model.buffs
    .filter((b) => b.group === group.value)
    .map((track) => {
      const up = uptime(track, from, to);
      const bars = track.windows
        .filter(([a, b]) => b > from && a < to)
        .map(([a, b]) => ({ l: ((Math.max(a, from) - from) / (to - from)) * 100, w: ((Math.min(b, to) - Math.max(a, from)) / (to - from)) * 100 }));
      return { track, up, always: track.permanent && up >= 0.995, bars, owner: track.owner >= 0 ? members.value[track.owner]?.name ?? "" : "" };
    })
    .filter((r) => r.up > 0)
    .sort((a, b) => b.up - a.up || a.track.name.localeCompare(b.track.name));
});
const shownBuffs = computed(() => (allBuffs.value ? buffRows.value : buffRows.value.slice(0, 12)));
</script>
