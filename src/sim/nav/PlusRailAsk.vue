<template>
  <!-- Wuthering Tools+: Ask Claude as a v3 rail item (askDock.ts); Ctrl J still toggles the panel from anywhere -->
  <button
    type="button"
    class="plus-rail-ask"
    :class="{ 'plus-rail-ask--on': open }"
    :title="`Ask Claude about your account (${modKey}+J)`"
    aria-label="Ask Claude"
    :aria-expanded="open"
    data-test-ai-open
    data-test-ai-open-rail
    @click="assistant.toggle()">
    <span class="plus-rail-ask__pill">
      <span v-if="assistant.state.busy" class="loading loading-spinner loading-xs" aria-hidden="true"></span>
      <svg v-else viewBox="0 0 24 24" class="size-5" fill="currentColor" aria-hidden="true"><path :d="SPARKLE" /></svg>
    </span>
    <span>Ask</span>
  </button>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from "vue";
import { useAssistant } from "../ai/useAssistant";
import { dockAskInRail } from "../shell/askDock";
import { modKeyLabel } from "../shell/shellDom";

const SPARKLE = "M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9L12 2.5zm6.5 11.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z";
const assistant = useAssistant();
const modKey = modKeyLabel();
const open = computed(() => assistant.state.open && !assistant.state.collapsed);

let undock: (() => void) | null = null;
onMounted(() => {
  undock = dockAskInRail();
});
onBeforeUnmount(() => undock?.());
</script>

<style scoped>
/* NavRail's own item, copied (its styles are scoped), with the primary colour so it reads as the one action in the rail */
.plus-rail-ask {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  min-width: 0;
  padding: 0.4rem 0;
  border-radius: 0.75rem;
  font-size: 0.6875rem;
  font-weight: 600;
  white-space: nowrap;
  color: oklch(var(--bc));
  opacity: 0.85;
}
.plus-rail-ask:hover,
.plus-rail-ask--on {
  opacity: 1;
}
.plus-rail-ask:focus-visible {
  outline: 2px solid oklch(var(--p));
  outline-offset: 2px;
}
.plus-rail-ask__pill {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.25rem;
  height: 2rem;
  border-radius: 999px;
  color: oklch(var(--p));
  background: oklch(var(--p) / 0.12);
  transition: background-color 0.15s;
}
.plus-rail-ask:hover .plus-rail-ask__pill {
  background: oklch(var(--p) / 0.2);
}
.plus-rail-ask--on .plus-rail-ask__pill {
  color: oklch(var(--pc));
  background: oklch(var(--p));
}
</style>
