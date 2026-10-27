<template>
  <span class="inline-flex flex-wrap items-center gap-x-1 gap-y-1" data-test-rotation-chips>
    <template v-for="(item, k) in items" :key="k">
      <span v-if="item.kind === 'cp'" :class="['rv-cp', `rv-cp--${item.cp.kind}`]" :title="cpTitle(item.cp.kind)" data-test-rotation-checkpoint>{{ cpLabel(item.cp.kind) }}</span>
      <template v-else>
        <span v-if="item.sep" class="rv-sep" aria-hidden="true">›</span>
        <span
          :class="['rv-chip', `rv-chip--${item.chip.kind}`, { 'rv-chip--forte': item.chip.forte }]"
          :title="chipTitle(item.chip)"
          data-test-rotation-chip
        >
          <span>{{ item.chip.text }}</span><span v-if="item.chip.suffix" class="rv-chip__suffix">{{ suffixOf(item.chip) }}</span>
          <span v-if="item.chip.cancel && cancels" class="rv-chip__cancel">{{ item.chip.cancel }}</span>
        </span>
      </template>
    </template>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Checkpoint, CheckpointKind, CueChip, Visit } from "./extract";

const props = withDefaults(defineProps<{ visit: Visit; checkpoints?: boolean; cancels?: boolean }>(), { checkpoints: true, cancels: true });

type Item = { kind: "cp"; cp: Checkpoint } | { kind: "chip"; chip: CueChip; sep: boolean };

const items = computed<Item[]>(() => {
  const out: Item[] = [];
  const cps = props.checkpoints ? props.visit.checkpoints : [];
  for (const cp of cps.filter((c) => c.after < 0)) out.push({ kind: "cp", cp });
  props.visit.chips.forEach((chip, k) => {
    out.push({ kind: "chip", chip, sep: k > 0 });
    for (const cp of cps.filter((c) => c.after === k)) out.push({ kind: "cp", cp });
  });
  return out;
});

const LABEL: Record<CheckpointKind, string> = { energy: "R ready", concerto: "Outro ready", tune: "Tune Break" };
const TITLE: Record<CheckpointKind, string> = {
  energy: "Resonance Energy full: the Liberation is ready from here",
  concerto: "Concerto full: swapping from here plays the Outro and the next Intro",
  tune: "Tune Break fires here (off-tune gauge full)",
};
const cpLabel = (k: CheckpointKind): string => LABEL[k];
const cpTitle = (k: CheckpointKind): string => TITLE[k];
const suffixOf = (c: CueChip): string => (c.kind === "wait" || c.suffix?.startsWith("+") ? ` ${c.suffix}` : c.suffix ?? "");
const chipTitle = (c: CueChip): string =>
  [c.name, c.forte ? "enhanced (Forte) state" : null, c.tag ? `ends on a ${c.tag}` : null].filter(Boolean).join(" · ");
</script>
