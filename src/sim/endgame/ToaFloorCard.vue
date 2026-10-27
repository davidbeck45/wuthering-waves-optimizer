<template>
  <article class="toa-floor min-w-0 card bg-base-100 border border-base-300 shadow-sm" :class="{ 'opacity-60 grayscale-[35%]': stale }" :data-test-toa-floor="floor.id">
    <div class="card-body p-3 sm:p-4 gap-3">
      <!-- title -->
      <header class="flex items-start gap-2">
        <div class="min-w-0 flex-1">
          <div class="text-[0.7rem] font-semibold uppercase tracking-wider opacity-60">{{ towerName }}</div>
          <h3 class="text-lg font-bold leading-tight">Floor {{ floor.floor }}</h3>
        </div>
        <div class="flex flex-wrap justify-end gap-1 text-xs">
          <span class="badge badge-ghost badge-sm tabular-nums" title="enemy level">Lv {{ floor.level }}</span>
          <span class="badge badge-ghost badge-sm tabular-nums" :title="`each resonator spends ${floor.cost} Vigor here (check in game)`" data-test-toa-vigor>{{ floor.cost }} Vigor</span>
        </div>
      </header>

      <!-- enemies -->
      <div class="grid grid-cols-2 gap-x-3 gap-y-2 sm:flex sm:flex-wrap sm:items-center">
        <!-- phones: two columns; a last enemy alone on its row takes the whole row (a boss's long name, unbroken) -->
        <div
          v-for="(e, ei) in floor.enemies"
          :key="e.name"
          class="flex items-center gap-2 min-w-0"
          :class="{ 'col-span-2': ei === floor.enemies.length - 1 && floor.enemies.length % 2 === 1 }"
          :data-test-toa-enemy="e.name"
        >
          <span class="toa-enemy" :class="{ 'toa-enemy--boss': e.class === 'Overlord' || e.class === 'Calamity' }">
            <img v-if="info(e.name)?.imageUrl && !broken[e.name]" :src="info(e.name)!.imageUrl" :alt="e.name" loading="lazy" decoding="async" @error="broken[e.name] = true" />
            <span v-else class="text-xs font-bold opacity-70">{{ e.name.charAt(0) }}</span>
          </span>
          <span class="min-w-0 leading-tight">
            <span class="block text-[0.8rem] sm:text-sm font-medium line-clamp-2 break-words">{{ e.name }}<span v-if="e.count > 1" class="opacity-60"> ×{{ e.count }}</span></span>
            <span v-if="e.hp" class="block text-xs opacity-60 tabular-nums">{{ compact(e.hp) }} HP</span>
          </span>
        </div>
      </div>

      <!-- HP and what the enemy resists -->
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span class="text-2xl font-bold tabular-nums leading-none" data-test-toa-hp>{{ compact(floor.hp ?? 0) }}</span>
        <span class="text-xs opacity-70">HP{{ floor.hpType === "adjusted" ? " (adjusted)" : "" }}</span>
        <span
          v-if="multi"
          class="badge badge-outline badge-sm"
          :title="`Estimate: the waves are summed as one HP pool, each group of identical enemies counted once (as the sheet's adjusted HP assumes AoE). Every enemy counted: ${(floor.hpRaw ?? 0).toLocaleString()} HP.`"
          data-test-toa-estimate
          >estimate · waves summed</span
        >
      </div>
      <div class="flex flex-col gap-1" data-test-toa-res>
        <div v-for="(seg, si) in resLines" :key="si" class="flex flex-wrap items-center gap-1">
          <span v-if="resLines.length > 1" class="text-[0.7rem] opacity-60 w-full sm:w-auto sm:mr-1">{{ si === 0 ? "" : "then " }}{{ seg.label }}</span>
          <span
            v-for="r in seg.res"
            :key="r.el"
            class="toa-res"
            :class="{ 'toa-res--low': r.v <= 0, 'toa-res--high': r.v >= 40 }"
            :title="`${r.el} RES ${r.v}% (${seg.label}: its own plus the floor's)`"
          >
            <span v-if="elementIcon(r.el)" class="toa-res__icon"><img :src="elementIcon(r.el)!" alt="" /></span>
            <span class="sr-only">{{ r.el }}</span>
            <span class="tabular-nums">{{ r.v }}%</span>
          </span>
        </div>
      </div>

      <!-- effects: hover for the note, or tap a chip (phones have no hover) to open it under the chips -->
      <div class="flex flex-col gap-1.5" data-test-toa-effects>
        <div class="flex flex-wrap gap-1">
          <button
            v-for="c in chips"
            :key="c.key"
            type="button"
            class="toa-chip"
            :class="[c.fidelity === 'none' ? 'toa-chip--off' : c.fidelity === 'approx' ? 'toa-chip--approx' : 'toa-chip--on', { 'toa-chip--open': openChip === c.key }]"
            :title="`${FIDELITY[c.fidelity]} — ${c.note}\n\nIn game: ${c.text}`"
            :aria-expanded="openChip === c.key"
            :data-test-toa-effect="c.fidelity"
            @click="openChip = openChip === c.key ? null : c.key"
          >
            {{ c.label }}<span v-if="c.fidelity === 'approx'" class="opacity-70">≈</span>
          </button>
        </div>
        <div v-if="chipOpen" class="rounded-box bg-base-200/70 px-2.5 py-1.5 text-xs leading-snug" data-test-toa-effect-note>
          <div><b>{{ FIDELITY[chipOpen.fidelity] }}</b> — {{ chipOpen.note }}</div>
          <div class="opacity-70 mt-0.5">In game: “{{ chipOpen.text }}”</div>
        </div>
      </div>

      <!-- crest goals -->
      <div class="grid grid-cols-3 gap-1 text-center" data-test-toa-goals>
        <div v-for="(g, i) in sortedGoals" :key="i" class="rounded-box bg-base-200/70 px-1 py-1">
          <div class="text-warning leading-none text-sm" aria-hidden="true">{{ "★".repeat(i + 1) }}</div>
          <div class="text-xs tabular-nums mt-0.5"><template v-if="g"><b>≥{{ g }} s</b><span class="opacity-60"> left</span></template><b v-else>Clear</b></div>
          <div class="text-[0.65rem] opacity-60 tabular-nums">by {{ clockText(300 - g) }}</div>
        </div>
      </div>

      <!-- teams -->
      <div class="border-t border-base-300 pt-2">
        <div v-if="!hasAccount" class="text-sm opacity-70 py-2">Import your account to see which of your teams clear it.</div>
        <div v-else-if="running && !rows.length" class="flex flex-col gap-2 py-1" aria-busy="true">
          <div v-for="n in 3" :key="n" class="flex items-center gap-2">
            <div class="skeleton size-8 rounded-full shrink-0"></div>
            <div class="skeleton h-3 flex-1"></div>
            <div class="skeleton h-3 w-10"></div>
          </div>
        </div>
        <div v-else-if="!rows.length" class="text-sm opacity-70 py-2">No team timed yet.</div>
        <ol v-else class="flex flex-col gap-2.5" data-test-toa-teams>
          <li v-for="(r, i) in shown" :key="r.team.id" class="toa-team" :data-test-toa-team="r.team.id">
            <div class="flex items-center gap-2 min-w-0">
              <span class="w-4 text-xs opacity-50 tabular-nums text-right shrink-0 max-sm:hidden">{{ i + 1 }}</span>
              <ToaPortraits :keys="r.team.appKeys" :main="r.team.mainDps" size="2rem" />
              <div class="min-w-0 flex-1 leading-tight">
                <div class="text-[0.8rem] sm:text-sm font-medium line-clamp-2 break-words" :title="gearText(r.team)">{{ shortNames(r.team) }}</div>
                <div class="text-[0.7rem] opacity-60 truncate">
                  <span v-if="r.team.saved" class="text-primary font-semibold">your team · </span>{{ compact(r.team.dps) }} DPS<span v-if="r.result.dps" class="max-sm:hidden"> · {{ compact(r.result.dps) }} on this floor</span>
                </div>
              </div>
              <div class="text-right shrink-0 leading-tight">
                <div class="font-bold tabular-nums" :class="r.result.error ? 'opacity-50' : ''" data-test-toa-kill>
                  <template v-if="r.result.error"><span :title="r.result.error">—</span></template>
                  <template v-else>{{ r.result.seconds === null ? ">5:00" : clockText(r.result.seconds) }}</template>
                </div>
                <div class="toa-crests" :class="`toa-crests--c${r.result.crests}`" :title="`${r.result.crests} of 3 crests`" :data-test-toa-crests="r.result.crests">
                  <span v-for="n in 3" :key="n" :class="n <= r.result.crests ? '' : 'opacity-25'">★</span>
                </div>
              </div>
            </div>
            <div class="sm:pl-6 mt-1">
              <ToaTimeBar :goals="floor.goals" :seconds="r.result.seconds" :crests="r.result.crests" :fight-seconds="r.result.fightSeconds" :you="youOf(r.team.id)" />
              <div v-if="r.result.extrapolated || youOf(r.team.id) !== null || r.result.error" class="flex flex-wrap gap-x-2 text-[0.7rem] mt-0.5">
                <span v-if="r.result.error" class="text-error">engine: {{ r.result.error }}</span>
                <span v-if="r.result.extrapolated" class="opacity-60" title="Past the end of Riley's run (opener + 3 loops, ~100 s): extrapolated at the last loop's DPS" data-test-toa-extrapolated>extrapolated</span>
                <span v-if="youOf(r.team.id) !== null" class="opacity-80">you: <b class="tabular-nums">{{ clockText(youOf(r.team.id)) }}</b> <span class="opacity-60">({{ paceText(r.team.id) }})</span></span>
              </div>
            </div>
          </li>
        </ol>
        <button v-if="rows.length > top" type="button" class="btn btn-ghost btn-xs mt-2 w-full" :data-test-toa-more="floor.id" @click="open = !open">
          {{ open ? "Show the top 3" : `All ${rows.length} teams` }}
        </button>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
// Wuthering Tools+ (/endgame): one timed floor — enemies, HP, what it resists, its effects (solid = modelled, outlined =
// not, ≈ approximated; the game's wording in the tooltip), crest goals, and the account's best teams on it.
import { computed, reactive, ref } from "vue";
import { characterElementsSetImageMap, getCharacterRosterDisplayName } from "../../characters/characters";
import { clockText } from "./crests";
import { ELEMENTS } from "./effects";
import { enemyInfo, floorChips, hpSegments, multiEnemy, type ToaFloor } from "./toaData";
import type { CandidateTeam, FloorResult } from "./toaRun";
import ToaPortraits from "./ToaPortraits.vue";
import ToaTimeBar from "./ToaTimeBar.vue";

const props = withDefaults(
  defineProps<{
    floor: ToaFloor;
    towerName: string;
    rows: Array<{ result: FloorResult; team: CandidateTeam }>;
    hasAccount: boolean;
    running?: boolean;
    stale?: boolean;
    /** the player's own pace per team (a logged clear), null where none */
    paceOf?: (teamId: string) => number | null;
    top?: number;
  }>(),
  { running: false, stale: false, paceOf: () => null, top: 3 },
);

const open = ref(false);
const broken = reactive<Record<string, boolean>>({});
const info = enemyInfo;
const shown = computed(() => (open.value ? props.rows : props.rows.slice(0, props.top)));
const chips = computed(() => floorChips(props.floor));
const FIDELITY = { exact: "Modelled", approx: "Modelled (approximation)", none: "Not modelled" } as const;
const openChip = ref<string | null>(null);
const chipOpen = computed(() => chips.value.find((c) => c.key === openChip.value) ?? null);
const segments = computed(() => hpSegments(props.floor));
const multi = computed(() => multiEnemy(props.floor));
const sortedGoals = computed(() => [...props.floor.goals].sort((a, b) => a - b));
/** each HP segment's RES (one line unless two bosses resist differently), the weakest elements first */
const resLines = computed(() =>
  segments.value.map((seg) => ({
    label: seg.names[seg.names.length - 1]!,
    res: ELEMENTS.filter((el) => el !== "Physical")
      .map((el) => ({ el, v: seg.res[el] }))
      .sort((a, b) => a.v - b.v || ELEMENTS.indexOf(a.el) - ELEMENTS.indexOf(b.el)),
  })),
);

const elementIcon = (el: string): string | null => characterElementsSetImageMap[el] ?? null;
const compact = (n: number): string =>
  n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n));
const shortNames = (t: CandidateTeam): string => t.appKeys.map((k) => getCharacterRosterDisplayName(k)).join(" · ");
const gearText = (t: CandidateTeam): string =>
  t.members.map((m) => `${getCharacterRosterDisplayName(m.appKey)} S${m.sequence} · ${m.weapon} R${m.refinement}`).join("\n");
const youOf = (teamId: string): number | null => {
  const pace = props.paceOf(teamId);
  const r = props.rows.find((x) => x.team.id === teamId)?.result;
  return pace && r?.seconds ? r.seconds * pace : null;
};
const paceText = (teamId: string): string => {
  const p = props.paceOf(teamId);
  return p ? `×${p.toFixed(2)} the sim` : "";
};
</script>

<style scoped>
.toa-enemy {
  display: inline-flex;
  width: 2.25rem;
  height: 2.25rem;
  flex: none;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 0.6rem;
  background: oklch(var(--b2));
  border: 1px solid oklch(var(--b3));
}
.toa-enemy--boss {
  border-color: oklch(var(--er) / 0.55);
}
.toa-enemy img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.toa-res {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.05rem 0.4rem;
  border-radius: 9999px;
  font-size: 0.72rem;
  background: oklch(var(--b2));
  color: oklch(var(--bc) / 0.8);
}
.toa-res__icon {
  display: inline-flex;
  width: 1rem;
  height: 1rem;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  /* the element glyphs are white: a dark disc keeps them legible on light themes */
  background: oklch(0.32 0.02 260);
}
.toa-res__icon img {
  width: 0.8rem;
  height: 0.8rem;
}
.toa-res--low {
  background: oklch(var(--su) / 0.16);
  color: oklch(var(--bc));
  font-weight: 600;
}
.toa-res--high {
  background: oklch(var(--er) / 0.12);
}
.toa-crests {
  display: inline-flex;
  gap: 1px;
  margin-top: 1px;
  font-size: 1rem;
  line-height: 1;
  color: oklch(var(--wa));
}
.toa-crests--c0 {
  color: oklch(var(--er));
}
.toa-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  max-width: 100%;
  padding: 0.12rem 0.5rem;
  border-radius: 0.5rem;
  font-size: 0.72rem;
  line-height: 1.2;
  text-align: left;
  cursor: pointer;
}
.toa-chip:focus-visible {
  outline: 2px solid oklch(var(--p));
  outline-offset: 1px;
}
.toa-chip--open {
  box-shadow: 0 0 0 1.5px oklch(var(--p) / 0.7);
}
.toa-chip--on {
  background: oklch(var(--p) / 0.16);
  color: oklch(var(--bc));
  border: 1px solid oklch(var(--bc) / 0.14);
}
.toa-chip--approx {
  background: oklch(var(--p) / 0.09);
  color: oklch(var(--bc));
  border: 1px solid oklch(var(--bc) / 0.14);
}
.toa-chip--off {
  background: transparent;
  color: oklch(var(--bc) / 0.65);
  border: 1px dashed oklch(var(--bc) / 0.35);
}
</style>
