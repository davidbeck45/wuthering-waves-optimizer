<template>
  <AnatomySheet ref="sheet" />
</template>

<script setup lang="ts">
// Wuthering Tools+ "Why this number": the one sheet behind every button and the palette command (anatomyRequest.ts).
// PlusShell mounts this lazily on the first request.
import { nextTick, ref, watch } from "vue";
import AnatomySheet from "./AnatomySheet.vue";
import { anatomyRequest } from "./anatomyRequest";

const sheet = ref<InstanceType<typeof AnatomySheet> | null>(null);

watch(
  anatomyRequest,
  async (request) => {
    if (!request) return;
    await nextTick();
    await sheet.value?.open(request);
  },
  { immediate: true },
);
</script>
