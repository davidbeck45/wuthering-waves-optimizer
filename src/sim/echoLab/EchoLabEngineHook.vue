<template>
  <EchoLabEngineView :character="character" />
</template>

<script setup lang="ts">
// Wuthering Tools+ Echo Lab — the one component upstream's v3 Echo Insights panel renders (CalculatorEchoInsightsPanel.vue,
// a one-line hook). It only loads the engine panel's chunk; the panel itself starts its worker job once it is on screen.
import { defineAsyncComponent } from "vue";

defineProps<{ character: string }>();
const EchoLabEngineView = defineAsyncComponent(() => import("./EchoLabEngineView.vue"));
</script>
