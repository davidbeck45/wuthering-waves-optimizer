<template>
  <Nav cur-page="echo-lab" :disable-mobile-nav="true"></Nav>
  <div class="echo-lab mx-auto w-full max-w-7xl px-3 py-4 sm:px-6" data-test-echo-lab>
    <!-- header -->
    <header class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-box border border-base-300 bg-base-200 px-4 py-3 max-sm:px-3 max-sm:py-2.5">
      <div class="flex min-w-0 flex-1 items-center gap-3">
        <div class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary max-sm:size-9" aria-hidden="true">
          <svg viewBox="0 0 24 24" class="size-6 max-sm:size-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 3h6M10 3v6.5L4.6 18.2A2 2 0 0 0 6.3 21h11.4a2 2 0 0 0 1.7-2.8L14 9.5V3" />
            <path d="M7.5 15h9" />
          </svg>
        </div>
        <div class="min-w-0">
          <h1 class="flex items-center gap-2 text-xl font-bold leading-tight">
            Echo Lab <span class="badge badge-primary badge-outline badge-sm font-semibold">Tools+</span>
          </h1>
          <p class="text-xs opacity-60 max-sm:hidden">Keep, tune, re-roll or feed: every number is this app's damage engine on each character's best rotation.</p>
          <p class="text-xs opacity-60 sm:hidden">Engine-scored echo decisions</p>
        </div>
      </div>
      <div class="flex items-center gap-2 max-sm:w-full sm:ml-auto">
        <EchoLabPopover id="about" label="How the Echo Lab decides">
          <p>Each built character (weapon and five echoes) is scored on their best rotation, picked the way My roster rankings picks it, against a level 100 enemy at 20 % resistance.</p>
          <p>Every inventory echo is tried in every slot it may go into: same cost, a main-echo slot only takes another copy of that echo, a species once per build. Set bonuses that break or complete and the main-echo buff are recomputed exactly as the calculator's swap badges do.</p>
          <p>Swaps keep every active set bonus and any Healing Bonus, and lose at most one Energy Regen roll (12.4), because a damage engine values none of team buffs, healing and Energy Regen.</p>
          <p class="opacity-70">Keep: an upgrade for someone, worn, or worth tuning. Spare: within 2 % of its best owner's echo, a gamble to tune, or good substats with no slot today. Feed: no gain for anyone.</p>
        </EchoLabPopover>
        <span v-if="pass && !passStatus.running" class="text-xs opacity-60 max-sm:flex-1" data-test-echo-lab-meta>
          {{ pass.bestOwner.scorings.toLocaleString("en-US") }} engine runs · {{ passStatus.cached ? "cached" : `${(pass.ms / 1000).toFixed(1)} s` }}
        </span>
        <button
          v-if="canRun"
          type="button"
          class="btn btn-sm"
          :class="pass ? 'btn-ghost' : 'btn-primary'"
          :disabled="passStatus.running"
          data-test-echo-lab-run
          @click="lab.refresh({ force: true })">
          {{ pass ? "Re-run" : "Run" }}
        </button>
      </div>
    </header>

    <!-- empty states: nothing to judge, or nobody to judge it against (a pass with no five-echo build would feed everything) -->
    <div v-if="!canRun || noBuilds" class="mt-4 rounded-box border border-base-300 bg-base-100 p-6" data-test-echo-lab-empty>
      <h2 class="text-lg font-semibold">{{ !lab.echoCount.value ? "Bring your echoes in" : "Build a character to compare echoes against" }}</h2>
      <p class="mt-1 max-w-2xl text-sm opacity-70">
        The Echo Lab judges every echo in your inventory against the characters you have built (a weapon and five echoes).
        <template v-if="!lab.echoCount.value">Your inventory is empty.</template>
        <template v-else-if="noBuilds">No character with a weapon wears five echoes yet, so there is nothing to compare your {{ lab.echoCount.value }} echoes against.</template>
        <template v-else>You have {{ lab.echoCount.value }} echoes but no character with a weapon yet.</template>
      </p>
      <div class="mt-4 grid gap-3 sm:grid-cols-3">
        <RouterLink v-for="c in ctas" :key="c.to" :to="c.to" class="group rounded-box border border-base-300 bg-base-200 p-4 text-base-content no-underline transition-colors hover:border-primary" :data-test-echo-lab-cta="c.id">
          <div class="font-semibold text-primary">{{ c.title }} ›</div>
          <p class="mt-1 text-sm text-base-content/70">{{ c.text }}</p>
        </RouterLink>
      </div>
    </div>

    <template v-else>
      <!-- KPIs -->
      <div class="mt-3 grid grid-cols-3 gap-2 lg:grid-cols-6" data-test-echo-lab-kpis>
        <button
          v-for="k in kpis"
          :key="k.id"
          type="button"
          class="min-w-0 rounded-box border border-base-300 bg-base-100 px-3 py-2.5 text-left transition-colors max-sm:px-2.5 max-sm:py-2"
          :class="k.verdict ? 'hover:border-base-content/30' : 'cursor-default'"
          :title="k.verdict ? `Show the ${k.label.toLowerCase()} verdicts` : undefined"
          :data-test-echo-lab-kpi="k.id"
          @click="k.verdict && showVerdict(k.verdict)">
          <div class="flex items-center gap-1.5 truncate text-[0.65rem] font-semibold uppercase tracking-wide opacity-60">
            <span v-if="k.verdict" class="size-1.5 shrink-0 rounded-full" :class="`el-dot--${k.verdict}`" aria-hidden="true"></span>
            <span class="max-sm:hidden">{{ k.label }}</span><span class="sm:hidden">{{ k.short }}</span>
          </div>
          <div class="mt-0.5 flex min-w-0 items-baseline gap-1.5">
            <span class="font-mono text-2xl font-bold tabular-nums max-sm:text-xl" :class="k.class">{{ k.value }}</span>
            <span v-if="k.sub" class="truncate text-xs opacity-60 max-sm:hidden">{{ k.sub }}</span>
          </div>
        </button>
      </div>

      <!-- progress -->
      <div v-if="passStatus.running" class="mt-3 rounded-box border border-primary/40 bg-base-100 px-4 py-3" data-test-echo-lab-progress>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span class="loading loading-spinner loading-sm text-primary"></span>
          <span class="text-sm font-medium">{{ phaseLabel(passStatus.progress?.phase) }}</span>
          <span v-if="passStatus.progress?.label" class="truncate text-xs opacity-60">{{ progressLabel }}</span>
          <span class="ml-auto font-mono text-xs tabular-nums opacity-60">{{ passStatus.progress ? `${passStatus.progress.done} / ${passStatus.progress.total}` : "" }}</span>
          <button type="button" class="btn btn-ghost btn-xs" data-test-echo-lab-cancel @click="lab.cancel()">Cancel</button>
        </div>
        <div class="mt-2 flex gap-1" aria-hidden="true">
          <div v-for="(p, i) in PASS_PHASES" :key="p" class="h-1.5 flex-1 overflow-hidden rounded-full bg-base-300">
            <div class="h-full rounded-full bg-primary transition-[width] duration-200" :style="{ width: phaseFill(i) }"></div>
          </div>
        </div>
      </div>
      <div v-if="passStatus.error" class="alert alert-error mt-3 text-sm" data-test-echo-lab-error>
        <span>The Echo Lab stopped: {{ passStatus.error }}</span>
        <button type="button" class="btn btn-sm" @click="lab.refresh({ force: true })">Try again</button>
      </div>
      <div v-if="!pass && passStatus.cancelled && !passStatus.running" class="mt-3 rounded-box border border-dashed border-base-300 px-4 py-8 text-center text-sm opacity-70" data-test-echo-lab-cancelled>
        Cancelled. <button type="button" class="link link-primary" @click="lab.refresh({ force: true })">Run the Echo Lab</button>
      </div>

      <!-- tabs -->
      <div v-if="pass" class="mt-4">
        <div role="tablist" class="echo-lab__tabs mb-3 grid grid-cols-2 gap-1 rounded-box bg-base-200 p-1 sm:flex sm:w-fit" aria-label="Echo Lab views">
          <button
            v-for="t in tabs"
            :key="t.id"
            type="button"
            role="tab"
            class="flex min-w-0 items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors max-sm:px-2"
            :class="tab === t.id ? 'bg-base-100 shadow-sm text-base-content' : 'opacity-70 hover:opacity-100'"
            :aria-selected="tab === t.id"
            :data-test-echo-lab-tab="t.id"
            @click="tab = t.id">
            <span class="max-sm:hidden">{{ t.label }}</span><span class="whitespace-nowrap sm:hidden">{{ t.short }}</span>
            <span v-if="t.count !== null" class="badge badge-sm" :class="tab === t.id ? 'badge-primary' : 'badge-ghost'">{{ t.count }}</span>
          </button>
        </div>

        <EchoLabVerdicts v-if="tab === 'verdicts'" v-model:filters="filters" :result="pass.bestOwner" />
        <EchoLabTune v-else-if="tab === 'tune'" :result="pass.bestOwner" />
        <EchoLabReroll v-else-if="tab === 'reroll'" v-model:character="rerollCharacter" :result="pass.bestOwner" :benchmarks="benchmarks" :preferred="activeCharacter" />
        <EchoLabBenchmark v-else-if="tab === 'benchmark'" :result="benchmarks" :status="benchStatus" @run="(force) => lab.runBenchmarks({ force })" />

        <p v-if="pass.bestOwner.skipped.length" class="mt-4 text-xs opacity-60" data-test-echo-lab-skipped>
          Left out: <span v-for="(s, i) in pass.bestOwner.skipped" :key="s.id">{{ characterName(s.id) }} ({{ s.reason }}){{ i < pass.bestOwner.skipped.length - 1 ? ", " : "" }}</span>
        </p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ Echo Lab — the /echo-lab page: the engine-backed echo decisions (src/sim/echoLab/, run in a Web
// Worker) in four views — inventory verdicts, Tune or Feed, the re-roll advisor and the build benchmark. Header
// KPIs, progress with cancel, results cached per account (useEchoLab.ts). Works in the v3 and the classic UI.
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Nav from "../../components/navigation/Nav.vue";
import { useDocumentTitle } from "../../composables/useDocumentTitle";
import { useCharacterStore } from "../../stores/character";
import type { EchoVerdictKind } from "./bestOwner";
import EchoLabBenchmark from "./EchoLabBenchmark.vue";
import EchoLabPopover from "./EchoLabPopover.vue";
import EchoLabReroll from "./EchoLabReroll.vue";
import EchoLabTune from "./EchoLabTune.vue";
import EchoLabVerdicts from "./EchoLabVerdicts.vue";
import { DEFAULT_FILTERS, characterName, echoName, phaseLabel, type VerdictFilters } from "./echoLabView";
import { useEchoLab } from "./useEchoLab";
import "./echoLab.css";

type TabId = "verdicts" | "tune" | "reroll" | "benchmark";
const TAB_IDS: TabId[] = ["verdicts", "tune", "reroll", "benchmark"];
const PASS_PHASES = ["characters", "weights", "echoes"] as const;

// each page sets its own tab title (Ryan's #672)
useDocumentTitle(
  "Echo Lab — Wuthering Waves Calculator & Optimizer",
  "Keep, tune, re-roll or feed: every echo in your inventory judged by the calculator's damage engine on your real builds, with Tune-or-Feed odds, Transducer advice and a build benchmark.",
);

const route = useRoute();
const router = useRouter();
const lab = useEchoLab();
const { pass, passStatus, benchmarks, benchStatus } = lab;
const activeCharacter = computed(() => (useCharacterStore() as unknown as { activeCharacter: string | null }).activeCharacter ?? null);

const canRun = computed(() => lab.echoCount.value > 0 && lab.builtCount.value > 0);
/** the pass found no character with a weapon and five echoes: no verdict means anything (every echo would read Feed) */
const noBuilds = computed(() => !!pass.value && !passStatus.running && pass.value.bestOwner.characters.length === 0);

// the tab and the re-roll character live in the URL, so the calculator can link straight to them
const queryTab = (): TabId => (TAB_IDS.includes(route.query.tab as TabId) ? (route.query.tab as TabId) : "verdicts");
const tab = ref<TabId>(queryTab());
const rerollCharacter = ref<string | null>(typeof route.query.character === "string" ? route.query.character : null);
watch([tab, rerollCharacter], ([t, c]) => {
  const query: Record<string, string> = {};
  if (t !== "verdicts") query.tab = t;
  if (t === "reroll" && c) query.character = c;
  if (route.query.tab !== query.tab || route.query.character !== query.character) void router.replace({ query });
});
watch(tab, (t) => {
  if (t === "benchmark") void lab.runBenchmarks();
});

const filters = ref<VerdictFilters>({ ...DEFAULT_FILTERS });
function showVerdict(verdict: EchoVerdictKind): void {
  filters.value = { ...DEFAULT_FILTERS, verdict };
  tab.value = "verdicts";
}

const counts = computed(() => pass.value?.bestOwner.counts ?? { keep: 0, spare: 0, feed: 0 });
const kpis = computed(() => {
  const r = pass.value?.bestOwner;
  const upgrades = r ? r.echoes.filter((e) => e.reason === "upgrade").length : null;
  const upgradeChars = r ? r.characters.filter((c) => c.upgrades > 0).length : 0;
  const dash = "—";
  return [
    { id: "echoes", label: "Echoes judged", short: "Echoes", value: r ? r.echoes.length : lab.echoCount.value, sub: r && r.echoes.length !== lab.echoCount.value ? `of ${lab.echoCount.value}` : "", class: "", verdict: null },
    { id: "characters", label: "Built characters", short: "Builds", value: r ? r.characters.length : lab.builtCount.value, sub: r?.skipped.length ? `+${r.skipped.length} left out` : "", class: "", verdict: null },
    { id: "upgrades", label: "Upgrades waiting", short: "Upgrades", value: upgrades ?? dash, sub: upgrades ? `for ${upgradeChars}` : "", class: upgrades ? "el-up" : "", verdict: null },
    { id: "keep", label: "Keep", short: "Keep", value: r ? counts.value.keep : dash, sub: "", class: "", verdict: "keep" as const },
    { id: "spare", label: "Spare", short: "Spare", value: r ? counts.value.spare : dash, sub: "", class: "", verdict: "spare" as const },
    { id: "feed", label: "Feed", short: "Feed", value: r ? counts.value.feed : dash, sub: "", class: "", verdict: "feed" as const },
  ];
});

const tabs = computed(() => {
  const r = pass.value?.bestOwner;
  return [
    { id: "verdicts" as const, label: "Inventory verdicts", short: "Verdicts", count: r ? r.echoes.length : null },
    { id: "tune" as const, label: "Tune or Feed", short: "Tune or Feed", count: r ? r.echoes.filter((e) => e.lines < 5).length : null },
    { id: "reroll" as const, label: "Re-roll advisor", short: "Re-roll", count: null },
    { id: "benchmark" as const, label: "Build benchmark", short: "Benchmark", count: null },
  ];
});

const progressLabel = computed(() => {
  const p = passStatus.progress;
  if (!p?.label) return "";
  return p.phase === "echoes" ? echoName(p.label) : p.label;
});
/** the three pass phases as one segmented bar: done phases full, the current one by its count */
function phaseFill(i: number): string {
  const p = passStatus.progress;
  const at = p ? PASS_PHASES.indexOf(p.phase as (typeof PASS_PHASES)[number]) : -1;
  if (!p || at < 0 || i > at) return "0%";
  if (i < at) return "100%";
  return `${Math.round((p.done / (p.total || 1)) * 100)}%`;
}

const ctas = [
  { id: "import", to: "/settings", title: "Import your data", text: "Restore a Wuthering Tools export under Settings › Backup & Restore." },
  { id: "scan", to: "/inventory", title: "Scan or add echoes", text: "Inventory › Import echoes: PC screenshots, phone screenshots or a shared album." },
  { id: "build", to: "/", title: "Build a character", text: "Pick a weapon and equip five echoes in the calculator." },
];

onMounted(() => {
  void lab.refresh().then(() => {
    if (tab.value === "benchmark") void lab.runBenchmarks();
  });
});
</script>
