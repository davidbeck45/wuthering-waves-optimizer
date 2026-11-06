<template>
  <Teleport to="body">
    <!-- keys stop here: over /rankings Riley's document-level handlers would otherwise take the arrows from the sheet -->
    <dialog ref="dialog" class="an" aria-labelledby="an-title" data-test-anatomy-sheet @close="onDialogClose" @click="onBackdrop" @keydown.stop>
      <div v-if="request" class="an__inner" :style="{ '--an-el': elementTint }">
        <header class="an__head">
          <CharacterAvatar :id="request.characterId" :size="44" dot title="" />
          <div class="an__who">
            <h2 id="an-title" class="an__title">Why this number</h2>
            <p class="an__name">{{ name }}</p>
          </div>
          <button type="button" class="an__close" aria-label="Close" data-test-anatomy-close @click="close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-5" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" /></svg>
          </button>
        </header>

        <p v-if="error" class="an__problem" role="alert" data-test-anatomy-error>{{ error }}</p>

        <div v-else-if="!run" class="an__wait" role="status" data-test-anatomy-loading>
          <span class="loading loading-spinner loading-sm" aria-hidden="true"></span>
          <span>Running {{ name }}'s rotation through the calculator…</span>
        </div>

        <template v-else>
          <section class="an__figure" data-test-anatomy-figure>
            <p class="an__big" data-test-anatomy-total>{{ fmt(run.model.average) }}</p>
            <p class="an__unit">average damage per rotation, in this app's calculator, {{ enemyLine(RANKING_ENEMY) }}</p>
            <label v-if="choices.length > 1" class="an-field">
              <span class="an-field__label">Rotation</span>
              <select v-model="rotationId" class="select select-bordered select-sm an-field__select" data-test-anatomy-rotation @change="onRotation">
                <option v-for="c in choices" :key="c.rotation.id" :value="c.rotation.id">{{ compact(c.average) }} · {{ rotationTitle(c.name, owned) }}</option>
              </select>
            </label>
            <p v-else class="an__rotation" :title="run.input.rotation.name">{{ rotationTitle(run.input.rotation.name, owned) }}</p>
            <p class="an__intro">Where this figure comes from: the attacks that add up to it, one hit opened into the factors of the damage formula, and which factor moves it most.</p>
          </section>

          <p v-if="!run.model.hits.length" class="an__problem" data-test-anatomy-empty>This rotation deals no damage on this build, so there is nothing to open up.</p>

          <template v-else>
            <section class="an__section" data-test-anatomy-shares>
              <div class="an__row">
                <h3 class="an__h3">Where the damage comes from</h3>
                <div class="an-seg" role="group" aria-label="Group the damage">
                  <button type="button" class="an-seg__btn" :aria-pressed="by === 'type'" data-test-anatomy-by="type" @click="by = 'type'">By skill type</button>
                  <button type="button" class="an-seg__btn" :aria-pressed="by === 'attack'" data-test-anatomy-by="attack" @click="by = 'attack'">By attack</button>
                </div>
              </div>
              <p class="an__note">Share of the average above. Pick a row to open its biggest hit.</p>
              <ul class="an-shares">
                <li v-for="row in shownShares" :key="row.key">
                  <button type="button" class="an-share" :aria-current="row.hitId === hitId ? 'true' : undefined" :data-test-anatomy-share="row.key" @click="openHit(row.hitId)">
                    <span class="an-share__name">{{ row.label }}<template v-if="by === 'attack' && row.times > 1"> <small>× {{ row.times }}</small></template></span>
                    <span class="an-share__pct">{{ shareText(row.share) }}</span>
                    <span class="an-share__dmg">{{ compact(row.average) }}</span>
                    <span class="an-share__track" aria-hidden="true"><i :style="{ width: `${(row.share / maxShare) * 100}%` }"></i></span>
                  </button>
                </li>
              </ul>
              <button v-if="hiddenShares > 0" type="button" class="btn btn-ghost btn-xs an__more" data-test-anatomy-show-all @click="showAll = true">Show all {{ shares.length }} attacks</button>
              <p v-if="leftOut" class="an__note" data-test-anatomy-left-out>{{ leftOut }}</p>
              <p v-if="!run.model.reconciled" class="an__note" data-test-anatomy-unlisted>These lines don't add up to the calculator's total for the rotation, so part of it isn't listed here.</p>
            </section>

            <section ref="hitSection" class="an__section" data-test-anatomy-hit>
              <h3 class="an__h3">One hit, opened up</h3>
              <label class="an-field">
                <span class="an-field__label">Hit</span>
                <select v-model="hitId" class="select select-bordered select-sm an-field__select" data-test-anatomy-hit-select>
                  <option v-for="(h, i) in run.model.hits" :key="h.id" :value="h.id">{{ hitOption(h, i === 0) }}</option>
                </select>
              </label>
              <template v-if="hit && anatomy">
                <p class="an__note" data-test-anatomy-hit-meta>{{ hitMeta(hit) }}</p>
                <ol class="an-bill" data-test-anatomy-bill>
                  <li v-for="(f, i) in anatomy.factors" :key="f.id" class="an-f" :data-test-anatomy-factor="f.id">
                    <span class="an-f__name"><span v-if="i > 0" class="sr-only">times </span>{{ f.label }}</span>
                    <span class="an-f__value" data-test-anatomy-factor-value>{{ f.value }}</span>
                    <span class="an-f__what">{{ f.what }}</span>
                    <span v-if="f.detail" class="an-f__detail">{{ f.detail }}</span>
                  </li>
                  <li class="an-f an-f--sum" data-test-anatomy-noncrit>
                    <span class="an-f__name">Non-crit hit</span>
                    <span class="an-f__value">{{ fmt(anatomy.nonCrit) }}</span>
                  </li>
                  <li v-if="anatomy.critFactor" class="an-f" data-test-anatomy-factor="crit">
                    <span class="an-f__name">Crit</span>
                    <span class="an-f__value">× {{ anatomy.critFactor.times.toFixed(3) }}</span>
                    <span class="an-f__what">{{ critWords(anatomy.critFactor, anatomy.crit) }}</span>
                  </li>
                  <li class="an-f an-f--sum an-f--main" data-test-anatomy-average>
                    <span class="an-f__name">Average hit</span>
                    <span class="an-f__value">{{ fmt(anatomy.average) }}</span>
                  </li>
                  <li v-if="hit.times > 1" class="an-f" data-test-anatomy-times>
                    <span class="an-f__name">× {{ hit.times }} in this rotation</span>
                    <span class="an-f__value">{{ fmt(hit.total) }}</span>
                  </li>
                </ol>
                <p v-if="anatomy.neutral.length" class="an__note" data-test-anatomy-neutral>At × 1 on this hit, so they change nothing: {{ anatomy.neutral.map((f) => f.label).join(", ") }}.</p>
                <p v-if="anatomy.note" class="an__notice" data-test-anatomy-note>{{ anatomy.note }}</p>
                <p v-else class="an__check" data-test-anatomy-reconciled>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="size-4 shrink-0" aria-hidden="true"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" /></svg>
                  <span>{{ anatomy.kind === "fixed" ? "A fixed amount, as the calculator gives it." : "Checked: these factors multiply back to the calculator's own figure for this hit." }}</span>
                </p>
              </template>
            </section>

            <section class="an__section" data-test-anatomy-moves>
              <div class="an__row">
                <h3 class="an__h3">What moves this number most</h3>
                <div v-if="moves?.rows.length" class="an-seg" role="group" aria-label="Sort the steps by">
                  <button type="button" class="an-seg__btn" :aria-pressed="sortBy === 'hit'" data-test-anatomy-sort="hit" @click="sortBy = 'hit'">This hit</button>
                  <button type="button" class="an-seg__btn" :aria-pressed="sortBy === 'rotation'" data-test-anatomy-sort="rotation" @click="sortBy = 'rotation'">Rotation</button>
                </div>
              </div>
              <p class="an__note">Each factor one step up, run through the calculator on a copy of this build. A step is one mid substat roll where the game has that substat, a skill level or a stack, otherwise a +{{ BUFF_STEP }} % buff.</p>
              <div v-if="movesLoading" class="an__wait an__wait--small" role="status" data-test-anatomy-moves-loading>
                <span class="loading loading-spinner loading-xs" aria-hidden="true"></span>
                <span>Running each step…</span>
              </div>
              <template v-else-if="moves">
                <ol v-if="sortedMoves.length" class="an-moves">
                  <li v-for="(m, i) in sortedMoves" :key="m.id" class="an-m" :data-test-anatomy-move="m.id">
                    <span class="an-m__rank" aria-hidden="true">{{ i + 1 }}</span>
                    <span class="an-m__name">{{ m.label }}<small>{{ m.step }}</small></span>
                    <span class="an-m__gain" :class="{ 'an-m__gain--lead': sortBy === 'hit' }"><b>{{ gainText(m.hitGain) }}</b><small>this hit</small></span>
                    <span class="an-m__gain" :class="{ 'an-m__gain--lead': sortBy === 'rotation' }"><b>{{ gainText(m.rotationGain) }}</b><small>rotation</small></span>
                    <span class="an-m__track" aria-hidden="true"><i :style="{ width: `${moveWidth(m)}%` }"></i></span>
                  </li>
                </ol>
                <p v-else class="an__note" data-test-anatomy-no-moves>Nothing moves this hit: {{ anatomy?.kind === "fixed" ? "it is a set amount." : "the calculator gives it as one figure." }}</p>
                <p v-if="moves.flat.length" class="an__note" data-test-anatomy-flat>No effect on this hit: {{ moves.flat.map((m) => m.label).join(", ") }}.</p>
              </template>
            </section>
          </template>
        </template>
      </div>
    </dialog>
  </Teleport>
</template>

<script setup lang="ts">
// Wuthering Tools+ "Why this number": one sheet for one character on one rotation. Everything on it is an engine figure:
// the rotation runs through calcCharacterRotationDamage (anatomyRun.ts), the tables and the hit's factors are read off
// the engine's own rows (anatomy.ts, reconciled to float precision), and each step is one more engine run on a clone.
// On the main thread with a pause between runs, as /my-rankings' Substats panel is: a dozen runs of one rotation.
import { computed, nextTick, ref, shallowRef, watch } from "vue";
import { useRoute } from "vue-router";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import CharacterAvatar from "../display/CharacterAvatar.vue";
import { characterDisplayName, characterMeta, elementColor } from "../display/names";
import { compact, fmt } from "../myRankings/format";
import { RANKING_ENEMY, rotationCandidates, type RotationCandidate } from "../myRankings/rankRoster";
import { scrollBehavior } from "../a11y/shellA11y";
import { hitAnatomy } from "./anatomy";
import { BUFF_STEP, movesOf, openRotation, rotationChoices, type AnatomyRun, type MoveRow, type Moves, type RotationChoice } from "./anatomyRun";
import { critWords, enemyLine, gainText, hitMeta, hitOption, leftOutLine, rotationTitle, shareText, sortMoves, type MoveSort } from "./anatomyView";
import type { AnatomyRequest } from "./anatomyRequest";

/** rows of the by-attack table before "Show all" */
const SHARE_ROWS = 6;

const route = useRoute();
const characterStore = useCharacterStore() as unknown as { characters: Record<string, any> };
const inventoryStore = useInventoryStore() as unknown as { echoes: any[] };

const dialog = ref<HTMLDialogElement | null>(null);
const hitSection = ref<HTMLElement | null>(null);
const request = shallowRef<AnatomyRequest | null>(null);
const run = shallowRef<AnatomyRun | null>(null);
const choices = shallowRef<RotationChoice[]>([]);
const rotationId = ref("");
/** the account's character keys: a stock name's Rover reads as the gender the account holds */
const owned = shallowRef<string[]>([]);
const error = ref<string | null>(null);
const by = ref<"type" | "attack">("type");
const showAll = ref(false);
const hitId = ref<string | null>(null);
const moves = shallowRef<Moves | null>(null);
const movesLoading = ref(false);
const sortBy = ref<MoveSort>("hit");

/** the account as it was when the sheet opened: plain data, so the engine and the clones never touch the stores */
let account: { characters: Record<string, any>; echoes: any[] } = { characters: {}, echoes: [] };
/** a newer request or rotation makes an older run's answer stale; a newer hit, an older hit's steps */
let token = 0;
let movesToken = 0;
const STALE = Symbol("stale");

const name = computed(() => characterDisplayName(request.value?.characterId) || request.value?.characterId || "");
const elementTint = computed(() => elementColor(characterMeta(request.value?.characterId)?.element));
const leftOut = computed(() => (run.value ? leftOutLine(run.value.model.leftOut) : null));

const shares = computed(() => (by.value === "type" ? run.value?.model.byType : run.value?.model.byAttack) ?? []);
const shownShares = computed(() => (showAll.value || by.value === "type" ? shares.value : shares.value.slice(0, SHARE_ROWS)));
const hiddenShares = computed(() => shares.value.length - shownShares.value.length);
const maxShare = computed(() => Math.max(...shares.value.map((r) => r.share), 0.0001));

const hit = computed(() => run.value?.model.hits.find((h) => h.id === hitId.value) ?? null);
const anatomy = computed(() => (hit.value ? hitAnatomy(hit.value.line) : null));

const sortedMoves = computed(() => sortMoves(moves.value?.rows ?? [], sortBy.value));
const moveGain = (m: MoveRow): number => (sortBy.value === "hit" ? m.hitGain : m.rotationGain);
const moveWidth = (m: MoveRow): number => {
  const top = Math.max(...sortedMoves.value.map(moveGain), 0.000001);
  return Math.max(0, (moveGain(m) / top) * 100);
};

const pace = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** What went wrong, for the console; a sentence for the player. */
function problemWith(err: unknown): string {
  console.error("Why this number:", err);
  return `The calculator couldn't finish ${name.value}'s rotation. Close this and try again.`;
}

async function showRotation(rotation: RotationCandidate["rotation"], mine: number): Promise<void> {
  const id = request.value!.characterId;
  const opened = await openRotation({ characterId: id, characters: account.characters, echoes: account.echoes, enemy: RANKING_ENEMY, rotation });
  if (mine !== token) return;
  run.value = opened;
  showAll.value = false;
  moves.value = null;
  hitId.value = opened.model.hits[0]?.id ?? null;
}

/** The rotation the figure on screen came from, drawn first; the select fills in behind it. Two rotations of one name
 *  wait for the scores, as the ranking kept the better one. Without a name, the best. */
async function open(next: AnatomyRequest): Promise<void> {
  token += 1;
  const mine = token;
  request.value = next;
  run.value = null;
  choices.value = [];
  error.value = null;
  moves.value = null;
  hitId.value = null;
  sortBy.value = "hit";
  await nextTick();
  if (dialog.value && !dialog.value.open) dialog.value.showModal();
  await pace(); // the sheet paints its spinner before the first engine run
  if (mine !== token) return;
  const id = next.characterId;
  try {
    account = { characters: JSON.parse(JSON.stringify(characterStore.characters ?? {})), echoes: JSON.parse(JSON.stringify(inventoryStore.echoes ?? [])) };
    owned.value = Object.keys(account.characters);
    const same = next.rotationName ? (await rotationCandidates(id, account.characters[id] ?? {})).filter((c) => c.name === next.rotationName) : [];
    if (mine !== token) return;
    const named: RotationCandidate | null = same.length === 1 ? same[0]! : null;
    if (named) {
      rotationId.value = named.rotation.id;
      await showRotation(named.rotation, mine);
    }
    // a closed sheet stops at its next pause: a phone's main thread doesn't go on scoring rotations nobody will read
    const list = await rotationChoices(id, account.characters, account.echoes, RANKING_ENEMY, {
      pace: async () => {
        await pace();
        if (mine !== token) throw STALE;
      },
    });
    if (mine !== token) return;
    choices.value = list;
    if (!named) {
      const best = list.find((c) => c.name === next.rotationName) ?? list[0];
      if (!best) {
        error.value = `No rotation scores on ${name.value}'s build yet. Give them a weapon and a rotation in the calculator.`;
        return;
      }
      rotationId.value = best.rotation.id;
      await showRotation(best.rotation, mine);
    }
  } catch (err) {
    if (mine === token) error.value = problemWith(err);
  }
}

async function onRotation(): Promise<void> {
  const choice = choices.value.find((c) => c.rotation.id === rotationId.value);
  if (!choice) return;
  token += 1;
  const mine = token;
  try {
    await showRotation(choice.rotation, mine);
  } catch (err) {
    if (mine === token) error.value = problemWith(err);
  }
}

function openHit(id: string): void {
  hitId.value = id;
  hitSection.value?.scrollIntoView({ block: "start", behavior: scrollBehavior() });
}

/** Run every step of the hit on show (a step's engine run is shared by the rotation's other hits). Keyed on the run as
 *  well: two rotations can open on the same action id. A newer pick stops this one at its next pause. */
watch([run, hitId], async () => {
  movesToken += 1;
  const mine = movesToken;
  const current = run.value;
  const chosen = hit.value;
  moves.value = null;
  movesLoading.value = Boolean(current && chosen);
  if (!current || !chosen) return;
  try {
    const answer = await movesOf(current, chosen, {
      pace: async () => {
        await pace();
        if (mine !== movesToken) throw STALE;
      },
    });
    if (mine === movesToken) moves.value = answer;
  } catch (err) {
    if (err !== STALE && mine === movesToken) error.value = problemWith(err);
  } finally {
    if (mine === movesToken) movesLoading.value = false;
  }
});

// the page changed under the sheet (a phone's back gesture): the figure it explains has gone. The path, not the full
// address: /rankings rewrites its hash as the table moves
watch(() => route.path, close);

function close(): void {
  dialog.value?.close();
}
function onDialogClose(): void {
  token += 1;
  request.value = null;
  run.value = null;
}
/** a click on the dialog box itself (outside .an__inner) is a click on the backdrop */
function onBackdrop(event: MouseEvent): void {
  if (event.target === dialog.value) close();
}

defineExpose({ open });
</script>

<style scoped>
.an {
  margin: 0 0 0 auto;
  width: min(36rem, 100vw);
  max-width: 100vw;
  height: 100dvh;
  max-height: 100dvh;
  padding: 0;
  border: none;
  color: oklch(var(--bc));
  background: oklch(var(--b1));
  box-shadow: -24px 0 48px -24px rgb(0 0 0 / 0.6);
  overscroll-behavior: contain;
}
.an[open] {
  animation: an-in 0.18s ease-out;
}
@keyframes an-in {
  from {
    transform: translateX(2rem);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .an[open] {
    animation: none !important;
  }
}
.an::backdrop {
  background: rgb(0 0 0 / 0.45);
}
.an__inner {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  min-height: 100%;
  padding: 0 1.1rem 2rem;
}
.an button:focus-visible,
.an select:focus-visible {
  outline: 2px solid oklch(var(--p));
  outline-offset: 2px;
}
/* stays on screen: the sheet is long on a phone, and this is where it closes. The character's colour sits here only,
   so the receipt and the tables are on the plain surface */
.an__head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0 -1.1rem;
  padding: 0.6rem 1.1rem;
  background: color-mix(in oklab, var(--an-el) 12%, oklch(var(--b1)));
}
.an__who {
  flex: 1;
  min-width: 0;
}
.an__title {
  font-size: 1.25rem;
  font-weight: 750;
  line-height: 1.15;
}
.an__name {
  font-size: 0.8rem;
  color: oklch(var(--bc) / var(--wt-muted-tint));
}
.an__close {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.5rem;
  color: oklch(var(--bc) / 0.8);
}
.an__close:hover {
  background: oklch(var(--bc) / 0.1);
}
.an__problem {
  padding: 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: oklch(var(--b2));
}
.an__wait {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 1.5rem 0;
  font-size: 0.875rem;
  color: oklch(var(--bc) / 0.75);
}
.an__wait--small {
  padding: 0.4rem 0;
}
.an__figure {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.an__big {
  font-size: 2rem;
  font-weight: 800;
  line-height: 1.05;
  font-variant-numeric: tabular-nums;
}
.an__unit,
.an__intro,
.an__rotation {
  font-size: 0.8rem;
  line-height: 1.35;
  color: oklch(var(--bc) / var(--wt-muted-tint));
}
.an__rotation {
  font-weight: 600;
  overflow-wrap: anywhere;
}
.an__section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  scroll-margin-top: 4.5rem;
  padding-top: 0.9rem;
  border-top: 1px solid oklch(var(--bc) / 0.12);
}
.an__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem 0.75rem;
}
.an__h3 {
  font-size: 0.95rem;
  font-weight: 700;
}
.an__note {
  font-size: 0.75rem;
  line-height: 1.35;
  color: oklch(var(--bc) / 0.72);
}
.an__notice {
  padding: 0.5rem 0.65rem;
  border-left: 3px solid oklch(var(--wa));
  border-radius: 0.25rem;
  font-size: 0.8rem;
  line-height: 1.35;
  background: oklch(var(--b2));
}
.an__check {
  display: flex;
  align-items: flex-start;
  gap: 0.35rem;
  font-size: 0.75rem;
  line-height: 1.35;
  color: oklch(var(--su));
}
.an__more {
  align-self: flex-start;
}

.an-field {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}
.an-field__label {
  flex: none;
  font-size: 0.75rem;
  font-weight: 600;
  color: oklch(var(--bc) / 0.75);
}
.an-field__select {
  flex: 1;
  width: 100%;
  min-width: 0;
  max-width: 100%;
}

.an-seg {
  display: inline-flex;
  border: 1px solid oklch(var(--bc) / 0.25);
  border-radius: 0.5rem;
  overflow: hidden;
}
.an-seg__btn {
  padding: 0.2rem 0.6rem;
  min-height: 2rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: oklch(var(--bc) / 0.8);
}
.an-seg__btn[aria-pressed="true"] {
  color: oklch(var(--pc));
  background: oklch(var(--p));
}

.an-shares {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.an-share {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 3.4rem;
  gap: 0.1rem 0.6rem;
  align-items: baseline;
  width: 100%;
  padding: 0.3rem 0.4rem;
  border-radius: 0.4rem;
  text-align: left;
}
.an-share:hover {
  background: oklch(var(--bc) / 0.07);
}
.an-share[aria-current="true"] {
  background: oklch(var(--p) / 0.14);
}
.an-share[aria-current="true"] .an-share__dmg,
.an-share[aria-current="true"] small {
  color: oklch(var(--bc) / var(--wt-muted-tint));
}
.an-share__name {
  min-width: 0;
  font-size: 0.8rem;
  line-height: 1.25;
  overflow-wrap: anywhere;
}
.an-share__name small {
  margin-left: 0.2rem;
  color: oklch(var(--bc) / 0.72);
}
.an-share__pct {
  font-size: 0.8rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.an-share__dmg {
  font-size: 0.75rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: oklch(var(--bc) / 0.75);
}
.an-share__track,
.an-m__track {
  grid-column: 1 / -1;
  display: block;
  height: 0.3rem;
  border-radius: 999px;
  overflow: hidden;
  background: oklch(var(--bc) / 0.1);
}
.an-share__track i,
.an-m__track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: oklch(var(--p));
}

.an-bill {
  display: flex;
  flex-direction: column;
  padding: 0.25rem 0.75rem;
  border-radius: 0.6rem;
  background: oklch(var(--b2));
}
.an-f {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.05rem 0.75rem;
  align-items: baseline;
  padding: 0.45rem 0;
  border-top: 1px dashed oklch(var(--bc) / 0.16);
}
.an-f:first-child {
  border-top: none;
}
.an-f__name {
  min-width: 0;
  font-size: 0.875rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.an-f__value {
  font-size: 0.875rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.an-f__what {
  grid-column: 1 / -1;
  font-size: 0.75rem;
  line-height: 1.35;
  color: oklch(var(--bc) / 0.72);
  overflow-wrap: anywhere;
}
.an-f__detail {
  grid-column: 1 / -1;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.35;
  color: oklch(var(--bc) / 0.85);
  overflow-wrap: anywhere;
}
.an-f--sum {
  border-top: 1px solid oklch(var(--bc) / 0.35);
}
.an-f--main .an-f__name,
.an-f--main .an-f__value {
  font-size: 1rem;
  font-weight: 800;
}

.an-moves {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
.an-m {
  display: grid;
  grid-template-columns: 1.1rem minmax(0, 1fr) 4.2rem 4.2rem;
  gap: 0.15rem 0.5rem;
  align-items: start;
}
.an-m__rank {
  font-size: 0.75rem;
  line-height: 1.35;
  font-variant-numeric: tabular-nums;
  color: oklch(var(--bc) / 0.72);
}
.an-m__name {
  min-width: 0;
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.3;
}
.an-m__name small {
  display: block;
  font-size: 0.72rem;
  font-weight: 400;
  color: oklch(var(--bc) / 0.72);
  overflow-wrap: anywhere;
}
.an-m__gain {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-size: 0.8rem;
  line-height: 1.25;
  font-variant-numeric: tabular-nums;
  color: oklch(var(--bc) / 0.8);
}
.an-m__gain b {
  font-weight: 600;
}
.an-m__gain small {
  font-size: 0.68rem;
  color: oklch(var(--bc) / 0.72);
}
.an-m__gain--lead {
  color: oklch(var(--su));
}
.an-m__gain--lead b {
  font-weight: 800;
}
.an-m__track {
  height: 0.22rem;
}

@media (max-width: 767px) {
  .an {
    width: 100vw;
  }
  .an__inner {
    padding: 0 1rem 2.5rem;
  }
  .an__head {
    margin: 0 -1rem;
    padding: 0.5rem 1rem;
  }
  .an__title {
    font-size: 1.1rem;
  }
  .an-field__select {
    min-height: 2.5rem;
    height: 2.5rem;
  }
  .an-seg__btn {
    min-height: 2.5rem;
  }
  .an-share {
    padding: 0.5rem 0.4rem;
  }
  .an-m {
    grid-template-columns: 1.1rem minmax(0, 1fr) auto auto;
  }
}
</style>
