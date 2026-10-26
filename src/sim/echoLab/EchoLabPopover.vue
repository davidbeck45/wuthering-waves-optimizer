<template>
  <div ref="root" class="echo-lab-popover relative inline-flex">
    <button
      type="button"
      class="btn btn-ghost btn-xs btn-circle"
      :aria-expanded="open"
      :aria-label="label"
      :data-test-echo-lab-info="id"
      @click.stop="open = !open">
      <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path stroke-linecap="round" d="M12 11v5M12 8h.01" />
      </svg>
    </button>
    <div
      v-if="open"
      class="echo-lab-popover__panel z-[70] rounded-box border border-base-300 bg-base-100 p-4 text-sm text-base-content shadow-2xl"
      :class="align === 'left' ? 'echo-lab-popover__panel--left' : 'echo-lab-popover__panel--right'"
      role="dialog"
      :aria-label="label"
      :data-test-echo-lab-info-panel="id"
      @click.stop>
      <div class="mb-2 flex items-start justify-between gap-3">
        <h3 class="font-semibold">{{ label }}</h3>
        <button type="button" class="btn btn-ghost btn-xs btn-circle -mr-2 -mt-1" aria-label="Close" @click="open = false">✕</button>
      </div>
      <div class="echo-lab-popover__body space-y-2 leading-relaxed opacity-90">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ Echo Lab — an (i) button with an explanation panel. Below 640 px the panel is a fixed sheet at
// the bottom of the screen, so it can never push the page wider than a phone.
import { onBeforeUnmount, onMounted, ref } from "vue";

withDefaults(defineProps<{ id: string; label: string; align?: "left" | "right" }>(), { align: "right" });

const open = ref(false);
const root = ref<HTMLElement | null>(null);

const onDocument = (event: Event): void => {
  if (open.value && root.value && !root.value.contains(event.target as Node)) open.value = false;
};
const onKey = (event: KeyboardEvent): void => {
  if (event.key === "Escape") open.value = false;
};
onMounted(() => {
  document.addEventListener("click", onDocument);
  document.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener("click", onDocument);
  document.removeEventListener("keydown", onKey);
});
</script>

<style scoped>
.echo-lab-popover__panel {
  position: absolute;
  top: calc(100% + 0.4rem);
  width: min(26rem, calc(100vw - 2rem));
}
.echo-lab-popover__panel--right {
  right: 0;
}
.echo-lab-popover__panel--left {
  left: 0;
}
@media (max-width: 639px) {
  .echo-lab-popover__panel {
    position: fixed;
    top: auto;
    left: 0.5rem;
    right: 0.5rem;
    bottom: 0.5rem;
    width: auto;
    max-height: 70dvh;
    overflow-y: auto;
  }
}
</style>
