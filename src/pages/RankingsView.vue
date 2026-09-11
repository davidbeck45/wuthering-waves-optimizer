<template>
  <Nav cur-page="rankings" :disable-mobile-nav="true"></Nav>
  <div class="rankings-page">
    <div ref="host" class="skittle-host"></div>
    <p class="rankings-credit text-xs opacity-60 px-3 py-1">
      Team rankings engine, rotations and solves by
      <a href="https://github.com/Riley31415/wuwa_calc" target="_blank" rel="noopener" class="link">Riley31415/wuwa_calc</a>
      (ISC), running in-page from the pinned submodule.
    </p>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Nav from "../components/navigation/Nav.vue";
import { mountRankings, onLocationChange, unmountRankings } from "../sim/rankings/controller";
import "../sim/skittle.css";

const host = ref<HTMLElement | null>(null);
const router = useRouter();
const route = useRoute();

onMounted(() => {
  if (host.value) void mountRankings(host.value, router);
});
onBeforeUnmount(() => unmountRankings());
// browser back/forward and nav clicks change the hash without a hashchange event we can rely on
watch(() => route.fullPath, () => onLocationChange());
</script>

<style>
.rankings-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 80px - var(--announce-banner-h, 0px));
  min-height: 0;
}
.skittle-host {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
}
/* his `html`/`body` rules become `.skittle-root { height: 100vh; … }` after scoping; the host sizes it instead */
.skittle-root {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  margin: 0 !important;
  overflow: hidden !important;
}
.skittle-root #app {
  height: 100% !important;
  overflow: auto !important;
}
</style>
