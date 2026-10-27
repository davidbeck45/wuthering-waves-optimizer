<template>
  <!-- a Sonata with no plan, or one already set in game: a compact tile, its grid on demand -->
  <article
    v-if="compact"
    class="flex min-w-0 items-center gap-2.5 rounded-box border bg-base-100 px-3 py-2.5"
    :class="progress.status === 'done' ? 'ep-card--done' : progress.status === 'changed' ? 'ep-card--changed' : 'border-dashed border-base-300'"
    :data-test-echo-plan-card="card.set"
    :data-test-echo-plan-state="card.state"
    :data-test-echo-plan-status="progress.status"
    data-test-echo-plan-compact>
    <img
      v-if="card.icon"
      :src="card.icon"
      :alt="''"
      class="size-9 shrink-0 rounded-lg bg-base-200 p-0.5"
      :class="card.state === 'off' ? 'opacity-80' : ''"
      loading="lazy"
      decoding="async" />
    <div class="min-w-0 flex-1">
      <div class="flex min-w-0 items-center gap-1.5">
        <h3 class="truncate text-sm font-semibold" :title="card.name">{{ card.name }}</h3>
        <span v-if="progress.isNew" class="ep-badge ep-badge--new">New</span>
      </div>
      <p class="truncate text-xs opacity-60">{{ compactLine }}</p>
    </div>
    <label
      v-if="progress.status !== 'idle'"
      class="flex shrink-0 cursor-pointer flex-col items-center gap-0.5 rounded-lg px-1 py-0.5 hover:bg-base-200"
      :title="progress.status === 'done' ? 'Set in game — untick if you change it' : 'Tick once this Sonata is set in game'">
      <input
        type="checkbox"
        class="checkbox checkbox-success checkbox-sm"
        :checked="progress.status === 'done'"
        :data-test-echo-plan-done="card.set"
        @change="emit('toggle-done', card.set)" />
      <span class="text-[0.65rem] font-semibold leading-tight opacity-70">Done</span>
    </label>
    <button
      type="button"
      class="btn btn-ghost btn-xs shrink-0"
      :aria-label="`Show the ${card.name} grid`"
      :data-test-echo-plan-expand="card.set"
      @click="expanded = true">
      Grid
    </button>
  </article>

  <article
    v-else
    class="flex min-w-0 flex-col rounded-box border bg-base-100 shadow-sm"
    :class="[
      progress.status === 'changed' ? 'ep-card--changed' : progress.status === 'done' ? 'ep-card--done' : 'border-base-300',
      expanded ? 'col-span-full' : '',
      card.state === 'off' ? 'border-dashed' : '',
    ]"
    :data-test-echo-plan-card="card.set"
    :data-test-echo-plan-state="card.state"
    :data-test-echo-plan-status="progress.status">
    <header class="flex items-start gap-3 px-3 pt-3 pb-2">
      <img v-if="card.icon" :src="card.icon" :alt="''" class="size-11 shrink-0 rounded-lg bg-base-200 p-0.5" loading="lazy" decoding="async" />
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 class="font-bold leading-tight" data-test-echo-plan-card-name>{{ card.name }}</h3>
          <span v-if="progress.isNew" class="ep-badge ep-badge--new" title="A Sonata this page had not shown before">New</span>
          <span v-if="progress.status === 'changed'" class="ep-badge ep-badge--changed" data-test-echo-plan-changed>Changed</span>
          <span v-if="card.state === 'thrown'" class="ep-badge ep-badge--thrown" title="Nobody on your roster uses this Sonata">Discard all</span>
          <span v-if="card.state === 'off'" class="ep-badge ep-badge--muted">No plan</span>
        </div>
        <p v-if="card.appName" class="text-xs opacity-60">“{{ card.appName }}” in the calculator</p>
        <div class="mt-1.5 flex min-w-0 items-center gap-2">
          <div v-if="card.characters.length" class="flex shrink-0 -space-x-1.5" :title="whoTitle">
            <img
              v-for="key in card.characters.slice(0, AVATARS)"
              :key="key"
              :src="characterPortraitUrl(key)"
              :alt="characterName(key)"
              class="size-6 rounded-full border-2 border-base-100 bg-base-300 object-cover"
              loading="lazy"
              decoding="async" />
            <span
              v-if="card.characters.length > AVATARS"
              class="grid size-6 place-items-center rounded-full border-2 border-base-100 bg-base-300 text-[0.6rem] font-bold">
              +{{ card.characters.length - AVATARS }}
            </span>
          </div>
          <span class="min-w-0 truncate text-xs opacity-70">
            <template v-if="card.state === 'planned'"><b class="ep-text-keep tabular-nums">{{ card.keepCount }}</b> to lock</template>
            <template v-else>Nobody uses it</template>
            <template v-if="card.overridden"> · {{ card.overridden }} set by you</template>
          </span>
        </div>
      </div>
      <div class="flex shrink-0 items-start gap-1">
        <label
          v-if="card.state !== 'off' || progress.status !== 'idle'"
          class="flex cursor-pointer flex-col items-center gap-0.5 rounded-lg px-1.5 py-1 hover:bg-base-200"
          :title="progress.status === 'done' ? 'Set in game — untick if you change it' : 'Tick once this Sonata is set in game'">
          <input
            type="checkbox"
            class="checkbox checkbox-success checkbox-sm"
            :checked="progress.status === 'done'"
            :data-test-echo-plan-done="card.set"
            @change="emit('toggle-done', card.set)" />
          <span class="text-[0.65rem] font-semibold leading-tight opacity-70">Done</span>
        </label>
        <button v-if="expanded" type="button" class="btn btn-ghost btn-xs" :aria-label="`Hide the ${card.name} grid`" data-test-echo-plan-collapse @click="expanded = false">Hide</button>
      </div>
    </header>

    <p v-if="progress.status === 'changed'" class="mx-3 mb-2 rounded-lg bg-warning/10 px-2.5 py-1.5 text-xs leading-snug" data-test-echo-plan-change-note>
      <span class="ep-text-changed font-semibold">Since you ticked it:</span>
      <template v-if="progress.stateChanged && card.state === 'off'"> nobody uses it any more — turn its plan off.</template>
      <template v-else-if="progress.stateChanged && progress.from?.state === 'off'"> it has a plan now.</template>
      <template v-if="progress.nowKept.length"> lock {{ labelsOf(progress.nowKept) }}.</template>
      <template v-if="progress.nowDiscarded.length"> discard {{ labelsOf(progress.nowDiscarded) }}.</template>
    </p>
    <p v-else-if="card.state === 'off'" class="mx-3 mb-2 text-xs opacity-70">
      Nobody on your roster uses this Sonata, so it has no plan and the game leaves its echoes alone. Tap a main stat to lock or
      discard it anyway.
    </p>

    <div class="flex flex-col gap-2 border-t border-base-300 px-3 py-2.5">
      <div v-for="row in card.rows" :key="row.cost" class="flex gap-x-2 gap-y-1 max-sm:flex-col" :data-test-echo-plan-row="row.cost">
        <div class="w-14 shrink-0 pt-1.5 text-[0.65rem] font-bold uppercase tracking-wider opacity-55 max-sm:pt-0">Cost {{ row.cost }}</div>
        <div class="flex min-w-0 flex-wrap gap-1.5">
          <button
            v-for="chip in row.chips"
            :key="chip.id"
            type="button"
            class="ep-chip"
            :class="[chip.verdict === 'keep' ? 'ep-chip--keep' : chip.verdict === 'discard' ? 'ep-chip--discard' : 'ep-chip--off', moved.has(chip.id) ? 'ep-chip--moved' : '']"
            :title="chipTitle(chip)"
            :aria-label="`COST ${chip.cost} ${chip.label}: ${verdictWord(chip)}. Details`"
            :data-test-echo-plan-chip="chip.id"
            :data-test-echo-plan-verdict="chip.verdict ?? 'off'"
            @click="emit('chip', card.set, chip.id)">
            <svg v-if="chip.verdict === 'keep'" viewBox="0 0 16 16" class="size-3 shrink-0" fill="currentColor" aria-hidden="true">
              <path d="M8 1.5a3 3 0 0 0-3 3V6h-.5A1.5 1.5 0 0 0 3 7.5v5A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11.5 6H11V4.5a3 3 0 0 0-3-3Zm1.75 4.5h-3.5V4.5a1.75 1.75 0 1 1 3.5 0V6Z" />
            </svg>
            <span v-if="row.cost === 3 && isElement(chip.main)" class="ep-dot" :class="`ep-dot--${chip.main}`" aria-hidden="true"></span>
            {{ chip.short }}
            <span v-if="chip.override" class="ep-chip__pin" aria-hidden="true"></span>
          </button>
        </div>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
// Wuthering Tools+ /echo-plan — one Sonata of the Echo Management grid: its COST rows of lock / discard chips,
// who wants it, and the "done in game" tick. A Sonata nobody uses is a compact tile until its grid is asked for.
import { computed, ref } from "vue";
import { ELEMENTS, MAIN_LABEL, parseChipId, type ChipId, type MainKey } from "./catalog";
import type { CardProgress } from "./diff";
import { characterName, characterPortraitUrl, characterShortName } from "./names";
import type { PlanChip, SonataCard } from "./plan";

const AVATARS = 6;

const props = defineProps<{ card: SonataCard; progress: CardProgress }>();
const emit = defineEmits<{ (e: "chip", set: string, chip: ChipId): void; (e: "toggle-done", set: string): void }>();

const expanded = ref(false);
/** a Sonata with no plan, or one already set in game, folds to a tile until its grid is asked for */
const compact = computed(() => !expanded.value && (props.progress.status === "done" || (props.card.state === "off" && props.progress.status === "idle")));
const compactLine = computed(() => {
  const { card, progress } = props;
  if (card.state === "off") return progress.status === "done" ? "No plan · done" : "Nobody uses it";
  return card.state === "thrown" ? "Set in game · discard all" : `Set in game · ${card.keepCount} locked`;
});
const moved = computed(() => new Set<ChipId>(props.progress.status === "changed" ? [...props.progress.nowKept, ...props.progress.nowDiscarded] : []));
const whoTitle = computed(() => `Wanted by ${props.card.characters.map(characterName).join(", ")}`);

const isElement = (main: MainKey): boolean => (ELEMENTS as readonly string[]).includes(main);

function labelsOf(ids: ChipId[]): string {
  return ids
    .map((id) => parseChipId(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => `COST ${c.cost} ${MAIN_LABEL[c.main]}`)
    .join(", ");
}

function verdictWord(chip: PlanChip): string {
  return chip.verdict === "keep" ? "lock" : chip.verdict === "discard" ? "discard" : "no plan";
}

function chipTitle(chip: PlanChip): string {
  const head = `COST ${chip.cost} ${chip.label} — ${verdictWord(chip)}`;
  if (chip.reason === "override") return `${head} (your choice)`;
  if (chip.wantedBy.length) return `${head}: ${chip.wantedBy.map((w) => characterShortName(w.character)).join(", ")}`;
  if (chip.reason === "critPair") return `${head} (pairs with the wanted crit 4-cost)`;
  if (chip.reason === "keepAll4") return `${head} (keep every 4-cost)`;
  return head;
}
</script>
