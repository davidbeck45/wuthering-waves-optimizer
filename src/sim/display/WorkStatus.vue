<template>
  <p class="sr-only" role="status" data-test-work-status>{{ text }}</p>
</template>

<script setup lang="ts">
// Wuthering Tools+ — a long compute said to a screen reader at its start and its end, and nothing in between (critic
// item 9). The pages show the count ticking; a live region around that reads every step ("37 of 104", "38 of 104", …),
// so the count stays out of it and this line says the two things that matter. The region is on the page before its
// words arrive, because a screen reader only reads a change to one it already knows.
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{
  busy: boolean;
  busyText: string;
  /** read when the work has settled, so it can name the outcome; "" says nothing (the page's own alert speaks) */
  doneText: string;
}>();

/** A page's `busy` can drop for a moment between two phases of one job. */
const SETTLE_MS = 400;

const text = ref("");
let started = false;
let settle: ReturnType<typeof setTimeout> | null = null;
const clearSettle = (): void => {
  if (settle) clearTimeout(settle);
  settle = null;
};

onMounted(() => {
  watch(
    () => props.busy,
    (busy) => {
      clearSettle();
      if (busy) {
        started = true;
        text.value = props.busyText;
      } else if (started) {
        settle = setTimeout(() => {
          settle = null;
          started = false;
          text.value = props.doneText;
        }, SETTLE_MS);
      }
    },
    { immediate: true },
  );
});
onBeforeUnmount(clearSettle);
</script>
