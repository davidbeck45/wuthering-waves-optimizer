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
import { storeToRefs } from "pinia";
import { characterPortraitUrl } from "../../characters/characters";
import { useCharacterStore } from "../../stores/character";
import { accountKeyOf } from "../rankings/rileyNames";

const props = withDefaults(defineProps<{ appKey: string; name: string; hue?: string; size?: number }>(), { hue: "", size: 24 });
// wuwa_calc's run names a Rover by the female key (his one form per element): the portrait is the Rover this account plays
const { characters } = storeToRefs(useCharacterStore()) as unknown as { characters: { value: Record<string, any> } };
const url = computed(() => characterPortraitUrl(accountKeyOf(props.appKey, characters.value)));
</script>
