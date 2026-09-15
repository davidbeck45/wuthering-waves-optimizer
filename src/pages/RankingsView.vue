<template>
  <Nav cur-page="rankings" :disable-mobile-nav="true"></Nav>
  <div class="rankings-page">
    <RankingsAccountBar :account="account" :built-count="myBuilds.length" />
    <div ref="host" class="skittle-host"></div>
    <p class="rankings-credit text-xs opacity-60 px-3 py-1">
      Team rankings engine, rotations and solves by
      <a href="https://github.com/Riley31415/wuwa_calc" target="_blank" rel="noopener" class="link">Riley31415/wuwa_calc</a>
      (ISC), running in-page from the pinned submodule.
      <RouterLink to="/my-rankings" class="link link-primary ml-2" data-test-rankings-switch-mine>My roster rankings ▸</RouterLink>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import Nav from "../components/navigation/Nav.vue";
import { useCharacterStore } from "../stores/character";
import { useInventoryStore } from "../stores/inventory";
import { useTeamRotationsStore } from "../stores/teamRotations";
import { mountRankings, onLocationChange, unmountRankings, updateAccountState, updateMyBuilds } from "../sim/rankings/controller";
import { buildRollsOf } from "../sim/rankings/myBuilds";
import { accountKeyOf, accountStateOf, rileyAccountEntries } from "../sim/account/accountState";
import RankingsAccountBar from "../sim/rankings/RankingsAccountBar.vue";
import "../sim/skittle.css";
import "../sim/skittle-theme.css";

const host = ref<HTMLElement | null>(null);
const router = useRouter();
const route = useRoute();
// the player's equipped echoes, as the engine's "My build" substat rows (see src/sim/rankings/myBuilds.ts)
const characterStore = useCharacterStore();
const inventoryStore = useInventoryStore();
const { characters } = storeToRefs(characterStore) as unknown as { characters: { value: Record<string, Record<string, unknown>> } };
const myBuilds = computed(() => buildRollsOf(characters.value ?? {}, (inventoryStore.echoes ?? []) as Array<Record<string, unknown>>));
// the Account State (src/sim/account): the `mine` Team Cost runs every member at what the player has set up
const teamStore = useTeamRotationsStore();
const { teams } = storeToRefs(teamStore) as unknown as { teams: { value: Array<Record<string, unknown>> } };
const account = computed(() =>
  accountStateOf(characters.value ?? {}, { echoes: inventoryStore.echoes ?? [], equipped: inventoryStore.equipped ?? {} }, teams.value ?? []),
);
const rileyEntries = computed(() => rileyAccountEntries(account.value));
const registration = computed(() => ({ entries: rileyEntries.value, key: accountKeyOf(rileyEntries.value) }));

onMounted(() => {
  if (host.value) void mountRankings(host.value, router, myBuilds.value, registration.value);
});
watch(() => myBuilds.value.map((b) => `${b.name}:${b.key}`).join(","), () => updateMyBuilds(myBuilds.value));
watch(() => registration.value.key, () => updateAccountState(registration.value));
onBeforeUnmount(() => unmountRankings());
// browser back/forward and nav clicks change the hash without a hashchange event we can rely on
watch(() => route.fullPath, () => onLocationChange());
</script>

<style>
/* AppLayout's .contain is a content-sized grid: it is only as wide as its widest child (668px with
   Riley's aside alone, which also squeezed the update banner). Claiming the viewport width here makes
   the grid — banner included — span the page, and the height matches .contain's own calc. */
.rankings-page {
  width: 100vw;
  max-width: 100vw;
  height: calc(100vh - 80px - var(--announce-banner-h, 0px));
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: oklch(var(--b1));
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
