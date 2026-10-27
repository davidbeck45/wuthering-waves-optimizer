<template>
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="status === 'ok'">
      <circle cx="8" cy="8" r="6.2" />
      <path d="M5.3 8.2l1.8 1.8 3.6-3.8" />
    </template>
    <template v-else-if="status === 'tight'">
      <path d="M8 2.2l6.1 10.9H1.9z" />
      <path d="M8 6.6v2.9M8 11.3v.1" />
    </template>
    <template v-else-if="status === 'short'">
      <circle cx="8" cy="8" r="6.2" />
      <path d="M8 4.8v3.9M8 11v.1" />
    </template>
    <template v-else-if="status === 'noGate'">
      <circle cx="8" cy="8" r="6.2" />
      <path d="M5.2 8h5.6" />
    </template>
    <template v-else-if="status === 'error'">
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
    </template>
    <template v-else>
      <circle cx="8" cy="8" r="6.2" stroke-dasharray="2.2 2.2" />
    </template>
  </svg>
</template>

<script setup lang="ts">
// Wuthering Tools+ — the energy check's status glyphs: ok ✓, tight △, short !, no gate –, failed ×, not measured ◌.
defineProps<{ status: string }>();
</script>
