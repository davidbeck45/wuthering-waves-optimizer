<template>
  <button
    type="button"
    class="cc"
    :class="{ 'cc--off': !card.owned }"
    :style="{ '--cc-el': elementColor(card.element) }"
    :data-test-account-card="card.id"
    :data-status="card.status"
    :aria-label="`${card.name}: open details`"
    @click="emit('open', card.id)">
    <span class="cc__top">
      <CharacterAvatar :id="card.id" :size="52" dot :ring="rarityColor(card.rarity)" class="cc__face" title="" />
      <span class="cc__who">
        <span class="cc__name" :title="card.name">{{ card.name }}</span>
        <span class="cc__meta">
          <span class="cc__el" aria-hidden="true"></span>
          <span class="cc__meta-text">{{ card.element ?? "—" }}<span v-if="card.weaponType" class="cc__meta-type"> · {{ card.weaponType }}</span></span>
        </span>
        <span class="cc__pills">
          <span class="cc-pill" :class="{ 'cc-pill--max': card.sequence >= 6 }" :title="`Sequence ${card.sequence}`">S{{ card.sequence }}</span>
          <span v-if="card.weapon" class="cc-pill" :class="{ 'cc-pill--max': card.refinement >= 5 }" :title="`Refinement ${card.refinement}`">R{{ card.refinement }}</span>
          <WeaponIcon v-if="card.weapon" :weapon-key="card.weapon" :size="22" class="cc__weapon" />
          <span v-if="card.weapon" class="cc__weapon-name">{{ weaponDisplayName(card.weapon) }}</span>
        </span>
      </span>
      <span
        v-if="card.score"
        class="cc__grade"
        :class="`cc__grade--${card.score.color}`"
        :title="`Build Score ${Math.round(card.score.percent)}%${card.score.provisional ? ' (provisional: fewer than 5 echoes or substats revealed)' : ''} — average Substat Score of the equipped echoes`"
        data-test-account-card-grade>
        {{ card.score.grade }}<span class="cc__grade-pct">{{ Math.round(card.score.percent) }}%{{ card.score.provisional ? "*" : "" }}</span>
      </span>
    </span>

    <span class="cc__mid">
      <template v-if="card.damage !== null">
        <span class="cc__dmg">
          <span class="cc__dmg-value" data-test-account-card-damage>{{ compact(card.damage) }}</span>
          <span class="cc__dmg-unit">per rotation</span>
          <span v-if="card.damageRank" class="cc__rank" :title="`#${card.damageRank} of your roster by best-rotation damage`">#{{ card.damageRank }}</span>
        </span>
        <span class="cc__bar" aria-hidden="true"><span :style="{ width: barWidth }"></span></span>
        <span class="cc__rot" :title="card.rotation ?? ''">{{ rotationTitle }}</span>
      </template>
      <template v-else-if="scoring && card.owned">
        <span class="cc__skeleton cc__skeleton--a"></span>
        <span class="cc__skeleton cc__skeleton--b"></span>
      </template>
      <span v-else class="cc__status" data-test-account-card-status>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc__status-icon" aria-hidden="true"><path d="M12 8v5m0 3.5v.5M10.3 3.9L2.4 17.5A2 2 0 004.1 20.5h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" stroke-linecap="round" stroke-linejoin="round" /></svg>
        <span>
          <b>{{ BUILD_STATUS_LABELS[card.status] }}</b>
          <span class="cc__status-hint">{{ statusHint }}</span>
        </span>
      </span>
    </span>

    <span class="cc__foot">
      <span v-if="card.upgrade" class="cc__up" :title="upgradeTitle" data-test-account-card-upgrade>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" class="size-3" aria-hidden="true"><path d="M12 19V5m-6 6l6-6 6 6" stroke-linecap="round" stroke-linejoin="round" /></svg>
        <span class="cc__up-what">{{ upgradeLabel }}</span>
        <b :class="upgradeGain >= 0 ? 'acc-gain-up' : 'acc-gain-down'">{{ pct(upgradeGain) }}</b>
        <span class="cc__up-scope">{{ card.upgrade.team ? "team" : "own" }}</span>
      </span>
      <span v-else-if="card.investments && card.teams.length" class="cc__up cc__up--flat" title="No one more sequence, refinement, owned weapon or substat roll lifts their strongest team — open the card for each figure">
        No step lifts the team
      </span>
      <span v-else-if="maxed" class="cc__up cc__up--max" title="S6 with the weapon at R5">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-3" aria-hidden="true"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" /></svg>
        S6 R5
      </span>
      <span v-else class="cc__up cc__up--none"></span>
      <span v-if="card.teams.length" class="cc__teams" :title="teamsTitle" data-test-account-card-teams>
        <span class="cc__mates" aria-hidden="true">
          <CharacterAvatar v-for="k in mates" :id="k" :key="k" :size="18" title="" />
        </span>
        {{ card.teams.length }} team{{ card.teams.length === 1 ? "" : "s" }}
      </span>
    </span>
  </button>
</template>

<script setup lang="ts">
// Wuthering Tools+ — one character on the /account roster grid: portrait (rarity ring, element dot), element and
// weapon type, S/R pills and weapon art, upstream's Build Score grade, the best rotation's damage with a bar against
// the roster's strongest, the headline investment and the teams the character can field. The whole card opens the
// detail drawer.
import { computed } from "vue";
import CharacterAvatar from "../display/CharacterAvatar.vue";
import WeaponIcon from "../display/WeaponIcon.vue";
import { elementColor, rarityColor, weaponDisplayName, characterShortName } from "../display/names";
import { parsePresetName } from "../presets/presetName";
import { compact, pct } from "../myRankings/format";
import { BUILD_STATUS_LABELS, type RosterCard } from "./accountView";
import { INVEST_KIND_LABELS, investChange } from "./investPlan";

const props = defineProps<{ card: RosterCard; maxDamage: number; scoring: boolean; owned: string[] }>();
const emit = defineEmits<{ open: [id: string] }>();

const barWidth = computed(() => `${props.maxDamage > 0 ? Math.max(2, ((props.card.damage ?? 0) / props.maxDamage) * 100) : 0}%`);
const rotationTitle = computed(() => (props.card.rotation ? parsePresetName(props.card.rotation, { owned: props.owned }).title : ""));
const maxed = computed(() => props.card.owned && props.card.sequence >= 6 && props.card.refinement >= 5);
const statusHint = computed(() => {
  switch (props.card.status) {
    case "no-weapon":
      return "equip one in the calculator to score them";
    case "no-echoes":
      return "equip echoes for a real number";
    case "partial":
      return `${props.card.echoes} / 5 echoes equipped`;
    default:
      return "no rotation could be scored";
  }
});

const upgradeGain = computed(() => props.card.upgrade?.team?.gain ?? props.card.upgrade?.gain ?? 0);
const upgradeLabel = computed(() => {
  const u = props.card.upgrade;
  if (!u) return "";
  if (u.kind === "weapon") return weaponDisplayName(u.weaponKey);
  // "Crit DMG roll +2.9 %", never "Crit DMG +2.9 %" — the figure is the damage gain, not the roll's size
  if (u.kind === "substat") return `${u.label.replace(/ [+].*$/, "")} roll`;
  return u.label;
});
const upgradeTitle = computed(() => {
  const u = props.card.upgrade;
  if (!u) return "";
  const lines = [`${INVEST_KIND_LABELS[u.kind]}: ${investChange(u)}`, `Own best rotation: ${pct(u.gain)}`];
  if (u.team) lines.push(`Team (${parsePresetName(u.team.teamName, { owned: props.owned }).title}): ${pct(u.team.gain)}`);
  else if (u.teamNote) lines.push(`No team figure: ${u.teamNote}`);
  return lines.join("\n");
});
const mates = computed(() => (props.card.teams[0]?.characterIds ?? []).filter((k) => k !== props.card.id).slice(0, 2));
const teamsTitle = computed(() => {
  const best = props.card.teams[0];
  if (!best) return "";
  return `Teams ${characterShortName(props.card.id)} can field: ${props.card.teams.length}\nStrongest: ${parsePresetName(best.name, { owned: props.owned }).title} · ${compact(best.avgDamage)} per rotation`;
});
</script>

<style scoped>
.cc {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  min-width: 0;
  padding: 0.8rem 0.85rem 0.7rem;
  border-radius: 0.9rem;
  text-align: left;
  color: oklch(var(--bc));
  background:
    linear-gradient(180deg, color-mix(in oklab, var(--cc-el) 13%, transparent), transparent 4.5rem),
    oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.07);
  transition:
    box-shadow 0.15s ease,
    transform 0.15s ease;
}
.cc:hover,
.cc:focus-visible {
  outline: none;
  box-shadow:
    inset 0 0 0 1px color-mix(in oklab, var(--cc-el) 70%, transparent),
    0 10px 24px -14px rgb(0 0 0 / 0.6);
  transform: translateY(-1px);
}
.cc--off {
  background: oklch(var(--b2) / 0.6);
}
.cc--off .cc__face,
.cc--off .cc__who {
  opacity: 0.6;
}
.cc__top {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  min-width: 0;
}
.cc__who {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  flex: 1;
  min-width: 0;
}
.cc__name {
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cc__meta {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.7rem;
  color: oklch(var(--bc) / 0.6);
  white-space: nowrap;
  overflow: hidden;
}
.cc__meta-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cc__el {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 9999px;
  flex-shrink: 0;
  background: var(--cc-el);
}
.cc__pills {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-top: 0.15rem;
  min-width: 0;
}
.cc-pill {
  padding: 0 0.32rem;
  border-radius: 0.3rem;
  font-size: 0.65rem;
  font-weight: 750;
  line-height: 1.35rem;
  color: oklch(var(--bc) / 0.8);
  background: oklch(var(--bc) / 0.08);
}
.cc-pill--max {
  color: #4a3405;
  background: #e8b44c;
}
.cc__weapon {
  margin-left: 0.1rem;
}
.cc__weapon-name {
  min-width: 0;
  font-size: 0.7rem;
  color: oklch(var(--bc) / 0.6);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cc__grade {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  min-width: 2.6rem;
  padding: 0.2rem 0.35rem 0.25rem;
  border-radius: 0.5rem;
  font-size: 0.85rem;
  font-weight: 800;
  line-height: 1.1;
  color: oklch(var(--bc));
  background: oklch(var(--bc) / 0.1);
}
.cc__grade-pct {
  font-size: 0.6rem;
  font-weight: 650;
  opacity: 0.8;
}
.cc__grade--green {
  color: #fff;
  background: #047857;
}
.cc__grade--blue {
  color: #fff;
  background: #2563eb;
}
.cc__grade--purple {
  color: #fff;
  background: #9333ea;
}
.cc__grade--gold {
  color: #1c1400;
  background: #eab308;
}
.cc__grade--red {
  color: #fff;
  background: #dc2626;
}
.cc__mid {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-height: 3.55rem;
}
.cc__dmg {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
}
.cc__dmg-value {
  font-size: 1.3rem;
  font-weight: 650;
  line-height: 1.1;
}
.cc__dmg-unit {
  font-size: 0.68rem;
  color: oklch(var(--bc) / 0.55);
}
.cc__rank {
  margin-left: auto;
  font-size: 0.7rem;
  font-weight: 700;
  color: oklch(var(--bc) / 0.55);
}
.cc__bar {
  display: block;
  height: 0.3rem;
  border-radius: 9999px;
  background: oklch(var(--p) / 0.14);
  overflow: hidden;
}
.cc__bar > span {
  display: block;
  height: 100%;
  border-radius: 9999px;
  background: oklch(var(--p));
}
.cc__rot {
  font-size: 0.72rem;
  color: oklch(var(--bc) / 0.6);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cc__skeleton {
  display: block;
  height: 0.9rem;
  border-radius: 0.3rem;
  background: linear-gradient(90deg, oklch(var(--bc) / 0.06), oklch(var(--bc) / 0.12), oklch(var(--bc) / 0.06));
  background-size: 200% 100%;
  animation: cc-shimmer 1.2s linear infinite;
}
.cc__skeleton--a {
  width: 55%;
  height: 1.3rem;
}
.cc__skeleton--b {
  width: 85%;
}
@keyframes cc-shimmer {
  to {
    background-position: -200% 0;
  }
}
.cc__status {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  padding: 0.45rem 0.55rem;
  border-radius: 0.55rem;
  font-size: 0.75rem;
  color: oklch(var(--bc) / 0.75);
  background: oklch(var(--wa) / 0.1);
}
.cc__status b {
  display: block;
  font-weight: 700;
}
.cc__status-icon {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  margin-top: 0.1rem;
  color: oklch(var(--wa));
}
.cc__status-hint {
  display: block;
  font-size: 0.68rem;
  color: oklch(var(--bc) / 0.6);
}
.cc__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  min-width: 0;
  padding-top: 0.5rem;
  border-top: 1px solid oklch(var(--bc) / 0.07);
}
.cc__up {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
  font-size: 0.72rem;
  color: oklch(var(--bc) / 0.8);
  white-space: nowrap;
}
.cc__up-what {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
}
.cc__up b {
  font-weight: 700;
}
.cc__up-scope {
  font-size: 0.62rem;
  color: oklch(var(--bc) / 0.5);
}
.cc__up--flat {
  font-size: 0.68rem;
  color: oklch(var(--bc) / 0.5);
}
.cc__up--max {
  color: #c99a3a;
  font-weight: 700;
}
.cc__teams {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  flex-shrink: 0;
  font-size: 0.68rem;
  color: oklch(var(--bc) / 0.6);
}
.cc__mates {
  display: inline-flex;
}
.cc__mates > :deep(.wt-avatar + .wt-avatar) {
  margin-left: -5px;
}
.cc__mates > :deep(.wt-avatar) {
  box-shadow: 0 0 0 2px oklch(var(--b2));
}
/* phones, two cards a row: a smaller portrait, no weapon name or rotation line */
@media (max-width: 639px) {
  .cc {
    gap: 0.45rem;
    padding: 0.6rem 0.6rem 0.55rem;
  }
  .cc__top {
    gap: 0.45rem;
  }
  .cc__face {
    width: 38px !important;
    height: 38px !important;
  }
  .cc__name {
    font-size: 0.82rem;
  }
  .cc__meta {
    font-size: 0.62rem;
  }
  .cc__weapon-name,
  .cc__meta-type,
  .cc__rot,
  .cc__dmg-unit,
  .cc__grade-pct,
  .cc__up-scope,
  .cc__weapon {
    display: none;
  }
  .cc__grade {
    min-width: 0;
    padding: 0.15rem 0.3rem;
    font-size: 0.7rem;
  }
  .cc-pill {
    font-size: 0.58rem;
    line-height: 1.15rem;
  }
  .cc__mid {
    min-height: 2.2rem;
  }
  .cc__dmg-value {
    font-size: 1.05rem;
  }
  .cc__foot {
    flex-wrap: wrap;
    row-gap: 0.25rem;
    padding-top: 0.4rem;
  }
  .cc__up {
    font-size: 0.65rem;
    max-width: 100%;
  }
  .cc__teams {
    font-size: 0.62rem;
  }
  .cc__status {
    padding: 0.35rem 0.4rem;
    font-size: 0.68rem;
  }
  .cc__status-icon {
    display: none;
  }
}
/* the narrowest phones: one card a row again, with the rotation line back */
@media (max-width: 379px) {
  .cc__meta-type {
    display: inline;
  }
  .cc__rot,
  .cc__grade-pct {
    display: block;
  }
  .cc__dmg-unit,
  .cc__up-scope {
    display: inline;
  }
  .cc__weapon {
    display: inline-flex;
  }
}
</style>
