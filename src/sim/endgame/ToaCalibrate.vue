<template>
  <section class="flex flex-col gap-3" data-test-toa-calibrate>
    <div class="card bg-base-100 border border-base-300 shadow-sm">
      <div class="card-body p-3 sm:p-4 gap-1.5">
        <h3 class="font-bold">Sim vs you</h3>
        <p class="text-sm opacity-80 leading-snug">
          The sim plays every rotation perfectly against one target that never moves, phases or goes invulnerable — real clears take
          longer. Log one real clear per team: pick the floor (its sim time is shown) and type the clock. The team's other floors are then
          shown at your pace, and the plan can use it.
        </p>
        <div class="flex flex-wrap items-center gap-2 mt-1 text-sm">
          <span class="opacity-80">I type the</span>
          <div class="join" role="radiogroup" aria-label="which clock you type">
            <button
              v-for="r in READINGS"
              :key="r.id"
              type="button"
              role="radio"
              class="btn btn-xs join-item"
              :class="reading === r.id ? 'btn-primary' : ''"
              :aria-checked="reading === r.id"
              :data-test-toa-calibrate-reading="r.id"
              @click="$emit('update:reading', r.id)"
            >
              {{ r.label }}
            </button>
          </div>
          <span class="text-xs opacity-60">{{ reading === "left" ? "the 5:00 countdown when the floor fell" : "5:00 minus the time left" }}</span>
        </div>
      </div>
    </div>

    <div class="card bg-base-100 border border-base-300 shadow-sm">
      <div class="card-body p-2 sm:p-3 gap-0">
        <ul class="flex flex-col divide-y divide-base-300">
          <li v-for="t in list" :key="t.id" class="py-2.5 px-1 flex flex-wrap items-center gap-x-3 gap-y-2" :data-test-toa-calibrate-team="t.id">
            <div class="flex items-center gap-2 min-w-0 flex-1 basis-56">
              <ToaPortraits :keys="t.appKeys" :main="t.mainDps" size="2rem" />
              <div class="min-w-0 leading-tight">
                <div class="text-[0.8rem] sm:text-sm font-medium line-clamp-2 break-words" :title="namesOf(t.appKeys)">{{ namesOf(t.appKeys) }}</div>
                <div class="text-[0.7rem] opacity-60 truncate"><span v-if="t.saved" class="text-primary font-semibold">your team · </span>{{ planned.get(t.id) ? `planned: ${planned.get(t.id)}` : "not in the plan" }}</div>
              </div>
            </div>
            <template v-if="clears[t.id]">
              <div class="text-sm leading-tight" data-test-toa-calibrate-logged>
                <div>
                  {{ floorLabel(clears[t.id]!.floorId) }}: you <b class="tabular-nums">{{ clockText(clears[t.id]!.seconds) }}</b><span class="opacity-60"> used</span>
                  <span class="opacity-60"> · sim {{ clockText(clears[t.id]!.sim) }}</span>
                </div>
                <div class="text-xs" :class="paceClass(clears[t.id]!)">×{{ (clears[t.id]!.seconds / clears[t.id]!.sim).toFixed(2) }} the sim's time</div>
              </div>
              <button type="button" class="btn btn-ghost btn-xs" :data-test-toa-calibrate-forget="t.id" @click="$emit('forget', t.id)">Remove</button>
            </template>
            <form v-else class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 max-sm:w-full" @submit.prevent="save(t)">
              <select v-model="floorOf[t.id]" class="select select-bordered select-xs min-w-0 max-sm:flex-1" :aria-label="`floor for ${namesOf(t.appKeys)} (its sim time)`" data-test-toa-calibrate-floor>
                <option v-for="f in floors" :key="f.id" :value="f.id">{{ floorLabel(f.id) }} · {{ clockText(simOf(t.id, f.id)) }}</option>
              </select>
              <input
                v-model="timeOf[t.id]"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                :placeholder="reading === 'left' ? 'left' : 'used'"
                class="input input-bordered input-xs w-14 tabular-nums"
                :class="{ 'input-error': bad[t.id] }"
                :aria-label="`your clear for ${namesOf(t.appKeys)}: time ${reading}, m:ss`"
                data-test-toa-calibrate-time
                @input="bad[t.id] = false"
              />
              <button type="submit" class="btn btn-primary btn-xs" :disabled="!timeOf[t.id]" data-test-toa-calibrate-save>Log</button>
              <span v-if="preview(t.id)" class="basis-full text-[0.7rem] opacity-70 tabular-nums sm:text-right" data-test-toa-calibrate-preview>{{ preview(t.id) }}</span>
            </form>
          </li>
        </ul>
        <button v-if="candidates.length > list.length || showAll" type="button" class="btn btn-ghost btn-xs mt-1" @click="showAll = !showAll">
          {{ showAll ? "Only the teams in the plan or a top 3" : `All ${candidates.length} teams` }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+ (/endgame): log a real clear per team — what the clock read on one floor — beside the sim's time
// for it; the ratio is that team's pace (crests.ts `paceOf`), applied to its other floors and, optionally, the plan.
import { computed, reactive, ref, watchEffect } from "vue";
import { getCharacterRosterDisplayName } from "../../characters/characters";
import { clearSecondsUsed, clockText, type ClockReading, type LoggedClear } from "./crests";
import { floorLabel, type ToaFloor } from "./toaData";
import type { CandidateTeam, FloorResult } from "./toaRun";
import type { Plan } from "./vigorPlan";
import ToaPortraits from "./ToaPortraits.vue";

const props = defineProps<{
  candidates: CandidateTeam[];
  results: FloorResult[];
  floors: ToaFloor[];
  plan: Plan | null;
  /** team ids in some floor's top 3 */
  featured: Set<string>;
  clears: Record<string, LoggedClear>;
  /** what the player types: the time left (the game's countdown) or the time used */
  reading: ClockReading;
}>();
const emit = defineEmits<{ log: [team: CandidateTeam, floorId: string, seconds: number, sim: number]; forget: [teamId: string]; "update:reading": [value: ClockReading] }>();

const READINGS = [
  { id: "left", label: "time left" },
  { id: "used", label: "time used" },
] as const;

const showAll = ref(false);
const floorOf = reactive<Record<string, string>>({});
const timeOf = reactive<Record<string, string>>({});
const bad = reactive<Record<string, boolean>>({});

const planned = computed(() => {
  const out = new Map<string, string>();
  for (const a of props.plan?.assignments ?? []) if (a.option) out.set(a.option.id, [out.get(a.option.id), floorLabel(a.stageId)].filter(Boolean).join(", "));
  return out;
});
const list = computed(() => (showAll.value ? props.candidates : props.candidates.filter((c) => planned.value.has(c.id) || props.featured.has(c.id) || props.clears[c.id])));
const namesOf = (keys: string[]): string => keys.map((k) => getCharacterRosterDisplayName(k)).join(" · ");
const simOf = (teamId: string, floorId: string): number | null => props.results.find((r) => r.teamId === teamId && r.floorId === floorId)?.seconds ?? null;
const paceClass = (c: LoggedClear): string => (c.seconds / c.sim > 2 ? "text-warning" : "opacity-70");

watchEffect(() => {
  for (const c of props.candidates) {
    if (floorOf[c.id]) continue;
    // the floor the plan seats the team on, else the first
    floorOf[c.id] = props.plan?.assignments.find((a) => a.option?.id === c.id)?.stageId ?? props.floors[0]?.id ?? "";
  }
});

/** what the typed clock comes to, before it is logged: "= 1:42 used · ×2.3 the sim" */
function preview(teamId: string): string {
  const text = timeOf[teamId] ?? "";
  if (!text.trim()) return "";
  const used = clearSecondsUsed(text, props.reading);
  if (used === null) return "not a clock reading (m:ss or seconds)";
  const sim = simOf(teamId, floorOf[teamId] ?? "");
  return `= ${clockText(used)} used${sim ? ` · ×${(used / sim).toFixed(2)} the sim` : ""}`;
}

function save(t: CandidateTeam): void {
  const seconds = clearSecondsUsed(timeOf[t.id] ?? "", props.reading);
  const floorId = floorOf[t.id] ?? props.floors[0]?.id ?? "";
  const sim = simOf(t.id, floorId);
  bad[t.id] = seconds === null || !sim;
  if (seconds === null || !sim) return;
  emit("log", t, floorId, seconds, sim);
  timeOf[t.id] = "";
}
</script>
