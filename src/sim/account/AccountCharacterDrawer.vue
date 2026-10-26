<template>
  <dialog ref="dialog" class="dr" :aria-label="card ? `${card.name} details` : 'Character details'" data-test-account-drawer @close="emit('close')" @click="onBackdrop">
    <div v-if="card" class="dr__inner" :style="{ '--dr-el': elementColor(card.element) }">
      <header class="dr__head">
        <CharacterAvatar :id="card.id" :size="64" dot :ring="rarityColor(card.rarity)" title="" />
        <div class="dr__who">
          <h2 class="dr__name">{{ card.name }}</h2>
          <div class="dr__meta">{{ card.element ?? "—" }}<template v-if="card.weaponType"> · {{ card.weaponType }}</template> · {{ card.rarity }}★</div>
          <div class="dr__pills">
            <span class="dr-pill" :class="{ 'dr-pill--max': card.sequence >= 6 }">S{{ card.sequence }}</span>
            <template v-if="card.weapon">
              <span class="dr-pill" :class="{ 'dr-pill--max': card.refinement >= 5 }">R{{ card.refinement }}</span>
              <WeaponIcon :weapon-key="card.weapon" :size="22" />
              <span class="dr__weapon">{{ weaponDisplayName(card.weapon) }}</span>
            </template>
            <span v-else class="dr__weapon">no weapon</span>
          </div>
        </div>
        <button type="button" class="dr__close" aria-label="Close" data-test-account-drawer-close @click="close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-5" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" /></svg>
        </button>
      </header>

      <div class="dr__stats">
        <div class="dr-stat">
          <span class="dr-stat__label">Best DMG</span>
          <span class="dr-stat__value">{{ card.damage !== null ? compact(card.damage) : "—" }}</span>
          <span class="dr-stat__sub">{{ card.dps ? `${compact(card.dps)} DPS` : "per rotation" }}</span>
        </div>
        <div class="dr-stat">
          <span class="dr-stat__label">Roster rank</span>
          <span class="dr-stat__value">{{ card.damageRank ? `#${card.damageRank}` : "—" }}</span>
          <span class="dr-stat__sub">of {{ rosterSize }} scored</span>
        </div>
        <div class="dr-stat">
          <span class="dr-stat__label">Build Score</span>
          <span class="dr-stat__value">
            <template v-if="card.score">{{ card.score.grade }} <small>{{ Math.round(card.score.percent) }}%{{ card.score.provisional ? "*" : "" }}</small></template>
            <template v-else>—</template>
          </span>
          <span class="dr-stat__sub">{{ card.echoes }} / 5 echoes</span>
        </div>
      </div>

      <section v-if="rank?.best" class="dr__section">
        <h3 class="dr__h3">Best rotation</h3>
        <PresetNameLabel :name="rank.best.name" :source="rank.best.source" :owned="owned" :max-chips="4" />
        <p class="dr__note">{{ rank.rotationsEvaluated }} rotation{{ rank.rotationsEvaluated === 1 ? "" : "s" }} tried on this build · enemy level 100, 20 % RES</p>
      </section>

      <section class="dr__section" data-test-account-drawer-invest>
        <h3 class="dr__h3">What to invest in next</h3>
        <ul v-if="items.length" class="dr__invest">
          <li v-for="item in items" :key="item.id" class="dr-inv">
            <span class="dr-inv__what">
              <b>{{ INVEST_KIND_LABELS[item.kind] }}</b>
              <span>{{ investChange(item) }}<template v-if="item.wornBy?.length"> · worn by {{ item.wornBy.map((k) => characterShortName(k)).join(", ") }}</template></span>
            </span>
            <span class="dr-inv__gains">
              <span :class="item.gain >= 0 ? 'acc-gain-up' : 'acc-gain-down'">{{ pct(item.gain) }}</span>
              <span class="dr-inv__scope">own</span>
              <template v-if="item.team">
                <span :class="item.team.gain >= 0 ? 'acc-gain-up' : 'acc-gain-down'">{{ pct(item.team.gain) }}</span>
                <span class="dr-inv__scope">team</span>
              </template>
            </span>
            <span v-if="!item.team && item.teamNote" class="dr-inv__note">no team figure: {{ item.teamNote }}</span>
          </li>
        </ul>
        <p v-else class="dr__note">{{ card.owned ? (card.sequence >= 6 && card.refinement >= 5 ? "S6 with the weapon at R5 — the next gains are in the echoes (Substats tab)." : "Nothing scored yet, or nothing left to gain from one step.") : "Equip a weapon to score this character." }}</p>
        <p v-if="items[0]?.team" class="dr__note">Team: {{ teamTitle(items[0].team.teamName) }}</p>
      </section>

      <section v-if="card.teams.length" class="dr__section">
        <h3 class="dr__h3">Teams {{ shortName }} can field <span class="dr__count">{{ card.teams.length }}</span></h3>
        <ul class="dr__teams">
          <li v-for="t in card.teams.slice(0, 4)" :key="t.id" class="dr-team">
            <span class="dr-team__faces">
              <CharacterAvatar v-for="k in t.characterIds" :id="k" :key="k" :size="24" />
            </span>
            <!-- title + source / tier chips: two teams of the same three read apart (yours vs a preset, S6R5 vs S0R1) -->
            <PresetNameLabel class="dr-team__name" :name="t.name" :source="t.source" :owned="owned" :max-chips="2" />
            <b class="dr-team__dmg">{{ compact(t.avgDamage) }}</b>
          </li>
        </ul>
      </section>

      <footer class="dr__actions">
        <button v-if="card.owned || card.echoes" type="button" class="btn btn-primary btn-sm" data-test-account-open-calculator @click="emit('calculator', card.id)">Open in calculator</button>
        <button v-else type="button" class="btn btn-primary btn-sm" data-test-account-open-calculator @click="emit('calculator', card.id)">Set up in calculator</button>
        <RouterLink v-if="card.owned" :to="{ path: '/my-rankings', query: { focus: card.id, tab: 'substats' } }" class="btn btn-ghost btn-sm" data-test-account-open-substats @click="close">
          <span class="sm:hidden">Substats</span><span class="max-sm:hidden">Substats &amp; what-if</span>
        </RouterLink>
        <RouterLink
          :to="{ path: '/rankings', hash: rankingsMineHash([card.id]) }"
          class="btn btn-ghost btn-sm"
          :title="`Riley31415's wuwa_calc team table at your account's own state, teams with ${shortName}`"
          data-test-account-open-rankings
          @click="close">
          Team rankings ↗
        </RouterLink>
      </footer>
    </div>
  </dialog>
</template>

<script setup lang="ts">
// Wuthering Tools+ — the /account character drawer: a native modal dialog (focus kept inside, Escape and a backdrop
// click close it) that slides in from the right on desktop and up from the bottom on a phone. The card's numbers,
// the best rotation, the character's investments with own and team gains, the teams they can field, and the way on:
// the calculator, their Substats / What if tabs on /my-rankings, Riley's table at the account's own state.
import { computed, nextTick, ref, watch } from "vue";
import CharacterAvatar from "../display/CharacterAvatar.vue";
import WeaponIcon from "../display/WeaponIcon.vue";
import PresetNameLabel from "../display/PresetNameLabel.vue";
import { characterShortName, elementColor, rarityColor, weaponDisplayName } from "../display/names";
import { parsePresetName } from "../presets/presetName";
import { compact, pct } from "../myRankings/format";
import { rankingsMineHash } from "./accountState";
import { INVEST_KIND_LABELS, investChange, type InvestItem } from "./investPlan";
import type { RosterCard } from "./accountView";
import type { CharacterRank } from "../myRankings/rankRoster";

const props = defineProps<{ card: RosterCard | null; items: InvestItem[]; rank: CharacterRank | null; rosterSize: number; owned: string[] }>();
const emit = defineEmits<{ close: []; calculator: [id: string] }>();
const dialog = ref<HTMLDialogElement | null>(null);

const shortName = computed(() => characterShortName(props.card?.id));
const teamTitle = (name: string): string => parsePresetName(name, { owned: props.owned }).title || name;

watch(
  () => props.card?.id ?? null,
  async (id) => {
    await nextTick();
    const el = dialog.value;
    if (!el) return;
    if (id && !el.open) el.showModal();
    else if (!id && el.open) el.close();
  },
);

function close(): void {
  dialog.value?.close();
}
/** a click on the dialog box itself (outside .dr__inner) is a click on the backdrop */
function onBackdrop(event: MouseEvent): void {
  if (event.target === dialog.value) close();
}
</script>

<style scoped>
.dr {
  margin: 0 0 0 auto;
  width: min(28rem, 100vw);
  max-width: 100vw;
  height: 100dvh;
  max-height: 100dvh;
  padding: 0;
  border: none;
  color: oklch(var(--bc));
  background: oklch(var(--b1));
  box-shadow: -24px 0 48px -24px rgb(0 0 0 / 0.6);
}
.dr[open] {
  animation: dr-in 0.18s ease-out;
}
@keyframes dr-in {
  from {
    transform: translateX(2rem);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .dr[open] {
    animation: none !important;
  }
}
.dr::backdrop {
  background: rgb(0 0 0 / 0.45);
}
.dr__inner {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 100%;
  padding: 1.1rem 1.1rem 1rem;
  background: linear-gradient(180deg, color-mix(in oklab, var(--dr-el) 16%, transparent), transparent 9rem);
}
.dr__head {
  display: flex;
  align-items: flex-start;
  gap: 0.85rem;
}
.dr__who {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  flex: 1;
  min-width: 0;
}
.dr__name {
  font-size: 1.3rem;
  font-weight: 750;
  line-height: 1.15;
}
.dr__meta {
  font-size: 0.75rem;
  color: oklch(var(--bc) / 0.6);
}
.dr__pills {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
  margin-top: 0.2rem;
}
.dr-pill {
  padding: 0 0.35rem;
  border-radius: 0.3rem;
  font-size: 0.7rem;
  font-weight: 750;
  line-height: 1.4rem;
  background: oklch(var(--bc) / 0.08);
}
.dr-pill--max {
  color: #4a3405;
  background: #e8b44c;
}
.dr__weapon {
  font-size: 0.75rem;
  color: oklch(var(--bc) / 0.7);
}
.dr__close {
  display: inline-flex;
  padding: 0.3rem;
  border-radius: 0.5rem;
  color: oklch(var(--bc) / 0.6);
}
.dr__close:hover {
  color: oklch(var(--bc));
  background: oklch(var(--bc) / 0.08);
}
.dr__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.45rem;
}
.dr-stat {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
  padding: 0.55rem 0.65rem;
  border-radius: 0.7rem;
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.07);
}
.dr-stat__label {
  font-size: 0.58rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: oklch(var(--bc) / 0.55);
}
.dr-stat__value {
  font-size: 1.15rem;
  font-weight: 650;
  line-height: 1.2;
  white-space: nowrap;
}
.dr-stat__value small {
  font-size: 0.7rem;
  font-weight: 600;
  color: oklch(var(--bc) / 0.6);
}
.dr-stat__sub {
  font-size: 0.65rem;
  color: oklch(var(--bc) / 0.5);
}
.dr__section {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.dr__h3 {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: oklch(var(--bc) / 0.6);
}
.dr__count {
  padding: 0 0.4rem;
  border-radius: 9999px;
  font-size: 0.65rem;
  background: oklch(var(--bc) / 0.08);
}
.dr__note {
  font-size: 0.72rem;
  color: oklch(var(--bc) / 0.55);
}
.dr__invest,
.dr__teams {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.dr-inv {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.15rem 0.6rem;
  padding: 0.45rem 0.6rem;
  border-radius: 0.6rem;
  background: oklch(var(--b2));
}
.dr-inv__what {
  display: flex;
  flex-direction: column;
  min-width: 0;
  font-size: 0.78rem;
}
.dr-inv__what b {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: oklch(var(--bc) / 0.55);
}
.dr-inv__gains {
  display: inline-flex;
  align-items: baseline;
  gap: 0.25rem;
  font-size: 0.82rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.dr-inv__scope {
  margin-right: 0.3rem;
  font-size: 0.6rem;
  font-weight: 600;
  color: oklch(var(--bc) / 0.45);
}
.dr-inv__note {
  grid-column: 1 / -1;
  font-size: 0.65rem;
  color: oklch(var(--bc) / 0.5);
}
.dr-team {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.35rem 0.55rem;
  border-radius: 0.6rem;
  background: oklch(var(--b2));
}
.dr-team__faces {
  display: inline-flex;
  gap: 0.2rem;
}
.dr-team__name {
  flex: 1;
  min-width: 0;
  font-size: 0.75rem;
}
.dr-team__dmg {
  font-size: 0.8rem;
}
/* the way on stays in reach: pinned to the bottom of the sheet (the dialog is the scroller) when the content runs long */
.dr__actions {
  position: sticky;
  bottom: 0;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: auto -1.1rem -1rem;
  padding: 0.75rem 1.1rem 1rem;
  border-top: 1px solid oklch(var(--bc) / 0.08);
  background: oklch(var(--b1));
}
/* two even rows: the calculator full width, the two links side by side */
.dr__actions .btn {
  flex: 1 1 0;
  min-width: 0;
}
.dr__actions .btn-primary {
  flex-basis: 100%;
}
/* phones: a bottom sheet */
@media (max-width: 639px) {
  .dr {
    margin: auto 0 0;
    width: 100vw;
    height: auto;
    max-height: 88dvh;
    border-radius: 1rem 1rem 0 0;
    box-shadow: 0 -24px 48px -24px rgb(0 0 0 / 0.6);
  }
  .dr[open] {
    animation-name: dr-up;
  }
  @keyframes dr-up {
    from {
      transform: translateY(2rem);
      opacity: 0;
    }
  }
  .dr__inner {
    min-height: 0;
    padding: 0.9rem 0.85rem 1rem;
  }
  .dr__name {
    font-size: 1.1rem;
  }
  .dr-stat {
    padding: 0.45rem 0.5rem;
  }
  .dr-stat__value {
    font-size: 0.95rem;
  }
  .dr__actions {
    margin-inline: -0.85rem;
    padding: 0.6rem 0.85rem max(0.75rem, env(safe-area-inset-bottom));
  }
  /* "Team rankings ↗" in half of 360 px at 130 % text: one line */
  .dr__actions .btn {
    padding-inline: 0.5rem;
    white-space: nowrap;
  }
}
</style>
