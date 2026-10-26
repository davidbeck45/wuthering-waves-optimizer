<template>
  <div class="subs" :data-test-my-rankings-substats-panel="rank.id">
    <div class="text-xs opacity-70 mb-1">
      Substat weights: what one more line of each substat on one of your equipped echoes would add to this build's
      <template v-if="state.result">{{ fmt(state.result.baseline) }} average damage</template><template v-else>damage</template>
      on {{ rotationTitle }}. Left of each arrow is the size of the roll, right of it the damage it adds. The top of the list is what to look for.
    </div>
    <details class="subs__help text-xs mb-2" data-test-my-rankings-substats-help>
      <summary class="cursor-pointer opacity-70 hover:opacity-100">How to read these numbers</summary>
      <ul class="subs__help-list opacity-80">
        <li><b>Expected roll</b>: the average roll of the stat, every tier weighted by how often it drops. An average, so not always a tier the game can show — flat ATK averages {{ rollLabel(expectedRoll("ATK_FLAT"), true) }} between the 40 and 50 tiers.</li>
        <li><b>Median roll</b>: the middle tier, half of all rolls land on it or lower. Always a real tier ({{ rollLabel(medianRoll("ATK_FLAT"), true) }} flat ATK, {{ rollLabel(medianRoll("CritDMG"), false) }} Crit DMG).</li>
        <li><b>Best roll</b>: the top tier, the most one line can pay.</li>
        <li><b>+1 tier</b>: one step up the tier ladder ({{ rollLabel(tierStep("CritRate"), false) }} Crit Rate, {{ rollLabel(tierStep("CritDMG"), false) }} Crit DMG, {{ rollLabel(tierStep("ATK_FLAT"), true) }} flat ATK). What a line you already have gains from rolling one tier higher — the gap between two echoes whose lines differ by one tier.</li>
        <li><b>The bar</b>: the expected gain next to the best substat's. A full bar is the stat to look for, an empty one does nothing on this rotation.</li>
        <li>The gains do not follow the roll sizes: what a roll pays depends on what the build already has (Crit Rate past 100 % is wasted, a stat you stack pays a little less each time). Compare rolls, not points — every substat line on an echo is one roll.</li>
        <li>A stat at +0.0 % does not feed this rotation. Energy Regen always reads 0 here: the engine has no energy model, so keep the ER the rotation needs.</li>
      </ul>
    </details>
    <div v-if="state.running" class="text-sm"><span class="loading loading-spinner loading-xs"></span> scoring…</div>
    <span v-if="state.error" class="text-xs text-error">{{ state.error }}</span>
    <div v-if="state.result" class="subs__grid tabular-nums text-sm" data-test-my-rankings-substats-result>
      <div class="subs__row subs__row--head">
        <div class="subs__head">Substat</div>
        <div class="subs__head" title="the average roll, every tier weighted by how often it drops">Expected roll</div>
        <div class="subs__head" title="the middle tier: half of all rolls land on it or lower">Median roll</div>
        <div class="subs__head" title="the top tier">Best roll</div>
        <div class="subs__head" title="one tier step: what an existing line gains from rolling one tier higher">+1 tier</div>
        <div class="subs__head"></div>
      </div>
      <div v-for="w in state.result.weights" :key="w.key" class="subs__row">
        <div class="subs__name"><span class="max-md:hidden">{{ w.label }}</span><span class="md:hidden">{{ w.short }}</span></div>
        <div class="subs__gain" :class="gainClass(w.gain)" :data-test-my-rankings-substat="w.key"><span class="opacity-60">{{ rollLabel(w.roll, w.flat) }} →</span> {{ pct(w.gain) }}</div>
        <div class="subs__more">
          <div class="subs__gain subs__gain--more" :class="gainClass(w.medianGain)" :data-test-my-rankings-substat-median="w.key"><span class="opacity-60"><span class="md:hidden">median </span>{{ rollLabel(w.medianRoll, w.flat) }} →</span> {{ pct(w.medianGain) }}</div>
          <div class="subs__gain subs__gain--more" :class="gainClass(w.maxGain)"><span class="opacity-60"><span class="md:hidden">best </span>{{ rollLabel(w.maxRoll, w.flat) }} →</span> {{ pct(w.maxGain) }}</div>
          <div class="subs__gain subs__gain--more" :class="gainClass(w.stepGain)" :data-test-my-rankings-substat-step="w.key"><span class="opacity-60"><span class="md:hidden">+1 tier </span>{{ rollLabel(w.step, w.flat) }} →</span> {{ pct2(w.stepGain) }}</div>
        </div>
        <div class="subs__bar"><div class="subs__fill" :style="{ width: `${Math.round(w.weight * 100)}%` }"></div></div>
      </div>
    </div>
    <p v-if="state.result" class="text-xs mt-2">
      <span class="opacity-70">Look for:</span> <b>{{ lookFor(state.result) }}</b>
      <span v-if="erReadsZero(state.result)" class="opacity-70"> · Energy Regen reads 0 here — the engine has no energy model, keep the ER the rotation needs</span>
    </p>
    <div v-if="state.echoes?.length" class="mt-2 text-xs flex flex-wrap items-center gap-1" data-test-my-rankings-substats-echoes>
      <span class="opacity-70 mr-1">Your echoes' substats on this rotation (lowest = re-roll first):</span>
      <span v-for="e in echoesWorstFirst(state.echoes)" :key="e.slot" class="badge badge-ghost badge-sm tabular-nums">
        {{ e.cost }}-cost {{ echoLabel(e.echo) }} · {{ e.main }} · <b class="ml-1" :class="gainClass(e.worth)">{{ pct(e.worth) }}</b>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ — the "Substats" tab of a /my-rankings row: substat weights on the build, scored on the same
// best rotation (src/sim/substats/substatWeights.ts). Runs once per row state, the first time the tab opens.
import { computed, watch } from "vue";
import { storeToRefs } from "pinia";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { RANKING_ENEMY, type CharacterRank } from "./rankRoster";
import { substatsStateOf } from "./panelState";
import { equippedSubstatWorth, expectedRoll, medianRoll, rotationScorer, substatWeights, tierStep, type EchoSubstatWorth, type SubstatWeightsResult } from "../substats/substatWeights";
import { mainEchoesData } from "../../echoes/index";
import { parsePresetName } from "../presets/presetName";
import { fmt, gainClass, pct, pct2 } from "./format";

const props = defineProps<{ rank: CharacterRank }>();

const characterStore = useCharacterStore();
const inventoryStore = useInventoryStore();
const { characters } = storeToRefs(characterStore) as unknown as { characters: { value: Record<string, unknown> } };

const state = computed(() => substatsStateOf(props.rank));
const rotationTitle = computed(() => parsePresetName(props.rank.best?.name).title || "its best rotation");

const rollLabel = (value: number, flat: boolean): string => (flat ? `+${Math.round(value)}` : `+${value.toFixed(1)}%`);
const echoLabel = (key: string | null): string => (key ? ((mainEchoesData as Record<string, { name?: string }>)[key]?.name ?? key) : "echo");
const lookFor = (r: SubstatWeightsResult): string => r.weights.filter((w) => w.weight >= 0.5).map((w) => w.label).join(", ") || "nothing moves this number";
const erReadsZero = (r: SubstatWeightsResult): boolean => Math.abs(r.weights.find((w) => w.key === "EnergyRegen")?.gain ?? 0) < 0.0005;
const echoesWorstFirst = (list: EchoSubstatWorth[]): EchoSubstatWorth[] => [...list].sort((a, b) => a.worth - b.worth);

watch(
  state,
  async (s) => {
    if (s.started) return;
    s.started = true;
    if (!props.rank.bestRotation) {
      s.error = "no rotation to score";
      return;
    }
    s.running = true;
    try {
      const chars = JSON.parse(JSON.stringify(characters.value ?? {}));
      const echoes = JSON.parse(JSON.stringify(inventoryStore.echoes ?? []));
      const score = rotationScorer(props.rank.id, props.rank.bestRotation, RANKING_ENEMY);
      const baseline = await score(chars, echoes);
      s.result = await substatWeights(props.rank.id, chars, echoes, score, { baseline });
      s.echoes = await equippedSubstatWorth(props.rank.id, chars, echoes, score, { baseline });
    } catch (error) {
      s.error = error instanceof Error ? error.message : String(error);
    } finally {
      s.running = false;
    }
  },
  { immediate: true },
);
</script>

<style scoped lang="scss">
/* a grid, not a nested table (the phone card rules turn every td into a block); each row is a
   `display: contents` wrapper so a phone can turn it into a wrapping flex line instead */
.subs__grid {
  display: grid;
  grid-template-columns: max-content max-content max-content max-content max-content minmax(4rem, 1fr);
  column-gap: 1rem;
  row-gap: 0.15rem;
  align-items: center;
  max-width: 60rem;
}
.subs__row,
.subs__more {
  display: contents;
}
.subs__help {
  max-width: 60rem;
}
.subs__help-list {
  list-style: disc;
  padding-left: 1.1rem;
  margin-top: 0.25rem;
  display: grid;
  row-gap: 0.15rem;
}
.subs__head {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.55;
}
.subs__bar {
  height: 0.45rem;
  border-radius: 9999px;
  background: oklch(var(--bc) / 0.1);
  overflow: hidden;
}
.subs__fill {
  height: 100%;
  border-radius: 9999px;
  background: oklch(var(--p));
}
@media (max-width: 767px) {
  /* one wrapping line per substat: name · expected roll → gain · bar; the median, best and one-tier rolls underneath in small print */
  .subs__grid {
    display: block;
  }
  .subs__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: 0.6rem;
    padding: 0.15rem 0;
  }
  .subs__row--head {
    display: none;
  }
  .subs__gain {
    font-size: 0.8rem;
  }
  .subs__bar {
    flex: 1 1 4rem;
    order: 1;
  }
  .subs__more {
    order: 2;
    flex-basis: 100%;
    display: flex;
    flex-wrap: wrap;
    column-gap: 0.75rem;
  }
  .subs__gain--more {
    font-size: 0.7rem;
    opacity: 0.85;
  }
}
</style>
