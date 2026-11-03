<template>
  <section class="saved-card card border border-base-300 bg-base-100 shadow-sm" aria-labelledby="saved-results-title" data-test-saved-results>
    <div class="card-body gap-2 p-4 sm:p-5">
      <h2 id="saved-results-title" class="flex flex-wrap items-center gap-2 text-base font-semibold">
        Saved results <span class="badge badge-primary badge-outline badge-sm font-semibold">Tools+</span>
      </h2>
      <p class="text-sm opacity-80">My account, My roster rankings, Echo Lab and Weapons keep their last result in this browser, so they open at once next time.</p>
      <p class="text-xs opacity-80">
        Shown only while your characters, echoes and teams are unchanged, and only by the same app version. Clearing them never touches your data.
      </p>
      <p class="text-sm" data-test-saved-results-usage aria-live="polite">
        <template v-if="state === 'loading'">Checking what this browser keeps…</template>
        <template v-else-if="state === 'unavailable'">This browser isn't keeping results (a private window, or storage turned off), so these pages score on every visit.</template>
        <template v-else-if="state === 'cleared'">Cleared. These pages score again on your next visit.</template>
        <template v-else-if="!usage.count">Nothing saved yet.</template>
        <template v-else>
          <b>{{ usage.count }}</b> saved result{{ usage.count === 1 ? "" : "s" }} · <b>{{ sizeText(usage.bytes) }}</b> of the {{ sizeText(cap) }} this browser may use
        </template>
      </p>
      <ul v-if="state === 'ready' && usage.count" class="saved-card__list text-xs opacity-80" data-test-saved-results-list>
        <li v-for="row in rows" :key="row.cache">{{ row.label }}: {{ row.count }} · {{ sizeText(row.bytes) }}</li>
      </ul>
      <div class="card-actions mt-1">
        <button
          type="button"
          class="btn btn-sm btn-outline"
          :disabled="state === 'loading' || state === 'unavailable' || busy"
          data-test-saved-results-clear
          @click="clear">
          Clear saved results
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+ — Settings › "Saved results": what this browser keeps (persist/savedResults.ts) and a way to clear it.
// Your characters, echoes and teams are not touched: only the scored results the heavy pages saved.
import { computed, onMounted, ref } from "vue";
import { SAVED_RESULTS_CAP, savedResults, type SavedUsage } from "./savedResults";

const LABELS: Record<string, string> = {
  ranking: "Roster rankings",
  investPlan: "What to invest in next",
  echoLab: "Echo Lab",
  weaponValue: "Weapon value",
  weaponSelector: "Weapon picks",
};

const cap = SAVED_RESULTS_CAP;
const state = ref<"loading" | "ready" | "unavailable" | "cleared">("loading");
const usage = ref<SavedUsage>({ count: 0, bytes: 0, caches: {} });
const busy = ref(false);
const rows = computed(() =>
  Object.entries(usage.value.caches)
    .map(([cache, u]) => ({ cache, label: LABELS[cache] ?? cache, ...u }))
    .sort((a, b) => b.bytes - a.bytes),
);

/** "3.2 MB", "640 KB" (a no-break space: the unit never wraps away from its number) */
function sizeText(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}\u00a0MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}\u00a0KB`;
  return `${bytes}\u00a0bytes`;
}

async function load(): Promise<void> {
  if (!(await savedResults.available())) {
    state.value = "unavailable";
    return;
  }
  usage.value = await savedResults.usage();
  state.value = "ready";
}

async function clear(): Promise<void> {
  busy.value = true;
  try {
    const ok = await savedResults.clear();
    usage.value = { count: 0, bytes: 0, caches: {} };
    state.value = ok ? "cleared" : "unavailable";
  } finally {
    busy.value = false;
  }
}

onMounted(() => void load());
</script>

<style scoped>
.saved-card {
  max-width: 48rem;
  margin-top: 1.25rem;
}
.saved-card__list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.15rem 1rem;
}
</style>
