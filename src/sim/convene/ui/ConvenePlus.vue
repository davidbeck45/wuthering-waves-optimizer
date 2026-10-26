<template>
  <!-- Wuthering Tools+: the plus section of /convene — one hook line in upstream's ConveneView.vue. The Simulator tab
       is upstream's page untouched (the rule at the bottom hides it while another tab is open). -->
  <section
    class="wtplus-convene w-full px-4 md:px-6 lg:px-10 pt-4 text-base-content"
    :class="tab === 'simulator' ? 'pb-0' : 'pb-16'"
    :data-wtplus-convene-tab="tab"
    data-test-convene-plus>
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <nav class="convene-tabs" role="tablist" aria-label="Convene">
        <button
          v-for="t in TABS"
          :key="t.id"
          type="button"
          role="tab"
          class="convene-tab"
          :class="{ 'convene-tab--active': tab === t.id }"
          :aria-selected="tab === t.id"
          :data-test-convene-tab="t.id"
          @click="setTab(t.id)">
          <svg class="convene-tab__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path :d="t.icon" />
          </svg>
          <span class="max-sm:hidden">{{ t.label }}</span>
          <span class="sm:hidden">{{ t.short }}</span>
        </button>
      </nav>
      <button
        v-if="liveChip"
        type="button"
        class="ml-auto inline-flex items-center gap-2 rounded-full border border-base-content/10 bg-base-200/60 px-3 py-1 text-xs text-base-content/80 hover:bg-base-200 max-sm:w-full max-sm:justify-center"
        data-test-convene-live-chip
        @click="setTab('banners')">
        <span class="relative flex size-2"><span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60"></span><span class="relative inline-flex size-2 rounded-full bg-success"></span></span>
        <span class="font-medium">{{ liveChip.label }}</span>
        <span class="text-base-content/50">·</span>
        <span class="tabular-nums">{{ liveChip.left }} left</span>
      </button>
    </div>

    <div v-if="tab === 'simulator'" class="mt-3 flex flex-wrap items-center gap-2 text-sm" data-test-convene-sim-strip>
      <template v-if="simPools.length">
        <span class="text-base-content/60">Your pity, from your imported history:</span>
        <button
          v-for="p in simPools"
          :key="p.poolType"
          type="button"
          class="btn btn-xs h-auto min-h-7 py-1 normal-case font-normal border-base-content/10 bg-base-200/70 hover:bg-base-300"
          :data-test-convene-sim-fill="p.poolType"
          @click="fillFromPool(p)">
          <span class="font-medium">{{ p.pool.short }}</span>
          <span class="tabular-nums">{{ p.pity5 }}{{ p.pity5LowerBound ? "+" : "" }}/{{ p.pool.hardPity5 }}</span>
          <span v-if="p.guaranteed" class="badge badge-success badge-xs">guaranteed</span>
          <span class="text-primary">→ simulator</span>
        </button>
      </template>
      <button v-else type="button" class="link link-hover text-base-content/60" data-test-convene-sim-import @click="setTab('pulls')">
        Fill the pity below from your Convene history — import it under My pulls ▸
      </button>
    </div>
    <div v-if="tab === 'simulator' && notice" class="alert mt-3 py-2 text-sm bg-primary/10 border-primary/30" role="status" data-test-convene-prefill-note>
      <svg viewBox="0 0 24 24" class="size-4 shrink-0 text-primary" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l4 4L19 6" /></svg>
      <span>{{ notice }}</span>
      <button type="button" class="btn btn-ghost btn-xs" aria-label="Dismiss" @click="notice = null">✕</button>
    </div>

    <ConvenePullsTab v-if="tab === 'pulls'" class="mt-6" @prefill="applyPrefill" @go="setTab" />
    <ConveneBannersTab v-else-if="tab === 'banners'" class="mt-6" />
    <ConveneAdvisorTab v-else-if="tab === 'advisor'" class="mt-6" @prefill="applyPrefill" @go="setTab" />
  </section>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useDocumentTitle } from "../../../composables/useDocumentTitle";
import type { ConveneMode } from "../../../convene/simulateConvene";
import type { PoolPity } from "../pity";
import { CONVENE_TABS, type ConveneTab } from "../prefs";
import { useBannerFeed, useConveneHistory, useConvenePrefs, useLiveBanners, useNow } from "./useConvene";
import { fmtDuration } from "./format";
import type { ConvenePrefillRequest } from "./types";
import { poolPrefillRequest } from "./prefill";

// the three plus tabs load on first open — the Simulator tab stays as light as upstream's page
const ConvenePullsTab = defineAsyncComponent(() => import("./ConvenePullsTab.vue"));
const ConveneBannersTab = defineAsyncComponent(() => import("./ConveneBannersTab.vue"));
const ConveneAdvisorTab = defineAsyncComponent(() => import("./ConveneAdvisorTab.vue"));

// upstream's simulator inputs (ConveneView.vue's own refs, bound with v-model in its hook line)
const simMode = defineModel<ConveneMode>("mode", { required: true });
const simPity = defineModel<number>("pity", { required: true });
const simGuaranteed = defineModel<boolean>("guaranteed", { required: true });
/** −1 = no copy yet, S0 / R0 = 0 */
const simOwned = defineModel<number>("owned", { required: true });
/** copies − 1 */
const simTarget = defineModel<number>("target", { required: true });

const TABS: { id: ConveneTab; label: string; short: string; icon: string }[] = [
  { id: "simulator", label: "Simulator", short: "Odds", icon: "M5 19L19 5M7.5 5.5a2 2 0 110 4 2 2 0 010-4zm9 9a2 2 0 110 4 2 2 0 010-4z" },
  { id: "pulls", label: "My pulls", short: "Pulls", icon: "M12 7v5l3 2M3.5 12a8.5 8.5 0 1017 0 8.5 8.5 0 00-17 0" },
  { id: "banners", label: "Banners", short: "Banners", icon: "M8 3v3M16 3v3M4 9h16M5.5 5h13A1.5 1.5 0 0120 6.5v12a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 18.5v-12A1.5 1.5 0 015.5 5z" },
  { id: "advisor", label: "Pull advisor", short: "Advisor", icon: "M12 3l1.9 4.9L19 9.8l-5.1 1.9L12 16.6l-1.9-4.9L5 9.8l5.1-1.9L12 3zM18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" },
];

const route = useRoute();
const router = useRouter();
const prefs = useConvenePrefs();
const tab = computed<ConveneTab>(() => prefs.value.tab);
const notice = ref<string | null>(null);

// the tab title follows the open tab (ConveneView's own call sets the Simulator's; this one runs after it)
const TITLES: Record<ConveneTab, [string, string]> = {
  simulator: [
    "Convene odds",
    "Estimate your chance of pulling featured 5★ resonators and weapons in Wuthering Waves from your Astrite, Lunite and wishes.",
  ],
  pulls: [
    "My Convene history",
    "Import your Wuthering Waves Convene history from Kuro and see your pity, 50/50 record, guarantee and luck on every banner.",
  ],
  banners: [
    "Convene banners",
    "Every released Wuthering Waves Convene banner from Kuro's official news, with countdowns and rerun gaps for each 5★.",
  ],
  advisor: [
    "Pull advisor",
    "Which featured 5★ on the current Wuthering Waves banners adds the most damage to your own builds per 1,000 Astrite.",
  ],
};
useDocumentTitle(
  () => `${TITLES[tab.value][0]} — Wuthering Waves Calculator & Optimizer`,
  () => TITLES[tab.value][1],
);

function setTab(t: ConveneTab): void {
  if (prefs.value.tab !== t) prefs.value = { ...prefs.value, tab: t };
  const query = { ...route.query };
  if (t === "simulator") delete query.tab;
  else query.tab = t;
  if ((route.query.tab ?? undefined) !== (query.tab ?? undefined)) void router.replace({ query });
}

onMounted(() => {
  const q = route.query.tab;
  if (typeof q === "string" && (CONVENE_TABS as readonly string[]).includes(q)) setTab(q as ConveneTab);
  else if (prefs.value.tab !== "simulator") setTab(prefs.value.tab);
  // a glance at what's running, from what this browser already holds (no network on the simulator tab)
  void feed.load();
});
watch(
  () => route.query.tab,
  (q) => {
    if (typeof q === "string" && (CONVENE_TABS as readonly string[]).includes(q) && q !== tab.value) setTab(q as ConveneTab);
    else if (q === undefined && tab.value !== "simulator") setTab("simulator");
  },
);

// ── the live chip ──
const now = useNow();
const feed = useBannerFeed();
const live = useLiveBanners(now);
const liveChip = computed(() => {
  const b = live.value.find((x) => x.type === "resonator") ?? live.value[0];
  if (!b) return null;
  return { label: b.label ?? b.title ?? "Live banner", left: fmtDuration(b.endMs - now.value) };
});

// ── the simulator strip ──
const { pity } = useConveneHistory();
const SIM_POOLS = [1, 2, 8, 9, 10, 11, 12, 13];
const simPools = computed(() => (pity.value?.pools ?? []).filter((p) => SIM_POOLS.includes(p.poolType) && p.pulls > 0));

function fillFromPool(p: PoolPity): void {
  const req = poolPrefillRequest(p);
  if (req) void applyPrefill(req);
}

async function applyPrefill(req: ConvenePrefillRequest): Promise<void> {
  const p = req.prefill;
  simMode.value = p.mode;
  simPity.value = p.startingPity;
  simGuaranteed.value = p.mode === "character" && p.guaranteedNextFeatured;
  if (p.currentOwnedIndex != null) simOwned.value = p.currentOwnedIndex;
  if (p.targetIndex != null) simTarget.value = p.targetIndex;
  setTab("simulator");
  notice.value = req.note;
  await nextTick();
  const details = document.querySelector<HTMLDetailsElement>(".page-convene details");
  if (details) {
    details.open = true;
    details.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }
}
</script>

<style scoped>
.convene-tabs {
  display: inline-flex;
  gap: 0.25rem;
  padding: 0.25rem;
  border-radius: var(--rounded-box, 1rem);
  background: oklch(var(--b2) / 0.7);
  border: 1px solid oklch(var(--bc) / 0.06);
}
.convene-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.9rem;
  border-radius: calc(var(--rounded-box, 1rem) - 0.25rem);
  font-size: 0.875rem;
  font-weight: 500;
  color: oklch(var(--bc) / 0.65);
  transition: background-color 0.15s, color 0.15s, box-shadow 0.15s;
  white-space: nowrap;
}
.convene-tab:hover {
  color: oklch(var(--bc));
  background: oklch(var(--bc) / 0.05);
}
.convene-tab:focus-visible {
  outline: 2px solid oklch(var(--p));
  outline-offset: 1px;
}
.convene-tab--active,
.convene-tab--active:hover {
  color: oklch(var(--bc));
  background: oklch(var(--b1));
  box-shadow: 0 1px 2px oklch(0 0 0 / 0.18), 0 0 0 1px oklch(var(--bc) / 0.06);
}
.convene-tab--active .convene-tab__icon {
  color: oklch(var(--p));
}
.convene-tab__icon {
  width: 1.05rem;
  height: 1.05rem;
  flex-shrink: 0;
}
/* phones: four equal columns, icon over a short label */
@media (max-width: 639px) {
  .convene-tabs {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    width: 100%;
  }
  .convene-tab {
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.4rem 0.2rem;
    font-size: 0.72rem;
    min-width: 0;
  }
}
</style>

<style>
/* Wuthering Tools+: upstream's simulator page (its root is .page-convene, right after this section) shows only on the
   Simulator tab — the one rule that keeps ConveneView.vue's own markup untouched. */
[data-wtplus-convene-tab]:not([data-wtplus-convene-tab="simulator"]) + .page-convene {
  display: none !important;
}
</style>
