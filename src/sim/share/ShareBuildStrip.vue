<template>
  <!-- Wuthering Tools+: a slim bar above upstream's build card (Calculator.vue's build-card screen, one hook line) —
       the plus share sheet makes a card that carries the build, which upstream's 1920 × 1080 export does not. -->
  <div
    v-if="character"
    class="share-strip mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2"
    data-test-share-strip>
    <svg viewBox="0 0 24 24" class="size-5 shrink-0 text-primary" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7l8-4 8 4-8 4-8-4zm0 5l8 4 8-4M4 17l8 4 8-4" /></svg>
    <div class="min-w-0 flex-1 text-sm">
      <span class="font-semibold">Share a card that carries this build</span>
      <span class="text-base-content/70 max-sm:block"> — anyone (or your phone) can drop it on Wuthering Tools+ to load it exactly.</span>
    </div>
    <div class="flex items-center gap-2">
      <RouterLink to="/share" class="btn btn-sm btn-ghost" data-test-share-strip-import>Import a card</RouterLink>
      <ShareButton :source="{ kind: 'build', charId: character }" label="Share…" variant="primary" />
    </div>
  </div>
</template>

<script setup lang="ts">
import ShareButton from "./ShareButton.vue";

defineProps<{ character: string }>();
</script>
