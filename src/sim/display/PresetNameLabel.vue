<template>
  <div class="wt-preset" :title="tooltip">
    <div class="wt-preset__title">
      <template v-if="parts.generated && hideMain && parts.main && parts.teammates.length">
        <span class="wt-preset__mates" aria-hidden="true">
          <CharacterAvatar v-for="k in parts.teammateKeys" :id="k" :key="k" :size="18" title="" />
        </span>
        <span class="wt-preset__text"><span class="opacity-60">with</span> {{ parts.teamLabel }}</span>
      </template>
      <span v-else class="wt-preset__text">{{ parts.title || "—" }}</span>
    </div>
    <div v-if="source || shownChips.length" class="wt-preset__chips">
      <span v-if="source" class="wt-chip wt-chip--source" :class="`wt-chip--${source}`">{{ sourceLabel }}</span>
      <span v-for="c in shownChips" :key="c.kind + c.label" class="wt-chip" :class="`wt-chip--${c.kind}`" :title="c.title">{{ c.label }}</span>
      <span v-if="hiddenChips" class="wt-chip wt-chip--more">+{{ hiddenChips }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ — a rotation / team name as a short title + chips (src/sim/presets/presetName.ts), the full
// stored name in the tooltip. Names the player typed render as they are.
import { computed } from "vue";
import CharacterAvatar from "./CharacterAvatar.vue";
import { parsePresetName } from "../presets/presetName";

export type PresetSource = "yours" | "curated" | "wuwa_calc";

const props = withDefaults(
  defineProps<{
    name: string;
    source?: PresetSource | null;
    /** character keys the account holds (a Rover form resolves to that gender) */
    owned?: string[];
    /** the row already shows the main character: draw "with A + B" and the teammates' portraits */
    hideMain?: boolean;
    /** appended to the tooltip */
    note?: string | null;
    maxChips?: number;
  }>(),
  { source: null, owned: () => [], hideMain: false, note: null, maxChips: 3 },
);

const parts = computed(() => parsePresetName(props.name, { owned: props.owned }));
const sourceLabel = computed(() => (props.source === "yours" ? "yours" : props.source === "curated" ? "curated" : "wuwa_calc"));
const chips = computed(() => parts.value.chips.filter((c) => c.kind !== "preset"));
const shownChips = computed(() => chips.value.slice(0, props.maxChips));
const hiddenChips = computed(() => Math.max(0, chips.value.length - props.maxChips));
const tooltip = computed(() => [props.name, props.note].filter(Boolean).join("\n"));
</script>

<style scoped>
.wt-preset {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.wt-preset__title {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
  line-height: 1.25;
}
.wt-preset__mates {
  display: inline-flex;
  gap: 2px;
  flex-shrink: 0;
}
.wt-preset__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wt-preset__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  min-width: 0;
}
.wt-chip {
  display: inline-flex;
  align-items: center;
  height: 1.1rem;
  padding: 0 0.35rem;
  border-radius: 0.3rem;
  font-size: 0.66rem;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.01em;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: oklch(var(--bc) / 0.75);
  background: oklch(var(--bc) / 0.07);
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.08);
}
.wt-chip--source {
  font-family: inherit;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 0.6rem;
}
.wt-chip--yours {
  color: oklch(var(--p));
  background: oklch(var(--p) / 0.12);
  box-shadow: inset 0 0 0 1px oklch(var(--p) / 0.25);
}
.wt-chip--curated {
  color: oklch(var(--s));
  background: oklch(var(--s) / 0.12);
  box-shadow: inset 0 0 0 1px oklch(var(--s) / 0.25);
}
.wt-chip--wuwa_calc {
  color: oklch(var(--a));
  background: oklch(var(--a) / 0.1);
  box-shadow: inset 0 0 0 1px oklch(var(--a) / 0.22);
}
.wt-chip--mode {
  color: oklch(var(--su));
  background: oklch(var(--su) / 0.12);
}
.wt-chip--more {
  opacity: 0.7;
}
</style>
