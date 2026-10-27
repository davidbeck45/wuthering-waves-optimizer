<template>
  <span
    class="inline-block shrink-0 rounded-full bg-base-300 bg-cover bg-center rv-hue-ring"
    :style="{ width: `${size}px`, height: `${size}px`, backgroundImage: `url(${url})`, '--hue': hue || undefined }"
    :title="name"
    role="img"
    :aria-label="name"
  ></span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { characterPortraitUrl } from "../../characters/characters";

const props = withDefaults(defineProps<{ appKey: string; name: string; hue?: string; size?: number }>(), { hue: "", size: 24 });
const url = computed(() => characterPortraitUrl(props.appKey));
</script>
