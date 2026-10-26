<template>
  <span class="wt-portrait" :class="{ 'wt-portrait--main': main }" :style="{ '--mem': color, '--size': size, width: size, height: size }" :title="title ?? name">
    <img v-if="!failed" :src="src" :alt="name" loading="lazy" decoding="async" draggable="false" @error="failed = true" />
    <span v-else class="wt-portrait__initials" aria-hidden="true">{{ initials }}</span>
  </span>
</template>

<script setup lang="ts">
// Wuthering Tools+: a resonator's portrait for the /rankings cards and member strip — the app's asset host
// (`characterPortraitUrl`) by this app's key, ringed in Riley's kit colour; initials if it fails to load.
import { computed, ref, watch } from "vue";
import { characterPortraitUrl } from "../../characters/characters";
import { initialsOf } from "./phoneCards";

const props = withDefaults(defineProps<{ appKey: string; name: string; color: string; size?: string; main?: boolean; title?: string }>(), {
  size: "3rem",
  main: false,
  title: undefined,
});
const failed = ref(false);
const src = computed(() => characterPortraitUrl(props.appKey));
const initials = computed(() => initialsOf(props.name));
watch(src, () => {
  failed.value = false;
});
</script>

<style scoped>
.wt-portrait {
  position: relative;
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 9999px;
  background: color-mix(in oklch, var(--mem, oklch(var(--bc))) 22%, oklch(var(--b3)));
  /* the kit colour as a ring, a hair inside the edge so it reads on both themes */
  box-shadow:
    0 0 0 2px oklch(var(--b1)),
    0 0 0 3.5px color-mix(in oklch, var(--mem, oklch(var(--bc))) 85%, transparent);
}
.wt-portrait--main {
  box-shadow:
    0 0 0 2px oklch(var(--b1)),
    0 0 0 4px oklch(var(--p));
}
.wt-portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
}
.wt-portrait__initials {
  font-size: calc(var(--size, 3rem) * 0.36);
  font-weight: 700;
  line-height: 1;
  color: oklch(var(--bc) / 0.85);
}
</style>
