<template>
  <section ref="root" class="lw" :aria-labelledby="headId" data-test-levels-worth>
    <div class="lw__head">
      <h3 :id="headId" class="lw__h3">What each level is worth</h3>
      <div class="lw-seg" role="group" aria-label="Start from">
        <button type="button" class="lw-seg__btn" :class="{ 'lw-seg__btn--on': from === 'saved' }" :aria-pressed="from === 'saved'" data-test-levels-from="saved" @click="from = 'saved'">
          From saved levels
        </button>
        <button type="button" class="lw-seg__btn" :class="{ 'lw-seg__btn--on': from === 'scratch' }" :aria-pressed="from === 'scratch'" data-test-levels-from="scratch" @click="from = 'scratch'">
          From level 1
        </button>
        <button type="button" class="lw-seg__btn" :class="{ 'lw-seg__btn--on': from === 'custom' }" :aria-pressed="from === 'custom'" :disabled="!table" data-test-levels-from="custom" @click="tryOther">
          Other levels
        </button>
      </div>
    </div>
    <p class="lw__intro" data-test-levels-intro>
      What each level-up still open adds to damage on {{ name }}'s build, and what it costs<template v-if="from === 'scratch'">: counted from a new {{ name }} at level 1<template v-if="weaponName"> with {{ weaponName }} at level 1</template>, wearing this build's echoes</template><template v-else-if="from === 'custom'">: counted from the levels you set here</template>.
    </p>

    <!-- a what-if: where the character stands in game, for an account whose calculator has no levels saved -->
    <div v-if="from === 'custom' && tryFields.length" class="lw-try" data-test-levels-try>
      <p class="lw__note">
        Set where {{ name }} stands in game. This is a what-if: nothing here is saved, and every other page keeps counting the saved levels. To keep them, set them in the calculator.
      </p>
      <div class="lw-try__grid">
        <label v-for="f in tryFields" :key="f.key" class="lw-try__field">
          <span class="lw-try__label">{{ f.label }}</span>
          <select v-model="tried[f.key]" class="lw-try__select" :data-test-levels-try-field="f.key">
            <option v-for="o in f.options" :key="o" :value="o">{{ o }}</option>
          </select>
        </label>
      </div>
    </div>

    <p v-if="!table" class="lw__note" data-test-levels-loading>{{ failed ? "The cost table did not load. Reload the page to try again." : "Loading the cost table…" }}</p>
    <p v-else-if="waiting" class="lw__note" role="status" data-test-levels-waiting>Waiting for the roster to be scored…</p>
    <p v-else-if="error" class="lw__note lw__note--warn" role="alert" data-test-levels-error>This could not be worked out: {{ error }}</p>
    <p v-else-if="!plan" class="lw__note" role="status" data-test-levels-working>Scoring the steps…</p>
    <p v-else-if="!plan.today" class="lw__note" data-test-levels-missing>The cost table (version {{ plan.table.gameVersion }}) has no entry for {{ name }} yet.</p>
    <template v-else>
      <!-- what the calculator has not saved: it runs the top there, so nothing shows as left -->
      <p v-if="from === 'saved' && assumed" class="lw__note lw__note--warn" data-test-levels-assumed>
        The calculator has not saved {{ name }}'s {{ assumed }}, so it counts {{ assumedMany ? "them" : "it" }} at the top and nothing is left to level there. If that is not where
        {{ name }} is in game, set the real values in the calculator, try them under "Other levels", or count from level 1.
        <button type="button" class="lw-link" data-test-levels-set @click="emit('calculator')">Set levels in the calculator</button>
      </p>

      <div v-if="plan.done" class="lw-done" data-test-levels-done>
        <span class="lw-done__label">Nothing left to level</span>
        <span class="lw-done__text">{{ plan.startText }}.</span>
      </div>
      <template v-else>
        <p v-if="plan.noGain" class="lw__note lw__note--warn" data-test-levels-nogain>No damage figures: {{ plan.noGain }}. The steps below show what they cost.</p>
        <p v-else class="lw__note" data-test-levels-basis>{{ basis }}</p>
        <p v-if="plan.buildNote" class="lw__note" data-test-levels-build>Team figures: {{ plan.buildNote }}</p>
        <p v-if="smallTeam" class="lw__note" data-test-levels-small-team>{{ smallTeam }}</p>

        <div v-if="!plan.noGain" class="lw-seg lw-seg--views" role="group" aria-label="Show">
          <button type="button" class="lw-seg__btn" :class="{ 'lw-seg__btn--on': view === 'list' }" :aria-pressed="view === 'list'" data-test-levels-view="list" @click="view = 'list'">
            Each on its own
          </button>
          <button type="button" class="lw-seg__btn" :class="{ 'lw-seg__btn--on': view === 'path' }" :aria-pressed="view === 'path'" data-test-levels-view="path" @click="view = 'path'">
            Level in this order
          </button>
        </div>

        <!-- each track on its own, from the starting levels to its top -->
        <template v-if="view === 'list' || plan.noGain">
          <p v-if="!plan.noGain" class="lw__note">Each line is one thing taken to its top on its own, from {{ startWords }}. Biggest gain in {{ basisWords }} first.</p>
          <ul class="lw-rows" data-test-levels-rows>
            <li v-for="r in plan.rows" :key="r.track" class="lw-row" :data-test-levels-row="r.track">
              <span class="lw-row__label">{{ r.label }}</span>
              <span v-if="r.inert" class="lw-row__inert" data-test-levels-inert>{{ inertText(r, titles.rotation) }}</span>
              <span v-else-if="r.own" class="lw-row__gains">
                <span v-for="c in gainChips(r, plan.basis)" :key="c.scope" class="lw-gain">
                  <b :class="c.gain >= 0 ? 'acc-gain-up' : 'acc-gain-down'">{{ c.text }}</b>
                  <span class="lw-gain__scope">{{ c.scope }}</span>
                </span>
              </span>
              <details v-if="r.cost.materials.length" class="lw-cost">
                <summary class="lw-cost__sum">{{ costText(r.cost) }} · {{ materialsText(r.cost) }}</summary>
                <ul class="lw-mats" :aria-label="`Materials for ${r.label}`">
                  <li v-for="m in r.cost.materials" :key="m.id" class="lw-chip" :data-rarity="m.rarity">
                    <span class="lw-chip__name">{{ m.name }}</span><b class="lw-chip__n">× {{ count(m.count) }}</b>
                  </li>
                </ul>
              </details>
              <span v-else class="lw-cost lw-cost__plain">{{ costText(r.cost) }}</span>
              <span v-if="plan.team && !r.team && r.teamNote && !r.inert" class="lw-row__note">no team figure: {{ r.teamNote }}</span>
            </li>
          </ul>
          <p v-if="everything" class="lw-total" data-test-levels-everything>
            <span class="lw-total__label">All of it together</span>
            <span>{{ everything }}</span>
            <span v-if="plan.rows.length > 1 && !plan.noGain" class="lw-total__why">Level-ups multiply each other, so together they add more than the lines add up to.</span>
          </p>
        </template>

        <!-- the order to take them in, one step at a time -->
        <template v-else>
          <p class="lw__note" data-test-levels-path-how>{{ pathHow(plan) }}</p>
          <p v-if="running" class="lw__note" role="status" data-test-levels-path-working>Working out the order: {{ progress.done }} of {{ progress.total }} steps…</p>
          <p v-else-if="headline" class="lw-headline" data-test-levels-path-headline>{{ headline }}</p>
          <ol class="lw-path" data-test-levels-path>
            <li v-for="s in shownPath" :key="s.index" class="lw-step" :data-test-levels-step="s.index">
              <span class="lw-step__n" aria-hidden="true">{{ s.index }}</span>
              <span class="lw-step__label">{{ s.label }}</span>
              <span class="lw-gain">
                <b :class="stepChip(s, plan.basis).gain >= 0 ? 'acc-gain-up' : 'acc-gain-down'">{{ stepChip(s, plan.basis).text }}</b>
                <span class="lw-gain__scope">{{ stepChip(s, plan.basis).scope }}</span>
              </span>
              <span class="lw-step__cost">{{ costText(s.cost) }}<template v-if="s.cost.materials.length"> · {{ materialsText(s.cost) }}</template></span>
              <span class="lw-step__run">{{ runningText(s, plan.basis) }}</span>
            </li>
          </ol>
          <button v-if="plan.path.length > PATH_FIRST" type="button" class="lw-more" :aria-expanded="allSteps" data-test-levels-path-more @click="allSteps = !allSteps">
            {{ allSteps ? `Show the first ${PATH_FIRST} steps` : `Show all ${plan.path.length} steps` }}
          </button>
          <p v-if="plan.pathState === 'capped'" class="lw__note">The order stops here; the steps after it were not worked out.</p>
          <p v-if="leftOut" class="lw__note" data-test-levels-path-inert>Left out of the order: {{ leftOut }}.</p>
          <p v-if="!running && plan.path.length" class="lw__note" data-test-levels-path-blind>{{ ORDER_BLIND }} Which materials each track needs is under "Each on its own".</p>
        </template>
      </template>

      <p v-if="plan.today.weaponMissing" class="lw__note" data-test-levels-weapon-missing>
        The cost table (version {{ plan.table.gameVersion }}) has no entry for {{ weaponDisplayName(plan.today.weaponKey) }} yet, so its level is left out.
      </p>
      <p v-else-if="!plan.today.weaponKey" class="lw__note" data-test-levels-no-weapon>No weapon equipped, so there is no weapon level here.</p>
      <p class="lw__source" data-test-levels-source>
        {{ NOT_MODELLED }} Costs from the game's own upgrade tables, version {{ plan.table.gameVersion }} (read <span class="whitespace-nowrap">{{ plan.table.fetched }}</span>).
      </p>
    </template>
  </section>
</template>

<script lang="ts">
import type { TrackKey as TriedTrack } from "./levelSteps";
/** the levels tried under "Other levels", per character, for this page visit only (nothing is stored) */
const triedThisVisit = new Map<string, Partial<Record<TriedTrack, string>>>();
</script>

<script setup lang="ts">
// Wuthering Tools+ — "What each level is worth" in the /account character drawer, under Cost to max: every level-up
// the character has left (level, weapon level, the five Forte skills), what each adds to damage on their own build
// and what it costs. Two views of the same steps: each track on its own to its top, and the order to take them in.
// The numbers are levelPlan.ts (the roster ranking's own scorers); this component loads the cost table, runs the
// plan once the section is on screen, and lays it out.
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, toRaw, useId, watch } from "vue";
import { storeToRefs } from "pinia";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { weaponDisplayName } from "../display/names";
import { parsePresetName } from "../presets/presetName";
import { autoTeamBuffs } from "../teamContext/autoTeamBuffs";
import { count, hasSavedProgress, savedProgressOf, type MaterialsData } from "../materials/costToMax";
import { loadMaterials } from "../materials/materialsData";
import type { CharacterRank, TeamRank } from "../myRankings/rankRoster";
import { assumedWords, BASIS_WORDS, inertText, levelPlan, type LevelPlan } from "./levelPlan";
import { FORTE_KEYS, levelOptions, levelsToday, stateLevels, stateText, TOP_LEVEL, trackLabel, type TrackKey } from "./levelSteps";
import { basisLine, costText, everythingText, gainChips, headlineText, inertLine, materialsText, NOT_MODELLED, ORDER_BLIND, pathHow, runningText, smallTeamLine, stepChip } from "./levelsView";

const props = defineProps<{
  characterKey: string;
  /** the character's short name */
  name: string;
  /** the roster ranking's row for the character (null: not scored, or no weapon) and the ranking's teams */
  rank: CharacterRank | null;
  rankingTeams: TeamRank[];
  /** the roster is still being scored: the plan waits for it */
  scoring?: boolean;
  /** the set-up characters, for reading a wuwa_calc name as its team */
  owned?: string[];
}>();
const emit = defineEmits<{ calculator: [] }>();

/** the path's first steps on show; the rest sit behind "Show all" */
const PATH_FIRST = 12;

const characterStore = useCharacterStore();
const inventoryStore = useInventoryStore();
const teamStore = useTeamRotationsStore();
const { characters } = storeToRefs(characterStore) as unknown as { characters: { value: Record<string, Record<string, any>> } };
const { teams } = storeToRefs(teamStore) as unknown as { teams: { value: Array<Record<string, any>> } };

const headId = `lw-head-${useId()}`;
const root = ref<HTMLElement | null>(null);
const table = shallowRef<MaterialsData | null>(null);
const failed = ref(false);
loadMaterials()
  .then((d) => (table.value = d))
  .catch(() => (failed.value = true));

const saved = computed(() => savedProgressOf(characters.value?.[props.characterKey]));
/** opens on the saved levels when anything below the top is saved, else from level 1, as Cost to max does: with
 *  nothing saved the calculator runs the top everywhere and the saved view has nothing to list */
const from = ref<"saved" | "scratch" | "custom">(hasSavedProgress(saved.value) ? "saved" : "scratch");
const view = ref<"list" | "path">("list");
const allSteps = ref(false);

const plan = shallowRef<LevelPlan | null>(null);
const error = ref<string | null>(null);
const running = ref(false);
const progress = ref({ done: 0, total: 0 });
/** the section has been on screen: nothing is scored for a drawer that is opened and closed above it */
const seen = ref(false);
const waiting = computed(() => Boolean(props.scoring));

/** "Other levels": the levels tried for this character, by track. Kept for the visit (the drawer closes and opens
 *  again on the same character), never stored: it is a what-if, and the calculator stays the place levels are saved. */
const tried = reactive<Partial<Record<TrackKey, string>>>({ ...(triedThisVisit.get(props.characterKey) ?? {}) });
const today = computed(() => (table.value ? levelsToday(table.value, saved.value) : null));
const tryFields = computed(() => {
  const t = today.value;
  if (!t) return [];
  const forte = Array.from({ length: 10 }, (_, i) => String(i + 1));
  return [
    { key: "level" as TrackKey, label: trackLabel("level"), options: levelOptions(TOP_LEVEL) },
    ...(t.weaponTop != null ? [{ key: "weapon" as TrackKey, label: trackLabel("weapon"), options: levelOptions(t.weaponTop) }] : []),
    ...FORTE_KEYS.map((key) => ({ key: key as TrackKey, label: trackLabel(key), options: forte })),
  ];
});
/** opens on the saved levels (the top, where none are saved): lower what is not there yet */
function tryOther(): void {
  const t = today.value;
  if (!t) return;
  const start = stateLevels(t, t.state);
  for (const f of tryFields.value) if (!tried[f.key] || !f.options.includes(tried[f.key]!)) tried[f.key] = start[f.key];
  from.value = "custom";
}

let signal: { cancelled: boolean } | null = null;
let generation = 0;
/** what the plan on show was worked out for */
let shownFor = "";

async function run(): Promise<void> {
  const data = table.value;
  if (!data || !seen.value || waiting.value) return;
  const withPath = view.value === "path";
  const levels = from.value === "custom" ? Object.fromEntries(tryFields.value.map((f) => [f.key, tried[f.key]])) : null;
  const key = `${props.characterKey}|${from.value}|${levels ? JSON.stringify(levels) : ""}`;
  // the same character and start: keep what is there unless the order is wanted and not worked out yet
  if (shownFor === key && plan.value && (!withPath || plan.value.pathState === "complete" || plan.value.pathState === "capped" || running.value)) return;
  if (signal) signal.cancelled = true;
  const mine = { cancelled: false };
  signal = mine;
  const gen = ++generation;
  if (shownFor !== key) plan.value = null;
  shownFor = key;
  error.value = null;
  running.value = withPath;
  progress.value = { done: 0, total: 0 };
  try {
    const result = await levelPlan(
      {
        characterId: props.characterKey,
        characters: toRaw(characters.value ?? {}),
        inventoryEchoes: toRaw(inventoryStore.echoes ?? []) as any[],
        teams: toRaw(teams.value ?? []),
        rank: props.rank,
        rankingTeams: props.rankingTeams,
        materials: data,
      },
      {
        from: levels ?? (from.value === "scratch" ? "scratch" : "saved"),
        autoTeamBuffs: autoTeamBuffs.value,
        path: withPath,
        signal: mine,
        onProgress: (p, done) => {
          if (gen !== generation) return;
          plan.value = p;
          progress.value = done;
        },
      },
    );
    if (gen !== generation) return;
    plan.value = result;
  } catch (err) {
    if (gen === generation) error.value = err instanceof Error ? err.message : String(err);
  } finally {
    if (gen === generation) running.value = false;
  }
}

watch([table, seen, waiting, view], () => void run());
watch(from, () => {
  allSteps.value = false;
  void run();
});
watch(tried, () => {
  triedThisVisit.set(props.characterKey, { ...tried });
  if (from.value === "custom") void run();
});
// a new ranking (Recompute, or the roster finishing): what is shown was scored on the old one
watch([() => props.rank, () => props.rankingTeams], () => {
  shownFor = "";
  void run();
});

let observer: IntersectionObserver | null = null;
onMounted(() => {
  // a drawer opens a few times a visit; the scoring waits until the section itself is in view
  if (typeof IntersectionObserver === "undefined" || !root.value) {
    seen.value = true;
    return;
  }
  observer = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    seen.value = true;
    observer?.disconnect();
    observer = null;
  });
  observer.observe(root.value);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  generation += 1;
  if (signal) signal.cancelled = true;
});

const weaponName = computed(() => (saved.value.weapon && table.value?.weapons[saved.value.weapon] ? weaponDisplayName(saved.value.weapon) : ""));
const assumed = computed(() => (plan.value?.today ? assumedWords(plan.value.today) : ""));
const assumedMany = computed(() => (plan.value?.today?.assumed.length ?? 0) > 1);
const title = (name: string | null | undefined): string | null => (name ? parsePresetName(name, { owned: props.owned ?? [] }).title || name : null);
const titles = computed(() => ({ name: props.name, rotation: title(plan.value?.rotation?.name), team: title(plan.value?.team?.name) }));
const basis = computed(() => (plan.value ? basisLine(plan.value, titles.value) : ""));
const basisWords = computed(() => (plan.value ? BASIS_WORDS[plan.value.basis] : ""));
const startWords = computed(() => (plan.value?.today ? (from.value === "scratch" ? "level 1" : from.value === "custom" ? "the levels set above" : stateText(plan.value.today, plan.value.today.state).replace(/^Level/, "level")) : ""));
const everything = computed(() => (plan.value ? everythingText(plan.value) : null));
const headline = computed(() => (plan.value ? headlineText(plan.value) : null));
const shownPath = computed(() => (allSteps.value ? (plan.value?.path ?? []) : (plan.value?.path ?? []).slice(0, PATH_FIRST)));
const leftOut = computed(() => (plan.value ? inertLine(plan.value, titles.value.rotation) : null));
const smallTeam = computed(() => (plan.value ? smallTeamLine(plan.value, props.name) : null));
</script>

<style scoped>
.lw {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.lw__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
}
.lw__h3 {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: oklch(var(--bc) / 0.8);
}
.lw__intro,
.lw__note,
.lw__source {
  font-size: 0.72rem;
  line-height: 1.4;
  color: oklch(var(--bc) / 0.8);
}
.lw__note--warn {
  padding: 0.4rem 0.55rem;
  border-radius: 0.5rem;
  color: oklch(var(--bc));
  background: color-mix(in oklab, oklch(var(--wa)) 12%, transparent);
}
.lw__source {
  font-size: 0.65rem;
  color: oklch(var(--bc) / 0.78);
}
.lw-link {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 2px;
  color: oklch(var(--bc));
}
.lw-seg {
  display: inline-flex;
  max-width: 100%;
  padding: 0.15rem;
  border-radius: 0.55rem;
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.1);
}
.lw-seg--views {
  align-self: flex-start;
}
.lw-seg__btn {
  padding: 0.2rem 0.6rem;
  border-radius: 0.4rem;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
  color: oklch(var(--bc) / 0.8);
}
.lw-seg__btn:hover {
  color: oklch(var(--bc));
}
.lw-seg__btn--on {
  color: oklch(var(--bc));
  background: oklch(var(--b1));
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.2);
}
.lw-seg__btn:focus-visible,
.lw-try__select:focus-visible,
.lw-cost__sum:focus-visible,
.lw-link:focus-visible,
.lw-more:focus-visible {
  outline: 2px solid oklch(var(--p));
  outline-offset: 2px;
}
.lw-try {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.55rem 0.65rem;
  border-radius: 0.7rem;
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.07);
}
.lw-try__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr));
  gap: 0.45rem 0.6rem;
}
/* two to a row at 360 px and 130 % text; a label that wraps keeps its picker on the row's bottom line */
.lw-try__field {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 0.15rem;
  min-width: 0;
}
.lw-try__label {
  font-size: 0.68rem;
  font-weight: 600;
  color: oklch(var(--bc) / 0.8);
}
.lw-try__select {
  width: 100%;
  min-height: 2.5rem;
  padding: 0.2rem 0.5rem;
  border-radius: 0.5rem;
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
  color: oklch(var(--bc));
  background: oklch(var(--b1));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.2);
}
.lw-seg__btn:disabled {
  opacity: 0.5;
}
.lw-done,
.lw-total {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.55rem 0.65rem;
  border-radius: 0.7rem;
  font-size: 0.78rem;
  line-height: 1.4;
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.07);
}
.lw-done__label,
.lw-total__label {
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: oklch(var(--bc) / 0.8);
}
.lw-total {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.lw-total__why {
  font-size: 0.68rem;
  font-weight: 400;
  color: oklch(var(--bc) / 0.8);
}
.lw-rows,
.lw-path {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
/* a line that does not fit moves its figures under the label, instead of the label breaking inside "1 → 90" */
.lw-row,
.lw-step {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.15rem 0.6rem;
  padding: 0.45rem 0.6rem;
  border-radius: 0.6rem;
  background: oklch(var(--b2));
}
.lw-row__label,
.lw-step__label {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
}
.lw-row__gains {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.1rem 0.5rem;
  margin-left: auto;
}
.lw-gain {
  display: inline-flex;
  align-items: baseline;
  gap: 0.25rem;
  font-size: 0.82rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.lw-gain__scope {
  font-size: 0.65rem;
  font-weight: 600;
  color: oklch(var(--bc) / 0.8);
}
.lw-row__inert {
  flex-basis: 100%;
  font-size: 0.72rem;
  color: oklch(var(--bc) / 0.8);
}
.lw-row__note,
.lw-cost,
.lw-step__cost,
.lw-step__run {
  flex-basis: 100%;
  font-size: 0.7rem;
  line-height: 1.4;
  color: oklch(var(--bc) / 0.8);
}
.lw-cost__sum {
  border-radius: 0.3rem;
  cursor: pointer;
  list-style: none;
}
.lw-cost__sum::-webkit-details-marker {
  display: none;
}
.lw-cost__sum::before {
  content: "▸";
  display: inline-block;
  width: 1em;
  color: oklch(var(--bc) / 0.65);
}
.lw-cost[open] > .lw-cost__sum::before {
  content: "▾";
}
.lw-mats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.35rem;
}
.lw-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 0.3rem;
  max-width: 100%;
  padding: 0.15rem 0.45rem 0.15rem 0.4rem;
  border-left: 3px solid var(--lw-rarity, oklch(var(--bc) / 0.3));
  border-radius: 0.35rem;
  font-size: 0.72rem;
  color: oklch(var(--bc));
  background: oklch(var(--b1));
}
.lw-chip[data-rarity="2"] {
  --lw-rarity: #5bb974;
}
.lw-chip[data-rarity="3"] {
  --lw-rarity: #4f8fe6;
}
.lw-chip[data-rarity="4"] {
  --lw-rarity: #a66bdc;
}
.lw-chip[data-rarity="5"] {
  --lw-rarity: #e8b44c;
}
.lw-chip__name {
  min-width: 0;
  overflow-wrap: anywhere;
}
.lw-chip__n {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.lw-headline {
  padding: 0.5rem 0.65rem;
  border-radius: 0.7rem;
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.4;
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.07);
}
.lw-step {
  padding-left: 2.1rem;
  position: relative;
}
.lw-step__n {
  position: absolute;
  left: 0.6rem;
  min-width: 1.2rem;
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 1.6;
  font-variant-numeric: tabular-nums;
  color: oklch(var(--bc) / 0.8);
}
.lw-step .lw-gain {
  margin-left: auto;
}
.lw-step__run {
  font-variant-numeric: tabular-nums;
}
.lw-more {
  align-self: flex-start;
  min-height: 2.25rem;
  padding: 0.2rem 0.7rem;
  border-radius: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: oklch(var(--bc));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.2);
}
.lw-more:hover {
  background: oklch(var(--bc) / 0.06);
}
/* phones: the two switches take the full width and are 40 px tall at 130 % text, as Cost to max's is */
@media (max-width: 767px) {
  .lw-seg {
    display: flex;
    width: 100%;
  }
  .lw-seg__btn {
    flex: 1 1 0;
    min-height: 2.5rem;
    padding-inline: 0.3rem;
    white-space: normal;
    line-height: 1.15;
  }
  /* 40 px to tap at any text size */
  .lw-cost__sum {
    display: flex;
    align-items: center;
    min-height: 2.5rem;
  }
  .lw-cost__sum::before {
    flex: none;
  }
  .lw-link,
  .lw-more {
    min-height: 2.5rem;
  }
}
</style>
