<template>
  <section ref="root" class="gm" aria-labelledby="gm-title" data-test-gear-map :data-state="state">
    <header class="gm-head">
      <h2 id="gm-title" class="gm-title">Gear map</h2>
      <p class="gm-lead">
        Every echo your set-up characters wear, one row each, coloured by how lucky its roll is: Echo Lab's rating, the
        same one the inventory's chips show.
      </p>
    </header>

    <ul class="gm-legend" aria-label="What the colours and letters mean">
      <li v-for="b in GEAR_BANDS" :key="b.step" class="gm-legend__item">
        <span class="gm-swatch" :class="`gm-step--${b.step}`" aria-hidden="true">{{ b.letter }}</span>
        <span>{{ b.words }}</span>
      </li>
      <li class="gm-legend__item">
        <span class="gm-swatch gm-step--none" aria-hidden="true">–</span>
        <span>No roll to rate</span>
      </li>
    </ul>
    <p class="gm-muted gm-small">
      A roll is compared with every roll an echo of its kind (set, cost, main stat) could have had, by damage on its
      character's best rotation: Excellent beats 90 in 100 of them, Good 70, Average 40, Below average 15, Poor fewer.
      – means no substat lines yet, or no build to rate it on.
    </p>

    <WorkStatus :busy="state === 'working'" busy-text="Echo Lab is rating your equipped echoes for the gear map." :done-text="state === 'ready' ? 'Gear map ready.' : ''" />

    <p v-if="state === 'idle'" class="gm-status">
      <button type="button" class="btn btn-sm" data-test-gear-map-start @click="start">Show the gear map</button>
      <span class="gm-muted">Echo Lab rates every equipped echo (a few seconds, the first time).</span>
    </p>
    <p v-else-if="state === 'unavailable'" class="gm-status" data-test-gear-map-unavailable>
      Echo Lab needs a character with a weapon and five echoes to rate rolls against: build one and this map fills in.
    </p>
    <p v-else-if="state === 'working'" class="gm-status" role="status" data-test-gear-map-working>
      <span class="loading loading-spinner loading-xs" aria-hidden="true"></span>
      {{ workingText }}
    </p>

    <template v-if="state === 'ready' || state === 'partial'">
      <div v-if="state === 'partial'" role="alert" class="gm-status" data-test-gear-map-partial>
        Echo Lab could not rate every roll ({{ progress.rated }} of {{ progress.rateable }}): the cells marked – have no rating, so the counts below leave them out.
        <button type="button" class="btn btn-xs" @click="q.retryRatings()">Try again</button>
      </div>

      <div class="gm-summary" data-test-gear-map-summary>
        <p class="gm-summary__line" data-test-gear-map-count>{{ summaryLine(summary) }}</p>
        <p class="gm-muted gm-summary__bands">
          <template v-for="(b, i) in GEAR_BANDS" :key="b.step"><template v-if="i"> · </template>{{ summary.counts[b.step] }} {{ b.short }}</template>
        </p>
        <template v-if="summary.weakest.length">
          <p class="gm-summary__sub">Your {{ summary.weakest.length === 1 ? "weakest equipped echo" : `${summary.weakest.length} weakest equipped echoes` }}:</p>
          <ol class="gm-weakest" data-test-gear-map-weakest>
            <li v-for="w in summary.weakest" :key="w.cell.echoId!">
              <RouterLink :to="echoLink(w.cell.echoId!)" class="gm-weakest__link" :data-test-gear-map-weak="w.cell.echoId">
                <span class="gm-swatch gm-swatch--sm" :class="`gm-step--${w.cell.step}`" aria-hidden="true">{{ w.cell.letter }}</span>
                <span>
                  <b>{{ echoName(w.cell.echo) }}</b> on {{ w.name }}, slot {{ w.cell.slot + 1 }}
                  <span class="gm-muted">· {{ w.cell.chip.roll?.text }}</span>
                </span>
                <span aria-hidden="true">›</span>
              </RouterLink>
            </li>
          </ol>
        </template>
      </div>

      <div class="gm-sort" role="group" aria-label="Order of the rows">
        <span class="gm-muted">Rows:</span>
        <button type="button" class="btn btn-xs" :class="sort === 'roster' ? 'btn-primary' : 'btn-ghost'" :aria-pressed="sort === 'roster'" data-test-gear-map-sort="roster" @click="sort = 'roster'">Roster order</button>
        <button type="button" class="btn btn-xs" :class="sort === 'weakest' ? 'btn-primary' : 'btn-ghost'" :aria-pressed="sort === 'weakest'" data-test-gear-map-sort="weakest" @click="sort = 'weakest'">Weakest gear first</button>
      </div>

      <table class="gm-table" data-test-gear-map-table>
        <caption class="sr-only">Gear map: each set-up character's five echo slots and Echo Lab's rating of each echo's roll</caption>
        <thead class="sr-only">
          <tr>
            <th scope="col">Character</th>
            <th v-for="n in 5" :key="n" scope="col">Slot {{ n }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in shownRows" :key="row.id" class="gm-row" :data-test-gear-map-row="row.id">
            <th scope="row" class="gm-who">
              <CharacterAvatar :id="row.id" :size="28" title="" />
              <span class="gm-who__name">{{ row.name }}</span>
            </th>
            <td v-for="c in row.cells" :key="c.slot" class="gm-td">
              <span v-if="c.step === 'empty'" class="gm-cell gm-step--empty" :aria-label="cellLabel(row.name, c)" role="img" data-test-gear-map-cell="empty"></span>
              <button
                v-else
                type="button"
                class="gm-cell"
                :class="`gm-step--${c.step}`"
                :aria-label="cellLabel(row.name, c)"
                :title="c.chip.title || c.words"
                :data-test-gear-map-cell="c.echoId"
                :data-step="c.step"
                :data-roll="c.chip.roll?.text ?? ''"
                :data-verdict="c.chip.verdictLabel"
                @click="openCell(row, c, $event)">
                {{ c.letter }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="rows.length > FOLD" class="gm-fold">
        <button type="button" class="btn btn-sm btn-ghost" :aria-expanded="unfolded" data-test-gear-map-fold @click="unfolded = !unfolded">
          {{ unfolded ? `Show the first ${FOLD}` : `Show all ${rows.length} characters` }}
        </button>
      </p>
    </template>

    <dialog ref="sheet" class="gm-sheet" aria-labelledby="gm-sheet-title" data-test-gear-map-sheet @close="onSheetClose" @click="onBackdrop">
      <div v-if="open" class="gm-sheet__body">
        <header class="gm-sheet__head">
          <span class="gm-swatch" :class="`gm-step--${open.cell.step}`" aria-hidden="true">{{ open.cell.letter }}</span>
          <div class="min-w-0">
            <h3 id="gm-sheet-title" class="gm-sheet__title">{{ echoName(open.cell.echo) }}</h3>
            <p class="gm-muted">{{ open.name }} · slot {{ open.cell.slot + 1 }}</p>
          </div>
          <button type="button" class="btn btn-sm btn-ghost btn-square" aria-label="Close" data-test-gear-map-sheet-close @click="closeSheet">✕</button>
        </header>
        <dl class="gm-facts">
          <div><dt>Cost</dt><dd>{{ open.cell.cost ?? "—" }}</dd></div>
          <div><dt>Set</dt><dd>{{ setLabel(open.cell.set) }}</dd></div>
          <div><dt>Main stat</dt><dd>{{ mainLabel(open.cell.main) }}</dd></div>
        </dl>
        <p class="gm-sheet__h">Substats ({{ open.cell.subs.length }} of 5 rolled)</p>
        <ul v-if="open.cell.subs.length" class="gm-subs">
          <li v-for="(l, i) in open.cell.subs" :key="i">{{ lineText(l.key, l.value) }}</li>
        </ul>
        <p v-else class="gm-muted">No substat lines yet.</p>
        <p class="gm-sheet__h">Echo Lab says</p>
        <p data-test-gear-map-sheet-verdict>
          <template v-if="open.cell.chip.verdictLabel"><b>{{ open.cell.chip.verdictLabel }}</b> ({{ open.cell.chip.reason }})</template>
          <template v-else>Not judged: this echo is not in your inventory, so Echo Lab has nothing to say about it.</template>
          <template v-if="open.cell.chip.roll"> · <b>{{ open.cell.words }}</b>, <span data-test-gear-map-sheet-roll>{{ open.cell.chip.roll.text }}</span></template>
          <template v-else-if="open.cell.chip.verdictLabel"> · {{ open.cell.words }}</template>
        </p>
        <p v-if="open.cell.chip.title" class="gm-muted gm-small">{{ open.cell.chip.title.replace(/ Tap for the details in Echo Lab\.$/, "") }}</p>
        <p v-if="open.cell.ratedOn && open.cell.ratedOn.characterId !== open.id" class="gm-muted gm-small" data-test-gear-map-sheet-elsewhere>
          {{ open.name }} is not a five-echo build Echo Lab can score, so it rates this echo in {{ characterName(open.cell.ratedOn.characterId) }}'s slot {{ open.cell.ratedOn.slot + 1 }}, as the inventory does.
        </p>
        <nav class="gm-links" aria-label="Open in Echo Lab">
          <RouterLink v-if="open.cell.chip.verdictLabel" :to="echoLink(open.cell.echoId!)" class="btn btn-sm btn-primary" data-test-gear-map-sheet-echo-lab>Open this echo in Echo Lab ›</RouterLink>
          <RouterLink to="/echo-lab?tab=farm" class="btn btn-sm" data-test-gear-map-sheet-farm>Farm next for this slot ›</RouterLink>
        </nav>
      </div>
    </dialog>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+ — the Gear map on /account (src/sim/gearMap/README in src/sim/README.md, "Gear map"). Reads the
// inventory's Echo Lab layer (useInventoryQuality: the same pass, ratings and cache the inventory's chips and
// /echo-lab read), started when the section scrolls into view, never before: the page opens as fast as it did.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import CharacterAvatar from "../display/CharacterAvatar.vue";
import WorkStatus from "../display/WorkStatus.vue";
import { characterName, echoName, lineText, mainLabel, setLabel } from "../echoLab/echoLabView";
import { useInventoryQuality } from "../inventoryQuality/useInventoryQuality";
import { GEAR_BANDS, cellLabel, gearProgress, gearRows, gearSummary, sortGearRows, summaryLine, type GearCell, type GearRow, type GearSort } from "./gearMap";

const props = defineProps<{
  /** the account's roster cards (rosterCards): the set-up ones are the rows, in the roster's order */
  cards: ReadonlyArray<{ id: string; name: string; owned: boolean }>;
}>();

/** rows shown before "Show all" (a 40-character roster stays one screen-ish on a phone) */
const FOLD = 12;

const q = useInventoryQuality();
const root = ref<HTMLElement | null>(null);
const started = ref(false);
let stop: (() => void) | null = null;
let observer: IntersectionObserver | null = null;

function start(): void {
  if (started.value) return;
  started.value = true;
  observer?.disconnect();
  observer = null;
  stop = q.activate();
}

onMounted(() => {
  if (typeof IntersectionObserver === "undefined" || !root.value) return start();
  observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && start(), { rootMargin: "300px 0px" });
  observer.observe(root.value);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  stop?.();
});

const characters = computed(() => props.cards.filter((c) => c.owned).map((c) => ({ id: c.id, name: c.name })));

const rows = computed<GearRow[]>(() =>
  q.unavailable.value
    ? []
    : gearRows({
        characters: characters.value,
        verdicts: q.verdicts.value,
        labCharacters: q.characters.value,
        judged: q.judged.value,
        stale: q.stale.value,
        targets: q.targets.value,
        ratingFor: q.ratingFor,
      }),
);
const progress = computed(() => gearProgress(rows.value, q.judged.value));
const summary = computed(() => gearSummary(rows.value));

const state = computed<"idle" | "unavailable" | "working" | "ready" | "partial">(() => {
  if (!started.value) return "idle";
  if (q.unavailable.value) return "unavailable";
  if (progress.value.whole) return "ready";
  if (q.judged.value && q.ratingFailed.value) return "partial";
  return "working";
});
const workingText = computed(() => {
  if (!q.judged.value) return q.stale.value ? "Your echoes changed: Echo Lab is judging them again…" : "Echo Lab is judging your echoes…";
  return `Rating rolls: ${progress.value.rated} of ${progress.value.rateable} equipped echoes… The map shows when every one is in.`;
});

const sort = ref<GearSort>("roster");
const unfolded = ref(false);
const shownRows = computed(() => {
  const sorted = sortGearRows(rows.value, sort.value);
  return unfolded.value ? sorted : sorted.slice(0, FOLD);
});

const echoLink = (echoId: string) => ({ path: "/echo-lab", query: { echo: echoId } });

// ── the sheet (a phone) / popover (desktop): a modal <dialog>, so Escape and a phone's Back close it ──
const sheet = ref<HTMLDialogElement | null>(null);
const open = shallowRef<{ id: string; name: string; cell: GearCell } | null>(null);
let opener: HTMLElement | null = null;

function openCell(row: GearRow, cell: GearCell, e: MouseEvent): void {
  opener = e.currentTarget as HTMLElement;
  open.value = { id: row.id, name: row.name, cell };
  if (sheet.value && !sheet.value.open) sheet.value.showModal();
}
function closeSheet(): void {
  sheet.value?.close();
}
function onSheetClose(): void {
  open.value = null;
  opener?.focus();
  opener = null;
}
function onBackdrop(e: MouseEvent): void {
  if (e.target === sheet.value) closeSheet();
}
</script>

<style scoped>
.gm {
  margin-top: 1.25rem;
  border: 1px solid oklch(var(--bc) / 0.15);
  border-radius: var(--rounded-box, 1rem);
  background: oklch(var(--b1));
  padding: 0.9rem;
  min-width: 0;
}
.gm-title {
  font-size: 1.1rem;
  font-weight: 700;
}
.gm-lead {
  margin-top: 0.2rem;
  font-size: 0.875rem;
}
.gm-muted {
  color: oklch(var(--bc) / 0.78);
}
.gm-small {
  font-size: 0.8rem;
}
.gm-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.8rem;
  margin: 0.6rem 0 0.3rem;
  font-size: 0.8rem;
}
.gm-legend__item {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.gm-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  margin: 0.5rem 0;
}
.gm-summary {
  margin: 0.6rem 0;
  font-size: 0.875rem;
}
.gm-summary__line {
  font-weight: 600;
}
.gm-summary__bands {
  font-size: 0.8rem;
}
.gm-summary__sub {
  margin-top: 0.5rem;
}
.gm-weakest {
  margin-top: 0.25rem;
  display: grid;
  gap: 0.15rem;
}
.gm-weakest__link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 44px;
  padding: 0.2rem 0.35rem;
  border-radius: 0.5rem;
}
.gm-weakest__link > span:nth-child(2) {
  flex: 1;
  min-width: 0;
}
.gm-weakest__link:hover,
.gm-weakest__link:focus-visible {
  background: oklch(var(--b2));
}
.gm-sort {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  margin: 0.5rem 0;
  font-size: 0.8rem;
}
.gm-sort .btn {
  min-height: 2.75rem;
}
.gm-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0 4px;
}
.gm-who {
  width: 11rem;
  max-width: 11rem;
  text-align: left;
  font-weight: 500;
  padding-right: 0.4rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gm-who > * {
  vertical-align: middle;
}
.gm-who__name {
  margin-left: 6px;
  font-size: 0.85rem;
}
.gm-td {
  padding: 0 2px;
  min-width: 46px;
}
/* a phone: the name on a line of its own over the five cells, so the cells keep their 44 px and the name is whole */
@media (max-width: 640px) {
  .gm-table,
  .gm-table tbody {
    display: block;
  }
  .gm-row {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 4px;
    margin-bottom: 8px;
  }
  .gm-who {
    grid-column: 1 / -1;
    width: auto;
    max-width: none;
    padding: 0;
  }
  .gm-td {
    padding: 0;
    min-width: 0;
  }
}
.gm-cell {
  display: flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-width: 0;
  height: 44px;
  border-radius: 0.45rem;
  font-weight: 700;
  font-size: 0.95rem;
  border: 1px solid oklch(var(--bc) / 0.35);
}
button.gm-cell:focus-visible {
  outline: 3px solid oklch(var(--bc));
  outline-offset: 1px;
}
.gm-swatch {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 0.35rem;
  font-weight: 700;
  font-size: 0.8rem;
  border: 1px solid oklch(var(--bc) / 0.35);
}
.gm-swatch--sm {
  width: 1.4rem;
  height: 1.4rem;
}
/* Echo Lab's five bands: the theme's state colours with their own content colour (DaisyUI keeps those at AA) */
.gm-step--great {
  background: oklch(var(--su));
  color: oklch(var(--suc));
}
.gm-step--good {
  background: oklch(var(--in));
  color: oklch(var(--inc));
}
.gm-step--average {
  background: oklch(var(--n));
  color: oklch(var(--nc));
}
.gm-step--below {
  background: oklch(var(--wa));
  color: oklch(var(--wac));
}
.gm-step--poor {
  background: oklch(var(--er));
  color: oklch(var(--erc));
}
.gm-step--none,
.gm-step--unrated {
  background: oklch(var(--b2));
  color: oklch(var(--bc));
}
.gm-step--empty {
  background: transparent;
  border-style: dashed;
}
.gm-fold {
  text-align: center;
}
.gm-sheet {
  width: min(28rem, calc(100vw - 1.5rem));
  max-height: min(80vh, 40rem);
  padding: 0;
  border-radius: var(--rounded-box, 1rem);
  background: oklch(var(--b1));
  color: oklch(var(--bc));
  box-shadow: 0 10px 40px rgb(0 0 0 / 0.35);
}
.gm-sheet::backdrop {
  background: rgb(0 0 0 / 0.45);
}
@media (max-width: 640px) {
  .gm-sheet {
    width: 100vw;
    max-width: 100vw;
    margin: auto 0 0;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }
}
.gm-sheet__body {
  padding: 1rem;
  font-size: 0.875rem;
}
.gm-sheet__head {
  display: flex;
  gap: 0.6rem;
  align-items: flex-start;
}
.gm-sheet__head > .min-w-0 {
  flex: 1;
}
.gm-sheet__title {
  font-weight: 700;
  font-size: 1rem;
}
.gm-sheet__h {
  margin-top: 0.75rem;
  font-weight: 600;
}
.gm-facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
  margin-top: 0.6rem;
}
.gm-facts dt {
  font-size: 0.75rem;
  color: oklch(var(--bc) / 0.78);
}
.gm-facts dd {
  font-weight: 600;
  overflow-wrap: anywhere;
}
.gm-subs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 0.8rem;
  margin-top: 0.25rem;
}
.gm-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.9rem;
}
.gm-links .btn {
  min-height: 2.75rem;
}
@media (prefers-reduced-motion: no-preference) {
  .gm-cell {
    transition: transform 120ms;
  }
  button.gm-cell:active {
    transform: scale(0.96);
  }
}
</style>
