<template>
  <section class="tm acc-panel" data-test-account-teams>
    <div class="acc-section-head tm__head">
      <h2 class="acc-h2">
        Teams you can field
        <span class="acc-count">{{ teams.length }}</span>
      </h2>
      <RouterLink to="/teams" class="tm__link" data-test-account-teams-editor>Team Rotations</RouterLink>
    </div>

    <ol v-if="teams.length" class="tm__list">
      <li v-for="(t, i) in visible" :key="t.id" class="tm-card" :data-test-account-team="t.id">
        <div class="tm-card__top">
          <span class="tm-card__n">{{ i + 1 }}</span>
          <span class="tm-card__faces">
            <CharacterAvatar v-for="m in sharesOf(t)" :id="m.id" :key="m.id" :size="30" :ring="m.color" :title="`${characterShortName(m.id)} · ${Math.round(m.share * 100)}% of the team's damage`" />
          </span>
          <span class="tm-card__dmg">
            <b>{{ compact(t.avgDamage) }}</b>
            <span class="tm-card__unit">{{ t.dps ? `${compact(t.dps)} DPS` : "per rotation" }}</span>
          </span>
        </div>
        <div class="tm-card__name">
          <PresetNameLabel :name="t.name" :source="t.source" :owned="owned" :max-chips="2" />
        </div>
        <div class="tm-card__bar" aria-hidden="true">
          <span v-for="m in sharesOf(t)" :key="m.id" :style="{ width: `${m.share * 100}%`, background: m.color }"></span>
        </div>
        <div class="tm-card__foot">
          <span v-if="t.duplicates.length" class="tm-card__dup">+{{ t.duplicates.length }} identical</span>
          <RouterLink :to="{ path: '/rankings', hash: rankingsMineHash(t.characterIds) }" class="tm__link" :data-test-account-team-rankings="t.id">
            At my account
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-3" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </RouterLink>
        </div>
      </li>
    </ol>
    <div v-else-if="scoring" class="tm__skeleton" aria-hidden="true"><span v-for="n in 3" :key="n"></span></div>
    <p v-else class="tm__none" data-test-account-teams-none>
      No team with three armed members yet — build a third member of a team, or save one in Team Rotations.
    </p>

    <button v-if="teams.length > limit" type="button" class="tm__more" data-test-account-teams-more @click="expanded = !expanded">
      {{ expanded ? "Show fewer" : `Show all ${teams.length}` }}
    </button>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+ — "Teams you can field" on /account: every ranked team whose three members are armed (yours and
// the stock presets, identical rows folded), strongest first; three portraits ringed in their share colour, the
// damage, a bar split by member share, and the team on /rankings at the account's own state.
import { computed, ref } from "vue";
import CharacterAvatar from "../display/CharacterAvatar.vue";
import PresetNameLabel from "../display/PresetNameLabel.vue";
import { characterShortName } from "../display/names";
import { memberShares, type TeamRow } from "../myRankings/rows";
import { compact } from "../myRankings/format";
import { rankingsMineHash } from "./accountState";

const props = defineProps<{ teams: TeamRow[]; scoring: boolean; owned: string[] }>();
const expanded = ref(false);
const limit = 5;
const visible = computed(() => (expanded.value ? props.teams : props.teams.slice(0, limit)));
const shares = computed(() => new Map(props.teams.map((t) => [t.id, memberShares(t)])));
const sharesOf = (t: TeamRow) => shares.value.get(t.id) ?? memberShares(t);
</script>

<style scoped>
.tm {
  padding: 0.9rem 0.9rem 0.75rem;
}
.tm__head {
  margin-bottom: 0.5rem;
}
.tm__link {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: oklch(var(--p));
}
.tm__link:hover {
  text-decoration: underline;
}
.tm__list {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.tm-card {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.6rem 0.65rem 0.55rem;
  border-radius: 0.7rem;
  background: oklch(var(--b1));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.07);
}
.tm-card__top {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}
.tm-card__n {
  width: 1rem;
  font-size: 0.68rem;
  font-weight: 700;
  text-align: right;
  color: oklch(var(--bc) / 0.4);
}
.tm-card__faces {
  display: inline-flex;
  gap: 0.3rem;
}
.tm-card__dmg {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  margin-left: auto;
  line-height: 1.15;
}
.tm-card__dmg b {
  font-size: 1rem;
  font-weight: 700;
}
.tm-card__unit {
  font-size: 0.62rem;
  color: oklch(var(--bc) / 0.5);
}
.tm-card__name {
  min-width: 0;
  font-size: 0.8rem;
}
/* one bar split by member share, 2 px surface gaps between the fills */
.tm-card__bar {
  display: flex;
  gap: 2px;
  height: 0.3rem;
  border-radius: 9999px;
  overflow: hidden;
  background: oklch(var(--bc) / 0.06);
}
.tm-card__bar > span {
  display: block;
  height: 100%;
}
.tm-card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.tm-card__foot .tm__link {
  margin-left: auto;
}
.tm-card__dup {
  font-size: 0.65rem;
  color: oklch(var(--bc) / 0.5);
}
.tm__skeleton {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.tm__skeleton > span {
  height: 5.5rem;
  border-radius: 0.7rem;
  background: linear-gradient(90deg, oklch(var(--bc) / 0.05), oklch(var(--bc) / 0.1), oklch(var(--bc) / 0.05));
  background-size: 200% 100%;
  animation: tm-shimmer 1.2s linear infinite;
}
@keyframes tm-shimmer {
  to {
    background-position: -200% 0;
  }
}
.tm__none {
  font-size: 0.8rem;
  color: oklch(var(--bc) / 0.6);
}
.tm__more {
  display: block;
  width: 100%;
  margin-top: 0.4rem;
  padding: 0.35rem;
  border-radius: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: oklch(var(--p));
}
.tm__more:hover {
  background: oklch(var(--bc) / 0.05);
}
/* below the rail breakpoint the panel is full width: cards side by side */
@media (min-width: 640px) and (max-width: 1279px) {
  .tm__list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
  }
}
@media (max-width: 767px) {
  .tm {
    padding: 0.75rem 0.7rem 0.6rem;
  }
}
</style>
