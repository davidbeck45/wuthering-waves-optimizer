<template>
  <div v-if="check" class="en-ui en-bd" :data-test-energy-breakdown="characterId">
    <!-- headline: need, have, verdict -->
    <div v-if="!inline" class="en-bd__head">
      <div class="en-bd__fig">
        <span class="en-bd__fig-label">Needs</span>
        <span class="en-bd__fig-value">{{ check.need == null ? "—" : needText(check.need) }}</span>
      </div>
      <div class="en-bd__fig">
        <span class="en-bd__fig-label">{{ check.buildName ? `Has (${check.buildName})` : "Has" }}</span>
        <span class="en-bd__fig-value">{{ check.have == null ? "—" : haveText(check.have) }}</span>
      </div>
      <EnergyChip :check="check" class="en-bd__chip" />
    </div>
    <p class="en-bd__lead">
      <template v-if="check.status === 'noGate'">{{ who }}'s Liberation costs no energy in this team's wuwa_calc loop, so there is no ER to reach.</template>
      <template v-else-if="m.setBy === 'kit'">
        {{ who }}'s loadout asks for at least <b>{{ needText(m.minEr) }}</b> ER in wuwa_calc (the kit's own floor);
        this team's loop alone would ask {{ m.bar == null ? "nothing" : needText(m.bar) }}.
      </template>
      <template v-else>
        At <b>{{ needText(m.need) }}</b> ER every {{ energyText(m.cost) }}-energy Liberation in this team's wuwa_calc loop is paid on
        time — measured frame by frame, on the charge that asks the most.
      </template>
      <template v-if="check.status === 'short'"> {{ check.short.toFixed(1) }}% short: about {{ check.rolls }} Energy Regen roll{{ check.rolls === 1 ? "" : "s" }} ({{ erRollText }} each).</template>
      <template v-else-if="check.status === 'unknown'"> {{ who }} is not set up in the calculator (no weapon), so there is no build to compare.</template>
    </p>

    <!-- where the energy comes from -->
    <section v-if="breakdown" class="en-bd__section" aria-labelledby="en-bd-sources">
      <h3 id="en-bd-sources" class="en-bd__h">
        Where the {{ energyText(breakdown.spend) }} energy comes from <span class="en-bd__h-note">at {{ needText(breakdown.bar) }} ER</span>
      </h3>
      <div class="en-stack" role="img" :aria-label="stackLabel">
        <div
          v-for="(p, i) in breakdown.parts"
          :key="i"
          class="en-stack__seg"
          :class="fillOf(p)"
          :style="{ flexGrow: Math.max(p.paid, 0.0001), flexBasis: 0 }"
          :title="`${partLabel(p)}: ${energyText(p.paid)} energy (${pctOf(p)})`"></div>
      </div>
      <div class="en-bd__axis" aria-hidden="true">
        <span>0</span>
        <span>{{ energyText(breakdown.spend) }} energy = one Liberation</span>
      </div>
      <ul class="en-bd__legend">
        <li v-for="(p, i) in breakdown.parts" :key="i" class="en-bd__item">
          <span class="en-swatch" :class="fillOf(p)" aria-hidden="true"></span>
          <span class="en-bd__item-name">{{ partLabel(p) }}</span>
          <span class="en-bd__item-value">{{ energyText(p.paid) }}</span>
          <span class="en-bd__item-share">{{ pctOf(p) }}</span>
        </li>
      </ul>
      <p class="en-bd__note">{{ sourcesNote }}</p>
    </section>
    <p v-else-if="check.status !== 'noGate'" class="en-bd__note">No energy breakdown: only the kit's floor asks for ER here.</p>

    <!-- crit overcap from the same run -->
    <section v-if="m.overcap && m.overcap.share > 0.0005" class="en-bd__section" aria-labelledby="en-bd-crit" data-test-energy-overcap>
      <h3 id="en-bd-crit" class="en-bd__h">Crit Rate past 100 %</h3>
      <p class="en-bd__text">
        <b>{{ Math.round(m.overcap.share * 100) }}%</b> of {{ who }}'s damage lands at 100 % Crit Rate or more — more Crit Rate does
        nothing there<template v-if="m.overcap.top[0]">, mostly <i>{{ actionText(m.overcap.top[0].action) }}</i> ({{ pctText(m.overcap.top[0].critRate) }})</template>.
        <template v-if="m.overcap.rest != null"> The rest reads {{ pctText(m.overcap.rest) }}.</template>
      </p>
    </section>

    <!-- what it means for scores -->
    <p v-if="check.status === 'short'" class="en-bd__note">
      Substat weights count Energy Regen until {{ who }} reaches the need: while short, the deficit-aware score is
      {{ Math.round((1 - check.factor) * 1000) / 10 }}% lower, and the next ER roll is worth {{ rollWorthText }}.
    </p>

    <footer class="en-bd__foot">
      For this team's wuwa_calc loop ({{ view.energy?.teamKey }}, {{ m.spread }}, {{ gearText(m) }}) at your account — Riley31415's engine
      {{ view.energy?.engine.commit }}. The loop starts from each kit's own steady state, not from a full bar.
    </footer>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ — one member's energy, explained: the need and what sets it (the loop's slowest charge, or the
// kit's floor), the ER the build has, a stacked bar of where the energy for one Liberation comes from (own hits, each
// ally's share, flat gains, ER buffs on their own hits) at the ER that pays it exactly, the crit overcap of the same
// run, and what being short costs a score. Used in the /energy cards and in the sheet the chips open.
import { computed } from "vue";
import EnergyChip from "./EnergyChip.vue";
import { actionText, energyText, gearText, haveText, nameOf, needText, pctText } from "./energyFormat";
import { erRoll, erWeight, memberBreakdown, type BreakdownPart } from "./energyNeed";
import type { TeamView } from "./useEnergyNeeds";
import "./energy.css";

const props = withDefaults(defineProps<{ view: TeamView; characterId: string; /** inside a card row that already shows the numbers */ inline?: boolean }>(), { inline: false });

const check = computed(() => props.view.checks?.find((c) => c.characterId === props.characterId) ?? null);
const m = computed(() => check.value!.member);
const who = computed(() => nameOf(props.characterId));
const breakdown = computed(() => (check.value ? memberBreakdown(m.value) : null));
const hasBuffs = computed(() => breakdown.value?.parts.some((p) => p.kind === "buffs") ?? false);
const erRollText = computed(() => pctText(erRoll()));
const sourcesNote = computed(() => {
  const bar = breakdown.value ? needText(breakdown.value.bar) : "";
  const buffs = hasBuffs.value ? `; the striped part is what ER buffs during the fight added on ${who.value}'s own hits` : "";
  return `Own hits and each ally's share are energy before ER, scaled by the ${bar} that pays the charge exactly${buffs}. Read off the charge that asked the most.`;
});
const rollWorthText = computed(() => {
  const c = check.value;
  if (!c) return "";
  return `+${(erWeight(c.need, c.have) * 100).toFixed(1)}%`;
});

/** each member's colour slot, in the team's order (the same in all three breakdowns of a team) */
const slotOf = (rileyName: string): number => Math.max(0, props.view.checks?.findIndex((c) => c.member.name === rileyName) ?? 0);
const fillOf = (p: BreakdownPart): string => {
  if (p.kind === "flat") return "en-fill--flat";
  if (p.kind === "buffs") return "en-fill--buffs";
  return `en-fill--m${slotOf(p.who) % 3}`;
};
const partLabel = (p: BreakdownPart): string => {
  if (p.kind === "own") return `${who.value}'s own hits`;
  if (p.kind === "ally") return `${nameOf(props.view.checks?.find((c) => c.member.name === p.who)?.characterId ?? p.who)}'s hits (shared)`;
  if (p.kind === "flat") return "Flat gains (no ER)";
  return "ER buffs on own hits";
};
const pctOf = (p: BreakdownPart): string => (breakdown.value && breakdown.value.spend > 0 ? `${Math.round((p.paid / breakdown.value.spend) * 100)}%` : "");
const stackLabel = computed(() =>
  breakdown.value ? `Energy for one Liberation: ${breakdown.value.parts.map((p) => `${partLabel(p)} ${energyText(p.paid)}`).join(", ")} of ${energyText(breakdown.value.spend)}` : "",
);
</script>

<style scoped>
.en-bd {
  display: grid;
  gap: 0.85rem;
  min-width: 0;
}
.en-bd__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.5rem 1.5rem;
}
.en-bd__fig {
  display: grid;
  gap: 0.1rem;
}
.en-bd__fig-label {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--en-ink-3);
}
.en-bd__fig-value {
  font-size: 1.6rem;
  font-weight: 650;
  line-height: 1.1;
}
.en-bd__chip {
  margin-bottom: 0.2rem;
}
.en-bd__lead,
.en-bd__text {
  font-size: 0.875rem;
  line-height: 1.5;
}
.en-bd__section {
  display: grid;
  gap: 0.45rem;
}
.en-bd__h {
  font-size: 0.8rem;
  font-weight: 650;
}
.en-bd__h-note {
  font-weight: 400;
  color: var(--en-ink-3);
}
.en-bd__axis {
  display: flex;
  justify-content: space-between;
  font-size: 0.68rem;
  color: var(--en-ink-3);
  margin-top: -0.15rem;
}
.en-bd__legend {
  display: grid;
  gap: 0.25rem;
  font-size: 0.8rem;
}
.en-bd__item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto 2.6rem;
  align-items: center;
  gap: 0.5rem;
}
.en-bd__item-name {
  min-width: 0;
}
.en-bd__item-value,
.en-bd__item-share {
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.en-bd__item-share {
  color: var(--en-ink-3);
}
.en-bd__note {
  font-size: 0.75rem;
  line-height: 1.45;
  color: var(--en-ink-2);
}
.en-bd__foot {
  font-size: 0.7rem;
  line-height: 1.45;
  color: var(--en-ink-3);
  border-top: 1px solid oklch(var(--bc) / 0.1);
  padding-top: 0.6rem;
}
</style>
