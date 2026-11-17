<template>
  <!-- Wuthering Tools+: /account's one-line "3 new things on Tools+ since your last visit". There only while something
       is unseen; opening /whats-new clears it (useWhatsNew.ts). -->
  <RouterLink v-if="whatsNew.count.value" :to="WHATS_NEW_PATH" class="wn-card" data-test-whats-new-card>
    <span class="wn-card__dot" aria-hidden="true"></span>
    <span class="wn-card__text" data-test-whats-new-card-text>{{ unseenText(whatsNew.count.value, whatsNew.hasMarker.value) }}</span>
    <span class="wn-card__go">See what's new ›</span>
  </RouterLink>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import { useWhatsNew } from "./useWhatsNew";
import { WHATS_NEW_PATH, unseenText } from "./whatsNew";

const whatsNew = useWhatsNew();
</script>

<style scoped>
.wn-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.6rem;
  min-height: 2.75rem;
  padding: 0.5rem 0.85rem;
  border-radius: 0.8rem;
  font-size: 0.85rem;
  color: oklch(var(--bc));
  background: oklch(var(--p) / 0.12);
  box-shadow: inset 0 0 0 1px oklch(var(--p) / 0.3);
}
.wn-card:hover,
.wn-card:focus-visible {
  box-shadow: inset 0 0 0 1px oklch(var(--p) / 0.7);
}
.wn-card__dot {
  flex-shrink: 0;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 9999px;
  background: oklch(var(--p));
}
.wn-card__text {
  flex: 1 1 12rem;
  min-width: 0;
  font-weight: 650;
}
.wn-card__go {
  flex-shrink: 0;
  font-size: 0.8rem;
  font-weight: 700;
  color: oklch(var(--p));
}
</style>
