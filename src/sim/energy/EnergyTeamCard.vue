<template>
  <article class="en-card" :data-test-energy-team="view.name" :data-test-energy-team-state="stateKind">
    <header class="en-card__head">
      <div class="en-trio" aria-hidden="true">
        <img v-for="id in view.characterIds" :key="id" class="en-trio__face" :src="characterPortraitUrl(id)" alt="" loading="lazy" />
      </div>
      <div class="en-card__titles">
        <h3 class="en-card__title" :title="view.name">{{ view.name }}</h3>
        <p class="en-card__meta">
          <template v-if="view.energy">
            wuwa_calc {{ view.energy.teamKey }} · <span class="tabular-nums">{{ intText(view.energy.total) }}</span> DPS
            <template v-if="view.energy.variants > 1"> · best of {{ view.energy.variants }} loadouts</template>
          </template>
          <template v-else>{{ view.characterIds.map(nameOf).join(" · ") }}</template>
        </p>
      </div>
      <span v-if="shortCount" class="en-card__badge en-card__badge--short" data-test-energy-team-short>{{ shortCount }} short</span>
      <span v-else-if="view.checks" class="en-card__badge">{{ view.checks.some((c) => c.status === "tight") ? "tight" : "all paid" }}</span>
    </header>

    <!-- measuring (or the builds' ER still being read) -->
    <div v-if="stateKind === 'loading'" class="en-card__body" aria-busy="true">
      <div v-for="id in view.characterIds" :key="id" class="en-row en-row--skeleton">
        <span class="skeleton en-row__face"></span>
        <span class="skeleton h-3 w-28 rounded"></span>
        <span class="skeleton h-2 rounded en-row__meter"></span>
      </div>
      <p class="en-card__note"><span class="loading loading-spinner loading-xs"></span> Measuring with wuwa_calc at your account…</p>
    </div>

    <!-- the engine failed -->
    <div v-else-if="stateKind === 'error'" class="en-card__body en-card__empty" data-test-energy-team-error>
      <p>Could not measure this team — {{ (view.state as { message?: string } | null)?.message }}. Scores fall back to Energy Regen = 0 until it runs.</p>
      <button type="button" class="btn btn-sm btn-outline" data-test-energy-retry @click="$emit('retry')">Retry</button>
    </div>

    <!-- not one of his compositions, unreleased member, no build at this state -->
    <div v-else-if="stateKind === 'notMeasured'" class="en-card__body en-card__empty" data-test-energy-team-not-measured>
      <p><b>Not measured:</b> {{ measureNote(view.state).replace(/^Not measured: /, "") }}.</p>
      <p class="en-card__note">
        The need comes from Riley31415's loop for a composition; a hand-built team, or one his list has since dropped, gets no guess.
        <RouterLink :to="{ path: '/rankings', hash: rankingsMineHash(view.characterIds) }" class="link link-primary">Find a wuwa_calc team with these three</RouterLink>,
        or import one and <RouterLink to="/rankings" class="link link-primary">sync my teams</RouterLink>.
      </p>
    </div>

    <!-- measured -->
    <div v-else-if="view.checks" class="en-card__body">
      <div v-for="c in view.checks" :key="c.characterId" class="en-member" :class="{ 'en-member--open': open === c.characterId }">
        <button
          type="button"
          class="en-row"
          :aria-expanded="open === c.characterId"
          :aria-controls="`en-bd-${uid}-${c.characterId}`"
          :data-test-energy-member="c.characterId"
          @click="open = open === c.characterId ? null : c.characterId">
          <img class="en-row__face" :src="characterPortraitUrl(c.characterId)" alt="" loading="lazy" />
          <span class="en-row__who">
            <span class="en-row__name">{{ nameOf(c.characterId) }}<span v-if="c.member.mainDps" class="en-row__tag">DPS</span></span>
            <span class="en-row__gear">{{ gearText(c.member) }}</span>
          </span>
          <EnergyMeter v-if="c.status !== 'noGate'" class="en-row__meter" :have="c.have" :need="c.need" :status="c.status" :need-word="needLabel(c.member)" />
          <span v-else class="en-row__meter en-row__nogate">Liberation costs no energy in this loop</span>
          <EnergyChip :check="c" class="en-row__chip" />
          <svg class="en-row__caret" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
        <div v-if="open === c.characterId" :id="`en-bd-${uid}-${c.characterId}`" class="en-member__detail">
          <EnergyBreakdown :view="view" :character-id="c.characterId" inline />
        </div>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
// Wuthering Tools+ — one team on /energy: three members, each with their build's ER as a meter against the need of the
// team's wuwa_calc loop and a chip saying how it stands; a member opens into the full breakdown. Loading, failed and
// not-measured states say why and what to do.
import { computed, ref } from "vue";
import { characterPortraitUrl } from "../../characters/characters";
import { rankingsMineHash } from "../account/accountState";
import EnergyBreakdown from "./EnergyBreakdown.vue";
import EnergyChip from "./EnergyChip.vue";
import EnergyMeter from "./EnergyMeter.vue";
import { gearText, intText, measureNote, nameOf, needLabel } from "./energyFormat";
import type { TeamView } from "./useEnergyNeeds";
import "./energy.css";

const props = defineProps<{ view: TeamView }>();
defineEmits<{ retry: [] }>();

const uid = Math.random().toString(36).slice(2, 8);
const open = ref<string | null>(null);
const stateKind = computed(() => {
  const s = props.view.state;
  if (!s || s.status === "loading" || (s.status === "ok" && !props.view.checks)) return "loading";
  return s.status;
});
const shortCount = computed(() => props.view.checks?.filter((c) => c.status === "short").length ?? 0);
</script>

<style scoped>
.en-card {
  --en-surface: oklch(var(--b2) / 0.55);
  min-width: 0;
  border: 1px solid oklch(var(--bc) / 0.1);
  border-radius: var(--rounded-box, 1rem);
  background: var(--en-surface);
  overflow: hidden;
}
.en-card__head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 1rem 0.7rem;
}
.en-trio {
  display: flex;
  flex: none;
}
.en-trio__face {
  width: 2rem;
  height: 2rem;
  border-radius: 9999px;
  object-fit: cover;
  background: oklch(var(--b3));
  box-shadow: 0 0 0 2px oklch(var(--b2));
}
.en-trio__face + .en-trio__face {
  margin-left: -0.55rem;
}
.en-card__titles {
  min-width: 0;
  flex: 1 1 auto;
}
.en-card__title {
  font-size: 0.92rem;
  font-weight: 650;
  line-height: 1.3;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow-wrap: anywhere;
}
.en-card__meta {
  font-size: 0.75rem;
  color: var(--en-ink-3);
}
.en-card__badge {
  flex: none;
  font-size: 0.7rem;
  font-weight: 650;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  background: oklch(var(--bc) / 0.08);
  color: var(--en-ink-2);
}
.en-card__badge--short {
  background: color-mix(in oklab, oklch(var(--er)) 15%, oklch(var(--b1)));
  color: oklch(var(--bc));
  box-shadow: inset 0 0 0 1px color-mix(in oklab, oklch(var(--er)) 50%, oklch(var(--b1)));
}
.en-card__body {
  border-top: 1px solid oklch(var(--bc) / 0.08);
}
.en-card__empty {
  display: grid;
  gap: 0.6rem;
  justify-items: start;
  padding: 0.85rem 1rem 1rem;
  font-size: 0.85rem;
}
.en-card__note {
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--en-ink-2);
  padding: 0.6rem 1rem 0.8rem;
}
.en-card__empty .en-card__note {
  padding: 0;
}
.en-member + .en-member {
  border-top: 1px solid oklch(var(--bc) / 0.06);
}
/* face · name · chip · caret on the first line, the meter under the name */
.en-row {
  display: grid;
  grid-template-columns: 2.25rem minmax(0, 1fr) auto 1rem;
  grid-template-areas: "face who chip caret" "face meter meter .";
  align-items: center;
  column-gap: 0.75rem;
  row-gap: 0.45rem;
  width: 100%;
  padding: 0.65rem 1rem;
  text-align: left;
  color: inherit;
}
button.en-row {
  cursor: pointer;
}
button.en-row:hover {
  background: oklch(var(--bc) / 0.04);
}
button.en-row:focus-visible {
  outline: 2px solid oklch(var(--p));
  outline-offset: -2px;
}
.en-row--skeleton {
  grid-template-columns: 2.25rem minmax(0, 1fr);
  grid-template-areas: "face who" "face meter";
}
.en-row--skeleton > :nth-child(2) { grid-area: who; }
.en-row__face { grid-area: face; }
.en-row__who { grid-area: who; }
.en-row__chip { grid-area: chip; }
.en-row__meter { grid-area: meter; }
.en-row__caret { grid-area: caret; }
.en-row__face {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 9999px;
  object-fit: cover;
  background: oklch(var(--b3));
}
.en-row__who {
  display: grid;
  min-width: 0;
}
.en-row__name {
  font-weight: 600;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.en-row__tag {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  padding: 0 0.3rem;
  border-radius: 0.25rem;
  background: oklch(var(--bc) / 0.1);
  color: var(--en-ink-2);
}
.en-row__gear {
  font-size: 0.72rem;
  color: var(--en-ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.en-row__meter {
  min-width: 0;
}
.en-row__nogate {
  font-size: 0.75rem;
  color: var(--en-ink-3);
}
.en-row__caret {
  width: 1rem;
  height: 1rem;
  color: var(--en-ink-3);
  transition: transform 0.15s;
}
.en-member--open .en-row__caret {
  transform: rotate(180deg);
}
.en-member__detail {
  padding: 0.25rem 1rem 1rem 4rem;
  background: oklch(var(--bc) / 0.025);
}
:deep(.en-meter__need-label) {
  background: transparent;
}
@media (max-width: 767px) {
  /* the faces and the badge on one line, the (long, generated) team name across the card under them */
  .en-card__head {
    display: grid;
    grid-template-columns: auto 1fr auto;
    grid-template-areas: "trio . badge" "titles titles titles";
    row-gap: 0.5rem;
  }
  .en-trio { grid-area: trio; }
  .en-card__titles { grid-area: titles; }
  .en-card__badge { grid-area: badge; }
  .en-card__title {
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }
  /* face · name · chip on the first line, the meter across the card under them */
  .en-row {
    grid-template-columns: 2.25rem minmax(0, 1fr) 1rem;
    grid-template-areas: "face who caret" "chip chip chip" "meter meter meter";
    row-gap: 0.55rem;
    column-gap: 0.65rem;
  }
  .en-row__chip { justify-self: start; }
  .en-member__detail {
    padding: 0.25rem 1rem 1rem;
  }
}
</style>
