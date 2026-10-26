<template>
  <span
    class="wt-avatar"
    :class="{ 'wt-avatar--ring': !!ring }"
    :style="{ width: `${size}px`, height: `${size}px`, '--wt-ring': ring ?? undefined }"
    :title="title ?? name">
    <img v-if="drawable" :src="characterPortraitUrl(id)" :alt="name" loading="lazy" decoding="async" class="wt-avatar__img" />
    <span v-else class="wt-avatar__fallback" :style="{ fontSize: `${Math.max(9, Math.round(size * 0.36))}px` }">{{ initials }}</span>
    <span
      v-if="dot && meta?.element"
      class="wt-avatar__dot"
      :style="{ background: elementColor(meta.element), width: `${dotSize}px`, height: `${dotSize}px` }"
      :title="meta.element"></span>
  </span>
</template>

<script setup lang="ts">
// Wuthering Tools+ — a round character portrait with an optional element dot and colour ring. Unknown or
// unreleased keys draw initials instead of fetching art (see isRosterCharacter).
import { computed } from "vue";
import { characterDisplayName, characterMeta, characterPortraitUrl, elementColor, isRosterCharacter } from "./names";

const props = withDefaults(
  defineProps<{
    id: string;
    size?: number;
    /** element dot at the bottom right */
    dot?: boolean;
    /** a ring colour (e.g. the member's colour in a team bar) */
    ring?: string | null;
    title?: string | null;
  }>(),
  { size: 40, dot: false, ring: null, title: null },
);

const name = computed(() => characterDisplayName(props.id));
const meta = computed(() => characterMeta(props.id));
const drawable = computed(() => isRosterCharacter(props.id));
const initials = computed(() =>
  name.value
    .replace(/\(.*\)/, "")
    .split(/[\s:]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase(),
);
const dotSize = computed(() => Math.max(7, Math.round(props.size * 0.26)));
</script>

<style scoped>
.wt-avatar {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  border-radius: 9999px;
  background: oklch(var(--b3));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.12);
}
.wt-avatar--ring {
  box-shadow: 0 0 0 2px var(--wt-ring);
}
.wt-avatar__img {
  width: 100%;
  height: 100%;
  border-radius: 9999px;
  object-fit: cover;
}
.wt-avatar__fallback {
  margin: auto;
  font-weight: 700;
  opacity: 0.7;
}
.wt-avatar__dot {
  position: absolute;
  right: -1px;
  bottom: -1px;
  border-radius: 9999px;
  box-shadow: 0 0 0 2px oklch(var(--b1));
}
</style>
