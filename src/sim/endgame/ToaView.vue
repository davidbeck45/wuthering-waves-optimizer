<template>
  <Nav cur-page="endgame" :disable-mobile-nav="true"></Nav>
  <div class="toa px-3 sm:px-4 py-4 mx-auto w-full max-w-6xl" data-test-toa>
    <!-- header -->
    <header class="flex flex-wrap items-start gap-x-6 gap-y-3 mb-4">
      <div class="min-w-0 flex-1 basis-72">
        <div class="text-[0.7rem] font-semibold uppercase tracking-wider opacity-60">Endgame · Tower of Adversity</div>
        <h1 class="text-2xl font-bold leading-tight">Hazard Zone clear check</h1>
        <p class="text-sm opacity-75 mt-1 leading-snug max-w-2xl max-sm:hidden">
          Each floor's real HP, level and effects against the teams your account can field — Riley's wuwa_calc fights every floor at
          your sequences, weapons and echoes, then the kill time gives the crests and a Vigor-legal plan for all 12 stages.
          <span class="whitespace-nowrap">Sim, perfect execution.</span>
        </p>
        <p class="text-sm opacity-75 mt-1 leading-snug sm:hidden">Every floor against your own teams: kill time, crests and a plan for all 12 stages. Sim, perfect execution.</p>
      </div>
      <div v-if="status.entry" class="toa-season rounded-box border border-base-300 bg-base-100 px-3 py-2 shadow-sm w-full sm:w-auto" data-test-toa-season>
        <div class="flex items-center gap-2">
          <span class="badge badge-primary badge-sm font-semibold" data-test-toa-season-badge>Season {{ status.entry.season }}</span>
          <span v-if="status.current" class="text-sm"
            >resets in <b class="tabular-nums" data-test-toa-countdown>{{ countdown(status.endsAt!, now) }}</b></span
          >
          <span v-else class="text-sm text-warning font-semibold">ended</span>
        </div>
        <label class="flex items-center gap-1.5 mt-1 text-xs opacity-80">
          <span>server time,</span>
          <select v-model="prefs.region" class="select select-ghost select-xs h-6 min-h-6 px-1 font-semibold" aria-label="your server region" data-test-toa-region>
            <option v-for="r in SERVER_REGIONS" :key="r.id" :value="r.id">{{ r.label }} (UTC{{ r.offsetHours >= 0 ? "+" : "−" }}{{ Math.abs(r.offsetHours) }})</option>
          </select>
        </label>
        <div class="text-[0.7rem] opacity-60 tabular-nums">{{ dateRange }}</div>
      </div>
    </header>

    <!-- season data older than the game -->
    <div v-if="status.entry && !status.current" role="alert" class="alert max-sm:text-left max-sm:justify-items-start alert-warning mb-4 py-2 text-sm" data-test-toa-stale>
      <span>
        Season data not yet updated for <b>S{{ status.next }}</b>: this build still carries Season {{ status.entry.season }}, shown greyed below.
        The floors, HP and effects change every season.
      </span>
    </div>
    <div v-else-if="!status.entry" role="alert" class="alert max-sm:text-left max-sm:justify-items-start mb-4 text-sm" data-test-toa-no-season>
      <span>No Tower of Adversity season in this build has started yet.</span>
    </div>
    <div v-if="seasonError" role="alert" class="alert max-sm:text-left max-sm:justify-items-start alert-error mb-4 text-sm">{{ seasonError }}</div>

    <!-- account / engine state -->
    <div v-if="status.entry && !hasAccount" role="alert" class="alert max-sm:text-left max-sm:justify-items-start mb-4 text-sm flex flex-wrap" data-test-toa-empty>
      <span class="flex-1 min-w-48">
        <b>Import your account</b> to time your own teams on every floor: characters with a weapon equipped count as owned, their echoes as
        their build.
      </span>
      <RouterLink to="/settings" class="btn btn-sm btn-primary">Import data</RouterLink>
    </div>
    <div v-else-if="check && !running && !check.candidates.length" role="alert" class="alert max-sm:text-left max-sm:justify-items-start mb-4 text-sm flex flex-wrap" data-test-toa-no-team>
      <span class="flex-1 min-w-48"><b>No fieldable team</b>: wuwa_calc has no team of three resonators your account owns ({{ check.scanned }} checked).</span>
      <RouterLink to="/my-rankings" class="btn btn-sm">My roster rankings</RouterLink>
    </div>
    <div v-if="error" role="alert" class="alert max-sm:text-left max-sm:justify-items-start alert-error mb-4 text-sm flex flex-wrap" data-test-toa-error>
      <span class="flex-1 min-w-48">The engine failed: {{ error }}</span>
      <button type="button" class="btn btn-sm" @click="compute()">Try again</button>
    </div>

    <div v-if="running" class="card bg-base-100 border border-base-300 shadow-sm mb-4" data-test-toa-progress>
      <div class="card-body p-3 gap-1.5">
        <div class="flex items-center gap-2 text-sm">
          <span class="loading loading-spinner loading-xs text-primary"></span>
          <span class="truncate flex-1">{{ progress?.label ?? "Working" }}</span>
          <span class="tabular-nums opacity-70 shrink-0">{{ progress?.done ?? 0 }} / {{ progress?.total ?? 0 }}</span>
          <button type="button" class="btn btn-ghost btn-xs" data-test-toa-cancel @click="cancel">Cancel</button>
        </div>
        <progress class="progress progress-primary w-full" :value="progressValue" max="100"></progress>
      </div>
    </div>

    <template v-if="season">
      <!-- tabs + actions -->
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <div role="tablist" class="tabs tabs-boxed w-full sm:w-auto" data-test-toa-tabs>
          <button v-for="t in TABS" :key="t.id" type="button" role="tab" class="tab flex-1 sm:flex-none" :class="{ 'tab-active': tab === t.id }" :aria-selected="tab === t.id" :data-test-toa-tab="t.id" @click="tab = t.id">
            {{ t.label }}<span v-if="t.id === 'plan' && plan" class="ml-1.5 tabular-nums opacity-80">{{ plan.crests }}★</span>
          </button>
        </div>
        <div class="flex items-center gap-2 ml-auto max-sm:w-full max-sm:justify-between">
          <span v-if="check && !running" class="text-xs opacity-60" data-test-toa-summary>{{ check.candidates.length }} teams timed · {{ check.scanned }} solved</span>
          <button v-if="hasAccount" type="button" class="btn btn-sm" :disabled="running || !status.current" data-test-toa-recompute @click="compute()">
            {{ check ? "Recompute" : "Check my teams" }}
          </button>
        </div>
      </div>

      <!-- floors -->
      <div v-show="tab === 'floors'" data-test-toa-floors>
        <h2 class="toa-h2">Hazard Tower</h2>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2 mb-5">
          <ToaFloorCard
            v-for="f in hazardFloors"
            :key="f.id"
            :floor="f"
            tower-name="Hazard Tower"
            :rows="ranked.get(f.id) ?? []"
            :has-account="hasAccount"
            :running="running"
            :stale="!status.current"
            :pace-of="ownPace"
          />
        </div>
        <h2 class="toa-h2">Side towers · floor 4</h2>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2 mb-3">
          <ToaFloorCard
            v-for="f in sideFloors"
            :key="f.id"
            :floor="f"
            :tower-name="towerName(f)"
            :rows="ranked.get(f.id) ?? []"
            :has-account="hasAccount"
            :running="running"
            :stale="!status.current"
            :pace-of="ownPace"
          />
        </div>
        <details class="toa-low rounded-box border border-base-300 bg-base-100 shadow-sm mb-3" data-test-toa-low>
          <summary class="cursor-pointer px-3 py-2.5 text-sm flex items-center gap-2">
            <span class="font-semibold">Side floors 1–3</span>
            <span class="opacity-70">· any spare team (Lv 70–80)</span>
          </summary>
          <div class="px-3 pb-3 grid gap-2 md:grid-cols-2">
            <div v-for="f in lowFloors" :key="f.id" class="rounded-box bg-base-200/60 px-3 py-2 text-sm leading-snug" :data-test-toa-low-floor="f.id">
              <div class="flex items-baseline gap-2">
                <b>{{ towerName(f) }} {{ f.floor }}</b>
                <span class="text-xs opacity-60 tabular-nums">Lv {{ f.level }} · {{ f.cost }} Vigor · {{ f.goals.map((g) => (g ? `≥${g} s` : "clear")).join(" / ") }}</span>
              </div>
              <div class="text-xs opacity-80">{{ f.enemies.map((e) => e.name).join(", ") }}</div>
            </div>
          </div>
        </details>
      </div>

      <!-- plan -->
      <div v-if="tab === 'plan'">
        <ToaPlan
          v-if="plan && check && check.candidates.length"
          v-model:use-pace="prefs.usePace"
          :season="season"
          :plan="plan"
          :alternatives="alternatives"
          :misses="misses"
          :candidates="check.candidates"
          :has-clears="hasClears"
          :vigor="VIGOR_PER_RESONATOR"
        />
        <div v-else class="alert text-sm" data-test-toa-plan-empty>
          <span>{{ running ? "The plan appears once every team has fought the floors." : hasAccount ? "Check your teams first." : "Import your account to plan the zone." }}</span>
        </div>
      </div>

      <!-- calibrate -->
      <div v-if="tab === 'calibrate'">
        <ToaCalibrate
          v-if="check && check.candidates.length"
          v-model:reading="prefs.reading"
          :candidates="check.candidates"
          :results="check.results"
          :floors="timed"
          :plan="plan"
          :featured="featured"
          :clears="clears.clears"
          @log="logClear"
          @forget="forgetClear"
        />
        <div v-else class="alert text-sm"><span>Your teams appear here once they have been checked.</span></div>
      </div>

      <!-- credits -->
      <footer class="mt-6 text-xs opacity-70 leading-relaxed flex flex-col gap-0.5" data-test-toa-credits>
        <span>
          <a :href="season.credits.hpUrl" target="_blank" rel="noopener" class="link">{{ season.credits.hp }}</a>.
          Engine, kits and rotations: Riley31415's wuwa_calc. Enemy RES: this app's enemy list.
        </span>
        <span>
          Sim, perfect execution: one target, no dodging, boss phases or invulnerable windows; waves summed as one HP pool. Kill times past
          Riley's ~100 s run are extrapolated at the last loop's DPS. Vigor rules: check in game.
        </span>
        <span v-if="check" class="opacity-70">Checked {{ new Date(check.computedAt).toLocaleString() }}.</span>
      </footer>
    </template>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ — /endgame: the ToA clear check (src/sim/endgame/README in src/sim/README.md). Floors tab (one card per
// timed floor, the low side floors folded), Plan tab (all 12 stages within Vigor), Calibrate tab (sim vs your clears).
import { computed, ref } from "vue";
import Nav from "../../components/navigation/Nav.vue";
import { useDocumentTitle } from "../../composables/useDocumentTitle";
import { countdown, SERVER_REGIONS, timedFloors, VIGOR_PER_RESONATOR, type ToaFloor } from "./toaData";
import { useToa } from "./useToa";
import ToaFloorCard from "./ToaFloorCard.vue";
import ToaPlan from "./ToaPlan.vue";
import ToaCalibrate from "./ToaCalibrate.vue";

useDocumentTitle(
  "Tower of Adversity — Wuthering Waves Calculator & Optimizer",
  "Tower of Adversity clear check: every Hazard Zone floor's HP, level and effects against your own teams — kill time, crests and a Vigor-legal plan for all 12 stages.",
);

const TABS = [
  { id: "floors", label: "Floors" },
  { id: "plan", label: "Plan" },
  { id: "calibrate", label: "Calibrate" },
] as const;
type Tab = (typeof TABS)[number]["id"];
const tab = ref<Tab>("floors");

const {
  prefs,
  now,
  status,
  season,
  seasonError,
  hasAccount,
  check,
  running,
  progress,
  error,
  compute,
  cancel,
  ranked,
  plan,
  alternatives,
  misses,
  clears,
  hasClears,
  ownPace,
  logClear,
  forgetClear,
} = useToa();

const floorsOf = (towerId: string): ToaFloor[] => season.value?.towers.find((t) => t.id === towerId)?.floors ?? [];
const hazardFloors = computed(() => floorsOf("hazard"));
const sideFloors = computed(() => (season.value ? timedFloors(season.value).filter((f) => !f.id.startsWith("hazard")) : []));
const lowFloors = computed(() => (season.value ? season.value.towers.flatMap((t) => t.floors).filter((f) => !f.hp) : []));
/** the timed floors, Hazard first (what a clear is usually logged on) */
const timed = computed(() => (season.value ? [...timedFloors(season.value)].sort((a, b) => Number(!a.id.startsWith("hazard")) - Number(!b.id.startsWith("hazard"))) : []));
const towerName = (f: ToaFloor): string => season.value?.towers.find((t) => t.floors.includes(f))?.name ?? "";
const featured = computed(() => new Set([...ranked.value.values()].flatMap((rows) => rows.slice(0, 3).map((r) => r.team.id))));
const dateRange = computed(() => {
  const e = status.value.entry;
  return e ? `${e.start} → ${e.end} ${String(e.resetHour ?? 4).padStart(2, "0")}:00` : "";
});
const progressValue = computed(() => {
  const p = progress.value;
  if (!p) return 0;
  // the solve is most of the work; the floors the rest
  const frac = p.total ? p.done / p.total : 0;
  return Math.round(p.phase === "teams" ? 2 : p.phase === "solve" ? 2 + frac * 78 : 80 + frac * 20);
});
</script>

<style scoped>
.toa-h2 {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.65;
  margin: 0 0 0.5rem;
}
.toa-low summary {
  list-style: none;
}
.toa-low summary::-webkit-details-marker {
  display: none;
}
.toa-low summary::after {
  content: "▸";
  margin-left: auto;
  opacity: 0.6;
  transition: transform 0.15s;
}
.toa-low[open] summary::after {
  transform: rotate(90deg);
}
</style>
