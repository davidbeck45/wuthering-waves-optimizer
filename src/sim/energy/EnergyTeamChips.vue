<template>
  <div class="en-ui en-chips" :data-test-energy-team-chips="view.key">
    <template v-if="view.checks">
      <EnergyChip
        v-for="c in view.checks"
        :key="c.characterId"
        :check="c"
        :label="short(c.characterId)"
        :character-id="c.characterId"
        :compact="compact"
        clickable
        @open="openId = c.characterId" />
    </template>
    <EnergyChip v-else-if="loading" :check="null" pending="loading" note="ER: measuring…" />
    <span v-else-if="failed" class="en-chips__line">
      <EnergyChip :check="null" pending="error" :note="measureNote(view.state)" label="ER" />
      <button type="button" class="btn btn-ghost btn-xs" data-test-energy-retry @click="energy.measure(characterIds, { force: true })">retry</button>
    </span>
    <EnergyChip v-else-if="view.state?.status === 'notMeasured'" :check="null" pending="muted" :note="`ER ${measureNote(view.state).charAt(0).toLowerCase()}${measureNote(view.state).slice(1)}`" />
    <button v-else type="button" class="btn btn-ghost btn-xs en-chips__check" data-test-energy-check title="Measure each member's Energy Regen need in this team's wuwa_calc loop" @click="energy.measure(characterIds)">
      Check ER
    </button>
    <EnergySheet v-if="openId" :view="view" :character-id="openId" @close="openId = null" />
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ — the energy check on a team row (/my-rankings Teams, and batch-1's MyRankingsTeams): one chip per
// member — their build's ER against this team's wuwa_calc need — that opens the breakdown sheet. Saved teams are
// measured automatically; any other composition on a "Check ER" click. Self-contained: it activates the shared check
// (useEnergyNeeds) while mounted.
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import EnergyChip from "./EnergyChip.vue";
import EnergySheet from "./EnergySheet.vue";
import { measureNote, nameOf } from "./energyFormat";
import { useEnergyNeeds } from "./useEnergyNeeds";

const props = withDefaults(defineProps<{ characterIds: Array<string | null>; name?: string; compact?: boolean }>(), { name: undefined, compact: true });

const energy = useEnergyNeeds();
onMounted(() => energy.activate());
onBeforeUnmount(() => energy.release());

const view = computed(() => energy.viewOf(props.characterIds, props.name));
const loading = computed(() => view.value.state?.status === "loading" || (view.value.state?.status === "ok" && !view.value.checks));
const failed = computed(() => view.value.state?.status === "error");
const openId = ref<string | null>(null);
/** a short first name for the chip ("Yangyang: Xuanling" → "Xuanling") */
const short = (id: string): string => nameOf(id).split(":").pop()!.trim();
</script>

<style scoped>
.en-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
}
.en-chips__line {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
.en-chips__check {
  padding-inline: 0.5rem;
  min-height: 1.6rem;
  height: 1.6rem;
}
</style>
