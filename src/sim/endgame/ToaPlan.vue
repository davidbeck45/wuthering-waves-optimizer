<template>
  <section class="flex flex-col gap-4" data-test-toa-plan>
    <!-- summary -->
    <div class="card bg-base-100 border border-base-300 shadow-sm">
      <div class="card-body p-3 sm:p-4 gap-3">
        <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div>
            <div class="text-[0.7rem] font-semibold uppercase tracking-wider opacity-60">Hazard Zone plan</div>
            <div class="flex items-baseline gap-2">
              <span class="text-4xl font-bold tabular-nums leading-none" data-test-toa-plan-crests>{{ plan.crests }}</span>
              <span class="text-lg opacity-60 tabular-nums">/ {{ plan.maxCrests }}</span>
              <span class="text-warning text-xl" aria-hidden="true">★</span>
            </div>
          </div>
          <div class="text-sm leading-snug min-w-[16rem] flex-1">
            <div><b>{{ timedFilled }}</b> of {{ timedTotal }} timed stages and <b>{{ spareFilled }}</b> of {{ spareTotal }} low floors seated; every resonator within {{ vigor }} Vigor.</div>
            <div class="text-xs opacity-70 mt-0.5">
              Vigor: {{ vigor }} per resonator for the whole zone, side floors 1 / 2 / 3 / 4, Hazard floors 5 —
              <span class="font-semibold">check in game</span>. Low floors (Lv 70–80) take any spare team and are assumed to 3-crest.
            </div>
          </div>
          <label class="label cursor-pointer gap-2 py-0" :title="paceHelp">
            <input :checked="usePace" type="checkbox" class="toggle toggle-sm toggle-primary" :disabled="!hasClears" data-test-toa-use-pace @change="$emit('update:usePace', ($event.target as HTMLInputElement).checked)" />
            <span class="label-text text-sm">plan at my pace</span>
          </label>
        </div>
        <p v-if="plan.exhausted" class="text-xs text-warning">The search hit its budget: this is the best plan it found, maybe not the best there is.</p>
      </div>
    </div>

    <!-- the 12 stages, tower by tower -->
    <div class="grid gap-3 lg:grid-cols-3">
      <div v-for="t in season.towers" :key="t.id" class="card bg-base-100 border border-base-300 shadow-sm" :data-test-toa-plan-tower="t.id">
        <div class="card-body p-3 gap-2">
          <h3 class="font-bold flex items-center gap-2">
            {{ t.name }}
            <span class="badge badge-sm badge-ghost tabular-nums ml-auto">{{ towerCrests(t.id) }} / {{ t.floors.length * 3 }} ★</span>
          </h3>
          <ol class="flex flex-col divide-y divide-base-300">
            <!-- phones: floor, portraits, time and crests on one line, the names on their own full-width line below -->
            <li v-for="f in t.floors" :key="f.id" class="py-2 flex flex-wrap sm:flex-nowrap items-center gap-x-2 gap-y-0.5 min-w-0" :data-test-toa-stage="f.id">
              <div class="w-10 sm:w-12 shrink-0 leading-tight">
                <div class="text-sm font-semibold">F{{ f.floor }}</div>
                <div class="text-[0.65rem] opacity-60 tabular-nums">{{ f.cost }} Vigor</div>
              </div>
              <template v-if="stageOf(f.id)?.members.length">
                <ToaPortraits :keys="stageOf(f.id)!.members" :main="mainOf(f.id)" size="2rem" />
                <div class="min-w-0 flex-1 leading-tight max-sm:order-last max-sm:basis-full max-sm:pl-12">
                  <div class="text-[0.8rem] sm:text-sm line-clamp-2 break-words" :title="namesOf(stageOf(f.id)!.members)">{{ namesOf(stageOf(f.id)!.members) }}</div>
                  <div class="text-[0.7rem] opacity-60 truncate max-sm:hidden">{{ stageNote(f.id) }}</div>
                </div>
                <div class="sm:hidden flex-1 min-w-0 text-right text-[0.7rem] opacity-70 truncate">{{ stageNote(f.id) }}</div>
              </template>
              <div v-else class="min-w-0 flex-1 text-sm opacity-60">{{ f.hp ? "no team left with the Vigor" : "nobody left with the Vigor" }}</div>
              <div class="text-sm shrink-0 tabular-nums" :class="(stageOf(f.id)?.crests ?? 0) ? 'text-warning' : 'text-error'" :data-test-toa-stage-crests="stageOf(f.id)?.crests ?? 0">
                {{ "★".repeat(stageOf(f.id)?.crests ?? 0) }}<span class="opacity-30">{{ "★".repeat(3 - (stageOf(f.id)?.crests ?? 0)) }}</span>
              </div>
            </li>
          </ol>
        </div>
      </div>
    </div>

    <!-- Vigor left -->
    <div class="card bg-base-100 border border-base-300 shadow-sm">
      <div class="card-body p-3 sm:p-4 gap-2">
        <h3 class="font-bold">Vigor left</h3>
        <div class="flex flex-wrap gap-1.5" data-test-toa-vigor-left>
          <span v-for="v in vigorLeft" :key="v.pool" class="flex items-center gap-1.5 rounded-full bg-base-200 pl-0.5 pr-2 py-0.5" :class="{ 'opacity-50': v.left === vigor }" :title="`${v.name}: ${v.left} of ${vigor} Vigor left`">
            <ToaPortraits :keys="[v.key]" size="1.5rem" />
            <span class="text-xs tabular-nums font-semibold" :class="v.left === 0 ? 'text-error' : ''">{{ v.left }}</span>
          </span>
        </div>
      </div>
    </div>

    <!-- what could move -->
    <div class="grid gap-3 md:grid-cols-2 items-start">
      <div class="card bg-base-100 border border-base-300 shadow-sm">
        <div class="card-body p-3 sm:p-4 gap-2">
          <h3 class="font-bold">Alternatives</h3>
          <p class="text-xs opacity-70">The best plan if a stage can't have the team picked for it.</p>
          <ul class="flex flex-col gap-1.5 text-sm" data-test-toa-alternatives>
            <li v-for="a in alternatives.slice(0, 6)" :key="a.stageId" class="leading-snug">
              <b>{{ floorLabel(a.stageId) }}</b> without {{ namesOf(a.without.members) }}:
              <span :class="a.crestDelta < 0 ? 'text-error' : 'text-success'">{{ a.crestDelta === 0 ? "same crests" : `${a.crestDelta} crest${Math.abs(a.crestDelta) === 1 ? "" : "s"}` }}</span><span class="opacity-70">, {{ a.secondsDelta >= 0 ? "+" : "−" }}{{ Math.abs(a.secondsDelta).toFixed(1) }} s</span>
              <span class="opacity-70"> — {{ replacement(a) }}</span>
            </li>
            <li v-if="!alternatives.length" class="opacity-60">None: no timed stage has a team.</li>
          </ul>
        </div>
      </div>
      <div class="card bg-base-100 border border-base-300 shadow-sm">
        <div class="card-body p-3 sm:p-4 gap-2">
          <h3 class="font-bold">Close to the next crest</h3>
          <p class="text-xs opacity-70">Picked teams within 20 s of one more crest.</p>
          <ul class="flex flex-col gap-1.5 text-sm" data-test-toa-near-misses>
            <li v-for="m in misses" :key="m.stageId" class="leading-snug">
              <b>{{ floorLabel(m.stageId) }}</b>: {{ namesOf(m.option.members) }} is <b class="tabular-nums">{{ m.faster.toFixed(1) }} s</b> short of crest {{ m.crest }}
            </li>
            <li v-if="!misses.length" class="opacity-60">{{ plan.crests === plan.maxCrests ? "Every stage at 3 crests." : "None within 20 s." }}</li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+ (/endgame): the Vigor-legal plan for all 12 Hazard Zone stages (vigorPlan.ts) — crests out of 36,
// each tower's floors with the team seated, Vigor left per resonator, what the plan gives up without a pick, and the
// picked teams close to one more crest.
import { computed } from "vue";
import { getCharacterRosterDisplayName } from "../../characters/characters";
import { clockText } from "./crests";
import { floorLabel, type ToaSeason } from "./toaData";
import type { CandidateTeam } from "./toaRun";
import { vigorPool, type Plan, type PlanAlternative, type PlanOption } from "./vigorPlan";
import ToaPortraits from "./ToaPortraits.vue";

const props = defineProps<{
  season: ToaSeason;
  plan: Plan;
  alternatives: PlanAlternative[];
  misses: Array<{ stageId: string; option: PlanOption; crest: number; faster: number }>;
  candidates: CandidateTeam[];
  usePace: boolean;
  hasClears: boolean;
  vigor: number;
}>();
defineEmits<{ "update:usePace": [value: boolean] }>();

const byStage = computed(() => new Map(props.plan.assignments.map((a) => [a.stageId, a])));
const stageOf = (id: string) => byStage.value.get(id);
const teams = computed(() => new Map(props.candidates.map((c) => [c.id, c])));
const mainOf = (id: string): string | null => {
  const o = stageOf(id)?.option;
  return o ? teams.value.get(o.id)?.mainDps ?? null : null;
};
const nameOf = (k: string): string => getCharacterRosterDisplayName(k);
const namesOf = (keys: string[]): string => keys.map(nameOf).join(" · ");
const paced = computed(() => props.usePace && props.hasClears);
const timedTotal = computed(() => props.plan.assignments.filter((a) => a.timed).length);
const timedFilled = computed(() => props.plan.assignments.filter((a) => a.timed && a.option).length);
const spareTotal = computed(() => props.plan.assignments.filter((a) => !a.timed).length);
const spareFilled = computed(() => props.plan.assignments.filter((a) => !a.timed && a.members.length).length);
const towerCrests = (towerId: string): number => props.plan.assignments.filter((a) => a.stageId.startsWith(`${towerId}-`)).reduce((n, a) => n + a.crests, 0);
const vigorLeft = computed(() => {
  const keyOf = new Map<string, string>();
  for (const a of props.plan.assignments) for (const k of a.members) if (!keyOf.has(vigorPool(k))) keyOf.set(vigorPool(k), k);
  return Object.entries(props.plan.vigorLeft)
    .map(([pool, left]) => {
      const key = keyOf.get(pool) ?? pool;
      return { pool, key, left, name: pool === "Rover" ? "Rover" : nameOf(key) };
    })
    .sort((a, b) => a.left - b.left || (a.name < b.name ? -1 : 1));
});
/** under a seated stage: the kill time (sim, or at the player's pace) or "any spare team" */
const stageNote = (id: string): string => {
  const s = stageOf(id);
  if (!s) return "";
  if (s.timed) return `${clockText(s.option?.seconds ?? null)}${paced.value ? " at your pace" : " sim"}`;
  return `any spare team${s.shortHanded ? " · short-handed" : ""}`;
};
const replacement = (a: PlanAlternative): string => {
  const now = a.plan.assignments.find((x) => x.stageId === a.stageId);
  return now?.option ? `${namesOf(now.option.members)} takes it` : "it stays empty";
};
const paceHelp = "Scale each team's sim time by your own logged clear (teams without one: the median of yours). Log clears in the Calibrate tab.";
</script>
