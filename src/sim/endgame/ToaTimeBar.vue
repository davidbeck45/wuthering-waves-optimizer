<template>
  <div class="toa-bar" :class="`toa-bar--c${crests}`" role="img" :aria-label="aria" data-test-toa-timebar>
    <!-- crest zones: three crests at the left, none past the last boundary -->
    <div v-for="z in zones" :key="z.crests" class="toa-bar__zone" :class="`toa-bar__zone--c${z.crests}`" :style="{ left: pct(z.from), width: pct(z.to - z.from) }"></div>
    <div v-if="seconds !== null" class="toa-bar__fill" :style="{ width: pct(Math.min(seconds, clock)) }">
      <div v-if="fightSeconds && seconds > fightSeconds" class="toa-bar__extra" :style="{ left: pct(fightSeconds, seconds), width: pct(seconds - fightSeconds, seconds) }"></div>
    </div>
    <div v-for="b in boundaries" :key="b" class="toa-bar__tick" :style="{ left: pct(b) }"></div>
    <div v-if="you !== null && you !== undefined" class="toa-bar__you" :style="{ left: pct(Math.min(you, clock)) }" title="your logged clear"></div>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ (/endgame): the 300 s clock as a bar — crest zones (boundaries at 300 − each goal), the kill time
// filled in its crest's colour, the part past Riley's ~100 s run hatched (extrapolated), the player's own clear as a tick.
import { computed } from "vue";
import { crestBoundaries } from "./crests";

const props = withDefaults(defineProps<{ goals: number[]; seconds: number | null; crests: number; fightSeconds?: number; you?: number | null; clock?: number }>(), {
  fightSeconds: undefined,
  you: null,
  clock: 300,
});

const pct = (x: number, of = props.clock): string => `${Math.max(0, Math.min(100, (x / of) * 100))}%`;
const boundaries = computed(() => [...new Set(crestBoundaries(props.goals, props.clock).filter((b) => b > 0 && b < props.clock))].sort((a, b) => a - b));
const zones = computed(() => {
  const marks = [0, ...boundaries.value, props.clock];
  const total = props.goals.length;
  // left to right: the most crests first
  return marks.slice(0, -1).map((from, i) => ({ from, to: marks[i + 1]!, crests: Math.max(0, total - i) }));
});
const aria = computed(() => (props.seconds === null ? "no clear within 5:00" : `kill at ${Math.round(props.seconds)} s of 300, ${props.crests} crests`));
</script>

<style scoped>
.toa-bar {
  position: relative;
  height: 0.5rem;
  border-radius: 9999px;
  overflow: hidden;
  background: oklch(var(--b3) / 0.6);
}
.toa-bar__zone {
  position: absolute;
  top: 0;
  bottom: 0;
}
.toa-bar__zone--c3 {
  background: oklch(var(--su) / 0.14);
}
.toa-bar__zone--c2 {
  background: oklch(var(--in) / 0.12);
}
.toa-bar__zone--c1 {
  background: oklch(var(--wa) / 0.12);
}
.toa-bar__zone--c0 {
  background: oklch(var(--er) / 0.1);
}
.toa-bar__fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: 9999px;
  background: oklch(var(--er));
}
.toa-bar--c1 .toa-bar__fill {
  background: oklch(var(--wa));
}
.toa-bar--c2 .toa-bar__fill {
  background: oklch(var(--in));
}
.toa-bar--c3 .toa-bar__fill {
  background: oklch(var(--su));
}
.toa-bar__extra {
  position: absolute;
  top: 0;
  bottom: 0;
  background-image: repeating-linear-gradient(-45deg, oklch(var(--b1) / 0.55) 0 3px, transparent 3px 6px);
}
.toa-bar__tick {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: oklch(var(--bc) / 0.35);
}
.toa-bar__you {
  position: absolute;
  top: -1px;
  bottom: -1px;
  width: 3px;
  margin-left: -1px;
  border-radius: 2px;
  background: oklch(var(--bc));
}
</style>
