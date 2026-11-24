<template>
  <figure class="kit-chart" :class="{ 'kit-chart--wide': wide }" :data-test-kit-chart="name">
    <figcaption class="kit-muted">{{ caption }}</figcaption>
    <ul class="kit-chart__rows" role="list">
      <li
        v-for="bar in bars"
        :key="bar.id"
        class="kit-chart__row"
        :class="{ 'kit-chart__row--you': bar.marks.includes('you') }"
        :data-test-kit-chart-bar="bar.id"
        :data-test-kit-chart-marks="bar.marks.join(' ')">
        <span class="sr-only">{{ barSpeech(bar, unit) }}</span>
        <span class="kit-chart__label" aria-hidden="true">{{ bar.label }}</span>
        <span class="kit-chart__value" aria-hidden="true" data-test-kit-chart-value>{{ bar.valueText }}</span>
        <svg class="kit-chart__track" aria-hidden="true" focusable="false" width="100%" height="100%">
          <rect
            class="kit-chart__bar"
            :class="{ 'kit-chart__bar--you': bar.marks.includes('you'), 'kit-chart__bar--lower': bar.marks.includes('lower') }"
            x="0"
            y="0"
            :width="`${(bar.width * 100).toFixed(2)}%`"
            height="100%"
            rx="3" />
        </svg>
        <span class="kit-chart__note" aria-hidden="true">
          {{ bar.note }}
          <span v-for="m in bar.marks.filter((x) => x !== 'held')" :key="m" class="kit-chart__mark" :class="`kit-chart__mark--${m}`">{{ MARK_WORDS[m] }}</span>
        </span>
      </li>
    </ul>
  </figure>
</template>

<script setup lang="ts">
// Wuthering Tools+ — one bar chart of a resonator brief (ladderChart.ts): a row per figure with its label, the figure
// as text, a zero-based bar in inline SVG (theme colours through CSS) and what the row adds, in words. Each row reads
// aloud as one sentence (`barSpeech`); a mark ("you are here", "biggest step") is a word beside the bar, never a
// colour alone. The table of the same figures stays under the chart.
import { MARK_WORDS, barSpeech, type Bar } from "./ladderChart";

withDefaults(
  defineProps<{
    /** the test hook: "seq", "weapons", "ranks" */
    name: string;
    /** one line: what the chart shows, in which unit */
    caption: string;
    bars: Bar[];
    unit?: string;
    /** long labels (weapon names): label and figure on their own line above the bar */
    wide?: boolean;
  }>(),
  { unit: "team DPS", wide: false },
);
</script>

<style scoped>
.kit-chart {
  margin: 0.5rem 0 0;
}
.kit-chart__rows {
  display: grid;
  gap: 0.45rem;
  margin-top: 0.4rem;
}
/* short labels: "S2 | bar | 108.5K", the note under the bar */
.kit-chart__row {
  display: grid;
  grid-template-columns: 2.4rem minmax(0, 1fr) auto;
  grid-template-areas:
    "label track value"
    ". note note";
  align-items: center;
  column-gap: 0.5rem;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}
/* long labels: the weapon's name and figure on a line, the bar under them */
.kit-chart--wide .kit-chart__row {
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    "label value"
    "track track"
    "note note";
}
.kit-chart__label {
  grid-area: label;
  min-width: 0;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.kit-chart__value {
  grid-area: value;
  font-weight: 700;
  text-align: right;
}
.kit-chart__track {
  grid-area: track;
  display: block;
  height: 0.85rem;
  border-radius: 3px;
  background: oklch(var(--bc) / 0.09);
}
.kit-chart__bar {
  fill: oklch(var(--p));
}
/* a level that reads lower than the one below: the error red mixed toward the text colour, 3 : 1 on light too */
.kit-chart__bar--lower {
  fill: color-mix(in oklch, oklch(var(--er)) 70%, oklch(var(--bc)));
}
/* the account's own bar: the chart's colour like the rest (green would read as "good" on a damage chart, and sits
   under 3:1 on the light theme), set apart by a ring in the text colour and the words "you are here" */
.kit-chart__row--you .kit-chart__track {
  box-shadow: 0 0 0 2px oklch(var(--bc));
}
.kit-chart__note {
  grid-area: note;
  min-width: 0;
  font-size: 0.78rem;
  color: oklch(var(--bc) / 0.78);
  overflow-wrap: anywhere;
}
.kit-chart__mark {
  display: inline-block;
  margin-left: 0.3rem;
  padding: 0 0.4rem;
  border-radius: 9999px;
  font-size: 0.72rem;
  font-weight: 700;
  color: oklch(var(--bc));
  background: oklch(var(--bc) / 0.1);
}
/* the page's "Yours" chip colour, with an edge so it reads apart from "biggest step" without colour */
.kit-chart__mark--you {
  background: oklch(var(--wa) / 0.2);
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.6);
}
.kit-chart__mark--lower {
  background: oklch(var(--er) / 0.2);
}
</style>
