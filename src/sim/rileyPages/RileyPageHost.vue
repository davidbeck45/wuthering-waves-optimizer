<template>
  <Nav :cur-page="kind === 'tierlist' ? 'tier-list' : 'roster-value'" :disable-mobile-nav="true"></Nav>
  <div class="wt-riley-page" :class="{ 'wt-riley-page--board': boardOn }" :data-test-riley-page="kind">
    <header class="wt-riley-head px-3 pt-2">
      <h1 class="wt-riley-title text-lg font-semibold leading-tight">{{ title }}</h1>
      <p class="text-sm" data-test-riley-lead><slot name="lead" /></p>
      <details class="wt-riley-about text-sm" data-test-riley-about>
        <summary class="wt-riley-about__sum link">What the numbers are</summary>
        <div class="opacity-90 pb-1"><slot name="about" /></div>
        <p class="text-xs opacity-80 pb-1">
          Page, engine and solves by
          <a href="https://github.com/Riley31415/wuwa_calc" target="_blank" rel="noopener" class="link">Riley31415/wuwa_calc</a> (ISC), running in-page.
        </p>
      </details>
      <slot name="extra" />
      <p v-if="cost && cost.hasAccount" class="wt-riley-mine text-sm" data-test-riley-mine>
        <template v-if="cost.cost === 'mine'">
          <span data-test-riley-mine-on>At your own sequences, weapons and refinements (Team Cost "My account"). A
            resonator you have not set up runs at S0 with R1, except 4-stars and Rover forms at S6<template
              v-if="cost.freeS2.length"> and {{ cost.freeS2.join(", ") }} at S2</template>.</span>
        </template>
        <template v-else>
          <button type="button" class="btn btn-sm btn-outline" data-test-riley-mine-button @click="chooseMine()">
            At my own sequences and weapons
          </button>
          <span class="wt-riley-mine__hint opacity-80">Solves every team the first time: about 8 s on a fast desktop,
            longer on a phone; saved after.</span>
          <span class="wt-riley-mine__hint wt-riley-mine__hint--phone opacity-80">Takes a while the first time; saved after.</span>
        </template>
      </p>
      <div v-if="$slots.board" class="wt-riley-switch" role="group" aria-label="Show the tier list as" data-test-riley-switch>
        <button type="button" class="btn btn-sm" :class="boardOn ? 'btn-primary' : 'btn-ghost'" :aria-pressed="boardOn" data-test-riley-switch-to="board" @click="showAs('board')">Board</button>
        <button type="button" class="btn btn-sm" :class="boardOn ? 'btn-ghost' : 'btn-primary'" :aria-pressed="!boardOn" data-test-riley-switch-to="table" @click="showAs('table')">Table</button>
      </div>
      <div v-if="views.length" class="wt-riley-views" role="group" :aria-label="viewsLabel" data-test-riley-views>
        <button
          v-for="(v, i) in views"
          :key="v"
          type="button"
          class="btn btn-sm"
          :class="view === i ? 'btn-primary' : 'btn-ghost'"
          :aria-pressed="view === i"
          :data-test-riley-view="i"
          @click="view = i">{{ v }}</button>
      </div>
    </header>
    <div ref="host" class="wt-riley-host" :data-wt-view="view"></div>
    <slot v-if="boardOn" name="board" :view="view" />
    <p ref="credit" class="wt-riley-credit text-xs opacity-70 px-3 py-1">
      <RouterLink to="/rankings" class="link link-primary" data-test-riley-to-rankings>Team rankings</RouterLink> ·
      <RouterLink v-if="kind !== 'tierlist'" to="/tier-list" class="link link-primary" data-test-riley-to-tierlist>Tier list</RouterLink>
      <RouterLink v-else to="/roster-value" class="link link-primary" data-test-riley-to-value>Roster value</RouterLink>
      <slot name="links" />
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useSlots, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import Nav from "../../components/navigation/Nav.vue";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { accountKeyOf, accountStateOf, rileyAccountEntries } from "../account/accountState";
import { usePlusBar } from "../shell/plusBar";
import {
  chooseMine, mountRileyPage, onCostState, onRileyPageLocation, unmountRileyPage, updateRileyPageAccount, type CostState, type RileyPageKind,
} from "./controller";
import "../skittle.css";
import "../skittle-theme.css";
import "./rileyPages.css";

const props = withDefaults(defineProps<{ kind: RileyPageKind; title: string; views?: string[]; viewsLabel?: string }>(), { views: () => [], viewsLabel: "" });
const slots = useSlots();
const host = ref<HTMLElement | null>(null);
/** phones: which of his side-by-side blocks shows (rileyPages.css); a desktop shows them all */
const view = ref(0);
/** his Team Cost as it stands, for the "At my own sequences and weapons" line */
const cost = ref<CostState | null>(null);
onCostState((s) => { cost.value = s; });
const credit = ref<HTMLElement | null>(null);
usePlusBar(credit, { pinned: true });
const router = useRouter();
const route = useRoute();
/** a page with a board (the Tier list) opens on it; `?view=table` in the address shows his table instead */
const boardOn = computed(() => !!slots.board && route.query.view !== "table");
function showAs(v: "board" | "table"): void {
  if ((v === "board") === boardOn.value) return;
  const { view: _v, who: _w, in: _i, ...rest } = route.query;
  void router.push({ query: v === "table" ? { ...rest, view: "table" } : rest, hash: location.hash });
}
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
onBeforeUnmount(() => {
  onCostState(null);
  unmountRileyPage(props.kind);
});
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
.wt-riley-about__sum {
  min-height: 44px;
  display: flex;
  align-items: center;
  width: fit-content;
  cursor: pointer;
}
.wt-riley-mine {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.5rem;
  padding: 0.25rem 0;
}
.wt-riley-mine .btn {
  min-height: 44px;
  height: auto;
  max-width: 100%;
  white-space: normal;
}
/* phones: the top bar already names the page (the heading stays for screen readers), and the one-time hint is small
   print, so the first row starts above the fold at 360 x 800 with 130 % text */
@media (max-width: 767px) {
  .wt-riley-title {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .wt-riley-mine__hint {
    display: none;
  }
  .wt-riley-mine .wt-riley-mine__hint--phone {
    display: inline;
    font-size: 0.75rem;
    line-height: 1.3;
  }
  .wt-riley-head {
    padding-top: 0.25rem;
  }
  .wt-riley-head .wt-riley-views {
    padding-bottom: 0.25rem;
  }
}
.wt-riley-switch {
  display: flex;
  gap: 0.25rem;
  padding: 0.25rem 0;
  max-width: 20rem;
}
.wt-riley-switch .btn {
  min-height: 44px;
  flex: 1 1 0;
}
/* the Board view: his option boxes stay (the board follows them), his table is hidden, the whole page scrolls */
.wt-riley-page--board .wt-riley-host > .skittle-root .tcbody {
  display: none !important;
}
.wt-riley-page--board {
  height: auto;
  min-height: calc(100dvh - var(--nav-h) - var(--nav-bottom-h) - var(--announce-banner-h, 0px));
}
.wt-riley-page--board .wt-riley-host {
  flex: none;
  overflow: visible;
}
.wt-riley-page--board .wt-riley-host > .skittle-root,
.wt-riley-page--board .wt-riley-host > .skittle-root > .wt-riley-body,
.wt-riley-page--board .wt-riley-host > .skittle-root #app,
.wt-riley-page--board .wt-riley-host > .skittle-root main {
  position: static !important;
  height: auto !important;
  overflow: visible !important;
}
/* his main keeps 420 px of room under a phone's table (skittle.css); with the table hidden it is a gap */
.wt-riley-page--board .wt-riley-host > .skittle-root main {
  padding-bottom: 0.5rem !important;
}
.wt-riley-views {
  display: none;
  gap: 0.25rem;
  padding: 0.25rem 0 0.5rem;
}
.wt-riley-mine__hint--phone {
  display: none;
}
/* a page's short Board lead (TierListView): on a phone's Board it stands in for the long lead and the board's own line */
.wt-tlead-board {
  display: none;
}
@media (max-width: 767px) {
  .wt-riley-page--board .wt-tlead-long {
    display: none;
  }
  .wt-riley-page--board .wt-tlead-board {
    display: inline;
  }
}
.wt-riley-views .btn {
  min-height: 44px;
  flex: 1 1 0;
}
@media (max-width: 767px) {
  .wt-riley-views {
    display: flex;
  }
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
/* phones: the whole page scrolls (the header, his option boxes, then the table), so the table is not a window under
   a tall header; his column headings stick to the screen's top instead of his own scroll box */
@media (max-width: 767px) {
  .wt-riley-page {
    height: auto;
    min-height: calc(100dvh - var(--nav-h) - var(--nav-bottom-h) - var(--announce-banner-h, 0px));
  }
  .wt-riley-host {
    overflow: visible;
  }
  .wt-riley-host > .skittle-root,
  .wt-riley-host > .skittle-root > .wt-riley-body,
  .wt-riley-host > .skittle-root #app,
  .wt-riley-host > .skittle-root main {
    position: static !important;
    height: auto !important;
    overflow: visible !important;
  }
}
</style>
