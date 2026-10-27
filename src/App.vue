<script setup lang="ts">
import AppLayout from "./layouts/AppLayout.vue";
import PlusShell from "./sim/shell/PlusShell.vue"; // Wuthering Tools+: Claude assistant + command palette (src/sim/shell)
</script>

<template>
  <AppLayout></AppLayout>
  <PlusShell /><!-- Wuthering Tools+: the Ask button, the assistant panel, Ctrl/Cmd+K -->
</template>

<style scoped></style>
