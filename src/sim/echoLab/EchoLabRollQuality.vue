<template>
  <div class="mt-3 rounded-lg bg-base-100 px-3 py-2.5" data-test-echo-lab-quality>
    <div class="flex flex-wrap items-center gap-1">
      <span class="text-xs font-semibold uppercase tracking-wide opacity-60">How good is this roll</span>
      <EchoLabPopover id="quality" label="How good is this roll" align="left">
        <p>Every echo of its kind it could have been at the same level (its set, cost and main stat, with the same number of substat lines rolled at random) is scored by the damage engine on the owner's best rotation, and compared with yours.</p>
        <p><b>Hope for</b> tries each substat it can still roll, at every value, on top of the lines it has.</p>
        <ul class="list-disc space-y-1 pl-4 opacity-80">
          <li v-for="a in assumptions" :key="a">{{ a }}</li>
        </ul>
      </EchoLabPopover>
    </div>
    <p v-if="!target" class="text-xs opacity-70" data-test-echo-lab-quality-none>No built character wears it or can slot it, so there is no build to rate it on.</p>
    <p v-else-if="!lines" class="text-xs opacity-70">It has no substat lines yet: level it to +5 first.</p>
    <div v-else-if="!result" class="flex items-center gap-2 py-1 text-xs opacity-70" data-test-echo-lab-quality-loading>
      <span class="loading loading-spinner loading-xs"></span> Rating it against every echo it could have been…
    </div>
    <p v-else-if="'error' in result" class="text-xs text-error" data-test-echo-lab-quality-error>{{ result.error }}</p>
    <template v-else>
      <p class="text-xs opacity-70">
        As a +{{ result.level }} echo on {{ characterName(result.characterId) }}'s best rotation, {{ slotLabel(result.slot).toLowerCase() }}{{ result.worn ? ", where it sits" : "" }}.
      </p>
      <div class="mt-1.5 flex flex-wrap items-baseline gap-x-2">
        <span class="text-lg font-bold" data-test-echo-lab-quality-percentile>{{ rating.headline }}</span>
        <span class="text-xs opacity-70">of the +{{ result.level }} echoes it could have been</span>
        <span class="el-chip" :class="rating.chip" data-test-echo-lab-quality-band>{{ rating.band }}</span>
      </div>
      <div class="relative mt-1.5 h-2 rounded-full bg-base-300" :aria-label="`${rating.headline} of outcomes`" role="img">
        <div class="absolute inset-y-0 left-0 rounded-full" :class="barClass" :style="{ width: `${Math.max(2, result.percentile * 100)}%` }"></div>
        <div class="absolute -top-0.5 h-3 w-px bg-base-content/50" style="left: 50%" title="the middle outcome"></div>
      </div>
      <p class="mt-1.5 text-xs opacity-80" data-test-echo-lab-quality-typical>{{ typicalText }}</p>
      <div v-if="result.lines < 5" class="mt-2" data-test-echo-lab-quality-hope>
        <div class="text-xs font-semibold">Hope for next (at +{{ result.level + 5 }})</div>
        <p class="text-xs opacity-70">
          Each of the {{ result.openLines }} substats it can still roll is as likely as the next (1 in {{ result.openLines }}).
          {{ result.openLines - result.deadLines }} of them add damage for {{ characterName(result.characterId) }}<template v-if="result.deadLines">; {{ result.deadLines }} add nothing</template>.
        </p>
        <ul v-if="result.hopeFor.length" class="mt-1 grid grid-cols-1 gap-1">
          <li v-for="h in result.hopeFor.slice(0, 3)" :key="h.key" class="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm" :data-test-echo-lab-quality-hope-line="h.key">
            <span class="font-medium">{{ substatLabel(h.key) }}</span>
            <span class="tabular-nums el-up">{{ signedPct(h.expectedGain, 2) }} damage on average</span>
            <span class="text-xs tabular-nums opacity-60">up to {{ signedPct(h.bestGain, 2) }}</span>
          </li>
        </ul>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ Echo Lab — "How good is this roll" in an inventory row's detail: the echo's percentile among every
// echo of its kind it could have been at its level, in damage on its owner's best rotation, and the lines to hope
// for next (rollQuality.ts, one worker job per echo, cached per account state). Rated where it sits when a built
// character wears it, else in its best owner's slot.
import { computed, onBeforeUnmount, watch } from "vue";
import { SUBSTAT_LABELS, type SubstatKey } from "../substats/substatWeights";
import type { EchoVerdict, LabCharacterSummary } from "./bestOwner";
import EchoLabPopover from "./EchoLabPopover.vue";
import { characterName, pct, ratingOf, signedPct, slotLabel } from "./echoLabView";
import { ROLL_QUALITY_ASSUMPTIONS, type RollQualityTarget } from "./rollQuality";
import { useEchoLab } from "./useEchoLab";

const props = defineProps<{ row: EchoVerdict; characters: LabCharacterSummary[] }>();
const assumptions = ROLL_QUALITY_ASSUMPTIONS;
const lab = useEchoLab();

/** where to rate it: the built character wearing it (that slot), else its best owner's slot, else Tune or Feed's */
const target = computed((): RollQualityTarget | null => {
  const built = new Map(props.characters.map((c) => [c.id, c]));
  const wearer = props.row.wornBy.find((w) => !w.stale && built.get(w.characterId)?.slots[w.slot]?.echoId === props.row.echoId);
  if (wearer) return { characterId: wearer.characterId, slot: wearer.slot };
  if (props.row.best) return { characterId: props.row.best.characterId, slot: props.row.best.slot };
  if (props.row.potential) return { characterId: props.row.potential.characterId, slot: props.row.potential.slot };
  return null;
});
const lines = computed(() => props.row.lines);
const result = computed(() => (target.value ? lab.qualityOf(props.row.echoId, target.value) : null));

let controller: AbortController | null = null;
watch(
  [() => props.row.echoId, target],
  ([echoId, t]) => {
    controller?.abort();
    controller = null;
    if (!t || !lines.value) return;
    controller = new AbortController();
    void lab.runRollQuality(echoId, t, controller.signal);
  },
  { immediate: true },
);
onBeforeUnmount(() => controller?.abort());

const substatLabel = (key: string): string => SUBSTAT_LABELS[key as SubstatKey] ?? key;
const barClass = computed(() => {
  const r = result.value;
  const p = r && !("error" in r) ? r.percentile : 0;
  return p >= 0.8 ? "el-score-fill--great" : p >= 0.5 ? "el-score-fill--good" : p >= 0.2 ? "el-score-fill--fair" : "el-score-fill--low";
});
const rating = computed(() => {
  const r = result.value;
  return ratingOf(r && !("error" in r) ? r.percentile : 0);
});
const typicalText = computed(() => {
  const r = result.value;
  if (!r || "error" in r) return "";
  const g = r.p50;
  if (Math.abs(g) < 0.0005) return "A typical one (the middle outcome) would do about the same damage as yours.";
  return `A typical one (the middle outcome) would do ${pct(Math.abs(g), 1)} ${g < 0 ? "less" : "more"} damage than yours.`;
});
</script>
