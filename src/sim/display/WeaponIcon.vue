<template>
  <span
    class="wt-weapon"
    :style="{ width: `${size}px`, height: `${size}px`, '--wt-rarity': rarityColor(meta?.rarity ?? 0) }"
    :title="title ?? `${name}${meta ? ` · ${meta.rarity}★` : ''}`">
    <img v-if="weaponKey && !failed" :src="weaponIconUrl(weaponKey)" :alt="name" loading="lazy" decoding="async" class="wt-weapon__img" @error="failed = true" />
    <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="wt-weapon__none" aria-hidden="true"><path d="M14.5 4.5l5 5L9 20l-5 0 0-5z" /></svg>
  </span>
</template>

<script setup lang="ts">
// Wuthering Tools+ — a weapon's art on a tile with its rarity colour (the asset host upstream's pickers use).
import { computed, ref, watch } from "vue";
import { rarityColor, weaponDisplayName, weaponIconUrl, weaponMeta } from "./names";

const props = withDefaults(defineProps<{ weaponKey: string | null; size?: number; title?: string | null }>(), { size: 28, title: null });
const meta = computed(() => weaponMeta(props.weaponKey));
const name = computed(() => weaponDisplayName(props.weaponKey) || "No weapon");
const failed = ref(false);
watch(
  () => props.weaponKey,
  () => (failed.value = false),
);
</script>

<style scoped>
.wt-weapon {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 0.45rem;
  background: linear-gradient(160deg, oklch(var(--b3)), color-mix(in oklab, var(--wt-rarity) 22%, oklch(var(--b3))));
  box-shadow:
    inset 0 -2px 0 var(--wt-rarity),
    inset 0 0 0 1px oklch(var(--bc) / 0.08);
  overflow: hidden;
}
.wt-weapon__img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.wt-weapon__none {
  width: 60%;
  height: 60%;
  opacity: 0.4;
}
</style>
