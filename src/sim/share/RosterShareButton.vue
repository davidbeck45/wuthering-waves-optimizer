<template>
  <!-- Wuthering Tools+ share cards: "Share my roster" — opens the My roster sheet. The sheet (and the card code) loads
       on the first tap, so the page that shows the button pays nothing for it. -->
  <button v-bind="$attrs" type="button" class="btn btn-sm gap-1.5 roster-share-btn" data-test-roster-share-button @click.stop="open">
    <svg viewBox="0 0 24 24" class="size-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <path d="M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v4H4zM14 15h6v4h-6z" />
    </svg>
    <span>{{ label }}</span>
  </button>
  <RosterSheet v-if="mounted" ref="sheet" />
</template>

<script setup lang="ts">
import { defineAsyncComponent, nextTick, ref } from "vue";

const RosterSheet = defineAsyncComponent(() => import("./RosterSheet.vue"));

// two root nodes (the button and the lazily mounted sheet): a parent's class / data-* go on the button
defineOptions({ inheritAttrs: false });
withDefaults(defineProps<{ label?: string }>(), { label: "Share my roster" });

const mounted = ref(false);
const sheet = ref<{ open: () => Promise<void> } | null>(null);

async function open() {
  mounted.value = true;
  // the async component resolves on a later tick: wait for its instance
  for (let i = 0; i < 100 && !sheet.value; i++) await new Promise((r) => setTimeout(r, 20));
  await nextTick();
  await sheet.value?.open();
}
</script>

<style scoped>
.roster-share-btn {
  min-height: 2.75rem;
}
@media (min-width: 768px) {
  .roster-share-btn {
    min-height: 2rem;
  }
}
</style>
