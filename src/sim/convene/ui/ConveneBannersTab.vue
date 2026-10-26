<template>
  <!-- Wuthering Tools+: every released Convene banner, from Kuro's own news feed -->
  <div class="convene-banners" data-test-convene-banners>
    <header class="mb-5 flex flex-wrap items-end gap-x-4 gap-y-3">
      <div class="min-w-0 flex-1">
        <h1 class="text-2xl font-semibold md:text-3xl">Banners</h1>
        <p class="mt-1 max-w-3xl text-sm text-base-content/70">
          Every released Convene banner, read from
          <a :href="NEWS_URL" target="_blank" rel="noopener noreferrer" class="link link-hover">Kuro's official news</a>.
          Times are server time.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <label class="flex items-center gap-2 text-sm">
          <span class="text-base-content/60">Server</span>
          <select v-model="serverId" class="select select-bordered select-sm" data-test-convene-server>
            <option v-for="r in SERVER_REGIONS" :key="r.id" :value="r.id">{{ r.label }} (UTC{{ r.offsetHours >= 0 ? "+" : "−" }}{{ Math.abs(r.offsetHours) }})</option>
          </select>
        </label>
        <span class="text-xs text-base-content/55" data-test-convene-feed-status>
          <span v-if="feedRefreshing" class="inline-flex items-center gap-1"><span class="loading loading-spinner loading-xs"></span> checking Kuro's news…</span>
          <template v-else-if="feed?.fetchedAt">checked {{ fmtAgo(feed.fetchedAt, now) }}</template>
          <template v-else-if="feed?.source === 'seed'">saved with the app</template>
        </span>
      </div>
    </header>

    <div v-if="feed?.error" class="alert alert-warning mb-5 py-2.5 text-sm" role="status" data-test-convene-feed-error>{{ feed.error }}</div>
    <div v-if="feedLoading && !banners.length" class="flex items-center gap-2 py-10 text-base-content/60"><span class="loading loading-spinner"></span> Loading banners…</div>

    <!-- running now -->
    <section v-if="live.length" class="mb-8" data-test-convene-live>
      <h2 class="mb-3 flex items-center gap-2 text-lg font-semibold">
        <span class="relative flex size-2.5"><span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60"></span><span class="relative inline-flex size-2.5 rounded-full bg-success"></span></span>
        Running now
        <span v-if="live[0]?.label" class="text-sm font-normal text-base-content/60">{{ live[0].label }}</span>
      </h2>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <article
          v-for="b in live"
          :key="b.id"
          class="live-card"
          :class="b.type === 'weapon' ? 'live-card--weapon' : 'live-card--resonator'"
          :data-test-convene-live-banner="b.fiveStars.map((f) => f.name).join(',')">
          <div class="flex gap-4">
            <div class="flex shrink-0 -space-x-3">
              <ConveneItemIcon v-for="f in b.fiveStars.slice(0, 3)" :key="f.name" :name="f.name" :item-key="f.key" :kind="b.type" size="xl" class="shadow-md" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-1.5 text-xs">
                <span class="badge badge-sm" :class="b.type === 'weapon' ? 'badge-secondary badge-outline' : 'badge-primary badge-outline'">{{ b.type === "weapon" ? "Weapon" : "Resonator" }}</span>
                <span v-if="b.category !== 'featured'" class="badge badge-sm badge-ghost capitalize">{{ b.category }}</span>
                <span v-if="runInfo(b)" class="badge badge-sm" :class="runInfo(b)!.first ? 'badge-accent' : 'badge-ghost'">{{ runInfo(b)!.badge }}</span>
              </div>
              <h3 class="mt-1 truncate text-lg font-semibold leading-tight">{{ b.fiveStars.map((f) => f.name).join(" · ") }}</h3>
              <p v-if="b.title && !b.fiveStars.some((f) => normalizeItemName(f.name) === normalizeItemName(b.title ?? ''))" class="truncate text-sm text-base-content/60">{{ b.title }}</p>
              <p v-if="runInfo(b)?.detail" class="mt-0.5 text-xs text-base-content/55">{{ runInfo(b)!.detail }}</p>
            </div>
          </div>
          <div v-if="b.fourStars.length" class="mt-3 flex flex-wrap items-center gap-1.5">
            <span class="mr-1 text-xs text-base-content/50">4★</span>
            <ConveneItemIcon v-for="f in b.fourStars" :key="f.name" :name="f.name" :item-key="f.key" :kind="b.type" :quality="4" size="sm" />
          </div>
          <div class="mt-3">
            <div class="flex items-baseline justify-between gap-2 text-xs text-base-content/60 tabular-nums">
              <span>{{ fmtServerTime(b.startMs, offsetHours) }}<template v-if="b.startApprox"> (version update)</template> – {{ fmtServerTime(b.endMs, offsetHours) }}</span>
              <span class="whitespace-nowrap font-semibold text-base-content" data-test-convene-countdown>{{ fmtDuration(b.endMs - now) }} left</span>
            </div>
            <progress class="progress mt-1.5 h-1.5 w-full" :class="b.type === 'weapon' ? 'progress-secondary' : 'progress-primary'" :value="now - b.startMs" :max="b.endMs - b.startMs"></progress>
          </div>
          <a :href="noticeUrl(b.articleId)" target="_blank" rel="noopener noreferrer" class="link link-hover mt-2 inline-block text-xs text-base-content/55">Kuro's notice ↗</a>
        </article>
      </div>
    </section>
    <div v-else-if="banners.length" class="alert mb-8" data-test-convene-none-live>No Convene banner is running right now on the {{ serverLabel }} server clock.</div>

    <!-- rerun watch -->
    <section v-if="reruns.length" class="mb-8" data-test-convene-reruns>
      <div class="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <h2 class="text-lg font-semibold">Rerun watch</h2>
        <span class="text-sm text-base-content/60">limited 5★s, longest wait first</span>
        <div class="join ml-auto">
          <button v-for="k in KINDS" :key="k.id" type="button" class="btn btn-xs join-item" :class="rerunKind === k.id ? 'btn-active' : ''" :data-test-convene-rerun-kind="k.id" @click="rerunKind = k.id">{{ k.label }}</button>
        </div>
      </div>
      <div class="overflow-hidden rounded-box border border-base-content/5 bg-base-200">
        <ul class="divide-y divide-base-content/5">
          <li v-for="r in rerunsShown" :key="r.key" class="rerun-row" :data-test-convene-rerun="r.name">
            <ConveneItemIcon :name="r.name" :item-key="r.itemKey" :kind="r.kind" size="md" />
            <div class="min-w-0">
              <div class="truncate font-medium">{{ r.name }}</div>
              <div class="truncate text-xs text-base-content/55">{{ r.runs }} run{{ r.runs === 1 ? "" : "s" }} · last {{ r.lastLabel ?? fmtServerTime(r.lastStart, offsetHours, { year: true, time: false }) }}</div>
            </div>
            <div class="rerun-row__bar" aria-hidden="true"><div :style="{ width: `${Math.min(100, (r.waitedMs / maxWait) * 100)}%` }"></div></div>
            <div class="text-right tabular-nums">
              <span v-if="r.live" class="badge badge-success badge-sm">running</span>
              <template v-else>
                <div class="font-semibold">{{ Math.round(r.waitedMs / 86_400_000) }} d</div>
                <div class="text-[0.7rem] text-base-content/50">since it ended</div>
              </template>
            </div>
          </li>
        </ul>
        <button v-if="rerunsFiltered.length > RERUN_PREVIEW" type="button" class="btn btn-ghost btn-sm w-full rounded-none" data-test-convene-reruns-more @click="rerunsAll = !rerunsAll">
          {{ rerunsAll ? "Show fewer" : `Show all ${rerunsFiltered.length}` }}
        </button>
      </div>
    </section>

    <!-- history -->
    <section v-if="banners.length" data-test-convene-history>
      <div class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 class="text-lg font-semibold">History</h2>
        <span class="text-sm text-base-content/60">{{ filtered.length }} banners</span>
        <div class="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <input v-model="query" type="search" class="input input-bordered input-sm min-w-0 flex-1 sm:w-48 sm:flex-none" placeholder="Find a resonator or weapon" aria-label="Find a banner" data-test-convene-history-search />
          <div class="join">
            <button v-for="k in KINDS_ALL" :key="k.id" type="button" class="btn btn-sm join-item" :class="historyKind === k.id ? 'btn-active' : ''" :data-test-convene-history-kind="k.id" @click="historyKind = k.id">{{ k.label }}</button>
          </div>
        </div>
      </div>
      <div class="grid grid-cols-1 gap-5">
        <div v-for="g in groupsShown" :key="g.key" :data-test-convene-version="g.key">
          <h3 class="mb-2 text-sm font-semibold uppercase tracking-wide text-base-content/50">{{ g.title }}</h3>
          <ul class="grid grid-cols-1 gap-2 lg:grid-cols-2">
            <li v-for="b in g.banners" :key="b.id" class="hist-row" :class="{ 'hist-row--live': isLive(b, now) }">
              <div class="flex shrink-0 -space-x-2">
                <ConveneItemIcon v-for="f in b.fiveStars.slice(0, 4)" :key="f.name" :name="f.name" :item-key="f.key" :kind="b.type" size="md" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="truncate font-medium leading-tight">{{ b.fiveStars.map((f) => f.name).join(" · ") }}</div>
                <div class="truncate text-xs text-base-content/55">
                  <span v-if="b.label">{{ b.label }} · </span>{{ fmtServerTime(b.startMs, offsetHours, { year: true, time: false }) }} – {{ fmtServerTime(b.endMs, offsetHours, { time: false }) }}
                </div>
              </div>
              <span v-if="isLive(b, now)" class="badge badge-success badge-sm">live</span>
              <span v-else class="badge badge-ghost badge-sm">{{ b.type === "weapon" ? "Weapon" : "Resonator" }}</span>
            </li>
          </ul>
        </div>
      </div>
      <button v-if="groups.length > GROUP_PREVIEW && !query" type="button" class="btn btn-ghost btn-sm mt-4 w-full" data-test-convene-history-more @click="historyAll = !historyAll">
        {{ historyAll ? "Show recent versions only" : `Show all ${groups.length} versions` }}
      </button>
      <p class="mt-6 text-xs text-base-content/50">
        1.0's launch banner was never posted in Kuro's news feed, so it's missing here. Banners that open with a version update
        start when Kuro posts that version's patch notes, usually about an hour before the servers open.
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { SERVER_REGIONS, featuredRuns, isLive, type ConveneBanner } from "../banners";
import { normalizeItemName } from "../items";
import { STANDARD_FIVE_STAR_RESONATORS } from "../pools";
import ConveneItemIcon from "./ConveneItemIcon.vue";
import { useBannerFeed, useNow } from "./useConvene";
import { fmtAgo, fmtDuration, fmtServerTime, fmtSpan } from "./format";

const NEWS_URL = "https://wutheringwaves.kurogames.com/en/main/news/";
const noticeUrl = (id: number) => `https://wutheringwaves.kurogames.com/en/main/news/detail/${id}`;

const KINDS = [
  { id: "resonator", label: "Resonators" },
  { id: "weapon", label: "Weapons" },
] as const;
const KINDS_ALL = [{ id: "all", label: "All" }, ...KINDS] as const;
const RERUN_PREVIEW = 8;
const GROUP_PREVIEW = 4;

const now = useNow();
const { feed, banners, feedLoading, feedRefreshing, serverId, offsetHours, load } = useBannerFeed();
onMounted(() => void load({ revalidate: true }));

const serverLabel = computed(() => SERVER_REGIONS.find((r) => r.id === serverId.value)?.label ?? "");
const live = computed(() =>
  banners.value.filter((b) => isLive(b, now.value)).sort((a, b) => (a.type === b.type ? a.startMs - b.startMs : a.type === "resonator" ? -1 : 1)),
);

// ── reruns ──
const runs = computed(() => featuredRuns(banners.value));
const standard = new Set(STANDARD_FIVE_STAR_RESONATORS.map((s) => normalizeItemName(s.name)));

/** "First run" / "Rerun · last ran 3.2 Phase I, 8 months before" for a live banner's first featured 5★ */
function runInfo(b: ConveneBanner): { first: boolean; badge: string; detail: string | null } | null {
  if (b.fiveStars.length !== 1) return null;
  const f = b.fiveStars[0]!;
  const list = runs.value.get(f.key ?? normalizeItemName(f.name)) ?? [];
  const before = list.filter((r) => r.startMs < b.startMs);
  if (!before.length) return { first: true, badge: "First run", detail: null };
  const prev = before[before.length - 1]!;
  const n = before.length + 1;
  return {
    first: false,
    badge: n === 2 ? "Rerun" : `Run ${n}`,
    detail: `Last ran ${prev.label ?? fmtServerTime(prev.startMs, offsetHours.value, { year: true, time: false })}, ${fmtSpan(b.startMs - prev.endMs)} before this one.`,
  };
}

interface RerunRow {
  key: string;
  name: string;
  itemKey: string | null;
  kind: "resonator" | "weapon";
  runs: number;
  lastStart: number;
  lastLabel: string | null;
  waitedMs: number;
  live: boolean;
}

const reruns = computed<RerunRow[]>(() => {
  const byKey = new Map<string, RerunRow>();
  for (const b of banners.value) {
    for (const f of b.fiveStars) {
      const key = f.key ?? normalizeItemName(f.name);
      if (b.type === "resonator" && standard.has(normalizeItemName(f.name))) continue;
      const row = byKey.get(key);
      const live = isLive(b, now.value);
      if (!row) {
        byKey.set(key, { key, name: f.name, itemKey: f.key, kind: b.type, runs: 1, lastStart: b.startMs, lastLabel: b.label, waitedMs: Math.max(0, now.value - b.endMs), live });
        continue;
      }
      row.runs += 1;
      row.live ||= live;
      if (b.startMs > row.lastStart) {
        row.lastStart = b.startMs;
        row.lastLabel = b.label;
        row.waitedMs = Math.max(0, now.value - b.endMs);
      }
    }
  }
  return [...byKey.values()].sort((a, b) => Number(a.live) - Number(b.live) || b.waitedMs - a.waitedMs);
});
const rerunKind = ref<"resonator" | "weapon">("resonator");
const rerunsAll = ref(false);
const rerunsFiltered = computed(() => reruns.value.filter((r) => r.kind === rerunKind.value));
const rerunsShown = computed(() => (rerunsAll.value ? rerunsFiltered.value : rerunsFiltered.value.slice(0, RERUN_PREVIEW)));
const maxWait = computed(() => Math.max(1, ...rerunsFiltered.value.map((r) => r.waitedMs)));

// ── history ──
const query = ref("");
const historyKind = ref<"all" | "resonator" | "weapon">("all");
const historyAll = ref(false);
const filtered = computed(() => {
  const q = normalizeItemName(query.value);
  return banners.value.filter(
    (b) =>
      (historyKind.value === "all" || b.type === historyKind.value) &&
      (!q || b.fiveStars.some((f) => normalizeItemName(f.name).includes(q)) || b.fourStars.some((f) => normalizeItemName(f.name).includes(q)) || normalizeItemName(b.title ?? "").includes(q)),
  );
});
const groups = computed(() => {
  const out: { key: string; title: string; banners: ConveneBanner[] }[] = [];
  for (const b of filtered.value) {
    const key = b.version ?? String(new Date(b.startMs).getUTCFullYear());
    let g = out[out.length - 1];
    if (!g || g.key !== key) {
      g = { key, title: b.version ? `Version ${b.version}` : key, banners: [] };
      out.push(g);
    }
    g.banners.push(b);
  }
  return out;
});
const groupsShown = computed(() => (historyAll.value || query.value ? groups.value : groups.value.slice(0, GROUP_PREVIEW)));
</script>

<style scoped>
.live-card {
  position: relative;
  overflow: hidden;
  border-radius: var(--rounded-box, 1rem);
  padding: 1rem 1.1rem;
  background: oklch(var(--b2));
  border: 1px solid oklch(var(--bc) / 0.06);
}
.live-card::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: oklch(var(--p));
}
.live-card--weapon::before {
  background: oklch(var(--s));
}
.rerun-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(0, 8rem) 4.5rem;
  align-items: center;
  gap: 0.75rem;
  padding: 0.55rem 0.9rem;
}
.rerun-row__bar {
  height: 0.4rem;
  border-radius: 9999px;
  background: oklch(var(--bc) / 0.07);
  overflow: hidden;
}
.rerun-row__bar > div {
  height: 100%;
  border-radius: inherit;
  background: oklch(var(--p) / 0.7);
}
@media (max-width: 639px) {
  .rerun-row {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }
  .rerun-row__bar {
    display: none;
  }
}
.hist-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
  padding: 0.55rem 0.75rem;
  border-radius: 0.85rem;
  background: oklch(var(--b2));
  border: 1px solid oklch(var(--bc) / 0.04);
}
.hist-row--live {
  border-color: oklch(var(--su) / 0.4);
}
</style>
