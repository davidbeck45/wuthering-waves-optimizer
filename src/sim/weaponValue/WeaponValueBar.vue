<template>
  <li class="wv-row" :class="[`wv-row--${bar.kind}`, { 'wv-row--open': open }]" :data-test-weapons-row="bar.id" :data-kind="bar.kind">
    <button
      type="button"
      class="wv-row__btn"
      :aria-expanded="open"
      :aria-controls="`wv-detail-${bar.id}`"
      :title="rowTitle"
      :data-test-weapons-toggle="bar.id"
      @click="emit('toggle', bar.id)">
      <span class="wv-who">
        <CharacterAvatar :id="bar.id" :size="40" dot title="" />
        <span class="wv-who__text">
          <span class="wv-who__name">{{ shortName }}</span>
          <span class="wv-who__meta">
            <span class="wv-pill">S{{ sequence }}</span>
            <WeaponIcon :weapon-key="bar.row.current.weaponKey" :size="18" title="" />
            <span class="wv-who__weapon">{{ heldLabel }}</span>
          </span>
        </span>
      </span>

      <span class="wv-target">
        <template v-if="bar.kind === 'swap' || bar.kind === 'held'">
          <WeaponIcon :weapon-key="bar.row.signature.key" :size="28" title="" />
          <span class="wv-target__text">
            <span class="wv-target__name">{{ sigName }}</span>
            <span class="wv-target__sub">{{ bar.kind === "swap" ? "signature · not held" : `signature · R${bar.row.current.refinement} held` }}</span>
          </span>
        </template>
        <template v-else-if="bar.kind === 'maxed'">
          <WeaponIcon :weapon-key="bar.row.signature.key" :size="28" title="" />
          <span class="wv-target__text">
            <span class="wv-target__name">{{ sigName }}</span>
            <span class="wv-target__sub wv-target__sub--gold">R5 · maxed</span>
          </span>
        </template>
        <span v-else class="wv-target__text">
          <span class="wv-target__name wv-muted">{{ bar.status }}</span>
          <span v-if="bar.alt" class="wv-target__sub">best other: {{ bar.alt.option.label }}</span>
        </span>
      </span>

      <span class="wv-track" :aria-hidden="true">
        <template v-if="bar.head && bar.head.value !== null">
          <span v-for="t in ticks" :key="t" class="wv-grid" :class="{ 'wv-grid--zero': t === 0 }" :style="{ left: `${at(t, axis)}%` }"></span>
          <span v-if="ladderEnd !== null" class="wv-ladder" :style="spanStyle(bar.head.value, ladderEnd)"></span>
          <span class="wv-bar" :class="bar.head.value >= 0 ? 'wv-bar--up' : 'wv-bar--down'" :style="spanStyle(0, bar.head.value)"></span>
          <span v-if="bar.head.low !== null" class="wv-whisker" :style="spanStyle(bar.head.low, bar.head.value)">
            <span class="wv-whisker__cap" :class="bar.head.low <= bar.head.value ? 'wv-whisker__cap--left' : 'wv-whisker__cap--right'"></span>
          </span>
          <span v-for="t in bar.ladder" v-show="t.value !== null" :key="t.refinement" class="wv-tick" :style="{ left: `${at(t.value ?? 0, axis)}%` }">
            <span v-if="t.refinement === 5" class="wv-tick__label">R5</span>
          </span>
        </template>
        <span v-else class="wv-track__note">{{ trackNote }}</span>
      </span>

      <span class="wv-value">
        <span class="wv-value__main" :class="valueClass" data-test-weapons-value>{{ headText }}</span>
        <span class="wv-value__sub">{{ subText }}</span>
      </span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="wv-chev" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>

    <!-- phone: the steps as chips under the card -->
    <div v-if="chips.length" class="wv-chips" aria-label="Refinement steps">
      <span v-for="c in chips" :key="c.label" class="wv-chip" :class="c.cls">{{ c.label }} <b>{{ c.text }}</b></span>
    </div>

    <WeaponValueDetail v-if="open" :id="`wv-detail-${bar.id}`" :row="bar.row" :scope="scope" :owned="owned" @calculator="emit('calculator', bar.id)" />
  </li>
</template>

<script setup lang="ts">
// Wuthering Tools+ — one /weapons chart row: who, what they hold, the signature's next copy as a bar on the shared axis
// (solid: the next copy; whisker: the stats-only floor of a weapon they don't hold; faded run with ticks: every further
// refinement up to R5), the figure, and the expanded option table. Desktop: a grid row; phone: a card with the steps
// as chips (no canvas anywhere — plain elements, so the rows sort, expand and theme like the rest of the app).
import { computed } from "vue";
import CharacterAvatar from "../display/CharacterAvatar.vue";
import WeaponIcon from "../display/WeaponIcon.vue";
import { characterShortName, weaponDisplayName } from "../display/names";
import { sequenceOf } from "../myRankings/rankRoster";
import { at, axisTicks, pctFine, type BarModel, type Scope } from "./weaponValueView";
import WeaponValueDetail from "./WeaponValueDetail.vue";

const props = defineProps<{ bar: BarModel; axis: { min: number; max: number }; scope: Scope; open: boolean; owned: string[]; characterData: Record<string, any> | undefined }>();
const emit = defineEmits<{ toggle: [id: string]; calculator: [id: string] }>();

const shortName = computed(() => characterShortName(props.bar.id) || props.bar.name);
const sequence = computed(() => sequenceOf(props.characterData));
const heldLabel = computed(() => (props.bar.row.current.weaponKey ? `${weaponDisplayName(props.bar.row.current.weaponKey)} R${props.bar.row.current.refinement}` : "no weapon"));
const sigName = computed(() => weaponDisplayName(props.bar.row.signature.key));
const ticks = computed(() => axisTicks(props.axis));
const ladderEnd = computed(() => {
  const values = props.bar.ladder.map((t) => t.value).filter((v): v is number => v !== null);
  return values.length ? Math.max(...values) : null;
});

function spanStyle(a: number, b: number): Record<string, string> {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return { left: `${at(lo, props.axis)}%`, width: `${Math.max(0.4, at(hi, props.axis) - at(lo, props.axis))}%` };
}

const headText = computed(() => (props.bar.head && props.bar.head.value !== null ? pctFine(props.bar.head.value) : "—"));
const valueClass = computed(() => {
  const v = props.bar.head?.value;
  if (v == null) return "wv-muted";
  return v > 0.0005 ? "wv-up" : v < -0.0005 ? "wv-down" : "wv-flat";
});
const subText = computed(() => {
  const b = props.bar;
  if (b.head && b.head.value !== null) {
    const what = b.kind === "swap" ? "R1" : b.head.label;
    return b.r5 !== null && b.ladder.length ? `${what} · R5 ${pctFine(b.r5)}` : what;
  }
  if (b.kind === "maxed") return "maxed";
  // no team figure: the character's own gain still says something (Own scope shows it as the bar)
  if (b.head && b.head.value === null) return props.scope === "team" ? (b.head.option ? `own ${pctFine(b.head.option.gain)}` : "no team figure") : "";
  return b.alt && b.alt.value !== null ? `best other ${pctFine(b.alt.value)}` : "";
});
const trackNote = computed(() => {
  const b = props.bar;
  if (b.head && b.head.value === null) return b.note ? `No team figure — ${b.note}` : "No figure in this scope";
  if (b.kind === "error") return b.note ?? "Could not be scored";
  if (b.kind === "maxed") return b.alt && b.alt.value !== null ? `Nothing to add · best other weapon ${pctFine(b.alt.value)}` : "Nothing to add";
  if (b.alt && b.alt.value !== null) return `${b.alt.option.label}: ${pctFine(b.alt.value)}`;
  // no signature and no team figure for the alternatives either (e.g. a Rover form in no team you can field)
  if (props.scope === "team" && b.row.teamNote) return `No team figure — ${b.row.teamNote}`;
  return "";
});

const chips = computed(() => {
  const b = props.bar;
  if (!b.head || b.head.value === null) return [];
  const cls = (v: number | null) => (v == null ? "wv-chip--na" : v > 0.0005 ? "wv-chip--up" : v < -0.0005 ? "wv-chip--down" : "");
  return b.ladder.map((t) => ({ label: `R${t.refinement}`, text: pctFine(t.value), cls: cls(t.value) }));
});

const rowTitle = computed(() => {
  const b = props.bar;
  const lines = [`${b.name} — ${heldLabel.value}`];
  if (b.head?.option) {
    lines.push(`${b.head.option.label}: own ${pctFine(b.head.option.gain)}${b.head.option.low ? ` (stats only ${pctFine(b.head.option.low.gain)})` : ""}, team ${b.head.option.team ? pctFine(b.head.option.team.gain) : "—"}`);
  }
  if (b.note) lines.push(b.note);
  lines.push("Click for every option");
  return lines.join("\n");
});
</script>

<style scoped>
.wv-row {
  border-top: 1px solid oklch(var(--bc) / 0.07);
}
.wv-row:first-child {
  border-top: 0;
}
.wv-row__btn {
  display: grid;
  grid-template-columns: var(--wv-cols);
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  min-height: 3.6rem;
  padding: 0.45rem 0.75rem;
  text-align: left;
  border-radius: 0.6rem;
}
.wv-row__btn:hover {
  background: oklch(var(--bc) / 0.04);
}
.wv-row__btn:focus-visible {
  outline: 2px solid oklch(var(--p));
  outline-offset: -2px;
}
.wv-row--open > .wv-row__btn {
  background: oklch(var(--bc) / 0.05);
}
.wv-row--maxed .wv-who,
.wv-row--none .wv-who,
.wv-row--not-in-app .wv-who {
  opacity: 0.8;
}
.wv-who {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
}
.wv-who__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 0.15rem;
}
.wv-who__name {
  font-weight: 650;
  font-size: 0.92rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wv-who__meta {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
  font-size: 0.72rem;
  color: oklch(var(--bc) / 0.6);
}
.wv-who__weapon {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wv-pill {
  flex-shrink: 0;
  padding: 0 0.35rem;
  border-radius: 0.3rem;
  font-size: 0.66rem;
  font-weight: 700;
  background: oklch(var(--bc) / 0.08);
  color: oklch(var(--bc) / 0.75);
}
.wv-target {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}
.wv-target__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 0.1rem;
}
.wv-target__name {
  font-size: 0.82rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wv-target__sub {
  font-size: 0.68rem;
  color: oklch(var(--bc) / 0.55);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wv-target__sub--gold {
  color: #c9962e;
  font-weight: 650;
}
:root[data-theme-style="dark"] .wv-target__sub--gold {
  color: #e8b44c;
}
.wv-muted {
  color: oklch(var(--bc) / 0.5);
}
.wv-track {
  position: relative;
  height: 1.75rem;
  min-width: 0;
}
.wv-grid {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: oklch(var(--bc) / 0.07);
}
.wv-grid--zero {
  background: oklch(var(--bc) / 0.28);
}
.wv-bar {
  position: absolute;
  top: 50%;
  height: 0.8rem;
  transform: translateY(-50%);
  border-radius: 0.2rem;
}
.wv-bar--up {
  background: linear-gradient(90deg, oklch(var(--su) / 0.75), oklch(var(--su)));
}
.wv-bar--down {
  background: linear-gradient(270deg, oklch(var(--er) / 0.65), oklch(var(--er) / 0.9));
}
.wv-ladder {
  position: absolute;
  top: 50%;
  height: 0.8rem;
  transform: translateY(-50%);
  border-radius: 0 0.2rem 0.2rem 0;
  background: repeating-linear-gradient(135deg, oklch(var(--su) / 0.22) 0 4px, oklch(var(--su) / 0.1) 4px 8px);
  box-shadow: inset 0 0 0 1px oklch(var(--su) / 0.3);
}
.wv-whisker {
  position: absolute;
  top: 50%;
  height: 2px;
  transform: translateY(-50%);
  background: oklch(var(--bc) / 0.6);
}
.wv-whisker__cap {
  position: absolute;
  top: -5px;
  width: 2px;
  height: 12px;
  background: oklch(var(--bc) / 0.75);
}
.wv-whisker__cap--left {
  left: 0;
}
.wv-whisker__cap--right {
  right: 0;
}
.wv-tick {
  position: absolute;
  top: 50%;
  width: 2px;
  height: 1.15rem;
  transform: translate(-1px, -50%);
  background: oklch(var(--bc) / 0.55);
  border-radius: 1px;
}
.wv-tick__label {
  position: absolute;
  top: -0.85rem;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.58rem;
  font-weight: 700;
  color: oklch(var(--bc) / 0.55);
}
.wv-track__note {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  font-size: 0.74rem;
  color: oklch(var(--bc) / 0.5);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.wv-value {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.1rem;
  min-width: 0;
}
.wv-value__main {
  font-size: 1.05rem;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
.wv-value__sub {
  font-size: 0.68rem;
  color: oklch(var(--bc) / 0.55);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.wv-up {
  color: oklch(var(--su));
}
:root[data-theme-style="light"] .wv-up {
  color: color-mix(in oklab, oklch(var(--su)) 70%, black);
}
.wv-down {
  color: oklch(var(--er));
}
.wv-flat {
  color: oklch(var(--bc) / 0.7);
}
.wv-chev {
  width: 1rem;
  height: 1rem;
  color: oklch(var(--bc) / 0.4);
  transition: transform 0.15s;
}
.wv-row--open .wv-chev {
  transform: rotate(180deg);
}
.wv-chips {
  display: none;
}

/* phone: a card — who + figure on the first line, the bar full width, the steps as chips */
@media (max-width: 767px) {
  .wv-row__btn {
    grid-template-columns: minmax(0, 1fr) auto auto;
    grid-template-areas:
      "who value chev"
      "target target target"
      "track track track";
    gap: 0.4rem 0.6rem;
    padding: 0.65rem 0.6rem 0.5rem;
  }
  .wv-who {
    grid-area: who;
  }
  .wv-target {
    grid-area: target;
  }
  .wv-track {
    grid-area: track;
    height: 1.4rem;
  }
  .wv-value {
    grid-area: value;
  }
  .wv-chev {
    grid-area: chev;
  }
  .wv-value__main {
    font-size: 1.3rem;
  }
  .wv-track__note {
    white-space: normal;
    line-height: 1.2;
    font-size: 0.72rem;
  }
  .wv-tick__label {
    display: none;
  }
  .wv-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    padding: 0 0.6rem 0.6rem;
  }
  .wv-chip {
    padding: 0.1rem 0.45rem;
    border-radius: 9999px;
    font-size: 0.7rem;
    color: oklch(var(--bc) / 0.65);
    background: oklch(var(--bc) / 0.06);
    font-variant-numeric: tabular-nums;
  }
  .wv-chip b {
    font-weight: 700;
    color: oklch(var(--bc) / 0.85);
  }
  .wv-chip--up b {
    color: oklch(var(--su));
  }
  :root[data-theme-style="light"] .wv-chip--up b {
    color: color-mix(in oklab, oklch(var(--su)) 70%, black);
  }
  .wv-chip--down b {
    color: oklch(var(--er));
  }
}
</style>
