<template>
  <section class="space-y-3" data-test-echo-lab-verdicts>
    <!-- feed list: the bulk cleanup, grouped the way the game's echo filter works -->
    <div
      v-if="groups.length && (filters.verdict === 'all' || filters.verdict === 'feed')"
      class="rounded-box border border-base-300 bg-base-100"
      data-test-echo-lab-feed-list>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <span class="flex items-center gap-1">
          <span class="el-chip el-chip--feed">Feed list</span>
          <EchoLabPopover id="feed" label="Clearing the feed list in game" align="left">
            <p>Each group is one filter in the game's echo list: <b>Sonata</b> (the set), <b>Cost</b> and <b>Main Stat</b>. Filter, check the echoes against the list, and use them as tuning EXP.</p>
            <p>Feed means no built character gains damage from the echo in any slot it may take (same cost, keeping every active set bonus and any Healing Bonus, at most one ER roll lost), nobody wears it, and its substats are below what your builds already wear.</p>
            <p class="opacity-70">Lock your favourites in game first. Characters you have not built yet are not counted.</p>
          </EchoLabPopover>
        </span>
        <span class="text-sm">
          <b class="tabular-nums">{{ feedCount }}</b> echo{{ feedCount === 1 ? "" : "es" }} no build gains from
          <span class="opacity-60">· {{ groups.length }} group{{ groups.length === 1 ? "" : "s" }}</span>
        </span>
        <div class="ml-auto flex items-center gap-2 max-sm:-mr-2">
          <button type="button" class="btn btn-ghost btn-xs" data-test-echo-lab-feed-copy @click="copyFeed">Copy list</button>
          <button type="button" class="btn btn-ghost btn-xs" :aria-expanded="feedOpen" data-test-echo-lab-feed-toggle @click="feedOpen = !feedOpen">
            {{ feedOpen ? "Hide groups" : "Show groups" }}
          </button>
        </div>
      </div>
      <ul v-if="feedOpen" class="grid grid-cols-1 gap-x-4 border-t border-base-300 px-4 py-2 sm:grid-cols-2 xl:grid-cols-3">
        <li v-for="g in groups" :key="`${g.cost}|${g.set}|${g.main}`" class="flex min-w-0 items-center gap-2 py-1.5 text-sm" :data-test-echo-lab-feed-group="`${g.cost}|${g.set}|${g.main}`">
          <span class="w-8 shrink-0 text-right font-mono font-bold tabular-nums">{{ g.count }}×</span>
          <span class="badge badge-sm badge-ghost shrink-0">C{{ g.cost ?? "?" }}</span>
          <img v-if="setIcon(g.set)" :src="setIcon(g.set) ?? undefined" :alt="setLabel(g.set)" class="size-4 shrink-0" loading="lazy" />
          <span class="min-w-0 flex-1 truncate" :title="`${setLabel(g.set)} · ${mainLabel(g.main)}`">{{ setLabel(g.set) }} <span class="opacity-60">· {{ mainLabel(g.main) }}</span></span>
          <button type="button" class="btn btn-ghost btn-xs shrink-0" @click="showGroup(g)">Show</button>
        </li>
      </ul>
    </div>

    <!-- filters -->
    <div class="rounded-box border border-base-300 bg-base-100 px-3 py-2.5" data-test-echo-lab-filters>
      <div class="flex flex-wrap items-center gap-2">
        <div class="el-seg grid grid-cols-4 max-sm:w-full sm:inline-flex" role="group" aria-label="Verdict">
          <button
            v-for="v in verdictOptions"
            :key="v.value"
            type="button"
            class="el-seg__btn"
            :class="{ 'el-seg__btn--on': filters.verdict === v.value }"
            :aria-pressed="filters.verdict === v.value"
            :data-test-echo-lab-filter-verdict="v.value"
            @click="set('verdict', v.value)">
            {{ v.label }}<span class="text-xs tabular-nums opacity-60">{{ v.count }}</span>
          </button>
        </div>
        <button type="button" class="btn btn-sm btn-ghost lg:hidden" :aria-expanded="moreOpen" data-test-echo-lab-filters-more @click="moreOpen = !moreOpen">
          Filters<span v-if="extraActive" class="badge badge-primary badge-sm">{{ extraActive }}</span>
        </button>
        <label class="input input-sm input-bordered flex min-w-0 flex-1 items-center gap-2 lg:ml-auto lg:w-56 lg:flex-none">
          <svg viewBox="0 0 24 24" class="size-4 shrink-0 opacity-50" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input :value="filters.search" type="search" class="w-full min-w-0" placeholder="Echo, set or stat" aria-label="Search echoes" data-test-echo-lab-search @input="set('search', ($event.target as HTMLInputElement).value)" />
        </label>
      </div>
      <div class="mt-2 flex-wrap items-center gap-2" :class="moreOpen ? 'flex' : 'hidden lg:flex'">
        <div class="el-seg inline-flex" role="group" aria-label="Cost">
          <span class="self-center px-1.5 text-xs opacity-60">Cost</span>
          <button
            v-for="c in costOptions"
            :key="String(c)"
            type="button"
            class="el-seg__btn el-seg__btn--xs"
            :class="{ 'el-seg__btn--on': filters.cost === c }"
            :aria-pressed="filters.cost === c"
            :data-test-echo-lab-filter-cost="c"
            @click="set('cost', c)">
            {{ c === "all" ? "Any" : c }}
          </button>
        </div>
        <select :value="filters.set" class="el-select select select-bordered select-xs" aria-label="Set" data-test-echo-lab-filter-set @change="set('set', ($event.target as HTMLSelectElement).value)">
          <option value="all">Any set</option>
          <option v-for="s in setOptions" :key="s.value" :value="s.value">{{ s.label }} ({{ s.count }})</option>
        </select>
        <select :value="filters.main" class="el-select select select-bordered select-xs" aria-label="Main stat" data-test-echo-lab-filter-main @change="set('main', ($event.target as HTMLSelectElement).value)">
          <option value="all">Any main stat</option>
          <option v-for="m in mainOptions" :key="m.value" :value="m.value">{{ m.label }} ({{ m.count }})</option>
        </select>
        <select :value="filters.owner" class="el-select select select-bordered select-xs" aria-label="Owner" data-test-echo-lab-filter-owner @change="set('owner', ($event.target as HTMLSelectElement).value)">
          <option value="all">Any owner</option>
          <option v-for="o in ownerOptions" :key="o.value" :value="o.value">{{ o.label }} ({{ o.count }})</option>
        </select>
        <select :value="filters.worn" class="el-select select select-bordered select-xs" aria-label="Worn" data-test-echo-lab-filter-worn @change="set('worn', ($event.target as HTMLSelectElement).value as VerdictFilters['worn'])">
          <option value="all">Worn or not</option>
          <option value="worn">Worn</option>
          <option value="free">Not worn</option>
        </select>
        <div class="flex items-center gap-1 lg:ml-auto">
          <span class="text-xs opacity-60">Sort</span>
          <select v-model="sortKey" class="select select-bordered select-xs" aria-label="Sort by" data-test-echo-lab-sort>
            <option v-for="(label, key) in SORT_LABELS" :key="key" :value="key">{{ label }}</option>
          </select>
          <button type="button" class="btn btn-ghost btn-xs btn-square" :aria-label="sortDesc ? 'Reverse order (on)' : 'Reverse order'" :class="{ 'btn-active': sortDesc }" @click="sortDesc = !sortDesc">
            <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3" /></svg>
          </button>
        </div>
        <button v-if="activeCount" type="button" class="btn btn-ghost btn-xs" data-test-echo-lab-filters-reset @click="reset">Clear filters</button>
      </div>
    </div>

    <!-- the table (cards below 1024 px) -->
    <div class="el-table overflow-hidden rounded-box border border-base-300 bg-base-100 max-lg:border-0 max-lg:bg-transparent" role="table" aria-label="Inventory verdicts">
      <div class="el-thead" role="row">
        <button v-for="h in headers" :key="h.label" type="button" role="columnheader" class="flex items-center gap-1 text-left" :class="h.class" :disabled="!h.sort" @click="h.sort && sortBy(h.sort)">
          {{ h.label }}
          <span v-if="h.sort && sortKey === h.sort" aria-hidden="true">{{ sortDesc ? "▲" : "▼" }}</span>
        </button>
      </div>
      <div class="el-rows">
        <template v-for="row in visible" :key="row.echoId">
          <div
            class="el-row"
            :class="{ 'el-row--open': open === row.echoId }"
            role="row"
            tabindex="0"
            :aria-expanded="open === row.echoId"
            :data-test-echo-lab-row="row.echoId"
            :data-verdict="row.verdict"
            @click="toggle(row.echoId)"
            @keydown.enter.prevent="toggle(row.echoId)">
            <div class="el-cell-echo min-w-0" role="cell">
              <EchoLabEcho :echo="row.echo" :set="row.set" :cost="row.cost" :main="row.main" :rank="row.rank" :lines="row.lines" />
            </div>
            <div class="el-cell-set" role="cell">
              <img v-if="setIcon(row.set)" :title="setLabel(row.set)" :src="setIcon(row.set) ?? undefined" :alt="setLabel(row.set)" class="size-6" loading="lazy" />
            </div>
            <div class="el-cell-cost font-mono text-sm tabular-nums opacity-80" role="cell">{{ row.cost ?? "—" }}</div>
            <div class="el-cell-main truncate text-sm" role="cell">{{ mainLabel(row.main) }}</div>
            <div class="el-cell-subs" role="cell">
              <span
                v-for="line in linesOf(row)"
                :key="line.key"
                :title="line.tip"
                class="el-line"
                :class="`el-line--${line.tier}`"
                :data-tier="line.tier">{{ line.text }}</span>
              <span v-if="row.lines < 5" class="el-line el-line--dead">+{{ 5 - row.lines }} to roll</span>
            </div>
            <div class="el-cell-owner min-w-0" role="cell">
              <div v-if="row.best" :title="ownerTip(row)" class="flex min-w-0 items-center gap-2">
                <img :src="portrait(row.best.characterId)" :alt="characterName(row.best.characterId)" class="el-portrait size-7" loading="lazy" />
                <div class="min-w-0 leading-tight">
                  <div class="truncate text-sm">{{ characterName(row.best.characterId) }}</div>
                  <div class="truncate text-xs tabular-nums" :class="row.best.gain > 0 ? 'el-up font-semibold' : 'opacity-60'">
                    {{ signedPct(row.best.gain, 2) }}<span v-if="row.upgradeFor.length > 1" class="font-normal opacity-70"> · +{{ row.upgradeFor.length - 1 }} more</span>
                  </div>
                </div>
              </div>
              <span v-else class="text-xs opacity-50">{{ row.legalOwners ? "—" : "No slot" }}</span>
            </div>
            <div class="el-cell-worn flex min-w-0 items-center gap-2.5" role="cell">
              <span v-if="row.reason !== 'upgrade'" class="el-reason-card min-w-0 text-xs opacity-60">{{ reasonText(row) }}</span>
              <span class="flex items-center -space-x-1.5">
                <img
                  v-for="w in row.wornBy.slice(0, 3)"
                  :key="`${w.characterId}|${w.slot}`"
                  :title="w.stale ? `${characterName(w.characterId)}: marked equipped, but the build points at another echo` : `Worn by ${characterName(w.characterId)} (${slotLabel(w.slot)})`"
                  :src="portrait(w.characterId)"
                  :alt="characterName(w.characterId)"
                  class="el-portrait size-6 ring-2 ring-base-100"
                  :class="{ 'opacity-40 grayscale': w.stale }"
                  loading="lazy" />
                <span v-if="!row.wornBy.length" class="text-xs opacity-40 max-lg:hidden">—</span>
              </span>
            </div>
            <div class="el-cell-verdict flex flex-col items-end gap-0.5 lg:items-start" role="cell">
              <span class="el-chip" :class="`el-chip--${row.verdict}`" :data-test-echo-lab-verdict="row.verdict">{{ VERDICT_LABEL[row.verdict] }}</span>
              <span class="el-reason text-[0.7rem] leading-tight opacity-60">{{ reasonText(row) }}</span>
            </div>
          </div>
          <div v-if="open === row.echoId" class="el-detail border-b border-base-300 bg-base-200 px-4 py-3 text-sm" :data-test-echo-lab-detail="row.echoId">
            <div v-if="row.owners.length" class="mb-2">
              <div class="mb-1 text-xs font-semibold uppercase tracking-wide opacity-60">Scored on (best rotation, exact)</div>
              <ul class="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                <li v-for="o in row.owners" :key="o.characterId" class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg bg-base-100 px-2.5 py-1.5">
                  <img :src="portrait(o.characterId)" alt="" class="el-portrait size-6" loading="lazy" />
                  <span class="font-medium">{{ characterName(o.characterId) }}</span>
                  <span class="text-xs opacity-60">{{ slotLabel(o.slot) }}<template v-if="o.replacedEcho">, replaces {{ echoName(o.replacedEcho) }}</template></span>
                  <span class="ml-auto text-right tabular-nums" :class="o.gain > 0 ? 'el-up font-semibold' : 'opacity-70'">
                    {{ signedPct(o.gain, 2) }}
                    <span class="text-xs opacity-70">({{ o.damageGain >= 0 ? "+" : "" }}{{ compact(o.damageGain) }})</span>
                  </span>
                  <span v-if="Math.abs(o.erChange) > 0.05" class="w-full text-xs opacity-60">Energy Regen {{ o.erChange > 0 ? "+" : "" }}{{ o.erChange.toFixed(1) }}</span>
                </li>
              </ul>
            </div>
            <p class="text-xs opacity-70">
              <template v-if="row.legalOwners">{{ row.legalOwners }} built character{{ row.legalOwners === 1 ? "" : "s" }} can slot it.</template>
              <template v-else>No built character can slot it today.</template>
              <template v-if="row.blocked.set"> Would break an active set bonus on {{ row.blocked.set }} character{{ row.blocked.set === 1 ? "" : "s" }}.</template>
              <template v-if="row.blocked.er"> Would cost {{ row.blocked.er }} character{{ row.blocked.er === 1 ? "" : "s" }} more than one Energy Regen roll.</template>
              <template v-if="row.blocked.heal"> Would cost {{ row.blocked.heal }} healer{{ row.blocked.heal === 1 ? "" : "s" }} their Healing Bonus.</template>
              <template v-if="row.potential">
                Tune or Feed: {{ pct(row.potential.pBeat, 0) }} chance to beat {{ characterName(row.potential.characterId) }}'s {{ slotLabel(row.potential.slot).toLowerCase() }} echo once tuned.
              </template>
            </p>
          </div>
        </template>
      </div>
      <div v-if="!filtered.length" class="px-4 py-10 text-center text-sm opacity-70" data-test-echo-lab-no-match>
        No echo matches these filters. <button type="button" class="link link-primary" @click="reset">Clear filters</button>
      </div>
    </div>
    <div v-if="filtered.length" class="flex flex-wrap items-center justify-center gap-3 text-sm">
      <span class="opacity-60" data-test-echo-lab-count>Showing {{ visible.length }} of {{ filtered.length }}</span>
      <template v-if="visible.length < filtered.length">
        <button type="button" class="btn btn-sm" data-test-echo-lab-more @click="limit += PAGE">Show {{ Math.min(PAGE, filtered.length - visible.length) }} more</button>
        <button type="button" class="btn btn-ghost btn-sm" @click="limit = filtered.length">Show all</button>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+ Echo Lab — the "Inventory verdicts" tab: every inventory echo with its best owner, who wears
// it, and keep / spare / feed (bestOwner.ts), in a dense sortable table that becomes cards below 1024 px.
// Hover text is native `title`, never floating-vue's v-tooltip: that directive mounts one Popper component per
// element in a single global list, and ~9 per row made 60 rows cost ~250 ms and "Show all" (258) over a second.
import { computed, ref, watch } from "vue";
import { useToast } from "../../composables/useToast";
import type { BestOwnerResult, EchoVerdict, LabCharacterSummary } from "./bestOwner";
import EchoLabEcho from "./EchoLabEcho.vue";
import EchoLabPopover from "./EchoLabPopover.vue";
import {
  DEFAULT_FILTERS,
  SORT_LABELS,
  VERDICT_LABEL,
  activeFilterCount,
  applyFilters,
  characterName,
  compact,
  echoName,
  feedGroups,
  feedListText,
  lineText,
  lineTier,
  mainLabel,
  pct,
  portrait,
  reasonText,
  referenceCharacter,
  setIcon,
  setLabel,
  signedPct,
  slotLabel,
  sortRows,
  type FeedGroup,
  type VerdictFilters,
  type VerdictSortKey,
} from "./echoLabView";

const props = defineProps<{ result: BestOwnerResult }>();
const filters = defineModel<VerdictFilters>("filters", { required: true });

const PAGE = 60;
const limit = ref(PAGE);
const open = ref<string | null>(null);
const sortKey = ref<VerdictSortKey>("gain");
const sortDesc = ref(false);
const moreOpen = ref(false);
const feedOpen = ref(false);
const { showToast } = useToast();

const byId = computed(() => new Map<string, LabCharacterSummary>(props.result.characters.map((c) => [c.id, c])));
const rows = computed(() => props.result.echoes);
const filtered = computed(() => sortRows(applyFilters(rows.value, filters.value), sortKey.value, sortDesc.value));
const visible = computed(() => filtered.value.slice(0, limit.value));
const groups = computed(() => feedGroups(rows.value));
const feedCount = computed(() => groups.value.reduce((n, g) => n + g.count, 0));
const activeCount = computed(() => activeFilterCount(filters.value));
const extraActive = computed(() => activeFilterCount({ ...filters.value, verdict: "all", search: "" }));

watch(filters, () => (limit.value = PAGE), { deep: true });

function set<K extends keyof VerdictFilters>(key: K, value: VerdictFilters[K]): void {
  filters.value = { ...filters.value, [key]: value };
}
function reset(): void {
  filters.value = { ...DEFAULT_FILTERS };
}
function toggle(id: string): void {
  open.value = open.value === id ? null : id;
}
function sortBy(key: VerdictSortKey): void {
  if (sortKey.value === key) sortDesc.value = !sortDesc.value;
  else {
    sortKey.value = key;
    sortDesc.value = false;
  }
}
function showGroup(g: FeedGroup): void {
  filters.value = { ...DEFAULT_FILTERS, verdict: "feed", cost: g.cost ?? "all", set: g.set ?? "all", main: g.main ?? "all" };
  moreOpen.value = true;
}
async function copyFeed(): Promise<void> {
  try {
    await navigator.clipboard.writeText(feedListText(groups.value));
    showToast("Feed list copied", "success");
  } catch {
    showToast("Could not copy: the browser blocked the clipboard", "warning");
  }
}

// eslint-disable-next-line no-unused-vars -- the parameter of a function type
const count = (pred: (r: EchoVerdict) => boolean): number => rows.value.filter(pred).length;
const verdictOptions = computed(() => [
  { value: "all" as const, label: "All", count: rows.value.length },
  { value: "keep" as const, label: "Keep", count: count((r) => r.verdict === "keep") },
  { value: "spare" as const, label: "Spare", count: count((r) => r.verdict === "spare") },
  { value: "feed" as const, label: "Feed", count: count((r) => r.verdict === "feed") },
]);
const costOptions = computed<Array<"all" | number>>(() => ["all", ...[...new Set(rows.value.map((r) => r.cost).filter((c): c is number => Boolean(c)))].sort((a, b) => b - a)]);

// eslint-disable-next-line no-unused-vars -- the parameter of a function type
function tally(values: Array<string | null>, label: (v: string) => string): Array<{ value: string; label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].map(([value, n]) => ({ value, label: label(value), count: n })).sort((a, b) => a.label.localeCompare(b.label));
}
const setOptions = computed(() => tally(rows.value.map((r) => r.set), setLabel));
const mainOptions = computed(() => tally(rows.value.map((r) => r.main), mainLabel));
const ownerOptions = computed(() => tally(rows.value.flatMap((r) => [...new Set([r.best?.characterId ?? null, ...r.upgradeFor])]), characterName));

const headers: Array<{ label: string; sort: VerdictSortKey | null; class?: string }> = [
  { label: "Echo", sort: "name" },
  { label: "Set", sort: "set" },
  { label: "Cost", sort: "cost" },
  { label: "Main", sort: "main" },
  { label: "Substats (worth on owner)", sort: "lines" },
  { label: "Best owner · gain", sort: "gain" },
  { label: "Worn by", sort: "worn" },
  { label: "Verdict", sort: "verdict" },
];

function ownerTip(row: EchoVerdict): string {
  const b = row.best;
  if (!b) return "";
  const where = `${slotLabel(b.slot)}${b.replacedEcho ? `, replacing ${echoName(b.replacedEcho)}` : ""}`;
  return `${characterName(b.characterId)}: ${signedPct(b.gain, 2)} (${b.damageGain >= 0 ? "+" : ""}${compact(b.damageGain)} per rotation) · ${where}`;
}

function linesOf(row: EchoVerdict): Array<{ key: string; text: string; tier: string; tip: string }> {
  const ref = referenceCharacter(row);
  const per = ref ? byId.value.get(ref)?.perPoint ?? null : null;
  const out: Array<{ key: string; text: string; tier: string; tip: string }> = [];
  for (const line of row.subs) {
    const t = lineTier(per, line.key, line.value);
    out.push({
      key: line.key,
      text: lineText(line.key, line.value),
      tier: per ? t.tier : "good",
      tip: per && ref ? `About ${signedPct(t.worth, 2)} on ${characterName(ref)}'s best rotation` : "No built character to price it on",
    });
  }
  return out;
}
</script>
