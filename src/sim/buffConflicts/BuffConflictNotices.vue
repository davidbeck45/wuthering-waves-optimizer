<template>
  <section v-if="shown.length || keptNote || failed || quietShown.length" class="bcn" :aria-label="HEADING" data-test-buff-conflicts>
    <p v-if="keptNote" ref="keptEl" class="bcn-status" role="status" tabindex="-1" data-test-buff-conflict-kept>
      Kept only {{ keptNote.kept }} on {{ nameOf(keptNote.characterId) }}; {{ keptNote.off }} is now off.
      <template v-if="keptNote.versionSaved">
        The build as it was is saved in
        <RouterLink :to="{ path: '/build-history', query: { char: keptNote.characterId } }" class="link" data-test-buff-conflict-history @click="emit('go')">Build history</RouterLink>, so you can put it back.
      </template>
      <template v-else>
        <RouterLink :to="{ path: '/build-history', query: { char: keptNote.characterId } }" class="link" data-test-buff-conflict-history @click="emit('go')">Build history</RouterLink>
        already held the build as it was.
      </template>
    </p>
    <p v-if="failed" class="bcn-status" role="status" data-test-buff-conflict-stale>That build has changed since it was checked, so nothing was switched off. Checking it again.</p>

    <article v-for="v in shown" :key="v.id" class="bcn-card" :data-test-buff-conflict="v.conflict.characterId" :data-conflict-build="v.conflict.active ? 'in-use' : 'saved'">
      <div class="bcn-card__head">
        <CharacterAvatar :id="v.conflict.characterId" :size="36" title="" />
        <div class="bcn-card__text">
          <component :is="`h${level}`" class="bcn-card__title" data-test-buff-conflict-headline>{{ conflictHeadline(v.conflict) }}</component>
          {{ " " }}
          <span data-test-buff-conflict-consequence>{{ conflictConsequence(v.conflict, v.figures) }}</span>
        </div>
      </div>

      <div v-if="v.figures" class="bcn-figs">
        <dl v-if="rowsOf(v).rotation" class="bcn-fig" data-test-buff-conflict-rotation>
          <div class="bcn-fig__title">{{ shortOf(v.conflict) }}'s best rotation</div>
          <div v-for="(row, i) in rowsOf(v).rotation!" :key="row.label" class="bcn-row" :class="{ 'bcn-row--saved': i === 0 }">
            <dt>{{ row.label }}</dt>
            <dd>
              <b>{{ row.text }}</b>
              <span v-if="row.change" class="bcn-row__change">{{ row.change }}</span>
            </dd>
          </div>
        </dl>
        <dl v-if="rowsOf(v).team" class="bcn-fig" data-test-buff-conflict-team>
          <div class="bcn-fig__title">Team {{ teamTitle(v.figures.team!.name, v.figures.team!.characterIds) }}</div>
          <div v-for="(row, i) in rowsOf(v).team!" :key="row.label" class="bcn-row" :class="{ 'bcn-row--saved': i === 0 }">
            <dt>{{ row.label }}</dt>
            <dd>
              <b>{{ row.text }}</b>
              <span v-if="row.change" class="bcn-row__change">{{ row.change }}</span>
            </dd>
          </div>
        </dl>
        <p v-else-if="v.figures.teamNote" class="bcn-note" data-test-buff-conflict-team-note>No team figure: {{ v.figures.teamNote }}.</p>
      </div>
      <p class="bcn-note">{{ FIGURE_BASIS }}</p>

      <details class="bcn-what">
        <summary>What each one does</summary>
        <p v-for="side in v.conflict.sides" :key="side.key">
          <b>{{ side.name }}</b><template v-if="side.stacks !== null"> (saved at {{ side.stacks }})</template>: {{ side.detail || "no description in the app." }}
        </p>
      </details>

      <p class="bcn-note" data-test-buff-conflict-choice>
        <template v-if="v.conflict.active">Nothing has been changed. Which one is right depends on how you play {{ shortOf(v.conflict) }}: keep one here, or open the calculator, where turning one on now turns the other off.</template>
        <template v-else>Nothing has been changed. Switch to that build in the calculator to turn one of them off there.</template>
      </p>
      <div class="bcn-actions">
        <button type="button" class="btn btn-sm btn-primary" :data-test-buff-conflict-open="v.conflict.characterId" @click="open(v.conflict)">Open {{ shortOf(v.conflict) }}'s {{ screenWord(v.conflict) }} in the calculator</button>
        <template v-if="v.conflict.active">
          <button v-for="i in SIDES" :key="i" type="button" class="btn btn-sm btn-outline" :disabled="busy" :data-test-buff-conflict-keep="i" @click="keep(v.conflict, i)">Keep only {{ sideLabels(v.conflict)[i] }}</button>
        </template>
      </div>
    </article>

    <details v-if="quietShown.length" class="bcn-quiet" data-test-buff-conflicts-quiet>
      <summary>{{ quietShown.length }} more pair{{ quietShown.length === 1 ? "" : "s" }} of buffs on together that move no figure</summary>
      <ul>
        <li v-for="v in quietShown" :key="v.id" :data-test-buff-conflict-quiet="v.conflict.characterId">
          {{ conflictHeadline(v.conflict) }} {{ conflictConsequence(v.conflict, v.figures) }}
          <button type="button" class="link" @click="open(v.conflict)">Open {{ shortOf(v.conflict) }}'s {{ screenWord(v.conflict) }} in the calculator</button>
        </li>
      </ul>
    </details>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+ — the notice for builds with two buffs on that the game does not allow together (Ryan's
// `mutuallyExclusiveWith`): who, which two, what the figures read as saved and with only the one or only the other, and
// the way to fix it. On /account's top it lists every such build; with `characterId` (the drawer, a /my-rankings row)
// only that character's. It shows the pairs the engine really counts twice; the pairs that are on together and move no
// figure fold under one quiet line (`quiet`). Nothing is written unless the player taps Keep only.
import { computed, nextTick, ref } from "vue";
import { useRouter } from "vue-router";
import { useCharacterStore } from "../../stores/character";
import CharacterAvatar from "../display/CharacterAvatar.vue";
import { characterDisplayName, characterShortName } from "../display/names";
import { teamTitle } from "../display/teamName";
import { conflictScreen, sideLabels, type BuffConflict } from "./buffConflicts";
import { FIGURE_BASIS, conflictConsequence, conflictHeadline, figureRows, type FigureRow } from "./conflictText";
import { useBuffConflicts, type ConflictView } from "./useBuffConflicts";

const HEADING = "Buffs that cannot be on together";
const SIDES = [0, 1] as const;

const props = withDefaults(
  defineProps<{
    /** only this character's pairs (the drawer, a /my-rankings row); all of them without it */
    characterId?: string | null;
    /** also list, folded, the pairs that move no figure */
    quiet?: boolean;
    /** heading level of each notice's sentence */
    level?: 2 | 3 | 4;
  }>(),
  { characterId: null, quiet: false, level: 3 },
);
const emit = defineEmits<{
  /** a build was changed by Keep only: the page scores again */
  changed: [];
  /** about to leave for another page (the drawer closes) */
  go: [];
}>();

const state = useBuffConflicts();
const router = useRouter();
const characterStore = useCharacterStore();
const mine = (v: ConflictView): boolean => !props.characterId || v.conflict.characterId === props.characterId;
const shown = computed(() => state.counted.value.filter(mine));
const quietShown = computed(() => (props.quiet ? state.quiet.value.filter(mine) : []));
const keptNote = computed(() => (state.kept.value && (!props.characterId || state.kept.value.characterId === props.characterId) ? state.kept.value : null));

const nameOf = (id: string): string => characterDisplayName(id) || id;
const shortOf = (c: BuffConflict): string => characterShortName(c.characterId) || nameOf(c.characterId);
const screenWord = (c: BuffConflict): string => (conflictScreen(c) === "weapon" ? "weapon" : "buffs");
const rowsOf = (v: ConflictView): { rotation: FigureRow[] | null; team: FigureRow[] | null } => (v.figures ? figureRows(v.conflict, v.figures) : { rotation: null, team: null });

/** The calculator on that character, on the section that holds the two switches. */
function open(c: BuffConflict): void {
  characterStore.setActiveCharacter(c.characterId);
  emit("go");
  void router.push({ path: "/", query: { screen: conflictScreen(c) } });
}

const busy = ref(false);
const failed = ref(false);
const keptEl = ref<HTMLElement | null>(null);
async function keep(c: BuffConflict, side: 0 | 1): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  failed.value = false;
  try {
    const ok = await state.keepOnly(c, side);
    if (ok) {
      emit("changed");
      // the button that was pressed goes with its notice: focus lands on the line that says what happened, not nowhere
      await nextTick();
      keptEl.value?.focus({ preventScroll: true });
    } else failed.value = true;
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.bcn {
  display: grid;
  gap: 0.6rem;
  min-width: 0;
}
.bcn-card {
  display: grid;
  gap: 0.6rem;
  min-width: 0;
  padding: 0.8rem 0.9rem;
  border-radius: 0.8rem;
  text-align: left;
  color: oklch(var(--bc));
  background: color-mix(in oklab, oklch(var(--wa)) 9%, oklch(var(--b1)));
  box-shadow:
    inset 0 0 0 1px oklch(var(--wa) / 0.45),
    inset 4px 0 0 0 oklch(var(--wa));
}
.bcn-card__head {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  min-width: 0;
}
.bcn-card__text {
  min-width: 0;
  font-size: 0.85rem;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.bcn-card__title {
  display: inline;
  font-size: inherit;
  font-weight: 700;
}
.bcn-figs {
  display: grid;
  gap: 0.6rem;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr));
  min-width: 0;
}
.bcn-fig {
  display: grid;
  gap: 0.15rem;
  min-width: 0;
  margin: 0;
  padding: 0.5rem 0.65rem;
  border-radius: 0.55rem;
  background: oklch(var(--b1) / 0.7);
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.08);
}
.bcn-fig__title {
  font-size: 0.72rem;
  font-weight: 700;
  color: oklch(var(--bc) / 0.75);
  overflow-wrap: anywhere;
}
.bcn-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 0.1rem 0.75rem;
  padding: 0.2rem 0;
  font-size: 0.82rem;
}
.bcn-row + .bcn-row {
  border-top: 1px solid oklch(var(--bc) / 0.08);
}
.bcn-row dt {
  min-width: 0;
  overflow-wrap: anywhere;
}
.bcn-row dd {
  display: grid;
  justify-items: end;
  margin: 0;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.bcn-row--saved dd b {
  color: oklch(var(--bc) / 0.75);
}
.bcn-row__change {
  font-size: 0.72rem;
  color: oklch(var(--bc) / 0.72);
}
.bcn-note,
.bcn-status {
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.45;
  color: oklch(var(--bc) / 0.72);
  overflow-wrap: anywhere;
}
.bcn-status:focus-visible {
  outline: 2px solid oklch(var(--p));
  outline-offset: 2px;
}
.bcn-status {
  padding: 0.6rem 0.8rem;
  border-radius: 0.7rem;
  font-size: 0.8rem;
  color: oklch(var(--bc));
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.1);
}
.bcn-what,
.bcn-quiet {
  font-size: 0.78rem;
  line-height: 1.45;
  min-width: 0;
}
.bcn-what > summary,
.bcn-quiet > summary {
  cursor: pointer;
  font-weight: 600;
  color: oklch(var(--bc) / 0.8);
}
.bcn-what p {
  margin: 0.35rem 0 0;
  overflow-wrap: anywhere;
}
.bcn-quiet {
  padding: 0.5rem 0.8rem;
  border-radius: 0.7rem;
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.07);
}
.bcn-quiet ul {
  display: grid;
  gap: 0.5rem;
  margin: 0.5rem 0 0.15rem;
  padding: 0;
  list-style: none;
  overflow-wrap: anywhere;
}
.bcn-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  min-width: 0;
}
.bcn-actions .btn {
  height: auto;
  min-height: 2rem;
  max-width: 100%;
  padding-top: 0.35rem;
  padding-bottom: 0.35rem;
  line-height: 1.25;
  white-space: normal;
  text-align: center;
}
@media (max-width: 767px) {
  .bcn-actions .btn {
    flex: 1 1 100%;
    min-height: 40px;
  }
  .bcn-what > summary,
  .bcn-quiet > summary {
    display: flex;
    align-items: center;
    min-height: 40px;
  }
  .bcn-quiet .link {
    display: inline-block;
    padding: 0.55rem 0;
  }
}
</style>
