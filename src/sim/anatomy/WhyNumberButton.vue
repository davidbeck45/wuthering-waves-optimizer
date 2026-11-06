<template>
  <button
    type="button"
    class="btn btn-outline gap-1"
    :class="size === 'xs' ? 'btn-xs' : 'btn-sm'"
    :title="`Where ${name}'s damage comes from, one hit opened up, and what moves it most`"
    :data-test-why-number="characterId"
    @click.stop="requestAnatomy(characterId, rotationName)">
    <svg viewBox="0 0 24 24" class="size-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h10M4 17h6M17 14v6m-3-3h6" /></svg>
    <span>{{ label }}</span>
  </button>
</template>

<script setup lang="ts">
// Wuthering Tools+ "Why this number": the button on /my-rankings rows, the /account drawer and the calculator's engine
// panel. It only sends a request, so a long table of these costs nothing.
import { computed } from "vue";
import { characterShortName } from "../display/names";
import { requestAnatomy } from "./anatomyRequest";

const props = withDefaults(defineProps<{ characterId: string; rotationName?: string | null; label?: string; size?: "xs" | "sm" }>(), { rotationName: null, label: "Why this number", size: "xs" });
const name = computed(() => characterShortName(props.characterId) || props.characterId);
</script>
