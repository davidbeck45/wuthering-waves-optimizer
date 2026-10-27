<template>
  <component :is="inline ? 'span' : 'div'" v-if="floor" class="en-ui en-floor" :class="{ 'en-floor--inline': inline }" :data-test-energy-floor-of="characterId">
    <EnergyChip :check="check" :character-id="characterId" label="ER" mini clickable :note="tooltip" @open="open = true" />
    <!-- the need and the team that sets it ("needs X % (team Y)"), wrapping inside the row's name cell rather than
         widening it: the pill carries the verdict, the numbers are in its label and one tap away in the sheet -->
    <span v-if="!inline" class="en-floor__team" :title="`Highest need among your saved teams: ${floor.team.name}`" data-test-energy-floor-need>
      <template v-if="floor.setBy === 'kit'">kit floor {{ needText(floor.need) }}</template>
      <template v-else>needs {{ needText(floor.need) }} with {{ teamLabel }}</template>
    </span>
    <EnergySheet v-if="open && view" :view="view" :character-id="characterId" @close="open = false" />
  </component>
</template>

<script setup lang="ts">
// Wuthering Tools+ — a character's ER floor on their /my-rankings row (and batch-1's MyRankingsCharacters): the highest
// need among the player's saved teams, the team that sets it, and the build's ER against it; opens that team's
// breakdown. Nothing shows for a character in no measured saved team.
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import EnergyChip from "./EnergyChip.vue";
import EnergySheet from "./EnergySheet.vue";
import { nameOf, needText } from "./energyFormat";
import { checkOf } from "./energyNeed";
import { useEnergyNeeds } from "./useEnergyNeeds";

const props = withDefaults(defineProps<{ characterId: string; /** a mini pill beside the S/R badges (batch-1's 56 px rows) */ inline?: boolean }>(), { inline: false });

const energy = useEnergyNeeds();
onMounted(() => energy.activate());
onBeforeUnmount(() => energy.release());

const floor = computed(() => (energy.havesReady.value ? energy.floorFor(props.characterId) : null));
const view = computed(() => (floor.value ? energy.savedTeams.value.find((t) => t.id === floor.value!.team.id) ?? null : null));
// the floor's team may run another build than the active one: read the have off that team's check when it has one
const check = computed(() => {
  const f = floor.value;
  if (!f) return null;
  const inTeam = view.value?.checks?.find((c) => c.characterId === props.characterId);
  return inTeam ?? checkOf(f.need, energy.haves[props.characterId] ?? null);
});
const teamLabel = computed(() => (floor.value?.team.characterIds ?? []).filter((id) => id !== props.characterId).map((id) => nameOf(id).split(":").pop()!.trim()).join(" + "));
const open = ref(false);
const tooltip = computed(() => (floor.value ? `Energy Regen against the highest need among your saved teams (${floor.value.setBy === "kit" ? "the kit's own floor" : `with ${teamLabel.value}`})` : ""));
</script>

<style scoped>
.en-floor {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
  margin-top: 0.3rem;
  min-width: 0;
}
.en-floor--inline {
  display: inline-flex;
  margin-top: 0;
}
.en-floor__team {
  font-size: 0.7rem;
  line-height: 1.35;
  color: var(--en-ink-3);
  min-width: 0;
  max-width: 14rem;
  overflow-wrap: anywhere;
}
</style>
