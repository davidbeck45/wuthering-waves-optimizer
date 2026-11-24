<template>
  <!-- Wuthering Tools+: Ask Claude in Ryan's v3 phone header, beside Tools+ (askDock.ts). The floating button it replaces
       sat over the right-hand figures of every list on a phone (the Tier list's team damage, Roster value's gains) -->
  <button
    type="button"
    class="plus-header-ask"
    :class="{ 'plus-header-ask--on': open }"
    title="Ask Claude about your account"
    aria-label="Ask Claude"
    :aria-expanded="open"
    data-test-ai-open
    data-test-ai-open-header
    @click="assistant.toggle()">
    <span class="plus-header-ask__pill">
      <span v-if="assistant.state.busy" class="loading loading-spinner loading-xs" aria-hidden="true"></span>
      <svg v-else viewBox="0 0 24 24" class="size-5" fill="currentColor" aria-hidden="true"><path :d="SPARKLE" /></svg>
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from "vue";
import { useAssistant } from "../ai/useAssistant";
import { dockAskInNav } from "../shell/askDock";

const SPARKLE = "M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9L12 2.5zm6.5 11.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z";
const assistant = useAssistant();
const open = computed(() => assistant.state.open && !assistant.state.collapsed);

let undock: (() => void) | null = null;
onMounted(() => {
  undock = dockAskInNav();
});
onBeforeUnmount(() => undock?.());
</script>

<style scoped>
/* a 44 px tap target; the pill is the floating button's colour, so it reads as the same Ask */
.plus-header-ask {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 9999px;
}
.plus-header-ask:focus-visible {
  outline: 2px solid oklch(var(--p));
  outline-offset: 1px;
}
.plus-header-ask__pill {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 9999px;
  color: oklch(var(--pc));
  background: oklch(var(--p));
  box-shadow: 0 4px 12px -4px oklch(var(--p) / 0.6);
}
.plus-header-ask--on .plus-header-ask__pill {
  box-shadow: 0 0 0 2px oklch(var(--b3)), 0 0 0 4px oklch(var(--p));
}
</style>
<style scoped>
/* style.css paints every `.navbar svg path` solid black on light themes (for upstream's filled icons) */
:root[data-theme-style="light"] .plus-header-ask svg path {
  fill: currentColor !important;
}
</style>
