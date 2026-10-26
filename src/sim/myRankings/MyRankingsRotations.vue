<template>
  <div class="rots" :data-test-my-rankings-rotations-panel="rank.id">
    <p class="text-xs opacity-60 mb-2">
      Every rotation tried on this build, best first — your saved rotations, the curated presets and wuwa_calc's loops.
      The best one is the row's number.
    </p>
    <ol class="rots__list">
      <li v-for="(r, i) in rank.rotations" :key="`${r.source}:${r.name}:${i}`" class="rots__item" :class="{ 'rots__item--best': i === 0 }">
        <span class="rots__rank font-mono tabular-nums">{{ i + 1 }}</span>
        <PresetNameLabel class="rots__name" :name="r.name" :source="r.source" :owned="owned" hide-main :max-chips="2" />
        <span class="rots__dmg font-mono tabular-nums">{{ fmt(r.avgDamage) }}</span>
        <span class="rots__bar"><span :style="{ width: `${best > 0 ? Math.max(1, (r.avgDamage / best) * 100) : 0}%` }"></span></span>
        <span class="rots__pct font-mono tabular-nums">{{ best > 0 ? `${Math.round((r.avgDamage / best) * 100)}%` : "—" }}</span>
      </li>
    </ol>
    <p v-if="rank.errors.length" class="text-xs text-warning mt-2">
      {{ rank.errors.length }} rotation{{ rank.errors.length === 1 ? "" : "s" }} could not be scored on this build and {{ rank.errors.length === 1 ? "was" : "were" }} skipped:
      <span class="opacity-80">{{ rank.errors.map((e) => e.split(":")[0]).join(" · ") }}</span>
    </p>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ — the "Rotations" tab of a /my-rankings row: every candidate rotation with its score.
import { computed } from "vue";
import PresetNameLabel from "../display/PresetNameLabel.vue";
import type { CharacterRank } from "./rankRoster";
import { fmt } from "./format";

const props = defineProps<{ rank: CharacterRank; owned: string[] }>();
const best = computed(() => props.rank.rotations[0]?.avgDamage ?? 0);
</script>

<style scoped>
.rots__list {
  display: grid;
  gap: 0.15rem;
  max-width: 56rem;
}
.rots__item {
  display: grid;
  grid-template-columns: 1.5rem minmax(0, 1fr) 7rem 8rem 3rem;
  align-items: center;
  gap: 0.75rem;
  padding: 0.35rem 0.5rem;
  border-radius: 0.5rem;
  font-size: 0.82rem;
}
.rots__item--best {
  background: oklch(var(--p) / 0.08);
}
.rots__rank {
  font-size: 0.7rem;
  opacity: 0.5;
}
.rots__dmg {
  text-align: right;
  font-weight: 600;
}
.rots__bar {
  height: 0.35rem;
  border-radius: 9999px;
  background: oklch(var(--bc) / 0.1);
  overflow: hidden;
}
.rots__bar > span {
  display: block;
  height: 100%;
  border-radius: 9999px;
  background: oklch(var(--p) / 0.75);
}
.rots__pct {
  font-size: 0.72rem;
  opacity: 0.6;
  text-align: right;
}
@media (max-width: 767px) {
  .rots__item {
    grid-template-columns: 1.25rem minmax(0, 1fr) auto;
    row-gap: 0.25rem;
  }
  .rots__bar {
    grid-column: 2 / 3;
  }
  .rots__pct {
    grid-column: 3 / 4;
  }
}
</style>
