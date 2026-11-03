<template>
  <Nav cur-page="rankings" :disable-mobile-nav="true"></Nav>
  <div class="rankings-page">
    <h1 class="sr-only">Team rankings</h1><!-- Riley's page has no h1 of its own (a11y audit L9) -->
    <RankingsAccountBar :account="account" :built-count="myBuilds.length" />
    <div ref="host" class="skittle-host"></div>
    <!-- Wuthering Tools+: both teleport into Riley's page (a phone's card list, the detail's member strip) -->
    <RankingsCards :account="account" />
    <RankingsMemberStrip :account="account" />
    <!-- on a phone the credit and the My roster link live in the bar's ⋯ menu and "How to read" (they took 88 px under the list) -->
    <p ref="credit" class="rankings-credit text-xs opacity-60 px-3 py-1">
      Team rankings engine, rotations and solves by
      <a href="https://github.com/Riley31415/wuwa_calc" target="_blank" rel="noopener" class="link">Riley31415/wuwa_calc</a>
      <span class="max-sm:hidden"> (ISC), running in-page from the pinned submodule.</span><span class="sm:hidden"> (ISC).</span>
      <RouterLink to="/my-rankings" class="link link-primary ml-2" data-test-rankings-switch-mine>My roster rankings ▸</RouterLink>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import Nav from "../components/navigation/Nav.vue";
import { useDocumentTitle } from "../composables/useDocumentTitle";
import { useCharacterStore } from "../stores/character";
import { useInventoryStore } from "../stores/inventory";
import { useTeamRotationsStore } from "../stores/teamRotations";
import { mountRankings, onLocationChange, unmountRankings, updateAccountState, updateMyBuilds } from "../sim/rankings/controller";
import { buildRollsOf } from "../sim/rankings/myBuilds";
import { accountKeyOf, accountStateOf, rileyAccountEntries } from "../sim/account/accountState";
import { initialTierHash } from "../sim/rankings/tierMemory";
import RankingsAccountBar from "../sim/rankings/RankingsAccountBar.vue";
import RankingsCards from "../sim/rankings/RankingsCards.vue";
import RankingsMemberStrip from "../sim/rankings/RankingsMemberStrip.vue";
import { usePlusBar } from "../sim/shell/plusBar";
import "../sim/skittle.css";
import "../sim/skittle-theme.css";

const host = ref<HTMLElement | null>(null);
// the credit line ends this fixed-height page: the Ask button sits above it, off the "My roster rankings" link
const credit = ref<HTMLElement | null>(null);
usePlusBar(credit, { pinned: true });
// each page sets its own tab title (Ryan's #672)
useDocumentTitle(
  "Team rankings — Wuthering Waves Calculator & Optimizer",
  "Riley31415's wuwa_calc team comparison inside Wuthering Tools+: every team's damage per second, solved at fixed or your own account's sequences, weapons and echoes.",
);
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

onMounted(async () => {
  // a visit with no hash opens on the tier last picked in the bar, else My account once anything is set up (it used
  // to open on Riley's S0R1 table for everyone); his page reads the hash at boot, so it is written first
  const hash = initialTierHash(route.hash, account.value.summary.owned);
  if (hash) await router.replace({ path: route.path, hash });
  if (host.value) void mountRankings(host.value, router, myBuilds.value, registration.value);
});
watch(() => myBuilds.value.map((b) => `${b.name}:${b.key}`).join(","), () => updateMyBuilds(myBuilds.value));
watch(() => registration.value.key, () => updateAccountState(registration.value));
onBeforeUnmount(() => unmountRankings());
// browser back/forward and nav clicks change the hash without a hashchange event we can rely on
watch(() => route.fullPath, () => onLocationChange());
</script>

<style>
/* The page is a fixed-height column (Riley's #app scrolls inside it) matching .contain's own calc (the nav's measured --nav-h / --nav-bottom-h, AppLayout.vue);
   on a phone the dynamic viewport unit follows the browser chrome, so the credit line and the bottom
   of his table are not hidden behind the URL bar. (It used to claim 100vw as well: the Vue root had
   lost its `width: 100%` in the #app → #wt-app rename and shrank to its content - style.css has it.) */
.rankings-page {
  width: 100%;
  max-width: 100%;
  height: calc(100vh - var(--nav-h) - var(--nav-bottom-h) - var(--announce-banner-h, 0px));
  height: calc(100dvh - var(--nav-h) - var(--nav-bottom-h) - var(--announce-banner-h, 0px));
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: oklch(var(--b1));
}
@media (max-width: 767px) {
  .rankings-credit {
    display: none;
  }
}
/* the bar's Search button opens Riley's aside, which a detail page does not have */
.rankings-page:has(.skittle-root.wt-detail) [data-test-rankings-search] {
  display: none;
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
