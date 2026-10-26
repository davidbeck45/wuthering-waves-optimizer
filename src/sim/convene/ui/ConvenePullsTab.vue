<template>
  <!-- Wuthering Tools+: "My pulls" — the imported Convene history, read for pity, guarantee and luck -->
  <div class="convene-pulls" data-test-convene-pulls>
    <header class="mb-5 flex flex-wrap items-end gap-x-4 gap-y-3">
      <div class="min-w-0 flex-1">
        <h1 class="text-2xl font-semibold md:text-3xl">My pulls</h1>
        <p class="mt-1 max-w-3xl text-sm text-base-content/70">
          Your Convene history from Kuro's own records, kept in this browser. Pity, guarantee and luck are read straight
          off it; luck is measured against the simulator's pity model, not site-wide stats.
        </p>
      </div>
      <div v-if="player" class="flex flex-wrap items-center gap-2" data-test-convene-player>
        <select
          v-if="players.length > 1"
          class="select select-bordered select-sm"
          :value="player.playerId"
          aria-label="Account"
          data-test-convene-player-select
          @change="selectPlayer(($event.target as HTMLSelectElement).value)">
          <option v-for="p in players" :key="p.playerId" :value="p.playerId">UID {{ maskPlayerId(p.playerId) }}</option>
        </select>
        <span v-else class="badge badge-ghost gap-1 py-3 font-mono text-xs" title="your player id, masked">UID {{ maskPlayerId(player.playerId) }}</span>
        <span v-if="player.updatedAt" class="text-xs text-base-content/60">updated {{ fmtAgo(player.updatedAt, now) }}</span>
        <button v-if="!importOpen" type="button" class="btn btn-sm btn-primary" data-test-convene-update @click="openImport">Update</button>
        <div class="dropdown dropdown-end">
          <div tabindex="0" role="button" class="btn btn-sm btn-ghost btn-square" aria-label="More" data-test-convene-more>
            <svg viewBox="0 0 24 24" class="size-5" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
          </div>
          <ul tabindex="0" class="dropdown-content menu z-20 mt-1 w-60 rounded-box border border-base-content/10 bg-base-100 p-2 shadow-lg">
            <li><button type="button" data-test-convene-export @click="exportBackup">Export a backup (JSON)</button></li>
            <li><button type="button" class="text-error" data-test-convene-delete @click="confirmDelete = true">Delete this history…</button></li>
          </ul>
        </div>
      </div>
    </header>

    <!-- a stored history this build can't read: never overwritten without the user's say-so -->
    <div v-if="readError" class="alert alert-warning mb-5 flex-wrap" role="alert" data-test-convene-unreadable>
      <span class="flex-1 min-w-[12rem]">{{ CONVENE_IMPORT_ERRORS[readError] }}</span>
      <div class="flex gap-2">
        <button type="button" class="btn btn-sm" data-test-convene-raw @click="downloadRaw">Download the saved copy</button>
        <button v-if="readError === 'corrupt'" type="button" class="btn btn-sm btn-error btn-outline" data-test-convene-reset @click="confirmReset = true">Reset…</button>
      </div>
    </div>

    <ConveneImportPanel
      v-if="!readError && importOpen"
      class="mb-6"
      :has-history="!!player"
      :closable="!!player"
      @close="importOpen = false"
      @imported="onImported" />

    <div v-if="lastImport && !importOpen" class="alert mb-5 py-2.5 text-sm" :class="lastImport.kind === 'ok' ? 'alert-success' : 'alert-warning'" role="status" data-test-convene-import-message :data-kind="lastImport.kind">
      <span>{{ lastImport.text }}</span>
      <button type="button" class="btn btn-ghost btn-xs" aria-label="Dismiss" @click="lastImport = null">✕</button>
    </div>

    <div v-if="!player && !readError" class="grid gap-3 sm:grid-cols-3" data-test-convene-empty>
      <div v-for="f in FEATURES" :key="f.title" class="rounded-box border border-base-content/5 bg-base-200/60 p-4">
        <div class="mb-1 flex items-center gap-2 font-medium">
          <svg viewBox="0 0 24 24" class="size-5 text-primary" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="f.icon" /></svg>
          {{ f.title }}
        </div>
        <p class="text-sm text-base-content/65">{{ f.text }}</p>
      </div>
    </div>

    <template v-if="pity && player">
      <div v-if="!hasPulls" class="alert mb-5" data-test-convene-no-pulls>
        <span>Kuro returned no pulls for this account. If you have pulled recently, open Convene › History in game and import a fresh link.</span>
      </div>
      <template v-else>
        <!-- headline numbers -->
        <section class="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4" data-test-convene-summary>
          <div class="tile">
            <div class="tile__label">Pulls</div>
            <div class="tile__value" data-test-convene-total-pulls>{{ fmtInt(pity.pulls) }}</div>
            <div class="tile__sub">{{ fmtInt(pity.astrite) }} Astrite worth of Tides</div>
          </div>
          <div class="tile">
            <div class="tile__label">5★</div>
            <div class="tile__value">{{ pity.fiveStars }}</div>
            <div class="tile__sub">
              <template v-if="overallAvg != null">{{ overallAvg.toFixed(1) }} pulls each <span class="opacity-70">(model {{ modelAvg.toFixed(1) }})</span></template>
              <template v-else>no full count yet</template>
            </div>
          </div>
          <div class="tile">
            <div class="tile__label">50/50</div>
            <div class="tile__value">{{ coin.won }}<span class="text-base-content/40">–</span>{{ coin.lost }}</div>
            <div class="tile__sub">
              <template v-if="coin.won + coin.lost">{{ fmtPct(coin.won / (coin.won + coin.lost), 0) }} won<template v-if="coin.guaranteed"> · {{ coin.guaranteed }} on a guarantee</template></template>
              <template v-else>no coin flip yet</template>
            </div>
          </div>
          <div class="tile">
            <div class="tile__label">Featured pity now</div>
            <div class="tile__value">{{ featured?.pity5 ?? 0 }}{{ featured?.pity5LowerBound ? "+" : "" }}<span class="text-base text-base-content/50">/80</span></div>
            <div class="tile__sub">
              <template v-if="featured?.guaranteed">next 5★ guaranteed featured</template>
              <template v-else-if="featured && !featured.guaranteeKnown">50/50 state unknown</template>
              <template v-else-if="featured">next 5★ is a 50/50</template>
              <template v-else>no featured pulls yet</template>
            </div>
          </div>
        </section>

        <!-- 5★ timeline -->
        <section v-if="pity.timeline.length" class="mb-7" data-test-convene-timeline>
          <div class="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h2 class="whitespace-nowrap text-lg font-semibold">5★ timeline</h2>
            <span class="text-sm text-base-content/60">newest first · the number is the pull it landed on</span>
          </div>
          <ol class="timeline-grid">
            <li v-for="f in timelineShown" :key="`${f.poolType}:${f.index}`" class="tl-card" :class="`tl-card--${f.outcome}`" :data-test-convene-timeline-item="f.name">
              <ConveneItemIcon :name="f.name" :item-key="f.key" :kind="f.kind" size="lg" />
              <div class="min-w-0 flex-1">
                <div class="truncate font-medium leading-tight">{{ f.name }}</div>
                <div class="mt-0.5 truncate text-xs text-base-content/60">{{ f.banner ?? poolShort(f.poolType) }}</div>
                <div class="mt-1 flex items-center gap-1.5">
                  <span class="pity-pill tabular-nums" :class="pillTone(f.pity, f.poolType)">{{ f.pity }}{{ f.lowerBound ? "+" : "" }}</span>
                  <span v-if="f.outcome === 'lost'" class="text-[0.7rem] font-medium text-error">lost 50/50</span>
                  <span v-else-if="f.outcome === 'won'" class="text-[0.7rem] font-medium text-success">won 50/50</span>
                  <span v-else-if="f.outcome === 'guaranteed'" class="text-[0.7rem] text-base-content/60">guaranteed</span>
                  <span class="ml-auto text-[0.7rem] text-base-content/50 tabular-nums">{{ fmtRecordDate(f.time) }}</span>
                </div>
              </div>
            </li>
          </ol>
          <button v-if="timeline.length > TIMELINE_PREVIEW" type="button" class="btn btn-ghost btn-sm mt-2 w-full" data-test-convene-timeline-more @click="timelineAll = !timelineAll">
            {{ timelineAll ? "Show the newest only" : `Show all ${timeline.length}` }}
          </button>
        </section>

        <!-- per pool -->
        <section data-test-convene-pools>
          <h2 class="mb-3 text-lg font-semibold">Pity by banner type</h2>
          <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ConvenePoolCard v-for="p in orderedPools" :key="p.poolType" :pool="p" :simulatable="SIM_POOLS.includes(p.poolType)" @simulate="simulate" />
          </div>
        </section>
      </template>
    </template>

    <!-- confirmations -->
    <dialog class="modal" :open="confirmDelete || confirmReset" data-test-convene-confirm>
      <div class="modal-box max-w-md">
        <h3 class="text-lg font-semibold">{{ confirmReset ? "Reset the saved history?" : "Delete this Convene history?" }}</h3>
        <p class="py-3 text-sm text-base-content/75">
          <template v-if="confirmReset">The saved copy can't be read by this version of the app. Download it first if you might want it back; resetting starts an empty history.</template>
          <template v-else>Every stored pull for UID {{ player ? maskPlayerId(player.playerId) : "" }} is removed from this browser. Kuro still has the last six months; anything older is gone unless you exported a backup.</template>
        </p>
        <div class="modal-action">
          <button type="button" class="btn btn-ghost" @click="closeConfirm">Cancel</button>
          <button v-if="!confirmReset" type="button" class="btn" @click="exportBackup">Export first</button>
          <button type="button" class="btn btn-error" data-test-convene-confirm-yes @click="confirmReset ? doReset() : doDelete()">{{ confirmReset ? "Reset" : "Delete" }}</button>
        </div>
      </div>
      <div class="modal-backdrop bg-black/40" @click="closeConfirm"></div>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { CONVENE_IMPORT_ERRORS, maskPlayerId } from "../gachaImport";
import { linkRecordsToBanners } from "../banners";
import { modelAveragePity, type PoolPity } from "../pity";
import { kindOfResourceId, poolOf } from "../pools";
import { normalizeItemName, resolveItem } from "../items";
import ConveneImportPanel from "./ConveneImportPanel.vue";
import ConvenePoolCard from "./ConvenePoolCard.vue";
import ConveneItemIcon from "./ConveneItemIcon.vue";
import { useBannerFeed, useConveneHistory, useNow } from "./useConvene";
import { fmtAgo, fmtInt, fmtPct, fmtRecordDate } from "./format";
import type { ConvenePrefillRequest } from "./types";
import { poolPrefillRequest } from "./prefill";
import type { ConveneTab } from "../prefs";

const emit = defineEmits<{ prefill: [request: ConvenePrefillRequest]; go: [tab: ConveneTab] }>();

const FEATURES = [
  { title: "Pity that's always right", text: "5★ and 4★ pity on every banner type, whether your next 5★ is guaranteed, and how far you are from soft pity.", icon: "M12 7v5l3 2M3.5 12a8.5 8.5 0 1017 0 8.5 8.5 0 00-17 0" },
  { title: "Your luck, measured", text: "Average pity and 50/50 record, ranked against the simulator's own pity model — plus every 5★ on a timeline.", icon: "M4 19h16M7 16V9m5 7V5m5 11v-4" },
  { title: "Straight into the odds", text: "One click puts your real pity and guarantee into the simulator, and the pull advisor prices the next copy with them.", icon: "M5 12h14m-5-5l5 5-5 5" },
];

/** the pools the odds simulator models (a featured 5★ with a 50/50, or always featured) */
const SIM_POOLS = [1, 2, 8, 9, 10, 11, 12, 13];

const now = useNow();
const { player, players, pity, hasPulls, readError, selectPlayer, removePlayer, backupText, rawText, resetUnreadable } = useConveneHistory();
const { banners } = useBannerFeed();
// open while there's no history; it stays mounted through the first import (the history appearing mid-import must
// not unmount it before it reports back), then closes on success
const importOpen = ref(!player.value);
watch(player, (p) => {
  if (!p) importOpen.value = true;
});
const confirmDelete = ref(false);
const confirmReset = ref(false);

const modelAvg = modelAveragePity();

const orderedPools = computed(() => {
  const pools = pity.value?.pools ?? [];
  // featured pools first, then the rest in pool order
  const rank = (p: PoolPity) => (p.pool.family === "featured" ? 0 : p.pool.family === "standard" ? 2 : 1);
  return pools.slice().sort((a, b) => rank(a) - rank(b) || a.poolType - b.poolType);
});

const featured = computed(() => pity.value?.pools.find((p) => p.poolType === 1) ?? null);

const coin = computed(() => {
  let won = 0;
  let lost = 0;
  let guaranteed = 0;
  for (const p of pity.value?.pools ?? []) {
    if (!p.fiftyFifty) continue;
    won += p.fiftyFifty.won;
    lost += p.fiftyFifty.lost;
    guaranteed += p.fiftyFifty.guaranteed;
  }
  return { won, lost, guaranteed };
});

const overallAvg = computed(() => {
  let sum = 0;
  let n = 0;
  for (const p of pity.value?.pools ?? []) {
    if (!p.luck) continue;
    for (const f of p.fiveStars) {
      if (f.lowerBound) continue;
      sum += f.pity;
      n += 1;
    }
  }
  return n ? sum / n : null;
});

/** the banner each 5★ came from, when the time (and the item) pins it down */
const bannerOf = computed(() => {
  const out = new Map<string, string>();
  const list = banners.value;
  if (!list.length || !player.value) return out;
  const byId = new Map(list.map((b) => [b.id, b]));
  for (const [type, records] of Object.entries(player.value.pools)) {
    const links = linkRecordsToBanners(Number(type), records, list);
    records.forEach((r, i) => {
      if (r.qualityLevel < 5) return;
      const link = links[i];
      const b = link?.bannerId ? byId.get(link.bannerId) : null;
      if (b) out.set(`${type}:${i}`, [b.label, b.title && normalizeItemName(b.title) !== normalizeItemName(r.name) ? b.title : null].filter(Boolean).join(" · "));
      else {
        // a lost 50/50 belongs to no one banner, but the banners running then usually share a phase label
        const labels = [...new Set((link?.candidates ?? []).map((id) => byId.get(id)?.label).filter(Boolean))];
        if (labels.length === 1) out.set(`${type}:${i}`, `${labels[0]} · ${poolOf(Number(type))?.short ?? ""}`);
      }
    });
  }
  return out;
});

const timeline = computed(() =>
  (pity.value?.timeline ?? [])
    .slice()
    .reverse()
    .map((f) => {
      const kind = kindOfResourceId(f.resourceId) ?? poolOf(f.poolType)?.kind ?? "resonator";
      return { ...f, kind, key: resolveItem(f.name, kind)?.key ?? null, banner: bannerOf.value.get(`${f.poolType}:${f.index}`) ?? null };
    }),
);

const TIMELINE_PREVIEW = 10;
const timelineAll = ref(false);
const timelineShown = computed(() => (timelineAll.value ? timeline.value : timeline.value.slice(0, TIMELINE_PREVIEW)));

const poolShort = (type: number): string => poolOf(type)?.short ?? `Pool ${type}`;

function pillTone(pity: number, poolType: number): string {
  if (poolOf(poolType)?.hardPity5 !== 80) return "pity-pill--mid";
  if (pity <= 40) return "pity-pill--early";
  if (pity >= 70) return "pity-pill--late";
  return "pity-pill--mid";
}

function simulate(p: PoolPity): void {
  const req = poolPrefillRequest(p);
  if (req) emit("prefill", req);
}

function openImport(): void {
  lastImport.value = null;
  importOpen.value = true;
}

const lastImport = ref<{ kind: "ok" | "warn"; text: string } | null>(null);

function onImported(_summary: unknown, message: { kind: "ok" | "warn"; text: string }): void {
  // the panel closes on a history with pulls; its outcome line moves up here
  if (hasPulls.value) {
    lastImport.value = message;
    importOpen.value = false;
  }
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const today = () => new Date().toISOString().slice(0, 10);

function exportBackup(): void {
  const p = player.value;
  const text = p ? backupText(p.playerId) : null;
  if (text) download(`wuwa-convene-history-${today()}.json`, text);
}

function downloadRaw(): void {
  const text = rawText();
  if (text) download(`wuwa-convene-history-unreadable-${today()}.json`, text);
}

function closeConfirm(): void {
  confirmDelete.value = false;
  confirmReset.value = false;
}

function doDelete(): void {
  const p = player.value;
  if (p) removePlayer(p.playerId);
  confirmDelete.value = false;
  importOpen.value = false;
}

function doReset(): void {
  resetUnreadable();
  confirmReset.value = false;
}
</script>

<style scoped>
.tile {
  border-radius: var(--rounded-box, 1rem);
  padding: 0.9rem 1rem;
  background: oklch(var(--b2));
  border: 1px solid oklch(var(--bc) / 0.05);
}
.tile__label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: oklch(var(--bc) / 0.55);
}
.tile__value {
  margin-top: 0.15rem;
  font-size: 1.75rem;
  line-height: 1.15;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.tile__sub {
  margin-top: 0.2rem;
  font-size: 0.78rem;
  color: oklch(var(--bc) / 0.6);
}
.timeline-grid {
  display: grid;
  gap: 0.6rem;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr));
}
.tl-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
  padding: 0.6rem 0.7rem;
  border-radius: 0.85rem;
  background: oklch(var(--b2));
  border: 1px solid oklch(var(--bc) / 0.05);
}
.tl-card--lost {
  border-color: oklch(var(--er) / 0.3);
}
.pity-pill {
  display: inline-flex;
  align-items: center;
  min-width: 1.9rem;
  justify-content: center;
  padding: 0.05rem 0.4rem;
  border-radius: 9999px;
  font-size: 0.72rem;
  font-weight: 600;
}
.pity-pill--early {
  color: oklch(var(--su));
  background: oklch(var(--su) / 0.14);
}
.pity-pill--mid {
  color: oklch(var(--bc) / 0.8);
  background: oklch(var(--bc) / 0.08);
}
.pity-pill--late {
  color: oklch(var(--wa));
  background: oklch(var(--wa) / 0.16);
}
</style>
