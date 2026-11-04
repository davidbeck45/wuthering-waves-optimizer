<template>
  <section v-if="echoCount" class="iq-bar" :data-state="status.kind" data-test-inventory-quality-bar>
    <div class="iq-bar__head">
      <span class="badge badge-primary badge-outline badge-sm shrink-0 font-semibold">Tools+</span>
      <h3 class="iq-bar__title">Echo Lab verdicts</h3>
      <EchoLabPopover id="inventory-quality" label="Echo Lab in your inventory" align="left">
        <p><b>Keep</b>: an upgrade for one of your built characters, worn, or worth tuning. <b>Spare</b>: within 2 % of what its best owner wears, a gamble to tune, or good substats with no slot today. <b>Feed</b>: no built character gains damage from it in any slot it can take.</p>
        <p><b>Top 4% roll</b>: only 4 in 100 echoes of its kind (same set, cost and main stat, as many substat lines rolled at random) do more damage on its owner's best rotation. <b>at +15</b>: still being tuned, so compared with +15 echoes.</p>
        <p class="opacity-80">A quick estimate, priced by the damage engine with this echo in the slot. Echo Lab's detail scores every outcome; once you have opened an echo there, its chip shows that exact figure. The two usually agree within 2 points.</p>
        <p class="opacity-80"><b>Feed candidates</b>, then tick an echo, <b>Select all</b> and <b>Mark trash</b>: every candidate is marked as trash in one go. Check the list first.</p>
        <p class="opacity-80"><b>Finish these first</b> and <b>Duplicates</b> keep their own order while they are on, whatever the sort says.</p>
      </EchoLabPopover>
      <RouterLink to="/echo-lab" class="iq-bar__link" data-test-inventory-quality-open-lab>Open Echo Lab ›</RouterLink>
    </div>
    <p class="iq-bar__intro">Each echo's chip says Keep, Spare or Feed for your builds, and how lucky its substats rolled, by damage on your characters' best rotations.</p>
    <div v-if="status.kind !== 'no-builds'" class="iq-bar__controls">
      <label class="iq-bar__sort">
        <span>Sort</span>
        <select :value="q.view.sort" class="select select-bordered select-sm" aria-label="Sort echoes" data-test-inventory-quality-sort @change="onSort">
          <option v-for="s in INVENTORY_SORTS" :key="s.value" :value="s.value">{{ s.label }}</option>
        </select>
      </label>
      <button
        type="button"
        class="btn btn-sm iq-bar__feed"
        :class="{ 'iq-bar__feed--on': q.view.feedOnly }"
        :aria-pressed="q.view.feedOnly"
        :disabled="!counts && !q.view.feedOnly"
        data-test-inventory-quality-feed
        @click="setFeedOnly(!q.view.feedOnly)">
        Feed candidates
        <span class="badge badge-sm" :class="q.view.feedOnly ? 'badge-neutral' : 'badge-warning'" data-test-inventory-quality-feed-count>{{ counts ? counts.feed : "…" }}</span>
      </button>
    </div>
    <p class="iq-bar__status" :data-state="status.kind" data-test-inventory-quality-status>
      <span v-if="status.kind === 'judging' || status.kind === 'rating'" class="loading loading-spinner loading-xs shrink-0" aria-hidden="true"></span>
      <span>{{ status.text }}</span>
      <button v-if="status.kind === 'error'" type="button" class="link link-primary" data-test-inventory-quality-retry @click="retry">Try again</button>
    </p>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+ — the Echo Lab row in Ryan's inventory (InventoryEchoesBrowser.vue renders it under his Filters
// panel): what the chips mean, the plus sort ("Best rolls first", "Feed first"), the "Feed candidates" filter and the
// progress of the run that fills the chips. Mounting it starts the run (useInventoryQuality); leaving stops it.
import { computed, onBeforeUnmount, onMounted } from "vue";
import EchoLabPopover from "../echoLab/EchoLabPopover.vue";
import { INVENTORY_SORTS, barStatus, isInventorySort } from "./inventoryQuality";
import { setFeedOnly, setInventorySort, useInventoryQuality } from "./useInventoryQuality";
import "../echoLab/echoLab.css";
import "./inventoryQuality.css";

const q = useInventoryQuality();
const echoCount = computed(() => q.lab.echoCount.value);
/** keep / spare / feed: the current pass's, or the last one's while Echo Lab judges again (the filter keeps working) */
const counts = computed(() => {
  if (!q.judged.value && !q.stale.value) return null;
  const c = { keep: 0, spare: 0, feed: 0 };
  for (const row of q.verdicts.value.values()) c[row.verdict] += 1;
  return c;
});

const PASS_PHASES = ["characters", "weights", "echoes"];
/** the pass's three phases as one fraction (Echo Lab's segmented bar, summed) */
const passProgress = computed(() => {
  const p = q.lab.passStatus.progress;
  const at = p ? PASS_PHASES.indexOf(p.phase) : -1;
  if (!p || at < 0) return null;
  return (at + Math.min(1, p.done / (p.total || 1))) / PASS_PHASES.length;
});

const status = computed(() =>
  barStatus({
    echoes: echoCount.value,
    builds: q.lab.pass.value && !q.lab.passStatus.running ? q.characters.value.size : q.lab.builtCount.value,
    judging: q.lab.passStatus.running,
    stale: q.stale.value,
    progress: passProgress.value,
    error: q.lab.pass.value ? null : q.lab.passStatus.error,
    judged: counts.value,
    rateable: q.progress.value.rateable,
    rated: q.progress.value.rated,
    rollSort: q.view.sort !== "default",
    ratingFailed: q.ratingFailed.value,
  }),
);

/** a failed pass runs again; failed ratings (the pass is in) pick up where they stopped */
function retry(): void {
  if (q.ratingFailed.value) q.retryRatings();
  else void q.lab.refresh({ force: true });
}

function onSort(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  if (isInventorySort(value)) setInventorySort(value);
}

// the account snapshot (a JSON copy of the stores and its fingerprint) runs in a task of its own, after Ryan's list
// has painted, not inside the page's first render
let leave: (() => void) | null = null;
let start: ReturnType<typeof setTimeout> | null = null;
onMounted(() => {
  start = setTimeout(() => {
    start = null;
    leave = q.activate();
  }, 0);
});
onBeforeUnmount(() => {
  if (start) clearTimeout(start);
  leave?.();
});
</script>
