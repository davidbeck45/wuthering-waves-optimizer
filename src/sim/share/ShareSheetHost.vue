<template>
  <ShareSheet ref="sheet" />
</template>

<script setup lang="ts">
// Wuthering Tools+ share cards: the sheet for a share asked from outside a page (the command palette's "Share …"
// commands, shareRequest.ts). PlusShell mounts this lazily on the first request.
import { nextTick, ref, watch } from "vue";
import ShareSheet from "./ShareSheet.vue";
import { shareRequest } from "./shareRequest";

const sheet = ref<InstanceType<typeof ShareSheet> | null>(null);

watch(
  shareRequest,
  async (request) => {
    if (!request) return;
    await nextTick();
    await sheet.value?.open(request.source);
  },
  { immediate: true },
);
</script>
