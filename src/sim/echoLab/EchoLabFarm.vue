<template>
  <section class="space-y-3" data-test-echo-lab-farm>
    <div class="flex flex-wrap items-center gap-2">
      <h2 class="text-base font-semibold">Farm next</h2>
      <EchoLabPopover id="farm" label="How Farm next is worked out" align="left">
        <p>For every slot of each built character (a weapon and five echoes), every echo the slot could take is tried: the slot's cost, another copy of the main echo in the main slot, a Sonata that keeps every set bonus the build has, and each main stat that cost can roll. The damage engine scores each one on the character's best rotation.</p>
        <p>The best one is then rolled out as a new echo levelled to +25: each of the 13 substats at every value it can roll is scored exactly on that echo, and five lines are put together over 20,000 seeded tries.</p>
        <p><b>Own gain</b> and <b>team gain</b> count a try only when the new echo beats the one there now. The team figure re-scores the character's strongest team you can field, as My account does.</p>
        <ul class="list-disc space-y-1 pl-4 opacity-80">
          <li v-for="a in assumptions" :key="a">{{ a }}</li>
        </ul>
      </EchoLabPopover>
    </div>
    <p class="max-w-3xl text-sm opacity-70" data-test-echo-lab-farm-intro>
      Which echo to farm next, slot by slot: a new one levelled to +25 with random substats against the echo you wear there now, on each character's best rotation and, where it can be scored, their strongest team.
    </p>
    <p class="flex max-w-3xl items-start gap-2 rounded-lg border border-base-300 bg-base-200 px-3 py-2 text-xs" data-test-echo-lab-farm-odds>
      <svg viewBox="0 0 24 24" class="mt-px size-4 shrink-0 opacity-70" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path stroke-linecap="round" d="M12 11v5M12 8h.01" />
      </svg>
      <span>Main-stat drop odds are not modelled (no released source gives them). Every figure is for an echo that drops with the main stat shown.</span>
    </p>

    <!-- progress / idle / error -->
    <div v-if="status.running" class="rounded-box border border-primary/40 bg-base-100 px-4 py-3" data-test-echo-lab-farm-progress>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span class="loading loading-spinner loading-sm text-primary"></span>
        <span class="text-sm font-medium">{{ phaseLabel(status.progress?.phase) }}</span>
        <span v-if="status.progress?.label" class="truncate text-xs opacity-60">{{ status.progress.label }}</span>
        <span v-if="status.progress" class="ml-auto font-mono text-xs tabular-nums opacity-60">{{ status.progress.done }} / {{ status.progress.total }}</span>
      </div>
      <div v-if="status.progress" class="mt-2 h-1.5 overflow-hidden rounded-full bg-base-300" aria-hidden="true">
        <div class="h-full rounded-full bg-primary transition-[width] duration-200" :style="{ width: `${Math.round((status.progress.done / (status.progress.total || 1)) * 100)}%` }"></div>
      </div>
    </div>
    <div v-if="!result && !status.running && !status.error" class="flex flex-wrap items-center gap-2 text-sm" data-test-echo-lab-farm-idle>
      <span class="opacity-70">Not worked out for this account yet.</span>
      <button type="button" class="btn btn-sm" data-test-echo-lab-farm-run @click="emit('run', false)">Work it out</button>
    </div>
    <div v-if="status.error" class="alert alert-error text-sm" data-test-echo-lab-farm-error>
      <span>Farm next stopped: {{ status.error }}</span>
      <button type="button" class="btn btn-sm" @click="emit('run', true)">Try again</button>
    </div>

    <template v-if="result">
      <!-- filter and order -->
      <div class="flex flex-wrap items-end gap-x-4 gap-y-2" data-test-echo-lab-farm-controls>
        <label class="form-control min-w-0 max-sm:w-full sm:w-60">
          <span class="label-text pb-1 text-xs font-semibold">Character</span>
          <select v-model="characterFilter" class="select select-sm select-bordered w-full min-w-0" data-test-echo-lab-farm-character>
            <option value="all">Every character ({{ result.rows.length }} slots)</option>
            <option v-for="c in characters" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>
        <div class="min-w-0 max-sm:w-full">
          <div id="farm-sort-label" class="pb-1 text-xs font-semibold">Rank by</div>
          <div class="el-seg grid grid-cols-2 max-sm:w-full sm:inline-flex" role="group" aria-labelledby="farm-sort-label">
            <button
              v-for="o in sortOptions"
              :key="o.value"
              type="button"
              class="el-seg__btn"
              :class="{ 'el-seg__btn--on': sortBy === o.value }"
              :aria-pressed="sortBy === o.value"
              :data-test-echo-lab-farm-sort="o.value"
              @click="sortBy = o.value">
              {{ o.label }}
            </button>
          </div>
        </div>
      </div>
      <p class="text-sm" data-test-echo-lab-farm-try>
        One try, a new 5★ echo levelled from +0 to +25, costs <b>{{ tryCost.tuners }} Tuners</b>, {{ compact(tryCost.exp) }} Echo EXP and {{ compact(tryCost.shellCredits) }} Shell Credits (the game's levelling table).
      </p>
      <p class="text-xs opacity-60" data-test-echo-lab-farm-meta>
        {{ result.rows.length }} slots of {{ characters.length }} characters · {{ (result.scorings + result.teamScorings).toLocaleString("en-US") }} engine runs ·
        {{ sortBy === "team" ? "team gain first, then the slots without a team figure by their own gain" : "own gain on each character's best rotation" }}
      </p>

      <ol class="grid grid-cols-1 items-start gap-2 lg:grid-cols-2" data-test-echo-lab-farm-rows>
        <template v-for="(row, i) in shown" :key="row.key">
          <li v-if="sortBy === 'team' && i === firstWithoutTeam && i > 0" class="col-span-full pt-2" data-test-echo-lab-farm-divider>
            <h3 class="text-sm font-semibold">Without a team figure yet</h3>
            <p class="text-xs opacity-70">Ranked by their own gain. A slot whose character can field a team gets its figure when you tap "Work it out"; the others say why there is none.</p>
          </li>
          <li class="farm-card rounded-box border bg-base-100 px-4 py-3 max-sm:px-3" :class="i === 0 ? 'border-primary/50' : 'border-base-300'" :data-test-echo-lab-farm-row="row.key">
            <!-- who, which slot -->
            <div class="flex min-w-0 items-center gap-3">
              <span class="grid size-7 shrink-0 place-items-center rounded-full bg-base-200 font-mono text-sm font-bold tabular-nums"><span class="sr-only">Rank </span>{{ i + 1 }}</span>
              <img :src="portrait(row.characterId)" :alt="characterName(row.characterId)" class="el-portrait size-9" loading="lazy" />
              <div class="min-w-0 flex-1 leading-tight">
                <div class="truncate font-semibold">{{ characterName(row.characterId) }}</div>
                <div class="text-xs opacity-60">{{ slotLabel(row.slot) }} · Cost {{ row.target.cost }}</div>
              </div>
              <span v-if="i === 0" class="el-chip el-chip--keep shrink-0" data-test-echo-lab-farm-first>Farm first</span>
            </div>

            <!-- what to farm, and what is there now -->
            <div class="mt-2 rounded-lg bg-base-200 px-3 py-2" data-test-echo-lab-farm-target>
              <div class="text-[0.65rem] font-semibold uppercase tracking-wide opacity-60">Farm</div>
              <div class="flex min-w-0 items-center gap-1.5 font-semibold">
                <img v-if="!row.target.anySet && setIcon(row.target.set)" :src="setIcon(row.target.set)!" alt="" class="size-4 shrink-0" loading="lazy" />
                <span data-test-echo-lab-farm-main>{{ targetMainText(row.target) }}</span>
              </div>
              <div class="text-sm" data-test-echo-lab-farm-set>{{ targetSetText(row.target) }}</div>
              <div v-if="!row.target.anySet && row.target.species.length" class="text-xs opacity-70">
                {{ row.slot === 0 ? "Another copy of" : "Echoes:" }} {{ speciesText(row.target.species.map(echoName)) }}
              </div>
              <div class="mt-1 text-xs opacity-70" data-test-echo-lab-farm-now>
                In the slot now: {{ echoName(row.current.echo) }} · {{ mainLabel(row.current.main) }}<template v-if="!row.sameAsCurrent"> · {{ setLabel(row.current.set) }}</template>
                <template v-if="row.current.lines < 5"> ({{ row.current.lines }} of 5 lines)</template>
              </div>
            </div>

            <!-- the numbers -->
            <dl class="farm-stats mt-2">
              <div data-test-echo-lab-farm-team>
                <dt>Team gain per try</dt>
                <dd>
                  <template v-if="row.team">
                    <span class="font-mono font-bold tabular-nums" :class="row.team.expectedGain > 0 ? 'el-up' : ''" data-test-echo-lab-farm-team-gain>{{ signedPct(row.team.expectedGain, 2) }}</span>
                    <span class="block text-xs opacity-60">+{{ compact(row.team.expectedDamage) }} team damage per rotation</span>
                  </template>
                  <template v-else-if="teamState(row) === 'running'">
                    <span class="inline-flex items-center gap-1.5 text-xs"><span class="loading loading-spinner loading-xs"></span>Working it out</span>
                    <span class="block text-xs opacity-60">on their strongest team</span>
                  </template>
                  <template v-else-if="row.teamPending && teamError(row)">
                    <button type="button" class="btn btn-xs" :data-test-echo-lab-farm-team-run="row.key" @click="emit('team', row.characterId, row.slot)">Try again</button>
                    <span class="block text-xs opacity-60" data-test-echo-lab-farm-team-note>{{ teamError(row) }}</span>
                  </template>
                  <template v-else-if="row.teamPending">
                    <button type="button" class="btn btn-xs" :data-test-echo-lab-farm-team-run="row.key" @click="emit('team', row.characterId, row.slot)">Work it out</button>
                    <span class="block text-xs opacity-60">on their strongest team (a few seconds)</span>
                  </template>
                  <template v-else>
                    <span class="font-semibold opacity-70">No figure</span>
                    <span class="block text-xs opacity-60" data-test-echo-lab-farm-team-note>{{ row.teamNote ?? "not in a team you can field" }}</span>
                  </template>
                </dd>
              </div>
              <div>
                <dt>Own gain per try</dt>
                <dd>
                  <span class="font-mono font-bold tabular-nums" :class="row.expectedGain > 0 ? 'el-up' : ''" data-test-echo-lab-farm-gain>{{ signedPct(row.expectedGain, 2) }}</span>
                  <span class="block text-xs opacity-60">+{{ compact(row.expectedDamage) }} damage per rotation</span>
                </dd>
              </div>
              <div>
                <dt>Chance a new one beats yours (own gain)</dt>
                <dd>
                  <span class="font-mono font-bold tabular-nums" data-test-echo-lab-farm-chance>{{ chanceText(row) }}</span>
                  <span class="block text-xs opacity-60">{{ triesText(row.triesPerWin) }}</span>
                </dd>
              </div>
              <div>
                <dt>Cost of one that beats yours</dt>
                <dd>
                  <template v-if="row.triesPerWin !== null">
                    <span class="font-mono font-bold tabular-nums" data-test-echo-lab-farm-cost>{{ winCost(row).tuners }} Tuners</span>
                    <span class="block text-xs opacity-60">and {{ compact(winCost(row).exp) }} EXP, on average, every try levelled to +25</span>
                  </template>
                  <template v-else>
                    <span class="font-semibold opacity-70" data-test-echo-lab-farm-cost>—</span>
                    <span class="block text-xs opacity-60">no try beats it</span>
                  </template>
                </dd>
              </div>
            </dl>

            <button
              type="button"
              class="btn btn-ghost btn-xs mt-1 -ml-2"
              :aria-expanded="open.has(row.key)"
              :aria-controls="`farm-detail-${i}`"
              :data-test-echo-lab-farm-details="row.key"
              @click="toggle(row.key)">
              {{ open.has(row.key) ? "Hide details" : "Details and other main stats" }}
            </button>
            <div v-if="open.has(row.key)" :id="`farm-detail-${i}`" class="mt-1 space-y-2 border-t border-base-300 pt-2 text-xs" :data-test-echo-lab-farm-detail="row.key">
              <p>
                Scored on <b>{{ row.rotationName }}</b>: {{ compact(row.base) }} average damage per rotation now.
                <template v-if="row.team"> Team: {{ row.team.teamName }}, {{ compact(row.team.base) }} team damage per rotation; {{ pct(row.team.pGain, 0) }} of tries lift it.</template>
              </p>
              <p data-test-echo-lab-farm-spread>
                If you always kept the new echo, its damage change would run from <b>{{ signedPct(row.p10, 1) }}</b> (1 try in 10 does worse) to <b>{{ signedPct(row.p90, 1) }}</b> (1 in 10 does better), {{ signedPct(row.p50, 1) }} in the middle.
                The main stat and set alone, before any substat: {{ signedPct(row.mainOnlyGain, 1) }}.
              </p>
              <div v-if="row.alternatives.length">
                <div class="font-semibold">Other main stats for this slot, if one drops instead</div>
                <ul class="mt-1 grid grid-cols-1 gap-1" data-test-echo-lab-farm-alts>
                  <li v-for="a in row.alternatives" :key="`${a.main}|${a.set}|${a.anySet}`" class="farm-alt" :data-test-echo-lab-farm-alt="a.main">
                    <span class="min-w-0">
                      <span class="font-medium">{{ mainLabel(a.main) }}</span>
                      <span v-if="altSet(row, a)" class="opacity-70"> · {{ altSet(row, a) }}</span>
                    </span>
                    <span v-if="a.blocked" class="opacity-70">not offered: {{ blockedText(a) }}</span>
                    <span v-else class="text-right tabular-nums">
                      <template v-if="a.expectedGain !== null">{{ signedPct(a.expectedGain, 2) }} per try · </template>{{ signedPct(a.mainOnlyGain ?? 0, 1) }} before substats
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </li>
        </template>
      </ol>
      <div v-if="sorted.length > shown.length" class="flex justify-center">
        <button type="button" class="btn btn-sm" data-test-echo-lab-farm-more @click="limit += PAGE">Show {{ Math.min(PAGE, sorted.length - shown.length) }} more of {{ sorted.length - shown.length }}</button>
      </div>
      <p v-if="result.skipped.length" class="text-xs opacity-60" data-test-echo-lab-farm-skipped>
        Left out: <span v-for="(s, i) in result.skipped" :key="`${s.characterId}|${s.slot}`">{{ characterName(s.characterId) }} {{ slotLabel(s.slot).toLowerCase() }} ({{ s.reason }}){{ i < result.skipped.length - 1 ? ", " : "" }}</span>
      </p>
    </template>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+ Echo Lab — the "Farm next" tab: one ranked list across the account of the echo to farm for every
// slot of every five-echo build (farmNext.ts in the worker), by expected team gain where it is exact and own gain after,
// with a character filter; a pending team figure is worked out on request. The page only sorts and words the numbers.
import { computed, ref, watch } from "vue";
import type { JobStatus } from "./useEchoLab";
import EchoLabPopover from "./EchoLabPopover.vue";
import { characterName, compact, echoName, mainLabel, pct, phaseLabel, portrait, setIcon, setLabel, signedPct, slotLabel } from "./echoLabView";
import type { FarmAlternative, FarmNextResult, FarmRow, FarmTeamResult } from "./farmNext";
import { FARM_ASSUMPTIONS, blockedText, farmCharacters, filterFarmRows, sortFarmRows, speciesText, targetMainText, targetSetText, triesText, withTeamResult, type FarmSort } from "./farmView";

const props = defineProps<{
  result: FarmNextResult | null;
  status: JobStatus;
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  teamOf: (characterId: string, slot: number) => FarmTeamResult | { error: string } | "running" | null;
}>();
// eslint-disable-next-line no-unused-vars -- the parameters of an emit signature
const emit = defineEmits<{ (e: "run", force: boolean): void; (e: "team", characterId: string, slot: number): void }>();
const assumptions = FARM_ASSUMPTIONS;
const PAGE = 12;

const characterFilter = ref("all");
const sortBy = ref<FarmSort>("team");
const sortOptions: Array<{ value: FarmSort; label: string }> = [
  { value: "team", label: "Team gain" },
  { value: "own", label: "Own gain" },
];
const limit = ref(PAGE);
const open = ref(new Set<string>());
watch([characterFilter, sortBy], () => (limit.value = PAGE));

const rows = computed((): FarmRow[] =>
  (props.result?.rows ?? []).map((r) => {
    const asked = props.teamOf(r.characterId, r.slot);
    return asked && typeof asked === "object" && "key" in asked ? withTeamResult(r, asked) : r;
  }),
);
const characters = computed(() => farmCharacters(rows.value, characterName));
const sorted = computed(() => sortFarmRows(filterFarmRows(rows.value, characterFilter.value), sortBy.value));
const shown = computed(() => sorted.value.slice(0, limit.value));
const firstWithoutTeam = computed(() => shown.value.findIndex((r) => !r.team));

function teamState(row: FarmRow): "running" | null {
  return props.teamOf(row.characterId, row.slot) === "running" ? "running" : null;
}
function teamError(row: FarmRow): string | null {
  const asked = props.teamOf(row.characterId, row.slot);
  return asked && typeof asked === "object" && "error" in asked ? `could not be worked out (${asked.error})` : null;
}

function toggle(key: string): void {
  const next = new Set(open.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  open.value = next;
}

/** a chance as players read it: "100%" only when the main stat alone already beats yours (substats never cost damage);
 *  a simulated near-certainty reads "over 99%", a near-impossibility "under 1%" */
function chanceText(row: Pick<FarmRow, "pBeat" | "mainOnlyGain">): string {
  const p = row.pBeat;
  if (row.mainOnlyGain > 1e-12) return "100%";
  if (p <= 0) return "0%";
  if (p < 0.01) return "under 1%";
  if (p > 0.99) return "over 99%";
  return pct(p, 0);
}

/** the same for every row: one fresh 5★ echo, +0 to +25 */
const tryCost = computed(() => props.result?.rows[0]?.resources ?? { tuners: 50, exp: 0, shellCredits: 0 });

/** what an echo that beats yours costs on average: one try's Tuners and EXP times the tries it takes */
function winCost(row: FarmRow): { tuners: number; exp: number } {
  const tries = row.triesPerWin ?? 0;
  return { tuners: Math.round(row.resources.tuners * tries), exp: row.resources.exp * tries };
}

/** the Sonata of an alternative, when it is not the target's */
function altSet(row: FarmRow, a: FarmAlternative): string | null {
  if (a.anySet === row.target.anySet && a.set === row.target.set) return null;
  return a.anySet ? "any Sonata" : setLabel(a.set);
}
</script>

<style scoped>
.farm-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.6rem 0.75rem;
}
.farm-stats dt {
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.025em;
  line-height: 1.2;
  opacity: 0.6;
}
.farm-stats dd {
  margin-top: 0.125rem;
}
.farm-alt {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.1rem 0.75rem;
  border-radius: 0.375rem;
  background: oklch(var(--b2));
  padding: 0.3rem 0.5rem;
}
/* a phone: one stat per line, the caption on the left and the number on the right, its small print under them */
@media (max-width: 639px) {
  .farm-stats {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.45rem;
  }
  .farm-stats > div {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: 0.75rem;
    align-items: baseline;
  }
  .farm-stats dd {
    display: contents;
  }
  .farm-stats dd > :first-child {
    grid-column: 2;
    grid-row: 1;
    text-align: right;
  }
  .farm-stats dd > :nth-child(2) {
    grid-column: 1 / -1;
    text-align: right;
  }
}
</style>
