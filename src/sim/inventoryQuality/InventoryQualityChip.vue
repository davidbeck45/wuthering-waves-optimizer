<template>
  <button
    v-if="chip.state !== 'none'"
    type="button"
    class="iq-chip"
    :class="[`iq-chip--${chip.state}`, chip.verdict ? `iq-chip--${chip.verdict}` : '']"
    :title="chip.title"
    :aria-label="chip.aria"
    :disabled="chip.state === 'loading'"
    :data-test-inventory-quality-chip="echoId"
    :data-verdict="chip.verdict ?? undefined"
    :data-roll="chip.roll ? chip.roll.text : undefined"
    :data-percentile="rating ? rating.percentile : undefined"
    :data-exact="rating ? String(rating.exact) : undefined"
    @click.stop="openInEchoLab">
    <template v-if="chip.state === 'loading'">
      <span class="iq-chip__muted">Echo Lab…</span>
    </template>
    <template v-else>
      <span class="iq-chip__label">Echo Lab</span>
      <span class="el-chip" :class="`el-chip--${chip.verdict}`" data-test-inventory-quality-verdict>{{ chip.verdictLabel }}</span>
      <span v-if="chip.roll" class="iq-chip__roll" :class="`iq-roll--${chip.roll.tone}`" data-test-inventory-quality-roll>{{ chip.roll.text }}</span>
      <span v-else-if="chip.rollPending" class="iq-chip__muted">rating roll…</span>
      <span class="iq-chip__reason">{{ chip.reason }}</span>
      <svg class="iq-chip__go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
    </template>
  </button>
</template>

<script setup lang="ts">
// Wuthering Tools+ — the Echo Lab chip on an echo in Ryan's inventory (InventoryEchoesBrowser.vue renders one per echo,
// in the tile's slot / the card's footer): its Keep / Spare / Feed verdict and, once it has lines, how lucky its roll
// is ("Top 4% roll"). A tap opens the echo in Echo Lab (its detail: who it is for, and "How good is this roll" scored
// exactly). Hover text is a native `title`: floating-vue's v-tooltip costs a Popper per element (see EchoLabVerdicts).
import { computed, onBeforeUnmount, onMounted } from "vue";
import { useRouter } from "vue-router";
import { NO_CHIP, chipFor } from "./inventoryQuality";
import { chipShown, useInventoryQuality } from "./useInventoryQuality";
import "../echoLab/echoLab.css";
import "./inventoryQuality.css";

const props = defineProps<{ echoId: string }>();
const router = useRouter();
const q = useInventoryQuality();

const rating = computed(() => (q.unavailable.value ? null : q.ratingFor(props.echoId)));
const chip = computed(() =>
  q.unavailable.value ? NO_CHIP : chipFor({
    row: q.verdicts.value.get(props.echoId),
    judged: q.judged.value,
    stale: q.stale.value,
    rating: rating.value,
    rateable: q.targets.value.has(props.echoId),
  }),
);

let hide: (() => void) | null = null;
onMounted(() => (hide = chipShown(props.echoId)));
onBeforeUnmount(() => hide?.());

function openInEchoLab(): void {
  void router.push({ path: "/echo-lab", query: { echo: props.echoId } });
}
</script>
