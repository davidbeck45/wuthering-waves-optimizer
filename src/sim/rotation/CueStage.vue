<template>
  <div :class="['flex flex-col min-h-0', compact ? 'h-full p-2 gap-1 text-sm' : 'h-full gap-3']" data-test-rotation-stage>
    <!-- now -->
    <div
      role="button"
      tabindex="0"
      class="flex-1 min-h-0 flex flex-col text-left cursor-pointer select-none focus:outline-none"
      :class="compact ? 'gap-1 justify-start' : 'gap-3 justify-center'"
      :aria-label="player.state.value.started ? 'Next swap' : 'Start the clock'"
      data-test-rotation-stage-tap
      @click="player.advance()"
    >
      <div v-if="step" class="flex items-center gap-2 w-full min-w-0">
        <span class="text-[0.7em] uppercase tracking-wider opacity-60 shrink-0" :class="compact ? 'hidden' : ''">Now</span>
        <MemberAvatar :app-key="member(step.visit.member).appKey" :name="member(step.visit.member).name" :hue="hueOf(step.visit.member)" :size="compact ? 22 : 44" />
        <span class="font-bold truncate rv-hue-text" :class="compact ? 'text-base' : 'text-2xl sm:text-3xl'" :style="{ '--hue': hueOf(step.visit.member) }" data-test-rotation-now>{{ member(step.visit.member).name }}</span>
        <span class="ml-auto tabular-nums shrink-0 text-right" :class="compact ? 'text-sm' : 'text-xl sm:text-2xl'" data-test-rotation-step-clock>
          <span :class="overTime ? 'text-warning' : ''">{{ player.elapsed.value.step.toFixed(1) }}</span><span class="opacity-50"> / {{ player.expected.value.toFixed(1) }} s</span>
        </span>
      </div>
      <div v-if="step" class="w-full h-1.5 rounded-full bg-base-300 overflow-hidden shrink-0" aria-hidden="true">
        <div class="h-full rounded-full rv-hue-dot transition-[width] duration-100" :style="{ width: `${Math.min(100, progress * 100)}%`, '--hue': hueOf(step.visit.member) }"></div>
      </div>
      <div v-if="step" :class="compact ? 'text-base leading-snug' : 'rv-now-chips'" data-test-rotation-now-chips>
        <CueChips :visit="step.visit" :cancels="!compact" />
      </div>
      <div v-if="!player.state.value.started" class="text-[0.85em] opacity-70" :class="compact ? '' : 'mt-2'" data-test-rotation-start-hint>
        {{ compact ? "Click or press Space to start" : "Tap anywhere or press Space to start the clock, then tap on every swap." }}
      </div>
      <div v-else-if="player.state.value.pausedAt != null" class="text-[0.85em] text-warning">Paused — press P or the pause button to go on.</div>
      <div v-if="next && step" class="flex items-baseline gap-2 min-w-0 opacity-50" :class="compact ? 'text-xs' : 'text-base mt-2'" data-test-rotation-next>
        <span class="uppercase tracking-wider text-[0.75em] shrink-0">Next</span>
        <span class="font-semibold shrink-0 rv-hue-text" :style="{ '--hue': hueOf(next.visit.member) }">{{ member(next.visit.member).name }}</span>
        <span class="truncate font-mono">{{ next.visit.chips.map(tokenText).join(" › ") }}</span>
      </div>
    </div>

    <!-- progress + lap -->
    <div class="shrink-0 flex flex-col gap-2">
      <div v-if="!compact" class="flex flex-wrap items-center gap-1" data-test-rotation-dots>
        <template v-for="(s, i) in steps" :key="i">
          <span v-if="i > 0 && s.section !== steps[i - 1]!.section" class="w-2"></span>
          <button
            type="button"
            class="size-3 rounded-full border border-base-content/30 transition-transform"
            :class="[i === player.state.value.step ? 'scale-125 rv-hue-dot border-transparent' : i < player.state.value.step ? 'bg-base-content/40' : 'bg-transparent']"
            :style="{ '--hue': hueOf(s.visit.member) }"
            :title="`${s.label}: ${member(s.visit.member).name}`"
            :aria-label="`Go to ${s.label}, ${member(s.visit.member).name}`"
            :data-test-rotation-dot="i"
            @click.stop="player.jump(i)"
          ></button>
        </template>
      </div>
      <div class="flex items-center gap-2 tabular-nums" :class="compact ? 'text-xs' : 'text-sm'" data-test-rotation-lap>
        <span class="opacity-60">{{ step?.label ?? "" }}</span>
        <span class="font-semibold">{{ player.elapsed.value.lap.toFixed(1) }} s</span>
        <span class="opacity-50">/ {{ player.lapTarget.value.toFixed(1) }} s</span>
        <span v-if="compact" class="ml-auto flex gap-1">
          <button type="button" class="btn btn-xs btn-ghost" aria-label="Previous swap" data-test-rotation-stage-back @click.stop="player.back()">◀</button>
          <button type="button" class="btn btn-xs btn-ghost" aria-label="Next swap" data-test-rotation-stage-next @click.stop="player.advance()">▶</button>
        </span>
      </div>
      <div v-if="!compact && laps.length" class="flex flex-wrap gap-1 text-xs" data-test-rotation-laps>
        <span v-for="(lap, i) in laps" :key="i" class="badge badge-ghost gap-1 tabular-nums" :title="`Engine: ${lap.target.toFixed(2)} s`">
          {{ lap.section === 0 ? "Opener" : `Loop ${lap.section}` }} {{ lap.seconds.toFixed(1) }} s
          <span :class="lap.seconds - lap.target > 0.05 ? 'opacity-70' : 'text-success'">{{ gapText(lap.seconds, lap.target) }}</span>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Keys (Space / Enter / arrows / P) are handled once per window by the host — CuePlay.vue on the page, CueCard.vue's
// listener on the pop-out window — so nothing in here listens for them: a focused stage would advance twice.
import { computed } from "vue";
import type { RunMember } from "../engine/rileyRun";
import CueChips from "./CueChips.vue";
import type { CuePlan } from "./cueModel";
import MemberAvatar from "./MemberAvatar.vue";
import { gapText } from "./player";
import { tokenText } from "./tokens";
import type { Player } from "./usePlayer";

const props = withDefaults(defineProps<{ player: Player; plan: CuePlan; members: RunMember[]; hues: Map<string, string>; compact?: boolean }>(), { compact: false });

const steps = computed(() => props.plan.steps);
const step = computed(() => props.player.step.value);
const next = computed(() => props.player.next.value);
const laps = computed(() => props.player.state.value.laps.slice(-8));
const progress = computed(() => (props.player.expected.value > 0 ? props.player.elapsed.value.step / props.player.expected.value : 0));
const overTime = computed(() => props.player.state.value.started && progress.value > 1);
const member = (i: number): RunMember => props.members[i]!;
const hueOf = (i: number): string => props.hues.get(props.members[i]?.name ?? "") ?? "";
</script>
