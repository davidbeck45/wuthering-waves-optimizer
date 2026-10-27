<template>
  <span class="toa-portraits" :style="{ '--size': size }" :title="title">
    <span v-for="k in keys" :key="k" class="toa-portraits__one" :class="{ 'toa-portraits__one--main': k === main }">
      <img v-if="!failed[k]" :src="characterPortraitUrl(k)" :alt="nameOf(k)" loading="lazy" decoding="async" draggable="false" @error="failed[k] = true" />
      <span v-else class="toa-portraits__initials" aria-hidden="true">{{ initials(nameOf(k)) }}</span>
    </span>
  </span>
</template>

<script setup lang="ts">
// Wuthering Tools+ (/endgame): a team's portraits, overlapping, the main DPS ringed; initials if an image fails.
import { computed, reactive } from "vue";
import { characterPortraitUrl, getCharacterRosterDisplayName } from "../../characters/characters";

const props = withDefaults(defineProps<{ keys: string[]; main?: string | null; size?: string }>(), { main: null, size: "2rem" });
const failed = reactive<Record<string, boolean>>({});
const nameOf = (k: string): string => getCharacterRosterDisplayName(k);
const initials = (name: string): string =>
  name
    .split(/[\s·]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
const title = computed(() => props.keys.map(nameOf).join(" · "));
</script>

<style scoped>
.toa-portraits {
  display: inline-flex;
  flex: none;
  align-items: center;
}
.toa-portraits__one {
  position: relative;
  display: inline-flex;
  width: var(--size);
  height: var(--size);
  flex: none;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 9999px;
  background: oklch(var(--b3));
  box-shadow: 0 0 0 2px oklch(var(--b1));
}
.toa-portraits__one + .toa-portraits__one {
  margin-left: calc(var(--size) * -0.22);
}
.toa-portraits__one--main {
  box-shadow:
    0 0 0 2px oklch(var(--b1)),
    0 0 0 3.5px oklch(var(--p));
  z-index: 1;
}
.toa-portraits__one img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
}
.toa-portraits__initials {
  font-size: calc(var(--size) * 0.36);
  font-weight: 700;
  line-height: 1;
  color: oklch(var(--bc) / 0.8);
}
</style>
