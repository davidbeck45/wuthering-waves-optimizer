<template>
  <section class="space-y-3" data-test-echo-lab-sets>
    <div class="flex flex-wrap items-center gap-2">
      <h2 class="text-base font-semibold">Set lab</h2>
      <EchoLabPopover id="sets" label="How the Set lab is worked out" align="left">
        <p>The optimizer answers what you can build from what you own, which depends on what dropped. This answers what a set is worth to the character. The character's five echoes stay exactly as they are. Every Sonata layout the game allows (5-piece, 3 + 2, 2 + 2, the 1-piece and the smaller ones) is put on those same echoes, and the damage engine scores each on the character's best rotation.</p>
        <p><b>Own damage</b> is against the layout worn today, which reads ±0. <b>Team damage</b> re-scores the character's strongest team you can field, as My account does.</p>
        <ul class="list-disc space-y-1 pl-4 opacity-80">
          <li v-for="a in SET_LAB_ASSUMPTIONS" :key="a">{{ a }}</li>
        </ul>
      </EchoLabPopover>
    </div>
    <p class="max-w-3xl text-sm opacity-70" data-test-echo-lab-sets-intro>
      Which set is best for this character, all else equal: the echoes they wear today, same main stats and substats, only the set changed.
    </p>

    <label class="form-control min-w-0 max-sm:w-full sm:w-72">
      <span class="label-text pb-1 text-xs font-semibold">Character</span>
      <select v-model="selected" class="select select-sm select-bordered w-full min-w-0" data-test-echo-lab-sets-character>
        <option v-for="c in characters" :key="c.id" :value="c.id">{{ characterName(c.id) }}</option>
      </select>
    </label>

    <!-- progress / cancelled / error -->
    <div v-if="status.running" class="rounded-box border border-primary/40 bg-base-100 px-4 py-3" data-test-echo-lab-sets-progress>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span class="loading loading-spinner loading-sm text-primary"></span>
        <span class="text-sm font-medium" role="status">{{ phaseLabel(status.progress?.phase) }}</span>
        <span v-if="status.progress" class="ml-auto font-mono text-xs tabular-nums opacity-60">{{ status.progress.done }} / {{ status.progress.total }}</span>
        <button type="button" class="btn btn-ghost btn-xs" data-test-echo-lab-sets-cancel @click="lab.cancelSetLab()">Cancel</button>
      </div>
      <div v-if="status.progress" class="mt-2 h-1.5 overflow-hidden rounded-full bg-base-300" aria-hidden="true">
        <div class="h-full rounded-full bg-primary transition-[width] duration-200" :style="{ width: `${Math.round((status.progress.done / (status.progress.total || 1)) * 100)}%` }"></div>
      </div>
    </div>
    <div v-if="!result && !status.running && status.cancelled" class="rounded-box border border-dashed border-base-300 px-4 py-6 text-center text-sm opacity-70" data-test-echo-lab-sets-cancelled>
      Cancelled. <button type="button" class="link link-primary" @click="run(true)">Work it out</button>
    </div>
    <div v-if="status.error" class="alert alert-error text-sm" data-test-echo-lab-sets-error>
      <span>The Set lab stopped: {{ status.error }}</span>
      <button type="button" class="btn btn-sm" @click="run(true)">Try again</button>
    </div>

    <template v-if="result">
      <!-- the answer, in a sentence -->
      <div class="rounded-box border border-base-300 bg-base-100 px-4 py-3 max-sm:px-3" data-test-echo-lab-sets-answer>
        <div class="flex min-w-0 items-center gap-3">
          <img :src="portrait(result.characterId)" alt="" class="el-portrait size-11 shrink-0" />
          <div class="min-w-0 flex-1">
            <div class="text-[0.65rem] font-semibold uppercase tracking-wide opacity-60">{{ topCaption }}</div>
            <div class="font-semibold leading-snug" data-test-echo-lab-sets-best>{{ top ? rowName(top) : "" }}</div>
          </div>
        </div>
        <p class="mt-2 text-sm" data-test-echo-lab-sets-rank>
          <template v-if="top?.current && !mineRank?.pending">Your layout is already first here.</template>
          <template v-else-if="top?.current">Your layout is first so far, {{ mineRank?.pending }} still to work out.</template>
          <template v-else-if="top && mineRank">{{ topFigure }}. Your layout, {{ layoutName(mine?.parts ?? []) }}, {{ rankSentence(mineRank) }}.</template>
          <template v-else-if="top">{{ topFigure }}.</template>
        </p>
        <p v-if="floorTop && floorTop.key !== top?.key" class="mt-1 text-sm" data-test-echo-lab-sets-floor-best>
          If no condition holds, the best for their own damage is {{ rowName(floorTop) }}, at {{ signedPct(floorOf(floorTop), 2) }}.
        </p>
        <p class="mt-1 text-xs opacity-60">Scored on <b>{{ rotationTitle(result.rotationName) }}</b>: {{ compact(result.base) }} average damage per rotation today<template v-if="result.teamName">. Team: {{ teamTitle(result.teamName) }}, {{ compact(result.teamBase ?? 0) }} team damage per rotation</template>.</p>
        <p v-if="result.pinned" class="mt-1 text-xs" data-test-echo-lab-sets-pinned>You pinned this set bonus in the calculator, so it is your layout here whatever your echoes' Sonatas say.</p>
        <p v-if="fullRow" class="mt-1 text-xs" data-test-echo-lab-sets-full>
          Your calculator has this layout at less than its best: with every condition met it reads <b>{{ signedPct(fullRow.gain, 1) }}</b>. Every other layout is credited with its conditions, so read them against that row too.
        </p>
      </div>

      <!-- filter and order -->
      <div class="flex flex-wrap items-end gap-x-4 gap-y-2" data-test-echo-lab-sets-controls>
        <div class="min-w-0 max-sm:w-full">
          <div id="sets-shape-label" class="pb-1 text-xs font-semibold">Show</div>
          <div class="el-seg grid grid-cols-2 max-sm:w-full sm:inline-flex" role="group" aria-labelledby="sets-shape-label">
            <button
              v-for="o in SET_LAB_SHAPES"
              :key="o.value"
              type="button"
              class="el-seg__btn"
              :class="{ 'el-seg__btn--on': shape === o.value }"
              :aria-pressed="shape === o.value"
              :data-test-echo-lab-sets-shape="o.value"
              @click="shape = o.value">
              {{ o.label }}
            </button>
          </div>
        </div>
        <div class="min-w-0 max-sm:w-full">
          <div id="sets-sort-label" class="pb-1 text-xs font-semibold">Rank by</div>
          <div class="el-seg grid grid-cols-1 max-sm:w-full sm:inline-flex" role="group" aria-labelledby="sets-sort-label">
            <button
              v-for="o in sortOptions"
              :key="o.value"
              type="button"
              class="el-seg__btn"
              :class="{ 'el-seg__btn--on': sortBy === o.value }"
              :aria-pressed="sortBy === o.value"
              :data-test-echo-lab-sets-sort="o.value"
              @click="sortBy = o.value">
              {{ o.label }}
            </button>
          </div>
        </div>
        <label class="flex min-h-8 cursor-pointer items-center gap-2 text-sm max-sm:w-full">
          <input v-model="keepsMain" type="checkbox" class="checkbox checkbox-sm" data-test-echo-lab-sets-keeps-main />
          <span>Only layouts my main echo can carry</span>
        </label>
      </div>
      <p class="text-xs opacity-60" data-test-echo-lab-sets-meta>
        {{ result.scored.toLocaleString("en-US") }} layouts scored, {{ result.rows.length }} different results · {{ (result.scorings + result.teamScorings).toLocaleString("en-US") }} engine runs<template v-if="result.refusedCount"> · {{ result.refusedCount }} can't be made at this build's costs</template>
      </p>

      <ol class="grid grid-cols-1 gap-2 lg:grid-cols-2" data-test-echo-lab-sets-rows>
        <template v-for="(row, i) in shown" :key="row.key">
          <li v-if="sortBy === 'team' && i === firstWithoutTeam && i > 0" class="col-span-full pt-2" data-test-echo-lab-sets-divider>
            <h3 class="text-sm font-semibold">Without a team figure yet</h3>
            <p class="text-xs opacity-70">Ranked by their own gain.</p>
            <button v-if="pendingShown.length" type="button" class="btn btn-xs mt-1" data-test-echo-lab-sets-team-all @click="emitTeams(pendingShown.map((r) => r.key))">Work out these {{ pendingShown.length }}</button>
          </li>
          <li class="rounded-box border bg-base-100 px-4 py-3 max-sm:px-3" :class="row.current ? 'border-primary/50' : 'border-base-300'" :data-test-echo-lab-sets-row="row.key">
            <!-- a phone: rank, icons and chip on one line, the name under them at the card's full width (beside them a long
                 layout ran to five lines at 360 px) -->
            <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <span class="grid size-7 shrink-0 place-items-center rounded-full bg-base-200 font-mono text-sm font-bold tabular-nums" :aria-label="`Rank ${i + 1}`">{{ i + 1 }}</span>
              <span v-if="row.parts.length" class="flex shrink-0 items-center gap-0.5" aria-hidden="true">
                <img v-for="p in row.parts" :key="p.set" :src="setIcon(p.set) ?? undefined" alt="" class="size-6" loading="lazy" />
              </span>
              <div class="min-w-0 flex-1 leading-tight max-sm:order-last max-sm:basis-full">
                <div class="font-semibold" data-test-echo-lab-sets-name>{{ rowName(row) }}</div>
                <div class="text-xs opacity-60">{{ rowSub(row) }}</div>
              </div>
              <span v-if="row.current" class="el-chip el-chip--keep shrink-0 max-sm:ml-auto" data-test-echo-lab-sets-yours>Yours</span>
              <span v-else-if="row.yoursFull" class="el-chip el-chip--done shrink-0 max-sm:ml-auto">Yours, at best</span>
            </div>

            <dl class="setlab-stats mt-2">
              <div data-test-echo-lab-sets-team>
                <dt>Team damage vs yours</dt>
                <dd>
                  <template v-if="teamOf(row) === 'running'">
                    <span class="inline-flex items-center gap-1.5 text-xs"><span class="loading loading-spinner loading-xs"></span>Working it out</span>
                    <span class="block text-xs opacity-60">on their strongest team</span>
                  </template>
                  <template v-else-if="row.team">
                    <span class="font-mono font-bold tabular-nums" :class="gainClass(row.team.gain)" data-test-echo-lab-sets-team-gain>{{ signedPct(row.team.gain, 2) }}</span>
                    <span class="block text-xs opacity-60">{{ signedDamage(row.team.avgDamage - row.team.base) }} team damage per rotation</span>
                  </template>
                  <template v-else-if="row.teamPending">
                    <button type="button" class="btn btn-xs" :data-test-echo-lab-sets-team-run="row.key" @click="emitTeams([row.key])">{{ teamError(row) ? "Try again" : "Work it out" }}</button>
                    <span class="block text-xs opacity-60" data-test-echo-lab-sets-team-note>{{ teamError(row) ?? "on their strongest team" }}</span>
                  </template>
                  <template v-else>
                    <span class="font-semibold opacity-70">No figure</span>
                    <span class="block text-xs opacity-60" data-test-echo-lab-sets-team-note>{{ row.teamNote ?? "not in a team you can field" }}</span>
                  </template>
                </dd>
              </div>
              <div>
                <dt>Own damage vs yours</dt>
                <dd>
                  <span class="font-mono font-bold tabular-nums" :class="gainClass(row.gain)" data-test-echo-lab-sets-gain>{{ signedPct(row.gain, 2) }}</span>
                  <span class="block text-xs opacity-60">{{ signedDamage(row.damage) }} damage per rotation</span>
                </dd>
              </div>
              <div>
                <dt>Energy Regen</dt>
                <dd>
                  <span class="font-mono font-bold tabular-nums" :class="short(row) ? 'el-er-short' : ''" data-test-echo-lab-sets-er>{{ pointsText(row.erChange) }}</span>
                  <span class="block text-xs" :class="short(row) ? 'el-er-short' : 'opacity-60'">
                    <template v-if="short(row)">{{ showHaveOf(row) }} %, under the {{ showNeedOf() }} % their teams need</template>
                    <template v-else-if="Math.abs(row.erChange) >= 0.05">{{ erRange(row) }}</template>
                    <template v-else-if="row.erHave !== null">stays {{ showHaveOf(row) }} %</template>
                  </span>
                </dd>
              </div>
              <div v-if="Math.abs(row.healChange) >= 0.05" data-test-echo-lab-sets-heal>
                <dt>Healing Bonus</dt>
                <dd>
                  <span class="font-mono font-bold tabular-nums">{{ pointsText(row.healChange) }}</span>
                  <span class="block text-xs opacity-60">not in the damage figures</span>
                </dd>
              </div>
            </dl>

            <!-- what the figure assumes, in words -->
            <div v-if="row.assumptions.length" class="mt-2 rounded-lg bg-base-200 px-3 py-2 text-xs" data-test-echo-lab-sets-assumed>
              <div class="font-semibold">How its conditions were counted</div>
              <ul class="mt-0.5 space-y-1">
                <li v-for="a in row.assumptions" :key="a.passive" data-test-echo-lab-sets-assumption>
                  <span class="font-medium">{{ assumptionState(a) }}.</span>
                  <span class="block opacity-70 max-sm:line-clamp-2">{{ passiveText(a) }}</span>
                </li>
              </ul>
              <div v-if="row.floorGain !== null" class="mt-0.5" data-test-echo-lab-sets-floor>If they never hold: <b>{{ signedPct(row.floorGain, 2) }}</b> own damage.</div>
            </div>
            <p v-if="!row.mainFits" class="mt-2 text-xs" data-test-echo-lab-sets-main>
              <span class="el-chip el-chip--feed">Needs another main echo</span>
              <span class="mt-1 block">Your {{ echoName(mainSpecies) }} is not in this layout, so these figures keep its buff and hit to show the set alone.<template v-if="row.bestMain"> With {{ echoName(row.bestMain.species) }} in its place: <b>{{ signedPct(row.bestMain.gain, 2) }}</b> own damage (its buff on, the rotation's echo hit as written).</template></span>
            </p>
            <p v-if="teamNoteOf(row)" class="mt-2 text-xs opacity-70" data-test-echo-lab-sets-reach>{{ teamNoteOf(row) }}</p>

            <div class="mt-2 flex flex-wrap items-center gap-2">
              <button
                v-if="row.parts.length && !row.current && !row.yoursFull"
                type="button"
                class="btn btn-xs btn-outline"
                :title="`Sets ${characterName(result.characterId)}'s optimizer Sonata filter to ${setList(row)} and opens the optimizer on them, after asking.`"
                :data-test-echo-lab-sets-optimizer="row.key"
                @click="toOptimizer(row)">
                Filter the optimizer to {{ row.parts.length > 1 ? "these sets" : "this set" }}
              </button>
              <button v-else type="button" class="btn btn-xs btn-outline" :data-test-echo-lab-sets-farm="row.key" @click="emit('farm', result.characterId)">Farm next for {{ characterName(result.characterId) }}</button>
              <button type="button" class="btn btn-ghost btn-xs" :aria-expanded="open.has(row.key)" :aria-controls="`sets-detail-${i}`" :data-test-echo-lab-sets-details="row.key" @click="toggle(row.key)">
                {{ open.has(row.key) ? "Hide details" : "Details" }}
              </button>
            </div>
            <div v-if="open.has(row.key)" :id="`sets-detail-${i}`" class="mt-1 space-y-2 border-t border-base-300 pt-2 text-xs" :data-test-echo-lab-sets-detail="row.key">
              <div v-if="row.bonuses.length">
                <div class="font-semibold">What it gives</div>
                <ul class="mt-0.5 space-y-1">
                  <li v-for="b in row.bonuses" :key="b">
                    <b>{{ bonusName(b) }}:</b> {{ result.bonuses[b]?.text }}
                    <template v-if="result.bonuses[b]?.hitNotPlayed"> This rotation doesn't play that hit, so the own figure leaves it out.</template>
                  </li>
                </ul>
              </div>
              <div v-if="!row.yoursFull && !row.current">
                <div class="font-semibold">Echo by echo</div>
                <ul class="mt-0.5 grid grid-cols-1 gap-0.5 sm:grid-cols-2" data-test-echo-lab-sets-slots>
                  <li v-for="s in result.slots" :key="s.slot">{{ slotLabel(s.slot) }} · Cost {{ s.cost }}: {{ row.labels[s.slot] ? setLabel(row.labels[s.slot]) : "any Sonata" }}</li>
                </ul>
              </div>
              <div v-if="row.parts.length" data-test-echo-lab-sets-owned>
                <div class="font-semibold">In your inventory</div>
                <ul class="mt-0.5 space-y-0.5">
                  <li v-for="p in row.parts" :key="p.set">{{ setLabel(p.set) }}: {{ ownedText(p.set) }}</li>
                </ul>
              </div>
              <div v-if="row.same.length" data-test-echo-lab-sets-same>
                <div class="font-semibold">{{ row.same.length }} more with exactly this result</div>
                <p class="mt-0.5">{{ sameText(row) }}</p>
              </div>
            </div>
          </li>
        </template>
      </ol>
      <div v-if="sorted.length > shown.length" class="flex justify-center">
        <button type="button" class="btn btn-sm" data-test-echo-lab-sets-more @click="limit += PAGE">Show {{ Math.min(PAGE, sorted.length - shown.length) }} more of {{ sorted.length - shown.length }}</button>
      </div>
      <p v-if="result.refusedCount" class="text-xs opacity-60" data-test-echo-lab-sets-refused>
        Left out, because a Sonata counts one echo per name and this build's costs need more than the set has: {{ refusedText }}.
      </p>
    </template>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+ Echo Lab — the "Set lab" tab: pick a character, and every Sonata layout the game allows is scored on the
// echoes they wear, only the set labels changed (setLab.ts in the worker), best first: own and team damage against the
// layout worn today, the Energy Regen change and how each conditional bonus was counted. One job per character, cached.
// The page only sorts and words the numbers. The one thing it writes is the optimizer's set filter, behind a confirm.
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useConfirm } from "../../composables/useConfirm";
import { useCharacterStore } from "../../stores/character";
import { autoTeamBuffs } from "../teamContext/autoTeamBuffs";
import { rotationTitle } from "../anatomy/anatomyView";
import { teamTitle } from "../display/teamName";
import { showHave, showNeed } from "../energy/energyNeed";
import type { LabCharacterSummary } from "./bestOwner";
import EchoLabPopover from "./EchoLabPopover.vue";
import { characterName, compact, echoName, phaseLabel, portrait, setIcon, setLabel, signedPct, slotLabel } from "./echoLabView";
import type { SetLabRow } from "./setLab";
import { SET_LAB_ASSUMPTIONS, SET_LAB_SHAPES, SET_LAB_SORTS, assumptionState, changesText, erRange, erShort, filterSetRows, floorOf, layoutName, layoutSets, mineRankOf, pointsText, rankSentence, sortSetRows, withSetTeam, type SetLabShape, type SetLabSort } from "./setLabView";
import { useEchoLab } from "./useEchoLab";

const props = defineProps<{ characters: LabCharacterSummary[]; preferred?: string | null }>();
const selected = defineModel<string | null>("character", { default: null });
// eslint-disable-next-line no-unused-vars -- the parameters of an emit signature
const emit = defineEmits<{ (e: "farm", characterId: string): void }>();
const lab = useEchoLab();
const router = useRouter();
const { confirm } = useConfirm();
const status = lab.setLabStatus;
const PAGE = 12;

const characters = computed(() => [...props.characters].sort((a, b) => characterName(a.id).localeCompare(characterName(b.id))));
// the character asked for (a link, the Re-roll tab), else the calculator's, else the strongest build
watch(
  () => props.characters,
  (list) => {
    if (selected.value && list.some((c) => c.id === selected.value)) return;
    const wanted = props.preferred && list.some((c) => c.id === props.preferred) ? props.preferred : null;
    selected.value = wanted ?? [...list].sort((a, b) => b.base - a.base)[0]?.id ?? null;
  },
  { immediate: true },
);

const run = (force = false): void => {
  if (selected.value) void lab.runSetLab(selected.value, { force });
};
watch([selected, autoTeamBuffs], () => run(), { immediate: true });

const result = computed(() => (selected.value ? lab.setLabOf(selected.value) : null));

const shape = ref<SetLabShape>("all");
/** the ranking the player tapped; until then a team figure leads wherever a character has one, as /account and Farm next do */
const chosenSort = ref<SetLabSort | null>(null);
const sortBy = computed<SetLabSort>({
  get: () => {
    const noTeam = Boolean(result.value?.teamNote);
    if (chosenSort.value === "team" && noTeam) return "own";
    return chosenSort.value ?? (noTeam ? "own" : "team");
  },
  set: (value) => {
    chosenSort.value = value;
  },
});
const keepsMain = ref(false);
const limit = ref(PAGE);
const open = ref(new Set<string>());
watch([shape, sortBy, keepsMain, selected], () => (limit.value = PAGE));
const sortOptions = computed(() => SET_LAB_SORTS.filter((o) => o.value !== "team" || !result.value?.teamNote));

const teamOf = (row: SetLabRow) => (selected.value ? lab.setLabTeamOf(selected.value, row.key) : null);
const rows = computed((): SetLabRow[] =>
  (result.value?.rows ?? []).map((r) => {
    const asked = teamOf(r);
    return asked && typeof asked === "object" && "key" in asked ? withSetTeam(r, asked) : r;
  }),
);
const sorted = computed(() => sortSetRows(filterSetRows(rows.value, shape.value, keepsMain.value), sortBy.value));
const shown = computed(() => sorted.value.slice(0, limit.value));
const firstWithoutTeam = computed(() => shown.value.findIndex((r) => !r.team));
const pendingShown = computed(() => shown.value.filter((r) => r.teamPending && teamOf(r) !== "running"));

const top = computed(() => sorted.value[0] ?? null);
const mine = computed(() => rows.value.find((r) => r.current) ?? null);
const mineRank = computed(() => mineRankOf(sorted.value, sortBy.value));
const fullRow = computed(() => rows.value.find((r) => r.yoursFull) ?? null);
const mainSpecies = computed(() => result.value?.slots[0]?.species ?? null);

/** the best layout if no condition ever holds: the other end of the answer, whichever ranking is on */
const floorTop = computed(() => (sortBy.value === "floor" ? null : sortSetRows(filterSetRows(rows.value, shape.value, keepsMain.value).filter((r) => !r.yoursFull), "floor")[0] ?? null));

const topCaption = computed(() => (sortBy.value === "team" ? `Best for the team${mineRank.value?.pending ? " so far" : ""}` : sortBy.value === "floor" ? "Best with no condition met" : "Best for their own damage"));
/** the top row's number, on the ranking chosen */
const topFigure = computed(() => {
  const r = top.value;
  if (!r) return "";
  if (sortBy.value === "team" && r.team) return `${signedPct(r.team.gain, 2)} team damage against yours`;
  if (sortBy.value === "floor") return `${signedPct(floorOf(r), 2)} own damage with no condition met`;
  return `${signedPct(r.gain, 2)} own damage against yours`;
});

const rowName = (row: SetLabRow): string => (row.yoursFull ? `${layoutName(row.parts)}, every condition met` : layoutName(row.parts));
function rowSub(row: SetLabRow): string {
  if (row.current) return "What this build wears today";
  if (row.yoursFull) return "The same echoes, your layout at its best";
  return changesText(row.changes);
}

const gainClass = (g: number): string => (g > 1e-9 ? "el-up" : "");
function signedDamage(n: number): string {
  if (Math.abs(n) < 0.5) return "±0";
  return `${n > 0 ? "+" : ""}${compact(n)}`;
}
const short = (row: SetLabRow): boolean => erShort(row, result.value?.erNeed);
const showHaveOf = (row: SetLabRow): number => showHave(row.erHave ?? 0);
const showNeedOf = (): number => showNeed(result.value?.erNeed ?? 0);

function teamError(row: SetLabRow): string | null {
  const asked = teamOf(row);
  return asked && typeof asked === "object" && "error" in asked ? `could not be worked out (${asked.error})` : null;
}
function emitTeams(keys: string[]): void {
  if (selected.value) void lab.runSetLabTeams(selected.value, keys);
}

/** what the own figure can't see of a row, in words */
function teamNoteOf(row: SetLabRow): string | null {
  const bonuses = row.bonuses.map((b) => result.value?.bonuses[b]);
  if (bonuses.some((b) => b?.teamOnly)) return row.team || row.teamPending ? "Its 5-piece effect is for teammates: the own figure can't see it, the team figure does." : "Its 5-piece effect is for teammates: the own figure can't see it.";
  if (row.teamReach) return row.team || row.teamPending ? "Part of its 5-piece reaches teammates: only the team figure counts that." : "Part of its 5-piece reaches teammates: the own figure can't see that part.";
  return null;
}

const passiveText = (a: { bonus: string; passive: string }): string => result.value?.bonuses[a.bonus]?.passives.find((p) => p.key === a.passive)?.text ?? "";

function toggle(key: string): void {
  const next = new Set(open.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  open.value = next;
}

/** "Eternal Radiance 5 Set" → "Eternal Radiance 5-piece", with the set's in-game name */
function bonusName(bonus: string): string {
  const m = /^(.+) (\d) Set$/.exec(bonus);
  return m ? `${m[1] === "Havoc Eclipse" ? setLabel("HavocEclipse") : m[1]} ${m[2]}-piece` : bonus;
}

const setList = (row: SetLabRow): string => row.parts.map((p) => setLabel(p.set)).join(" and ");

function ownedText(set: string): string {
  const byCost = result.value?.owned[set] ?? {};
  const costs = Object.keys(byCost).sort((a, b) => Number(b) - Number(a));
  if (!costs.length) return "none";
  return costs.map((c) => `${byCost[c]} at cost ${c}`).join(", ");
}

function sameText(row: SetLabRow): string {
  const names = row.same.slice(0, 4).map(keyName);
  const more = row.same.length - names.length;
  return more > 0 ? `${names.join(", ")} and ${more} more.` : `${names.join(", ")}.`;
}
const keyName = (key: string): string =>
  layoutName(
    key === "none"
      ? []
      : key.split("+").map((part) => {
          const [set, pieces] = part.split(":");
          return { set, pieces: Number(pieces) };
        }),
  );

const refusedText = computed(() => {
  const r = result.value;
  if (!r) return "";
  const names = r.refused.slice(0, 3).map((x) => keyName(x.key));
  const more = r.refusedCount - names.length;
  return more > 0 ? `${names.join(", ")} and ${more} more` : names.join(", ");
});

/** The optimizer's set filter for this character, on the sets of the row, then the optimizer. It asks first and names what
 *  it replaces (a saved filter has no undo). The filter is replaced here, not merged: the store's `setCharacterData` merges
 *  arrays by index, which would leave an old set behind. */
async function toOptimizer(row: SetLabRow): Promise<void> {
  const id = result.value?.characterId;
  if (!id) return;
  const store = useCharacterStore() as unknown as { characters: Record<string, any>; setActiveCharacter: (key: string) => void }; // eslint-disable-line no-unused-vars -- the parameter of a method type
  const before: string[] = store.characters[id]?.optimizer?.echoSets ?? [];
  const sets = layoutSets(row.parts);
  if (before.length !== sets.length || !sets.every((s) => before.includes(s))) {
    const ok = await confirm(`The optimizer will look only at echoes of ${setList(row)}. The calculator opens on ${characterName(id)}.`, {
      title: `Filter ${characterName(id)}'s optimizer?`,
      items: before.length ? [`This replaces the filter saved there: ${before.map(setLabel).join(", ")}`] : undefined,
      confirmLabel: "Filter and open",
    });
    if (!ok) return;
    const data = store.characters[id] ?? {};
    store.characters[id] = { ...data, optimizer: { ...(data.optimizer ?? {}), echoSets: sets } };
  }
  store.setActiveCharacter(id);
  await router.push({ path: "/", query: { screen: "optimizer" } });
}
</script>

<style scoped>
.setlab-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.6rem 0.75rem;
}
.setlab-stats dt {
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.025em;
  line-height: 1.2;
  opacity: 0.6;
}
.setlab-stats dd {
  margin-top: 0.125rem;
}
/* a phone: one stat per line, the caption on the left and the number on the right, its small print under them */
@media (max-width: 639px) {
  .setlab-stats {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.45rem;
  }
  .setlab-stats > div {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: 0.75rem;
    align-items: baseline;
  }
  .setlab-stats dd {
    display: contents;
  }
  .setlab-stats dd > :first-child {
    grid-column: 2;
    grid-row: 1;
    text-align: right;
  }
  .setlab-stats dd > :nth-child(2) {
    grid-column: 1 / -1;
    text-align: right;
  }
}
</style>
