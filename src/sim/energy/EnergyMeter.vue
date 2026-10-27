<template>
  <div class="en-meter-wrap" :data-test-energy-meter="status">
    <div class="en-meter" :class="`en-meter--${status}`" role="img" :aria-label="label">
      <div v-if="have != null" class="en-meter__fill" :style="{ width: `${at(have)}%` }"></div>
      <div v-if="need != null" class="en-meter__need" :style="{ left: `${at(need)}%` }"></div>
    </div>
    <div v-if="need != null && showLabel" class="en-meter__scale" aria-hidden="true">
      <span class="en-meter__need-label" :style="needLabelStyle">{{ needWord }} {{ needText(need) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ — a member's ER as a meter: the build's ER fills from the base 100 %, the need is a tick with its
// label under it. The fill takes the status colour; the chip beside it carries the icon and the word.
import { computed } from "vue";
import { haveText, needText } from "./energyFormat";
import "./energy.css";

const props = withDefaults(defineProps<{ have: number | null; need: number | null; status: string; showLabel?: boolean; /** "need", or "kit floor" where the kit's own minimum sets it */ needWord?: string }>(), {
  showLabel: true,
  needWord: "need",
});

const lo = 100;
const hi = computed(() => {
  const top = Math.max(props.need ?? 0, props.have ?? 0, 130);
  return Math.ceil((top * 1.06) / 10) * 10;
});
const at = (v: number): number => Math.max(0, Math.min(100, ((v - lo) / (hi.value - lo)) * 100));
const needLabelStyle = computed(() => {
  const x = at(props.need ?? lo);
  // keep the label inside the track: anchored left near the start, right near the end
  if (x < 18) return { left: "0", textAlign: "left" as const };
  if (x > 82) return { right: "0", textAlign: "right" as const };
  return { left: `${x}%`, transform: "translateX(-50%)" };
});
const label = computed(() =>
  props.need == null ? `Energy Regen ${haveText(props.have)}, no energy gate` : props.have == null ? `Needs ${needText(props.need)} Energy Regen` : `Energy Regen ${haveText(props.have)} against a ${props.needWord} of ${needText(props.need)}`,
);
</script>

<style scoped>
.en-meter-wrap {
  min-width: 0;
}
.en-meter__scale {
  position: relative;
  height: 0.7rem;
  margin-top: 0.4rem;
  font-size: 0.68rem;
  line-height: 1;
  color: var(--en-ink-3);
  font-variant-numeric: tabular-nums;
}
.en-meter__need-label {
  position: absolute;
  top: 0;
  white-space: nowrap;
  color: var(--en-ink-2);
  font-weight: 600;
}
</style>
