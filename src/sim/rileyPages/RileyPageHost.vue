<template>
  <Nav cur-page="rankings" :disable-mobile-nav="true"></Nav>
  <div class="wt-riley-page" :data-test-riley-page="kind">
    <header class="wt-riley-head px-3 pt-2">
      <h1 class="text-lg font-semibold leading-tight">{{ title }}</h1>
      <p class="text-sm opacity-80" data-test-riley-about><slot name="about" /></p>
      <slot name="extra" />
    </header>
    <div ref="host" class="wt-riley-host"></div>
    <p ref="credit" class="wt-riley-credit text-xs opacity-70 px-3 py-1">
      Page, engine and solves by
      <a href="https://github.com/Riley31415/wuwa_calc" target="_blank" rel="noopener" class="link">Riley31415/wuwa_calc</a> (ISC), running in-page.
      <RouterLink to="/rankings" class="link link-primary ml-1" data-test-riley-to-rankings>Team rankings</RouterLink> ·
      <RouterLink v-if="kind !== 'tierlist'" to="/tier-list" class="link link-primary" data-test-riley-to-tierlist>Tier list</RouterLink>
      <RouterLink v-else to="/roster-value" class="link link-primary" data-test-riley-to-value>Roster value</RouterLink>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import Nav from "../../components/navigation/Nav.vue";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { accountKeyOf, accountStateOf, rileyAccountEntries } from "../account/accountState";
import { usePlusBar } from "../shell/plusBar";
import { mountRileyPage, onRileyPageLocation, unmountRileyPage, updateRileyPageAccount, type RileyPageKind } from "./controller";
import "../skittle.css";
import "../skittle-theme.css";
import "./rileyPages.css";

const props = defineProps<{ kind: RileyPageKind; title: string }>();
const host = ref<HTMLElement | null>(null);
const credit = ref<HTMLElement | null>(null);
usePlusBar(credit, { pinned: true });
const router = useRouter();
const route = useRoute();
const characterStore = useCharacterStore();
const inventoryStore = useInventoryStore();
const teamStore = useTeamRotationsStore();
const { characters } = storeToRefs(characterStore) as unknown as { characters: { value: Record<string, Record<string, unknown>> } };
const { teams } = storeToRefs(teamStore) as unknown as { teams: { value: Array<Record<string, unknown>> } };
const account = computed(() =>
  accountStateOf(characters.value ?? {}, { echoes: inventoryStore.echoes ?? [], equipped: inventoryStore.equipped ?? {} }, teams.value ?? []),
);
const registration = computed(() => {
  const entries = rileyAccountEntries(account.value);
  return { entries, key: accountKeyOf(entries) };
});

onMounted(() => {
  if (host.value) void mountRileyPage(props.kind, host.value, router, registration.value);
});
watch(() => registration.value.key, () => updateRileyPageAccount(registration.value));
watch(() => route.hash, () => onRileyPageLocation(props.kind));
onBeforeUnmount(() => unmountRileyPage(props.kind));
</script>

<style>
/* A fixed-height column like /rankings (RankingsView.vue): Riley's #app scrolls inside it. */
.wt-riley-page {
  width: 100%;
  max-width: 100%;
  height: calc(100vh - var(--nav-h) - var(--nav-bottom-h) - var(--announce-banner-h, 0px));
  height: calc(100dvh - var(--nav-h) - var(--nav-bottom-h) - var(--announce-banner-h, 0px));
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: oklch(var(--b1));
}
.wt-riley-host {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
}
.wt-riley-host > .skittle-root {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  margin: 0 !important;
  overflow: hidden !important;
}
.wt-riley-host > .skittle-root > .wt-riley-body,
.wt-riley-host > .skittle-root #app {
  height: 100% !important;
}
.wt-riley-host > .skittle-root #app {
  overflow: auto !important;
}
</style>
