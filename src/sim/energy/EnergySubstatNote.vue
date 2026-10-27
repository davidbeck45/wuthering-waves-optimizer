<template>
  <p class="en-ui en-subnote" :data-test-energy-substat-note="er?.reason ?? 'pending'">
    <template v-if="!er"><span class="loading loading-spinner loading-xs"></span> Reading the Energy Regen this build needs…</template>
    <template v-else-if="er.reason === 'floor' && er.floor">
      <span class="en-subnote__tag">ER floor</span>
      <template v-if="check && check.status === 'short'">
        Energy Regen counts until <b>{{ needText(er.floor.need) }}</b> — {{ whereText }} — and this build has
        {{ haveText(er.have) }}: {{ check.short.toFixed(1) }}% short, so an ER roll weighs in here (the score is damage × (1 − deficit)).
      </template>
      <template v-else-if="check && check.status === 'unknown'">
        Energy Regen counts until <b>{{ needText(er.floor.need) }}</b> — {{ whereText }}; this build's own Energy Regen could not be read, so it is weighed as met.
      </template>
      <template v-else>
        This build has {{ haveText(er.have) }} Energy Regen, at or above the <b>{{ needText(er.floor.need) }}</b> — {{ whereText }}: more ER is worth nothing on this rotation.
      </template>
      <RouterLink to="/energy" class="link link-primary whitespace-nowrap">Energy check ▸</RouterLink>
    </template>
    <template v-else-if="er.reason === 'noTeam'">
      Energy Regen reads 0 here: {{ who }} is in none of your saved teams, so there is no team to measure an ER need in. Keep the ER your rotation needs.
    </template>
    <template v-else-if="er.reason === 'noGate'">
      Energy Regen reads 0 here: {{ who }}'s Liberation costs no energy in their teams' wuwa_calc loops.
    </template>
    <template v-else>
      Energy Regen reads 0 here: the energy check could not measure {{ who }}'s teams (not one of wuwa_calc's compositions, or the engine failed) — keep the ER the rotation needs.
      <RouterLink to="/energy" class="link link-primary whitespace-nowrap">Energy check ▸</RouterLink>
    </template>
  </p>
</template>

<script setup lang="ts">
// Wuthering Tools+ — the line under a substat-weights panel saying how Energy Regen was weighed: as a floor up to the
// character's worst need among the saved teams (energySubstats.ts), or why it still reads 0.
import { computed } from "vue";
import { haveText, nameOf, needText } from "./energyFormat";
import { checkOf } from "./energyNeed";
import type { ErFloorScorer } from "./energySubstats";
import "./energy.css";

const props = defineProps<{ er: ErFloorScorer | null; characterId: string }>();
const who = computed(() => nameOf(props.characterId));
const check = computed(() => (props.er?.floor ? checkOf(props.er.floor.need, props.er.have) : null));
const teamText = computed(() => {
  const ids = (props.er?.floor?.team.characterIds ?? []).filter((id) => id !== props.characterId);
  return ids.length ? `the team with ${ids.map((id) => nameOf(id)).join(" + ")}` : "their team";
});
/** where the floor comes from: the loop of the saved team that asks most, or the kit's own minimum in wuwa_calc (a kit
 *  that turns Energy Regen into buffs — Shorekeeper, Mornye — so its weights may already value ER on their own) */
const whereText = computed(() =>
  props.er?.floor?.setBy === "kit" ? `${who.value}'s own floor in wuwa_calc, whose kit turns Energy Regen into buffs` : `what ${who.value} needs in ${teamText.value}`,
);
</script>

<style scoped>
.en-subnote {
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--en-ink-2);
}
.en-subnote__tag {
  display: inline-block;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 0 0.35rem;
  margin-right: 0.35rem;
  border-radius: 0.25rem;
  background: oklch(var(--p) / 0.15);
  color: oklch(var(--bc));
  vertical-align: 1px;
}
</style>
